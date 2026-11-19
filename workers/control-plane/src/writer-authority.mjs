// Worker-side single-writer epoch contract. This is deliberately narrower
// than a production cutover: no public route can change authority, and BWH
// must implement its own fail-closed fence before any real handoff.
export const WRITER_EPOCH_HEADER = "x-writer-epoch";
export const MAX_WRITER_EPOCH = 2147483647;

export class WriterAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = "WriterAuthorityError";
    this.code = code;
  }
}

export function parseWriterEpoch(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,9}$/.test(value)) {
    throw new WriterAuthorityError("writer_epoch_required");
  }
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch) || epoch < 1 || epoch > MAX_WRITER_EPOCH) {
    throw new WriterAuthorityError("writer_epoch_required");
  }
  return epoch;
}

export class WriterAuthorityRepository {
  constructor(db) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
      throw new TypeError("WriterAuthorityRepository requires a D1Database binding");
    }
    this.db = db;
  }

  async current() {
    let row;
    try {
      row = await this.db.prepare(
        "SELECT authority, phase, epoch FROM platform_writer_authority WHERE singleton = 1"
      ).first();
    } catch {
      throw new WriterAuthorityError("writer_authority_unavailable");
    }
    if (!row || !["BWH", "D1"].includes(row.authority) ||
        !["BWH_ACTIVE", "FROZEN", "D1_ACTIVE", "RECOVERY"].includes(row.phase) ||
        !Number.isSafeInteger(row.epoch) || row.epoch < 1 ||
        row.epoch > MAX_WRITER_EPOCH) {
      throw new WriterAuthorityError("writer_authority_unavailable");
    }
    return { authority: row.authority, phase: row.phase, epoch: row.epoch };
  }

  async assertWritable(epoch) {
    if (!Number.isSafeInteger(epoch) || epoch < 1 || epoch > MAX_WRITER_EPOCH) {
      throw new WriterAuthorityError("writer_epoch_required");
    }
    const state = await this.current();
    if (state.authority !== "D1" || state.phase !== "D1_ACTIVE") {
      throw new WriterAuthorityError("writer_authority_not_d1");
    }
    if (state.epoch !== epoch) {
      throw new WriterAuthorityError("writer_epoch_stale");
    }
    return state;
  }

  // Include this statement as the FIRST statement of the same D1 batch as
  // every guarded business mutation. A trigger rejects stale epoch/BWH/frozen
  // authority atomically even when the state changed after assertWritable().
  gateStatement(epoch) {
    if (!Number.isSafeInteger(epoch) || epoch < 1 || epoch > MAX_WRITER_EPOCH) {
      throw new WriterAuthorityError("writer_epoch_required");
    }
    return this.db.prepare(
      "INSERT INTO platform_writer_gate (singleton, accepted_epoch) VALUES (1, ?) " +
      "ON CONFLICT(singleton) DO UPDATE SET accepted_epoch = excluded.accepted_epoch"
    ).bind(epoch);
  }
}

export function classifyAuthorityBatchFailure(error) {
  const message = String(error?.message ?? "");
  if (message.includes("writer_authority_denied") ||
      message.includes("writer_authority_transition_denied")) {
    return new WriterAuthorityError("writer_epoch_stale");
  }
  if (message.includes("no such table: platform_writer_")) {
    return new WriterAuthorityError("writer_authority_unavailable");
  }
  return null;
}
