import { z } from 'zod';
import { SkillLevel, UserRole } from '#shared';
import {
  Assessment,
  Batch,
  Certificate,
  Module,
  ModuleProgress,
  Organization,
  QuestionBankItem,
  SyllabusImportRequest,
  User,
} from '../models/index.js';
import { RequestStatus } from '../models/SyllabusImportRequest.js';
import { getTemplateOrg } from '../services/orgSeed.js';
import { notify, notifyMany } from '../services/notify.js';
import { runUnscoped, runAsOrg } from '../services/tenantContext.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';

const objectId = z.string().length(24);

export const moduleIdParam = z.object({ id: objectId });
export const topicParam = z.object({ id: objectId, topicId: objectId });
export const trainerParam = z.object({ id: objectId, trainerId: objectId });

export const createModuleSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(12),
  description: z.string().optional(),
  level: z.nativeEnum(SkillLevel).optional(),
  order: z.number().int().min(0).optional(),
  learningObjectives: z.array(z.string()).optional(),
});

export const updateModuleSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(2).max(12).optional(),
  description: z.string().optional(),
  level: z.nativeEnum(SkillLevel).optional(),
  order: z.number().int().min(0).optional(),
  learningObjectives: z.array(z.string()).optional(),
  archived: z.boolean().optional(),
});

export const reorderSchema = z.object({
  // ordered list of module ids -> assigns order by index
  order: z.array(objectId).min(1),
});

export const assignTrainerSchema = z.object({ trainerId: objectId });

// Dates arrive as 'YYYY-MM-DD' strings (or '' / null to clear).
const dateInput = z.union([z.string().max(40), z.null()]).optional();
const subtopicInput = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  fromDate: dateInput,
  toDate: dateInput,
});

export const topicSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  contentDeliverables: z.string().max(5000).optional(),
  subtopics: z.array(subtopicInput).max(100).optional(),
});

export const updateTopicSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  contentDeliverables: z.string().max(5000).optional(),
  order: z.number().int().min(0).optional(),
  completed: z.boolean().optional(),
  subtopics: z.array(subtopicInput).max(100).optional(),
});

/** Bulk syllabus import (from an uploaded Excel/CSV). Topics matched by title
 *  (case-insensitive) are updated; new titles are appended. */
export const importSyllabusSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        subtopics: z.array(subtopicInput).max(100).optional(),
      }),
    )
    .min(1, 'No topics to import')
    .max(200, 'Import at most 200 topics at a time'),
});

export const objectivesSchema = z.object({
  learningObjectives: z.array(z.string()),
});

/**
 * Load a module or 404. If the requester is a trainer, also assert they are
 * assigned to it (admins bypass). Returns the module document.
 */
async function loadModuleForEdit(req) {
  const module = await Module.findById(req.params.id);
  if (!module) throw ApiError.notFound('Module not found');
  if (req.auth.role === UserRole.TRAINER) {
    const assigned = module.assignedTrainers.some((t) => t.toString() === req.auth.userId);
    if (!assigned) throw ApiError.forbidden('You are not assigned to this module');
  }
  return module;
}

// ── Listing / reading ───────────────────────────────────────────────────────

/** Role-aware list. Admin: all (optional archived). Trainer: assigned only. Student: active curriculum. */
export async function listModules(req, res) {
  const { role, userId } = req.auth;
  const filter = {};

  if (role === UserRole.ADMIN) {
    if (req.query.archived !== 'true') filter.archived = false;
  } else if (role === UserRole.TRAINER) {
    filter.assignedTrainers = userId;
  } else {
    filter.archived = false;
  }

  const modules = await Module.find(filter)
    .sort({ order: 1 })
    .populate('assignedTrainers', 'name email');
  ok(res, modules.map((m) => m.toJSON()));
}

export async function getModule(req, res) {
  const module = await Module.findById(req.params.id).populate(
    'assignedTrainers',
    'name email',
  );
  if (!module) throw ApiError.notFound('Module not found');
  ok(res, module.toJSON());
}

/**
 * Resolve the master-template module that matches this (org) module by code.
 * Returns { target: <this module doc>, src: <template module, lean> }. No role
 * check — previewing is allowed for any admin; the destructive import guards itself.
 */
async function resolveTargetAndMaster(req) {
  const target = await Module.findById(req.params.id);
  if (!target) throw ApiError.notFound('Module not found');
  const template = await getTemplateOrg();
  if (!template) throw ApiError.badRequest('The master template is not set up.');
  // Reading the template bypasses tenant scoping via an explicit `organization`.
  const src = await Module.findOne({ organization: template._id, code: target.code }).lean();
  if (!src) throw ApiError.badRequest('This module is not part of the master curriculum.');
  return { target, src };
}

/** Build the read-only syllabus preview (titles + descriptions + counts) from a module. */
function syllabusPreview(src) {
  const topics = (src.topics ?? []).map((t) => ({
    title: t.title,
    description: t.description ?? '',
    subtopics: (t.subtopics ?? []).map((s) => ({ title: s.title ?? '', description: s.description ?? '' })),
  }));
  return {
    code: src.code,
    name: src.name,
    description: src.description ?? '',
    learningObjectives: src.learningObjectives ?? [],
    topics,
    topicCount: topics.length,
    subtopicCount: topics.reduce((n, t) => n + t.subtopics.length, 0),
  };
}

/** Copy the master module's syllabus onto a target module doc (does not save). */
function copyMasterSyllabus(target, src) {
  target.description = src.description ?? '';
  target.learningObjectives = src.learningObjectives ?? [];
  target.topics = (src.topics ?? []).map((t, i) => ({
    title: t.title,
    description: t.description ?? '',
    contentDeliverables: t.contentDeliverables ?? '',
    order: t.order ?? i,
    completed: false,
    subtopics: (t.subtopics ?? []).map((s) => ({
      title: s.title ?? '',
      description: s.description ?? '',
      fromDate: s.fromDate ?? null,
      toDate: s.toDate ?? null,
    })),
  }));
}

/**
 * Read-only PREVIEW of the master syllabus for this module — any admin (an org
 * admin uses it to "view from master" before requesting). Applies nothing.
 */
export async function getMasterSyllabusPreview(req, res) {
  const { src } = await resolveTargetAndMaster(req);
  ok(res, syllabusPreview(src));
}

/**
 * SUPER ADMIN ONLY (while drilled into an org): copy the MASTER template's syllabus
 * for this module onto the org's module, replacing its current syllabus.
 */
export async function importSyllabusFromTemplate(req, res) {
  if (!req.auth.isSuperAdmin) throw ApiError.forbidden('Only the super admin can import the master syllabus directly.');
  const { target, src } = await resolveTargetAndMaster(req);
  copyMasterSyllabus(target, src);
  await target.save();
  ok(res, target.toJSON());
}

// ── Org-admin requests → super-admin approvals ────────────────────────────────

export const syllabusRequestSchema = z.object({ note: z.string().max(500).optional() });
export const requestIdParam = z.object({ reqId: objectId });
export const decideRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});
export const approveAllSchema = z.object({
  organization: objectId,
  note: z.string().max(500).optional(),
});

/** The template module matching a given org-module code (lean), or null. */
async function templateModuleForCode(code) {
  const template = await getTemplateOrg();
  if (!template) return null;
  return Module.findOne({ organization: template._id, code }).lean();
}

/**
 * Alert every super admin that a new master-syllabus request is awaiting approval.
 * Runs unscoped so it can see the (global, org-less) super admins and stamp their
 * notifications globally — regardless of the requesting org's context. Best-effort.
 */
async function notifySuperAdminsOfRequest(request) {
  await runUnscoped(async () => {
    const [supers, org] = await Promise.all([
      User.find({ role: UserRole.SUPER_ADMIN }).select('_id').lean(),
      Organization.findById(request.organization).select('name').lean(),
    ]);
    const orgName = org?.name ?? 'An organization';
    await notifyMany(supers.map((u) => u._id), {
      type: 'syllabus',
      title: `Syllabus request: ${request.moduleName || request.moduleCode}`,
      body: `${orgName} requested the master syllabus for this module.${request.note ? ` "${request.note}"` : ''}`,
      link: '/app/syllabus-requests',
    });
  });
}

/**
 * Apply the master syllabus onto a request's target module and mark it APPROVED.
 * Throws ApiError if the module or its master template no longer exists. Assumes it
 * runs inside a runUnscoped() block (the module lives in the requesting org).
 */
async function applyMasterSyllabusToRequest(request, userId, note = '') {
  const target = await Module.findById(request.module);
  const src = await templateModuleForCode(request.moduleCode);
  if (!target) throw ApiError.badRequest('The requested module no longer exists.');
  if (!src) throw ApiError.badRequest('This module is not part of the master curriculum.');
  copyMasterSyllabus(target, src);
  await target.save();
  request.status = RequestStatus.APPROVED;
  request.decidedBy = userId;
  request.decidedAt = new Date();
  request.decisionNote = note;
  await request.save();
}

/** Notify a request's requester of the outcome — stamped into THEIR org's inbox. */
async function notifyRequesterOfDecision(request) {
  await runAsOrg(request.organization, () => notify(request.requestedBy, {
    type: 'syllabus',
    title: `Master syllabus request ${request.status}: ${request.moduleName || request.moduleCode}`,
    body: request.status === RequestStatus.APPROVED
      ? 'The super admin approved your request — the master syllabus has been imported.'
      : `The super admin declined your request.${request.decisionNote ? ` "${request.decisionNote}"` : ''}`,
    link: '/app/modules',
  }));
}

/**
 * ORG ADMIN: request that the master syllabus for this module be imported. The super
 * admin approves it in their Approvals area. Only ONE pending request per module.
 */
export async function requestMasterSyllabus(req, res) {
  const mod = await Module.findById(req.params.id).select('code name');
  if (!mod) throw ApiError.notFound('Module not found');
  if (!(await templateModuleForCode(mod.code))) {
    throw ApiError.badRequest('This module is not part of the master curriculum.');
  }
  const existing = await SyllabusImportRequest.findOne({ module: mod._id, status: RequestStatus.PENDING });
  if (existing) throw ApiError.conflict('A request for this module is already awaiting approval.');

  const request = await SyllabusImportRequest.create({
    module: mod._id,
    moduleCode: mod.code,
    moduleName: mod.name,
    requestedBy: req.auth.userId,
    note: req.body.note ?? '',
  });
  await notifySuperAdminsOfRequest(request);
  ok(res, request.toJSON(), 201);
}

/**
 * SUPER ADMIN: all syllabus-import requests (pending first), each with the master
 * syllabus preview it's asking for + the requesting org and admin.
 */
export async function listSyllabusRequests(req, res) {
  if (!req.auth.isSuperAdmin) throw ApiError.forbidden('Super admin only.');
  // Run unscoped: this is a GLOBAL super-admin inbox spanning every org. Without this,
  // a drilled-in X-Org-Id header would scope the query to a single org and hide the
  // requests raised by other organizations.
  const items = await runUnscoped(async () => {
    const reqs = await SyllabusImportRequest.find({})
      .sort({ status: 1, createdAt: 1 })
      .populate('organization', 'name code')
      .populate('requestedBy', 'name email')
      .lean();
    // Rank pending first, then oldest-first (FIFO) so the earliest request leads.
    const rank = { pending: 0, approved: 1, rejected: 2 };
    reqs.sort((a, b) => (rank[a.status] - rank[b.status]) || (new Date(a.createdAt) - new Date(b.createdAt)));

    return Promise.all(reqs.map(async (r) => {
      const src = await templateModuleForCode(r.moduleCode);
      return { ...r, id: String(r._id), master: src ? syllabusPreview(src) : null };
    }));
  });
  ok(res, items);
}

/** SUPER ADMIN: approve (apply the master syllabus) or reject a request. */
export async function decideSyllabusRequest(req, res) {
  if (!req.auth.isSuperAdmin) throw ApiError.forbidden('Super admin only.');
  // Run unscoped: the request and its target module belong to the REQUESTING org, not
  // the org in any drill-in X-Org-Id header — so scoping here would 404 the request
  // and fail approvals across orgs.
  const request = await runUnscoped(async () => {
    const request = await SyllabusImportRequest.findById(req.params.reqId);
    if (!request) throw ApiError.notFound('Request not found');
    if (request.status !== RequestStatus.PENDING) throw ApiError.badRequest('This request has already been decided.');

    if (req.body.decision === 'approve') {
      await applyMasterSyllabusToRequest(request, req.auth.userId, req.body.note ?? '');
    } else {
      request.status = RequestStatus.REJECTED;
      request.decidedBy = req.auth.userId;
      request.decidedAt = new Date();
      request.decisionNote = req.body.note ?? '';
      await request.save();
    }
    return request;
  });

  await notifyRequesterOfDecision(request);
  ok(res, request.toJSON());
}

/**
 * SUPER ADMIN: approve EVERY pending request for one organization in a single action.
 * Requests whose module/master no longer exists are skipped (not failed), so one bad
 * request can't block the rest. Returns how many were approved vs skipped.
 */
export async function approveAllSyllabusRequests(req, res) {
  if (!req.auth.isSuperAdmin) throw ApiError.forbidden('Super admin only.');
  const orgId = req.body.organization;

  const { approved, skipped } = await runUnscoped(async () => {
    const pending = await SyllabusImportRequest.find({ organization: orgId, status: RequestStatus.PENDING })
      .sort({ createdAt: 1 }); // FIFO
    const approved = [];
    let skipped = 0;
    for (const request of pending) {
      try {
        await applyMasterSyllabusToRequest(request, req.auth.userId, req.body.note ?? '');
        approved.push(request);
      } catch {
        skipped += 1; // module no longer part of the master curriculum, etc.
      }
    }
    return { approved, skipped };
  });

  // Notify each requester of their approval.
  await Promise.all(approved.map((request) => notifyRequesterOfDecision(request)));
  ok(res, { approved: approved.length, skipped });
}

// ── Admin CRUD ───────────────────────────────────────────────────────────────

export async function createModule(req, res) {
  const data = req.body;
  if (await Module.findOne({ code: data.code.toUpperCase() })) {
    throw ApiError.conflict(`A module with code ${data.code.toUpperCase()} already exists`);
  }
  // Default order to the end of the list when not provided.
  let order = data.order;
  if (order === undefined) {
    const last = await Module.findOne().sort({ order: -1 });
    order = last ? last.order + 1 : 1;
  }
  const module = await Module.create({ ...data, order });
  ok(res, module.toJSON(), 201);
}

export async function updateModule(req, res) {
  const module = await Module.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!module) throw ApiError.notFound('Module not found');
  ok(res, module.toJSON());
}

/** Soft archive (preserves curriculum/progress history). */
export async function archiveModule(req, res) {
  const module = await Module.findByIdAndUpdate(
    req.params.id,
    { archived: true },
    { new: true },
  );
  if (!module) throw ApiError.notFound('Module not found');
  ok(res, module.toJSON());
}

/**
 * Permanently delete a module. Refused if anything still references it, so a delete
 * can never orphan curriculum, exams, progress, or certificates. When it's safe, the
 * module and its (now-unused) question-bank items are removed. Use archive for the
 * soft, reversible option.
 */
export async function deleteModulePermanent(req, res) {
  const module = await Module.findById(req.params.id);
  if (!module) throw ApiError.notFound('Module not found');

  // Submissions are keyed by assessment, so an assessment count already covers them.
  const [batches, assessments, progress, certs] = await Promise.all([
    Batch.countDocuments({ modules: module._id }),
    Assessment.countDocuments({ module: module._id }),
    ModuleProgress.countDocuments({ module: module._id }),
    Certificate.countDocuments({ module: module._id }),
  ]);

  const blockers = [];
  if (batches > 0) blockers.push(`${batches} batch(es) include it`);
  if (assessments > 0) blockers.push(`${assessments} assessment(s) belong to it`);
  if (progress > 0) blockers.push(`${progress} student progress record(s) reference it`);
  if (certs > 0) blockers.push(`${certs} certificate(s) reference it`);
  if (blockers.length) {
    throw ApiError.conflict(
      `Can’t delete this module while ${blockers.join(', ')}. Remove those first, or archive it instead.`,
    );
  }

  // Safe to delete: drop the module and its now-unused question-bank items.
  await QuestionBankItem.deleteMany({ module: module._id });
  await module.deleteOne();
  ok(res, { id: req.params.id, deleted: true });
}

/** Bulk reorder: order[] of module ids, position = new order index (1-based). */
export async function reorderModules(req, res) {
  const { order } = req.body;
  await Promise.all(
    order.map((id, idx) => Module.findByIdAndUpdate(id, { order: idx + 1 })),
  );
  const modules = await Module.find({ archived: false }).sort({ order: 1 });
  ok(res, modules.map((m) => m.toJSON()));
}

// ── Trainer assignment (admin) ────────────────────────────────────────────────

export async function assignTrainer(req, res) {
  const { trainerId } = req.body;
  const trainer = await User.findById(trainerId);
  if (!trainer || trainer.role !== UserRole.TRAINER) {
    throw ApiError.badRequest('User is not a trainer');
  }
  const module = await Module.findById(req.params.id);
  if (!module) throw ApiError.notFound('Module not found');

  // Keep both sides of the relationship in sync, idempotently.
  await Module.updateOne({ _id: module._id }, { $addToSet: { assignedTrainers: trainerId } });
  await User.updateOne({ _id: trainerId }, { $addToSet: { assignedModules: module._id } });

  const updated = await Module.findById(module._id).populate('assignedTrainers', 'name email');
  ok(res, updated.toJSON());
}

export async function removeTrainer(req, res) {
  const { id, trainerId } = req.params;
  const module = await Module.findById(id);
  if (!module) throw ApiError.notFound('Module not found');

  await Module.updateOne({ _id: id }, { $pull: { assignedTrainers: trainerId } });
  await User.updateOne({ _id: trainerId }, { $pull: { assignedModules: id } });

  const updated = await Module.findById(id).populate('assignedTrainers', 'name email');
  ok(res, updated.toJSON());
}

// ── Syllabus: topics & objectives (admin OR assigned trainer) ─────────────────

export async function addTopic(req, res) {
  const module = await loadModuleForEdit(req);
  const order = module.topics.length;
  const { subtopics, ...rest } = req.body;
  module.topics.push({ ...rest, order, completed: false, subtopics: cleanSubs(subtopics) });
  await module.save();
  ok(res, module.toJSON(), 201);
}

export async function updateTopic(req, res) {
  const module = await loadModuleForEdit(req);
  const topic = module.topics.id(req.params.topicId);
  if (!topic) throw ApiError.notFound('Topic not found');
  const { subtopics, ...rest } = req.body;
  Object.assign(topic, rest);
  if (subtopics !== undefined) topic.subtopics = cleanSubs(subtopics);
  await module.save();
  ok(res, module.toJSON());
}

export async function deleteTopic(req, res) {
  const module = await loadModuleForEdit(req);
  const topic = module.topics.id(req.params.topicId);
  if (!topic) throw ApiError.notFound('Topic not found');
  topic.deleteOne();
  await module.save();
  ok(res, module.toJSON());
}

/**
 * Mark a syllabus section complete/incomplete. This is the trainer-controlled
 * signal that gates assessment unlocks in a later milestone.
 */
export async function setTopicCompletion(req, res) {
  const module = await loadModuleForEdit(req);
  const topic = module.topics.id(req.params.topicId);
  if (!topic) throw ApiError.notFound('Topic not found');
  topic.completed = Boolean(req.body.completed);
  await module.save();
  ok(res, module.toJSON());
}

export async function updateObjectives(req, res) {
  const module = await loadModuleForEdit(req);
  module.learningObjectives = req.body.learningObjectives;
  await module.save();
  ok(res, module.toJSON());
}

const toDate = (v) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const cleanSubs = (subs = []) =>
  subs
    .map((s) => ({
      title: (s.title ?? '').trim(),
      description: (s.description ?? '').trim(),
      fromDate: toDate(s.fromDate),
      toDate: toDate(s.toDate),
    }))
    .filter((s) => s.title || s.description);

/**
 * Bulk-import a syllabus (topics + their subtopics) from a parsed spreadsheet.
 * Topics whose title already exists (case-insensitive) get their subtopics
 * replaced; brand-new titles are appended. Existing taught/resource state is
 * preserved for matched topics.
 */
export async function importSyllabus(req, res) {
  const module = await loadModuleForEdit(req);
  let added = 0;
  let updated = 0;
  for (const t of req.body.topics) {
    const title = t.title.trim();
    const subs = cleanSubs(t.subtopics);
    const existing = module.topics.find((x) => x.title.trim().toLowerCase() === title.toLowerCase());
    if (existing) {
      if (t.description !== undefined) existing.description = t.description;
      existing.subtopics = subs;
      updated += 1;
    } else {
      module.topics.push({
        title,
        description: t.description ?? '',
        order: module.topics.length,
        completed: false,
        subtopics: subs,
      });
      added += 1;
    }
  }
  await module.save();
  ok(res, { module: module.toJSON(), added, updated });
}
