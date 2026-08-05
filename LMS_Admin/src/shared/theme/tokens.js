/**
 * Centralized design tokens. THE single source of truth for color across the
 * entire platform — backend emails, frontend SPA, certificates, charts.
 * Exactly two themes are permitted (Green = default, Orange), each with a
 * light and a dark mode. No module may introduce colors outside these tokens.
 */

// ── THEME 1 · AI READY GREEN (default) ──────────────────────────────────────
export const GREEN_THEME = {
  name: 'green',
  label: 'AI Ready Green',
  light: {
    primary: { base: '#008738', hover: '#006D2D', light: '#DDF5E6' },
    secondary: { base: '#72BD20', hover: '#5EA019', light: '#EAF7D8' },
    accent: { base: '#FFBB00', hover: '#E6A800', light: '#FFF3CC' },
    neutral: {
      background: '#F8FAF8',
      surface: '#FFFFFF',
      border: '#DCE7DD',
      textPrimary: '#1F2937',
      textSecondary: '#4B5563',
      textMuted: '#9CA3AF',
    },
    status: { success: '#008738', warning: '#FFBB00', error: '#DC2626', info: '#72BD20' },
  },
  dark: {
    background: '#0F1A12',
    surface: '#16231A',
    border: '#2A3A2E',
    textPrimary: '#F8FAFC',
    // Brand green is too dark to read as text/icons on the dark surface, so dark
    // mode uses a lightened primary (buttons keep white text, links become legible).
    primary: '#3FB950',
    primaryHover: '#2EA043',
    // Success (#008738) is likewise too dark on the dark surface — lighten it so
    // "passed/correct/done" text and icons stay legible.
    success: '#3FB950',
  },
};

// ── THEME 2 · AI READY ORANGE ───────────────────────────────────────────────
export const ORANGE_THEME = {
  name: 'orange',
  label: 'AI Ready Orange',
  light: {
    primary: { base: '#F15D27', hover: '#D94E1D', light: '#FEE8D0' },
    secondary: { base: '#2A2A2A', hover: '#1F1F1F', light: '#E5E5E5' },
    accent: { base: '#FEE8D0', hover: '#F8D9B5', light: '#FFF5EA' },
    neutral: {
      background: '#FAFAFA',
      surface: '#FFFFFF',
      border: '#E5E7EB',
      textPrimary: '#2A2A2A',
      textSecondary: '#525252',
      textMuted: '#9CA3AF',
    },
    status: { success: '#008738', warning: '#F15D27', error: '#DC2626', info: '#2A2A2A' },
  },
  dark: {
    background: '#121212',
    surface: '#1E1E1E',
    border: '#333333',
    textPrimary: '#F8FAFC',
    // Slightly brighter orange for better legibility on the dark surface.
    primary: '#FF6B3D',
    primaryHover: '#F15D27',
    // Success stays green but lightened so it reads on the dark surface.
    success: '#3FB950',
  },
};

export const THEMES = {
  green: GREEN_THEME,
  orange: ORANGE_THEME,
};

export const DEFAULT_THEME = 'green';

/**
 * Flatten a theme + mode into a CSS-variable map (`--color-primary`, ...).
 * Consumed by the frontend ThemeProvider to set variables on `:root`.
 * Dark mode only overrides the neutral surfaces/text per spec; brand,
 * accent, and status colors stay identical for cross-mode consistency.
 *
 * @param {'green'|'orange'} name
 * @param {'light'|'dark'} mode
 * @returns {Record<string, string>}
 */
export function themeToCssVars(name, mode) {
  const t = THEMES[name];
  const p = t.light;
  const neutral =
    mode === 'dark'
      ? {
          background: t.dark.background,
          surface: t.dark.surface,
          border: t.dark.border,
          textPrimary: t.dark.textPrimary,
          // Secondary/muted text are derived for dark mode (lightened).
          textSecondary: '#CBD5E1',
          textMuted: '#94A3B8',
        }
      : p.neutral;

  // Dark mode lightens the brand primary so it reads on dark surfaces (text/links/
  // icons); light mode keeps the exact brand colour.
  const primaryBase = mode === 'dark' ? (t.dark.primary ?? p.primary.base) : p.primary.base;
  const primaryHover = mode === 'dark' ? (t.dark.primaryHover ?? p.primary.hover) : p.primary.hover;
  const successColor = mode === 'dark' ? (t.dark.success ?? p.status.success) : p.status.success;

  return {
    '--color-primary': primaryBase,
    '--color-primary-hover': primaryHover,
    '--color-primary-light': p.primary.light,
    '--color-secondary': p.secondary.base,
    '--color-secondary-hover': p.secondary.hover,
    '--color-secondary-light': p.secondary.light,
    '--color-accent': p.accent.base,
    '--color-accent-hover': p.accent.hover,
    '--color-accent-light': p.accent.light,
    '--color-background': neutral.background,
    '--color-surface': neutral.surface,
    '--color-border': neutral.border,
    '--color-text-primary': neutral.textPrimary,
    '--color-text-secondary': neutral.textSecondary,
    '--color-text-muted': neutral.textMuted,
    '--color-success': successColor,
    '--color-warning': p.status.warning,
    '--color-error': p.status.error,
    '--color-info': p.status.info,
    // Rating gold — a fixed brand accent for star ratings (theme-independent).
    '--color-rating-star': '#f5b301',
  };
}

/**
 * Ordered palette for charts/analytics so every dashboard renders series identically.
 * @param {'green'|'orange'} name
 * @returns {string[]}
 */
export function chartSeriesColors(name) {
  const p = THEMES[name].light;
  return [
    p.primary.base,
    p.secondary.base,
    p.accent.base,
    p.status.error,
    p.primary.hover,
    p.secondary.hover,
  ];
}
