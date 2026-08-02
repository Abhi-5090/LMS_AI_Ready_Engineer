import { z } from 'zod';
import multer from 'multer';
import { UserRole } from '#shared';
import { Certificate, CertificateTemplate, Module, User } from '../models/index.js';
import { issueEligibleCertificates, issueModuleCertificatesForPassers, listStudentCertificates } from '../services/certificates.js';
import { saveBuffer, readFileBuffer, deleteByUrl } from '../services/fileStore.js';
import { renderCertificatePdf, renderDefaultCertificatePdf } from '../services/certificateRender.js';
import { ApiError } from '../utils/ApiError.js';
import { assertCanViewStudent } from '../utils/access.js';
import { ok } from '../utils/http.js';

export const certIdParam = z.object({ certificateId: z.string().min(4).max(64) });
export const studentIdParam = z.object({ studentId: z.string().length(24) });
export const moduleIdParam = z.object({ moduleId: z.string().length(24) });

const TEMPLATE_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);

/** In-memory upload for a certificate template (PDF or PNG/JPG), ≤ 10 MB. */
export const uploadTemplateFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, TEMPLATE_MIME.has(file.mimetype)),
}).single('file');

// ── Certificate templates (admin, per module) ──────────────────────────────────

/** Admin: upload / replace a module's certificate template (+ name placement). */
export async function putCertificateTemplate(req, res) {
  const { moduleId } = req.params;
  const module = await Module.findById(moduleId).select('_id name organization');
  if (!module) throw ApiError.notFound('Module not found');

  const existing = await CertificateTemplate.findOne({ module: moduleId });
  const nameYPercent = req.body.nameYPercent !== undefined ? Number(req.body.nameYPercent) : existing?.nameYPercent ?? 55;
  const fontScale = req.body.fontScale !== undefined ? Number(req.body.fontScale) : existing?.fontScale ?? 6;

  let fileUrl = existing?.fileUrl;
  let fileName = existing?.fileName;
  let mimeType = existing?.mimeType;
  if (req.file) {
    if (!TEMPLATE_MIME.has(req.file.mimetype)) throw ApiError.badRequest('Template must be a PDF, PNG, or JPG file.');
    const saved = await saveBuffer(req.file.buffer, { filename: `cert-template-${moduleId}-${Date.now()}`, contentType: req.file.mimetype });
    if (existing?.fileUrl) await deleteByUrl(existing.fileUrl).catch(() => {}); // drop the old file
    fileUrl = saved.url;
    fileName = req.file.originalname;
    mimeType = req.file.mimetype;
  }
  if (!fileUrl) throw ApiError.badRequest('Upload a certificate template file.');

  const doc = existing ?? new CertificateTemplate({ module: moduleId, organization: module.organization ?? null });
  Object.assign(doc, { fileUrl, fileName, mimeType, nameYPercent, fontScale, uploadedBy: req.auth.userId });
  await doc.save();
  ok(res, doc.toJSON(), existing ? 200 : 201);
}

/** Admin: a module's template metadata (or null). */
export async function getCertificateTemplate(req, res) {
  const tpl = await CertificateTemplate.findOne({ module: req.params.moduleId });
  ok(res, tpl ? tpl.toJSON() : null);
}

/** Admin: issue the module certificate to everyone who passed its final test. */
export async function issueModuleCertificates(req, res) {
  const module = await Module.findById(req.params.moduleId).select('_id');
  if (!module) throw ApiError.notFound('Module not found');
  const result = await issueModuleCertificatesForPassers(req.params.moduleId);
  ok(res, result);
}

/** Admin: remove a module's template. */
export async function deleteCertificateTemplate(req, res) {
  const tpl = await CertificateTemplate.findOne({ module: req.params.moduleId });
  if (tpl) {
    await deleteByUrl(tpl.fileUrl).catch(() => {});
    await tpl.deleteOne();
  }
  ok(res, { deleted: true });
}

/** Admin: render a sample of the module's template to check the name placement. */
export async function previewCertificateTemplate(req, res) {
  const tpl = await CertificateTemplate.findOne({ module: req.params.moduleId });
  if (!tpl) throw ApiError.notFound('No template for this module');
  const buffer = await readFileBuffer(tpl.fileUrl);
  const bytes = await renderCertificatePdf({
    buffer, mimeType: tpl.mimeType, name: req.query.name || 'Student Name',
    nameYPercent: tpl.nameYPercent, fontScale: tpl.fontScale,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="certificate-preview.pdf"');
  res.send(Buffer.from(bytes));
}

// ── Download a rendered certificate (student's own, or staff) ───────────────────

export async function downloadCertificate(req, res) {
  const cert = await Certificate.findOne({ certificateId: req.params.certificateId })
    .populate('student', 'name')
    .populate('module', 'name');
  if (!cert) throw ApiError.notFound('Certificate not found');

  const { role, userId } = req.auth;
  if (role === UserRole.STUDENT && cert.student?._id.toString() !== userId) {
    throw ApiError.forbidden('Not your certificate');
  }

  const name = cert.student?.name ?? 'Student';
  const tpl = cert.module ? await CertificateTemplate.findOne({ module: cert.module._id }) : null;

  let bytes;
  if (tpl) {
    const buffer = await readFileBuffer(tpl.fileUrl);
    bytes = await renderCertificatePdf({ buffer, mimeType: tpl.mimeType, name, nameYPercent: tpl.nameYPercent, fontScale: tpl.fontScale });
  } else {
    bytes = await renderDefaultCertificatePdf({ name, moduleName: cert.module?.name, certificateId: cert.certificateId });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="certificate-${cert.certificateId}.pdf"`);
  res.send(Buffer.from(bytes));
}

/** PUBLIC — resolve a certificate id (what the QR code links to). No auth. */
export async function verifyCertificate(req, res) {
  const cert = await Certificate.findOne({ certificateId: req.params.certificateId })
    .populate('student', 'name')
    .populate('module', 'name code');
  if (!cert) {
    return ok(res, { valid: false });
  }
  ok(res, {
    valid: true,
    certificateId: cert.certificateId,
    studentName: cert.student?.name ?? 'Unknown',
    moduleName: cert.module?.name ?? null,
    isProgramCertificate: cert.isProgramCertificate,
    issuedAt: cert.issuedAt,
  });
}

/** Student: ensure any newly-earned certificates are issued, then return own list. */
export async function myCertificates(req, res) {
  await issueEligibleCertificates(req.auth.userId);
  const certs = await listStudentCertificates(req.auth.userId);
  ok(res, certs.map((c) => c.toJSON()));
}

/** Admin/trainer: a specific student's certificates (also ensures issuance). */
export async function studentCertificates(req, res) {
  await assertCanViewStudent(req, req.params.studentId);
  const student = await User.findById(req.params.studentId).select('name email role');
  if (!student || student.role !== UserRole.STUDENT) throw ApiError.notFound('Student not found');
  await issueEligibleCertificates(req.params.studentId);
  const certs = await listStudentCertificates(req.params.studentId);
  ok(res, { student: student.toJSON(), certificates: certs.map((c) => c.toJSON()) });
}

/** Admin: every issued certificate. */
export async function listAllCertificates(_req, res) {
  const certs = await Certificate.find()
    .sort({ issuedAt: -1 })
    .limit(2000) // safety ceiling; add offset pagination to the UI when this grows
    .populate('student', 'name email')
    .populate('module', 'name code');
  ok(res, certs.map((c) => c.toJSON()));
}
