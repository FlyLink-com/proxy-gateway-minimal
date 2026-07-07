import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlatformLead } from "../services/platform/control-plane-contract.mjs";
import { createPlatformAccountEntitlementShell } from "../services/platform/account-entitlement-shell.mjs";
import { createPlatformSubscriptionAccessShell } from "../services/platform/subscription-access-shell.mjs";
import { createCleanStartControlPlanePackage } from "../services/platform/clean-start-control-plane.mjs";

const NOW = "2026-05-27T10:00:00.000Z";

function sampleLead(id = "lead_1") {
  return normalizePlatformLead({
    id,
    organization: "Acme Research",
    email: "ops@example.com",
    direction: "API Sandbox",
    stage: "pilot budget approved",
    message: "Need private AI workflow automation details."
  }, { now: NOW });
}

function createReadyCleanStartState() {
  const accountShell = createPlatformAccountEntitlementShell({
    nowFn: () => NOW,
    accountIdFactory: () => "acct_1",
    entitlementIdFactory: () => "ent_1"
  });
  const account = accountShell.createAccountFromLead(sampleLead(), {
    status: "active"
  });
  const entitlement = accountShell.createEntitlement(account.id, {
    plan: "pilot",
    status: "active",
    validFrom: "2026-05-27T00:00:00.000Z",
    validUntil: "2026-06-27T00:00:00.000Z",
    quota: { trafficGb: 100 }
  });
  const accessShell = createPlatformSubscriptionAccessShell({
    accountShell,
    nowFn: () => NOW,
    accessIdFactory: () => "access_1"
  });
  accessShell.issueDynamicEntry(account.id, entitlement.id, {
    entryRef: "entry_ref_secret",
    artifactRef: "artifact_ref_secret",
    rawEntryUrl: "https://portal-secret.example/use?token=dynamic-secret",
    subscriptionUrl: "https://sub-secret.example/import?token=subscription-secret"
  });
  return { accountShell, accessShell };
}

function sampleProxyConfig() {
  return {
    servers: [
      {
        name: "clean-edge-a",
        host: "edge-secret.example",
        port: 443,
        type: "ss",
        cipher: "aes-256-gcm",
        password: "node-password-secret",
        qualityClass: "stable"
      }
    ]
  };
}

test("clean-start package summarizes ready authority without exposing source state or runtime secrets", () => {
  const { accountShell, accessShell } = createReadyCleanStartState();

  const result = createCleanStartControlPlanePackage({
    accountShell,
    accessShell,
    proxyConfig: sampleProxyConfig(),
    now: NOW,
    sourceState: {
      historicalBackupPath: "/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite",
      sourceToken: "historical-token-secret"
    }
  });

  assert.equal(result.type, "aliyun_clean_start_control_plane_package");
  assert.equal(result.authorityMode, "clean_start");
  assert.equal(result.status, "ready_for_private_validation");
  assert.deepEqual(result.historicalState, {
    copied: false,
    source: "none",
    requiresStatePreservingGate: false
  });
  assert.deepEqual(result.counts, {
    accounts: 1,
    entitlements: 1,
    usableEntitlements: 1,
    accessGrants: 1,
    dynamicEntries: 1,
    artifacts: 1,
    renderableNodes: 1
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.privateRenderingDryRun.status, "ready");
  assert.equal(result.privateRenderingDryRun.mode, "metadata_only");
  assert.equal(result.privateRenderingDryRun.nodeCount, 1);
  assert.deepEqual(result.privateRenderingDryRun.protocols, ["ss"]);
  assert.equal(result.privateRenderingDryRun.generatedYamlBytes > 0, true);
  assert.equal(result.privateRenderingDryRun.redacted, true);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("edge-secret.example"), false);
  assert.equal(serialized.includes("node-password-secret"), false);
  assert.equal(serialized.includes("portal-secret.example"), false);
  assert.equal(serialized.includes("dynamic-secret"), false);
  assert.equal(serialized.includes("subscription-secret"), false);
  assert.equal(serialized.includes("entry_ref_secret"), false);
  assert.equal(serialized.includes("artifact_ref_secret"), false);
  assert.equal(serialized.includes("historical-token-secret"), false);
  assert.equal(serialized.includes("subscriptions.sqlite"), false);
  assert.equal(serialized.includes("ops@example.com"), false);
  assert.equal(serialized.includes("Acme Research"), false);
});

test("clean-start package fails closed when entitlement, grant, or renderable node evidence is missing", () => {
  const accountShell = createPlatformAccountEntitlementShell({
    nowFn: () => NOW,
    accountIdFactory: () => "acct_1",
    entitlementIdFactory: () => "ent_1"
  });
  accountShell.createAccountFromLead(sampleLead());
  accountShell.createEntitlement("acct_1", {
    plan: "pilot",
    status: "pending",
    validUntil: "2026-06-27T00:00:00.000Z"
  });
  const accessShell = createPlatformSubscriptionAccessShell({
    accountShell,
    nowFn: () => NOW,
    accessIdFactory: () => "access_1"
  });

  const result = createCleanStartControlPlanePackage({
    accountShell,
    accessShell,
    proxyConfig: { servers: [] },
    now: NOW
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, [
    "no usable entitlement",
    "no issued access grant",
    "no renderable subscription node"
  ]);
  assert.equal(result.privateRenderingDryRun.status, "blocked");
  assert.equal(result.privateRenderingDryRun.generatedYamlBytes, 0);
});
