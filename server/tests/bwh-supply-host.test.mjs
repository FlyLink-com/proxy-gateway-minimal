import test from "node:test";
import assert from "node:assert/strict";
import { createBwhSupplyHost, BWH_SUPPLY_BROKER_PATH, BWH_SUPPLY_STATUS_PATH, BWH_SUPPLY_MARKER_PATH } from "../services/platform/bwh-supply-host.mjs";
const NOW = "2026-10-19T12:00:00.000Z";
const dto = state => ({ revision: "a".repeat(64), state, protocolsRunning: state === "enabled" ? 3 : 0,
  collectorState: state === "enabled" ? "running" : "paused", nativeDistributionEnabled: state === "enabled",
  observedAt: NOW, canPause: state === "enabled", canEnable: state === "paused" });
function fixture() {
  const calls = []; let status = dto("enabled"); let marker = false;
  const lstat = path => {
    if (path === BWH_SUPPLY_MARKER_PATH) { if (marker) return {}; throw Object.assign(new Error("absent"), { code: "ENOENT" }); }
    return { uid: 0, mode: path === BWH_SUPPLY_STATUS_PATH ? 0o100644 : 0o40755, nlink: 1, size: 1000, dev: 1, ino: 2, mtimeMs: 3,
      isSymbolicLink: () => false, isFile: () => path === BWH_SUPPLY_STATUS_PATH, isDirectory: () => path !== BWH_SUPPLY_STATUS_PATH };
  };
  const result = (command, args, options) => { calls.push({ command, args, options }); return { status: 0, stdout: JSON.stringify(status) }; };
  const host = createBwhSupplyHost({ commandRunnerSync: result, commandRunner: async (...args) => result(...args),
    lstat, readFile: () => JSON.stringify(status), nowFn: () => new Date(NOW) });
  return { host, calls, setStatus(value) { status = value; }, setMarker(value) { marker = value; }, lstat };
}
test("readStatus uses fixed bounded sudo broker and a clean environment", () => {
  const f = fixture(); assert.equal(f.host.readStatus().state, "enabled");
  assert.deepEqual(f.calls[0].args, ["-n", "--", BWH_SUPPLY_BROKER_PATH, "status"]);
  assert.equal(f.calls[0].command, "/usr/bin/sudo"); assert.equal(f.calls[0].options.shell, false);
  assert.equal(f.calls[0].options.timeout, 5000); assert.equal(f.calls[0].options.env.HTTP_PROXY, undefined);
});
test("hot path does not spawn and durable pause/transition/failure/marker all deny native output", () => {
  const f = fixture(); assert.equal(f.host.allowsNativeDistribution(), true); assert.deepEqual(f.calls, []);
  f.setMarker(true); assert.equal(f.host.allowsNativeDistribution(), false); f.setMarker(false);
  for (const state of ["paused", "transitioning", "failed"]) { f.setStatus({ ...dto(state), canEnable: state === "paused" }); assert.equal(f.host.allowsNativeDistribution(), false); }
  assert.deepEqual(f.calls, []);
});
test("only enable/pause are transported; revision is stdin, never shell arguments", async () => {
  const f = fixture(); f.setStatus(dto("paused"));
  await f.host.setEnabled({ enabled: false, expectedRevision: "b".repeat(64) });
  assert.deepEqual(f.calls[0].args, ["-n", "--", BWH_SUPPLY_BROKER_PATH, "pause"]);
  assert.equal(f.calls[0].options.input, `${"b".repeat(64)}\n`);
  await assert.rejects(() => f.host.setEnabled({ enabled: false, expectedRevision: "$(secret)" }));
  await assert.rejects(() => f.host.setEnabled({ enabled: false, expectedRevision: "b".repeat(64), command: "rm" }));
  assert.equal(f.calls.length, 1);
});
test("missing/untrusted installation denies native output and never invents available controls", () => {
  const host = createBwhSupplyHost({ commandRunnerSync() { throw new Error("missing"); }, lstat() { throw new Error("missing"); } });
  assert.equal(host.readStatus().state, "unavailable"); assert.equal(host.allowsNativeDistribution(), false);
});
test("Admin status does not put a fresh timestamp on stale host claims", () => {
  const f = fixture(); f.setStatus({ ...dto("enabled"), observedAt: "2026-10-19T11:58:00.000Z" });
  assert.equal(f.host.readStatus().state, "unavailable");
});
test("writable or symlink status parents fail closed", () => {
  const f = fixture();
  for (const unsafe of ["write", "symlink"]) {
    const host = createBwhSupplyHost({ readFile: () => JSON.stringify(dto("enabled")), lstat: path => {
      const info = f.lstat(path); if (path === "/var/lib") { if (unsafe === "write") info.mode |= 0o020; else info.isSymbolicLink = () => true; } return info;
    } }); assert.equal(host.allowsNativeDistribution(), false);
  }
});
