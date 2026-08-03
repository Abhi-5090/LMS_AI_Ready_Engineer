import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './baseSchema.js';

/**
 * One completion-certificate template per module (uploaded by an admin). When a
 * student passes the module's final, their certificate is rendered from this
 * template with their name drawn on it. Supports PDF or image (PNG/JPG) files.
 */
const certificateTemplateSchema = new Schema(
  {
    module: { type: Schema.Types.ObjectId, ref: 'Module', required: true, index: true },
    fileUrl: { type: String, required: true }, // GridFS URL (/uploads/<name>)
    fileName: { type: String },
    mimeType: { type: String, required: true }, // application/pdf | image/png | image/jpeg
    // Where the student's name is drawn: centered on this point — nameXPercent from
    // the LEFT (50 = horizontally centered), nameYPercent from the TOP — sized as
    // fontScale % of the page/image height.
    nameXPercent: { type: Number, default: 50, min: 0, max: 100 },
    nameYPercent: { type: Number, default: 55, min: 0, max: 100 },
    fontScale: { type: Number, default: 6, min: 1, max: 20 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  baseSchemaOptions,
);

// One template per module.
certificateTemplateSchema.index({ module: 1 }, { unique: true });

export const CertificateTemplate = mongoose.model('CertificateTemplate', certificateTemplateSchema);
