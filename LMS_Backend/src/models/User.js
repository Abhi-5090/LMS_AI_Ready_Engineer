import bcrypt from 'bcrypt';
import mongoose, { Schema } from 'mongoose';
import { UserRole, UserStatus } from '#shared';
import { baseSchemaOptions } from './baseSchema.js';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Email is a GLOBAL identity, unique across the WHOLE platform (not per-org):
    // sign-in is by email alone with no org selector, so it must be unambiguous. A
    // person therefore cannot hold accounts in two organizations under one email.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    // Optional: bulk-imported users have no password until they set one through
    // the email-OTP onboarding flow.
    passwordHash: { type: String, select: false },
    // One-time passcode for passwordless onboarding / password reset (hidden).
    otpHash: { type: String, select: false },
    otpExpiresAt: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    role: { type: String, enum: Object.values(UserRole), required: true, index: true },
    // The tenant this user belongs to. Null ONLY for the super admin (who is global).
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
      index: true,
    },
    phone: String,
    avatarUrl: String,
    bio: { type: String, trim: true },
    // Coding / professional platform links shown on the profile (see SOCIAL_PLATFORMS).
    links: {
      github: String,
      leetcode: String,
      codechef: String,
      hackerrank: String,
      linkedin: String,
      portfolio: String,
    },
    // Extra user-added links beyond the fixed platforms (label + url).
    customLinks: { type: [{ _id: false, label: String, url: String }], default: [] },
    // Three resume formats the student can store: an uploaded soft copy (PDF),
    // a digital resume / portfolio link, and a video resume link.
    resume: {
      fileUrl: String, // uploaded PDF under /api/uploads
      portfolioUrl: String,
      videoUrl: String,
    },
    // Bumped to invalidate all outstanding refresh tokens (logout, password change,
    // suspension). Refresh tokens carrying an older `tv` are rejected.
    tokenVersion: { type: Number, default: 0 },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
    assignedModules: [{ type: Schema.Types.ObjectId, ref: 'Module' }],
    assignedBatches: [{ type: Schema.Types.ObjectId, ref: 'Batch' }],
    lastLoginAt: Date,
  },
  baseSchemaOptions,
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false); // no password set yet
  return bcrypt.compare(plain, this.passwordHash);
};

/** Whether this user has a usable password (vs. needing OTP onboarding). */
userSchema.methods.hasPassword = function hasPassword() {
  return Boolean(this.passwordHash);
};

userSchema.statics.setPassword = function setPassword(plain) {
  return bcrypt.hash(plain, 10);
};

export const User = mongoose.model('User', userSchema);
