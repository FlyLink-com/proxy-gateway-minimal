import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  PortalAccessApprovalPreview,
  PortalAccessRequestStatus,
  PortalAccessRequestSummary
} from "../features/subscriptions/types";
import { errorMessage } from "../lib/errors";

type StatusFilter = "all" | PortalAccessRequestStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All requests" },
  { value: "pending_admin_review", label: "Pending review" },
  { value: "approved_pending_delivery", label: "Approved" },
  { value: "delivered", label: "Delivered" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" }
];

function countStatus(items: PortalAccessRequestSummary[], status: PortalAccessRequestStatus) {
  return items.filter((item) => item.status === status).length;
}

function safeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "not recorded";
  }
  return value;
}

export function PortalRequestsPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [items, setItems] = useState<PortalAccessRequestSummary[]>([]);
  const [selectedRef, setSelectedRef] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [approvalRef, setApprovalRef] = useState("");
  const [reviewedByRef, setReviewedByRef] = useState("operator_safe_ref");
  const [nodeId, setNodeId] = useState("channel-lab-b-tuic");
  const [preview, setPreview] = useState<PortalAccessApprovalPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

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
          setError(errorMessage(requestError, "Portal request load failed."));
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

  const statusSummary = useMemo(() => ({
    total: items.length,
    pending: countStatus(items, "pending_admin_review"),
    approved: countStatus(items, "approved_pending_delivery"),
    delivered: countStatus(items, "delivered"),
    rejected: countStatus(items, "rejected")
  }), [items]);

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
      setError(errorMessage(requestError, "Approval preview failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Portal requests</h2>
          <p className="muted">Administrator review queue for trial, monthly, and yearly access requests.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="gate-review-card" aria-label="Request management">
        <div className="page-heading">
          <div>
            <h3>Request management</h3>
            <p className="muted">Safe queue view only. Approval preview does not issue artifacts or mutate runtime state.</p>
          </div>
          <label className="inline-filter">
            <span>Status filter</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="metric-grid">
          <div className="metric-card">
            <span>Total requests</span>
            <strong>{statusSummary.total}</strong>
          </div>
          <div className="metric-card">
            <span>Pending review</span>
            <strong>{statusSummary.pending}</strong>
          </div>
          <div className="metric-card">
            <span>Approved</span>
            <strong>{statusSummary.approved}</strong>
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

      <section className="gate-review-card" aria-label="Portal request queue">
        {filteredItems.length === 0 ? (
          <div className="alert">No portal requests match this status filter.</div>
        ) : null}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Duration</th>
                <th>User ref</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button className="link-button" type="button" onClick={() => setSelectedRef(item.id)}>
                      {item.id}
                    </button>
                  </td>
                  <td>{item.planLabel}</td>
                  <td>{item.status}</td>
                  <td>{item.durationDays} days</td>
                  <td>{item.portalUserRef}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRequest ? (
        <section className="gate-review-card" aria-label="Selected request detail">
          <h3>Selected request detail</h3>
          <dl className="detail-grid">
            <div>
              <dt>Request ref</dt>
              <dd>{selectedRequest.id}</dd>
            </div>
            <div>
              <dt>User ref</dt>
              <dd>{selectedRequest.portalUserRef}</dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{selectedRequest.planLabel}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selectedRequest.status}</dd>
            </div>
            <div>
              <dt>Prior trial</dt>
              <dd>{safeValue(selectedRequest.priorTrialState)}</dd>
            </div>
            <div>
              <dt>Reviewed by</dt>
              <dd>{safeValue(selectedRequest.reviewedByRef)}</dd>
            </div>
            <div>
              <dt>Reason code</dt>
              <dd>{safeValue(selectedRequest.safeReasonCode)}</dd>
            </div>
            <div>
              <dt>Entitlement ref</dt>
              <dd>{safeValue(selectedRequest.entitlementRef)}</dd>
            </div>
            <div>
              <dt>Access grant ref</dt>
              <dd>{safeValue(selectedRequest.accessGrantRef)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{selectedRequest.updatedAt}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="gate-review-card" aria-label="Portal request approval preview">
        <form className="form-stack" onSubmit={submitPreview}>
          <label>
            <span>Request ref</span>
            <select
              value={selectedRequest?.id ?? ""}
              onChange={(event) => setSelectedRef(event.target.value)}
              required
            >
              {selectedRequest ? null : <option value="">No request selected</option>}
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.id}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Approval reference</span>
            <input value={approvalRef} onChange={(event) => setApprovalRef(event.target.value)} required />
          </label>
          <label>
            <span>Operator ref</span>
            <input value={reviewedByRef} onChange={(event) => setReviewedByRef(event.target.value)} required />
          </label>
          <label>
            <span>Target node</span>
            <input value={nodeId} onChange={(event) => setNodeId(event.target.value)} required />
          </label>
          <button className="primary-button" type="submit" disabled={pending || !selectedRequest}>
            {pending ? "Generating" : "Generate approval preview"}
          </button>
        </form>
      </section>

      {preview ? (
        <section className="gate-review-card" aria-label="Safe approval preview">
          <div className="metric-grid">
            <div className="metric-card">
              <span>Status</span>
              <strong>{preview.status}</strong>
            </div>
            <div className="metric-card">
              <span>Approval</span>
              <strong>{preview.approvalRef}</strong>
            </div>
          </div>
          <div className="alert">
            Safe preview only. Real delivery still requires administrator-controlled issuance and handoff.
          </div>
          <pre className="visible-once" aria-label="Safe approval preview JSON">
            {JSON.stringify(preview.issuanceInput, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
