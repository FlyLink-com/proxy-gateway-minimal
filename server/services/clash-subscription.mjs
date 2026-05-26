function yamlQuote(value) {
  return JSON.stringify(String(value ?? ""));
}

function clashName(server, index) {
  return server.name || `proxy-${index + 1}`;
}

function text(value) {
  return String(value ?? "").trim();
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

function clashProxy(server, index) {
  const protocol = normalizeProtocol(server);
  const base = {
    name: clashName(server, index),
    type: protocol,
    host: requireText(server.host, "server"),
    port: requirePort(server.port)
  };

  if (protocol === "ss") {
    return {
      ...base,
      cipher: requireText(server.method || server.cipher, "cipher"),
      password: requireText(server.password, "password")
    };
  }

  return {
    ...base,
    uuid: requireText(server.uuid, "uuid"),
    udp: bool(server.udp),
    packetEncoding: optionalTextField(server, "packetEncoding", "packet-encoding"),
    tls: server.tls === undefined ? null : bool(server.tls),
    serverName: optionalTextField(server, "serverName", "servername", "sni"),
    network: optionalTextField(server, "network"),
    flow: optionalTextField(server, "flow"),
    clientFingerprint: optionalTextField(server, "clientFingerprint", "client-fingerprint")
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

  lines.push(`    uuid: ${yamlQuote(server.uuid)}`);
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
    lines.push(
      "  - name: AUTO",
      "    type: url-test",
      "    url: \"https://www.gstatic.com/generate_204\"",
      "    interval: 300",
      "    proxies:"
    );

    for (const server of servers) {
      lines.push(`      - ${yamlQuote(server.name)}`);
    }

    lines.push(
      "  - name: FALLBACK",
      "    type: fallback",
      "    url: \"https://www.gstatic.com/generate_204\"",
      "    interval: 300",
      "    proxies:"
    );

    for (const server of servers) {
      lines.push(`      - ${yamlQuote(server.name)}`);
    }
  }

  lines.push(
    "  - name: GLOBAL",
    "    type: select",
    "    proxies:"
  );

  if (servers.length > 0) {
    lines.push("      - AUTO", "      - FALLBACK");
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
