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

/** Canonical order for grouping a test's questions by type. */
const TYPE_ORDER = [QuestionType.MCQ, QuestionType.SCENARIO, QuestionType.PROMPT_WRITING, QuestionType.CODING];

/**
 * Group a test's questions by type (Multiple Choice → Scenario Based → Prompt
 * Writing → Repo Evaluation), keeping order within each type and numbering
 * continuously across the whole test. Returns [{ type, label, items:[{q,number}] }].
 */
export function groupQuestionsByType(questions = []) {
  const rank = (t) => { const i = TYPE_ORDER.indexOf(t); return i === -1 ? TYPE_ORDER.length : i; };
  const ordered = questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => rank(a.q.type) - rank(b.q.type) || a.i - b.i)
    .map(({ q }, idx) => ({ q, number: idx + 1 }));
  const groups = [];
  for (const item of ordered) {
    const last = groups[groups.length - 1];
    if (last && last.type === item.q.type) last.items.push(item);
    else groups.push({ type: item.q.type, label: QUESTION_TYPE_LABEL[item.q.type] ?? 'Questions', items: [item] });
  }
  return groups;
}

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
