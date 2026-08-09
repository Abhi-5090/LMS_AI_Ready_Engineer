import { adminOverview, batchOverview, studentOverview, trainerOverview } from '../services/analytics.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';

export async function getAdminAnalytics(_req, res) {
  ok(res, await adminOverview());
}

/** Analytics for a single batch (attendance, module progress, assessments, at-risk). */
export async function getBatchAnalytics(req, res) {
  const data = await batchOverview(req.params.batchId);
  if (!data) throw ApiError.notFound('Batch not found');
  ok(res, data);
}

export async function getTrainerAnalytics(req, res) {
  ok(res, await trainerOverview(req.auth.userId));
}

export async function getStudentAnalytics(req, res) {
  ok(res, await studentOverview(req.auth.userId));
}
