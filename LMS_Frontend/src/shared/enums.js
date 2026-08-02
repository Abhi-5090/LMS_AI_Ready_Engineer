/**
 * Canonical enums shared across backend, frontend, and the AI engine.
 * These are the single source of truth — never redefine these strings inline.
 */

export const UserRole = {
  SUPER_ADMIN: 'super_admin',
  STUDENT: 'student',
  TRAINER: 'trainer',
  ADMIN: 'admin',
};

export const UserStatus = {
  PENDING: 'pending', // awaiting admin approval (self-registration)
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
};

/** Manual attendance states a trainer can record after a class. */
export const AttendanceStatus = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EXCUSED: 'excused',
};

/** Where a class is hosted. */
export const MeetingProvider = {
  INTERNAL: 'internal',
  ZOOM: 'zoom',
  GOOGLE_MEET: 'google_meet',
  MS_TEAMS: 'ms_teams',
  OFFLINE: 'offline',
  OTHER: 'other',
};

export const ClassStatus = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/**
 * Assessment kind. Practice tests (up to 5/module, optionally topic-scoped) let
 * students rehearse; preparation tests (2/module, whole-module) are issued by the
 * trainer and MUST both be attempted before the final, which gates the module.
 * Every test's questions are sourced from the module's question bank.
 */
export const AssessmentType = {
  PRACTICE: 'practice',
  PREPARATION: 'preparation',
  FINAL: 'final',
};

/** Question formats supported by the assessment engine. */
export const QuestionType = {
  MCQ: 'mcq',
  SCENARIO: 'scenario',
  PROMPT_WRITING: 'prompt_writing',
  CODING: 'coding',
};

/** Difficulty tag on a question-bank item (used for filtering & import). */
export const QuestionComplexity = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
};

/** Locked until the trainer opens it after finishing the matching syllabus section. */
export const AssessmentAvailability = {
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
};

/**
 * How a test is invigilated. Chosen per assessment by the trainer/admin.
 *  - NONE: plain open-browser quiz (no timer lockdown).
 *  - APP:  built-in full-screen proctoring (webcam snapshots, blocked shortcuts, warnings).
 *  - SEB:  Safe Exam Browser kiosk lockdown, verified via the global Config Key.
 * APP and SEB both run the timed, windowed exam flow.
 */
export const ProctoringMode = {
  NONE: 'none',
  APP: 'app',
  SEB: 'seb',
};

export const SubmissionStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  EVALUATING: 'evaluating',
  GRADED: 'graded',
};

/** A student's standing on a single module within their learning path. */
export const ModuleProgressStatus = {
  LOCKED: 'locked',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

export const ResourceType = {
  VIDEO: 'video',
  ARTICLE: 'article',
  DOCUMENT: 'document',
  PRESENTATION: 'presentation',
  LINK: 'link',
  ASSIGNMENT: 'assignment',
};

export const SkillLevel = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert',
};

/** Student doubt / Q&A thread status. */
export const DoubtStatus = {
  OPEN: 'open',
  ANSWERED: 'answered',
  CLOSED: 'closed',
};

/** Approval state for a student-uploaded external certificate. */
export const ExternalCertStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

/** Approval state for a student-submitted profile project. */
export const ProjectStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const ThemeName = {
  GREEN: 'green',
  ORANGE: 'orange',
};

export const ThemeMode = {
  LIGHT: 'light',
  DARK: 'dark',
};
