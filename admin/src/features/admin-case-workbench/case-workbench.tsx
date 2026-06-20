import { useMemo } from "react";
import {
  EmptyState as PrimitiveEmptyState,
  ObjectChain as ObjectChainPrimitive,
  ObjectTimeline as ObjectTimelinePrimitive,
  RiskQueue,
  type ObjectChainItem,
  type ObjectTimelineItem,
  type RiskQueueItem
} from "../../components/primitives";
import type {
  CaseCandidate,
  CaseObjectType,
  CaseReasonCode,
  CaseSeverity,
  LinkedObject,
  ObjectTimelineEvent
} from "./types";

const SEVERITY_LABELS: Record<CaseSeverity, string> = {
  critical: "High",
  warning: "Medium",
  info: "Info",
  neutral: "Low"
};

const REASON_LABELS: Record<CaseReasonCode, string> = {
  over_limit: "Over limit",
  near_limit: "Near limit",
  usage_zero: "Zero usage",
  usage_stale: "Collection stale",
  collector_disabled: "Collector disabled",
  not_collected: "Not collected",
  receipt_missing: "Receipt pending",
  expiry_candidate: "Expiry review",
  archive_candidate: "Archive review",
  order_pending_review: "Pending review",
  order_pending_delivery: "Pending controlled delivery"
};

const SOURCE_LABELS: Record<CaseCandidate["source"], string> = {
  portal_access_requests: "Accounts & Resources",
  subscription_usage_monitor: "Usage & Channels",
  dashboard_summary: "Operations Overview"
};

export function CaseQueue({
  title,
  description,
  cases,
  selectedCaseRef,
  onSelect
}: {
  title: string;
  description: string;
  cases: CaseCandidate[];
  selectedCaseRef?: string | null;
  onSelect?: (caseRef: string) => void;
}) {
  const queueItems = useMemo(() => cases.map(toRiskQueueItem), [cases]);

  return (
    <RiskQueue
      countLabel="Cases"
      description={description}
      emptyDescription="No active candidates match the current filters."
      emptyFilterDescription="No active candidates match the current risk filter."
      emptyFilterTitle="No matching cases"
      emptyTitle="No supervision cases"
      items={queueItems}
      onSelect={onSelect}
      selectedRef={selectedCaseRef}
      title={title}
      footer={onSelect ? (
        <>
          <button className="panel-link panel-link-disabled" type="button" disabled>
            View all cases
          </button>
          <span>Available after the durable case inbox is connected.</span>
        </>
      ) : undefined}
    />
  );
}

export function CaseDetailPanel({ caseItem }: { caseItem: CaseCandidate | null }) {
  if (caseItem === null) {
    return (
      <section className="case-detail-panel" aria-label="Case detail">
        <EmptyState title="Select a supervision case" description="Select a queue candidate to inspect evidence and object history." />
      </section>
    );
  }

  return (
    <section className="case-detail-panel" aria-label="Case detail">
      <div className="case-detail-heading">
        <div>
          <p className="case-eyebrow">{caseItem.status}</p>
          <h3>{caseItem.title}</h3>
          <p className="muted">
            {objectTypeLabel(caseItem.objectType)} · {caseItem.objectRef}
          </p>
        </div>
        <span className={`case-severity case-severity-${caseItem.severity}`}>
          {severityLabel(caseItem.severity)}
        </span>
      </div>
      <div className="case-key-grid">
        <KeyValue label="Source" value={sourceLabel(caseItem.source)} />
        <KeyValue label="Reason" value={reasonLabel(caseItem.reasonCode)} />
        <KeyValue label="Gate" value={caseItem.gateRequired ? "Separate gate required" : "Read-only review"} />
        <KeyValue label="Updated at" value={formatDateTime(caseItem.updatedAt)} />
      </div>
      <LinkedObjects objects={caseItem.linkedObjects} />
      <ObjectTimeline events={caseItem.timeline} />
      <div className="case-audit-note" aria-label="Read-only audit note">
        <strong>Audit note</strong>
        <p className="muted">Phase one is read-only for candidates and evidence; close, false-positive, archive, and note writes wait for the backend Case contract.</p>
      </div>
    </section>
  );
}

export function LinkedObjects({ objects }: { objects: LinkedObject[] }) {
  const chainItems = useMemo<ObjectChainItem[]>(() => objects.map((object) => ({
    label: object.label,
    objectRef: object.objectRef,
    objectType: objectTypeLabel(object.objectType),
    ref: `${object.relationType}:${object.objectType}:${object.objectRef}`,
    relationType: object.relationType
  })), [objects]);

  return <ObjectChainPrimitive objects={chainItems} />;
}

export function ObjectTimeline({ events }: { events: ObjectTimelineEvent[] }) {
  const timelineItems = useMemo<ObjectTimelineItem[]>(() => events.map((event) => ({
    actionLabel: actionLabel(event.action),
    objectRef: event.objectRef,
    objectType: objectTypeLabel(event.objectType),
    occurredAtLabel: formatDateTime(event.occurredAt),
    ref: event.eventRef,
    severity: event.severity,
    sourceLabel: timelineSourceLabel(event.source),
    summary: event.summary
  })), [events]);

  return <ObjectTimelinePrimitive events={timelineItems} />;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <PrimitiveEmptyState
      chrome="case"
      description={description}
      descriptionClassName="muted"
      title={title}
    />
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <PrimitiveEmptyState
      chrome="none"
      className="case-state case-error-state"
      description={message}
      descriptionClassName="muted"
      role="alert"
      title={title}
    />
  );
}

export function LoadingSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="case-loading-skeleton" aria-busy="true" aria-label={label}>
      {Array.from({ length: Math.max(0, rows) }, (_, index) => (
        <div className="case-skeleton-row" key={index} />
      ))}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="case-key-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function severityLabel(severity: CaseSeverity): string {
  return SEVERITY_LABELS[severity];
}

function reasonLabel(reasonCode: CaseReasonCode): string {
  return REASON_LABELS[reasonCode];
}

function sourceLabel(source: CaseCandidate["source"]): string {
  return SOURCE_LABELS[source];
}

function toRiskQueueItem(caseItem: CaseCandidate): RiskQueueItem {
  return {
    objectRef: caseItem.objectRef,
    objectType: objectTypeLabel(caseItem.objectType),
    reasonLabel: reasonLabel(caseItem.reasonCode),
    ref: caseItem.caseRef,
    severity: caseItem.severity,
    severityLabel: severityLabel(caseItem.severity),
    title: caseItem.title
  };
}

function timelineSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    portal_access_requests: "Accounts & Resources",
    subscription_usage_monitor: "Usage & Channels",
    dashboard_summary: "Operations Overview"
  };
  return labels[source] ?? source;
}

function objectTypeLabel(objectType: CaseObjectType): string {
  const labels: Record<CaseObjectType, string> = {
    account: "User account",
    order: "Order",
    artifact: "Subscription artifact",
    channel: "Channel",
    usage: "Usage",
    lifecycle: "Lifecycle"
  };
  return labels[objectType] ?? objectType;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    pending_admin_review: "Pending review",
    approved_pending_delivery: "Pending delivery",
    delivered: "Delivered",
    rejected: "Rejected",
    cancelled: "Cancelled",
    expired: "Expired",
    revoked: "Revoked",
    measured: "Collected",
    measured_zero: "Zero usage",
    stale: "Collection stale",
    not_collected: "Not collected",
    collector_disabled: "Collector disabled",
    over_limit: "Over limit",
    near_limit: "Near limit",
    usage_zero: "Zero usage",
    usage_stale: "Collection stale",
    receipt_missing: "Receipt pending",
    binding_present: "Binding recorded",
    unknown: "Unknown state"
  };
  return labels[action] ?? action;
}

function formatDateTime(value: string | null): string {
  if (value === null) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return value.slice(0, 16).replace("T", " ").replaceAll("-", "/");
}
