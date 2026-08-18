import cors from 'cors';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { UPLOADS_URL_PREFIX } from './config/storage.js';
import { serveUpload } from './services/fileStore.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestId } from './middleware/requestId.js';
import { authenticateFile } from './middleware/fileAuth.js';
import { makeLimiter } from './middleware/rateLimit.js';
import { asyncHandler } from './utils/http.js';
import apiRoutes from './routes/index.js';

export function createApp() {
  const app = express();

  // Behind a reverse proxy (nginx) in production: trust the first hop so the
  // rate limiter sees the real client IP. Do NOT trust proxy in dev, where an
  // attacker could spoof X-Forwarded-For to dodge rate limits.
  if (env.isProd) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // No ETag on API responses: this is a dynamic, per-user, authenticated API, so
  // conditional GETs (304 Not Modified) add confusion without a real caching win.
  // Every request returns a fresh 200 with the current body.
  app.set('etag', false);

  // Correlation id first, so it's available to every downstream log + error.
  app.use(requestId);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  // Strip MongoDB operator keys ($, .) from body/query/params — defends against
  // NoSQL operator injection (e.g. {"password": {"$ne": null}}).
  app.use(mongoSanitize());
  if (!env.isProd) app.use(morgan('dev'));

  // Serve uploaded files straight from MongoDB/GridFS (before the rate limiter so
  // downloads don't count against the API budget). Authorized via a file-scoped
  // token (`?t=` for media elements, or a Bearer access token for axios), so
  // personal data (proctor snapshots, certificates) is never world-readable. The
  // handler streams with HTTP Range support and re-applies the hardening headers.
  app.get(`${UPLOADS_URL_PREFIX}/:filename`, authenticateFile, asyncHandler(serveUpload));

  // Basic abuse protection on the API surface. Relaxed outside production so
  // local dev / load tests aren't throttled (auth-route limiters do the same).
  app.use(
    '/api',
    makeLimiter({
      windowMs: 15 * 60 * 1000,
      limit: env.isProd ? 1000 : 1_000_000,
    }),
  );

  // Never let the browser cache API JSON. Without this, responses have no
  // Cache-Control, so browsers apply HEURISTIC caching and can serve a stale
  // list (e.g. an empty resources list from before you added an article) on the
  // next fetch — making freshly-added items look like they never uploaded.
  // File downloads set their own Cache-Control later in the handler, so this
  // only governs JSON responses.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
