import { resolveClientIp } from "../services/ip-address.mjs";

export function createRateLimitMiddleware({
  windowMs = 60000,
  max = 30,
  nowFn = () => Date.now(),
  keyFn = resolveClientIp
} = {}) {
  const buckets = new Map();

  function prune(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  return (req, res, next) => {
    const now = nowFn();
    prune(now);

    const key = keyFn(req) || "unknown";
    const existing = buckets.get(key);
    const bucket = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too Many Requests" });
      return;
    }

    next();
  };
}
