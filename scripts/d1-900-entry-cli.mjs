// D1 Stage 2 — controlled manual entry CLI for the #900 four modules
// (card 12).
//
// This CLI wires the four #900 modules together behind one explicit,
// human-triggered entry point. It changes NO module behaviour: every
// call below goes through the modules' own exported functions, and
// every module-level guard (synthetic snapshot ids, KEEP-only columns,
// fail-closed receipts) still applies.
//
// Scope and honesty:
// - Synthetic data only. Snapshot ids must match s2s-[a-z0-9-]{3,80};
//   the modules reject anything else. The snapshot builder only ever
//   materializes synthetic fixtures.
// - No production access. --db-path values that name a known
//   production database file are refused outright (see
//   assertSafeDbPath). This CLI never opens a database it did not
//   build or that the operator did not explicitly name.
// - No network, no E4 DDL, no real keys. Nothing here talks to D1,
//   Cloudflare, or any remote service. Nothing here reads env secrets.
// - Manual trigger only. There is no timer, no watcher, no auto-run.
//   Every invocation is one explicit operator command.
// - The freeze bundle built here never transitions phase
//   (phaseTransition is always "none" in the module). The FROZEN
//   transition is a separate coordinator decision, not this CLI.
// - Scheduler-quiescence evidence is operator-supplied, not
//   independently observed: the module records that limitation in the
//   receipt itself. --all-quiesced is the operator asserting, for
//   every known scheduler job, that positive quiescence evidence
//   exists; it is not a measurement.
//
// Usage: node scripts/d1-900-entry-cli.mjs <command> [options]
// Run with --help (or no command) for the command list. Exit codes:
// 0 success, 1 module/operator error (JSON error on stderr),
// 2 usage error.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import Database from "better-sqlite3";

import {
  buildSyntheticSourceSnapshot,
  verifySyntheticSourceSnapshot,
  syntheticMaterialDigest,
  SNAPSHOT_TABLES,
} from "../server/services/platform/d1-stage2-source-manifest.mjs";
import {
  exportPage,
  verifyExportPage,
  createHighWaterMark,
  buildIncrementalManifest,
  verifyIncrementalManifest,
} from "../server/services/platform/d1-stage2-source-export.mjs";
import {
  buildCredentialVersionManifest,
  verifyCredentialVersionManifest,
  detectCredentialRotations,
} from "../server/services/platform/d1-stage2-credential-reconciliation.mjs";
import {
  buildWriteLockReceipt,
  buildSchedulerQuiescenceReceipt,
  buildCallbackDrainReceipt,
  buildHwmCompletenessReceipt,
  buildFreezeReadinessBundle,
  verifyFreezeReadinessBundle,
  buildUnfencedWriterCoverage,
  SCHEDULER_JOBS,
} from "../server/services/platform/d1-stage2-freeze-drain.mjs";
import {
  buildCheckpointManifest,
} from "../server/services/platform/source-delta.mjs";

const SNAPSHOT_ID_PATTERN = /^s2s-[a-z0-9-]{3,80}$/;
const FIXTURE_NOW = "2026-11-20T00:00:00.000Z";
const SMOKE_SNAPSHOT_A = "s2s-900-entry-smoke-a";
const SMOKE_SNAPSHOT_B = "s2s-900-entry-smoke-b";

// Production database filenames this CLI must never touch, even if
// the operator names them explicitly. The modules themselves only
// work on synthetic fixtures, but the filename guard stops a
// fat-fingered --db-path from ever pointing this CLI at live state.
const FORBIDDEN_DB_BASENAMES = new Set([
  "subscription-control.sqlite",
  "subscription-control.db",
  "subscriptions.sqlite",
  "subscriptions.db",
]);
const FORBIDDEN_DB_PATH_FRAGMENTS = [
  "/opt/proxy-gateway-minimal-candidate",
  "subscription-control",
];

export class EntryCliError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EntryCliError";
    this.code = code;
  }
}

function cliError(code, message) {
  return new EntryCliError(code, message);
}

function assertSafeDbPath(dbPath) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw cliError("entry_db_path_invalid", "--db-path is required and must be a non-empty path");
  }
  const base = basename(resolve(dbPath));
  if (FORBIDDEN_DB_BASENAMES.has(base)) {
    throw cliError("entry_db_path_forbidden", `refusing production database filename: ${base}`);
  }
  for (const fragment of FORBIDDEN_DB_PATH_FRAGMENTS) {
    if (dbPath.includes(fragment)) {
      throw cliError("entry_db_path_forbidden", `refusing database path containing a production fragment: ${fragment}`);
    }
  }
  return dbPath;
}

function assertSnapshotId(snapshotId) {
  if (typeof snapshotId !== "string" || !SNAPSHOT_ID_PATTERN.test(snapshotId)) {
    throw cliError("entry_snapshot_id_invalid", "--snapshot-id must match s2s-[a-z0-9-]{3,80}");
  }
  return snapshotId;
}

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key.length === 0) throw cliError("entry_usage", "bare -- is not a valid option");
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

function requireOption(options, name) {
  const value = options[name];
  if (value === undefined || value === true || value === "") {
    throw cliError("entry_usage", `--${name} is required`);
  }
  return value;
}

function optionalOption(options, name, fallback = undefined) {
  const value = options[name];
  if (value === undefined || value === true) return fallback;
  return value;
}

function parseJsonOption(options, name, fallback = undefined) {
  const raw = optionalOption(options, name, undefined);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw cliError("entry_usage", `--${name} must be valid JSON`);
  }
}

function readJsonFile(path, what) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw cliError("entry_read_failed", `cannot read ${what} as JSON: ${path}`);
  }
}

// Emit a command result. Without --out, the full wrapped result goes
// to stdout. With --out, the bare artifact is written to the file (so
// the file is exactly what the matching verify command reads back)
// and only a short {ok, out} summary goes to stdout.
function emit(options, payload, artifact) {
  const out = optionalOption(options, "out", undefined);
  if (out) {
    try {
      writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    } catch {
      throw cliError("entry_write_failed", `cannot write output file: ${out}`);
    }
    process.stdout.write(`${JSON.stringify({ ok: true, out })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function openDb(dbPath, { readonly = false } = {}) {
  assertSafeDbPath(dbPath);
  try {
    return new Database(dbPath, readonly ? { readonly: true } : {});
  } catch (error) {
    throw cliError("entry_db_open_failed", `cannot open database ${dbPath}: ${error.message}`);
  }
}

const SINGLE_PK_TABLES = [
  { table: "platform_accounts", pk: "id" },
  { table: "platform_entitlements", pk: "id" },
  { table: "platform_schema_migrations", pk: "migration_id" },
];

const HELP = `d1-900-entry-cli — controlled manual entry for the #900 four modules (synthetic data only)

Usage: node scripts/d1-900-entry-cli.mjs <command> [options]

Commands:
  snapshot build --snapshot-id <s2s-...> [--db-path <path>] [--out <path>]
    Build a synthetic source snapshot (source-manifest module) and emit its metadata.
  snapshot verify --db-path <path> --metadata <path>
    Recompute a snapshot's digests from the database and compare with its metadata.
  export page --db-path <path> --table <table> --pk <col[,col]> --snapshot-id <s2s-...>
      [--limit <1..20>] [--after-pk <json>] [--out <path>]
    Export one bounded, KEEP-only page of a table (source-export module).
  export verify --page <path>
    Verify an export page (column authorization, hash, order, token).
  export manifest --db-path <path> --snapshot-id <s2s-...> --previous-snapshot-id <s2s-...>
      --seq <n> [--checkpoint <path>] [--prev-credential-manifest <path>]
      [--cur-credential-manifest <path>] [--out <path>]
    Build the incremental manifest since a checkpoint (source-export module).
    Without --checkpoint, the checkpoint is built from the current database
    (zero deltas unless rows changed since the snapshot was built).
  export verify-manifest --manifest <path> [--previous-manifest <path>]
    Verify an incremental manifest (hash, and seq/lineage against the previous one).
  credential manifest --db-path <path> --snapshot-id <s2s-...> [--out <path>]
    Build the credential version manifest (credential-reconciliation module).
  credential verify --manifest <path>
    Verify a credential version manifest.
  credential rotations --previous <path> --current <path>
    Diff two verified credential version manifests.
  freeze write-lock --db-path <path> --snapshot-id <s2s-...> --checkpoint-id <id> [--out <path>]
    Build the write-lock receipt (freeze-drain module, receipt 1).
  freeze scheduler --snapshot-id <s2s-...> (--evidence <json> | --all-quiesced) [--out <path>]
    Build the scheduler-quiescence receipt (receipt 2). Evidence is
    operator-supplied positive evidence per job; --all-quiesced asserts
    every known job is quiesced. The receipt records that it does not
    independently observe the production scheduler.
  freeze callback --snapshot-id <s2s-...> --callbacks <json> [--out <path>]
    Build the callback-drain receipt (receipt 3). JSON list of {id, settled}.
  freeze hwm --snapshot-id <s2s-...> --seq <n> --manifest-seq <n> --row-counts <json> [--out <path>]
    Build the HWM-completeness receipt (receipt 4).
  freeze bundle --snapshot-id <s2s-...> --write-lock <path> --scheduler <path>
      --callback <path> --hwm <path> [--out <path>]
    Bundle the four receipts. Never transitions phase (phaseTransition is "none").
  freeze verify-bundle --bundle <path>
    Verify a freeze readiness bundle.
  freeze coverage [--fenced <csv>]
    Coverage report over the unfenced-writer baseline (U-F1..U-F18, U-01..U-10).
  smoke [--dir <path>]
    Full synthetic chain in a fresh temp dir: snapshot build + verify, export
    pages + verify, credential manifests + rotation detection, incremental
    manifest + verify, all four freeze receipts + bundle + verify, coverage.
    Mutates one entitlement row and rotates one credential between the two
    manifests so the delta path is exercised, not just the no-change path.

Guards: snapshot ids must be s2s-...; production database filenames are
refused; no network, no E4 DDL, no real keys. Exit codes: 0 ok, 1 module /
operator error, 2 usage error.
`;

function cmdSnapshotBuild(options) {
  const snapshotId = assertSnapshotId(requireOption(options, "snapshot-id"));
  const dbPath = optionalOption(options, "db-path", undefined);
  if (dbPath) assertSafeDbPath(dbPath);
  const { metadata, db } = buildSyntheticSourceSnapshot({ dbPath: dbPath ?? null, snapshotId, now: FIXTURE_NOW });
  try {
    emit(options, { ok: true, command: "snapshot build", metadata }, metadata);
  } finally {
    db.close();
  }
}

function cmdSnapshotVerify(options) {
  const dbPath = requireOption(options, "db-path");
  const metadata = readJsonFile(requireOption(options, "metadata"), "snapshot metadata");
  const db = openDb(dbPath, { readonly: true });
  try {
    const result = verifySyntheticSourceSnapshot(db, metadata);
    process.stdout.write(`${JSON.stringify({ ok: true, command: "snapshot verify", ...result }, null, 2)}\n`);
  } finally {
    db.close();
  }
}

function cmdExportPage(options) {
  const dbPath = requireOption(options, "db-path");
  const table = requireOption(options, "table");
  const pkRaw = requireOption(options, "pk");
  const snapshotId = assertSnapshotId(requireOption(options, "snapshot-id"));
  const limitRaw = optionalOption(options, "limit", undefined);
  const afterPk = parseJsonOption(options, "after-pk", null);
  const pk = pkRaw.includes(",") ? pkRaw.split(",").map((part) => part.trim()).filter(Boolean) : pkRaw;
  const limit = limitRaw === undefined ? undefined : Number.parseInt(limitRaw, 10);
  if (limitRaw !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 20)) {
    throw cliError("entry_usage", "--limit must be an integer between 1 and 20");
  }
  const db = openDb(dbPath, { readonly: true });
  try {
    const page = exportPage(db, { table, pk, snapshotId, afterPk, ...(limit === undefined ? {} : { limit }) });
    emit(options, { ok: true, command: "export page", page }, page);
  } finally {
    db.close();
  }
}

function cmdExportVerify(options) {
  const page = readJsonFile(requireOption(options, "page"), "export page");
  const result = verifyExportPage(page);
  process.stdout.write(`${JSON.stringify({ ok: true, command: "export verify", valid: result }, null, 2)}\n`);
}

function cmdExportManifest(options) {
  const dbPath = requireOption(options, "db-path");
  const snapshotId = assertSnapshotId(requireOption(options, "snapshot-id"));
  const previousSnapshotId = assertSnapshotId(requireOption(options, "previous-snapshot-id"));
  const seqRaw = requireOption(options, "seq");
  const seq = Number.parseInt(seqRaw, 10);
  if (!Number.isInteger(seq) || seq < 0) throw cliError("entry_usage", "--seq must be a non-negative integer");
  const checkpointPath = optionalOption(options, "checkpoint", undefined);
  const prevCredPath = optionalOption(options, "prev-credential-manifest", undefined);
  const curCredPath = optionalOption(options, "cur-credential-manifest", undefined);
  const previousCredentialManifest = prevCredPath ? readJsonFile(prevCredPath, "previous credential manifest") : undefined;
  const currentCredentialManifest = curCredPath ? readJsonFile(curCredPath, "current credential manifest") : undefined;
  const db = openDb(dbPath, { readonly: true });
  try {
    const checkpoint = checkpointPath
      ? readJsonFile(checkpointPath, "checkpoint manifest")
      : buildCheckpointManifest(db, { tables: SINGLE_PK_TABLES, snapshotId: previousSnapshotId });
    const highWaterMark = createHighWaterMark({ seq, snapshotId });
    const manifest = buildIncrementalManifest(db, {
      tables: SINGLE_PK_TABLES,
      checkpoint,
      previousCredentialManifest,
      currentCredentialManifest,
      highWaterMark,
      previousSnapshotId,
    });
    emit(options, { ok: true, command: "export manifest", manifest }, manifest);
  } finally {
    db.close();
  }
}

function cmdExportVerifyManifest(options) {
  const manifest = readJsonFile(requireOption(options, "manifest"), "incremental manifest");
  const previousPath = optionalOption(options, "previous-manifest", undefined);
  const previousManifest = previousPath ? readJsonFile(previousPath, "previous incremental manifest") : null;
  const result = verifyIncrementalManifest(manifest, previousManifest);
  process.stdout.write(`${JSON.stringify({ ok: true, command: "export verify-manifest", ...result }, null, 2)}\n`);
}

function cmdCredentialManifest(options) {
  const dbPath = requireOption(options, "db-path");
  const snapshotId = assertSnapshotId(requireOption(options, "snapshot-id"));
  const db = openDb(dbPath, { readonly: true });
  try {
    const manifest = buildCredentialVersionManifest(db, { snapshotId });
    emit(options, { ok: true, command: "credential manifest", manifest }, manifest);
  } finally {
    db.close();
  }
}

function cmdCredentialVerify(options) {
  const manifest = readJsonFile(requireOption(options, "manifest"), "credential version manifest");
  const result = verifyCredentialVersionManifest(manifest);
  process.stdout.write(`${JSON.stringify({ ok: true, command: "credential verify", valid: result }, null, 2)}\n`);
}

function cmdCredentialRotations(options) {
  const previous = readJsonFile(requireOption(options, "previous"), "previous credential manifest");
  const current = readJsonFile(requireOption(options, "current"), "current credential manifest");
  const rotations = detectCredentialRotations(previous, current);
  process.stdout.write(`${JSON.stringify({ ok: true, command: "credential rotations", ...rotations }, null, 2)}\n`);
}

function cmdFreezeWriteLock(options) {
  const dbPath = requireOption(options, "db-path");
  const snapshotId = assertSnapshotId(requireOption(options, "snapshot-id"));
  const checkpointId = requireOption(options, "checkpoint-id");
  const db = openDb(dbPath, { readonly: true });
  try {
    const receipt = buildWriteLockReceipt(db, { snapshotId, checkpointId, outstandingJobs: [] });
    emit(options, { ok: true, command: "freeze write-lock", receipt }, receipt);
  } finally {
    db.close();
  }
}

function cmdFreezeScheduler(options) {
  const snapshotId = assertSnapshotId(requireOption(options, "snapshot-id"));
  let evidence;
  if (options["all-quiesced"] === true) {
    evidence = Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true]));
  } else {
    evidence = parseJsonOption(options, "evidence", undefined);
    if (evidence === undefined) {
      throw cliError("entry_usage", "freeze scheduler requires --evidence <json> or --all-quiesced");
    }
  }
  const receipt = buildSchedulerQuiescenceReceipt({ evidence, snapshotId });
  emit(options, { ok: true, command: "freeze scheduler", receipt }, receipt);
}

function cmdFreezeCallback(options) {
  const snapshotId = assertSnapshotId(requireOption(options, "snapshot-id"));
  const callbacks = parseJsonOption(options, "callbacks", undefined);
  if (!Array.isArray(callbacks)) throw cliError("entry_usage", "--callbacks must be a JSON list of {id, settled}");
  const receipt = buildCallbackDrainReceipt({ callbacks, snapshotId });
  emit(options, { ok: true, command: "freeze callback", receipt }, receipt);
}

function cmdFreezeHwm(options) {
  const snapshotId = assertSnapshotId(requireOption(options, "snapshot-id"));
  const seq = Number.parseInt(requireOption(options, "seq"), 10);
  const manifestSeq = Number.parseInt(requireOption(options, "manifest-seq"), 10);
  const rowCounts = parseJsonOption(options, "row-counts", undefined);
  if (!Number.isInteger(seq) || seq < 0) throw cliError("entry_usage", "--seq must be a non-negative integer");
  if (!Number.isInteger(manifestSeq) || manifestSeq < 0) throw cliError("entry_usage", "--manifest-seq must be a non-negative integer");
  if (!rowCounts || typeof rowCounts !== "object" || Array.isArray(rowCounts)) {
    throw cliError("entry_usage", "--row-counts must be a JSON object of table -> count");
  }
  const receipt = buildHwmCompletenessReceipt({
    highWaterMark: createHighWaterMark({ seq, snapshotId }),
    manifestSeq,
    rowCounts,
    snapshotId,
  });
  emit(options, { ok: true, command: "freeze hwm", receipt }, receipt);
}

function cmdFreezeBundle(options) {
  const snapshotId = assertSnapshotId(requireOption(options, "snapshot-id"));
  // Receipt files written by this CLI are wrapped as {ok, command,
  // receipt}; bare receipts never carry ok === true, so unwrap only
  // the CLI wrapper — never a receipt's own inner fields (the
  // write-lock receipt itself has a "receipt" member).
  const unwrap = (path, what) => {
    const parsed = readJsonFile(path, what);
    if (parsed && typeof parsed === "object" && parsed.ok === true && "receipt" in parsed) return parsed.receipt;
    return parsed;
  };
  const writeLock = unwrap(requireOption(options, "write-lock"), "write-lock receipt");
  const schedulerQuiescence = unwrap(requireOption(options, "scheduler"), "scheduler receipt");
  const callbackDrain = unwrap(requireOption(options, "callback"), "callback receipt");
  const hwmCompleteness = unwrap(requireOption(options, "hwm"), "hwm receipt");
  const bundle = buildFreezeReadinessBundle({
    snapshotId,
    writeLock,
    schedulerQuiescence,
    callbackDrain,
    hwmCompleteness,
  });
  emit(options, { ok: true, command: "freeze bundle", bundle }, bundle);
}

function cmdFreezeVerifyBundle(options) {
  const bundle = readJsonFile(requireOption(options, "bundle"), "freeze readiness bundle");
  const bare = bundle && typeof bundle === "object" && "bundle" in bundle ? bundle.bundle : bundle;
  const result = verifyFreezeReadinessBundle(bare);
  process.stdout.write(`${JSON.stringify({ ok: true, command: "freeze verify-bundle", ...result }, null, 2)}\n`);
}

function cmdFreezeCoverage(options) {
  const fencedRaw = optionalOption(options, "fenced", "");
  const fencedIds = fencedRaw === "" ? [] : fencedRaw.split(",").map((part) => part.trim()).filter(Boolean);
  const report = buildUnfencedWriterCoverage({ fencedIds });
  process.stdout.write(`${JSON.stringify({ ok: true, command: "freeze coverage", ...report }, null, 2)}\n`);
}

// Full synthetic chain in a fresh temp dir. Mutates one entitlement
// row and rotates one credential between the two manifests so the
// delta path is exercised, not just the no-change path. All fixture
// values are synthetic (s2s- prefix); nothing leaves the temp dir
// except the printed summary.
function cmdSmoke(options) {
  const dir = optionalOption(options, "dir", undefined) ?? mkdtempSync(join(tmpdir(), "d1-900-entry-smoke-"));
  const dbPath = join(dir, "snapshot.sqlite");
  const steps = {};
  const { metadata, db } = buildSyntheticSourceSnapshot({ dbPath, snapshotId: SMOKE_SNAPSHOT_A, now: FIXTURE_NOW });
  try {
    steps.snapshotBuild = { snapshotId: metadata.sourceSnapshotId, snapshotHash: metadata.snapshotHash };
    steps.snapshotVerify = verifySyntheticSourceSnapshot(db, metadata);
    const checkpoint = buildCheckpointManifest(db, { tables: SINGLE_PK_TABLES, snapshotId: SMOKE_SNAPSHOT_A });
    const credentialManifestA = buildCredentialVersionManifest(db, { snapshotId: SMOKE_SNAPSHOT_A });
    verifyCredentialVersionManifest(credentialManifestA);

    // One entitlement update + one credential rotation (same row count,
    // so only the version manifest can see the rotation).
    db.prepare(`update platform_entitlements set status = 'suspended' where id = 's2s-entitlement-001'`).run();
    db.prepare(
      `update platform_portal_edge_credentials set edge_credential_ref = ?, edge_material_digest = ? where request_id = ? and edge_channel_ref = ?`,
    ).run("s2s-cred-001-rotated", syntheticMaterialDigest("s2s-cred-001-rotated"), "s2s-request-001", "s2s-channel-a");

    const credentialManifestB = buildCredentialVersionManifest(db, { snapshotId: SMOKE_SNAPSHOT_B });
    verifyCredentialVersionManifest(credentialManifestB);
    const rotations = detectCredentialRotations(credentialManifestA, credentialManifestB);
    steps.credentialRotations = rotations;

    const pages = {};
    for (const spec of SNAPSHOT_TABLES) {
      const page = exportPage(db, { table: spec.table, pk: spec.pk, snapshotId: SMOKE_SNAPSHOT_B });
      verifyExportPage(page);
      pages[spec.table] = { rowCount: page.rowCount, contentHash: page.contentHash };
    }
    steps.exportPages = pages;

    const highWaterMark = createHighWaterMark({ seq: 1, snapshotId: SMOKE_SNAPSHOT_B });
    const manifest = buildIncrementalManifest(db, {
      tables: SINGLE_PK_TABLES,
      checkpoint,
      previousCredentialManifest: credentialManifestA,
      currentCredentialManifest: credentialManifestB,
      highWaterMark,
      previousSnapshotId: SMOKE_SNAPSHOT_A,
    });
    steps.incrementalManifest = verifyIncrementalManifest(manifest);
    steps.incrementalSummary = manifest.summary;

    const writeLock = buildWriteLockReceipt(db, { snapshotId: SMOKE_SNAPSHOT_B, checkpointId: SMOKE_SNAPSHOT_B, outstandingJobs: [] });
    const schedulerQuiescence = buildSchedulerQuiescenceReceipt({
      evidence: Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true])),
      snapshotId: SMOKE_SNAPSHOT_B,
    });
    const callbackDrain = buildCallbackDrainReceipt({ callbacks: [], snapshotId: SMOKE_SNAPSHOT_B });
    const hwmCompleteness = buildHwmCompletenessReceipt({
      highWaterMark,
      manifestSeq: manifest.seq,
      rowCounts: metadata.tableRowCounts,
      snapshotId: SMOKE_SNAPSHOT_B,
    });
    const bundle = buildFreezeReadinessBundle({
      snapshotId: SMOKE_SNAPSHOT_B,
      writeLock,
      schedulerQuiescence,
      callbackDrain,
      hwmCompleteness,
    });
    steps.freezeBundle = verifyFreezeReadinessBundle(bundle);
    steps.freezeBundleHash = bundle.bundleHash;
    steps.coverage = buildUnfencedWriterCoverage({ fencedIds: [] });
  } finally {
    db.close();
    if (optionalOption(options, "dir", undefined) === undefined) rmSync(dir, { recursive: true, force: true });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command: "smoke", dir, steps }, null, 2)}\n`);
}

const COMMANDS = {
  "snapshot build": cmdSnapshotBuild,
  "snapshot verify": cmdSnapshotVerify,
  "export page": cmdExportPage,
  "export verify": cmdExportVerify,
  "export manifest": cmdExportManifest,
  "export verify-manifest": cmdExportVerifyManifest,
  "credential manifest": cmdCredentialManifest,
  "credential verify": cmdCredentialVerify,
  "credential rotations": cmdCredentialRotations,
  "freeze write-lock": cmdFreezeWriteLock,
  "freeze scheduler": cmdFreezeScheduler,
  "freeze callback": cmdFreezeCallback,
  "freeze hwm": cmdFreezeHwm,
  "freeze bundle": cmdFreezeBundle,
  "freeze verify-bundle": cmdFreezeVerifyBundle,
  "freeze coverage": cmdFreezeCoverage,
  smoke: cmdSmoke,
};

export function runD1900EntryCli(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  const { options, positional } = parseArgs(argv);
  const command = positional.length === 2 ? `${positional[0]} ${positional[1]}` : positional[0] ?? "";
  const handler = COMMANDS[command];
  if (!handler) {
    throw cliError("entry_usage", `unknown command: ${positional.join(" ") || "(none)"}. Run with --help for the command list.`);
  }
  handler(options);
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  try {
    process.exitCode = runD1900EntryCli();
  } catch (error) {
    if (error instanceof EntryCliError && error.code === "entry_usage") {
      process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2)}\n`);
      process.stderr.write(HELP);
      process.exitCode = 2;
    } else {
      const code = error?.code ?? "entry_error";
      process.stderr.write(`${JSON.stringify({ ok: false, error: { code, message: error?.message ?? String(error) } }, null, 2)}\n`);
      process.exitCode = 1;
    }
  }
}
