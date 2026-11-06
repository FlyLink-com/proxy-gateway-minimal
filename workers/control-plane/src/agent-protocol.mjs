// G4 Agent HTTPS control-plane endpoints. This module is deliberately
// WebCrypto-only so the Worker needs no Node compatibility flag.

import {
  AgentRepository,
  MAX_OVERLAP_MS,
  NonceReplayError,
} from "./repositories/agent-repository.mjs";

const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const GENERATION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_CLAIM_LEASE_MS = 120 * 1000;
const IDEMPOTENCY_KEY_PATTERN = /^[!-~]{16,256}$/;
const MAX_RECEIPT_BODY_BYTES = 16 * 1024;
const MAX_RECEIPT_MATERIALS_PER_CHANNEL = 32;
const encoder = new TextEncoder();

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function jsonError(status, code, message) {
  return jsonResponse(status, { error: { code, message } });
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => (
    JSON.stringify(key) + ":" + canonicalJson(value[key])
  )).join(",") + "}";
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parsePemBytes(pem) {
  if (typeof pem !== "string") throw new Error("manifest signing key is unavailable");
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
    throw new Error("manifest signing key is invalid");
  }
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signManifest(manifest, privateKeyPem) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    parsePemBytes(privateKeyPem),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    key,
    encoder.encode(canonicalJson(manifest)),
  );
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sortChannelRefs(values) {
  return [...values].sort();
}

function parseChannelRefs(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.includes(" ")) return null;
  const values = raw.split(",");
  if (
    values.length === 0
    || values.some((value) => !REF_PATTERN.test(value))
    || new Set(values).size !== values.length
  ) return null;
  return sortChannelRefs(values);
}

function sortMaterials(values) {
  return [...values].sort((left, right) => {
    for (const key of ["channelRef", "edgeCredentialRef", "digest"]) {
      if (left[key] < right[key]) return -1;
      if (left[key] > right[key]) return 1;
    }
    return 0;
  });
}

async function desiredStateDigest({ nodeRef, channelRefs, generation, desiredStateRef, materials }) {
  const normalizedMaterials = [...materials]
    .map((item) => ({
      channelRef: item.channelRef,
      edgeCredentialRef: item.edgeCredentialRef,
      digest: item.digest,
    }))
    .sort((left, right) => {
      if (left.edgeCredentialRef < right.edgeCredentialRef) return -1;
      if (left.edgeCredentialRef > right.edgeCredentialRef) return 1;
      return 0;
    });
  return sha256Hex(canonicalJson({
    nodeRef,
    channelRefs: sortChannelRefs(channelRefs),
    generation,
    desiredStateRef,
    materials: normalizedMaterials,
  }));
}

async function authenticateAgent(request, env, {
  nodeRef,
  channelRefs,
  exactChannelSet = false,
}) {
  if (!env || !env.CONTROL_DB) {
    return { response: jsonError(503, "source_unavailable", "control database binding is not configured") };
  }
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer ([^\s]+)$/.exec(authorization);
  const keyId = request.headers.get("x-agent-key-id") ?? "";
  const headerNodeRef = request.headers.get("x-agent-node-ref") ?? "";
  const timestamp = request.headers.get("x-agent-timestamp") ?? "";
  const nonce = request.headers.get("x-agent-nonce") ?? "";
  if (
    !bearer
    || bearer[1].length < 24
    || bearer[1].length > 512
    || !KEY_ID_PATTERN.test(keyId)
    || !REF_PATTERN.test(headerNodeRef)
    || !NONCE_PATTERN.test(nonce)
    || headerNodeRef !== nodeRef
  ) {
    return { response: jsonError(401, "unauthorized", "valid scoped Agent credentials are required") };
  }

  const timestampMs = Date.parse(timestamp);
  const now = new Date();
  if (
    !Number.isFinite(timestampMs)
    || new Date(timestampMs).toISOString() !== timestamp
    || Math.abs(now.getTime() - timestampMs) > MAX_CLOCK_SKEW_MS
  ) {
    return { response: jsonError(401, "invalid_timestamp", "Agent timestamp is outside the allowed clock window") };
  }

  const repository = new AgentRepository(env.CONTROL_DB);
  const credential = await repository.findCredential(keyId);
  if (!credential || credential.revoked_at) {
    return { response: jsonError(401, "unauthorized", "Agent credential is not active") };
  }
  if (credential.status === "overlap") {
    const activatedAt = Date.parse(credential.activated_at);
    const expiresAt = Date.parse(credential.overlap_expires_at);
    if (
      !Number.isFinite(activatedAt)
      || !Number.isFinite(expiresAt)
      || expiresAt <= activatedAt
      || expiresAt - activatedAt > MAX_OVERLAP_MS
    ) {
      return { response: jsonError(401, "credential_overlap_invalid", "Agent credential overlap is invalid") };
    }
    if (now.getTime() >= expiresAt) {
      await repository.expireOverlap(keyId, now.toISOString());
      return { response: jsonError(401, "credential_overlap_expired", "Agent credential overlap expired") };
    }
  } else if (credential.status !== "active") {
    return { response: jsonError(401, "unauthorized", "Agent credential is not active") };
  }

  if (Date.parse(credential.activated_at) > now.getTime()) {
    return { response: jsonError(401, "unauthorized", "Agent credential is not yet active") };
  }
  const presentedDigest = await sha256Hex(bearer[1]);
  if (!constantTimeEqual(presentedDigest, credential.token_sha256)) {
    return { response: jsonError(401, "unauthorized", "Agent credential is not active") };
  }

  let allowedChannels;
  try {
    allowedChannels = parseChannelRefs(JSON.parse(credential.channel_refs_json).join(","));
  } catch {
    allowedChannels = null;
  }
  if (
    credential.node_ref !== nodeRef
    || !allowedChannels
    || channelRefs.some((channelRef) => !allowedChannels.includes(channelRef))
    || (exactChannelSet && canonicalJson(allowedChannels) !== canonicalJson(channelRefs))
  ) {
    return { response: jsonError(403, "scope_violation", "Agent credential is outside the requested node/channel scope") };
  }

  const node = await env.CONTROL_DB
    .prepare("SELECT node_ref FROM agent_nodes WHERE node_ref = ? AND status = 'active'")
    .bind(nodeRef)
    .first();
  if (!node) {
    return { response: jsonError(403, "scope_violation", "Agent node is not active") };
  }
  const placeholders = channelRefs.map(() => "?").join(", ");
  const assigned = await env.CONTROL_DB
    .prepare(
      "SELECT channel_ref FROM agent_node_channels " +
      "WHERE node_ref = ? AND status = 'active' AND channel_ref IN (" + placeholders + ")",
    )
    .bind(nodeRef, ...channelRefs)
    .all();
  const assignedChannels = sortChannelRefs((assigned.results ?? []).map((row) => row.channel_ref));
  if (canonicalJson(assignedChannels) !== canonicalJson(channelRefs)) {
    return { response: jsonError(403, "scope_violation", "Agent channel assignment is outside the requested scope") };
  }

  const nowIso = now.toISOString();
  try {
    await repository.consumeNonce({ keyId, nonce, nowIso });
  } catch (error) {
    if (error instanceof NonceReplayError || error?.code === "replay_detected") {
      return { response: jsonError(409, "replay_detected", "Agent request nonce has already been used") };
    }
    throw error;
  }
  try {
    await repository.recordAuthenticatedRequest({ credential, nowIso });
  } catch (error) {
    if (error?.code === "credential_revoked") {
      return { response: jsonError(401, "unauthorized", "Agent credential is no longer active") };
    }
    throw error;
  }
  return { credential, keyId, now };
}

export async function handleAgentDesiredState(request, env) {
  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    if (key !== "nodeRef" && key !== "channelRefs") {
      return jsonError(400, "invalid_query", "unknown desired-state query parameter");
    }
  }
  if (url.searchParams.getAll("nodeRef").length !== 1 || url.searchParams.getAll("channelRefs").length !== 1) {
    return jsonError(400, "invalid_query", "nodeRef and channelRefs are required exactly once");
  }
  const nodeRef = url.searchParams.get("nodeRef");
  const channelRefs = parseChannelRefs(url.searchParams.get("channelRefs"));
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (!REF_PATTERN.test(nodeRef ?? "") || !channelRefs) {
    return jsonError(400, "invalid_query", "nodeRef or channelRefs are invalid");
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return jsonError(400, "invalid_idempotency_key", "Idempotency-Key is required for a manifest claim");
  }

  const auth = await authenticateAgent(request, env, {
    nodeRef,
    channelRefs,
    exactChannelSet: true,
  });
  if (auth.response) return auth.response;

  const requestFingerprint = await sha256Hex(canonicalJson({
    nodeRef,
    channelRefs,
  }));
  const existing = await env.CONTROL_DB
    .prepare(
      "SELECT request_fingerprint, manifest_json, materials_json, signature, lease_until, status " +
      "FROM agent_manifest_claims WHERE idempotency_key = ?",
    )
    .bind(idempotencyKey)
    .first();
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) {
      return jsonError(409, "idempotency_conflict", "claim idempotency key was reused with a different scope");
    }
    if (existing.status === "expired" || Date.parse(existing.lease_until) <= auth.now.getTime()) {
      await env.CONTROL_DB
        .prepare(
          "UPDATE agent_manifest_claims SET status = 'expired' " +
          "WHERE idempotency_key = ? AND status = 'leased'",
        )
        .bind(idempotencyKey)
        .run();
      return jsonError(410, "claim_expired", "manifest claim lease expired; request a new claim key");
    }
    return jsonResponse(200, {
      manifest: JSON.parse(existing.manifest_json),
      signature: existing.signature,
      materials: JSON.parse(existing.materials_json),
    });
  }

  const state = await env.CONTROL_DB
    .prepare(
      "SELECT desired_state_ref, node_ref, generation, status, expires_at " +
      "FROM agent_desired_states WHERE node_ref = ? AND status = 'active' " +
      "ORDER BY created_at DESC LIMIT 1",
    )
    .bind(nodeRef)
    .first();
  if (!state) return jsonError(404, "desired_state_not_found", "no active desired state exists");
  const stateExpiry = Date.parse(state.expires_at);
  if (!Number.isFinite(stateExpiry) || stateExpiry <= auth.now.getTime()) {
    return jsonError(410, "desired_state_expired", "active desired state has expired");
  }

  const materialRows = await env.CONTROL_DB
    .prepare(
      "SELECT channel_ref, edge_credential_ref, digest FROM agent_desired_state_materials " +
      "WHERE desired_state_ref = ? ORDER BY edge_credential_ref",
    )
    .bind(state.desired_state_ref)
    .all();
  const materials = (materialRows.results ?? []).map((row) => ({
    channelRef: row.channel_ref,
    edgeCredentialRef: row.edge_credential_ref,
    digest: row.digest,
  }));
  const materialCounts = new Map();
  for (const item of materials) {
    materialCounts.set(item.channelRef, (materialCounts.get(item.channelRef) ?? 0) + 1);
  }
  if ([...materialCounts.values()].some((count) => count > MAX_RECEIPT_MATERIALS_PER_CHANNEL)) {
    return jsonError(413, "desired_state_too_large", "desired state exceeds the per-channel receipt material limit");
  }
  const materialChannels = sortChannelRefs([...new Set(materials.map((item) => item.channelRef))]);
  if (
    materials.length === 0
    || canonicalJson(materialChannels) !== canonicalJson(channelRefs)
    || materials.some((item) => !REF_PATTERN.test(item.edgeCredentialRef) || !DIGEST_PATTERN.test(item.digest))
  ) {
    return jsonError(409, "desired_state_incomplete", "desired state does not cover the scoped channels");
  }

  const signingKeyId = env.AGENT_MANIFEST_SIGNING_KEY_ID;
  const privateKeyPem = env.AGENT_MANIFEST_SIGNING_PRIVATE_KEY;
  if (typeof signingKeyId !== "string" || !KEY_ID_PATTERN.test(signingKeyId) || typeof privateKeyPem !== "string") {
    return jsonError(503, "signing_unavailable", "manifest signing is not configured");
  }
  const leaseUntilMs = Math.min(stateExpiry, auth.now.getTime() + MAX_CLAIM_LEASE_MS);
  const leaseUntil = new Date(leaseUntilMs).toISOString();
  const antiReplayId = crypto.randomUUID();
  const manifest = {
    nodeRef,
    channelRefs,
    generation: state.generation,
    desiredStateRef: state.desired_state_ref,
    desiredStateDigest: await desiredStateDigest({
      nodeRef,
      channelRefs,
      generation: state.generation,
      desiredStateRef: state.desired_state_ref,
      materials,
    }),
    issuedAt: auth.now.toISOString(),
    expiresAt: leaseUntil,
    antiReplayId,
    keyId: signingKeyId,
  };
  const signature = await signManifest(manifest, privateKeyPem);
  const envelope = { manifest, signature, materials };

  try {
    await env.CONTROL_DB
      .prepare(
        "INSERT INTO agent_manifest_claims " +
        "(idempotency_key, request_fingerprint, node_ref, channel_refs_json, desired_state_ref, " +
        "generation, manifest_json, materials_json, signature, anti_replay_id, claimed_at, " +
        "lease_until, status, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'leased', ?)",
      )
      .bind(
        idempotencyKey,
        requestFingerprint,
        nodeRef,
        JSON.stringify(channelRefs),
        state.desired_state_ref,
        state.generation,
        JSON.stringify(manifest),
        JSON.stringify(materials),
        signature,
        antiReplayId,
        auth.now.toISOString(),
        leaseUntil,
        auth.now.toISOString(),
      )
      .run();
  } catch {
    const committed = await env.CONTROL_DB
      .prepare(
        "SELECT request_fingerprint, manifest_json, materials_json, signature, lease_until, status " +
        "FROM agent_manifest_claims WHERE idempotency_key = ?",
      )
      .bind(idempotencyKey)
      .first();
    if (!committed) throw new Error("manifest claim write failed");
    if (committed.request_fingerprint !== requestFingerprint) {
      return jsonError(409, "idempotency_conflict", "claim idempotency key was reused with a different scope");
    }
    if (committed.status === "expired" || Date.parse(committed.lease_until) <= auth.now.getTime()) {
      return jsonError(410, "claim_expired", "manifest claim lease expired; request a new claim key");
    }
    return jsonResponse(200, {
      manifest: JSON.parse(committed.manifest_json),
      signature: committed.signature,
      materials: JSON.parse(committed.materials_json),
    });
  }
  return jsonResponse(200, envelope);
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return canonicalJson(actual) === canonicalJson(expected);
}

async function readReceiptBody(request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^[0-9]+$/.test(contentLength)) {
      return { response: jsonError(400, "invalid_content_length", "receipt Content-Length is invalid") };
    }
    if (Number(contentLength) > MAX_RECEIPT_BODY_BYTES) {
      return { response: jsonError(413, "receipt_too_large", "receipt body exceeds the 16 KiB limit") };
    }
  }
  if (!request.body) {
    return { response: jsonError(400, "invalid_receipt", "receipt body is required") };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RECEIPT_BODY_BYTES) {
        try {
          await reader.cancel("receipt body exceeds the 16 KiB limit");
        } catch {
          // The size limit is already enforced; cancellation is best-effort.
        }
        return { response: jsonError(413, "receipt_too_large", "receipt body exceeds the 16 KiB limit") };
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // Preserve the bounded-body failure response.
    }
    return { response: jsonError(400, "invalid_receipt", "receipt body could not be read") };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The reader may already be released by the runtime.
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let raw;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { response: jsonError(400, "invalid_receipt", "receipt body must be valid UTF-8 JSON") };
  }
  try {
    return { payload: JSON.parse(raw) };
  } catch {
    return { response: jsonError(400, "invalid_receipt", "receipt body must be valid JSON") };
  }
}

function receiptFingerprint(receipt, materialDigests) {
  return sha256Hex(canonicalJson({
    type: receipt.type,
    nodeRef: receipt.nodeRef,
    channelRef: receipt.channelRef,
    generation: receipt.generation,
    desiredStateRef: receipt.desiredStateRef,
    materialDigests,
    status: receipt.status,
  }));
}


async function markClaimsCompleted(db, receipt) {
  if (receipt.status !== "applied") return;
  const expected = await db
    .prepare(
      "SELECT COUNT(DISTINCT channel_ref) AS n FROM agent_desired_state_materials " +
      "WHERE desired_state_ref = ?",
    )
    .bind(receipt.desiredStateRef)
    .first();
  const received = await db
    .prepare(
      "SELECT COUNT(DISTINCT channel_ref) AS n FROM agent_apply_receipts " +
      "WHERE desired_state_ref = ? AND node_ref = ? AND generation = ? AND status = 'applied'",
    )
    .bind(receipt.desiredStateRef, receipt.nodeRef, receipt.generation)
    .first();
  if (Number(received?.n ?? 0) >= Number(expected?.n ?? 0) && Number(expected?.n ?? 0) > 0) {
    await db
      .prepare(
        "UPDATE agent_manifest_claims SET status = 'completed' " +
        "WHERE desired_state_ref = ? AND node_ref = ? AND generation = ? AND status = 'leased'",
      )
      .bind(receipt.desiredStateRef, receipt.nodeRef, receipt.generation)
      .run();
  }
}

function replayReceipt(existing, fingerprint) {
  if (existing.fingerprint !== fingerprint) {
    return jsonError(409, "idempotency_conflict", "receipt idempotency key was reused with a different outcome");
  }
  return jsonResponse(200, { recorded: false, replayed: true });
}

export async function handleAgentReceipt(request, env) {
  const body = await readReceiptBody(request);
  if (body.response) return body.response;
  const payload = body.payload;
  if (!exactKeys(payload, [
    "type",
    "nodeRef",
    "channelRef",
    "generation",
    "desiredStateRef",
    "materialDigests",
    "idempotencyKey",
    "status",
    "detail",
    "redacted",
  ])) {
    return jsonError(400, "invalid_receipt", "receipt shape is invalid");
  }
  if (request.headers.get("idempotency-key") !== payload.idempotencyKey) {
    return jsonError(400, "invalid_idempotency_key", "receipt Idempotency-Key header must match the body");
  }
  if (
    payload.type !== "gccgw_data_plane_apply_receipt"
    || payload.redacted !== true
    || !REF_PATTERN.test(payload.nodeRef ?? "")
    || !REF_PATTERN.test(payload.channelRef ?? "")
    || !GENERATION_PATTERN.test(payload.generation ?? "")
    || payload.generation === "."
    || payload.generation === ".."
    || !REF_PATTERN.test(payload.desiredStateRef ?? "")
    || !["applied", "dry_run"].includes(payload.status)
    || payload.idempotencyKey !== "receipt:" + payload.desiredStateRef + ":" + payload.generation + ":" + payload.channelRef
    || !exactKeys(payload.detail, ["mode"])
    || payload.detail.mode !== (payload.status === "applied" ? "apply" : "dry_run")
    || !Array.isArray(payload.materialDigests)
    || payload.materialDigests.length === 0
    || payload.materialDigests.some((item) => (
      !exactKeys(item, ["channelRef", "edgeCredentialRef", "digest"])
      || item.channelRef !== payload.channelRef
      || !REF_PATTERN.test(item.edgeCredentialRef ?? "")
      || !DIGEST_PATTERN.test(item.digest ?? "")
    ))
  ) {
    return jsonError(400, "invalid_receipt", "receipt fields or redaction boundary are invalid");
  }

  const materialDigests = sortMaterials(payload.materialDigests);
  if (new Set(materialDigests.map((item) => item.edgeCredentialRef)).size !== materialDigests.length) {
    return jsonError(400, "invalid_receipt", "receipt material references must be unique");
  }
  const auth = await authenticateAgent(request, env, {
    nodeRef: payload.nodeRef,
    channelRefs: [payload.channelRef],
  });
  if (auth.response) return auth.response;

  const state = await env.CONTROL_DB
    .prepare(
      "SELECT desired_state_ref, node_ref, generation, status FROM agent_desired_states " +
      "WHERE desired_state_ref = ? AND node_ref = ? AND generation = ?",
    )
    .bind(payload.desiredStateRef, payload.nodeRef, payload.generation)
    .first();
  if (!state || !["active", "superseded", "revoked"].includes(state.status)) {
    return jsonError(409, "receipt_binding_mismatch", "receipt does not match a retained desired-state generation");
  }

  const expectedRows = await env.CONTROL_DB
    .prepare(
      "SELECT channel_ref, edge_credential_ref, digest FROM agent_desired_state_materials " +
      "WHERE desired_state_ref = ? AND channel_ref = ? ORDER BY edge_credential_ref",
    )
    .bind(payload.desiredStateRef, payload.channelRef)
    .all();
  const expectedMaterials = sortMaterials((expectedRows.results ?? []).map((row) => ({
    channelRef: row.channel_ref,
    edgeCredentialRef: row.edge_credential_ref,
    digest: row.digest,
  })));
  if (
    expectedMaterials.length === 0
    || canonicalJson(expectedMaterials) !== canonicalJson(materialDigests)
  ) {
    return jsonError(409, "receipt_binding_mismatch", "receipt material digests do not match desired state");
  }

  const fingerprint = await receiptFingerprint(payload, materialDigests);
  const existing = await env.CONTROL_DB
    .prepare(
      "SELECT fingerprint FROM agent_apply_receipts WHERE idempotency_key = ?",
    )
    .bind(payload.idempotencyKey)
    .first();
  if (existing) {
    await markClaimsCompleted(env.CONTROL_DB, payload);
    return replayReceipt(existing, fingerprint);
  }

  const receivedAt = auth.now.toISOString();
  try {
    await env.CONTROL_DB
      .prepare(
        "INSERT INTO agent_apply_receipts " +
        "(idempotency_key, fingerprint, node_ref, channel_ref, generation, desired_state_ref, " +
        "material_digests_json, status, detail_mode, key_id, received_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        payload.idempotencyKey,
        fingerprint,
        payload.nodeRef,
        payload.channelRef,
        payload.generation,
        payload.desiredStateRef,
        JSON.stringify(materialDigests),
        payload.status,
        payload.detail.mode,
        auth.keyId,
        receivedAt,
      )
      .run();
  } catch {
    const committed = await env.CONTROL_DB
      .prepare("SELECT fingerprint FROM agent_apply_receipts WHERE idempotency_key = ?")
      .bind(payload.idempotencyKey)
      .first();
    if (committed) return replayReceipt(committed, fingerprint);
    throw new Error("receipt write failed");
  }
  await markClaimsCompleted(env.CONTROL_DB, payload);
  return jsonResponse(201, { recorded: true, replayed: false });
}
