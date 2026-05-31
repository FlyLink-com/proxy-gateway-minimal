import { useEffect, useState, type FormEvent } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  PortalAccessApprovalPreview,
  PortalAccessRequestSummary
} from "../features/subscriptions/types";
import { errorMessage } from "../lib/errors";

export function PortalRequestsPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [items, setItems] = useState<PortalAccessRequestSummary[]>([]);
  const [selectedRef, setSelectedRef] = useState("");
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

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRef) return;
    setPending(true);
    setError("");
    setPreview(null);
    try {
      setPreview(await apiClient.previewPortalAccessRequestApproval(selectedRef, {
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

      <section className="gate-review-card" aria-label="Portal request queue">
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
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
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

      <section className="gate-review-card" aria-label="Portal request approval preview">
        <form className="form-stack" onSubmit={submitPreview}>
          <label>
            <span>Request ref</span>
            <select value={selectedRef} onChange={(event) => setSelectedRef(event.target.value)} required>
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
          <button className="primary-button" type="submit" disabled={pending || !selectedRef}>
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
