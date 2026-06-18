import { CheckCircle2, Clock, PlugZap, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { MetricTone } from "./metric-card";

export type DataSourceBadgeState = "ready" | "loading" | "blocked" | "empty";

const STATE_TONE: Record<DataSourceBadgeState, MetricTone> = {
  ready: "success",
  loading: "info",
  blocked: "danger",
  empty: "neutral"
};

const STATE_ICON: Record<DataSourceBadgeState, ReactNode> = {
  ready: <CheckCircle2 aria-hidden="true" />,
  loading: <Clock aria-hidden="true" />,
  blocked: <ShieldAlert aria-hidden="true" />,
  empty: <PlugZap aria-hidden="true" />
};

export function DataSourceBadge({
  detail,
  label,
  state
}: {
  detail: string;
  label: string;
  state: DataSourceBadgeState;
}) {
  return (
    <span className={`data-source-badge data-source-${STATE_TONE[state]}`} aria-label={`${label}: ${detail}`}>
      {STATE_ICON[state]}
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </span>
  );
}
