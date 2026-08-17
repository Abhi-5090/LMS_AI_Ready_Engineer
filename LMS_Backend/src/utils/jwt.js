import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '#shared';
import { env } from '../config/env.js';

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: REFRESH_TOKEN_TTL });
}

// Pin verification to HS256 (the algorithm we sign with) so a token can't be
// slipped through with `alg:none` or an asymmetric-key confusion trick.
const VERIFY_OPTS = { algorithms: ['HS256'] };

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, VERIFY_OPTS);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret, VERIFY_OPTS);
}

// File-access token (typ:'file'). Embedded in media URLs as `?t=...` so that
// browser <img>/<video>/<a> requests — which can't send the Authorization
// header — can still authenticate. Longer-lived than the access token (so
// embedded media survives a session) but scoped to file reads only, and carries
// `tv` so logout/suspension revokes it too.
export function signFileToken({ sub, tv }) {
  return jwt.sign({ sub, tv, typ: 'file' }, env.jwt.accessSecret, { expiresIn: '12h' });
}

export function verifyFileToken(token) {
  const payload = jwt.verify(token, env.jwt.accessSecret, VERIFY_OPTS);
  if (payload.typ !== 'file') throw new Error('Not a file token');
  return payload;
}

// Short-lived token issued after a successful OTP check, authorizing exactly one
// password set. Scoped with a `typ` claim so it can't be used as an access token.
export function signResetToken(userId) {
  return jwt.sign({ sub: userId, typ: 'pwd_reset' }, env.jwt.accessSecret, { expiresIn: '10m' });
}

export function verifyResetToken(token) {
  const payload = jwt.verify(token, env.jwt.accessSecret, VERIFY_OPTS);
  if (payload.typ !== 'pwd_reset') throw new Error('Not a password-reset token');
  return payload;
}
