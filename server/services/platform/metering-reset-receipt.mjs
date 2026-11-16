// Metering-reset receipts: the standalone receipt mechanism (M1-10, Option B).
//
// A metering-reset receipt is NOT a generic audit event. It is never written
// through recordAuditEvent() / auditMetadataJson(), and it is never registered
// in the 16-pair audit contract: the generic audit input filter rejects any
// field whose name contains "credential" (UNSAFE_FIELD_PARTS in
// subscription-control-db.mjs), and this receipt's proof shape carries
// edgeCredentialRef by design. Relaxing that generic filter is forbidden;
// instead the receipt has its own writer, its own receipt-type enum and its
// own read-back contract in this module.
//
// Physical storage still reuses the platform_audit_events table (one row per
// receipt, keyed by the deterministic receipt id). That is a storage detail,
// not an audit registration: nothing in the generic audit path reads, lists
// or validates these rows as audit events, and getAccountControlSummary()
// still excludes them.
//
// Transaction ownership: writeMeteringResetReceipt() never opens a
// transaction of its own. The caller (recordCoinCommerceDataPackMeteringResetReceipt)
// owns the transaction, writes, then reads the row back and compares it
// before committing. Any mismatch throws with code "reconciliation_required"
// and the enclosing transaction rolls the insert back.
import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

// The closed set of receipt types this mechanism may ever write. There is
// exactly one member today. A second type must be added here deliberately,
// with its own descriptor and tests; no other action string may be written
// through this module. This enum is the guard against a new bypass: an
// unlisted receipt type has no writer.
export const METERING_RESET_RECEIPT_TYPES = Object.freeze({
  data_pack_metering_reset_completed: Object.freeze({
    entityType: "coin_commerce_data_pack_metering_reset",
    action: "data_pack_metering_reset_completed",
    actorRef: "full_metering_collector",
    version: 1
  })
});

// Physical storage only. See the header: sharing the table does not make a
// metering-reset receipt a generic audit event.
const METERING_RESET_RECEIPT_TABLE = "platform_audit_events";

const RECEIPT_ROW_FIELDS = Object.freeze([
  "id", "entityType", "entityRef", "action", "actorRef", "createdAt", "metadataJson"
]);

function receiptInvalid() {
  const error = new Error("metering reset receipt is invalid");
  error.code = "reconciliation_required";
  return error;
}

function exactPlainObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw receiptInvalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key)
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value")
    || !Object.getOwnPropertyDescriptor(value, key).enumerable)) throw receiptInvalid();
}

function receiptIsoTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) throw receiptInvalid();
  return value;
}

// Look a receipt type up by action. Anything not in the enum is rejected;
// there is no default, no prefix match and no fallback to the generic audit
// contract.
export function meteringResetReceiptType(action) {
  const descriptor = typeof action === "string" ? METERING_RESET_RECEIPT_TYPES[action] : undefined;
  if (!descriptor) throw receiptInvalid();
  return descriptor;
}

// Deterministic receipt id for a rotation: the same rotation ref always maps
// to the same row, which is what makes an identical rewrite idempotent and a
// conflicting rewrite a collision. Formula unchanged from the previous inline
// writer (subscription-control-db.mjs), moved here so the receipt identity
// has a single home.
export function meteringResetReceiptId(rotationRef) {
  if (typeof rotationRef !== "string" || rotationRef.length === 0) throw receiptInvalid();
  return `pack_metering_reset_${createHash("sha256")
    .update(`GCCWEBOS:DATA_PACK_METERING_RESET_RECEIPT:v1\0${rotationRef}`).digest("hex")}`;
}

// The dedicated receipt writer. Validates the row against the receipt-type
// enum, binds the id to the rotation ref, and checks the metadata envelope
// shape ({version, proof, continuation}, version 1). The deep proof and
// continuation validation stays with the store (validateMeteringResetProof /
// validateMeteringResetContinuation), which runs before this writer is
// called; this module never re-implements it and never accepts unvalidated
// material. Runs inside the caller's transaction; a duplicate id surfaces
// as reconciliation_required, never as a raw SQLite constraint error.
export function writeMeteringResetReceipt(db, receipt) {
  exactPlainObject(receipt, RECEIPT_ROW_FIELDS);
  const type = meteringResetReceiptType(receipt.action);
  if (receipt.entityType !== type.entityType || receipt.actorRef !== type.actorRef) throw receiptInvalid();
  if (receipt.id !== meteringResetReceiptId(receipt.entityRef)) throw receiptInvalid();
  receiptIsoTime(receipt.createdAt);
  if (typeof receipt.metadataJson !== "string") throw receiptInvalid();
  let metadata;
  try {
    metadata = JSON.parse(receipt.metadataJson);
  } catch {
    throw receiptInvalid();
  }
  exactPlainObject(metadata, ["version", "proof", "continuation"]);
  if (metadata.version !== type.version) throw receiptInvalid();
  try {
    db.prepare(`insert into ${METERING_RESET_RECEIPT_TABLE}
      (id, entity_type, entity_ref, action, actor_ref, created_at, metadata_json)
      values (?, ?, ?, ?, ?, ?, ?)`).run(receipt.id, receipt.entityType, receipt.entityRef,
      receipt.action, receipt.actorRef, receipt.createdAt, receipt.metadataJson);
  } catch (error) {
    if (typeof error?.code === "string" && error.code.startsWith("SQLITE_CONSTRAINT")) throw receiptInvalid();
    throw error;
  }
  return receipt.id;
}

// Raw row read-back for the caller-side verification step. Returns the
// stored row, or null when no row with that id exists.
export function readMeteringResetReceiptRow(db, id) {
  if (typeof id !== "string" || id.length === 0) throw receiptInvalid();
  return db.prepare(`select id, entity_type, entity_ref, action, actor_ref, created_at, metadata_json
    from ${METERING_RESET_RECEIPT_TABLE} where id = ?`).get(id) ?? null;
}

// Byte-level read-back check: the stored row must equal the row that was
// written, column by column (metadata compared as the exact JSON string).
// Any difference — missing row, drifted column, rewritten metadata — throws
// reconciliation_required. The caller runs this inside its transaction, so
// the throw rolls the insert back.
export function verifyMeteringResetReceiptRow(row, expected) {
  exactPlainObject(expected, RECEIPT_ROW_FIELDS);
  if (!row || typeof row !== "object"
    || row.id !== expected.id
    || row.entity_type !== expected.entityType
    || row.entity_ref !== expected.entityRef
    || row.action !== expected.action
    || row.actor_ref !== expected.actorRef
    || row.created_at !== expected.createdAt
    || row.metadata_json !== expected.metadataJson) throw receiptInvalid();
  return true;
}
