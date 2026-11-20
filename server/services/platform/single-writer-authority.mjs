// D1 Stage 1B — BWH single-writer authority record and epoch fence.
//
// Source-side mirror of the Worker contract in
// docs/D1_STAGE1A_SINGLE_WRITER_EPOCH_CONTRACT_V1.md (PR #894) and the
// handoff in docs/D1_STAGE1B_AGENT_EPOCH_MUSE_HANDOFF_V1.md (PR #895).
//
// This module owns the durable BWH authority record and the in-transaction
// fence for the protected BWH write paths. It exposes no HTTP route or
// cutover entry point and never opens a connection to a Worker or D1.
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
const WRITER_AUTHORITY_MARKER = "platform_writer_authority_installed";
const WRITER_AUTHORITY_GUARDS = {
  insert: "platform_writer_authority_insert_guard",
  delete: "platform_writer_authority_delete_guard",
  transition: "platform_writer_authority_transition_guard",
};
const AUTHORITY_GUARD_NAMES = Object.values(WRITER_AUTHORITY_GUARDS);

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
  return Object.hasOwn(AUTHORITY_BY_PHASE, phase) ? AUTHORITY_BY_PHASE[phase] : null;
}

function schemaObjectType(db, name) {
  return db.prepare("select type from main.sqlite_schema where name = ? collate nocase")
    .get(name)?.type;
}

function readAuthoritySchema(db) {
  const objects = new Map();
  for (const object of db.prepare(`
    select lower(name) as name, type, lower(tbl_name) as table_name
      from main.sqlite_schema
     where lower(name) in (?, ?, ?, ?, ?)
  `).all(WRITER_AUTHORITY_TABLE, WRITER_AUTHORITY_MARKER, ...AUTHORITY_GUARD_NAMES)) {
    if (objects.has(object.name)) {
      throw writerError("writer_authority_unavailable", "writer authority schema name is ambiguous");
    }
    objects.set(object.name, object);
  }
  const marker = objects.get(WRITER_AUTHORITY_MARKER);
  if (marker && marker.type !== "view") {
    throw writerError("writer_authority_unavailable", "writer authority marker is invalid");
  }
  if (!marker && AUTHORITY_GUARD_NAMES.some(name => objects.has(name))) {
    throw writerError("writer_authority_unavailable", "writer authority marker is missing");
  }
  const table = objects.get(WRITER_AUTHORITY_TABLE);
  if ((table || marker) && table?.type !== "table") {
    throw writerError("writer_authority_unavailable", "writer authority table is missing or invalid");
  }
  if (marker) {
    for (const name of AUTHORITY_GUARD_NAMES) {
      const guard = objects.get(name);
      if (guard?.type !== "trigger" || guard.table_name !== WRITER_AUTHORITY_TABLE) {
        throw writerError("writer_authority_unavailable", "writer authority guard is missing or invalid");
      }
    }
  }
  return { hasTable: Boolean(table), installed: Boolean(marker) };
}

// Absence means a legacy database only when neither object exists. An
// empty, malformed or dropped installed authority table is an error.
export function readWriterAuthority(db) {
  if (!db || typeof db.prepare !== "function") return null;
  return readAuthoritySchema(db).hasTable ? readAuthoritySingleton(db) : null;
}

function readAuthoritySingleton(db) {
  let rows;
  try {
    rows = db
      .prepare(`
        select id, typeof(id) as id_type, authority, phase, epoch, typeof(epoch) as epoch_type,
               updated_at, receipt_ref
          from main.${WRITER_AUTHORITY_TABLE}
      `)
      .all();
  } catch {
    throw writerError("writer_authority_unavailable", "writer authority record could not be read");
  }
  const record = rows[0];
  const expectedAuthority = record && writerAuthorityFromPhase(record.phase);
  if (rows.length !== 1
      || record.id_type !== "integer" || Number(record.id) !== 1
      || record.epoch_type !== "integer"
      || !Number.isSafeInteger(Number(record.epoch))
      || Number(record.epoch) < WRITER_EPOCH_MIN || Number(record.epoch) > WRITER_EPOCH_MAX
      || !expectedAuthority || expectedAuthority !== record.authority
      || typeof record.updated_at !== "string" || typeof record.receipt_ref !== "string") {
    throw writerError("writer_authority_unavailable", "writer authority singleton is missing or invalid");
  }
  return {
    id: 1,
    authority: record.authority,
    phase: record.phase,
    epoch: Number(record.epoch),
    updatedAt: record.updated_at,
    receiptRef: record.receipt_ref,
  };
}

const TRANSITION_PREDICATE = Object.entries(ALLOWED_WRITER_TRANSITIONS).flatMap(([from, targets]) =>
  [...targets].map((to) => `(OLD.phase = '${from}' AND NEW.phase = '${to}' AND NEW.authority = '${AUTHORITY_BY_PHASE[to]}')`)
).join(" OR ");

function installAuthorityGuards(db) {
  db.exec(`
    create view main.${WRITER_AUTHORITY_MARKER} as select 1 as installed;
    create trigger main.${WRITER_AUTHORITY_GUARDS.insert}
      before insert on ${WRITER_AUTHORITY_TABLE}
      begin select raise(abort, 'writer_authority_insert_denied'); end;
    create trigger main.${WRITER_AUTHORITY_GUARDS.delete}
      before delete on ${WRITER_AUTHORITY_TABLE}
      begin select raise(abort, 'writer_authority_delete_denied'); end;
    create trigger main.${WRITER_AUTHORITY_GUARDS.transition}
      before update on ${WRITER_AUTHORITY_TABLE}
      when NEW.id is not 1 or typeof(NEW.epoch) != 'integer' or
           NEW.epoch is not OLD.epoch + 1 or NEW.epoch > ${WRITER_EPOCH_MAX} or
           not coalesce((${TRANSITION_PREDICATE}), 0)
      begin select raise(abort, 'writer_authority_transition_denied'); end;
  `);
}

// Install a fresh authority record only on legacy databases. Bootstrap,
// adoption of a valid existing record, and marker/guards are one SQLite
// transaction so concurrent starts cannot publish a partially seeded state.
export function ensureWriterAuthority(db, { now = () => new Date() } = {}) {
  if (!db || typeof db.transaction !== "function") {
    throw writerError("writer_authority_unavailable", "writer authority requires a database handle");
  }
  return db.transaction(() => {
    const { hasTable, installed } = readAuthoritySchema(db);
    const existing = hasTable ? readAuthoritySingleton(db) : null;
    if (installed) return existing;
    if (!existing) {
      db.exec(`
        create table main.${WRITER_AUTHORITY_TABLE} (
          id integer primary key check (id = 1),
          authority text not null check (authority in ('BWH', 'D1')),
          phase text not null check (phase in ('BWH_ACTIVE', 'FROZEN', 'D1_ACTIVE', 'RECOVERY')),
          epoch integer not null check (typeof(epoch) = 'integer' and epoch between 1 and ${WRITER_EPOCH_MAX}),
          updated_at text not null,
          receipt_ref text not null default '',
          check ((authority = 'BWH' and phase in ('BWH_ACTIVE', 'FROZEN'))
              or (authority = 'D1' and phase in ('D1_ACTIVE', 'RECOVERY')))
        );
      `);
      db.prepare(`
        insert into main.${WRITER_AUTHORITY_TABLE}
          (id, authority, phase, epoch, updated_at, receipt_ref)
        values (1, 'BWH', 'BWH_ACTIVE', 1, ?, '')
      `).run(now().toISOString());
    }
    installAuthorityGuards(db);
    return existing ?? readAuthoritySingleton(db);
  }).immediate();
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
  const { installed } = readAuthoritySchema(db);
  const current = installed ? readAuthoritySingleton(db) : ensureWriterAuthority(db);
  return assertWritableRecord(current, expectedEpoch);
}

// Run fn inside a single SQLite transaction whose first action reads and
// enforces the authority state before any business write.
// BEGIN IMMEDIATE holds the write lock from the start, so no other
// connection can freeze the database between the fence check and the
// first business write. Returns fn's return value; the whole transaction
// (fence + business writes) rolls back on any throw. The authority
// record is installed separately on a legacy database's first guarded write.
export function guardedTransaction(db, expectedEpoch, fn) {
  if (typeof fn !== "function") {
    throw writerError("writer_authority_unavailable", "guarded transaction requires a callback");
  }
  if (!db || typeof db.transaction !== "function") {
    throw writerError("writer_authority_unavailable", "guarded transaction requires a database handle");
  }
  if (!schemaObjectType(db, WRITER_AUTHORITY_MARKER)) ensureWriterAuthority(db);
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
      `update main.${WRITER_AUTHORITY_TABLE}
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
