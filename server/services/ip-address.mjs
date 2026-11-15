import { isIP } from "node:net";

export const DEFAULT_ADMIN_ALLOWED_CIDRS = [
  "127.0.0.1",
  "::1"
];

export const DEFAULT_TRUSTED_PROXY_CIDRS = [];

export function normalizeIpAddress(value) {
  const ip = String(value || "").trim();
  const mappedIpv4 = /^::ffff:(.+)$/i.exec(ip)?.[1];
  if (isIP(mappedIpv4) === 4) {
    return mappedIpv4;
  }
  return ip;
}

// Canonicalize a resolved source address for use as an express-rate-limit
// key. Shared by the admin-auth and portal-authority attempt limiters so the
// mapping stays identical in both places: IPv4 is returned as-is, legal IPv6
// spellings are canonicalized, and IPv4-mapped IPv6 is rendered as dotted
// decimal because ipKeyGenerator only recognizes mapped dotted-decimal
// notation. Returns "" for anything that is not a valid IP.
export function normalizeRateLimitSourceIp(value) {
  const ip = typeof value === "string" ? normalizeIpAddress(value) : "";
  if (!isIP(ip)) return "";
  if (isIP(ip) !== 6) return ip;

  // URL parsing is local: canonicalize legal IPv6 spellings before recognizing
  // mapped IPv4. ipKeyGenerator only recognizes mapped dotted-decimal notation.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
}

function ipv4ToInt(ip) {
  if (isIP(ip) !== 4) {
    return null;
  }
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  return parts.reduce((acc, part) => ((acc << 8) | part) >>> 0, 0);
}

function parseCidrPrefix(value) {
  if (!/^\d+$/.test(value || "")) {
    return null;
  }
  const prefix = Number.parseInt(value, 10);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return null;
  }
  return prefix;
}

function ipv4InCidr(ip, cidr) {
  const cidrParts = cidr.split("/");
  if (cidrParts.length !== 2) {
    return false;
  }
  const [base, prefixText] = cidrParts;
  const prefix = parseCidrPrefix(prefixText);
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null || prefix === null) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isPrivateOrLoopbackIp(value) {
  const ip = normalizeIpAddress(value);
  if (ip === "::1") return true;
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;
  return (
    ipv4InCidr(ip, "127.0.0.0/8") ||
    ipv4InCidr(ip, "10.0.0.0/8") ||
    ipv4InCidr(ip, "172.16.0.0/12") ||
    ipv4InCidr(ip, "192.168.0.0/16")
  );
}

function forwardedForChain(value) {
  const rawValues = Array.isArray(value) ? value : [String(value ?? "")];
  const chain = rawValues
    .flatMap((item) => String(item).split(","))
    .map((item) => normalizeIpAddress(item));

  // Keep malformed claims distinct from a missing header so callers cannot
  // mistake a trusted proxy's address for the originating client address.
  return chain.length > 0 && chain.every((item) => isIP(item)) ? chain : null;
}

function trustedProxyAllowlist(entries = DEFAULT_TRUSTED_PROXY_CIDRS) {
  return createIpAllowlist(entries);
}

export function resolveClientIp(req, { trustedProxyCidrs = DEFAULT_TRUSTED_PROXY_CIDRS } = {}) {
  const directIp = normalizeIpAddress(req.socket?.remoteAddress || "");
  const isTrustedProxy = trustedProxyAllowlist(trustedProxyCidrs);
  if (!isTrustedProxy(directIp)) {
    return directIp;
  }

  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded === undefined) {
    return directIp;
  }
  const chain = forwardedForChain(forwarded);
  if (chain === null) {
    return "";
  }

  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const candidate = chain[index];
    if (!isTrustedProxy(candidate)) {
      return candidate;
    }
  }

  return chain[0];
}

export function createIpAllowlist(entries = DEFAULT_ADMIN_ALLOWED_CIDRS) {
  const rules = entries.map((entry) => String(entry).trim()).filter(Boolean);
  return (value) => {
    const ip = normalizeIpAddress(value);
    if (!isIP(ip)) return false;
    return rules.some((rule) => {
      const cidrParts = rule.split("/");
      if (cidrParts.length === 2 && isIP(cidrParts[0]) === 4) {
        return ipv4InCidr(ip, rule);
      }
      return normalizeIpAddress(rule) === ip;
    });
  };
}
