import { createIpAllowlist, resolveClientIp } from "../services/ip-address.mjs";

export function createPortalAllowlistMiddleware({
  allowedCidrs = [],
  resolveClientIpFn = resolveClientIp
} = {}) {
  const rules = Array.isArray(allowedCidrs) ? allowedCidrs.filter(Boolean) : [];
  if (rules.length === 0) {
    return (_req, _res, next) => next();
  }

  const isAllowed = createIpAllowlist(rules);

  return (req, res, next) => {
    const clientIp = resolveClientIpFn(req);
    if (!isAllowed(clientIp)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
