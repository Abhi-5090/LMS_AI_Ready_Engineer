import mongoose, { Schema } from 'mongoose';
import {
  AssessmentAvailability,
  AssessmentType,
  DEFAULT_PASSING_SCORE,
  ProctoringMode,
  QuestionType,
} from '#shared';
import { baseSchemaOptions, subSchemaOptions } from './baseSchema.js';

const questionSchema = new Schema(
  {
    type: { type: String, enum: Object.values(QuestionType), required: true },
    prompt: { type: String, required: true },
    options: [String],
    correctOption: Number,
    // Trainer-authored model answer / grading rubric for AI-graded questions
    // (scenario / prompt / repo). Fed to the evaluator to anchor its scoring, and
    // NEVER exposed to students. Empty for MCQ.
    referenceAnswer: { type: String, default: '' },
    // Media stimulus for a prompt-writing question (image / PDF / document). Shown
    // to students and fed to the AI grader. Snapshot from the bank item.
    mediaUrl: { type: String, default: '' },
    mediaType: { type: String, default: '' },
    mediaName: { type: String, default: '' },
    points: { type: Number, default: 1 },
    // The question-bank item this was snapshot from (for de-duping re-adds).
    sourceId: { type: Schema.Types.ObjectId },
  },
  subSchemaOptions,
);

const assessmentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    // Admin-authored blurb — typically the topics this test covers. Shown with the
    // test name to trainers + students; copied onto assigned tests.
    description: { type: String, trim: true, default: '' },
    module: { type: Schema.Types.ObjectId, ref: 'Module', required: true, index: true },
    // A "ready-made test" authored by an admin. Templates carry the questions +
    // duration + proctoring but NO batch/schedule — trainers assign them (which
    // clones the template into a real, batch-scoped test). Templates are never
    // visible to students.
    isTemplate: { type: Boolean, default: false, index: true },
    // For an assigned test: the ready-made template it was cloned from.
    sourceTemplate: { type: Schema.Types.ObjectId, ref: 'Assessment', default: null },
    // The batch this assessment is assigned to — only its students can see/take it.
    // Null on templates + legacy assessments (which fall back to module-curriculum).
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    // Optional per-student allow-list WITHIN the batch. Empty = the whole batch may take it.
    allowedStudents: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    type: { type: String, enum: Object.values(AssessmentType), required: true },
    // Optional topic scoping (practice tests can target one module topic);
    // preparation/final cover the whole module so topic stays null.
    topic: { type: Schema.Types.ObjectId, default: null },
    topicTitle: { type: String, trim: true, default: '' },
    // The module topics this test covers (admin-selected, multiple). Titles are
    // denormalized for display. Copied onto assigned tests.
    topics: {
      type: [{ topic: { type: Schema.Types.ObjectId }, title: { type: String, trim: true, default: '' } }],
      default: [],
    },
    availability: {
      type: String,
      enum: Object.values(AssessmentAvailability),
      default: AssessmentAvailability.LOCKED, // locked until a trainer unlocks it
      index: true,
    },
    // Exam window: availableFrom = window opens, deadline = window closes.
    availableFrom: Date,
    deadline: Date,
    // Proctored, timed exam (preparation + final). `durationMinutes` is the per-
    // student time limit once they start; effective end = min(start+duration, deadline).
    // Invigilation mode chosen by the trainer/admin (none / app / seb).
    proctoring: { type: String, enum: Object.values(ProctoringMode), default: ProctoringMode.NONE },
    // Derived from `proctoring` for the exam flow: proctored = mode !== none,
    // requireSeb = mode === seb. Kept in sync on save so existing logic is unchanged.
    proctored: { type: Boolean, default: false },
    durationMinutes: { type: Number, min: 1 },
    requireSeb: { type: Boolean, default: false },
    // Proctoring violation allowance (final/proctored tests). The admin sets how
    // many warnings a student may accrue before the exam auto-submits. 0 = no cap
    // (warnings are still logged, but the exam never auto-ends).
    violationLimit: { type: Number, default: 0, min: 0, max: 50 },
    passingScore: { type: Number, default: DEFAULT_PASSING_SCORE },
    questions: { type: [questionSchema], default: [] },
    unlockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  baseSchemaOptions,
);

// Hot path: progression + gating filter by (module, type) repeatedly.
assessmentSchema.index({ module: 1, type: 1 });

export const Assessment = mongoose.model('Assessment', assessmentSchema);
