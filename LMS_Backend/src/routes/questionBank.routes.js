import { Router } from 'express';
import { UserRole } from '#shared';
import * as qb from '../controllers/questionBank.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate);

// The question bank is staff-only — students never read or write it.
const adminOrTrainer = requireRole(UserRole.ADMIN, UserRole.TRAINER);
router.use(adminOrTrainer);

router.get('/', validate({ query: qb.listBankQuery }), asyncHandler(qb.listBankItems));
// Upload batches (cards) + the read-only duplicates report — literal paths declared
// before "/:itemId" so they win the match.
router.get('/uploads', validate({ query: qb.moduleQueryReq }), asyncHandler(qb.listUploadBatches));
router.delete('/uploads/:batchId', validate({ params: qb.batchParam }), asyncHandler(qb.deleteUploadBatch));
router.get('/duplicates', validate({ query: qb.moduleQueryReq }), asyncHandler(qb.listDuplicates));
router.post('/', validate({ body: qb.createBankItemSchema }), asyncHandler(qb.createBankItem));
router.post('/bulk', validate({ body: qb.bulkBankSchema }), asyncHandler(qb.bulkAddBankItems));
// Super admin only (enforced in the handler): copy master-bank questions into the
// org they're currently drilled into.
router.post('/import-from-template', validate({ body: qb.importFromTemplateSchema }), asyncHandler(qb.importFromTemplate));
router.patch('/:itemId', validate({ params: qb.bankItemParam, body: qb.updateBankItemSchema }), asyncHandler(qb.updateBankItem));
router.delete('/:itemId', validate({ params: qb.bankItemParam }), asyncHandler(qb.deleteBankItem));

export default router;
