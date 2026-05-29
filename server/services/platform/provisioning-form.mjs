import { createHash } from "node:crypto";

function text(value) {
  return String(value ?? "").trim();
}

function hashRef(prefix, ...parts) {
  const input = parts.map(text).filter(Boolean).join("|") || prefix;
  const digest = createHash("sha256").update(input).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function safeIso(value) {
  const raw = text(value);
  if (!raw) {
    return "";
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function buildBlockers(input) {
  const subscription = input.subscription || {};
  const artifact = input.artifact || {};
  const quantity = Number(subscription.quantity ?? 1);
  const blockers = [];

  if (!text(input.approvalRef)) {
    blockers.push("approval_ref_required");
  }
  if (!safeIso(subscription.expiresAt)) {
    blockers.push("subscription_expires_at_invalid");
  }
  if (!text(subscription.nodeId)) {
    blockers.push("subscription_node_required");
  }
  if (quantity !== 1) {
    blockers.push("subscription_quantity_must_be_one");
  }
  if (artifact.create !== true) {
    blockers.push("opaque_artifact_required");
  }

  return blockers;
}

function safetyFlags() {
  return {
    summaryOnly: true,
    formAdapterOnly: true,
    noSubscriptionUrl: true,
    noRawCustomerData: true,
    noSecrets: true,
    noDbMutation: true,
    noProductionMutation: true,
    noApprovalSubmission: true,
    requiresSeparateRiskAApprovalForIssuance: true,
    omittedFields: [
      "customer.label",
      "customer.email",
      "customer.channel",
      "subscriptionUrl",
      "tokens",
      "credentials",
      "handoffFile",
      "dbPath"
    ]
  };
}

export function buildProvisioningFormPackage(input = {}) {
  const subscription = input.subscription || {};
  const blockers = buildBlockers(input);
  const ok = blockers.length === 0;
  const customerRef = hashRef(
    "cust",
    input.customer?.email,
    input.customer?.label,
    input.customer?.channel
  );
  const approvalRef = text(input.approvalRef);
  const expiresAt = safeIso(subscription.expiresAt);
  const plan = text(subscription.plan) || "pilot";
  const nodeId = text(subscription.nodeId);
  const displayName = text(subscription.displayName) || "operator-safe label";
  const note = text(subscription.note);

  return {
    ok,
    mode: "platform-provisioning-form",
    status: ok ? "ready_for_cli_dry_run" : "blocked_before_cli_input",
    blockers,
    approvalRef,
    customerRef,
    form: {
      source: "operator_provisioning_form",
      operatorRef: hashRef("operator", input.operator || "operator"),
      plan,
      handoffDelivery: text(input.handoff?.delivery) || "operator_visible_once",
      rawCustomerDataReturned: false
    },
    issuanceInput: ok ? {
      displayName,
      expiresAt,
      nodeId,
      note,
      artifact: {
        create: true
      }
    } : null,
    execution: {
      command: "platform:issue-subscription",
      nextAction: ok
        ? "run_cli_dry_run_then_request_risk_a_approval"
        : "fix_form_before_cli_dry_run",
      requiresRiskAApproval: true,
      dbMutationAuthorized: false,
      publicAdminRequired: false
    },
    audit: {
      recordType: "operator_provisioning_form_summary",
      approvalRef,
      customerRef,
      evidenceKinds: [
        "operator_form_facts",
        "issuance_input_preview",
        "risk_a_execution_required"
      ]
    },
    safety: safetyFlags()
  };
}
