import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { createRuntimeState } from "../state.mjs";

const ROOT = new URL("../../", import.meta.url);
const NOW = "2026-09-23T00:00:00.000Z";
const UNTIL = "2099-10-23T00:00:00.000Z";
const VLESS = "channel-vultr-a-vless-reality-tcp";
const HY2 = "channel-vultr-a-hy2";
const TUIC = "channel-vultr-a-tuic";
const REQUEST = "pareq_binding_authority_001";
const derivedRef = (channel) => `edgecred_${REQUEST}_${channel}`;
const digest = (credentialRef) => `sha256:${credentialRef}`;
const credential = (channel, credentialRef = derivedRef(channel)) => ({
  edgeChannelRef: channel,
  edgeCredentialRef: credentialRef,
  edgeMaterialDigest: digest(credentialRef)
});

function fixture(t, channel, { bindingChannel = VLESS, currentCredentials = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gccgw-binding-authority-"));
  const state = createRuntimeState({
    rootDir: ROOT,
    env: {
      ...buildSourceValidationTestEnvironment({}, { repositoryRoot: fileURLToPath(ROOT) }),
      CONSOLE_TOKEN: "synthetic-binding-test-token",
      USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
      USER_PORTAL_EDGE_CHANNEL_REF: channel,
      USER_PORTAL_EDGE_CHANNEL_REFS: channel,
      EDGE_CREDENTIAL_MATERIAL_PATH: join(dir, "protected", "material.json")
    },
    subscriptionDbPath: join(dir, "subscriptions.sqlite"),
    controlDbPath: join(dir, "control.sqlite"),
    edgeLifecycleNowFn: () => new Date(NOW),
    edgeCurrentCredentialSummaries: currentCredentials,
    edgeRuntimeAdapter: {
      applyCredentialReconciliation() { throw new Error("test must not mutate runtime"); }
    },
    autoStartHttpProxy: false
  });
  t.after(async () => {
    await state.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const store = state.platform.controlStore;
  store.createAccount({
    id: "acct_binding_authority", ownerRef: "portal_user_binding_authority", status: "active",
    createdAt: NOW, updatedAt: NOW
  });
  store.createEntitlement({
    id: "ent_binding_authority", accountId: "acct_binding_authority", plan: "monthly",
    status: "active", validFrom: NOW, validUntil: UNTIL, createdAt: NOW, updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: REQUEST, accountId: "acct_binding_authority", entitlementId: "ent_binding_authority",
    approvalRef: "approval_binding_authority", status: "issued", quantity: 1, nodeId: bindingChannel,
    purpose: "portal_access_request", requestedByRef: "portal_auto_issuer", createdAt: NOW, updatedAt: NOW
  });
  store.linkIssuedSubscription({
    id: "link_binding_authority", requestId: REQUEST, tenantRef: "tenant_binding_authority",
    artifactRef: "artifact_binding_authority", status: "active", createdAt: NOW, updatedAt: NOW
  });
  return {
    state,
    material(credentialRef) {
      state.platform.edgeCredentialMaterialStore.putCredentialMaterial({
        credentialRef, materialDigest: digest(credentialRef),
        material: { uuid: "11111111-1111-4111-8111-111111111111", password: "synthetic-binding-password" }
      });
    },
    portal(credentials, { status = "delivered", ...overrides } = {}) {
      return store.upsertPortalAccessRequest({
        id: REQUEST, portalUserRef: "portal_user_binding_authority", plan: "monthly", clientTarget: "clash",
        durationDays: 30, quantity: 1, status, nextAction: "ready", priorTrialState: "none",
        submittedAt: NOW, updatedAt: NOW, expiresAt: UNTIL, validUntil: UNTIL,
        entitlementRef: "ent_binding_authority", accessGrantRef: "grant_binding_authority",
        ...credentials[0], edgeCredentials: credentials, ...overrides
      });
    },
    plan() {
      const report = state.platform.edgeLifecycleService.reconcileOrderLifecycle();
      assert.equal(report.ok, true);
      assert.equal(report.mutation, false);
      assert.equal(report.productionAuthority, false);
      return report;
    }
  };
}

for (const channel of [HY2, TUIC]) {
  test(`durable VLESS binding does not authorize leftover ${channel} material`, (t) => {
    const f = fixture(t, channel);
    f.portal([credential(VLESS)]);
    f.material(derivedRef(VLESS));
    f.material(derivedRef(channel));
    assert.equal(f.plan().summary.desiredCount, 0);
  });

  test(`explicitly bound secondary ${channel} remains in desired state`, (t) => {
    const f = fixture(t, channel);
    f.portal([credential(VLESS), credential(channel)]);
    f.material(derivedRef(VLESS));
    f.material(derivedRef(channel));
    const report = f.plan();
    assert.equal(report.summary.desiredCount, 1);
    assert.deepEqual(report.actions.map(({ action, credentialRef }) => ({ action, credentialRef })), [
      { action: "add", credentialRef: derivedRef(channel) }
    ]);
  });

  test(`legacy issuance without a Portal record cannot authorize derived ${channel} material`, (t) => {
    const f = fixture(t, channel);
    assert.equal(f.state.platform.controlStore.getPortalAccessRequest(REQUEST), null);
    f.material(`edgecred_${REQUEST}`);
    f.material(derivedRef(channel));
    assert.equal(f.plan().summary.desiredCount, 0);
  });

  test(`explicit non-derived ${channel} binding takes precedence over leftover derived material`, (t) => {
    const f = fixture(t, channel);
    const explicitRef = "edgecred_explicit_binding_authority";
    f.portal([credential(VLESS), credential(channel, explicitRef)]);
    f.material(explicitRef);
    f.material(derivedRef(channel));
    const report = f.plan();
    assert.equal(report.summary.desiredCount, 1);
    assert.deepEqual(report.actions.map(({ credentialRef }) => credentialRef), [explicitRef]);
  });

  test(`disabled Portal binding is not resurrected by derived ${channel} material`, (t) => {
    const f = fixture(t, channel);
    const explicitRef = "edgecred_disabled_binding_authority";
    f.portal([credential(channel, explicitRef)], { status: "disabled" });
    f.material(explicitRef);
    f.material(derivedRef(channel));
    assert.equal(f.plan().summary.desiredCount, 0);
  });

  test(`Portal record with no explicit ${channel} identity is not repaired by guessing material`, (t) => {
    const f = fixture(t, channel, { bindingChannel: channel });
    f.portal([]);
    f.material(`edgecred_${REQUEST}`);
    f.material(derivedRef(channel));
    assert.equal(f.plan().summary.desiredCount, 0);
  });

  test(`${channel} dry-run retains current valid identities and proposes only the unbound identity for revoke`, (t) => {
    const explicitRef = "edgecred_explicit_current_authority";
    const otherValidRef = "edgecred_other_current_authority";
    const unboundRef = derivedRef(channel);
    const currentCredentials = [explicitRef, otherValidRef, unboundRef].map((credentialRef) => ({
      channelRef: channel, credentialRef, materialDigest: digest(credentialRef)
    }));
    const f = fixture(t, channel, { currentCredentials });
    f.portal([credential(VLESS), credential(channel, explicitRef)]);
    f.portal([credential(channel, otherValidRef)], { id: "pareq_binding_authority_002" });
    for (const credentialRef of [explicitRef, otherValidRef, unboundRef]) f.material(credentialRef);
    const beforeMaterial = f.state.platform.edgeCredentialMaterialStore.listCredentialMaterialSummaries();
    const beforeBindings = f.state.platform.controlStore.listPortalAccessRequests();

    // This is a non-mutating plan, not authorization to revoke production identities.
    const report = f.plan();
    assert.equal(report.mode, "plan");
    assert.deepEqual(report.summary, {
      desiredCount: 2, currentCount: 3, addCount: 0, revokeCount: 1, rotateCount: 0, unchangedCount: 2
    });
    assert.deepEqual(report.actions.map(({ action, credentialRef }) => ({ action, credentialRef })), [
      { action: "revoke", credentialRef: unboundRef },
      { action: "unchanged", credentialRef: explicitRef },
      { action: "unchanged", credentialRef: otherValidRef }
    ]);
    assert.deepEqual(f.state.platform.edgeCredentialMaterialStore.listCredentialMaterialSummaries(), beforeMaterial);
    assert.deepEqual(f.state.platform.controlStore.listPortalAccessRequests(), beforeBindings);
  });
}

for (const channel of [VLESS, HY2, TUIC]) {
  test(`legacy same-channel ${channel} issuance without a Portal record remains supported`, (t) => {
    const f = fixture(t, channel, { bindingChannel: channel });
    const primaryRef = `edgecred_${REQUEST}`;
    f.material(primaryRef);
    assert.equal(f.state.platform.controlStore.getPortalAccessRequest(REQUEST), null);
    const report = f.plan();
    assert.equal(report.summary.desiredCount, 1);
    assert.deepEqual(report.actions.map(({ credentialRef }) => credentialRef), [primaryRef]);
  });
}
