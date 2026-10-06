import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { fullMeteringBindingIdentity } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { fullMeteringDigest, readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { parseFullMeteringCommand } from "../../scripts/lib/full-metering-command.mjs";

const start = "2026-09-01T00:00:00.000Z", t1 = "2026-09-01T00:01:00.000Z", t2 = "2026-09-01T00:02:00.000Z", t3 = "2026-09-01T00:03:00.000Z";
const context = { databaseIdentityDigest: "d".repeat(64), scopeDigest: "e".repeat(64) };
const activationId = "synthetic-billing-window-continuation";
const later = "2027-10-01T00:00:00.000Z";
function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "billing-window-continuation-")), directory = join(parent, "journal");
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
    extend() { const before = f.checkpoint(); f.now = t2; f.value = 1020;
      const changes = f.bindings.filter((_, i) => i % 2 === 0).map(binding => {
        const previousIdentityDigest = fullMeteringDigest(fullMeteringBindingIdentity(binding));
        binding.billingBinding = { ...binding.billingBinding, validUntil: later };
        return { channelRef: binding.channelRef, edgeCredentialRef: binding.edgeCredentialRef, previousIdentityDigest,
          currentIdentityDigest: fullMeteringDigest(fullMeteringBindingIdentity(binding)) };
      });
      return { version: 1, activationId, context, previousSequence: before.sequence, previousCheckpointDigest: fullMeteringDigest(before),
        notBefore: t1, expiresAt: "2026-09-01T01:00:00.000Z", changes };
    }
  }; return f;
}

test("ordinary collect still refuses a later billing end and does not accept the approval implicitly", async t => {
  const f = fixture(t); await f.seed(); const approval = f.extend(), original = readFileSync(join(f.directory, "checkpoint.json"));
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect" }), /full_metering_binding_changed/);
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect", billingWindowApproval: approval }), /full_metering_billing_window_approval_forbidden/);
  assert.deepEqual(readFileSync(join(f.directory, "checkpoint.json")), original);
});

test("explicit billing-window continuation baselines affected refs, increments the rest, and leaves the gap unknown", async t => {
  const f = fixture(t); await f.seed(); const before = f.checkpoint(), approval = f.extend();
  const summary = await runFullMeteringCollection({ ...f.options, mode: "continue-billing-window", billingWindowApproval: approval });
  assert.equal(summary.sampleCount, 5); assert.equal(summary.recordedBytes, 100);
  assert.equal(summary.billingWindowContinuation.identityCount, 5); assert.equal(summary.billingWindowContinuation.unassignedBytes, null);
  assert.equal(summary.historicalDebits, false);
  const after = f.checkpoint(); assert.equal(after.sequence, before.sequence + 1);
  assert.equal(after.billingWindowContinuations.length, 1);
  assert.equal(after.billingWindowContinuations[0].unassignedBytes, null);
  assert.equal(after.billingWindowContinuations[0].archiveName, `billing-window-before-${fullMeteringDigest(before)}.json`);
  assert.equal(existsSync(join(f.directory, after.billingWindowContinuations[0].archiveName)), true);
  for (let i = 0; i < 5; i++) assert.deepEqual(after.sources[i].counterState.entries[0].usage, before.sources[i].counterState.entries[0].usage);
  const bytes = readFileSync(join(f.directory, "checkpoint.json"));
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "continue-billing-window", billingWindowApproval: approval }), /billing_window_approval_stale/);
  assert.deepEqual(readFileSync(join(f.directory, "checkpoint.json")), bytes);
  f.now = t3; f.value += 3;
  const next = await runFullMeteringCollection({ ...f.options, mode: "collect" });
  assert.equal(next.sampleCount, 10); assert.equal(next.recordedBytes, 60);
  assert.deepEqual(f.checkpoint().billingWindowContinuations, after.billingWindowContinuations);
});

for (const name of ["earlier", "material", "ownership", "partial", "expired", "stale"]) {
  test(`billing-window approval rejects ${name} without durable writes`, async t => {
    const f = fixture(t); await f.seed(); const approval = f.extend();
    if (name === "earlier") f.bindings[0].billingBinding.validUntil = "2027-08-01T00:00:00.000Z";
    if (name === "material") f.bindings[0].materialDigest = `sha256:${"b".repeat(64)}`;
    if (name === "ownership") f.bindings[0].accountId = "another-account";
    if (name === "partial") approval.changes.pop();
    if (name === "expired") approval.expiresAt = t1;
    if (name === "stale") approval.previousCheckpointDigest = "0".repeat(64);
    if (["earlier", "material", "ownership"].includes(name)) approval.changes[0].currentIdentityDigest = fullMeteringDigest(fullMeteringBindingIdentity(f.bindings[0]));
    const before = readFileSync(join(f.directory, "checkpoint.json")), count = f.writes.length;
    await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "continue-billing-window", billingWindowApproval: approval }), /full_metering_(billing_window|binding)/);
    assert.deepEqual(readFileSync(join(f.directory, "checkpoint.json")), before); assert.equal(f.writes.length, count);
    assert.equal(existsSync(join(f.directory, "pending.json")), false);
  });
}

test("a billing-window continuation never recovers or deletes an existing pending intent", async t => {
  const f = fixture(t); await f.seed(); const approval = f.extend(), checkpoint = f.checkpoint();
  const pending = join(f.directory, "pending.json"); writeFileSync(pending, "not-an-authorized-intent", { mode: 0o600 });
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "continue-billing-window", billingWindowApproval: approval }), /pending_recovery_required/);
  assert.equal(readFileSync(pending, "utf8"), "not-an-authorized-intent");
  assert.deepEqual(f.checkpoint(), checkpoint);
});

test("CLI billing-window continuation requires its own approval file and hash", () => {
  const input = ["--continue-billing-window", "--config", "/private/config.json", "--config-sha256", "a".repeat(64),
    "--billing-window-approval", "/private/approval.json", "--billing-window-approval-sha256", "b".repeat(64)];
  assert.deepEqual(parseFullMeteringCommand(input), { mode: "continue-billing-window", configPath: "/private/config.json", configSha256: "a".repeat(64),
    billingWindowApprovalPath: "/private/approval.json", billingWindowApprovalSha256: "b".repeat(64) });
  assert.throws(() => parseFullMeteringCommand(["--continue-billing-window", ...input.slice(1, 5)]), /command_invalid/);
  assert.throws(() => parseFullMeteringCommand(["--continue-material", ...input.slice(1)]), /command_invalid/);
});
