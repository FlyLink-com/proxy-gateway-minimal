import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
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

function gateArgs(kind, runtime, map, material, surface = "japan-tuic") {
  return [
    "--surface", surface,
    "--runtime-kind", kind,
    "--runtime-config", fixture(runtime),
    "--identity-map", fixture(map),
    "--material", fixture(material)
  ];
}

function hy2Args(runtime, map, material) {
  return gateArgs("hy2", runtime, map, material, "sgp-hy2");
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

test("healthy hy2 userpass snapshot is verified and ignores comments", () => {
  const result = run(hy2Args("hy2-healthy.yaml", "map-healthy.json", "material-healthy.json"));
  const gate = readGate(result);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("hy2-healthy.yaml"), false);
  assert.equal(result.stdout.includes("userpass"), false);
  assert.equal(result.stdout.includes("edgecred_"), false);
  assert.deepEqual(gate, {
    surface: "sgp-hy2",
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

test("hy2 runtime principal absent from the map is missing", () => {
  const gate = readGate(run(hy2Args("hy2-missing.yaml", "map-healthy.json", "material-three.json")));
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

test("hy2 map principal absent from runtime is stale", () => {
  const gate = readGate(run(hy2Args("hy2-healthy.yaml", "map-stale.json", "material-healthy.json")));
  assert.equal(gate.state, "degraded");
  assert.equal(gate.runtime_count, 2);
  assert.equal(gate.mapped_count, 2);
  assert.equal(gate.missing, 0);
  assert.equal(gate.stale, 1);
  assert.equal(gate.changed, 0);
  assert.equal(gate.missing_material, 0);
  assert.equal(gate.map_total, 3);
});

test("hy2 mapped reference that differs from protected material is changed", () => {
  const gate = readGate(run(hy2Args("hy2-healthy.yaml", "map-changed.json", "material-healthy.json")));
  assert.equal(gate.state, "degraded");
  assert.equal(gate.runtime_count, 2);
  assert.equal(gate.mapped_count, 2);
  assert.equal(gate.missing, 0);
  assert.equal(gate.stale, 0);
  assert.equal(gate.changed, 1);
  assert.equal(gate.missing_material, 0);
  assert.equal(gate.map_total, 2);
});

test("hy2 runtime principal without protected material is missing_material", () => {
  const gate = readGate(run(hy2Args("hy2-healthy.yaml", "map-healthy.json", "material-partial.json")));
  assert.equal(gate.state, "degraded");
  assert.equal(gate.runtime_count, 2);
  assert.equal(gate.mapped_count, 2);
  assert.equal(gate.missing, 0);
  assert.equal(gate.stale, 0);
  assert.equal(gate.changed, 0);
  assert.equal(gate.missing_material, 1);
  assert.equal(gate.map_total, 2);
});

test("hy2 password that does not match the credential ref is missing_material", () => {
  const gate = readGate(run(hy2Args("hy2-password-mismatch.yaml", "map-healthy.json", "material-healthy.json")));
  assert.equal(gate.state, "degraded");
  assert.equal(gate.missing, 0);
  assert.equal(gate.stale, 0);
  assert.equal(gate.changed, 0);
  assert.equal(gate.missing_material, 1);
  assert.equal(gate.mapped_count, 2);
});

test("invalid hy2 config is blocked and does not leak config text", () => {
  const result = run(hy2Args("hy2-invalid.yaml", "map-healthy.json", "material-healthy.json"));
  const gate = readGate(result);
  assert.equal(result.status, 1);
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "input_invalid");
  assert.equal(gate.runtime_count, 0);
  assert.equal(result.stdout.includes("hy2-invalid.yaml"), false);
  assert.equal(result.stdout.includes("userpass"), false);
  assert.deepEqual(gate.equalities, { runtime_eq: false, map_eq: false });
});

test("hy2 empty userpass map has no runtime principals", () => {
  const gate = readGate(run(hy2Args("hy2-empty.yaml", "map-stale.json", "material-healthy.json")));
  assert.equal(gate.state, "degraded");
  assert.equal(gate.runtime_count, 0);
  assert.equal(gate.mapped_count, 0);
  assert.equal(gate.missing, 0);
  assert.equal(gate.stale, 3);
  assert.equal(gate.changed, 0);
  assert.equal(gate.missing_material, 0);
  assert.equal(gate.map_total, 3);
});

test("duplicate hy2 userpass usernames are blocked", () => {
  const gate = readGate(run(hy2Args("hy2-duplicate.yaml", "map-healthy.json", "material-healthy.json")));
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "duplicate_principals");
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

const DB_OLD = "2020-01-01T00:00:00.000Z";
const DB_UNTIL = "2099-01-01T00:00:00.000Z";
const DB_KINDS = ["xray", "hy2", "mihomo"];
const DB_SURFACE = { xray: "japan-vless", hy2: "japan-hy2", mihomo: "japan-tuic" };
const DB_CHANNEL = {
  xray: "channel-vultr-a-vless-reality-tcp",
  hy2: "channel-vultr-a-hy2",
  mihomo: "channel-vultr-a-tuic"
};
const DB_HEALTHY = { xray: "xray-healthy.json", hy2: "hy2-healthy.yaml", mihomo: "mihomo-healthy.yaml" };
const PEOPLE = {
  alpha: {
    ref: "edgecred_alpha_001",
    uuid: "11111111-1111-4111-8111-111111111111",
    password: "synthetic-password-alpha",
    digest: "sha256:alpha"
  },
  beta: {
    ref: "edgecred_beta_002",
    uuid: "22222222-2222-4222-8222-222222222222",
    password: "synthetic-password-beta",
    digest: "sha256:beta"
  },
  gamma: {
    ref: "edgecred_gamma_003",
    uuid: "33333333-3333-4333-8333-333333333333",
    password: "synthetic-password-gamma",
    digest: "sha256:gamma"
  },
  stale: {
    ref: "edgecred_stale_004",
    uuid: "44444444-4444-4444-8444-444444444444",
    password: "synthetic-password-alpha",
    digest: "sha256:stale"
  }
};

function dbRow(kind, person, { retained = false, digest = person.digest } = {}) {
  return { kind, ref: person.ref, digest, retained };
}

function createControlDatabase(t, rows) {
  const directory = mkdtempSync(join(tmpdir(), "identity-gate-db-"));
  const dbPath = join(directory, "subscription-control.sqlite");
  const db = new Database(dbPath);
  const store = createSqliteSubscriptionControlStore({ dbPath, database: db });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (db.open) {
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
    }
  };
  t.after(() => {
    close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  rows.forEach((row, index) => {
    const suffix = String(index);
    const accountId = `acct-${suffix}`;
    const entitlementId = `ent-${suffix}`;
    const requestId = `req-${suffix}`;
    const channelRef = DB_CHANNEL[row.kind];
    store.createAccount({
      id: accountId, ownerRef: `owner-${suffix}`, status: "active", createdAt: DB_OLD, updatedAt: DB_OLD
    });
    store.createEntitlement({
      id: entitlementId, accountId, plan: "yearly", status: "active",
      validFrom: DB_OLD, validUntil: DB_UNTIL, trafficLimitBytes: 1000, createdAt: DB_OLD, updatedAt: DB_OLD
    });
    store.createIssuanceRequest({
      id: requestId, accountId, entitlementId, approvalRef: `approval-${suffix}`, status: "issued",
      quantity: 1, nodeId: channelRef, purpose: "portal_auto_issuance", requestedByRef: "test-issuer",
      createdAt: DB_OLD, updatedAt: DB_OLD
    });
    store.linkIssuedSubscription({
      id: `link-${suffix}`, requestId, tenantRef: `tenant-${suffix}`, artifactRef: `artifact-${suffix}`,
      status: "active", createdAt: DB_OLD, updatedAt: DB_OLD
    });
    store.upsertPortalAccessRequest({
      id: requestId, portalUserRef: accountId, plan: "yearly", clientTarget: "clash", durationDays: 365,
      quantity: 1, status: row.retained ? "disabled" : "delivered", nextAction: "user_can_use_access",
      noteProvided: false, priorTrialState: "not_applicable", submittedAt: DB_OLD, updatedAt: DB_OLD,
      validUntil: DB_UNTIL, entitlementRef: entitlementId, accessGrantRef: `grant-${suffix}`,
      tenantId: `tenant-${suffix}`, artifactId: `artifact-${suffix}`, edgeChannelRef: channelRef,
      edgeCredentialRef: row.ref, edgeMaterialDigest: row.digest
    });
  });
  close();
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbPath}${suffix}`;
    if (existsSync(sidecar)) rmSync(sidecar);
  }
  return { directory, dbPath };
}

function dbArgs(kind, runtimePath, dbPath, materialPath) {
  return [
    "--surface", DB_SURFACE[kind],
    "--runtime-kind", kind,
    "--runtime-config", runtimePath,
    "--db", dbPath,
    "--material", materialPath
  ];
}

function writeMaterial(directory, people) {
  const path = join(directory, "material.json");
  const records = people.map((person) => ({
    credentialRef: person.ref,
    materialDigest: person.digest,
    material: { uuid: person.uuid, password: person.password }
  }));
  writeFileSync(path, `${JSON.stringify({ version: 1, records })}\n`);
  return path;
}

function writeMihomo(directory, people) {
  const lines = [
    "external-controller: \"127.0.0.1:9090\"",
    "listeners:",
    "  - name: \"synthetic-listener\"",
    "    type: tuic",
    "    port: 443",
    "    users:"
  ];
  for (const person of people) lines.push(`      "${person.uuid}": "${person.password}"`);
  const path = join(directory, "mihomo.yaml");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

function fileStamp(path) {
  const stat = statSync(path, { bigint: true });
  return {
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    size: stat.size.toString(),
    mtimeNs: stat.mtimeNs.toString()
  };
}

function expectDbGate(result, expected) {
  const gate = readGate(result);
  assert.equal(result.status, expected.state === "blocked" ? 1 : 0);
  assert.deepEqual(gate, expected);
  return gate;
}

for (const kind of DB_KINDS) {
  test(`${kind} database binding snapshot is verified`, (t) => {
    const built = createControlDatabase(t, [dbRow(kind, PEOPLE.alpha), dbRow(kind, PEOPLE.beta)]);
    const result = run(dbArgs(kind, fixture(DB_HEALTHY[kind]), built.dbPath, fixture("material-healthy.json")));
    expectDbGate(result, {
      surface: DB_SURFACE[kind],
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

  test(`${kind} runtime principal absent from database bindings is missing`, (t) => {
    const built = createControlDatabase(t, [dbRow(kind, PEOPLE.alpha), dbRow(kind, PEOPLE.beta)]);
    const runtime = kind === "mihomo"
      ? writeMihomo(built.directory, [PEOPLE.alpha, PEOPLE.beta, PEOPLE.gamma])
      : fixture(kind === "xray" ? "xray-missing.json" : "hy2-missing.yaml");
    const result = run(dbArgs(kind, runtime, built.dbPath, fixture("material-three.json")));
    expectDbGate(result, {
      surface: DB_SURFACE[kind],
      runtime_count: 3,
      mapped_count: 2,
      missing: 1,
      stale: 0,
      changed: 0,
      missing_material: 0,
      map_total: 2,
      equalities: { runtime_eq: true, map_eq: true },
      state: "degraded"
    });
  });

  test(`${kind} retained binding resolved by material and absent from runtime is stale`, (t) => {
    const built = createControlDatabase(t, [
      dbRow(kind, PEOPLE.alpha),
      dbRow(kind, PEOPLE.beta),
      dbRow(kind, PEOPLE.stale, { retained: true })
    ]);
    const material = writeMaterial(built.directory, [PEOPLE.alpha, PEOPLE.beta, PEOPLE.stale]);
    const result = run(dbArgs(kind, fixture(DB_HEALTHY[kind]), built.dbPath, material));
    expectDbGate(result, {
      surface: DB_SURFACE[kind],
      runtime_count: 2,
      mapped_count: 2,
      missing: 0,
      stale: 1,
      changed: 0,
      missing_material: 0,
      map_total: 3,
      equalities: { runtime_eq: true, map_eq: true },
      state: "degraded"
    });
  });

  test(`${kind} database material digest disagreement is changed`, (t) => {
    const built = createControlDatabase(t, [
      dbRow(kind, PEOPLE.alpha, { digest: "sha256:other" }),
      dbRow(kind, PEOPLE.beta)
    ]);
    const result = run(dbArgs(kind, fixture(DB_HEALTHY[kind]), built.dbPath, fixture("material-healthy.json")));
    assert.equal(result.stdout.includes("sha256:"), false);
    expectDbGate(result, {
      surface: DB_SURFACE[kind],
      runtime_count: 2,
      mapped_count: 2,
      missing: 0,
      stale: 0,
      changed: 1,
      missing_material: 0,
      map_total: 2,
      equalities: { runtime_eq: true, map_eq: true },
      state: "degraded"
    });
  });

  test(`${kind} database runtime principal without protected material is missing_material`, (t) => {
    const built = createControlDatabase(t, [dbRow(kind, PEOPLE.alpha), dbRow(kind, PEOPLE.beta)]);
    const runtime = kind === "mihomo"
      ? writeMihomo(built.directory, [
        PEOPLE.alpha,
        { ...PEOPLE.beta, password: "synthetic-password-gamma" }
      ])
      : fixture(DB_HEALTHY[kind]);
    const material = kind === "mihomo" ? fixture("material-healthy.json") : fixture("material-partial.json");
    const result = run(dbArgs(kind, runtime, built.dbPath, material));
    expectDbGate(result, {
      surface: DB_SURFACE[kind],
      runtime_count: 2,
      mapped_count: kind === "mihomo" ? 2 : 2,
      missing: kind === "mihomo" ? 0 : 0,
      stale: 0,
      changed: 0,
      missing_material: kind === "mihomo" ? 1 : 1,
      map_total: 2,
      equalities: { runtime_eq: true, map_eq: true },
      state: "degraded"
    });
  });
}

test("xray and hy2 missing material keeps the database principal mapped", (t) => {
  for (const kind of ["xray", "hy2"]) {
    const built = createControlDatabase(t, [dbRow(kind, PEOPLE.alpha), dbRow(kind, PEOPLE.beta)]);
    const gate = readGate(run(dbArgs(kind, fixture(DB_HEALTHY[kind]), built.dbPath, fixture("material-partial.json"))));
    assert.equal(gate.missing, 0);
    assert.equal(gate.mapped_count, 2);
    assert.equal(gate.missing_material, 1);
  }
});

test("retained database binding without material is not a stale resolver entry", (t) => {
  const built = createControlDatabase(t, [
    dbRow("xray", PEOPLE.alpha),
    dbRow("xray", PEOPLE.beta),
    dbRow("xray", PEOPLE.stale, { retained: true })
  ]);
  const result = run(dbArgs("xray", fixture("xray-healthy.json"), built.dbPath, fixture("material-healthy.json")));
  expectDbGate(result, {
    surface: "japan-vless",
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

test("equality failure for principals stored in the database is blocked", (t) => {
  const built = createControlDatabase(t, [dbRow("xray", PEOPLE.alpha), dbRow("xray", PEOPLE.beta)]);
  const verified = expectDbGate(
    run(dbArgs("xray", fixture("xray-healthy.json"), built.dbPath, fixture("material-healthy.json"))),
    {
      surface: "japan-vless",
      runtime_count: 2,
      mapped_count: 2,
      missing: 0,
      stale: 0,
      changed: 0,
      missing_material: 0,
      map_total: 2,
      equalities: { runtime_eq: true, map_eq: true },
      state: "verified"
    }
  );
  const failed = computeIdentityGate({
    runtimePrincipals: { entries: [PEOPLE.alpha.ref, PEOPLE.beta.ref], runtime_count: verified.runtime_count + 1 },
    mapEntries: [PEOPLE.alpha, PEOPLE.beta].map((person) => ({ principal: person.ref, reference: person.ref })),
    materialRefs: [PEOPLE.alpha, PEOPLE.beta].map((person) => ({ principal: person.ref, reference: person.ref }))
  });
  assert.equal(failed.state, "blocked");
  assert.equal(failed.code, "equality_failed");
  assert.equal(failed.equalities.runtime_eq, false);
  assert.equal(JSON.stringify(failed).includes(PEOPLE.alpha.ref), false);
});

test("invalid database is blocked with a fixed code and no payload", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "identity-gate-db-"));
  const dbPath = join(directory, "not-a-database.sqlite");
  writeFileSync(dbPath, "not-a-database");
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const result = run(dbArgs("xray", fixture("xray-healthy.json"), dbPath, fixture("material-healthy.json")));
  const gate = readGate(result);
  assert.equal(result.status, 1);
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "db_invalid");
  assert.equal(gate.runtime_count, 0);
  assert.deepEqual(gate.equalities, { runtime_eq: false, map_eq: false });
  assert.equal(result.stdout.includes("not-a-database"), false);
  assert.equal(result.stdout.includes(dbPath), false);
  assert.equal(result.stdout.includes(directory), false);
});

test("missing database is blocked without the path", () => {
  const missing = join(tmpdir(), "does-not-exist-identity-gate.sqlite");
  const result = run(dbArgs("hy2", fixture("hy2-healthy.yaml"), missing, fixture("material-healthy.json")));
  const gate = readGate(result);
  assert.equal(result.status, 1);
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "input_unreadable");
  assert.equal(result.stdout.includes(missing), false);
  assert.equal(result.stdout.includes("does-not-exist-identity-gate"), false);
});

test("database and identity map together are blocked", () => {
  const gate = readGate(run([
    "--surface", "japan-vless",
    "--runtime-kind", "xray",
    "--runtime-config", fixture("xray-healthy.json"),
    "--identity-map", fixture("map-healthy.json"),
    "--db", fixture("map-healthy.json"),
    "--material", fixture("material-healthy.json")
  ]));
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "input_invalid");
});

test("omitting both database and identity map is blocked", () => {
  const gate = readGate(run([
    "--surface", "japan-tuic",
    "--runtime-kind", "mihomo",
    "--runtime-config", fixture("mihomo-healthy.yaml"),
    "--material", fixture("material-healthy.json")
  ]));
  assert.equal(gate.state, "blocked");
  assert.equal(gate.code, "input_invalid");
});

test("readonly database open does not change bytes or create wal or shm", (t) => {
  const built = createControlDatabase(t, [dbRow("mihomo", PEOPLE.alpha), dbRow("mihomo", PEOPLE.beta)]);
  assert.equal(existsSync(`${built.dbPath}-wal`), false);
  assert.equal(existsSync(`${built.dbPath}-shm`), false);
  const before = fileStamp(built.dbPath);
  const result = run(dbArgs("mihomo", fixture("mihomo-healthy.yaml"), built.dbPath, fixture("material-healthy.json")));
  expectDbGate(result, {
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
  assert.deepEqual(fileStamp(built.dbPath), before);
  assert.equal(existsSync(`${built.dbPath}-wal`), false);
  assert.equal(existsSync(`${built.dbPath}-shm`), false);
});

test("database gate output does not leak principals, paths, or sqlite errors", (t) => {
  const built = createControlDatabase(t, [
    dbRow("hy2", PEOPLE.alpha),
    dbRow("hy2", PEOPLE.beta),
    dbRow("hy2", PEOPLE.stale, { retained: true })
  ]);
  const material = writeMaterial(built.directory, [PEOPLE.alpha, PEOPLE.beta, PEOPLE.stale]);
  const result = run(dbArgs("hy2", fixture("hy2-healthy.yaml"), built.dbPath, material));
  const gate = readGate(result);
  assert.equal(gate.state, "degraded");
  assert.equal(gate.stale, 1);
  assert.equal(result.stdout.includes(built.dbPath), false);
  assert.equal(result.stdout.includes(built.directory), false);
  assert.equal(result.stdout.includes(material), false);
  assert.equal(/baseline_|SQLITE|sha256:|materialDigest|edgeCredential|credentialRef/i.test(result.stdout), false);
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
