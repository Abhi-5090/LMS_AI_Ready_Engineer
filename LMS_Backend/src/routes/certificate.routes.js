import { Router } from 'express';
import { UserRole } from '#shared';
import * as certs from '../controllers/certificate.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

// PUBLIC verification (no auth) — declared before the authenticate guard.
router.get(
  '/verify/:certificateId',
  validate({ params: certs.certIdParam }),
  asyncHandler(certs.verifyCertificate),
);

router.use(authenticate);

router.get('/me', requireRole(UserRole.STUDENT), asyncHandler(certs.myCertificates));
router.get('/', requireRole(UserRole.ADMIN), asyncHandler(certs.listAllCertificates));
router.get(
  '/student/:studentId',
  requireRole(UserRole.ADMIN, UserRole.TRAINER),
  validate({ params: certs.studentIdParam }),
  asyncHandler(certs.studentCertificates),
);

// Download a rendered certificate PDF (student's own, or staff for anyone).
router.get(
  '/:certificateId/download',
  validate({ params: certs.certIdParam }),
  asyncHandler(certs.downloadCertificate),
);

// ── Admin: certificate templates, one per module ──────────────────────────────
router.get(
  '/templates/:moduleId',
  requireRole(UserRole.ADMIN),
  validate({ params: certs.moduleIdParam }),
  asyncHandler(certs.getCertificateTemplate),
);
router.get(
  '/templates/:moduleId/preview',
  requireRole(UserRole.ADMIN),
  validate({ params: certs.moduleIdParam }),
  asyncHandler(certs.previewCertificateTemplate),
);
router.put(
  '/templates/:moduleId',
  requireRole(UserRole.ADMIN),
  certs.uploadTemplateFile,
  validate({ params: certs.moduleIdParam }),
  asyncHandler(certs.putCertificateTemplate),
);
router.delete(
  '/templates/:moduleId',
  requireRole(UserRole.ADMIN),
  validate({ params: certs.moduleIdParam }),
  asyncHandler(certs.deleteCertificateTemplate),
);

export default router;
