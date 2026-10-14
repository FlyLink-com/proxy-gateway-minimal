// Public ingress is an explicit opt-in. Never infer this origin from request
// Host/forwarded headers or widen the application's general proxy trust.
export function validateAdminPublicLogin({ enabled, authEnabled, origin }) {
  if (!enabled) return;
  if (!authEnabled) throw new Error("public Admin login requires admin auth");
  let parsed;
  try { parsed = new URL(origin); } catch { /* fixed startup error below */ }
  if (!parsed || parsed.protocol !== "https:" || parsed.origin !== origin
    || parsed.username || parsed.password) {
    throw new Error("ADMIN_BROWSER_ORIGIN must be an exact HTTPS origin for public Admin login");
  }
}

export function createAdminBrowserBoundary({ publicEnabled, origin }) {
  return (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    if (publicEnabled && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const fetchSite = req.get("sec-fetch-site");
      if (req.get("origin") !== origin || (fetchSite && fetchSite !== "same-origin")) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    next();
  };
}

export function handleAdminBodyParserError(error, req, res, next) {
  // These prefixes mirror Express' case-insensitive mount boundaries.
  if (!/^\/api\/(?:admin|admin-auth)(?:\/|$)/i.test(req.path)) return next(error);
  const status = error?.type === "entity.too.large" ? 413
    : ["entity.parse.failed", "request.size.invalid", "request.aborted",
      "encoding.unsupported", "charset.unsupported"].includes(error?.type) ? 400 : 500;
  res.status(status).json({ error: status === 500 ? "internal_error" : "validation_error" });
}
