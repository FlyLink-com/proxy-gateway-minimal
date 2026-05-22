import { DEFAULT_ADMIN_ALLOWED_CIDRS, createIpAllowlist, resolveClientIp } from "../services/ip-address.mjs";

export function createAdminAllowlistMiddleware({
  allowedCidrs = DEFAULT_ADMIN_ALLOWED_CIDRS,
  resolveClientIpFn = resolveClientIp
} = {}) {
  const isAllowed = createIpAllowlist(allowedCidrs);

  return (req, res, next) => {
    const clientIp = resolveClientIpFn(req);
    if (!isAllowed(clientIp)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
