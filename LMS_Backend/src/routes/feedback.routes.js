import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '#shared';
import * as feedback from '../controllers/feedback.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate);

const overviewQuery = z.object({
  // A 24-char ObjectId to scope to one trainer, or "all"/omitted for the institution.
  trainer: z.union([z.string().length(24), z.literal('all')]).optional(),
});

router.get(
  '/',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  validate({ query: overviewQuery }),
  asyncHandler(feedback.getFeedbackOverview),
);

export default router;
