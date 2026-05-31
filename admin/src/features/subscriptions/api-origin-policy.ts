export type AdminAuthOriginPolicy = {
  trusted: boolean;
  reason?: string;
};

function currentOrigin() {
  return globalThis.location?.origin || "http://localhost";
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]";
}

export function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed || trimmed === "/") return "";
  return trimmed.replace(/\/+$/, "");
}

export function adminAuthOriginPolicy(baseUrl: string, origin = currentOrigin()): AdminAuthOriginPolicy {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return { trusted: true };
  }

  let target: URL;
  let current: URL;
  try {
    target = new URL(normalized, origin);
    current = new URL(origin);
  } catch {
    return { trusted: false, reason: "API base URL is not a valid trusted origin." };
  }

  if (target.origin === current.origin) {
    return { trusted: true };
  }

  if ((target.protocol === "http:" || target.protocol === "https:") && isLoopbackHost(target.hostname)) {
    return { trusted: true };
  }

  return {
    trusted: false,
    reason: "Console token is not sent to cross-origin API targets. Use same-origin access, loopback, or an SSH tunnel."
  };
}
