import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useId } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { resolveColor, gridColor, axisTick } from './chartTheme';
import { ChartTooltip } from './ChartTooltip';
import './charts.css';

/**
 * Time-series area/line chart — the right form for change-over-time (trends,
 * growth). A single hue with a soft gradient fill; smooth line, dotted markers,
 * crosshair tooltip. `suffix` (e.g. "%"); `color` overrides the primary hue.
 *
 * @param {{ data:{label:string,value:number}[], suffix?:string,
 *   color?:string, height?:number, emptyText?:string }} props
 */
export function TrendChart({ data = [], suffix = '', color, height = 200, emptyText = 'No data yet.' }) {
  useTheme(); // re-resolve colors on theme change
  const gid = useId().replace(/:/g, '');
  if (!data.length || data.every((d) => !d.value)) return <p className="chart-empty">{emptyText}</p>;

  const hue = resolveColor(color || 'var(--color-primary)');

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id={`trend-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hue} stopOpacity={0.28} />
              <stop offset="100%" stopColor={hue} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={gridColor()} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={axisTick()} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={axisTick()} axisLine={false} tickLine={false} width={34} allowDecimals={false} tickFormatter={(v) => `${v}${suffix}`} />
          <Tooltip cursor={{ stroke: hue, strokeWidth: 1, strokeDasharray: '3 3' }} content={<ChartTooltip suffix={suffix} />} />
          <Area
            type="monotone"
            dataKey="value"
            name="Value"
            stroke={hue}
            strokeWidth={2.5}
            fill={`url(#trend-${gid})`}
            dot={{ r: 3, fill: hue, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: hue, stroke: 'var(--color-surface)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
