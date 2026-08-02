import mongoose, { Schema } from 'mongoose';
import { UserRole } from '#shared';
import { baseSchemaOptions } from './baseSchema.js';

/**
 * A trainer/admin announcement. Targeted at a batch, a module, or globally
 * (admin only). Students see announcements for their batch / their batch's
 * modules / global ones.
 */
const announcementSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorRole: { type: String, enum: Object.values(UserRole), required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    imageUrl: { type: String }, // optional attached image under /api/uploads
    // Targets: multiple batches, each optionally scoped to specific modules.
    targets: {
      type: [{
        _id: false,
        batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
        modules: [{ type: Schema.Types.ObjectId, ref: 'Module' }],
      }],
      default: [],
    },
    // Legacy single-target fields (kept for older announcements).
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', index: true },
    module: { type: Schema.Types.ObjectId, ref: 'Module', index: true },
    isGlobal: { type: Boolean, default: false, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  baseSchemaOptions,
);

export const Announcement = mongoose.model('Announcement', announcementSchema);
