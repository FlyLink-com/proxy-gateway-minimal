import { isIP } from "node:net";

export const DEFAULT_ADMIN_ALLOWED_CIDRS = [
  "127.0.0.1",
  "::1",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16"
];

export function normalizeIpAddress(value) {
  const ip = String(value || "").trim();
  if (ip.startsWith("::ffff:")) {
    return ip.slice("::ffff:".length);
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

export function resolveClientIp(req) {
  const directIp = normalizeIpAddress(req.socket?.remoteAddress || "");
  const forwarded = req.headers?.["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || "").split(",")[0];
  const forwardedIp = normalizeIpAddress(firstForwarded);

  if (forwardedIp && isPrivateOrLoopbackIp(directIp)) {
    return forwardedIp;
  }

  return directIp;
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
