export function createAuthMiddleware({ token, publicPaths = [] }) {
  return function authMiddleware(req, res, next) {
    if (publicPaths.some((path) => req.path === path || req.path.startsWith(`${path}/`))) {
      next();
      return;
    }

    const authorization = req.headers.authorization || "";
    const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    const queryToken = typeof req.query.token === "string" ? req.query.token : "";

    if (token && (bearer === token || queryToken === token)) {
      next();
      return;
    }

    res.status(401).json({ error: "Unauthorized" });
  };
}
