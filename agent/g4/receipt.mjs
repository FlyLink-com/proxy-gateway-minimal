// G4 Agent HTTPS contract — redacted apply receipts + idempotent
// receipt ledger (G1-30 §3.4, AGT-POLL-5, AGT-DATA-1).
//
// Receipt shape follows the existing data-plane protocol
// (server/services/edge/data-plane-agent-protocol.mjs): the same
// message type, one receipt per channel, binding nodeRef,
// channelRef, generation, desiredStateRef and the material digests.
// The G4 additions are the idempotency key and mandatory redaction of
// the free-form detail payload before the receipt can leave the host.

import { canonicalJson, sha256Hex } from "./manifest.mjs";

export const APPLY_RECEIPT_TYPE = "gccgw_data_plane_apply_receipt";

export class ReceiptError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReceiptError";
    this.code = code;
  }
}

// Keys whose values are material or credential bearing and must never
// leave the host inside a receipt detail payload.
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|private|material|raw|credential(?!ref))/i;
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Deep-redact a detail payload: sensitive keys are replaced wholesale,
// and any raw UUID appearing in a free-text string is masked (raw
// UUIDs are credential material in this system and must never appear
// in receipts or logs — AGT-DATA-1). Structured refs (edgeCredentialRef
// values at the receipt's top level) are opaque references, not
// material, and are not part of the detail payload.
export function redactDetail(value) {
  if (typeof value === "string") {
    return value.replace(UUID_PATTERN, "[redacted-uuid]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDetail(item));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactDetail(item);
    }
    return out;
  }
  return value;
}

export function buildChannelReceipt({
  nodeRef,
  channelRef,
  generation,
  desiredStateRef,
  materialDigests,
  idempotencyKey,
  status,
  detail = {},
}) {
  for (const [field, value] of Object.entries({
    nodeRef, channelRef, generation, desiredStateRef, idempotencyKey, status,
  })) {
    if (typeof value !== "string" || value.length === 0) {
      throw new ReceiptError("validation_error", `receipt ${field} must be a non-empty string`);
    }
  }
  if (!Array.isArray(materialDigests) || materialDigests.length === 0) {
    throw new ReceiptError("validation_error", "receipt materialDigests must be a non-empty array");
  }
  return {
    type: APPLY_RECEIPT_TYPE,
    nodeRef,
    channelRef,
    generation,
    desiredStateRef,
    materialDigests: materialDigests.map((m) => ({
      channelRef: m.channelRef,
      edgeCredentialRef: m.edgeCredentialRef,
      digest: m.digest,
    })),
    idempotencyKey,
    status,
    detail: redactDetail(detail),
    redacted: true,
  };
}

// The idempotency fingerprint covers the binding tuple + outcome, so
// the same key replayed with a different outcome is a conflict, not a
// silent duplicate.
export function receiptFingerprint(receipt) {
  return sha256Hex(
    canonicalJson({
      type: receipt.type,
      nodeRef: receipt.nodeRef,
      channelRef: receipt.channelRef,
      generation: receipt.generation,
      desiredStateRef: receipt.desiredStateRef,
      materialDigests: receipt.materialDigests,
      status: receipt.status,
    }),
  );
}

// Control-side ledger semantics in miniature (the production ledger
// is the control database; this is the contract the G4 tests pin):
// the same idempotency key + same fingerprint records exactly once;
// the same key + a different fingerprint is a conflict.
export function createReceiptLedger() {
  const byKey = new Map();
  return {
    record(receipt) {
      const fingerprint = receiptFingerprint(receipt);
      const existing = byKey.get(receipt.idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new ReceiptError(
            "idempotency_conflict",
            `idempotency key ${receipt.idempotencyKey} was already used with a different receipt`,
          );
        }
        return { recorded: false, replayed: true };
      }
      byKey.set(receipt.idempotencyKey, { fingerprint, receipt });
      return { recorded: true, replayed: false };
    },
    size() {
      return byKey.size;
    },
    has(idempotencyKey) {
      return byKey.has(idempotencyKey);
    },
  };
}
