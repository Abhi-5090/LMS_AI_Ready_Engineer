import { Router } from 'express';
import { UserRole } from '#shared';
import * as org from '../controllers/organization.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate, requireRole(UserRole.SUPER_ADMIN));

router.get('/', asyncHandler(org.listOrganizations));
router.get('/overview', asyncHandler(org.getOverview)); // before '/:id'
router.get('/question-stats', asyncHandler(org.getQuestionStats)); // before '/:id'
router.get('/template', asyncHandler(org.getTemplate)); // the master-curriculum org
router.post('/', validate({ body: org.createOrgSchema }), asyncHandler(org.createOrganization));
router.get('/:id', validate({ params: org.orgIdParam }), asyncHandler(org.getOrganization));
router.patch('/:id', validate({ params: org.orgIdParam, body: org.updateOrgSchema }), asyncHandler(org.updateOrganization));
router.delete('/:id', validate({ params: org.orgIdParam }), asyncHandler(org.deleteOrganization));

// Admins of an organization.
router.get('/:id/admins', validate({ params: org.orgIdParam }), asyncHandler(org.listOrgAdmins));
router.post('/:id/admins', validate({ params: org.orgIdParam, body: org.createOrgAdminSchema }), asyncHandler(org.createOrgAdmin));

export default router;
