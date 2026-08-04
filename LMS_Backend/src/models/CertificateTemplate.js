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
    // Where the student's name is drawn. nameXPercent from the LEFT / nameYPercent
    // from the TOP; sized as fontScale % of the page/image height. nameAlign says
    // whether (x) is the text's left edge, centre, or right edge.
    nameXPercent: { type: Number, default: 50, min: 0, max: 100 },
    nameYPercent: { type: Number, default: 55, min: 0, max: 100 },
    fontScale: { type: Number, default: 6, min: 0.5, max: 20 },
    nameFont: { type: String, enum: ['Helvetica', 'Times', 'Courier'], default: 'Helvetica' },
    nameBold: { type: Boolean, default: true },
    nameItalic: { type: Boolean, default: false },
    nameAlign: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
    // Optional certificate-ID text, drawn the same way as the name.
    idEnabled: { type: Boolean, default: false },
    idXPercent: { type: Number, default: 50, min: 0, max: 100 },
    idYPercent: { type: Number, default: 90, min: 0, max: 100 },
    idFontScale: { type: Number, default: 2.2, min: 0.5, max: 20 },
    idFont: { type: String, enum: ['Helvetica', 'Times', 'Courier'], default: 'Helvetica' },
    idBold: { type: Boolean, default: false },
    idItalic: { type: Boolean, default: false },
    idAlign: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  baseSchemaOptions,
);

// One template per module.
certificateTemplateSchema.index({ module: 1 }, { unique: true });

export const CertificateTemplate = mongoose.model('CertificateTemplate', certificateTemplateSchema);
