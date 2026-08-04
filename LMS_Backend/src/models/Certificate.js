import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './baseSchema.js';

const certificateSchema = new Schema(
  {
    certificateId: { type: String, required: true, unique: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    module: { type: Schema.Types.ObjectId, ref: 'Module' },
    // The student's batch at issue-time and the per-(batch, module) serial baked
    // into `certificateId` — kept for traceability / auditing.
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
    seq: { type: Number, default: null },
    isProgramCertificate: { type: Boolean, default: false },
    issuedAt: { type: Date, default: () => new Date() },
    verifyUrl: { type: String, required: true },
    qrDataUrl: String,
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  baseSchemaOptions,
);

// One certificate per (student, module, kind). Program certs have module=null,
// so this also caps program certificates at one per student. Makes the
// check-then-create issuance race-safe at the DB level (concurrent calls — e.g.
// submit-time issuance racing the certificates page — collide here instead of
// inserting duplicates).
certificateSchema.index({ student: 1, module: 1, isProgramCertificate: 1 }, { unique: true });

export const Certificate = mongoose.model('Certificate', certificateSchema);
