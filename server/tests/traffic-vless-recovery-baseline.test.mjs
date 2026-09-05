import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import {
  inspectTrafficVlessBaseline, prepareTrafficVlessBaseline,
  applyTrafficVlessBaseline, verifyTrafficVlessBaseline, admitTrafficVlessBaseline
} from "../../scripts/lib/traffic-vless-recovery-baseline.mjs";

const CHANNELS = ["channel-vultr-a-vless-reality-tcp", "channel-sgp-a-vless-reality-tcp"];
const SOURCE = "xray_statsquery_user_traffic";
const OLD = "2026-08-01T15:38:48.000Z";
const NOW = "2026-09-05T10:30:00.000Z";
const LATER = "2026-09-05T10:31:00.000Z";
const nowFn = () => NOW;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "traffic-vless-baseline-"));
  const dbPath = join(directory, "private.sqlite");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  const db = new Database(dbPath);
  t.after(() => {
    if (db.open) db.close();
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  const refs = [];
  for (const [index, channelRef] of [...CHANNELS, "channel-sgp-a-tuic"].entries()) {
    const suffix = String(index);
    const accountId = `private-account-${suffix}`;
    const entitlementId = `private-entitlement-${suffix}`;
    const requestId = `private-request-${suffix}`;
    const edgeCredentialRef = `private-credential-${suffix}`;
    store.createAccount({ id: accountId, ownerRef: `owner-${suffix}`, status: "active", createdAt: OLD, updatedAt: OLD });
    store.createEntitlement({ id: entitlementId, accountId, plan: "yearly", status: "active", validFrom: "2026-08-01T00:00:00.000Z", validUntil: "2027-08-01T00:00:00.000Z", trafficLimitBytes: 10000, createdAt: OLD, updatedAt: OLD });
    store.createIssuanceRequest({ id: requestId, accountId, entitlementId, approvalRef: `approval-${suffix}`, status: "issued", quantity: 1, nodeId: channelRef, purpose: "portal_auto_issuance", requestedByRef: "test-issuer", createdAt: OLD, updatedAt: OLD });
    store.linkIssuedSubscription({ id: `link-${suffix}`, requestId, tenantRef: `tenant-${suffix}`, artifactRef: `artifact-${suffix}`, status: "active", createdAt: OLD, updatedAt: OLD });
    store.upsertPortalAccessRequest({ id: requestId, portalUserRef: `owner-${suffix}`, plan: "yearly", clientTarget: "clash", durationDays: 365, quantity: 1, status: "delivered", nextAction: "user_can_use_access", noteProvided: false, priorTrialState: "not_applicable", submittedAt: OLD, updatedAt: OLD, validUntil: "2027-08-01T00:00:00.000Z", entitlementRef: entitlementId, accessGrantRef: `grant-${suffix}`, tenantId: `tenant-${suffix}`, artifactId: `artifact-${suffix}`, subscriptionUrl: "https://private.example.invalid/sub/never-output", edgeChannelRef: channelRef, edgeCredentialRef, edgeMaterialDigest: `sha256:private-material-${suffix}` });
    const input = { sourceRef: index === 2 ? "mihomo_connections_delta" : SOURCE, accountingMode: "cumulative", channelRef, edgeCredentialRef, accountId, entitlementId, requestId, observedAt: OLD, intervalStartedAt: OLD, intervalEndedAt: OLD, uploadBytes: 100, downloadBytes: 200, createdAt: OLD };
    store.recordCumulativeUsageSample(input);
    refs.push(input);
  }
  const observations = refs.slice(0, 2).map((row) => ({ sourceRef: SOURCE, accountingMode: "cumulative", channelRef: row.channelRef, edgeCredentialRef: row.edgeCredentialRef, observedAt: NOW, uploadBytes: 50000, downloadBytes: 70000 }));
  return { directory, dbPath, store, db, refs, observations };
}

function prepare(f, overrides = {}) {
  const inspection = inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, nowFn });
  assert.equal(inspection.ok, true, JSON.stringify(inspection.summary));
  return prepareTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, observations: f.observations, expectedInventory: inspection.privateInventory, nowFn, ...overrides });
}

function apply(f, prepared, overrides = {}) {
  return applyTrafficVlessBaseline({ dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest, nowFn, ...overrides });
}

function tableRows(f, table) { return f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(); }
function accountingRows(f) { return [tableRows(f, "platform_usage_samples"), tableRows(f, "platform_usage_rollups")]; }
function assertRedacted(result, f) {
  const text = JSON.stringify(result);
  for (const raw of [f.directory, "private-account", "private-entitlement", "private-request", "private-credential", "private-material", "never-output", "SQLITE_"]) assert.equal(text.includes(raw), false, raw);
  assert.equal(result.productionCollectionAuthorized, false);
}

test("baseline drops no history and writes only selected cursors; next real accounting charges only post-T0 bytes", (t) => {
  const f = fixture(t);
  f.store.recordUsageSample({ ...f.refs[0], id: "historical-sample", sampleDigest: "sha256:historical-sample", uploadBytes: 40, downloadBytes: 60, totalBytes: 100 });
  const beforeAccounting = accountingRows(f);
  const beforeOther = f.store.getUsageCounterCursor(f.refs[2]);
  const beforeSchema = f.db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all();
  const prepared = prepare(f);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.summary.plannedCursorCount, 2);
  assertRedacted(prepared.summary, f);
  assert.deepEqual(accountingRows(f), beforeAccounting);
  assert.equal(f.store.getUsageCounterCursor(f.refs[0]).uploadBytes, 100);
  const applied = apply(f, prepared);
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(applied.status, "baseline_applied");
  assert.equal(applied.updatedCursorCount, 2);
  assertRedacted(applied, f);
  assert.deepEqual(accountingRows(f), beforeAccounting);
  assert.deepEqual(f.store.getUsageCounterCursor(f.refs[2]), beforeOther);
  assert.deepEqual(f.db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all(), beforeSchema);
  assert.equal(f.store.getUsageCounterCursor(f.refs[0]).epoch, 0);
  const verified = verifyTrafficVlessBaseline({ dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest, nowFn });
  assert.equal(verified.status, "baseline_verified");
  assertRedacted(verified, f);
  const service = createTrafficAccountingService({ controlStore: f.store, nowFn: () => LATER });
  const outcome = service.recordUsageObservation({ ...f.observations[0], observedAt: LATER, intervalStartedAt: NOW, intervalEndedAt: LATER, uploadBytes: 50010, downloadBytes: 70020 });
  assert.equal(outcome.sampleInserted, true);
  assert.equal(outcome.sample.totalBytes, 30);
  assert.equal(outcome.sample.intervalStartedAt, NOW);
  assert.equal(outcome.quota.usedBytes, 30);
  assert.equal(outcome.status, "within_quota");
});

test("exact serialized plan replay is a no-op and verify refuses unapplied plans", (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  prepared.privatePlan = JSON.parse(JSON.stringify(prepared.privatePlan));
  assert.equal(verifyTrafficVlessBaseline({ dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest, nowFn }).ok, false);
  assert.equal(apply(f, prepared).ok, true);
  const before = tableRows(f, "platform_usage_counter_cursors");
  const replay = apply(f, prepared);
  assert.equal(replay.status, "baseline_already_applied");
  assert.equal(replay.updatedCursorCount, 0);
  assert.deepEqual(tableRows(f, "platform_usage_counter_cursors"), before);
});

test("second cursor constraint failure rolls back the first update and all accounting remains unchanged", (t) => {
  const f = fixture(t);
  f.db.exec("CREATE UNIQUE INDEX recovery_test_unique_counter ON platform_usage_counter_cursors(upload_bytes) WHERE upload_bytes > 1000");
  const prepared = prepare(f);
  assert.equal(prepared.ok, true);
  const before = tableRows(f, "platform_usage_counter_cursors");
  const result = apply(f, prepared);
  assert.equal(result.ok, false);
  assert.deepEqual(tableRows(f, "platform_usage_counter_cursors"), before);
  assert.deepEqual(accountingRows(f), [[], []]);
  assertRedacted(result, f);
});

for (const drift of ["cursor", "material", "account", "samples", "rollup", "new_binding", "schema"]) {
  test(`apply fails closed on ${drift} drift without partial update`, (t) => {
    const f = fixture(t);
    const prepared = prepare(f);
    if (drift === "cursor") f.db.prepare("UPDATE platform_usage_counter_cursors SET upload_bytes=101 WHERE edge_credential_ref=?").run(f.refs[1].edgeCredentialRef);
    if (drift === "material") f.db.prepare("UPDATE platform_portal_edge_credentials SET edge_material_digest='changed' WHERE edge_credential_ref=?").run(f.refs[1].edgeCredentialRef);
    if (drift === "account") f.db.prepare("UPDATE platform_accounts SET status='suspended' WHERE id=?").run(f.refs[1].accountId);
    if (drift === "samples" || drift === "rollup") {
      f.store.recordUsageSample({ ...f.refs[0], id: "new-sample", sampleDigest: "sha256:new-sample", uploadBytes: 1, downloadBytes: 1, totalBytes: 2 });
      if (drift === "rollup") f.db.prepare("DELETE FROM platform_usage_samples WHERE id='new-sample'").run();
    }
    if (drift === "new_binding") f.db.prepare("UPDATE platform_portal_edge_credentials SET edge_channel_ref=? WHERE edge_credential_ref=?").run(CHANNELS[0], f.refs[2].edgeCredentialRef);
    if (drift === "schema") f.db.exec("CREATE INDEX recovery_changed_schema ON platform_usage_counter_cursors(epoch)");
    const before = tableRows(f, "platform_usage_counter_cursors");
    const result = apply(f, prepared);
    assert.equal(result.ok, false);
    assert.deepEqual(tableRows(f, "platform_usage_counter_cursors"), before);
    assertRedacted(result, f);
  });
}

test("independent sidecar can write between prepare and apply while its records remain untouched", (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  f.store.recordUsageSample({ ...f.refs[2], id: "sidecar-sample", sampleDigest: "sha256:sidecar-sample", uploadBytes: 20, downloadBytes: 30, totalBytes: 50 });
  const otherBefore = f.store.getUsageCounterCursor(f.refs[2]);
  const accountingBefore = accountingRows(f);
  assert.equal(apply(f, prepared).ok, true);
  assert.deepEqual(accountingRows(f), accountingBefore);
  assert.deepEqual(f.store.getUsageCounterCursor(f.refs[2]), otherBefore);
});

test("missing, inactive, ambiguous, or material-less durable bindings fail closed", (t) => {
  for (const sql of [
    "DELETE FROM platform_portal_edge_credentials WHERE edge_credential_ref='private-credential-0'",
    "UPDATE platform_entitlements SET status='expired' WHERE id='private-entitlement-0'",
    "UPDATE platform_portal_edge_credentials SET edge_material_digest='' WHERE edge_credential_ref='private-credential-0'",
    "INSERT INTO platform_issued_subscription_links SELECT 'extra-link', request_id, tenant_ref, artifact_ref, status, created_at, updated_at FROM platform_issued_subscription_links WHERE id='link-0'"
  ]) {
    const f = fixture(t);
    f.db.exec(sql);
    const result = inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, nowFn });
    assert.equal(result.ok, false, sql);
    assertRedacted(result.summary, f);
  }
});

test("prepare rejects stale expected inventory, unknown and duplicate scopes, missing and duplicate observations", (t) => {
  const f = fixture(t);
  const expectedInventory = inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, nowFn }).privateInventory;
  const cases = [
    { channelRefs: [] }, { channelRefs: [CHANNELS[0], CHANNELS[0]] }, { channelRefs: ["channel-sgp-a-tuic"] },
    { observations: [] }, { observations: [f.observations[0]] }, { observations: [f.observations[0], f.observations[0]] },
    { observations: [{ ...f.observations[0], channelRef: "channel-vultr-a-hy2" }, f.observations[1]] }
  ];
  for (const overrides of cases) assert.equal(prepareTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, observations: f.observations, expectedInventory, nowFn, ...overrides }).ok, false);
  f.db.prepare("UPDATE platform_usage_counter_cursors SET observed_at=? WHERE edge_credential_ref=?").run("2026-08-02T00:00:00.000Z", f.refs[0].edgeCredentialRef);
  assert.equal(prepareTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, observations: f.observations, expectedInventory, nowFn }).ok, false);
});

test("prepare rejects resettable sources, imprecise bytes, future/old observations, and unknown fields", (t) => {
  const f = fixture(t);
  for (const override of [
    { sourceRef: "hysteria_traffic" }, { accountingMode: "delta" }, { clear: true },
    { uploadBytes: Number.MAX_SAFE_INTEGER + 1 }, { downloadBytes: "70000" }, { uploadBytes: -1 },
    { uploadBytes: Number.MAX_SAFE_INTEGER, downloadBytes: 1 },
    { observedAt: "2026-09-05T10:30:00.001Z" }, { observedAt: "2026-09-05T10:24:59.999Z" },
    { observedAt: "2026-09-05T10:30:00Z" }, { unexpectedPrivateField: "do-not-use" }
  ]) {
    const result = prepare(f, { observations: [{ ...f.observations[0], ...override }, f.observations[1]] });
    assert.equal(result.ok, false, JSON.stringify(override));
    assertRedacted(result.summary, f);
  }
});

test("counter decrease requires explicit reset evidence and advances only its epoch exactly once", (t) => {
  const f = fixture(t);
  const observations = [{ ...f.observations[0], uploadBytes: 10, downloadBytes: 20 }, f.observations[1]];
  assert.equal(prepare(f, { observations }).ok, false);
  observations[0].counterResetConfirmed = true;
  const prepared = prepare(f, { observations });
  assert.equal(prepared.ok, true);
  assert.equal(apply(f, prepared).ok, true);
  assert.equal(f.store.getUsageCounterCursor(f.refs[0]).epoch, 1);
  assert.equal(f.store.getUsageCounterCursor(f.refs[1]).epoch, 0);
  assert.equal(apply(f, prepared).status, "baseline_already_applied");
  assert.equal(f.store.getUsageCounterCursor(f.refs[0]).epoch, 1);
});

test("plan expiry, forged digest, wrong DB identity, and modified private plan fail closed", (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  assert.equal(apply(f, prepared, { nowFn: () => "2026-09-05T10:35:00.001Z" }).ok, false);
  assert.equal(apply(f, prepared, { expectedPlanDigest: "0".repeat(64) }).ok, false);
  const altered = structuredClone(prepared.privatePlan);
  altered.entries[0].after.uploadBytes += 1;
  assert.equal(apply(f, prepared, { plan: altered }).ok, false);
  f.db.pragma("wal_checkpoint(FULL)");
  const otherPath = join(f.directory, "other.sqlite");
  copyFileSync(f.dbPath, otherPath);
  assert.equal(apply(f, prepared, { dbPath: otherPath }).ok, false);
  assert.equal(f.store.getUsageCounterCursor(f.refs[0]).uploadBytes, 100);
});

test("missing DB never gets created; wrong schema and cursor triggers are rejected", (t) => {
  const f = fixture(t);
  const missing = join(f.directory, "never-created.sqlite");
  const result = inspectTrafficVlessBaseline({ dbPath: missing, channelRefs: CHANNELS, nowFn });
  assert.equal(result.ok, false);
  assert.equal(existsSync(missing), false);
  assertRedacted(result.summary, f);
  const prepared = prepare(f);
  assert.equal(apply(f, prepared, { dbPath: missing }).ok, false);
  assert.equal(existsSync(missing), false);
  const invalidPath = join(f.directory, "wrong-schema.sqlite");
  const invalidDb = new Database(invalidPath);
  invalidDb.exec("CREATE TABLE unrelated (id INTEGER)");
  invalidDb.close();
  assert.equal(inspectTrafficVlessBaseline({ dbPath: invalidPath, channelRefs: CHANNELS, nowFn }).summary.errorCode, "baseline_schema_invalid");
  const checked = new Database(invalidPath, { readonly: true });
  assert.deepEqual(checked.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all(), [{ name: "unrelated" }]);
  checked.close();
  f.db.exec("CREATE TRIGGER unexpected_cursor_side_effect AFTER UPDATE ON platform_usage_counter_cursors BEGIN DELETE FROM platform_usage_samples; END");
  assert.equal(inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, nowFn }).ok, false);
});

test("stored counters outside the service safe integer domain and missing existing cursors are refused", (t) => {
  const f = fixture(t);
  f.db.prepare("UPDATE platform_usage_counter_cursors SET upload_bytes=? WHERE edge_credential_ref=?").run(9007199254740992n, f.refs[0].edgeCredentialRef);
  assert.equal(inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, nowFn }).ok, false);
  f.db.prepare("DELETE FROM platform_usage_counter_cursors WHERE edge_credential_ref=?").run(f.refs[0].edgeCredentialRef);
  assert.equal(inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, nowFn }).ok, false);
});

test("read-only admission accepts later legitimate accounting after plan expiry and rejects unapplied state", (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  const args = { dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest, nowFn };
  assert.equal(admitTrafficVlessBaseline(args).ok, false);
  assert.equal(apply(f, prepared).ok, true);
  const service = createTrafficAccountingService({ controlStore: f.store, nowFn: () => LATER });
  service.recordUsageObservation({ ...f.observations[0], observedAt: LATER, intervalStartedAt: NOW, intervalEndedAt: LATER, uploadBytes: 50010, downloadBytes: 70020 });
  const before = [tableRows(f, "platform_usage_counter_cursors"), accountingRows(f)];
  const result = admitTrafficVlessBaseline({ ...args, nowFn: () => "2026-09-05T10:36:00.000Z" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, "baseline_scope_admitted");
  assertRedacted(result, f);
  assert.deepEqual([tableRows(f, "platform_usage_counter_cursors"), accountingRows(f)], before);
});

test("admission rejects below-T0, same-epoch backward counters, changed bindings and missing cursor scope", (t) => {
  for (const sql of [
    "UPDATE platform_usage_counter_cursors SET observed_at='2026-09-05T10:29:59.999Z' WHERE edge_credential_ref='private-credential-0'",
    "UPDATE platform_usage_counter_cursors SET upload_bytes=49999 WHERE edge_credential_ref='private-credential-0'",
    "UPDATE platform_portal_edge_credentials SET edge_material_digest='changed' WHERE edge_credential_ref='private-credential-0'",
    "DELETE FROM platform_usage_counter_cursors WHERE edge_credential_ref='private-credential-0'"
  ]) {
    const f = fixture(t);
    const prepared = prepare(f);
    assert.equal(apply(f, prepared).ok, true);
    f.db.exec(sql);
    const result = admitTrafficVlessBaseline({ dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest, nowFn });
    assert.equal(result.ok, false, sql);
    assertRedacted(result, f);
  }
});

test("admission permits existing service reset epochs after T0 but refuses epoch rollback", (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  assert.equal(apply(f, prepared).ok, true);
  const service = createTrafficAccountingService({ controlStore: f.store, nowFn: () => LATER });
  service.recordUsageObservation({ ...f.observations[0], observedAt: LATER, intervalStartedAt: NOW, intervalEndedAt: LATER, uploadBytes: 1, downloadBytes: 2 });
  const args = { dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest, nowFn: () => LATER };
  assert.equal(admitTrafficVlessBaseline(args).ok, true);
  f.db.prepare("UPDATE platform_usage_counter_cursors SET epoch=0 WHERE edge_credential_ref=?").run(f.refs[0].edgeCredentialRef);
  assert.equal(admitTrafficVlessBaseline(args).ok, false);
});

test("verify reconciles exact before/after states after expiry but reports advanced or mixed scope as drift", (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  const args = { dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest, nowFn: () => "2026-09-05T10:40:00.000Z" };
  assert.equal(verifyTrafficVlessBaseline(args).status, "baseline_not_applied");
  assert.equal(apply(f, prepared).ok, true);
  assert.equal(verifyTrafficVlessBaseline(args).status, "baseline_verified");
  f.db.prepare("UPDATE platform_usage_counter_cursors SET upload_bytes=upload_bytes+1 WHERE edge_credential_ref=?").run(f.refs[0].edgeCredentialRef);
  assert.equal(verifyTrafficVlessBaseline(args).summary, undefined);
  assert.equal(verifyTrafficVlessBaseline(args).errorCode, "baseline_cursor_changed");
  assert.equal(apply(f, prepared).ok, false);
});

test("exact one-channel plan updates only that channel and read phases leave database rows unchanged", (t) => {
  const f = fixture(t);
  const channelRefs = [CHANNELS[0]];
  const beforeRows = tableRows(f, "platform_usage_counter_cursors");
  const inspection = inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs, nowFn });
  const prepared = prepareTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs, observations: [f.observations[0]], expectedInventory: inspection.privateInventory, nowFn });
  assert.equal(prepared.ok, true);
  assert.deepEqual(tableRows(f, "platform_usage_counter_cursors"), beforeRows);
  assert.equal(apply(f, prepared).ok, true);
  assert.deepEqual(tableRows(f, "platform_usage_counter_cursors").slice(1), beforeRows.slice(1));
});

test("apply rechecks deadline after obtaining its writer transaction before any cursor mutation", (t) => {
  const f = fixture(t);
  const prepared = prepare(f, { validForSeconds: 1 });
  const before = tableRows(f, "platform_usage_counter_cursors");
  let reads = 0;
  const result = apply(f, prepared, { nowFn: () => ++reads === 1 ? NOW : "2026-09-05T10:30:01.001Z" });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "baseline_plan_expired");
  assert.deepEqual(tableRows(f, "platform_usage_counter_cursors"), before);
});

test("admission stops a stalled cursor after fifteen minutes even with a valid historical applied receipt", (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  assert.equal(apply(f, prepared).ok, true);
  const args = { dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest };
  assert.equal(admitTrafficVlessBaseline({ ...args, nowFn: () => "2026-09-05T10:45:00.000Z" }).ok, true);
  assert.equal(admitTrafficVlessBaseline({ ...args, nowFn: () => "2026-09-05T10:45:00.001Z" }).errorCode, "baseline_cursor_stale");
});

test("admission has a hard twenty-four-hour recovery window even when all cursors continue advancing", (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  assert.equal(apply(f, prepared).ok, true);
  const at = "2026-09-06T10:30:00.001Z";
  f.db.prepare("UPDATE platform_usage_counter_cursors SET observed_at=?,updated_at=? WHERE source_ref=?").run(at, at, SOURCE);
  assert.equal(admitTrafficVlessBaseline({ dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest, nowFn: () => at }).errorCode, "baseline_activation_window_expired");
});

for (const plan of ["yearly", "offerv_plan_30d_50gb_monthly_v1"]) {
  test(`admission stops at the actual ${plan} entitlement cycle boundary within the recovery window`, (t) => {
    const f = fixture(t);
    // Both schemes roll over at September 5 10:31, well before the next
    // calendar month and within fifteen minutes of the baseline observation.
    const validFrom = plan === "yearly" ? "2026-07-05T10:31:00.000Z" : "2026-08-06T10:31:00.000Z";
    f.db.prepare("UPDATE platform_entitlements SET valid_from=?,plan=? WHERE id=?").run(validFrom, plan, f.refs[0].entitlementId);
    const prepared = prepare(f);
    assert.equal(prepared.ok, true);
    assert.equal(apply(f, prepared).ok, true);
    const result = admitTrafficVlessBaseline({ dbPath: f.dbPath, plan: prepared.privatePlan, expectedPlanDigest: prepared.summary.planDigest, nowFn: () => LATER });
    assert.equal(result.errorCode, "baseline_billing_cycle_changed");
  });
}

test("prepare refuses fresh observations from the previous entitlement cycle", (t) => {
  const f = fixture(t);
  f.db.prepare("UPDATE platform_entitlements SET valid_from='2026-07-05T10:31:00.000Z' WHERE id=?").run(f.refs[0].entitlementId);
  const inspection = inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, nowFn: () => LATER });
  const result = prepareTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, observations: f.observations, expectedInventory: inspection.privateInventory, nowFn: () => LATER });
  assert.equal(result.summary.errorCode, "baseline_billing_cycle_changed");
});

test("historical edge lifecycle mutation flags remain bound evidence without blocking a delivered active order", (t) => {
  const f = fixture(t);
  f.db.prepare("UPDATE platform_portal_access_requests SET edge_lifecycle_mutation=1 WHERE id=?").run(f.refs[0].requestId);
  const prepared = prepare(f);
  assert.equal(prepared.ok, true);
  assert.equal(apply(f, prepared).ok, true);
  assert.equal(f.db.prepare("SELECT edge_lifecycle_mutation FROM platform_portal_access_requests WHERE id=?").get(f.refs[0].requestId).edge_lifecycle_mutation, 1);
});
