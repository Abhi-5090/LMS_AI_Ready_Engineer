import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { DoubtStatus, SOCIAL_PLATFORMS } from '#shared';
import { ClassRating, ClassSchedule, Doubt, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';
import { collectUserData } from '../services/gdpr.js';
import { gridfsStorage, deleteByUrl } from '../services/fileStore.js';

// A link is either a valid URL or an empty string (to clear it).
const link = z.union([z.string().url('Enter a valid URL').max(500), z.literal('')]).optional();
const linksShape = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, link]));

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120).optional(),
  phone: z.string().max(40).optional(),
  bio: z.string().max(500).optional(),
  links: z.object(linksShape).partial().optional(),
  customLinks: z
    .array(z.object({ label: z.string().min(1, 'Add a label').max(40), url: z.string().url('Enter a valid URL').max(500) }))
    .max(15)
    .optional(),
  // Portfolio + video resume links (the soft-copy PDF is uploaded separately).
  resume: z.object({ portfolioUrl: link, videoUrl: link }).partial().optional(),
});

// ── Resume soft-copy upload (single PDF → MongoDB/GridFS) ─────────────────────
export const uploadResumeFile = multer({
  storage: gridfsStorage('resume'),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf' && file.mimetype !== 'application/pdf') {
      return cb(new ApiError(400, 'UNSUPPORTED_FILE', 'Your resume must be a PDF.'));
    }
    cb(null, true);
  },
}).single('resume');

// ── Avatar upload (single image → MongoDB/GridFS) ─────────────────────────────
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
export const uploadAvatarFile = multer({
  storage: gridfsStorage('avatar'),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new ApiError(400, 'UNSUPPORTED_FILE', `Use an image. Not allowed: ${ext || file.mimetype}`));
    }
    cb(null, true);
  },
}).single('avatar');

export const uploadCoverFile = multer({
  storage: gridfsStorage('cover'),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new ApiError(400, 'UNSUPPORTED_FILE', `Use an image. Not allowed: ${ext || file.mimetype}`));
    }
    cb(null, true);
  },
}).single('cover');

/** Update the signed-in user's own profile (any role). */
export async function updateMe(req, res) {
  const user = await User.findById(req.auth.userId);
  if (!user) throw ApiError.notFound('User not found');

  const { name, phone, bio, links, customLinks, resume } = req.body;
  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (bio !== undefined) user.bio = bio;
  if (links) {
    user.links = { ...(user.links?.toObject?.() ?? user.links ?? {}), ...links };
  }
  if (customLinks !== undefined) {
    user.customLinks = customLinks.map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
  }
  if (resume) {
    user.resume = { ...(user.resume?.toObject?.() ?? user.resume ?? {}), ...resume };
  }
  await user.save();
  ok(res, user.toJSON());
}

/** Upload/replace the signed-in student's soft-copy resume (PDF). */
export async function setResume(req, res) {
  if (!req.file) throw ApiError.badRequest('Choose a PDF to upload');
  const user = await User.findById(req.auth.userId);
  if (!user) throw ApiError.notFound('User not found');
  const prev = user.resume?.fileUrl;
  user.resume = { ...(user.resume?.toObject?.() ?? user.resume ?? {}), fileUrl: req.file.url };
  await user.save();
  if (prev) deleteByUrl(prev).catch(() => {}); // best-effort cleanup
  ok(res, user.toJSON());
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Trainer scoreboard: classes conducted, doubts cleared + avg rating, and the
 *  average rating students gave their classes. Scoped to the signed-in trainer. */
export async function trainerStats(req, res) {
  const me = req.auth.userId;

  const classesConducted = await ClassSchedule.countDocuments({ trainer: me, date: { $lte: new Date() } });
  const doubtsResolved = await Doubt.countDocuments({ answeredBy: me, status: DoubtStatus.CLOSED });

  const ratedDoubts = await Doubt.find({ answeredBy: me, rating: { $gte: 1 } }).select('rating');
  const doubtsAvgRating = ratedDoubts.length
    ? round1(ratedDoubts.reduce((s, d) => s + d.rating, 0) / ratedDoubts.length)
    : 0;

  const classRatings = await ClassRating.find({ trainer: me }).select('rating');
  const classAvgRating = classRatings.length
    ? round1(classRatings.reduce((s, r) => s + r.rating, 0) / classRatings.length)
    : 0;

  ok(res, {
    classesConducted,
    doubtsResolved,
    doubtsRatedCount: ratedDoubts.length,
    doubtsAvgRating,
    classRatingCount: classRatings.length,
    classAvgRating,
  });
}

/** GDPR data export: the signed-in user downloads everything we hold about them. */
export async function exportMe(req, res) {
  const data = await collectUserData(req.auth.userId);
  if (!data) throw ApiError.notFound('User not found');
  res.setHeader('Content-Disposition', 'attachment; filename="my-data-export.json"');
  ok(res, data);
}

/** Replace the signed-in user's avatar image. */
export async function setAvatar(req, res) {
  if (!req.file) throw ApiError.badRequest('Choose an image to upload');
  const user = await User.findById(req.auth.userId);
  if (!user) throw ApiError.notFound('User not found');

  // Best-effort cleanup of a previously uploaded avatar.
  await deleteByUrl(user.avatarUrl);
  user.avatarUrl = req.file.url;
  await user.save();
  ok(res, user.toJSON());
}

/** Replace the signed-in user's profile banner (cover) image. */
export async function setCover(req, res) {
  if (!req.file) throw ApiError.badRequest('Choose an image to upload');
  const user = await User.findById(req.auth.userId);
  if (!user) throw ApiError.notFound('User not found');
  await deleteByUrl(user.coverUrl); // best-effort cleanup of the old banner
  user.coverUrl = req.file.url;
  await user.save();
  ok(res, user.toJSON());
}
