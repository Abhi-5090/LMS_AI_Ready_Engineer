import { Router } from 'express';
import { UserRole } from '#shared';
import * as tags from '../controllers/techTag.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(tags.listApprovedTags));
router.get('/pending', requireRole(UserRole.ADMIN, UserRole.TRAINER), asyncHandler(tags.listPendingTags));
router.post(
  '/:id/review',
  requireRole(UserRole.ADMIN, UserRole.TRAINER),
  validate({ params: tags.tagIdParam, body: tags.reviewTagSchema }),
  asyncHandler(tags.reviewTag),
);

export default router;
