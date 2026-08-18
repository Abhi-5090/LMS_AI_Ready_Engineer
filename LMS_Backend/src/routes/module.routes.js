import { Router } from 'express';
import { UserRole } from '#shared';
import * as modules from '../controllers/module.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

router.use(authenticate);

const adminOnly = requireRole(UserRole.ADMIN);
const adminOrTrainer = requireRole(UserRole.ADMIN, UserRole.TRAINER);

// ── Reading (all roles; controller filters by role) ──────────────────────────
router.get('/', asyncHandler(modules.listModules));

// Admin bulk reorder (declared before "/:id" routes — distinct method/path anyway).
router.post(
  '/reorder',
  adminOnly,
  validate({ body: modules.reorderSchema }),
  asyncHandler(modules.reorderModules),
);

// Super admin (handler-enforced): review + decide org admins' master-syllabus
// requests. Declared before "/:id" so the literal path wins.
router.get('/master-syllabus-requests', adminOnly, asyncHandler(modules.listSyllabusRequests));
router.post('/master-syllabus-requests/approve-all', adminOnly, validate({ body: modules.approveAllSchema }), asyncHandler(modules.approveAllSyllabusRequests));
router.patch('/master-syllabus-requests/:reqId', adminOnly, validate({ params: modules.requestIdParam, body: modules.decideRequestSchema }), asyncHandler(modules.decideSyllabusRequest));

router.get('/:id', validate({ params: modules.moduleKeyParam }), asyncHandler(modules.getModule));
// Super admin only (enforced in the handler): preview, then copy, the master
// syllabus onto this org's module. adminOnly lets a drilled-in super admin through.
router.get('/:id/master-syllabus-preview', adminOnly, validate({ params: modules.moduleIdParam }), asyncHandler(modules.getMasterSyllabusPreview));
router.post('/:id/import-syllabus', adminOnly, validate({ params: modules.moduleIdParam }), asyncHandler(modules.importSyllabusFromTemplate));
// Org admin: request the master syllabus for this module (super admin approves it).
router.post('/:id/master-syllabus-request', adminOnly, validate({ params: modules.moduleIdParam, body: modules.syllabusRequestSchema }), asyncHandler(modules.requestMasterSyllabus));

// ── Admin CRUD ────────────────────────────────────────────────────────────────
router.post('/', adminOnly, validate({ body: modules.createModuleSchema }), asyncHandler(modules.createModule));
router.patch(
  '/:id',
  adminOnly,
  validate({ params: modules.moduleIdParam, body: modules.updateModuleSchema }),
  asyncHandler(modules.updateModule),
);
router.delete(
  '/:id',
  adminOnly,
  validate({ params: modules.moduleIdParam }),
  asyncHandler(modules.archiveModule),
);
// Permanent delete (guarded — refused if the module is still referenced anywhere).
router.delete(
  '/:id/permanent',
  adminOnly,
  validate({ params: modules.moduleIdParam }),
  asyncHandler(modules.deleteModulePermanent),
);

// ── Trainer assignment (admin) ────────────────────────────────────────────────
router.post(
  '/:id/trainers',
  adminOnly,
  validate({ params: modules.moduleIdParam, body: modules.assignTrainerSchema }),
  asyncHandler(modules.assignTrainer),
);
router.delete(
  '/:id/trainers/:trainerId',
  adminOnly,
  validate({ params: modules.trainerParam }),
  asyncHandler(modules.removeTrainer),
);

// ── Syllabus: topics & objectives (admin OR the assigned trainer) ─────────────
router.post(
  '/:id/topics',
  adminOrTrainer,
  validate({ params: modules.moduleIdParam, body: modules.topicSchema }),
  asyncHandler(modules.addTopic),
);
router.patch(
  '/:id/topics/:topicId',
  adminOrTrainer,
  validate({ params: modules.topicParam, body: modules.updateTopicSchema }),
  asyncHandler(modules.updateTopic),
);
router.delete(
  '/:id/topics/:topicId',
  adminOrTrainer,
  validate({ params: modules.topicParam }),
  asyncHandler(modules.deleteTopic),
);
router.patch(
  '/:id/topics/:topicId/completion',
  adminOrTrainer,
  validate({ params: modules.topicParam, body: modules.updateTopicSchema }),
  asyncHandler(modules.setTopicCompletion),
);
router.patch(
  '/:id/objectives',
  adminOrTrainer,
  validate({ params: modules.moduleIdParam, body: modules.objectivesSchema }),
  asyncHandler(modules.updateObjectives),
);
// Bulk syllabus import from an uploaded spreadsheet (topics + subtopics).
router.post(
  '/:id/syllabus/import',
  adminOrTrainer,
  validate({ params: modules.moduleIdParam, body: modules.importSyllabusSchema }),
  asyncHandler(modules.importSyllabus),
);

export default router;
