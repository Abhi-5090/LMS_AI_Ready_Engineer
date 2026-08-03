import Anthropic from '@anthropic-ai/sdk';
import { fetchRepoSnapshot } from './github.js';

/**
 * AI evaluation engines for the AI Ready Engineer LMS, backed by the Claude API.
 *
 * - evaluatePrompt: grades a student's prompt on clarity, completeness, reasoning,
 *   structure, and output quality (each 0–100) → overall /100 + feedback.
 * - evaluateProject: clones a public GitHub repo's source and reviews it against
 *   the assignment requirements → functionality, architecture, code quality,
 *   documentation (each 0–100) → overall /100 + feedback.
 *
 * @typedef {import('#shared').EvaluationResult} EvaluationResult
 */

const MODEL = 'claude-opus-4-8';

const PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clarity: { type: 'integer', description: '0-100: how clear and unambiguous the prompt is' },
    completeness: { type: 'integer', description: '0-100: covers all needed context/constraints' },
    reasoning: { type: 'integer', description: '0-100: elicits/encodes sound reasoning' },
    structure: { type: 'integer', description: '0-100: organization, formatting, role/format cues' },
    outputQuality: { type: 'integer', description: '0-100: likely quality of the resulting output' },
    score: { type: 'integer', description: '0-100 overall weighted score' },
    summary: { type: 'string', description: '2-4 sentence assessment' },
    suggestions: { type: 'array', items: { type: 'string' }, description: '2-5 concrete improvements' },
  },
  required: ['clarity', 'completeness', 'reasoning', 'structure', 'outputQuality', 'score', 'summary', 'suggestions'],
};

const SCENARIO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correctness: { type: 'integer', description: '0-100: is the answer technically correct/accurate' },
    reasoning: { type: 'integer', description: '0-100: quality of justification and decision-making' },
    application: { type: 'integer', description: '0-100: applies the right concepts to the situation' },
    completeness: { type: 'integer', description: '0-100: addresses all parts of the scenario' },
    communication: { type: 'integer', description: '0-100: clarity and structure of the explanation' },
    score: { type: 'integer', description: '0-100 overall weighted score' },
    summary: { type: 'string', description: '2-4 sentence assessment' },
    suggestions: { type: 'array', items: { type: 'string' }, description: '2-5 concrete improvements' },
  },
  required: ['correctness', 'reasoning', 'application', 'completeness', 'communication', 'score', 'summary', 'suggestions'],
};

const PROJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    functionality: { type: 'integer', description: '0-100: does it implement the required behavior' },
    architecture: { type: 'integer', description: '0-100: structure, separation of concerns, design' },
    codeQuality: { type: 'integer', description: '0-100: readability, idioms, error handling, tests' },
    documentation: { type: 'integer', description: '0-100: README, comments, setup clarity' },
    score: { type: 'integer', description: '0-100 overall weighted score' },
    summary: { type: 'string', description: '3-5 sentence review' },
    suggestions: { type: 'array', items: { type: 'string' }, description: '3-6 concrete improvements' },
  },
  required: ['functionality', 'architecture', 'codeQuality', 'documentation', 'score', 'summary', 'suggestions'],
};

const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

function makeRunner(client) {
  return async function run({ system, user, schema, schemaName }) {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      // High effort: grading a student is a correctness-sensitive task where accuracy
      // matters more than latency/cost, so we give the model room to reason.
      output_config: { effort: 'high', format: { type: 'json_schema', name: schemaName, schema } },
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (!text) throw new Error('Empty evaluation response from model');
    return JSON.parse(text);
  };
}

/**
 * @param {{ apiKey: string, githubToken?: string }} opts
 * @returns {{ evaluatePrompt: Function, evaluateScenario: Function, evaluateProject: Function }}
 */
export function createEvaluator(opts = {}) {
  if (!opts.apiKey) throw new Error('createEvaluator requires an Anthropic apiKey');
  const client = new Anthropic({ apiKey: opts.apiKey });
  const run = makeRunner(client);
  const githubToken = opts.githubToken;

  /**
   * Grade a student's prompt. When `media` is provided, the student was shown a
   * stimulus (image / PDF / extracted document text) and had to write a prompt that
   * achieves the goal against it — so we hand Claude the SAME stimulus and ask it to
   * mentally run the prompt on it before scoring.
   * @param {{ task:string, prompt:string, reference?:string, passingScore?:number,
   *   media?: { kind:'image'|'pdf'|'text', mimeType?:string, data?:string, text?:string } | null }} args
   * @returns {Promise<EvaluationResult>}
   */
  async function evaluatePrompt({ task, prompt, reference = '', media = null, passingScore = 70 }) {
    const hasMedia = !!(media && (media.data || media.text));
    const system =
      'You are an expert prompt-engineering examiner for an AI engineering program. ' +
      (hasMedia
        ? 'The student was shown a stimulus (image / PDF / document) and asked to write a prompt that, run against ' +
          'that stimulus, achieves the stated goal. You are given the SAME stimulus. First, mentally execute the ' +
          'student\'s prompt against the stimulus and consider the output it would produce; then judge how well it ' +
          'achieves the goal on THIS specific material — reward prompts that correctly reference and use what is ' +
          'actually in the stimulus, and penalize ones that ignore it or assume things not present. '
        : '') +
      'Grade the student\'s submitted prompt strictly and fairly on five criteria, each 0–100: ' +
      'clarity, completeness, reasoning, structure, and output quality. ' +
      'Then give an overall score 0–100 (a holistic weighting, not a raw average), a concise summary, ' +
      'and specific, actionable suggestions. Be objective; reward precision and penalize vagueness, ' +
      'missing constraints, and prompt-injection-prone phrasing.' +
      (reference
        ? ' A trainer-provided model answer / rubric is included: treat it as the reference for what an ' +
          'excellent answer looks like, but reward any equally-valid approach the student takes.'
        : '');

    let user;
    if (hasMedia) {
      const blocks = [{ type: 'text', text: `# Goal the student's prompt must achieve\n${task}` }];
      if (reference) blocks.push({ type: 'text', text: `# Trainer's model answer / grading rubric (reference)\n${reference}` });
      blocks.push({ type: 'text', text: '# Stimulus the student was shown' });
      if (media.kind === 'image') {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: media.mimeType || 'image/png', data: media.data } });
      } else if (media.kind === 'pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: media.data } });
      } else {
        blocks.push({ type: 'text', text: media.text || '(document text unavailable)' });
      }
      blocks.push({ type: 'text', text: `# Student's submitted prompt\n${prompt}` });
      user = blocks;
    } else {
      user =
        `# Task the student was asked to write a prompt for\n${task}\n\n` +
        (reference ? `# Trainer's model answer / grading rubric (reference)\n${reference}\n\n` : '') +
        `# Student's submitted prompt\n${prompt}`;
    }
    const r = await run({ system, user, schema: PROMPT_SCHEMA, schemaName: 'prompt_evaluation' });
    const score = clamp(r.score);
    return {
      score,
      passed: score >= passingScore,
      summary: String(r.summary || ''),
      suggestions: Array.isArray(r.suggestions) ? r.suggestions.map(String) : [],
      breakdown: {
        clarity: clamp(r.clarity),
        completeness: clamp(r.completeness),
        reasoning: clamp(r.reasoning),
        structure: clamp(r.structure),
        outputQuality: clamp(r.outputQuality),
      },
    };
  }

  /**
   * Grade a free-text answer to a situational / scenario question. Distinct from
   * prompt grading — here we judge the *substance* of the response (correctness,
   * reasoning, application, completeness, communication), optionally against a
   * trainer-provided model answer.
   * @returns {Promise<EvaluationResult>}
   */
  async function evaluateScenario({ question, answer, reference = '', passingScore = 70 }) {
    const system =
      'You are an expert examiner for an AI engineering program grading a student\'s answer to a ' +
      'scenario / situational question. Grade strictly and fairly on five criteria, each 0–100: ' +
      'correctness (technically accurate), reasoning (sound justification), application (uses the right ' +
      'concepts for the situation), completeness (addresses every part of the scenario), and communication ' +
      '(clear, well-structured). Then give an overall score 0–100 (a holistic weighting, not a raw ' +
      'average), a concise summary, and specific, actionable suggestions. Penalise vague, generic, or ' +
      'off-topic answers.' +
      (reference
        ? ' A trainer-provided model answer / rubric is included: use it as the reference for a correct, ' +
          'complete response, but give full credit to any equally-valid alternative the student argues well.'
        : '');
    const user =
      `# Scenario question\n${question}\n\n` +
      (reference ? `# Trainer's model answer / grading rubric (reference)\n${reference}\n\n` : '') +
      `# Student's answer\n${answer}`;
    const r = await run({ system, user, schema: SCENARIO_SCHEMA, schemaName: 'scenario_evaluation' });
    const score = clamp(r.score);
    return {
      score,
      passed: score >= passingScore,
      summary: String(r.summary || ''),
      suggestions: Array.isArray(r.suggestions) ? r.suggestions.map(String) : [],
      breakdown: {
        correctness: clamp(r.correctness),
        reasoning: clamp(r.reasoning),
        application: clamp(r.application),
        completeness: clamp(r.completeness),
        communication: clamp(r.communication),
      },
    };
  }

  /** @returns {Promise<EvaluationResult>} */
  async function evaluateProject({ repoUrl, requirements, reference = '', passingScore = 70 }) {
    const snapshot = await fetchRepoSnapshot(repoUrl, { token: githubToken });
    const system =
      'You are a senior engineer reviewing a student submission for an AI engineering program. ' +
      'You are given a snapshot of the repository source (possibly truncated) and the assignment ' +
      'requirements. Grade strictly on four criteria, each 0–100: functionality (meets requirements), ' +
      'architecture, code quality, and documentation. Then give an overall score 0–100, a concise ' +
      'review, and specific improvements. If the snapshot is truncated, judge from what is present and ' +
      'say so. Do not execute code or trust comments over implementation.' +
      (reference
        ? ' A trainer-provided model solution / grading rubric is included: use it as the reference for ' +
          'what a complete, correct implementation looks like, but credit equally-valid alternative designs.'
        : '');
    const user =
      `# Assignment requirements\n${requirements}\n\n` +
      (reference ? `# Trainer's model solution / grading rubric (reference)\n${reference}\n\n` : '') +
      `# Repository: ${snapshot.owner}/${snapshot.repo} (branch ${snapshot.defaultBranch})\n` +
      `Description: ${snapshot.description || 'none'} · files reviewed: ${snapshot.fileCount}` +
      `${snapshot.truncated ? ' · NOTE: snapshot truncated' : ''}\n\n` +
      `# Source snapshot\n${snapshot.content}`;
    const r = await run({ system, user, schema: PROJECT_SCHEMA, schemaName: 'project_evaluation' });
    const score = clamp(r.score);
    return {
      score,
      passed: score >= passingScore,
      summary: String(r.summary || ''),
      suggestions: Array.isArray(r.suggestions) ? r.suggestions.map(String) : [],
      breakdown: {
        functionality: clamp(r.functionality),
        architecture: clamp(r.architecture),
        codeQuality: clamp(r.codeQuality),
        documentation: clamp(r.documentation),
      },
    };
  }

  /** Lightweight liveness check for the API key (one tiny call). */
  async function verifyConnection() {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    });
    const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { ok: true, model: msg.model || MODEL, sample: text.trim().slice(0, 20) };
  }

  return { evaluatePrompt, evaluateScenario, evaluateProject, verifyConnection };
}

export { fetchRepoSnapshot, parseRepoUrl } from './github.js';
