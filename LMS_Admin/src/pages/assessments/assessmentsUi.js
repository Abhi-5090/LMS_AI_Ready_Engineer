import { AssessmentType, ProctoringMode, QuestionType } from '@/shared';

/** Invigilation modes shown in the "Proctoring" select when authoring a test. */
// How many proctoring violations a student may accrue before the exam auto-submits.
export const VIOLATION_OPTIONS = [
  { value: '0', label: 'No limit (warn only)' },
  { value: '1', label: '1 violation' },
  { value: '2', label: '2 violations' },
  { value: '3', label: '3 violations' },
  { value: '5', label: '5 violations' },
  { value: '10', label: '10 violations' },
];

export const PROCTORING_OPTIONS = [
  { value: ProctoringMode.NONE, label: 'No proctoring — open browser' },
  { value: ProctoringMode.APP, label: 'Built-in full-screen (camera + lockdown)' },
  { value: ProctoringMode.SEB, label: 'Safe Exam Browser (SEB)' },
];
export const PROCTORING_LABEL = {
  [ProctoringMode.NONE]: 'No proctoring',
  [ProctoringMode.APP]: 'Full-screen proctored',
  [ProctoringMode.SEB]: 'Safe Exam Browser',
};
export const PROCTORING_TONE = {
  [ProctoringMode.NONE]: 'neutral',
  [ProctoringMode.APP]: 'primary',
  [ProctoringMode.SEB]: 'warning',
};

export function assessmentLabel(a) {
  // The trainer's own test name; the category (practice/prep/final) is shown
  // separately as a badge.
  return a.topicTitle ? `${a.title} · ${a.topicTitle}` : a.title;
}

export const ASSESSMENT_TYPE_LABEL = {
  [AssessmentType.PRACTICE]: 'Practice',
  [AssessmentType.PREPARATION]: 'Preparation',
  [AssessmentType.FINAL]: 'Final',
};

export const ASSESSMENT_TYPE_TONE = {
  [AssessmentType.PRACTICE]: 'primary',
  [AssessmentType.PREPARATION]: 'warning',
  [AssessmentType.FINAL]: 'error',
};

export const QUESTION_TYPE_LABEL = {
  [QuestionType.MCQ]: 'Multiple Choice',
  [QuestionType.SCENARIO]: 'Scenario Based',
  [QuestionType.PROMPT_WRITING]: 'Prompt Writing',
  // Enum value stays `coding`; the student answers with a GitHub repo URL that the
  // AI evaluation engine clones and reviews. "Repo Evaluation" is the accurate name.
  [QuestionType.CODING]: 'Repo Evaluation',
};

/** Short codes used in compact chips/strips. */
export const QUESTION_TYPE_SHORT = {
  [QuestionType.MCQ]: 'MCQ',
  [QuestionType.SCENARIO]: 'SB',
  [QuestionType.PROMPT_WRITING]: 'PW',
  [QuestionType.CODING]: 'RE',
};

export const QUESTION_TYPE_OPTIONS = Object.values(QuestionType).map((v) => ({
  value: v,
  label: QUESTION_TYPE_LABEL[v],
}));

/** Only MCQ is auto-graded today; others await the AI evaluation engine. */
export function isAutoGraded(type) {
  return type === QuestionType.MCQ;
}

export function submissionBadge(sub) {
  if (!sub) return { tone: 'neutral', label: 'Not started' };
  if (sub.status === 'graded') {
    return sub.passed
      ? { tone: 'success', label: `Passed · ${sub.score}%` }
      : { tone: 'error', label: `Failed · ${sub.score}%` };
  }
  if (sub.status === 'submitted') return { tone: 'warning', label: 'Submitted · pending review' };
  return { tone: 'neutral', label: 'In progress' };
}
