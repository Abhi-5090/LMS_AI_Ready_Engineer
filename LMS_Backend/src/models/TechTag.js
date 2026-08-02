import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './baseSchema.js';

/**
 * A custom tech-stack tag a student added via "Other" when submitting a project.
 * It joins the suggestion list only after a trainer/admin approves it. The
 * predefined tags live in shared/constants (TECH_STACK) and are always available.
 */
const techTagSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }, // display name as typed
    key: { type: String, required: true }, // lowercased, for dedup
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  baseSchemaOptions,
);

// One tag per (org, key).
techTagSchema.index({ organization: 1, key: 1 }, { unique: true });

export const TechTag = mongoose.model('TechTag', techTagSchema);
