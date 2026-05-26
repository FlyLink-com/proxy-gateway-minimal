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

function probeChecks(protocol) {
  const checks = ["clash-render", "tcp-connect", "http-generate-204-through-proxy"];
  if (protocol !== "ss") {
    checks.push("sustained-session");
  }
  return checks;
}

function buildBenchmarkPlan(servers) {
  return {
    mode: "local-dry-run",
    remoteConnections: false,
    metrics: [
      "successRate",
      "timeoutCount",
      "connectTimeMs",
      "timeToFirstByteMs",
      "p50Ms",
      "p95Ms",
      "p99Ms"
    ],
    probes: servers.map((server) => ({
      name: server.name,
      protocol: server.protocol,
      role: server.protocol === "ss" ? "baseline" : "candidate",
      host: server.host,
      port: server.port,
      checks: probeChecks(server.protocol),
      udpProbe: server.protocol !== "ss"
    }))
  };
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
    servers,
    benchmarkPlan: buildBenchmarkPlan(servers)
  };
}
