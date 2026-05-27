import { useEffect, useState, type FormEvent } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  AccessMigrationEvidenceInput,
  AliyunGateDecision,
  AliyunGateDecisionPacket,
  AliyunGateEvidenceSummary,
  ChannelLabTargetDecision,
  ChannelLabTargetDecisionInput,
  ChannelRuntimeEvidenceBridge,
  ChannelRuntimeEvidenceBridgeInput,
  ChannelRuntimeExecutionHandoff,
  ChannelRuntimeGateWorkbench,
  ChannelSubscriptionActivationFlow,
  ChannelSubscriptionActivationFlowInput,
  ChannelSubscriptionActivationHandoff,
  ChannelSubscriptionActivationHandoffInput,
  ChannelSubscriptionActivationRecordTemplate,
  ChannelSubscriptionActivationRecordTemplateInput,
  ChannelSubscriptionActivationReadiness,
  ChannelSubscriptionActivationReadinessInput,
  ChannelSubscriptionOutputDraft,
  ChannelSubscriptionOutputDraftInput,
  ChannelSystemDecisionFlow,
  ChannelSystemReviewInput,
  CleanEdgeReadinessInput,
  CleanEdgeReadinessSummary,
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

      <ChannelSystemReviewPanel apiClient={apiClient} />
      <ChannelRuntimeEvidenceBridgePanel apiClient={apiClient} />
      <ChannelRuntimeGateWorkbenchPanel apiClient={apiClient} />
      <ChannelRuntimeExecutionHandoffPanel apiClient={apiClient} />
      <ChannelSubscriptionOutputDraftPanel apiClient={apiClient} />
      <ChannelSubscriptionActivationReadinessPanel apiClient={apiClient} />
      <ChannelSubscriptionActivationHandoffPanel apiClient={apiClient} />
      <ChannelSubscriptionActivationFlowPanel apiClient={apiClient} />
      <ChannelSubscriptionActivationRecordTemplatePanel apiClient={apiClient} />
      <ChannelLabTargetDecisionPanel apiClient={apiClient} />
      <CleanEdgeReadinessReviewPanel apiClient={apiClient} />
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

function parseChannelSystemReviewInput(value: string): ChannelSystemReviewInput {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Safe channel evidence packet must be a JSON object.");
  }
  assertSafeChannelSystemEvidence(parsed);
  return parsed as ChannelSystemReviewInput;
}

function parseChannelRuntimeEvidenceBridgeInput(value: string): ChannelRuntimeEvidenceBridgeInput {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Safe runtime evidence bridge packet must be a JSON object.");
  }
  assertSafeChannelSystemEvidence(parsed);
  return parsed as ChannelRuntimeEvidenceBridgeInput;
}

function parseChannelSubscriptionOutputDraftInput(value: string): ChannelSubscriptionOutputDraftInput {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Safe channel subscription draft packet must be a JSON object.");
  }
  try {
    assertSafeChannelSystemEvidence(parsed);
  } catch {
    throw new Error("Safe channel subscription draft packet contains forbidden runtime details.");
  }
  return parsed as ChannelSubscriptionOutputDraftInput;
}

function parseChannelSubscriptionActivationReadinessInput(value: string): ChannelSubscriptionActivationReadinessInput {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Safe channel activation readiness packet must be a JSON object.");
  }
  try {
    assertSafeChannelSystemEvidence(parsed);
  } catch {
    throw new Error("Safe channel activation readiness packet contains forbidden runtime details.");
  }
  return parsed as ChannelSubscriptionActivationReadinessInput;
}

function parseChannelSubscriptionActivationHandoffInput(value: string): ChannelSubscriptionActivationHandoffInput {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Safe channel subscription activation handoff packet must be a JSON object.");
  }
  try {
    assertSafeChannelSystemEvidence(parsed);
  } catch {
    throw new Error("Safe channel subscription activation handoff packet contains forbidden runtime details.");
  }
  return parsed as ChannelSubscriptionActivationHandoffInput;
}

function parseChannelSubscriptionActivationFlowInput(value: string): ChannelSubscriptionActivationFlowInput {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Safe channel subscription activation flow packet must be a JSON object.");
  }
  try {
    assertSafeChannelSystemEvidence(parsed);
  } catch {
    throw new Error("Safe channel subscription activation flow packet contains forbidden runtime details.");
  }
  return parsed as ChannelSubscriptionActivationFlowInput;
}

function parseChannelSubscriptionActivationRecordTemplateInput(
  value: string
): ChannelSubscriptionActivationRecordTemplateInput {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Safe channel subscription activation flow fixture must be a JSON object.");
  }
  try {
    assertSafeChannelActivationRecordTemplateEvidence(parsed);
  } catch {
    throw new Error("Safe channel subscription activation flow fixture contains forbidden runtime details.");
  }
  return parsed as ChannelSubscriptionActivationRecordTemplateInput;
}

function parseChannelLabTargetDecisionInput(value: string): ChannelLabTargetDecisionInput {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Safe channel lab target inventory packet must be a JSON object.");
  }
  assertSafeChannelSystemEvidence(parsed);
  return parsed as ChannelLabTargetDecisionInput;
}

function parseCleanEdgeReadinessInput(value: string): CleanEdgeReadinessInput {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Safe clean edge readiness packet must be a JSON object.");
  }
  try {
    assertSafeChannelSystemEvidence(parsed);
  } catch {
    throw new Error("Safe clean edge readiness packet contains forbidden runtime details.");
  }
  return parsed as CleanEdgeReadinessInput;
}

const CHANNEL_SYSTEM_FORBIDDEN_EVIDENCE_KEYS = new Set([
  "artifact",
  "artifactRef",
  "artifactReference",
  "artifactUrl",
  "credential",
  "credentials",
  "customerData",
  "customerEmail",
  "email",
  "host",
  "hosts",
  "ip",
  "ips",
  "nodeCredential",
  "password",
  "port",
  "ports",
  "rawError",
  "rawLog",
  "secret",
  "sourceIp",
  "subscriptionUrl",
  "targetHost",
  "targetPort",
  "token",
  "url",
  "userAgent"
]);

const CHANNEL_SYSTEM_FORBIDDEN_VALUE_PATTERN = /[a-z][a-z0-9+.-]*:\/\/|token=|subscriptionUrl|artifactUrl|password|credential|rawLog|rawError|secret\.example/i;
const CHANNEL_SYSTEM_IPV4_VALUE_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const CHANNEL_SYSTEM_IPV6_VALUE_PATTERN = /\b(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}\b/i;
const CHANNEL_SYSTEM_DOMAIN_VALUE_PATTERN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/i;
const CHANNEL_SYSTEM_HOST_PORT_VALUE_PATTERN = /\b(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]):\d{2,5}\b/i;
const CHANNEL_SYSTEM_PORT_LABEL_PATTERN = /^\d{2,5}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function hasForbiddenChannelSystemValue(value: string): boolean {
  if (ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  return CHANNEL_SYSTEM_FORBIDDEN_VALUE_PATTERN.test(value)
    || CHANNEL_SYSTEM_IPV4_VALUE_PATTERN.test(value)
    || CHANNEL_SYSTEM_IPV6_VALUE_PATTERN.test(value)
    || CHANNEL_SYSTEM_DOMAIN_VALUE_PATTERN.test(value)
    || CHANNEL_SYSTEM_HOST_PORT_VALUE_PATTERN.test(value)
    || CHANNEL_SYSTEM_PORT_LABEL_PATTERN.test(value)
    || value.includes("@");
}

function assertSafeChannelSystemEvidence(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSafeChannelSystemEvidence(item);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && hasForbiddenChannelSystemValue(value)) {
      throw new Error("Safe channel evidence packet contains forbidden runtime details.");
    }
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (CHANNEL_SYSTEM_FORBIDDEN_EVIDENCE_KEYS.has(key)) {
      throw new Error("Safe channel evidence packet contains forbidden runtime details.");
    }
    assertSafeChannelSystemEvidence(nestedValue);
  }
}

function assertSafeChannelActivationRecordTemplateEvidence(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSafeChannelActivationRecordTemplateEvidence(item);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && hasForbiddenChannelSystemValue(value)) {
      throw new Error("Safe channel activation record template fixture contains forbidden runtime details.");
    }
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "omittedFields") {
      continue;
    }
    if (CHANNEL_SYSTEM_FORBIDDEN_EVIDENCE_KEYS.has(key)) {
      throw new Error("Safe channel activation record template fixture contains forbidden runtime details.");
    }
    assertSafeChannelActivationRecordTemplateEvidence(nestedValue);
  }
}

function ChannelSystemReviewPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [review, setReview] = useState<ChannelSystemDecisionFlow | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelSystemReviewInput(packetText);
      const nextReview = await apiClient.reviewChannelSystem(input);
      setReview(nextReview);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setReview(null);
    } finally {
      setReviewing(false);
    }
  }

  const runtimeBlockers = review
    ? review.systemReadiness.runtimeBlockedCount + review.systemReadiness.missingRuntimeInventoryCount
    : 0;

  return (
    <section className="gate-review-card" aria-labelledby="channel-system-review-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-system-review-heading">Channel system review</h2>
          <p className="muted">Protected review surface for channel readiness packets.</p>
        </div>
      </div>

      <div className="alert">
        No runtime execution controls are exposed; this panel only reviews protected channel decision evidence.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-system-safe-evidence">Safe channel evidence packet</label>
        <textarea
          id="channel-system-safe-evidence"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"dryRunSummary":{},"measurementScore":{},"runtimeInventoryInput":{}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review channel system"}
        </button>
      </form>

      {review ? (
        <>
          <div className="metric-grid">
            <Metric label="Flow status" value={review.flowStatus} />
            <Metric label="Next action" value={review.requiredNextAction || "none"} />
            <Metric label="Canary ready" value={review.systemReadiness.canaryReadyCount} />
            <Metric label="Runtime blockers" value={runtimeBlockers} />
          </div>
          <div className="gate-boundary">
            <strong>Review boundary</strong>
            <ul>
              <li>{review.safety.advisoryOnly ? "Advisory-only artifact" : "Advisory flag missing"}</li>
              <li>{review.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{review.safety.noProductionMutation ? "No production mutation" : "Production mutation flag missing"}</li>
              <li>{review.safety.noApprovalSubmission ? "No approval submission" : "Approval submission flag missing"}</li>
              <li>{review.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {review.safety.requiresSeparateRiskAApproval
                  ? "Separate Risk A approval required"
                  : "Risk A approval flag missing"}
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ChannelRuntimeEvidenceBridgePanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [bridge, setBridge] = useState<ChannelRuntimeEvidenceBridge | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelRuntimeEvidenceBridgeInput(packetText);
      const nextBridge = await apiClient.reviewChannelRuntimeEvidence(input);
      setBridge(nextBridge);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setBridge(null);
    } finally {
      setReviewing(false);
    }
  }

  const runtimeBlockers = bridge
    ? bridge.channelSystem.systemReadiness.runtimeBlockedCount
      + bridge.channelSystem.systemReadiness.missingRuntimeInventoryCount
    : 0;

  return (
    <section className="gate-review-card" aria-labelledby="channel-runtime-evidence-bridge-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-runtime-evidence-bridge-heading">Channel runtime evidence bridge</h2>
          <p className="muted">Protected bridge from safe runtime evidence packets into channel system readiness.</p>
        </div>
      </div>

      <div className="alert">
        This bridge reviews runtime evidence only; it does not expose approval, deployment, DNS, firewall, or traffic controls.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-runtime-evidence-bridge-packet">Safe runtime evidence bridge packet</label>
        <textarea
          id="channel-runtime-evidence-bridge-packet"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"dryRunSummary":{},"measurementScore":{},"runtimeEvidenceInput":{"records":[]}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review runtime evidence bridge"}
        </button>
      </form>

      {bridge ? (
        <>
          <div className="metric-grid">
            <Metric label="Bridge mode" value={bridge.mode} />
            <Metric label="Flow status" value={bridge.channelSystem.flowStatus} />
            <Metric label="Canary ready" value={bridge.channelSystem.systemReadiness.canaryReadyCount} />
            <Metric label="Runtime blockers" value={runtimeBlockers} />
          </div>
          <div className="gate-boundary">
            <strong>Bridge boundary</strong>
            <ul>
              <li>{bridge.safety.advisoryOnly ? "Advisory-only artifact" : "Advisory flag missing"}</li>
              <li>{bridge.safety.summaryOnly ? "Summary-only runtime evidence" : "Summary-only flag missing"}</li>
              <li>{bridge.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{bridge.safety.noProductionMutation ? "No production mutation" : "Production mutation flag missing"}</li>
              <li>{bridge.safety.noApprovalSubmission ? "No approval submission" : "Approval submission flag missing"}</li>
              <li>{bridge.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {bridge.safety.requiresSeparateRiskAApproval
                  ? "Separate Risk A approval required"
                  : "Risk A approval flag missing"}
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ChannelRuntimeGateWorkbenchPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [workbench, setWorkbench] = useState<ChannelRuntimeGateWorkbench | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelRuntimeEvidenceBridgeInput(packetText);
      const nextWorkbench = await apiClient.reviewChannelRuntimeGate(input);
      setWorkbench(nextWorkbench);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setWorkbench(null);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className="gate-review-card" aria-labelledby="channel-runtime-gate-workbench-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-runtime-gate-workbench-heading">Channel runtime gate workbench</h2>
          <p className="muted">Protected gate-facing view for safe runtime bridge packets.</p>
        </div>
      </div>

      <div className="alert">
        This workbench summarizes the next Risk A runtime gate; it does not submit approvals or execute runtime changes.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-runtime-gate-workbench-packet">Safe runtime gate workbench packet</label>
        <textarea
          id="channel-runtime-gate-workbench-packet"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"dryRunSummary":{},"measurementScore":{},"runtimeEvidenceInput":{"records":[]}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review runtime gate"}
        </button>
      </form>

      {workbench ? (
        <>
          <div className="metric-grid">
            <Metric label="Workbench mode" value={workbench.mode} />
            <Metric label="Gate status" value={workbench.gate.status} />
            <Metric label="Next action" value={workbench.gate.requiredNextAction || "none"} />
            <Metric label="Approval candidates" value={workbench.gate.counts.canaryReady} />
            <Metric label="Runtime blockers" value={workbench.gate.counts.runtimeBlocked} />
            <Metric label="Missing inventory" value={workbench.gate.counts.missingRuntimeInventory} />
          </div>
          <div className="gate-boundary">
            <strong>Gate boundary</strong>
            <ul>
              <li>{workbench.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{workbench.safety.noApprovalSubmission ? "No approval submission" : "Approval submission flag missing"}</li>
              <li>{workbench.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {workbench.safety.requiresSeparateRiskAApproval
                  ? "Separate Risk A approval required"
                  : "Risk A approval flag missing"}
              </li>
              <li>
                {workbench.gate.approvalPolicy.approvalSubmissionRoute === null
                  ? "No approval submission route"
                  : "Approval submission route exposed"}
              </li>
              <li>
                {!workbench.gate.approvalPolicy.approvalPhraseEchoed
                  ? "Approval phrase not echoed"
                  : "Approval phrase echoed"}
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ChannelRuntimeExecutionHandoffPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [handoff, setHandoff] = useState<ChannelRuntimeExecutionHandoff | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelRuntimeEvidenceBridgeInput(packetText);
      const nextHandoff = await apiClient.reviewChannelRuntimeExecutionHandoff(input);
      setHandoff(nextHandoff);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setHandoff(null);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className="gate-review-card" aria-labelledby="channel-runtime-execution-handoff-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-runtime-execution-handoff-heading">Channel runtime execution handoff</h2>
          <p className="muted">Protected A-tier handoff packet preview for safe runtime gate evidence.</p>
        </div>
      </div>

      <div className="alert">
        This handoff prepares operator review material only; it does not submit approvals or execute runtime changes.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-runtime-execution-handoff-packet">Safe runtime execution handoff packet</label>
        <textarea
          id="channel-runtime-execution-handoff-packet"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"dryRunSummary":{},"measurementScore":{},"runtimeEvidenceInput":{"records":[]}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review execution handoff"}
        </button>
      </form>

      {handoff ? (
        <>
          <div className="metric-grid">
            <Metric label="Handoff mode" value={handoff.mode} />
            <Metric label="Handoff status" value={handoff.handoff.status} />
            <Metric label="Execution authority" value={handoff.handoff.executionAuthority} />
            <Metric label="Runbook" value={handoff.handoff.nextGate.runbook} />
            <Metric label="Approval candidates" value={handoff.handoff.counts.canaryReady} />
            <Metric label="Runtime blockers" value={handoff.handoff.counts.runtimeBlocked} />
          </div>
          <div className="gate-boundary">
            <strong>Execution handoff boundary</strong>
            <ul>
              <li>{handoff.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{handoff.safety.noApprovalSubmission ? "No approval submission" : "Approval submission flag missing"}</li>
              <li>{handoff.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {handoff.handoff.nextGate.approvalSubmissionRoute === null
                  ? "No approval submission route"
                  : "Approval submission route exposed"}
              </li>
              <li>
                {handoff.handoff.nextGate.runtimeExecutionRoute === null
                  ? "No runtime execution route"
                  : "Runtime execution route exposed"}
              </li>
              <li>
                {!handoff.handoff.nextGate.approvalTextIncluded
                  ? "Approval text not included"
                  : "Approval text included"}
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ChannelSubscriptionOutputDraftPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [draft, setDraft] = useState<ChannelSubscriptionOutputDraft | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelSubscriptionOutputDraftInput(packetText);
      const nextDraft = await apiClient.reviewChannelSubscriptionOutputDraft(input);
      setDraft(nextDraft);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setDraft(null);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className="gate-review-card" aria-labelledby="channel-subscription-output-draft-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-subscription-output-draft-heading">Channel subscription output draft</h2>
          <p className="muted">Protected draft review from channel runtime evidence into subscription-output planning.</p>
        </div>
      </div>

      <div className="alert">
        This panel reviews subscription-output draft evidence only; it does not generate YAML, submit approvals, or change real subscription output.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-subscription-output-draft-packet">Safe channel subscription draft packet</label>
        <textarea
          id="channel-subscription-output-draft-packet"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"dryRunSummary":{},"measurementScore":{},"runtimeEvidenceInput":{"records":[]}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review subscription draft"}
        </button>
      </form>

      {draft ? (
        <>
          <div className="metric-grid">
            <Metric label="Draft mode" value={draft.mode} />
            <Metric label="Draft status" value={draft.status} />
            <Metric label="Baseline pool" value={draft.subscriptionOutputDraft.baselinePool.length} />
            <Metric label="Canary pool" value={draft.subscriptionOutputDraft.canaryPool.length} />
            <Metric label="Blocked pool" value={draft.subscriptionOutputDraft.blockedPool.length} />
            <Metric label="Next gate" value={draft.nextGate.gate} />
          </div>
          <div className="gate-boundary">
            <strong>Subscription draft boundary</strong>
            <ul>
              <li>{draft.safety.yamlNotGenerated ? "YAML not generated" : "YAML generation flag missing"}</li>
              <li>
                {draft.safety.noSubscriptionOutputMutation
                  ? "No subscription output mutation"
                  : "Subscription output mutation flag missing"}
              </li>
              <li>{draft.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{draft.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {!draft.subscriptionOutputDraft.activationAllowed
                  ? "Activation not approved"
                  : "Activation unexpectedly allowed"}
              </li>
              <li>
                {draft.nextGate.approvalSubmissionRoute === null
                  ? "No approval submission route"
                  : "Approval submission route exposed"}
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ChannelSubscriptionActivationReadinessPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [readiness, setReadiness] = useState<ChannelSubscriptionActivationReadiness | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelSubscriptionActivationReadinessInput(packetText);
      const nextReadiness = await apiClient.reviewChannelSubscriptionActivationReadiness(input);
      setReadiness(nextReadiness);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setReadiness(null);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className="gate-review-card" aria-labelledby="channel-subscription-activation-readiness-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-subscription-activation-readiness-heading">
            Channel subscription activation readiness
          </h2>
          <p className="muted">
            Protected readiness review before any subscription-output activation request.
          </p>
        </div>
      </div>

      <div className="alert">
        This panel prepares activation-readiness evidence only; it does not submit approvals, generate YAML, or change real subscription output.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-subscription-activation-readiness-packet">
          Safe channel activation readiness packet
        </label>
        <textarea
          id="channel-subscription-activation-readiness-packet"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"dryRunSummary":{},"measurementScore":{},"runtimeEvidenceInput":{"records":[]}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review activation readiness"}
        </button>
      </form>

      {readiness ? (
        <>
          <div className="metric-grid">
            <Metric label="Readiness mode" value={readiness.mode} />
            <Metric label="Readiness status" value={readiness.status} />
            <Metric label="Activation gate" value={readiness.activationGate.gate} />
            <Metric label="Execution authority" value={readiness.activationGate.executionAuthority} />
            <Metric label="Canary candidates" value={readiness.readiness.canaryOutputCandidateCount} />
            <Metric label="Blockers" value={readiness.readiness.blockers.length} />
          </div>
          <div className="gate-boundary">
            <strong>Activation readiness boundary</strong>
            <ul>
              <li>
                {readiness.safety.noSubscriptionOutputMutation
                  ? "No subscription output mutation"
                  : "Subscription output mutation flag missing"}
              </li>
              <li>{readiness.safety.yamlNotGenerated ? "YAML not generated" : "YAML generation flag missing"}</li>
              <li>{readiness.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{readiness.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {readiness.activationGate.approvalSubmissionRoute === null
                  ? "No approval submission route"
                  : "Approval submission route exposed"}
              </li>
              <li>
                {readiness.activationGate.executionRoute === null
                  ? "No execution route"
                  : "Execution route exposed"}
              </li>
              <li>
                {!readiness.activationGate.approvalTextIncluded
                  ? "Approval text not included"
                  : "Approval text included"}
              </li>
            </ul>
          </div>
          {readiness.readiness.blockers.length ? (
            <div className="alert alert-error">{readiness.readiness.blockers.join(", ")}</div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ChannelSubscriptionActivationHandoffPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [handoff, setHandoff] = useState<ChannelSubscriptionActivationHandoff | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelSubscriptionActivationHandoffInput(packetText);
      const nextHandoff = await apiClient.reviewChannelSubscriptionActivationHandoff(input);
      setHandoff(nextHandoff);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setHandoff(null);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className="gate-review-card" aria-labelledby="channel-subscription-activation-handoff-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-subscription-activation-handoff-heading">
            Channel subscription activation handoff
          </h2>
          <p className="muted">
            Protected operator handoff before any subscription-output activation request.
          </p>
        </div>
      </div>

      <div className="alert">
        This panel prepares handoff evidence only; it does not submit approvals, expose execution routes, generate YAML, or change subscription output.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-subscription-activation-handoff-packet">
          Safe channel subscription activation handoff packet
        </label>
        <textarea
          id="channel-subscription-activation-handoff-packet"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"dryRunSummary":{},"measurementScore":{},"runtimeEvidenceInput":{"records":[]}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review activation handoff"}
        </button>
      </form>

      {handoff ? (
        <>
          <div className="metric-grid">
            <Metric label="Handoff mode" value={handoff.mode} />
            <Metric label="Handoff status" value={handoff.handoff.status} />
            <Metric label="Activation gate" value={handoff.handoff.nextGate.gate} />
            <Metric label="Execution authority" value={handoff.handoff.executionAuthority} />
            <Metric label="Baseline candidates" value={handoff.handoff.counts.baselinePool} />
            <Metric label="Canary candidates" value={handoff.handoff.counts.canaryPool} />
          </div>
          <div className="gate-boundary">
            <strong>Activation handoff boundary</strong>
            <ul>
              <li>
                {handoff.safety.noSubscriptionOutputMutation
                  ? "No subscription output mutation"
                  : "Subscription output mutation flag missing"}
              </li>
              <li>{handoff.safety.yamlNotGenerated ? "YAML not generated" : "YAML generation flag missing"}</li>
              <li>{handoff.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{handoff.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {handoff.handoff.nextGate.approvalSubmissionRoute === null
                  ? "No approval submission route"
                  : "Approval submission route exposed"}
              </li>
              <li>
                {handoff.handoff.nextGate.subscriptionOutputExecutionRoute === null
                  ? "No subscription output execution route"
                  : "Subscription output execution route exposed"}
              </li>
              <li>
                {!handoff.handoff.nextGate.approvalTextIncluded
                  ? "Approval text not included"
                  : "Approval text included"}
              </li>
            </ul>
          </div>
          {handoff.handoff.blockers.length ? (
            <div className="alert alert-error">{handoff.handoff.blockers.join(", ")}</div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ChannelSubscriptionActivationFlowPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [flow, setFlow] = useState<ChannelSubscriptionActivationFlow | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelSubscriptionActivationFlowInput(packetText);
      const nextFlow = await apiClient.reviewChannelSubscriptionActivationFlow(input);
      setFlow(nextFlow);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setFlow(null);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className="gate-review-card" aria-labelledby="channel-subscription-activation-flow-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-subscription-activation-flow-heading">
            Channel subscription activation flow
          </h2>
          <p className="muted">
            Protected end-to-end review from runtime evidence to subscription-output activation handoff.
          </p>
        </div>
      </div>

      <div className="alert">
        This panel links existing review stages only; it does not submit approvals, expose execution routes, generate YAML, or change subscription output.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-subscription-activation-flow-packet">
          Safe channel subscription activation flow packet
        </label>
        <textarea
          id="channel-subscription-activation-flow-packet"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"dryRunSummary":{},"measurementScore":{},"runtimeEvidenceInput":{"records":[]}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review activation flow"}
        </button>
      </form>

      {flow ? (
        <>
          <div className="metric-grid">
            <Metric label="Flow mode" value={flow.mode} />
            <Metric label="Flow status" value={flow.flowStatus} />
            <Metric label="Required next action" value={flow.requiredNextAction} />
            <Metric label="Activation gate" value={flow.gate.gate} />
            <Metric label="Execution authority" value={flow.gate.executionAuthority} />
            <Metric label="Stage count" value={Object.keys(flow.stages).length} />
          </div>
          <div className="gate-boundary">
            <strong>Activation flow boundary</strong>
            <ul>
              <li>
                {flow.safety.noSubscriptionOutputMutation
                  ? "No subscription output mutation"
                  : "Subscription output mutation flag missing"}
              </li>
              <li>{flow.safety.yamlNotGenerated ? "YAML not generated" : "YAML generation flag missing"}</li>
              <li>{flow.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{flow.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {flow.gate.approvalSubmissionRoute === null
                  ? "No approval submission route"
                  : "Approval submission route exposed"}
              </li>
              <li>
                {flow.gate.subscriptionOutputExecutionRoute === null
                  ? "No subscription output execution route"
                  : "Subscription output execution route exposed"}
              </li>
              <li>{!flow.gate.approvalTextIncluded ? "Approval text not included" : "Approval text included"}</li>
            </ul>
          </div>
          {flow.blockers.length ? (
            <div className="alert alert-error">{flow.blockers.join(", ")}</div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ChannelSubscriptionActivationRecordTemplatePanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [template, setTemplate] = useState<ChannelSubscriptionActivationRecordTemplate | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelSubscriptionActivationRecordTemplateInput(packetText);
      const nextTemplate = await apiClient.reviewChannelSubscriptionActivationRecordTemplate(input);
      setTemplate(nextTemplate);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setTemplate(null);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className="gate-review-card" aria-labelledby="channel-subscription-activation-record-template-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-subscription-activation-record-template-heading">
            Channel subscription activation record template
          </h2>
          <p className="muted">
            Protected review surface for turning safe activation-flow fixtures into execution-record skeletons.
          </p>
        </div>
      </div>

      <div className="alert">
        This panel generates a record template only; it does not submit approvals, generate YAML, expose execution
        routes, or change subscription output.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-subscription-activation-record-template-fixture">
          Safe channel subscription activation flow fixture
        </label>
        <textarea
          id="channel-subscription-activation-record-template-fixture"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"activationFlowFixture":{"schemaVersion":"channel-subscription-activation-flow-fixture/v1","activationFlow":{}}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review activation record template"}
        </button>
      </form>

      {template ? (
        <>
          <div className="metric-grid">
            <Metric label="Template mode" value={template.mode} />
            <Metric label="Flow status" value={template.source.flowStatus} />
            <Metric label="Required next action" value={template.source.requiredNextAction} />
            <Metric label="Execution authority" value={template.readiness.executionAuthority} />
            <Metric label="Approval ready" value={template.readiness.approvalRequestReady ? "Yes" : "No"} />
            <Metric label="Suggested path" value={template.record.suggestedPath} />
          </div>
          <div className="gate-boundary">
            <strong>{template.record.title}</strong>
            <ul>
              <li>{template.safety.templateOnly ? "Template only" : "Template-only flag missing"}</li>
              <li>
                {template.safety.noSubscriptionOutputMutation
                  ? "No subscription output mutation"
                  : "Subscription output mutation flag missing"}
              </li>
              <li>{template.safety.yamlNotGenerated ? "YAML not generated" : "YAML generation flag missing"}</li>
              <li>{template.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{template.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {template.safety.noApprovalSubmission
                  ? "No approval submission"
                  : "Approval submission flag missing"}
              </li>
              <li>
                {template.safety.requiresSeparateRiskAApproval
                  ? "Separate Risk A approval required"
                  : "Risk A approval boundary missing"}
              </li>
            </ul>
            <pre>{template.record.markdown}</pre>
          </div>
          {template.readiness.blockers.length ? (
            <div className="alert alert-error">{template.readiness.blockers.join(", ")}</div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ChannelLabTargetDecisionPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [decision, setDecision] = useState<ChannelLabTargetDecision | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseChannelLabTargetDecisionInput(packetText);
      const nextDecision = await apiClient.reviewChannelLabTargetDecision(input);
      setDecision(nextDecision);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setDecision(null);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className="gate-review-card" aria-labelledby="channel-lab-target-decision-heading">
      <div className="page-heading">
        <div>
          <h2 id="channel-lab-target-decision-heading">Channel lab target decision</h2>
          <p className="muted">Protected target decision surface for TUIC comparison inventory.</p>
        </div>
      </div>

      <div className="alert">
        This panel decides the next lab-target gate only; it does not create servers, open ports, or execute runtime changes.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="channel-lab-target-decision-packet">Safe channel lab target inventory packet</label>
        <textarea
          id="channel-lab-target-decision-packet"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"inventory":{"targetLabel":"channel-lab-a","protocol":"tuic","checks":{}}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review target decision"}
        </button>
      </form>

      {decision ? (
        <>
          <div className="metric-grid">
            <Metric label="Decision mode" value={decision.mode} />
            <Metric label="Decision status" value={decision.status} />
            <Metric label="Next action" value={decision.requiredNextAction} />
            <Metric label="Next gate" value={decision.nextGate.gate} />
            <Metric label="Execution authority" value={decision.executionAuthority} />
            <Metric label="Blockers" value={decision.blockers.length} />
          </div>
          <div className="gate-boundary">
            <strong>Target decision boundary</strong>
            <ul>
              <li>{decision.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{decision.safety.noApprovalSubmission ? "No approval submission" : "Approval submission flag missing"}</li>
              <li>{decision.safety.noTrafficMovement ? "No traffic movement" : "Traffic movement flag missing"}</li>
              <li>
                {decision.nextGate.approvalSubmissionRoute === null
                  ? "No approval submission route"
                  : "Approval submission route exposed"}
              </li>
              <li>
                {decision.nextGate.runtimeExecutionRoute === null
                  ? "No runtime execution route"
                  : "Runtime execution route exposed"}
              </li>
              <li>
                {!decision.nextGate.approvalTextIncluded
                  ? "Approval text not included"
                  : "Approval text included"}
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}

function CleanEdgeReadinessReviewPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [packetText, setPacketText] = useState("");
  const [summary, setSummary] = useState<CleanEdgeReadinessSummary | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewing(true);
    setError("");
    try {
      const input = parseCleanEdgeReadinessInput(packetText);
      const nextSummary = await apiClient.reviewCleanEdgeReadiness(input);
      setSummary(nextSummary);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setSummary(null);
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className="gate-review-card" aria-labelledby="clean-edge-readiness-heading">
      <div className="page-heading">
        <div>
          <h2 id="clean-edge-readiness-heading">Clean edge readiness</h2>
          <p className="muted">Protected readiness surface for clean edge rebuild preconditions.</p>
        </div>
      </div>

      <div className="alert">
        This panel reviews safe clean-edge facts only; it does not submit approval, create hosts, inject secrets, change DNS, or move traffic.
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form className="channel-review-form" onSubmit={handleReviewSubmit}>
        <label htmlFor="clean-edge-readiness-packet">Safe clean edge readiness packet</label>
        <textarea
          id="clean-edge-readiness-packet"
          value={packetText}
          onChange={(event) => setPacketText(event.target.value)}
          placeholder='{"repoState":{},"subscriptionBoundary":{},"edgeDns":{},"stoppedNodes":{},"cleanTarget":{},"approval":{}}'
          rows={8}
        />
        <button className="primary-button" type="submit" disabled={reviewing}>
          {reviewing ? "Reviewing..." : "Review clean edge readiness"}
        </button>
      </form>

      {summary ? (
        <>
          <div className="metric-grid">
            <Metric label="Summary mode" value={summary.mode} />
            <Metric label="Readiness" value={summary.readiness.preconditionsReady ? "Preconditions ready" : "Blocked"} />
            <Metric label="Approval" value={summary.readiness.approvalRequired ? "Approval required" : "Approval recorded"} />
            <Metric label="Execution allowed" value={summary.readiness.executionAllowed ? "Yes" : "No"} />
            <Metric label="Blockers" value={summary.readiness.blockers.length} />
          </div>
          <div className="gate-boundary">
            <strong>Readiness boundary</strong>
            <ul>
              <li>{summary.safety.summaryOnly ? "Summary-only evidence" : "Summary-only flag missing"}</li>
              <li>{summary.safety.noRuntimeMutation ? "No runtime mutation" : "Runtime mutation flag missing"}</li>
              <li>{summary.safety.noProductionMutation ? "No production mutation" : "Production mutation flag missing"}</li>
              <li>{summary.safety.noCloudMutation ? "No cloud mutation" : "Cloud mutation flag missing"}</li>
              <li>{summary.safety.noDnsMutation ? "No DNS mutation" : "DNS mutation flag missing"}</li>
              <li>
                {summary.safety.noSubscriptionOutputMutation
                  ? "No subscription output mutation"
                  : "Subscription output mutation flag missing"}
              </li>
              <li>{summary.safety.noSecretHandling ? "No secret handling" : "Secret-handling flag missing"}</li>
            </ul>
          </div>
          {summary.readiness.blockers.length ? (
            <div className="alert alert-error">{summary.readiness.blockers.join(", ")}</div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AliyunGateReviewPanel({ apiClient }: { apiClient: AdminApiClient }) {
  const [gatePacket, setGatePacket] = useState<AliyunGateDecisionPacket | null>(null);
  const [evidence, setEvidence] = useState<AliyunGateEvidenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [providerFirewallForm, setProviderFirewallForm] = useState<ProviderFirewallEvidenceInput>({
    hasRollbackSnapshot: false,
    hasManagementSourceDecision: false,
    hasWgHomeDecision: false
  });
  const [accessMigrationForm, setAccessMigrationForm] = useState<AccessMigrationEvidenceInput>({
    hasLiveAccessModelInventory: false,
    hasApprovedArtifactScope: false,
    artifactIssuanceCompleted: false,
    artifactRefreshObservationRecorded: false,
    hasApprovedLegacyRetirementScope: false
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
          setProviderFirewallForm({
            hasRollbackSnapshot: providerFirewall.hasRollbackSnapshot,
            hasManagementSourceDecision: providerFirewall.hasManagementSourceDecision,
            hasWgHomeDecision: providerFirewall.hasWgHomeDecision
          });
        }
        const accessMigration = nextEvidence?.accessMigration;
        if (accessMigration) {
          setAccessMigrationForm({
            hasLiveAccessModelInventory: accessMigration.hasLiveAccessModelInventory,
            hasApprovedArtifactScope: accessMigration.hasApprovedArtifactScope,
            artifactIssuanceCompleted: accessMigration.artifactIssuanceCompleted,
            artifactRefreshObservationRecorded: accessMigration.artifactRefreshObservationRecorded,
            hasApprovedLegacyRetirementScope: accessMigration.hasApprovedLegacyRetirementScope
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

  async function handleProviderFirewallSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const nextEvidence = await apiClient.recordProviderFirewallEvidence(providerFirewallForm);
      setEvidence(nextEvidence);
      await refreshAfterEvidenceRecord();
      setMessage("Provider-firewall evidence recorded.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleAccessMigrationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const nextEvidence = await apiClient.recordAccessMigrationEvidence(accessMigrationForm);
      setEvidence(nextEvidence);
      await refreshAfterEvidenceRecord();
      setMessage("Access-migration evidence recorded.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  const providerFirewall = evidence?.providerFirewall ?? null;
  const accessMigration = evidence?.accessMigration ?? null;
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

        <div className="gate-evidence-stack">
          <form className="gate-evidence-form" onSubmit={handleProviderFirewallSubmit}>
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
                checked={providerFirewallForm.hasRollbackSnapshot}
                onChange={(event) =>
                  setProviderFirewallForm((current) => ({ ...current, hasRollbackSnapshot: event.target.checked }))
                }
              />
              <span>Rollback snapshot recorded</span>
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={providerFirewallForm.hasManagementSourceDecision}
                onChange={(event) =>
                  setProviderFirewallForm((current) => ({
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
                checked={providerFirewallForm.hasWgHomeDecision}
                onChange={(event) =>
                  setProviderFirewallForm((current) => ({ ...current, hasWgHomeDecision: event.target.checked }))
                }
              />
              <span>wg-home decision recorded</span>
            </label>

            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Recording..." : "Record provider-firewall evidence"}
            </button>
          </form>

          <form className="gate-evidence-form" onSubmit={handleAccessMigrationSubmit}>
            <div>
              <h3>Access migration evidence</h3>
              <p className="muted">
                Store only access-model, artifact-scope, and retirement readiness booleans for the gate packet.
              </p>
            </div>

            <div className="gate-evidence-summary">
              <Metric label="Evidence status" value={accessMigration?.status ?? "not_recorded"} />
              <Metric label="Raw URLs echoed" value={accessMigration?.rawUrlsEchoed ? "Yes" : "No"} />
              <Metric label="Raw tokens echoed" value={accessMigration?.rawTokensEchoed ? "Yes" : "No"} />
              <Metric label="Raw artifacts echoed" value={accessMigration?.rawArtifactsEchoed ? "Yes" : "No"} />
            </div>

            <label className="check-row">
              <input
                type="checkbox"
                checked={accessMigrationForm.hasLiveAccessModelInventory}
                onChange={(event) =>
                  setAccessMigrationForm((current) => ({
                    ...current,
                    hasLiveAccessModelInventory: event.target.checked
                  }))
                }
              />
              <span>Live access-model inventory recorded</span>
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={accessMigrationForm.hasApprovedArtifactScope}
                onChange={(event) =>
                  setAccessMigrationForm((current) => ({
                    ...current,
                    hasApprovedArtifactScope: event.target.checked
                  }))
                }
              />
              <span>Approved artifact scope recorded</span>
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={accessMigrationForm.artifactIssuanceCompleted}
                onChange={(event) =>
                  setAccessMigrationForm((current) => ({
                    ...current,
                    artifactIssuanceCompleted: event.target.checked
                  }))
                }
              />
              <span>Artifact issuance completed</span>
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={accessMigrationForm.artifactRefreshObservationRecorded}
                onChange={(event) =>
                  setAccessMigrationForm((current) => ({
                    ...current,
                    artifactRefreshObservationRecorded: event.target.checked
                  }))
                }
              />
              <span>Artifact refresh observation recorded</span>
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={accessMigrationForm.hasApprovedLegacyRetirementScope}
                onChange={(event) =>
                  setAccessMigrationForm((current) => ({
                    ...current,
                    hasApprovedLegacyRetirementScope: event.target.checked
                  }))
                }
              />
              <span>Approved legacy retirement scope recorded</span>
            </label>

            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Recording..." : "Record access-migration evidence"}
            </button>
          </form>
        </div>
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
      {gate.approvalPolicy ? (
        <ul className="approval-policy-list" aria-label={`${gate.label} approval policy`}>
          <li>{gate.approvalPolicy.mode === "exact_phrase_for_named_gate" ? "Exact phrase required" : "Approval policy recorded"}</li>
          <li>{gate.approvalPolicy.phraseBoundToGate ? "Gate-bound approval" : "Gate binding not recorded"}</li>
          <li>{gate.approvalPolicy.acceptsShortConfirmation ? "Short confirmations accepted" : "Short confirmations rejected"}</li>
          <li>{gate.approvalPolicy.approvalSubmissionRoute ? "Approval submission route configured" : "No approval submission route"}</li>
          <li>{gate.approvalPolicy.executesGate ? "Gate execution control exposed" : "No gate execution control"}</li>
        </ul>
      ) : null}
    </article>
  );
}
