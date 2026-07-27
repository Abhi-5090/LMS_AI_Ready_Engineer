import { z } from 'zod';
import { UserRole } from '#shared';
import { Announcement, Assessment, Batch, ClassSchedule, Module, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';

const objectId = z.string().length(24);

export const batchIdParam = z.object({ id: objectId });
export const batchMemberParam = z.object({ id: objectId, memberId: objectId });

export const createBatchSchema = z
  .object({
    name: z.string().min(2),
    code: z.string().min(2).max(16),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });

export const updateBatchSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(2).max(16).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  archived: z.boolean().optional(),
});

export const idsSchema = z.object({ ids: z.array(objectId).min(1) });
export const batchModuleParam = z.object({ id: objectId, moduleId: objectId });
export const moduleTrainersSchema = z.object({ trainerIds: z.array(objectId) });
export const batchTopicParam = z.object({ id: objectId, moduleId: objectId, topicId: objectId });
export const topicTaughtSchema = z.object({ taught: z.boolean() });

const POP = [
  { path: 'students', select: 'name email status' },
  { path: 'trainers', select: 'name email' },
  { path: 'modules', select: 'name code order level' },
  { path: 'moduleTrainers.module', select: 'name code order level' },
  { path: 'moduleTrainers.trainers', select: 'name email' },
];

/**
 * Recompute batch.trainers as the union of every module's mapped trainers, and
 * keep each trainer's `assignedBatches` in sync (added when they newly deliver a
 * module here, removed when they no longer deliver any). Saves the batch.
 */
async function syncTrainersFromMapping(batch) {
  const union = [...new Set(batch.moduleTrainers.flatMap((mt) => mt.trainers.map((t) => t.toString())))];
  const prev = batch.trainers.map((t) => t.toString());
  batch.trainers = union;
  await batch.save();

  const added = union.filter((t) => !prev.includes(t));
  const removed = prev.filter((t) => !union.includes(t));
  if (added.length) {
    await User.updateMany({ _id: { $in: added } }, { $addToSet: { assignedBatches: batch._id } });
  }
  if (removed.length) {
    await User.updateMany({ _id: { $in: removed } }, { $pull: { assignedBatches: batch._id } });
  }
}

/**
 * Keep a module's `assignedTrainers` in step with the batch mappings. This list
 * drives the trainer's "My modules", module access, and assessment management —
 * so a trainer who delivers the module in ANY batch must be assigned to it.
 * `added` trainers are assigned; `dropped` trainers are unassigned only once
 * they no longer deliver this module in any batch. Call AFTER the batch is saved.
 */
async function syncModuleTrainerAssignments(moduleId, { added = [], dropped = [] } = {}) {
  if (added.length) {
    await Module.updateOne({ _id: moduleId }, { $addToSet: { assignedTrainers: { $each: added } } });
  }
  for (const trainerId of dropped) {
    const stillDelivers = await Batch.exists({ moduleTrainers: { $elemMatch: { module: moduleId, trainers: trainerId } } });
    if (!stillDelivers) await Module.updateOne({ _id: moduleId }, { $pull: { assignedTrainers: trainerId } });
  }
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** Admin: all (archived optional). Trainer: assigned batches. Student: their batch only. */
export async function listBatches(req, res) {
  const { role, userId } = req.auth;
  const filter = {};
  if (role === UserRole.ADMIN) {
    if (req.query.archived !== 'true') filter.archived = false;
  } else if (role === UserRole.TRAINER) {
    filter.trainers = userId;
  } else {
    filter.students = userId;
  }
  const batches = await Batch.find(filter).sort({ startDate: -1 }).populate(POP);
  ok(res, batches.map((b) => b.toJSON()));
}

export async function getBatch(req, res) {
  const batch = await Batch.findById(req.params.id).populate(POP);
  if (!batch) throw ApiError.notFound('Batch not found');
  ok(res, batch.toJSON());
}

// ── Admin CRUD ─────────────────────────────────────────────────────────────────

export async function createBatch(req, res) {
  const code = req.body.code.toUpperCase();
  if (await Batch.findOne({ code })) {
    throw ApiError.conflict(`A batch with code ${code} already exists`);
  }
  const batch = await Batch.create({ ...req.body, code });
  ok(res, batch.toJSON(), 201);
}

export async function updateBatch(req, res) {
  const updates = { ...req.body };
  if (updates.code) updates.code = updates.code.toUpperCase();
  const batch = await Batch.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  }).populate(POP);
  if (!batch) throw ApiError.notFound('Batch not found');
  ok(res, batch.toJSON());
}

export async function archiveBatch(req, res) {
  const batch = await Batch.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
  if (!batch) throw ApiError.notFound('Batch not found');
  ok(res, batch.toJSON());
}

/**
 * Permanently delete a batch. Refused while students, assigned tests, or scheduled
 * classes still reference it, so a delete can't orphan people or data. When it's
 * safe, the batch and its batch-wide announcements are removed. Archive is the soft,
 * reversible option.
 */
export async function deleteBatchPermanent(req, res) {
  const batch = await Batch.findById(req.params.id).select('students name');
  if (!batch) throw ApiError.notFound('Batch not found');

  const [assessments, classes] = await Promise.all([
    Assessment.countDocuments({ batch: batch._id }),
    ClassSchedule.countDocuments({ batch: batch._id }),
  ]);
  const students = batch.students?.length ?? 0;

  const blockers = [];
  if (students > 0) blockers.push(`${students} student(s) are still in it`);
  if (assessments > 0) blockers.push(`${assessments} assigned test(s) reference it`);
  if (classes > 0) blockers.push(`${classes} scheduled class(es) reference it`);
  if (blockers.length) {
    throw ApiError.conflict(
      `Can’t delete this batch while ${blockers.join(', ')}. Remove those first, or archive it instead.`,
    );
  }

  await Announcement.deleteMany({ batch: batch._id }); // batch-wide notices are now moot
  await batch.deleteOne();
  ok(res, { id: req.params.id, deleted: true });
}

// ── Student assignment (a student belongs to exactly one batch) ────────────────

export async function assignStudents(req, res) {
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw ApiError.notFound('Batch not found');

  const students = await User.find({ _id: { $in: req.body.ids }, role: UserRole.STUDENT });
  if (students.length !== req.body.ids.length) {
    throw ApiError.badRequest('One or more ids are not students');
  }

  for (const student of students) {
    // A student can only be in one batch — move them out of any previous batch.
    if (student.batch && student.batch.toString() !== batch.id) {
      await Batch.updateOne({ _id: student.batch }, { $pull: { students: student._id } });
    }
    student.batch = batch._id;
    await student.save();
  }
  await Batch.updateOne({ _id: batch._id }, { $addToSet: { students: { $each: req.body.ids } } });

  const updated = await Batch.findById(batch._id).populate(POP);
  ok(res, updated.toJSON());
}

export async function removeStudent(req, res) {
  const { id, memberId } = req.params;
  const batch = await Batch.findById(id);
  if (!batch) throw ApiError.notFound('Batch not found');

  await Batch.updateOne({ _id: id }, { $pull: { students: memberId } });
  // Clear the student's batch pointer only if it still points here.
  await User.updateOne({ _id: memberId, batch: id }, { $unset: { batch: '' } });

  const updated = await Batch.findById(id).populate(POP);
  ok(res, updated.toJSON());
}

// ── Trainer assignment (many-to-many) ─────────────────────────────────────────

export async function assignTrainers(req, res) {
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw ApiError.notFound('Batch not found');

  const trainers = await User.find({ _id: { $in: req.body.ids }, role: UserRole.TRAINER });
  if (trainers.length !== req.body.ids.length) {
    throw ApiError.badRequest('One or more ids are not trainers');
  }

  await Batch.updateOne({ _id: batch._id }, { $addToSet: { trainers: { $each: req.body.ids } } });
  await User.updateMany(
    { _id: { $in: req.body.ids } },
    { $addToSet: { assignedBatches: batch._id } },
  );

  const updated = await Batch.findById(batch._id).populate(POP);
  ok(res, updated.toJSON());
}

export async function removeTrainer(req, res) {
  const { id, memberId } = req.params;
  const batch = await Batch.findById(id);
  if (!batch) throw ApiError.notFound('Batch not found');

  await Batch.updateOne({ _id: id }, { $pull: { trainers: memberId } });
  await User.updateOne({ _id: memberId }, { $pull: { assignedBatches: id } });

  const updated = await Batch.findById(id).populate(POP);
  ok(res, updated.toJSON());
}

// ── Module assignment (which curriculum modules this batch runs) ───────────────

export async function assignModules(req, res) {
  const batch = await Batch.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { modules: { $each: req.body.ids } } },
    { new: true },
  ).populate(POP);
  if (!batch) throw ApiError.notFound('Batch not found');
  ok(res, batch.toJSON());
}

export async function removeModule(req, res) {
  const { id, memberId } = req.params;
  const batch = await Batch.findById(id);
  if (!batch) throw ApiError.notFound('Batch not found');

  const droppedEntry = batch.moduleTrainers.find((mt) => mt.module.toString() === memberId);
  const droppedTrainers = droppedEntry ? droppedEntry.trainers.map((t) => t.toString()) : [];
  batch.modules = batch.modules.filter((m) => m.toString() !== memberId);
  batch.moduleTrainers = batch.moduleTrainers.filter((mt) => mt.module.toString() !== memberId);
  await syncTrainersFromMapping(batch); // drops trainers no longer delivering anything

  // Unassign these trainers from the module unless they still deliver it elsewhere.
  await syncModuleTrainerAssignments(memberId, { dropped: droppedTrainers });

  const updated = await Batch.findById(id).populate(POP);
  ok(res, updated.toJSON());
}

// ── Per-module trainer mapping (who delivers each module in this batch) ────────

/** Replace the set of trainers who deliver one module in this batch. */
export async function setModuleTrainers(req, res) {
  const { id, moduleId } = req.params;
  const { trainerIds } = req.body;

  const batch = await Batch.findById(id);
  if (!batch) throw ApiError.notFound('Batch not found');
  if (!batch.modules.map((m) => m.toString()).includes(moduleId)) {
    throw ApiError.badRequest('That module is not part of this batch');
  }
  if (trainerIds.length) {
    const count = await User.countDocuments({ _id: { $in: trainerIds }, role: UserRole.TRAINER });
    if (count !== trainerIds.length) throw ApiError.badRequest('One or more ids are not trainers');
  }

  const entry = batch.moduleTrainers.find((mt) => mt.module.toString() === moduleId);
  const prevForModule = entry ? entry.trainers.map((t) => t.toString()) : [];
  if (entry) entry.trainers = trainerIds;
  else batch.moduleTrainers.push({ module: moduleId, trainers: trainerIds });

  await syncTrainersFromMapping(batch);

  // Mirror this mapping onto the module's assignedTrainers so the mapped
  // trainers actually see the module (My modules), can open it, and manage its
  // assessments.
  await syncModuleTrainerAssignments(moduleId, {
    added: trainerIds.filter((t) => !prevForModule.includes(t)),
    dropped: prevForModule.filter((t) => !trainerIds.includes(t)),
  });

  const updated = await Batch.findById(id).populate(POP);
  ok(res, updated.toJSON());
}

// ── Per-batch "topic taught" progress ─────────────────────────────────────────

/** Mark a syllabus topic taught/untaught for one module IN THIS BATCH. Admins,
 *  or a trainer assigned to the batch, may do this. */
export async function setTopicTaught(req, res) {
  const { id, moduleId, topicId } = req.params;
  const { taught } = req.body;
  const { role, userId } = req.auth;

  const batch = await Batch.findById(id);
  if (!batch) throw ApiError.notFound('Batch not found');
  if (role === UserRole.TRAINER && !batch.trainers.some((t) => t.toString() === userId)) {
    throw ApiError.forbidden('You are not assigned to this batch');
  }
  if (!batch.modules.map((m) => m.toString()).includes(moduleId)) {
    throw ApiError.badRequest('That module is not part of this batch');
  }

  let entry = batch.taughtTopics.find((tt) => tt.module.toString() === moduleId);
  if (!entry) {
    batch.taughtTopics.push({ module: moduleId, topics: [] });
    entry = batch.taughtTopics[batch.taughtTopics.length - 1];
  }
  const has = entry.topics.some((t) => t.toString() === topicId);
  if (taught && !has) entry.topics.push(topicId);
  else if (!taught && has) entry.topics = entry.topics.filter((t) => t.toString() !== topicId);

  await batch.save();
  const updated = await Batch.findById(id).populate(POP);
  ok(res, updated.toJSON());
}
