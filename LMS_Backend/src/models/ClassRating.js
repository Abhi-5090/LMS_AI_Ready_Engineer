import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './baseSchema.js';

const score = { type: Number, min: 1, max: 5 };

/**
 * A student's feedback for a class they attended, directed at the trainer who
 * took it. Captures a per-parameter breakdown (subject knowledge, clarity,
 * engagement, pace, doubt handling — each 1–5), a separate Overall `rating`,
 * and — when the overall is low — improvement `keywords` and a free-text
 * `comment`. One rating per (class, student). Eligibility (attended ≥¾ of the
 * class) is enforced before this is created.
 */
const classRatingSchema = new Schema(
  {
    classSession: { type: Schema.Types.ObjectId, ref: 'ClassSchedule', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trainer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Overall performance (the headline score).
    rating: { type: Number, required: true, min: 1, max: 5 },
    // Individual-performance breakdown. Optional so older ratings (overall-only)
    // stay valid; the current UI always sends all five.
    parameters: {
      subjectKnowledge: score,
      clarity: score,
      engagement: score,
      pace: score,
      doubtHandling: score,
    },
    keywords: { type: [String], default: [] },
    comment: { type: String, trim: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  baseSchemaOptions,
);

classRatingSchema.index({ classSession: 1, student: 1 }, { unique: true });

export const ClassRating = mongoose.model('ClassRating', classRatingSchema);
