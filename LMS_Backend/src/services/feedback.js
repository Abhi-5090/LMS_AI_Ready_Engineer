import mongoose from 'mongoose';
import { FEEDBACK_PARAMETERS, FEEDBACK_KEYWORDS } from '#shared';
import { ClassRating, User } from '../models/index.js';

const round1 = (n) => Math.round(n * 10) / 10;
const PARAM_KEYS = FEEDBACK_PARAMETERS.map((p) => p.key);
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Trainer class-feedback overview.
 *
 * The trainer leaderboard (every rated trainer) is ALWAYS returned so the client
 * can populate the trainer dropdown. `summary` and `comments` are scoped: to a
 * single trainer when `trainerId` is a real id, or the whole institution when it
 * is falsy / "all". Both scopes share one shape so the page renders one template.
 */
export async function feedbackOverview(trainerId) {
  const scoped = Boolean(trainerId) && trainerId !== 'all';
  const match = scoped ? { trainer: toObjectId(trainerId) } : {};

  const [ratings, leaderboardRows, trainerDoc] = await Promise.all([
    ClassRating.find(match)
      .sort({ createdAt: -1 })
      .populate('trainer', 'name email')
      .populate('student', 'name')
      .populate('classSession', 'title date')
      .lean(),
    // Leaderboard across ALL trainers (never scoped) — drives the dropdown too.
    ClassRating.aggregate([
      { $group: { _id: '$trainer', ratings: { $sum: 1 }, avgOverall: { $avg: '$rating' }, belowFive: { $sum: { $cond: [{ $lt: ['$rating', 5] }, 1, 0] } } } },
      { $sort: { avgOverall: -1, ratings: -1 } },
    ]),
    scoped ? User.findById(trainerId).select('name email').lean() : Promise.resolve(null),
  ]);

  // Resolve trainer names for the leaderboard in one query.
  const leaderIds = leaderboardRows.map((r) => r._id).filter(Boolean);
  const leaderUsers = await User.find({ _id: { $in: leaderIds } }).select('name email').lean();
  const nameById = new Map(leaderUsers.map((u) => [String(u._id), u]));
  const trainers = leaderboardRows.map((r) => ({
    id: String(r._id),
    name: nameById.get(String(r._id))?.name ?? 'Unknown',
    ratings: r.ratings,
    avgOverall: round1(r.avgOverall || 0),
    belowFive: r.belowFive,
  }));

  // ── Scoped summary ─────────────────────────────────────────────────────────
  const total = ratings.length;
  const distribution = [0, 0, 0, 0, 0]; // index 0 = 1★ … index 4 = 5★
  const paramSums = Object.fromEntries(PARAM_KEYS.map((k) => [k, { sum: 0, n: 0 }]));
  const keywordCounts = Object.fromEntries(FEEDBACK_KEYWORDS.map((k) => [k, 0]));
  let overallSum = 0;
  let belowFive = 0;

  for (const r of ratings) {
    overallSum += r.rating;
    if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1] += 1;
    if (r.rating < 5) belowFive += 1;
    for (const k of PARAM_KEYS) {
      const v = r.parameters?.[k];
      if (typeof v === 'number') { paramSums[k].sum += v; paramSums[k].n += 1; }
    }
    for (const kw of r.keywords ?? []) {
      if (kw in keywordCounts) keywordCounts[kw] += 1;
    }
  }

  const summary = {
    ratings: total,
    avgOverall: total ? round1(overallSum / total) : 0,
    belowFive,
    distribution,
    parameters: FEEDBACK_PARAMETERS.map((p) => ({
      key: p.key,
      label: p.label,
      avg: paramSums[p.key].n ? round1(paramSums[p.key].sum / paramSums[p.key].n) : 0,
    })),
    keywords: FEEDBACK_KEYWORDS
      .map((label) => ({ label, count: keywordCounts[label] }))
      .sort((a, b) => b.count - a.count),
  };

  // Recent written feedback (only rows that actually said something).
  const comments = ratings
    .filter((r) => (r.comment && r.comment.trim()) || (r.keywords && r.keywords.length))
    .slice(0, 50)
    .map((r) => ({
      id: String(r._id),
      trainer: r.trainer?.name ?? 'Unknown',
      student: r.student?.name ?? 'Student',
      classTitle: r.classSession?.title ?? 'Class',
      date: r.createdAt,
      rating: r.rating,
      comment: r.comment ?? '',
      keywords: r.keywords ?? [],
    }));

  return {
    scope: scoped ? 'trainer' : 'all',
    trainer: scoped ? { id: String(trainerId), name: trainerDoc?.name ?? 'Trainer' } : null,
    summary,
    trainers,
    comments,
  };
}
