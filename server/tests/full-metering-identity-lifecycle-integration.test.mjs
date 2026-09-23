import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { inspectFullMeteringBindings, readFullMeteringBindings } from "../../scripts/lib/traffic-vless-recovery-baseline.mjs";
import { createFullMeteringSourceDriver } from "../../scripts/lib/full-metering-source-driver.mjs";
import { readFullMeteringLocalSource } from "../../scripts/lib/full-metering-local-source.mjs";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { createFullMeteringSampleWriter } from "../../scripts/lib/full-metering-sample-writer.mjs";

// Entirely synthetic: real SQLite binding inspection and production reader/parser
// composition, but every process and network operation is injected. This is not
// evidence about which inconsistent state is present on a production node.
const T0 = "2026-09-08T06:00:00.000Z";
const OLD = "2026-08-01T00:00:00.000Z";
const UNTIL = "2027-08-01T00:00:00.000Z";
const CHANNELS = FULL_METERING_CHANNELS.map(source => source.channelRef);
const UNITS = { xray: "xray-vless-reality.service", hy2: "hysteria2.service", tuic: "mihomo-tuic.service" };
const sha = value => createHash("sha256").update(value).digest("hex");
const resourceRef = (prefix, value) => `${prefix}ref_${sha(value).slice(0, 16)}`;
const materialDigest = material => `sha256:${sha(`${material.uuid}\0${material.password}`)}`;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "full-metering-identity-integration-"));
  const dbPath = join(directory, "synthetic.sqlite");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  const db = new Database(dbPath);
  t.after(() => { db.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  const records = [], runtime = [], samples = new Map(), calls = [];
  let now = T0, bytes = 100, sequence = 0;
  const sources = FULL_METERING_CHANNELS.map((source, index) => {
    const kind = index < 2 ? "xray" : index < 4 ? "hy2" : "tuic";
    return { channelRef: source.channelRef, kind, host: [1, 3].includes(index) ? "sgp" : "local",
      runtimeUnit: UNITS[kind], configPath: `/etc/synthetic/${index}/config` };
  });
  function add(channelRef, { expired = false, bound = true, material = true, legacy = false } = {}) {
    const n = sequence++;
    const record = { credentialRef: `synthetic-credential-${n}`,
      material: { uuid: `${String(n + 1).padStart(8, "0")}-1111-4111-8111-111111111111`, password: `synthetic-password-${n}` } };
    record.materialDigest = materialDigest(record.material);
    const ids = { accountId: `synthetic-account-${n}`, entitlementId: `synthetic-entitlement-${n}`, requestId: `synthetic-request-${n}` };
    if (bound) {
      const tenant = `synthetic-tenant-${n}`, artifact = `synthetic-artifact-${n}`;
      store.createAccount({ id: ids.accountId, ownerRef: `synthetic-owner-${n}`, status: "active", createdAt: OLD, updatedAt: OLD });
      store.createEntitlement({ id: ids.entitlementId, accountId: ids.accountId, plan: "yearly", status: expired ? "expired" : "active",
        validFrom: OLD, validUntil: UNTIL, trafficLimitBytes: 1000000, createdAt: OLD, updatedAt: OLD });
      store.createIssuanceRequest({ id: ids.requestId, accountId: ids.accountId, entitlementId: ids.entitlementId, approvalRef: `synthetic-approval-${n}`,
        status: "issued", quantity: 1, nodeId: channelRef, purpose: "portal_auto_issuance", requestedByRef: "synthetic-issuer", createdAt: OLD, updatedAt: OLD });
      store.linkIssuedSubscription({ id: `synthetic-link-${n}`, requestId: ids.requestId,
        tenantRef: resourceRef("tenant", tenant), artifactRef: resourceRef("artifact", artifact), status: "active", createdAt: OLD, updatedAt: OLD });
      store.upsertPortalAccessRequest({ id: ids.requestId, portalUserRef: ids.accountId, plan: "yearly", clientTarget: "clash", durationDays: 365, quantity: 1,
        status: "delivered", nextAction: "user_can_use_access", noteProvided: false, priorTrialState: "not_applicable", submittedAt: OLD, updatedAt: OLD,
        validUntil: UNTIL, entitlementRef: ids.entitlementId, accessGrantRef: `synthetic-grant-${n}`, tenantId: tenant, artifactId: artifact,
        subscriptionUrl: "https://synthetic.example.invalid/sub/not-a-real-subscription", edgeChannelRef: channelRef,
        edgeCredentialRef: record.credentialRef, edgeMaterialDigest: record.materialDigest });
      if (legacy) db.prepare("DELETE FROM platform_portal_edge_credentials WHERE request_id=?").run(ids.requestId);
    }
    if (material) records.push(record);
    const identity = { ...ids, channelRef, record };
    runtime.push(identity);
    return identity;
  }
  CHANNELS.forEach(channel => add(channel));
  const readInventory = () => {
    const result = inspectFullMeteringBindings({ dbPath, channelRefs: CHANNELS, nowFn: () => now });
    assert.equal(result.ok, true, `synthetic inventory failure: ${result.summary.errorCode}`);
    return result.privateInventory;
  };
  const readSources = createFullMeteringSourceDriver({ sources, readMaterial: () => ({ records }), readSource: async source => {
    const identities = runtime.filter(identity => identity.channelRef === source.channelRef);
    const user = record => source.kind === "tuic" ? record.material.uuid : record.credentialRef;
    const endpoint = "127.0.0.1:12345", binary = "/opt/synthetic/runtime";
    const config = source.kind === "xray" ? JSON.stringify({ api: { tag: "api", services: ["StatsService"] },
      policy: { levels: { 0: { statsUserUplink: true, statsUserDownlink: true } } }, inbounds: [
        { tag: "client", protocol: "vless", settings: { clients: identities.map(({ record }) => ({ email: user(record), id: record.material.uuid })) } },
        { tag: "api", listen: "127.0.0.1", port: 12345, protocol: "dokodemo-door" }
      ] }) : source.kind === "hy2" ? `auth:\n  type: userpass\n  userpass:\n${identities.map(({ record }) => `    ${user(record)}: "${record.material.password}"`).join("\n")}\ntrafficStats:\n  listen: "${endpoint}"\n`
      : `external-controller: "${endpoint}"\nlisteners:\n  - name: "synthetic"\n    type: tuic\n    users:\n${identities.map(({ record }) => `      "${user(record)}": "${record.material.password}"`).join("\n")}\n`;
    return readFullMeteringLocalSource({ ...source, nowFn: () => new Date(now),
      fetchFn: async (url, options) => {
        calls.push({ kind: source.kind, operation: "fetch" });
        assert.equal(url, `http://${endpoint}/${source.kind === "hy2" ? "traffic" : "connections"}`);
        assert.equal(options.method, "GET");
        return new Response(JSON.stringify(source.kind === "hy2"
          ? Object.fromEntries(identities.map(({ record }) => [user(record), { tx: bytes, rx: bytes }]))
          : { connections: identities.map(({ record }) => ({ id: `synthetic-connection-${user(record)}`, metadata: { inboundUser: user(record) }, upload: bytes, download: bytes })) }),
        { status: 200, headers: { "Content-Type": "application/json" } });
      },
      commandRunner: (command, args) => {
        calls.push({ kind: source.kind, operation: command });
        const ok = stdout => ({ exitCode: 0, stdout });
        if (command === "/usr/bin/systemctl") return ok("ActiveState=active\nSubState=running\nMainPID=101\nNRestarts=0\nExecMainStartTimestamp=Tue 2026-09-08 00:00:01.000000 UTC\n");
        if (command === "/usr/bin/readlink") return ok(`${binary}\n`);
        if (command === "/usr/bin/sha256sum") return ok(`${"a".repeat(64)}  ${binary}\n`);
        if (command === "/usr/bin/stat") return ok(`8180|${Buffer.byteLength(config)}|2026-09-08 00:00:00.000000000 +0000|2026-09-08 00:00:00.000000000 +0000|1|123\n`);
        if (command === "/usr/bin/ss") return ok(`LISTEN 0 4096 ${endpoint} 0.0.0.0:* users:(("synthetic",pid=101,fd=3))\n`);
        if (command === binary) return ok(JSON.stringify({ stat: identities.flatMap(({ record }) => [
          { name: `user>>>${user(record)}>>>traffic>>>uplink`, value: bytes },
          { name: `user>>>${user(record)}>>>traffic>>>downlink`, value: bytes }
        ]) }));
        if (command === "/usr/bin/cat") {
          const target = args.at(-1);
          if (target === "/proc/sys/kernel/random/boot_id") return ok("22222222-2222-4222-8222-222222222222\n");
          if (target === "/proc/101/cmdline") return ok(`${binary}\0-c\0${source.configPath}\0`);
          if (target === "/proc/101/stat") return ok(`101 (synthetic) S ${Array(18).fill("0").join(" ")} 123456 0\n`);
          if (target === source.configPath) return ok(config);
        }
        assert.fail("unexpected synthetic process invocation");
      }
    });
  } });
  const context = { scopeDigest: "c".repeat(64), databaseIdentityDigest: "d".repeat(64) };
  const journalDirectory = join(directory, "journal");
  const sampleStore = createSqliteSubscriptionControlStore({ database: db, initializeSchema: false });
  const writeSamples = createFullMeteringSampleWriter({ database: db, controlStore: sampleStore,
    readBindings: () => readFullMeteringBindings({ db, databaseIdentityDigest: context.databaseIdentityDigest, channelRefs: CHANNELS, now }) });
  const options = { directory: journalDirectory, context, activationId: "synthetic-lifecycle",
    readInventory, readSources, nowFn: () => now, applySamples: batch => {
      const result = writeSamples(batch);
      for (const sample of batch) samples.set(sample.record.id, sample);
      return result;
    } };
  const run = (mode, extra = {}) => runFullMeteringCollection({ ...options, mode, ...extra });
  return { db, add, records, runtime, samples, calls, readInventory, readSources, run,
    checkpoint: () => readFullMeteringJournal({ directory: journalDirectory, context }),
    hasPending: () => existsSync(join(journalDirectory, "pending.json")),
    ledger: () => db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_bytes), 0) AS bytes FROM platform_usage_samples").get(),
    set: (time, value) => { now = time; bytes = value; } };
}

test("synthetic SQLite to five real source adapters: active identities collect without historical debit", async t => {
  const f = fixture(t);
  const initialized = await f.run("initialize");
  assert.equal(initialized.eligibleCount, 5);
  assert.equal(initialized.recordedBytes, 0);
  f.set("2026-09-08T06:01:00.000Z", 105);
  const collected = await f.run("collect");
  assert.equal(collected.channelCount, 5);
  assert.equal(collected.recordedBytes, 50);
  assert.equal(f.samples.size, 5);
});

for (const [kind, index] of [["xray", 0], ["hy2", 2], ["tuic", 4]]) {
  test(`synthetic ${kind}: retained identity without material reproduces the production error before its counter read`, async t => {
    const f = fixture(t);
    f.add(CHANNELS[index], { expired: true, material: false });
    const inventory = f.readInventory();
    assert.equal(inventory.entries.length, 5);
    assert.equal(inventory.retainedBindings.length, 1);
    await assert.rejects(f.readSources(inventory), { code: "full_metering_local_identity_mapping_invalid" });
    assert.equal(f.calls.some(call => call.kind === kind && ["fetch", "/opt/synthetic/runtime"].includes(call.operation)), false);
    assert.equal(f.samples.size, 0);
  });

  test(`synthetic ${kind}: runtime identity absent from business bindings is safely rejected even with material`, async t => {
    const f = fixture(t);
    f.add(CHANNELS[index], { bound: false });
    const inventory = f.readInventory();
    assert.equal(inventory.entries.length, 5);
    assert.equal(inventory.retainedBindings.length, 0);
    await assert.rejects(f.readSources(inventory), { code: "full_metering_local_identity_mapping_invalid" });
    assert.equal(f.samples.size, 0);
  });

  test(`synthetic ${kind}: expired retained identity with verified material remains readable but is not charged`, async t => {
    const f = fixture(t);
    const expired = f.add(CHANNELS[index], { expired: true });
    assert.equal(f.readInventory().retainedBindings.length, 1);
    await f.run("initialize");
    f.set("2026-09-08T06:01:00.000Z", 105);
    const collected = await f.run("collect");
    assert.equal(collected.eligibleCount, 5);
    assert.equal(collected.recordedBytes, 50);
    assert.equal([...f.samples.values()].some(sample => sample.record.edgeCredentialRef === expired.record.credentialRef), false);
  });

  test(`synthetic ${kind}: material-less retained identity removed from runtime does not stop valid collection`, async t => {
    const f = fixture(t);
    const retired = f.add(CHANNELS[index], { expired: true, material: false });
    f.runtime.splice(f.runtime.indexOf(retired), 1);
    const result = await f.run("initialize");
    assert.equal(result.eligibleCount, 5);
    assert.equal(result.recordedBytes, 0);
  });

  test(`synthetic ${kind}: active-to-expired transition preserves old checkpoint without charging retained runtime`, async t => {
    const f = fixture(t);
    const expiring = f.add(CHANNELS[index]);
    await f.run("initialize");
    f.db.prepare("UPDATE platform_entitlements SET status='expired' WHERE id=?").run(expiring.entitlementId);
    f.set("2026-09-08T06:01:00.000Z", 105);
    const collected = await f.run("collect");
    assert.equal(collected.recordedBytes, 50);
    assert.equal(collected.eligibleCount, 5);
    assert.equal(f.checkpoint().sequence, 1);
    assert.equal([...f.samples.values()].some(sample => sample.record.edgeCredentialRef === expiring.record.credentialRef), false);
  });
}

test("synthetic active missing material is a different refusal, not the observed local mapping error", async t => {
  const f = fixture(t);
  f.records.pop();
  await assert.rejects(f.readSources(f.readInventory()), { code: "full_metering_material_binding_changed" });
});

test("synthetic legacy primary binding remains compatible with existing checkpoint and new identities", async t => {
  const f = fixture(t);
  f.add(CHANNELS[0], { legacy: true });
  await f.run("initialize");
  const baseline = f.checkpoint();
  assert.equal(baseline.sequence, 0);
  f.add(CHANNELS[2]);
  f.set("2026-09-08T06:01:00.000Z", 105);
  const first = await f.run("collect");
  assert.equal(first.eligibleCount, 7);
  assert.equal(first.recordedBytes, 60); // Existing six identities only.
  assert.equal(f.checkpoint().sequence, 1);
  f.set("2026-09-08T06:02:00.000Z", 110);
  const next = await f.run("collect");
  assert.equal(next.recordedBytes, 70);
  assert.equal(f.checkpoint().sequence, 2);
  assert.equal(f.checkpoint().startedAt, baseline.startedAt);
});

test("synthetic old checkpoint without pending intent survives an unmapped runtime failure without partial debit or reset", async t => {
  const f = fixture(t);
  await f.run("initialize");
  const before = f.checkpoint();
  f.add(CHANNELS[4], { bound: false });
  f.set("2026-09-08T06:01:00.000Z", 105);
  assert.equal(f.hasPending(), false);
  await assert.rejects(f.run("collect"), { code: "full_metering_local_identity_mapping_invalid" });
  assert.deepEqual(f.checkpoint(), before);
  assert.equal(f.samples.size, 0);
  assert.deepEqual(f.ledger(), { count: 0, bytes: 0 });
});

for (const stage of ["pending_durable", "samples_committed"]) {
  test(`synthetic ${stage} intent recovers before a later runtime mapping refusal, without double debit`, async t => {
    const f = fixture(t);
    await f.run("initialize");
    f.set("2026-09-08T06:01:00.000Z", 105);
    await assert.rejects(f.run("collect", { onStage(value) {
      if (value === stage) throw new Error("synthetic-interruption");
    } }), /synthetic-interruption/);
    assert.equal(f.hasPending(), true);
    assert.deepEqual(f.ledger(), stage === "pending_durable" ? { count: 0, bytes: 0 } : { count: 5, bytes: 50 });
    assert.equal(f.checkpoint().sequence, 0);

    f.add(CHANNELS[4], { bound: false });
    f.set("2026-09-08T06:02:00.000Z", 110);
    await assert.rejects(f.run("collect"), { code: "full_metering_local_identity_mapping_invalid" });
    // collect is not a read-only diagnostic: a valid older intent is committed
    // first, even though the fresh source read subsequently refuses a new user.
    assert.deepEqual(f.ledger(), { count: 5, bytes: 50 });
    assert.equal(f.hasPending(), false);
    assert.equal(f.checkpoint().sequence, 1);
    const recovered = f.checkpoint();
    await assert.rejects(f.run("collect"), { code: "full_metering_local_identity_mapping_invalid" });
    assert.deepEqual(f.ledger(), { count: 5, bytes: 50 });
    assert.deepEqual(f.checkpoint(), recovered);
  });
}
