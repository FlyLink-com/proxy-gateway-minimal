import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { createRuntimeState } from "../state.mjs";
import { runTrafficVlessRecovery } from "../../scripts/traffic-vless-recovery.mjs";
import { runTrafficUsageCollectOnce } from "../../scripts/traffic-usage-collect-once.mjs";
import { writeRecoveryJson } from "../../scripts/lib/traffic-recovery-protected-files.mjs";
import { loadTrafficVlessRecoveryScope } from "../../scripts/lib/traffic-vless-recovery-scope.mjs";

const CHANNELS = ["channel-vultr-a-vless-reality-tcp", "channel-sgp-a-vless-reality-tcp"];
const OLD = "2026-08-01T15:38:48.000Z";
const T0 = "2026-09-05T10:30:00.000Z";
const LATER = "2026-09-05T10:31:00.000Z";
const SOURCE = "xray_statsquery_user_traffic";

test("post-read inventory remains bound to the approved material when a writer changes it between snapshots", async (t) => {
  const f = fixture(t);
  const scoped = await scopedFixture(f);
  let clockReads = 0;
  const batch = f.refs.slice(0, 2).map((ref) => ({ channelRef: ref.channelRef, collected: {
    accountingMode: "cumulative", observations: [{ ...ref, uploadBytes: 50010, downloadBytes: 70020, observedAt: LATER }]
  } }));
  assert.throws(() => loadTrafficVlessRecoveryScope({ path: scoped.scopeFile, env: scoped.env, batch, nowFn() {
    if (++clockReads === 3) f.db.prepare("UPDATE platform_portal_edge_credentials SET edge_material_digest=? WHERE edge_credential_ref=?")
      .run("sha256:concurrent-synthetic-material", f.refs[0].edgeCredentialRef);
    return new Date(LATER);
  } }));
  assert.ok(clockReads >= 3);
  assert.equal(f.allRows("platform_usage_samples").length, 1);
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "traffic-vless-integration-"));
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
    const accountId = `synthetic-account-${index}`;
    const entitlementId = `synthetic-entitlement-${index}`;
    const requestId = `synthetic-request-${index}`;
    const edgeCredentialRef = `synthetic-credential-${index}`;
    store.createAccount({ id: accountId, ownerRef: `owner-${index}`, status: "active", createdAt: OLD, updatedAt: OLD });
    store.createEntitlement({ id: entitlementId, accountId, plan: "yearly", status: "active", validFrom: "2026-08-01T00:00:00.000Z", validUntil: "2027-08-01T00:00:00.000Z", trafficLimitBytes: 10000, createdAt: OLD, updatedAt: OLD });
    store.createIssuanceRequest({ id: requestId, accountId, entitlementId, approvalRef: `approval-${index}`, status: "issued", quantity: 1, nodeId: channelRef, purpose: "portal_auto_issuance", requestedByRef: "test-issuer", createdAt: OLD, updatedAt: OLD });
    store.linkIssuedSubscription({ id: `link-${index}`, requestId, tenantRef: `tenant-${index}`, artifactRef: `artifact-${index}`, status: "active", createdAt: OLD, updatedAt: OLD });
    store.upsertPortalAccessRequest({ id: requestId, portalUserRef: `owner-${index}`, plan: "yearly", clientTarget: "clash", durationDays: 365, quantity: 1, status: "delivered", nextAction: "user_can_use_access", noteProvided: false, priorTrialState: "not_applicable", submittedAt: OLD, updatedAt: OLD, validUntil: "2027-08-01T00:00:00.000Z", entitlementRef: entitlementId, accessGrantRef: `grant-${index}`, tenantId: `tenant-${index}`, artifactId: `artifact-${index}`, subscriptionUrl: "https://synthetic.invalid/sub/never-output", edgeChannelRef: channelRef, edgeCredentialRef, edgeMaterialDigest: `sha256:synthetic-material-${index}` });
    const input = { sourceRef: index === 2 ? "mihomo_connections_delta" : SOURCE, accountingMode: "cumulative", channelRef, edgeCredentialRef, accountId, entitlementId, requestId, observedAt: OLD, intervalStartedAt: OLD, intervalEndedAt: OLD, uploadBytes: 100, downloadBytes: 200, createdAt: OLD };
    store.recordCumulativeUsageSample(input);
    refs.push(input);
  }
  store.recordUsageSample({ ...refs[0], id: "historical-sample", sampleDigest: "sha256:historical-sample", uploadBytes: 40, downloadBytes: 60, totalBytes: 100 });
  const binary = join(directory, "synthetic-xray.bin");
  const binaryBytes = Buffer.from("synthetic-reader-never-executed");
  writeFileSync(binary, binaryBytes, { mode: 0o700 });
  const request = {
    schemaVersion: 1, dbPath, channelRefs: CHANNELS, validForSeconds: 300,
    sources: CHANNELS.map((channelRef, index) => ({ channelRef, xrayBinary: binary, binarySha256: createHash("sha256").update(binaryBytes).digest("hex"), statsServer: `127.0.0.1:${10085 + index}` }))
  };
  const requestFile = join(directory, "request.json");
  const planFile = join(directory, "plan.json");
  writeRecoveryJson(requestFile, request);
  const reads = [];
  const commandRunner = (command, args, options) => {
    reads.push({ command, args, options });
    const index = args.includes("--server=127.0.0.1:10085") ? 0 : 1;
    return { status: 0, stdout: JSON.stringify({ observedAt: "1970-01-01T00:00:00.000Z", stat: [
      { name: `user>>>${refs[index].edgeCredentialRef}>>>traffic>>>uplink`, value: "50000" },
      { name: `user>>>${refs[index].edgeCredentialRef}>>>traffic>>>downlink`, value: "70000" }
    ] }) };
  };
  const allRows = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  return { directory, dbPath, db, store, refs, request, requestFile, planFile, reads, commandRunner, allRows };
}

async function command(f, action, digest, options = {}) {
  let output = "";
  const argv = action === "prepare" ? [action, "--request", f.requestFile, "--plan", f.planFile]
    : [action, "--plan", f.planFile, "--expect-sha256", digest];
  const code = await runTrafficVlessRecovery({ argv, nowFn: () => new Date(T0), commandRunner: f.commandRunner,
    allowWindowsSynthetic: true, stdout: { write(value) { output += value; } }, ...options });
  const result = JSON.parse(output);
  for (const secret of [f.directory, "synthetic-account", "synthetic-entitlement", "synthetic-request", "synthetic-credential", "synthetic-material", "never-output"]) {
    assert.equal(output.includes(secret), false, "aggregate CLI output must exclude fixture private data");
  }
  assert.equal(result.productionAuthorized, false);
  return { code, result };
}

test("real CLI prepare/apply/verify updates only selected baselines and later accounting charges post-T0 bytes", async (t) => {
  const f = fixture(t);
  const beforeLedger = [f.allRows("platform_usage_samples"), f.allRows("platform_usage_rollups")];
  const beforeOther = f.store.getUsageCounterCursor(f.refs[2]);
  const beforeSchema = f.allRows("sqlite_schema");
  const prepared = await command(f, "prepare");
  assert.equal(prepared.code, 0, JSON.stringify(prepared.result));
  assert.equal(prepared.result.status, "plan_prepared");
  assert.equal(f.reads.length, 2);
  assert.equal(f.reads.every(({ args, options }) => !args.some((arg) => /reset|clear/.test(arg)) && options.shell === false), true);
  assert.deepEqual([f.allRows("platform_usage_samples"), f.allRows("platform_usage_rollups")], beforeLedger);
  assert.equal(f.store.getUsageCounterCursor(f.refs[0]).uploadBytes, 100);
  const digest = prepared.result.planFileSha256;
  const unapplied = await command(f, "verify", digest);
  assert.equal(unapplied.code, 2);
  const applied = await command(f, "apply", digest);
  assert.equal(applied.code, 0, JSON.stringify(applied.result));
  assert.equal(applied.result.status, "baseline_verified");
  assert.equal(existsSync(`${f.planFile}.receipt.json`), true);
  const verified = await command(f, "verify", digest);
  assert.equal(verified.code, 0);
  assert.equal(f.reads.length, 2, "apply and verify never run a second counter read");
  assert.deepEqual([f.allRows("platform_usage_samples"), f.allRows("platform_usage_rollups")], beforeLedger);
  assert.deepEqual(f.store.getUsageCounterCursor(f.refs[2]), beforeOther);
  assert.deepEqual(f.allRows("sqlite_schema"), beforeSchema);
  const accounting = createTrafficAccountingService({ controlStore: f.store, nowFn: () => LATER });
  for (const row of f.refs.slice(0, 2)) {
    const result = accounting.recordUsageObservation({ ...row, observedAt: LATER, intervalStartedAt: T0, intervalEndedAt: LATER, uploadBytes: 50010, downloadBytes: 70020 });
    assert.equal(result.ok, true);
    assert.equal(result.sample.totalBytes, 30);
    assert.equal(result.sample.intervalStartedAt, T0);
    assert.equal(result.quota.usedBytes, 30);
  }
  assert.deepEqual(f.store.getUsageCounterCursor(f.refs[2]), beforeOther);
});

test("after synthetic receipt loss verify stays readonly and reconcile recreates evidence without another apply", async (t) => {
  const f = fixture(t);
  const prepared = await command(f, "prepare");
  assert.equal(prepared.code, 0, JSON.stringify(prepared.result));
  const digest = prepared.result.planFileSha256;
  assert.equal((await command(f, "apply", digest)).code, 0);
  const receiptPath = `${f.planFile}.receipt.json`;
  const originalReceipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const before = f.allRows("platform_usage_counter_cursors");
  const ledger = [f.allRows("platform_usage_samples"), f.allRows("platform_usage_rollups")];
  rmSync(receiptPath);
  assert.equal((await command(f, "verify", digest)).code, 0);
  assert.equal(existsSync(receiptPath), false, "readonly verify cannot repair receipt");
  assert.deepEqual(f.allRows("platform_usage_counter_cursors"), before);
  assert.equal((await command(f, "reconcile", digest)).code, 0);
  assert.deepEqual(JSON.parse(readFileSync(receiptPath, "utf8")), originalReceipt);
  assert.deepEqual(f.allRows("platform_usage_counter_cursors"), before);
  assert.deepEqual([f.allRows("platform_usage_samples"), f.allRows("platform_usage_rollups")], ledger);
  assert.equal(f.reads.length, 2);
});

async function scopedFixture(f) {
  const prepared = await command(f, "prepare");
  assert.equal(prepared.code, 0, JSON.stringify(prepared.result));
  assert.equal((await command(f, "apply", prepared.result.planFileSha256)).code, 0);
  const configPath = join(f.directory, "proxy.json");
  writeFileSync(configPath, JSON.stringify({ servers: [...CHANNELS, "channel-japan-hy2", "channel-sgp-a-tuic"].map((name) => ({
    id: name, name, protocol: name.endsWith("hy2") ? "hysteria2" : name.endsWith("tuic") ? "tuic" : "vless",
    type: name.endsWith("hy2") ? "hysteria2" : name.endsWith("tuic") ? "tuic" : "vless",
    host: "synthetic.invalid", port: 443, uuid: "11111111-1111-4111-8111-111111111111", password: "synthetic", status: "online"
  })) }), { mode: 0o600 });
  const originalStatus = join(f.directory, "full-collector-status.json");
  writeRecoveryJson(originalStatus, { syntheticOldStatus: true });
  const scopeFile = join(f.directory, "scope.json");
  const statusFile = join(f.directory, "vless-recovery-status.json");
  const packet = { schemaVersion: 1, collectionScope: { channelRefs: CHANNELS, protocol: "vless", lifecycleMode: "record-only" },
    planFile: f.planFile, planFileSha256: prepared.result.planFileSha256, validUntil: "2026-09-05T11:30:00.000Z", statusFile };
  writeRecoveryJson(scopeFile, packet);
  const env = Object.freeze({ CONSOLE_TOKEN: "synthetic-console", SS_PASSWORD: "synthetic",
    SUBSCRIPTION_PROXY_CONFIG_PATH: configPath, SUBSCRIPTION_DB_PATH: join(f.directory, "subscriptions.sqlite"),
    SUBSCRIPTION_CONTROL_DB_PATH: f.dbPath, EDGE_CREDENTIAL_CHANNEL_REFS: [...CHANNELS, "channel-japan-hy2", "channel-sgp-a-tuic"].join(","),
    EDGE_USAGE_COLLECTOR_ENABLED: "true", EDGE_USAGE_COLLECTOR_STATUS_PATH: originalStatus,
    EDGE_XRAY_USAGE_SOURCES_JSON: JSON.stringify(f.request.sources.map(({ channelRef, xrayBinary, statsServer }) => ({ channelRefs: [channelRef], xrayBinary, statsServer }))),
    EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN: "invalid-excluded-reader",
    EDGE_MIHOMO_USAGE_SOURCES_JSON: JSON.stringify([{ controllerSecretPath: join(f.directory, "excluded-secret-must-not-read") }])
  });
  return { packet, scopeFile, statusFile, originalStatus, env };
}

async function scopedCollect(f, scoped, { now = LATER, delta = 1, env = scoped.env, afterRead, transformRows } = {}) {
  let state;
  let output = "";
  let errors = "";
  let factoryCalls = 0;
  let readerCalls = 0;
  let current = now;
  try {
    const code = await runTrafficUsageCollectOnce({
      argv: ["--collect", "--recovery-scope-file", scoped.scopeFile], cwd: new URL("../../", import.meta.url), env,
      nowFn: () => new Date(current), stdout: { write(value) { output += value; } }, stderr: { write(value) { errors += value; } },
      runtimeStateFactory(options) {
        factoryCalls += 1;
        state = createRuntimeState({ ...options, autoStartHttpProxy: false,
          trafficAccountingNowFn: () => current, usageCollectorNowFn: () => new Date(current),
          edgeUsageCommandRunner(command, args) {
            const index = args.includes("--server=127.0.0.1:10085") ? 0 : 1;
            readerCalls += 1;
            if (afterRead) current = afterRead(readerCalls, current);
            const stat = [
              { name: `user>>>${f.refs[index].edgeCredentialRef}>>>traffic>>>uplink`, value: 50000 + 10 * delta },
              { name: `user>>>${f.refs[index].edgeCredentialRef}>>>traffic>>>downlink`, value: 70000 + 20 * delta }
            ];
            return { exitCode: 0, stdout: JSON.stringify({ stat: transformRows ? transformRows(stat, index) : stat }) };
          }
        });
        return state;
      }
    });
    for (const secret of [f.directory, "synthetic-account", "synthetic-entitlement", "synthetic-request", "synthetic-credential", "synthetic-material", "never-output"]) assert.equal((output + errors).includes(secret), false);
    return { code, output, errors, factoryCalls, readerCalls };
  } finally { await state?.close(); }
}

test("real protected scope admits two VLESS collection cycles and preserves full status and independent sidecar", async (t) => {
  const f = fixture(t);
  const scoped = await scopedFixture(f);
  const envBefore = { ...scoped.env };
  const oldStatus = readFileSync(scoped.originalStatus);
  const otherCursor = f.store.getUsageCounterCursor(f.refs[2]);
  const first = await scopedCollect(f, scoped);
  assert.equal(first.code, 0, first.errors + first.output);
  assert.equal(first.factoryCalls, 1);
  assert.equal(first.readerCalls, 2);
  const firstStatus = JSON.parse(readFileSync(scoped.statusFile, "utf8"));
  assert.equal(firstStatus.type, "traffic_vless_recovery_status");
  assert.equal(firstStatus.coverage, "selected_channels_only");
  assert.equal(firstStatus.productionRecoveryComplete, false);
  assert.equal(firstStatus.summary.lifecycleDeferred, true);
  f.store.recordUsageSample({ ...f.refs[2], id: "sidecar-during-recovery", sampleDigest: "sha256:sidecar-during-recovery", uploadBytes: 20, downloadBytes: 30, totalBytes: 50 });
  const second = await scopedCollect(f, scoped, { now: "2026-09-05T10:32:00.000Z", delta: 2 });
  assert.equal(second.code, 0, second.errors + second.output);
  const selected = f.db.prepare("SELECT total_bytes, observed_at FROM platform_usage_samples WHERE source_ref=? AND observed_at>? ORDER BY observed_at").all(SOURCE, OLD);
  assert.equal(selected.length, 4);
  assert.equal(selected.every((row) => row.total_bytes === 30), true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM platform_usage_samples WHERE id='historical-sample'").get().count, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM platform_usage_samples WHERE id='sidecar-during-recovery'").get().count, 1);
  assert.deepEqual(f.store.getUsageCounterCursor(f.refs[2]), otherCursor);
  assert.deepEqual(readFileSync(scoped.originalStatus), oldStatus);
  assert.deepEqual(scoped.env, envBefore);
});

for (const invalid of ["missing whole credential", "extra unresolved user", "counter drop"]) {
  test(`real post-read baseline coverage rejects ${invalid} before recording any channel`, async (t) => {
    const f = fixture(t);
    const scoped = await scopedFixture(f);
    const ledger = f.allRows("platform_usage_samples");
    const cursors = f.allRows("platform_usage_counter_cursors");
    const result = await scopedCollect(f, scoped, { transformRows(rows, index) {
      if (index === 0) return rows;
      if (invalid === "missing whole credential") return [];
      if (invalid === "extra unresolved user") return [...rows,
        { name: "user>>>synthetic-unresolved>>>traffic>>>uplink", value: 1 },
        { name: "user>>>synthetic-unresolved>>>traffic>>>downlink", value: 2 }
      ];
      return [{ ...rows[0], value: 49999 }, rows[1]];
    } });
    assert.equal(result.code, 1, result.errors + result.output);
    assert.equal(result.factoryCalls, 1);
    assert.equal(result.readerCalls, 2);
    assert.deepEqual(f.allRows("platform_usage_samples"), ledger);
    assert.deepEqual(f.allRows("platform_usage_counter_cursors"), cursors);
  });
}

for (const condition of ["missing receipt", "source mismatch", "changed binary", "wrong status path", "expired packet", "stale cursor"]) {
  test(`real scoped CLI refuses ${condition} before runtime initialization`, async (t) => {
    const f = fixture(t);
    const scoped = await scopedFixture(f);
    const ledger = f.allRows("platform_usage_samples");
    const cursors = f.allRows("platform_usage_counter_cursors");
    let env = scoped.env;
    let now = LATER;
    if (condition === "missing receipt") rmSync(`${f.planFile}.receipt.json`);
    if (condition === "source mismatch") env = { ...scoped.env, EDGE_XRAY_USAGE_SOURCES_JSON: JSON.stringify(f.request.sources.map(({ channelRef, xrayBinary }) => ({ channelRefs: [channelRef], xrayBinary, statsServer: "127.0.0.1:19999" }))) };
    if (condition === "changed binary") writeFileSync(f.request.sources[0].xrayBinary, "different-synthetic-binary");
    if (condition === "wrong status path") writeRecoveryJson(scoped.scopeFile, { ...scoped.packet, statusFile: scoped.originalStatus }, { replace: true });
    if (condition === "expired packet") now = scoped.packet.validUntil;
    if (condition === "stale cursor") now = "2026-09-05T10:45:00.001Z";
    const result = await scopedCollect(f, scoped, { now, env });
    assert.equal(result.code, 2, result.errors + result.output);
    assert.equal(result.factoryCalls, 0);
    assert.equal(result.readerCalls, 0);
    assert.deepEqual(f.allRows("platform_usage_samples"), ledger);
    assert.deepEqual(f.allRows("platform_usage_counter_cursors"), cursors);
    assert.equal(existsSync(scoped.statusFile), false);
  });
}

test("real post-read admission rejects a freshness boundary crossed during readers with zero writes", async (t) => {
  const f = fixture(t);
  const scoped = await scopedFixture(f);
  const ledger = f.allRows("platform_usage_samples");
  const cursors = f.allRows("platform_usage_counter_cursors");
  const result = await scopedCollect(f, scoped, { afterRead: () => "2026-09-05T10:45:00.001Z" });
  assert.equal(result.code, 1, result.errors + result.output);
  assert.equal(result.factoryCalls, 1);
  assert.equal(result.readerCalls, 2);
  assert.deepEqual(f.allRows("platform_usage_samples"), ledger);
  assert.deepEqual(f.allRows("platform_usage_counter_cursors"), cursors);
  const status = JSON.parse(readFileSync(scoped.statusFile, "utf8"));
  assert.equal(status.summary.ok, false);
  assert.equal(status.productionRecoveryComplete, false);
});

for (const change of ["source binary", "scope packet"]) test(`real post-read admission rejects ${change} changes with zero writes`, async (t) => {
  const f = fixture(t);
  const scoped = await scopedFixture(f);
  const ledger = f.allRows("platform_usage_samples");
  const cursors = f.allRows("platform_usage_counter_cursors");
  const result = await scopedCollect(f, scoped, { afterRead: (count, current) => {
    if (count === 1) {
      if (change === "source binary") writeFileSync(f.request.sources[0].xrayBinary, "changed-after-source-admission");
      else writeRecoveryJson(scoped.scopeFile, { ...scoped.packet, validUntil: "2026-09-05T11:00:00.000Z" }, { replace: true });
    }
    return current;
  } });
  assert.equal(result.code, 1, result.errors + result.output);
  assert.equal(result.factoryCalls, 1);
  assert.equal(result.readerCalls, 2);
  assert.deepEqual(f.allRows("platform_usage_samples"), ledger);
  assert.deepEqual(f.allRows("platform_usage_counter_cursors"), cursors);
});
