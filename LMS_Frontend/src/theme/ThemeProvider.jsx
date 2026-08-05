import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_THEME,
  ThemeMode,
  scalesToCssVars,
  themeToCssVars,
} from '@/shared';

const ThemeContext = createContext(null);

const THEME_KEY = 'lms.theme';
const MODE_KEY = 'lms.mode';

function applyVars(theme, mode) {
  const root = document.documentElement;
  const vars = { ...scalesToCssVars(), ...themeToCssVars(theme, mode) };
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = theme;
  root.dataset.mode = mode;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem(THEME_KEY) || DEFAULT_THEME,
  );
  const [mode, setModeState] = useState(
    () => localStorage.getItem(MODE_KEY) || ThemeMode.LIGHT,
  );

  // Apply the theme's CSS vars SYNCHRONOUSLY during render — before children read
  // them (charts resolve var() via getComputedStyle at render time). Doing this in
  // an effect would leave charts one theme behind on every switch.
  const appliedRef = useRef('');
  const themeKey = `${theme}|${mode}`;
  if (typeof document !== 'undefined' && appliedRef.current !== themeKey) {
    applyVars(theme, mode);
    appliedRef.current = themeKey;
  }

  const setTheme = useCallback((t) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  }, []);

  const setMode = useCallback((m) => {
    localStorage.setItem(MODE_KEY, m);
    setModeState(m);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === ThemeMode.LIGHT ? ThemeMode.DARK : ThemeMode.LIGHT;
      localStorage.setItem(MODE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, mode, setTheme, setMode, toggleMode }),
    [theme, mode, setTheme, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
