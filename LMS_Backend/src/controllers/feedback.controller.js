import { feedbackOverview } from '../services/feedback.js';
import { ok } from '../utils/http.js';

/** Trainer class-feedback dashboard. `?trainer=<id>` scopes to one trainer;
 *  omitted or "all" gives the institution overview. Admin / super-admin only. */
export async function getFeedbackOverview(req, res) {
  const data = await feedbackOverview(req.query.trainer);
  ok(res, data);
}
