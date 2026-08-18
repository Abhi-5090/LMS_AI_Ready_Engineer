import { UserStatus } from '#shared';
import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken, verifyFileToken } from '../utils/jwt.js';

/**
 * Authorize a request to the file-serving route. Files are personal data
 * (proctor snapshots, certificates, project shots, avatars), so they must not be
 * world-readable. Browser <img>/<video>/<a> requests can't send an Authorization
 * header, so a file-scoped token is accepted in the `?t=` query param; API-driven
 * downloads (axios) may instead send a Bearer access token. Either way the token
 * is validated against the user's current tokenVersion + active status, so a
 * logged-out/suspended user loses file access immediately.
 *
 * Exception: Safe Exam Browser config files (`seb-*`) are non-personal exam
 * configuration fetched by the SEB application itself (which carries no token),
 * so they remain accessible without one.
 */
export async function authenticateFile(req, _res, next) {
  try {
    if (String(req.params.filename || '').startsWith('seb-')) return next();

    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
    const queryToken = typeof req.query.t === 'string' ? req.query.t : null;

    let payload;
    try {
      if (queryToken) payload = verifyFileToken(queryToken);
      else if (bearer) payload = verifyAccessToken(bearer);
      else throw new Error('missing token');
    } catch {
      throw ApiError.unauthorized('A valid file-access token is required');
    }

    const user = await User.findById(payload.sub).select('tokenVersion status role organization');
    if (!user) throw ApiError.unauthorized('Account no longer exists');
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      throw ApiError.unauthorized('File session expired — please sign in again');
    }
    if (user.status === UserStatus.ARCHIVED || user.status === UserStatus.SUSPENDED) {
      throw ApiError.forbidden('Your account is not active.');
    }

    // Carry role + organization so any org-scoped DB lookup in the handler
    // (e.g. viewResource → Resource.findById) resolves in the right tenant. Without
    // these, the tenant plugin would DENY the query (no org on a non-super caller).
    req.auth = { userId: user.id, role: user.role, organization: user.organization ? String(user.organization) : null };
    next();
  } catch (err) {
    next(err);
  }
}
