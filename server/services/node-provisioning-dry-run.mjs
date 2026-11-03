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
const SENSITIVE_BLOCKER_PATTERN = /https?:|token=|secret=|credential=|password=|@|(?:\d{1,3}\.){3}\d{1,3}/i;

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
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value) || SENSITIVE_TEXT_PATTERN.test(value)) throw safeError();
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

function safeBlockers(value) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 256 && !SENSITIVE_BLOCKER_PATTERN.test(item))) throw safeError();
  return value;
}

function validateFirstBootPacket(packet, profile) {
  if (!isObject(packet) || packet.ok !== true || packet.mode !== "node-image-first-boot-packet") throw safeError();
  if (!isObject(packet.packet) || !isObject(packet.node) || !Array.isArray(packet.node.channelRefs) || !isObject(packet.image) || !isObject(packet.safety)) throw safeError();
  if (packet.safety.summaryOnly !== true || packet.safety.noCloudMutation !== true || packet.safety.noProductionMutation !== true || packet.safety.noProtectedMaterialOutput !== true) throw safeError();

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
    || packet.node.channelRefs.length !== expected.channelRefs.length
    || packet.node.channelRefs.some((value, index) => value !== expected.channelRefs[index])
  ) throw safeError();

  if (packet.image.artifactSha256Recorded !== profile.firstBoot.image.artifactSha256Recorded || packet.image.noSecretImageConfirmed !== profile.firstBoot.image.noSecretImageConfirmed) throw safeError();
  return safeBlockers(packet.packet.blockers);
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
  const firstBootBlockers = validateFirstBootPacket(firstBootPacket, profile);
  if (!isObject(providerPlan) || providerPlan.ok !== true || providerPlan.provider !== "vultr" || providerPlan.mode !== "dry-run-only" || providerPlan.executable !== false) throw safeError();
  if (providerPlan.safety?.providerApiCalled !== false || providerPlan.safety?.providerCredentialsRead !== false || providerPlan.safety?.externalMutation !== false) throw safeError();
  if (!Array.isArray(providerPlan.plannedOperations) || !providerPlan.plannedOperations.every((operation) => isObject(operation) && operation.mutation === false)) throw safeError();
  if (!Array.isArray(providerPlan.blockedMutations) || !providerPlan.blockedMutations.includes("create-instance") || !Array.isArray(providerPlan.unresolved) || !providerPlan.unresolved.every((item) => typeof item === "string" && item.length <= 256 && !SENSITIVE_BLOCKER_PATTERN.test(item))) throw safeError();
  if (providerPlan.target?.regionRef !== profile.node.regionRef || providerPlan.target?.instancePlanRef !== profile.installation.instancePlanRef || providerPlan.target?.sizePlanRef !== profile.installation.sizePlanRef || providerPlan.target?.installationMethod !== profile.installation.method || providerPlan.target?.bootMode !== profile.installation.bootMode) throw safeError();

  const c1Blockers = [];
  const addC1Blocker = (condition, message) => {
    if (condition && !c1Blockers.includes(message)) c1Blockers.push(message);
  };
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
