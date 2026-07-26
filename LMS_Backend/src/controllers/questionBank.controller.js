import mongoose from 'mongoose';
import { z } from 'zod';
import { QuestionType, QuestionComplexity, UserRole } from '#shared';
import { Module, QuestionBankItem } from '../models/index.js';
import { getTemplateOrg } from '../services/orgSeed.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';

const objectId = z.string().length(24);

export const bankItemParam = z.object({ itemId: objectId });
export const batchParam = z.object({ batchId: objectId });
export const moduleQueryReq = z.object({ module: objectId });

export const listBankQuery = z.object({
  module: objectId.optional(),
  topic: objectId.optional(),
  complexity: z.nativeEnum(QuestionComplexity).optional(),
  uploadBatch: objectId.optional(),
});

// ── Duplicate detection ───────────────────────────────────────────────────────

/**
 * A question's dedup signature: same TYPE + same wording + same SET of options
 * (order-independent). Wording/options are normalized (trim, lowercase, collapse
 * whitespace) so trivially-different copies still collide. Scoped per module.
 */
export function questionSignature(q) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const opts = (q.options ?? []).map(norm).filter(Boolean).sort();
  return `${q.type || QuestionType.MCQ}::${norm(q.prompt)}::${opts.join('|~|')}`;
}

/** The set of signatures already present in a module's bank. */
async function existingSignatures(moduleId) {
  const items = await QuestionBankItem.find({ module: moduleId }).select('type prompt options').lean();
  return new Set(items.map(questionSignature));
}

/** A single question payload (shared by manual add + bulk import). */
const questionInput = z
  .object({
    type: z.nativeEnum(QuestionType).default(QuestionType.MCQ),
    complexity: z.nativeEnum(QuestionComplexity).default(QuestionComplexity.MEDIUM),
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).optional(),
    correctOption: z.number().int().min(0).optional(),
    referenceAnswer: z.string().max(5000).optional(),
    points: z.number().int().min(1).max(100).default(1),
  })
  .superRefine((q, ctx) => {
    if (q.type === QuestionType.MCQ) {
      if (!q.options || q.options.length < 2) {
        ctx.addIssue({ code: 'custom', message: 'MCQ needs at least 2 options', path: ['options'] });
      } else if (q.correctOption === undefined || q.correctOption >= q.options.length) {
        ctx.addIssue({ code: 'custom', message: 'correctOption out of range', path: ['correctOption'] });
      }
    }
  });

export const createBankItemSchema = z
  .object({
    module: objectId,
    topic: objectId.optional().nullable(),
    type: z.nativeEnum(QuestionType).default(QuestionType.MCQ),
    complexity: z.nativeEnum(QuestionComplexity).default(QuestionComplexity.MEDIUM),
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).optional(),
    correctOption: z.number().int().min(0).optional(),
    referenceAnswer: z.string().max(5000).optional(),
    points: z.number().int().min(1).max(100).default(1),
  })
  .superRefine((q, ctx) => {
    if (q.type === QuestionType.MCQ) {
      if (!q.options || q.options.length < 2) {
        ctx.addIssue({ code: 'custom', message: 'MCQ needs at least 2 options', path: ['options'] });
      } else if (q.correctOption === undefined || q.correctOption >= q.options.length) {
        ctx.addIssue({ code: 'custom', message: 'correctOption out of range', path: ['correctOption'] });
      }
    }
  });

export const bulkBankSchema = z.object({
  module: objectId,
  topic: objectId.optional().nullable(),
  source: z.string().max(200).optional(), // original file name (for the upload card)
  items: z.array(questionInput).min(1, 'No questions to import').max(1000),
});

// Super admin (drilled into an org): copy questions from the master template bank
// into the current org's bank, filtered by module + optional topic/type/complexity.
// `topic`: an org-module topic id, or 'all' (any), or 'general' (whole-module).
export const importFromTemplateSchema = z.object({
  module: objectId,
  topic: z.union([objectId, z.literal('all'), z.literal('general')]).default('all'),
  type: z.union([z.nativeEnum(QuestionType), z.literal('all')]).default('all'),
  complexity: z.union([z.nativeEnum(QuestionComplexity), z.literal('all')]).default('all'),
});

export const updateBankItemSchema = z
  .object({
    prompt: z.string().min(1).optional(),
    type: z.nativeEnum(QuestionType).optional(),
    complexity: z.nativeEnum(QuestionComplexity).optional(),
    options: z.array(z.string().min(1)).optional(),
    correctOption: z.number().int().min(0).optional(),
    referenceAnswer: z.string().max(5000).optional(),
    points: z.number().int().min(1).max(100).optional(),
    topic: objectId.optional().nullable(),
  })
  .superRefine((q, ctx) => {
    if (q.type === QuestionType.MCQ && q.options && q.options.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'MCQ needs at least 2 options', path: ['options'] });
    }
  });

// ── Authorization helpers ─────────────────────────────────────────────────────

/** Load a module the caller may manage (admin always; trainer must be assigned). */
async function loadManageableModule(req, moduleId) {
  const module = await Module.findById(moduleId).select('assignedTrainers topics');
  if (!module) throw ApiError.badRequest('Module not found');
  if (req.auth.role === UserRole.TRAINER) {
    const assigned = module.assignedTrainers.some((t) => t.toString() === req.auth.userId);
    if (!assigned) throw ApiError.forbidden('You are not assigned to this module');
  }
  return module;
}

/** Resolve a topic id to its title within a module (empty string for null/unknown). */
function topicTitleOf(module, topicId) {
  if (!topicId) return '';
  const t = module.topics.id(topicId);
  return t?.title ?? '';
}

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function listBankItems(req, res) {
  const { role, userId } = req.auth;
  const filter = {};

  if (req.query.module) {
    await loadManageableModule(req, req.query.module); // authorize
    filter.module = req.query.module;
  } else if (role === UserRole.TRAINER) {
    // No module filter → scope to the trainer's assigned modules.
    const mine = await Module.find({ assignedTrainers: userId }).select('_id');
    filter.module = { $in: mine.map((m) => m._id) };
  }
  if (req.query.topic) filter.topic = req.query.topic;
  if (req.query.complexity) filter.complexity = req.query.complexity;
  if (req.query.uploadBatch) filter.uploadBatch = req.query.uploadBatch;

  const items = await QuestionBankItem.find(filter).sort({ createdAt: -1 });
  ok(res, items.map((i) => i.toJSON()));
}

/**
 * The Excel/import "batches" for a module, newest first — one card per upload with
 * its question count, when it happened, and the file it came from.
 */
export async function listUploadBatches(req, res) {
  await loadManageableModule(req, req.query.module); // authorize
  const rows = await QuestionBankItem.aggregate([
    { $match: { module: new mongoose.Types.ObjectId(req.query.module), uploadBatch: { $ne: null } } },
    { $group: {
      _id: '$uploadBatch',
      count: { $sum: 1 },
      uploadedAt: { $min: '$createdAt' },
      source: { $first: '$uploadSource' },
      topicTitle: { $first: '$topicTitle' },
    } },
    { $sort: { uploadedAt: -1 } },
  ]);
  ok(res, rows.map((r) => ({
    uploadBatch: String(r._id),
    count: r.count,
    uploadedAt: r.uploadedAt,
    source: r.source || '',
    topicTitle: r.topicTitle || '',
  })));
}

/** Delete every question in one upload batch. */
export async function deleteUploadBatch(req, res) {
  const first = await QuestionBankItem.findOne({ uploadBatch: req.params.batchId }).select('module');
  if (!first) throw ApiError.notFound('Upload not found');
  await loadManageableModule(req, first.module); // authorize on the module
  const result = await QuestionBankItem.deleteMany({ uploadBatch: req.params.batchId });
  ok(res, { deleted: result.deletedCount ?? 0 });
}

/**
 * Read-only duplicates report for a module: groups of questions that share the same
 * signature (wording + options). Each group keeps its items oldest-first so the UI
 * can suggest keeping the first and removing the rest. Nothing is deleted here.
 */
export async function listDuplicates(req, res) {
  await loadManageableModule(req, req.query.module); // authorize
  const items = await QuestionBankItem
    .find({ module: req.query.module })
    .select('type prompt options topic topicTitle createdAt uploadSource')
    .lean();
  const groups = new Map();
  for (const it of items) {
    const sig = questionSignature(it);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push({
      id: String(it._id),
      prompt: it.prompt,
      options: it.options ?? [],
      topicTitle: it.topicTitle || '',
      createdAt: it.createdAt,
      uploadSource: it.uploadSource || '',
    });
  }
  const dupes = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const items2 = g.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return { count: items2.length, prompt: items2[0].prompt, topicTitle: items2[0].topicTitle, items: items2 };
    })
    .sort((a, b) => b.count - a.count);
  ok(res, {
    groups: dupes,
    duplicateGroups: dupes.length,
    removableCount: dupes.reduce((s, g) => s + g.count - 1, 0), // extras beyond one-per-group
  });
}

export async function createBankItem(req, res) {
  const module = await loadManageableModule(req, req.body.module);
  // Refuse an exact duplicate (same wording + options) already in this module.
  const seen = await existingSignatures(req.body.module);
  if (seen.has(questionSignature(req.body))) {
    throw ApiError.conflict('This question already exists in this module’s bank (same wording and options).');
  }
  const item = await QuestionBankItem.create({
    module: req.body.module,
    topic: req.body.topic ?? null,
    topicTitle: topicTitleOf(module, req.body.topic),
    type: req.body.type,
    complexity: req.body.complexity,
    prompt: req.body.prompt,
    options: req.body.options ?? [],
    correctOption: req.body.correctOption,
    // MCQ is graded deterministically, so it never carries a reference answer.
    referenceAnswer: req.body.type === QuestionType.MCQ ? '' : (req.body.referenceAnswer ?? ''),
    points: req.body.points,
    createdBy: req.auth.userId,
  });
  ok(res, item.toJSON(), 201);
}

/**
 * Bulk insert (Excel import parsed client-side, sent as JSON). Skips any question
 * that already exists in the module's bank (same wording + options) AND any repeat
 * within the same file, so re-uploading the same sheet inserts nothing. The whole
 * upload is tagged as one batch so it can be reviewed / deleted as a unit.
 */
export async function bulkAddBankItems(req, res) {
  const module = await loadManageableModule(req, req.body.module);
  const title = topicTitleOf(module, req.body.topic);
  const seen = await existingSignatures(req.body.module);
  const uploadBatch = new mongoose.Types.ObjectId();
  const uploadSource = (req.body.source ?? '').trim().slice(0, 200);

  const docs = [];
  const duplicates = []; // questions skipped because they already exist
  for (const q of req.body.items) {
    const sig = questionSignature(q);
    if (seen.has(sig)) { duplicates.push({ prompt: q.prompt }); continue; }
    seen.add(sig); // also dedups repeats within this same file
    docs.push({
      module: req.body.module,
      topic: req.body.topic ?? null,
      topicTitle: title,
      type: q.type,
      complexity: q.complexity,
      prompt: q.prompt,
      options: q.options ?? [],
      correctOption: q.correctOption,
      referenceAnswer: q.type === QuestionType.MCQ ? '' : (q.referenceAnswer ?? ''),
      points: q.points,
      createdBy: req.auth.userId,
      uploadBatch,
      uploadSource,
    });
  }
  const created = docs.length ? await QuestionBankItem.insertMany(docs) : [];
  ok(res, {
    added: created.length,
    duplicateCount: duplicates.length,
    duplicates: duplicates.slice(0, 200),
    uploadBatch: created.length ? String(uploadBatch) : null,
  }, 201);
}

export async function updateBankItem(req, res) {
  const item = await QuestionBankItem.findById(req.params.itemId);
  if (!item) throw ApiError.notFound('Question not found');
  const module = await loadManageableModule(req, item.module); // authorize on its module
  const { prompt, type, complexity, options, correctOption, referenceAnswer, points, topic } = req.body;
  if (prompt !== undefined) item.prompt = prompt;
  if (type !== undefined) item.type = type;
  if (complexity !== undefined) item.complexity = complexity;
  if (options !== undefined) item.options = options;
  if (correctOption !== undefined) item.correctOption = correctOption;
  if (referenceAnswer !== undefined) item.referenceAnswer = referenceAnswer;
  if (points !== undefined) item.points = points;
  // Switching a question to MCQ clears any leftover reference answer.
  if ((type ?? item.type) === QuestionType.MCQ) item.referenceAnswer = '';
  if (topic !== undefined) {
    item.topic = topic ?? null;
    item.topicTitle = topicTitleOf(module, topic);
  }
  await item.save();
  ok(res, item.toJSON());
}

export async function deleteBankItem(req, res) {
  const item = await QuestionBankItem.findById(req.params.itemId);
  if (!item) throw ApiError.notFound('Question not found');
  await loadManageableModule(req, item.module); // authorize
  await item.deleteOne();
  ok(res, { id: req.params.itemId, deleted: true });
}

/**
 * SUPER ADMIN ONLY (while drilled into an org): copy questions from the master
 * template bank into THIS organization's bank, filtered by module + optional
 * topic/type/complexity. Modules are matched to the template by `code` (clones
 * share it) and topics by title (their ids differ between clones). Prompts already
 * present in the target module are skipped, so re-importing never duplicates.
 */
export async function importFromTemplate(req, res) {
  if (!req.auth.isSuperAdmin) throw ApiError.forbidden('Only the super admin can import from the master bank.');
  const targetOrg = req.auth.organization; // the org the super admin is acting in
  if (!targetOrg) throw ApiError.badRequest('Enter an organization first, then import.');

  const template = await getTemplateOrg();
  if (!template) throw ApiError.badRequest('The master template is not set up.');
  if (String(template._id) === String(targetOrg)) {
    throw ApiError.badRequest('You are already editing the master bank.');
  }

  // Target module lives in the current org; find the template's matching module by code.
  const targetModule = await Module.findById(req.body.module).select('code topics');
  if (!targetModule) throw ApiError.badRequest('Module not found');
  // Reading the template org bypasses tenant scoping by passing `organization` explicitly.
  const templateModule = await Module.findOne({ organization: template._id, code: targetModule.code }).select('_id');
  if (!templateModule) throw ApiError.badRequest('This module is not part of the master curriculum.');

  const src = { organization: template._id, module: templateModule._id };
  if (req.body.type !== 'all') src.type = req.body.type;
  if (req.body.complexity !== 'all') src.complexity = req.body.complexity;
  if (req.body.topic === 'general') {
    src.topic = null;
  } else if (req.body.topic !== 'all') {
    const t = targetModule.topics.id(req.body.topic);
    if (!t) throw ApiError.badRequest('Topic not found in this module');
    src.topicTitle = t.title; // match template questions by topic title
  }

  const source = await QuestionBankItem.find(src).lean();
  // Skip questions already in this org's module bank (same wording + options), so a
  // re-import never duplicates. The whole import is tagged as one batch.
  const seen = await existingSignatures(targetModule._id);
  const uploadBatch = new mongoose.Types.ObjectId();

  const docs = [];
  for (const s of source) {
    const sig = questionSignature(s);
    if (seen.has(sig)) continue;
    seen.add(sig);
    // Re-map the source topic title onto this org module's own topic id.
    const match = s.topicTitle ? targetModule.topics.find((t) => t.title === s.topicTitle) : null;
    docs.push({
      module: targetModule._id,
      topic: match?._id ?? null,
      topicTitle: match?.title ?? '',
      type: s.type,
      complexity: s.complexity ?? 'medium',
      prompt: s.prompt,
      options: s.options ?? [],
      correctOption: s.correctOption,
      referenceAnswer: s.type === QuestionType.MCQ ? '' : (s.referenceAnswer ?? ''),
      points: s.points ?? 1,
      createdBy: req.auth.userId,
      uploadBatch,
      uploadSource: 'Imported from master',
    });
  }
  const created = docs.length ? await QuestionBankItem.insertMany(docs) : [];
  ok(res, { imported: created.length, skipped: source.length - created.length, matched: source.length }, 201);
}
