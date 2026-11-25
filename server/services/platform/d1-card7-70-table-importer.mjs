// D1 Card 7 — real 70-table BWH -> E4 importer (source architecture only).
//
// Scope of this module (read the header before using it):
// - Implements the four importer layers as pure functions over caller-supplied
//   data: (1) read-only source reading, (2) field transform / filter,
//   (3) batched checkpointing, (4) E4 executor *interface*.
// - NEVER reads a real BWH row, NEVER writes E4, NEVER loads data, NEVER
//   opens a database file, NEVER performs network I/O, NEVER touches a
//   secret or ciphertext. The executor layer only validates the E4 target
//   allowlist and builds D1 statement descriptors; `executeD1Batch` always
//   throws `e4_executor_not_connected`. Real execution needs a separate
//   approval (L1) and a connected executor, which this card does not provide.
// - All rows this module ever sees are synthetic rows supplied by the caller
//   (see `d1-card7-synthetic-fixture.mjs`). The source handle is an
//   already-open, caller-owned database handle; this module opens no files.
//
// Seven signed rules (Yi, 7/7 — see Card 6 §3.3; the code below is the
// enforcement point, one function per rule):
//   1. released_at: existing NULL stays NULL, never backfilled.
//   2. node_ref: original reference and NULL kept, never generated/replaced.
//   3. generation: kept as nullable TEXT verbatim, including leading zeros.
//      NEVER coerced to integer. (This supersedes the early integer draft;
//      no `Number()` / `parseInt` / `BigInt` coercion of generation exists
//      anywhere in this module.)
//   4. receipt_digest: historic digests are opaque text. Kept verbatim when
//      losslessly storable; a row that cannot be stored losslessly is
//      DEFERRED as a whole with reason D-1, never truncated or re-hashed.
//   5. reason_code: text and NULL kept verbatim, never mapped to an enum.
//   6. listener_present: DEFERRED, not loaded (CARD6 §3.3 #6, aligned
//      with the load executor's CARD6-3.3-#6 DEFER). The source integers
//      0 / 1 are validated by transformListenerPresent, but the column
//      carries no target value this round: it is E4-side receipt
//      metadata, not a source fact. See the P fix (PR #904 r4657005808).
//   7. credential_count: DEFERRED, not loaded (CARD6 §3.3 #7, aligned
//      with the load executor's CARD6-3.3-#7 DEFER). Same treatment:
//      transformCredentialCount still validates the source integers,
//      but the column is excluded from the load. See the P fix.
//
// Batch / checkpoint / hash rules follow Card 6 exactly: 100 rows per batch,
// per-table ceiling, 103 batches for the first-batch 50 tables; checkpoint
// fields per Card 6 §5.1; count/hash per Card 6 §6 (NULL is the literal
// 6-character `\0NULL`, integers are decimal text, `|`-joined, SHA-256;
// rows by PK ascending, tables by name ascending).

import { createHash } from "node:crypto";
import {
  TABLE_MAPPING,
  tableMappingFor,
  E4_DATABASE_ID,
  E4_DATABASE_NAME,
  E4_ACCOUNT_ID,
} from "./d1-card7-70-table-mapping.mjs";
import {
  coinCommerceSubscriptionFulfillmentMetadataJson,
  portalAccessEventJson,
} from "./control-json-contracts.mjs";

export { E4_DATABASE_ID, E4_DATABASE_NAME, E4_ACCOUNT_ID };
export { TABLE_MAPPING, tableMappingFor };

export const CARD7_SNAPSHOT_NOTE =
  "Synthetic-only importer. Snapshot identity is caller-supplied per run; " +
  "no snapshot SHA is hardcoded here, so a new snapshot never inherits an " +
  "old run's identity conclusions.";
export const BATCH_SIZE = 100;
export const MAX_STATEMENT_BYTES = 100_000;
export const MAX_ROW_BYTES = 2_000_000;
export const MAX_BIND_PARAMS = 100;
export const MAX_BATCH_SECONDS = 30;
export const E4_TARGET = Object.freeze({
  databaseId: E4_DATABASE_ID,
  databaseName: E4_DATABASE_NAME,
  accountId: E4_ACCOUNT_ID,
});
export const RING_GROUP_LOTS_CREDIT_ORIGINS = "lots-credit-origins";
export const RING_TABLES = Object.freeze([
  "platform_coin_lots",
  "platform_coin_credit_origins",
]);

// ---------------------------------------------------------------------------
// Source-side filter columns that have NO target column in DDL v1.1.
// The target column list alone cannot guard them: the filter must reject
// them on the source side, before any row is built for D1.
// E-01..E-08 per Card 6 §3.4 (E-08 is the proposed addition for link_resets).
// ---------------------------------------------------------------------------
export const EXTERNALIZE_SOURCE_COLUMNS = Object.freeze([
  Object.freeze({ table: "platform_leads", column: "email", id: "E-01" }),
  Object.freeze({ table: "platform_leads", column: "message", id: "E-02" }),
  Object.freeze({ table: "platform_portal_access_requests", column: "subscription_url", id: "E-03" }),
  Object.freeze({ table: "platform_portal_totp_credentials", column: "encrypted_totp_secret", id: "E-04" }),
  Object.freeze({ table: "platform_payment_receipts", column: "next_action_url", id: "E-05" }),
  Object.freeze({ table: "platform_payment_orders_legacy_archive_20260803", column: "checkout_url", id: "E-06" }),
  Object.freeze({ table: "platform_payment_orders_legacy_archive_20260803", column: "checkout_qr_code", id: "E-07" }),
  Object.freeze({ table: "platform_portal_subscription_link_resets", column: "subscription_url", id: "E-08" }),
]);

// Source-only columns: present in the BWH source but deliberately absent
// from the DDL target. They are allowed through the unknown-column guard
// and then dropped by the filter (never copied into D1).
export const SOURCE_ONLY_COLUMNS = Object.freeze(new Set([
  "platform_accounts.metadata_json", // M1-02: not built, not loaded
]));

// Raw source column -> digest-only target column (#4). The raw value is
// hashed by the filter and never leaves this layer; only the digest column
// is written. The digest construction here (SHA-256 over a synthetic,
// labelled preimage) is the synthetic-data stand-in: the production digest
// algorithm and its input are fixed by the DDL finalisation, not by this
// card (Card 6 §3.4).
export const RAW_TO_DIGEST_COLUMN = Object.freeze({
  "platform_coin_commerce_fulfillment_commands": Object.freeze({ lease_token: "lease_token_hash" }),
  "platform_coin_commerce_operation_receipts": Object.freeze({ idempotency_key: "idempotency_key_digest" }),
  "platform_coin_operation_receipts": Object.freeze({ idempotency_key: "idempotency_key_digest" }),
  "platform_payment_orders": Object.freeze({ create_idempotency_key: "create_idempotency_key_digest" }),
  "platform_payment_receipts": Object.freeze({ event_dedupe_key: "event_dedupe_key_digest" }),
  "platform_portal_registration_welcome_coin_grants": Object.freeze({
    idempotency_key: "idempotency_key_digest",
    lease_token: "lease_token_hash",
  }),
});

// Card 6's first-batch 50 tables that are NOT in the 70-table source
// baseline (they exist in DDL v1.1 and in the Card 6 snapshot counts, but
// not in source-70-baseline.json — see the implementation report gap G-1).
// The planner counts them; the reader reports them source-absent.
export const CARD6_DDL_ONLY_TABLES = Object.freeze([
  Object.freeze({
    source: "platform_edge_desired_states", target: "platform_edge_desired_states",
    tableDisposition: "CONDITIONAL", loadScope: "first-batch-50", fkLayer: 0,
    snapshotRows: 3, sourceAbsentFromBaseline: true,
    columns: Object.freeze([
      "desired_state_ref", "node_ref", "generation", "status",
      "channel_refs_json", "edge_credential_refs_json", "material_digests_json",
      "channel_count", "edge_credential_count", "digest_count",
      "valid_until", "created_at", "updated_at",
    ]),
  }),
  Object.freeze({
    source: "platform_edge_desired_state_channels", target: "platform_edge_desired_state_channels",
    tableDisposition: "CONDITIONAL", loadScope: "first-batch-50", fkLayer: 1,
    snapshotRows: 3, sourceAbsentFromBaseline: true,
    columns: Object.freeze(["desired_state_ref", "channel_ref"]),
  }),
  Object.freeze({
    source: "platform_portal_subscription_link_resets", target: "platform_portal_subscription_link_resets",
    tableDisposition: "CONDITIONAL", loadScope: "first-batch-50", fkLayer: 2,
    snapshotRows: 6, sourceAbsentFromBaseline: true,
    columns: Object.freeze([
      "operation_key_digest", "request_ref", "owner_ref", "tenant_id",
      "previous_artifact_id", "replacement_artifact_id", "prepared_at",
      "completed_at", "state", "source_digest",
    ]),
  }),
]);

function fail(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

// Reconciliation fingerprint helper — NOT a password hash. The only values
// hashed here are synthetic fixture labels and row fingerprints used to
// compare source vs target (Card 6 §6.2). The `password_hash` column of
// `platform_portal_password_credentials` is DEFER-disposition and KEEP-GATED:
// transformRow drops it and targetColumnsFor excludes it from the hash
// input, so no password value ever reaches this hash at runtime (verified
// by direct execution: gates-open output row is empty, target columns are
// []). The production digest algorithm is fixed by DDL finalisation, not
// by this card (Card 6 §3.4).
function sha256Hex(text) {
  // codeql[js/insufficient-password-hash]
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function digestOfRaw(table, column, raw) {
  return sha256Hex(`d1-card7-synthetic-digest:${table}:${column}:${raw}`);
}

// ===========================================================================
// Layer 1 — read-only source reading (caller-owned handle, synthetic only)
// ===========================================================================

export function assertSyntheticSourceHandle(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.exec !== "function") {
    fail("synthetic_source_handle_invalid",
      "source must be an already-open database handle supplied by the caller");
  }
  return true;
}

export function assertSourceTableReadable(table) {
  if (table === "platform_usage_samples") {
    fail("samples_table_excluded",
      "platform_usage_samples is excluded whole-table (D-3 option C); load 0 rows");
  }
  if (!tableMappingFor(table)) {
    fail("unknown_source_table", table);
  }
  return true;
}

export function pkColumnsFor(table) {
  const mapping = tableMappingFor(table);
  if (!mapping) fail("unknown_source_table", table);
  const pks = mapping.columns.filter((c) => c.pk).map((c) => c.name);
  return pks.length > 0 ? pks : [mapping.columns[0].name];
}

export function countSourceRows(db, table) {
  assertSyntheticSourceHandle(db);
  assertSourceTableReadable(table);
  const row = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get();
  return row.n;
}

export function readSourcePage(db, table, { afterPk = null, limit = BATCH_SIZE } = {}) {
  assertSyntheticSourceHandle(db);
  assertSourceTableReadable(table);
  if (!Number.isInteger(limit) || limit < 1 || limit > BATCH_SIZE) {
    fail("invalid_page_limit", String(limit));
  }
  const pks = pkColumnsFor(table);
  const orderBy = pks.map((c) => `"${c}" ASC`).join(", ");
  if (afterPk === null || afterPk === undefined) {
    return db.prepare(`SELECT * FROM "${table}" ORDER BY ${orderBy} LIMIT ?`).all(limit);
  }
  const keys = Array.isArray(afterPk) ? afterPk : [afterPk];
  if (keys.length !== pks.length) fail("keyset_cursor_mismatch", table);
  const where = `(${pks.map((c) => `"${c}"`).join(", ")}) > (${keys.map(() => "?").join(", ")})`;
  return db.prepare(`SELECT * FROM "${table}" WHERE ${where} ORDER BY ${orderBy} LIMIT ?`)
    .all(...keys, limit);
}

export function verifySourceIntegrity(db) {
  assertSyntheticSourceHandle(db);
  const integrity = db.prepare("PRAGMA integrity_check").get();
  const fkViolations = db.prepare("PRAGMA foreign_key_check").all();
  return {
    integrityCheck: integrity?.integrity_check ?? integrity?.[Object.keys(integrity ?? {})[0]] ?? null,
    foreignKeyViolations: fkViolations.length,
    ok: integrity !== null && String(Object.values(integrity)[0]) === "ok" && fkViolations.length === 0,
  };
}

export function assertSnapshotIdentity({ snapshotId, sha256, byteSize } = {}) {
  if (typeof snapshotId !== "string" || snapshotId.length === 0) {
    fail("snapshot_identity_invalid", "snapshotId is required");
  }
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
    fail("snapshot_identity_invalid", "sha256 must be 64 lowercase hex characters");
  }
  if (byteSize !== undefined && (!Number.isInteger(byteSize) || byteSize < 0)) {
    fail("snapshot_identity_invalid", "byteSize must be a non-negative integer");
  }
  return { snapshotId, sha256, byteSize: byteSize ?? null };
}

// ===========================================================================
// Layer 2 — field transform / filter: the seven signed rules
// ===========================================================================

// Rule 1 — released_at: existing NULL stays NULL, never backfilled.
export function transformReleasedAt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail("seven_rule_violation", "released_at must be TEXT or NULL");
  return value;
}

// Rule 2 — node_ref: original reference and NULL kept, never generated.
export function transformNodeRef(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail("seven_rule_violation", "node_ref must be TEXT or NULL");
  return value;
}

// Rule 3 — generation: nullable TEXT verbatim, including leading zeros.
// NEVER coerced to integer. A numeric input is refused, not converted.
export function transformGeneration(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    fail("generation_must_remain_text",
      `generation arrived as ${typeof value}; refusing to coerce to TEXT`);
  }
  return value;
}

// A digest is losslessly storable only as a UTF-8 string that round-trips
// byte-identically and fits the D1 row limit. Anything else defers the row.
export function isLosslesslyStorableText(value) {
  if (typeof value !== "string") return false;
  if (Buffer.byteLength(value, "utf8") > MAX_ROW_BYTES) return false;
  return Buffer.from(value, "utf8").toString("utf8") === value;
}

// Rule 4 — receipt_digest: opaque text. Verbatim when losslessly storable;
// otherwise the WHOLE ROW is deferred with D-1, never truncated/re-hashed.
export function transformReceiptDigest(value) {
  if (value === null || value === undefined) return { value: null, deferred: null };
  if (isLosslesslyStorableText(value)) return { value, deferred: null };
  return {
    value: null,
    deferred: {
      reasonCode: "D-1",
      reason: "receipt_digest cannot be preserved verbatim (non-text or not losslessly storable)",
    },
  };
}

// Rule 5 — reason_code: text and NULL kept verbatim, never enum-mapped.
export function transformReasonCode(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail("seven_rule_violation", "reason_code must be TEXT or NULL");
  return value;
}

// Rule 6 — listener_present: original integers 0 / 1 kept verbatim.
// Booleans and strings are refused, never converted.
export function transformListenerPresent(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || (value !== 0 && value !== 1)) {
    fail("listener_present_must_be_0_or_1", `got ${JSON.stringify(value)}`);
  }
  return value;
}

// Rule 7 — credential_count: original integers kept verbatim, never
// truncated, capped, or re-defaulted.
export function transformCredentialCount(value) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail("credential_count_must_be_integer", `got ${JSON.stringify(value)}`);
  }
  return value;
}

const SEVEN_RULE_COLUMNS = Object.freeze({
  "platform_edge_agent_leases": Object.freeze({ released_at: transformReleasedAt }),
  "platform_edge_apply_receipts": Object.freeze({
    node_ref: transformNodeRef,
    generation: transformGeneration,
    receipt_digest: transformReceiptDigest,
    reason_code: transformReasonCode,
    listener_present: transformListenerPresent,
    credential_count: transformCredentialCount,
  }),
});

export function normalizeControlledJson(value, column, table = null) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail("json_transform_invalid", `${column} must be TEXT or NULL`);
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail("json_transform_invalid", `${column} is not valid JSON; refusing to guess`);
  }
  const schema = table === null ? null : CONTROLLED_JSON_SCHEMAS[`${table}.${column}`] ?? null;
  if (!schema) {
    // No versioned schema is registered for this column: fail closed
    // rather than falling back to parse-and-sort. A TRANSFORM JSON
    // column without a schema is a missing-schema defect, not a
    // pass-through.
    fail("json_schema_missing", `${table ?? "(unknown table)"}.${column} has no versioned controlled-JSON schema; refusing to load`);
  }
  schema.validate(parsed, column);
  const sortDeep = (node) => {
    if (Array.isArray(node)) return node.map(sortDeep);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.keys(node).sort().map((k) => [k, sortDeep(node[k])]));
    }
    return node;
  };
  return JSON.stringify(sortDeep(parsed));
}

// Versioned, field-specific schemas for the TRANSFORM JSON columns
// (PR #904 r4657005796: parse + key-sort alone is not a schema —
// unknown or sensitive values used to load untouched).
//
// Shape of a schema: { version, validate(parsed, column) }. `validate`
// throws (fail) on any value outside the schema: unknown top-level
// fields, wrong types, or sensitive keys/values. The projection is
// the validated value itself, key-sorted by normalizeControlledJson;
// nothing is silently dropped — an unknown field rejects the row.
// Schema versions are part of the contract: a new source shape needs
// a new version here, never a silent widening.
//
// Grounding (the write boundary stays the exact validator; the
// importer re-checks the same contracts at load time):
// - portalAccessEventJson: control-json-contracts.mjs (exact
//   per-type shapes for platform_portal_access_requests.event_json).
// - coinCommerceSubscriptionFulfillmentMetadataJson:
//   control-json-contracts.mjs (exact 17-field shape for the
//   subscription-fulfillment audit metadata).
// - Fulfillment-command payload: coin-commerce-store.mjs
//   parseCommandPayload (exact top-level keys; delivery exact keys).
// - Edge-node metadata: subscription-control-db.mjs
//   edgeNodeMetadataJson (exact 7-key contract).
// - Issuance metadata: subscription-control-db.mjs
//   issuanceMetadataJson ({} / {cli} / data_pack / wallet-first chain).
// - Audit metadata: subscription-control-db.mjs auditMetadataJson
//   (per-(entityType, action) shapes). The importer sees only the JSON
//   value, not entity_type/action, so it validates the union key set
//   of all in-repo audit shapes plus per-key type rules and the
//   sensitive scan below; the write boundary remains the exact
//   per-(entityType, action) validator. A key outside the union, or a
//   value that fails its per-key rule, rejects the row.
//
// Sensitive screens (mirroring the write boundaries):
// - Key parts: subscription-control-db.mjs UNSAFE_FIELD_PARTS
//   (email, phone, url, token, secret, password, credential, raw,
//   yaml, sspassword).
// - String values: control-json-contracts.mjs
//   UNSAFE_CONTROL_VALUE_PATTERN (URLs, token=/secret/credential/
//   password/private markers, emails, IPs, domain-like strings).
// Either hit rejects the row with json_sensitive_field: a TRANSFORM
// JSON column must never smuggle identity, credential or URL material
// into D1.
export const CONTROLLED_JSON_SENSITIVE_KEY_PARTS = Object.freeze([
  "email", "phone", "url", "token", "secret", "password",
  "credential", "raw", "yaml", "sspassword",
]);
const CONTROLLED_JSON_UNSAFE_VALUE_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;
const CONTROLLED_JSON_SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const CONTROLLED_JSON_ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROLLED_JSON_MAX_DEPTH = 5;

export function controlledJsonSchemaVersion(table, column) {
  return CONTROLLED_JSON_SCHEMAS[`${table}.${column}`]?.version ?? null;
}

function controlledJsonPlainObject(parsed, column) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.getPrototypeOf(parsed) !== Object.prototype) {
    fail("json_transform_invalid", `${column} must be a JSON object`);
  }
  return parsed;
}

function controlledJsonScan(node, column, depth = 0) {
  if (depth > CONTROLLED_JSON_MAX_DEPTH) {
    fail("json_transform_invalid", `${column} exceeds the maximum JSON depth (${CONTROLLED_JSON_MAX_DEPTH})`);
  }
  if (Array.isArray(node)) {
    for (const item of node) controlledJsonScan(item, column, depth + 1);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const lower = key.toLowerCase();
      if (CONTROLLED_JSON_SENSITIVE_KEY_PARTS.some((part) => lower.includes(part))) {
        fail("json_sensitive_field", `${column} carries a sensitive field: ${key}`);
      }
      if (typeof value === "string" && CONTROLLED_JSON_UNSAFE_VALUE_PATTERN.test(value)) {
        fail("json_sensitive_field", `${column} carries an unsafe value in field ${key}`);
      }
      controlledJsonScan(value, column, depth + 1);
    }
  }
}

function controlledJsonExactKeys(parsed, column, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(parsed);
  const unknown = keys.filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail("json_unknown_field", `${column} carries unknown fields: ${unknown.join(", ")}`);
  }
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(parsed, key));
  if (missing.length > 0) {
    fail("json_transform_invalid", `${column} is missing required fields: ${missing.join(", ")}`);
  }
}

function controlledJsonSafeRef(value, column, field) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value
    || !CONTROLLED_JSON_SAFE_REF_PATTERN.test(value)
    || CONTROLLED_JSON_UNSAFE_VALUE_PATTERN.test(value)) {
    fail("json_transform_invalid", `${column}.${field} must be a safe control reference`);
  }
}

function controlledJsonTimestamp(value, column, field) {
  if (typeof value !== "string" || !CONTROLLED_JSON_ISO_TIMESTAMP_PATTERN.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail("json_transform_invalid", `${column}.${field} must be a canonical ISO timestamp`);
  }
}

function controlledJsonNonNegativeInteger(value, column, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("json_transform_invalid", `${column}.${field} must be a non-negative integer`);
  }
}

function controlledJsonBoolean(value, column, field) {
  if (typeof value !== "boolean") {
    fail("json_transform_invalid", `${column}.${field} must be a boolean`);
  }
}

// platform_portal_access_requests.event_json — exact per-type contract
// (control-json-contracts.mjs portalAccessEventJson). The contract
// throws on any unknown type or key; the importer then re-sorts keys
// for the canonical projection.
const PORTAL_ACCESS_EVENT_KEYS = Object.freeze({
  traffic_supply_suspended: ["type", "occurredAt", "previousStatus", "lifecycleRevisionRef"],
  subscription_disabled: ["type", "occurredAt", "previousStatus"],
  subscription_expired: ["type", "occurredAt", "previousStatus", "lifecycleRevisionRef"],
  traffic_supply_resumed: ["type", "occurredAt", "lifecycleRevisionRef"],
  delivery_generation_reissued: ["type", "occurredAt"],
  subscription_link_reset: ["type", "occurredAt"],
  wallet_first_resource_effect_applied: ["type", "transitionRef", "effectRef", "occurredAt"],
});
function validatePortalAccessEventJson(parsed, column) {
  controlledJsonPlainObject(parsed, column);
  controlledJsonScan(parsed, column);
  // Unknown-field check first (the delegated contract reports every
  // shape violation with one generic code, which would hide an
  // unknown field behind json_transform_invalid).
  const allowed = PORTAL_ACCESS_EVENT_KEYS[parsed.type];
  if (!allowed) {
    fail("json_transform_invalid", `${column} has an unknown event type: ${String(parsed.type)}`);
  }
  const unknown = Object.keys(parsed).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail("json_unknown_field", `${column} carries unknown fields: ${unknown.join(", ")}`);
  }
  try {
    portalAccessEventJson(parsed);
  } catch {
    fail("json_transform_invalid", `${column} does not match the portal access event contract`);
  }
}

// platform_coin_commerce_fulfillment_commands.payload_json — exact
// shape per coin-commerce-store.mjs parseCommandPayload: top-level
// offerVersionRef + delivery (+ optional authority); delivery carries
// exactly kind / durationDays / monthlyTrafficGb / trafficGb /
// neverExpires / discountBasisPoints.
function validateFulfillmentCommandPayloadJson(parsed, column) {
  controlledJsonPlainObject(parsed, column);
  controlledJsonScan(parsed, column);
  controlledJsonExactKeys(parsed, column, ["offerVersionRef", "delivery"], ["authority"]);
  controlledJsonSafeRef(parsed.offerVersionRef, column, "offerVersionRef");
  const delivery = controlledJsonPlainObject(parsed.delivery, column);
  controlledJsonExactKeys(delivery, column, ["kind", "durationDays", "monthlyTrafficGb", "trafficGb", "neverExpires", "discountBasisPoints"]);
  if (typeof delivery.kind !== "string" || delivery.kind.length === 0) {
    fail("json_transform_invalid", `${column}.delivery.kind must be a non-empty string`);
  }
  for (const field of ["durationDays", "monthlyTrafficGb", "trafficGb"]) {
    controlledJsonNonNegativeInteger(delivery[field], column, `delivery.${field}`);
  }
  controlledJsonBoolean(delivery.neverExpires, column, "delivery.neverExpires");
  if (!Number.isSafeInteger(delivery.discountBasisPoints) || delivery.discountBasisPoints < 0 || delivery.discountBasisPoints > 10000) {
    fail("json_transform_invalid", `${column}.delivery.discountBasisPoints must be an integer in 0..10000`);
  }
  if (parsed.authority !== undefined) controlledJsonPlainObject(parsed.authority, column);
}

// platform_edge_registered_nodes.metadata_json — exact contract per
// subscription-control-db.mjs edgeNodeMetadataJson: source is the
// first-boot packet marker, the gate flag is true, fingerprints are
// sha256:hex when present.
function validateEdgeNodeMetadataJson(parsed, column) {
  controlledJsonPlainObject(parsed, column);
  controlledJsonScan(parsed, column);
  controlledJsonExactKeys(parsed, column,
    ["source", "receiptGateRequired", "imageSafeConfirmed", "artifactHashRecorded", "wireguardPlanRef"],
    ["wireguardPublicKeyFingerprint", "agentAuthFingerprint"]);
  if (parsed.source !== "node-image-first-boot-packet") {
    fail("json_transform_invalid", `${column}.source must be node-image-first-boot-packet`);
  }
  if (parsed.receiptGateRequired !== true) {
    fail("json_transform_invalid", `${column}.receiptGateRequired must be true`);
  }
  controlledJsonBoolean(parsed.imageSafeConfirmed, column, "imageSafeConfirmed");
  controlledJsonBoolean(parsed.artifactHashRecorded, column, "artifactHashRecorded");
  controlledJsonSafeRef(parsed.wireguardPlanRef, column, "wireguardPlanRef");
  for (const field of ["wireguardPublicKeyFingerprint", "agentAuthFingerprint"]) {
    if (Object.prototype.hasOwnProperty.call(parsed, field)) {
      if (typeof parsed[field] !== "string" || !/^sha256:[0-9a-f]{64}$/.test(parsed[field])) {
        fail("json_transform_invalid", `${column}.${field} must be a sha256:hex fingerprint`);
      }
    }
  }
}

// platform_issuance_requests.metadata_json — exact union per
// subscription-control-db.mjs issuanceMetadataJson: {} / {cli} / the
// 9-field data_pack shape / the 5-field wallet-first chain shape.
// (The data-pack quota cross-check against the offer catalog stays
// at the write boundary; the importer checks the value is a positive
// integer and the technical expiry is the fixed data-pack constant
// 9999-12-31T23:59:59.999Z.)
function validateIssuanceMetadataJson(parsed, column) {
  controlledJsonPlainObject(parsed, column);
  controlledJsonScan(parsed, column);
  const keys = Object.keys(parsed);
  if (keys.length === 0) return;
  if (keys.length === 1 && keys[0] === "cli") {
    if (parsed.cli !== "platform:issue-subscription") {
      fail("json_transform_invalid", `${column}.cli must be platform:issue-subscription`);
    }
    return;
  }
  const dataPackFields = ["version", "kind", "commandRef", "orderRef", "offerVersionRef", "quotaBytes", "nodeId", "commercialNeverExpires", "technicalValidUntil"];
  if (keys.length === dataPackFields.length && dataPackFields.every((f) => Object.prototype.hasOwnProperty.call(parsed, f))) {
    if (parsed.version !== 1 || parsed.kind !== "data_pack" || parsed.commercialNeverExpires !== true) {
      fail("json_transform_invalid", `${column} does not match the data-pack contract (version 1 / data_pack / commercialNeverExpires true)`);
    }
    for (const field of ["commandRef", "orderRef", "offerVersionRef", "nodeId"]) {
      controlledJsonSafeRef(parsed[field], column, field);
    }
    if (!Number.isSafeInteger(parsed.quotaBytes) || parsed.quotaBytes < 1) {
      fail("json_transform_invalid", `${column}.quotaBytes must be a positive integer`);
    }
    if (parsed.technicalValidUntil !== "9999-12-31T23:59:59.999Z") {
      fail("json_transform_invalid", `${column}.technicalValidUntil must be the data-pack technical expiry 9999-12-31T23:59:59.999Z`);
    }
    return;
  }
  const chainFields = ["commercialModel", "resourceModel", "resourceModelVersion", "initialTransitionRef", "lastTransitionRef"];
  if (keys.length === chainFields.length && chainFields.every((f) => Object.prototype.hasOwnProperty.call(parsed, f))) {
    if (parsed.commercialModel !== "wallet_first_unique_v1"
      || parsed.resourceModel !== "wallet_first_resource_chain_v1"
      || parsed.resourceModelVersion !== 1) {
      fail("json_transform_invalid", `${column} does not match the wallet-first chain contract`);
    }
    controlledJsonSafeRef(parsed.initialTransitionRef, column, "initialTransitionRef");
    controlledJsonSafeRef(parsed.lastTransitionRef, column, "lastTransitionRef");
    return;
  }
  fail("json_unknown_field", `${column} does not match any known issuance metadata shape ({} / {cli} / data_pack / wallet-first chain): ${keys.join(", ")}`);
}

// platform_audit_events.metadata_json — union of the in-repo audit
// shapes (subscription-control-db.mjs auditMetadataJson). The
// subscription-fulfillment shape is delegated to its exact contract
// when identifiable; every other value must stay inside the union key
// set below and pass the per-key type rules + the sensitive scan.
// Keys outside the union reject the row: the importer cannot invent
// a new audit shape at load time.
const AUDIT_METADATA_FULFILLMENT_FIELDS = Object.freeze([
  "version", "commandRef", "orderRef", "accountId", "requestRef",
  "entitlementRef", "issuedLinkRef", "tenantRef", "artifactRef",
  "offerVersionRef", "portalPlan", "durationDays", "monthlyTrafficGb",
  "trafficLimitBytes", "validFrom", "previousValidUntil", "targetValidUntil",
]);
const AUDIT_METADATA_UNION_KEYS = Object.freeze(new Set([
  ...AUDIT_METADATA_FULFILLMENT_FIELDS, "switchKind",
  "source", "compensation", "requestRef", "reasonCode",
  "previousTrafficLimitBytes", "trafficLimitBytes",
  "version", "proof", "continuation", "kind", "commandRef", "orderRef",
  "accountId", "entitlementRef", "issuedLinkRef", "offerVersionRef",
  "quotaBytes", "commercialNeverExpires", "technicalValidUntil",
  "accountRef", "authorizationBasis", "scope", "verificationMode",
  "step", "stepName", "result", "completedAt", "counts", "verifiedAt",
  "assertions", "proofRef", "issuedAt", "verificationEventRef",
  "abandonedAt", "failureReason", "enrollmentRef", "channel",
  "expiresAt", "entryRef", "totpRef", "enrolledAt", "envelopeFormat",
  "accountMatches",
]));
function validateAuditMetadataJson(parsed, column) {
  controlledJsonPlainObject(parsed, column);
  controlledJsonScan(parsed, column);
  const keys = Object.keys(parsed);
  const unknown = keys.filter((key) => !AUDIT_METADATA_UNION_KEYS.has(key));
  if (unknown.length > 0) {
    fail("json_unknown_field", `${column} carries unknown fields: ${unknown.join(", ")}`);
  }
  // Identifiable subscription-fulfillment shape: delegate to its exact
  // contract (17 required fields + optional switchKind, version 1,
  // trafficLimitBytes === monthlyTrafficGb * 2^30, timestamp order).
  if (keys.length >= AUDIT_METADATA_FULFILLMENT_FIELDS.length
    && AUDIT_METADATA_FULFILLMENT_FIELDS.every((f) => Object.prototype.hasOwnProperty.call(parsed, f))
    && keys.every((k) => AUDIT_METADATA_FULFILLMENT_FIELDS.includes(k) || k === "switchKind")) {
    try {
      coinCommerceSubscriptionFulfillmentMetadataJson(parsed);
    } catch {
      fail("json_transform_invalid", `${column} does not match the subscription-fulfillment metadata contract`);
    }
    return;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "version") && parsed.version !== 1) {
    fail("json_transform_invalid", `${column}.version must be 1`);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "source") && parsed.source !== "platform:issue-subscription") {
    fail("json_transform_invalid", `${column}.source must be platform:issue-subscription`);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "kind") && parsed.kind !== "data_pack") {
    fail("json_transform_invalid", `${column}.kind must be data_pack`);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "switchKind")
    && parsed.switchKind !== "upgrade_inplace" && parsed.switchKind !== "upgrade_restart") {
    fail("json_transform_invalid", `${column}.switchKind must be upgrade_inplace or upgrade_restart`);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "portalPlan")
    && parsed.portalPlan !== "monthly" && parsed.portalPlan !== "yearly") {
    fail("json_transform_invalid", `${column}.portalPlan must be monthly or yearly`);
  }
  for (const field of ["commandRef", "orderRef", "accountId", "requestRef", "entitlementRef", "issuedLinkRef", "tenantRef", "artifactRef", "offerVersionRef", "accountRef", "proofRef", "verificationEventRef", "enrollmentRef", "entryRef", "totpRef"]) {
    if (Object.prototype.hasOwnProperty.call(parsed, field)) controlledJsonSafeRef(parsed[field], column, field);
  }
  for (const field of ["validFrom", "previousValidUntil", "targetValidUntil", "technicalValidUntil", "completedAt", "verifiedAt", "issuedAt", "abandonedAt", "enrolledAt", "expiresAt"]) {
    if (Object.prototype.hasOwnProperty.call(parsed, field)) controlledJsonTimestamp(parsed[field], column, field);
  }
  for (const field of ["durationDays", "monthlyTrafficGb", "trafficLimitBytes", "quotaBytes", "previousTrafficLimitBytes"]) {
    if (Object.prototype.hasOwnProperty.call(parsed, field)) controlledJsonNonNegativeInteger(parsed[field], column, field);
  }
  for (const field of ["commercialNeverExpires", "accountMatches"]) {
    if (Object.prototype.hasOwnProperty.call(parsed, field)) controlledJsonBoolean(parsed[field], column, field);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, "compensation")) {
    const compensation = controlledJsonPlainObject(parsed.compensation, column);
    controlledJsonExactKeys(compensation, column, ["artifactRevoked", "tenantDisabled"]);
    controlledJsonBoolean(compensation.artifactRevoked, column, "compensation.artifactRevoked");
    controlledJsonBoolean(compensation.tenantDisabled, column, "compensation.tenantDisabled");
  }
}

const CONTROLLED_JSON_SCHEMAS = Object.freeze({
  "platform_audit_events.metadata_json": Object.freeze({ version: 1, validate: validateAuditMetadataJson }),
  "platform_coin_commerce_fulfillment_commands.payload_json": Object.freeze({ version: 1, validate: validateFulfillmentCommandPayloadJson }),
  "platform_edge_registered_nodes.metadata_json": Object.freeze({ version: 1, validate: validateEdgeNodeMetadataJson }),
  "platform_issuance_requests.metadata_json": Object.freeze({ version: 1, validate: validateIssuanceMetadataJson }),
  "platform_portal_access_requests.event_json": Object.freeze({ version: 1, validate: validatePortalAccessEventJson }),
});

function externalizeFor(table, column) {
  return EXTERNALIZE_SOURCE_COLUMNS.find((e) => e.table === table && e.column === column) ?? null;
}

// Default conditional gates: fail-closed. A caller that has the written
// R-4 / Yi approval for a gate passes it explicitly; nothing is assumed.
export const DEFAULT_CONDITIONAL_GATES = Object.freeze({
  legacyArchiveQ6: false,
  desiredStatesD2: false,
  linkResetsD2: false,
  ledgerDetermination: null, // 'H1' | 'H2' | 'H3' once determined, else null
  passwordHandlingApproved: false,
});

export function transformRow({ table, row, gates = {} } = {}) {
  const merged = { ...DEFAULT_CONDITIONAL_GATES, ...gates };
  const mapping = tableMappingFor(table);
  if (!mapping) fail("unknown_source_table", table);
  if (table === "platform_usage_samples") {
    fail("samples_table_excluded", "platform_usage_samples is excluded whole-table");
  }
  if (mapping.tableDisposition === "DEFER") {
    return { row: null, deferred: { reasonCode: "TABLE-DEFERRED", reason: `${table} is DEFER; no rows load this round` }, rejected: null };
  }
  if (mapping.tableDisposition === "CREATE-EMPTY" || mapping.tableDisposition === "NOT-IN-DDL") {
    return { row: null, deferred: { reasonCode: "TABLE-NOT-LOADED", reason: `${table} loads 0 rows this round (${mapping.tableDisposition})` }, rejected: null };
  }
  if (mapping.tableDisposition === "KEEP-GATED" && table === "platform_coin_ledger_entries") {
    if (!["H1", "H2", "H3"].includes(merged.ledgerDetermination)) {
      return { row: null, deferred: { reasonCode: "D-3", reason: "ledger H1/H2/H3 determination is undetermined; rows deferred" }, rejected: null };
    }
  }
  if (mapping.tableDisposition === "KEEP-GATED" && table === "platform_portal_password_credentials") {
    if (merged.passwordHandlingApproved !== true) {
      return { row: null, deferred: { reasonCode: "D-2", reason: "password-field handling is undetermined; 75 rows must not load" }, rejected: null };
    }
  }
  if (mapping.tableDisposition === "CONDITIONAL" && table === "platform_payment_orders_legacy_archive_20260803") {
    if (merged.legacyArchiveQ6 !== true) {
      return { row: null, deferred: { reasonCode: "CONDITIONAL-GATE", reason: "legacy archive condition Q-6 not confirmed for this run" }, rejected: null };
    }
  }

  const knownColumns = new Set(mapping.columns.map((c) => c.name));
  const digestSources = new Set(Object.keys(RAW_TO_DIGEST_COLUMN[table] ?? {}));
  for (const key of Object.keys(row)) {
    if (!knownColumns.has(key) && !externalizeFor(table, key)
      && !SOURCE_ONLY_COLUMNS.has(`${table}.${key}`) && !digestSources.has(key)) {
      return { row: null, deferred: null, rejected: { code: "unknown_source_column", column: key, reason: `source column ${table}.${key} is not in the mapping; refusing to guess` } };
    }
  }
  // EXTERNALIZE: a non-null raw value rejects the whole row; the column
  // never appears in the output, null or not.
  for (const ext of EXTERNALIZE_SOURCE_COLUMNS) {
    if (ext.table !== table) continue;
    if (row[ext.column] !== null && row[ext.column] !== undefined) {
      return { row: null, deferred: null, rejected: { code: "externalized_value_present", column: ext.column, id: ext.id, reason: `EXTERNALIZE ${ext.id}: raw value must never enter D1` } };
    }
  }

  const out = {};
  const deferredColumns = [];
  const digestMap = RAW_TO_DIGEST_COLUMN[table] ?? {};
  for (const col of mapping.columns) {
    const name = col.name;
    const raw = row[name];
    if (col.disposition === "EXTERNALIZE") continue; // never copied, even as NULL
    if (col.disposition === "DEFER") {
      // A deferred column carries no value into D1.
      continue;
    }
    if (col.disposition === "CONDITIONAL") {
      // Per-column conditions are not defined in Card 6 (only the column
      // names are). Fail-closed: the column is omitted and recorded, the
      // row still loads. Never silently copied as KEEP.
      deferredColumns.push(name);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(digestMap, name)) {
      // Raw idempotency / lease-token source column: digest-only.
      if (raw !== null && raw !== undefined) {
        out[digestMap[name]] = digestOfRaw(table, name, String(raw));
      }
      continue;
    }
    if (name === "metadata_json" && table === "platform_accounts") {
      continue; // M1-02: not built, not loaded (defense in depth; the
      // column is not in the mapping, so it is never copied).
    }
    if (col.note === "digest-only") {
      // Digest column filled by its raw source above; nothing to copy.
      if (out[name] === undefined) out[name] = null;
      continue;
    }
    if (col.disposition === "TRANSFORM" && (name.endsWith("_json") || name === "payload_json" || name === "event_json")) {
      out[name] = normalizeControlledJson(raw, name, table);
      continue;
    }
    // Seven-rule columns: reached only for KEEP columns. DEFER columns
    // (listener_present / credential_count since the P fix) are skipped
    // by the DEFER branch above, so their validators below no longer
    // feed the load — they remain the source-value validators.
    const seven = SEVEN_RULE_COLUMNS[table]?.[name];
    if (seven) {
      if (name === "receipt_digest") {
        const res = seven(raw);
        if (res.deferred) return { row: null, deferred: res.deferred, rejected: null };
        out[name] = res.value;
      } else {
        out[name] = seven(raw);
      }
      continue;
    }
    if (col.notNull && (raw === null || raw === undefined)) {
      return { row: null, deferred: null, rejected: { code: "missing_required_column", column: name, reason: `${table}.${name} is NOT NULL` } };
    }
    out[name] = raw ?? null;
  }
  const rowBytes = Buffer.byteLength(JSON.stringify(out), "utf8");
  if (rowBytes > MAX_ROW_BYTES) {
    return { row: null, deferred: { reasonCode: "D-4", reason: `row exceeds the D1 2 MB row limit (${rowBytes} bytes)` }, rejected: null, deferredColumns };
  }
  // Digest-only outputs: the raw source column has no DDL column of its
  // own, so the digest is computed here from the source row, after the
  // column loop. The raw value never enters `out`.
  for (const [rawName, digestName] of Object.entries(digestMap)) {
    const raw = row[rawName];
    if (raw !== null && raw !== undefined) {
      out[digestName] = digestOfRaw(table, rawName, String(raw));
    }
  }
  return { row: out, deferred: null, rejected: null, deferredColumns };
}

// ===========================================================================
// Layer 2 (continued) — count / hash reconciliation, Card 6 §6.2
// ===========================================================================

export function hashRowValues(values) {
  const parts = values.map((v) => {
    if (v === null || v === undefined) return "\\0NULL";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    if (Buffer.isBuffer(v)) return v.toString("hex");
    if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
    return String(v);
  });
  return sha256Hex(parts.join("|"));
}

export function hashRow(row, columns) {
  return hashRowValues(columns.map((c) => row?.[c] ?? null));
}

export function hashTableRows(rows, columns) {
  const rowHashes = rows.map((r) => hashRow(r, columns));
  return sha256Hex(rowHashes.join(""));
}

export function hashDatabase(tableHashes) {
  const names = Object.keys(tableHashes).sort();
  return sha256Hex(names.map((n) => `${n}:${tableHashes[n]}`).join(""));
}

// ===========================================================================
// Layer 3 — batched checkpointing (Card 6 §4.2 / §5)
// ===========================================================================

export function planBatchesForTable(table, rowCount, batchSize = BATCH_SIZE) {
  if (!Number.isInteger(rowCount) || rowCount < 0) fail("invalid_row_count", `${table}: ${rowCount}`);
  if (rowCount === 0) return [];
  const batches = Math.ceil(rowCount / batchSize);
  return Array.from({ length: batches }, (_, i) => ({
    table,
    batchIndex: i + 1,
    batchCountForTable: batches,
    rowOffset: i * batchSize,
    rowCount: Math.min(batchSize, rowCount - i * batchSize),
    ringGroup: RING_TABLES.includes(table) ? RING_GROUP_LOTS_CREDIT_ORIGINS : null,
  }));
}

export function firstBatchPlan() {
  const plan = [];
  for (const entry of TABLE_MAPPING) {
    if (entry.loadScope !== "first-batch-50") continue;
    plan.push(...planBatchesForTable(entry.source, entry.snapshotRows ?? 0));
  }
  for (const extra of CARD6_DDL_ONLY_TABLES) {
    plan.push(...planBatchesForTable(extra.source, extra.snapshotRows));
  }
  // FK-layer order: layer 0 first, ring tables together after layer 1.
  const layerOf = (table) => {
    const m = tableMappingFor(table);
    if (m?.fkLayer !== undefined && m?.fkLayer !== null) return m.fkLayer === "ring" ? 1.5 : m.fkLayer;
    const extra = CARD6_DDL_ONLY_TABLES.find((e) => e.source === table);
    return extra?.fkLayer ?? 99;
  };
  plan.sort((a, b) => layerOf(a.table) - layerOf(b.table) || a.table.localeCompare(b.table) || a.batchIndex - b.batchIndex);
  plan.forEach((b, i) => { b.batchId = `B-${String(i + 1).padStart(3, "0")}`; });
  return plan;
}

export function loadPlanOrder() {
  const seen = [];
  for (const b of firstBatchPlan()) if (!seen.includes(b.table)) seen.push(b.table);
  return seen;
}

export function createCheckpoint({ runId, snapshotId, snapshotRowsTotal, batch, sourceCount, loadedCount, deferredCount, failedCount, sourceHash, targetHash, fkViolations, status, executor = "d1-card7-synthetic", note = "" } = {}) {
  if (!runId || !snapshotId || !batch?.batchId) fail("checkpoint_input_invalid");
  return Object.freeze({
    run_id: runId,
    snapshot_id: snapshotId,
    snapshot_rows_total: snapshotRowsTotal,
    batch_id: batch.batchId,
    table: batch.table,
    row_range: `${batch.table} rows ${batch.rowOffset + 1}-${batch.rowOffset + batch.rowCount}`,
    source_count: sourceCount,
    loaded_count: loadedCount,
    deferred_count: deferredCount,
    failed_count: failedCount,
    source_hash: sourceHash ?? null,
    target_hash: targetHash ?? null,
    // A hash comparison is only meaningful when both sides actually have a
    // hash. Either side missing (null/undefined) means "unknown", never a
    // match: null === null must not report hash_match: true (C-1 fix).
    hash_match: sourceHash == null || targetHash == null ? null : sourceHash === targetHash,
    fk_check: fkViolations ?? 0,
    status,
    started_at: null,
    finished_at: null,
    executor,
    note,
  });
}

export function resumePlan({ plan, checkpoints } = {}) {
  if (!Array.isArray(plan) || !Array.isArray(checkpoints)) fail("resume_input_invalid");
  const byBatch = new Map(checkpoints.map((c) => [c.batch_id, c]));
  const snapshotIds = new Set(checkpoints.map((c) => c.snapshot_id));
  if (snapshotIds.size > 1) {
    return { toRun: [], skippedLoaded: [], blocked: plan.map((b) => b.batchId), voided: true, reason: "checkpoint snapshot ids differ; run is void, restart from B-001 with a new run_id" };
  }
  const toRun = [];
  const skippedLoaded = [];
  const blocked = [];
  const ringState = new Map();
  for (const batch of plan) {
    const cp = byBatch.get(batch.batchId);
    if (cp?.status === "LOADED") { skippedLoaded.push(batch.batchId); continue; }
    if (cp?.status === "FAILED" || cp?.status === "PENDING" || !cp) { toRun.push(batch); continue; }
    blocked.push(batch.batchId);
  }
  // Ring atomicity: lots + credit_origins run together or not at all.
  for (const batch of plan) {
    if (batch.ringGroup) ringState.set(batch.table, toRun.some((b) => b.batchId === batch.batchId));
  }
  const ringValues = [...ringState.values()];
  if (ringValues.length === 2 && ringValues[0] !== ringValues[1]) {
    return { toRun: toRun.filter((b) => !b.ringGroup), skippedLoaded, blocked: [...blocked, ...plan.filter((b) => b.ringGroup).map((b) => b.batchId)], voided: false, reason: "ring group split across LOADED / not-LOADED; ring batches blocked for manual handling" };
  }
  return { toRun, skippedLoaded, blocked, voided: false, reason: null };
}

export function verifyBatchApplied({ appliedBatches, batchId, contentHash } = {}) {
  const found = (appliedBatches ?? []).find((b) => b.batchId === batchId);
  if (!found) return { applied: false, hashMatch: null };
  return { applied: true, hashMatch: found.contentHash === contentHash };
}

// ===========================================================================
// Layer 4 — E4 executor interface (allowlist + statement building only)
// ===========================================================================

export function assertE4Target(target) {
  if (!target || typeof target !== "object") fail("e4_target_not_allowed", "no target given");
  if (target.databaseId !== E4_DATABASE_ID || target.databaseName !== E4_DATABASE_NAME || target.accountId !== E4_ACCOUNT_ID) {
    fail("e4_target_not_allowed",
      "target is not E4 (flylink-control-migration-e4 / 05732071-22a5-4e04-834c-f5dd4407a462 / 17d66c001f9d851fa0d5a88cd311c2c0); refusing before any request");
  }
  return true;
}

// Columns a D1 INSERT actually carries for a table: the DDL columns minus
// EXTERNALIZE / DEFER / CONDITIONAL columns, minus raw digest-source
// columns (only their digest column is written), minus
// platform_accounts.metadata_json (M1-02: not built, not loaded).
export function targetColumnsFor(table) {
  const mapping = tableMappingFor(table);
  if (!mapping) fail("unknown_source_table", table);
  const digestSources = new Set(Object.keys(RAW_TO_DIGEST_COLUMN[table] ?? {}));
  return mapping.columns
    .filter((c) => c.disposition !== "EXTERNALIZE" && c.disposition !== "DEFER"
      && c.disposition !== "CONDITIONAL" && !digestSources.has(c.name)
      && !(table === "platform_accounts" && c.name === "metadata_json"))
    .map((c) => c.name);
}

export function buildD1BatchStatements({ table, rows, target = E4_TARGET } = {}) {
  assertE4Target(target);
  const mapping = tableMappingFor(table);
  if (!mapping) fail("unknown_source_table", table);
  if (!mapping.target) fail("e4_target_not_allowed", `${table} has no E4 target table`);
  const columns = targetColumnsFor(table);
  const statements = [];
  for (const row of rows) {
    const values = columns.map((c) => row[c] ?? null);
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO "${mapping.target}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`;
    if (columns.length > MAX_BIND_PARAMS) fail("d1_bind_param_limit", `${table}: ${columns.length} params`);
    const bytes = Buffer.byteLength(sql, "utf8") + Buffer.byteLength(JSON.stringify(values), "utf8");
    if (bytes > MAX_STATEMENT_BYTES) fail("d1_statement_too_long", `${table}: ${bytes} bytes`);
    statements.push(Object.freeze({ sql, params: Object.freeze(values) }));
  }
  return statements;
}

// No network, no token, no wrangler: this card deliberately cannot execute.
// A real executor is a separate, L1-approved step.
export function executeD1Batch() {
  fail("e4_executor_not_connected",
    "Card 7 ships the executor interface only. No request is made, no token is held.");
}

// ===========================================================================
// Orchestration — synthetic-only dry run (no writes anywhere)
// ===========================================================================

export function runSyntheticLoad({ db, snapshotId, sha256, runId = "load-synth-001", gates = {}, executor = "d1-card7-synthetic" } = {}) {
  assertSyntheticSourceHandle(db);
  const identity = assertSnapshotIdentity({ snapshotId, sha256 });
  const integrity = verifySourceIntegrity(db);
  const plan = firstBatchPlan();
  const perTable = [];
  const deferred = [];
  const rejected = [];
  const deferredColumns = {};
  const tableHashes = {};
  let loadedRows = 0;
  let sourceRows = 0;

  for (const entry of TABLE_MAPPING) {
    const table = entry.source;
    if (entry.loadScope === "first-batch-50") {
      const rows = [];
      let afterPk = null;
      for (;;) {
        const page = readSourcePage(db, table, { afterPk });
        if (page.length === 0) break;
        rows.push(...page);
        const pks = pkColumnsFor(table);
        afterPk = pks.map((c) => page[page.length - 1][c]);
        if (page.length < BATCH_SIZE) break;
      }
      sourceRows += rows.length;
      const kept = [];
      for (const row of rows) {
        const pk = pkColumnsFor(table).map((c) => row[c]).join("|");
        const res = transformRow({ table, row, gates });
        for (const dc of res.deferredColumns ?? []) {
          deferredColumns[`${table}.${dc}`] = (deferredColumns[`${table}.${dc}`] ?? 0) + 1;
        }
        if (res.deferred) deferred.push({ table, pk, ...res.deferred });
        else if (res.rejected) rejected.push({ table, pk, ...res.rejected });
        else kept.push(res.row);
      }
      loadedRows += kept.length;
      const columns = targetColumnsFor(table);
      tableHashes[table] = hashTableRows(kept, columns);
      // Dry-run statement build only (proves the executor interface accepts
      // the filtered rows; nothing is sent anywhere).
      buildD1BatchStatements({ table, rows: kept });
      perTable.push({ table, sourceRows: rows.length, loadedRows: kept.length, deferredRows: rows.length - kept.length - rejected.filter((r) => r.table === table).length, rejectedRows: rejected.filter((r) => r.table === table).length, hash: tableHashes[table] });
    } else if (table === "platform_usage_samples") {
      // Excluded whole-table: counted directly here, never through the
      // reader (countSourceRows refuses this table by design).
      const n = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
      perTable.push({ table, sourceRows: n, loadedRows: 0, deferredRows: 0, rejectedRows: 0, hash: null, excluded: true });
      sourceRows += n;
    } else {
      const n = countSourceRows(db, table);
      perTable.push({ table, sourceRows: n, loadedRows: 0, deferredRows: n, rejectedRows: 0, hash: null, notLoaded: entry.tableDisposition });
      sourceRows += n;
      for (let i = 0; i < n; i++) deferred.push({ table, pk: `synth-row-${i + 1}`, reasonCode: "TABLE-NOT-LOADED", reason: `${table} loads 0 rows this round (${entry.tableDisposition})` });
    }
  }

  // Card 6's 3 DDL-only first-batch tables: in the DDL and in the Card 6
  // snapshot counts, but absent from source-70-baseline.json (gap G-1).
  // They are planned (their 3 batches are inside the 103) but have no
  // source rows in a 70-table synthetic DB, so they load 0 rows here.
  for (const extra of CARD6_DDL_ONLY_TABLES) {
    perTable.push({
      table: extra.source, sourceRows: extra.snapshotRows, loadedRows: 0,
      deferredRows: extra.snapshotRows, rejectedRows: 0, hash: null,
      sourceAbsentFromBaseline: true,
    });
    sourceRows += extra.snapshotRows;
    for (let i = 0; i < extra.snapshotRows; i++) {
      deferred.push({ table: extra.source, pk: `snapshot-row-${i + 1}`, reasonCode: "SOURCE-INVENTORY-GAP", reason: `${extra.source} is in Card 6 / DDL v1.1 but absent from source-70-baseline.json; source rows cannot be read from a 70-table inventory` });
    }
  }

  // Checkpoints must record THIS run's actual synthetic outcome, never the
  // snapshot plan counts (C-1 fix). Per-table actuals come from perTable
  // (rows really read / transformed in this run); a table's actual rows are
  // attributed to its first plan batch, later batches of the same table
  // processed no synthetic rows in this run and record 0. A batch is LOADED
  // only when every actual row in it loaded (loaded === source > 0, no
  // deferred / rejected rows); anything else is PENDING, so resumePlan
  // re-runs it instead of skipping it as complete (Card 6 §5 resume
  // contract). Snapshot-scale counts (e.g. receipts 1,513, archive 33)
  // never appear as loaded_count here. Tables with no plan batch (the 22
  // non-first-batch tables, TABLE-NOT-LOADED; the excluded samples table)
  // have no checkpoint; their rows are recorded in perTable / deferred.
  const perTableByName = new Map(perTable.map((t) => [t.table, t]));
  const checkpoints = plan.map((batch) => {
    const entry = perTableByName.get(batch.table);
    const isFirstBatch = batch.batchIndex === 1;
    const loadedCount = isFirstBatch ? (entry?.loadedRows ?? 0) : 0;
    const deferredCount = isFirstBatch ? (entry?.deferredRows ?? 0) : 0;
    const failedCount = isFirstBatch ? (entry?.rejectedRows ?? 0) : 0;
    const sourceCount = loadedCount + deferredCount + failedCount;
    const status = sourceCount > 0 && deferredCount === 0 && failedCount === 0 ? "LOADED" : "PENDING";
    return createCheckpoint({
      runId, snapshotId: identity.snapshotId, snapshotRowsTotal: sourceRows, batch,
      sourceCount, loadedCount, deferredCount,
      failedCount, sourceHash: null, targetHash: null, fkViolations: 0,
      status, executor, note: "synthetic dry-run checkpoint; no E4 write; counts are actual synthetic rows processed in this run, not snapshot plan counts",
    });
  });

  return Object.freeze({
    runId, snapshotId: identity.snapshotId, sha256: identity.sha256,
    integrity,
    planBatchCount: plan.length,
    perTable: Object.freeze(perTable),
    totals: Object.freeze({ sourceRows, loadedRows, deferredRows: deferred.length, rejectedRows: rejected.length }),
    deferred: Object.freeze(deferred),
    rejected: Object.freeze(rejected),
    deferredColumns: Object.freeze(deferredColumns),
    databaseHash: hashDatabase(tableHashes),
    checkpoints: Object.freeze(checkpoints),
  });
}
