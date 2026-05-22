export function createAuthMiddleware({ token, publicPaths = [] }) {
  return function authMiddleware(req, res, next) {
    if (publicPaths.some((path) => req.path === path)) {
      next();
      return;
    }

    const authorization = req.headers.authorization || "";
    const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

    if (token && bearer === token) {
      next();
      return;
    }

    res.status(401).json({ error: "Unauthorized" });
  };
}
