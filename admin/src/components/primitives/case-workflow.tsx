import { useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "./empty-state";

export type RiskSeverity = "critical" | "warning" | "info" | "neutral";

export type RiskQueueItem = {
  ref: string;
  title: string;
  severity: RiskSeverity;
  severityLabel: string;
  objectType: string;
  objectRef: string;
  reasonLabel: string;
};

export type ObjectChainItem = {
  ref: string;
  label: string;
  objectRef: string;
  objectType: string;
  relationType: string;
};

export type ObjectTimelineItem = {
  ref: string;
  actionLabel: string;
  objectRef: string;
  objectType: string;
  occurredAtLabel: string;
  severity: RiskSeverity;
  sourceLabel: string;
  summary: string;
};

type RiskFilterKey = "all" | "critical" | "warning" | "low";

const RISK_FILTER_OPTIONS: Array<{ key: RiskFilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "critical", label: "High risk" },
  { key: "warning", label: "Medium risk" },
  { key: "low", label: "Low risk" }
];

export function RiskQueue({
  title,
  description,
  items,
  selectedRef,
  onSelect,
  countLabel = title,
  emptyTitle = "No supervision cases",
  emptyDescription = "No active candidates match the current filters.",
  emptyFilterTitle = "No matching cases",
  emptyFilterDescription = "No active candidates match the current risk filter.",
  footer,
  previewLimit
}: {
  title: string;
  description: string;
  items: RiskQueueItem[];
  selectedRef?: string | null;
  onSelect?: (itemRef: string) => void;
  countLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyFilterTitle?: string;
  emptyFilterDescription?: string;
  footer?: ReactNode;
  previewLimit?: number;
}) {
  const [severityFilter, setSeverityFilter] = useState<RiskFilterKey>("all");
  const counts = useMemo(() => riskFilterCounts(items), [items]);
  const visibleItems = useMemo(() => (
    items.filter((item) => riskMatchesFilter(item, severityFilter))
  ), [items, severityFilter]);
  const previewItems = previewLimit ? visibleItems.slice(0, previewLimit) : visibleItems;
  const hiddenPreviewCount = Math.max(visibleItems.length - previewItems.length, 0);

  return (
    <section className="case-workbench-card" aria-label={title}>
      <div className="case-section-heading">
        <div>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
        <span className="case-count" aria-label={`${countLabel} count ${items.length}`}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <RiskQueueState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          {onSelect ? (
            <div className="case-filter-row" aria-label={`${title} filters`}>
              {RISK_FILTER_OPTIONS.map((option) => (
                <button
                  aria-pressed={severityFilter === option.key}
                  className={severityFilter === option.key ? "case-filter-button case-filter-active" : "case-filter-button"}
                  key={option.key}
                  type="button"
                  onClick={() => setSeverityFilter(option.key)}
                >
                  <span>{option.label}</span>
                  <strong>{counts[option.key]}</strong>
                </button>
              ))}
            </div>
          ) : null}
          {visibleItems.length === 0 ? (
            <RiskQueueState title={emptyFilterTitle} description={emptyFilterDescription} />
          ) : (
            <div className="case-queue-list">
              {previewItems.map((item) => (
                onSelect ? (
                  <button
                    aria-pressed={item.ref === selectedRef}
                    className={item.ref === selectedRef ? "case-row case-row-active" : "case-row"}
                    key={item.ref}
                    type="button"
                    onClick={() => onSelect(item.ref)}
                  >
                    <RiskQueueRowContent item={item} />
                  </button>
                ) : (
                  <article className="case-row case-row-readonly" key={item.ref}>
                    <RiskQueueRowContent item={item} />
                  </article>
                )
              ))}
              {hiddenPreviewCount > 0 ? (
                <span className="case-preview-note">
                  {hiddenPreviewCount} more candidates are routed to the detail page.
                </span>
              ) : null}
            </div>
          )}
        </>
      )}
      {footer ? <div className="case-workbench-footer">{footer}</div> : null}
    </section>
  );
}

export function ObjectChain({
  objects,
  title = "Linked objects",
  emptyLabel = "No linked objects."
}: {
  objects: ObjectChainItem[];
  title?: string;
  emptyLabel?: string;
}) {
  return (
    <section className="case-linked-objects" aria-label={title}>
      <h4>{title}</h4>
      {objects.length === 0 ? (
        <p className="muted">{emptyLabel}</p>
      ) : (
        <div className="case-linked-list">
          {objects.map((object) => (
            <div className="case-linked-item" key={object.ref}>
              <span>{object.label}</span>
              <strong>{object.objectRef}</strong>
              <small>
                {object.relationType} · {object.objectType}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ObjectTimeline({
  events,
  title = "Object timeline",
  emptyLabel = "No object events."
}: {
  events: ObjectTimelineItem[];
  title?: string;
  emptyLabel?: string;
}) {
  return (
    <section className="case-timeline" aria-label={title}>
      <h4>{title}</h4>
      {events.length === 0 ? (
        <p className="muted">{emptyLabel}</p>
      ) : (
        <div className="case-timeline-list">
          {events.map((event) => (
            <article className="case-timeline-event" key={event.ref}>
              <span className={`case-timeline-dot case-severity-${event.severity}`} aria-hidden="true" />
              <div>
                <strong>{event.summary}</strong>
                <p className="muted">
                  {event.actionLabel} · {event.objectType} · {event.objectRef}
                </p>
                <p className="muted">
                  {event.sourceLabel} · {event.occurredAtLabel}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RiskQueueRowContent({ item }: { item: RiskQueueItem }) {
  return (
    <>
      <span className={`case-severity case-severity-${item.severity}`}>
        {item.severityLabel}
      </span>
      <span className="case-row-main">
        <strong>{item.title}</strong>
        <small>
          <span>{item.objectType}</span>
          <span> · </span>
          <span>{item.objectRef}</span>
        </small>
      </span>
      <span className="case-reason">{item.reasonLabel}</span>
    </>
  );
}

function RiskQueueState({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      chrome="case"
      description={description}
      descriptionClassName="muted"
      title={title}
    />
  );
}

function riskFilterCounts(items: RiskQueueItem[]): Record<RiskFilterKey, number> {
  return {
    all: items.length,
    critical: items.filter((item) => item.severity === "critical").length,
    warning: items.filter((item) => item.severity === "warning").length,
    low: items.filter((item) => item.severity === "info" || item.severity === "neutral").length
  };
}

function riskMatchesFilter(item: RiskQueueItem, filter: RiskFilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "low") return item.severity === "info" || item.severity === "neutral";
  return item.severity === filter;
}
