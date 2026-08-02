import mongoose, { Schema } from 'mongoose';
import { ProjectStatus } from '#shared';
import { baseSchemaOptions } from './baseSchema.js';

/**
 * A student-submitted portfolio project. Requires trainer/admin approval before
 * it counts/shows on the student's profile. Mirrors the ExternalCertificate
 * approval workflow (status + reviewedBy/At/note).
 */
const projectSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    repoUrl: { type: String, required: true },
    documentUrl: { type: String }, // a single project PDF under /api/uploads
    videoUrl: { type: String }, // optional YouTube (or other) demo link
    role: { type: String, trim: true }, // the student's role in the project
    techStack: { type: [String], default: [] }, // tech tags used in the project
    images: { type: [String], default: [] }, // legacy screenshot URLs (older projects)
    status: {
      type: String,
      enum: Object.values(ProjectStatus),
      default: ProjectStatus.PENDING,
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    note: { type: String, trim: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  baseSchemaOptions,
);

export const Project = mongoose.model('Project', projectSchema);
