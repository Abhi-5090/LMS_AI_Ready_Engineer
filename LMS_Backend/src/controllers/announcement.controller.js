import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { UserRole } from '#shared';
import { Announcement, Batch, User } from '../models/index.js';
import { gridfsStorage, deleteByUrl } from '../services/fileStore.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';

const objectId = z.string().length(24);
export const announcementIdParam = z.object({ id: objectId });

// Optional image attachment (single, ≤ 8 MB).
const ALLOWED_IMG = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
export const uploadAnnouncementImage = multer({
  storage: gridfsStorage('announcement'),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMG.has(ext)) return cb(new ApiError(400, 'UNSUPPORTED_FILE', 'The image must be a PNG, JPG, GIF, or WEBP.'));
    cb(null, true);
  },
}).single('image');

export const createAnnouncementSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(160),
  body: z.string().min(1, 'Message cannot be empty').max(4000),
  isGlobal: z.boolean().optional(),
});

const POP = [
  { path: 'author', select: 'name role' },
  { path: 'batch', select: 'name code' },
  { path: 'module', select: 'name code' },
  { path: 'targets.batch', select: 'name code' },
  { path: 'targets.modules', select: 'name code' },
];

export async function createAnnouncement(req, res) {
  const { role, userId } = req.auth;
  const parsed = createAnnouncementSchema.safeParse({ ...req.body, isGlobal: req.body.isGlobal === 'true' || req.body.isGlobal === true });
  if (!parsed.success) throw ApiError.badRequest('Validation failed', parsed.error.flatten());
  const { title, body } = parsed.data;
  const isGlobal = role === UserRole.ADMIN && parsed.data.isGlobal === true;

  // targets: [{ batch, modules: [] }] — sent as a JSON string in the multipart body.
  let targets = [];
  try {
    const raw = JSON.parse(req.body.targets || '[]');
    if (Array.isArray(raw)) {
      targets = raw
        .filter((t) => t && typeof t.batch === 'string' && t.batch.length === 24)
        .map((t) => ({ batch: t.batch, modules: (Array.isArray(t.modules) ? t.modules : []).filter((m) => typeof m === 'string' && m.length === 24) }));
    }
  } catch { /* no targets */ }

  if (!isGlobal && targets.length === 0) throw ApiError.badRequest('Select at least one batch, or post globally.');

  if (role === UserRole.TRAINER) {
    const me = await User.findById(userId).select('assignedBatches');
    const mine = new Set((me?.assignedBatches ?? []).map((b) => b.toString()));
    if (targets.some((t) => !mine.has(t.batch))) {
      throw ApiError.forbidden('You can only post to your assigned batches.');
    }
  }

  const doc = await Announcement.create({
    author: userId,
    authorRole: role,
    title,
    body,
    ...(req.file ? { imageUrl: req.file.url } : {}),
    targets,
    isGlobal,
  });

  // Notify the audience: everyone (global) or the students in the targeted batches.
  let recipientIds;
  if (isGlobal) {
    recipientIds = (await User.find({ role: UserRole.STUDENT, status: 'active' }).select('_id')).map((u) => u._id.toString());
  } else {
    const batchIds = targets.map((t) => t.batch);
    const batches = await Batch.find({ _id: { $in: batchIds } }).select('students');
    recipientIds = [...new Set(batches.flatMap((b) => b.students.map((s) => s.toString())))];
  }
  const { notifyMany } = await import('../services/notify.js');
  notifyMany(recipientIds, { type: 'announcement', title: `Announcement: ${title}`, body: body.slice(0, 140), link: '/app/announcements' });

  const populated = await Announcement.findById(doc._id).populate(POP);
  ok(res, populated.toJSON(), 201);
}

/** Role-aware feed, newest first. */
export async function listAnnouncements(req, res) {
  const { role, userId } = req.auth;
  let filter = {};

  if (role === UserRole.STUDENT) {
    const me = await User.findById(userId).select('batch');
    const batch = me?.batch ? await Batch.findById(me.batch).select('modules') : null;
    filter = {
      $or: [
        { isGlobal: true },
        ...(me?.batch ? [{ batch: me.batch }, { 'targets.batch': me.batch }] : []),
        ...(batch?.modules?.length ? [{ module: { $in: batch.modules } }, { 'targets.modules': { $in: batch.modules } }] : []),
      ],
    };
  } else if (role === UserRole.TRAINER) {
    const me = await User.findById(userId).select('assignedBatches assignedModules');
    const batches = me?.assignedBatches ?? [];
    const modules = me?.assignedModules ?? [];
    filter = {
      $or: [
        { author: userId },
        { isGlobal: true },
        { batch: { $in: batches } },
        { 'targets.batch': { $in: batches } },
        { module: { $in: modules } },
        { 'targets.modules': { $in: modules } },
      ],
    };
  }
  // admin: all

  const items = await Announcement.find(filter).sort({ createdAt: -1 }).limit(200).populate(POP);
  ok(res, items.map((a) => a.toJSON()));
}

/** Author or admin may delete. */
export async function deleteAnnouncement(req, res) {
  const ann = await Announcement.findById(req.params.id);
  if (!ann) throw ApiError.notFound('Announcement not found');
  if (req.auth.role !== UserRole.ADMIN && ann.author.toString() !== req.auth.userId) {
    throw ApiError.forbidden('You can only delete your own announcements');
  }
  if (ann.imageUrl) deleteByUrl(ann.imageUrl).catch(() => {});
  await ann.deleteOne();
  ok(res, { id: req.params.id, deleted: true });
}
