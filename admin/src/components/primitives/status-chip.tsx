import type { MetricTone } from "./metric-card";

export function StatusChip({ label, tone }: { label: string; tone: MetricTone }) {
  return (
    <span
      className={`dashboard-status-badge dashboard-status-${tone}`}
      data-figma-component="StatusChip"
      data-state-tone={tone}
      data-ui-surface="status-chip"
    >
      {label}
    </span>
  );
}
