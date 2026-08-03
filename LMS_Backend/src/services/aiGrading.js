import { createEvaluator } from '../ai-engine/index.js';
import { QuestionType, SubmissionStatus } from '#shared';
import { Assessment, Submission, getStoredAiApiKey } from '../models/index.js';
import { readFileBuffer } from './fileStore.js';
import { env } from '../config/env.js';

const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024; // Anthropic image block ceiling
const MAX_PDF_BYTES = 20 * 1024 * 1024;

/**
 * Turn a prompt-writing question's attached stimulus into the shape evaluatePrompt
 * expects: image/PDF as base64, documents as extracted text. Returns null when there
 * is no media, the file is missing, or it's too large to send — grading then falls
 * back to text-only (task + rubric). Never throws.
 */
async function prepareMedia(q) {
  if (!q.mediaUrl || !q.mediaType) return null;
  try {
    const buf = await readFileBuffer(q.mediaUrl);
    const name = (q.mediaName || q.mediaUrl).toLowerCase();
    if (q.mediaType === 'image') {
      if (buf.length > MAX_IMAGE_BYTES) return null;
      const ext = name.split('.').pop();
      return { kind: 'image', mimeType: IMAGE_MIME[ext] || 'image/png', data: buf.toString('base64') };
    }
    if (q.mediaType === 'pdf') {
      if (buf.length > MAX_PDF_BYTES) return null;
      return { kind: 'pdf', data: buf.toString('base64') };
    }
    // document → extract text (docx via mammoth; txt/md read directly)
    if (name.endsWith('.docx') || name.endsWith('.doc')) {
      const m = await import('mammoth');
      const mammoth = m.default || m;
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { kind: 'text', text: (value || '').slice(0, 20000) };
    }
    return { kind: 'text', text: buf.toString('utf8').slice(0, 20000) };
  } catch {
    return null;
  }
}

let _evaluator = null;
let _evaluatorKey = null; // the key the cached evaluator was built with

/** The active Claude key — env var takes precedence over the admin-stored key. */
async function resolveApiKey() {
  return env.anthropicApiKey || (await getStoredAiApiKey());
}

/**
 * Build (or reuse) the Claude-backed evaluator from the active key. Returns null
 * if no key is configured. Rebuilds automatically when the admin changes the key.
 */
export async function getEvaluator() {
  const key = await resolveApiKey();
  if (!key) {
    _evaluator = null;
    _evaluatorKey = null;
    return null;
  }
  if (key !== _evaluatorKey) {
    _evaluator = createEvaluator({ apiKey: key, githubToken: env.githubToken });
    _evaluatorKey = key;
  }
  return _evaluator;
}

/** Source of the active key, for admin diagnostics (never returns the key itself). */
export async function aiKeySource() {
  if (env.anthropicApiKey) return 'environment';
  if (await getStoredAiApiKey()) return 'settings';
  return 'none';
}

/** True when at least one question needs AI grading (prompt/scenario/coding). */
export function needsAiGrading(assessment) {
  return assessment.questions.some((q) => q.type !== QuestionType.MCQ);
}

/**
 * Grade a submission across all question types and persist the result.
 * MCQ is graded deterministically; prompt/scenario/coding via the evaluator.
 * Final score is points-weighted across every question. Mutates + saves the doc.
 *
 * @param assessment  Assessment document
 * @param submission  Submission document (will be saved)
 * @param evaluator   AI evaluator — omit to use the configured one; inject for tests.
 *                    Pass `null` explicitly to force MCQ-only grading.
 */
export async function gradeSubmission(assessment, submission, evaluator = undefined) {
  if (evaluator === undefined) evaluator = await getEvaluator();
  const answers = new Map(submission.answers.map((a) => [a.question.toString(), a]));
  let totalPoints = 0;
  let earnedPoints = 0;
  const perQuestion = {};
  const summaries = [];
  const suggestions = [];

  for (const q of assessment.questions) {
    const points = q.points || 1;
    totalPoints += points;
    const answer = answers.get(q._id.toString());
    let fraction = 0; // 0..1 of this question's points

    if (q.type === QuestionType.MCQ) {
      fraction = answer && answer.selectedOption === q.correctOption ? 1 : 0;
    } else if (!answer || !answer.text || !answer.text.trim()) {
      fraction = 0;
      summaries.push(`Q (${q.type}): no answer submitted.`);
    } else if (!evaluator) {
      // No evaluator available — leave for manual review (handled by caller).
      throw new Error('AI evaluator not configured');
    } else {
      try {
        const reference = q.referenceAnswer || '';
        let result;
        if (q.type === QuestionType.CODING) {
          result = await evaluator.evaluateProject({
            repoUrl: answer.text.trim(),
            requirements: q.prompt,
            reference,
            passingScore: assessment.passingScore,
          });
        } else if (q.type === QuestionType.SCENARIO) {
          result = await evaluator.evaluateScenario({
            question: q.prompt,
            answer: answer.text,
            reference,
            passingScore: assessment.passingScore,
          });
        } else {
          // PROMPT_WRITING — feed the same stimulus the student saw (if any).
          const media = await prepareMedia(q);
          result = await evaluator.evaluatePrompt({
            task: q.prompt,
            prompt: answer.text,
            reference,
            media,
            passingScore: assessment.passingScore,
          });
        }
        fraction = (Number(result.score) || 0) / 100;
        if (result.summary) summaries.push(result.summary);
        if (Array.isArray(result.suggestions)) suggestions.push(...result.suggestions);
      } catch (err) {
        fraction = 0;
        summaries.push(`Could not evaluate one ${q.type} question: ${err.message}`);
      }
    }

    perQuestion[`Q${q._id.toString().slice(-4)}`] = Math.round(fraction * 100);
    earnedPoints += fraction * points;
  }

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = score >= assessment.passingScore;

  submission.score = score;
  submission.passed = passed;
  submission.status = SubmissionStatus.GRADED;
  submission.feedback = {
    score,
    passed,
    summary: summaries.join(' ') || 'Graded.',
    suggestions: suggestions.slice(0, 12),
    breakdown: perQuestion,
  };
  await submission.save();
  return submission;
}

/**
 * Background grading entry point used by the submit handler. Loads the docs,
 * grades, and on failure flips the submission back to SUBMITTED (pending review)
 * so it isn't stuck in EVALUATING forever. Never throws.
 */
export async function gradeInBackground(assessmentId, submissionId) {
  try {
    const [assessment, submission] = await Promise.all([
      Assessment.findById(assessmentId),
      Submission.findById(submissionId),
    ]);
    if (!assessment || !submission) return;
    await gradeSubmission(assessment, submission);
    // A passed final may complete a module → issue any earned certificates.
    const { issueEligibleCertificates } = await import('./certificates.js');
    await issueEligibleCertificates(submission.student).catch(() => {});
    const { notify } = await import('./notify.js');
    await notify(submission.student, {
      type: 'result',
      title: `Result: ${assessment.title}`,
      body: `Your submission was graded — ${submission.score}% (${submission.passed ? 'Passed' : 'Not passed'}).`,
      link: `/app/assessments/${assessment._id}`,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[aiGrading] background grading failed:', err.message);
    await Submission.findByIdAndUpdate(submissionId, {
      status: SubmissionStatus.SUBMITTED,
    }).catch(() => {});
  }
}
