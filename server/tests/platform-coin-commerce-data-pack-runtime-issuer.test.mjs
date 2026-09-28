import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createCoinCommerceDataPackRuntimeIssuer } from "../services/platform/coin-commerce-data-pack-runtime-issuer.mjs";
import { createCoinCommerceDataPackMaterialEscrow } from "../services/platform/coin-commerce-data-pack-material-escrow.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSqliteSubscriptionStore } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";

const NOW = "2026-09-28T00:00:00.000Z";
const UNTIL = "9999-12-31T23:59:59.999Z";
const BASE = {
  commandRef: "coincmd_pack_runtime_a",
  orderRef: "coinord_pack_runtime_a",
  accountId: "acct_pack_runtime",
  offerVersionRef: "offerv_pack_100gb_v1",
  quotaBytes: 100 * 1024 ** 3
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "data-pack-runtime-"));
  const controlStore = createSqliteSubscriptionControlStore({ dbPath: join(directory, "control.sqlite") });
  controlStore.createAccount({ id: BASE.accountId, ownerRef: "portal_pack_runtime", status: "active", createdAt: NOW, updatedAt: NOW });
  const tenants = [];
  const artifacts = new Map();
  let tenantCreates = 0;
  let artifactCreates = 0;
  const runtimeCore = {
    listTenants: () => tenants.map((tenant) => ({ ...tenant })),
    listSubscriptionArtifacts: (id) => (artifacts.get(id) || []).map((artifact) => ({ ...artifact })),
    createTenant: ({ nodeId, expiresAt, note }) => {
      tenantCreates += 1;
      const tenant = { id: `tenant_pack_${tenantCreates}`, nodeId, expiresAt, note, status: "active" };
      tenants.push(tenant);
      return { tenant, subscriptionUrl: "https://example.invalid/tenant-secret" };
    },
    createSubscriptionArtifact: (id) => {
      artifactCreates += 1;
      const artifact = { id: `artifact_pack_${artifactCreates}`, tenantId: id, status: "active" };
      artifacts.set(id, [...(artifacts.get(id) || []), artifact]);
      return { artifact, subscriptionUrl: `https://example.invalid/sub/secret-${artifactCreates}` };
    }
  };
  const escrowPath = join(directory, "pack-material.json");
  const key = Buffer.alloc(32, 7);
  let materialEscrow = createCoinCommerceDataPackMaterialEscrow({ key, filePath: escrowPath });
  const issuer = () => createCoinCommerceDataPackRuntimeIssuer({
    controlStore, runtimeCore, materialEscrow, nodeId: "node_sg", nowFn: () => new Date(NOW)
  });
  return {
    controlStore, runtimeCore, tenants, artifacts, escrowPath, key, issuer,
    counts: () => ({ tenantCreates, artifactCreates }),
    releaseMaterial(input) {
      return materialEscrow.release(input);
    },
    captureMaterial(input) {
      return materialEscrow.capture(input);
    },
    verifyMaterial(input) {
      return materialEscrow.verify(input);
    },
    reopenEscrow() {
      materialEscrow.close();
      materialEscrow = createCoinCommerceDataPackMaterialEscrow({ key, filePath: escrowPath });
    },
    close() {
      materialEscrow.close();
      controlStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

test("data-pack runtime issuance creates one distinct resource and replays after material-store restart", () => {
  const f = fixture();
  try {
    const first = f.issuer().issue(BASE);
    assert.equal(first.status, "issued");
    assert.equal(first.subscriptionUrl, undefined);
    assert.equal(f.tenants[0].expiresAt, UNTIL);
    assert.equal(f.controlStore.getIssuanceRequest(first.requestRef).status, "issued");
    f.reopenEscrow();
    assert.deepEqual(f.issuer().issue(BASE), first);
    assert.deepEqual(f.counts(), { tenantCreates: 1, artifactCreates: 1 });
    assert.match(f.releaseMaterial({
      orderRef: BASE.orderRef, commandRef: BASE.commandRef,
      tenantId: f.tenants[0].id, artifactId: f.artifacts.get(f.tenants[0].id)[0].id
    }).subscriptionUrl, /^https:\/\/example\.invalid\/sub\//);
  } finally { f.close(); }
});

test("data-pack runtime issuance resumes a tenant created before artifact, without a second tenant", () => {
  const f = fixture();
  try {
    const issuer = f.issuer();
    const reservation = f.controlStore.reserveCoinCommerceDataPackIssuance({ ...BASE, nodeId: "node_sg", now: NOW });
    f.runtimeCore.createTenant({ nodeId: "node_sg", expiresAt: UNTIL, note: issuer.markerFor(BASE.orderRef) });
    const result = issuer.issue(BASE);
    assert.equal(result.requestRef, reservation.requestRef);
    assert.deepEqual(f.counts(), { tenantCreates: 1, artifactCreates: 1 });
  } finally { f.close(); }
});

test("data-pack runtime issuance stops when an artifact exists without recoverable protected material", () => {
  const f = fixture();
  try {
    const issuer = f.issuer();
    const reservation = f.controlStore.reserveCoinCommerceDataPackIssuance({ ...BASE, nodeId: "node_sg", now: NOW });
    const tenant = f.runtimeCore.createTenant({ nodeId: "node_sg", expiresAt: UNTIL, note: issuer.markerFor(BASE.orderRef) }).tenant;
    f.runtimeCore.createSubscriptionArtifact(tenant.id);
    assert.throws(() => issuer.issue(BASE), (error) => error.code === "coin_commerce_data_pack_reconciliation_required");
    assert.deepEqual(f.counts(), { tenantCreates: 1, artifactCreates: 1 });
    assert.equal(f.controlStore.getIssuanceRequest(reservation.requestRef).status, "planned");
  } finally { f.close(); }
});

test("data-pack runtime issuer accepts the real Core note and year-9999 tenant contract", () => {
  const f = fixture();
  const directory = mkdtempSync(join(tmpdir(), "data-pack-core-"));
  const store = createSqliteSubscriptionStore({ dbPath: join(directory, "runtime.sqlite") });
  try {
    const rawToken = "pgsub_synthetic_pack_token";
    const core = createSubscriptionCore({
      store,
      proxyConfig: { servers: [{ id: "node_sg", name: "vultr-singapore", region: "Singapore", host: "203.0.113.10", port: 18388, method: "aes-256-gcm", password: "synthetic-secret" }], pingHosts: [], nginx: {} },
      publicSubscriptionBaseUrl: "https://gateway.example.invalid",
      nowFn: () => new Date(NOW),
      tokenFactory: () => ({ rawToken, tokenHash: hashSubscriptionToken(rawToken), tokenPrefix: rawToken.slice(0, 14) }),
      artifactSecretFactory: () => "synthetic_pack_artifact_secret",
      idFactory: () => "tenant_pack_real_1",
      artifactIdFactory: () => "artifact_pack_real_1"
    });
    const materialEscrow = createCoinCommerceDataPackMaterialEscrow({ key: Buffer.alloc(32, 9), filePath: join(directory, "material.json") });
    try {
      const issuer = createCoinCommerceDataPackRuntimeIssuer({ controlStore: f.controlStore, runtimeCore: core, materialEscrow, nodeId: "vultr-singapore", nowFn: () => new Date(NOW) });
      const first = issuer.issue(BASE);
      assert.equal(first.status, "issued");
      assert.deepEqual(issuer.issue(BASE), first);
      assert.equal(core.getTenant("tenant_pack_real_1").expiresAt, UNTIL);
    } finally { materialEscrow.close(); }
  } finally {
    store.close();
    f.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("data-pack runtime issuance completes a saved artifact after control finalization interruption", () => {
  const f = fixture();
  try {
    let interrupt = true;
    const guardedControl = Object.create(f.controlStore);
    guardedControl.completeCoinCommerceDataPackIssuance = (input) => {
      if (interrupt) {
        interrupt = false;
        throw new Error("synthetic control interruption");
      }
      return f.controlStore.completeCoinCommerceDataPackIssuance(input);
    };
    const issuer = createCoinCommerceDataPackRuntimeIssuer({
      controlStore: guardedControl, runtimeCore: f.runtimeCore,
      materialEscrow: {
        capture: (input) => f.captureMaterial(input),
        verify: (input) => f.verifyMaterial(input)
      },
      nodeId: "node_sg", nowFn: () => new Date(NOW)
    });
    assert.throws(() => issuer.issue(BASE), /synthetic control interruption/);
    assert.equal(f.controlStore.getIssuanceRequest(
      f.controlStore.reserveCoinCommerceDataPackIssuance({ ...BASE, nodeId: "node_sg", now: NOW }).requestRef
    ).status, "planned");
    const completed = issuer.issue(BASE);
    assert.equal(completed.status, "issued");
    assert.deepEqual(f.counts(), { tenantCreates: 1, artifactCreates: 1 });
  } finally { f.close(); }
});

test("two data-pack orders on one account receive different runtime identities and protected links", () => {
  const f = fixture();
  try {
    const issuer = f.issuer();
    const first = issuer.issue(BASE);
    const second = issuer.issue({
      ...BASE, commandRef: "coincmd_pack_runtime_b",
      orderRef: "coinord_pack_runtime_b",
      offerVersionRef: "offerv_pack_200gb_v1",
      quotaBytes: 200 * 1024 ** 3
    });
    assert.notEqual(first.requestRef, second.requestRef);
    assert.notEqual(first.tenantRef, second.tenantRef);
    assert.notEqual(first.artifactRef, second.artifactRef);
    assert.deepEqual(f.counts(), { tenantCreates: 2, artifactCreates: 2 });
    assert.throws(() => f.releaseMaterial({
      orderRef: BASE.orderRef, commandRef: BASE.commandRef,
      tenantId: f.tenants[1].id, artifactId: f.artifacts.get(f.tenants[1].id)[0].id
    }));
  } finally { f.close(); }
});

test("data-pack runtime issuer rejects extra material and accessor inputs before reserving", () => {
  const f = fixture();
  try {
    const issuer = f.issuer();
    assert.throws(() => issuer.issue({ ...BASE, subscriptionUrl: "https://example.invalid/sub/raw" }),
      (error) => error.code === "coin_commerce_data_pack_reconciliation_required");
    const withGetter = { ...BASE };
    Object.defineProperty(withGetter, "orderRef", { enumerable: true, get() { throw new Error("must not run getter"); } });
    assert.throws(() => issuer.issue(withGetter),
      (error) => error.code === "coin_commerce_data_pack_reconciliation_required");
    assert.deepEqual(f.counts(), { tenantCreates: 0, artifactCreates: 0 });
  } finally { f.close(); }
});
