// D1 Card 8 — durable ordered delta journal + U-F18 credential-only
// reconciliation (source side, synthetic data only).
//
// What this module is:
// - An append-only, hash-chained, per-snapshot delta journal stored in a
//   caller-supplied SQLite database (in tests: `:memory:` or a temp file).
//   Each entry carries a contiguous sequence number (the high-water mark,
//   HWM), the snapshot identity it belongs to, the table + PK, the change
//   kind, and fingerprints / credential versions — never row values and
//   never credential material. Deletes are tombstones: the entry is kept
//   forever so a replay can delete the target row and a later re-insert
//   of the same PK stays ordered after it.
// - A resumable replay: entries are applied in seq order through a
//   caller-supplied `apply` callback, and the checkpoint's applied
//   pointer advances one entry at a time, so a crash mid-replay
//   resumes at the next unapplied seq instead of restarting or
//   skipping. The applied pointer is separate from the journal head:
//   appending entries never moves the resume point, and replaying
//   never moves the head.
// - A checkpoint bound to a snapshot identity: the checkpoint stores
//   the snapshotId, the journal head (HWM), the applied seq, and the
//   journal hash (the last entry's chained digest, or a fixed genesis
//   hash for an empty journal). Appending entries for a different
//   snapshotId, or verifying against a different credential manifest
//   hash, fails closed.
// - A U-F18 source/target reconciliation over credential version
//   manifests (`d1-stage2-credential-reconciliation.mjs`): it compares
//   a source manifest with a target manifest, reports rotated / added /
//   deleted / unchanged PKs, and appends the diff to the journal as
//   `credential-rotate` / insert / tombstone entries. The report is
//   honest about what it proves: it proves the two *manifests* agree
//   after the diff is applied; it does not prove the target database
//   holds the same credential values, and it never inspects a
//   credential value to do so.
//
// What this module is NOT (do not overstate it):
// - NOT live CDC. The generic entries come from fingerprint diffing
//   (`source-delta.mjs` `enumerateSourceDeltas`), which compares a
//   checkpoint manifest with current state. A fingerprint diff records
//   *that* a row differs, not the source transaction order, and two
//   changes to the same row between checkpoints collapse to one entry.
//   The journal preserves the order entries were appended, not the
//   order the source wrote them.
// - NOT a value store. Journal entries carry fingerprints and version
//   numbers only. Replay therefore cannot reconstruct row values from
//   the journal: the `apply` callback must re-fetch the current row
//   from the source by PK (the tests do exactly this against a
//   synthetic source DB). A journal entry is an instruction to
//   re-fetch and apply, not the data itself.
// - NOT production reconciliation. No BWH row is read here, no trigger
//   is installed, nothing is written to E4, and the 28-item writer
//   coverage is still open — so nothing here may be called
//   cutover-ready. The credential version table the U-F18 detector
//   relies on (`platform_credential_versions`) exists only in the
//   synthetic test databases; its existence on BWH/E4 is a separate,
//   undecided schema/permission gate.
// - NOT a detector for pre-tracking rotations. Rows that predate
//   version tracking are backfilled at version 1 with origin
//   'backfilled' (see the credential module); a rotation that happened
//   before tracking stays invisible, and the manifest flags that weak
//   baseline instead of hiding it.
//
// Credential hygiene (enforced by construction + tested):
// - No function here accepts a credential value, a material digest, or
//   an `edge_material_digest` as input. `credential-rotate` entries
//   carry only (pk, fromVersion, toVersion, versionDigest), and the
//   version digest itself is a hash over (pk, version, deleted, origin)
//   only — two different secret values with the same pk/version
//   produce the same digest (proven by S2S-CRED-7 in the freeze tests).
// - The journal tables contain no column that could hold credential
//   material, and `verifyJournal` recomputes every chained digest, so
//   a smuggled value would also break the chain.

import { createHash } from "node:crypto";
import {
  CREDENTIALS_TABLE,
  verifyCredentialVersionManifest,
  detectCredentialRotations,
} from "./d1-stage2-credential-reconciliation.mjs";

export const DELTA_JOURNAL_VERSION = 1;
export const DELTA_JOURNAL_TABLE = "d1_delta_journal";
export const DELTA_JOURNAL_CHECKPOINT_TABLE = "d1_delta_checkpoint";
export const DELTA_JOURNAL_ENTRY_KINDS = Object.freeze(["insert", "update", "delete", "credential-rotate"]);

const GENESIS_JOURNAL_HASH = createHash("sha256").update("d1-card8-delta-journal-genesis", "utf8").digest("hex");
export { GENESIS_JOURNAL_HASH };
const ROW_FINGERPRINT = /^[0-9a-f]{64}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

export class DeltaJournalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DeltaJournalError";
    this.code = code;
  }
}

function journalError(code, message) {
  return new DeltaJournalError(code, message);
}

export function isDeltaJournalError(error) {
  return error instanceof DeltaJournalError;
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function assertSnapshotId(snapshotId) {
  if (typeof snapshotId !== "string" || snapshotId.length === 0) {
    throw journalError("delta_journal_snapshot_required", "delta journal requires a non-empty snapshotId");
  }
  return snapshotId;
}

function assertDb(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.exec !== "function") {
    throw journalError("delta_journal_unavailable", "delta journal requires a database handle");
  }
  return db;
}

function assertFingerprint(value, field) {
  if (value !== null && value !== undefined && (typeof value !== "string" || !ROW_FINGERPRINT.test(value))) {
    throw journalError("delta_journal_entry_invalid", `delta journal ${field} must be a SHA-256 fingerprint`);
  }
  return value ?? null;
}

function assertVersion(value, field) {
  if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw journalError("delta_journal_entry_invalid", `delta journal ${field} must be an integer >= 1`);
  }
  return value ?? null;
}

// Chained entry digest. Binds the entry to its sequence position, its
// snapshot, and the previous entry's digest, so reordering, dropping,
// or editing an entry breaks verification. The digest inputs contain
// no credential value and no material digest — only PKs, kinds,
// fingerprints, and version numbers.
export function entryDigest({
  seq,
  snapshotId,
  table,
  pk,
  kind,
  fingerprint = null,
  previousFingerprint = null,
  credentialVersion = null,
  credentialPreviousVersion = null,
  versionDigest = null,
  previousEntryDigest,
}) {
  if (!Number.isSafeInteger(seq) || seq < 1
    || typeof snapshotId !== "string" || snapshotId.length === 0
    || typeof table !== "string" || !SAFE_IDENTIFIER.test(table)
    || typeof pk !== "string" || pk.length === 0
    || !DELTA_JOURNAL_ENTRY_KINDS.includes(kind)
    || (fingerprint !== null && (typeof fingerprint !== "string" || !ROW_FINGERPRINT.test(fingerprint)))
    || (previousFingerprint !== null && (typeof previousFingerprint !== "string" || !ROW_FINGERPRINT.test(previousFingerprint)))
    || (credentialVersion !== null && (!Number.isInteger(credentialVersion) || credentialVersion < 1))
    || (credentialPreviousVersion !== null && (!Number.isInteger(credentialPreviousVersion) || credentialPreviousVersion < 1))
    || (versionDigest !== null && (typeof versionDigest !== "string" || !ROW_FINGERPRINT.test(versionDigest)))
    || typeof previousEntryDigest !== "string" || !ROW_FINGERPRINT.test(previousEntryDigest)) {
    throw journalError("delta_journal_entry_invalid", "delta journal entry digest inputs are malformed");
  }
  return sha256Hex(canonicalJson({
    version: DELTA_JOURNAL_VERSION,
    seq,
    snapshotId,
    table,
    pk,
    kind,
    fingerprint,
    previousFingerprint,
    credentialVersion,
    credentialPreviousVersion,
    versionDigest,
    previousEntryDigest,
  }));
}

// Create the journal + checkpoint tables. Idempotent. The journal DB
// is a separate handle from any source/target DB: this function writes
// no source or target table and installs no trigger.
export function ensureDeltaJournal(db) {
  assertDb(db);
  db.exec(`
    create table if not exists ${DELTA_JOURNAL_TABLE} (
      seq integer primary key,
      snapshot_id text not null,
      table_name text not null,
      pk text not null,
      kind text not null check (kind in ('insert', 'update', 'delete', 'credential-rotate')),
      fingerprint text,
      previous_fingerprint text,
      credential_version integer,
      credential_previous_version integer,
      version_digest text,
      entry_digest text not null,
      created_at text not null
    );
    create index if not exists ${DELTA_JOURNAL_TABLE}_snapshot_seq_idx
      on ${DELTA_JOURNAL_TABLE}(snapshot_id, seq);
    create table if not exists ${DELTA_JOURNAL_CHECKPOINT_TABLE} (
      snapshot_id text primary key,
      high_water_mark integer not null default 0 check (high_water_mark >= 0),
      applied_seq integer not null default 0 check (applied_seq >= 0),
      journal_hash text not null,
      credential_manifest_hash text,
      updated_at text not null
    );
  `);
  return { journal: true, table: DELTA_JOURNAL_TABLE, checkpointTable: DELTA_JOURNAL_CHECKPOINT_TABLE };
}

function readCheckpointRow(db, snapshotId) {
  return db.prepare(
    `select snapshot_id, high_water_mark, applied_seq, journal_hash, credential_manifest_hash, updated_at
     from ${DELTA_JOURNAL_CHECKPOINT_TABLE} where snapshot_id = ?`,
  ).get(snapshotId) ?? null;
}

export function readCheckpoint(db, { snapshotId } = {}) {
  assertDb(db);
  assertSnapshotId(snapshotId);
  ensureDeltaJournal(db);
  const row = readCheckpointRow(db, snapshotId);
  if (!row) return null;
  return {
    snapshotId: row.snapshot_id,
    highWaterMark: row.high_water_mark,
    appliedSeq: row.applied_seq,
    journalHash: row.journal_hash,
    credentialManifestHash: row.credential_manifest_hash,
    updatedAt: row.updated_at,
  };
}

// `highWaterMark` is the journal head (last appended seq) and is set
// by appends; `appliedSeq` is the replay progress and is set by
// replay only, so an append never moves the resume point and a
// replay never moves the head. Both are stored in the same row so a
// reader sees one atomic snapshot of journal state.
function upsertCheckpoint(db, { snapshotId, highWaterMark, appliedSeq, journalHash, credentialManifestHash, now }) {
  db.prepare(`
    insert into ${DELTA_JOURNAL_CHECKPOINT_TABLE}
      (snapshot_id, high_water_mark, applied_seq, journal_hash, credential_manifest_hash, updated_at)
    values (?, ?, ?, ?, ?, ?)
    on conflict(snapshot_id) do update set
      high_water_mark = excluded.high_water_mark,
      applied_seq = excluded.applied_seq,
      journal_hash = excluded.journal_hash,
      credential_manifest_hash = coalesce(excluded.credential_manifest_hash, ${DELTA_JOURNAL_CHECKPOINT_TABLE}.credential_manifest_hash),
      updated_at = excluded.updated_at
  `).run(snapshotId, highWaterMark, appliedSeq, journalHash, credentialManifestHash ?? null, now);
}

export function readJournalEntries(db, { snapshotId, fromSeq = 0 } = {}) {
  assertDb(db);
  assertSnapshotId(snapshotId);
  ensureDeltaJournal(db);
  if (!Number.isSafeInteger(fromSeq) || fromSeq < 0) {
    throw journalError("delta_journal_entry_invalid", "readJournalEntries requires fromSeq >= 0");
  }
  const rows = db.prepare(
    `select seq, snapshot_id, table_name, pk, kind, fingerprint, previous_fingerprint,
            credential_version, credential_previous_version, version_digest, entry_digest, created_at
     from ${DELTA_JOURNAL_TABLE}
     where snapshot_id = ? and seq > ? order by seq asc`,
  ).all(snapshotId, fromSeq);
  return rows.map((row) => ({
    seq: row.seq,
    snapshotId: row.snapshot_id,
    table: row.table_name,
    pk: row.pk,
    kind: row.kind,
    fingerprint: row.fingerprint,
    previousFingerprint: row.previous_fingerprint,
    credentialVersion: row.credential_version,
    credentialPreviousVersion: row.credential_previous_version,
    versionDigest: row.version_digest,
    entryDigest: row.entry_digest,
    createdAt: row.created_at,
    tombstone: row.kind === "delete" ? 1 : 0,
  }));
}

function assertEntryShape(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw journalError("delta_journal_entry_invalid", "delta journal entry must be an object");
  }
  if (typeof entry.table !== "string" || !SAFE_IDENTIFIER.test(entry.table)) {
    throw journalError("delta_journal_entry_invalid", "delta journal entry table must be a safe SQL identifier");
  }
  if (typeof entry.pk !== "string" || entry.pk.length === 0) {
    throw journalError("delta_journal_entry_invalid", "delta journal entry pk must be a non-empty string");
  }
  if (!DELTA_JOURNAL_ENTRY_KINDS.includes(entry.kind)) {
    throw journalError("delta_journal_entry_invalid", `delta journal entry kind is unsupported: ${String(entry.kind)}`);
  }
  const fingerprint = assertFingerprint(entry.fingerprint ?? null, "fingerprint");
  const previousFingerprint = assertFingerprint(entry.previousFingerprint ?? null, "previousFingerprint");
  const credentialVersion = assertVersion(entry.credentialVersion ?? null, "credentialVersion");
  const credentialPreviousVersion = assertVersion(entry.credentialPreviousVersion ?? null, "credentialPreviousVersion");
  const versionDigest = assertFingerprint(entry.versionDigest ?? null, "versionDigest");
  if (entry.kind === "credential-rotate") {
    if (credentialVersion === null || credentialPreviousVersion === null || versionDigest === null
      || credentialPreviousVersion >= credentialVersion) {
      throw journalError("delta_journal_entry_invalid", "credential-rotate entries require fromVersion < toVersion and a versionDigest");
    }
    if (fingerprint !== null || previousFingerprint !== null) {
      throw journalError("delta_journal_entry_invalid", "credential-rotate entries carry versions, not row fingerprints");
    }
  } else if (entry.kind === "update") {
    if (credentialVersion !== null || credentialPreviousVersion !== null || versionDigest !== null) {
      throw journalError("delta_journal_entry_invalid", "update entries must not carry credential versions");
    }
  } else if (entry.kind === "insert") {
    if (previousFingerprint !== null) {
      throw journalError("delta_journal_entry_invalid", "insert entries carry no previous fingerprint");
    }
    // A credential addition carries (version, versionDigest); a generic
    // insert carries a fingerprint. Exactly one of the two shapes.
    const versioned = credentialVersion !== null || versionDigest !== null;
    if (versioned && (credentialVersion === null || versionDigest === null || credentialPreviousVersion !== null)) {
      throw journalError("delta_journal_entry_invalid", "credential insert entries require version + versionDigest and no previous version");
    }
    if (versioned && fingerprint !== null) {
      throw journalError("delta_journal_entry_invalid", "credential insert entries carry versions, not row fingerprints");
    }
  } else if (entry.kind === "delete") {
    // A tombstone carries exactly one of: the checkpoint fingerprint
    // (generic delete) or (version, versionDigest) (credential delete).
    const versioned = credentialVersion !== null || versionDigest !== null;
    if (fingerprint !== null) {
      throw journalError("delta_journal_entry_invalid", "delete (tombstone) entries carry no current fingerprint");
    }
    if (versioned && (credentialVersion === null || versionDigest === null || credentialPreviousVersion !== null)) {
      throw journalError("delta_journal_entry_invalid", "credential delete entries require version + versionDigest and no previous version");
    }
    if (!versioned && previousFingerprint === null) {
      throw journalError("delta_journal_entry_invalid", "generic delete entries require the previous fingerprint");
    }
    if (versioned && previousFingerprint !== null) {
      throw journalError("delta_journal_entry_invalid", "delete entries carry either a fingerprint or credential versions, not both");
    }
  }
  if (entry.seq !== undefined && entry.seq !== null && (!Number.isSafeInteger(entry.seq) || entry.seq < 1)) {
    throw journalError("delta_journal_entry_invalid", "delta journal entry seq must be a positive integer");
  }
  return { table: entry.table, pk: entry.pk, kind: entry.kind, fingerprint, previousFingerprint, credentialVersion, credentialPreviousVersion, versionDigest, seq: entry.seq ?? null };
}

function journalState(db, snapshotId) {
  const rows = db.prepare(
    `select seq, entry_digest from ${DELTA_JOURNAL_TABLE} where snapshot_id = ? order by seq asc`,
  ).all(snapshotId);
  return {
    entryCount: rows.length,
    highWaterMark: rows.length === 0 ? 0 : rows[rows.length - 1].seq,
    journalHash: rows.length === 0 ? GENESIS_JOURNAL_HASH : rows[rows.length - 1].entry_digest,
    lastEntryDigest: rows.length === 0 ? GENESIS_JOURNAL_HASH : rows[rows.length - 1].entry_digest,
  };
}

// Append entries in the given order. Sequence numbers are assigned
// contiguously from the current HWM; an entry that carries an explicit
// `seq` must equal the next expected seq, otherwise the append fails
// closed with `delta_journal_gap` and nothing is written. A journal
// holds entries for exactly one snapshotId: appending a different
// snapshotId fails closed. The whole append (entries + checkpoint) is
// one transaction, so a failure leaves the journal unchanged.
export function appendDeltaEntries(db, { snapshotId, entries, credentialManifestHash = null, now = () => new Date() } = {}) {
  assertDb(db);
  assertSnapshotId(snapshotId);
  if (!Array.isArray(entries)) {
    throw journalError("delta_journal_entry_invalid", "appendDeltaEntries requires an entries array");
  }
  if (credentialManifestHash !== null && (typeof credentialManifestHash !== "string" || !ROW_FINGERPRINT.test(credentialManifestHash))) {
    throw journalError("delta_journal_entry_invalid", "credentialManifestHash must be a SHA-256 fingerprint");
  }
  ensureDeltaJournal(db);
  const normalized = entries.map(assertEntryShape);
  const existing = db.prepare(
    `select distinct snapshot_id from ${DELTA_JOURNAL_TABLE}`,
  ).all().map((row) => row.snapshot_id);
  if (existing.length > 0 && (existing.length !== 1 || existing[0] !== snapshotId)) {
    throw journalError("delta_journal_snapshot_mismatch", `delta journal already belongs to snapshot: ${existing.join(",")}`);
  }
  const state = journalState(db, snapshotId);
  const at = now().toISOString();
  let seq = state.highWaterMark;
  let previousEntryDigest = state.lastEntryDigest;
  const insert = db.prepare(`
    insert into ${DELTA_JOURNAL_TABLE}
      (seq, snapshot_id, table_name, pk, kind, fingerprint, previous_fingerprint,
       credential_version, credential_previous_version, version_digest, entry_digest, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const firstSeq = normalized.length === 0 ? null : seq + 1;
  const appendTx = db.transaction(() => {
    for (const entry of normalized) {
      const expectedSeq = seq + 1;
      if (entry.seq !== null && entry.seq !== expectedSeq) {
        throw journalError("delta_journal_gap", `delta journal seq gap: expected ${expectedSeq}, got ${entry.seq}`);
      }
      seq = expectedSeq;
      const digest = entryDigest({ ...entry, seq, snapshotId, previousEntryDigest });
      insert.run(seq, snapshotId, entry.table, entry.pk, entry.kind, entry.fingerprint,
        entry.previousFingerprint, entry.credentialVersion, entry.credentialPreviousVersion,
        entry.versionDigest, digest, at);
      previousEntryDigest = digest;
    }
    upsertCheckpoint(db, {
      snapshotId,
      highWaterMark: seq,
      appliedSeq: readCheckpointRow(db, snapshotId)?.applied_seq ?? 0,
      journalHash: previousEntryDigest,
      credentialManifestHash,
      now: at,
    });
  });
  appendTx();
  return {
    appended: normalized.length,
    firstSeq,
    lastSeq: normalized.length === 0 ? null : seq,
    highWaterMark: seq,
    journalHash: previousEntryDigest,
  };
}

// Append the output of `enumerateSourceDeltas` (source-delta.mjs) to
// the journal. Order is deterministic: tables in delta order; within a
// table inserted, then updated, then deleted (tombstones), each sorted
// by PK. Deletes carry only the checkpoint fingerprint.
export function appendSourceDelta(db, { snapshotId, delta, credentialManifestHash = null, now } = {}) {
  assertSnapshotId(snapshotId);
  if (!delta || typeof delta !== "object" || Array.isArray(delta)
    || typeof delta.sourceSnapshotId !== "string" || delta.sourceSnapshotId.length === 0
    || !Array.isArray(delta.tables)) {
    throw journalError("delta_journal_entry_invalid", "appendSourceDelta requires an enumerateSourceDeltas result");
  }
  if (delta.sourceSnapshotId !== snapshotId) {
    throw journalError("delta_journal_snapshot_mismatch", "source delta snapshotId does not match the journal snapshotId");
  }
  const byPk = (a, b) => (a.pk < b.pk ? -1 : a.pk > b.pk ? 1 : 0);
  const entries = [];
  for (const table of delta.tables) {
    for (const row of [...table.inserted].sort(byPk)) {
      entries.push({ table: table.table, pk: row.pk, kind: "insert", fingerprint: row.fingerprint });
    }
    for (const row of [...table.updated].sort(byPk)) {
      entries.push({ table: table.table, pk: row.pk, kind: "update", fingerprint: row.fingerprint, previousFingerprint: row.previousFingerprint });
    }
    for (const row of [...table.deleted].sort(byPk)) {
      entries.push({ table: table.table, pk: row.pk, kind: "delete", previousFingerprint: row.previousFingerprint });
    }
  }
  const result = appendDeltaEntries(db, { snapshotId, entries, credentialManifestHash, now });
  return { ...result, summary: delta.summary };
}

// Append the output of `detectCredentialRotations` to the journal.
// Rotated PKs become `credential-rotate` entries (from/to versions +
// the current manifest's version digest); added PKs become inserts;
// deleted PKs become delete tombstones. `currentManifest` supplies the
// per-PK version + versionDigest; the journal never sees a credential
// value or a material digest. Entries are ordered rotated, added,
// deleted, each sorted by PK.
export function appendCredentialRotations(db, { snapshotId, rotations, currentManifest, now } = {}) {
  assertSnapshotId(snapshotId);
  if (!rotations || typeof rotations !== "object" || Array.isArray(rotations)
    || !Array.isArray(rotations.rotated) || !Array.isArray(rotations.added) || !Array.isArray(rotations.deleted)) {
    throw journalError("delta_journal_entry_invalid", "appendCredentialRotations requires a detectCredentialRotations result");
  }
  verifyCredentialVersionManifest(currentManifest);
  if (currentManifest.snapshotId !== snapshotId) {
    throw journalError("delta_journal_snapshot_mismatch", "current credential manifest snapshotId does not match the journal snapshotId");
  }
  const byEntry = new Map(currentManifest.entries.map((entry) => [entry.pk, entry]));
  const byPk = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const entries = [];
  for (const item of [...rotations.rotated].sort((a, b) => byPk(a.pk, b.pk))) {
    const current = byEntry.get(item.pk);
    if (!current || current.version !== item.toVersion || current.deleted !== 0) {
      throw journalError("delta_journal_entry_invalid", `credential rotation has no matching current manifest entry: ${item.pk}`);
    }
    entries.push({
      table: CREDENTIALS_TABLE,
      pk: item.pk,
      kind: "credential-rotate",
      credentialPreviousVersion: item.fromVersion,
      credentialVersion: item.toVersion,
      versionDigest: current.versionDigest,
    });
  }
  for (const pk of [...rotations.added].sort(byPk)) {
    const current = byEntry.get(pk);
    if (!current || current.deleted !== 0) {
      throw journalError("delta_journal_entry_invalid", `credential addition has no matching current manifest entry: ${pk}`);
    }
    entries.push({
      table: CREDENTIALS_TABLE,
      pk,
      kind: "insert",
      credentialVersion: current.version,
      versionDigest: current.versionDigest,
    });
  }
  for (const pk of [...rotations.deleted].sort(byPk)) {
    const current = byEntry.get(pk);
    if (!current || current.deleted !== 1) {
      throw journalError("delta_journal_entry_invalid", `credential deletion has no matching current manifest entry: ${pk}`);
    }
    entries.push({
      table: CREDENTIALS_TABLE,
      pk,
      kind: "delete",
      credentialVersion: current.version,
      versionDigest: current.versionDigest,
    });
  }
  return appendDeltaEntries(db, {
    snapshotId,
    entries,
    credentialManifestHash: currentManifest.manifestHash,
    now,
  });
}

// Missing sequence numbers in the journal (for example after a row
// was deleted out-of-band). Empty means contiguous from 1.
export function findJournalGaps(db, { snapshotId } = {}) {
  assertDb(db);
  assertSnapshotId(snapshotId);
  ensureDeltaJournal(db);
  const seqs = db.prepare(
    `select seq from ${DELTA_JOURNAL_TABLE} where snapshot_id = ? order by seq asc`,
  ).all(snapshotId).map((row) => row.seq);
  const gaps = [];
  for (let expected = 1; expected <= (seqs.length === 0 ? 0 : seqs[seqs.length - 1]); expected += 1) {
    if (!seqs.includes(expected)) gaps.push(expected);
  }
  return gaps;
}

// Verify the whole journal: seqs contiguous from 1, every chained
// digest recomputes, and the checkpoint HWM + journal hash match the
// entries. When `expectedCredentialManifestHash` is given, the stored
// checkpoint must carry exactly that hash, binding the journal to one
// credential manifest. Throws DeltaJournalError on any mismatch.
export function verifyJournal(db, { snapshotId, expectedCredentialManifestHash = null } = {}) {
  assertDb(db);
  assertSnapshotId(snapshotId);
  ensureDeltaJournal(db);
  const gaps = findJournalGaps(db, { snapshotId });
  if (gaps.length > 0) {
    throw journalError("delta_journal_gap", `delta journal has missing seqs: ${gaps.join(",")}`);
  }
  const entries = readJournalEntries(db, { snapshotId });
  let previousEntryDigest = GENESIS_JOURNAL_HASH;
  for (const entry of entries) {
    const expected = entryDigest({ ...entry, previousEntryDigest });
    if (expected !== entry.entryDigest) {
      throw journalError("delta_journal_digest_mismatch", `delta journal entry digest mismatch at seq ${entry.seq}`);
    }
    previousEntryDigest = entry.entryDigest;
  }
  const checkpoint = readCheckpoint(db, { snapshotId });
  const highWaterMark = entries.length === 0 ? 0 : entries[entries.length - 1].seq;
  const journalHash = entries.length === 0 ? GENESIS_JOURNAL_HASH : entries[entries.length - 1].entryDigest;
  if (entries.length === 0 && !checkpoint) {
    // A fresh journal has no checkpoint row yet: that is the genesis
    // state (HWM 0, genesis hash), not a mismatch.
    if (expectedCredentialManifestHash !== null) {
      throw journalError("delta_journal_snapshot_mismatch", "delta journal checkpoint is not bound to the expected credential manifest");
    }
    return { ok: true, entryCount: 0, highWaterMark: 0, appliedSeq: 0, journalHash: GENESIS_JOURNAL_HASH, tombstoneCount: 0, credentialRotateCount: 0 };
  }
  if (!checkpoint || checkpoint.highWaterMark !== highWaterMark || checkpoint.journalHash !== journalHash) {
    throw journalError("delta_journal_checkpoint_mismatch", "delta journal checkpoint does not match its entries");
  }
  if (checkpoint.appliedSeq > highWaterMark) {
    throw journalError("delta_journal_checkpoint_mismatch", "delta journal applied seq is ahead of its high-water mark");
  }
  if (expectedCredentialManifestHash !== null && checkpoint.credentialManifestHash !== expectedCredentialManifestHash) {
    throw journalError("delta_journal_snapshot_mismatch", "delta journal checkpoint is not bound to the expected credential manifest");
  }
  return {
    ok: true,
    entryCount: entries.length,
    highWaterMark,
    appliedSeq: checkpoint.appliedSeq,
    journalHash,
    tombstoneCount: entries.filter((entry) => entry.kind === "delete").length,
    credentialRotateCount: entries.filter((entry) => entry.kind === "credential-rotate").length,
  };
}

// Replay journal entries in seq order through `apply(entry)`. The
// journal is verified first (corruption throws). `fromSeq` defaults
// to the checkpoint's applied seq, so a second call resumes where
// the first stopped. After each successful apply the checkpoint's
// applied pointer advances to that entry's seq, so a crash between
// entries loses at most the in-flight entry. When `apply` throws,
// replay stops and returns a receipt with `completed: false` instead
// of throwing: the caller retries the same call to resume. The
// receipt never claims an entry was applied unless the applied
// pointer advanced past it.
//
// The journal carries fingerprints/versions only, so `apply` must
// re-fetch the current row from the source by PK to mutate the
// target; the journal itself can never reconstruct a row value.
export async function replayDeltaJournal(db, { snapshotId, fromSeq = null, apply } = {}) {
  assertDb(db);
  assertSnapshotId(snapshotId);
  if (typeof apply !== "function") {
    throw journalError("delta_journal_entry_invalid", "replayDeltaJournal requires an apply callback");
  }
  verifyJournal(db, { snapshotId });
  const checkpoint = readCheckpoint(db, { snapshotId });
  const startSeq = fromSeq ?? checkpoint?.appliedSeq ?? 0;
  if (!Number.isSafeInteger(startSeq) || startSeq < 0) {
    throw journalError("delta_journal_entry_invalid", "replayDeltaJournal requires fromSeq >= 0");
  }
  const entries = readJournalEntries(db, { snapshotId, fromSeq: startSeq });
  const at = new Date().toISOString();
  let applied = 0;
  let lastAppliedSeq = startSeq;
  for (const entry of entries) {
    try {
      await apply(entry);
    } catch (error) {
      return {
        completed: false,
        applied,
        lastAppliedSeq,
        failedSeq: entry.seq,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const state = journalState(db, snapshotId);
    upsertCheckpoint(db, {
      snapshotId,
      highWaterMark: state.highWaterMark,
      appliedSeq: entry.seq,
      journalHash: state.journalHash,
      credentialManifestHash: checkpoint?.credentialManifestHash ?? null,
      now: at,
    });
    applied += 1;
    lastAppliedSeq = entry.seq;
  }
  return { completed: true, applied, lastAppliedSeq, failedSeq: null, error: null };
}

// U-F18 source/target final reconciliation over credential version
// manifests. Both manifests are verified first (a tampered manifest
// throws CredentialReconciliationError). `snapshotId` must equal the
// SOURCE manifest's snapshotId: the report is bound to the source
// snapshot that produced the diff. Identity consistency means both
// manifests describe the same table; the report also carries both
// snapshotIds and both manifest hashes so a reviewer can see the
// lineage. `reconciled` is true only when the diff is empty — after
// the reported diff is applied to the target and the target manifest
// is rebuilt, a second call must report reconciled: true.
//
// This compares manifests, not databases: it proves the two
// credential version lists agree, not that the target holds the same
// credential values. Source/target value parity is out of scope for
// this module and must not be claimed from this report.
export function reconcileCredentialManifests(sourceManifest, targetManifest, { snapshotId } = {}) {
  assertSnapshotId(snapshotId);
  verifyCredentialVersionManifest(sourceManifest);
  verifyCredentialVersionManifest(targetManifest);
  if (sourceManifest.snapshotId !== snapshotId) {
    throw journalError("delta_journal_snapshot_mismatch", "reconciliation snapshotId does not match the source credential manifest");
  }
  const identityConsistent = sourceManifest.table === targetManifest.table
    && sourceManifest.table === CREDENTIALS_TABLE;
  if (!identityConsistent) {
    throw journalError("delta_journal_snapshot_mismatch", "credential manifests describe different tables");
  }
  const diff = detectCredentialRotations(targetManifest, sourceManifest);
  const reconciled = diff.rotated.length === 0 && diff.added.length === 0 && diff.deleted.length === 0;
  return {
    snapshotId,
    sourceSnapshotId: sourceManifest.snapshotId,
    targetSnapshotId: targetManifest.snapshotId,
    table: CREDENTIALS_TABLE,
    identityConsistent: true,
    sourceManifestHash: sourceManifest.manifestHash,
    targetManifestHash: targetManifest.manifestHash,
    rotated: diff.rotated,
    added: diff.added,
    deleted: diff.deleted,
    unchanged: diff.unchanged,
    reconciled,
  };
}
