import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { ExternalCertStatus, UserRole } from '#shared';
import { Batch, ExternalCertificate, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';
import { gridfsStorage, deleteByUrl } from '../services/fileStore.js';

const objectId = z.string().length(24);
export const externalCertIdParam = z.object({ id: objectId });
export const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

// ── Multer (single file → MongoDB/GridFS) ─────────────────────────────────────
const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp']);
export const uploadCertFile = multer({
  storage: gridfsStorage('cert'),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new ApiError(400, 'UNSUPPORTED_FILE', `Use a PDF or image. Not allowed: ${ext || file.mimetype}`));
    }
    cb(null, true);
  },
}).single('file');

const createSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(160),
  issuer: z.string().max(120).optional(),
  url: z.string().url('Enter a valid link').max(1000).optional(),
});

/** The signed-in student's own external certificates, newest first. */
export async function listMine(req, res) {
  const certs = await ExternalCertificate.find({ student: req.auth.userId }).sort({ createdAt: -1 });
  ok(res, certs.map((c) => c.toJSON()));
}

/** Add an external certificate — a link OR an uploaded file (PDF/image). */
export async function create(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    // Surface the first field-level message (e.g. "Title must be at least 2
    // characters") rather than a generic "Validation failed".
    const first = parsed.error.issues[0];
    throw ApiError.badRequest(first?.message ?? 'Validation failed', parsed.error.flatten());
  }
  const { title, issuer, url } = parsed.data;

  let finalUrl = url;
  if (req.file) {
    finalUrl = req.file.url;
  } else if (!url) {
    throw ApiError.badRequest('Provide a link or upload a file');
  }

  const cert = await ExternalCertificate.create({
    student: req.auth.userId,
    title,
    issuer,
    url: finalUrl,
  });
  ok(res, cert.toJSON(), 201);
}

/** Delete one of the student's own external certificates. */
export async function remove(req, res) {
  const cert = await ExternalCertificate.findOne({ _id: req.params.id, student: req.auth.userId });
  if (!cert) throw ApiError.notFound('Certificate not found');
  // Approved certificates are locked — a student can only remove ones still
  // pending or rejected (e.g. added by mistake).
  if (cert.status === ExternalCertStatus.APPROVED) {
    throw ApiError.forbidden('An approved certificate cannot be removed.');
  }

  // Best-effort cleanup of an uploaded file.
  await deleteByUrl(cert.url);
  await cert.deleteOne();
  ok(res, { id: req.params.id, deleted: true });
}

// ── Review (trainer / admin) ──────────────────────────────────────────────────

/** Which students' certs may this reviewer act on? Admin = all; trainer = the
 *  students in the batches they're assigned to. Returns null for "all". */
async function reviewableStudentIds(req) {
  if (req.auth.role === UserRole.ADMIN) return null;
  const batches = await Batch.find({ trainers: req.auth.userId }).select('students');
  return [...new Set(batches.flatMap((b) => b.students.map((s) => s.toString())))];
}

/** Certs a trainer/admin can review — pending first, then recently reviewed. */
export async function listForReview(req, res) {
  const studentIds = await reviewableStudentIds(req);
  const filter = studentIds ? { student: { $in: studentIds } } : {};
  const certs = await ExternalCertificate.find(filter)
    .sort({ status: 1, createdAt: -1 }) // 'approved','pending','rejected' → pending mid; re-sorted below
    .populate('student', 'name email')
    .populate('reviewedBy', 'name');
  // Surface pending first regardless of alpha order.
  const rank = { [ExternalCertStatus.PENDING]: 0, [ExternalCertStatus.APPROVED]: 1, [ExternalCertStatus.REJECTED]: 2 };
  const sorted = certs.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.createdAt - a.createdAt));
  ok(res, sorted.map((c) => c.toJSON()));
}

/** Approve or reject a student's external certificate. */
export async function review(req, res) {
  const { decision, note } = req.body;
  const cert = await ExternalCertificate.findById(req.params.id);
  if (!cert) throw ApiError.notFound('Certificate not found');

  // Trainers may only review their own batches' students.
  const studentIds = await reviewableStudentIds(req);
  if (studentIds && !studentIds.includes(cert.student.toString())) {
    throw ApiError.forbidden('This student is not in your batches');
  }

  cert.status = decision === 'approve' ? ExternalCertStatus.APPROVED : ExternalCertStatus.REJECTED;
  cert.reviewedBy = req.auth.userId;
  cert.reviewedAt = new Date();
  cert.note = note ?? undefined;
  await cert.save();

  const { notify } = await import('../services/notify.js');
  notify(cert.student, {
    type: 'approval',
    title: `Certificate ${decision === 'approve' ? 'approved' : 'rejected'}: ${cert.title}`,
    body: decision === 'approve' ? 'It now shows on your certificates page.' : (note || 'Please review and resubmit.'),
    link: '/app/certificates',
  });

  const populated = await ExternalCertificate.findById(cert._id)
    .populate('student', 'name email')
    .populate('reviewedBy', 'name');
  ok(res, populated.toJSON());
}
