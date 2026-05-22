export const DEFAULT_EXPIRING_DAYS = 7;
export const SHARED_NODE_MODE = "shared-node";

const ISO_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function serviceError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function validationError(message) {
  return serviceError(message, "validation_error");
}

export function notFoundError(id) {
  return serviceError(`Subscription tenant not found: ${id}`, "not_found");
}

export function isoNow(nowFn) {
  const now = nowFn();
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

export function normalizeDisplayName(displayName) {
  const normalized = String(displayName ?? "").trim();
  if (!normalized) {
    throw validationError("displayName is required");
  }
  if (normalized.length > 80) {
    throw validationError("displayName must be at most 80 characters");
  }
  return normalized;
}

export function normalizeExpiresAt(expiresAt) {
  const match = ISO_DATE_TIME_PATTERN.exec(String(expiresAt || ""));
  if (!match) {
    throw validationError("expiresAt must be a valid ISO date");
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw validationError("expiresAt must be a valid ISO date");
  }

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    throw validationError("expiresAt must be a valid ISO date");
  }
  return date.toISOString();
}

export function normalizeNote(note = "") {
  const normalized = String(note ?? "").trim();
  if (normalized.length > 500) {
    throw validationError("note must be at most 500 characters");
  }
  return normalized;
}

export function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function normalizePublicSubscriptionBaseUrl(value) {
  const normalized = trimTrailingSlash(String(value || "").trim());
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw validationError("publicSubscriptionBaseUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw validationError("publicSubscriptionBaseUrl must be a valid URL");
  }
  return normalized;
}

export function makeSubscriptionUrl(publicSubscriptionBaseUrl, rawToken) {
  return `${trimTrailingSlash(publicSubscriptionBaseUrl)}/sub/clash.yaml?token=${encodeURIComponent(rawToken)}`;
}
