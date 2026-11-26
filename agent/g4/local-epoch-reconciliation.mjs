// Offline, read-only comparison. No storage adapters, authentication, dispatch
// or approval authority: callers supply scoped copies of both evidence sets.
import { canonicalJson, sha256Hex } from "./manifest.mjs";
import { APPLY_RECEIPT_TYPE, buildReceiptIdempotencyKey, receiptFingerprint } from "./receipt.mjs";

const LIMIT = 4096;
const HEX = /^[0-9a-f]{64}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const GEN = /^[A-Za-z0-9._:-]{1,128}$/;
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const textMatches = (r, v) => typeof v === "string" && r.test(v);
const list = (v) => Array.isArray(v) && v.length <= LIMIT;

function epoch(value) {
  const v = typeof value === "number" ? String(value) : value;
  if (!textMatches(/^[1-9][0-9]{0,9}$/, v) || Number(v) > 2147483647) return null;
  return Number(v);
}

function rowsByKey(rows) {
  const result = new Map();
  for (const row of rows) {
    if (!object(row) || typeof row.idempotency_key !== "string") return null;
    const key = row.idempotency_key;
    const values = result.get(key);
    if (values) values.push(row);
    else result.set(key, [row]);
  }
  return result;
}

function validReceipt(r) {
  if (!object(r) || r.type !== APPLY_RECEIPT_TYPE || r.redacted !== true
    || !textMatches(REF, r.nodeRef) || !textMatches(REF, r.channelRef)
    || !textMatches(REF, r.desiredStateRef) || !textMatches(GEN, r.generation) || [".", ".."].includes(r.generation)
    || !["applied", "dry_run"].includes(r.status)
    || !object(r.detail) || Object.keys(r.detail).length !== 1 || r.detail.mode !== (r.status === "applied" ? "apply" : "dry_run")
    || !list(r.materialDigests) || r.materialDigests.length === 0) return false;
  const refs = new Set();
  for (const m of r.materialDigests) {
    if (!object(m) || Object.keys(m).length !== 3 || m.channelRef !== r.channelRef
      || !textMatches(REF, m.edgeCredentialRef) || !textMatches(HEX, m.digest)
      || refs.has(m.edgeCredentialRef)) return false;
    refs.add(m.edgeCredentialRef);
  }
  return r.idempotencyKey === buildReceiptIdempotencyKey(r);
}

function sameMaterialEvidence(json, receipt) {
  try {
    if (typeof json !== "string") return false;
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length !== receipt.materialDigests.length) return false;
    const normalized = (items) => items.map((m) => canonicalJson(m)).sort();
    return canonicalJson(normalized(parsed)) === canonicalJson(normalized(receipt.materialDigests));
  } catch {
    return false;
  }
}

function compareReceipt(r, records, duplicate) {
  if (!validReceipt(r)) return "invalid_local_evidence";
  if (duplicate) return "duplicate_local_evidence";
  if (!records) return "receipt_missing";
  if (records.length !== 1) return "ambiguous_ledger_evidence";
  const w = records[0];
  if (!textMatches(HEX, w.fingerprint) || w.fingerprint !== receiptFingerprint(r)
    || w.node_ref !== r.nodeRef || w.channel_ref !== r.channelRef || w.generation !== r.generation
    || w.desired_state_ref !== r.desiredStateRef || w.status !== r.status || w.detail_mode !== r.detail.mode
    || !sameMaterialEvidence(w.material_digests_json, r)) {
    return "receipt_conflict";
  }
  // The durable row does not record the accepting writer epoch and is not
  // independent proof of the node-side effect. Match is historical only.
  return r.status === "applied" ? "applied_receipt_recorded" : "dry_run_receipt_recorded";
}

function compareClaim(claim, records) {
  let scope;
  try { scope = JSON.parse(claim.scopeFingerprint); } catch { return "invalid_local_evidence"; }
  if (!object(scope) || Object.keys(scope).length !== 2 || !textMatches(REF, scope.nodeRef) || !list(scope.channelRefs)
    || scope.channelRefs.length === 0 || scope.channelRefs.some((ref) => !textMatches(REF, ref))
    || new Set(scope.channelRefs).size !== scope.channelRefs.length
    || !textMatches(/^claim:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}:[A-Za-z0-9_-]{16,128}$/, claim.idempotencyKey)
    || !claim.idempotencyKey.startsWith("claim:" + scope.nodeRef + ":")) return "invalid_local_evidence";
  if (!records) return "claim_missing";
  if (records.length !== 1) return "ambiguous_ledger_evidence";
  const row = records[0];
  const hash = sha256Hex(canonicalJson({ nodeRef: scope.nodeRef, channelRefs: [...scope.channelRefs].sort() }));
  if (row.node_ref !== scope.nodeRef || row.request_fingerprint !== hash
    || !["leased", "completed", "expired"].includes(row.status)) return "claim_conflict";
  // Even a confirmed or expired lease does not prove execution/nonexecution.
  return "claim_seen_needs_review";
}

export function reconcileHistoricalAgentEvidence({ state, writerEpoch, receiptRows, claimRows } = {}) {
  const current = epoch(writerEpoch);
  const receipts = list(receiptRows) && rowsByKey(receiptRows);
  const claims = list(claimRows) && rowsByKey(claimRows);
  const invalid = () => ({ status: "invalid_evidence", allowDispatch: false, items: [] });
  if (current === null || !receipts || !claims || !object(state)) return invalid();
  const pending = state.pendingReceipts === undefined ? [] : state.pendingReceipts;
  const deferred = state.deferredReceipts === undefined ? [] : state.deferredReceipts;
  if (!list(pending) || !list(deferred) || pending.length + deferred.length > LIMIT
    || (state.pendingClaim != null && !object(state.pendingClaim))) return invalid();

  const items = [];
  if (Object.hasOwn(state, "pendingApply") && state.pendingApply !== null) {
    // A pending intent cannot prove whether any or all effects landed.
    items.push({ source: "pending_apply", index: 0, result: "apply_intent_needs_review" });
  }
  const occurrences = new Map();
  for (const r of [...pending, ...deferred]) {
    if (object(r) && typeof r.idempotencyKey === "string") {
      occurrences.set(r.idempotencyKey, (occurrences.get(r.idempotencyKey) ?? 0) + 1);
    }
  }
  const add = (source, index, value, compare) => {
    const previous = object(value) ? epoch(value.writerEpoch) : null;
    const result = previous === null ? "unbound_epoch"
      : previous > current ? "future_epoch"
        : previous === current ? "current_epoch_out_of_scope"
          : compare();
    // Only classifications and local ordinals: no keys, refs or material.
    items.push({ source, index, result });
  };
  for (const [source, entries] of [["pending_receipt", pending], ["deferred_receipt", deferred]]) {
    entries.forEach((r, index) => add(source, index, r, () =>
      compareReceipt(r, receipts.get(r.idempotencyKey), occurrences.get(r.idempotencyKey) > 1)));
  }
  if (state.pendingClaim != null) {
    const c = state.pendingClaim;
    add("pending_claim", 0, c, () => compareClaim(c, claims.get(c.idempotencyKey)));
  }
  const status = items.length === 0 ? "no_evidence"
    : items.every((i) => ["applied_receipt_recorded", "dry_run_receipt_recorded"].includes(i.result))
      ? "historical_receipts_matched" : "review_required";
  return { status, allowDispatch: false, items };
}
