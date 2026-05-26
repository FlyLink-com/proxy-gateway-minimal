import { generateClashSubscription } from "./clash-subscription.mjs";
import { loadProxyConfig } from "./config.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function protocolForSummary(server) {
  const raw = text(server.protocol || server.clashType || server.type || "ss").toLowerCase();
  if (raw === "ss" || raw === "shadowsocks" || raw === "shadowsocks-libev" || raw === "shadowsocks-rust") {
    return "ss";
  }
  if (raw === "vless") {
    return "vless";
  }
  if (raw === "hysteria2" || raw === "hy2") {
    return "hysteria2";
  }
  if (raw === "tuic") {
    return "tuic";
  }
  return raw || "unknown";
}

function safeServerSummary(server, index) {
  return {
    name: text(server.name || server.id) || `server-${index + 1}`,
    host: text(server.host),
    port: Number(server.port),
    protocol: protocolForSummary(server)
  };
}

function countProtocols(servers) {
  const counts = {};
  for (const server of servers) {
    counts[server.protocol] = (counts[server.protocol] || 0) + 1;
  }
  return counts;
}

export function dryRunChannelConfig({ configPath, env = process.env }) {
  const proxyConfig = loadProxyConfig({ configPath, env });
  const yaml = generateClashSubscription(proxyConfig);
  const servers = (proxyConfig.servers || []).map(safeServerSummary);

  return {
    ok: true,
    serverCount: servers.length,
    protocolCounts: countProtocols(servers),
    generatedYamlBytes: Buffer.byteLength(yaml, "utf8"),
    servers
  };
}
