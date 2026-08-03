import { z } from 'zod';
import { AssessmentAvailability, AssessmentType, ProctoringMode, SubmissionStatus, UserRole } from '#shared';
import {
  Assessment,
  Batch,
  Module,
  QuestionBankItem,
  Submission,
  User,
  getSettings,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';
import { sebStatus } from '../services/seb.js';
import { audit } from '../services/audit.js';

const objectId = z.string().length(24);

export const assessmentIdParam = z.object({ id: objectId });
export const questionParam = z.object({ id: objectId, questionId: objectId });

export const listAssessmentsQuery = z.object({
  module: objectId.optional(),
  type: z.nativeEnum(AssessmentType).optional(),
  // 'true' → browse the ready-made test library (templates) instead of assigned tests.
  template: z.enum(['true', 'false']).optional(),
});

// Ready-made tests are the only two categories now.
const READY_MADE_TYPES = [AssessmentType.PRACTICE, AssessmentType.FINAL];

// Admin authors a "ready-made test" (template): no batch, no schedule — those are
// set by the trainer at assign time. Questions are added from the module's bank.
export const createAssessmentSchema = z.object({
  title: z.string().min(2),
  description: z.string().max(2000).optional(),
  module: objectId,
  type: z.enum(READY_MADE_TYPES),
  topic: objectId.optional().nullable(),
  // Module topics this test covers (admin selects any number).
  topics: z.array(objectId).optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  proctoring: z.nativeEnum(ProctoringMode).optional(),
  // Max proctoring warnings before the exam auto-submits (0 = no cap).
  violationLimit: z.number().int().min(0).max(50).optional(),
  questionIds: z.array(objectId).optional(),
});

export const fromBankSchema = z.object({
  questionIds: z.array(objectId).min(1, 'Pick at least one question'),
});

// A trainer assigns a ready-made template to their batch, setting who takes it and
// when. Everything else (questions, duration, format, proctoring) comes from the template.
export const assignTemplateSchema = z
  .object({
    batch: objectId,
    studentIds: z.array(objectId).optional(),
    availableFrom: z.coerce.date().optional(),
    deadline: z.coerce.date().optional(),
  })
  .superRefine((d, ctx) => validateWindow(d, ctx));

export const setAllowedStudentsSchema = z.object({
  // Empty array = the whole batch may take the assessment.
  studentIds: z.array(objectId),
});

export const updateAssessmentSchema = z
  .object({
    title: z.string().min(2).optional(),
    description: z.string().max(2000).optional(),
    topics: z.array(objectId).optional(),
    passingScore: z.number().int().min(0).max(100).optional(),
    availableFrom: z.coerce.date().optional().nullable(),
    deadline: z.coerce.date().optional().nullable(),
    durationMinutes: z.number().int().min(1).max(600).optional().nullable(),
    proctoring: z.nativeEnum(ProctoringMode).optional(),
    violationLimit: z.number().int().min(0).max(50).optional(),
  })
  .superRefine((d, ctx) => validateWindow(d, ctx));

export const unlockSchema = z.object({
  availableFrom: z.coerce.date().optional(),
  deadline: z.coerce.date().optional(),
});

/** Window/duration sanity used by create + update: start < end, and the per-
 *  student duration can't exceed the whole window. */
function validateWindow(d, ctx) {
  if (d.availableFrom && d.deadline) {
    if (d.availableFrom >= d.deadline) {
      ctx.addIssue({ code: 'custom', message: 'Window end time must be after the start time', path: ['deadline'] });
    } else if (d.durationMinutes) {
      const windowMin = (d.deadline.getTime() - d.availableFrom.getTime()) / 60000;
      if (d.durationMinutes > windowMin) {
        ctx.addIssue({ code: 'custom', message: 'Test duration cannot be longer than the test window', path: ['durationMinutes'] });
      }
    }
  }
}

/** Effective end of a started attempt: min(start + duration, window deadline). */
export function attemptEndsAt(assessment, startedAt) {
  if (!startedAt) return null;
  const ends = [];
  if (assessment.durationMinutes) ends.push(startedAt.getTime() + assessment.durationMinutes * 60000);
  if (assessment.deadline) ends.push(new Date(assessment.deadline).getTime());
  if (!ends.length) return null;
  return new Date(Math.min(...ends));
}

// ── Authorization / visibility helpers ────────────────────────────────────────

/** Admin, or a trainer assigned to the assessment's module. Returns the assessment doc. */
async function loadAssessmentForManage(req) {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw ApiError.notFound('Assessment not found');
  if (req.auth.role === UserRole.TRAINER) {
    // Ready-made templates are admin-owned; trainers only manage tests they assigned.
    if (assessment.isTemplate) throw ApiError.forbidden('Ready-made tests are managed by admins');
    const module = await Module.findById(assessment.module).select('assignedTrainers');
    const assigned = module?.assignedTrainers.some((t) => t.toString() === req.auth.userId);
    if (!assigned) throw ApiError.forbidden('You are not assigned to this module');
  }
  return assessment;
}

function isAvailableNow(a, now = new Date()) {
  if (a.availability !== AssessmentAvailability.UNLOCKED) return false;
  if (a.availableFrom && now < a.availableFrom) return false;
  if (a.deadline && now > a.deadline) return false;
  return true;
}

/**
 * Batch + per-student scoping. A student may access an assessment only if it is
 * assigned to their batch, and — when an explicit allow-list is set — only if they
 * are on it. Legacy assessments with no batch keep the old (module-curriculum) rule.
 * The `batch` arg may be an id or a populated doc.
 */
function studentMayAccess(assessment, studentBatch, studentId) {
  if (!assessment.batch) return true; // legacy: visible to the whole module curriculum
  const assessmentBatchId = assessment.batch._id ? assessment.batch._id.toString() : assessment.batch.toString();
  const studentBatchId = studentBatch?._id ? studentBatch._id.toString() : studentBatch?.toString();
  if (!studentBatchId || assessmentBatchId !== studentBatchId) return false;
  const allow = assessment.allowedStudents ?? [];
  if (allow.length === 0) return true; // whole batch
  return allow.some((s) => (s._id ? s._id.toString() : s.toString()) === studentId.toString());
}

/** Strip everything a student must never see from a question (answer key + rubric). */
function sanitizeQuestion(q) {
  const { correctOption, referenceAnswer, ...rest } = q;
  return rest;
}

/** Remove roster/allow-list internals a student should never receive. */
function stripBatchInternals(json) {
  delete json.allowedStudents;
  if (json.batch && typeof json.batch === 'object') delete json.batch.students;
  return json;
}

/** Student-facing projection: never leak the correct answer, rubric, or batch roster. */
function toStudentView(a) {
  const json = stripBatchInternals(a.toJSON());
  json.questions = json.questions.map(sanitizeQuestion);
  return json;
}

/** Module ids in the signed-in student's batch (empty if no batch). */
async function studentModuleIds(userId) {
  const me = await User.findById(userId).select('batch');
  if (!me?.batch) return [];
  const batch = await Batch.findById(me.batch).select('modules');
  return batch?.modules ?? [];
}

// ── Listing / reading ─────────────────────────────────────────────────────────

export async function listAssessments(req, res) {
  const { role, userId } = req.auth;
  const filter = {};
  if (req.query.type) filter.type = req.query.type;

  let myBatchId = null;
  if (role === UserRole.STUDENT) {
    const me = await User.findById(userId).select('batch');
    myBatchId = me?.batch ?? null;
    const batch = myBatchId ? await Batch.findById(myBatchId).select('modules') : null;
    filter.module = { $in: batch?.modules ?? [] };
    filter.isTemplate = { $ne: true }; // students never see the ready-made library
    // Students see unlocked assessments PLUS any they've already attempted — so a test
    // that's since been locked or is past its window still appears, and they can review
    // the questions they answered and their result.
    const mySubs = await Submission.find({ student: userId }).select('assessment').lean();
    const submittedIds = mySubs.map((s) => s.assessment);
    filter.$or = [
      { availability: AssessmentAvailability.UNLOCKED },
      ...(submittedIds.length ? [{ _id: { $in: submittedIds } }] : []),
    ];
  } else if (req.query.template === 'true') {
    // Staff browsing the ready-made test library (admin templates).
    filter.isTemplate = true;
    if (req.query.module) filter.module = req.query.module;
    // Trainers only see templates for the modules they're assigned to.
    if (role === UserRole.TRAINER) {
      const mine = await Module.find({ assignedTrainers: userId }).select('_id');
      filter.module = filter.module ? filter.module : { $in: mine.map((m) => m._id) };
    }
  } else if (req.query.module) {
    filter.module = req.query.module;
    filter.isTemplate = { $ne: true }; // assigned instances only, not templates
  }

  let assessments = await Assessment.find(filter)
    .sort({ module: 1, type: 1, createdAt: 1 })
    .populate('module', 'name code');

  if (role === UserRole.STUDENT) {
    // Batch + per-student allow-list scoping (legacy no-batch tests stay visible).
    assessments = assessments.filter((a) => studentMayAccess(a, myBatchId, userId));
    // Attach the student's submission summary + a computed "available now" flag.
    const subs = await Submission.find({
      student: userId,
      assessment: { $in: assessments.map((a) => a._id) },
    });
    const byAssessment = new Map(subs.map((s) => [s.assessment.toString(), s]));
    const items = await Promise.all(
      assessments.map(async (a) => {
        const view = toStudentView(a);
        const sub = byAssessment.get(a._id.toString());
        view.availableNow = isAvailableNow(a);
        view.submission = sub
          ? { id: sub.id, status: sub.status, score: sub.score, passed: sub.passed, startedAt: sub.startedAt ?? null }
          : null;
        // Hide question payload from the list view (kept for the take screen).
        view.questionCount = view.questions.length;
        delete view.questions;
        return view;
      }),
    );
    return ok(res, items);
  }

  ok(res, assessments.map((a) => a.toJSON()));
}

export async function getAssessment(req, res) {
  // Staff (admin/trainer) get the batch's student roster populated so the Manage
  // screen can render the allow-list chips.
  const assessment = await Assessment.findById(req.params.id)
    .populate('module', 'name code')
    .populate({ path: 'batch', select: 'name code', populate: { path: 'students', select: 'name email status' } });
  if (!assessment) throw ApiError.notFound('Assessment not found');

  if (req.auth.role === UserRole.STUDENT) {
    const me = await User.findById(req.auth.userId).select('batch');
    const moduleIds = (await studentModuleIds(req.auth.userId)).map((m) => m.toString());
    if (!moduleIds.includes(assessment.module._id.toString())) {
      throw ApiError.forbidden('This assessment is not part of your curriculum');
    }
    // Batch + allow-list scoping (skipped for a student who already has a submission,
    // so they can always review their own past attempt below).
    const hasSubmission = await Submission.exists({ assessment: assessment._id, student: req.auth.userId });
    if (!hasSubmission && !studentMayAccess(assessment, me?.batch, req.auth.userId)) {
      throw ApiError.forbidden('This assessment is not assigned to you');
    }

    // If the student already has a submission, this is a RESULT view — show the
    // full questions (with correct answers) for review, regardless of whether the
    // window has since closed or the test is now locked.
    const mySub = await Submission.findOne({ assessment: assessment._id, student: req.auth.userId }).select('status startedAt');
    const reviewable = mySub && [SubmissionStatus.SUBMITTED, SubmissionStatus.EVALUATING, SubmissionStatus.GRADED].includes(mySub.status);
    if (reviewable) {
      // Anti-leak: for a proctored test, hold the questions + correct answers until
      // the exam window has fully closed (others may still be taking it). The score
      // and leaderboard remain visible; the answer review unlocks after the window.
      const heldUntil =
        assessment.proctored && assessment.deadline && Date.now() < new Date(assessment.deadline).getTime()
          ? assessment.deadline
          : null;
      const full = stripBatchInternals(assessment.toJSON());
      full.review = true;
      if (heldUntil) {
        full.questions = [];
        full.answersLockedUntil = heldUntil;
      } else {
        // Review keeps the MCQ correct answers (so students learn) but never the
        // trainer's private grading rubric / model answer.
        full.questions = full.questions.map(({ referenceAnswer, ...rest }) => rest);
      }
      return ok(res, full);
    }

    if (!isAvailableNow(assessment)) {
      throw ApiError.forbidden('This assessment is locked or not currently available');
    }

    const view = toStudentView(assessment);
    if (assessment.proctored) {
      // Safe Exam Browser status drives the launch screen on the take page.
      Object.assign(view, await sebStatus(req, assessment));
      const inProgress = mySub && mySub.startedAt && mySub.status === SubmissionStatus.IN_PROGRESS;
      view.serverNow = new Date();
      view.attempt = {
        status: mySub?.status ?? SubmissionStatus.NOT_STARTED,
        startedAt: mySub?.startedAt ?? null,
        endsAt: inProgress ? attemptEndsAt(assessment, mySub.startedAt) : null,
      };
      // Questions are revealed only once the timed attempt has started.
      if (!inProgress) {
        view.questionCount = view.questions.length;
        view.questions = [];
        view.mustStart = true;
      }
    }
    return ok(res, view);
  }

  ok(res, assessment.toJSON());
}

// ── Create / update / delete (admin or assigned trainer) ──────────────────────

/** Load module-bank items by id, validating they belong to `moduleId`, and
 *  return assessment-question snapshots (so later bank edits never change a test). */
async function snapshotsFromBank(questionIds, moduleId) {
  if (!questionIds?.length) return [];
  const items = await QuestionBankItem.find({ _id: { $in: questionIds }, module: moduleId });
  if (items.length !== new Set(questionIds).size) {
    throw ApiError.badRequest('Some selected questions are not in this module’s question bank');
  }
  return items.map((q) => ({
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    correctOption: q.correctOption,
    referenceAnswer: q.referenceAnswer || '',
    mediaUrl: q.mediaUrl || '',
    mediaType: q.mediaType || '',
    mediaName: q.mediaName || '',
    points: q.points,
    sourceId: q._id,
  }));
}

/**
 * Admin authors a ready-made test (template). It holds the questions + duration +
 * proctoring but no batch or schedule — trainers assign it later. The admin picks
 * as many questions as they want (practice tests are no longer capped).
 */
export async function createAssessment(req, res) {
  const data = req.body;

  const module = await Module.findById(data.module).select('topics');
  if (!module) throw ApiError.badRequest('Module not found');

  // Resolve the optional topic to its title (used for display / coverage).
  let topicTitle = '';
  if (data.topic) {
    const t = module.topics.id(data.topic);
    if (!t) throw ApiError.badRequest('Topic not found in this module');
    topicTitle = t.title;
  }

  // Resolve the selected topics (any number) to {topic, title}, preserving the
  // module's topic order and rejecting any id that isn't in this module.
  let topics = [];
  if (data.topics?.length) {
    const wanted = new Set(data.topics.map(String));
    topics = module.topics
      .filter((t) => wanted.has(String(t._id)))
      .map((t) => ({ topic: t._id, title: t.title }));
    if (topics.length !== wanted.size) throw ApiError.badRequest('One or more topics are not in this module');
  }

  const questions = await snapshotsFromBank(data.questionIds, data.module);

  // Default: practice = built-in proctoring off, final = built-in app.
  const proctoring = data.proctoring
    ?? (data.type === AssessmentType.PRACTICE ? ProctoringMode.NONE : ProctoringMode.APP);
  const proctored = proctoring !== ProctoringMode.NONE;
  const requireSeb = proctoring === ProctoringMode.SEB;

  const settings = await getSettings();
  const assessment = await Assessment.create({
    title: data.title,
    description: data.description ?? '',
    module: data.module,
    isTemplate: true, // admin authors templates only; trainers assign them
    batch: null,
    type: data.type,
    topic: data.topic ?? null,
    topicTitle,
    topics,
    passingScore: data.passingScore ?? settings.passingScore,
    proctoring,
    proctored,
    requireSeb,
    durationMinutes: proctored ? data.durationMinutes : undefined,
    // Only proctored tests can auto-submit on violations.
    violationLimit: proctored ? (data.violationLimit ?? 0) : 0,
    questions,
    availability: AssessmentAvailability.LOCKED,
  });
  ok(res, assessment.toJSON(), 201);
}

/**
 * Trainer (or admin) assigns a ready-made template to a batch: clones its questions,
 * duration, proctoring, and passing score into a new batch-scoped test, adding the
 * chosen students + schedule. The clone is created UNLOCKED so students see it.
 */
export async function assignTemplate(req, res) {
  const template = await Assessment.findById(req.params.id);
  if (!template) throw ApiError.notFound('Ready-made test not found');
  if (!template.isTemplate) throw ApiError.badRequest('That test is not a ready-made template');
  if (template.questions.length === 0) throw ApiError.badRequest('This ready-made test has no questions yet.');

  const { batch: batchId, studentIds = [], availableFrom, deadline } = req.body;
  const batch = await Batch.findById(batchId).select('modules trainers students');
  if (!batch) throw ApiError.badRequest('Batch not found');
  if (!batch.modules.some((m) => m.toString() === template.module.toString())) {
    throw ApiError.badRequest('That batch does not include this test’s module');
  }
  if (req.auth.role === UserRole.TRAINER && !batch.trainers.some((t) => t.toString() === req.auth.userId)) {
    throw ApiError.forbidden('You are not a trainer on that batch');
  }

  // Validate the student allow-list belongs to the batch.
  const inBatch = new Set(batch.students.map((s) => s.toString()));
  const allow = [...new Set(studentIds)];
  if (allow.some((id) => !inBatch.has(id))) {
    throw ApiError.badRequest('Some selected students are not in that batch');
  }

  // A proctored (timed) test needs a valid window + duration to be takeable.
  if (template.proctored) {
    if (!availableFrom || !deadline) throw ApiError.badRequest('Set the exam window (start and end) for this proctored test.');
    if (new Date(availableFrom) >= new Date(deadline)) throw ApiError.badRequest('The window end must be after its start.');
    if (template.durationMinutes && template.durationMinutes * 60000 > new Date(deadline).getTime() - new Date(availableFrom).getTime()) {
      throw ApiError.badRequest('The exam duration is longer than the window you set.');
    }
  }

  const instance = await Assessment.create({
    title: template.title,
    description: template.description ?? '',
    module: template.module,
    isTemplate: false,
    sourceTemplate: template._id,
    batch: batch._id,
    allowedStudents: allow,
    type: template.type,
    topic: template.topic ?? null,
    topicTitle: template.topicTitle ?? '',
    topics: (template.topics ?? []).map((t) => ({ topic: t.topic, title: t.title })),
    passingScore: template.passingScore,
    availableFrom: availableFrom ?? undefined,
    deadline: deadline ?? undefined,
    proctoring: template.proctoring,
    proctored: template.proctored,
    requireSeb: template.requireSeb,
    durationMinutes: template.durationMinutes,
    violationLimit: template.violationLimit ?? 0,
    // Deep-copy the question snapshots so later template edits never change a live test.
    questions: template.questions.map((q) => ({
      type: q.type, prompt: q.prompt, options: q.options, correctOption: q.correctOption,
      referenceAnswer: q.referenceAnswer || '',
      mediaUrl: q.mediaUrl || '', mediaType: q.mediaType || '', mediaName: q.mediaName || '',
      points: q.points, sourceId: q.sourceId,
    })),
    availability: AssessmentAvailability.UNLOCKED, // assigning makes it available
    unlockedBy: req.auth.userId,
  });
  audit(req, 'assessment.assign', { targetType: 'assessment', targetId: instance.id, meta: { template: template.title, batch: batch._id.toString(), students: allow.length } });
  ok(res, instance.toJSON(), 201);
}

const DONE_STATUSES = [SubmissionStatus.SUBMITTED, SubmissionStatus.EVALUATING, SubmissionStatus.GRADED];

/**
 * Consolidated view of a test that was assigned one or more times to the same batch.
 * A trainer who re-assigns a test (e.g. to a student who missed it) creates another
 * instance sharing sourceTemplate + batch; those are all "the same test". This merges
 * every sibling instance into ONE result set: each assigned student's LATEST attempt
 * (most recent completed one wins), plus the full per-student attempt history so the
 * Manage view can list who was given a reattempt (assigned more than once).
 */
export async function consolidatedSubmissions(req, res) {
  const instance = await Assessment.findById(req.params.id);
  if (!instance) throw ApiError.notFound('Assessment not found');
  if (instance.isTemplate) throw ApiError.badRequest('Ready-made templates have no submissions');
  if (req.auth.role === UserRole.TRAINER) {
    const module = await Module.findById(instance.module).select('assignedTrainers');
    if (!module?.assignedTrainers.some((t) => t.toString() === req.auth.userId)) {
      throw ApiError.forbidden('You are not assigned to this module');
    }
  }

  // Group = every assigned instance from the same template, for the same batch.
  const groupKey = instance.sourceTemplate || instance._id;
  const siblings = await Assessment.find({
    isTemplate: false,
    batch: instance.batch,
    $or: [{ sourceTemplate: groupKey }, { _id: groupKey }],
  })
    .sort({ createdAt: 1 }) // first assignment = attempt 1
    .select('_id allowedStudents createdAt');
  const order = new Map(siblings.map((s, i) => [String(s._id), i]));
  const instIds = siblings.map((s) => s._id);

  // Assigned roster = the whole batch if ANY instance targets everyone, else the union
  // of the per-instance allow-lists.
  const batch = await Batch.findById(instance.batch).select('students').populate('students', 'name email');
  const roster = batch?.students ?? [];
  const anyWholeBatch = siblings.some((s) => (s.allowedStudents ?? []).length === 0);
  const allowUnion = new Set(siblings.flatMap((s) => (s.allowedStudents ?? []).map(String)));
  const assigned = anyWholeBatch ? roster : roster.filter((s) => allowUnion.has(String(s._id)));

  const subs = await Submission.find({ assessment: { $in: instIds } }).populate('student', 'name email').lean();
  const byStudent = new Map();
  for (const sub of subs) {
    const sid = String(sub.student?._id ?? sub.student);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push({
      instance: String(sub.assessment),
      attempt: (order.get(String(sub.assessment)) ?? 0) + 1,
      assignedAt: siblings[order.get(String(sub.assessment))]?.createdAt ?? null,
      status: sub.status,
      score: sub.score ?? null,
      passed: sub.passed ?? null,
      submittedAt: sub.submittedAt ?? null,
      disqualified: sub.disqualified ?? false,
    });
  }

  const pickLatest = (attempts) => {
    const completed = attempts.filter((a) => DONE_STATUSES.includes(a.status));
    if (completed.length) return completed[completed.length - 1]; // most recent completed
    return attempts[attempts.length - 1] ?? null; // else the newest (in-progress / not started)
  };

  const students = assigned.map((s) => {
    const attempts = (byStudent.get(String(s._id)) ?? []).sort((a, b) => a.attempt - b.attempt);
    return {
      student: { id: String(s._id), name: s.name, email: s.email },
      attempts,
      attemptCount: attempts.length,
      latest: pickLatest(attempts),
    };
  });

  ok(res, { instanceCount: siblings.length, instanceIds: instIds.map(String), students });
}

export async function updateAssessment(req, res) {
  const assessment = await loadAssessmentForManage(req);
  const { title, description, topics, passingScore, availableFrom, deadline, durationMinutes, proctoring, violationLimit } = req.body;
  if (title !== undefined) assessment.title = title;
  if (description !== undefined) assessment.description = description;
  if (topics !== undefined) {
    // Resolve the selected topic ids to {topic, title}, in the module's order.
    const module = await Module.findById(assessment.module).select('topics');
    const wanted = new Set((topics ?? []).map(String));
    const resolved = (module?.topics ?? [])
      .filter((t) => wanted.has(String(t._id)))
      .map((t) => ({ topic: t._id, title: t.title }));
    if (resolved.length !== wanted.size) throw ApiError.badRequest('One or more topics are not in this module');
    assessment.topics = resolved;
  }
  if (passingScore !== undefined) assessment.passingScore = passingScore;
  if (availableFrom !== undefined) assessment.availableFrom = availableFrom ?? undefined;
  if (deadline !== undefined) assessment.deadline = deadline ?? undefined;
  if (durationMinutes !== undefined) assessment.durationMinutes = durationMinutes ?? undefined;
  if (violationLimit !== undefined) assessment.violationLimit = violationLimit;
  if (proctoring !== undefined) {
    assessment.proctoring = proctoring;
    assessment.proctored = proctoring !== ProctoringMode.NONE;
    assessment.requireSeb = proctoring === ProctoringMode.SEB;
    if (!assessment.proctored) { assessment.durationMinutes = undefined; assessment.violationLimit = 0; }
  }
  await assessment.save();
  ok(res, assessment.toJSON());
}

export async function deleteAssessment(req, res) {
  const assessment = await loadAssessmentForManage(req);
  const submissionCount = await Submission.countDocuments({ assessment: assessment._id });
  if (submissionCount > 0) {
    throw ApiError.conflict('Cannot delete an assessment that already has submissions');
  }
  await assessment.deleteOne();
  ok(res, { id: req.params.id, deleted: true });
}

// ── Lock / unlock (the trainer-controlled gate) ───────────────────────────────

export async function unlockAssessment(req, res) {
  const assessment = await loadAssessmentForManage(req);
  if (req.body.availableFrom !== undefined) assessment.availableFrom = req.body.availableFrom;
  if (req.body.deadline !== undefined) assessment.deadline = req.body.deadline;

  if (assessment.questions.length === 0) {
    throw ApiError.badRequest('Add at least one question before unlocking.');
  }
  // A proctored exam needs a valid window + duration before students can take it.
  if (assessment.proctored) {
    const { availableFrom, deadline, durationMinutes } = assessment;
    if (!availableFrom || !deadline || !durationMinutes) {
      throw ApiError.badRequest('Set the test date, window (start–end), and duration before unlocking.');
    }
    if (availableFrom >= deadline) {
      throw ApiError.badRequest('The test window end must be after its start.');
    }
    if (durationMinutes * 60000 > deadline.getTime() - availableFrom.getTime()) {
      throw ApiError.badRequest('The test duration cannot be longer than the test window.');
    }
  }

  assessment.availability = AssessmentAvailability.UNLOCKED;
  assessment.unlockedBy = req.auth.userId;
  await assessment.save();
  audit(req, 'assessment.unlock', { targetType: 'assessment', targetId: assessment.id, meta: { title: assessment.title } });
  ok(res, assessment.toJSON());
}

export async function lockAssessment(req, res) {
  const assessment = await loadAssessmentForManage(req);
  assessment.availability = AssessmentAvailability.LOCKED;
  await assessment.save();
  audit(req, 'assessment.lock', { targetType: 'assessment', targetId: assessment.id, meta: { title: assessment.title } });
  ok(res, assessment.toJSON());
}

// ── Building a test from the question bank ────────────────────────────────────

/** Hand-pick questions from the module's bank and snapshot them into the test. */
export async function addQuestionsFromBank(req, res) {
  const assessment = await loadAssessmentForManage(req);
  const snapshots = await snapshotsFromBank(req.body.questionIds, assessment.module);
  // Skip bank questions already added to this test (by source id).
  const already = new Set(assessment.questions.map((q) => q.sourceId?.toString()).filter(Boolean));
  let added = 0;
  for (const q of snapshots) {
    if (q.sourceId && already.has(q.sourceId.toString())) continue;
    assessment.questions.push(q);
    added += 1;
  }
  await assessment.save();
  ok(res, { ...assessment.toJSON(), added, capped: false }, 201);
}

/**
 * Set the per-student allow-list for an assessment (from the Manage screen's chips
 * / Excel-of-emails). Every id must be a student in the assessment's batch. An empty
 * list means "the whole batch may take it".
 */
export async function setAllowedStudents(req, res) {
  const assessment = await loadAssessmentForManage(req);
  if (!assessment.batch) throw ApiError.badRequest('Assign a batch to this assessment first');

  const batch = await Batch.findById(assessment.batch).select('students');
  const inBatch = new Set((batch?.students ?? []).map((s) => s.toString()));
  const ids = [...new Set(req.body.studentIds)];
  const stray = ids.filter((id) => !inBatch.has(id));
  if (stray.length) throw ApiError.badRequest('Some selected students are not in this assessment’s batch');

  assessment.allowedStudents = ids;
  await assessment.save();
  audit(req, 'assessment.allowedStudents', { targetType: 'assessment', targetId: assessment.id, meta: { count: ids.length } });
  ok(res, assessment.toJSON());
}

export async function deleteQuestion(req, res) {
  const assessment = await loadAssessmentForManage(req);
  const q = assessment.questions.id(req.params.questionId);
  if (!q) throw ApiError.notFound('Question not found');
  q.deleteOne();
  await assessment.save();
  ok(res, assessment.toJSON());
}

// Re-export helpers for the submission controller.
export { isAvailableNow, studentMayAccess };
