import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildVultrNodeProvisioningDryRun } from "../../ops/node-provisioning/providers/vultr/adapter.mjs";
import { buildNodeProvisioningDryRunPlan } from "../services/node-provisioning-dry-run.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PROFILE_PATH = resolve(ROOT, "ops/node-provisioning/profiles/jp-01.json");
const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));

function firstBootPacket(overrides = {}) {
  return {
    ok: true,
    mode: "node-image-first-boot-packet",
    packet: {
      readyForFirstBootApproval: false,
      blockers: ["node registration dry-run has not passed", "wireguard tunnel address is not assigned"],
      nodeRef: profile.node.nodeRef,
      providerRef: profile.node.providerRef,
      regionRef: profile.node.regionRef,
      roleRef: profile.node.roleRef,
      channelRefCount: profile.node.channelRefs.length,
      imageManifestRef: profile.firstBoot.image.imageManifestRef,
      releaseRef: profile.firstBoot.image.releaseRef,
      wireguardPlanRef: profile.firstBoot.wireguard.planRef
    },
    node: { channelRefs: [...profile.node.channelRefs] },
    image: {
      imageManifestRef: profile.firstBoot.image.imageManifestRef,
      releaseRef: profile.firstBoot.image.releaseRef,
      artifactSha256Recorded: true,
      noSecretImageConfirmed: true
    },
    safety: {
      summaryOnly: true,
      noCloudMutation: true,
      noProductionMutation: true,
      noProtectedMaterialOutput: true
    },
    ...overrides
  };
}

function providerPlan(selectedProfile = profile) {
  return buildVultrNodeProvisioningDryRun({
    providerRef: selectedProfile.node.providerRef,
    regionRef: selectedProfile.node.regionRef,
    instancePlanRef: selectedProfile.installation.instancePlanRef,
    sizePlanRef: selectedProfile.installation.sizePlanRef,
    installationMethod: selectedProfile.installation.method,
    bootMode: selectedProfile.installation.bootMode,
    sizeDecisionApproved: selectedProfile.installation.sizeDecisionApproved,
    regionDecisionApproved: selectedProfile.installation.regionDecisionApproved
  });
}

function build(input = {}) {
  const selectedProfile = input.profile ?? profile;
  return buildNodeProvisioningDryRunPlan({
    profile: selectedProfile,
    firstBootPacket: input.firstBootPacket ?? firstBootPacket(),
    providerPlan: input.providerPlan ?? providerPlan(selectedProfile)
  });
}

test("JP-01 profile produces a C1-blocked, non-executable plan using the existing first-boot contract", () => {
  const plan = build();
  assert.equal(plan.mode, "node-provisioning-dry-run");
  assert.equal(plan.profileRef, "jp-01");
  assert.equal(plan.status, "C1_PLAN_BLOCKED");
  assert.equal(plan.executable, false);
  assert.equal(plan.executionMode, "dry-run-only");
  assert.equal(plan.source.imageArtifactSha256, "693d9f5afdfbc440870ecb7ec84bee8cc2af644574496f564f2c92ab59946442");
  assert.equal(plan.source.fileInventorySha256, "d7e9ad1387329fc47c619c9d0a5c00572b425efd2f35190e8fed2f5d9ea1f574");
  assert.equal(plan.source.artifactAvailableToRunner, false);
  assert.equal(plan.source.installedFiles, 40603);
  assert.equal(plan.source.longestPathBytes, 185);
  assert.equal(plan.source.asRunBytes, 1910);
  assert.equal(plan.safety.providerApiCalled, false);
  assert.equal(plan.safety.providerCredentialsRead, false);
  assert.equal(plan.safety.bwhConnected, false);
  assert.equal(plan.safety.externalMutation, false);
  assert.ok(plan.c1.blockers.includes("candidate image is still operator-local and is not available to the GitHub runner by immutable reference"));
  assert.ok(plan.c1.blockers.includes("M0 current evidence must be checked against the canonical JP-01 status ledger; this workflow does not mirror that state"));
  assert.equal(plan.futureGates.e4A4, "not-read-by-this-workflow");
});

test("plan contains only non-mutating operations and a closed blocked-operation list", () => {
  const plan = build();
  assert.ok(plan.operations.length > 0);
  assert.ok(plan.operations.every((operation) => operation.mutation === false));
  assert.ok(plan.blockedOperations.includes("vultr-api-call"));
  assert.ok(plan.blockedOperations.includes("create-instance"));
  assert.ok(plan.blockedOperations.includes("wireguard-private-key-generation"));
  assert.ok(plan.blockedOperations.includes("agent-registration"));
  assert.ok(plan.blockedOperations.includes("customer-traffic-activation"));
});

test("profile rejects unknown credential, host, address, or mutation fields", () => {
  for (const [key, value] of [
    ["apiKey", "not-a-real-key"],
    ["sshPrivateKey", "synthetic"],
    ["host", "203.0.113.10"],
    ["apply", true],
    ["gates", { m0: "pass" }],
    ["readiness", { projectStateCheckPassed: true }]
  ]) {
    assert.throws(() => build({ profile: { ...profile, [key]: value } }), /safe profile and evidence shape/);
  }
});

test("profile rejects a changed image digest or unsafe node reference", () => {
  assert.throws(() => build({ profile: {
    ...profile,
    image: { ...profile.image, artifactSha256: "693d9f5a" }
  } }), /safe profile and evidence shape/);
  assert.throws(() => build({ profile: {
    ...profile,
    node: { ...profile.node, nodeRef: "203.0.113.10" }
  } }), /safe profile and evidence shape/);
});

test("first-boot evidence must come from the no-cloud, no-production, no-protected-material contract", () => {
  assert.throws(() => build({ firstBootPacket: firstBootPacket({
    safety: { summaryOnly: true, noCloudMutation: false, noProductionMutation: true, noProtectedMaterialOutput: true }
  }) }), /safe profile and evidence shape/);
});

test("first-boot packet must match the exact reviewed node, channels, and image references", () => {
  const mismatched = firstBootPacket({
    packet: { ...firstBootPacket().packet, nodeRef: "node-other" }
  });
  assert.throws(() => build({ firstBootPacket: mismatched }), /safe profile and evidence shape/);
});

test("plan remains non-executable even when all C1 decision flags are marked true", () => {
  const approvedC1Profile = {
    ...profile,
    image: { ...profile.image, artifactAvailableToRunner: true },
    installation: {
      ...profile.installation,
      sizeDecisionApproved: true,
      regionDecisionApproved: true,
      costCapApproved: true,
      firewallPlanApproved: true,
      managementAccessApproved: true,
      rollbackPlanApproved: true,
      validationPlanApproved: true,
      providerMutationApproved: true,
      biosBootVerified: true,
      firstBootAccessApproved: true,
      c1ApprovalReceived: true,
      cloudInitPolicy: "approved"
    }
  };
  const plan = build({ profile: approvedC1Profile, firstBootPacket: firstBootPacket({ packet: { ...firstBootPacket().packet, readyForFirstBootApproval: true, blockers: [] } }) });
  assert.equal(plan.status, "C1_PLAN_BLOCKED");
  assert.equal(plan.executable, false);
  assert.ok(plan.c1.blockers.some((item) => item.startsWith("M0 current evidence")));
});

test("C1 review does not silently copy E4-A-4, C2, or C3 state from another ledger", () => {
  const plan = build();
  assert.equal(plan.futureGates.e4A4, "not-read-by-this-workflow");
  assert.equal(plan.futureGates.c2, "not-authorized-by-this-workflow");
  assert.equal(plan.futureGates.c3, "not-authorized-by-this-workflow");
});

test("dry-run rejects a provider plan that claims API use or a mutating operation", () => {
  const validPlan = providerPlan();
  assert.throws(() => build({ providerPlan: { ...validPlan, safety: { ...validPlan.safety, providerApiCalled: true } } }), /safe profile and evidence shape/);
  assert.throws(() => build({ providerPlan: { ...validPlan, plannedOperations: [{ id: "create-instance", mutation: true }] } }), /safe profile and evidence shape/);
});


test("IPv6 literals and unreviewed first-boot summary fields are rejected", () => {
  const base = firstBootPacket();
  assert.throws(() => build({
    profile: { ...profile, node: { ...profile.node, regionRef: "2001:db8::1" } }
  }), /safe profile and evidence shape/);
  assert.throws(() => build({
    firstBootPacket: firstBootPacket({
      packet: { ...base.packet, rawIpv6: "2001:db8::1" }
    })
  }), /safe profile and evidence shape/);
  assert.throws(() => build({
    firstBootPacket: firstBootPacket({
      packet: { ...base.packet, blockers: [...base.packet.blockers, "node address 2001:db8::1"] }
    })
  }), /safe profile and evidence shape/);
  assert.throws(() => build({
    firstBootPacket: firstBootPacket({
      safety: { ...base.safety, sshPrivateKey: "synthetic-private-key" }
    })
  }), /safe profile and evidence shape/);
});

test("provider plan rejects extra fields at every copied boundary", () => {
  const valid = providerPlan();
  assert.throws(() => build({
    providerPlan: { ...valid, sshPrivateKey: "synthetic-private-key" }
  }), /safe profile and evidence shape/);
  assert.throws(() => build({
    providerPlan: { ...valid, target: { ...valid.target, host: "2001:db8::1" } }
  }), /safe profile and evidence shape/);
  assert.throws(() => build({
    providerPlan: {
      ...valid,
      plannedOperations: [{ ...valid.plannedOperations[0], token: "synthetic" }, ...valid.plannedOperations.slice(1)]
    }
  }), /safe profile and evidence shape/);
  assert.throws(() => build({
    providerPlan: { ...valid, unresolved: ["provider endpoint 2001:db8::1"] }
  }), /safe profile and evidence shape/);
});

test("missing C0 digest or no-secret scan evidence remains a C1 blocker", () => {
  const incomplete = {
    ...profile,
    image: {
      ...profile.image,
      artifactSha256Recorded: false,
      noSecretScanPassed: false
    }
  };
  const plan = build({ profile: incomplete });
  assert.equal(plan.status, "C1_PLAN_BLOCKED");
  assert.equal(plan.executable, false);
  assert.ok(plan.c1.blockers.includes("C0 artifact SHA-256 evidence is not recorded"));
  assert.ok(plan.c1.blockers.includes("C0 no-secret scan has not passed"));
});

test("missing first-boot C0 image assertions are explicit C1 blockers", () => {
  const incomplete = {
    ...profile,
    firstBoot: {
      ...profile.firstBoot,
      image: {
        ...profile.firstBoot.image,
        artifactSha256Recorded: false,
        noSecretImageConfirmed: false
      }
    }
  };
  const packet = firstBootPacket({
    image: {
      ...firstBootPacket().image,
      artifactSha256Recorded: false,
      noSecretImageConfirmed: false
    }
  });
  const plan = build({ profile: incomplete, firstBootPacket: packet });
  assert.equal(plan.status, "C1_PLAN_BLOCKED");
  assert.ok(plan.c1.blockers.includes("C0 first-boot packet does not record artifact SHA-256 evidence"));
  assert.ok(plan.c1.blockers.includes("C0 first-boot packet does not confirm a no-secret image"));
});
