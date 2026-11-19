// D1 Stage 1B — BWH single-writer authority record and epoch fence.
//
// Source-side mirror of the Worker contract in
// docs/D1_STAGE1A_SINGLE_WRITER_EPOCH_CONTRACT_V1.md (PR #894) and the
// handoff in docs/D1_STAGE1B_AGENT_EPOCH_MUSE_HANDOFF_V1.md (PR #895).
//
// This module is offline-only: it owns the durable BWH authority record
// (singleton row in subscription-control.sqlite) and the in-transaction
// guard every BWH business write must pass. It exposes NO HTTP route, NO
// production activation path, and it never contacts BWH, a Worker, or D1.
// A phase transition only happens when the migration coordinator calls
// transitionWriterAuthority explicitly; nothing here auto-promotes
// authority, and RECOVERY -> BWH_ACTIVE stays blocked until reverse
// reconciliation is implemented and verified.
//
// State machine (epoch increments by exactly one per transition):
//   BWH_ACTIVE -> FROZEN -> D1_ACTIVE -> RECOVERY
//   FROZEN -> BWH_ACTIVE and RECOVERY -> D1_ACTIVE are explicit
//   abort/resume paths. RECOVERY -> BWH_ACTIVE is BLOCKED.
//
// x-writer-epoch is a decimal ASCII integer in 1..2147483647 with no
// leading zeroes. It is NOT authentication and it only ever comes from a
// durable coordinator receipt: this module never generates, defaults, or
// guesses an epoch.

export const WRITER_EPOCH_MIN = 1;
export const WRITER_EPOCH_MAX = 2147483647;
export const WRITER_AUTHORITY_TABLE = "platform_writer_authority";

export const WRITER_PHASES = Object.freeze({
  BWH_ACTIVE: "BWH_ACTIVE",
  FROZEN: "FROZEN",
  D1_ACTIVE: "D1_ACTIVE",
  RECOVERY: "RECOVERY",
});

// authority value stored alongside the phase: BWH owns the write side
// while BWH_ACTIVE/FROZEN, D1 owns it while D1_ACTIVE/RECOVERY.
const AUTHORITY_BY_PHASE = Object.freeze({
  BWH_ACTIVE: "BWH",
  FROZEN: "BWH",
  D1_ACTIVE: "D1",
  RECOVERY: "D1",
});

// Allowed phase transitions. RECOVERY -> BWH_ACTIVE is deliberately
// absent: it is blocked until reverse reconciliation is implemented and
// verified, and it is reported with its own error code.
const ALLOWED_WRITER_TRANSITIONS = Object.freeze({
  BWH_ACTIVE: new Set(["FROZEN"]),
  FROZEN: new Set(["D1_ACTIVE", "BWH_ACTIVE"]),
  D1_ACTIVE: new Set(["RECOVERY"]),
  RECOVERY: new Set(["D1_ACTIVE"]),
});

const EPOCH_PATTERN = /^(0|[1-9][0-9]*)$/;

export class WriterAuthorityError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "WriterAuthorityError";
    this.code = code;
    if (detail.phase !== undefined) this.phase = detail.phase;
    if (detail.epoch !== undefined) this.epoch = detail.epoch;
    if (detail.from !== undefined) this.from = detail.from;
    if (detail.to !== undefined) this.to = detail.to;
  }
}

export function isWriterAuthorityError(error) {
  return error instanceof WriterAuthorityError;
}

function writerError(code, message, detail) {
  return new WriterAuthorityError(code, message, detail);
}

// Parse a coordinator-issued epoch. Accepts a decimal ASCII string or a
// safe integer; anything else (missing, non-numeric, leading zeroes,
// out of range, fractional) is rejected. There is no default epoch.
export function parseWriterEpoch(value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < WRITER_EPOCH_MIN || value > WRITER_EPOCH_MAX) {
      throw writerError(
        "writer_epoch_required",
        "writer epoch must be a decimal integer in 1..2147483647",
      );
    }
    return value;
  }
  if (typeof value !== "string" || !EPOCH_PATTERN.test(value)) {
    throw writerError(
      "writer_epoch_required",
      "writer epoch must be a decimal ASCII integer in 1..2147483647 with no leading zeroes",
    );
  }
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch) || epoch < WRITER_EPOCH_MIN || epoch > WRITER_EPOCH_MAX) {
    throw writerError(
      "writer_epoch_required",
      "writer epoch must be a decimal integer in 1..2147483647",
    );
  }
  return epoch;
}

export function writerAuthorityFromPhase(phase) {
  return AUTHORITY_BY_PHASE[phase] ?? null;
}

function mapAuthorityRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    authority: row.authority,
    phase: row.phase,
    epoch: Number(row.epoch),
    updatedAt: row.updated_at,
    receiptRef: row.receipt_ref ?? "",
  };
}

// Create the authority table and the singleton row when missing. Safe to
// call repeatedly and safe inside a transaction (transactional DDL). The
// initial state mirrors the Worker 0005 migration: BWH_ACTIVE, epoch 1.
export function ensureWriterAuthority(db, { now = () => new Date() } = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw writerError("writer_authority_unavailable", "writer authority requires a database handle");
  }
  db.exec(`
    create table if not exists ${WRITER_AUTHORITY_TABLE} (
      id integer primary key check (id = 1),
      authority text not null check (authority in ('BWH', 'D1')),
      phase text not null check (phase in ('BWH_ACTIVE', 'FROZEN', 'D1_ACTIVE', 'RECOVERY')),
      epoch integer not null check (epoch between 1 and 2147483647),
      updated_at text not null,
      receipt_ref text not null default ''
    );
  `);
  const existing = readWriterAuthority(db);
  if (existing) return existing;
  const at = now().toISOString();
  // INSERT OR IGNORE: two connections can pass the read above at the
  // same time; the second insert must be a no-op, not SQLITE_CONSTRAINT.
  db.prepare(
    `insert or ignore into ${WRITER_AUTHORITY_TABLE}
       (id, authority, phase, epoch, updated_at, receipt_ref)
     values (1, 'BWH', 'BWH_ACTIVE', 1, ?, '')`,
  ).run(at);
  return readWriterAuthority(db);
}

// Read the singleton row without creating anything. Returns null when the
// table or the row is missing (for example a pre-migration database that
// has never run a guarded write).
export function readWriterAuthority(db) {
  if (!db || typeof db.prepare !== "function") return null;
  let row;
  try {
    row = db
      .prepare(`select id, authority, phase, epoch, updated_at, receipt_ref from ${WRITER_AUTHORITY_TABLE} where id = 1`)
      .get();
  } catch {
    return null;
  }
  return mapAuthorityRow(row);
}

// Validate an already-read authority record. Throws when the record
// is missing or the phase/epoch does not admit a BWH write.
function assertWritableRecord(current, expectedEpoch) {
  if (!current) {
    throw writerError("writer_authority_unavailable", "writer authority record is missing");
  }
  if (current.phase !== WRITER_PHASES.BWH_ACTIVE) {
    throw writerError(
      "writer_authority_not_bwh",
      `BWH writes require phase BWH_ACTIVE, current phase is ${current.phase}`,
      { phase: current.phase, epoch: current.epoch },
    );
  }
  if (expectedEpoch !== undefined) {
    const expected = parseWriterEpoch(expectedEpoch);
    if (expected !== current.epoch) {
      throw writerError(
        "writer_epoch_stale",
        `writer epoch ${expected} does not match durable epoch ${current.epoch}`,
        { phase: current.phase, epoch: current.epoch },
      );
    }
  }
  return current;
}

// The in-transaction fence. Call this as the FIRST statement of the same
// SQLite transaction as the business mutation, before any business write.
// - phase must be BWH_ACTIVE, otherwise the write is rejected (frozen,
//   D1-active, or recovery states never admit BWH writes);
// - when expectedEpoch is supplied it must equal the durable epoch,
//   otherwise the write is stale and rejected.
// With no expectedEpoch only the phase is enforced, which is what fences
// old and background processes that hold no coordinator receipt: they
// are stopped by the durable phase, not by an epoch they never had.
// Throws WriterAuthorityError; returns the current record on success.
export function assertWritable(db, expectedEpoch) {
  const current = ensureWriterAuthority(db);
  return assertWritableRecord(current, expectedEpoch);
}

// Run fn inside a single SQLite transaction whose first statement is the
// writer-fence call: the call ensures the authority table (idempotent
// DDL) and then reads and enforces the phase, before any business write.
// BEGIN IMMEDIATE holds the write lock from the start, so no other
// connection can freeze the database between the fence check and the
// first business write. Returns fn's return value; the whole transaction
// (fence + business writes) rolls back on any throw. The authority
// record itself is ensured (and committed) before the transaction opens,
// so a business rollback never removes it.
export function guardedTransaction(db, expectedEpoch, fn) {
  if (typeof fn !== "function") {
    throw writerError("writer_authority_unavailable", "guarded transaction requires a callback");
  }
  if (!db || typeof db.transaction !== "function") {
    throw writerError("writer_authority_unavailable", "guarded transaction requires a database handle");
  }
  ensureWriterAuthority(db);
  return db.transaction(() => {
    const current = readWriterAuthority(db);
    assertWritableRecord(current, expectedEpoch);
    return fn();
  }).immediate();
}

// Coordinator-driven phase transition. Runs in its own immediate
// transaction, increments epoch by exactly one, and records the receipt
// reference that authorized the transition (empty string when the caller
// supplies none). Illegal transitions throw writer_transition_illegal;
// RECOVERY -> BWH_ACTIVE throws writer_transition_blocked. This is the
// ONLY way the durable phase changes; no route or timer calls it.
export function transitionWriterAuthority(db, { to, expectedEpoch, receiptRef = "", now = () => new Date() } = {}) {
  if (!db || typeof db.transaction !== "function") {
    throw writerError("writer_authority_unavailable", "writer transition requires a database handle");
  }
  if (!Object.hasOwn(WRITER_PHASES, to)) {
    throw writerError("writer_transition_illegal", `unknown writer phase: ${String(to)}`, { to });
  }
  // Ensure (and commit) the record before the transition transaction
  // opens, so a rejected transition leaves the prior state untouched
  // instead of rolling the record itself away.
  ensureWriterAuthority(db, { now });
  return db.transaction(() => {
    const current = readWriterAuthority(db);
    if (!current) {
      throw writerError("writer_authority_unavailable", "writer authority record is missing");
    }
    if (expectedEpoch !== undefined) {
      const expected = parseWriterEpoch(expectedEpoch);
      if (expected !== current.epoch) {
        throw writerError(
          "writer_epoch_stale",
          `writer epoch ${expected} does not match durable epoch ${current.epoch}`,
          { phase: current.phase, epoch: current.epoch },
        );
      }
    }
    if (current.phase === WRITER_PHASES.RECOVERY && to === WRITER_PHASES.BWH_ACTIVE) {
      throw writerError(
        "writer_transition_blocked",
        "RECOVERY -> BWH_ACTIVE is blocked until reverse reconciliation is implemented and verified",
        { from: current.phase, to },
      );
    }
    const allowed = ALLOWED_WRITER_TRANSITIONS[current.phase];
    if (!allowed || !allowed.has(to)) {
      throw writerError(
        "writer_transition_illegal",
        `writer transition ${current.phase} -> ${to} is not allowed`,
        { from: current.phase, to },
      );
    }
    const nextEpoch = current.epoch + 1;
    if (nextEpoch > WRITER_EPOCH_MAX) {
      throw writerError("writer_epoch_required", "writer epoch would exceed 2147483647");
    }
    const at = now().toISOString();
    const changed = db.prepare(
      `update ${WRITER_AUTHORITY_TABLE}
          set authority = ?, phase = ?, epoch = ?, updated_at = ?, receipt_ref = ?
        where id = 1 and phase = ? and epoch = ?`,
    ).run(AUTHORITY_BY_PHASE[to], to, nextEpoch, at, String(receiptRef ?? ""), current.phase, current.epoch);
    if (changed.changes !== 1) {
      throw writerError(
        "writer_epoch_stale",
        "writer authority changed during transition",
        { phase: current.phase, epoch: current.epoch },
      );
    }
    return readWriterAuthority(db);
  }).immediate();
}
