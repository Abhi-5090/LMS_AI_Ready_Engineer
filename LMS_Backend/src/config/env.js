import 'dotenv/config';
import crypto from 'node:crypto';

/** Read a required env var, failing fast at boot if it is missing in production. */
function required(key, fallback) {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    // Dev convenience — warn but allow an insecure fallback.
    // eslint-disable-next-line no-console
    console.warn(`[env] ${key} is not set; using an insecure development default.`);
    return fallback ?? `dev-${key.toLowerCase()}`;
  }
  return value;
}

/**
 * Resolve a signing secret. In production a missing secret is fatal (never fall
 * back to a guessable value — that would let anyone forge tokens). In dev/test
 * we mint an EPHEMERAL random secret per boot: no config needed, but no known
 * hardcoded default either (so forged tokens can't be crafted from source).
 */
function requiredSecret(key) {
  const value = process.env[key];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  // eslint-disable-next-line no-console
  console.warn(`[env] ${key} is not set; using an ephemeral random development secret.`);
  return crypto.randomBytes(48).toString('hex');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 5050),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Public base URL of the SPA — used to build certificate verification links / QR codes.
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:5173',
  // Optional override for the public origin used to verify Safe Exam Browser
  // request hashes (e.g. https://exam.yourdomain.com). When unset, the request's
  // own protocol + host is used. Set this if a proxy rewrites the host SEB saw.
  sebBaseUrl: process.env.SEB_BASE_URL ?? '',
  mongoUri: required('MONGO_URI', 'mongodb://localhost:27017/lms_ai_ready'),
  jwt: {
    accessSecret: requiredSecret('JWT_ACCESS_SECRET'),
    refreshSecret: requiredSecret('JWT_REFRESH_SECRET'),
  },
  // Log level: 'debug' | 'info' | 'warn' | 'error'. Logs emit structured JSON in
  // production (one line per event) and a readable form in development.
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  // Optional Sentry DSN for error monitoring. When set AND @sentry/node is
  // installed, 5xx errors + uncaught exceptions are reported. No-op otherwise.
  sentryDsn: process.env.SENTRY_DSN ?? '',
  // Webcam proctor snapshots are personal data: purge them (files + DB refs)
  // this many days after the attempt. 0 disables the sweep (keep forever).
  proctorRetentionDays: Number(process.env.PROCTOR_RETENTION_DAYS ?? 90),
  // ── Scale-out infrastructure (all optional; off → single-instance defaults) ──
  // Redis: shared rate-limit store, cross-instance auth-cache invalidation, and
  // single-leader election for the exam sweeper. Required to run >1 backend.
  redisUrl: process.env.REDIS_URL ?? '',
  // S3 (or S3-compatible: R2/MinIO) object storage for uploads + a CDN in front.
  // When configured, new uploads go to S3 and are served via short-lived
  // presigned redirects (offloading media bytes from Node + Mongo). GridFS stays
  // the fallback for any legacy files.
  s3: {
    bucket: process.env.S3_BUCKET ?? '',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    endpoint: process.env.S3_ENDPOINT ?? '', // for R2/MinIO; empty = AWS
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? '', // CloudFront/CDN base (optional)
  },
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  // AI evaluation engine (LMS_AI_Engine) — Claude API.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  githubToken: process.env.GITHUB_TOKEN ?? '',
  // Zoom Server-to-Server OAuth (auto-create class meeting links).
  zoomAccountId: process.env.ZOOM_ACCOUNT_ID ?? '',
  zoomClientId: process.env.ZOOM_CLIENT_ID ?? '',
  zoomClientSecret: process.env.ZOOM_CLIENT_SECRET ?? '',
  // LiveKit — in-app live classes (self-hosted server or LiveKit Cloud). The
  // backend mints short-lived access tokens; the SPA connects to `url` (wss://).
  livekit: {
    url: process.env.LIVEKIT_URL ?? '',
    apiKey: process.env.LIVEKIT_API_KEY ?? '',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? '',
  },
  // Outbound email (password-OTP onboarding). When unset in development, the
  // mailer logs the OTP to the console and the API surfaces it for testing.
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: String(process.env.SMTP_SECURE ?? '').toLowerCase() === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'AI Ready Engineer <no-reply@aiready.local>',
  },
  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME ?? 'Platform Admin',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@aiready.local',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',
  },
  // The global super admin (no organization) — creates orgs + their admins.
  seedSuperAdmin: {
    name: process.env.SEED_SUPERADMIN_NAME ?? 'Super Admin',
    email: process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@aiready.local',
    password: process.env.SEED_SUPERADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',
  },
};
