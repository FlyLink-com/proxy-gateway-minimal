import { authorizeAdmin } from "../services/platform/admin-authorization.mjs";

export function requireAdminCapability(capability) {
  return (req, res, next) => {
    const decision = authorizeAdmin({
      principal: req.adminPrincipal,
      capability
    });

    if (decision.allowed) {
      next();
      return;
    }
    if (decision.reasonCode === "principal_missing") {
      res.status(401).json({ error: "admin_authentication_required" });
      return;
    }
    res.status(403).json({
      error: "admin_capability_required",
      capability: decision.capability
    });
  };
}
