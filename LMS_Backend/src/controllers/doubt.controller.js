import { z } from 'zod';
import { DoubtStatus, UserRole } from '#shared';
import { Batch, Doubt, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';

const objectId = z.string().length(24);

export const doubtIdParam = z.object({ id: objectId });

export const createDoubtSchema = z.object({
  title: z.string().min(3).max(160),
  body: z.string().min(1).max(4000),
  module: objectId, // a doubt is always raised against a specific module
});

export const replySchema = z.object({ body: z.string().min(1).max(4000) });

// Resolving a doubt: an optional star rating. Skipping it closes the doubt unrated
// (the student can still rate it later via the rate endpoint).
export const closeSchema = z.object({ rating: z.number().int().min(1).max(5).optional() });
export const rateSchema = z.object({ rating: z.number().int().min(1).max(5) });

// A student has this long after a doubt is answered to resolve/rate it before it
// auto-closes (unrated).
const AUTO_CLOSE_MS = 24 * 60 * 60 * 1000;

/**
 * Close any doubt that was answered more than 24h ago and never resolved — as an
 * unrated close. Runs lazily whenever doubts are listed (org-scoped via the tenant
 * plugin), so no separate scheduler is required.
 */
async function sweepStaleAnsweredDoubts() {
  await Doubt.updateMany(
    { status: DoubtStatus.ANSWERED, answeredAt: { $lt: new Date(Date.now() - AUTO_CLOSE_MS) } },
    { $set: { status: DoubtStatus.CLOSED, open: false } }, // rating stays null (unrated)
  );
}

export const listDoubtsQuery = z.object({
  status: z.nativeEnum(DoubtStatus).optional(),
  module: objectId.optional(),
});

const POP = [
  { path: 'student', select: 'name email' },
  { path: 'module', select: 'name code' },
  { path: 'messages.author', select: 'name role' },
  { path: 'answeredBy', select: 'name' },
];

/**
 * Can this trainer act on / see this doubt? Only the trainer(s) who deliver the
 * doubt's MODULE in the student's BATCH (the batch's per-module mapping) — not
 * every module trainer, and not every trainer of the batch.
 */
async function trainerDeliversModuleInBatch(userId, moduleId, batchId) {
  if (!moduleId || !batchId) return false;
  const batch = await Batch.findById(batchId).select('moduleTrainers');
  const entry = (batch?.moduleTrainers ?? []).find((mt) => String(mt.module) === String(moduleId));
  return Boolean(entry && (entry.trainers ?? []).some((t) => String(t) === String(userId)));
}

// ── Create (student) ──────────────────────────────────────────────────────────

export async function createDoubt(req, res) {
  const { title, body, module } = req.body;

  // One doubt per module per student: block a second one while an earlier doubt
  // in this module is still unresolved (not closed).
  const existing = await Doubt.findOne({
    student: req.auth.userId,
    module,
    status: { $ne: DoubtStatus.CLOSED },
  });
  if (existing) {
    throw ApiError.badRequest('You already have an open doubt in this module. Close it before asking another.');
  }

  const me = await User.findById(req.auth.userId).select('batch');
  const doubt = await Doubt.create({
    student: req.auth.userId,
    module,
    batch: me?.batch,
    title,
    status: DoubtStatus.OPEN,
    messages: [{ author: req.auth.userId, authorRole: UserRole.STUDENT, body }],
  });
  const populated = await Doubt.findById(doubt._id).populate(POP);
  ok(res, populated.toJSON(), 201);
}

// ── Listing (role-aware) ──────────────────────────────────────────────────────

export async function listDoubts(req, res) {
  await sweepStaleAnsweredDoubts(); // auto-close 24h-stale answered doubts (unrated)
  const { role, userId } = req.auth;
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.module) filter.module = req.query.module;

  if (role === UserRole.STUDENT) {
    filter.student = userId;
  } else if (role === UserRole.TRAINER) {
    // Only the exact (module, batch) pairs this trainer delivers.
    const batches = await Batch.find({ 'moduleTrainers.trainers': userId }).select('moduleTrainers');
    const pairs = [];
    for (const b of batches) {
      for (const mt of b.moduleTrainers ?? []) {
        if (mt.module && (mt.trainers ?? []).some((t) => String(t) === String(userId))) {
          pairs.push({ batch: b._id, module: mt.module });
        }
      }
    }
    if (pairs.length === 0) { ok(res, []); return; } // delivers nothing → no doubts
    filter.$or = pairs;
  }
  // admin: no extra filter (all doubts)

  const doubts = await Doubt.find(filter).sort({ updatedAt: -1 }).limit(500).populate(POP);
  ok(res, doubts.map((d) => d.toJSON()));
}

/** Load a doubt and assert the requester may view it. */
async function loadViewable(req) {
  const doubt = await Doubt.findById(req.params.id).populate(POP);
  if (!doubt) throw ApiError.notFound('Doubt not found');
  const { role, userId } = req.auth;
  if (role === UserRole.ADMIN) return doubt;
  if (role === UserRole.STUDENT) {
    if (doubt.student._id.toString() !== userId) throw ApiError.forbidden('Not your doubt');
    return doubt;
  }
  // trainer — must deliver this module in the student's batch
  const moduleId = doubt.module?._id ?? doubt.module;
  const batchId = doubt.batch?._id ?? doubt.batch;
  if (!(await trainerDeliversModuleInBatch(userId, moduleId, batchId))) {
    throw ApiError.forbidden('This doubt is outside the modules you deliver for this batch');
  }
  return doubt;
}

export async function getDoubt(req, res) {
  ok(res, (await loadViewable(req)).toJSON());
}

// ── Reply ─────────────────────────────────────────────────────────────────────

export async function addReply(req, res) {
  const { role, userId } = req.auth;
  const doubt = await Doubt.findById(req.params.id);
  if (!doubt) throw ApiError.notFound('Doubt not found');

  // Authorization: owning student, an assigned trainer, or admin.
  if (role === UserRole.STUDENT) {
    if (doubt.student.toString() !== userId) throw ApiError.forbidden('Not your doubt');
  } else if (role === UserRole.TRAINER) {
    if (!(await trainerDeliversModuleInBatch(userId, doubt.module, doubt.batch))) {
      throw ApiError.forbidden('This doubt is outside the modules you deliver for this batch');
    }
  }

  doubt.messages.push({ author: userId, authorRole: role, body: req.body.body });
  // A trainer/admin reply answers the doubt; a student follow-up reopens it.
  if (role === UserRole.STUDENT) {
    if (doubt.status === DoubtStatus.ANSWERED) doubt.status = DoubtStatus.OPEN;
  } else if (doubt.status !== DoubtStatus.CLOSED) {
    doubt.status = DoubtStatus.ANSWERED;
    doubt.answeredAt = new Date(); // (re)starts the 24h auto-close clock
    if (role === UserRole.TRAINER) doubt.answeredBy = userId; // who the student will rate
  }
  await doubt.save();

  // Notify the other party that there's a new reply.
  const { notify } = await import('../services/notify.js');
  if (role === UserRole.STUDENT) {
    if (doubt.answeredBy) notify(doubt.answeredBy, { type: 'doubt', title: `Reply on "${doubt.title}"`, body: 'The student followed up on a doubt.', link: '/app/doubts' });
  } else {
    notify(doubt.student, { type: 'doubt', title: `Your doubt was answered: "${doubt.title}"`, body: 'A trainer replied to your doubt.', link: '/app/doubts' });
  }

  const populated = await Doubt.findById(doubt._id).populate(POP);
  ok(res, populated.toJSON());
}

// ── Resolve + rate (STUDENT only) ──────────────────────────────────────────────

/**
 * The owning student marks the doubt resolved. A star rating is OPTIONAL — if the
 * student skips it, the doubt closes unrated and they can rate it later.
 */
export async function closeDoubt(req, res) {
  const doubt = await Doubt.findById(req.params.id);
  if (!doubt) throw ApiError.notFound('Doubt not found');
  if (doubt.student.toString() !== req.auth.userId) throw ApiError.forbidden('Not your doubt');
  if (doubt.status === DoubtStatus.CLOSED) throw ApiError.badRequest('This doubt is already closed');
  if (doubt.status !== DoubtStatus.ANSWERED) {
    throw ApiError.badRequest('You can close a doubt only after a trainer has answered it.');
  }

  doubt.status = DoubtStatus.CLOSED;
  doubt.open = false; // leaves the partial-unique index → a new doubt in this module is allowed
  if (req.body.rating !== undefined) doubt.rating = req.body.rating;
  await doubt.save();
  ok(res, (await Doubt.findById(doubt._id).populate(POP)).toJSON());
}

/**
 * The owning student rates the doubt AT ANY TIME (the "rate later" button). Works
 * while the doubt is answered or after it auto-closed — as long as it isn't already
 * rated. Rating an answered doubt also resolves it.
 */
export async function rateDoubt(req, res) {
  const doubt = await Doubt.findById(req.params.id);
  if (!doubt) throw ApiError.notFound('Doubt not found');
  if (doubt.student.toString() !== req.auth.userId) throw ApiError.forbidden('Not your doubt');
  if (doubt.rating != null) throw ApiError.badRequest('You have already rated this doubt.');
  if (doubt.status === DoubtStatus.OPEN) {
    throw ApiError.badRequest('You can rate a doubt only after a trainer has answered it.');
  }
  doubt.rating = req.body.rating;
  if (doubt.status === DoubtStatus.ANSWERED) { doubt.status = DoubtStatus.CLOSED; doubt.open = false; }
  await doubt.save();
  ok(res, (await Doubt.findById(doubt._id).populate(POP)).toJSON());
}

// ── Trainer's own scoreboard ───────────────────────────────────────────────────

/** Doubts this trainer has answered + the average star rating they received. */
export async function myDoubtStats(req, res) {
  await sweepStaleAnsweredDoubts();
  const trainerId = req.auth.userId;
  const answered = await Doubt.countDocuments({ answeredBy: trainerId });
  const resolved = await Doubt.countDocuments({ answeredBy: trainerId, status: DoubtStatus.CLOSED });
  const rated = await Doubt.find({ answeredBy: trainerId, rating: { $gte: 1 } }).select('rating');
  const ratingCount = rated.length;
  const averageRating = ratingCount
    ? Math.round((rated.reduce((s, d) => s + d.rating, 0) / ratingCount) * 10) / 10
    : 0;
  ok(res, { answered, resolved, ratingCount, averageRating });
}
