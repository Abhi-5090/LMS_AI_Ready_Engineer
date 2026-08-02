import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { chartSeriesColors } from '@/shared';
import { useTheme } from '@/theme/ThemeProvider';
import { resolveColor, surfaceColor } from './chartTheme';
import { ChartTooltip } from './ChartTooltip';
import './charts.css';

/**
 * Donut chart with a center total and a legend. Each datum is a segment; pass a
 * per-datum `color` (e.g. status colors) or let the theme palette fill it.
 *
 * @param {{ data:{label:string,value:number,color?:string}[],
 *   centerValue?:React.ReactNode, centerLabel?:string, emptyText?:string }} props
 */
export function DonutChart({ data = [], centerValue, centerLabel, emptyText = 'No data yet.' }) {
  const { theme } = useTheme();
  const palette = chartSeriesColors(theme);
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (total <= 0) return <p className="chart-empty">{emptyText}</p>;

  const shown = data.filter((d) => d.value > 0);
  const colorAt = (d, i) => resolveColor(d.color) || palette[i % palette.length];

  return (
    <div className="donut2">
      <div className="donut2__ring">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={62} outerRadius={86} paddingAngle={2} startAngle={90} endAngle={-270} stroke={surfaceColor()} strokeWidth={2}>
              {shown.map((d, i) => <Cell key={i} fill={colorAt(d, i)} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut2__center">
          <div className="donut2__value">{centerValue ?? total}</div>
          {centerLabel && <div className="donut2__label">{centerLabel}</div>}
        </div>
      </div>
      <div className="chart-legend">
        {shown.map((d, i) => (
          <span key={i} className="chart-legend__item">
            <span className="chart-legend__dot" style={{ background: colorAt(d, i) }} />
            {d.label} · <strong>{d.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
