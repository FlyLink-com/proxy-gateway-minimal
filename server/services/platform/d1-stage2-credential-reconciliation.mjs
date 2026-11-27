// D1 Stage 2 — U-F18 credential-only reconciliation (source side).
//
// platform_portal_edge_credentials has no updated_at column, and the
// 1B fingerprint deliberately excludes credential columns, so a
// credential-only rotation that keeps the row count produces no delta
// entry and no freeze-receipt signal. This module is the dedicated
// source-side detector for exactly that case.
//
// Mechanism: a trigger-maintained opaque version per credential row.
// Three AFTER triggers on the credentials table bump a version counter
// in platform_credential_versions on every INSERT / UPDATE / DELETE.
// The version manifest carries ONLY (pk, version, deleted, origin) plus
// a SHA-256 digest over those four fields — no credential value bytes,
// no edge_material_digest, no updated_at. A same-row-count rotation
// shows up as a version bump for an unchanged PK.
//
// Why edge_material_digest is NOT the signal: it is a `sha256:` digest
// of the secret material. It may change on rotation, but (a) no
// rotation path is proven to update it on every write, so it cannot be
// relied on as the detector, and (b) exporting a hash of secret
// material lets a holder verify guesses against low-entropy material.
// It is therefore excluded from every exported fingerprint and digest
// here, exactly like the credential columns themselves.
//
// Scope and honesty:
// - This is source-side only. It detects rotations in the source
//   database; it does not prove the target holds the same versions.
//   Independently reviewed 2026-11-25 (PASS, no blocking defect):
//   decisions/INDEPENDENT_REVIEW_UF18_2026-11-25.md. U-F18 stays
//   fenced with that evidence; do not claim source/target parity.
// - The version table itself is a writer entry point: direct writes to
//   it bypass the triggers. The manifest is only valid when read under
//   the same BEGIN IMMEDIATE snapshot as the freeze receipt, and the
//   versions table must be fenced like any other writer before cutover.
// - Rows that predate tracking get origin 'backfilled' with version 1:
//   a rotation that happened before tracking is invisible, and the
//   manifest flags that weak baseline instead of hiding it.
// - Installing the triggers on a production database is a schema
//   change and is NOT done here. This module is exercised only on
//   synthetic databases in tests.

import { createHash } from "node:crypto";

export const CREDENTIALS_TABLE = "platform_portal_edge_credentials";
export const CREDENTIAL_VERSION_TABLE = "platform_credential_versions";
// The three maintenance triggers, as one list: the single source of
// truth for both installation (ensureCredentialVersionTracking) and
// the installed check (assertCredentialVersionTrackingInstalled).
export const CREDENTIAL_VERSION_TRIGGERS = Object.freeze([
  `${CREDENTIAL_VERSION_TABLE}_on_insert`,
  `${CREDENTIAL_VERSION_TABLE}_on_update`,
  `${CREDENTIAL_VERSION_TABLE}_on_delete`,
]);
export const CREDENTIAL_VERSION_MANIFEST_VERSION = 1;

export class CredentialReconciliationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CredentialReconciliationError";
    this.code = code;
  }
}

function credentialError(code, message) {
  return new CredentialReconciliationError(code, message);
}

export function isCredentialReconciliationError(error) {
  return error instanceof CredentialReconciliationError;
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

const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

// The composite primary key (request_id, edge_channel_ref) encoded as
// one opaque key. The separator is '|'; request/channel refs are
// control refs that never contain it (enforced by the callers that
// build synthetic fixtures, and asserted here).
export function credentialPk(requestId, edgeChannelRef) {
  if (
    typeof requestId !== "string" || requestId.length === 0 || requestId.includes("|")
    || typeof edgeChannelRef !== "string" || edgeChannelRef.length === 0 || edgeChannelRef.includes("|")
  ) {
    throw credentialError("credential_pk_invalid", "credential pk parts must be non-empty strings without '|'");
  }
  return `${requestId}|${edgeChannelRef}`;
}

// Opaque per-row version digest. Binds (pk, version, deleted, origin)
// only. It never depends on a credential value, on
// edge_material_digest, or on updated_at, so two different secret
// values with the same pk/version produce the same digest.
export function credentialVersionDigest({ pk, version, deleted, origin }) {
  if (typeof pk !== "string" || pk.length === 0
    || !Number.isInteger(version) || version < 1
    || (deleted !== 0 && deleted !== 1)
    || (origin !== "tracked" && origin !== "backfilled")) {
    throw credentialError("credential_version_digest_invalid", "credential version entry is malformed");
  }
  return sha256Hex(canonicalJson({ pk, version, deleted, origin }));
}

// Install the version table and the three maintenance triggers.
// Idempotent (CREATE TABLE / TRIGGER IF NOT EXISTS). The triggers use
// SQLite's own UTC clock for updated_at; updated_at is excluded from
// every digest, so manifests stay deterministic.
//
// D1 fence note (2026-11-26, control-plane read work): no
// assertWritable fence is added here, deliberately. This function
// installs DDL, it is not a serving business write, and its only
// caller is the offline source-manifest/export path
// (d1-stage2-source-manifest.mjs), which runs against source/export
// databases that carry no writer-authority row — fencing it would
// install authority state onto those databases as a side effect.
// There is also no serving method that writes the version table
// directly (rows are trigger-derived); the fence surface for the
// version table is therefore the credential write paths themselves
// (upsertPortalAccessRequest / rotateCoinCommerceDataPackEdgeCredential,
// both fenced), not this installer. If a serving writer for the
// version table is ever added, it must carry its own fence.
export function ensureCredentialVersionTracking(db) {
  if (!db || typeof db.exec !== "function" || typeof db.prepare !== "function") {
    throw credentialError("credential_tracking_unavailable", "credential version tracking requires a database handle");
  }
  const tableExists = db
    .prepare(`select name from sqlite_master where type = 'table' and name = ?`)
    .get(CREDENTIALS_TABLE);
  if (!tableExists) {
    throw credentialError("credential_table_missing", `credential table is missing: ${CREDENTIALS_TABLE}`);
  }
  db.exec(`
    create table if not exists ${CREDENTIAL_VERSION_TABLE} (
      credential_pk text primary key,
      version integer not null check (version >= 1),
      deleted integer not null default 0 check (deleted in (0, 1)),
      origin text not null check (origin in ('tracked', 'backfilled')),
      updated_at text not null
    );
  `);
  const [onInsertTrigger, onUpdateTrigger, onDeleteTrigger] = CREDENTIAL_VERSION_TRIGGERS;
  // INSERT: a fresh row starts at version 1. A re-insert of a
  // previously deleted PK resumes the version instead of resetting it.
  db.exec(`
    create trigger if not exists ${onInsertTrigger}
    after insert on ${CREDENTIALS_TABLE}
    begin
      insert into ${CREDENTIAL_VERSION_TABLE}
        (credential_pk, version, deleted, origin, updated_at)
      values (new.request_id || '|' || new.edge_channel_ref, 1, 0, 'tracked',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      on conflict(credential_pk) do update set
        version = ${CREDENTIAL_VERSION_TABLE}.version + 1,
        deleted = 0,
        origin = ${CREDENTIAL_VERSION_TABLE}.origin,
        updated_at = excluded.updated_at;
    end;
  `);
  // UPDATE: bump the version. A row that predates tracking has no
  // version entry; the insert branch records it as backfilled so the
  // weak baseline is visible instead of silently versioned as 1.
  db.exec(`
    create trigger if not exists ${onUpdateTrigger}
    after update on ${CREDENTIALS_TABLE}
    begin
      insert into ${CREDENTIAL_VERSION_TABLE}
        (credential_pk, version, deleted, origin, updated_at)
      values (new.request_id || '|' || new.edge_channel_ref, 1, 0, 'backfilled',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      on conflict(credential_pk) do update set
        version = ${CREDENTIAL_VERSION_TABLE}.version + 1,
        deleted = 0,
        origin = ${CREDENTIAL_VERSION_TABLE}.origin,
        updated_at = excluded.updated_at;
    end;
  `);
  // DELETE: keep a tombstone with a bumped version so the deletion is
  // detectable from the manifest even though the live row is gone.
  db.exec(`
    create trigger if not exists ${onDeleteTrigger}
    after delete on ${CREDENTIALS_TABLE}
    begin
      insert into ${CREDENTIAL_VERSION_TABLE}
        (credential_pk, version, deleted, origin, updated_at)
      values (old.request_id || '|' || old.edge_channel_ref, 1, 1, 'backfilled',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      on conflict(credential_pk) do update set
        version = ${CREDENTIAL_VERSION_TABLE}.version + 1,
        deleted = 1,
        origin = ${CREDENTIAL_VERSION_TABLE}.origin,
        updated_at = excluded.updated_at;
    end;
  `);
  return { tracked: true, table: CREDENTIAL_VERSION_TABLE };
}

// Prove credential version tracking is installed: the version table
// AND all three maintenance triggers must be present. The version
// table alone is not proof — a dropped trigger leaves a
// consistent-looking manifest that never bumps, so a rotation during
// a freeze drain would stay invisible. Fail closed on a missing
// table or any missing trigger. This is a verify-only check: it never
// installs anything (installing the triggers is a schema change the
// operator performs before the round, with backfillCredentialVersions
// for rows that predate tracking).
export function assertCredentialVersionTrackingInstalled(db) {
  if (!db || typeof db.prepare !== "function") {
    throw credentialError("credential_tracking_unavailable", "credential version tracking requires a database handle");
  }
  const versionTable = db
    .prepare(`select name from sqlite_master where type = 'table' and name = ?`)
    .get(CREDENTIAL_VERSION_TABLE);
  if (!versionTable) {
    throw credentialError("credential_tracking_unavailable", "credential version table is missing; tracking is not installed");
  }
  const present = new Set(
    db.prepare(`select name from sqlite_master where type = 'trigger' and name in (?, ?, ?)`)
      .all(...CREDENTIAL_VERSION_TRIGGERS)
      .map((row) => row.name),
  );
  const missing = CREDENTIAL_VERSION_TRIGGERS.filter((name) => !present.has(name));
  if (missing.length !== 0) {
    throw credentialError("credential_tracking_unavailable", `credential version triggers are missing: ${missing.join(", ")}; tracking is not installed`);
  }
  return { tracked: true, table: CREDENTIAL_VERSION_TABLE, triggers: [...CREDENTIAL_VERSION_TRIGGERS] };
}

// Backfill version entries for credential rows that predate tracking.
// Each backfilled row starts at version 1 with origin 'backfilled'.
// Returns the number of rows backfilled. A rotation that happened
// before tracking stays invisible; the manifest reports the
// backfilledCount so the coordinator knows the baseline is weak.
export function backfillCredentialVersions(db, { now = () => new Date() } = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw credentialError("credential_tracking_unavailable", "credential backfill requires a database handle");
  }
  const at = now().toISOString();
  const rows = db
    .prepare(`select request_id, edge_channel_ref from ${CREDENTIALS_TABLE} order by request_id asc, edge_channel_ref asc`)
    .all();
  let backfilled = 0;
  const insert = db.prepare(`
    insert or ignore into ${CREDENTIAL_VERSION_TABLE}
      (credential_pk, version, deleted, origin, updated_at)
    values (?, 1, 0, 'backfilled', ?)
  `);
  for (const row of rows) {
    const pk = credentialPk(row.request_id, row.edge_channel_ref);
    const changed = insert.run(pk, at);
    if (changed.changes === 1) backfilled += 1;
  }
  return { backfilled };
}

// Build the version manifest. Fail closed: a live credential row with
// no version entry is untracked (tracking was never installed or was
// bypassed), and a version entry with deleted = 0 and no live row is
// an orphaned version. Both are errors, not warnings.
//
// Error messages never carry the composite credential PK: these errors
// are surfaced verbatim into freeze refusal responses (see the
// coordinator's assertCredentialManifestUnmoved and the executor's
// readCredentialManifest), so only the error code identifies the
// failure class. Operators diagnose the affected rows by reading the
// version table directly; the manifest itself still binds every pk.
export function buildCredentialVersionManifest(db, { snapshotId } = {}) {
  if (typeof snapshotId !== "string" || snapshotId.length === 0) {
    throw credentialError("credential_snapshot_required", "credential version manifest requires a non-empty snapshotId");
  }
  if (!db || typeof db.prepare !== "function") {
    throw credentialError("credential_tracking_unavailable", "credential version manifest requires a database handle");
  }
  const live = db
    .prepare(`select request_id, edge_channel_ref from ${CREDENTIALS_TABLE} order by request_id asc, edge_channel_ref asc`)
    .all();
  const livePks = new Set(live.map((row) => credentialPk(row.request_id, row.edge_channel_ref)));
  let versions;
  try {
    versions = db
      .prepare(`select credential_pk, version, deleted, origin from ${CREDENTIAL_VERSION_TABLE} order by credential_pk asc`)
      .all();
  } catch {
    throw credentialError("credential_tracking_unavailable", "credential version table is missing; tracking is not installed");
  }
  const entries = [];
  let backfilledCount = 0;
  for (const row of versions) {
    const entry = {
      pk: row.credential_pk,
      version: Number(row.version),
      deleted: Number(row.deleted),
      origin: row.origin,
    };
    if (entry.deleted === 0 && !livePks.has(entry.pk)) {
      throw credentialError("credential_version_orphaned", "credential version has no live row");
    }
    if (entry.deleted === 1 && livePks.has(entry.pk)) {
      throw credentialError("credential_version_orphaned", "credential version is tombstoned but the row is live");
    }
    entry.versionDigest = credentialVersionDigest(entry);
    if (entry.origin === "backfilled") backfilledCount += 1;
    entries.push(entry);
  }
  for (const pk of livePks) {
    if (!entries.some((entry) => entry.pk === pk)) {
      throw credentialError("credential_version_untracked", "live credential row has no version entry");
    }
  }
  const manifestHash = sha256Hex(canonicalJson({
    snapshotId,
    table: CREDENTIALS_TABLE,
    entries: entries.map(({ pk, version, deleted, origin, versionDigest }) => ({ pk, version, deleted, origin, versionDigest })),
  }));
  return {
    version: CREDENTIAL_VERSION_MANIFEST_VERSION,
    snapshotId,
    table: CREDENTIALS_TABLE,
    liveRowCount: livePks.size,
    tombstoneCount: entries.filter((entry) => entry.deleted === 1).length,
    backfilledCount,
    entries,
    manifestHash,
  };
}

// Recompute every digest and the manifest hash. Returns true on
// success; throws CredentialReconciliationError on any mismatch.
export function verifyCredentialVersionManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || manifest.version !== CREDENTIAL_VERSION_MANIFEST_VERSION
    || manifest.table !== CREDENTIALS_TABLE
    || typeof manifest.snapshotId !== "string" || manifest.snapshotId.length === 0
    || !Array.isArray(manifest.entries)
    || !Number.isInteger(manifest.liveRowCount) || manifest.liveRowCount < 0
    || !Number.isInteger(manifest.tombstoneCount) || manifest.tombstoneCount < 0
    || !Number.isInteger(manifest.backfilledCount) || manifest.backfilledCount < 0
    || typeof manifest.manifestHash !== "string" || !/^[0-9a-f]{64}$/.test(manifest.manifestHash)) {
    throw credentialError("credential_manifest_invalid", "credential version manifest is malformed");
  }
  const seen = new Set();
  let live = 0;
  let tombstones = 0;
  let backfilled = 0;
  for (const entry of manifest.entries) {
    if (!entry || typeof entry !== "object" || seen.has(entry.pk)) {
      throw credentialError("credential_manifest_invalid", "credential version manifest has a duplicate or malformed entry");
    }
    seen.add(entry.pk);
    if (credentialVersionDigest(entry) !== entry.versionDigest) {
      throw credentialError("credential_manifest_invalid", `credential version digest mismatch: ${entry.pk}`);
    }
    if (entry.deleted === 0) live += 1;
    else if (entry.deleted === 1) tombstones += 1;
    else throw credentialError("credential_manifest_invalid", "credential version deleted flag is malformed");
    if (entry.origin === "backfilled") backfilled += 1;
  }
  if (live !== manifest.liveRowCount || tombstones !== manifest.tombstoneCount || backfilled !== manifest.backfilledCount) {
    throw credentialError("credential_manifest_invalid", "credential version manifest counts do not match its entries");
  }
  const expected = sha256Hex(canonicalJson({
    snapshotId: manifest.snapshotId,
    table: manifest.table,
    entries: manifest.entries.map(({ pk, version, deleted, origin, versionDigest }) => ({ pk, version, deleted, origin, versionDigest })),
  }));
  if (expected !== manifest.manifestHash) {
    throw credentialError("credential_manifest_invalid", "credential version manifest hash does not match its contents");
  }
  return true;
}

// Compare two verified manifests and report rotations. A rotation is a
// version bump for a PK that is live in both; an addition is a live PK
// in current only; a deletion is a PK tombstoned in current (or absent
// from current entirely, which verifyCredentialVersionManifest would
// have caught as orphaned only when deleted = 0 — so absence here is
// treated as deleted). Both manifests are verified first.
export function detectCredentialRotations(previous, current) {
  verifyCredentialVersionManifest(previous);
  verifyCredentialVersionManifest(current);
  const prevByPk = new Map(previous.entries.map((entry) => [entry.pk, entry]));
  const curByPk = new Map(current.entries.map((entry) => [entry.pk, entry]));
  const rotated = [];
  const added = [];
  const deleted = [];
  let unchanged = 0;
  for (const [pk, cur] of curByPk.entries()) {
    const prev = prevByPk.get(pk);
    if (!prev) {
      if (cur.deleted === 0) added.push(pk);
      else deleted.push(pk);
      continue;
    }
    if (cur.deleted === 1 && prev.deleted === 0) {
      deleted.push(pk);
      continue;
    }
    if (cur.deleted === 0 && prev.deleted === 1) {
      added.push(pk);
      continue;
    }
    if (cur.version !== prev.version) {
      rotated.push({ pk, fromVersion: prev.version, toVersion: cur.version });
    } else {
      unchanged += 1;
    }
  }
  for (const pk of prevByPk.keys()) {
    if (!curByPk.has(pk)) deleted.push(pk);
  }
  return { rotated, added, deleted, unchanged };
}
