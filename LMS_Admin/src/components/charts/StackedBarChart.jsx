import { ResponsiveContainer, BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts';
import { useTheme } from '@/theme/ThemeProvider';
import { resolveColor, gridColor, surfaceColor, axisTick } from './chartTheme';
import { ChartTooltip } from './ChartTooltip';
import './charts.css';

/**
 * Horizontal stacked bars. Each row has N segments (one per series), scaled on a
 * shared axis so rows compare. A 2px surface gap separates stacked segments.
 *
 * @param {{ rows:{label:string, segments:{value:number}[]}[],
 *   series:{key:string,label:string,color:string}[], emptyText?:string }} props
 */
export function StackedBarChart({ rows = [], series = [], emptyText = 'No data yet.' }) {
  useTheme(); // re-render (and re-resolve colors) when the theme changes
  if (!rows.length) return <p className="chart-empty">{emptyText}</p>;

  const data = rows.map((r) => {
    const o = { label: r.label };
    series.forEach((s, i) => { o[s.key] = r.segments[i]?.value ?? 0; });
    // Row total for the end-of-bar label — shows "0" for a genuinely empty row
    // (distinguishes a real zero from missing data).
    o.__total = series.reduce((sum, s) => sum + (o[s.key] || 0), 0);
    return o;
  });
  const height = Math.max(150, rows.length * 40 + 24);
  const gap = surfaceColor();

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart layout="vertical" data={data} margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="26%">
          <CartesianGrid horizontal={false} stroke={gridColor()} strokeDasharray="3 3" />
          <XAxis type="number" tick={axisTick()} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={116} tick={axisTick()} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(127,127,127,0.08)' }} content={<ChartTooltip />} />
          {series.map((s, i) => {
            const isLast = i === series.length - 1;
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={resolveColor(s.color)}
                stroke={gap}
                strokeWidth={2}
                maxBarSize={26}
                radius={isLast ? [0, 4, 4, 0] : [0, 0, 0, 0]}
              >
                {/* Per-segment value inside the bar (multi-series only; non-zero). */}
                {series.length > 1 && (
                  <LabelList dataKey={s.key} position="center" formatter={(v) => (v > 0 ? v : '')} style={{ fill: '#fff', fontSize: 11, fontWeight: 700 }} />
                )}
                {/* End-of-bar total (always, incl. 0) so rows read like the other charts. */}
                {isLast && (
                  <LabelList dataKey="__total" position="right" style={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600 }} />
                )}
              </Bar>
            );
          })}
        </RBarChart>
      </ResponsiveContainer>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.key} className="chart-legend__item">
              <span className="chart-legend__dot" style={{ background: resolveColor(s.color) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
