import { Router } from 'express';
import { UserRole } from '#shared';
import * as a from '../controllers/assessment.controller.js';
import * as sub from '../controllers/submission.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate);

const adminOnly = requireRole(UserRole.ADMIN);
const adminOrTrainer = requireRole(UserRole.ADMIN, UserRole.TRAINER);
const studentOnly = requireRole(UserRole.STUDENT);

// Listing / reading (role-aware in the controller).
router.get('/', validate({ query: a.listAssessmentsQuery }), asyncHandler(a.listAssessments));
router.get('/:id', validate({ params: a.assessmentIdParam }), asyncHandler(a.getAssessment));

// Ready-made test authoring — ADMIN ONLY (creates templates; edits their questions).
router.post('/', adminOnly, validate({ body: a.createAssessmentSchema }), asyncHandler(a.createAssessment));
router.post('/:id/questions/from-bank', adminOnly, validate({ params: a.assessmentIdParam, body: a.fromBankSchema }), asyncHandler(a.addQuestionsFromBank));
router.delete('/:id/questions/:questionId', adminOnly, validate({ params: a.questionParam }), asyncHandler(a.deleteQuestion));

// A trainer assigns a ready-made template to their batch (clones it into a live test).
router.post('/:id/assign', adminOrTrainer, validate({ params: a.assessmentIdParam, body: a.assignTemplateSchema }), asyncHandler(a.assignTemplate));

// Managing a test (template: admin only; assigned instance: admin or its trainer).
router.patch('/:id', adminOrTrainer, validate({ params: a.assessmentIdParam, body: a.updateAssessmentSchema }), asyncHandler(a.updateAssessment));
router.delete('/:id', adminOrTrainer, validate({ params: a.assessmentIdParam }), asyncHandler(a.deleteAssessment));
router.post('/:id/unlock', adminOrTrainer, validate({ params: a.assessmentIdParam, body: a.unlockSchema }), asyncHandler(a.unlockAssessment));
router.post('/:id/lock', adminOrTrainer, validate({ params: a.assessmentIdParam }), asyncHandler(a.lockAssessment));

// Restrict an assigned test to specific students within its batch (chips / Excel of emails).
router.patch('/:id/allowed-students', adminOrTrainer, validate({ params: a.assessmentIdParam, body: a.setAllowedStudentsSchema }), asyncHandler(a.setAllowedStudents));

// Timed/proctored attempts.
router.post('/:id/start', studentOnly, validate({ params: sub.assessmentIdParam }), asyncHandler(sub.startAttempt));
router.patch('/:id/progress', studentOnly, validate({ params: sub.assessmentIdParam, body: sub.progressSchema }), asyncHandler(sub.saveProgress));
router.post('/:id/disqualify', studentOnly, validate({ params: sub.assessmentIdParam, body: sub.disqualifySchema }), asyncHandler(sub.disqualifyAttempt));
router.post('/:id/proctor-shot', studentOnly, validate({ params: sub.assessmentIdParam }), sub.uploadProctorShot, asyncHandler(sub.proctorShot));
router.post('/:id/warning', studentOnly, validate({ params: sub.assessmentIdParam, body: sub.warningSchema }), asyncHandler(sub.recordWarning));

// Submissions.
router.post('/:id/submit', studentOnly, validate({ params: sub.assessmentIdParam, body: sub.submitSchema }), asyncHandler(sub.submit));
router.get('/:id/submission', studentOnly, validate({ params: sub.assessmentIdParam }), asyncHandler(sub.getMySubmission));
router.get('/:id/submissions', adminOrTrainer, validate({ params: sub.assessmentIdParam }), asyncHandler(sub.listSubmissions));
router.get('/:id/submissions.csv', adminOrTrainer, validate({ params: sub.assessmentIdParam }), asyncHandler(sub.exportSubmissionsCsv));
router.get('/:id/leaderboard', validate({ params: sub.assessmentIdParam }), asyncHandler(sub.leaderboard));
router.post('/:id/submissions/:submissionId/regrade', adminOrTrainer, validate({ params: sub.submissionParam }), asyncHandler(sub.regradeSubmission));
// Reopen a student's test for another attempt (archives the current one).
router.post('/:id/submissions/:submissionId/reattempt', adminOrTrainer, validate({ params: sub.submissionParam }), asyncHandler(sub.grantReattempt));

export default router;
