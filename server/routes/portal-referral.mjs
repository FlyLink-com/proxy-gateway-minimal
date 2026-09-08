import { Router, json } from "express";
import { rateLimit } from "express-rate-limit";
import {
  REFERRAL_CODE,
  REFERRAL_COOKIE,
  referralError,
} from "../services/platform/portal-referral-contract.mjs";

const REFERRAL_LANDING_URL = "https://gccwebos.com/#new-user";

export function readReferralCookie(req) {
  const value = req.headers?.cookie;
  if (typeof value !== "string" || value.length > 8192) return null;
  const matches = value
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${REFERRAL_COOKIE}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(REFERRAL_COOKIE.length + 1);
  return REFERRAL_CODE.test(token) ? token : null;
}
function rawHeader(req, name) {
  const values = [];
  for (let i = 0; i < (req.rawHeaders?.length || 0); i += 2)
    if (req.rawHeaders[i].toLowerCase() === name)
      values.push(req.rawHeaders[i + 1]);
  if (values.length > 1) throw referralError("referral_request_invalid");
  return values[0];
}
export function createPortalReferralRouter({
  service,
  auth,
  browserSessions,
  origin,
} = {}) {
  const trusted = new URL(origin);
  if (
    trusted.protocol !== "https:" ||
    trusted.origin !== origin ||
    trusted.username ||
    trusted.password
  )
    throw referralError();
  const router = Router();
  router.use((req, res, next) => {
    const path = req.path.toLowerCase();
    if (path.startsWith("/r/") || path.startsWith("/api/portal/referral")) {
      res.set("Cache-Control", "no-store");
      res.set("Referrer-Policy", "no-referrer");
    }
    next();
  });
  const limiter = () =>
    rateLimit({
      windowMs: 60000,
      limit: 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "referral_rate_limited" },
    });
  router.get("/r/:code", limiter(), (req, res) => {
    try {
      if (rawHeader(req, "host") !== trusted.host)
        throw referralError("referral_request_invalid");
      // Link scanners and prefetchers must not create attribution state.
      if (
        req.method !== "GET" ||
        req.headers.purpose === "prefetch" ||
        req.headers["sec-purpose"]?.includes("prefetch")
      ) {
        res.redirect(303, REFERRAL_LANDING_URL);
        return;
      }
      const touch = service.capture(req.params.code);
      if (touch)
        res.append(
          "Set-Cookie",
          `${REFERRAL_COOKIE}=${touch.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${touch.maxAge}`,
        );
      res.redirect(303, REFERRAL_LANDING_URL);
    } catch {
      res.status(503).json({ error: "referral_unavailable" });
    }
  });
  router.use(
    "/api/portal/referral",
    limiter(),
    json({ limit: "2kb" }),
    (req, res, next) => {
      try {
        if (
          (req.originalUrl || "").includes("?") ||
          (req.body !== undefined &&
            (req.body === null ||
              Array.isArray(req.body) ||
              typeof req.body !== "object" ||
              Object.keys(req.body).length))
        )
          throw referralError("referral_request_invalid");
        const browser = browserSessions?.session(req);
        const header = rawHeader(req, "x-portal-session");
        if (
          !browser &&
          (typeof header !== "string" || !/^[a-z][a-z0-9_]{2,95}$/.test(header))
        )
          throw referralError("invalid_session");
        const session = browser || auth.requireSession({ sessionRef: header });
        if (browser && header) throw referralError("referral_request_invalid");
        if (!session?.accountId) throw referralError("invalid_session");
        const requestOrigin = rawHeader(req, "origin");
        if (requestOrigin !== undefined && requestOrigin !== origin)
          throw referralError("referral_request_invalid");
        if (
          req.method === "POST" &&
          (rawHeader(req, "host") !== trusted.host || requestOrigin !== origin)
        )
          throw referralError("referral_request_invalid");
        res.locals.referralAccountId = session.accountId;
        next();
      } catch (error) {
        res.status(error.code === "invalid_session" ? 401 : 403).json({
          error:
            error.code === "invalid_session"
              ? "invalid_session"
              : "referral_request_invalid",
        });
      }
    },
  );
  function respond(action) {
    return (req, res) => {
      try {
        res.json(action(res.locals.referralAccountId));
      } catch (error) {
        const code = [
          "referral_account_ineligible",
          "referral_policy_unavailable",
        ].includes(error.code)
          ? error.code
          : "referral_unavailable";
        res
          .status(code === "referral_account_ineligible" ? 403 : 503)
          .json({ error: code });
      }
    };
  }
  router.get(
    "/api/portal/referral/profile",
    respond((id) => ({ profile: service.profile(id) })),
  );
  router.post(
    "/api/portal/referral/link",
    respond((id) => ({ profile: service.createLink(id) })),
  );
  router.get(
    "/api/portal/referral/performance",
    respond((id) => ({ performance: service.performance(id) })),
  );
  router.use("/api/portal/referral", (_req, res) =>
    res.status(404).json({ error: "not_found" }),
  );
  router.use("/api/portal/referral", (error, _req, res, _next) =>
    res
      .status(error?.status === 413 ? 413 : 400)
      .json({ error: "referral_request_invalid" }),
  );
  return router;
}
