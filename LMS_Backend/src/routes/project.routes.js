import { Router } from 'express';
import { UserRole } from '#shared';
import * as proj from '../controllers/project.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate);

const studentOnly = requireRole(UserRole.STUDENT);
const reviewer = requireRole(UserRole.ADMIN, UserRole.TRAINER);

// Reviewer (trainer/admin) — list submissions + approve/reject.
router.get('/review', reviewer, asyncHandler(proj.listForReview));
router.patch('/:id/review', reviewer, validate({ params: proj.projectIdParam, body: proj.reviewSchema }), asyncHandler(proj.review));

// Student — their own projects.
router.get('/', studentOnly, asyncHandler(proj.listMine));
// Multer parses the multipart images first, then the handler validates fields.
router.post('/', studentOnly, proj.uploadProjectDoc, asyncHandler(proj.create));
router.delete('/:id', studentOnly, validate({ params: proj.projectIdParam }), asyncHandler(proj.remove));

export default router;
