import mongoose from 'mongoose';
import {
  AssessmentType,
  AttendanceStatus,
  DoubtStatus,
  ModuleProgressStatus,
  SubmissionStatus,
  UserRole,
  UserStatus,
} from '#shared';
import {
  Assessment,
  Attendance,
  Batch,
  Certificate,
  ClassSchedule,
  Doubt,
  Module,
  ModuleProgress,
  Submission,
  User,
  getSettings,
} from '../models/index.js';
import { computeProgress } from './progression.js';

const ATTENDED = [AttendanceStatus.PRESENT, AttendanceStatus.LATE];
const GRADED = SubmissionStatus.GRADED;
const WEEK_MS = 7 * 24 * 3600 * 1000;

/** present/(total-excused) % from a grouped attendance row. */
function pctFrom({ attended, excused, total }) {
  const denom = total - excused;
  return denom > 0 ? Math.round((attended / denom) * 100) : 0;
}

/** $group expr building blocks for attendance percentage + status split. */
const ATT_GROUP = {
  attended: { $sum: { $cond: [{ $in: ['$status', ATTENDED] }, 1, 0] } },
  present: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.PRESENT] }, 1, 0] } },
  late: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.LATE] }, 1, 0] } },
  absent: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.ABSENT] }, 1, 0] } },
  excused: { $sum: { $cond: [{ $eq: ['$status', AttendanceStatus.EXCUSED] }, 1, 0] } },
  total: { $sum: 1 },
};

const round1 = (n) => Math.round(n * 10) / 10;
const shortDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Bucket dated docs into the last `n` weeks → [{ label, value }] oldest→newest. */
function weeklyBuckets(dates, n = 8) {
  const now = Date.now();
  const buckets = Array.from({ length: n }, (_, i) => {
    const end = now - (n - 1 - i) * WEEK_MS;
    return { label: shortDate(end), value: 0 };
  });
  for (const d of dates) {
    const wk = Math.floor((now - new Date(d).getTime()) / WEEK_MS); // 0 = this week
    if (wk >= 0 && wk < n) buckets[n - 1 - wk].value += 1;
  }
  return buckets;
}

/** Per-type assessment performance from graded submissions + an assessment→type map. */
function summariseAssessments(subRows, typeById) {
  const blank = () => ({ submissions: 0, passed: 0, sumScore: 0 });
  const byType = { [AssessmentType.PRACTICE]: blank(), [AssessmentType.PREPARATION]: blank(), [AssessmentType.FINAL]: blank() };
  const overall = blank();
  for (const r of subRows) {
    const type = typeById.get(r._id.toString());
    const bucket = byType[type];
    for (const b of [overall, bucket].filter(Boolean)) {
      b.submissions += r.n;
      b.passed += r.passed;
      b.sumScore += r.sumScore;
    }
  }
  const finalise = (b) => ({
    submissions: b.submissions,
    passRate: b.submissions ? Math.round((b.passed / b.submissions) * 100) : 0,
    avgScore: b.submissions ? Math.round(b.sumScore / b.submissions) : 0,
  });
  return {
    overall: finalise(overall),
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, finalise(v)])),
  };
}

// ── Admin ──────────────────────────────────────────────────────────────────────

export async function adminOverview() {
  const settings = await getSettings();
  const threshold = settings.minAttendance;

  const [students, trainers, batches, modules, certificates, activeAssessments] = await Promise.all([
    User.countDocuments({ role: UserRole.STUDENT, status: UserStatus.ACTIVE }),
    User.countDocuments({ role: UserRole.TRAINER, status: UserStatus.ACTIVE }),
    Batch.countDocuments({ archived: false }),
    Module.countDocuments({ archived: false }),
    Certificate.countDocuments(),
    Assessment.countDocuments({ isTemplate: { $ne: true } }),
  ]);

  // Attendance: per-student % (for at-risk) + platform-wide status split.
  const attRows = await Attendance.aggregate([{ $group: { _id: '$student', ...ATT_GROUP } }]);
  const studentDocs = await User.find({ _id: { $in: attRows.map((r) => r._id) } })
    .select('name email batch')
    .populate('batch', 'name');
  const infoById = new Map(studentDocs.map((s) => [s._id.toString(), s]));

  const attendanceDistribution = attRows.reduce(
    (acc, r) => {
      acc.present += r.present; acc.late += r.late; acc.absent += r.absent; acc.excused += r.excused;
      return acc;
    },
    { present: 0, late: 0, absent: 0, excused: 0 },
  );

  const lowAttendance = attRows
    .map((r) => ({ id: r._id.toString(), percentage: pctFrom(r), totalClasses: r.total, info: infoById.get(r._id.toString()) }))
    .filter((r) => r.info && r.totalClasses > 0 && r.percentage < threshold)
    .map((r) => ({ student: r.info.name, batch: r.info.batch?.name ?? '—', percentage: r.percentage }))
    .sort((a, b) => a.percentage - b.percentage);

  // Per-batch: size + average attendance.
  const batchDocs = await Batch.find({ archived: false }).select('name students');
  const batchAtt = new Map(
    (await Attendance.aggregate([{ $group: { _id: '$batch', ...ATT_GROUP } }])).map((r) => [String(r._id), pctFrom(r)]),
  );
  const batchPerformance = batchDocs
    .map((b) => ({ batch: b.name, students: b.students.length, avgAttendance: batchAtt.get(String(b._id)) ?? 0 }))
    .sort((a, b) => b.students - a.students)
    .slice(0, 12);
  const batchSizes = batchPerformance.map((b) => ({ label: b.batch, value: b.students }));

  // Module completion distribution (completed / in-progress) from ModuleProgress.
  const progRows = await ModuleProgress.aggregate([
    { $group: { _id: { module: '$module', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const moduleDocs = await Module.find({ archived: false }).select('name order').sort({ order: 1 });
  const byModule = new Map(moduleDocs.map((m) => [String(m._id), { module: m.name, order: m.order, completed: 0, inProgress: 0 }]));
  for (const row of progRows) {
    const entry = byModule.get(String(row._id.module));
    if (!entry) continue;
    if (row._id.status === ModuleProgressStatus.COMPLETED) entry.completed += row.n;
    else if (row._id.status === ModuleProgressStatus.IN_PROGRESS) entry.inProgress += row.n;
  }
  const moduleCompletion = [...byModule.values()].sort((a, b) => a.order - b.order);

  // Assessment performance (overall + by type).
  const assessmentDocs = await Assessment.find({ isTemplate: { $ne: true } }).select('type');
  const typeById = new Map(assessmentDocs.map((a) => [String(a._id), a.type]));
  const subRows = await Submission.aggregate([
    { $match: { status: GRADED } },
    { $group: { _id: '$assessment', n: { $sum: 1 }, passed: { $sum: { $cond: ['$passed', 1, 0] } }, sumScore: { $sum: '$score' } } },
  ]);
  const assessments = summariseAssessments(subRows, typeById);

  // Completion funnel: enrolled → started ≥1 module → completed ≥1 → certified.
  const [startedIds, completedIds, certifiedIds] = await Promise.all([
    ModuleProgress.distinct('student', { status: { $in: [ModuleProgressStatus.IN_PROGRESS, ModuleProgressStatus.COMPLETED] } }),
    ModuleProgress.distinct('student', { status: ModuleProgressStatus.COMPLETED }),
    Certificate.distinct('student'),
  ]);
  const funnel = [
    { label: 'Enrolled', value: students },
    { label: 'Started a module', value: startedIds.length },
    { label: 'Completed a module', value: completedIds.length },
    { label: 'Certified', value: certifiedIds.length },
  ];

  // Certificates issued per week (last 8).
  const certDates = (await Certificate.find({ issuedAt: { $gte: new Date(Date.now() - 8 * WEEK_MS) } }).select('issuedAt').lean()).map((c) => c.issuedAt);
  const certificatesTrend = weeklyBuckets(certDates, 8);

  // Doubt support health.
  const [doubtTotal, doubtResolved, doubtRated] = await Promise.all([
    Doubt.countDocuments({}),
    Doubt.countDocuments({ status: DoubtStatus.CLOSED }),
    Doubt.find({ rating: { $gte: 1 } }).select('rating').lean(),
  ]);
  const doubtStats = {
    total: doubtTotal,
    resolved: doubtResolved,
    resolutionRate: doubtTotal ? Math.round((doubtResolved / doubtTotal) * 100) : 0,
    avgRating: doubtRated.length ? round1(doubtRated.reduce((s, d) => s + d.rating, 0) / doubtRated.length) : 0,
  };

  return {
    counts: { students, trainers, batches, modules, certificates, assessments: activeAssessments },
    attendanceDistribution,
    lowAttendance: { threshold, count: lowAttendance.length, students: lowAttendance.slice(0, 10) },
    batchSizes,
    batchPerformance,
    moduleCompletion,
    assessments,
    funnel,
    certificatesTrend,
    doubtStats,
  };
}

// ── Trainer ──────────────────────────────────────────────────────────────────

export async function trainerOverview(trainerId) {
  const trainer = await User.findById(trainerId).select('assignedModules assignedBatches');
  const moduleIds = trainer?.assignedModules ?? [];
  const batchIds = trainer?.assignedBatches ?? [];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const batchDocs = await Batch.find({ _id: { $in: batchIds } }).select('name students');
  const studentSet = new Set();
  batchDocs.forEach((b) => b.students.forEach((s) => studentSet.add(String(s))));

  const upcomingClasses = await ClassSchedule.countDocuments({ trainer: trainerId, date: { $gte: todayStart } });

  // Per-batch average attendance.
  const attByBatch = new Map(
    (await Attendance.aggregate([{ $match: { batch: { $in: batchIds } } }, { $group: { _id: '$batch', ...ATT_GROUP } }]))
      .map((r) => [String(r._id), pctFrom(r)]),
  );
  const batches = batchDocs.map((b) => ({ batch: b.name, students: b.students.length, avgAttendance: attByBatch.get(String(b._id)) ?? 0 }));

  // Per-assessment analytics for the trainer's modules.
  const assessmentDocs = await Assessment.find({ module: { $in: moduleIds }, isTemplate: { $ne: true } })
    .select('title type module')
    .populate('module', 'name code');
  const subRows = await Submission.aggregate([
    { $match: { assessment: { $in: assessmentDocs.map((a) => a._id) }, status: GRADED } },
    { $group: { _id: '$assessment', submissions: { $sum: 1 }, passed: { $sum: { $cond: ['$passed', 1, 0] } }, avgScore: { $avg: '$score' } } },
  ]);
  const statsById = new Map(subRows.map((r) => [String(r._id), r]));
  const assessments = assessmentDocs.map((a) => {
    const s = statsById.get(String(a._id));
    const submissions = s?.submissions ?? 0;
    return {
      title: a.title,
      module: a.module?.name ?? '—',
      type: a.type,
      submissions,
      passRate: submissions ? Math.round((s.passed / submissions) * 100) : 0,
      avgScore: s?.avgScore != null ? Math.round(s.avgScore) : 0,
    };
  });

  // Student leaderboard — top students by average graded score across these assessments.
  const perStudent = await Submission.aggregate([
    { $match: { assessment: { $in: assessmentDocs.map((a) => a._id) }, status: GRADED } },
    { $group: { _id: '$student', avgScore: { $avg: '$score' }, attempts: { $sum: 1 } } },
    { $sort: { avgScore: -1 } },
    { $limit: 8 },
  ]);
  const leaderDocs = await User.find({ _id: { $in: perStudent.map((r) => r._id) } }).select('name');
  const nameById = new Map(leaderDocs.map((s) => [String(s._id), s.name]));
  const leaderboard = perStudent.map((r) => ({ student: nameById.get(String(r._id)) ?? '—', avgScore: Math.round(r.avgScore), attempts: r.attempts }));

  return {
    counts: { modules: moduleIds.length, batches: batchIds.length, students: studentSet.size, upcomingClasses },
    batches,
    assessments,
    leaderboard,
  };
}

// ── Student ──────────────────────────────────────────────────────────────────

export async function studentOverview(studentId) {
  const [progress, attRows, subs, certificates, upcoming, student] = await Promise.all([
    computeProgress(studentId),
    Attendance.aggregate([{ $match: { student: toId(studentId) } }, { $group: { _id: null, ...ATT_GROUP } }]),
    Submission.find({ student: studentId, status: GRADED })
      .select('score passed submittedAt assessment')
      .populate({ path: 'assessment', select: 'title type' })
      .sort({ submittedAt: 1 })
      .lean(),
    Certificate.countDocuments({ student: studentId }),
    (async () => {
      const now = new Date();
      return ClassSchedule.find({ date: { $gte: new Date(now.setHours(0, 0, 0, 0)) } }).sort({ date: 1 }).limit(50).select('batch date').lean();
    })(),
    User.findById(studentId).select('batch'),
  ]);

  const att = attRows[0] ?? { present: 0, late: 0, absent: 0, excused: 0, total: 0, attended: 0 };
  const attendance = {
    percentage: pctFrom(att),
    present: att.present, late: att.late, absent: att.absent, excused: att.excused, total: att.total,
  };

  const moduleStatus = (progress.modules ?? []).map((m) => ({
    module: m.module?.name ?? '—',
    code: m.module?.code ?? '',
    order: m.module?.order ?? 0,
    status: m.status,
    attendancePercentage: m.attendancePercentage ?? 0,
    finalScore: m.finalScore ?? null,
  }));
  const statusCounts = moduleStatus.reduce(
    (acc, m) => { acc[m.status] = (acc[m.status] ?? 0) + 1; return acc; },
    { [ModuleProgressStatus.COMPLETED]: 0, [ModuleProgressStatus.IN_PROGRESS]: 0, [ModuleProgressStatus.LOCKED]: 0 },
  );

  const scores = subs.map((s) => ({
    title: s.assessment?.title ?? 'Assessment',
    type: s.assessment?.type ?? '',
    score: s.score ?? 0,
    passed: Boolean(s.passed),
    at: s.submittedAt,
  }));
  const gradedCount = scores.length;
  const avgScore = gradedCount ? Math.round(scores.reduce((a, s) => a + s.score, 0) / gradedCount) : 0;
  const passRate = gradedCount ? Math.round((scores.filter((s) => s.passed).length / gradedCount) * 100) : 0;

  // Rank/percentile within the batch by average graded score.
  let rank = null;
  if (student?.batch) {
    const batch = await Batch.findById(student.batch).select('students name');
    const peerIds = (batch?.students ?? []).map((s) => String(s));
    if (peerIds.length > 1) {
      const peerRows = await Submission.aggregate([
        { $match: { student: { $in: (batch.students ?? []) }, status: GRADED } },
        { $group: { _id: '$student', avgScore: { $avg: '$score' } } },
      ]);
      const ranked = peerRows.map((r) => ({ id: String(r._id), avg: r.avgScore })).sort((a, b) => b.avg - a.avg);
      const idx = ranked.findIndex((r) => r.id === String(studentId));
      if (idx >= 0) {
        rank = {
          position: idx + 1,
          of: ranked.length,
          percentile: Math.round(((ranked.length - idx) / ranked.length) * 100),
          batch: batch?.name ?? '',
        };
      }
    }
  }

  return {
    progress: {
      completedCount: progress.completedCount ?? 0,
      passedCount: progress.passedCount ?? 0,
      total: progress.total ?? 0,
      eligibleForCertificate: progress.eligibleForCertificate ?? false,
      minAttendance: progress.minAttendance ?? 0,
      passingScore: progress.passingScore ?? 0,
    },
    moduleStatus,
    statusCounts,
    attendance,
    scores,
    scoreSummary: { gradedCount, avgScore, passRate },
    certificates,
    upcomingClasses: upcoming.length,
    rank,
  };
}

// Aggregation $match needs a real ObjectId (req.auth.userId is a string).
function toId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}
