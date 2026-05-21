function yamlQuote(value) {
  return JSON.stringify(String(value ?? ""));
}

function clashName(server, index) {
  return server.name || `proxy-${index + 1}`;
}

function clashServers(proxyConfig) {
  return (proxyConfig.servers || [])
    .filter((server) => server.host && server.port && server.method && server.password)
    .map((server, index) => ({
      name: clashName(server, index),
      host: server.host,
      port: Number(server.port),
      cipher: server.method,
      password: server.password
    }));
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
    lines.push(
      `  - name: ${yamlQuote(server.name)}`,
      "    type: ss",
      `    server: ${yamlQuote(server.host)}`,
      `    port: ${server.port}`,
      `    cipher: ${yamlQuote(server.cipher)}`,
      `    password: ${yamlQuote(server.password)}`
    );
  }

  lines.push(
    "proxy-groups:",
    "  - name: GLOBAL",
    "    type: select",
    "    proxies:"
  );

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
      type: "ss"
    }))
  };
}
