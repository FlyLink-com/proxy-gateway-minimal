const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "generatedAt",
  "node",
  "image",
  "controlPlane",
  "wireguard",
  "runtime",
  "receiptGate",
  "approval",
  "notes"
]);

const ALLOWED_NODE_KEYS = new Set([
  "nodeRef",
  "providerRef",
  "regionRef",
  "roleRef",
  "channelRefs"
]);

const ALLOWED_IMAGE_KEYS = new Set([
  "imageManifestRef",
  "releaseRef",
  "artifactSha256Recorded",
  "noSecretImageConfirmed"
]);

const ALLOWED_CONTROL_PLANE_KEYS = new Set([
  "nodeRegistrationDryRunPassed",
  "privateAgentRoutePlanned",
  "protectedMaterialInjectPlanned",
  "agentNodeIdentityPlanned"
]);

const ALLOWED_WIREGUARD_KEYS = new Set([
  "planRef",
  "tunnelAddressAssigned",
  "hostKeyGenerationPlanned",
  "peerPublicKeyExchangePlanned",
  "toolsPinnedInImageManifest"
]);

const ALLOWED_RUNTIME_KEYS = new Set([
  "servicesDisabledInImage",
  "xrayConfigTestPlanned",
  "hysteria2ConfigTestPlanned",
  "tuicConfigTestPlanned",
  "statsLoopbackOnly"
]);

const ALLOWED_RECEIPT_GATE_KEYS = new Set([
  "desiredStatePullRequired",
  "materialPullRequired",
  "appliedReceiptRequired",
  "renderWithholdsUntilReceipt"
]);

const ALLOWED_APPROVAL_KEYS = new Set([
  "exactApprovalReceived",
  "firstBootApplyApproved"
]);

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SENSITIVE_TEXT_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safePacketError() {
  return new Error("safe node image first-boot packet requires only supported summary fields");
}

function assertExactKeys(value, allowedKeys) {
  if (!isObject(value)) {
    throw safePacketError();
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw safePacketError();
    }
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function safeRef(value) {
  const normalized = text(value);
  if (!normalized) return "";
  if (!SAFE_REF_PATTERN.test(normalized) || SENSITIVE_TEXT_PATTERN.test(normalized)) {
    throw safePacketError();
  }
  return normalized;
}

// A WireGuard planRef names a plan, never a network address: it must not
// contain the characters an IPv4/IPv6 address, a CIDR range, or a path
// would need (dots, colons, slashes). This single rule is shared with
// the registration record builder (node-registration-ingestion), so a
// planRef is judged identically on both sides of the registration
// boundary; the generic safeRef above deliberately stays as-is for the
// other reference fields.
export const WG_PLAN_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isSafeWireguardPlanRef(value) {
  const normalized = text(value);
  return WG_PLAN_REF_PATTERN.test(normalized) && !SENSITIVE_TEXT_PATTERN.test(normalized);
}

export function safeWireguardPlanRef(value) {
  const normalized = text(value);
  if (!normalized) return "";
  if (!isSafeWireguardPlanRef(normalized)) {
    throw safePacketError();
  }
  return normalized;
}

function safeRefList(values) {
  if (!Array.isArray(values)) {
    throw safePacketError();
  }
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = safeRef(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function safeNotes(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = text(value);
    if (!normalized || seen.has(normalized)) continue;
    if (SENSITIVE_TEXT_PATTERN.test(normalized)) {
      throw safePacketError();
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function safeTimestamp(value) {
  const normalized = text(value);
  if (!normalized) return "";
  if (SENSITIVE_TEXT_PATTERN.test(normalized)) {
    throw safePacketError();
  }
  return normalized;
}

function booleanGroup(value, allowedKeys, keys) {
  const input = value ?? {};
  assertExactKeys(input, allowedKeys);
  return Object.fromEntries(keys.map((key) => [key, input[key] === true]));
}

function addBlockerIf(blockers, condition, message) {
  if (condition) {
    blockers.push(message);
  }
}

export function buildNodeImageFirstBootPacket(input = {}) {
  assertExactKeys(input, ALLOWED_TOP_LEVEL_KEYS);

  const node = input.node ?? {};
  const image = input.image ?? {};
  assertExactKeys(node, ALLOWED_NODE_KEYS);
  assertExactKeys(image, ALLOWED_IMAGE_KEYS);

  const nodeRef = safeRef(node.nodeRef);
  const providerRef = safeRef(node.providerRef);
  const regionRef = safeRef(node.regionRef);
  const roleRef = safeRef(node.roleRef);
  const channelRefs = safeRefList(node.channelRefs ?? []);
  const imageManifestRef = safeRef(image.imageManifestRef);
  const releaseRef = safeRef(image.releaseRef);

  const imageChecks = {
    artifactSha256Recorded: image.artifactSha256Recorded === true,
    noSecretImageConfirmed: image.noSecretImageConfirmed === true
  };
  const controlPlane = booleanGroup(input.controlPlane, ALLOWED_CONTROL_PLANE_KEYS, [
    "nodeRegistrationDryRunPassed",
    "privateAgentRoutePlanned",
    "protectedMaterialInjectPlanned",
    "agentNodeIdentityPlanned"
  ]);
  const wireguardPlanRef = safeWireguardPlanRef((input.wireguard ?? {}).planRef);
  const wireguardChecks = booleanGroup(input.wireguard, ALLOWED_WIREGUARD_KEYS, [
    "tunnelAddressAssigned",
    "hostKeyGenerationPlanned",
    "peerPublicKeyExchangePlanned",
    "toolsPinnedInImageManifest"
  ]);
  const runtime = booleanGroup(input.runtime, ALLOWED_RUNTIME_KEYS, [
    "servicesDisabledInImage",
    "xrayConfigTestPlanned",
    "hysteria2ConfigTestPlanned",
    "tuicConfigTestPlanned",
    "statsLoopbackOnly"
  ]);
  const receiptGate = booleanGroup(input.receiptGate, ALLOWED_RECEIPT_GATE_KEYS, [
    "desiredStatePullRequired",
    "materialPullRequired",
    "appliedReceiptRequired",
    "renderWithholdsUntilReceipt"
  ]);
  const approval = booleanGroup(input.approval, ALLOWED_APPROVAL_KEYS, [
    "exactApprovalReceived",
    "firstBootApplyApproved"
  ]);

  const blockers = [];
  addBlockerIf(blockers, !nodeRef, "nodeRef is required");
  addBlockerIf(blockers, !providerRef, "providerRef is required");
  addBlockerIf(blockers, !regionRef, "regionRef is required");
  addBlockerIf(blockers, !roleRef, "roleRef is required");
  addBlockerIf(blockers, channelRefs.length === 0, "at least one channelRef is required");
  addBlockerIf(blockers, !imageManifestRef, "imageManifestRef is required");
  addBlockerIf(blockers, !releaseRef, "releaseRef is required");
  addBlockerIf(blockers, !imageChecks.artifactSha256Recorded, "artifact sha256 is not recorded");
  addBlockerIf(blockers, !imageChecks.noSecretImageConfirmed, "image is not confirmed no-secret");
  addBlockerIf(blockers, !controlPlane.nodeRegistrationDryRunPassed, "node registration dry-run has not passed");
  addBlockerIf(blockers, !controlPlane.privateAgentRoutePlanned, "private agent route is not planned");
  addBlockerIf(blockers, !controlPlane.protectedMaterialInjectPlanned, "protected material injection is not planned");
  addBlockerIf(blockers, !controlPlane.agentNodeIdentityPlanned, "agent node identity is not planned");
  addBlockerIf(blockers, !wireguardPlanRef, "wireguard plan ref is required");
  addBlockerIf(blockers, !wireguardChecks.tunnelAddressAssigned, "wireguard tunnel address is not assigned");
  addBlockerIf(blockers, !wireguardChecks.hostKeyGenerationPlanned, "wireguard host key generation is not planned");
  addBlockerIf(blockers, !wireguardChecks.peerPublicKeyExchangePlanned, "wireguard peer public-key exchange is not planned");
  addBlockerIf(blockers, !wireguardChecks.toolsPinnedInImageManifest, "wireguard tools are not pinned in the image manifest");
  addBlockerIf(blockers, !runtime.servicesDisabledInImage, "services are not confirmed disabled in the image");
  addBlockerIf(blockers, !runtime.xrayConfigTestPlanned, "Xray config-test is not planned");
  addBlockerIf(blockers, !runtime.hysteria2ConfigTestPlanned, "Hysteria2 config-test is not planned");
  addBlockerIf(blockers, !runtime.tuicConfigTestPlanned, "TUIC config-test is not planned");
  addBlockerIf(blockers, !runtime.statsLoopbackOnly, "stats surfaces are not confirmed loopback-only");
  addBlockerIf(blockers, !receiptGate.desiredStatePullRequired, "desired-state pull is not required");
  addBlockerIf(blockers, !receiptGate.materialPullRequired, "material pull is not required");
  addBlockerIf(blockers, !receiptGate.appliedReceiptRequired, "applied receipt is not required");
  addBlockerIf(blockers, !receiptGate.renderWithholdsUntilReceipt, "subscription rendering is not confirmed receipt-gated");

  const readyForFirstBootApproval = blockers.length === 0;
  return {
    ok: true,
    mode: "node-image-first-boot-packet",
    generatedAt: safeTimestamp(input.generatedAt) || new Date().toISOString(),
    packet: {
      readyForFirstBootApproval,
      approvalRequired: !approval.exactApprovalReceived,
      firstBootApplyAllowed: readyForFirstBootApproval && approval.exactApprovalReceived && approval.firstBootApplyApproved,
      blockers,
      nodeRef,
      providerRef,
      regionRef,
      roleRef,
      channelRefCount: channelRefs.length,
      imageManifestRef,
      releaseRef,
      wireguardPlanRef
    },
    node: {
      nodeRef,
      providerRef,
      regionRef,
      roleRef,
      channelRefs
    },
    image: {
      imageManifestRef,
      releaseRef,
      ...imageChecks
    },
    controlPlane,
    wireguard: {
      planRef: wireguardPlanRef,
      ...wireguardChecks
    },
    runtime,
    receiptGate,
    approval,
    plannedOperations: [
      {
        id: "review-first-boot-registration-packet",
        mutation: false,
        requiresRiskAGate: true
      },
      {
        id: "establish-wireguard-control-tunnel",
        mutation: false,
        requiresRiskAGate: true
      },
      {
        id: "prepare-protected-material-injection",
        mutation: false,
        requiresRiskAGate: true
      },
      {
        id: "verify-receipt-gated-rendering",
        mutation: false,
        requiresRiskAGate: true
      }
    ],
    notes: safeNotes(input.notes),
    safety: {
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noCloudMutation: true,
      noDnsMutation: true,
      noProviderFirewallMutation: true,
      noSubscriptionOutputMutation: true,
      noProtectedMaterialOutput: true,
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
