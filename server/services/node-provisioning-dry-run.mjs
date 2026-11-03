import { isIP } from "node:net";

const PROFILE_KEYS = new Set(["schemaVersion", "profileRef", "node", "image", "installation", "firstBoot"]);
const NODE_KEYS = new Set(["nodeRef", "providerRef", "regionRef", "roleRef", "channelRefs"]);
const IMAGE_KEYS = new Set([
  "artifactRef",
  "artifactFileName",
  "artifactSha256",
  "rawImageSha256",
  "fileInventorySha256",
  "asRunSha256",
  "bomSha256",
  "sourceCommit",
  "artifactSha256Recorded",
  "artifactAvailableToRunner",
  "installedFiles",
  "longestPathBytes",
  "asRunBytes",
  "noSecretScanPassed",
  "reproducibility"
]);
const INSTALLATION_KEYS = new Set([
  "method",
  "bootMode",
  "instancePlanRef",
  "sizePlanRef",
  "sizeDecisionApproved",
  "regionDecisionApproved",
  "costCapApproved",
  "firewallPlanApproved",
  "managementAccessApproved",
  "rollbackPlanApproved",
  "validationPlanApproved",
  "providerMutationApproved",
  "biosBootVerified",
  "firstBootAccessApproved",
  "c1ApprovalReceived",
  "cloudInitPolicy",
  "sshService"
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SENSITIVE_TEXT_PATTERN = /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;
const SENSITIVE_BLOCKER_PATTERN = /https?:|token\s*=|secret\s*=|credential\s*=|password\s*=|@|(?:\d{1,3}\.){3}\d{1,3}|(?:private|secret)[\s_-]*(?:key|material|value)/i;

const FIRST_BOOT_PACKET_KEYS = new Set([
  "generatedAt", "node", "image", "controlPlane", "wireguard", "runtime",
  "receiptGate", "approval", "plannedOperations", "notes", "safety", "ok",
  "mode", "packet"
]);
const FIRST_BOOT_SUMMARY_KEYS = new Set([
  "readyForFirstBootApproval", "approvalRequired", "firstBootApplyAllowed",
  "blockers", "nodeRef", "providerRef", "regionRef", "roleRef",
  "channelRefCount", "imageManifestRef", "releaseRef", "wireguardPlanRef"
]);
const FIRST_BOOT_NODE_KEYS = new Set(["nodeRef", "providerRef", "regionRef", "roleRef", "channelRefs"]);
const FIRST_BOOT_IMAGE_KEYS = new Set([
  "imageManifestRef", "releaseRef", "artifactSha256Recorded", "noSecretImageConfirmed"
]);
const FIRST_BOOT_SAFETY_KEYS = new Set([
  "summaryOnly", "noRuntimeMutation", "noProductionMutation", "noCloudMutation",
  "noDnsMutation", "noProviderFirewallMutation", "noSubscriptionOutputMutation",
  "noProtectedMaterialOutput", "omittedFields"
]);
const FIRST_BOOT_CONTROL_PLANE_KEYS = new Set([
  "nodeRegistrationDryRunPassed", "privateAgentRoutePlanned",
  "protectedMaterialInjectPlanned", "agentNodeIdentityPlanned"
]);
const FIRST_BOOT_WIREGUARD_KEYS = new Set([
  "planRef", "tunnelAddressAssigned", "hostKeyGenerationPlanned",
  "peerPublicKeyExchangePlanned", "toolsPinnedInImageManifest"
]);
const FIRST_BOOT_RUNTIME_KEYS = new Set([
  "servicesDisabledInImage", "xrayConfigTestPlanned", "hysteria2ConfigTestPlanned",
  "tuicConfigTestPlanned", "statsLoopbackOnly"
]);
const FIRST_BOOT_RECEIPT_GATE_KEYS = new Set([
  "desiredStatePullRequired", "materialPullRequired", "appliedReceiptRequired",
  "renderWithholdsUntilReceipt"
]);
const FIRST_BOOT_APPROVAL_KEYS = new Set(["exactApprovalReceived", "firstBootApplyApproved"]);
const FIRST_BOOT_OPERATION_KEYS = new Set(["id", "mutation", "requiresRiskAGate"]);
const FIRST_BOOT_OPERATION_IDS = new Set([
  "review-first-boot-registration-packet",
  "establish-wireguard-control-tunnel",
  "prepare-protected-material-injection",
  "verify-receipt-gated-rendering"
]);
const FIRST_BOOT_BLOCKERS = new Set([
  "nodeRef is required",
  "providerRef is required",
  "regionRef is required",
  "roleRef is required",
  "at least one channelRef is required",
  "imageManifestRef is required",
  "releaseRef is required",
  "artifact sha256 is not recorded",
  "image is not confirmed no-secret",
  "node registration dry-run has not passed",
  "private agent route is not planned",
  "protected material injection is not planned",
  "agent node identity is not planned",
  "wireguard plan ref is required",
  "wireguard tunnel address is not assigned",
  "wireguard host key generation is not planned",
  "wireguard peer public-key exchange is not planned",
  "wireguard tools are not pinned in the image manifest",
  "services are not confirmed disabled in the image",
  "Xray config-test is not planned",
  "Hysteria2 config-test is not planned",
  "TUIC config-test is not planned",
  "stats surfaces are not confirmed loopback-only",
  "desired-state pull is not required",
  "material pull is not required",
  "applied receipt is not required",
  "subscription rendering is not confirmed receipt-gated"
]);
const SAFE_OMITTED_FIELDS = Object.freeze([
  "rawHosts", "rawIps", "rawPorts", "rawSecrets", "tokens", "subscriptionUrls",
  "credentials", "privateKeys", "wireguardPrivateKeys", "customerData",
  "providerApiKeys", "sshPrivateKeys"
]);
const PROVIDER_PLAN_KEYS = new Set([
  "ok", "provider", "mode", "executable", "target", "plannedOperations",
  "blockedMutations", "unresolved", "safety"
]);
const PROVIDER_TARGET_KEYS = new Set([
  "regionRef", "instancePlanRef", "sizePlanRef", "installationMethod", "bootMode"
]);
const PROVIDER_SAFETY_KEYS = new Set([
  "providerApiCalled", "providerCredentialsRead", "externalMutation"
]);
const PROVIDER_OPERATION_KEYS = new Set(["id", "mutation"]);
const PROVIDER_OPERATION_IDS = Object.freeze([
  "resolve-vultr-region-reference",
  "resolve-lightweight-instance-plan",
  "plan-candidate-instance-create",
  "plan-rescue-image-write",
  "plan-candidate-destroy-and-cleanup"
]);
const PROVIDER_BLOCKED_MUTATIONS = Object.freeze([
  "create-instance", "delete-instance", "upload-image", "attach-firewall",
  "rescue-boot", "write-disk", "inject-cloud-init-user-data", "ssh-or-scp"
]);


const FIXED_OPERATIONS = Object.freeze([
  { id: "validate-safe-profile", mutation: false },
  { id: "build-existing-first-boot-packet", mutation: false },
  { id: "render-candidate-install-plan", mutation: false },
  { id: "write-redacted-plan-evidence", mutation: false }
]);

const BLOCKED_OPERATIONS = Object.freeze([
  "vultr-api-call",
  "create-instance",
  "delete-instance",
  "upload-provider-image",
  "rescue-boot",
  "disk-write-dd",
  "ssh-or-scp",
  "cloud-init-user-data-injection",
  "wireguard-private-key-generation",
  "wireguard-peer-change",
  "agent-registration",
  "production-database-write",
  "service-enable-or-restart",
  "customer-traffic-activation"
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeError() {
  return new Error("node provisioning dry-run accepts only the reviewed safe profile and evidence shape");
}

function assertExactKeys(value, allowed) {
  if (!isObject(value)) throw safeError();
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw safeError();
  }
}

function assertSafeRef(value) {
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value) || containsSensitiveReference(value)) throw safeError();
  return value;
}

function assertArtifactFileName(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}\.img\.zst$/.test(value)) throw safeError();
  return value;
}

function assertDigest(value) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw safeError();
  return value;
}

function assertBoolean(value) {
  if (typeof value !== "boolean") throw safeError();
  return value;
}

function assertNonNegativeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw safeError();
  return value;
}

function containsIpLiteral(value) {
  const candidates = value.match(/[0-9a-f:.%]+/gi) ?? [];
  return candidates.some((candidate) => {
    const normalized = candidate.replace(/%[a-z0-9_.-]+$/i, "");
    return isIP(normalized) !== 0;
  });
}

function containsSensitiveReference(value) {
  return SENSITIVE_TEXT_PATTERN.test(value) || containsIpLiteral(value);
}

function assertSafeSummaryText(value, maxLength = 256) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || SENSITIVE_BLOCKER_PATTERN.test(value)
    || containsIpLiteral(value)
  ) throw safeError();
  return value;
}

function assertOptionalBooleanFields(value, allowed, fields) {
  assertExactKeys(value, allowed);
  for (const field of fields) {
    if (value[field] !== undefined) assertBoolean(value[field]);
  }
}

function assertOptionalSafeRefs(value, fields) {
  for (const field of fields) {
    if (value[field] !== undefined) assertSafeRef(value[field]);
  }
}

function safeBlockers(value) {
  if (!Array.isArray(value) || !value.every((item) =>
    typeof item === "string"
    && item.length > 0
    && item.length <= 256
    && FIRST_BOOT_BLOCKERS.has(item)
    && !SENSITIVE_BLOCKER_PATTERN.test(item)
    && !containsIpLiteral(item)
  )) throw safeError();
  return value;
}

function validateFirstBootPacket(packet, profile) {
  if (!isObject(packet) || packet.ok !== true || packet.mode !== "node-image-first-boot-packet") throw safeError();
  assertExactKeys(packet, FIRST_BOOT_PACKET_KEYS);
  if (!isObject(packet.packet) || !isObject(packet.node) || !isObject(packet.image) || !isObject(packet.safety)) throw safeError();

  assertExactKeys(packet.packet, FIRST_BOOT_SUMMARY_KEYS);
  assertExactKeys(packet.node, FIRST_BOOT_NODE_KEYS);
  assertExactKeys(packet.image, FIRST_BOOT_IMAGE_KEYS);
  assertExactKeys(packet.safety, FIRST_BOOT_SAFETY_KEYS);

  for (const key of ["readyForFirstBootApproval", "approvalRequired", "firstBootApplyAllowed"]) {
    if (packet.packet[key] !== undefined) assertBoolean(packet.packet[key]);
  }
  if (!Array.isArray(packet.node.channelRefs)) throw safeError();
  if (packet.packet.channelRefCount !== profile.node.channelRefs.length) throw safeError();
  if (packet.node.channelRefs.length !== profile.node.channelRefs.length) throw safeError();
  assertOptionalSafeRefs(packet.packet, [
    "nodeRef", "providerRef", "regionRef", "roleRef", "imageManifestRef", "releaseRef", "wireguardPlanRef"
  ]);
  assertOptionalSafeRefs(packet.node, ["nodeRef", "providerRef", "regionRef", "roleRef"]);
  packet.node.channelRefs.forEach(assertSafeRef);
  if (packet.node.channelRefs.some((value, index) => value !== profile.node.channelRefs[index])) throw safeError();

  const expected = profile.node;
  if (
    packet.packet.nodeRef !== expected.nodeRef
    || packet.packet.providerRef !== expected.providerRef
    || packet.packet.regionRef !== expected.regionRef
    || packet.packet.roleRef !== expected.roleRef
    || packet.packet.imageManifestRef !== profile.firstBoot.image.imageManifestRef
    || packet.packet.releaseRef !== profile.firstBoot.image.releaseRef
    || packet.packet.wireguardPlanRef !== profile.firstBoot.wireguard.planRef
    || packet.packet.channelRefCount !== expected.channelRefs.length
    || packet.node.channelRefs.some((value, index) => value !== expected.channelRefs[index])
  ) throw safeError();

  assertSafeRef(packet.image.imageManifestRef);
  assertSafeRef(packet.image.releaseRef);
  assertBoolean(packet.image.artifactSha256Recorded);
  assertBoolean(packet.image.noSecretImageConfirmed);
  if (
    packet.image.imageManifestRef !== profile.firstBoot.image.imageManifestRef
    || packet.image.releaseRef !== profile.firstBoot.image.releaseRef
    || packet.image.artifactSha256Recorded !== profile.firstBoot.image.artifactSha256Recorded
    || packet.image.noSecretImageConfirmed !== profile.firstBoot.image.noSecretImageConfirmed
  ) throw safeError();

  const requiredSafety = ["summaryOnly", "noCloudMutation", "noProductionMutation", "noProtectedMaterialOutput"];
  for (const key of [
    "summaryOnly", "noRuntimeMutation", "noProductionMutation", "noCloudMutation",
    "noDnsMutation", "noProviderFirewallMutation", "noSubscriptionOutputMutation",
    "noProtectedMaterialOutput"
  ]) {
    if (packet.safety[key] !== undefined) assertBoolean(packet.safety[key]);
  }
  if (requiredSafety.some((key) => packet.safety[key] !== true)) throw safeError();
  if (packet.safety.omittedFields !== undefined) {
    if (
      !Array.isArray(packet.safety.omittedFields)
      || JSON.stringify(packet.safety.omittedFields) !== JSON.stringify(SAFE_OMITTED_FIELDS)
    ) throw safeError();
  }

  const optionalGroups = [
    ["controlPlane", FIRST_BOOT_CONTROL_PLANE_KEYS, [...FIRST_BOOT_CONTROL_PLANE_KEYS]],
    ["wireguard", FIRST_BOOT_WIREGUARD_KEYS, [...FIRST_BOOT_WIREGUARD_KEYS].filter((key) => key !== "planRef")],
    ["runtime", FIRST_BOOT_RUNTIME_KEYS, [...FIRST_BOOT_RUNTIME_KEYS]],
    ["receiptGate", FIRST_BOOT_RECEIPT_GATE_KEYS, [...FIRST_BOOT_RECEIPT_GATE_KEYS]],
    ["approval", FIRST_BOOT_APPROVAL_KEYS, [...FIRST_BOOT_APPROVAL_KEYS]]
  ];
  for (const [name, allowed, fields] of optionalGroups) {
    if (packet[name] !== undefined) assertOptionalBooleanFields(packet[name], allowed, fields);
  }
  if (packet.wireguard !== undefined && packet.wireguard.planRef !== undefined) {
    assertSafeRef(packet.wireguard.planRef);
    if (packet.wireguard.planRef !== profile.firstBoot.wireguard.planRef) throw safeError();
  }
  if (packet.plannedOperations !== undefined) {
    if (!Array.isArray(packet.plannedOperations) || packet.plannedOperations.length !== FIRST_BOOT_OPERATION_IDS.size) throw safeError();
    for (let index = 0; index < packet.plannedOperations.length; index += 1) {
      const operation = packet.plannedOperations[index];
      assertExactKeys(operation, FIRST_BOOT_OPERATION_KEYS);
      if (
        operation.id !== [...FIRST_BOOT_OPERATION_IDS][index]
        || operation.mutation !== false
        || operation.requiresRiskAGate !== true
      ) throw safeError();
    }
  }
  if (packet.notes !== undefined) {
    if (!Array.isArray(packet.notes)) throw safeError();
    packet.notes.forEach((note) => assertSafeSummaryText(note, 512));
  }
  if (packet.generatedAt !== undefined) assertSafeSummaryText(packet.generatedAt, 128);
  return safeBlockers(packet.packet.blockers);
}

function validateProviderPlan(providerPlan, profile) {
  if (!isObject(providerPlan)) throw safeError();
  assertExactKeys(providerPlan, PROVIDER_PLAN_KEYS);
  if (providerPlan.ok !== true || providerPlan.provider !== "vultr" || providerPlan.mode !== "dry-run-only" || providerPlan.executable !== false) throw safeError();

  assertExactKeys(providerPlan.target, PROVIDER_TARGET_KEYS);
  for (const key of ["regionRef", "instancePlanRef", "sizePlanRef"]) assertSafeRef(providerPlan.target[key]);
  if (
    providerPlan.target.regionRef !== profile.node.regionRef
    || providerPlan.target.instancePlanRef !== profile.installation.instancePlanRef
    || providerPlan.target.sizePlanRef !== profile.installation.sizePlanRef
    || providerPlan.target.installationMethod !== profile.installation.method
    || providerPlan.target.bootMode !== profile.installation.bootMode
  ) throw safeError();

  assertExactKeys(providerPlan.safety, PROVIDER_SAFETY_KEYS);
  if (
    providerPlan.safety.providerApiCalled !== false
    || providerPlan.safety.providerCredentialsRead !== false
    || providerPlan.safety.externalMutation !== false
  ) throw safeError();

  if (!Array.isArray(providerPlan.plannedOperations) || providerPlan.plannedOperations.length !== PROVIDER_OPERATION_IDS.length) throw safeError();
  for (let index = 0; index < PROVIDER_OPERATION_IDS.length; index += 1) {
    const operation = providerPlan.plannedOperations[index];
    assertExactKeys(operation, PROVIDER_OPERATION_KEYS);
    if (operation.id !== PROVIDER_OPERATION_IDS[index] || operation.mutation !== false) throw safeError();
  }
  if (
    !Array.isArray(providerPlan.blockedMutations)
    || JSON.stringify(providerPlan.blockedMutations) !== JSON.stringify(PROVIDER_BLOCKED_MUTATIONS)
  ) throw safeError();

  const expectedUnresolved = [
    ...(profile.installation.regionDecisionApproved ? [] : ["exact Vultr Japan region decision pending"]),
    ...(profile.installation.sizeDecisionApproved ? [] : ["lightweight Vultr instance size decision pending"]),
    "provider API execution is not implemented in this phase",
    "no provider credential or GitHub Environment is configured"
  ];
  if (!Array.isArray(providerPlan.unresolved) || JSON.stringify(providerPlan.unresolved) !== JSON.stringify(expectedUnresolved)) throw safeError();
}

function validateProfile(profile) {
  assertExactKeys(profile, PROFILE_KEYS);
  if (profile.schemaVersion !== "1" || profile.profileRef !== "jp-01") throw safeError();

  assertExactKeys(profile.node, NODE_KEYS);
  for (const key of ["nodeRef", "providerRef", "regionRef", "roleRef"]) assertSafeRef(profile.node[key]);
  if (!Array.isArray(profile.node.channelRefs) || profile.node.channelRefs.length !== 3) throw safeError();
  profile.node.channelRefs.forEach(assertSafeRef);
  if (new Set(profile.node.channelRefs).size !== profile.node.channelRefs.length) throw safeError();

  assertExactKeys(profile.image, IMAGE_KEYS);
  assertSafeRef(profile.image.artifactRef);
  assertArtifactFileName(profile.image.artifactFileName);
  for (const key of ["artifactSha256", "rawImageSha256", "fileInventorySha256", "asRunSha256", "bomSha256"]) assertDigest(profile.image[key]);
  if (typeof profile.image.sourceCommit !== "string" || !COMMIT_PATTERN.test(profile.image.sourceCommit)) throw safeError();
  for (const key of ["artifactSha256Recorded", "artifactAvailableToRunner", "noSecretScanPassed"]) assertBoolean(profile.image[key]);
  for (const key of ["installedFiles", "longestPathBytes", "asRunBytes"]) assertNonNegativeInteger(profile.image[key]);
  if (profile.image.reproducibility !== "content-level-only") throw safeError();

  assertExactKeys(profile.installation, INSTALLATION_KEYS);
  if (profile.installation.method !== "rescue-dd" || profile.installation.bootMode !== "bios-mbr") throw safeError();
  assertSafeRef(profile.installation.instancePlanRef);
  assertSafeRef(profile.installation.sizePlanRef);
  for (const key of ["sizeDecisionApproved", "regionDecisionApproved", "costCapApproved", "firewallPlanApproved", "managementAccessApproved", "rollbackPlanApproved", "validationPlanApproved", "providerMutationApproved", "biosBootVerified", "firstBootAccessApproved", "c1ApprovalReceived"]) assertBoolean(profile.installation[key]);
  if (!["pending-c1-review", "approved"].includes(profile.installation.cloudInitPolicy)) throw safeError();
  if (profile.installation.sshService !== "disabled") throw safeError();
  if (!isObject(profile.firstBoot)) throw safeError();
}

export function buildNodeProvisioningDryRunPlan({ profile, firstBootPacket, providerPlan } = {}) {
  validateProfile(profile);
  const firstBootBlockers = validateFirstBootPacket(firstBootPacket, profile);  validateProviderPlan(providerPlan, profile);

  const c1Blockers = [];
  const addC1Blocker = (condition, message) => {
    if (condition && !c1Blockers.includes(message)) c1Blockers.push(message);
  };
  addC1Blocker(!profile.image.artifactSha256Recorded, "C0 artifact SHA-256 evidence is not recorded");
  addC1Blocker(!profile.image.noSecretScanPassed, "C0 no-secret scan has not passed");
  addC1Blocker(!profile.firstBoot?.image?.artifactSha256Recorded, "C0 first-boot packet does not record artifact SHA-256 evidence");
  addC1Blocker(!profile.firstBoot?.image?.noSecretImageConfirmed, "C0 first-boot packet does not confirm a no-secret image");
  addC1Blocker(!profile.image.artifactAvailableToRunner, "candidate image is still operator-local and is not available to the GitHub runner by immutable reference");
  addC1Blocker(!profile.installation.sizeDecisionApproved, "the lightweight Vultr instance plan has not received the exact C1 decision");
  addC1Blocker(!profile.installation.regionDecisionApproved, "the exact Vultr Japan region has not been approved for C1");
  addC1Blocker(!profile.installation.costCapApproved, "the C1 cost ceiling has not been approved");
  addC1Blocker(!profile.installation.firewallPlanApproved, "the C1 provider firewall boundary has not been approved");
  addC1Blocker(!profile.installation.managementAccessApproved, "the C1 management access boundary has not been approved");
  addC1Blocker(!profile.installation.rollbackPlanApproved, "the C1 rollback and destroy plan has not been approved");
  addC1Blocker(!profile.installation.validationPlanApproved, "the C1 target validation plan has not been approved");
  addC1Blocker(!profile.installation.providerMutationApproved, "provider mutation has not been approved for C1");
  addC1Blocker(!profile.installation.biosBootVerified, "Vultr BIOS boot compatibility has not been verified on a C1 candidate");
  addC1Blocker(!profile.installation.firstBootAccessApproved, "the first-boot access path has not been approved");
  addC1Blocker(profile.installation.cloudInitPolicy !== "approved", "cloud-init first-boot policy remains pending C1 review");
  addC1Blocker(!profile.installation.c1ApprovalReceived, "the exact C1 installation approval has not been supplied to this dry-run");
  addC1Blocker(true, "M0 current evidence must be checked against the canonical JP-01 status ledger; this workflow does not mirror that state");

  const uniqueC1Blockers = [...new Set(c1Blockers)];
  return {
    ok: true,
    mode: "node-provisioning-dry-run",
    generatedAt: new Date().toISOString(),
    profileRef: profile.profileRef,
    status: "C1_PLAN_BLOCKED",
    executable: false,
    executionMode: "dry-run-only",
    source: {
      commit: profile.image.sourceCommit,
      bomSha256: profile.image.bomSha256,
      imageArtifactRef: profile.image.artifactRef,
      imageArtifactFileName: profile.image.artifactFileName,
      imageArtifactSha256: profile.image.artifactSha256,
      rawImageSha256: profile.image.rawImageSha256,
      fileInventorySha256: profile.image.fileInventorySha256,
      asRunSha256: profile.image.asRunSha256,
      installedFiles: profile.image.installedFiles,
      longestPathBytes: profile.image.longestPathBytes,
      asRunBytes: profile.image.asRunBytes,
      reproducibility: profile.image.reproducibility,
      artifactAvailableToRunner: profile.image.artifactAvailableToRunner
    },
    target: {
      nodeRef: profile.node.nodeRef,
      providerRef: profile.node.providerRef,
      regionRef: profile.node.regionRef,
      roleRef: profile.node.roleRef,
      channelRefs: profile.node.channelRefs,
      instancePlanRef: profile.installation.instancePlanRef,
      sizePlanRef: profile.installation.sizePlanRef,
      installationMethod: profile.installation.method,
      bootMode: profile.installation.bootMode,
      cloudInitPolicy: profile.installation.cloudInitPolicy,
      sshService: profile.installation.sshService
    },
    c1: {
      blockers: uniqueC1Blockers,
      firstBootReadyForApproval: firstBootPacket.packet.readyForFirstBootApproval
    },
    futureGates: {
      e4A4: "not-read-by-this-workflow",
      c2: "not-authorized-by-this-workflow",
      c3: "not-authorized-by-this-workflow",
      c4: "not-authorized-by-this-workflow",
      c5: "not-authorized-by-this-workflow",
      c6: "not-authorized-by-this-workflow"
    },
    firstBootPacketBlockers: firstBootBlockers,
    providerPlan,
    operations: FIXED_OPERATIONS,
    blockedOperations: BLOCKED_OPERATIONS,
    safety: {
      providerApiCalled: false,
      providerCredentialsRead: false,
      sshUsed: false,
      bwhConnected: false,
      wireguardPrivateKeyGenerated: false,
      agentRegistered: false,
      productionDatabaseWritten: false,
      servicesEnabled: false,
      customerTrafficActivated: false,
      externalMutation: false
    }
  };
}
