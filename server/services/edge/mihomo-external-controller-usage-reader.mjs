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

function entriesFromPayload(payload) {
  if (Array.isArray(payload.entries)) return payload.entries;
  if (Array.isArray(payload.users)) return payload.users;
  if (Array.isArray(payload.observations)) return payload.observations;
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
    uploadBytes: nonNegativeInteger(source.uploadBytes ?? source.upload ?? source.up ?? source.tx),
    downloadBytes: nonNegativeInteger(source.downloadBytes ?? source.download ?? source.down ?? source.rx)
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

async function defaultFetchJson({ url, headers }) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw readerError("controller_error", "controller request failed");
  }
  return response.json();
}

export function createMihomoExternalControllerUsageSnapshotReader({
  controllerUrl,
  metricsPath = "/traffic",
  controllerSecret,
  fetchJson = defaultFetchJson,
  nowFn = () => new Date()
} = {}) {
  const baseUrl = loopbackControllerUrl(controllerUrl);
  const path = safePath(metricsPath);
  const secret = text(controllerSecret);
  if (typeof fetchJson !== "function") {
    throw readerError("validation_error", "fetchJson is required");
  }

  return async function readMihomoExternalControllerUsage({ since } = {}) {
    const url = new URL(path, baseUrl);
    const headers = secret ? { Authorization: `Bearer ${secret}` } : {};
    const payload = await fetchJson({
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
    const entries = entriesFromPayload(payload)
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
