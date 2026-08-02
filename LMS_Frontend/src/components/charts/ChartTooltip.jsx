/** Theme-aware Recharts tooltip (HTML, so CSS vars resolve). */
export function ChartTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label != null && label !== '' && <div className="chart-tip__label">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="chart-tip__row">
          <span className="chart-tip__dot" style={{ background: p.color || p.fill }} />
          <span className="chart-tip__name">{p.name}</span>
          <span className="chart-tip__val">{p.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
}
