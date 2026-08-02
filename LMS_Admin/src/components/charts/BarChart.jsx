import { ResponsiveContainer, BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList, CartesianGrid } from 'recharts';
import { chartSeriesColors } from '@/shared';
import { useTheme } from '@/theme/ThemeProvider';
import { resolveColor, gridColor, axisTick } from './chartTheme';
import { ChartTooltip } from './ChartTooltip';
import './charts.css';

/**
 * Horizontal bar chart. One measure across categories → a single hue by default
 * (magnitude, not identity); pass `multicolor` to color each bar from the theme
 * palette, or per-datum `color`. `max` fixes the scale; `suffix` (e.g. "%").
 *
 * @param {{ data:{label:string,value:number,color?:string}[], max?:number,
 *   suffix?:string, multicolor?:boolean, emptyText?:string }} props
 */
export function BarChart({ data = [], max, suffix = '', multicolor = false, emptyText = 'No data yet.' }) {
  const { theme } = useTheme();
  const palette = chartSeriesColors(theme);
  if (!data.length || data.every((d) => !d.value)) return <p className="chart-empty">{emptyText}</p>;

  const primary = resolveColor('var(--color-primary)');
  const colorAt = (d, i) => resolveColor(d.color) || (multicolor ? palette[i % palette.length] : primary);
  const height = Math.max(150, data.length * 40 + 24);

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart layout="vertical" data={data} margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="26%">
          <CartesianGrid horizontal={false} stroke={gridColor()} strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, max ?? 'auto']} tick={axisTick()} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}${suffix}`} />
          <YAxis type="category" dataKey="label" width={116} tick={axisTick()} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(127,127,127,0.08)' }} content={<ChartTooltip suffix={suffix} />} />
          <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]} maxBarSize={26}>
            {data.map((d, i) => <Cell key={i} fill={colorAt(d, i)} />)}
            <LabelList dataKey="value" position="right" formatter={(v) => `${v}${suffix}`} style={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
