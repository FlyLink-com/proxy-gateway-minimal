const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const BLOCKED_MUTATIONS = Object.freeze([
  "create-instance",
  "delete-instance",
  "upload-image",
  "attach-firewall",
  "rescue-boot",
  "write-disk",
  "inject-cloud-init-user-data",
  "ssh-or-scp"
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeError() {
  return new Error("vultr node provisioning adapter accepts only the reviewed dry-run profile");
}

function safeRef(value) {
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value)) throw safeError();
  return value;
}

export function buildVultrNodeProvisioningDryRun(profile = {}) {
  if (!isObject(profile) || profile.providerRef !== "provider-vultr") throw safeError();
  const regionRef = safeRef(profile.regionRef);
  const instancePlanRef = safeRef(profile.instancePlanRef);
  const sizePlanRef = safeRef(profile.sizePlanRef);
  if (profile.installationMethod !== "rescue-dd" || profile.bootMode !== "bios-mbr") throw safeError();
  if (typeof profile.sizeDecisionApproved !== "boolean" || typeof profile.regionDecisionApproved !== "boolean") throw safeError();

  return {
    ok: true,
    provider: "vultr",
    mode: "dry-run-only",
    executable: false,
    target: {
      regionRef,
      instancePlanRef,
      sizePlanRef,
      installationMethod: "rescue-dd",
      bootMode: "bios-mbr"
    },
    plannedOperations: [
      { id: "resolve-vultr-region-reference", mutation: false },
      { id: "resolve-lightweight-instance-plan", mutation: false },
      { id: "plan-candidate-instance-create", mutation: false },
      { id: "plan-rescue-image-write", mutation: false },
      { id: "plan-candidate-destroy-and-cleanup", mutation: false }
    ],
    blockedMutations: BLOCKED_MUTATIONS,
    unresolved: [
      ...(profile.regionDecisionApproved ? [] : ["exact Vultr Japan region decision pending"]),
      ...(profile.sizeDecisionApproved ? [] : ["lightweight Vultr instance size decision pending"]),
      "provider API execution is not implemented in this phase",
      "no provider credential or GitHub Environment is configured"
    ],
    safety: {
      providerApiCalled: false,
      providerCredentialsRead: false,
      externalMutation: false
    }
  };
}
