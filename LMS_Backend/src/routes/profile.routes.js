import { Router } from 'express';
import { UserRole } from '#shared';
import * as profile from '../controllers/profile.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate); // any signed-in user manages their own profile

router.patch('/', validate({ body: profile.updateProfileSchema }), asyncHandler(profile.updateMe));
// GDPR: download a portable copy of my own data.
router.get('/export', asyncHandler(profile.exportMe));
// Multer parses the multipart image first, then the handler stores the URL.
router.post('/avatar', profile.uploadAvatarFile, asyncHandler(profile.setAvatar));
router.delete('/avatar', asyncHandler(profile.removeAvatar));
router.post('/cover', profile.uploadCoverFile, asyncHandler(profile.setCover));
router.delete('/cover', asyncHandler(profile.removeCover));
router.post('/resume', profile.uploadResumeFile, asyncHandler(profile.setResume));
// Trainer scoreboard (classes conducted, doubts cleared, ratings).
router.get('/trainer-stats', requireRole(UserRole.TRAINER), asyncHandler(profile.trainerStats));

export default router;
