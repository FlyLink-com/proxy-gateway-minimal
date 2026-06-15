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

function captureError(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

const VULTR_MULTICHANNEL_ENV = {
  VULTR_TUIC_HOST: "tuic.example.test",
  VULTR_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
  VULTR_TUIC_PASSWORD: "synthetic-tuic-password",
  VULTR_TUIC_SNI: "tuic.example.test",
  VULTR_VLESS_REALITY_HOST: "vless.example.test",
  VULTR_VLESS_REALITY_UUID: "22222222-2222-4222-8222-222222222222",
  VULTR_VLESS_REALITY_SNI: "www.example.test",
  VULTR_VLESS_REALITY_PUBLIC_KEY: "synthetic-public-key",
  VULTR_VLESS_REALITY_SHORT_ID: "synthetic-short-id",
  VULTR_HY2_HOST: "hy2.example.test",
  VULTR_HY2_PASSWORD: "synthetic-hy2-password",
  VULTR_HY2_SNI: "hy2.example.test",
  SGP_TUIC_STATIC_UUID: "33333333-3333-4333-8333-333333333333",
  SGP_TUIC_STATIC_PASSWORD: "synthetic-sgp-tuic-password",
  SGP_VLESS_STATIC_UUID: "44444444-4444-4444-8444-444444444444",
  SGP_XRAY_VLESS_REALITY_PUBLIC_KEY: "synthetic-sgp-public-key",
  SGP_XRAY_VLESS_REALITY_SHORT_ID: "synthetic-sgp-short-id",
  SGP_HY2_STATIC_PASSWORD: "synthetic-sgp-hy2-password",
};

test("default proxy config is the Vultr multi-channel fallback", () => {
  const configPath = new URL("../../config/proxy-servers.json", import.meta.url);
  const config = loadProxyConfig({
    configPath,
    env: VULTR_MULTICHANNEL_ENV
  });

  assert.deepEqual(config.servers.map((server) => server.name), [
    "channel-vultr-a-vless-reality-tcp",
    "channel-vultr-a-hy2",
    "channel-vultr-a-tuic",
    "channel-sgp-a-vless-reality-tcp",
    "channel-sgp-a-hy2",
    "channel-sgp-a-tuic"
  ]);
  assert.equal(config.servers.some((server) => server.name === "prod-edge-a"), false);
  assert.equal(config.servers.some((server) => server.protocol === "ss"), false);
  assert.match(readFileSync(configPath, "utf8"), /\$\{VULTR_VLESS_REALITY_UUID\}/);
});

test("loadProxyConfig preserves JSON-significant protocol credentials", () => {
  const complexPassword = 'p@ss"with\\\\slashes';
  const config = loadProxyConfig({
    configPath: new URL("../../config/proxy-servers.json", import.meta.url),
    env: {
      ...VULTR_MULTICHANNEL_ENV,
      VULTR_HY2_PASSWORD: complexPassword
    }
  });

  assert.equal(config.servers.find((server) => server.name === "channel-vultr-a-hy2").password, complexPassword);
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

test("loadProxyConfig substitutes runtime endpoint placeholders for host and sni", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "proxy-config-"));

  try {
    const configPath = join(tempDir, "proxy-servers.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          servers: [
            {
              name: "tuic-candidate",
              host: "${TUIC_HOST}",
              port: 443,
              protocol: "tuic",
              uuid: "${TUIC_UUID}",
              password: "${TUIC_PASSWORD}",
              sni: "${TUIC_SNI}",
              note: "literal ${TUIC_HOST} marker"
            }
          ]
        },
        null,
        2
      )
    );

    const config = loadProxyConfig({
      configPath,
      env: {
        TUIC_HOST: "tuic.example.test",
        TUIC_UUID: "22222222-2222-4222-8222-222222222222",
        TUIC_PASSWORD: "tuic-secret",
        TUIC_SNI: "front.example.test"
      }
    });

    assert.equal(config.servers[0].host, "tuic.example.test");
    assert.equal(config.servers[0].sni, "front.example.test");
    assert.equal(config.servers[0].note, "literal ${TUIC_HOST} marker");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadProxyConfig accepts client-facing server as a host alias", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "proxy-config-"));

  try {
    const configPath = join(tempDir, "proxy-servers.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          servers: [
            {
              name: "vless-candidate",
              server: "${VLESS_HOST}",
              port: 8443,
              protocol: "vless",
              uuid: "${VLESS_UUID}",
              tls: true,
              serverName: "www.example.test"
            }
          ]
        },
        null,
        2
      )
    );

    const config = loadProxyConfig({
      configPath,
      env: {
        VLESS_HOST: "vless.example.test",
        VLESS_UUID: "11111111-1111-4111-8111-111111111111"
      }
    });

    assert.equal(config.servers[0].host, "vless.example.test");
    assert.equal(config.servers[0].server, undefined);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadProxyConfig supports protocol-specific channel candidate secrets", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "proxy-config-"));

  try {
    const configPath = join(tempDir, "proxy-servers.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          servers: [
            {
              id: "vless-candidate",
              name: "vless-candidate",
              host: "vless.example.test",
              port: 443,
              protocol: "vless",
              uuid: "${VLESS_UUID}",
              packetEncoding: "xudp",
              tls: true,
              serverName: "front.example.test"
            },
            {
              id: "hy2-candidate",
              name: "hy2-candidate",
              host: "hy2.example.test",
              port: 443,
              protocol: "hysteria2",
              password: "${HY2_PASSWORD}",
              obfsPassword: "${HY2_OBFS_PASSWORD}",
              sni: "front.example.test"
            },
            {
              id: "tuic-candidate",
              name: "tuic-candidate",
              host: "tuic.example.test",
              port: 10443,
              protocol: "tuic",
              uuid: "${TUIC_UUID}",
              password: "${TUIC_PASSWORD}",
              token: "${TUIC_TOKEN}",
              sni: "tuic-front.example.test"
            }
          ]
        },
        null,
        2
      )
    );

    const config = loadProxyConfig({
      configPath,
      env: {
        VLESS_UUID: "11111111-1111-4111-8111-111111111111",
        HY2_PASSWORD: "hy2-secret",
        HY2_OBFS_PASSWORD: "hy2-obfs-secret",
        TUIC_UUID: "22222222-2222-4222-8222-222222222222",
        TUIC_PASSWORD: "tuic-secret",
        TUIC_TOKEN: "tuic-token"
      }
    });

    assert.equal(config.servers[0].uuid, "11111111-1111-4111-8111-111111111111");
    assert.equal(config.servers[1].password, "hy2-secret");
    assert.equal(config.servers[1].obfsPassword, "hy2-obfs-secret");
    assert.equal(config.servers[2].uuid, "22222222-2222-4222-8222-222222222222");
    assert.equal(config.servers[2].password, "tuic-secret");
    assert.equal(config.servers[2].token, "tuic-token");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadProxyConfig rejects unsupported channel candidate protocols", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "proxy-config-"));

  try {
    const configPath = join(tempDir, "proxy-servers.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        servers: [
          {
            name: "bad-candidate",
            host: "bad.example.test",
            port: 443,
            protocol: "vmess",
            password: "${BAD_SECRET}"
          }
        ]
      })
    );

    const error = captureError(() => loadProxyConfig({ configPath, env: { BAD_SECRET: "do-not-leak" } }));
    assert.match(error?.message, /proxy server bad-candidate protocol is unsupported/);
    assert.doesNotMatch(error.message, /do-not-leak/);
    assert.doesNotThrow(() => readFileSync(configPath, "utf8"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadProxyConfig rejects channel candidates missing required credentials", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "proxy-config-"));

  try {
    const configPath = join(tempDir, "proxy-servers.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        servers: [
          {
            name: "vless-candidate",
            host: "vless.example.test",
            port: 443,
            protocol: "vless",
            packetEncoding: "xudp"
          },
          {
            name: "hy2-candidate",
            host: "hy2.example.test",
            port: 443,
            protocol: "hysteria2",
            password: "${HY2_PASSWORD}"
          }
        ]
      })
    );

    const error = captureError(() => loadProxyConfig({ configPath, env: { HY2_PASSWORD: "do-not-leak" } }));
    assert.match(error?.message, /proxy server vless-candidate uuid is required/);
    assert.doesNotMatch(error.message, /do-not-leak/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadProxyConfig rejects invalid channel candidate ports", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "proxy-config-"));

  try {
    const configPath = join(tempDir, "proxy-servers.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        servers: [
          {
            name: "hy2-candidate",
            host: "hy2.example.test",
            port: 70000,
            protocol: "hysteria2",
            password: "${HY2_PASSWORD}"
          }
        ]
      })
    );

    const error = captureError(() => loadProxyConfig({ configPath, env: { HY2_PASSWORD: "do-not-leak" } }));
    assert.match(error?.message, /proxy server hy2-candidate port must be an integer TCP port/);
    assert.doesNotMatch(error.message, /do-not-leak/);
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

test("publicProxyConfig redacts protocol-specific channel candidate secrets", () => {
  const config = {
    servers: [
      {
        name: "vless-candidate",
        host: "vless.example.test",
        port: 443,
        protocol: "vless",
        uuid: "11111111-1111-4111-8111-111111111111"
      },
      {
        name: "hy2-candidate",
        host: "hy2.example.test",
        port: 443,
        protocol: "hysteria2",
        password: "hy2-secret",
        obfsPassword: "hy2-obfs-secret"
      },
      {
        name: "tuic-candidate",
        host: "tuic.example.test",
        port: 10443,
        protocol: "tuic",
        uuid: "22222222-2222-4222-8222-222222222222",
        password: "tuic-secret",
        token: "tuic-token"
      }
    ]
  };

  assert.deepEqual(publicProxyConfig(config), {
    servers: [
      {
        name: "vless-candidate",
        host: "vless.example.test",
        port: 443,
        protocol: "vless"
      },
      {
        name: "hy2-candidate",
        host: "hy2.example.test",
        port: 443,
        protocol: "hysteria2"
      },
      {
        name: "tuic-candidate",
        host: "tuic.example.test",
        port: 10443,
        protocol: "tuic"
      }
    ],
    pingHosts: [],
    nginx: {}
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
