import bcrypt from 'bcrypt';
import { z } from 'zod';
import { UserRole, UserStatus } from '#shared';
import { User, Organization } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/http.js';
import { invalidateAuthUser } from '../services/authCache.js';
import {
  signAccessToken,
  signFileToken,
  signRefreshToken,
  signResetToken,
  verifyRefreshToken,
  verifyResetToken,
} from '../utils/jwt.js';
import { sendOtpEmail } from '../services/mailer.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
// Statuses that may complete OTP onboarding. PENDING is intentionally excluded:
// only an admin (approveUser) may activate a PENDING account — otherwise a pending
// user could self-activate through the OTP → set-password flow, bypassing approval.
const ONBOARDABLE = [UserStatus.ACTIVE];

// Email is a case-INSENSITIVE identity: trim + lowercase every login/lookup so it
// matches the stored (lowercased) address regardless of typed case. Passwords are
// left untouched — bcrypt.compare is case-SENSITIVE by design.
const emailField = z.string().trim().toLowerCase().email().max(160);

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(128),
});

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: emailField,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(1000),
});

function toDTO(user) {
  return user.toJSON();
}

function issueTokens(user) {
  const tv = user.tokenVersion ?? 0;
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role, tv }),
    refreshToken: signRefreshToken({ sub: user.id, role: user.role, tv }),
    fileToken: signFileToken({ sub: user.id, tv }),
  };
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.ARCHIVED) {
    throw ApiError.forbidden('Your account is not active. Contact your administrator.');
  }
  if (user.status === UserStatus.PENDING) {
    throw ApiError.forbidden('Your account is awaiting administrator approval.');
  }
  // A suspended organization locks out all its members (the super admin, who has
  // no organization, is exempt and can still sign in to manage/reactivate it).
  if (user.organization) {
    const org = await Organization.findById(user.organization).select('status');
    if (org?.status === 'suspended') {
      throw ApiError.forbidden('Your organization is suspended. Contact your administrator.');
    }
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = issueTokens(user);
  const body = { user: toDTO(user), tokens };
  ok(res, body);
}

/**
 * Public self-registration is DISABLED in the multi-tenant model: a public signup
 * has no organization to join, which would create an org-less account. Trainers and
 * students are created by their organization's admin. Kept as an explicit 403 (not a
 * removed route) so the intent is clear and any stale client gets a clear message.
 */
export async function register(_req, _res) {
  throw ApiError.forbidden('Self-registration is disabled. Your organization administrator creates your account.');
}

export async function refresh(req, res) {
  const { refreshToken } = req.body;
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  const user = await User.findById(payload.sub);
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw ApiError.unauthorized('Account is no longer active');
  }
  // Reject refresh tokens issued before the user's tokenVersion was bumped
  // (logout / password change / suspension revokes all older sessions).
  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    throw ApiError.unauthorized('Session expired — please sign in again');
  }
  ok(res, { tokens: issueTokens(user) });
}

/** Revoke all of this user's refresh tokens (sign-out everywhere). */
export async function logout(req, res) {
  await User.updateOne({ _id: req.auth.userId }, { $inc: { tokenVersion: 1 } });
  invalidateAuthUser(req.auth.userId);
  ok(res, { ok: true });
}

export async function me(req, res) {
  const user = await User.findById(req.auth.userId);
  if (!user) throw ApiError.notFound('User not found');
  ok(res, { user: toDTO(user) });
}

// ── Passwordless onboarding / password reset via email OTP ──────────────────

export const checkEmailSchema = z.object({ email: emailField });
export const requestOtpSchema = z.object({ email: emailField });
export const verifyOtpSchema = z.object({
  email: emailField,
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export const setPasswordSchema = z.object({
  resetToken: z.string().min(10).max(1000),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

/** Generate a 6-digit numeric OTP as a string. */
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Tell the login screen whether an email exists and whether it already has a
 * password — so it can offer "enter password" vs "set password via OTP".
 */
export async function checkEmail(req, res) {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash status');
  const usable = user && ONBOARDABLE.includes(user.status);
  ok(res, { exists: Boolean(usable), hasPassword: Boolean(usable && user.passwordHash) });
}

/**
 * Send a one-time passcode to the email. Always responds success (so it can't
 * be used to enumerate accounts); only actually mails when the account exists
 * and is onboardable. In dev (no SMTP) the OTP is returned for testing.
 */
export async function requestOtp(req, res) {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !ONBOARDABLE.includes(user.status)) {
    ok(res, { sent: true }); // don't reveal whether the email exists
    return;
  }
  const otp = generateOtp();
  user.otpHash = await bcrypt.hash(otp, 10);
  user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.otpAttempts = 0;
  await user.save();

  try {
    await sendOtpEmail(user.email, otp);
  } catch (err) {
    // Never reveal delivery failures to the client (it would leak that the
    // email exists). Surface it in logs so an admin can fix SMTP config.
    // eslint-disable-next-line no-console
    console.error(`[auth] failed to send OTP email to ${user.email}: ${err.message}`);
  }
  // In non-production, return the code so staging/dev can test without real email.
  // In production this is NEVER included, so it can't be used to bypass email.
  const body = { sent: true };
  if (!env.isProd) body.devOtp = otp;
  ok(res, body);
}

/**
 * Verify the OTP. On success, return a short-lived reset token authorizing one
 * password set. Wrong/expired codes are throttled to OTP_MAX_ATTEMPTS.
 */
export async function verifyOtp(req, res) {
  const { email, otp } = req.body;
  const user = await User.findOne({ email }).select('+otpHash +otpExpiresAt +otpAttempts status');
  const invalid = ApiError.badRequest('Invalid or expired code');

  if (!user || !user.otpHash || !user.otpExpiresAt) throw invalid;
  if (user.otpExpiresAt.getTime() < Date.now()) throw invalid;
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    throw ApiError.badRequest('Too many attempts. Request a new code.');
  }

  const match = await bcrypt.compare(otp, user.otpHash);
  if (!match) {
    user.otpAttempts += 1;
    await user.save();
    throw invalid;
  }

  // Consume the OTP; issue a one-shot reset token.
  user.otpHash = undefined;
  user.otpExpiresAt = undefined;
  user.otpAttempts = 0;
  await user.save();
  ok(res, { resetToken: signResetToken(user.id) });
}

/** Set the password using a reset token from verifyOtp, then send to login. */
export async function setPasswordWithToken(req, res) {
  const { resetToken, password } = req.body;
  let payload;
  try {
    payload = verifyResetToken(resetToken);
  } catch {
    throw ApiError.unauthorized('This link has expired. Please request a new code.');
  }
  const user = await User.findById(payload.sub);
  // PENDING is not onboardable — a pending account can't self-activate here; an
  // admin must approve it first. Only ACTIVE accounts set their password via OTP.
  if (!user || !ONBOARDABLE.includes(user.status)) throw ApiError.notFound('Account not found');

  user.passwordHash = await User.setPassword(password);
  user.otpHash = undefined;
  user.otpExpiresAt = undefined;
  user.otpAttempts = 0;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // a password set revokes old sessions
  await user.save();
  invalidateAuthUser(user.id);
  ok(res, { ok: true });
}
