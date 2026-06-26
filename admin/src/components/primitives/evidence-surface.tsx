import { type ReactNode } from "react";

export type EvidenceTone = "success" | "info" | "warning" | "danger" | "neutral";

export type EvidenceSeries = {
  label: string;
  tone: EvidenceTone;
  values: number[];
};

export type EvidenceStat = {
  label: string;
  tone?: EvidenceTone;
  value: string;
};

export type EvidenceLogEntry = {
  detail: string;
  source: string;
  time: string;
  title: string;
  tone?: EvidenceTone;
};

export type EvidenceSurfaceDataContract = {
  aggregation: string;
  backendAdapter: "pending-contract" | "not-connected" | "connected";
  emptyState: string;
  mode: "design-static" | "backend-pending" | "connected";
  ownerPage: string;
  redaction: "safe-summary-only" | "safe-events-only";
  samplingWindow: string;
  sourceName: string;
  staleState: string;
  threshold: string;
};

const CHART_WIDTH = 616;
const CHART_HEIGHT = 204;
const CHART_PLOT_LEFT = 44;
const CHART_PLOT_RIGHT = 0;
const CHART_PLOT_TOP = 8;
const CHART_PLOT_BOTTOM = 8;
const CHART_TIME_RANGE_LABELS = ["1m", "5m", "15m", "1h", "24h", "7d", "1M"];
const CHART_TIME_RANGE_DENSE_LABELS = ["1m", "15m", "1h", "7d", "1M"];
const CHART_TIME_RANGE_COMPACT_LABELS = ["1m", "1h", "1M"];
const CHART_AXIS_LABELS = ["-60m", "-48m", "-36m", "-24m", "-12m", "Now"];
const CHART_GRID_TICKS = [1, 0.75, 0.5, 0.25, 0] as const;
const CHART_Y_TICKS = [1, 0.5, 0] as const;

export function EvidenceChartPanel({
  ariaLabel,
  contract,
  description,
  footer,
  series,
  stats,
  title
}: {
  ariaLabel: string;
  contract: EvidenceSurfaceDataContract;
  description: string;
  footer?: ReactNode;
  series: EvidenceSeries[];
  stats: EvidenceStat[];
  title: string;
}) {
  const allValues = series.flatMap((item) => item.values);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const yAxisLabels = labelsForYAxis(minValue, maxValue);
  const plotRight = CHART_WIDTH - CHART_PLOT_RIGHT;
  const plotBottom = CHART_HEIGHT - CHART_PLOT_BOTTOM;

  return (
    <section
      aria-label={ariaLabel}
      className="admin-evidence-panel admin-evidence-panel-chart"
      data-figma-component="EvidenceSurface"
      data-evidence-aggregation={contract.aggregation}
      data-evidence-backend={contract.backendAdapter}
      data-evidence-chart-area-height-formula="card.height - 80"
      data-evidence-chart-area-width-formula="card.width - 56"
      data-evidence-chart-axis={CHART_AXIS_LABELS.join(" ")}
      data-evidence-chart-grid-lines={CHART_GRID_TICKS.length}
      data-evidence-chart-range-compact={CHART_TIME_RANGE_COMPACT_LABELS.join(" ")}
      data-evidence-chart-range-dense={CHART_TIME_RANGE_DENSE_LABELS.join(" ")}
      data-evidence-chart-ranges={CHART_TIME_RANGE_LABELS.join(" ")}
      data-evidence-chart-stat-count={stats.length}
      data-evidence-chart-structure="header legend plot axis"
      data-evidence-chart-y-axis={yAxisLabels.join(" ")}
      data-evidence-time-range-rule="right-aligned-collapsible"
      data-evidence-mode={contract.mode}
      data-evidence-owner-page={contract.ownerPage}
      data-evidence-redaction={contract.redaction}
      data-evidence-source={contract.sourceName}
      data-evidence-threshold={contract.threshold}
      data-evidence-window={contract.samplingWindow}
      data-ui-role="evidence"
      data-ui-surface="evidence-row"
    >
      <header className="admin-evidence-chart-header">
        <div className="admin-evidence-chart-title">
          <span aria-hidden="true" />
          <h2>{title}</h2>
        </div>
        <div className="admin-evidence-time-range" aria-label={`${title} time range density`}>
          {CHART_TIME_RANGE_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <p className="sr-only">{description}</p>
      </header>
      <div className="admin-evidence-chart-legend" aria-label={`${title} legend`}>
        {series.map((item) => (
          <span className={`admin-evidence-tone-${item.tone}`} key={item.label}>
            <i aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
      <div className="admin-evidence-chart-shell" data-ui-role="evidence-chart-shell">
        <svg
          aria-label={`${title} safe trend`}
          className="admin-evidence-chart"
          role="img"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        >
          <defs>
            <linearGradient id={`${slugify(title)}-glow`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.44)" />
            </linearGradient>
          </defs>
          <g className="admin-evidence-chart-grid" aria-hidden="true">
            {CHART_GRID_TICKS.map((tick) => {
              const y = yForTick(tick);
              return (
              <line
                key={tick}
                x1={CHART_PLOT_LEFT}
                x2={plotRight}
                y1={y}
                y2={y}
              />
              );
            })}
          </g>
          <g className="admin-evidence-chart-axes" aria-hidden="true">
            <line
              className="admin-evidence-chart-axis-line"
              x1={CHART_PLOT_LEFT}
              x2={CHART_PLOT_LEFT}
              y1={CHART_PLOT_TOP}
              y2={plotBottom}
            />
            <line
              className="admin-evidence-chart-axis-line"
              x1={CHART_PLOT_LEFT}
              x2={plotRight}
              y1={plotBottom}
              y2={plotBottom}
            />
            {CHART_AXIS_LABELS.map((label, index) => {
              const x = xForAxisTick(index);
              return (
                <line
                  className="admin-evidence-chart-axis-tick"
                  key={label}
                  x1={x}
                  x2={x}
                  y1={plotBottom}
                  y2={CHART_HEIGHT}
                />
              );
            })}
            {CHART_Y_TICKS.map((tick, index) => {
              const y = yForTick(tick);
              return (
                <g className="admin-evidence-chart-y-tick" key={tick}>
                  <line
                    className="admin-evidence-chart-axis-tick"
                    x1={CHART_PLOT_LEFT - 4}
                    x2={CHART_PLOT_LEFT}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className="admin-evidence-chart-y-label"
                    dominantBaseline="middle"
                    textAnchor="end"
                    x={CHART_PLOT_LEFT - 8}
                    y={y}
                  >
                    {yAxisLabels[index]}
                  </text>
                </g>
              );
            })}
          </g>
          {series.map((item) => (
            <polyline
              className={`admin-evidence-chart-line admin-evidence-tone-${item.tone}`}
              fill="none"
              key={item.label}
              points={pointsForValues(item.values, minValue, maxValue)}
            />
          ))}
        </svg>
        <div className="admin-evidence-axis" aria-label={`${title} x axis`}>
          {CHART_AXIS_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
      {footer ? <div className="admin-evidence-footer">{footer}</div> : null}
    </section>
  );
}

export function EvidenceLogPanel({
  ariaLabel,
  contract,
  description,
  entries,
  title
}: {
  ariaLabel: string;
  contract: EvidenceSurfaceDataContract;
  description: string;
  entries: EvidenceLogEntry[];
  title: string;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className="admin-evidence-panel admin-evidence-panel-log"
      data-figma-component="EvidenceSurface"
      data-evidence-aggregation={contract.aggregation}
      data-evidence-backend={contract.backendAdapter}
      data-evidence-log-columns="16 82 130 290"
      data-evidence-log-description-width-formula="card.width - 290 - 16"
      data-evidence-log-divider-width-formula="card.width - 32"
      data-evidence-log-header-rule="x0 y0 width-card height36 natural-title live-after-title"
      data-evidence-mode={contract.mode}
      data-evidence-owner-page={contract.ownerPage}
      data-evidence-redaction={contract.redaction}
      data-evidence-source={contract.sourceName}
      data-evidence-threshold={contract.threshold}
      data-evidence-window={contract.samplingWindow}
      data-ui-role="evidence"
      data-ui-surface="evidence-row"
    >
      <EvidencePanelHeader description={description} title={title} />
      <ol className="admin-evidence-log-list" aria-label={`${title} safe event stream`}>
        {entries.map((entry) => (
          <li
            aria-label={`${entry.time} ${statusLabelForTone(entry.tone)} ${entry.title}. ${entry.detail}. Source: ${entry.source}`}
            className={`admin-evidence-log-entry admin-evidence-tone-${entry.tone ?? "neutral"}`}
            key={`${entry.time}:${entry.title}`}
          >
            <span className="admin-evidence-log-time">{entry.time}</span>
            <span className="admin-evidence-log-status">{statusLabelForTone(entry.tone)}</span>
            <strong title={entry.source}>{entry.title}</strong>
            <p>{entry.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EvidencePanelHeader({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  return (
    <header className="admin-evidence-panel-head">
      <span>Evidence</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function pointsForValues(values: number[], minValue: number, maxValue: number) {
  const valueRange = Math.max(maxValue - minValue, 1);
  const step = values.length > 1
    ? (CHART_WIDTH - CHART_PLOT_LEFT - CHART_PLOT_RIGHT) / (values.length - 1)
    : 0;
  const plotBottom = CHART_HEIGHT - CHART_PLOT_BOTTOM;
  const plotHeight = CHART_HEIGHT - CHART_PLOT_TOP - CHART_PLOT_BOTTOM;

  return values.map((value, index) => {
    const x = CHART_PLOT_LEFT + step * index;
    const y = plotBottom - ((value - minValue) / valueRange) * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function yForTick(tick: typeof CHART_GRID_TICKS[number]) {
  const plotBottom = CHART_HEIGHT - CHART_PLOT_BOTTOM;
  const plotHeight = CHART_HEIGHT - CHART_PLOT_TOP - CHART_PLOT_BOTTOM;
  return plotBottom - tick * plotHeight;
}

function xForAxisTick(index: number) {
  const plotRight = CHART_WIDTH - CHART_PLOT_RIGHT;
  const step = (plotRight - CHART_PLOT_LEFT) / (CHART_AXIS_LABELS.length - 1);
  return CHART_PLOT_LEFT + step * index;
}

function labelsForYAxis(minValue: number, maxValue: number) {
  const middleValue = minValue + (maxValue - minValue) / 2;
  return [maxValue, middleValue, minValue].map(formatAxisValue);
}

function formatAxisValue(value: number) {
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(0);
  }

  return value.toFixed(1);
}

function statusLabelForTone(tone: EvidenceTone = "neutral") {
  switch (tone) {
    case "success":
      return "OK";
    case "info":
      return "INFO";
    case "warning":
      return "WARN";
    case "danger":
      return "ERROR";
    case "neutral":
    default:
      return "SAFE";
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
