import type { ReactNode } from "react";

export type MetricTone = "success" | "warning" | "danger" | "info" | "neutral";

export function MetricCard({
  label,
  value,
  detail,
  tone,
  icon,
  trend
}: {
  label: string;
  value: number | string;
  detail: string;
  tone: MetricTone;
  icon: ReactNode;
  trend?: {
    ariaLabel?: string;
    values: number[];
  };
}) {
  return (
    <article className={`ops-metric-card ops-metric-${tone}`}>
      <div className="ops-metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <div className={trend ? "ops-metric-footer" : "ops-metric-footer ops-metric-footer-single"}>
        <small>{detail}</small>
        {trend ? <MetricSparkline ariaLabel={trend.ariaLabel ?? `${label} trend`} values={trend.values} /> : null}
      </div>
    </article>
  );
}

function MetricSparkline({ ariaLabel, values }: { ariaLabel: string; values: number[] }) {
  const boundedValues = values.length > 0 ? values : [0];
  const max = Math.max(1, ...boundedValues);
  const min = Math.min(...boundedValues);
  const range = Math.max(1, max - min);
  const points = boundedValues.map((value, index) => {
    const x = 4 + index * (84 / Math.max(1, boundedValues.length - 1));
    const y = 28 - ((value - min) / range) * 22;
    return `${x},${y}`;
  }).join(" ");

  return (
    <span className="ops-metric-trend" role="img" aria-label={ariaLabel}>
      <svg width="92" height="34" viewBox="0 0 92 34" aria-hidden="true" focusable="false">
        <polyline className="ops-metric-trend-grid" points="4,29 88,29" />
        <polyline className="ops-metric-trend-line" points={points} />
      </svg>
    </span>
  );
}
