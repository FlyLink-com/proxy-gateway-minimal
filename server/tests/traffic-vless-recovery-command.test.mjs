import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { readRecoveryXraySnapshot, runTrafficVlessRecovery, validateVlessRecoveryRequest, readBaselineEnvelope } from "../../scripts/traffic-vless-recovery.mjs";

const channel = "channel-vultr-a-vless-reality-tcp";
const clock = () => new Date("2026-09-05T10:00:00.000Z");
const digest = (value) => createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "vless-command-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const binary = join(root, "xray-fixture");
  writeFileSync(binary, "synthetic executable identity", { mode: 0o700 });
  const source = { channelRef: channel, xrayBinary: binary, binarySha256: digest(readFileSync(binary)), statsServer: "127.0.0.1:10085" };
  return { root, source };
}
const validPayload = { stat: [
  { name: "user>>>edgecred_private>>>traffic>>>uplink", value: 10 },
  { name: "user>>>edgecred_private>>>traffic>>>downlink", value: "20" }
] };
test("strict recovery Xray read pins executable and never requests counter reset", (t) => {
  const { source } = fixture(t);
  let calls = 0;
  const snapshot = readRecoveryXraySnapshot({ source, nowFn: clock, commandRunner(binary, args) {
    calls++;
    assert.equal(binary, source.xrayBinary);
    assert.deepEqual(args, ["api", "statsquery", "--server=127.0.0.1:10085"]);
    return { status: 0, stdout: JSON.stringify(validPayload) };
  } });
  assert.equal(calls, 1);
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].uploadBytes, 10);
  assert.equal(snapshot[0].downloadBytes, 20);
  assert.equal(snapshot[0].channelRef, channel);
});
test("strict recovery parser rejects incomplete, duplicate, unsafe or unknown user counters", (t) => {
  const { source } = fixture(t);
  for (const payload of [
    { stat: validPayload.stat.slice(0, 1) },
    { stat: [...validPayload.stat, validPayload.stat[0]] },
    { stat: validPayload.stat.map((row) => ({ ...row, value: -1 })) },
    { stat: validPayload.stat.map((row) => ({ ...row, value: "9007199254740993" })) },
    { stat: [{ name: "user>>>private-unknown>>>other>>>bytes", value: 0 }] },
    { stat: [{ name: "malformed-private-row", value: 0 }] },
    { entries: [] }
  ]) assert.throws(() => readRecoveryXraySnapshot({ source, nowFn: clock, commandRunner: () => ({ status: 0, stdout: JSON.stringify(payload) }) }));
});
test("source hash or non-loopback mismatch rejects before command execution", (t) => {
  const { source } = fixture(t);
  let calls = 0;
  for (const invalid of [{ ...source, binarySha256: "0".repeat(64) }, { ...source, statsServer: "remote.invalid:10085" }]) {
    assert.throws(() => readRecoveryXraySnapshot({ source: invalid, nowFn: clock, commandRunner: () => { calls++; } }));
  }
  assert.equal(calls, 0);
});
test("CLI rejects unknown actions, missing args and missing files without leaking paths or constructing runtime", async () => {
  for (const argv of [[], ["--force"], ["apply"], ["verify", "--plan", "relative-private.json"], ["prepare", "--request", "/private-missing-request"]]) {
    let output = "";
    const exit = await runTrafficVlessRecovery({ argv, nowFn: clock, stdout: { write: (text) => { output += text; } }, allowWindowsSynthetic: true });
    assert.equal(exit, 2);
    assert.equal(JSON.parse(output).ok, false);
    assert.doesNotMatch(output, /relative-private|private-missing|stack|credentialRef/);
  }
});
test("prepare writes private plan only and apply persists intent before DB mutation with readback recovery", async (t) => {
  const { root, source } = fixture(t);
  const requestFile = join(root, "request.json");
  const planFile = join(root, "plan.json");
  writeFileSync(requestFile, JSON.stringify({ schemaVersion: 1, dbPath: join(root, "db.sqlite"), channelRefs: [channel], sources: [source], validForSeconds: 300 }), { mode: 0o600 });
  let applied = false;
  let inspected = 0;
  const baseline = {
    inspectTrafficVlessBaseline() { inspected++; return { ok: true, privateInventory: { synthetic: true } }; },
    prepareTrafficVlessBaseline({ observations }) { assert.equal(observations.length, 1); return { ok: true, privatePlan: { version: 1, channelRefs: [channel], planDigest: "a".repeat(64), privateMarker: "never-stdout" }, summary: { ok: true, planDigest: "a".repeat(64) } }; },
    applyTrafficVlessBaseline() { assert.ok(existsSync(`${planFile}.intent.json`)); applied = true; return { ok: true, status: "baseline_applied", planDigest: "a".repeat(64) }; },
    verifyTrafficVlessBaseline() { return { ok: applied, status: applied ? "baseline_applied" : "baseline_not_applied", applied, planDigest: "a".repeat(64) }; }
  };
  let output = "";
  const common = { nowFn: clock, baseline, allowWindowsSynthetic: true, stdout: { write: (text) => { output += text; } }, commandRunner: () => ({ status: 0, stdout: JSON.stringify(validPayload) }) };
  assert.equal(await runTrafficVlessRecovery({ ...common, argv: ["prepare", "--request", requestFile, "--plan", planFile] }), 0);
  assert.equal(inspected, 1);
  assert.ok(existsSync(planFile));
  assert.equal(applied, false);
  const fileDigest = digest(readFileSync(planFile));
  assert.equal(await runTrafficVlessRecovery({ ...common, argv: ["apply", "--plan", planFile, "--expect-sha256", fileDigest] }), 0);
  assert.equal(applied, true);
  assert.ok(existsSync(`${planFile}.receipt.json`));
  assert.equal(await runTrafficVlessRecovery({ ...common, argv: ["verify", "--plan", planFile, "--expect-sha256", fileDigest] }), 0);
  assert.doesNotMatch(output, /never-stdout|edgecred_private|db\.sqlite|127\.0\.0\.1/);
});

test("mixed-state policy requires explicit v2 and is forwarded to both baseline reads", async (t) => {
  const { root, source } = fixture(t);
  const request = { schemaVersion: 2, retentionPolicy: "preserve-ineligible", dbPath: join(root, "db.sqlite"), channelRefs: [channel], sources: [source], validForSeconds: 300 };
  assert.equal(validateVlessRecoveryRequest(request), request);
  for (const invalid of [{ ...request, schemaVersion: 1 }, { ...request, retentionPolicy: undefined }, { ...request, retentionPolicy: "ignore-errors" }, { ...request, schemaVersion: 3 }]) {
    assert.throws(() => validateVlessRecoveryRequest(invalid));
  }
  const requestFile = join(root, "request.json"), planFile = join(root, "plan.json");
  writeFileSync(requestFile, JSON.stringify(request), { mode: 0o600 });
  let inspections = 0, preparations = 0, output = "";
  const baseline = {
    inspectTrafficVlessBaseline(options) { inspections++; assert.equal(options.retentionPolicy, request.retentionPolicy); return { ok: true, privateInventory: {} }; },
    prepareTrafficVlessBaseline(options) { preparations++; assert.equal(options.retentionPolicy, request.retentionPolicy); return { ok: true, privatePlan: { version: 2, retentionPolicy: request.retentionPolicy, channelRefs: [channel], planDigest: "a".repeat(64) }, summary: { ok: true } }; }
  };
  assert.equal(await runTrafficVlessRecovery({ argv: ["prepare", "--request", requestFile, "--plan", planFile], baseline, allowWindowsSynthetic: true,
    stdout: { write: (value) => { output += value; } }, nowFn: clock, commandRunner: () => ({ status: 0, stdout: JSON.stringify(validPayload) }) }), 0);
  assert.equal(inspections, 1); assert.equal(preparations, 1);
  const envelope = readBaselineEnvelope(planFile, digest(readFileSync(planFile)));
  assert.equal(envelope.schemaVersion, 2);
  for (const changed of [
    { ...envelope, schemaVersion: 1 },
    { ...envelope, privatePlan: { ...envelope.privatePlan, version: 1 } },
    { ...envelope, privatePlan: { ...envelope.privatePlan, retentionPolicy: "strict" } },
    { ...envelope, request: { ...envelope.request, schemaVersion: 1 } }
  ]) {
    writeFileSync(planFile, JSON.stringify(changed), { mode: 0o600 });
    assert.throws(() => readBaselineEnvelope(planFile, digest(readFileSync(planFile))));
  }
  assert.doesNotMatch(output, /db\.sqlite|edgecred_private/);
});

test("fresh cursor and legacy policy requires explicit v3 and is pinned through the envelope", async (t) => {
  const { root, source } = fixture(t);
  const request = { schemaVersion: 3, retentionPolicy: "preserve-ineligible", initializationPolicy: "verified-legacy-fresh-cursors",
    dbPath: join(root, "db.sqlite"), channelRefs: [channel], sources: [source], validForSeconds: 300 };
  assert.equal(validateVlessRecoveryRequest(request), request);
  for (const changed of [{ ...request, schemaVersion: 1 }, { ...request, schemaVersion: 2 },
    { ...request, initializationPolicy: undefined }, { ...request, initializationPolicy: "reset-all" }, { ...request, retentionPolicy: undefined }]) {
    assert.throws(() => validateVlessRecoveryRequest(changed));
  }
  const requestFile = join(root, "request.json"), planFile = join(root, "plan.json");
  writeFileSync(requestFile, JSON.stringify(request), { mode: 0o600 });
  let reads = 0, output = "";
  const baseline = {
    inspectTrafficVlessBaseline(options) { reads++; assert.equal(options.initializationPolicy, request.initializationPolicy); return { ok: true, privateInventory: {} }; },
    prepareTrafficVlessBaseline(options) { reads++; assert.equal(options.initializationPolicy, request.initializationPolicy); return { ok: true,
      privatePlan: { version: 3, retentionPolicy: request.retentionPolicy, initializationPolicy: request.initializationPolicy,
        channelRefs: [channel], planDigest: "b".repeat(64) }, summary: { ok: true } }; }
  };
  assert.equal(await runTrafficVlessRecovery({ argv: ["prepare", "--request", requestFile, "--plan", planFile], baseline, allowWindowsSynthetic: true,
    stdout: { write: value => { output += value; } }, nowFn: clock, commandRunner: () => ({ status: 0, stdout: JSON.stringify(validPayload) }) }), 0);
  assert.equal(reads, 2);
  const envelope = readBaselineEnvelope(planFile, digest(readFileSync(planFile)));
  assert.equal(envelope.schemaVersion, 3);
  for (const changed of [{ ...envelope, schemaVersion: 2 },
    { ...envelope, privatePlan: { ...envelope.privatePlan, initializationPolicy: undefined } },
    { ...envelope, privatePlan: { ...envelope.privatePlan, initializationPolicy: "reset-all" } }]) {
    writeFileSync(planFile, JSON.stringify(changed), { mode: 0o600 });
    assert.throws(() => readBaselineEnvelope(planFile, digest(readFileSync(planFile))));
  }
  assert.doesNotMatch(output, /db\.sqlite|edgecred_private/);
});
