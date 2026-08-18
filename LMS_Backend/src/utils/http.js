import { tenantStore } from '../services/tenantContext.js';

/**
 * Wrap an async route so thrown/rejected errors reach the error middleware.
 *
 * It also RE-ESTABLISHES the tenant context from `req.auth` before running the
 * handler. `authenticate` already runs each request inside the tenant store, but
 * multipart upload middleware (multer streaming a file through the MongoDB
 * connection pool) can sever the AsyncLocalStorage chain — so by the time the
 * upload handler runs, `currentTenant()` is sometimes null and new documents get
 * stamped with `organization: null` (then vanish from org-scoped lists). Re-entering
 * here from `req.auth` (a plain request property, immune to the ALS break) makes
 * every handler — upload or not — run in the correct org scope. For non-upload
 * routes the context is already correct, so this is a harmless no-op.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    const invoke = () => fn(req, res, next).catch(next);
    if (req.auth) {
      tenantStore.run({ role: req.auth.role, organization: req.auth.organization ?? null }, invoke);
    } else {
      invoke();
    }
  };
}

/** Send a success envelope. */
export function ok(res, data, statusCode = 200) {
  const body = { success: true, data };
  return res.status(statusCode).json(body);
}
