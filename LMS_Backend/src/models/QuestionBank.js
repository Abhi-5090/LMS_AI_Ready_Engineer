import mongoose, { Schema } from 'mongoose';
import { QuestionType, QuestionComplexity } from '#shared';
import { baseSchemaOptions } from './baseSchema.js';

/**
 * A single question in a module's question bank. The bank is the ONLY authoring
 * surface for questions — admins/trainers fill it (manually or via Excel), then
 * build practice / preparation / final tests by hand-picking from it. Picked
 * questions are SNAPSHOT into the assessment (so later bank edits never mutate a
 * test that students are already taking). `topic` matches a Module.topics[]._id;
 * null means the question is general / for the whole module.
 */
const questionBankSchema = new Schema(
  {
    module: { type: Schema.Types.ObjectId, ref: 'Module', required: true, index: true },
    topic: { type: Schema.Types.ObjectId, default: null, index: true },
    topicTitle: { type: String, trim: true, default: '' },
    type: { type: String, enum: Object.values(QuestionType), default: QuestionType.MCQ },
    // Difficulty tag (easy / medium / hard) — used to filter and to bulk-import
    // a specific difficulty from the master bank into an organization.
    complexity: { type: String, enum: Object.values(QuestionComplexity), default: QuestionComplexity.MEDIUM, index: true },
    prompt: { type: String, required: true, trim: true },
    options: { type: [String], default: [] },
    correctOption: { type: Number },
    // Model answer / grading rubric for AI-graded questions (scenario / prompt /
    // repo). Anchors the evaluator's scoring; never shown to students. Empty for MCQ.
    referenceAnswer: { type: String, default: '' },
    // Optional media stimulus for a prompt-writing question: the student is SHOWN
    // this (image / PDF / document) and must write a prompt that achieves the goal
    // (the `prompt` field). Unlike referenceAnswer, media IS exposed to students.
    // The AI grader feeds the same stimulus to Claude (image/PDF natively, docs as
    // extracted text) so it grades the prompt against the actual material.
    mediaUrl: { type: String, default: '' },
    mediaType: { type: String, enum: ['', 'image', 'pdf', 'document'], default: '' },
    mediaName: { type: String, default: '' },
    points: { type: Number, default: 1, min: 1, max: 100 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // Groups questions that arrived together (one Excel upload or one master import)
    // so the batch can be reviewed and deleted as a unit. Null = added individually.
    uploadBatch: { type: Schema.Types.ObjectId, default: null, index: true },
    uploadSource: { type: String, trim: true, default: '' }, // e.g. the Excel file name
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  baseSchemaOptions,
);

questionBankSchema.index({ module: 1, topic: 1 });

export const QuestionBankItem = mongoose.model('QuestionBankItem', questionBankSchema);
