import QRCode from 'qrcode';
import { AssessmentType, SubmissionStatus } from '#shared';
import { Assessment, Certificate, Module, Submission, User } from '../models/index.js';
import { env } from '../config/env.js';
import { computeProgress } from './progression.js';

/** Build the public verification URL the QR code encodes. */
function verifyUrl(certificateId) {
  return `${env.appBaseUrl.replace(/\/$/, '')}/verify/${certificateId}`;
}

/** Uppercase alphanumeric slug for an id segment (drops spaces/punctuation). */
const slugSegment = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Batch segment: the full batch code, always prefixed with AIRE (no doubling). */
function batchSegment(batchCode) {
  const raw = String(batchCode || '').trim().toUpperCase() || 'NA';
  return raw.startsWith('AIRE') ? raw : `AIRE${raw}`;
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Certificate id: AIRE<batchCode>-<module>-<5-digit serial>, e.g.
 * AIRE2028-LLMFOUND-00001. The serial is ONE PAST the highest serial currently in
 * the database for that batch+module — so it restarts at 00001 whenever no such
 * certificates exist (e.g. after they have all been deleted) instead of climbing
 * forever. A concurrent clash is caught by the unique index and retried, which
 * recomputes the (now higher) max.
 */
async function makeCertificateId({ batchCode, moduleCode }) {
  const b = batchSegment(batchCode);
  const m = slugSegment(moduleCode) || 'MOD';
  const prefix = `${b}-${m}-`;
  const rx = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`);
  const existing = await Certificate.find({ certificateId: rx }).select('certificateId').lean();
  let max = 0;
  for (const c of existing) {
    const n = parseInt(c.certificateId.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const seq = max + 1;
  return { certificateId: `${prefix}${String(seq).padStart(5, '0')}`, seq };
}

async function createCertificate({ student, module, isProgramCertificate, code }) {
  // The student's batch code feeds the id (and is stored for traceability).
  const user = await User.findById(student).select('batch').populate('batch', 'code');
  const batchId = user?.batch?._id ?? null;
  const batchCode = user?.batch?.code ?? '';
  const moduleCode = isProgramCertificate ? 'PROGRAM' : code;

  // Retry only on the (astronomically unlikely) counter-backed id clash.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { certificateId, seq } = await makeCertificateId({ batchCode, moduleCode });
    const url = verifyUrl(certificateId);
    let qrDataUrl;
    try {
      qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
    } catch {
      qrDataUrl = undefined;
    }
    try {
      return await Certificate.create({
        certificateId,
        student,
        module,
        batch: batchId,
        seq,
        isProgramCertificate: Boolean(isProgramCertificate),
        issuedAt: new Date(),
        verifyUrl: url,
        qrDataUrl,
      });
    } catch (err) {
      // Retry only on a certificateId clash. A collision on the (student, module,
      // kind) unique index means a concurrent call already issued this
      // certificate — propagate so the caller can ignore it.
      if (err?.code === 11000 && err?.keyPattern?.certificateId && attempt < 2) continue;
      throw err;
    }
  }
  throw new Error('Could not generate a unique certificate id');
}

/** True for a duplicate-key error from the (student, module, kind) unique index. */
function isAlreadyIssued(err) {
  return err?.code === 11000 && !err?.keyPattern?.certificateId;
}

/**
 * Issue any certificates the student has newly become eligible for. Idempotent:
 * one per-module certificate per completed module, plus one program certificate
 * once every module is complete. Safe to call repeatedly (e.g. after grading or
 * when the student opens their certificates page).
 *
 * @returns {Promise<{ issued: number }>}
 */
export async function issueEligibleCertificates(studentId) {
  const progress = await computeProgress(studentId);
  if (!progress.hasBatch) return { issued: 0 };

  let issued = 0;

  for (const entry of progress.modules) {
    // A module certificate is earned by PASSING THE MODULE'S FINAL TEST
    // (attendance is tracked separately and does not gate the certificate).
    if (!entry.finalPassed) continue;
    const exists = await Certificate.findOne({
      student: studentId,
      module: entry.module.id,
      isProgramCertificate: false,
    });
    if (exists) continue;
    try {
      await createCertificate({ student: studentId, module: entry.module.id, code: entry.module.code });
      issued += 1;
      const { notify } = await import('./notify.js');
      notify(studentId, { type: 'certificate', title: `Certificate earned: ${entry.module.name}`, body: 'Congratulations! Your module certificate is ready.', link: '/app/certificates' });
    } catch (err) {
      if (!isAlreadyIssued(err)) throw err; // concurrent call beat us to it — fine
    }
  }

  if (progress.eligibleForCertificate) {
    const exists = await Certificate.findOne({ student: studentId, isProgramCertificate: true });
    if (!exists) {
      try {
        await createCertificate({ student: studentId, isProgramCertificate: true, code: 'PROGRAM' });
        issued += 1;
        const { notify } = await import('./notify.js');
        notify(studentId, { type: 'certificate', title: 'Program certificate earned 🎓', body: 'You completed every module — your program certificate is ready.', link: '/app/certificates' });
      } catch (err) {
        if (!isAlreadyIssued(err)) throw err;
      }
    }
  }

  return { issued };
}

/**
 * Issue the module certificate to EVERY student who passed that module's final
 * test (score ≥ pass mark). Idempotent — students who already have it are
 * skipped. Used by the admin "issue to all who passed" action. Returns how many
 * passed and how many new certificates were issued.
 */
export async function issueModuleCertificatesForPassers(moduleId) {
  const finals = await Assessment.find({ module: moduleId, type: AssessmentType.FINAL }).select('_id');
  const finalIds = finals.map((f) => f._id);
  if (finalIds.length === 0) return { totalPassed: 0, issued: 0, hasFinal: false };

  const module = await Module.findById(moduleId).select('code name');
  const passedSubs = await Submission
    .find({ assessment: { $in: finalIds }, status: SubmissionStatus.GRADED, passed: true })
    .select('student');
  const studentIds = [...new Set(passedSubs.map((s) => s.student.toString()))];

  let issued = 0;
  for (const studentId of studentIds) {
    const exists = await Certificate.findOne({ student: studentId, module: moduleId, isProgramCertificate: false });
    if (exists) continue;
    try {
      await createCertificate({ student: studentId, module: moduleId, code: module?.code ?? 'MOD' });
      issued += 1;
      const { notify } = await import('./notify.js');
      notify(studentId, { type: 'certificate', title: `Certificate earned: ${module?.name ?? 'Module'}`, body: 'Congratulations! Your module certificate is ready.', link: '/app/certificates' });
    } catch (err) {
      if (!isAlreadyIssued(err)) throw err;
    }
  }
  return { totalPassed: studentIds.length, issued, hasFinal: true };
}

/** Fetch a student's certificates (module populated), newest first. */
export async function listStudentCertificates(studentId) {
  return Certificate.find({ student: studentId })
    .sort({ issuedAt: -1 })
    .populate('module', 'name code');
}
