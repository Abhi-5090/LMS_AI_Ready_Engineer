import { feedbackOverview } from '../services/feedback.js';
import { ok } from '../utils/http.js';

/** Trainer class-feedback dashboard. `?trainer=<id>` scopes to one trainer;
 *  omitted or "all" gives the institution overview. Admin / super-admin only. */
export async function getFeedbackOverview(req, res) {
  const data = await feedbackOverview(req.query.trainer);
  ok(res, data);
}

/** A trainer's own class feedback. Same summary + comments as the admin view,
 *  but the cross-trainer leaderboard is stripped (they only see themselves). */
export async function getMyFeedback(req, res) {
  const { trainers, ...data } = await feedbackOverview(req.auth.userId);
  ok(res, data);
}
