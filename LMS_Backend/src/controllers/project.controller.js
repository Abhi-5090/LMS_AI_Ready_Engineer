import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { ProjectStatus, TECH_STACK, UserRole } from '#shared';
import { Batch, Project, TechTag } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';
import { gridfsStorage, deleteByUrl } from '../services/fileStore.js';

const objectId = z.string().length(24);
export const projectIdParam = z.object({ id: objectId });
export const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

// ── Multer (a single project PDF ≤ 10 MB → MongoDB/GridFS) ────────────────────
export const uploadProjectDoc = multer({
  storage: gridfsStorage('project'),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf' && file.mimetype !== 'application/pdf') {
      return cb(new ApiError(400, 'UNSUPPORTED_FILE', 'The project document must be a PDF.'));
    }
    cb(null, true);
  },
}).single('document');

const createSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(160),
  description: z.string().min(10, 'Add a short description (at least 10 characters)').max(4000),
  repoUrl: z.string().url('Enter a valid GitHub repository URL').max(1000),
  videoUrl: z.string().url('Enter a valid video URL').max(1000).optional().or(z.literal('')),
  role: z.string().max(120).optional().or(z.literal('')),
});

const KNOWN_TAGS = new Set(TECH_STACK.map((t) => t.toLowerCase()));

/** Any custom tag (not predefined, not already known) becomes a pending TechTag. */
async function submitNewTechTags(names, userId) {
  for (const name of names) {
    const key = name.toLowerCase();
    if (KNOWN_TAGS.has(key)) continue;
    if (await TechTag.findOne({ key })) continue; // already submitted/approved
    try { await TechTag.create({ name, key, status: 'pending', createdBy: userId }); }
    catch { /* concurrent duplicate — ignore */ }
  }
}

function cleanupFiles(project) {
  for (const url of project.images ?? []) deleteByUrl(url);
  if (project.documentUrl) deleteByUrl(project.documentUrl);
}

/** The signed-in student's own projects, newest first. */
export async function listMine(req, res) {
  const projects = await Project.find({ student: req.auth.userId }).sort({ createdAt: -1 });
  ok(res, projects.map((p) => p.toJSON()));
}

/** Submit a new project (title, repo URL, description, a PDF + optional video). */
export async function create(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Validation failed', parsed.error.flatten());
  if (!req.file) throw ApiError.badRequest('Upload the project document (PDF).');

  let techStack = [];
  try {
    const raw = JSON.parse(req.body.techStack || '[]');
    if (Array.isArray(raw)) techStack = [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))].slice(0, 30);
  } catch { /* no/invalid tags */ }

  const project = await Project.create({
    student: req.auth.userId,
    title: parsed.data.title,
    description: parsed.data.description,
    repoUrl: parsed.data.repoUrl,
    documentUrl: req.file.url,
    ...(parsed.data.videoUrl ? { videoUrl: parsed.data.videoUrl } : {}),
    ...(parsed.data.role?.trim() ? { role: parsed.data.role.trim() } : {}),
    techStack,
  });
  await submitNewTechTags(techStack, req.auth.userId); // queue brand-new tags for approval
  ok(res, project.toJSON(), 201);
}

/** Delete one of the student's own projects (best-effort file cleanup). */
export async function remove(req, res) {
  const project = await Project.findOne({ _id: req.params.id, student: req.auth.userId });
  if (!project) throw ApiError.notFound('Project not found');
  cleanupFiles(project);
  await project.deleteOne();
  ok(res, { id: req.params.id, deleted: true });
}

// ── Review (trainer / admin) ──────────────────────────────────────────────────

/** Which students' projects may this reviewer act on? Admin = all (null);
 *  trainer = students in the batches they're assigned to. */
async function reviewableStudentIds(req) {
  if (req.auth.role === UserRole.ADMIN) return null;
  const batches = await Batch.find({ trainers: req.auth.userId }).select('students');
  return [...new Set(batches.flatMap((b) => b.students.map((s) => s.toString())))];
}

/** Projects a trainer/admin can review — pending first, then recently reviewed. */
export async function listForReview(req, res) {
  const studentIds = await reviewableStudentIds(req);
  const filter = studentIds ? { student: { $in: studentIds } } : {};
  const projects = await Project.find(filter)
    .populate('student', 'name email')
    .populate('reviewedBy', 'name');
  const rank = { [ProjectStatus.PENDING]: 0, [ProjectStatus.APPROVED]: 1, [ProjectStatus.REJECTED]: 2 };
  const sorted = projects.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.createdAt - a.createdAt));
  ok(res, sorted.map((p) => p.toJSON()));
}

/** Approve or reject a student's project. */
export async function review(req, res) {
  const { decision, note } = req.body;
  const project = await Project.findById(req.params.id);
  if (!project) throw ApiError.notFound('Project not found');

  const studentIds = await reviewableStudentIds(req);
  if (studentIds && !studentIds.includes(project.student.toString())) {
    throw ApiError.forbidden('This student is not in your batches');
  }

  project.status = decision === 'approve' ? ProjectStatus.APPROVED : ProjectStatus.REJECTED;
  project.reviewedBy = req.auth.userId;
  project.reviewedAt = new Date();
  project.note = note ?? undefined;
  await project.save();

  const { notify } = await import('../services/notify.js');
  notify(project.student, {
    type: 'approval',
    title: `Project ${decision === 'approve' ? 'approved' : 'rejected'}: ${project.title}`,
    body: decision === 'approve' ? 'It now appears on your profile.' : (note || 'Please review and resubmit.'),
    link: '/app/profile',
  });

  const populated = await Project.findById(project._id)
    .populate('student', 'name email')
    .populate('reviewedBy', 'name');
  ok(res, populated.toJSON());
}
