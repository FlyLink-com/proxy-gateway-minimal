import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { readRecoveryXraySnapshot, runTrafficVlessRecovery } from "../../scripts/traffic-vless-recovery.mjs";

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
    prepareTrafficVlessBaseline({ observations }) { assert.equal(observations.length, 1); return { ok: true, privatePlan: { planDigest: "a".repeat(64), privateMarker: "never-stdout" }, summary: { ok: true, planDigest: "a".repeat(64) } }; },
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
