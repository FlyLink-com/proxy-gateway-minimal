import { assertNoDuplicateObjectKeys } from "../deployment/strict-json-scan.mjs";

// Raw, non-reset snapshots only. The caller owns source identity, coverage,
// fresh-baseline admission and accounting; these readers never persist state.
const SAFE_REF = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_CONNECTION_ID = /^[A-Za-z0-9._:-]{1,256}$/;
const USER_FIELDS = ["inboundUser", "inbound_user", "inUser", "in-user", "user", "username", "uuid"];

class SourceError extends Error {
  constructor(kind) {
    super(`full_metering_source_${kind}`);
    this.name = "FullMeteringSourceError";
    this.code = this.message;
  }
}

function fail(kind) { throw new SourceError(kind); }
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function runtimeUser(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
}
function credentialMap(value) {
  if (!(value instanceof Map) && !object(value)) fail("config_invalid");
  const result = new Map();
  for (const [user, ref] of value instanceof Map ? value : Object.entries(value)) {
    if (!runtimeUser(user) || typeof ref !== "string" || !SAFE_REF.test(ref)) fail("config_invalid");
    result.set(user, ref);
  }
  return result;
}
function endpoint(raw, path) {
  // Reject URL-normalized alternative IP spellings, userinfo, dot segments,
  // query strings (including clear=0), fragments and DNS/localhost resolution.
  if (typeof raw !== "string") fail("config_invalid");
  const match = /^http:\/\/(127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})(\/traffic|\/connections)$/.exec(raw);
  if (!match || Number(match[2]) > 65535 || match[3] !== path) fail("config_invalid");
  return new URL(raw).toString();
}
function optionsFor(options, path, bearer) {
  try {
    const {
      url, secret = "", credentialRefByRuntimeUser,
      timeoutMs = 10_000, maxResponseBytes = 4 * 1024 * 1024,
      fetchFn = globalThis.fetch, nowFn = () => new Date()
    } = options;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000
      || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 16 * 1024 * 1024
      || typeof fetchFn !== "function" || typeof nowFn !== "function"
      || typeof secret !== "string" || secret.length > 4096 || /[\x00-\x1f\x7f]/.test(secret)) fail("config_invalid");
    const headers = { Accept: "application/json" };
    if (secret) headers.Authorization = bearer ? `Bearer ${secret}` : secret;
    return { url: endpoint(url, path), headers, map: credentialMap(credentialRefByRuntimeUser), timeoutMs, maxResponseBytes, fetchFn, nowFn };
  } catch {
    fail("config_invalid");
  }
}
function bytes(uploadBytes, downloadBytes) {
  if (!Number.isSafeInteger(uploadBytes) || uploadBytes < 0
    || !Number.isSafeInteger(downloadBytes) || downloadBytes < 0
    || !Number.isSafeInteger(uploadBytes + downloadBytes)) fail("counter_invalid");
  return { uploadBytes, downloadBytes };
}
function resolveUser(user, map) {
  if (!runtimeUser(user) || !map.has(user)) fail("identity_unknown");
  return map.get(user);
}
function hy2Snapshot(payload, map) {
  if (!object(payload)) fail("response_invalid");
  const seen = new Set();
  const observations = [];
  for (const [user, entry] of Object.entries(payload)) {
    if (!object(entry)) fail("response_invalid");
    const edgeCredentialRef = resolveUser(user, map);
    if (seen.has(edgeCredentialRef)) fail("identity_ambiguous");
    seen.add(edgeCredentialRef);
    // Native Hy2 /traffic: tx is client upload, rx is client download.
    observations.push({ edgeCredentialRef, ...bytes(entry.tx, entry.rx) });
  }
  return { observations };
}
function connectionUser(connection) {
  const metadata = connection.metadata ?? {};
  if (!object(metadata)) fail("response_invalid");
  const identities = [];
  for (const source of [connection, metadata]) {
    for (const field of USER_FIELDS) {
      if (!Object.hasOwn(source, field)) continue;
      if (!runtimeUser(source[field])) fail("identity_unknown");
      identities.push(source[field]);
    }
  }
  if (identities.length === 0) fail("identity_unknown");
  if (new Set(identities).size !== 1) fail("identity_ambiguous");
  return identities[0];
}
function tuicSnapshot(payload, map) {
  if (!object(payload)
    || (payload.connections !== null && !Array.isArray(payload.connections))) fail("response_invalid");
  // Mihomo's native Snapshot serializes its nil tracker slice as explicit null
  // when idle. This means no active observations, not zero lifetime usage.
  // Do not coalesce missing fields or use envelope totals as user counters.
  const activeConnections = payload.connections === null ? [] : payload.connections;
  const seen = new Set();
  const connections = activeConnections.map((connection) => {
    if (!object(connection) || typeof connection.id !== "string" || !SAFE_CONNECTION_ID.test(connection.id)) fail("response_invalid");
    if (seen.has(connection.id)) fail("connection_duplicate");
    seen.add(connection.id);
    return {
      connectionId: connection.id,
      // A payload-supplied edgeCredentialRef is never an identity authority.
      edgeCredentialRef: resolveUser(connectionUser(connection), map),
      ...bytes(connection.upload, connection.download)
    };
  });
  return { connections };
}

async function readSnapshot(config, normalize) {
  const controller = new AbortController();
  const started = performance.now();
  let bodyReader;
  let timer;
  try {
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new SourceError("timeout"));
        controller.abort();
      }, config.timeoutMs);
    });
    const operation = async () => {
      const response = await config.fetchFn(config.url, {
        method: "GET", redirect: "error", headers: { ...config.headers }, signal: controller.signal
      });
      if (controller.signal.aborted) fail("timeout");
      if (response?.redirected || (response?.url && response.url !== config.url)) fail("request_failed");
      if (response?.status === 401) fail("unauthorized");
      if (response?.status === 403) fail("forbidden");
      if (response?.status !== 200 || !response?.ok) fail("http_failed");
      const media = response.headers?.get("content-type");
      if (typeof media !== "string" || !/^application\/json(?:\s*;.*)?$/i.test(media)) fail("response_invalid");
      const advertised = response.headers.get("content-length");
      if (advertised !== null && advertised !== undefined) {
        if (!/^[0-9]+$/.test(advertised)) fail("response_invalid");
        if (!Number.isSafeInteger(Number(advertised)) || Number(advertised) > config.maxResponseBytes) fail("response_too_large");
      }
      if (typeof response.body?.getReader !== "function") fail("response_invalid");
      bodyReader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        if (controller.signal.aborted) fail("timeout");
        const { done, value } = await bodyReader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) fail("response_invalid");
        total += value.byteLength;
        if (total > config.maxResponseBytes) fail("response_too_large");
        chunks.push(Buffer.from(value));
      }
      const source = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total));
      assertNoDuplicateObjectKeys(source);
      const snapshot = normalize(JSON.parse(source), config.map);
      // Trust the local completed-read clock, never a remote observedAt field.
      const now = config.nowFn();
      const observedAt = new Date(now instanceof Date ? now.getTime() : now).toISOString();
      if (performance.now() - started >= config.timeoutMs) fail("timeout");
      return { observedAt, ...snapshot };
    };
    return await Promise.race([operation(), deadline]);
  } catch (error) {
    if (error instanceof SourceError) throw error;
    fail("request_failed");
  } finally {
    clearTimeout(timer);
    controller.abort();
    // A stalled cancel must not extend the deadline or create a retry.
    try { Promise.resolve(bodyReader?.cancel()).catch(() => {}); } catch { /* fixed cleanup only */ }
    try { bodyReader?.releaseLock(); } catch { /* a pending read is already aborted */ }
  }
}

export function createFullMeteringHy2SnapshotReader(options = {}) {
  const config = optionsFor(options, "/traffic", false);
  return () => readSnapshot(config, hy2Snapshot);
}

export function createFullMeteringTuicConnectionSnapshotReader(options = {}) {
  const config = optionsFor(options, "/connections", true);
  return () => readSnapshot(config, tuicSnapshot);
}
