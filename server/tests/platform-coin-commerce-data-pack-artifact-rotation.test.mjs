import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createCoinCommerceDataPackRuntimeIssuer } from "../services/platform/coin-commerce-data-pack-runtime-issuer.mjs";
import { createCoinCommerceDataPackMaterialEscrow } from "../services/platform/coin-commerce-data-pack-material-escrow.mjs";
import { createCoinCommerceDataPackOrderDelivery } from "../services/platform/coin-commerce-data-pack-order-delivery.mjs";
import { createCoinCommerceDataPackArtifactRotation } from "../services/platform/coin-commerce-data-pack-artifact-rotation.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSqliteSubscriptionStore } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";

const NOW = "2026-09-28T00:00:00.000Z";
const UNTIL = "9999-12-31T23:59:59.999Z";
const ORDER = {
  commandRef: "coincmd_pack_rotate", orderRef: "coinord_pack_rotate",
  accountId: "acct_pack_rotate", offerVersionRef: "offerv_pack_100gb_v1",
  quotaBytes: 100 * 1024 ** 3
};
const LEASE = { leaseGeneration: 1, leaseToken: "a".repeat(64) };

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "pack-rotation-"));
  const controlStore = createSqliteSubscriptionControlStore({ dbPath: join(directory, "control.sqlite") });
  let escrow = createCoinCommerceDataPackMaterialEscrow({
    key: Buffer.alloc(32, 4), filePath: join(directory, "material.json")
  });
  const tenant = { id: "tenant_pack_rotate", nodeId: "node_sg", expiresAt: UNTIL,
    note: "", status: "active" };
  const artifacts = [];
  let creates = 0;
  let failRevoke = false;
  const runtimeCore = {
    listTenants: () => [{ ...tenant }],
    listSubscriptionArtifacts: () => artifacts.map((artifact) => ({ ...artifact })),
    createTenant: ({ note }) => { tenant.note = note; return { tenant: { ...tenant } }; },
    createSubscriptionArtifact: (tenantId, options = {}) => {
      creates += 1;
      const artifact = { id: options.artifactId || `artifact_pack_rotate_${creates}`,
        tenantId, status: "active" };
      artifacts.push(artifact);
      return { artifact: { ...artifact }, subscriptionUrl: `https://example.invalid/sub/pack-${creates}` };
    },
    revokeSubscriptionArtifact: (id) => {
      if (failRevoke) throw new Error("injected revoke failure");
      const artifact = artifacts.find((candidate) => candidate.id === id);
      if (!artifact) throw new Error("missing artifact");
      artifact.status = "revoked";
      return { ...artifact };
    }
  };
  controlStore.createAccount({ id: ORDER.accountId, ownerRef: "portal_pack_rotate",
    status: "active", createdAt: NOW, updatedAt: NOW });
  const issued = createCoinCommerceDataPackRuntimeIssuer({
    commerceStore: { verifyCapturedFulfillmentClaim: ({ commandRef, orderRef, accountId }) => ({
      commandRef, orderRef, accountId, offerVersionRef: ORDER.offerVersionRef,
      delivery: { kind: "data_pack", neverExpires: true, trafficGb: 100 }
    }) }, controlStore, runtimeCore,
    materialEscrow: escrow, nodeId: "node_sg", nowFn: () => new Date(NOW)
  }).issue(ORDER, LEASE);
  controlStore.applyCoinCommerceDataPackFulfillment({
    ...ORDER, requestRef: issued.requestRef, entitlementRef: issued.entitlementRef,
    issuedLinkRef: issued.issuedLinkRef, technicalValidUntil: UNTIL,
    commercialNeverExpires: true, createdAt: NOW
  });
  const commerceStore = { getDeliveredOrderBinding: ({ accountId, orderRef }) =>
    accountId === ORDER.accountId && orderRef === ORDER.orderRef
      ? { kind: "data_pack", orderRef, offerVersionRef: ORDER.offerVersionRef,
        requestRef: issued.requestRef, entitlementRef: issued.entitlementRef }
      : null };
  const delivery = () => createCoinCommerceDataPackOrderDelivery({
    commerceStore, controlStore, runtimeCore, materialEscrow: escrow,
    nowFn: () => new Date(NOW)
  });
  const rotation = (overrides = {}) => createCoinCommerceDataPackArtifactRotation({
    commerceStore, controlStore, runtimeCore, materialEscrow: escrow,
    nowFn: () => new Date(NOW),
    ...overrides
  });
  return {
    controlStore, artifacts, runtimeCore, issued, delivery, rotation,
    failRevoke: (value) => { failRevoke = value; },
    reopen() {
      escrow.close();
      escrow = createCoinCommerceDataPackMaterialEscrow({
        key: Buffer.alloc(32, 4), filePath: join(directory, "material.json")
      });
    },
    close() { escrow.close(); controlStore.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}

test("pack artifact rotation preserves quota and allows order re-fetch after restart", () => {
  const f = fixture();
  try {
    f.controlStore.recordUsageSample({
      id: "sample_pack_rotate", sourceRef: "source_pack_rotate",
      channelRef: "node_sg", edgeCredentialRef: "edgecred_pack_rotate",
      accountId: ORDER.accountId, entitlementId: f.issued.entitlementRef,
      requestId: f.issued.requestRef, observedAt: NOW,
      intervalStartedAt: NOW, intervalEndedAt: NOW,
      uploadBytes: 12 * 1024 ** 3, downloadBytes: 0,
      sampleDigest: "digest_pack_rotate", createdAt: NOW
    });
    const before = f.delivery().get({ accountId: ORDER.accountId, orderRef: ORDER.orderRef });
    assert.equal(before.usage.usedBytes, 12 * 1024 ** 3);
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_once_a" };
    const first = f.rotation().rotate(input);
    assert.equal(first.status, "complete");
    assert.equal(f.artifacts.length, 2);
    assert.equal(f.artifacts[0].status, "revoked");
    f.reopen();
    const replay = f.rotation().rotate(input);
    assert.deepEqual(replay, first);
    assert.equal(f.artifacts.length, 2);
    const after = f.delivery().get({ accountId: ORDER.accountId, orderRef: ORDER.orderRef });
    assert.notEqual(after.subscriptionUrl, before.subscriptionUrl);
    assert.deepEqual(after.usage, before.usage);
  } finally { f.close(); }
});

test("revoke failure is resumable without minting another artifact or changing usage", () => {
  const f = fixture();
  try {
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_revoke_retry" };
    const before = f.delivery().get({ accountId: ORDER.accountId, orderRef: ORDER.orderRef });
    f.failRevoke(true);
    assert.throws(() => f.rotation().rotate(input),
      (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    assert.equal(f.artifacts.length, 2);
    f.reopen();
    f.failRevoke(false);
    assert.equal(f.rotation().rotate(input).status, "complete");
    assert.equal(f.artifacts.length, 2);
    assert.deepEqual(f.delivery().get({ accountId: ORDER.accountId, orderRef: ORDER.orderRef }).usage,
      before.usage);
  } finally { f.close(); }
});

test("rotation denies another account without adding an artifact", () => {
  const f = fixture();
  try {
    assert.throws(() => f.rotation().rotate({ accountId: "acct_other",
      orderRef: ORDER.orderRef, rotationRef: "packrot_denied" }),
    (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    assert.equal(f.artifacts.length, 1);
  } finally { f.close(); }
});

test("a crash before protected capture leaves the old link usable and safely discards the orphan", () => {
  const f = fixture();
  try {
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_before_capture" };
    const before = f.delivery().get({ accountId: ORDER.accountId, orderRef: ORDER.orderRef });
    const base = f.rotation;
    const failed = base({ materialEscrow: {
      capture() { throw new Error("injected capture failure"); },
      probe: () => "absent", verify: () => { throw new Error("unexpected verify"); }
    } });
    assert.throws(() => failed.rotate(input),
      (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    assert.equal(f.artifacts[0].status, "active");
    assert.equal(f.artifacts[1].status, "active");
    assert.equal(f.delivery().get({ accountId: ORDER.accountId, orderRef: ORDER.orderRef }).subscriptionUrl,
      before.subscriptionUrl);
    f.reopen();
    assert.equal(f.rotation().rotate(input).status, "complete");
    assert.equal(f.artifacts.length, 3);
    assert.equal(f.artifacts[1].status, "revoked");
    assert.equal(f.artifacts[2].status, "active");
  } finally { f.close(); }
});

test("a crash after capture reuses the protected candidate rather than minting twice", () => {
  const f = fixture();
  try {
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_after_capture" };
    const controlStore = { ...f.controlStore,
      advanceCoinCommerceDataPackArtifactRotation(value) {
        if (value.stage === "escrowed") throw new Error("injected control failure");
        return f.controlStore.advanceCoinCommerceDataPackArtifactRotation(value);
      } };
    assert.throws(() => f.rotation({ controlStore }).rotate(input),
      (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    f.reopen();
    assert.equal(f.rotation().rotate(input).status, "complete");
    assert.equal(f.artifacts.length, 2);
    assert.equal(f.artifacts[0].status, "revoked");
  } finally { f.close(); }
});

test("a failed control-link switch retains the old order handoff until replay", () => {
  const f = fixture();
  try {
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_before_switch" };
    const oldUrl = f.delivery().get({ accountId: ORDER.accountId,
      orderRef: ORDER.orderRef }).subscriptionUrl;
    const controlStore = { ...f.controlStore,
      advanceCoinCommerceDataPackArtifactRotation(value) {
        if (value.stage === "switched") throw new Error("injected switch failure");
        return f.controlStore.advanceCoinCommerceDataPackArtifactRotation(value);
      } };
    assert.throws(() => f.rotation({ controlStore }).rotate(input),
      (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    assert.equal(f.delivery().get({ accountId: ORDER.accountId,
      orderRef: ORDER.orderRef }).subscriptionUrl, oldUrl);
    f.reopen();
    assert.equal(f.rotation().rotate(input).status, "complete");
    assert.equal(f.artifacts.length, 2);
    assert.equal(f.artifacts[0].status, "revoked");
  } finally { f.close(); }
});

test("a pending rotation blocks a different operation and cannot be replayed for another order", () => {
  const f = fixture();
  try {
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_pending_a" };
    f.controlStore.beginCoinCommerceDataPackArtifactRotation({ ...input, now: NOW });
    assert.throws(() => f.rotation().rotate({ ...input, rotationRef: "packrot_pending_b" }),
      (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    assert.throws(() => f.rotation().rotate({ ...input, orderRef: "coinord_other" }),
      (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    assert.equal(f.artifacts.length, 1);
    assert.equal(f.rotation().rotate(input).status, "complete");
  } finally { f.close(); }
});

test("an active durable rotation lease excludes a concurrent worker", () => {
  const f = fixture();
  try {
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_lease_active" };
    f.controlStore.beginCoinCommerceDataPackArtifactRotation({ ...input, now: NOW });
    f.controlStore.claimCoinCommerceDataPackArtifactRotation({ ...input,
      leaseRef: "packrotlease_worker_a", now: NOW });
    assert.throws(() => f.rotation().rotate(input),
      (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    assert.equal(f.artifacts.length, 1);
    f.controlStore.releaseCoinCommerceDataPackArtifactRotation({ ...input,
      leaseRef: "packrotlease_worker_a" });
    assert.equal(f.rotation().rotate(input).status, "complete");
  } finally { f.close(); }
});

test("an expired durable lease can be taken over to reconcile after worker death", () => {
  const f = fixture();
  try {
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_lease_expired" };
    f.controlStore.beginCoinCommerceDataPackArtifactRotation({ ...input, now: NOW });
    f.controlStore.claimCoinCommerceDataPackArtifactRotation({ ...input,
      leaseRef: "packrotlease_dead_worker", now: NOW });
    const afterLease = "2026-09-28T00:06:00.000Z";
    assert.equal(f.rotation({ nowFn: () => new Date(afterLease) }).rotate(input).status, "complete");
    assert.equal(f.artifacts.length, 2);
    assert.equal(f.artifacts[0].status, "revoked");
  } finally { f.close(); }
});

test("an expired worker cannot advance or release a takeover lease", () => {
  const f = fixture();
  try {
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_lease_fenced" };
    const later = "2026-09-28T00:06:00.000Z";
    f.controlStore.beginCoinCommerceDataPackArtifactRotation({ ...input, now: NOW });
    f.controlStore.claimCoinCommerceDataPackArtifactRotation({ ...input,
      leaseRef: "packrotlease_old_worker", now: NOW });
    f.controlStore.claimCoinCommerceDataPackArtifactRotation({ ...input,
      leaseRef: "packrotlease_new_worker", now: later });
    assert.throws(() => f.controlStore.advanceCoinCommerceDataPackArtifactRotation({
      ...input, leaseRef: "packrotlease_old_worker", stage: "retry", attempt: 1, now: later
    }), (error) => error.code === "reconciliation_required");
    assert.throws(() => f.controlStore.releaseCoinCommerceDataPackArtifactRotation({
      ...input, leaseRef: "packrotlease_old_worker"
    }), (error) => error.code === "reconciliation_required");
    const active = f.controlStore.beginCoinCommerceDataPackArtifactRotation({ ...input, now: later });
    assert.equal(active.leaseRef, "packrotlease_new_worker");
  } finally { f.close(); }
});

test("bounded recovery resumes only eligible pending rotations", () => {
  const f = fixture();
  try {
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_recover_batch" };
    f.failRevoke(true);
    assert.throws(() => f.rotation().rotate(input),
      (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    f.failRevoke(false);
    const result = f.rotation().reconcilePending({ limit: 1 });
    assert.deepEqual(result, { inspected: 1, completed: 1, failed: 0 });
    assert.equal(f.artifacts.length, 2);
    assert.equal(f.artifacts[0].status, "revoked");
    assert.deepEqual(f.rotation().reconcilePending({ limit: 1 }),
      { inspected: 0, completed: 0, failed: 0 });
  } finally { f.close(); }
});

test("rotation never revokes an unrelated active artifact while recovering a missing capture", () => {
  const f = fixture();
  try {
    const unrelated = f.runtimeCore.createSubscriptionArtifact("tenant_pack_rotate").artifact;
    const input = { accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_unrelated" };
    assert.throws(() => f.rotation().rotate(input),
      (error) => error.code === "coin_commerce_data_pack_rotation_reconciliation_required");
    assert.equal(f.artifacts.find((artifact) => artifact.id === unrelated.id)?.status, "active");
    assert.equal(f.artifacts.length, 2);
  } finally { f.close(); }
});

test("real subscription Core rejects the old URL after pack rotation and serves the new URL", () => {
  const directory = mkdtempSync(join(tmpdir(), "pack-rotation-core-"));
  const controlStore = createSqliteSubscriptionControlStore({ dbPath: join(directory, "control.sqlite") });
  const runtimeStore = createSqliteSubscriptionStore({ dbPath: join(directory, "runtime.sqlite") });
  const materialEscrow = createCoinCommerceDataPackMaterialEscrow({
    key: Buffer.alloc(32, 5), filePath: join(directory, "material.json")
  });
  let artifactNumber = 0;
  const token = "pgsub_synthetic_pack_rotate";
  const runtimeCore = createSubscriptionCore({
    store: runtimeStore,
    proxyConfig: { servers: [{ id: "node_sg", name: "node_sg", region: "Singapore",
      host: "203.0.113.10", port: 18388, method: "aes-256-gcm",
      password: "synthetic-secret" }], pingHosts: [], nginx: {} },
    publicSubscriptionBaseUrl: "https://gateway.example.invalid",
    nowFn: () => new Date(NOW),
    tokenFactory: () => ({ rawToken: token, tokenHash: hashSubscriptionToken(token),
      tokenPrefix: token.slice(0, 14) }),
    artifactSecretFactory: () => `synthetic_pack_secret_${++artifactNumber}`,
    idFactory: () => "tenant_pack_core_rotate",
    artifactIdFactory: () => `artifact_pack_core_${artifactNumber}`
  });
  try {
    controlStore.createAccount({ id: ORDER.accountId, ownerRef: "portal_pack_rotate_core",
      status: "active", createdAt: NOW, updatedAt: NOW });
    const issued = createCoinCommerceDataPackRuntimeIssuer({
      commerceStore: { verifyCapturedFulfillmentClaim: ({ commandRef, orderRef, accountId }) => ({
        commandRef, orderRef, accountId, offerVersionRef: ORDER.offerVersionRef,
        delivery: { kind: "data_pack", neverExpires: true, trafficGb: 100 }
      }) }, controlStore, runtimeCore, materialEscrow,
      nodeId: "node_sg", nowFn: () => new Date(NOW)
    }).issue(ORDER, LEASE);
    controlStore.applyCoinCommerceDataPackFulfillment({ ...ORDER,
      requestRef: issued.requestRef, entitlementRef: issued.entitlementRef,
      issuedLinkRef: issued.issuedLinkRef, technicalValidUntil: UNTIL,
      commercialNeverExpires: true, createdAt: NOW });
    const commerceStore = { getDeliveredOrderBinding: ({ accountId, orderRef }) =>
      accountId === ORDER.accountId && orderRef === ORDER.orderRef
        ? { kind: "data_pack", orderRef, offerVersionRef: ORDER.offerVersionRef,
          requestRef: issued.requestRef, entitlementRef: issued.entitlementRef }
        : null };
    const delivery = createCoinCommerceDataPackOrderDelivery({ commerceStore,
      controlStore, runtimeCore, materialEscrow, nowFn: () => new Date(NOW) });
    const oldUrl = delivery.get({ accountId: ORDER.accountId, orderRef: ORDER.orderRef }).subscriptionUrl;
    assert.equal(runtimeCore.resolveSubscriptionArtifact("synthetic_pack_secret_1").ok, true);
    const rotation = createCoinCommerceDataPackArtifactRotation({ commerceStore,
      controlStore, runtimeCore, materialEscrow, nowFn: () => new Date(NOW) });
    assert.equal(rotation.rotate({ accountId: ORDER.accountId, orderRef: ORDER.orderRef,
      rotationRef: "packrot_real_core" }).status, "complete");
    const newUrl = delivery.get({ accountId: ORDER.accountId, orderRef: ORDER.orderRef }).subscriptionUrl;
    assert.notEqual(newUrl, oldUrl);
    assert.equal(runtimeCore.resolveSubscriptionArtifact("synthetic_pack_secret_1").status, 410);
    assert.equal(runtimeCore.resolveSubscriptionArtifact("synthetic_pack_secret_2").ok, true);
  } finally {
    materialEscrow.close(); runtimeStore.close(); controlStore.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
