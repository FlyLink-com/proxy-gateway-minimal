import { useEffect, useState, type FormEvent } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  AliyunGateDecision,
  AliyunGateDecisionPacket,
  AliyunGateEvidenceSummary,
  ProviderFirewallEvidenceInput,
  SubscriptionOverview
} from "../features/subscriptions/types";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to load overview.";
}

export function OverviewPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiClient
      .overview()
      .then((result) => {
        if (!cancelled) setOverview(result);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Service overview</h2>
          <p className="muted">Private subscription-control platform summary.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <div className="alert">Loading overview...</div> : null}

      <div className="metric-grid">
        <Metric label="Total" value={overview?.total ?? 0} />
        <Metric label="Active" value={overview?.active ?? 0} />
        <Metric label="Expiring" value={overview?.expiring ?? 0} />
        <Metric label="Disabled / expired" value={(overview?.disabled ?? 0) + (overview?.expired ?? 0)} />
      </div>

      <div className="page-heading">
        <div>
          <h2>Subscription distribution</h2>
          <p className="muted">Repository-configured V2 rendering readiness for operator review.</p>
        </div>
      </div>
      <div className="metric-grid">
        <Metric label="Readiness" value={overview?.distribution.ready ? "Ready" : "Blocked"} />
        <Metric label="Eligible nodes" value={overview?.distribution.eligibleNodes ?? 0} />
        <Metric label="Blocked nodes" value={overview?.distribution.blockedNodes ?? 0} />
        <Metric label="Blockers" value={overview?.distribution.blockers.length ?? 0} />
      </div>
      {overview?.distribution.blockers.length ? (
        <div className="alert alert-error">
          {overview.distribution.blockers.join(", ")}
        </div>
      ) : null}

      <AliyunGateReviewPanel apiClient={apiClient} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AliyunGateReviewPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [gatePacket, setGatePacket] = useState<AliyunGateDecisionPacket | null>(null);
  const [evidence, setEvidence] = useState<AliyunGateEvidenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [evidenceForm, setEvidenceForm] = useState<ProviderFirewallEvidenceInput>({
    hasRollbackSnapshot: false,
    hasManagementSourceDecision: false,
    hasWgHomeDecision: false
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setMessage("");
    Promise.all([apiClient.getAliyunGates(), apiClient.getAliyunGateEvidence()])
      .then(([nextGatePacket, nextEvidence]) => {
        if (cancelled) return;
        setGatePacket(nextGatePacket);
        setEvidence(nextEvidence);
        const providerFirewall = nextEvidence?.providerFirewall;
        if (providerFirewall) {
          setEvidenceForm({
            hasRollbackSnapshot: providerFirewall.hasRollbackSnapshot,
            hasManagementSourceDecision: providerFirewall.hasManagementSourceDecision,
            hasWgHomeDecision: providerFirewall.hasWgHomeDecision
          });
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  async function refreshAfterEvidenceRecord() {
    const [nextGatePacket, nextEvidence] = await Promise.all([
      apiClient.getAliyunGates(),
      apiClient.getAliyunGateEvidence()
    ]);
    setGatePacket(nextGatePacket);
    setEvidence(nextEvidence);
  }

  async function handleEvidenceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const nextEvidence = await apiClient.recordProviderFirewallEvidence(evidenceForm);
      setEvidence(nextEvidence);
      await refreshAfterEvidenceRecord();
      setMessage("Provider-firewall evidence recorded.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  const providerFirewall = evidence?.providerFirewall ?? null;
  const readyGateCount = gatePacket?.gates.filter((gate) => gate.status === "ready_for_operator_approval").length ?? 0;
  const blockerCount = gatePacket?.gates.reduce((count, gate) => count + gate.blockers.length, 0) ?? 0;

  return (
    <section className="gate-review-card" aria-labelledby="aliyun-gates-heading">
      <div className="page-heading">
        <div>
          <h2 id="aliyun-gates-heading">Aliyun promotion gates</h2>
          <p className="muted">
            Repository-only decision surface for the next A-tier Aliyun gates.
          </p>
        </div>
      </div>

      <div className="alert">
        No A-tier execution buttons are exposed; this panel only shows protected decision metadata and records boolean evidence.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert">{message}</div> : null}
      {loading ? <div className="alert">Loading Aliyun gate review...</div> : null}

      <div className="metric-grid">
        <Metric label="Gate packet" value={gatePacket?.status ?? "Unknown"} />
        <Metric label="Ready gates" value={readyGateCount} />
        <Metric label="Blocked gates" value={(gatePacket?.gates.length ?? 0) - readyGateCount} />
        <Metric label="Blockers" value={blockerCount} />
      </div>

      <div className="gate-grid">
        <div className="gate-list">
          {(gatePacket?.gates ?? []).map((gate) => (
            <GateRow key={gate.id} gate={gate} />
          ))}
        </div>

        <form className="gate-evidence-form" onSubmit={handleEvidenceSubmit}>
          <div>
            <h3>Provider-firewall evidence</h3>
            <p className="muted">
              Store only rollback, management-source, and wg-home decision booleans for the gate packet.
            </p>
          </div>

          <div className="gate-evidence-summary">
            <Metric label="Evidence status" value={providerFirewall?.status ?? "not_recorded"} />
            <Metric label="Raw rules echoed" value={providerFirewall?.rawRulesEchoed ? "Yes" : "No"} />
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={evidenceForm.hasRollbackSnapshot}
              onChange={(event) =>
                setEvidenceForm((current) => ({ ...current, hasRollbackSnapshot: event.target.checked }))
              }
            />
            <span>Rollback snapshot recorded</span>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={evidenceForm.hasManagementSourceDecision}
              onChange={(event) =>
                setEvidenceForm((current) => ({
                  ...current,
                  hasManagementSourceDecision: event.target.checked
                }))
              }
            />
            <span>Management source decision recorded</span>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={evidenceForm.hasWgHomeDecision}
              onChange={(event) =>
                setEvidenceForm((current) => ({ ...current, hasWgHomeDecision: event.target.checked }))
              }
            />
            <span>wg-home decision recorded</span>
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Recording..." : "Record provider-firewall evidence"}
          </button>
        </form>
      </div>

      {gatePacket?.notAuthorized.length ? (
        <div className="gate-boundary">
          <strong>Not authorized by this UI</strong>
          <ul>
            {gatePacket.notAuthorized.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function GateRow({ gate }: { gate: AliyunGateDecision }) {
  return (
    <article className="gate-row">
      <div>
        <strong>{gate.label}</strong>
        <span className={`status-badge ${gate.status === "ready_for_operator_approval" ? "status-active" : "status-disabled"}`}>
          {gate.status}
        </span>
      </div>
      <p className="muted">Risk {gate.risk} gate. Source: {gate.sourceDoc}</p>
      {gate.blockers.length ? (
        <ul className="gate-blockers">
          {gate.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No current blockers in the packet.</p>
      )}
      {gate.approvalRequired ? (
        <p className="approval-phrase">Approval required; phrase available in the source runbook.</p>
      ) : null}
    </article>
  );
}
