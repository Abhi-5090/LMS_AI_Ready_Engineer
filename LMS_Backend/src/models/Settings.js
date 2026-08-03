import mongoose, { Schema } from 'mongoose';
import {
  DEFAULT_ALLOW_SELF_REGISTRATION,
  DEFAULT_MIN_ATTENDANCE,
  DEFAULT_PASSING_SCORE,
  DEFAULT_THEME,
  UserRole,
} from '#shared';
import { baseSchemaOptions } from './baseSchema.js';
import { currentTenant } from '../services/tenantContext.js';

const settingsSchema = new Schema(
  {
    passingScore: { type: Number, default: DEFAULT_PASSING_SCORE },
    minAttendance: { type: Number, default: DEFAULT_MIN_ATTENDANCE },
    allowSelfRegistration: { type: Boolean, default: DEFAULT_ALLOW_SELF_REGISTRATION },
    activeTheme: { type: String, default: DEFAULT_THEME },
    // Safe Exam Browser: one global Config Key (the entire secret behind the SEB
    // gate — never returned by the API, like the other keys) + the .seb config URL.
    sebConfigKey: { type: String, select: false, default: '' },
    sebConfigUrl: { type: String, default: '' },
    // Admin-configurable Claude API key for AI grading. Stored server-side only;
    // NEVER returned by the API (the controller exposes a boolean instead) and
    // hidden from default queries. The env var takes precedence over this.
    aiApiKey: { type: String, select: false, default: '' },
    // Alternative AI-grading provider: an OpenAI API key. Either this OR the Claude
    // key above is enough — grading uses whichever is set (Claude wins if both are).
    // Same handling: server-side only, never returned, hidden from default queries.
    openaiApiKey: { type: String, select: false, default: '' },
    // Zoom S2S OAuth credentials — same handling as the AI key (never returned).
    zoomAccountId: { type: String, select: false, default: '' },
    zoomClientId: { type: String, select: false, default: '' },
    zoomClientSecret: { type: String, select: false, default: '' },
    // One settings doc per organization. The global-defaults doc has organization
    // = null (edited by the super admin; served to unauthenticated screens).
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  },
  baseSchemaOptions,
);

// Exactly one settings doc per org (and one global doc where organization is null).
settingsSchema.index({ organization: 1 }, { unique: true });
// The global settings doc legitimately has organization=null — never let the
// test-only ambient org stamp it (see tenantPlugin.js).
settingsSchema.$ambientExempt = true;

const SettingsModel = mongoose.model('Settings', settingsSchema);

/**
 * The org whose settings the current context should read/write:
 *   - super admin / no context (seed, public screens) → null (global defaults doc)
 *   - an org admin/trainer/student → their own organization
 * The tenant plugin also auto-scopes these queries, but we pass `organization`
 * explicitly so the intent is unambiguous and the null (global) case works.
 */
function settingsOrg() {
  const ctx = currentTenant();
  if (!ctx || ctx.role === UserRole.SUPER_ADMIN) return null;
  return ctx.organization || null;
}

/** Fetch the settings doc for the current org, creating it with defaults on first call. */
export async function getSettings() {
  const organization = settingsOrg();
  const existing = await SettingsModel.findOne({ organization });
  if (existing) return existing;
  try {
    return await SettingsModel.create({ organization });
  } catch (err) {
    if (err?.code === 11000) return SettingsModel.findOne({ organization }); // lost a create race
    throw err;
  }
}

/** Read the stored Claude (Anthropic) key (explicitly, since it is `select: false`). */
export async function getStoredAiApiKey() {
  const doc = await SettingsModel.findOne({ organization: settingsOrg() }).select('+aiApiKey');
  return doc?.aiApiKey || '';
}

/** Read the stored OpenAI key (explicitly, since it is `select: false`). */
export async function getStoredOpenaiApiKey() {
  const doc = await SettingsModel.findOne({ organization: settingsOrg() }).select('+openaiApiKey');
  return doc?.openaiApiKey || '';
}

/** Read the stored SEB Config Key (explicitly, since it is `select: false`). */
export async function getStoredSebConfigKey() {
  const doc = await SettingsModel.findOne({ organization: settingsOrg() }).select('+sebConfigKey');
  return doc?.sebConfigKey || '';
}

/** Read the stored Zoom credentials (explicitly, since they are `select: false`). */
export async function getStoredZoomCreds() {
  const doc = await SettingsModel.findOne({ organization: settingsOrg() }).select(
    '+zoomAccountId +zoomClientId +zoomClientSecret',
  );
  return {
    zoomAccountId: doc?.zoomAccountId || '',
    zoomClientId: doc?.zoomClientId || '',
    zoomClientSecret: doc?.zoomClientSecret || '',
  };
}

export const Settings = SettingsModel;
