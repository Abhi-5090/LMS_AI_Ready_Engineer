import { api, unwrap } from './api';

/** Request a one-time code by email. Resolves with { sent }. The code is only
 *  ever delivered by email — never returned to the client. */
export function requestOtp(email) {
  return unwrap(api.post('/auth/request-otp', { email }));
}

/** Verify the code. Resolves with { resetToken } on success. */
export function verifyOtp(email, otp) {
  return unwrap(api.post('/auth/verify-otp', { email, otp }));
}

/** Set a new password using the reset token from verifyOtp. */
export function setPassword(resetToken, password) {
  return unwrap(api.post('/auth/set-password', { resetToken, password }));
}
