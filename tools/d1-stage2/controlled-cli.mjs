#!/usr/bin/env node
// D1 Stage 2 controlled CLI: synthetic-only manual integration caller.
// No production database, remote service, credential, scheduler, or cutover path.

import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

import {
  buildSyntheticSourceSnapshot,
  syntheticMaterialDigest,
  verifySyntheticSourceSnapshot,
} from "../../server/services/platform/d1-stage2-source-manifest.mjs";
import {
  buildCredentialVersionManifest,
  verifyCredentialVersionManifest,
} from "../../server/services/platform/d1-stage2-credential-reconciliation.mjs";
import {
  buildCheckpointManifest,
} from "../../server/services/platform/source-delta.mjs";
import {
  buildIncrementalManifest,
  createHighWaterMark,
  exportPage,
  verifyExportPage,
  verifyIncrementalManifest,
} from "../../server/services/platform/d1-stage2-source-export.mjs";
import {
  SCHEDULER_JOBS,
  buildCallbackDrainReceipt,
  buildFreezeReadinessBundle,
  buildHwmCompletenessReceipt,
  buildSchedulerQuiescenceReceipt,
  buildUnfencedWriterCoverage,
  buildWriteLockReceipt,
  verifyFreezeReadinessBundle,
} from "../../server/services/platform/d1-stage2-freeze-drain.mjs";

const DEFAULT_SNAPSHOT_ID = "s2s-controlled-cli-001";
const SNAPSHOT_ID_PATTERN = /^s2s-[a-z0-9-]{3,80}$/;
const OPERATOR_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;
const CHECKPOINT_TABLES = Object.freeze([
  Object.freeze({ table: "platform_accounts", pk: "id" }),
  Object.freeze({ table: "platform_entitlements", pk: "id" }),
  Object.freeze({ table: "platform_schema_migrations", pk: "migration_id" }),
]);
const STOP_CONDITIONS = Object.freeze([
  "Reject every argument outside the explicit allowlist.",
  "Reject every mode except synthetic.",
  "Stop if source snapshot, export page, credential manifest, incremental manifest, or freeze bundle verification fails.",
  "Stop on any module exception; never fall back to a real source or remote target.",
  "Never transition writer authority or execute a production freeze.",
]);

export class ControlledCliError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ControlledCliError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ControlledCliError(code, message);
}

export function parseControlledCliArgs(argv = []) {
  if (!Array.isArray(argv) || !argv.every((value) => typeof value === "string")) {
    fail("cli_arguments_invalid", "arguments must be a string array");
  }
  const options = {
    mode: null,
    operator: null,
    snapshotId: DEFAULT_SNAPSHOT_ID,
    json: false,
    help: false,
  };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      if (argv.length !== 1) fail("cli_argument_not_allowed", "--help must be used by itself");
      options.help = true;
      return options;
    }
    if (argument === "--json") {
      if (seen.has(argument)) fail("cli_argument_duplicate", "duplicate argument");
      seen.add(argument);
      options.json = true;
      continue;
    }
    if (argument !== "--mode" && argument !== "--operator" && argument !== "--snapshot-id") {
      fail("cli_argument_not_allowed", "argument is not allowlisted");
    }
    if (seen.has(argument)) fail("cli_argument_duplicate", "duplicate argument");
    seen.add(argument);
    const value = argv[index + 1];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      fail("cli_argument_value_missing", "argument requires a value");
    }
    if (argument === "--mode") options.mode = value;
    if (argument === "--operator") options.operator = value;
    if (argument === "--snapshot-id") options.snapshotId = value;
    index += 1;
  }
  if (options.mode !== "synthetic") {
    fail("cli_mode_not_allowed", "only --mode synthetic is supported");
  }
  if (typeof options.operator !== "string" || !OPERATOR_PATTERN.test(options.operator)) {
    fail("cli_operator_invalid", "--operator is required and must be a 3–64 character audit alias");
  }
  if (typeof options.snapshotId !== "string" || !SNAPSHOT_ID_PATTERN.test(options.snapshotId)) {
    fail("cli_snapshot_id_invalid", "--snapshot-id must match s2s-[a-z0-9-]{3,80}");
  }
  return options;
}

function countRows(db, table) {
  return Number(db.prepare("select count(*) as n from " + table).get().n);
}

function nextSnapshotId(snapshotId) {
  // Bind the derived id to the FULL parent id: a 12-hex-char prefix of the
  // parent's SHA-256 digest distinguishes parents that share a long common
  // prefix (the old slice(0, 70) truncation collided on those) and keeps the
  // derived id valid at the maximum parent length. The kept parent prefix
  // (60 chars) plus digest and "-next" stays within the 84-char pattern cap.
  const digest = createHash("sha256").update(snapshotId, "utf8").digest("hex").slice(0, 12);
  const value = snapshotId.slice(0, 60) + "-" + digest + "-next";
  if (!SNAPSHOT_ID_PATTERN.test(value) || value === snapshotId) {
    fail("cli_snapshot_id_invalid", "could not derive a valid next synthetic snapshot id");
  }
  return value;
}

function runSyntheticModules({ snapshotId, operator, now }) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "d1-stage2-controlled-cli-"));
  let db = null;
  try {
    const startedAt = now().toISOString();
    const fixedNow = () => new Date(startedAt);
    const nextId = nextSnapshotId(snapshotId);
    db = new Database(join(temporaryDirectory, "source.sqlite"));

    // 1. source-manifest: build and verify a local synthetic source snapshot.
    const built = buildSyntheticSourceSnapshot({ db, snapshotId, now: startedAt });
    const snapshotVerification = verifySyntheticSourceSnapshot(db, built.metadata);
    if (snapshotVerification.valid !== true) {
      fail("cli_source_manifest_verification_failed", "synthetic source manifest did not verify");
    }

    // 2. source-export: export and verify one bounded synthetic page.
    const page = exportPage(db, {
      table: "platform_accounts",
      pk: "id",
      snapshotId,
      limit: 20,
    });
    const exportVerified = verifyExportPage(page);
    if (exportVerified !== true) {
      fail("cli_export_verification_failed", "synthetic export page did not verify");
    }

    // Capture the baseline before making synthetic-only changes.
    const checkpoint = buildCheckpointManifest(db, {
      tables: CHECKPOINT_TABLES,
      snapshotId,
    });
    const previousCredentialManifest = buildCredentialVersionManifest(db, { snapshotId });
    if (verifyCredentialVersionManifest(previousCredentialManifest) !== true) {
      fail("cli_previous_credential_manifest_verification_failed", "previous synthetic credential manifest did not verify");
    }

    // 3. credential-reconciliation: simulate one synthetic credential rotation.
    // No credential bytes are exported or included in the audit record.
    db.prepare("update platform_accounts set status = 'suspended' where id = ?")
      .run("s2s-account-001");
    db.prepare(
      "insert into platform_entitlements (id, account_id, plan, status, valid_from, valid_until, max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "s2s-entitlement-005",
      "s2s-account-002",
      "s2s-plan-basic",
      "active",
      startedAt,
      "2027-11-21T00:00:00.000Z",
      1,
      1,
      0,
      startedAt,
      startedAt,
    );
    db.prepare("delete from platform_entitlements where id = ?").run("s2s-entitlement-003");
    db.prepare(
      "update platform_portal_edge_credentials set edge_credential_ref = ?, edge_material_digest = ? where request_id = ? and edge_channel_ref = ?",
    ).run(
      "s2s-cred-001-rotated",
      syntheticMaterialDigest("s2s-cred-001-rotated"),
      "s2s-request-001",
      "s2s-channel-a",
    );
    const currentCredentialManifest = buildCredentialVersionManifest(db, { snapshotId: nextId });
    if (verifyCredentialVersionManifest(currentCredentialManifest) !== true) {
      fail("cli_current_credential_manifest_verification_failed", "current synthetic credential manifest did not verify");
    }

    // source-export incremental manifest consumes credential version manifests
    // separately; raw credential values never enter the manifest.
    const highWaterMark = createHighWaterMark({ seq: 1, snapshotId: nextId });
    const incrementalManifest = buildIncrementalManifest(db, {
      tables: CHECKPOINT_TABLES,
      checkpoint,
      previousCredentialManifest,
      currentCredentialManifest,
      highWaterMark,
      previousSnapshotId: snapshotId,
    });
    const incrementalVerification = verifyIncrementalManifest(incrementalManifest);
    if (incrementalVerification.valid !== true) {
      fail("cli_incremental_manifest_verification_failed", "synthetic incremental manifest did not verify");
    }
    const rotations = incrementalManifest.credentialRotations;
    if (!rotations || rotations.rotated.length !== 1) {
      fail("cli_credential_reconciliation_failed", "expected exactly one synthetic credential rotation");
    }

    // 4. freeze-drain: build synthetic receipts only. Scheduler and callback
    // evidence below are fixture inputs, not observations of production.
    const writeLock = buildWriteLockReceipt(db, {
      snapshotId: nextId,
      checkpointId: "s2s-controlled-cli-checkpoint-001",
      outstandingJobs: [],
      now: fixedNow,
    });
    const schedulerEvidence = Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true]));
    const schedulerQuiescence = buildSchedulerQuiescenceReceipt({
      evidence: schedulerEvidence,
      snapshotId: nextId,
      now: fixedNow,
    });
    const callbackDrain = buildCallbackDrainReceipt({
      callbacks: [{ id: "s2s-callback-001", description: "synthetic callback", settled: true }],
      snapshotId: nextId,
      now: fixedNow,
    });
    const rowCounts = {
      platform_accounts: countRows(db, "platform_accounts"),
      platform_entitlements: countRows(db, "platform_entitlements"),
      platform_portal_edge_credentials: countRows(db, "platform_portal_edge_credentials"),
      platform_schema_migrations: countRows(db, "platform_schema_migrations"),
    };
    const hwmCompleteness = buildHwmCompletenessReceipt({
      highWaterMark,
      manifestSeq: incrementalManifest.seq,
      rowCounts,
      snapshotId: nextId,
      now: fixedNow,
    });
    const freezeBundle = buildFreezeReadinessBundle({
      snapshotId: nextId,
      writeLock,
      schedulerQuiescence,
      callbackDrain,
      hwmCompleteness,
      now: fixedNow,
    });
    const freezeVerification = verifyFreezeReadinessBundle(freezeBundle);
    if (freezeVerification.valid !== true || freezeBundle.phaseTransition !== "none") {
      fail("cli_freeze_bundle_verification_failed", "synthetic freeze bundle did not verify or attempted a phase transition");
    }
    const writerCoverage = buildUnfencedWriterCoverage({ fencedIds: [] });
    const completedAt = now().toISOString();

    return {
      schemaVersion: 1,
      event: "d1-stage2-controlled-cli",
      status: "PASS_SYNTHETIC_ONLY",
      operator,
      mode: "synthetic",
      startedAt,
      completedAt,
      modulesInvoked: [
        "source-manifest",
        "source-export",
        "credential-reconciliation",
        "freeze-drain",
      ],
      sourceSnapshot: {
        snapshotId,
        sourceCommit: built.metadata.sourceCommit,
        expectedTableCount: built.metadata.inventoryTableCount,
        materializedTableCount: built.metadata.materializedTables.length,
        missingExpectedTableCount: built.metadata.missingExpectedTables.length,
        isFullSourceSnapshot: false,
        verified: snapshotVerification.valid,
      },
      export: {
        table: page.table,
        rowCount: page.rowCount,
        byteLength: page.byteLength,
        contentHash: page.contentHash,
        verified: exportVerified,
      },
      credentialReconciliation: {
        previousLiveRowCount: previousCredentialManifest.liveRowCount,
        currentLiveRowCount: currentCredentialManifest.liveRowCount,
        rotatedCount: rotations.rotated.length,
        addedCount: rotations.added.length,
        deletedCount: rotations.deleted.length,
        unchangedCount: rotations.unchanged,
      },
      incrementalManifest: {
        snapshotId: incrementalManifest.snapshotId,
        previousSnapshotId: incrementalManifest.previousSnapshotId,
        seq: incrementalManifest.seq,
        summary: incrementalManifest.summary,
        manifestHash: incrementalManifest.manifestHash,
        verified: incrementalVerification.valid,
      },
      freezeDrain: {
        writeLockReceipt: writeLock.kind,
        schedulerReceipt: schedulerQuiescence.kind,
        schedulerJobCount: schedulerQuiescence.jobs.length,
        callbackReceipt: callbackDrain.kind,
        callbackDrained: callbackDrain.drained,
        hwmReceipt: hwmCompleteness.kind,
        hwmSeq: hwmCompleteness.seq,
        bundleHash: freezeBundle.bundleHash,
        verified: freezeVerification.valid,
        phaseTransition: freezeBundle.phaseTransition,
      },
      unfencedWriterCoverage: {
        total: writerCoverage.total,
        fencedCount: writerCoverage.fencedCount,
        openCount: writerCoverage.openCount,
      },
      safety: {
        syntheticOnly: true,
        notProductionEvidence: true,
        realBwhReads: 0,
        remoteNetworkCalls: 0,
        remoteD1Writes: 0,
        productionCredentialsRead: false,
        productionFreezeExecuted: false,
        scheduled: false,
        deployed: false,
        cutover: false,
      },
      stopConditions: [...STOP_CONDITIONS],
      stopReason: null,
      warning: "Scheduler and callback evidence in this report are synthetic fixture inputs; they do not observe production.",
    };
  } finally {
    try {
      if (db && db.open) db.close();
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

function usage() {
  return [
    "D1 Stage 2 controlled CLI (synthetic only)",
    "",
    "node tools/d1-stage2/controlled-cli.mjs --mode synthetic --operator <audit-alias> [--snapshot-id s2s-...] [--json]",
    "",
    "Allowed arguments: --mode synthetic, --operator, --snapshot-id, --json, --help.",
    "No database path, URL, token, secret, production mode, scheduler, or remote target is accepted.",
    "",
  ].join("\n");
}

function stopRecord(error, operator = null) {
  // ControlledCliError (from fail()) already carries a fixed code and a fixed
  // message, so it is kept as-is. Any other runtime exception (filesystem,
  // database, module) is mapped to a fixed generic code and a fixed generic
  // message: the raw exception text is never written to the audit record,
  // because it may contain a local path, URL, or other operator-supplied
  // value that must not land in a retained log.
  const isControlled = error instanceof ControlledCliError;
  return {
    schemaVersion: 1,
    event: "d1-stage2-controlled-cli",
    status: "STOPPED",
    operator,
    stopCode: isControlled && typeof error.code === "string" ? error.code : "cli_execution_failed",
    stopReason: isControlled ? error.message : "synthetic execution failed",
    safety: {
      syntheticOnly: true,
      notProductionEvidence: true,
      realBwhReads: 0,
      remoteNetworkCalls: 0,
      remoteD1Writes: 0,
      productionCredentialsRead: false,
      productionFreezeExecuted: false,
      scheduled: false,
      deployed: false,
      cutover: false,
    },
    stopConditions: [...STOP_CONDITIONS],
  };
}

function writeHumanReport(report, stream) {
  stream.write("D1 Stage 2 controlled CLI: " + report.status + "\n");
  stream.write("Mode: synthetic only\n");
  if (report.operator) stream.write("Operator: " + report.operator + "\n");
  if (report.sourceSnapshot) stream.write("Snapshot: " + report.sourceSnapshot.snapshotId + "\n");
  if (report.modulesInvoked) stream.write("Modules: " + report.modulesInvoked.join(", ") + "\n");
  if (report.incrementalManifest) {
    stream.write("Incremental summary: " + JSON.stringify(report.incrementalManifest.summary) + "\n");
  }
  if (report.freezeDrain) {
    stream.write("Freeze phase transition: " + report.freezeDrain.phaseTransition + "\n");
  }
  if (report.stopCode) stream.write("Stop: " + report.stopCode + " — " + report.stopReason + "\n");
  stream.write("Not production evidence: true\n");
}

export function runControlledCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  now = () => new Date(),
} = {}) {
  const jsonRequested = Array.isArray(argv) && argv.includes("--json");
  let options;
  try {
    options = parseControlledCliArgs(argv);
  } catch (error) {
    const report = stopRecord(error);
    if (jsonRequested) stdout.write(JSON.stringify(report, null, 2) + "\n");
    else writeHumanReport(report, stderr);
    return 2;
  }
  if (options.help) {
    stdout.write(usage());
    return 0;
  }
  try {
    const report = runSyntheticModules({
      snapshotId: options.snapshotId,
      operator: options.operator,
      now,
    });
    if (options.json) stdout.write(JSON.stringify(report, null, 2) + "\n");
    else writeHumanReport(report, stdout);
    return 0;
  } catch (error) {
    const report = stopRecord(error, options.operator);
    if (options.json) stdout.write(JSON.stringify(report, null, 2) + "\n");
    else writeHumanReport(report, stderr);
    return 1;
  }
}

function isDirectExecution() {
  return typeof process.argv[1] === "string"
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  process.exitCode = runControlledCli();
}
