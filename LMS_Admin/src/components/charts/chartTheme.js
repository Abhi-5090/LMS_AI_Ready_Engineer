/* Shared Recharts theming: resolve CSS-var colors to concrete values (SVG fills
   can't use var()), plus axis/grid tokens and a theme-aware tooltip. */

export function resolveColor(c) {
  if (typeof c === 'string' && c.startsWith('var(') && typeof window !== 'undefined') {
    const name = c.slice(4, -1).trim();
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || c;
  }
  return c;
}

export const gridColor = () => resolveColor('var(--color-border)');
export const surfaceColor = () => resolveColor('var(--color-surface)');
export const axisTick = () => ({ fill: resolveColor('var(--color-text-secondary)'), fontSize: 12 });
