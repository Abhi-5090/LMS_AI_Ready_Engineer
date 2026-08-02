import { z } from 'zod';
import { TechTag } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';

export const tagIdParam = z.object({ id: z.string().length(24) });
export const reviewTagSchema = z.object({ decision: z.enum(['approve', 'reject']) });

/** Any signed-in user: approved custom tags (the client merges these with the
 *  predefined TECH_STACK list for the project tag picker). */
export async function listApprovedTags(_req, res) {
  const tags = await TechTag.find({ status: 'approved' }).select('name').sort({ name: 1 });
  ok(res, tags.map((t) => t.name));
}

/** Admin/trainer: custom tags awaiting approval. */
export async function listPendingTags(_req, res) {
  const tags = await TechTag.find({ status: 'pending' }).sort({ createdAt: -1 }).populate('createdBy', 'name');
  ok(res, tags.map((t) => t.toJSON()));
}

/** Admin/trainer: approve (adds it to the list) or reject a custom tag. */
export async function reviewTag(req, res) {
  const tag = await TechTag.findById(req.params.id);
  if (!tag) throw ApiError.notFound('Tag not found');
  tag.status = req.body.decision === 'approve' ? 'approved' : 'rejected';
  tag.reviewedBy = req.auth.userId;
  await tag.save();
  ok(res, tag.toJSON());
}
