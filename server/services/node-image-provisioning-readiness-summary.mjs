import {
  openPrScopeBlockers,
  openPrScopeOutput,
  parseOpenPrScope
} from "./readiness-open-pr-scope.mjs";

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "generatedAt",
  "repoState",
  "imageBuild",
  "firstBoot",
  "runtime",
  "receiptGate",
  "approval",
  "notes"
]);

const ALLOWED_REPO_STATE_KEYS = new Set([
  "branchSynced",
  "openPrRefs",
  "blockingPrRefs",
  "projectStateCheckPassed",
  "artifactHashRecorded"
]);

const ALLOWED_IMAGE_BUILD_KEYS = new Set([
  "noSecretBaseImage",
  "approvedReleaseSkeleton",
  "serviceUnitsDisabled",
  "runtimeBinariesValidated",
  "templatesParse",
  "noSecretScanPassed",
  "buildLogsSanitized",
  "imageManifestRecorded",
  "wireguardToolsPinnedInManifest"
]);

const ALLOWED_FIRST_BOOT_KEYS = new Set([
  "nodeRefReviewed",
  "providerInventoryCaptured",
  "protectedMaterialOutOfImage",
  "privateControlPlanePathReady",
  "wireguardPlanApproved",
  "wireguardTunnelAddressAssigned",
  "wireguardPeerPublicKeyExchangePlanned",
  "edgeAgentInstalled",
  "channelPlanReviewed"
]);

const ALLOWED_RUNTIME_KEYS = new Set([
  "xrayConfigTestPlanned",
  "hysteria2ConfigTestPlanned",
  "tuicConfigTestPlanned",
  "statsLoopbackOnly",
  "publicAdminBlocked"
]);

const ALLOWED_RECEIPT_GATE_KEYS = new Set([
  "desiredStatePullRequired",
  "appliedReceiptRequired",
  "freshReceiptRequired",
  "subscriptionRenderWithholdsUntilReceipt",
  "disableOrExpiryGateRequired"
]);

const ALLOWED_APPROVAL_KEYS = new Set([
  "exactApprovalReceived",
  "liveOrderSmokeApproved"
]);

const SENSITIVE_TEXT_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeSummaryError() {
  return new Error("safe node image provisioning readiness summary requires only supported summary fields");
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

function addBlockerIf(blockers, condition, message) {
  if (condition) {
    blockers.push(message);
  }
}

function buildBlockers({
  repoState,
  openPrScope,
  imageBuild,
  firstBoot,
  runtime,
  receiptGate
}) {
  const blockers = [];
  addBlockerIf(blockers, !repoState.branchSynced, "repository branch is not synced");
  blockers.push(...openPrScopeBlockers(openPrScope));
  addBlockerIf(blockers, !repoState.projectStateCheckPassed, "project-state check has not passed");
  addBlockerIf(blockers, !repoState.artifactHashRecorded, "release artifact hash is not recorded");
  addBlockerIf(blockers, !imageBuild.noSecretBaseImage, "image is not confirmed no-secret");
  addBlockerIf(blockers, !imageBuild.approvedReleaseSkeleton, "approved release skeleton is not confirmed");
  addBlockerIf(blockers, !imageBuild.serviceUnitsDisabled, "service units are not confirmed disabled or inactive in the image");
  addBlockerIf(blockers, !imageBuild.runtimeBinariesValidated, "runtime binaries are not version-validated");
  addBlockerIf(blockers, !imageBuild.templatesParse, "non-secret templates have not been parsed successfully");
  addBlockerIf(blockers, !imageBuild.noSecretScanPassed, "image staging no-secret scan has not passed");
  addBlockerIf(blockers, !imageBuild.buildLogsSanitized, "image build logs are not confirmed sanitized");
  addBlockerIf(blockers, !imageBuild.imageManifestRecorded, "image manifest is not recorded");
  addBlockerIf(blockers, !imageBuild.wireguardToolsPinnedInManifest, "wireguard tools are not pinned in the image manifest");
  addBlockerIf(blockers, !firstBoot.nodeRefReviewed, "nodeRef is not reviewed");
  addBlockerIf(blockers, !firstBoot.providerInventoryCaptured, "provider inventory is not captured");
  addBlockerIf(blockers, !firstBoot.protectedMaterialOutOfImage, "protected material boundary is not confirmed outside the image");
  addBlockerIf(blockers, !firstBoot.privateControlPlanePathReady, "private control-plane path is not ready");
  addBlockerIf(blockers, !firstBoot.wireguardPlanApproved, "wireguard plan is not approved");
  addBlockerIf(blockers, !firstBoot.wireguardTunnelAddressAssigned, "wireguard tunnel address is not assigned");
  addBlockerIf(blockers, !firstBoot.wireguardPeerPublicKeyExchangePlanned, "wireguard peer public-key exchange is not planned");
  addBlockerIf(blockers, !firstBoot.edgeAgentInstalled, "edge agent is not confirmed installed");
  addBlockerIf(blockers, !firstBoot.channelPlanReviewed, "channel plan is not reviewed");
  addBlockerIf(blockers, !runtime.xrayConfigTestPlanned, "Xray config-test is not planned");
  addBlockerIf(blockers, !runtime.hysteria2ConfigTestPlanned, "Hysteria2 config-test is not planned");
  addBlockerIf(blockers, !runtime.tuicConfigTestPlanned, "TUIC config-test is not planned");
  addBlockerIf(blockers, !runtime.statsLoopbackOnly, "stats surfaces are not confirmed loopback-only");
  addBlockerIf(blockers, !runtime.publicAdminBlocked, "public Admin blocking is not confirmed");
  addBlockerIf(blockers, !receiptGate.desiredStatePullRequired, "desired-state pull is not required");
  addBlockerIf(blockers, !receiptGate.appliedReceiptRequired, "applied receipt is not required");
  addBlockerIf(blockers, !receiptGate.freshReceiptRequired, "fresh receipt is not required");
  addBlockerIf(blockers, !receiptGate.subscriptionRenderWithholdsUntilReceipt, "subscription rendering is not confirmed receipt-gated");
  addBlockerIf(blockers, !receiptGate.disableOrExpiryGateRequired, "disable or expiry gate is not required");
  return blockers;
}

export function buildNodeImageProvisioningReadinessSummary(input = {}) {
  assertExactKeys(input, ALLOWED_TOP_LEVEL_KEYS);

  const repoState = safeBooleanGroup(input.repoState, ALLOWED_REPO_STATE_KEYS, [
    "branchSynced",
    "projectStateCheckPassed",
    "artifactHashRecorded"
  ]);
  const openPrScope = parseOpenPrScope(input.repoState, safeSummaryError);
  const imageBuild = safeBooleanGroup(input.imageBuild, ALLOWED_IMAGE_BUILD_KEYS, [
    "noSecretBaseImage",
    "approvedReleaseSkeleton",
    "serviceUnitsDisabled",
    "runtimeBinariesValidated",
    "templatesParse",
    "noSecretScanPassed",
    "buildLogsSanitized",
    "imageManifestRecorded",
    "wireguardToolsPinnedInManifest"
  ]);
  const firstBoot = safeBooleanGroup(input.firstBoot, ALLOWED_FIRST_BOOT_KEYS, [
    "nodeRefReviewed",
    "providerInventoryCaptured",
    "protectedMaterialOutOfImage",
    "privateControlPlanePathReady",
    "wireguardPlanApproved",
    "wireguardTunnelAddressAssigned",
    "wireguardPeerPublicKeyExchangePlanned",
    "edgeAgentInstalled",
    "channelPlanReviewed"
  ]);
  const runtime = safeBooleanGroup(input.runtime, ALLOWED_RUNTIME_KEYS, [
    "xrayConfigTestPlanned",
    "hysteria2ConfigTestPlanned",
    "tuicConfigTestPlanned",
    "statsLoopbackOnly",
    "publicAdminBlocked"
  ]);
  const receiptGate = safeBooleanGroup(input.receiptGate, ALLOWED_RECEIPT_GATE_KEYS, [
    "desiredStatePullRequired",
    "appliedReceiptRequired",
    "freshReceiptRequired",
    "subscriptionRenderWithholdsUntilReceipt",
    "disableOrExpiryGateRequired"
  ]);
  const approval = safeBooleanGroup(input.approval, ALLOWED_APPROVAL_KEYS, [
    "exactApprovalReceived",
    "liveOrderSmokeApproved"
  ]);
  const blockers = buildBlockers({
    repoState,
    openPrScope,
    imageBuild,
    firstBoot,
    runtime,
    receiptGate
  });
  const preconditionsReady = blockers.length === 0;

  return {
    ok: true,
    mode: "node-image-provisioning-readiness-summary",
    generatedAt: text(input.generatedAt) || new Date().toISOString(),
    readiness: {
      preconditionsReady,
      approvalRequired: !approval.exactApprovalReceived,
      activationAllowed: preconditionsReady && approval.exactApprovalReceived,
      liveOrderSmokeAllowed: preconditionsReady && approval.exactApprovalReceived && approval.liveOrderSmokeApproved,
      blockers
    },
    repoState: {
      ...repoState,
      ...openPrScopeOutput(openPrScope)
    },
    imageBuild,
    firstBoot,
    runtime,
    receiptGate,
    approval,
    notes: safeNotes(input.notes),
    safety: {
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noCloudMutation: true,
      noDnsMutation: true,
      noProviderFirewallMutation: true,
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
        "privateKeys",
        "wireguardPrivateKeys",
        "customerData",
        "providerApiKeys",
        "sshPrivateKeys"
      ]
    }
  };
}
