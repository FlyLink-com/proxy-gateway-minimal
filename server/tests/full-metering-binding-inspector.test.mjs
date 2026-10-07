import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  inspectFullMeteringBindings, readFullMeteringBindings, inspectTrafficVlessBaseline
} from "../../scripts/lib/traffic-vless-recovery-baseline.mjs";

const CHANNELS = ["channel-vultr-a-vless-reality-tcp", "channel-sgp-a-vless-reality-tcp", "channel-vultr-a-hy2", "channel-sgp-a-hy2", "channel-vultr-a-tuic"];
const SOURCES = ["full_metering_xray_cumulative_v1", "full_metering_xray_cumulative_v1", "full_metering_hy2_cumulative_v1", "full_metering_hy2_cumulative_v1", "full_metering_tuic_connections_v1"];
const NOW = "2026-09-08T06:00:00.000Z";
const OLD = "2026-08-01T00:00:00.000Z";
const UNTIL = "2027-08-01T00:00:00.000Z";
const nowFn = () => NOW;
const resourceRef = (prefix, value) => `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "full-metering-binding-"));
  const dbPath = join(directory, "private.sqlite");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  const db = new Database(dbPath);
  t.after(() => { if (db.open) db.close(); store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); });
  const refs = [];
  function add(channelRef, { legacy = false, expired = false, opaque = false } = {}) {
    const suffix = String(refs.length);
    const accountId = `private-account-${suffix}`, entitlementId = `private-entitlement-${suffix}`;
    const requestId = `private-request-${suffix}`, edgeCredentialRef = `private-credential-${suffix}`;
    const tenant = `private-tenant-${suffix}`, artifact = `private-artifact-${suffix}`;
    store.createAccount({ id: accountId, ownerRef: `owner-${suffix}`, status: "active", createdAt: OLD, updatedAt: OLD });
    store.createEntitlement({ id: entitlementId, accountId, plan: "yearly", status: expired || opaque ? "expired" : "active", validFrom: OLD, validUntil: opaque ? "2026-09-01T00:00:00.000Z" : UNTIL, trafficLimitBytes: 10000, createdAt: OLD, updatedAt: OLD });
    store.createIssuanceRequest({ id: requestId, accountId, entitlementId, approvalRef: `approval-${suffix}`, status: "issued", quantity: 1, nodeId: channelRef, purpose: "portal_auto_issuance", requestedByRef: "test-issuer", createdAt: OLD, updatedAt: OLD });
    store.linkIssuedSubscription({ id: `link-${suffix}`, requestId, tenantRef: resourceRef("tenant", tenant), artifactRef: resourceRef("artifact", artifact), status: "active", createdAt: OLD, updatedAt: OLD });
    store.upsertPortalAccessRequest({ id: requestId, portalUserRef: accountId, plan: "yearly", clientTarget: "clash", durationDays: 365, quantity: 1, status: "delivered", nextAction: "user_can_use_access", noteProvided: false, priorTrialState: "not_applicable", submittedAt: OLD, updatedAt: OLD, validUntil: UNTIL, entitlementRef: entitlementId, accessGrantRef: `grant-${suffix}`, tenantId: tenant, artifactId: artifact, subscriptionUrl: "https://synthetic.example.invalid/sub/private-never-output", edgeChannelRef: channelRef, edgeCredentialRef, edgeMaterialDigest: `sha256:private-material-${suffix}` });
    if (legacy || opaque) db.prepare("DELETE FROM platform_portal_edge_credentials WHERE request_id=?").run(requestId);
    if (opaque) db.prepare("UPDATE platform_portal_access_requests SET status='pending_admin_review',next_action='wait_for_admin_review',entitlement_ref=NULL,edge_channel_ref=NULL,edge_credential_ref=NULL,edge_material_digest=NULL,access_grant_ref=NULL,tenant_id=NULL,artifact_id=NULL WHERE id=?").run(requestId);
    const ref = { accountId, entitlementId, requestId, edgeCredentialRef, channelRef };
    refs.push(ref);
    return ref;
  }
  CHANNELS.forEach(channel => add(channel));
  return { directory, dbPath, db, store, refs, add };
}
const inspect = (f, options = {}) => inspectFullMeteringBindings({ dbPath: f.dbPath, channelRefs: CHANNELS, nowFn, ...options });
function rows(f) {
  return ["platform_usage_counter_cursors", "platform_usage_samples", "platform_usage_rollups", "platform_portal_edge_credentials", "platform_portal_access_requests", "sqlite_schema"]
    .map(table => f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
}
function assertSafe(summary) {
  assert.doesNotMatch(JSON.stringify(summary), /private-|SQLITE_|sqlite|subscriptionUrl|edgeCredentialRef/);
  assert.equal(summary.productionAuthorized, false);
  assert.equal(summary.productionCollectionAuthorized, false);
}

test("full inspector covers only five fixed channels and returns private billing identities without writes", (t) => {
  const f = fixture(t), before = rows(f);
  const result = inspect(f);
  assert.equal(result.ok, true, JSON.stringify(result.summary));
  assert.equal(result.privateInventory.entries.length, 5);
  for (const [index, ref] of f.refs.entries()) {
    const entry = result.privateInventory.entries.find(entry => entry.channelRef === ref.channelRef);
    assert.deepEqual(Object.keys(entry).sort(), ["sourceRef", "channelRef", "edgeCredentialRef", "bindingDigest", "materialDigest", "accountId", "entitlementId", "requestId", "billingBinding"].sort());
    assert.equal(entry.sourceRef, SOURCES[index]);
    assert.equal(entry.materialDigest, `sha256:private-material-${index}`);
    for (const key of ["accountId", "entitlementId", "requestId", "edgeCredentialRef"]) assert.equal(entry[key], ref[key]);
    assert.deepEqual(entry.billingBinding, { plan: "yearly", validFrom: OLD, validUntil: UNTIL });
    assert.match(entry.bindingDigest, /^[a-f0-9]{64}$/);
  }
  assertSafe(result.summary);
  assert.deepEqual(rows(f), before);
});

for (const channelRefs of [[], [...CHANNELS, "channel-sgp-a-tuic"], ["channel-sgp-a-tuic"], ["channel-unknown"], [CHANNELS[0], CHANNELS[0]]]) {
  test("full inspector rejects unsupported or duplicate scope, particularly independent SGP TUIC", t => {
    const f = fixture(t), result = inspect(f, { channelRefs });
    assert.equal(result.ok, false);
    assert.equal(result.summary.errorCode, "baseline_scope_invalid");
    assertSafe(result.summary);
  });
}

test("old cursor namespaces, invalid old counters and accounting writes do not enter full binding identity", (t) => {
  const f = fixture(t), first = inspect(f);
  assert.equal(first.ok, true);
  const ref = f.refs[0];
  f.db.prepare("INSERT INTO platform_usage_counter_cursors VALUES (?,?,?,?,?,?,?,?)").run("unrelated-old-source", ref.channelRef, ref.edgeCredentialRef, 9223372036854775807n, 0, "not-a-timestamp", 7, "not-a-timestamp");
  f.store.recordUsageSample({ ...ref, id: "old-ledger-sample", sourceRef: "old-ledger-source", sampleDigest: "sha256:old-ledger",
    accountingMode: "delta", observedAt: OLD, intervalStartedAt: OLD, intervalEndedAt: OLD,
    uploadBytes: 123, downloadBytes: 456, totalBytes: 579, createdAt: OLD });
  const before = rows(f), second = inspect(f);
  assert.equal(second.ok, true, JSON.stringify(second.summary));
  assert.deepEqual(second.privateInventory, first.privateInventory);
  assert.deepEqual(rows(f), before);
  const old = inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS.slice(0, 2), nowFn, retentionPolicy: "preserve-ineligible", initializationPolicy: "verified-legacy-fresh-cursors" });
  assert.equal(old.ok, false);
  assert.equal(old.summary.errorCode, "baseline_source_invalid");
});

test("same-transaction read never queries legacy ledger rows and restores caller number mode", (t) => {
  const f = fixture(t), before = rows(f), id = inspect(f).privateInventory.databaseIdentityDigest;
  const prepare = f.db.prepare.bind(f.db);
  const proxy = new Proxy(f.db, { get(target, key) {
    if (key === "prepare") return sql => {
      assert.doesNotMatch(sql, /\bFROM\s+platform_usage_(?:counter_cursors|samples|rollups)\b/i);
      return prepare(sql);
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  f.db.transaction(() => {
    assert.equal(typeof prepare("SELECT 1 AS value").get().value, "number");
    const result = readFullMeteringBindings({ db: proxy, databaseIdentityDigest: id, channelRefs: CHANNELS, now: NOW });
    assert.equal(result.entries.length, 5);
    assert.equal(f.db.inTransaction, true);
    assert.equal(typeof prepare("SELECT 1 AS value").get().value, "number");
  })();
  assert.deepEqual(rows(f), before);
});

test("transaction API requires explicit DB identity and transaction, and closes native error details", (t) => {
  const f = fixture(t), id = inspect(f).privateInventory.databaseIdentityDigest;
  assert.throws(() => readFullMeteringBindings({ db: f.db, databaseIdentityDigest: id, channelRefs: CHANNELS, now: NOW }), { baselineCode: "baseline_transaction_required" });
  f.db.transaction(() => {
    assert.throws(() => readFullMeteringBindings({ db: f.db, databaseIdentityDigest: "invalid", channelRefs: CHANNELS, now: NOW }), { baselineCode: "baseline_database_invalid" });
    const proxy = new Proxy(f.db, { get(target, key) {
      if (key === "prepare") return () => { throw new Error("private-native-SQLITE-error"); };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    assert.throws(() => readFullMeteringBindings({ db: proxy, databaseIdentityDigest: id, channelRefs: CHANNELS, now: NOW }), error => {
      assert.equal(error.baselineCode, "baseline_operation_failed");
      assert.doesNotMatch(error.message, /private|SQLITE/);
      return true;
    });
    assert.equal(typeof f.db.prepare("SELECT 1 AS value").get().value, "number");
  })();
});

test("transaction API refuses a caller bigint-mode connection without changing its mode", (t) => {
  const f = fixture(t), id = inspect(f).privateInventory.databaseIdentityDigest;
  f.db.defaultSafeIntegers(true);
  f.db.transaction(() => {
    assert.throws(() => readFullMeteringBindings({ db: f.db, databaseIdentityDigest: id, channelRefs: CHANNELS, now: NOW }), { baselineCode: "baseline_connection_mode_invalid" });
    assert.equal(typeof f.db.prepare("SELECT 1 AS value").get().value, "bigint");
  })();
  f.db.defaultSafeIntegers(false);
});

test("full inspector reuses exact legacy resource verification, retained identities and opaque history", (t) => {
  const f = fixture(t);
  f.add(CHANNELS[2], { legacy: true });
  f.add(CHANNELS[3], { legacy: true, expired: true });
  f.add(CHANNELS[4], { opaque: true });
  const before = rows(f), result = inspect(f);
  assert.equal(result.ok, true, JSON.stringify(result.summary));
  assert.equal(result.privateInventory.entries.length, 6);
  assert.equal(result.privateInventory.retainedBindings.length, 1);
  assert.equal(result.privateInventory.opaqueHistory.length, 1);
  assert.deepEqual(Object.keys(result.privateInventory.opaqueHistory[0]).sort(), ["channelRef", "evidenceDigest", "requestRef"]);
  assert.equal(result.privateInventory.retainedBindings[0].sourceRef, SOURCES[3]);
  assert.equal(result.privateInventory.retainedBindings[0].materialDigest, "sha256:private-material-6");
  assert.equal(Object.hasOwn(result.privateInventory.retainedBindings[0], "cursor"), false);
  assertSafe(result.summary);
  assert.deepEqual(rows(f), before);
  f.db.prepare("UPDATE platform_issued_subscription_links SET tenant_ref='wrong-resource' WHERE request_id=?").run(f.refs[5].requestId);
  assert.equal(inspect(f).summary.errorCode, "baseline_binding_invalid");
});

for (const durableChannel of [CHANNELS[1], "channel-sgp-a-tuic"]) {
  test(`full inspector retains a legacy primary superseded by durable scope ${durableChannel}`, t => {
    const f = fixture(t), primary = f.add(CHANNELS[0], { legacy: true });
    f.db.prepare("INSERT INTO platform_portal_edge_credentials VALUES (?,?,?,?,?)")
      .run(primary.requestId, durableChannel, "private-durable-secondary", "sha256:private-secondary-material", 0);
    const before = rows(f), result = inspect(f);
    assert.equal(result.ok, true, JSON.stringify(result.summary));
    assert.equal(result.privateInventory.entries.some(entry => entry.edgeCredentialRef === primary.edgeCredentialRef), false);
    const retained = result.privateInventory.retainedBindings.find(entry => entry.edgeCredentialRef === primary.edgeCredentialRef);
    assert.deepEqual(retained.reasons, ["portal_durable_scope_supersedes_primary"]);
    assert.equal(retained.materialDigest, "sha256:private-material-5");
    assert.equal(result.privateInventory.entries.some(entry => entry.edgeCredentialRef === "private-durable-secondary"), durableChannel === CHANNELS[1]);
    assertSafe(result.summary);
    assert.deepEqual(rows(f), before);

    // Retention never bypasses ownership, resource or whole-DB resolver proof.
    f.db.prepare("UPDATE platform_issued_subscription_links SET tenant_ref='wrong-resource' WHERE request_id=?").run(primary.requestId);
    assert.equal(inspect(f).summary.errorCode, "baseline_binding_invalid");
  });
}

test("full inspector keeps primary durable mirrors eligible and unambiguous", t => {
  const f = fixture(t), primary = f.refs[0], before = rows(f), result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(result.privateInventory.entries.filter(entry => entry.edgeCredentialRef === primary.edgeCredentialRef).length, 1);
  assert.equal(result.privateInventory.retainedBindings.length, 0);
  assert.deepEqual(rows(f), before);
});

for (const [label, sql] of [
  ["missing material", "UPDATE platform_portal_edge_credentials SET edge_material_digest='' WHERE request_id='private-request-0'"],
  ["account mismatch", "UPDATE platform_portal_access_requests SET portal_user_ref='wrong-account' WHERE id='private-request-0'"],
  ["pending lifecycle", "UPDATE platform_portal_access_requests SET next_action='traffic_supply_resume_pending' WHERE id='private-request-0'"],
  ["resolver ambiguity outside scope", "UPDATE platform_portal_access_requests SET edge_credential_ref='private-credential-0' WHERE id='private-request-4'"]
]) test(`full inspector does not weaken v3 ${label} check`, t => {
  const f = fixture(t);
  f.db.exec(sql);
  const before = rows(f), result = inspect(f);
  assert.equal(result.ok, false);
  assertSafe(result.summary);
  assert.deepEqual(rows(f), before);
});

test("opaque history evidence changes remain visible, not converted to credential bindings", (t) => {
  const f = fixture(t), opaque = f.add(CHANNELS[0], { opaque: true });
  const first = inspect(f);
  f.db.prepare("UPDATE platform_issued_subscription_links SET artifact_ref='changed-opaque-resource' WHERE request_id=?").run(opaque.requestId);
  const second = inspect(f);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(second.privateInventory.opaqueHistoryDigest, first.privateInventory.opaqueHistoryDigest);
  assert.equal(second.privateInventory.entries.some(entry => entry.requestId === opaque.requestId), false);
  f.db.prepare("UPDATE platform_entitlements SET valid_until=? WHERE id=?").run(UNTIL, opaque.entitlementId);
  assert.equal(inspect(f).ok, false);
});

test("old v3 CLI scope is not expanded by the full-only inspector export", (t) => {
  const f = fixture(t);
  const old = inspectTrafficVlessBaseline({ dbPath: f.dbPath, channelRefs: CHANNELS, nowFn, retentionPolicy: "preserve-ineligible", initializationPolicy: "verified-legacy-fresh-cursors" });
  assert.equal(old.ok, false);
  assert.equal(old.summary.errorCode, "baseline_scope_invalid");
});
