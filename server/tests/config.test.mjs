import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  allowedDiagnosticHosts,
  loadProxyConfig,
  publicProxyConfig
} from "../services/config.mjs";

test("loadProxyConfig substitutes SS_PASSWORD only in memory", () => {
  const configPath = new URL("../../config/proxy-servers.json", import.meta.url);
  const config = loadProxyConfig({
    configPath,
    env: { SS_PASSWORD: "secret-password" }
  });

  assert.equal(config.servers[0].password, "secret-password");
  assert.match(readFileSync(configPath, "utf8"), /\$\{SS_PASSWORD\}/);
});

test("loadProxyConfig preserves JSON-significant password characters", () => {
  const complexPassword = 'p@ss"with\\\\slashes';
  const config = loadProxyConfig({
    configPath: new URL("../../config/proxy-servers.json", import.meta.url),
    env: { SS_PASSWORD: complexPassword }
  });

  assert.equal(config.servers[0].password, complexPassword);
});

test("loadProxyConfig leaves SS_PASSWORD markers literal outside password fields", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "proxy-config-"));

  try {
    const configPath = join(tempDir, "proxy-servers.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          servers: [
            {
              name: "primary",
              host: "203.0.113.10",
              port: 18388,
              method: "aes-256-gcm",
              password: "${SS_PASSWORD}",
              note: "literal ${SS_PASSWORD} marker"
            }
          ]
        },
        null,
        2
      )
    );

    const config = loadProxyConfig({
      configPath,
      env: { SS_PASSWORD: "secret-password" }
    });

    assert.equal(config.servers[0].password, "secret-password");
    assert.equal(config.servers[0].note, "literal ${SS_PASSWORD} marker");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("publicProxyConfig redacts server passwords", () => {
  const config = {
    servers: [
      {
        name: "primary",
        host: "203.0.113.10",
        port: 18388,
        method: "aes-256-gcm",
        password: "secret",
        type: "shadowsocks-rust",
        note: "primary"
      }
    ],
    pingHosts: ["203.0.113.10"],
    nginx: { host: "203.0.113.10", ports: [443] }
  };

  assert.deepEqual(publicProxyConfig(config), {
    servers: [
      {
        name: "primary",
        host: "203.0.113.10",
        port: 18388,
        method: "aes-256-gcm",
        type: "shadowsocks-rust",
        note: "primary"
      }
    ],
    pingHosts: ["203.0.113.10"],
    nginx: { host: "203.0.113.10", ports: [443] }
  });
});

test("publicProxyConfig redacts nested password keys", () => {
  const config = {
    servers: [
      {
        name: "primary",
        host: "203.0.113.10",
        password: "secret"
      }
    ],
    nginx: {
      host: "203.0.113.10",
      password: "nginx-secret",
      upstream: {
        host: "127.0.0.1",
        password: "upstream-secret"
      },
      locations: [
        {
          path: "/health",
          password: "location-secret"
        }
      ]
    }
  };

  assert.deepEqual(publicProxyConfig(config), {
    servers: [
      {
        name: "primary",
        host: "203.0.113.10"
      }
    ],
    pingHosts: [],
    nginx: {
      host: "203.0.113.10",
      upstream: {
        host: "127.0.0.1"
      },
      locations: [
        {
          path: "/health"
        }
      ]
    }
  });
});

test("allowedDiagnosticHosts includes server, nginx, and ping hosts once", () => {
  const config = {
    servers: [{ host: "203.0.113.10" }, { host: "203.0.113.11" }],
    pingHosts: ["203.0.113.10", "198.51.100.8"],
    nginx: { host: "203.0.113.12" }
  };

  assert.deepEqual(allowedDiagnosticHosts(config), [
    "203.0.113.10",
    "203.0.113.11",
    "203.0.113.12",
    "198.51.100.8"
  ]);
});
