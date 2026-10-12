import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { computeIdentityGate } from "../../scripts/identity-gate-check.mjs";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(TEST_DIRECTORY, "../../scripts/identity-gate-check.mjs");
const FIXTURES = resolve(TEST_DIRECTORY, "fixtures/identity-gate-check");
const SECRET_STRINGS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "edgecred_alpha_001",
  "edgecred_beta_002",
  "edgecred_gamma_003",
  "edgecred_stale_004",
  "edgecred_changed_005",
  "synthetic-password-alpha",
  "synthetic-password-beta",
  "synthetic-password-gamma",
  "synthetic-canary-7f3a9c",
  "synthetic-listener"
];

function fixture(name) {
  return resolve(FIXTURES, name);
}

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    windowsHide: true
  });
}

function gateArgs(kind, runtime, map, material) {
  return [
    "--surface", "japan-tuic",
    "--runtime-kind", kind,
    "--runtime-config", fixture(runtime),
    "--identity-map", fixture(map),
    "--material", fixture(material)
  ];
}

function readGate(result) {
  assert.equal(result.stderr, "");
  const lines = result.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  assert.equal(lines.length, 1);
  for (const secret of SECRET_STRINGS) {
    assert.equal(result.stdout.includes(secret), false);
  }
  return JSON.parse(lines[0]);
}

test("healthy xray snapshot is verified", () => {
  const result = run(gateArgs("xray", "xray-healthy.json", "map-healthy.json", "material-healthy.json"));
  const gate = readGate(result);
  assert.equal(result.status, 0);
  assert.equal(gate.surface, "japan-tuic");
  assert.equal(gate.state, "verified");
  assert.deepEqual(gate, {
    surface: "japan-tuic",
    runtime_count: 2,
    mapped_count: 2,
    missing: 0,
    stale: 0,
    changed: 0,
    missing_material: 0,
    map_total: 2,
    equalities: { runtime_eq: true, map_eq: true },
    state: "verified"
  });
});

test("runtime principal absent from the map is missing and degraded", () => {
  const gate = readGate(run(gateArgs("xray", "xray-missing.json", "map-healthy.json", "material-three.json")));
  assert.equal(gate.state, "degraded");
  assert.equal(gate.runtime_count, 3);
  assert.equal(gate.mapped_count, 2);
  assert.equal(gate.missing, 1);
  assert.equal(gate.stale, 0);
  assert.equal(gate.changed, 0);
  assert.equal(gate.missing_material, 0);
  assert.equal(gate.map_total, 2);
  assert.deepEqual(gate.equalities, { runtime_eq: true, map_eq: true });
});

test("map principal absent from runtime is stale and degraded", () => {
  const gate = readGate(run(gateArgs("xray", "xray-healthy.json", "map-stale.json", "material-healthy.json")));
  assert.equal(gate.state, "degraded");
  assert.equal(gate.runtime_count, 2);
  assert.equal(gate.mapped_count, 2);
  assert.equal(gate.missing, 0);
  assert.equal(gate.stale, 1);
  assert.equal(gate.changed, 0);
  assert.equal(gate.missing_material, 0);
  assert.equal(gate.map_total, 3);
  assert.deepEqual(gate.equalities, { runtime_eq: true, map_eq: true });
});

test("shared principal with a different material reference is changed", () => {
  const gate = readGate(run(gateArgs("xray", "xray-healthy.json", "map-changed.json", "material-healthy.json")));
  assert.equal(gate.state, "degraded");
  assert.equal(gate.runtime_count, 2);
  assert.equal(gate.mapped_count, 2);
  assert.equal(gate.missing, 0);
  assert.equal(gate.stale, 0);
  assert.equal(gate.changed, 1);
  assert.equal(gate.missing_material, 0);
  assert.equal(gate.map_total, 2);
  assert.deepEqual(gate.equalities, { runtime_eq: true, map_eq: true });
});

test("runtime principal without protected material is missing_material", () => {
  const gate = readGate(run(gateArgs("xray", "xray-healthy.json", "map-healthy.json", "material-partial.json")));
  assert.equal(gate.state, "degraded");
  assert.equal(gate.runtime_count, 2);
  assert.equal(gate.mapped_count, 2);
  assert.equal(gate.missing, 0);
  assert.equal(gate.stale, 0);
  assert.equal(gate.changed, 0);
  assert.equal(gate.missing_material, 1);
  assert.equal(gate.map_total, 2);
  assert.deepEqual(gate.equalities, { runtime_eq: true, map_eq: true });
});

test("healthy mihomo snapshot ignores comment-only uuids", () => {
  const gate = readGate(run(gateArgs("mihomo", "mihomo-healthy.yaml", "map-mihomo.json", "material-healthy.json")));
  assert.equal(gate.state, "verified");
  assert.equal(gate.runtime_count, 2);
  assert.equal(gate.mapped_count, 2);
  assert.equal(gate.missing, 0);
  assert.equal(gate.stale, 0);
  assert.equal(gate.changed, 0);
  assert.equal(gate.missing_material, 0);
  assert.equal(gate.map_total, 2);
  assert.deepEqual(gate.equalities, { runtime_eq: true, map_eq: true });
});

test("equality failure from inconsistent declared counts is blocked", () => {
  const gate = computeIdentityGate({
    runtimePrincipals: { entries: ["edgecred_alpha_001"], runtime_count: 4 },
    mapEntries: [{ principal: "edgecred_alpha_001", reference: "edgecred_alpha_001" }],
    materialRefs: [{ principal: "edgecred_alpha_001", reference: "edgecred_alpha_001" }]
  });
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "equality_failed");
  assert.equal(gate.equalities.runtime_eq, false);
  assert.equal(gate.equalities.map_eq, true);
  assert.equal(gate.runtime_count, 4);
  assert.equal(gate.mapped_count, 1);
  assert.equal(gate.missing, 0);
  assert.equal(JSON.stringify(gate).includes("edgecred_alpha_001"), false);
});

test("invalid runtime config is blocked with a fixed code and no content", () => {
  const result = run(gateArgs("xray", "invalid.json", "map-healthy.json", "material-healthy.json"));
  const gate = readGate(result);
  assert.equal(result.status, 1);
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "input_invalid");
  assert.equal(Object.hasOwn(gate, "message"), false);
  assert.equal(Object.hasOwn(gate, "error"), false);
  assert.equal(gate.runtime_count, 0);
  assert.deepEqual(gate.equalities, { runtime_eq: false, map_eq: false });
});

test("unreadable input is blocked with a fixed code and no path", () => {
  const missing = fixture("does-not-exist-identity-gate.json");
  const result = run([
    "--surface", "sgp-vless",
    "--runtime-kind", "xray",
    "--runtime-config", missing,
    "--identity-map", fixture("map-healthy.json"),
    "--material", fixture("material-healthy.json")
  ]);
  const gate = readGate(result);
  assert.equal(result.status, 1);
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "input_unreadable");
  assert.equal(result.stdout.includes("does-not-exist-identity-gate"), false);
  assert.equal(result.stdout.includes(missing), false);
});

test("duplicate runtime principals are blocked", () => {
  const gate = readGate(run(gateArgs("xray", "xray-duplicate.json", "map-healthy.json", "material-healthy.json")));
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "duplicate_principals");
});

test("checker source has no write, spawn, or network APIs", () => {
  const source = readFileSync(SCRIPT, "utf8");
  const forbidden = [
    /writeFile/,
    /appendFile/,
    /createWriteStream/,
    /mkdir/,
    /rmSync/,
    /unlink/,
    /renameSync/,
    /copyFile/,
    /chmod/,
    /chown/,
    /truncate/,
    /\bspawn(?:Sync)?\s*\(/,
    /execFile/,
    /execSync/,
    /child_process/,
    /node:net/,
    /node:http/,
    /node:https/,
    /node:dgram/,
    /node:tls/,
    /\bfetch\s*\(/,
    /createConnection/
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(source), false, pattern.source);
  }
});
