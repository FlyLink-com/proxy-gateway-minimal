// Output labels only. Never use these values as nodeId/channelRef/material keys.
const RESERVED_NAMES = new Set([
  "DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE",
  "GLOBAL", "AUTO", "STABLE", "WEAK-NETWORK", "FALLBACK"
]);

export function proxyDisplayName(server, index) {
  const alias = server.subscriptionDisplayName;
  if (alias !== undefined && alias !== null) {
    if (typeof alias !== "string" || alias.length > 128 ||
        /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(alias)) {
      throw new Error("proxy subscriptionDisplayName is invalid");
    }
    if (alias.trim()) return alias.trim();
  }
  return server.name || `proxy-${index + 1}`;
}

export function validateProxyDisplayNames(servers) {
  const names = servers.map(proxyDisplayName);
  // Leave the legacy, non-alias contract unchanged.
  if (!servers.some(server => typeof server.subscriptionDisplayName === "string" && server.subscriptionDisplayName.trim())) return;
  const seen = new Set();
  for (const name of names) {
    if (RESERVED_NAMES.has(name)) throw new Error("proxy display name is reserved");
    if (seen.has(name)) throw new Error("proxy display names must be unique");
    seen.add(name);
  }
}
