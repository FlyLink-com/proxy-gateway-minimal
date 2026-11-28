// S4B narrowed verification — regression tests for the workflow's inline
// verification script (fix/s4b-narrowed-verify, Yi's option 1).
//
// The script is extracted from .github/workflows/s4b-staging-verify.yml at
// test time, so these tests always exercise the exact script the workflow
// runs. It is executed as a subprocess against:
//   - a stub D1 HTTP server backed by a better-sqlite3 in-memory DB loaded
//     with the real migrations 0001-0006 and seeded to mirror the live
//     Staging baseline (same row counts, same authority/gate values), and
//   - a stub Worker HTTP server that answers only the guard responses the
//     acceptance expects (400 writer_epoch_required / 503
//     writer_authority_not_d1 / 400 invalid_query / 400 invalid_receipt /
//     200 healthz / 404 not_found).
// A --import preload routes the script's hardcoded api.cloudflare.com D1
// calls to the stub D1 server. No network is used and no real D1 is touched.
//
// Coverage (Yi's two regression groups):
//   (a) desired state expired OR missing -> the probes must still reach
//       the expected 400 writer_epoch_required and 503
//       writer_authority_not_d1 (guards decide before the desired-state
//       lookup);
//   (b) credential / scope / write-authority state mismatch -> the run
//       stops BEFORE the probe (BLOCKED, zero Worker requests).
// Both groups also assert: no write SQL is issued anywhere in the narrowed
// path (SELECTs only), and any baseline row change causes acceptance
// failure (a fixture row mutated mid-run -> readback FAIL).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/s4b-staging-verify.yml");
const MIGRATIONS_DIR = join(REPO_ROOT, "workers/control-plane/migrations");

// The narrowed acceptance targets the already-registered credential row
// (cred-02), node and channels from the S4B migration. The test token is a
// fixed placeholder (never a real secret); its digest is what the fixture
// credential row stores.
const KEY_ID = "key-synth-s4bv2-cred-02";
const NODE_REF = "node-synth-s4bv2-cred-01";
const CHANNELS = ["chan-synth-s4bv2-cred-hy2", "chan-synth-s4bv2-cred-vless"];
const TEST_TOKEN = "s4b-test-token-0123456789abcdef";
const TEST_TOKEN_DIGEST = createHash("sha256").update(TEST_TOKEN).digest("hex");
const DESIRED_REF = "desired-synth-s4bv2-cred-001";

// Test-only fetch shim: route the verification script's hardcoded
// api.cloudflare.com D1 calls to the stub D1 server. All other requests
// (notably the Worker probes) use the real fetch unchanged.
const PRELOAD_SOURCE = [
  "const originalFetch = globalThis.fetch;",
  "const D1_STUB = process.env.S4B_TEST_D1_STUB;",
  "globalThis.fetch = (input, init) => {",
  "  const url = typeof input === \"string\"",
  "    ? input",
  "    : input instanceof URL",
  "      ? input.href",
  "      : String(input?.url ?? input);",
  "  if (url.startsWith(\"https://api.cloudflare.com/client/v4/accounts/\")) {",
  "    return originalFetch(D1_STUB + \"/query\", init);",
  "  }",
  "  return originalFetch(input, init);",
  "};",
  "",
].join("\n");

function extractVerifyScript() {
  const yaml = readFileSync(WORKFLOW_PATH, "utf8");
  const startMarker = "cat > \"$RUNNER_TEMP/s4b-verify.mjs\" <<'S4B_EOF'";
  const start = yaml.indexOf(startMarker);
  assert.ok(start !== -1, "workflow must contain the s4b-verify.mjs heredoc");
  const scriptStart = yaml.indexOf("\n", start) + 1;
  // The closing delimiter is its own line (indented inside the YAML block).
  const endMatch = /\n[ \t]*S4B_EOF[ \t]*\r?\n/.exec(yaml.slice(scriptStart));
  assert.ok(endMatch, "workflow heredoc must be terminated by S4B_EOF");
  const raw = yaml.slice(scriptStart, scriptStart + endMatch.index + 1);
  // The YAML block scalar strips the common indentation; reproduce that so
  // the test runs the exact script the workflow runs.
  const firstLineIndent = /^( +)/.exec(raw)?.[1] ?? "";
  if (firstLineIndent) {
    return raw.split("\n").map((line) => (line.startsWith(firstLineIndent) ? line.slice(firstLineIndent.length) : line)).join("\n");
  }
  return raw;
}

function parseTables(script) {
  const m = /const TABLES = \[([\s\S]*?)\];/.exec(script);
  assert.ok(m, "script must define a TABLES array");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}

// Build the fixture DB: real migrations 0001-0006, then rows mirroring the
// live Staging baseline counts (agent_nodes 3, agent_node_channels 7,
// agent_desired_states 4, agent_desired_state_materials 7,
// agent_api_credentials 4, agent_request_nonces 5, agent_manifest_claims 2,
// agent_apply_receipts 4, agent_credential_events 0, platform_accounts 0,
// platform_portal_second_factor_challenges 0,
// platform_write_idempotency_keys 0, d1_migrations 3,
// platform_writer_authority 1, platform_writer_gate 1).
// Options override one aspect at a time for the mismatch cases.
async function createFixtureDb(options = {}) {
  const db = new Database(":memory:");
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(files.length >= 6, `expected >= 6 migrations, found ${files.length}`);
  for (const file of files) {
    db.exec(await readFile(join(MIGRATIONS_DIR, file), "utf8"));
  }
  // d1_migrations is a Cloudflare system table: no migration creates it.
  db.exec("CREATE TABLE d1_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const insertMigration = db.prepare("INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)");
  for (const name of ["0001_accounts_slice", "0002_write_idempotency", "0003_agent_protocol_slice"]) {
    insertMigration.run(name, "2026-11-27T00:00:00.000Z");
  }

  const t = "2026-11-27T06:04:49.000Z";
  const insertNode = db.prepare("INSERT INTO agent_nodes (node_ref, status, created_at, updated_at) VALUES (?, ?, ?, ?)");
  insertNode.run(NODE_REF, "active", t, t);
  insertNode.run("node-synth-other-01", "active", t, t);
  insertNode.run("node-synth-other-02", "disabled", t, t);

  const insertChannel = db.prepare("INSERT INTO agent_node_channels (node_ref, channel_ref, status) VALUES (?, ?, 'active')");
  for (const ch of CHANNELS) insertChannel.run(NODE_REF, ch);
  for (const ch of ["chan-synth-other-01-a", "chan-synth-other-01-b", "chan-synth-other-01-c"]) {
    insertChannel.run("node-synth-other-01", ch);
  }
  for (const ch of ["chan-synth-other-02-a", "chan-synth-other-02-b"]) {
    insertChannel.run("node-synth-other-02", ch);
  }

  const credentialDigest = options.credentialDigest ?? TEST_TOKEN_DIGEST;
  const channelRefsJson = options.channelRefsJson ?? JSON.stringify(CHANNELS);
  const insertCred = db.prepare(
    "INSERT INTO agent_api_credentials (key_id, token_sha256, node_ref, channel_refs_json, status, activated_at, overlap_expires_at, rotation_from_key_id, last_authenticated_at, auth_confirmed_at, revoked_at, created_at) VALUES (?, ?, ?, ?, 'active', ?, NULL, NULL, NULL, NULL, NULL, ?)",
  );
  insertCred.run(KEY_ID, credentialDigest, NODE_REF, channelRefsJson, "2026-11-27T22:04:25.000Z", "2026-11-27T22:04:25.000Z");
  insertCred.run("key-synth-other-01", sha256("other-token-01"), "node-synth-other-01", JSON.stringify(["chan-synth-other-01-a"]), t, t);
  insertCred.run("key-synth-other-02", sha256("other-token-02"), "node-synth-other-01", JSON.stringify(["chan-synth-other-01-b"]), t, t);
  insertCred.run("key-synth-other-03", sha256("other-token-03"), "node-synth-other-02", JSON.stringify(["chan-synth-other-02-a"]), t, t);

  const insertDesired = db.prepare(
    "INSERT INTO agent_desired_states (desired_state_ref, node_ref, generation, status, issued_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  if (options.desiredState !== "missing") {
    // The real failure shape from run 46110397283: the row stays active but
    // its 1-hour lease already expired (2026-11-27T07:04:50.776Z).
    insertDesired.run(DESIRED_REF, NODE_REF, "gen-synth-s4bv2-cred-001", "active", "2026-11-27T06:04:49.776Z", "2026-11-27T07:04:50.776Z", "2026-11-27T06:04:49.776Z");
  }
  insertDesired.run("desired-synth-other-01", "node-synth-other-01", "gen-synth-other-01", "active", t, "2027-01-01T00:00:00.000Z", t);
  insertDesired.run("desired-synth-other-02", "node-synth-other-02", "gen-synth-other-02", "active", t, "2027-01-01T00:00:00.000Z", t);
  // One active desired state per node (unique index); the fourth row is
  // superseded so it does not violate the index.
  insertDesired.run("desired-synth-other-03", "node-synth-other-01", "gen-synth-other-03", "superseded", t, "2027-01-01T00:00:00.000Z", t);

  const insertMaterial = db.prepare(
    "INSERT INTO agent_desired_state_materials (desired_state_ref, channel_ref, edge_credential_ref, digest) VALUES (?, ?, ?, ?)",
  );
  if (options.desiredState !== "missing") {
    insertMaterial.run(DESIRED_REF, CHANNELS[0], "edge-synth-s4bv2-cred-hy2", sha256("synthetic-material-s4bv2-cred-hy2"));
    insertMaterial.run(DESIRED_REF, CHANNELS[1], "edge-synth-s4bv2-cred-vless", sha256("synthetic-material-s4bv2-cred-vless"));
  }
  insertMaterial.run("desired-synth-other-01", "chan-synth-other-01-a", "edge-synth-other-01-a", sha256("material-other-01-a"));
  insertMaterial.run("desired-synth-other-01", "chan-synth-other-01-b", "edge-synth-other-01-b", sha256("material-other-01-b"));
  insertMaterial.run("desired-synth-other-02", "chan-synth-other-02-a", "edge-synth-other-02-a", sha256("material-other-02-a"));
  insertMaterial.run("desired-synth-other-02", "chan-synth-other-02-b", "edge-synth-other-02-b", sha256("material-other-02-b"));
  insertMaterial.run("desired-synth-other-03", "chan-synth-other-01-a", "edge-synth-other-03-a", sha256("material-other-03-a"));

  const insertNonce = db.prepare("INSERT INTO agent_request_nonces (key_id, nonce, seen_at, expires_at) VALUES (?, ?, ?, ?)");
  insertNonce.run(KEY_ID, "nonce-s4b-01", t, "2026-11-27T07:04:49.000Z");
  insertNonce.run(KEY_ID, "nonce-s4b-02", t, "2026-11-27T07:04:49.000Z");
  insertNonce.run("key-synth-other-01", "nonce-other-01", t, "2026-11-27T07:04:49.000Z");
  insertNonce.run("key-synth-other-02", "nonce-other-02", t, "2026-11-27T07:04:49.000Z");
  insertNonce.run("key-synth-other-03", "nonce-other-03", t, "2026-11-27T07:04:49.000Z");

  const insertClaim = db.prepare(
    "INSERT INTO agent_manifest_claims (idempotency_key, request_fingerprint, node_ref, channel_refs_json, desired_state_ref, generation, manifest_json, materials_json, signature, anti_replay_id, claimed_at, lease_until, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'leased', ?)",
  );
  insertClaim.run("claim-s4b-01", sha256("fp-1"), "node-synth-other-01", JSON.stringify(["chan-synth-other-01-a"]), "desired-synth-other-01", "gen-synth-other-01", "{}", "[]", "sig-1", "anti-replay-1", t, "2026-11-27T07:00:00.000Z", t);
  insertClaim.run("claim-s4b-02", sha256("fp-2"), "node-synth-other-02", JSON.stringify(["chan-synth-other-02-a"]), "desired-synth-other-02", "gen-synth-other-02", "{}", "[]", "sig-2", "anti-replay-2", t, "2026-11-27T07:00:00.000Z", t);

  const insertReceipt = db.prepare(
    "INSERT INTO agent_apply_receipts (idempotency_key, fingerprint, node_ref, channel_ref, generation, desired_state_ref, material_digests_json, status, detail_mode, key_id, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insertReceipt.run("receipt-s4b-01", sha256("rfp-1"), "node-synth-other-01", "chan-synth-other-01-a", "gen-synth-other-01", "desired-synth-other-01", "[]", "applied", "apply", "key-synth-other-01", t);
  insertReceipt.run("receipt-s4b-02", sha256("rfp-2"), "node-synth-other-02", "chan-synth-other-02-a", "gen-synth-other-02", "desired-synth-other-02", "[]", "applied", "apply", "key-synth-other-02", t);
  insertReceipt.run("receipt-s4b-03", sha256("rfp-3"), "node-synth-other-01", "chan-synth-other-01-b", "gen-synth-other-01", "desired-synth-other-01", "[]", "dry_run", "dry_run", "key-synth-other-01", t);
  insertReceipt.run("receipt-s4b-04", sha256("rfp-4"), "node-synth-other-02", "chan-synth-other-02-b", "gen-synth-other-02", "desired-synth-other-02", "[]", "applied", "apply", "key-synth-other-03", t);

  if (options.authority) {
    // The transition guard allows BWH_ACTIVE -> FROZEN with epoch + 1.
    db.prepare("UPDATE platform_writer_authority SET authority = ?, phase = ?, epoch = ?, changed_at = ? WHERE singleton = 1").run(
      options.authority.authority ?? "BWH",
      options.authority.phase,
      options.authority.epoch,
      "2026-11-27T00:00:00.000Z",
    );
  }

  // Sanity: the fixture mirrors the live Staging baseline counts.
  const counts = {};
  for (const table of ["agent_nodes", "agent_node_channels", "agent_desired_states", "agent_desired_state_materials", "agent_api_credentials", "agent_request_nonces", "agent_manifest_claims", "agent_apply_receipts", "agent_credential_events", "platform_accounts", "platform_portal_second_factor_challenges", "platform_write_idempotency_keys", "d1_migrations", "platform_writer_authority", "platform_writer_gate"]) {
    counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  }
  const expected = {
    agent_nodes: 3, agent_node_channels: 7,
    agent_desired_states: options.desiredState === "missing" ? 3 : 4,
    agent_desired_state_materials: options.desiredState === "missing" ? 5 : 7,
    agent_api_credentials: 4, agent_request_nonces: 5, agent_manifest_claims: 2,
    agent_apply_receipts: 4, agent_credential_events: 0, platform_accounts: 0,
    platform_portal_second_factor_challenges: 0, platform_write_idempotency_keys: 0,
    d1_migrations: 3, platform_writer_authority: 1, platform_writer_gate: 1,
  };
  assert.deepEqual(counts, expected, "fixture must mirror the Staging baseline counts");
  return db;
}

function startStubD1(db, tables, { onAfterBaselineSnapshot } = {}) {
  const sqlLog = [];
  const snapshotTables = new Set();
  let mutated = false;
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/query") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: false, errors: [{ message: "not_found" }] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: false, errors: [{ message: "bad_json" }] }));
        return;
      }
      const sql = payload.sql;
      const params = payload.params ?? [];
      sqlLog.push({ sql, params });
      // The script issues one `SELECT * FROM <table>` per table for the
      // baseline snapshot, then again for the readback. After all tables
      // have been served once, the baseline snapshot is complete; fire
      // the mid-run mutation hook exactly once, before the readback.
      const m = /^SELECT \* FROM (\w+)$/.exec(sql.trim());
      if (m && onAfterBaselineSnapshot && !mutated) {
        snapshotTables.add(m[1]);
        if (snapshotTables.size === tables.length) {
          mutated = true;
          onAfterBaselineSnapshot(db);
        }
      }
      let rows;
      try {
        rows = db.prepare(sql).all(...params);
      } catch (e) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: false, errors: [{ message: String(e?.message ?? e) }] }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, result: [{ results: rows }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, sqlLog, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

function startStubWorker() {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const epoch = req.headers["x-writer-epoch"];
    requests.push({ method: req.method, path: url.pathname + url.search, epoch: epoch ?? null });
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && url.pathname === "/healthz") return json(200, {});
    if (req.method === "GET" && url.pathname === "/v1/agent/desired-state") {
      if (!url.searchParams.has("channelRefs")) {
        return json(400, { error: { code: "invalid_query", message: "channelRefs required" } });
      }
      if (epoch === undefined) {
        return json(400, { error: { code: "writer_epoch_required", message: "x-writer-epoch required" } });
      }
      if (epoch === "1") {
        return json(503, { error: { code: "writer_authority_not_d1", message: "writer authority is BWH" } });
      }
      return json(400, { error: { code: "writer_epoch_required", message: "x-writer-epoch required" } });
    }
    if (req.method === "POST" && url.pathname === "/v1/agent/receipts") {
      return json(400, { error: { code: "invalid_receipt", message: "receipt is empty" } });
    }
    return json(404, { error: { code: "not_found", message: "unknown route" } });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

async function runVerification({ fixtureOptions = {}, mutate = null } = {}) {
  const script = extractVerifyScript();
  const tables = parseTables(script);
  const tmpDir = await mkdtemp(join(tmpdir(), "s4b-narrowed-"));
  const scriptPath = join(tmpDir, "s4b-verify.mjs");
  const preloadPath = join(tmpDir, "s4b-preload.mjs");
  await writeFile(scriptPath, script);
  await writeFile(preloadPath, PRELOAD_SOURCE);
  const db = await createFixtureDb(fixtureOptions);
  const d1 = await startStubD1(db, tables, { onAfterBaselineSnapshot: mutate ? (db2) => mutate(db2) : undefined });
  const worker = await startStubWorker();
  const env = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: "test-cf-token-placeholder",
    S4B_TEST_AGENT_TOKEN: TEST_TOKEN,
    S4B_ACCOUNT_ID: "test-account-id",
    S4B_DATABASE_ID: "test-database-id",
    S4B_WORKER_URL: worker.url,
    S4B_KEY_ID: KEY_ID,
    S4B_NODE_REF: NODE_REF,
    S4B_CHANNEL_REFS: CHANNELS.join(","),
    RUNNER_TEMP: tmpDir,
    GITHUB_WORKSPACE: REPO_ROOT,
    S4B_TEST_D1_STUB: d1.url,
  };
  let exit;
  let stdout = "";
  let stderr = "";
  try {
    const child = spawn(process.execPath, ["--import", preloadPath, scriptPath], { env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    exit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("verification script timed out after 60s"));
      }, 60_000);
      child.on("close", (code) => { clearTimeout(timer); resolve(code ?? 1); });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
  } finally {
    await d1.close();
    await worker.close();
    db.close();
  }
  let results = null;
  try {
    results = JSON.parse(await readFile(join(tmpDir, "s4b-results", "results.json"), "utf8"));
  } catch {
    // results stays null; assertions below fail with the exit/stdout context.
  }
  await rm(tmpDir, { recursive: true, force: true });
  return { exit, stdout, stderr, results, d1Sql: d1.sqlLog, workerRequests: worker.requests };
}

function assertAllSelect(sqlLog) {
  for (const { sql } of sqlLog) {
    assert.match(sql.trim(), /^SELECT\b/i, `expected only SELECT statements, got: ${sql}`);
  }
}

function assertNoProbeRan(results) {
  for (const name of ["formal_entry", "probe_no_epoch", "probe_epoch_1", "probe_receipts_empty", "probe_route_shape", "probe_healthz", "probe_unknown_route", "node_apply", "worker_receipt", "readback"]) {
    assert.equal(results.steps[name], undefined, `step ${name} must not have run`);
  }
}

function assertPassingRun({ exit, results, stdout }) {
  assert.equal(exit, 0, `expected exit 0, got ${exit}; stdout=${stdout}`);
  assert.ok(results, "results.json must exist");
  assert.equal(results.problems, 0, `expected 0 problems, got ${results.problems}: ${JSON.stringify(results.steps)}`);
  assert.match(results.conclusion, /^evidence collected/);
  const steps = results.steps;
  for (const name of ["env", "baseline", "precheck_credential", "verify_registered_state", "formal_entry", "probe_no_epoch", "probe_epoch_1", "probe_receipts_empty", "probe_route_shape", "probe_healthz", "probe_unknown_route"]) {
    assert.equal(steps[name]?.conclusion, "PASS", `${name} should PASS, got ${JSON.stringify(steps[name])}`);
  }
  assert.equal(steps.node_apply?.conclusion, "NOT_RUN");
  assert.equal(steps.worker_receipt?.conclusion, "NOT_RUN");
  assert.equal(steps.readback?.conclusion, "PASS");
  // No fixture-registration steps exist in the narrowed path.
  for (const name of ["register_node", "register_channels", "register_credential", "verify_credential", "desired_state", "verify_desired_state"]) {
    assert.equal(steps[name], undefined, `${name} must not exist in the narrowed path`);
  }
}

test("the workflow verification script issues no write SQL and has no fixture-registration path", () => {
  const script = extractVerifyScript();
  assert.ok(!/\bINSERT\s+INTO\b/i.test(script), "script must not contain INSERT INTO");
  assert.ok(!/\bUPDATE\s+\w+\s+SET\b/i.test(script), "script must not contain UPDATE ... SET");
  assert.ok(!/\bDELETE\s+FROM\b/i.test(script), "script must not contain DELETE FROM");
  assert.ok(!/\bREPLACE\s+INTO\b/i.test(script), "script must not contain REPLACE INTO");
  assert.ok(script.includes("verify_registered_state"), "script must verify the registered state");
  for (const gone of ["expectedNewKeys", "register_credential", "verify_desired_state", "DESIRED_REF", "GENERATION", "onlyOwnRows", "unexpectedNew"]) {
    assert.ok(!script.includes(gone), `script must not contain ${gone}`);
  }
});

test("the extracted verification script is syntactically valid", async () => {
  const script = extractVerifyScript();
  const tmpDir = await mkdtemp(join(tmpdir(), "s4b-narrowed-check-"));
  const scriptPath = join(tmpDir, "s4b-verify.mjs");
  await writeFile(scriptPath, script);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--check", scriptPath], { stdio: "ignore" });
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`node --check exited ${code}`))));
      child.on("error", reject);
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("narrowed acceptance passes with an expired desired state (group a)", { timeout: 120_000 }, async () => {
  const run = await runVerification();
  assertPassingRun(run);
  assertAllSelect(run.d1Sql);
  // The formal entry and both guard probes reached the Worker.
  const desiredGets = run.workerRequests.filter((r) => r.path.startsWith("/v1/agent/desired-state"));
  assert.ok(desiredGets.length >= 3, `expected >= 3 desired-state GETs (formal entry + 2 probes), got ${desiredGets.length}`);
});

test("narrowed acceptance passes with no desired state (group a)", { timeout: 120_000 }, async () => {
  const run = await runVerification({ fixtureOptions: { desiredState: "missing" } });
  assertPassingRun(run);
  assertAllSelect(run.d1Sql);
  const desiredGets = run.workerRequests.filter((r) => r.path.startsWith("/v1/agent/desired-state"));
  assert.ok(desiredGets.length >= 3, `expected >= 3 desired-state GETs (formal entry + 2 probes), got ${desiredGets.length}`);
});

test("credential digest mismatch stops before the probe (group b)", { timeout: 120_000 }, async () => {
  const run = await runVerification({ fixtureOptions: { credentialDigest: sha256("a-different-test-token-000000") } });
  assert.equal(run.exit, 1, `expected exit 1, got ${run.exit}; stdout=${run.stdout}`);
  assert.equal(run.results.steps.precheck_credential?.conclusion, "BLOCKED");
  assert.equal(run.results.steps.precheck_credential?.reason, "credential_precheck_mismatch");
  assertNoProbeRan(run.results);
  assert.equal(run.workerRequests.length, 0, "no Worker request may be issued after a credential mismatch");
  assertAllSelect(run.d1Sql);
});

test("channel scope mismatch stops before the probe (group b)", { timeout: 120_000 }, async () => {
  const run = await runVerification({ fixtureOptions: { channelRefsJson: JSON.stringify([CHANNELS[0]]) } });
  assert.equal(run.exit, 1, `expected exit 1, got ${run.exit}; stdout=${run.stdout}`);
  assert.equal(run.results.steps.precheck_credential?.conclusion, "BLOCKED");
  assert.equal(run.results.steps.precheck_credential?.reason, "credential_precheck_mismatch");
  assertNoProbeRan(run.results);
  assert.equal(run.workerRequests.length, 0, "no Worker request may be issued after a scope mismatch");
  assertAllSelect(run.d1Sql);
});

test("write-authority mismatch stops before the probe (group b)", { timeout: 120_000 }, async () => {
  const run = await runVerification({ fixtureOptions: { authority: { phase: "FROZEN", epoch: 2 } } });
  assert.equal(run.exit, 1, `expected exit 1, got ${run.exit}; stdout=${run.stdout}`);
  assert.equal(run.results.steps.precheck_credential?.conclusion, "PASS");
  assert.equal(run.results.steps.verify_registered_state?.conclusion, "BLOCKED");
  assert.equal(run.results.steps.verify_registered_state?.reason, "writer_authority_unexpected");
  assertNoProbeRan(run.results);
  assert.equal(run.workerRequests.length, 0, "no Worker request may be issued after an authority mismatch");
  assertAllSelect(run.d1Sql);
});

test("any baseline row change fails the readback", { timeout: 120_000 }, async () => {
  const run = await runVerification({
    mutate: (db) => {
      db.prepare("UPDATE agent_nodes SET status = 'disabled' WHERE node_ref = ?").run("node-synth-other-01");
    },
  });
  assert.equal(run.exit, 1, `expected exit 1, got ${run.exit}; stdout=${run.stdout}`);
  // The earlier steps still pass: only the readback catches the change.
  assert.equal(run.results.steps.verify_registered_state?.conclusion, "PASS");
  assert.equal(run.results.steps.formal_entry?.conclusion, "PASS");
  assert.equal(run.results.steps.readback?.conclusion, "FAIL");
  assert.equal(run.results.steps.readback?.rowsReconciled, false);
  assert.deepEqual(run.results.steps.readback?.rowReconciliation?.agent_nodes?.modified, ['["node-synth-other-01"]']);
  // The script itself still issued no writes; the change came from outside.
  assertAllSelect(run.d1Sql);
});
