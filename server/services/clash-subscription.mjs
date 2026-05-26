function yamlQuote(value) {
  return JSON.stringify(String(value ?? ""));
}

function clashName(server, index) {
  return server.name || `proxy-${index + 1}`;
}

function text(value) {
  return String(value ?? "").trim();
}

function metadataToken(value) {
  return text(value).toLowerCase().replace(/[\s_]+/g, "-");
}

function bool(value) {
  return value === true || value === "true";
}

function normalizeProtocol(server) {
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
  throw new Error(`unsupported Clash proxy protocol: ${raw || "[blank]"}`);
}

function requireText(value, fieldName) {
  const normalized = text(value);
  if (!normalized) {
    throw new Error(`Clash proxy ${fieldName} is required`);
  }
  return normalized;
}

function requirePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Clash proxy port must be an integer TCP port");
  }
  return port;
}

function optionalTextField(server, ...keys) {
  for (const key of keys) {
    const value = text(server[key]);
    if (value) return value;
  }
  return "";
}

function optionalRawField(server, ...keys) {
  for (const key of keys) {
    if (server[key] !== undefined && server[key] !== null && String(server[key]).trim() !== "") {
      return server[key];
    }
  }
  return null;
}

function optionalBoolField(server, ...keys) {
  for (const key of keys) {
    if (server[key] !== undefined && server[key] !== null) {
      return bool(server[key]);
    }
  }
  return null;
}

function optionalStringListField(server, ...keys) {
  for (const key of keys) {
    const value = server[key];
    if (Array.isArray(value)) {
      return value.map((entry) => text(entry)).filter(Boolean);
    }
    const normalized = text(value);
    if (normalized) {
      return [normalized];
    }
  }
  return [];
}

function clashProxy(server, index) {
  const protocol = normalizeProtocol(server);
  const base = {
    name: clashName(server, index),
    type: protocol,
    host: requireText(server.host, "server"),
    port: requirePort(server.port),
    qualityClass: metadataToken(server.qualityClass || server.quality || server.channelQuality),
    channelRole: metadataToken(server.channelRole || server.role)
  };

  if (protocol === "ss") {
    return {
      ...base,
      cipher: requireText(server.method || server.cipher, "cipher"),
      password: requireText(server.password, "password")
    };
  }

  if (protocol === "vless") {
    return {
      ...base,
      uuid: requireText(server.uuid, "uuid"),
      udp: bool(server.udp),
      packetEncoding: optionalTextField(server, "packetEncoding", "packet-encoding"),
      tls: optionalBoolField(server, "tls"),
      serverName: optionalTextField(server, "serverName", "servername", "sni"),
      network: optionalTextField(server, "network"),
      flow: optionalTextField(server, "flow"),
      clientFingerprint: optionalTextField(server, "clientFingerprint", "client-fingerprint")
    };
  }

  if (protocol === "hysteria2") {
    return {
      ...base,
      password: requireText(server.password, "password"),
      ports: optionalTextField(server, "ports"),
      hopInterval: optionalRawField(server, "hopInterval", "hop-interval"),
      up: optionalTextField(server, "up"),
      down: optionalTextField(server, "down"),
      obfs: optionalTextField(server, "obfs"),
      obfsPassword: optionalTextField(server, "obfsPassword", "obfs-password"),
      sni: optionalTextField(server, "sni", "servername", "serverName"),
      skipCertVerify: optionalBoolField(server, "skipCertVerify", "skip-cert-verify"),
      fingerprint: optionalTextField(server, "fingerprint"),
      alpn: optionalStringListField(server, "alpn"),
      bbrProfile: optionalTextField(server, "bbrProfile", "bbr-profile")
    };
  }

  return {
    ...base,
    uuid: requireText(server.uuid, "uuid"),
    password: requireText(server.password, "password"),
    token: optionalTextField(server, "token"),
    udpRelayMode: optionalTextField(server, "udpRelayMode", "udp-relay-mode"),
    congestionController: optionalTextField(server, "congestionController", "congestion-controller"),
    bbrProfile: optionalTextField(server, "bbrProfile", "bbr-profile"),
    sni: optionalTextField(server, "sni", "servername", "serverName"),
    alpn: optionalStringListField(server, "alpn"),
    disableSni: optionalBoolField(server, "disableSni", "disable-sni"),
    reduceRtt: optionalBoolField(server, "reduceRtt", "reduce-rtt"),
    requestTimeout: optionalRawField(server, "requestTimeout", "request-timeout"),
    maxUdpRelayPacketSize: optionalRawField(server, "maxUdpRelayPacketSize", "max-udp-relay-packet-size"),
    fastOpen: optionalBoolField(server, "fastOpen", "fast-open"),
    skipCertVerify: optionalBoolField(server, "skipCertVerify", "skip-cert-verify"),
    maxOpenStreams: optionalRawField(server, "maxOpenStreams", "max-open-streams")
  };
}

function clashServers(proxyConfig) {
  return (proxyConfig.servers || [])
    .filter((server) => server.host && server.port)
    .map(clashProxy);
}

function pushOptionalText(lines, key, value) {
  if (value) {
    lines.push(`    ${key}: ${yamlQuote(value)}`);
  }
}

function pushOptionalBool(lines, key, value) {
  if (value !== null && value !== undefined) {
    lines.push(`    ${key}: ${value ? "true" : "false"}`);
  }
}

function pushOptionalRaw(lines, key, value) {
  if (value !== null && value !== undefined) {
    lines.push(`    ${key}: ${value}`);
  }
}

function pushOptionalStringList(lines, key, values) {
  if (!Array.isArray(values) || values.length === 0) {
    return;
  }
  lines.push(`    ${key}:`);
  for (const value of values) {
    lines.push(`      - ${yamlQuote(value)}`);
  }
}

function pushProxyGroup(lines, { name, type, servers, tolerance }) {
  if (!Array.isArray(servers) || servers.length === 0) {
    return false;
  }

  lines.push(
    `  - name: ${name}`,
    `    type: ${type}`,
    "    url: \"https://www.gstatic.com/generate_204\"",
    "    interval: 300"
  );
  if (tolerance !== undefined) {
    lines.push(`    tolerance: ${tolerance}`);
  }
  lines.push("    proxies:");

  for (const server of servers) {
    lines.push(`      - ${yamlQuote(server.name)}`);
  }

  return true;
}

function qualityGroupServers(servers, qualityClasses) {
  const allowed = new Set(qualityClasses);
  return servers.filter((server) => allowed.has(server.qualityClass));
}

function pushProxy(lines, server) {
  lines.push(
    `  - name: ${yamlQuote(server.name)}`,
    `    type: ${server.type}`,
    `    server: ${yamlQuote(server.host)}`,
    `    port: ${server.port}`
  );

  if (server.type === "ss") {
    lines.push(
      `    cipher: ${yamlQuote(server.cipher)}`,
      `    password: ${yamlQuote(server.password)}`
    );
    return;
  }

  if (server.type === "hysteria2") {
    lines.push(`    password: ${yamlQuote(server.password)}`);
    pushOptionalText(lines, "ports", server.ports);
    pushOptionalRaw(lines, "hop-interval", server.hopInterval);
    pushOptionalText(lines, "up", server.up);
    pushOptionalText(lines, "down", server.down);
    pushOptionalText(lines, "obfs", server.obfs);
    pushOptionalText(lines, "obfs-password", server.obfsPassword);
    pushOptionalText(lines, "sni", server.sni);
    pushOptionalBool(lines, "skip-cert-verify", server.skipCertVerify);
    pushOptionalText(lines, "fingerprint", server.fingerprint);
    pushOptionalStringList(lines, "alpn", server.alpn);
    pushOptionalText(lines, "bbr-profile", server.bbrProfile);
    return;
  }

  lines.push(`    uuid: ${yamlQuote(server.uuid)}`);
  if (server.type === "tuic") {
    lines.push(`    password: ${yamlQuote(server.password)}`);
    pushOptionalText(lines, "token", server.token);
    pushOptionalText(lines, "udp-relay-mode", server.udpRelayMode);
    pushOptionalText(lines, "congestion-controller", server.congestionController);
    pushOptionalText(lines, "bbr-profile", server.bbrProfile);
    pushOptionalText(lines, "sni", server.sni);
    pushOptionalStringList(lines, "alpn", server.alpn);
    pushOptionalBool(lines, "disable-sni", server.disableSni);
    pushOptionalBool(lines, "reduce-rtt", server.reduceRtt);
    pushOptionalRaw(lines, "request-timeout", server.requestTimeout);
    pushOptionalRaw(lines, "max-udp-relay-packet-size", server.maxUdpRelayPacketSize);
    pushOptionalBool(lines, "fast-open", server.fastOpen);
    pushOptionalBool(lines, "skip-cert-verify", server.skipCertVerify);
    pushOptionalRaw(lines, "max-open-streams", server.maxOpenStreams);
    return;
  }

  pushOptionalBool(lines, "udp", server.udp);
  pushOptionalText(lines, "packet-encoding", server.packetEncoding);
  pushOptionalBool(lines, "tls", server.tls);
  pushOptionalText(lines, "servername", server.serverName);
  pushOptionalText(lines, "network", server.network);
  pushOptionalText(lines, "flow", server.flow);
  pushOptionalText(lines, "client-fingerprint", server.clientFingerprint);
}

export function generateClashSubscription(proxyConfig) {
  const servers = clashServers(proxyConfig);
  const lines = [
    "mixed-port: 7897",
    "allow-lan: false",
    "mode: global",
    "proxies:"
  ];

  for (const server of servers) {
    pushProxy(lines, server);
  }

  lines.push("proxy-groups:");

  if (servers.length > 0) {
    pushProxyGroup(lines, { name: "AUTO", type: "url-test", servers });
    pushProxyGroup(lines, {
      name: "WEAK-NETWORK",
      type: "url-test",
      servers: qualityGroupServers(servers, ["weak-network", "long-haul", "high-loss"]),
      tolerance: 50
    });
    pushProxyGroup(lines, {
      name: "STABLE",
      type: "fallback",
      servers: qualityGroupServers(servers, ["stable"])
    });
    pushProxyGroup(lines, { name: "FALLBACK", type: "fallback", servers });
  }

  lines.push(
    "  - name: GLOBAL",
    "    type: select",
    "    proxies:"
  );

  if (servers.length > 0) {
    lines.push("      - AUTO");
    if (qualityGroupServers(servers, ["weak-network", "long-haul", "high-loss"]).length > 0) {
      lines.push("      - WEAK-NETWORK");
    }
    if (qualityGroupServers(servers, ["stable"]).length > 0) {
      lines.push("      - STABLE");
    }
    lines.push("      - FALLBACK");
  }

  for (const server of servers) {
    lines.push(`      - ${yamlQuote(server.name)}`);
  }

  lines.push(
    "      - DIRECT",
    "rules:",
    "  - MATCH,GLOBAL",
    ""
  );

  return lines.join("\n");
}

export function subscriptionSummary({
  proxyConfig,
  host,
  consolePort,
  consoleToken
}) {
  const servers = clashServers(proxyConfig);
  const token = encodeURIComponent(consoleToken);

  return {
    ok: true,
    profileName: "Proxy Gateway Local",
    serverCount: servers.length,
    subscriptionUrl: `http://${host}:${consolePort}/sub/clash.yaml?token=${token}`,
    servers: servers.map((server) => ({
      name: server.name,
      host: server.host,
      port: server.port,
      type: server.type
    }))
  };
}
