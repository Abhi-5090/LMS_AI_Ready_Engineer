import { ResponsiveContainer, BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
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
    return o;
  });
  const height = Math.max(150, rows.length * 40 + 24);
  const gap = surfaceColor();

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart layout="vertical" data={data} margin={{ top: 4, right: 24, bottom: 4, left: 4 }} barCategoryGap="26%">
          <CartesianGrid horizontal={false} stroke={gridColor()} strokeDasharray="3 3" />
          <XAxis type="number" tick={axisTick()} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={116} tick={axisTick()} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(127,127,127,0.08)' }} content={<ChartTooltip />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={resolveColor(s.color)}
              stroke={gap}
              strokeWidth={2}
              maxBarSize={26}
              radius={i === series.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
            />
          ))}
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
