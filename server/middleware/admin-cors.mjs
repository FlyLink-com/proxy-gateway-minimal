function isLoopbackHost(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]";
}

function isLoopbackOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isAllowedAdminOrigin(origin, allowedOrigins) {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  return isLoopbackOrigin(origin);
}

export function createAdminCorsMiddleware({ allowedOrigins = [] } = {}) {
  return (req, res, next) => {
    const origin = req.get("origin") || "";
    if (!isAllowedAdminOrigin(origin, allowedOrigins)) {
      next();
      return;
    }

    res.vary("Origin");
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.set(
      "Access-Control-Allow-Headers",
      req.get("access-control-request-headers") || "authorization, content-type"
    );
    res.set("Access-Control-Max-Age", "600");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
