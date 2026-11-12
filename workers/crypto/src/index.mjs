import {
  assertDistinctKeyRings,
  createD1IdempotencyEnvelope,
  createD1IdempotencyLookupCandidates,
  createD1PiiDigestEnvelope,
  createD1PiiLookupCandidatesFromDigest,
  createD1ProviderEventEnvelope,
  createD1ProviderEventLookupCandidates,
  destroyD1KeyRing,
  parseD1KeyRingSecret,
  verifyD1IdempotencyEnvelope,
  verifyD1PiiDigestEnvelopeFromDigest,
  verifyD1ProviderEventEnvelope
} from "../../../server/services/platform/d1-t2-security-primitives.mjs";

const INTERNAL_PATH = "/internal/v1/digests";
const MAX_BODY_BYTES = 16 * 1024;
const CALLER_ID = "control-plane";
const TOKEN_PATTERN = /^[!-~]{24,512}$/u;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const KEY_FAMILY_BINDINGS = Object.freeze([
  Object.freeze({ family: "idempotency-hmac", binding: "IDEMPOTENCY_HMAC_KEYRING_JSON" }),
  Object.freeze({ family: "provider-event-hmac", binding: "PROVIDER_EVENT_HMAC_KEYRING_JSON" }),
  Object.freeze({ family: "pii-hmac", binding: "PII_HMAC_KEYRING_JSON" })
]);

const REQUEST_FIELDS = Object.freeze({
  "idempotency.create": ["version", "operation", "domain", "actorScope", "operationType", "rawKey"],
  "idempotency.candidates": ["version", "operation", "domain", "actorScope", "operationType", "rawKey"],
  "idempotency.verify": ["version", "operation", "domain", "actorScope", "operationType", "rawKey", "envelope"],
  "provider-event.create": ["version", "operation", "merchantScopeDigest", "rawEventKey"],
  "provider-event.candidates": ["version", "operation", "merchantScopeDigest", "rawEventKey"],
  "provider-event.verify": ["version", "operation", "merchantScopeDigest", "rawEventKey", "envelope"],
  "pii.create": ["version", "operation", "domain", "legacyDigestHex"],
  "pii.candidates": ["version", "operation", "domain", "legacyDigestHex"],
  "pii.verify": ["version", "operation", "domain", "legacyDigestHex", "envelope"]
});

const CLIENT_INPUT_ERRORS = new Set([
  "idempotency_domain_invalid",
  "provider_event_scope_invalid",
  "pii_domain_invalid",
  "legacy_digest_invalid",
  "security_input_invalid",
  "security_input_too_large",
  "key_id_invalid"
]);

function httpError(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

function jsonError(status, code) {
  const messages = {
    unauthorized: "internal caller is not authorized",
    method_not_allowed: "method not allowed",
    not_found: "route not found",
    unsupported_media_type: "application/json is required",
    payload_too_large: "request body is too large",
    invalid_json: "request body is invalid JSON",
    invalid_request: "request contract is invalid",
    service_unavailable: "cryptographic service is unavailable"
  };
  return jsonResponse(status, { error: { code, message: messages[code] || "request failed" } });
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length !== 0) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) return false;
  return actual.every((key) => Object.hasOwn(descriptors[key], "value") && descriptors[key].enumerable === true);
}

async function sha256Bytes(value) {
  const api = globalThis.crypto;
  if (!api?.subtle) throw httpError(503, "service_unavailable");
  return new Uint8Array(await api.subtle.digest("SHA-256", encoder.encode(value)));
}

async function tokenEquals(presented, expected) {
  if (typeof presented !== "string" || !TOKEN_PATTERN.test(presented)
    || typeof expected !== "string" || !TOKEN_PATTERN.test(expected)) return false;
  const [left, right] = await Promise.all([sha256Bytes(presented), sha256Bytes(expected)]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function isAuthorized(request, env) {
  if (request.headers.get("x-flylink-internal-caller") !== CALLER_ID) return false;
  const header = request.headers.get("authorization");
  const match = typeof header === "string" ? /^Bearer ([!-~]{24,512})$/u.exec(header) : null;
  if (!match) return false;

  const current = env?.CRYPTO_CONTROL_PLANE_CALLER_TOKEN;
  const previous = env?.CRYPTO_CONTROL_PLANE_CALLER_TOKEN_PREVIOUS;
  if (typeof current !== "string" || !TOKEN_PATTERN.test(current)) return false;

  const currentMatch = await tokenEquals(match[1], current);
  const previousMatch = typeof previous === "string" && TOKEN_PATTERN.test(previous)
    ? await tokenEquals(match[1], previous)
    : false;
  return currentMatch || previousMatch;
}

async function readBoundedText(request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/u.test(contentLength)) throw httpError(400, "invalid_request");
    if (Number(contentLength) > MAX_BODY_BYTES) throw httpError(413, "payload_too_large");
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw httpError(413, "payload_too_large");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return decoder.decode(bytes);
  } catch {
    throw httpError(400, "invalid_json");
  }
}

function parseRequestBody(rawText) {
  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    throw httpError(400, "invalid_json");
  }
  const expected = REQUEST_FIELDS[body?.operation];
  if (!expected || !hasExactKeys(body, expected) || body.version !== 1) {
    throw httpError(400, "invalid_request");
  }
  return body;
}

function operationFamily(operation) {
  if (operation.startsWith("idempotency.")) return "idempotency-hmac";
  if (operation.startsWith("provider-event.")) return "provider-event-hmac";
  if (operation.startsWith("pii.")) return "pii-hmac";
  throw httpError(400, "invalid_request");
}

function loadKeyRings(env) {
  const rings = new Map();
  try {
    for (const entry of KEY_FAMILY_BINDINGS) {
      const ring = parseD1KeyRingSecret(env?.[entry.binding], { family: entry.family });
      rings.set(entry.family, ring);
    }
    const values = [...rings.values()];
    for (let left = 0; left < values.length; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        assertDistinctKeyRings(values[left], values[right]);
      }
    }
    return rings;
  } catch (error) {
    for (const ring of rings.values()) destroyD1KeyRing(ring);
    throw error;
  }
}

async function executeOperation(body, rings) {
  const family = operationFamily(body.operation);
  const keyRing = rings.get(family);
  if (!keyRing) throw httpError(503, "service_unavailable");

  switch (body.operation) {
    case "idempotency.create":
      return {
        envelope: await createD1IdempotencyEnvelope({
          keyRing, domain: body.domain, actorScope: body.actorScope,
          operationType: body.operationType, rawKey: body.rawKey
        })
      };
    case "idempotency.candidates":
      return {
        candidates: await createD1IdempotencyLookupCandidates({
          keyRing, domain: body.domain, actorScope: body.actorScope,
          operationType: body.operationType, rawKey: body.rawKey
        })
      };
    case "idempotency.verify":
      return {
        valid: await verifyD1IdempotencyEnvelope({
          envelope: body.envelope, keyRing, domain: body.domain,
          actorScope: body.actorScope, operationType: body.operationType, rawKey: body.rawKey
        })
      };
    case "provider-event.create":
      return {
        envelope: await createD1ProviderEventEnvelope({
          keyRing, merchantScopeDigest: body.merchantScopeDigest, rawEventKey: body.rawEventKey
        })
      };
    case "provider-event.candidates":
      return {
        candidates: await createD1ProviderEventLookupCandidates({
          keyRing, merchantScopeDigest: body.merchantScopeDigest, rawEventKey: body.rawEventKey
        })
      };
    case "provider-event.verify":
      return {
        valid: await verifyD1ProviderEventEnvelope({
          envelope: body.envelope, keyRing,
          merchantScopeDigest: body.merchantScopeDigest, rawEventKey: body.rawEventKey
        })
      };
    case "pii.create":
      return {
        envelope: await createD1PiiDigestEnvelope({
          keyRing, domain: body.domain, legacyDigestHex: body.legacyDigestHex
        })
      };
    case "pii.candidates":
      return {
        candidates: await createD1PiiLookupCandidatesFromDigest({
          keyRing, domain: body.domain, legacyDigestHex: body.legacyDigestHex
        })
      };
    case "pii.verify":
      return {
        valid: await verifyD1PiiDigestEnvelopeFromDigest({
          envelope: body.envelope, keyRing, domain: body.domain, legacyDigestHex: body.legacyDigestHex
        })
      };
    default:
      throw httpError(400, "invalid_request");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== INTERNAL_PATH || url.search) return jsonError(404, "not_found");
    if (request.method !== "POST") return jsonError(405, "method_not_allowed");

    try {
      if (!(await isAuthorized(request, env))) return jsonError(401, "unauthorized");
    } catch {
      return jsonError(401, "unauthorized");
    }

    const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") return jsonError(415, "unsupported_media_type");

    let body;
    try {
      body = parseRequestBody(await readBoundedText(request));
    } catch (error) {
      return jsonError(error.status || 400, error.code || "invalid_request");
    }

    let rings;
    try {
      rings = loadKeyRings(env);
    } catch {
      return jsonError(503, "service_unavailable");
    }

    try {
      const result = await executeOperation(body, rings);
      return jsonResponse(200, { version: 1, ...result });
    } catch (error) {
      return CLIENT_INPUT_ERRORS.has(error?.code)
        ? jsonError(400, "invalid_request")
        : jsonError(503, "service_unavailable");
    } finally {
      for (const ring of rings.values()) destroyD1KeyRing(ring);
    }
  }
};
