import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;

function readerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function requiredText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw readerError("validation_error", `${field} is required`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw readerError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function isoNow(nowFn) {
  const value = typeof nowFn === "function" ? nowFn() : new Date();
  return isoText(value instanceof Date ? value.toISOString() : value, "now");
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function loopbackControllerUrl(rawUrl) {
  let url;
  try {
    url = new URL(requiredText(rawUrl, "controllerUrl"));
  } catch {
    throw readerError("validation_error", "controllerUrl must be a valid URL");
  }
  if (url.protocol !== "http:") {
    throw readerError("validation_error", "controllerUrl must use http loopback");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]" && host !== "::1") {
    throw readerError("validation_error", "controllerUrl must be loopback-only");
  }
  return url;
}

function safePath(value) {
  const normalized = text(value) || "/connections";
  if (!normalized.startsWith("/")) {
    throw readerError("validation_error", "metricsPath must start with /");
  }
  return normalized;
}

function safeRuntimeCredentialMap(value) {
  const sourceEntries = value instanceof Map
    ? [...value.entries()]
    : isPlainObject(value)
      ? Object.entries(value)
      : [];
  const mapped = new Map();
  for (const [runtimeUser, edgeCredentialRef] of sourceEntries) {
    const safeRuntimeUser = text(runtimeUser);
    const safeCredentialRef = text(edgeCredentialRef);
    if (safeRuntimeUser && SAFE_REF_PATTERN.test(safeCredentialRef)) {
      mapped.set(safeRuntimeUser, safeCredentialRef);
    }
  }
  return mapped;
}

function connectionRuntimeUser(connection) {
  const metadata = isPlainObject(connection.metadata) ? connection.metadata : {};
  return firstText(
    connection.inboundUser,
    connection.inbound_user,
    connection.inUser,
    connection["in-user"],
    connection.user,
    connection.username,
    connection.uuid,
    metadata.inboundUser,
    metadata.inbound_user,
    metadata.inUser,
    metadata["in-user"],
    metadata.user,
    metadata.username,
    metadata.uuid
  );
}

function connectionEdgeCredentialRef(connection, runtimeCredentialMap) {
  const metadata = isPlainObject(connection.metadata) ? connection.metadata : {};
  const directRef = firstText(
    connection.edgeCredentialRef,
    connection.credentialRef,
    metadata.edgeCredentialRef,
    metadata.credentialRef
  );
  if (SAFE_REF_PATTERN.test(directRef)) {
    return directRef;
  }
  return runtimeCredentialMap.get(connectionRuntimeUser(connection)) || "";
}

function connectionId(connection) {
  const metadata = isPlainObject(connection.metadata) ? connection.metadata : {};
  const id = firstText(
    connection.id,
    connection.connectionId,
    connection.connectionRef,
    metadata.id,
    metadata.connectionId,
    metadata.connectionRef
  );
  return SAFE_CONNECTION_ID_PATTERN.test(id) ? id : "";
}

function connectionBytes(connection) {
  return {
    uploadBytes: nonNegativeInteger(connection.uploadBytes ?? connection.upload ?? connection.up ?? connection.tx),
    downloadBytes: nonNegativeInteger(connection.downloadBytes ?? connection.download ?? connection.down ?? connection.rx)
  };
}

function normalizeState(value) {
  const source = isPlainObject(value) ? value : {};
  const connections = new Map();
  const rawConnections = isPlainObject(source.connections) ? source.connections : {};
  for (const [id, entry] of Object.entries(rawConnections)) {
    if (!SAFE_CONNECTION_ID_PATTERN.test(id) || !isPlainObject(entry)) continue;
    const edgeCredentialRef = text(entry.edgeCredentialRef);
    if (!SAFE_REF_PATTERN.test(edgeCredentialRef)) continue;
    connections.set(id, {
      edgeCredentialRef,
      uploadBytes: nonNegativeInteger(entry.uploadBytes),
      downloadBytes: nonNegativeInteger(entry.downloadBytes),
      lastSeenAt: text(entry.lastSeenAt)
    });
  }
  return {
    initialized: Boolean(source.initialized),
    lastObservedAt: text(source.lastObservedAt),
    connections
  };
}

function serializeState({ observedAt, connections }) {
  const serializedConnections = {};
  for (const [id, entry] of connections.entries()) {
    serializedConnections[id] = {
      edgeCredentialRef: entry.edgeCredentialRef,
      uploadBytes: entry.uploadBytes,
      downloadBytes: entry.downloadBytes,
      lastSeenAt: observedAt
    };
  }
  return {
    version: 1,
    initialized: true,
    lastObservedAt: observedAt,
    connections: serializedConnections
  };
}

function aggregate(entries) {
  const totals = new Map();
  for (const entry of entries) {
    if (entry.uploadBytes + entry.downloadBytes <= 0) continue;
    const current = totals.get(entry.edgeCredentialRef) || {
      edgeCredentialRef: entry.edgeCredentialRef,
      uploadBytes: 0,
      downloadBytes: 0
    };
    current.uploadBytes += entry.uploadBytes;
    current.downloadBytes += entry.downloadBytes;
    totals.set(entry.edgeCredentialRef, current);
  }
  return [...totals.values()];
}

function connectionEntriesFromPayload(payload, runtimeCredentialMap) {
  if (!Array.isArray(payload.connections)) return [];
  const entries = [];
  for (const connection of payload.connections) {
    if (!isPlainObject(connection)) continue;
    const id = connectionId(connection);
    const edgeCredentialRef = connectionEdgeCredentialRef(connection, runtimeCredentialMap);
    if (!id || !SAFE_REF_PATTERN.test(edgeCredentialRef)) continue;
    entries.push({
      id,
      edgeCredentialRef,
      ...connectionBytes(connection)
    });
  }
  return entries;
}

async function defaultFetchJson({ url, headers, fetchFn }) {
  let response;
  try {
    response = await fetchFn(url, { headers });
  } catch {
    throw readerError("controller_error", "controller request failed");
  }
  if (response?.status === 401) {
    throw readerError("controller_unauthorized", "controller request failed");
  }
  if (response?.status === 403) {
    throw readerError("controller_forbidden", "controller request failed");
  }
  if (!response?.ok) {
    throw readerError("controller_error", "controller request failed");
  }
  try {
    return await response.json();
  } catch {
    throw readerError("validation_error", "controller response must be JSON");
  }
}

export function createInMemoryMihomoConnectionDeltaStateStore(initialState) {
  let state = initialState || null;
  return {
    async read() {
      return state;
    },
    async write(nextState) {
      state = nextState;
    }
  };
}

export function createFileMihomoConnectionDeltaStateStore({ statePath } = {}) {
  const safeStatePath = requiredText(statePath, "statePath");
  return {
    async read() {
      try {
        return JSON.parse(await readFile(safeStatePath, "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
    async write(nextState) {
      await mkdir(dirname(safeStatePath), { recursive: true });
      const tempPath = `${safeStatePath}.${process.pid}.tmp`;
      await writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, {
        mode: 0o600
      });
      await rename(tempPath, safeStatePath);
    }
  };
}

export function createMihomoConnectionDeltaUsageReader({
  controllerUrl,
  metricsPath = "/connections",
  controllerSecret,
  credentialRefByRuntimeUser,
  stateStore = createInMemoryMihomoConnectionDeltaStateStore(),
  fetchJson,
  fetchFn = globalThis.fetch,
  nowFn = () => new Date()
} = {}) {
  const baseUrl = loopbackControllerUrl(controllerUrl);
  const path = safePath(metricsPath);
  const secret = text(controllerSecret);
  const runtimeCredentialMap = safeRuntimeCredentialMap(credentialRefByRuntimeUser);
  if (!stateStore || typeof stateStore.read !== "function" || typeof stateStore.write !== "function") {
    throw readerError("validation_error", "stateStore with read/write methods is required");
  }
  if (fetchJson !== undefined && typeof fetchJson !== "function") {
    throw readerError("validation_error", "fetchJson must be a function");
  }
  const readJson = typeof fetchJson === "function"
    ? fetchJson
    : (request) => defaultFetchJson({ ...request, fetchFn });
  if (typeof fetchJson !== "function" && typeof fetchFn !== "function") {
    throw readerError("validation_error", "fetchFn is required");
  }

  return async function readMihomoConnectionDeltaUsage({ since } = {}) {
    const url = new URL(path, baseUrl);
    const headers = secret ? { Authorization: `Bearer ${secret}` } : {};
    const payload = await readJson({
      url: url.toString(),
      headers
    });
    if (!isPlainObject(payload)) {
      throw readerError("validation_error", "controller payload must be an object");
    }

    const observedAt = isoText(payload.observedAt || isoNow(nowFn), "observedAt");
    const previousState = normalizeState(await stateStore.read());
    const currentEntries = connectionEntriesFromPayload(payload, runtimeCredentialMap);
    const currentConnections = new Map(currentEntries.map((entry) => [
      entry.id,
      {
        edgeCredentialRef: entry.edgeCredentialRef,
        uploadBytes: entry.uploadBytes,
        downloadBytes: entry.downloadBytes
      }
    ]));

    const deltas = [];
    if (previousState.initialized) {
      for (const entry of currentEntries) {
        const previous = previousState.connections.get(entry.id);
        const isSameCredential = previous?.edgeCredentialRef === entry.edgeCredentialRef;
        const uploadBytes = previous && isSameCredential && entry.uploadBytes >= previous.uploadBytes
          ? entry.uploadBytes - previous.uploadBytes
          : entry.uploadBytes;
        const downloadBytes = previous && isSameCredential && entry.downloadBytes >= previous.downloadBytes
          ? entry.downloadBytes - previous.downloadBytes
          : entry.downloadBytes;
        deltas.push({
          edgeCredentialRef: entry.edgeCredentialRef,
          uploadBytes,
          downloadBytes
        });
      }
    }

    await stateStore.write(serializeState({
      observedAt,
      connections: currentConnections
    }));

    return {
      sourceRef: "mihomo_connection_delta",
      accountingMode: "delta",
      observedAt,
      intervalStartedAt: isoText(previousState.lastObservedAt || since || observedAt, "intervalStartedAt"),
      intervalEndedAt: observedAt,
      stateWarmup: !previousState.initialized,
      entries: aggregate(deltas)
    };
  };
}
