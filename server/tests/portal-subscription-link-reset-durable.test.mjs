import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createPortalSubscriptionLinkResetStore, ensurePortalSubscriptionLinkResetSchema } from "../services/platform/portal-subscription-link-reset-store.mjs";
import { preparePortalSubscriptionLinkResetSchema } from "../../scripts/prepare-portal-subscription-link-reset-schema.mjs";

const NOW = "2026-10-09T00:00:00.000Z";
const operation = { operationKeyDigest: "c".repeat(64), requestRef: "request_durable", ownerRef: "account_durable" };
const config = { servers: [{ name: "synthetic", host: "192.0.2.1", port: 443, method: "aes-256-gcm", password: "synthetic" }] };
function coreFor(repository) {
  return createSubscriptionCore({ repository, proxyConfig: config, publicSubscriptionBaseUrl: "https://subscription.example.test",
    nowFn: () => new Date(NOW), artifactIdFactory: () => "artifact_new", artifactSecretFactory: () => "synthetic_new_artifact_material" });
}
function seed(t) {
  const dir = mkdtempSync(join(tmpdir(), "portal-reset-durable-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const controlPath = join(dir, "control.sqlite");
  const runtimePath = join(dir, "runtime.sqlite");
  const controlDb = new Database(controlPath);
  const control = createSqliteSubscriptionControlStore({ database: controlDb });
  const runtime = createSubscriptionRepository({ dbPath: runtimePath });
  runtime.createTenant({ id: "tenant_durable", displayName: "Synthetic", status: "active", expiresAt: "2026-11-09T00:00:00.000Z",
    note: "", nodeId: "synthetic", credentialMode: "shared-node", tokenHash: "synthetic", tokenPrefix: "synthetic", now: NOW });
  runtime.createArtifact({ id: "artifact_old", tenantId: "tenant_durable", artifactHash: "synthetic_old_hash",
    artifactPrefix: "synthetic_old", status: "active", now: NOW });
  control.upsertPortalAccessRequest({ id: operation.requestRef, portalUserRef: operation.ownerRef, plan: "monthly", clientTarget: "clash",
    durationDays: 30, quantity: 1, status: "delivered", nextAction: "subscription_ready", priorTrialState: "none", submittedAt: NOW, updatedAt: NOW,
    validUntil: "2026-11-09T00:00:00.000Z", entitlementRef: "ent_durable", accessGrantRef: "grant_durable",
    tenantId: "tenant_durable", artifactId: "artifact_old", subscriptionUrl: "https://subscription.example.test/sub/a/synthetic_old_artifact.yaml" });
  return { dir, controlPath, runtimePath, controlDb, control, runtime };
}

test("explicit schema CLI checks without writes and applies only the reset journal", t => {
  const f = seed(t);
  f.runtime.close(); f.controlDb.close();
  assert.throws(() => preparePortalSubscriptionLinkResetSchema(["--db", f.controlPath]), { code: "subscription_link_reset_schema_unavailable" });
  const checkDb = new Database(f.controlPath, { readonly: true });
  const originalRows = checkDb.prepare("select * from platform_portal_access_requests").all();
  assert.equal(checkDb.prepare("select count(*) n from sqlite_master where name = 'platform_portal_subscription_link_resets'").get().n, 0);
  checkDb.close();
  const applied = preparePortalSubscriptionLinkResetSchema(["--db", f.controlPath, "--apply"]);
  assert.equal(applied.mode, "apply"); assert.equal(applied.applicationFeatureChanged, false);
  assert.equal(preparePortalSubscriptionLinkResetSchema(["--db", f.controlPath]).mode, "check");
  const finalDb = new Database(f.controlPath, { readonly: true });
  assert.deepEqual(finalDb.prepare("select * from platform_portal_access_requests").all(), originalRows);
  finalDb.close();
});

test("process exit after runtime commit leaves control prepared and is recoverable with the same URL", t => {
  const f = seed(t);
  ensurePortalSubscriptionLinkResetSchema(f.controlDb);
  const plan = coreFor(f.runtime).prepareSubscriptionArtifactRotation("artifact_old", { tenantId: "tenant_durable" });
  createPortalSubscriptionLinkResetStore({ database: f.controlDb, nowFn: () => new Date(NOW) }).prepare({ ...operation, plan });
  f.runtime.close(); f.controlDb.close();
  const moduleUrl = relative => new URL(relative, import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import Database from 'better-sqlite3';
    import { createSubscriptionCore } from ${JSON.stringify(moduleUrl("../services/subscriptions/core.mjs"))};
    import { createSubscriptionRepository } from ${JSON.stringify(moduleUrl("../services/subscriptions/repository.mjs"))};
    import { createPortalSubscriptionLinkResetStore } from ${JSON.stringify(moduleUrl("../services/platform/portal-subscription-link-reset-store.mjs"))};
    const db = new Database(process.env.SYNTHETIC_CONTROL);
    const repository = createSubscriptionRepository({ dbPath: process.env.SYNTHETIC_RUNTIME });
    const core = createSubscriptionCore({ repository, proxyConfig: ${JSON.stringify(config)}, publicSubscriptionBaseUrl: 'https://subscription.example.test', nowFn: () => new Date(${JSON.stringify(NOW)}) });
    const store = createPortalSubscriptionLinkResetStore({ database: db, nowFn: () => new Date(${JSON.stringify(NOW)}) });
    store.complete({ ...${JSON.stringify(operation)}, commitRuntime(plan) { core.commitPreparedSubscriptionArtifactRotation(plan); process.exit(77); } });
  `], { env: { ...process.env, SYNTHETIC_CONTROL: f.controlPath, SYNTHETIC_RUNTIME: f.runtimePath }, encoding: "utf8", timeout: 10000 });
  assert.equal(child.status, 77, child.stderr);
  const resumedDb = new Database(f.controlPath);
  const resumedRuntime = createSubscriptionRepository({ dbPath: f.runtimePath });
  try {
    const store = createPortalSubscriptionLinkResetStore({ database: resumedDb, nowFn: () => new Date(NOW) });
    assert.equal(store.get(operation).state, "prepared");
    assert.deepEqual(store.get(operation).plan, plan);
    assert.equal(resumedDb.prepare("select artifact_id from platform_portal_access_requests").get().artifact_id, "artifact_old");
    assert.equal(resumedRuntime.listArtifactsByTenant("tenant_durable").find(a => a.id === "artifact_old").status, "rotated");
    assert.equal(store.complete({ ...operation, commitRuntime: value => coreFor(resumedRuntime).commitPreparedSubscriptionArtifactRotation(value) }).state, "completed");
    assert.equal(resumedDb.prepare("select subscription_url from platform_portal_access_requests").get().subscription_url, plan.subscriptionUrl);
    assert.equal(resumedRuntime.listArtifactsByTenant("tenant_durable").length, 2);
  } finally { resumedRuntime.close(); resumedDb.close(); }
});

test("completion holds the control database write lock over the runtime callback", t => {
  const f = seed(t);
  ensurePortalSubscriptionLinkResetSchema(f.controlDb);
  const second = new Database(f.controlPath); second.pragma("busy_timeout = 0");
  try {
    const store = createPortalSubscriptionLinkResetStore({ database: f.controlDb, nowFn: () => new Date(NOW) });
    const core = coreFor(f.runtime);
    const plan = core.prepareSubscriptionArtifactRotation("artifact_old", { tenantId: "tenant_durable" });
    store.prepare({ ...operation, plan });
    store.complete({ ...operation, commitRuntime(value) {
      assert.throws(() => second.prepare("update platform_portal_access_requests set status = 'disabled'").run(), { code: "SQLITE_BUSY" });
      return core.commitPreparedSubscriptionArtifactRotation(value);
    } });
  } finally { second.close(); f.runtime.close(); f.controlDb.close(); }
});
