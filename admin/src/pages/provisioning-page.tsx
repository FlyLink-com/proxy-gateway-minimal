import { useState, type FormEvent } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type { ProvisioningFormInput, ProvisioningFormPreview } from "../features/subscriptions/types";

function nextWeekIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Provisioning preview failed.";
}

export function ProvisioningPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [approvalRef, setApprovalRef] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerChannel, setCustomerChannel] = useState("manual-intake");
  const [displayName, setDisplayName] = useState("");
  const [plan, setPlan] = useState("pilot");
  const [expiresAt, setExpiresAt] = useState(nextWeekIsoDate());
  const [nodeId, setNodeId] = useState("channel-lab-b-tuic");
  const [note, setNote] = useState("preproduction-canary");
  const [preview, setPreview] = useState<ProvisioningFormPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setPreview(null);

    const input: ProvisioningFormInput = {
      approvalRef: approvalRef.trim(),
      customerLabel: customerLabel.trim(),
      customerEmail: customerEmail.trim(),
      customerChannel: customerChannel.trim(),
      subscriptionLabel: displayName.trim(),
      plan: plan.trim(),
      expiresAt,
      nodeId: nodeId.trim(),
      note: note.trim()
    };

    try {
      setPreview(await apiClient.previewProvisioningForm(input));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Operator provisioning</h2>
          <p className="muted">Local-only form preview for CLI-controlled subscription issuance.</p>
        </div>
      </div>

      <section className="gate-review-card" aria-labelledby="provisioning-form-heading">
        <div className="page-heading">
          <div>
            <h2 id="provisioning-form-heading">Provisioning form</h2>
            <p className="muted">Generate safe issuance input for CLI dry-run. This page does not execute issuance.</p>
          </div>
        </div>

        <div className="alert">
          Fixed controls: quantity is 1, opaque artifact creation is required, and handoff is operator visible-once.
        </div>
        {error ? <div className="alert alert-error">{error}</div> : null}

        <form className="form-stack" onSubmit={submit}>
          <label>
            <span>Approval reference</span>
            <input
              value={approvalRef}
              onChange={(event) => setApprovalRef(event.target.value)}
              placeholder="PR-265"
              required
            />
          </label>
          <label>
            <span>Customer label</span>
            <input
              value={customerLabel}
              onChange={(event) => setCustomerLabel(event.target.value)}
              placeholder="operator-visible customer label"
              required
            />
          </label>
          <label>
            <span>Customer email</span>
            <input
              type="email"
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              placeholder="customer@example.com"
              required
            />
          </label>
          <label>
            <span>Customer channel</span>
            <input
              value={customerChannel}
              onChange={(event) => setCustomerChannel(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Subscription label</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="customer-alpha-preproduction"
              required
            />
          </label>
          <label>
            <span>Plan</span>
            <input value={plan} onChange={(event) => setPlan(event.target.value)} required />
          </label>
          <label>
            <span>Expires at</span>
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Target node</span>
            <input value={nodeId} onChange={(event) => setNodeId(event.target.value)} required />
          </label>
          <label>
            <span>Operator note</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
          </label>
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? "Generating" : "Generate safe preview"}
          </button>
        </form>
      </section>

      {preview ? <SafePreview preview={preview} /> : null}
    </div>
  );
}

function SafePreview({ preview }: { preview: ProvisioningFormPreview }) {
  return (
    <section className="gate-review-card" aria-labelledby="safe-issuance-preview-heading">
      <div className="page-heading">
        <div>
          <h2 id="safe-issuance-preview-heading">Safe issuance preview</h2>
          <p className="muted">Use this summary for CLI dry-run preparation only.</p>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Status" value={preview.status} />
        <Metric label="Next action" value={preview.execution.nextAction} />
        <Metric label="CLI command" value={preview.execution.command} />
        <Metric label="Customer ref" value={preview.customerRef} />
      </div>

      {preview.blockers.length ? (
        <div className="alert alert-error">{preview.blockers.join(", ")}</div>
      ) : null}

      <div className="alert">
        No production mutation. No database mutation. No public Admin. Real issuance still requires exact Risk A
        approval and the CLI handoff path.
      </div>

      {preview.issuanceInput ? (
        <pre className="visible-once" aria-label="Safe issuance input JSON">
          {JSON.stringify(preview.issuanceInput, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
