import multer from 'multer';
import { z } from 'zod';
import { QuestionType, SubmissionStatus, UserRole } from '#shared';
import { Assessment, Batch, Module, Submission, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';
import { toCsv, sendCsv } from '../utils/csv.js';
import { gridfsStorage } from '../services/fileStore.js';
import { attemptEndsAt, isAvailableNow, studentMayAccess } from './assessment.controller.js';
import { assertSeb } from '../services/seb.js';
import { notify } from '../services/notify.js';
import { audit } from '../services/audit.js';
import {
  gradeInBackground,
  gradeSubmission,
  getEvaluator,
  needsAiGrading,
} from '../services/aiGrading.js';

const objectId = z.string().length(24);
export const assessmentIdParam = z.object({ id: objectId });
export const submissionParam = z.object({ id: objectId, submissionId: objectId });

// Auto-submits may carry zero answers (timer ran out before anything was picked),
// so the array is allowed to be empty here.
const answersSchema = z
  .array(
    z.object({
      question: objectId,
      selectedOption: z.number().int().min(0).optional(),
      text: z.string().optional(),
    }),
  );
export const submitSchema = z.object({ answers: answersSchema });
export const progressSchema = z.object({ answers: answersSchema });

// Grace window (ms) past the effective end during which a final/auto submit is
// still accepted, to absorb timer drift + network latency.
const GRACE_MS = 60_000;

async function ensureStudentCanAccess(req, assessment) {
  const me = await User.findById(req.auth.userId).select('batch');
  if (!me?.batch) throw ApiError.forbidden('You are not enrolled in a batch');
  // The assessment's module must belong to the student's batch curriculum —
  // otherwise a student could start/submit a test from another track by id (IDOR).
  const batch = await Batch.findById(me.batch).select('modules');
  const inCurriculum = (batch?.modules ?? []).some((m) => m.toString() === assessment.module.toString());
  if (!inCurriculum) throw ApiError.forbidden('This assessment is not part of your curriculum');
  // Batch + per-student allow-list scoping (legacy no-batch tests stay open).
  if (!studentMayAccess(assessment, me.batch, req.auth.userId)) {
    throw ApiError.forbidden('This assessment is not assigned to you');
  }
}

function studentQuestions(assessment) {
  return assessment.questions.map((q) => {
    const j = q.toJSON();
    // Never leak the answer key or the private grading rubric to the student.
    delete j.correctOption;
    delete j.referenceAnswer;
    return j;
  });
}

function attemptInfo(assessment, sub) {
  return {
    submissionId: sub.id,
    startedAt: sub.startedAt,
    endsAt: attemptEndsAt(assessment, sub.startedAt),
    serverNow: new Date(),
    durationMinutes: assessment.durationMinutes,
    questions: studentQuestions(assessment),
  };
}

/** Grade an already-SUBMITTED record (sync for MCQ, async via AI otherwise). */
async function finalizeSubmission(assessment, submission, userId) {
  if (needsAiGrading(assessment)) {
    if (await getEvaluator()) {
      submission.status = SubmissionStatus.EVALUATING;
      await submission.save();
      gradeInBackground(assessment._id, submission._id); // fire-and-forget
      return { id: submission.id, status: submission.status, passingScore: assessment.passingScore };
    }
    return { id: submission.id, status: submission.status, passingScore: assessment.passingScore, autoGraded: false };
  }
  await gradeSubmission(assessment, submission); // all-MCQ → synchronous
  const { issueEligibleCertificates } = await import('../services/certificates.js');
  issueEligibleCertificates(userId).catch(() => {});
  notify(userId, {
    type: 'result',
    title: `Result: ${assessment.title}`,
    body: `You scored ${submission.score}% — ${submission.passed ? 'Passed' : 'Not passed'}.`,
    link: `/app/assessments/${assessment._id}`,
  });
  return {
    id: submission.id,
    status: submission.status,
    score: submission.score,
    passed: submission.passed,
    passingScore: assessment.passingScore,
    autoGraded: true,
  };
}

/** If a timed attempt's effective time has fully elapsed, finalize it from
 *  whatever was autosaved (so abandoned attempts still get graded). */
export async function finalizeIfExpired(assessment, submission) {
  if (!submission || submission.status !== SubmissionStatus.IN_PROGRESS || !submission.startedAt) return submission;
  const ends = attemptEndsAt(assessment, submission.startedAt);
  if (!ends || Date.now() <= ends.getTime() + GRACE_MS) return submission;
  submission.status = SubmissionStatus.SUBMITTED;
  submission.submittedAt = ends;
  await submission.save();
  await finalizeSubmission(assessment, submission, submission.student);
  return submission;
}

/** Begin a proctored, timed attempt — anchors the countdown and reveals the questions. */
export async function startAttempt(req, res) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (!assessment.proctored) throw ApiError.badRequest('This assessment does not need to be started.');
  await ensureStudentCanAccess(req, assessment);
  await assertSeb(req, assessment); // Safe Exam Browser gate (if required)

  if (!isAvailableNow(assessment)) throw ApiError.forbidden('This test is locked or outside its window.');

  let sub = await Submission.findOne({ assessment: assessment._id, student: req.auth.userId });
  if (sub) {
    sub = await finalizeIfExpired(assessment, sub);
    if (sub.status === SubmissionStatus.IN_PROGRESS && sub.startedAt) {
      return ok(res, attemptInfo(assessment, sub)); // resume
    }
    if (sub.status !== SubmissionStatus.NOT_STARTED) {
      throw ApiError.conflict('You have already taken this test.');
    }
  }

  sub = await Submission.findOneAndUpdate(
    { assessment: assessment._id, student: req.auth.userId },
    { $set: { startedAt: new Date(), status: SubmissionStatus.IN_PROGRESS, answers: [] }, $unset: { score: '', passed: '', feedback: '', submittedAt: '' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  ok(res, attemptInfo(assessment, sub), 201);
}

/** Autosave in-progress answers so partial work survives a timeout / disconnect. */
export async function saveProgress(req, res) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  await assertSeb(req, assessment);
  const sub = await Submission.findOne({ assessment: assessment._id, student: req.auth.userId });
  if (!sub || sub.status !== SubmissionStatus.IN_PROGRESS || !sub.startedAt) {
    throw ApiError.badRequest('No active attempt to save.');
  }
  const ends = attemptEndsAt(assessment, sub.startedAt);
  if (ends && Date.now() > ends.getTime() + GRACE_MS) throw ApiError.forbidden('Your time is up.');

  const questionIds = new Set(assessment.questions.map((q) => q._id.toString()));
  for (const a of req.body.answers) {
    if (!questionIds.has(a.question)) throw ApiError.badRequest('Answer references an unknown question');
  }
  sub.answers = req.body.answers;
  await sub.save();
  ok(res, { saved: true });
}

export const disqualifySchema = z.object({ reason: z.string().max(200).optional() });

export const warningSchema = z.object({ reason: z.string().max(120).optional() });

/** Record a proctoring warning (blocked shortcut / left the exam) for the
 *  student's in-progress attempt. Counted + logged for trainer/admin review. */
export async function recordWarning(req, res) {
  const assessment = await Assessment.findById(req.params.id).select('proctored');
  if (!assessment?.proctored) throw ApiError.badRequest('This assessment is not proctored.');
  const sub = await Submission.findOne({ assessment: assessment._id, student: req.auth.userId });
  if (!sub || sub.status !== SubmissionStatus.IN_PROGRESS) return ok(res, { warnings: sub?.warnings ?? 0 });
  sub.warnings = (sub.warnings ?? 0) + 1;
  if ((sub.warningLog?.length ?? 0) < 200) sub.warningLog.push({ reason: req.body.reason || 'Proctoring violation', at: new Date() });
  await sub.save();
  ok(res, { warnings: sub.warnings });
}

// ── Webcam proctoring snapshots ───────────────────────────────────────────────
const MAX_SHOTS = 12;
export const uploadProctorShot = multer({
  storage: gridfsStorage('proctor'),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 }, // 3 MB
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
}).single('shot');

/** Store a webcam snapshot for the student's in-progress proctored attempt. */
export async function proctorShot(req, res) {
  if (!req.file) return ok(res, { stored: false });
  const assessment = await Assessment.findById(req.params.id).select('proctored');
  if (!assessment?.proctored) throw ApiError.badRequest('This assessment is not proctored.');
  const sub = await Submission.findOne({ assessment: assessment._id, student: req.auth.userId });
  if (!sub || sub.status !== SubmissionStatus.IN_PROGRESS) {
    return ok(res, { stored: false }); // no active attempt — silently ignore
  }
  if ((sub.proctorShots?.length ?? 0) >= MAX_SHOTS) return ok(res, { stored: false });
  sub.proctorShots.push(req.file.url);
  await sub.save();
  ok(res, { stored: true, count: sub.proctorShots.length });
}

/** Proctoring kick-out: the student left the exam (tab switch / exited full
 *  screen). The attempt is terminated immediately and scored 0 — "caught cheating". */
export async function disqualifyAttempt(req, res) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (!assessment.proctored) throw ApiError.badRequest('This assessment is not proctored.');

  const sub = await Submission.findOne({ assessment: assessment._id, student: req.auth.userId });
  if (!sub || !sub.startedAt) throw ApiError.badRequest('No active attempt.');
  if (sub.status !== SubmissionStatus.IN_PROGRESS) {
    return ok(res, { id: sub.id, status: sub.status, disqualified: sub.disqualified === true });
  }

  sub.status = SubmissionStatus.GRADED;
  sub.score = 0;
  sub.passed = false;
  sub.disqualified = true;
  sub.disqualifiedReason = req.body.reason || 'Left the exam (tab switch or exited full screen)';
  sub.submittedAt = new Date();
  sub.feedback = { summary: `Disqualified: ${sub.disqualifiedReason}` };
  await sub.save();
  notify(req.auth.userId, {
    type: 'result',
    title: `Disqualified: ${assessment.title ?? 'exam'}`,
    body: `Your attempt was stopped (${sub.disqualifiedReason}) and recorded as 0%.`,
    link: `/app/assessments/${assessment._id}`,
  });
  ok(res, { id: sub.id, status: sub.status, score: 0, passed: false, disqualified: true });
}

export async function submit(req, res) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  await ensureStudentCanAccess(req, assessment);
  await assertSeb(req, assessment);

  let existing = await Submission.findOne({ assessment: assessment._id, student: req.auth.userId });

  if (assessment.proctored) {
    // Proctored: must have started; finalize-from-autosave if the clock fully ran out.
    if (!existing || !existing.startedAt) throw ApiError.badRequest('Start the test before submitting.');
    existing = await finalizeIfExpired(assessment, existing);
    if (existing.status !== SubmissionStatus.IN_PROGRESS) {
      throw ApiError.conflict('You have already submitted this assessment');
    }
  } else {
    if (!isAvailableNow(assessment)) {
      throw ApiError.forbidden('This assessment is locked or outside its availability window');
    }
    if (existing && existing.status !== SubmissionStatus.NOT_STARTED) {
      throw ApiError.conflict('You have already submitted this assessment');
    }
  }

  // Validate every answer references a real question in this assessment.
  const questionIds = new Set(assessment.questions.map((q) => q._id.toString()));
  for (const a of req.body.answers) {
    if (!questionIds.has(a.question)) throw ApiError.badRequest('Answer references an unknown question');
  }

  const submission = await Submission.findOneAndUpdate(
    { assessment: assessment._id, student: req.auth.userId },
    {
      $set: { answers: req.body.answers, status: SubmissionStatus.SUBMITTED, submittedAt: new Date() },
      $unset: { score: '', passed: '', feedback: '' },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  ok(res, await finalizeSubmission(assessment, submission, req.auth.userId));
}

/** Admin/assigned-trainer: (re)trigger AI grading for a submission. */
export async function regradeSubmission(req, res) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (req.auth.role === UserRole.TRAINER) {
    const module = await Module.findById(assessment.module).select('assignedTrainers');
    const assigned = module?.assignedTrainers.some((t) => t.toString() === req.auth.userId);
    if (!assigned) throw ApiError.forbidden('You are not assigned to this module');
  }
  const submission = await Submission.findOne({
    _id: req.params.submissionId,
    assessment: assessment._id,
  });
  if (!submission) throw ApiError.notFound('Submission not found');
  if (!(await getEvaluator())) throw ApiError.badRequest('AI evaluation engine is not configured');

  await gradeSubmission(assessment, submission);
  // A regrade that flips a final to passing must (idempotently) issue the certificate.
  const { issueEligibleCertificates } = await import('../services/certificates.js');
  issueEligibleCertificates(submission.student).catch(() => {});
  audit(req, 'submission.regrade', { targetType: 'submission', targetId: submission.id, meta: { assessment: assessment.title, score: submission.score, passed: submission.passed } });
  ok(res, submission.toJSON());
}

export const manualGradeSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string().max(2000).optional(),
});

/**
 * Admin/assigned-trainer: manually set a submission's score, overriding AI
 * grading. For the (common) case where the AI mis-scored a prompt/coding answer
 * and a human needs the final say. Recomputes pass/fail against the passing mark
 * and (idempotently) issues a certificate if a final test now passes.
 */
export async function manualGradeSubmission(req, res) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (req.auth.role === UserRole.TRAINER) {
    const module = await Module.findById(assessment.module).select('assignedTrainers');
    const assigned = module?.assignedTrainers.some((t) => t.toString() === req.auth.userId);
    if (!assigned) throw ApiError.forbidden('You are not assigned to this module');
  }
  const submission = await Submission.findOne({ _id: req.params.submissionId, assessment: assessment._id });
  if (!submission) throw ApiError.notFound('Submission not found');
  const COMPLETED = [SubmissionStatus.SUBMITTED, SubmissionStatus.EVALUATING, SubmissionStatus.GRADED];
  if (!COMPLETED.includes(submission.status)) throw ApiError.badRequest('This student has no completed attempt to grade.');

  const score = Math.round(req.body.score);
  submission.score = score;
  submission.passed = score >= assessment.passingScore;
  submission.status = SubmissionStatus.GRADED;
  if (req.body.feedback) submission.feedback = { summary: req.body.feedback };
  await submission.save();

  const { issueEligibleCertificates } = await import('../services/certificates.js');
  issueEligibleCertificates(submission.student).catch(() => {});
  audit(req, 'submission.grade', { targetType: 'submission', targetId: submission.id, meta: { assessment: assessment.title, score, passed: submission.passed } });
  ok(res, submission.toJSON());
}

/**
 * Admin/assigned-trainer: reopen a student's test for another attempt. The current
 * (completed) attempt is archived into `attempts[]` and the submission is reset to
 * NOT_STARTED so the student can take it again — the new attempt becomes their live
 * result. Used when a student didn't attempt or failed and needs a retake.
 */
export async function grantReattempt(req, res) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (req.auth.role === UserRole.TRAINER) {
    const module = await Module.findById(assessment.module).select('assignedTrainers');
    const assigned = module?.assignedTrainers.some((t) => t.toString() === req.auth.userId);
    if (!assigned) throw ApiError.forbidden('You are not assigned to this module');
  }
  const sub = await Submission.findOne({ _id: req.params.submissionId, assessment: assessment._id });
  if (!sub) throw ApiError.notFound('Submission not found');

  const COMPLETED = [SubmissionStatus.SUBMITTED, SubmissionStatus.EVALUATING, SubmissionStatus.GRADED];
  if (!COMPLETED.includes(sub.status)) {
    throw ApiError.badRequest('This student has not completed an attempt yet — nothing to reopen.');
  }

  const archived = { score: sub.score, passed: sub.passed, status: sub.status, submittedAt: sub.submittedAt, disqualified: sub.disqualified };
  const updated = await Submission.findByIdAndUpdate(
    sub._id,
    {
      $push: { attempts: archived },
      $set: {
        status: SubmissionStatus.NOT_STARTED,
        answers: [],
        disqualified: false,
        proctorShots: [],
        warnings: 0,
        warningLog: [],
        reattemptGrantedAt: new Date(),
        reattemptGrantedBy: req.auth.userId,
      },
      $unset: { score: '', passed: '', feedback: '', startedAt: '', submittedAt: '', disqualifiedReason: '' },
    },
    { new: true },
  );
  audit(req, 'submission.reattempt', {
    targetType: 'submission',
    targetId: sub.id,
    meta: { assessment: assessment.title, student: sub.student.toString(), attempt: updated.attempts.length + 1 },
  });
  ok(res, updated.toJSON());
}

/** The signed-in student's submission for an assessment (or null). */
export async function getMySubmission(req, res) {
  const sub = await Submission.findOne({ assessment: req.params.id, student: req.auth.userId });
  if (!sub) return ok(res, null);
  const assessment = await Assessment.findById(req.params.id);
  if (assessment) await finalizeIfExpired(assessment, sub); // grade abandoned timed attempts on view
  const json = sub.toJSON();
  if (assessment?.proctored && sub.startedAt) {
    json.endsAt = attemptEndsAt(assessment, sub.startedAt);
    json.serverNow = new Date();
  }
  ok(res, json);
}

/** All submissions for an assessment (admin or assigned trainer). */
export async function listSubmissions(req, res) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (req.auth.role === UserRole.TRAINER) {
    const module = await Module.findById(assessment.module).select('assignedTrainers');
    const assigned = module?.assignedTrainers.some((t) => t.toString() === req.auth.userId);
    if (!assigned) throw ApiError.forbidden('You are not assigned to this module');
  }
  // Read-only: expired attempts are finalized by the background sweep (every minute),
  // so this list endpoint no longer writes on a GET. Capped to a sane ceiling.
  const subs = await Submission.find({ assessment: assessment._id })
    .sort({ submittedAt: -1 })
    .limit(2000)
    .populate('student', 'name email');
  ok(res, subs.map((s) => s.toJSON()));
}

/** CSV export of all submissions for an assessment (admin or assigned trainer). */
export async function exportSubmissionsCsv(req, res) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (req.auth.role === UserRole.TRAINER) {
    const module = await Module.findById(assessment.module).select('assignedTrainers');
    const assigned = module?.assignedTrainers.some((t) => t.toString() === req.auth.userId);
    if (!assigned) throw ApiError.forbidden('You are not assigned to this module');
  }
  const subs = await Submission.find({ assessment: assessment._id })
    .sort({ score: -1, submittedAt: 1 })
    .limit(5000)
    .populate('student', 'name email');

  const fmt = (d) => (d ? new Date(d).toISOString() : '');
  const csv = toCsv(subs, [
    { header: 'Student', value: (s) => s.student?.name ?? '' },
    { header: 'Email', value: (s) => s.student?.email ?? '' },
    { header: 'Status', value: 'status' },
    { header: 'Score', value: (s) => (s.score == null ? '' : s.score) },
    { header: 'Passed', value: (s) => (s.passed == null ? '' : s.passed ? 'Yes' : 'No') },
    { header: 'Disqualified', value: (s) => (s.disqualified ? 'Yes' : 'No') },
    { header: 'Warnings', value: 'warnings' },
    { header: 'Started At', value: (s) => fmt(s.startedAt) },
    { header: 'Submitted At', value: (s) => fmt(s.submittedAt) },
  ]);
  const safeTitle = String(assessment.title).replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
  sendCsv(res, `submissions-${safeTitle || assessment.id}.csv`, csv);
}

/**
 * Ranked leaderboard for an assessment, scoped to the requesting student's batch
 * (highest score first, fastest attempt breaks ties). Trainers/admins may
 * pass ?batch=<id> to scope; without it they see everyone who took it.
 */
export async function leaderboard(req, res) {
  const { id } = req.params;
  const { role, userId } = req.auth;

  const assessment = await Assessment.findById(id).select('sourceTemplate batch');
  if (!assessment) throw ApiError.notFound('Assessment not found');

  // Consolidate across every re-assignment of this test to the batch so a student
  // who took it more than once appears ONCE, with their latest graded result.
  const groupKey = assessment.sourceTemplate || assessment._id;
  const siblings = await Assessment.find({
    isTemplate: false,
    batch: assessment.batch,
    $or: [{ sourceTemplate: groupKey }, { _id: groupKey }],
  }).select('_id');
  const instIds = siblings.map((s) => s._id);

  let studentIds = null; // null = no batch scoping (all participants)
  if (role === UserRole.STUDENT) {
    const me = await User.findById(userId).select('batch');
    if (!me?.batch) throw ApiError.forbidden('You are not enrolled in a batch');
    const batch = await Batch.findById(me.batch).select('students');
    studentIds = (batch?.students ?? []).map((s) => s.toString());
  } else if (req.query.batch) {
    const batch = await Batch.findById(req.query.batch).select('students');
    studentIds = (batch?.students ?? []).map((s) => s.toString());
  }

  const filter = { assessment: { $in: instIds }, status: SubmissionStatus.GRADED };
  if (studentIds) filter.student = { $in: studentIds };

  // Newest first, then keep only each student's most recent graded attempt.
  const subs = await Submission.find(filter)
    .sort({ submittedAt: -1 })
    .limit(2000)
    .populate('student', 'name');

  const latestByStudent = new Map();
  for (const s of subs) {
    const sid = s.student?._id ? s.student._id.toString() : s.student?.toString();
    if (sid && !latestByStudent.has(sid)) latestByStudent.set(sid, s); // first seen = latest
  }

  const entries = [...latestByStudent.values()]
    .map((s) => ({
      name: s.student?.name ?? 'Student',
      score: s.score ?? 0,
      passed: s.passed === true,
      isMe: Boolean(s.student && s.student._id.toString() === userId),
      // How long the attempt took (start → submit), for the leaderboard's Time column.
      timeTakenMs: s.startedAt && s.submittedAt ? Math.max(0, new Date(s.submittedAt) - new Date(s.startedAt)) : null,
    }))
    // Rank by score (highest first); ties broken by the faster attempt (least
    // time taken wins). Attempts with no recorded duration sort to the bottom.
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const at = a.timeTakenMs ?? Infinity;
      const bt = b.timeTakenMs ?? Infinity;
      return at - bt;
    })
    .map((e, i) => ({ rank: i + 1, ...e }))
    .slice(0, 100); // show the top ranks

  const participants = latestByStudent.size;
  ok(res, { participants, entries });
}
