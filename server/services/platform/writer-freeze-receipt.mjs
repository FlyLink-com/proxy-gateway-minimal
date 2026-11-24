// D1 Stage 1B — BWH freeze receipt (non-executing freeze contract).
//
// buildFreezeReceipt observes a database and returns a signed/traceable
// receipt recording the preconditions for a coordinator-issued freeze:
// the durable authority is BWH_ACTIVE at a known epoch, and the durable
// high-water mark is recorded. It does NOT change the authority phase
// and it does NOT freeze anything: the coordinator transitions the phase
// to FROZEN separately (transitionWriterAuthority) after verifying the
// receipt. Nothing in this module runs against production; it is
// exercised only on synthetic databases in tests and on an explicit
// coordinator call.
//
// What the receipt actually proves: one BEGIN IMMEDIATE transaction
// was held for the whole snapshot read, so while it was held no other
// connection could hold a write lock and no business write could be in
// flight on another connection. That is the whole quiescence proof —
// it does NOT prove schedulers stopped, in-flight jobs drained, or that
// the listed outstanding jobs are complete: outstandingJobs is
// caller-asserted, and stopping schedulers is the coordinator's job at
// freeze time, not something this receipt observes.

import { createHash } from "node:crypto";

import {
  WRITER_PHASES,
  WriterAuthorityError,
  readWriterAuthority,
} from "./single-writer-authority.mjs";

export const FREEZE_RECEIPT_TYPE = "bwh_freeze_receipt";
export const FREEZE_RECEIPT_VERSION = 1;

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function freezeReceiptError(message) {
  return new WriterAuthorityError("freeze_receipt_invalid", message);
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw freezeReceiptError(`freeze receipt requires a non-empty ${field}`);
  }
  return value;
}

function assertOutstandingJobs(jobs) {
  if (!Array.isArray(jobs)) {
    throw freezeReceiptError("freeze receipt requires outstandingJobs as an array");
  }
  return jobs.map((job, index) => {
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      throw freezeReceiptError(`outstanding job ${index} must be an object`);
    }
    if (typeof job.ref !== "string" || job.ref.length === 0) {
      throw freezeReceiptError(`outstanding job ${index} requires a non-empty ref`);
    }
    if (typeof job.kind !== "string" || job.kind.length === 0) {
      throw freezeReceiptError(`outstanding job ${index} requires a non-empty kind`);
    }
    return { ref: job.ref, kind: job.kind };
  });
}

// Durable high-water mark: per-table row count plus the newest
// updated_at where the table carries one. Tables are sorted by name so
// the mark is deterministic. The authority table itself is excluded:
// the authority row is recorded in the receipt's own phase/epoch fields.
//
// Exported for the freeze executor (D1 Stage 2, D6 harness): the A2
// drain proof reads this twice, 60 s apart, and requires the two
// observations to be equal. Export only; no logic change.
export function readHighWaterMark(db) {
  const tables = db
    .prepare(
      `select name from sqlite_master
        where type = 'table'
          and name not like 'sqlite_%'
          and name != 'platform_writer_authority'
        order by name asc`,
    )
    .all()
    .map((row) => row.name);
  const marks = [];
  let totalRows = 0;
  for (const table of tables) {
    const columns = db.prepare(`pragma table_info(${table})`).all();
    const hasUpdatedAt = columns.some((column) => column.name === "updated_at");
    const rowCount = Number(db.prepare(`select count(*) as n from ${table}`).get().n);
    totalRows += rowCount;
    // The mark is a stability fingerprint: two observations agree when
    // the value agrees. Most tables carry updated_at as ISO text, but
    // the ads-conversion tables carry it as integer epoch millis
    // (ads-conversion-store.mjs schema), and verifyFreezeReceipt only
    // accepts a string or null. Normalize to a string here so a
    // production-shaped database (any confirmed order records an ads
    // claim row) can produce a verifiable freeze receipt at all; the
    // digest is computed over the normalized value, so build and verify
    // stay consistent and stability comparison still holds.
    const rawMaxUpdatedAt = hasUpdatedAt
      ? db.prepare(`select max(updated_at) as m from ${table}`).get().m ?? null
      : null;
    marks.push({
      table,
      rowCount,
      maxUpdatedAt: rawMaxUpdatedAt === null ? null : String(rawMaxUpdatedAt),
    });
  }
  return { tables: marks, totalRows };
}

export function buildFreezeReceipt(
  db,
  { snapshotId, checkpointId, outstandingJobs = [], now = () => new Date() } = {},
) {
  assertNonEmptyString(snapshotId, "snapshotId");
  assertNonEmptyString(checkpointId, "checkpointId");
  const jobs = assertOutstandingJobs(outstandingJobs);
  if (!db || typeof db.transaction !== "function") {
    throw freezeReceiptError("freeze receipt requires a database handle");
  }
  // One immediate transaction: the write lock is held for the authority
  // read and the whole high-water scan, which is the quiescence proof.
  const receipt = db.transaction(() => {
    const current = readWriterAuthority(db);
    if (!current) {
      throw new WriterAuthorityError("writer_authority_unavailable", "writer authority record is missing");
    }
    if (current.phase !== WRITER_PHASES.BWH_ACTIVE) {
      throw new WriterAuthorityError(
        "writer_authority_not_bwh",
        `freeze receipt requires phase BWH_ACTIVE, current phase is ${current.phase}`,
        { phase: current.phase, epoch: current.epoch },
      );
    }
    const highWaterMark = readHighWaterMark(db);
    const unsigned = {
      type: FREEZE_RECEIPT_TYPE,
      version: FREEZE_RECEIPT_VERSION,
      authority: current.authority,
      phase: current.phase,
      epoch: current.epoch,
      snapshotId,
      checkpointId,
      highWaterMark,
      outstandingJobs: { count: jobs.length, jobs },
      timestamp: now().toISOString(),
      writerQuiescenceAsserted: true,
    };
    const receiptDigest = createHash("sha256").update(canonicalJson(unsigned)).digest("hex");
    return { ...unsigned, receiptDigest };
  }).immediate();
  return receipt;
}

// Recompute the digest and validate every field shape. Returns true on
// success; throws WriterAuthorityError (freeze_receipt_invalid) on any
// mismatch. This is the check the coordinator runs before issuing the
// FROZEN transition; it proves the receipt was not altered after it
// was built, not that the database is still in the same state.
export function verifyFreezeReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw freezeReceiptError("freeze receipt must be an object");
  }
  if (receipt.type !== FREEZE_RECEIPT_TYPE) {
    throw freezeReceiptError(`freeze receipt type must be ${FREEZE_RECEIPT_TYPE}`);
  }
  if (receipt.version !== FREEZE_RECEIPT_VERSION) {
    throw freezeReceiptError(`freeze receipt version must be ${FREEZE_RECEIPT_VERSION}`);
  }
  if (receipt.authority !== "BWH") {
    throw freezeReceiptError("freeze receipt authority must be BWH");
  }
  if (receipt.phase !== WRITER_PHASES.BWH_ACTIVE) {
    throw freezeReceiptError("freeze receipt phase must be BWH_ACTIVE");
  }
  if (
    !Number.isInteger(receipt.epoch)
    || receipt.epoch < 1
    || receipt.epoch > 2147483647
  ) {
    throw freezeReceiptError("freeze receipt epoch must be an integer in 1..2147483647");
  }
  assertNonEmptyString(receipt.snapshotId, "snapshotId");
  assertNonEmptyString(receipt.checkpointId, "checkpointId");
  if (typeof receipt.timestamp !== "string" || Number.isNaN(Date.parse(receipt.timestamp))) {
    throw freezeReceiptError("freeze receipt timestamp must be an ISO date string");
  }
  if (receipt.writerQuiescenceAsserted !== true) {
    throw freezeReceiptError("freeze receipt must assert writer quiescence");
  }
  const marks = receipt.highWaterMark;
  if (!marks || typeof marks !== "object" || !Array.isArray(marks.tables)
    || !Number.isInteger(marks.totalRows) || marks.totalRows < 0) {
    throw freezeReceiptError("freeze receipt high-water mark is malformed");
  }
  const summed = marks.tables.reduce((sum, entry) => {
    if (typeof entry.table !== "string" || entry.table.length === 0
      || !Number.isInteger(entry.rowCount) || entry.rowCount < 0
      || (entry.maxUpdatedAt !== null && typeof entry.maxUpdatedAt !== "string")) {
      throw freezeReceiptError("freeze receipt high-water mark entry is malformed");
    }
    return sum + entry.rowCount;
  }, 0);
  if (summed !== marks.totalRows) {
    throw freezeReceiptError("freeze receipt high-water mark total does not match its tables");
  }
  const jobs = assertOutstandingJobs(receipt.outstandingJobs?.jobs ?? []);
  if (receipt.outstandingJobs?.count !== jobs.length) {
    throw freezeReceiptError("freeze receipt outstanding-job count does not match its jobs");
  }
  if (typeof receipt.receiptDigest !== "string" || !/^[0-9a-f]{64}$/.test(receipt.receiptDigest)) {
    throw freezeReceiptError("freeze receipt digest must be a SHA-256 hex digest");
  }
  const { receiptDigest, ...unsigned } = receipt;
  const expected = createHash("sha256").update(canonicalJson(unsigned)).digest("hex");
  if (expected !== receiptDigest) {
    throw freezeReceiptError("freeze receipt digest does not match its contents");
  }
  return true;
}
