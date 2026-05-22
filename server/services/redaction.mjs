const REDACTED = "[redacted]";

export function redactRequestTarget(value) {
  const raw = String(value || "");
  if (!raw) return raw;

  try {
    const url = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(raw, "http://local.invalid");

    if (url.searchParams.has("token")) {
      url.searchParams.set("token", REDACTED);
    }

    const output = raw.startsWith("http://") || raw.startsWith("https://")
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`;

    return output.replace(/token=%5Bredacted%5D/gi, "token=[redacted]");
  } catch {
    return raw.replace(/([?&]token=)[^&\s]+/gi, `$1${REDACTED}`);
  }
}

export function redactAuthorizationHeader(value) {
  const raw = String(value || "");
  return raw.replace(/^Bearer\s+.+$/i, "Bearer [redacted]");
}
