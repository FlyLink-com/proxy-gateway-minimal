const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "generatedAt",
  "repoState",
  "subscriptionBoundary",
  "edgeDns",
  "stoppedNodes",
  "cleanTarget",
  "approval",
  "notes"
]);
const ALLOWED_REPO_STATE_KEYS = new Set([
  "branchSynced",
  "noOpenPrs",
  "projectStateCheckPassed"
]);
const ALLOWED_SUBSCRIPTION_BOUNDARY_KEYS = new Set([
  "subOnAliyun",
  "healthOk",
  "adminBlocked",
  "rootBlocked",
  "noTokenRejected"
]);
const ALLOWED_EDGE_DNS_KEYS = new Set(["ssSgUnchangedOnOldAws"]);
const ALLOWED_STOPPED_NODES_KEYS = new Set([
  "prodEdgeAStopped",
  "prodEdgeANoPublicIp",
  "prodEdgeBStopped",
  "prodEdgeBNoPublicIp"
]);
const ALLOWED_CLEAN_TARGET_KEYS = new Set(["noTargetSelected", "noTargetProvisioned"]);
const ALLOWED_APPROVAL_KEYS = new Set(["exactApprovalReceived"]);
const SENSITIVE_TEXT_PATTERN =
  /https?:|token=|secret|credential|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeSummaryError() {
  return new Error("safe clean edge readiness summary requires only supported summary fields");
}

function assertExactKeys(value, allowedKeys) {
  if (!isObject(value)) {
    throw safeSummaryError();
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw safeSummaryError();
    }
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function safeNotes(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = text(value);
    if (!normalized || seen.has(normalized)) continue;
    if (SENSITIVE_TEXT_PATTERN.test(normalized)) {
      throw safeSummaryError();
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function safeBooleanGroup(value, allowedKeys, outputKeys) {
  const input = value ?? {};
  assertExactKeys(input, allowedKeys);
  return Object.fromEntries(outputKeys.map((key) => [key, input[key] === true]));
}

function buildBlockers({
  repoState,
  subscriptionBoundary,
  edgeDns,
  stoppedNodes,
  cleanTarget
}) {
  const blockers = [];
  if (!repoState.branchSynced) blockers.push("repository branch is not synced");
  if (!repoState.noOpenPrs) blockers.push("open PR queue is not empty");
  if (!repoState.projectStateCheckPassed) blockers.push("project-state check has not passed");
  if (!subscriptionBoundary.subOnAliyun) {
    blockers.push("subscription boundary is not confirmed on Aliyun");
  }
  if (!subscriptionBoundary.healthOk) blockers.push("public health check is not verified");
  if (!subscriptionBoundary.adminBlocked) blockers.push("public Admin blocking is not verified");
  if (!subscriptionBoundary.rootBlocked) blockers.push("public root blocking is not verified");
  if (!subscriptionBoundary.noTokenRejected) {
    blockers.push("no-token subscription rejection is not verified");
  }
  if (!edgeDns.ssSgUnchangedOnOldAws) {
    blockers.push("ss-sg edge DNS is not confirmed unchanged on the old AWS address");
  }
  if (!stoppedNodes.prodEdgeAStopped) blockers.push("prod-edge-a is not confirmed stopped");
  if (!stoppedNodes.prodEdgeANoPublicIp) {
    blockers.push("prod-edge-a public IP absence is not confirmed");
  }
  if (!stoppedNodes.prodEdgeBStopped) blockers.push("prod-edge-b is not confirmed stopped");
  if (!stoppedNodes.prodEdgeBNoPublicIp) {
    blockers.push("prod-edge-b public IP absence is not confirmed");
  }
  if (!cleanTarget.noTargetSelected) {
    blockers.push("clean edge target has already been selected before this readiness gate");
  }
  if (!cleanTarget.noTargetProvisioned) {
    blockers.push("clean edge target has already been provisioned before this readiness gate");
  }
  return blockers;
}

export function buildCleanEdgeReadinessSummary(input = {}) {
  assertExactKeys(input, ALLOWED_TOP_LEVEL_KEYS);

  const repoState = safeBooleanGroup(input.repoState, ALLOWED_REPO_STATE_KEYS, [
    "branchSynced",
    "noOpenPrs",
    "projectStateCheckPassed"
  ]);
  const subscriptionBoundary = safeBooleanGroup(
    input.subscriptionBoundary,
    ALLOWED_SUBSCRIPTION_BOUNDARY_KEYS,
    ["subOnAliyun", "healthOk", "adminBlocked", "rootBlocked", "noTokenRejected"]
  );
  const edgeDns = safeBooleanGroup(input.edgeDns, ALLOWED_EDGE_DNS_KEYS, [
    "ssSgUnchangedOnOldAws"
  ]);
  const stoppedNodes = safeBooleanGroup(input.stoppedNodes, ALLOWED_STOPPED_NODES_KEYS, [
    "prodEdgeAStopped",
    "prodEdgeANoPublicIp",
    "prodEdgeBStopped",
    "prodEdgeBNoPublicIp"
  ]);
  const cleanTarget = safeBooleanGroup(input.cleanTarget, ALLOWED_CLEAN_TARGET_KEYS, [
    "noTargetSelected",
    "noTargetProvisioned"
  ]);
  const approval = safeBooleanGroup(input.approval, ALLOWED_APPROVAL_KEYS, [
    "exactApprovalReceived"
  ]);
  const blockers = buildBlockers({
    repoState,
    subscriptionBoundary,
    edgeDns,
    stoppedNodes,
    cleanTarget
  });
  const preconditionsReady = blockers.length === 0;

  return {
    ok: true,
    mode: "clean-edge-readiness-summary",
    generatedAt: text(input.generatedAt) || new Date().toISOString(),
    readiness: {
      preconditionsReady,
      approvalRequired: !approval.exactApprovalReceived,
      executionAllowed: preconditionsReady && approval.exactApprovalReceived,
      blockers
    },
    repoState,
    subscriptionBoundary,
    edgeDns,
    stoppedNodes,
    cleanTarget,
    approval,
    notes: safeNotes(input.notes),
    safety: {
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noCloudMutation: true,
      noDnsMutation: true,
      noSubscriptionOutputMutation: true,
      noSecretHandling: true,
      omittedFields: [
        "rawHosts",
        "rawIps",
        "rawPorts",
        "rawSecrets",
        "tokens",
        "subscriptionUrls",
        "credentials",
        "customerData"
      ]
    }
  };
}
