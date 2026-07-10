const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

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

function safeRef(value, field) {
  const normalized = requiredText(value, field);
  if (!SAFE_REF_PATTERN.test(normalized)) {
    throw readerError("validation_error", `${field} must be a safe reference`);
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

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
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

function connectionEntriesFromPayload(payload, runtimeCredentialMap) {
  if (!Array.isArray(payload.connections)) return [];
  const totalsByCredentialRef = new Map();
  for (const connection of payload.connections) {
    if (!isPlainObject(connection)) continue;
    const edgeCredentialRef = connectionEdgeCredentialRef(connection, runtimeCredentialMap);
    if (!SAFE_REF_PATTERN.test(edgeCredentialRef)) continue;
    const bytes = bytesFromEntry(connection);
    const current = totalsByCredentialRef.get(edgeCredentialRef) || {
      edgeCredentialRef,
      uploadBytes: 0,
      downloadBytes: 0
    };
    current.uploadBytes += bytes.uploadBytes;
    current.downloadBytes += bytes.downloadBytes;
    totalsByCredentialRef.set(edgeCredentialRef, current);
  }
  return [...totalsByCredentialRef.values()];
}

function entriesFromPayload(payload, runtimeCredentialMap) {
  if (Array.isArray(payload.entries)) return payload.entries;
  if (Array.isArray(payload.users)) return payload.users;
  if (Array.isArray(payload.observations)) return payload.observations;
  const connectionEntries = connectionEntriesFromPayload(payload, runtimeCredentialMap);
  if (connectionEntries.length > 0) return connectionEntries;
  return [];
}

function bytesFromEntry(entry) {
  return {
    uploadBytes: nonNegativeInteger(entry.uploadBytes ?? entry.upload ?? entry.up ?? entry.tx),
    downloadBytes: nonNegativeInteger(entry.downloadBytes ?? entry.download ?? entry.down ?? entry.rx)
  };
}

function aggregateFromPayload(payload) {
  const source = isPlainObject(payload.aggregate) ? payload.aggregate : payload;
  return {
    uploadBytes: nonNegativeInteger(
      source.uploadBytes ?? source.uploadTotalBytes ?? source.uploadTotal ?? source.totalUploadBytes ?? source.totalUpload ?? source.upload ?? source.up ?? source.tx
    ),
    downloadBytes: nonNegativeInteger(
      source.downloadBytes ?? source.downloadTotalBytes ?? source.downloadTotal ?? source.totalDownloadBytes ?? source.totalDownload ?? source.download ?? source.down ?? source.rx
    )
  };
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
  const normalized = text(value) || "/traffic";
  if (!normalized.startsWith("/")) {
    throw readerError("validation_error", "metricsPath must start with /");
  }
  return normalized;
}

function sourceRefFromPath(path) {
  const leaf = path.split("/").filter(Boolean).pop() || "traffic";
  const safeLeaf = leaf.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 64) || "traffic";
  return `mihomo_external_controller_${safeLeaf}`;
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

export function createMihomoExternalControllerUsageSnapshotReader({
  controllerUrl,
  metricsPath = "/traffic",
  controllerSecret,
  credentialRefByRuntimeUser,
  fetchJson,
  fetchFn = globalThis.fetch,
  nowFn = () => new Date()
} = {}) {
  const baseUrl = loopbackControllerUrl(controllerUrl);
  const path = safePath(metricsPath);
  const secret = text(controllerSecret);
  const runtimeCredentialMap = safeRuntimeCredentialMap(credentialRefByRuntimeUser);
  if (fetchJson !== undefined && typeof fetchJson !== "function") {
    throw readerError("validation_error", "fetchJson must be a function");
  }
  const readJson = typeof fetchJson === "function"
    ? fetchJson
    : (request) => defaultFetchJson({ ...request, fetchFn });
  if (typeof fetchJson !== "function" && typeof fetchFn !== "function") {
    throw readerError("validation_error", "fetchFn is required");
  }

  return async function readMihomoExternalControllerUsage({ since } = {}) {
    const url = new URL(path, baseUrl);
    const headers = secret ? { Authorization: `Bearer ${secret}` } : {};
    const payload = await readJson({
      url: url.toString(),
      headers
    });
    if (!isPlainObject(payload)) {
      throw readerError("validation_error", "controller payload must be an object");
    }

    const nowValue = typeof nowFn === "function" ? nowFn() : new Date();
    const observedAt = isoText(payload.observedAt || (nowValue instanceof Date ? nowValue.toISOString() : nowValue), "observedAt");
    const intervalStartedAt = isoText(payload.intervalStartedAt || since || observedAt, "intervalStartedAt");
    const intervalEndedAt = isoText(payload.intervalEndedAt || observedAt, "intervalEndedAt");
    const entries = entriesFromPayload(payload, runtimeCredentialMap)
      .filter(isPlainObject)
      .map((entry) => {
        const edgeCredentialRef = entry.edgeCredentialRef || entry.credentialRef;
        if (!SAFE_REF_PATTERN.test(text(edgeCredentialRef))) {
          return null;
        }
        return {
          edgeCredentialRef: safeRef(edgeCredentialRef, "edgeCredentialRef"),
          ...bytesFromEntry(entry)
        };
      })
      .filter(Boolean);

    const snapshot = {
      sourceRef: sourceRefFromPath(path),
      observedAt,
      intervalStartedAt,
      intervalEndedAt
    };

    if (entries.length > 0) {
      return {
        ...snapshot,
        entries
      };
    }

    return {
      ...snapshot,
      aggregate: aggregateFromPayload(payload)
    };
  };
}
