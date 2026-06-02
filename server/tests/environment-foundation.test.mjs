import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readText(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("environment foundation files are tracked in the repository", () => {
  for (const path of [
    "ops/README.md",
    "ops/systemd/proxy-gateway-console.service",
    "ops/systemd/proxy-gateway-ss.service",
    "ops/nginx/proxy-gateway-public.conf",
    "scripts/backup-subscriptions.sh",
    "scripts/restore-subscriptions.sh"
  ]) {
    assert.equal(existsSync(new URL(`../../${path}`, import.meta.url)), true, `${path} should exist`);
  }
});

test(".env.example documents the production subscription runtime settings", () => {
  const envExample = readText(".env.example");
  for (const key of [
    "CONSOLE_PORT",
    "CONSOLE_TOKEN",
    "SS_PASSWORD",
    "SUBSCRIPTION_DB_PATH",
    "SUBSCRIPTION_CONTROL_DB_PATH",
    "HANDOFF_DIR",
    "PUBLIC_SUBSCRIPTION_BASE_URL",
    "ADMIN_ALLOWED_CIDRS",
    "SUB_RATE_LIMIT_WINDOW_MS",
    "SUB_RATE_LIMIT_MAX",
    "SUBSCRIPTION_TEMP_LINK_TTL_MINUTES"
  ]) {
    assert.match(envExample, new RegExp(`^${key}=`, "m"), `${key} should be documented`);
  }
});

test("systemd unit templates pin the app to loopback and restart on failure", () => {
  const consoleUnit = readText("ops/systemd/proxy-gateway-console.service");
  assert.match(consoleUnit, /WorkingDirectory=\/opt\/proxy-gateway-minimal/);
  assert.match(consoleUnit, /EnvironmentFile=\/opt\/proxy-gateway-minimal\/\.env/);
  assert.match(consoleUnit, /ExecStart=\/usr\/bin\/node server\/index\.mjs/);
  assert.match(consoleUnit, /Restart=on-failure/);

  const ssUnit = readText("ops/systemd/proxy-gateway-ss.service");
  assert.match(ssUnit, /EnvironmentFile=\/opt\/proxy-gateway-minimal\/\.env/);
  assert.match(ssUnit, /ExecStart=\/usr\/bin\/ss-server/);
  assert.match(ssUnit, /Restart=on-failure/);
});

test("public Nginx template exposes only health and subscription paths", () => {
  const nginx = readText("ops/nginx/proxy-gateway-public.conf");
  assert.match(nginx, /location = \/api\/health/);
  assert.match(nginx, /location = \/sub\/clash\.yaml/);
  assert.match(nginx, /location \^~ \/api\/admin\/\s*\{\s*return 404;/s);
  assert.match(nginx, /location \/\s*\{\s*return 404;/s);
  assert.match(nginx, /\$request_method \$uri \$server_protocol/);
  assert.doesNotMatch(nginx, /\$request_uri/);
});

test("backup and restore scripts protect the SQLite database boundary", () => {
  const backup = readText("scripts/backup-subscriptions.sh");
  assert.match(backup, /sqlite3 "\$\{DB_PATH\}" "\.backup '\$\{BACKUP_PATH\}'"/);
  assert.match(backup, /chmod 600 "\$\{BACKUP_PATH\}"/);

  const restore = readText("scripts/restore-subscriptions.sh");
  assert.match(restore, /SERVICE_NAME="\$\{SUBSCRIPTION_SERVICE_NAME:-proxy-gateway-console\.service\}"/);
  assert.match(restore, /systemctl stop "\$\{SERVICE_NAME\}"/);
  assert.match(restore, /install -m 600/);
  assert.match(restore, /SUBSCRIPTION_SERVICE_USER/);
  assert.match(restore, /systemctl show -p "\$\{property\}" --value "\$\{SERVICE_NAME\}"/);
  assert.match(restore, /service_property User/);
  assert.match(restore, /service_property Group/);
  assert.doesNotMatch(restore, /chown proxy-gateway:proxy-gateway/);
  assert.match(restore, /systemctl start "\$\{SERVICE_NAME\}"/);
});

test("ops README documents the recoverable runtime boundary", () => {
  const readme = readText("ops/README.md");
  for (const phrase of [
    "Git-tracked application code",
    "subscriptions.sqlite",
    "PUBLIC_SUBSCRIPTION_BASE_URL",
    "proxy-gateway-console.service",
    "proxy-gateway-public.conf",
    "SSH tunnel"
  ]) {
    assert.match(readme, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
