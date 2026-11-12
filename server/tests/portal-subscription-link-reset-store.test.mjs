import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { ensurePortalSubscriptionLinkResetSchema, createPortalSubscriptionLinkResetStore } from "../services/platform/portal-subscription-link-reset-store.mjs";

const NOW = "2026-10-09T00:00:00.000Z";
const digest = "a".repeat(64);
const plan = { tenantId: "tenant_reset", previousArtifactId: "artifact_old", replacementArtifactId: "artifact_new",
  subscriptionUrl: "https://subscription.example.test/sub/a/synthetic_material_new.yaml", preparedAt: NOW };
function fixture(t, enabled = true) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  const control = createSqliteSubscriptionControlStore({ database: db });
  control.upsertPortalAccessRequest({ id: "request_reset", portalUserRef: "account_reset", plan: "monthly", clientTarget: "clash",
    durationDays: 30, quantity: 1, status: "delivered", nextAction: "subscription_ready", priorTrialState: "none",
    submittedAt: NOW, updatedAt: NOW, validUntil: "2026-11-09T00:00:00.000Z", entitlementRef: "ent_reset", accessGrantRef: "grant_reset",
    tenantId: plan.tenantId, artifactId: plan.previousArtifactId, subscriptionUrl: "https://subscription.example.test/sub/a/synthetic_old.yaml",
    edgeChannelRef: "channel_synthetic", edgeCredentialRef: "edgecred_synthetic", edgeMaterialDigest: "1".repeat(64), event: null });
  if (enabled) ensurePortalSubscriptionLinkResetSchema(db);
  return { db, control, store: enabled ? createPortalSubscriptionLinkResetStore({ database: db, nowFn: () => new Date(NOW) }) : null };
}
const input = { operationKeyDigest: digest, requestRef: "request_reset", ownerRef: "account_reset" };
function runtimeResult(value) { return { previous: { id: value.previousArtifactId, tenantId: value.tenantId, status: "rotated" },
  replacement: { id: value.replacementArtifactId, tenantId: value.tenantId, status: "active" }, subscriptionUrl: value.subscriptionUrl }; }

test("reset schema is explicit and ordinary control store startup does not install it", t => {
  const f = fixture(t, false);
  assert.equal(f.db.prepare("select count(*) n from sqlite_master where name = 'platform_portal_subscription_link_resets'").get().n, 0);
  assert.throws(() => createPortalSubscriptionLinkResetStore({ database: f.db }), { code: "subscription_link_reset_schema_unavailable" });
  ensurePortalSubscriptionLinkResetSchema(f.db);
  assert.ok(f.control.getPortalSubscriptionLinkResetStore());
});

test("prepare stores a replayable plan without changing resources; completion updates only delivery fields", t => {
  const f = fixture(t);
  const before = f.control.getPortalAccessRequest(input.requestRef);
  const prepared = f.store.prepare({ ...input, plan });
  assert.equal(prepared.state, "prepared");
  assert.deepEqual(f.control.getPortalAccessRequest(input.requestRef), before);
  assert.deepEqual(f.store.prepare({ ...input, plan }), prepared);
  let commits = 0;
  const result = f.store.complete({ ...input, commitRuntime(value) { commits++; assert.deepEqual(value, plan); return runtimeResult(value); } });
  assert.equal(result.state, "completed");
  const after = f.control.getPortalAccessRequest(input.requestRef);
  for (const key of Object.keys(before)) {
    if (!["artifactId", "subscriptionUrl", "event", "updatedAt"].includes(key)) assert.deepEqual(after[key], before[key], key);
  }
  assert.equal(after.artifactId, plan.replacementArtifactId);
  assert.equal(after.subscriptionUrl, plan.subscriptionUrl);
  assert.equal(after.event.type, "subscription_link_reset");
  assert.deepEqual(f.store.complete({ ...input, commitRuntime: runtimeResult }), result);
  assert.equal(commits, 1);
});

test("different pending reset, wrong owner and mutated plan fail closed", t => {
  const f = fixture(t);
  f.store.prepare({ ...input, plan });
  assert.throws(() => f.store.prepare({ ...input, operationKeyDigest: "b".repeat(64), plan }), { code: "subscription_link_reset_conflict" });
  assert.throws(() => f.store.get({ ...input, ownerRef: "other" }), { code: "not_found" });
  assert.throws(() => f.store.prepare({ ...input, plan: { ...plan, replacementArtifactId: "different" } }), { code: "subscription_link_reset_conflict" });
});

test("runtime success followed by control failure leaves durable prepared plan for exact replay", t => {
  const f = fixture(t);
  f.store.prepare({ ...input, plan });
  f.db.exec("create trigger fail_reset before update of artifact_id on platform_portal_access_requests begin select raise(abort, 'synthetic failure'); end;");
  let committed;
  assert.throws(() => f.store.complete({ ...input, commitRuntime(value) { committed = value; return runtimeResult(value); } }));
  assert.deepEqual(committed, plan);
  assert.equal(f.store.get(input).state, "prepared");
  assert.equal(f.control.getPortalAccessRequest(input.requestRef).artifactId, plan.previousArtifactId);
  f.db.exec("drop trigger fail_reset;");
  assert.equal(f.store.complete({ ...input, commitRuntime: runtimeResult }).state, "completed");
});

test("order drift or expiry is detected before runtime commit", t => {
  const f = fixture(t);
  f.store.prepare({ ...input, plan });
  f.db.prepare("update platform_portal_access_requests set status = 'disabled' where id = ?").run(input.requestRef);
  let called = false;
  assert.throws(() => f.store.complete({ ...input, commitRuntime() { called = true; } }), { code: "subscription_link_reset_conflict" });
  assert.equal(called, false);
  f.db.prepare("update platform_portal_access_requests set status = 'delivered', valid_until = ? where id = ?").run(NOW, input.requestRef);
  assert.throws(() => f.store.complete({ ...input, commitRuntime() { called = true; } }));
  assert.equal(called, false);
});

test("latest successful reset clock is owner scoped and does not count preparations", t => {
  const f = fixture(t);
  const scope = { requestRef: input.requestRef, ownerRef: input.ownerRef };
  assert.equal(f.store.getLatestCompletedAt(scope), null);
  f.store.prepare({ ...input, plan });
  assert.equal(f.store.getLatestCompletedAt(scope), null);
  f.store.complete({ ...input, commitRuntime: runtimeResult });
  assert.equal(f.store.getLatestCompletedAt(scope), NOW);
  assert.throws(() => f.store.getLatestCompletedAt({ ...scope, ownerRef: "other" }), { code: "not_found" });
});

test("schema check rejects a same-name index with the wrong uniqueness boundary", t => {
  const f = fixture(t);
  f.db.exec("drop index portal_link_reset_pending_request_idx; create unique index portal_link_reset_pending_request_idx on platform_portal_subscription_link_resets(owner_ref) where state = 'prepared';");
  assert.throws(() => createPortalSubscriptionLinkResetStore({ database: f.db }), { code: "subscription_link_reset_schema_unavailable" });
});

test("different operation cooldown is enforced in the same prepare transaction", t => {
  const f = fixture(t);
  f.store.prepare({ ...input, plan });
  f.store.complete({ ...input, commitRuntime: runtimeResult });
  assert.throws(() => f.store.prepare({ ...input, operationKeyDigest: "b".repeat(64), cooldownMs: 300000,
    plan: { ...plan, previousArtifactId: plan.replacementArtifactId, replacementArtifactId: "artifact_third" } }),
  { code: "subscription_link_reset_rate_limited", retryAfterSeconds: 300 });
  assert.equal(f.store.prepare({ ...input, plan }).state, "completed");
});

function twiceReset(f) {
  f.store.prepare({ ...input, plan });
  f.store.complete({ ...input, commitRuntime: runtimeResult });
  const secondInput = { ...input, operationKeyDigest: "b".repeat(64) };
  const nextPlan = { ...plan, previousArtifactId: plan.replacementArtifactId, replacementArtifactId: "artifact_third",
    subscriptionUrl: plan.subscriptionUrl.replace("synthetic_material_new", "synthetic_material_third") };
  f.store.prepare({ ...secondInput, plan: nextPlan, cooldownMs: 0 });
  f.store.complete({ ...secondInput, commitRuntime: runtimeResult });
  return { requestRef: input.requestRef, ownerRef: input.ownerRef, tenantId: plan.tenantId,
    originalArtifactRef: `artifactref_${createHash("sha256").update(plan.previousArtifactId).digest("hex").slice(0, 16)}`,
    currentArtifactId: "artifact_third" };
}

test("immutable issued artifact is proven through the exact completed multi-reset chain", t => {
  const f = fixture(t);
  const lineage = twiceReset(f);
  assert.equal(f.control.verifyPortalSubscriptionLinkResetLineage(lineage), true);
  for (const field of ["requestRef", "ownerRef", "tenantId", "currentArtifactId"]) {
    assert.equal(f.control.verifyPortalSubscriptionLinkResetLineage({ ...lineage, [field]: "different" }), false, field);
  }
  assert.equal(f.control.verifyPortalSubscriptionLinkResetLineage({ ...lineage, originalArtifactRef: `artifactref_${"0".repeat(16)}` }), false);
});

for (const [name, sql] of [
  ["prepared intermediate", "update platform_portal_subscription_link_resets set state = 'prepared', completed_at = null where previous_artifact_id = 'artifact_old'"],
  ["wrong intermediate tenant", "update platform_portal_subscription_link_resets set tenant_id = 'other' where previous_artifact_id = 'artifact_old'"],
  ["wrong intermediate owner", "update platform_portal_subscription_link_resets set owner_ref = 'other' where previous_artifact_id = 'artifact_old'"],
  ["missing intermediate", "delete from platform_portal_subscription_link_resets where previous_artifact_id = 'artifact_old'"],
  ["backdated second preparation", "update platform_portal_subscription_link_resets set prepared_at = '2026-10-08T00:00:00.000Z' where previous_artifact_id = 'artifact_new'"],
  ["loop", "update platform_portal_subscription_link_resets set replacement_artifact_id = 'artifact_old' where previous_artifact_id = 'artifact_new'"]
]) test(`reset lineage fails closed for ${name}`, t => {
  const f = fixture(t);
  const lineage = twiceReset(f);
  f.db.exec(sql);
  assert.equal(f.control.verifyPortalSubscriptionLinkResetLineage(lineage), false);
});

test("lineage does not accept a request pointer rolled back into an older completed generation", t => {
  const f = fixture(t);
  const lineage = twiceReset(f);
  f.db.prepare("update platform_portal_access_requests set artifact_id = 'artifact_new'").run();
  assert.equal(f.control.verifyPortalSubscriptionLinkResetLineage({ ...lineage, currentArtifactId: "artifact_new" }), false);
});

test("legacy control stores without the opt-in schema return no fabricated lineage", t => {
  const f = fixture(t, false);
  assert.equal(f.control.verifyPortalSubscriptionLinkResetLineage({ requestRef: input.requestRef, ownerRef: input.ownerRef,
    tenantId: plan.tenantId, originalArtifactRef: `artifactref_${"0".repeat(16)}`, currentArtifactId: plan.previousArtifactId }), false);
});
