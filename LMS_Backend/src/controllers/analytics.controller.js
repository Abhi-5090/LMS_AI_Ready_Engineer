import { adminOverview, batchOverview, institutionOverview, studentOverview, trainerOverview } from '../services/analytics.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';

export async function getAdminAnalytics(_req, res) {
  ok(res, await adminOverview());
}

/** Analytics for a single batch, or the whole institution when batchId is "all".
 *  Both return the same shape so the client renders one template either way. */
export async function getBatchAnalytics(req, res) {
  const { batchId } = req.params;
  const data = batchId === 'all' ? await institutionOverview() : await batchOverview(batchId);
  if (!data) throw ApiError.notFound('Batch not found');
  ok(res, data);
}

export async function getTrainerAnalytics(req, res) {
  ok(res, await trainerOverview(req.auth.userId));
}

export async function getStudentAnalytics(req, res) {
  ok(res, await studentOverview(req.auth.userId));
}
