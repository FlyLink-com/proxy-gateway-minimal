#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  chownSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRuntimeState } from "../server/state.mjs";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const cleanup = args.includes("--cleanup");

function fail(message) {
  const payload = {
    ok: false,
    error: message,
    redacted: true
  };
  if (jsonOutput) {
    console.error(JSON.stringify(payload, null, 2));
  } else {
    console.error(message);
  }
  process.exit(1);
}

function safeSpawn(command, spawnArgs, { required = true } = {}) {
  const result = spawnSync(command, spawnArgs, {
    encoding: "utf8"
  });
  if (required && result.status !== 0) {
    fail(`${command} failed`);
  }
  return result;
}

if (!args.includes("--execute-production-mutation")) {
  fail("--execute-production-mutation is required for install validate-loopback.");
}

if (!args.includes("--synthetic")) {
  fail("--synthetic is required; real data validation is not supported by this command.");
}

const supportedArgs = new Set([
  "--execute-production-mutation",
  "--synthetic",
  "--cleanup",
  "--json"
]);
const unsupported = args.filter((arg) => !supportedArgs.has(arg));
if (unsupported.length > 0) {
  fail("unsupported install validate-loopback argument");
}

if (process.platform !== "linux") {
  fail("install validate-loopback can only run on a Linux server host.");
}

if (typeof process.getuid !== "function" || process.getuid() !== 0) {
  fail("install validate-loopback must run as root via sudo.");
}

const appDir = resolve(process.env.APP_DIR || "/opt/proxy-gateway-minimal");
const envPath = join(appDir, ".env");
const dataDir = join(appDir, ".proxy-gateway");
const configDir = join(appDir, "config");
const proxyConfigPath = join(configDir, "proxy-servers.json");
const ssConfigPath = "/etc/proxy-gateway/ss-server.json";
const artifactPath = join(dataDir, "synthetic-artifact.txt");
const subscriptionDbPath = join(dataDir, "subscriptions.test.sqlite");
const controlDbPath = join(dataDir, "control.test.sqlite");
const marker = "GCCGW_SYNTHETIC_VALIDATION=1";

function idsForServiceUser() {
  const uid = safeSpawn("id", ["-u", "proxy-gateway"]).stdout.trim();
  const gid = safeSpawn("id", ["-g", "proxy-gateway"]).stdout.trim();
  return {
    uid: Number(uid),
    gid: Number(gid)
  };
}

function chownIfPossible(path, uid, gid) {
  try {
    chownSync(path, uid, gid);
  } catch {
    // Some files may not exist yet; the caller validates required files separately.
  }
}

function isSyntheticEnv() {
  return existsSync(envPath) && readFileSync(envPath, "utf8").includes(marker);
}

function cleanupSynthetic() {
  if (existsSync(envPath) && !isSyntheticEnv()) {
    fail("existing .env is not synthetic; cleanup refused");
  }
  safeSpawn("systemctl", ["stop", "proxy-gateway-console.service", "proxy-gateway-ss.service"], { required: false });
  for (const file of [
    envPath,
    artifactPath,
    subscriptionDbPath,
    `${subscriptionDbPath}-wal`,
    `${subscriptionDbPath}-shm`,
    controlDbPath,
    `${controlDbPath}-wal`,
    `${controlDbPath}-shm`
  ]) {
    if (existsSync(file)) {
      rmSync(file, { force: true });
    }
  }
  if (existsSync(ssConfigPath) && readFileSync(ssConfigPath, "utf8").includes("gccgw synthetic validation only")) {
    rmSync(ssConfigPath, { force: true });
  }
}

if (existsSync(envPath) && !isSyntheticEnv()) {
  fail("existing .env is not synthetic; refusing to overwrite");
}

if (cleanup) {
  cleanupSynthetic();
}

const { uid, gid } = idsForServiceUser();
mkdirSync(dataDir, { recursive: true });
mkdirSync(configDir, { recursive: true });
mkdirSync(dirname(ssConfigPath), { recursive: true });
chownIfPossible(dataDir, uid, gid);
chmodSync(dataDir, 0o750);

const syntheticConsoleToken = `synthetic-console-${randomBytes(12).toString("hex")}`;
const syntheticSsPassword = `synthetic-ss-${randomBytes(12).toString("hex")}`;
const syntheticEnv = [
  marker,
  "CONSOLE_PORT=3456",
  `CONSOLE_TOKEN=${syntheticConsoleToken}`,
  `SS_PASSWORD=${syntheticSsPassword}`,
  `SUBSCRIPTION_DB_PATH=${subscriptionDbPath}`,
  `CONTROL_DB_PATH=${controlDbPath}`,
  "PUBLIC_SUBSCRIPTION_BASE_URL=http://127.0.0.1",
  "ADMIN_ALLOWED_CIDRS=127.0.0.1/32",
  "TRUSTED_PROXY_CIDRS=127.0.0.1/32",
  "SUB_RATE_LIMIT_WINDOW_MS=60000",
  "SUB_RATE_LIMIT_MAX=30",
  "SUBSCRIPTION_TEMP_LINK_TTL_MINUTES=1440",
  ""
].join("\n");
writeFileSync(envPath, syntheticEnv, { mode: 0o600 });
chownIfPossible(envPath, uid, gid);

writeFileSync(proxyConfigPath, JSON.stringify({
  servers: [{
    name: "test-edge-a",
    host: "127.0.0.1",
    port: 18388,
    method: "aes-256-gcm",
    password: "${SS_PASSWORD}",
    type: "shadowsocks-libev",
    note: "gccgw synthetic validation only"
  }],
  pingHosts: ["127.0.0.1"],
  nginx: {
    host: "127.0.0.1",
    ports: [80, 18388]
  }
}, null, 2));

writeFileSync(ssConfigPath, JSON.stringify({
  server: "127.0.0.1",
  server_port: 18388,
  password: syntheticSsPassword,
  method: "aes-256-gcm",
  mode: "tcp_and_udp",
  timeout: 300,
  fast_open: false,
  note: "gccgw synthetic validation only"
}, null, 2), { mode: 0o600 });

const syntheticEnvObject = {
  ...process.env,
  CONSOLE_PORT: "3456",
  CONSOLE_TOKEN: syntheticConsoleToken,
  SS_PASSWORD: syntheticSsPassword,
  SUBSCRIPTION_DB_PATH: subscriptionDbPath,
  CONTROL_DB_PATH: controlDbPath,
  PUBLIC_SUBSCRIPTION_BASE_URL: "http://127.0.0.1",
  ADMIN_ALLOWED_CIDRS: "127.0.0.1/32",
  TRUSTED_PROXY_CIDRS: "127.0.0.1/32",
  SUB_RATE_LIMIT_WINDOW_MS: "60000",
  SUB_RATE_LIMIT_MAX: "30",
  SUBSCRIPTION_TEMP_LINK_TTL_MINUTES: "1440"
};

const state = createRuntimeState({
  rootDir: appDir,
  env: syntheticEnvObject
});
let rawArtifact = "";
try {
  const tenant = state.subscriptions.core.createTenant({
    displayName: "synthetic validation tenant",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    nodeId: "test-edge-a",
    note: "synthetic validation only"
  });
  const artifact = state.subscriptions.core.createSubscriptionArtifact(tenant.tenant.id);
  rawArtifact = decodeURIComponent(new URL(artifact.subscriptionUrl).pathname
    .split("/sub/a/")[1]
    .replace(/\.yaml$/i, ""));
  writeFileSync(artifactPath, rawArtifact, { mode: 0o600 });
} finally {
  state.close?.();
}

for (const file of [
  artifactPath,
  subscriptionDbPath,
  `${subscriptionDbPath}-wal`,
  `${subscriptionDbPath}-shm`,
  controlDbPath,
  `${controlDbPath}-wal`,
  `${controlDbPath}-shm`
]) {
  if (existsSync(file)) {
    chownIfPossible(file, uid, gid);
  }
}

safeSpawn("systemctl", ["restart", "proxy-gateway-console.service"]);
safeSpawn("systemctl", ["restart", "proxy-gateway-ss.service"]);
safeSpawn("systemctl", ["restart", "nginx.service"]);

await new Promise((resolveTimer) => setTimeout(resolveTimer, 3000));

async function statusCode(path) {
  const response = await fetch(`http://127.0.0.1${path}`);
  await response.arrayBuffer();
  return response.status;
}

const boundary = {
  health: await statusCode("/api/health"),
  noToken: await statusCode("/sub/clash.yaml"),
  admin: await statusCode("/api/admin/subscriptions"),
  badArtifact: await statusCode("/sub/a/not-a-real-artifact.yaml"),
  validArtifact: await statusCode(`/sub/a/${encodeURIComponent(rawArtifact)}.yaml`),
  provider: await statusCode(`/sub/a/${encodeURIComponent(rawArtifact)}/provider.yaml`),
  profile: await statusCode(`/sub/a/${encodeURIComponent(rawArtifact)}/profile.yaml`)
};
const boundaryOk = boundary.health === 200
  && boundary.noToken === 401
  && boundary.admin === 404
  && boundary.badArtifact === 404
  && boundary.validArtifact === 200
  && boundary.provider === 200
  && boundary.profile === 200;

const summary = {
  ok: boundaryOk,
  type: "gccgw_install_validate_loopback",
  generatedBy: "gccgw install validate-loopback",
  synthetic: true,
  cleanupBeforeRun: cleanup,
  services: {
    console: safeSpawn("systemctl", ["is-active", "proxy-gateway-console.service"], { required: false }).status === 0,
    shadowsocks: safeSpawn("systemctl", ["is-active", "proxy-gateway-ss.service"], { required: false }).status === 0,
    nginx: safeSpawn("systemctl", ["is-active", "nginx.service"], { required: false }).status === 0
  },
  boundary,
  redacted: true
};

console.log(jsonOutput ? JSON.stringify(summary, null, 2) : `${JSON.stringify(summary, null, 2)}\n`);
process.exit(boundaryOk ? 0 : 1);
