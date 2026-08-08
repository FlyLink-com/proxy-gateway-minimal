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
  const rawValues = Array.isArray(value) ? value : [String(value || "")];
  return rawValues
    .flatMap((item) => String(item).split(","))
    .map((item) => normalizeIpAddress(item))
    .filter((item) => isIP(item));
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
  const chain = forwardedForChain(forwarded);
  if (chain.length === 0) {
    return directIp;
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
