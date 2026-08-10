/**
 * Platform-wide defaults. All of these are admin-configurable at runtime
 * (stored in a Settings document); these are the seed/fallback values.
 */

/** Minimum % score to pass a final assessment and unlock the next module. */
export const DEFAULT_PASSING_SCORE = 70;

/** Minimum overall attendance % required for certification eligibility. */
export const DEFAULT_MIN_ATTENDANCE = 75;

/** Practice tests per module (Practice Test 1..5). */
export const PRACTICE_TESTS_PER_MODULE = 5;

/** Preparation tests per module (Preparation Test 1..2) — both mandatory before the final. */
export const PREPARATION_TESTS_PER_MODULE = 2;

/** Prompt-evaluation engine scores out of this maximum. */
export const PROMPT_SCORE_MAX = 100;

/** JWT access-token lifetime (string accepted by `jsonwebtoken`). */
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '7d';

/** Whether public student self-registration is allowed (admin-configurable). */
export const DEFAULT_ALLOW_SELF_REGISTRATION = false;

/**
 * Coding / professional platform links a user can put on their profile. The
 * `key` is the User.links field name; the `label` + `placeholder` drive the UI.
 * Single source of truth shared by backend validation and both frontends.
 */
export const SOCIAL_PLATFORMS = [
  { key: 'github', label: 'GitHub', placeholder: 'https://github.com/username' },
  { key: 'leetcode', label: 'LeetCode', placeholder: 'https://leetcode.com/u/username' },
  { key: 'codechef', label: 'CodeChef', placeholder: 'https://codechef.com/users/username' },
  { key: 'hackerrank', label: 'HackerRank', placeholder: 'https://hackerrank.com/profile/username' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/username' },
  { key: 'portfolio', label: 'Portfolio', placeholder: 'https://your-site.com' },
];

/** Max screenshots a student may attach to a profile project. */
export const PROJECT_MAX_IMAGES = 5;

// Predefined tech-stack tags students can pick when submitting a project. New
// tags a student adds via "Other" go to a trainer/admin for approval before
// joining this list.
export const TECH_STACK = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Dart', 'R', 'Scala', 'SQL',
  'React', 'Angular', 'Vue', 'Svelte', 'Next.js', 'Node.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Laravel', 'Ruby on Rails', '.NET',
  'Flutter', 'React Native', 'Android', 'iOS',
  'HTML', 'CSS', 'Tailwind CSS', 'Bootstrap', 'Sass',
  'MongoDB', 'PostgreSQL', 'MySQL', 'SQLite', 'Redis', 'Firebase', 'Supabase',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Git', 'GitHub', 'CI/CD', 'Linux',
  'TensorFlow', 'PyTorch', 'scikit-learn', 'Pandas', 'NumPy', 'OpenAI API', 'LangChain', 'Hugging Face',
  'GraphQL', 'REST API', 'WebSockets', 'Kafka', 'Figma',
];

// ── Trainer class feedback ───────────────────────────────────────────────────
// Students rate the trainer who took a class on these parameters (each 1–5),
// plus a separate Overall rating. Shared by the student rating modal and the
// admin feedback dashboard so labels never drift.
export const FEEDBACK_PARAMETERS = [
  { key: 'subjectKnowledge', label: 'Subject knowledge' },
  { key: 'clarity', label: 'Clarity of explanation' },
  { key: 'engagement', label: 'Engagement & interaction' },
  { key: 'pace', label: 'Pace & time management' },
  { key: 'doubtHandling', label: 'Doubt handling' },
];

// Improvement keywords a student can pick (multi-select) when the Overall
// rating is below 5, alongside a free-text comment.
export const FEEDBACK_KEYWORDS = [
  'Low practical knowledge',
  'Needs improvement in lectures',
  'Communication / English',
  'Poor time management',
  'Not engaging / hard to follow',
];

// Overall ratings strictly below this open the improvement feedback (keywords + comment).
export const FEEDBACK_LOW_THRESHOLD = 5;
