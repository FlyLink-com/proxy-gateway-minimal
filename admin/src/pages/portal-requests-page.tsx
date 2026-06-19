import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  PortalAccessApprovalPreview,
  PortalAccessRequestStatus,
  PortalAccessRequestSummary
} from "../features/subscriptions/types";
import {
  buildPortalRequestCaseCandidates,
  topCaseCandidates
} from "../features/admin-case-workbench/case-candidates";
import {
  CaseDetailPanel,
  CaseQueue
} from "../features/admin-case-workbench/case-workbench";
import { errorMessage } from "../lib/errors";

type StatusFilter = "all" | PortalAccessRequestStatus;
type StatusSummary = {
  total: number;
  pending: number;
  pendingDelivery: number;
  delivered: number;
  rejected: number;
};

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending_admin_review", label: "Pending review" },
  { value: "approved_pending_delivery", label: "Pending delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" }
];

const STATUS_LABELS: Record<PortalAccessRequestStatus, string> = {
  pending_admin_review: "Pending review",
  approved_pending_delivery: "Pending delivery",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
  revoked: "Revoked"
};

const NEXT_ACTION_LABELS: Record<PortalAccessRequestStatus, string> = {
  pending_admin_review: "Review request",
  approved_pending_delivery: "Perform delivery",
  delivered: "Monitor resource",
  rejected: "No action",
  cancelled: "No action",
  expired: "Review expiry",
  revoked: "Review revocation"
};

const DELIVERY_CHANNEL_OPTIONS = [
  { value: "stable-node-a", label: "Default resource channel" }
];
const BYTES_PER_GB = 1024 * 1024 * 1024;

type AccountSupervisionRow = {
  portalUserRef: string;
  resourceCount: number;
  pendingCount: number;
  deliveredCount: number;
  quotaRisk: string;
  lastUpdatedAt: string | null;
};

function countStatus(items: PortalAccessRequestSummary[], status: PortalAccessRequestStatus) {
  return items.filter((item) => item.status === status).length;
}

function safeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }
  return value;
}

function statusLabel(status: string) {
  return STATUS_LABELS[status as PortalAccessRequestStatus] ?? "Unknown status";
}

function nextActionLabel(status: string) {
  return NEXT_ACTION_LABELS[status as PortalAccessRequestStatus] ?? "Manual review";
}

function durationLabel(days: number) {
  return `${days} days`;
}

function formatTrafficBytes(bytes: number | null | undefined) {
  const safeBytes = Number.isFinite(bytes) && Number(bytes) > 0 ? Number(bytes) : 0;
  if (safeBytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = safeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted = unitIndex === 0 || value >= 10
    ? Math.round(value).toString()
    : value.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${units[unitIndex]}`;
}

function formatTrafficLimitBytes(bytes: number | null | undefined) {
  const safeBytes = Number.isFinite(bytes) && Number(bytes) > 0 ? Number(bytes) : 0;
  return safeBytes > 0 ? formatTrafficBytes(safeBytes) : "Unlimited";
}

function trafficLimitBytesForRequest(request: PortalAccessRequestSummary | null) {
  if (!request) return 0;
  return request.trafficLimitBytes ?? request.usage?.totalBytes ?? 0;
}

function trafficLimitSourceLabel(request: PortalAccessRequestSummary) {
  if (Number.isFinite(request.trafficLimitBytes) && Number(request.trafficLimitBytes) > 0) {
    return "Order coverage";
  }
  if (Number.isFinite(request.usage?.totalBytes) && Number(request.usage?.totalBytes) > 0) {
    return "Collection default";
  }
  return "Unset";
}

function usageTotalLabel(request: PortalAccessRequestSummary) {
  if (!request.usage) return "Not collected";
  return `${formatTrafficBytes(request.usage.usedBytes)} / ${formatTrafficLimitBytes(trafficLimitBytesForRequest(request))}`;
}

function usageCoverageLabel(request: PortalAccessRequestSummary) {
  const usage = request.usage;
  if (!usage) return "Not collected";
  return `Measured ${usage.measuredChannelCount}/${usage.channelCount} channels`;
}

function usageStatusLabel(request: PortalAccessRequestSummary) {
  const usage = request.usage;
  if (!usage) return "Not collected";
  if (usage.status === "over_limit") return "Over limit";
  if (usage.status === "within_limit") return "Normal";
  if (usage.status === "unmetered") return "Unmetered";
  return "Needs review";
}

function collectionStatusLabel(request: PortalAccessRequestSummary) {
  const status = request.usage?.collectionStatus;
  if (!status) return "Not collected";
  const labels: Record<string, string> = {
    measured: "Collection normal",
    measured_zero: "Zero usage",
    stale: "Delayed",
    not_collected: "Not collected",
    collector_disabled: "Collection off"
  };
  return labels[status] ?? "Needs review";
}

function accountLifecycleLabel() {
  return "Waiting for account-state backend";
}

function resourceCountLabel(count: number) {
  return `${count} resources`;
}

function accountQuotaRiskLabel(items: PortalAccessRequestSummary[]) {
  if (items.some((item) => item.usage?.status === "over_limit")) return "Over limit present";
  if (items.some((item) => ["stale", "not_collected", "collector_disabled"].includes(item.usage?.collectionStatus ?? ""))) {
    return "Collection anomaly";
  }
  return "Normal";
}

function buildAccountRows(items: PortalAccessRequestSummary[]): AccountSupervisionRow[] {
  const rows = new Map<string, PortalAccessRequestSummary[]>();
  for (const item of items) {
    const current = rows.get(item.portalUserRef) ?? [];
    current.push(item);
    rows.set(item.portalUserRef, current);
  }
  return Array.from(rows.entries()).map(([portalUserRef, accountItems]) => ({
    portalUserRef,
    resourceCount: accountItems.length,
    pendingCount: accountItems.filter((item) => (
      item.status === "pending_admin_review" || item.status === "approved_pending_delivery"
    )).length,
    deliveredCount: accountItems.filter((item) => item.status === "delivered").length,
    quotaRisk: accountQuotaRiskLabel(accountItems),
    lastUpdatedAt: accountItems.reduce<string | null>((latest, item) => {
      if (!latest) return item.updatedAt;
      return new Date(item.updatedAt).getTime() > new Date(latest).getTime() ? item.updatedAt : latest;
    }, null)
  }));
}

function quotaInputValue(bytes: number | null | undefined) {
  const safeBytes = Number.isFinite(bytes) && Number(bytes) > 0 ? Number(bytes) : 0;
  if (safeBytes === 0) return "0";
  const gb = safeBytes / BYTES_PER_GB;
  return Number.isInteger(gb) ? String(gb) : gb.toFixed(2).replace(/\.?0+$/, "");
}

function deliveryRecordLabel(value: string | null | undefined) {
  return value ? "Record exists" : "Not generated";
}

function auditRecordLabel(value: string | null | undefined) {
  return value ? "Recorded" : "Not recorded";
}

function reasonLabel(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    approved: "Approved",
    rejected: "Rejected",
    trial_already_used: "Trial already used",
    admin_review_required: "Needs handling"
  };
  return labels[normalized] ?? "Recorded";
}

function trialStateLabel(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    unused: "Unused",
    used: "Used",
    consumed: "Used",
    unknown: "Not recorded"
  };
  return labels[normalized] ?? "Recorded";
}

function deliveryChannelLabel(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  return DELIVERY_CHANNEL_OPTIONS.find((option) => option.value === normalized)?.label ?? "Selected channel";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function previewField(preview: PortalAccessApprovalPreview, key: string) {
  const value = preview.issuanceInput[key];
  return typeof value === "string" || typeof value === "number" ? value : "Not recorded";
}

type TrafficLimitFormState = {
  limitGb: string;
  reviewedByRef: string;
  reasonCode: string;
  message: string;
  pending: boolean;
  setLimitGb: (value: string) => void;
  setReviewedByRef: (value: string) => void;
  setReasonCode: (value: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

function useTrafficLimitForm({
  apiClient,
  selectedRequest,
  onRequestUpdated,
  onError
}: {
  apiClient: AdminApiClient;
  selectedRequest: PortalAccessRequestSummary | null;
  onRequestUpdated: (request: PortalAccessRequestSummary) => void;
  onError: (message: string) => void;
}): TrafficLimitFormState {
  const [limitGb, setLimitGb] = useState("0");
  const [reviewedByRef, setReviewedByRef] = useState("");
  const [reasonCode, setReasonCode] = useState("plan_change");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLimitGb(quotaInputValue(trafficLimitBytesForRequest(selectedRequest)));
    setMessage("");
  }, [selectedRequest?.id, selectedRequest?.trafficLimitBytes, selectedRequest?.usage?.totalBytes]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest) return;
    const parsedGb = Number(limitGb);
    if (!Number.isFinite(parsedGb) || parsedGb < 0) {
      onError("Quota must be a non-negative number.");
      return;
    }
    setPending(true);
    onError("");
    setMessage("");
    try {
      const trafficLimitBytes = Math.round(parsedGb * BYTES_PER_GB);
      const update = await apiClient.updatePortalAccessRequestTrafficLimit(selectedRequest.id, {
        trafficLimitBytes,
        reviewedByRef: reviewedByRef.trim(),
        reasonCode: reasonCode.trim()
      });
      onRequestUpdated({
        ...selectedRequest,
        ...update.request,
        id: selectedRequest.id
      });
      setLimitGb(quotaInputValue(update.quota.trafficLimitBytes));
      setMessage("Quota updated.");
    } catch (requestError) {
      onError(errorMessage(requestError, "Quota update failed."));
    } finally {
      setPending(false);
    }
  }

  return {
    limitGb,
    reviewedByRef,
    reasonCode,
    message,
    pending,
    setLimitGb,
    setReviewedByRef,
    setReasonCode,
    submit
  };
}

function TrafficLimitSection({
  request,
  form
}: {
  request: PortalAccessRequestSummary;
  form: TrafficLimitFormState;
}) {
  return (
    <section className="gate-review-card" aria-label="Traffic quota">
      <div>
        <h3>Traffic quota</h3>
        <p className="muted">Quota changes update control-plane records only; over-limit, delay, and zero-usage decisions are driven by usage collection facts.</p>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>Quota source</span>
          <strong>{trafficLimitSourceLabel(request)}</strong>
        </div>
        <div className="metric-card">
          <span>Current quota</span>
          <strong>{formatTrafficLimitBytes(trafficLimitBytesForRequest(request))}</strong>
        </div>
        <div className="metric-card">
          <span>Used / total</span>
          <strong>{usageTotalLabel(request)}</strong>
        </div>
        <div className="metric-card">
          <span>Collection coverage</span>
          <strong>{usageCoverageLabel(request)}</strong>
        </div>
      </div>
      <div className="warning-chip-list" aria-label="Quota status">
        <span className="warning-chip">{usageStatusLabel(request)}</span>
        <span className="warning-chip">{collectionStatusLabel(request)}</span>
        <span className="warning-chip">Collection time {formatDateTime(request.usage?.updatedAt)}</span>
      </div>
      {form.message ? <div className="alert">{form.message}</div> : null}
      <form className="form-stack" onSubmit={form.submit}>
        <label>
          <span>Quota GB</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={form.limitGb}
            onChange={(event) => form.setLimitGb(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Quota operator</span>
          <input
            value={form.reviewedByRef}
            onChange={(event) => form.setReviewedByRef(event.target.value)}
            placeholder="operator_safe_ref"
            required
          />
        </label>
        <label>
          <span>Reason code</span>
          <input
            value={form.reasonCode}
            onChange={(event) => form.setReasonCode(event.target.value)}
            placeholder="plan_change"
            required
          />
        </label>
        <button className="primary-button" type="submit" disabled={form.pending}>
          {form.pending ? "Saving" : "Save quota"}
        </button>
      </form>
    </section>
  );
}

function OrderOverviewSection({
  statusFilter,
  statusSummary,
  onStatusFilterChange
}: {
  statusFilter: StatusFilter;
  statusSummary: StatusSummary;
  onStatusFilterChange: (value: StatusFilter) => void;
}) {
  return (
    <section className="gate-review-card" aria-label="Supervision overview">
      <div className="page-heading">
        <div>
          <h3>Supervision overview</h3>
          <p className="muted">Summarizes access-resource state by user account for supervision and anomaly handling only.</p>
        </div>
        <label className="inline-filter">
          <span>Status filter</span>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}>
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>{filter.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>All resource orders</span>
          <strong>{statusSummary.total}</strong>
        </div>
        <div className="metric-card">
          <span>Pending review</span>
          <strong>{statusSummary.pending}</strong>
        </div>
        <div className="metric-card">
          <span>Pending delivery</span>
          <strong>{statusSummary.pendingDelivery}</strong>
        </div>
        <div className="metric-card">
          <span>Delivered</span>
          <strong>{statusSummary.delivered}</strong>
        </div>
        <div className="metric-card">
          <span>Rejected</span>
          <strong>{statusSummary.rejected}</strong>
        </div>
      </div>
    </section>
  );
}

function AccountSupervisionSection({
  rows
}: {
  rows: AccountSupervisionRow[];
}) {
  return (
    <section className="gate-review-card" aria-label="User account supervision">
      <div>
        <h3>User account supervision</h3>
        <p className="muted">Account creation, enablement, and disablement belong to the backend account model; this view groups resources and quota risk by account for now.</p>
      </div>
      {rows.length === 0 ? (
        <div className="alert">No user accounts are available for supervision.</div>
      ) : null}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>User account</th>
              <th>Account lifecycle</th>
              <th>Resource orders</th>
              <th>Pending resources</th>
              <th>Delivered resources</th>
              <th>Quota risk</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.portalUserRef}>
                <td>{row.portalUserRef}</td>
                <td>{accountLifecycleLabel()}</td>
                <td>{resourceCountLabel(row.resourceCount)}</td>
                <td>{row.pendingCount}</td>
                <td>{row.deliveredCount}</td>
                <td>{row.quotaRisk}</td>
                <td>{formatDateTime(row.lastUpdatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderListSection({
  items,
  onSelect
}: {
  items: PortalAccessRequestSummary[];
  onSelect: (requestId: string) => void;
}) {
  return (
    <section className="gate-review-card" aria-label="User resource list">
      <div>
        <h3>User resource list</h3>
        <p className="muted">Review access resources by user account; select a row to inspect entitlements, subscription artifacts, and usage state.</p>
      </div>
      {items.length === 0 ? (
        <div className="alert">No user resources match the current state.</div>
      ) : null}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Resource / order ID</th>
              <th>User account</th>
              <th>Resource plan</th>
              <th>Resource / order lifecycle</th>
              <th>Traffic quota</th>
              <th>Collection status</th>
              <th>Valid until</th>
              <th>Supervision action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <button className="link-button" type="button" onClick={() => onSelect(item.id)}>
                    {item.id}
                  </button>
                </td>
                <td>{item.portalUserRef}</td>
                <td>{item.planLabel}</td>
                <td>{statusLabel(item.status)}</td>
                <td>{formatTrafficLimitBytes(trafficLimitBytesForRequest(item))}</td>
                <td>{collectionStatusLabel(item)}</td>
                <td>{durationLabel(item.durationDays)}</td>
                <td>{nextActionLabel(item.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderDetailsSection({
  request,
  accountResourceCount
}: {
  request: PortalAccessRequestSummary;
  accountResourceCount: number;
}) {
  return (
    <section className="gate-review-card" aria-label="User resource detail">
      <div>
        <h3>User resource detail</h3>
        <p className="muted">Shows account, access entitlement, subscription artifact, and supervision state without customer contact data, subscription links, or raw delivery material.</p>
      </div>
      <h4>Account lifecycle</h4>
      <dl className="detail-grid">
        <div>
          <dt>User account</dt>
          <dd>{request.portalUserRef}</dd>
        </div>
        <div>
          <dt>Account state</dt>
          <dd>{accountLifecycleLabel()}</dd>
        </div>
        <div>
          <dt>Account disablement</dt>
          <dd>Waiting for backend account model</dd>
        </div>
        <div>
          <dt>Resource orders</dt>
          <dd>{resourceCountLabel(accountResourceCount)}</dd>
        </div>
        <div>
          <dt>Trial record</dt>
          <dd>{trialStateLabel(request.priorTrialState)}</dd>
        </div>
      </dl>

      <h4>Resource / order lifecycle</h4>
      <dl className="detail-grid">
        <div>
          <dt>Resource / order ID</dt>
          <dd>{request.id}</dd>
        </div>
        <div>
          <dt>Resource plan</dt>
          <dd>{request.planLabel}</dd>
        </div>
        <div>
          <dt>Resource state</dt>
          <dd>{statusLabel(request.status)}</dd>
        </div>
        <div>
          <dt>Supervision action</dt>
          <dd>{nextActionLabel(request.status)}</dd>
        </div>
        <div>
          <dt>Traffic quota</dt>
          <dd>{formatTrafficLimitBytes(trafficLimitBytesForRequest(request))}</dd>
        </div>
        <div>
          <dt>Used / total</dt>
          <dd>{usageTotalLabel(request)}</dd>
        </div>
        <div>
          <dt>Collection coverage</dt>
          <dd>{usageCoverageLabel(request)}</dd>
        </div>
        <div>
          <dt>Reviewer</dt>
          <dd>{auditRecordLabel(request.reviewedByRef)}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{reasonLabel(request.safeReasonCode)}</dd>
        </div>
        <div>
          <dt>Access entitlement</dt>
          <dd>{deliveryRecordLabel(request.entitlementRef)}</dd>
        </div>
        <div>
          <dt>Subscription artifact</dt>
          <dd>{deliveryRecordLabel(request.accessGrantRef)}</dd>
        </div>
        <div>
          <dt>Updated at</dt>
          <dd>{formatDateTime(request.updatedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

function DeliveryPreviewSection({
  items,
  selectedRequest,
  approvalRef,
  reviewedByRef,
  nodeId,
  pending,
  onApprovalRefChange,
  onReviewedByRefChange,
  onNodeIdChange,
  onSelectedRequestChange,
  onSubmit
}: {
  items: PortalAccessRequestSummary[];
  selectedRequest: PortalAccessRequestSummary | null;
  approvalRef: string;
  reviewedByRef: string;
  nodeId: string;
  pending: boolean;
  onApprovalRefChange: (value: string) => void;
  onReviewedByRefChange: (value: string) => void;
  onNodeIdChange: (value: string) => void;
  onSelectedRequestChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <section className="gate-review-card" aria-label="Controlled delivery preview">
      <div>
        <h3>Controlled delivery preview</h3>
        <p className="muted">Generates a safe preview only; it does not create isolated subscriptions or mutate runtime state.</p>
      </div>
      <form className="form-stack" onSubmit={onSubmit}>
        <label>
          <span>Resource / order ID</span>
          <select
            value={selectedRequest?.id ?? ""}
            onChange={(event) => onSelectedRequestChange(event.target.value)}
            required
          >
            {selectedRequest ? null : <option value="">No order selected</option>}
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.id}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Approval ref</span>
          <input
            value={approvalRef}
            onChange={(event) => onApprovalRefChange(event.target.value)}
            placeholder="Enter approval ref"
            required
          />
        </label>
        <label>
          <span>Operator</span>
          <input
            value={reviewedByRef}
            onChange={(event) => onReviewedByRefChange(event.target.value)}
            placeholder="Enter operator ref"
            required
          />
        </label>
        <label>
          <span>Resource channel</span>
          <select value={nodeId} onChange={(event) => onNodeIdChange(event.target.value)} required>
            {DELIVERY_CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={pending || !selectedRequest}>
          {pending ? "Generating" : "Generate delivery preview"}
        </button>
      </form>
    </section>
  );
}

function PreviewResultSection({
  preview,
  selectedRequest
}: {
  preview: PortalAccessApprovalPreview;
  selectedRequest: PortalAccessRequestSummary | null;
}) {
  return (
    <section className="gate-review-card" aria-label="Controlled delivery preview result">
      <div>
        <h3>Controlled delivery preview result</h3>
        <p className="muted">Preview output is for admin review; real resource delivery still requires the controlled execution path.</p>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>Result status</span>
          <strong>{statusLabel(preview.status)}</strong>
        </div>
        <div className="metric-card">
          <span>Approval ref</span>
          <strong>{auditRecordLabel(preview.approvalRef)}</strong>
        </div>
        <div className="metric-card">
          <span>Resource plan</span>
          <strong>{selectedRequest?.planLabel ?? safeValue(previewField(preview, "plan"))}</strong>
        </div>
        <div className="metric-card">
          <span>Resource channel</span>
          <strong>{deliveryChannelLabel(previewField(preview, "nodeId"))}</strong>
        </div>
      </div>
      <div className="alert">
        Preview complete. Real resource delivery still requires the controlled execution path.
      </div>
    </section>
  );
}

export function PortalRequestsPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [items, setItems] = useState<PortalAccessRequestSummary[]>([]);
  const [selectedRef, setSelectedRef] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [approvalRef, setApprovalRef] = useState("");
  const [reviewedByRef, setReviewedByRef] = useState("");
  const [nodeId, setNodeId] = useState(DELIVERY_CHANNEL_OPTIONS[0]?.value ?? "");
  const [preview, setPreview] = useState<PortalAccessApprovalPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [selectedCaseRef, setSelectedCaseRef] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiClient.listPortalAccessRequests()
      .then((requests) => {
        if (cancelled) return;
        setItems(requests);
        setSelectedRef(requests[0]?.id ?? "");
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(errorMessage(requestError, "Order loading failed."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") {
      return items;
    }
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const selectedRequest = useMemo(() => {
    return filteredItems.find((item) => item.id === selectedRef) ?? filteredItems[0] ?? null;
  }, [filteredItems, selectedRef]);

  const accountRows = useMemo(() => buildAccountRows(items), [items]);
  const caseCandidates = useMemo(() => buildPortalRequestCaseCandidates(items), [items]);
  const visibleCaseCandidates = useMemo(() => topCaseCandidates(caseCandidates, 6), [caseCandidates]);
  const selectedCase = useMemo(() => (
    visibleCaseCandidates.find((item) => item.caseRef === selectedCaseRef)
      ?? visibleCaseCandidates[0]
      ?? null
  ), [selectedCaseRef, visibleCaseCandidates]);

  useEffect(() => {
    if (visibleCaseCandidates.length === 0) {
      setSelectedCaseRef(null);
      return;
    }
    setSelectedCaseRef((current) => (
      current && visibleCaseCandidates.some((item) => item.caseRef === current)
        ? current
        : visibleCaseCandidates[0].caseRef
    ));
  }, [visibleCaseCandidates]);

  const selectedAccountResourceCount = useMemo(() => {
    if (!selectedRequest) return 0;
    return items.filter((item) => item.portalUserRef === selectedRequest.portalUserRef).length;
  }, [items, selectedRequest]);

  const statusSummary = useMemo(() => ({
    total: items.length,
    pending: countStatus(items, "pending_admin_review"),
    pendingDelivery: countStatus(items, "approved_pending_delivery"),
    delivered: countStatus(items, "delivered"),
    rejected: countStatus(items, "rejected")
  }), [items]);

  function updateRequest(updatedRequest: PortalAccessRequestSummary) {
    setItems((current) => current.map((item) => (
      item.id === updatedRequest.id
        ? { ...item, ...updatedRequest }
        : item
    )));
  }

  const trafficLimitForm = useTrafficLimitForm({
    apiClient,
    selectedRequest,
    onRequestUpdated: updateRequest,
    onError: setError
  });

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest) return;
    setPending(true);
    setError("");
    setPreview(null);
    try {
      setPreview(await apiClient.previewPortalAccessRequestApproval(selectedRequest.id, {
        approvalRef: approvalRef.trim(),
        reviewedByRef: reviewedByRef.trim(),
        nodeId: nodeId.trim()
      }));
    } catch (requestError) {
      setError(errorMessage(requestError, "Delivery preview failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>User resource supervision</h2>
          <p className="muted">Supervises access resources, usage, and anomaly handling by user account; this is not an isolated subscription creation entry.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <OrderOverviewSection
        statusFilter={statusFilter}
        statusSummary={statusSummary}
        onStatusFilterChange={setStatusFilter}
      />

      <div className="case-workbench-layout">
        <CaseQueue
          title="Accounts & Resources supervision cases"
          description="Read-only supervision candidates derived from account, order, quota, and collection state."
          cases={visibleCaseCandidates}
          selectedCaseRef={selectedCase?.caseRef ?? null}
          onSelect={setSelectedCaseRef}
        />
        <CaseDetailPanel caseItem={selectedCase} />
      </div>

      <AccountSupervisionSection rows={accountRows} />

      <OrderListSection items={filteredItems} onSelect={setSelectedRef} />

      {selectedRequest ? (
        <OrderDetailsSection request={selectedRequest} accountResourceCount={selectedAccountResourceCount} />
      ) : null}

      {selectedRequest?.entitlementRef ? (
        <TrafficLimitSection request={selectedRequest} form={trafficLimitForm} />
      ) : null}

      <DeliveryPreviewSection
        items={items}
        selectedRequest={selectedRequest}
        approvalRef={approvalRef}
        reviewedByRef={reviewedByRef}
        nodeId={nodeId}
        pending={pending}
        onApprovalRefChange={setApprovalRef}
        onReviewedByRefChange={setReviewedByRef}
        onNodeIdChange={setNodeId}
        onSelectedRequestChange={setSelectedRef}
        onSubmit={submitPreview}
      />

      {preview ? (
        <PreviewResultSection preview={preview} selectedRequest={selectedRequest} />
      ) : null}
    </div>
  );
}
