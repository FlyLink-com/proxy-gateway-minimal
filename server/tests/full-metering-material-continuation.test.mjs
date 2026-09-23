import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { fullMeteringBindingIdentity } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { fullMeteringDigest, readFullMeteringJournal, archiveFullMeteringMaterialCheckpoint } from "../../scripts/lib/full-metering-journal.mjs";
import { materialContinuationHistory } from "../../scripts/lib/full-metering-material-continuation.mjs";
import { parseFullMeteringCommand } from "../../scripts/lib/full-metering-command.mjs";

const start = "2026-09-01T00:00:00.000Z", t1 = "2026-09-01T00:01:00.000Z", t2 = "2026-09-01T00:02:00.000Z", t3 = "2026-09-01T00:03:00.000Z";
const context = { databaseIdentityDigest: "d".repeat(64), scopeDigest: "e".repeat(64) };
const activationId = "synthetic-material-continuation";
function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "material-continuation-")), directory = join(parent, "journal");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const bindings = FULL_METERING_CHANNELS.flatMap((source, index) => [0, 1].map(n => ({ ...source,
    edgeCredentialRef: `synthetic-${index}-${n}`, accountId: `account-${index}-${n}`, entitlementId: `entitlement-${index}-${n}`,
    requestId: `request-${index}-${n}`, materialDigest: `sha256:${"a".repeat(64)}`,
    billingBinding: { plan: "yearly", validFrom: start, validUntil: "2027-09-01T00:00:00.000Z" } })));
  const f = { directory, now: start, value: 1000, bindings, writes: [], sources: 0,
    options: { directory, context, activationId, nowFn: () => f.now,
      readInventory: () => ({ entries: structuredClone(f.bindings), retainedBindings: [] }),
      readSources: async () => { f.sources++; return FULL_METERING_CHANNELS.map((source, index) => ({ ...source,
        generation: "f".repeat(64), observedAt: f.now,
        observations: [0, 1].map(n => ({ edgeCredentialRef: `synthetic-${index}-${n}`, uploadBytes: f.value, downloadBytes: f.value,
          ...(source.mode === "connections" ? { connectionId: `connection-${n}` } : {}) })) })); },
      applySamples: samples => { f.writes.push(structuredClone(samples)); }
    }, checkpoint: () => readFullMeteringJournal({ directory, context }),
    async seed() { await runFullMeteringCollection({ ...f.options, mode: "initialize" });
      f.now = t1; f.value = 1010; await runFullMeteringCollection({ ...f.options, mode: "collect" }); },
    rotate() { const before = f.checkpoint(); f.now = t2; f.value = 1020;
      const changes = f.bindings.filter((_, i) => i % 2 === 0).map(binding => {
        const previousIdentityDigest = fullMeteringDigest(fullMeteringBindingIdentity(binding));
        binding.materialDigest = `sha256:${"b".repeat(64)}`;
        return { channelRef: binding.channelRef, edgeCredentialRef: binding.edgeCredentialRef, previousIdentityDigest,
          currentIdentityDigest: fullMeteringDigest(fullMeteringBindingIdentity(binding)) };
      });
      return { version: 1, activationId, context, previousSequence: before.sequence, previousCheckpointDigest: fullMeteringDigest(before),
        notBefore: t1, expiresAt: "2026-09-01T01:00:00.000Z", changes };
    }
  }; return f;
}

test("ordinary collect still refuses changed material and unchanged approval is never implicit", async t => {
  const f = fixture(t); await f.seed(); const approval = f.rotate(), original = readFileSync(join(f.directory, "checkpoint.json"));
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect" }), /full_metering_binding_changed/);
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect", materialApproval: approval }), /full_metering_material_approval_forbidden/);
  assert.deepEqual(readFileSync(join(f.directory, "checkpoint.json")), original);
});

test("explicit material continuation preserves totals, baseline-only affected refs, unaffected increments and subsequent history", async t => {
  const f = fixture(t); await f.seed(); const before = f.checkpoint(), approval = f.rotate();
  const summary = await runFullMeteringCollection({ ...f.options, mode: "continue-material", materialApproval: approval });
  assert.equal(summary.sampleCount, 5); assert.equal(summary.recordedBytes, 100);
  assert.equal(summary.materialContinuation.identityCount, 5); assert.equal(summary.materialContinuation.unassignedBytes, null);
  const after = f.checkpoint(); assert.equal(after.sequence, before.sequence + 1);
  assert.equal(after.materialContinuations.length, 1);
  assert.equal(after.materialContinuations[0].previousCheckpointDigest, fullMeteringDigest(before));
  assert.equal(existsSync(join(f.directory, after.materialContinuations[0].archiveName)), true);
  for (let i = 0; i < 5; i++) assert.deepEqual(after.sources[i].counterState.entries[0].usage, before.sources[i].counterState.entries[0].usage);
  const bytes = readFileSync(join(f.directory, "checkpoint.json"));
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "continue-material", materialApproval: approval }), /material_approval_stale/);
  assert.deepEqual(readFileSync(join(f.directory, "checkpoint.json")), bytes);
  f.now = t3; f.value += 3;
  const next = await runFullMeteringCollection({ ...f.options, mode: "collect" });
  assert.equal(next.sampleCount, 10); assert.equal(next.recordedBytes, 60);
  assert.deepEqual(f.checkpoint().materialContinuations, after.materialContinuations);
});

for (const name of ["missing", "expired", "wrong_context", "wrong_checkpoint", "partial", "duplicate", "ownership", "period", "source", "unchanged"]) {
  test(`material approval rejects ${name} without durable writes`, async t => {
    const f = fixture(t); await f.seed(); let approval = f.rotate();
    if (name === "missing") approval = null;
    if (name === "expired") approval.expiresAt = t1;
    if (name === "wrong_context") approval = { ...approval, context: { ...context, scopeDigest: "0".repeat(64) } };
    if (name === "wrong_checkpoint") approval.previousCheckpointDigest = "0".repeat(64);
    if (name === "partial") approval.changes.pop();
    if (name === "duplicate") approval.changes.push(approval.changes[0]);
    if (name === "ownership") f.bindings[0].accountId = "another-account";
    if (name === "period") f.bindings[0].billingBinding.validUntil = "2027-08-01T00:00:00.000Z";
    if (name === "source") f.bindings[0].sourceRef = "other-source";
    if (name === "unchanged") f.bindings[0].materialDigest = `sha256:${"a".repeat(64)}`;
    if (["ownership", "period", "source", "unchanged"].includes(name)) approval.changes[0].currentIdentityDigest = fullMeteringDigest(fullMeteringBindingIdentity(f.bindings[0]));
    const before = readFileSync(join(f.directory, "checkpoint.json")), count = f.writes.length;
    await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "continue-material", materialApproval: approval }), /full_metering_(material|binding)/);
    assert.deepEqual(readFileSync(join(f.directory, "checkpoint.json")), before); assert.equal(f.writes.length, count);
    assert.equal(existsSync(join(f.directory, "pending.json")), false);
  });
}

test("CLI continuation requires an additional exact protected approval file and its hash", () => {
  const input = ["--continue-material", "--config", "/private/config.json", "--config-sha256", "a".repeat(64),
    "--material-approval", "/private/approval.json", "--material-approval-sha256", "b".repeat(64)];
  assert.deepEqual(parseFullMeteringCommand(input), { mode: "continue-material", configPath: "/private/config.json", configSha256: "a".repeat(64),
    materialApprovalPath: "/private/approval.json", materialApprovalSha256: "b".repeat(64) });
  for (const args of [input.slice(0, 5), ["--collect", ...input.slice(1)], [...input, "--retry"], input.map(v => v === "/private/approval.json" ? "relative" : v)])
    assert.throws(() => parseFullMeteringCommand(args), /command_invalid/);
});

test("a new continuation never recovers or deletes an existing pending intent", async t => {
  const f = fixture(t); await f.seed(); const approval = f.rotate(), checkpoint = f.checkpoint();
  const pending = join(f.directory, "pending.json"); writeFileSync(pending, "not-an-authorized-intent", { mode: 0o600 });
  const count = f.writes.length, sources = f.sources;
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "continue-material", materialApproval: approval }), /pending_recovery_required/);
  assert.equal(readFileSync(pending, "utf8"), "not-an-authorized-intent");
  assert.deepEqual(f.checkpoint(), checkpoint); assert.equal(f.writes.length, count); assert.equal(f.sources, sources);
});

for (const name of ["source_read_failure", "post_read_material_drift", "precommit_billing_drift", "precommit_expiry"]) {
  test(`continuation ${name} cannot leave an archive, intent or charge`, async t => {
    const f = fixture(t); await f.seed(); const approval = f.rotate(), checkpoint = f.checkpoint();
    let reads = 0, times = 0; const count = f.writes.length;
    const options = { ...f.options,
      nowFn: () => name === "precommit_expiry" && ++times === 3 ? approval.expiresAt : f.now,
      readInventory: () => {
        const result = f.options.readInventory(); reads++;
        if (name === "post_read_material_drift" && reads === 2) result.entries[0].materialDigest = `sha256:${"c".repeat(64)}`;
        if (name === "precommit_billing_drift" && reads === 3) result.entries[0].billingBinding.validUntil = "2027-08-01T00:00:00.000Z";
        return result;
      },
      ...(name === "source_read_failure" ? { readSources: async () => { throw new Error("synthetic-source-failure"); } } : {})
    };
    await assert.rejects(runFullMeteringCollection({ ...options, mode: "continue-material", materialApproval: approval }));
    assert.deepEqual(f.checkpoint(), checkpoint); assert.equal(f.writes.length, count);
    assert.deepEqual(readdirSync(f.directory), ["checkpoint.json"]);
  });
}

test("private archive is immutable and a corrupt orphan is never replaced", async t => {
  const f = fixture(t); await f.seed(); const before = f.checkpoint(), approval = f.rotate();
  const name = archiveFullMeteringMaterialCheckpoint({ directory: f.directory, context, checkpoint: before });
  const file = join(f.directory, name), bytes = readFileSync(file);
  assert.equal(archiveFullMeteringMaterialCheckpoint({ directory: f.directory, context, checkpoint: before }), name);
  assert.deepEqual(readFileSync(file), bytes);
  writeFileSync(file, "broken-private-archive", { mode: 0o600 });
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "continue-material", materialApproval: approval }), /full_metering_json_invalid/);
  assert.equal(readFileSync(file, "utf8"), "broken-private-archive"); assert.deepEqual(f.checkpoint(), before);
  assert.equal(existsSync(join(f.directory, "pending.json")), false);
});

test("approval evidence persists privately while the public summary has no identity or proof payload", async t => {
  const f = fixture(t); await f.seed(); const approval = f.rotate();
  const summary = await runFullMeteringCollection({ ...f.options, mode: "continue-material", materialApproval: approval });
  const checkpoint = f.checkpoint(), record = checkpoint.materialContinuations[0];
  assert.deepEqual(record.approval, approval); assert.equal(fullMeteringDigest(record.approval), record.approvalDigest);
  for (const value of [approval.previousCheckpointDigest, "synthetic-0-0", "account-0-0", "previousIdentityDigest", "materialDigest"])
    assert.equal(JSON.stringify(summary).includes(value), false);
  for (const corrupt of [r => { r.approval.changes[0].currentIdentityDigest = "9".repeat(64); },
    r => { r.completedAt = r.approval.expiresAt; }, r => { r.identityCount = 1; }, r => { r.archiveName = "../unsafe"; }]) {
    const copy = structuredClone(checkpoint); corrupt(copy.materialContinuations[0]);
    assert.throws(() => materialContinuationHistory(copy), /material_history_invalid/);
  }
});
