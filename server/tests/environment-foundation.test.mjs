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
    "ops/systemd/gccgw-platform-lead-retention.service",
    "ops/systemd/gccgw-platform-lead-retention.timer",
    "ops/nginx/proxy-gateway-public.conf",
    "scripts/backup-subscriptions.sh",
    "scripts/restore-subscriptions.sh",
    "scripts/platform-lead-retention.mjs"
  ]) {
    assert.equal(existsSync(new URL(`../../${path}`, import.meta.url)), true, `${path} should exist`);
  }
});

test(".env.example documents the production subscription runtime settings", () => {
  const envExample = readText(".env.example");
  for (const key of [
    "NODE_ENV",
    "CONSOLE_PORT",
    "CONSOLE_TOKEN",
    "SS_PASSWORD",
    "SUBSCRIPTION_DB_PATH",
    "SUBSCRIPTION_CONTROL_DB_PATH",
    "HANDOFF_DIR",
    "PUBLIC_SUBSCRIPTION_BASE_URL",
    "ADMIN_ALLOWED_CIDRS",
    "TRUSTED_PROXY_CIDRS",
    "EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS",
    "USER_PORTAL_TOTP_SECRET_KEY",
    "SUB_RATE_LIMIT_WINDOW_MS",
    "SUB_RATE_LIMIT_MAX",
    "SUB_CREDENTIAL_RATE_LIMIT_WINDOW_MS",
    "SUB_CREDENTIAL_RATE_LIMIT_MAX",
    "USER_PORTAL_REFRESH_COOLDOWN_MS",
    "SUBSCRIPTION_TEMP_LINK_TTL_MINUTES"
  ]) {
    assert.match(envExample, new RegExp(`^${key}=`, "m"), `${key} should be documented`);
  }
});

test("edge-node env template stays aligned with the root runtime env closure", () => {
  const rootEnv = readText(".env.example");
  const edgeEnv = readText("ops/edge-node/templates/env.example");
  for (const key of [
    "NODE_ENV",
    "CONSOLE_PORT",
    "CONSOLE_TOKEN",
    "SS_PASSWORD",
    "SUBSCRIPTION_DB_PATH",
    "SUBSCRIPTION_CONTROL_DB_PATH",
    "HANDOFF_DIR",
    "PUBLIC_SUBSCRIPTION_BASE_URL",
    "ADMIN_ALLOWED_CIDRS",
    "TRUSTED_PROXY_CIDRS",
    "EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS",
    "USER_PORTAL_TOTP_SECRET_KEY",
    "SUB_RATE_LIMIT_WINDOW_MS",
    "SUB_RATE_LIMIT_MAX",
    "SUB_CREDENTIAL_RATE_LIMIT_WINDOW_MS",
    "SUB_CREDENTIAL_RATE_LIMIT_MAX",
    "USER_PORTAL_REFRESH_COOLDOWN_MS",
    "SUBSCRIPTION_TEMP_LINK_TTL_MINUTES"
  ]) {
    assert.match(rootEnv, new RegExp(`^${key}=`, "m"), `${key} should exist in root .env.example`);
    assert.match(edgeEnv, new RegExp(`^${key}=`, "m"), `${key} should exist in edge env template`);
  }
  assert.doesNotMatch(rootEnv, /^PUBLIC_SUBSCRIPTION_BASE_URL=http:\/\/\d+\.\d+\.\d+\.\d+/m);
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

test("Lead retention systemd templates are inert, hardened, and hourly", () => {
  const service = readText("ops/systemd/gccgw-platform-lead-retention.service");
  const timer = readText("ops/systemd/gccgw-platform-lead-retention.timer");

  assert.match(service, /Type=oneshot/);
  assert.match(service, /User=proxy-gateway/);
  assert.match(service, /Group=proxy-gateway/);
  assert.match(service, /WorkingDirectory=\/opt\/proxy-gateway-minimal-candidate\/current/);
  assert.match(service, /EnvironmentFile=\/opt\/proxy-gateway-minimal-candidate\/\.env/);
  assert.match(service, /ExecStart=\/usr\/bin\/node scripts\/platform-lead-retention\.mjs purge --apply/);
  assert.match(service, /ExecStart=\/usr\/bin\/node scripts\/platform-lead-retention\.mjs prune --backup-dir \/opt\/proxy-gateway-minimal-candidate\/state\/lead-aware-control-backups --apply/);
  assert.match(service, /NoNewPrivileges=true/);
  assert.match(service, /PrivateTmp=true/);
  assert.match(service, /ProtectSystem=strict/);
  assert.match(service, /ProtectHome=true/);
  assert.match(service, /ReadWritePaths=\/opt\/proxy-gateway-minimal-candidate\/state/);
  assert.match(service, /UMask=0077/);
  assert.doesNotMatch(service, /systemctl|proxy-gateway-candidate\.service|\[Install\]/);
  assert.doesNotMatch(service, /ConditionPathIsDirectory/);

  assert.match(timer, /OnCalendar=hourly/);
  assert.match(timer, /Persistent=true/);
  assert.match(timer, /RandomizedDelaySec=5m/);
  assert.match(timer, /AccuracySec=1us/);
  assert.match(timer, /Unit=gccgw-platform-lead-retention\.service/);
  assert.match(timer, /WantedBy=timers\.target/);
});

test("public Nginx template exposes only health and subscription paths", () => {
  const nginx = readText("ops/nginx/proxy-gateway-public.conf");
  assert.match(nginx, /location = \/api\/health/);
  assert.match(nginx, /location = \/sub\/clash\.yaml/);
  assert.match(nginx, /location \^~ \/api\/admin\/\s*\{\s*return 404;/s);
  assert.equal(nginx.includes("location ~ (^|/)\\.(?!well-known(?:/|$)) {"), true);
  assert.match(nginx, /location \^~ \/sub\/a\/\.\s*\{\s*return 404;/s);
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

test("operations docs close Lead retention source without claiming production activation", () => {
  const readme = readText("ops/README.md");
  const schemaGate = readText("docs/LEAD_DURABILITY_SCHEMA_GATE.md");
  const design = readText("docs/superpowers/specs/2026-07-16-lead-retention-operations-design.md");

  for (const phrase of [
    "scripts/platform-lead-retention.mjs purge",
    "scripts/platform-lead-retention.mjs backup",
    "scripts/platform-lead-retention.mjs prune",
    "/opt/proxy-gateway-minimal-candidate/state/lead-aware-control-backups",
    "two-hour safety window",
    "65 minutes",
    "source-only",
    "not installed or enabled"
  ]) {
    assert.match(readme, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  const restoreStart = readme.indexOf("Stop the application service");
  const restorePurge = readme.indexOf("purge --apply", restoreStart);
  const restoreResume = readme.indexOf("Start the application service", restorePurge);
  assert.ok(restoreStart >= 0 && restorePurge > restoreStart && restoreResume > restorePurge);

  assert.match(schemaGate, /source-only retention operations/i);
  assert.match(schemaGate, /not installed or enabled/i);
  assert.match(schemaGate, /two independent exact\s+Risk A Gates/i);
  assert.match(design, /Design state: Reviewed by the Operator/i);
  assert.doesNotMatch(`${readme}\n${schemaGate}\n${design}`, /production timer installed: true/i);
});
