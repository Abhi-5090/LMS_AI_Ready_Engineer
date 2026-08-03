import { Router } from 'express';
import { UserRole } from '#shared';
import * as progress from '../controllers/progress.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate);

router.get('/me', requireRole(UserRole.STUDENT), asyncHandler(progress.myProgress));
router.get(
  '/student/:studentId',
  requireRole(UserRole.ADMIN, UserRole.TRAINER),
  validate({ params: progress.studentIdParam }),
  asyncHandler(progress.studentProgress),
);
router.get(
  '/student/:studentId/submissions',
  requireRole(UserRole.ADMIN, UserRole.TRAINER),
  validate({ params: progress.studentIdParam }),
  asyncHandler(progress.studentSubmissions),
);

export default router;
