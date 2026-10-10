import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";

import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { runThirdPartySubscriptionRefresh } from "../../scripts/platform-third-party-subscription-refresh.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI_PATH = fileURLToPath(
  new URL("../../scripts/platform-third-party-subscription-refresh.mjs", import.meta.url)
);
const SECRET_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const SOURCE_URL = "https://example.invalid/third-party-source-secret-path";
const FAIL_URL = "https://example.invalid/third-party-source-secret-path-fail";
const SS_HK = "ss://YWVzLTI1Ni1nY206c3ludGhldGljLXBhc3N3b3Jk@203.0.113.10:8388#HK";
const STARTED_AT = "2026-10-10T00:00:00.000Z";
const MATERIAL_MARKERS = [
  SOURCE_URL,
  FAIL_URL,
  "example.invalid",
  "third-party-source-secret-path",
  "synthetic-password",
  "203.0.113.10",
  "YWVzLTI1Ni1nY206c3ludGhldGljLXBhc3N3b3Jk",
  SECRET_KEY
];

function withTempDir(callback) {
  const directory = mkdtempSync(join(tmpdir(), "tp-refresh-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

async function withTempDirAsync(callback) {
  const directory = mkdtempSync(join(tmpdir(), "tp-refresh-"));
  try {
    return await callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

function textResponse(body) {
  const payload = Buffer.from(body);
  return {
    status: 200,
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      }
    })
  };
}

function applySchema(dbPath) {
  applyThirdPartySubscriptionMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM
  });
}

function openStore(dbPath, { fetchFn, nowFn } = {}) {
  return createSqliteThirdPartySubscriptionStore({
    dbPath,
    secretProtector: createPortalTotpSecretProtector({ key: SECRET_KEY }),
    fetchFn,
    resolveFn: async () => ["203.0.113.8"],
    nowFn: nowFn || (() => new Date(STARTED_AT))
  });
}

function seedSources(dbPath, sources, options) {
  const store = openStore(dbPath, options);
  try {
    assert.equal(store.available, true);
    return sources.map((source) => store.createSource(source));
  } finally {
    store.close();
  }
}

function enabledEnv(dbPath, extra = {}) {
  return {
    THIRD_PARTY_SUBSCRIPTION_ENABLED: "true",
    THIRD_PARTY_SUBSCRIPTION_DB_PATH: dbPath,
    THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: SECRET_KEY,
    ...extra
  };
}

function sourceSnapshot(dbPath) {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return {
      sources: database.prepare(`
        select id, enabled, status, last_refresh_at, last_error_code, updated_at
          from platform_third_party_sources
         order by id asc
      `).all(),
      nodes: database.prepare(`
        select source_id, active, protocol, country_code
          from platform_third_party_nodes
         order by source_id asc, country_code asc
      `).all()
    };
  } finally {
    database.close();
  }
}

function assertNoMaterial(value) {
  const text = String(value);
  for (const marker of MATERIAL_MARKERS) {
    assert.equal(text.includes(marker), false);
  }
}

function parseLine(result) {
  assert.match(result.stdout, /^\{.*\}\n$/);
  assert.equal(result.stdout.trim().split("\n").length, 1);
  return JSON.parse(result.stdout);
}

function runCli(args, env) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      THIRD_PARTY_SUBSCRIPTION_ENABLED: "",
      THIRD_PARTY_SUBSCRIPTION_DB_PATH: "",
      THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: "",
      THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS: "",
      ...env
    },
    encoding: "utf8"
  });
}

test("disabled flag does not open the database or the network", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "not-created.sqlite");
    let opened = 0;
    let networked = 0;
    const probes = [undefined, "", "false", "0", "no", "off"];
    for (const flag of probes) {
      const result = await runThirdPartySubscriptionRefresh({
        args: ["--apply"],
        env: {
          THIRD_PARTY_SUBSCRIPTION_ENABLED: flag,
          THIRD_PARTY_SUBSCRIPTION_DB_PATH: dbPath,
          THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: SECRET_KEY,
          THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS: "not-a-number"
        },
        fetchFn: async () => {
          networked += 1;
          throw new Error("network");
        },
        resolveFn: async () => {
          networked += 1;
          return ["203.0.113.8"];
        },
        openStore: () => {
          opened += 1;
          throw new Error("db");
        }
      });
      assert.equal(result.exitCode, 0);
      assert.equal(result.stderr, "");
      const body = parseLine(result);
      assert.equal(body.status, "disabled");
      assert.equal(body.mode, "apply");
      assert.equal(body.sources.total, 0);
      assertNoMaterial(result.stdout);
    }
    assert.equal(opened, 0);
    assert.equal(networked, 0);
    assert.equal(existsSync(dbPath), false);

    const spawned = runCli(["--apply"], {
      THIRD_PARTY_SUBSCRIPTION_ENABLED: "false",
      THIRD_PARTY_SUBSCRIPTION_DB_PATH: dbPath,
      THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: SECRET_KEY
    });
    assert.equal(spawned.status, 0);
    assert.equal(JSON.parse(spawned.stdout).status, "disabled");
    assert.equal(spawned.stderr, "");
    assert.equal(existsSync(dbPath), false);
    assertNoMaterial(`${spawned.stdout}${spawned.stderr}`);
  });
});

test("invalid arguments and a bad min interval fail closed before any fetch", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "unused.sqlite");
    let opened = 0;
    const result = await runThirdPartySubscriptionRefresh({
      args: ["--apply", "--extra"],
      env: enabledEnv(dbPath),
      fetchFn: async () => {
        throw new Error("network");
      },
      openStore: () => {
        opened += 1;
        throw new Error("db");
      }
    });
    assert.equal(result.exitCode, 64);
    assert.equal(parseLine(result).reason, "invalid_command_contract");
    assert.equal(opened, 0);
    assert.equal(existsSync(dbPath), false);

    const interval = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: enabledEnv(dbPath, {
        THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS: "6h"
      }),
      openStore: () => {
        opened += 1;
        throw new Error("db");
      }
    });
    assert.equal(interval.exitCode, 64);
    assert.equal(parseLine(interval).reason, "invalid_min_interval");
    assert.equal(opened, 0);

    const spawned = runCli(["--refresh"], {
      THIRD_PARTY_SUBSCRIPTION_ENABLED: "true",
      THIRD_PARTY_SUBSCRIPTION_DB_PATH: dbPath,
      THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: SECRET_KEY
    });
    assert.equal(spawned.status, 64);
    assert.equal(JSON.parse(spawned.stdout).reason, "invalid_command_contract");
    assert.equal(existsSync(dbPath), false);
  });
});

test("missing schema or secret fails closed without fetching", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "empty.sqlite");
    const database = new Database(dbPath);
    database.close();
    let fetched = 0;
    const absent = await runThirdPartySubscriptionRefresh({
      args: [],
      env: enabledEnv(dbPath),
      fetchFn: async () => {
        fetched += 1;
        return textResponse(SS_HK);
      },
      resolveFn: async () => {
        fetched += 1;
        return ["203.0.113.8"];
      }
    });
    assert.equal(absent.exitCode, 20);
    assert.equal(parseLine(absent).reason, "schema_absent");
    assert.equal(absent.stderr, "");
    assert.equal(fetched, 0);

    let opened = 0;
    const missingKey = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: {
        THIRD_PARTY_SUBSCRIPTION_ENABLED: "true",
        THIRD_PARTY_SUBSCRIPTION_DB_PATH: dbPath,
        THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: ""
      },
      openStore: () => {
        opened += 1;
        throw new Error("db");
      },
      fetchFn: async () => {
        fetched += 1;
        return textResponse(SS_HK);
      }
    });
    assert.equal(missingKey.exitCode, 20);
    assert.equal(parseLine(missingKey).reason, "missing_secret_key");
    assert.equal(opened, 0);
    assert.equal(fetched, 0);

    const badKey = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: enabledEnv(dbPath, { THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: "not-a-key" }),
      openStore: () => {
        opened += 1;
        throw new Error("db");
      }
    });
    assert.equal(badKey.exitCode, 20);
    assert.equal(parseLine(badKey).reason, "invalid_secret_key");
    assert.equal(opened, 0);
    assertNoMaterial(`${absent.stdout}${missingKey.stdout}${badKey.stdout}`);
  });
});

test("dry-run counts due sources and does not fetch or change rows", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "third-party.sqlite");
    applySchema(dbPath);
    seedSources(dbPath, [
      { name: "synthetic-on", subscriptionUrl: SOURCE_URL, tiers: ["monthly_basic"], enabled: true },
      { name: "synthetic-off", subscriptionUrl: FAIL_URL, tiers: ["yearly"], enabled: false }
    ]);
    const before = sourceSnapshot(dbPath);
    let fetched = 0;
    const result = await runThirdPartySubscriptionRefresh({
      args: [],
      env: enabledEnv(dbPath),
      nowFn: () => new Date(STARTED_AT),
      fetchFn: async () => {
        fetched += 1;
        return textResponse(SS_HK);
      },
      resolveFn: async () => {
        fetched += 1;
        return ["203.0.113.8"];
      }
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    const body = parseLine(result);
    assert.equal(body.status, "planned");
    assert.equal(body.mode, "dry-run");
    assert.equal(body.reason, "dry_run");
    assert.equal(body.sources.total, 2);
    assert.equal(body.sources.due, 1);
    assert.equal(body.sources.refreshed, 0);
    assert.equal(body.sources.failed, 0);
    assert.equal(body.sources.skipped, 0);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].status, "would_refresh");
    assert.equal(fetched, 0);
    assert.deepEqual(sourceSnapshot(dbPath), before);
    assertNoMaterial(result.stdout);

    const spawned = runCli([], enabledEnv(dbPath));
    assert.equal(spawned.status, 0);
    const spawnedBody = JSON.parse(spawned.stdout);
    assert.equal(spawnedBody.status, "planned");
    assert.equal(spawnedBody.sources.due, 1);
    assert.equal(spawned.stderr, "");
    assert.deepEqual(sourceSnapshot(dbPath), before);
    assertNoMaterial(`${spawned.stdout}${spawned.stderr}`);
  });
});

test("apply refreshes an enabled source and the JSON line has no url or credential", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "third-party.sqlite");
    applySchema(dbPath);
    const [created] = seedSources(dbPath, [
      { name: "synthetic-on", subscriptionUrl: SOURCE_URL, tiers: ["monthly_basic"] }
    ]);
    let fetched = 0;
    const result = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: enabledEnv(dbPath),
      nowFn: () => new Date(STARTED_AT),
      fetchFn: async () => {
        fetched += 1;
        return textResponse(SS_HK);
      },
      resolveFn: async () => ["203.0.113.8"]
    });
    assert.equal(fetched, 1);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    const body = parseLine(result);
    assert.equal(body.status, "completed");
    assert.equal(body.sources.total, 1);
    assert.equal(body.sources.refreshed, 1);
    assert.equal(body.sources.failed, 0);
    assert.deepEqual(body.items, [{ id: created.id, status: "refreshed" }]);
    assertNoMaterial(`${result.stdout}${result.stderr}`);
    const after = sourceSnapshot(dbPath);
    assert.equal(after.sources[0].status, "ready");
    assert.equal(after.sources[0].last_refresh_at, STARTED_AT);
    assert.equal(after.nodes.length, 1);
    assert.equal(after.nodes[0].active, 1);
    assert.equal(after.nodes[0].country_code, "HK");
  });
});

test("a failed source keeps last-good nodes, exits non-zero, and alerts without a url", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "third-party.sqlite");
    applySchema(dbPath);
    const created = seedSources(dbPath, [
      { name: "synthetic-keep", subscriptionUrl: SOURCE_URL, tiers: ["monthly_plus"] },
      { name: "synthetic-fail", subscriptionUrl: FAIL_URL, tiers: ["yearly"] }
    ]);
    const first = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: enabledEnv(dbPath, { THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS: "0" }),
      nowFn: () => new Date(STARTED_AT),
      fetchFn: async () => textResponse(SS_HK),
      resolveFn: async () => ["203.0.113.8"]
    });
    assert.equal(first.exitCode, 0);
    assert.equal(sourceSnapshot(dbPath).nodes.length, 2);

    let fetched = 0;
    const second = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: enabledEnv(dbPath, { THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS: "0" }),
      nowFn: () => new Date("2026-10-10T06:00:00.000Z"),
      fetchFn: async (url) => {
        fetched += 1;
        if (String(url).includes("secret-path-fail")) {
          throw new Error("upstream down");
        }
        return textResponse(SS_HK);
      },
      resolveFn: async () => ["203.0.113.8"]
    });
    assert.equal(fetched, 2);
    assert.equal(second.exitCode, 30);
    assert.equal(second.stderr, "third_party_refresh_failed count=1\n");
    const body = parseLine(second);
    assert.equal(body.status, "refresh_failed");
    assert.equal(body.reason, "source_refresh_failed");
    assert.equal(body.sources.refreshed, 1);
    assert.equal(body.sources.failed, 1);
    const failedItem = body.items.find((item) => item.id === created[1].id);
    const keptItem = body.items.find((item) => item.id === created[0].id);
    assert.equal(failedItem.status, "fetch_failed");
    assert.equal(keptItem.status, "refreshed");
    assertNoMaterial(`${second.stdout}${second.stderr}`);
    const nodes = sourceSnapshot(dbPath).nodes;
    assert.equal(nodes.length, 2);
    assert.equal(nodes.every((node) => node.active === 1), true);
  });
});

test("min interval skips a source refreshed inside the window", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "third-party.sqlite");
    applySchema(dbPath);
    seedSources(dbPath, [
      { name: "synthetic-on", subscriptionUrl: SOURCE_URL, tiers: ["yearly"] }
    ]);
    const first = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: enabledEnv(dbPath),
      nowFn: () => new Date(STARTED_AT),
      fetchFn: async () => textResponse(SS_HK),
      resolveFn: async () => ["203.0.113.8"]
    });
    assert.equal(first.exitCode, 0);
    const before = sourceSnapshot(dbPath);

    let fetched = 0;
    const skipped = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: enabledEnv(dbPath),
      nowFn: () => new Date("2026-10-10T01:00:00.000Z"),
      fetchFn: async () => {
        fetched += 1;
        throw new Error("should not fetch");
      },
      resolveFn: async () => {
        fetched += 1;
        return ["203.0.113.8"];
      }
    });
    assert.equal(fetched, 0);
    assert.equal(skipped.exitCode, 0);
    assert.equal(skipped.stderr, "");
    const body = parseLine(skipped);
    assert.equal(body.status, "completed");
    assert.equal(body.sources.due, 0);
    assert.equal(body.sources.refreshed, 0);
    assert.equal(body.sources.skipped, 1);
    assert.equal(body.items[0].status, "skipped_min_interval");
    assert.deepEqual(sourceSnapshot(dbPath), before);
    assertNoMaterial(skipped.stdout);

    const due = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: enabledEnv(dbPath),
      nowFn: () => new Date("2026-10-10T06:00:00.000Z"),
      fetchFn: async () => {
        fetched += 1;
        return textResponse(SS_HK);
      },
      resolveFn: async () => ["203.0.113.8"]
    });
    assert.equal(fetched, 1);
    assert.equal(due.exitCode, 0);
    assert.equal(parseLine(due).sources.refreshed, 1);
    assert.equal(sourceSnapshot(dbPath).sources[0].last_refresh_at, "2026-10-10T06:00:00.000Z");
  });
});

test("systemd unit files and the npm script point at the refresh command", () => {
  const service = readFileSync(
    join(REPOSITORY_ROOT, "ops/systemd/gccgw-platform-third-party-subscription-refresh.service"),
    "utf8"
  );
  const timer = readFileSync(
    join(REPOSITORY_ROOT, "ops/systemd/gccgw-platform-third-party-subscription-refresh.timer"),
    "utf8"
  );
  for (const line of [
    "Type=oneshot",
    "User=proxy-gateway",
    "Group=proxy-gateway",
    "UMask=0077",
    "WorkingDirectory=/opt/proxy-gateway-minimal-candidate/current",
    "EnvironmentFile=/opt/proxy-gateway-minimal-candidate/.env",
    "ExecStart=/usr/bin/node scripts/platform-third-party-subscription-refresh.mjs --apply",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "PrivateDevices=true",
    "ProtectSystem=strict",
    "ProtectHome=true",
    "ProtectKernelTunables=true",
    "ProtectKernelModules=true",
    "ProtectControlGroups=true",
    "LockPersonality=true",
    "RestrictSUIDSGID=true",
    "ReadWritePaths=/opt/proxy-gateway-minimal-candidate/state"
  ]) {
    assert.equal(service.includes(line), true, line);
  }
  assert.equal(service.includes("[Install]"), false);
  assert.match(service, /not installed or enabled/);

  for (const line of [
    "OnUnitActiveSec=6h",
    "OnBootSec=15min",
    "RandomizedDelaySec=10m",
    "Persistent=true",
    "AccuracySec=1us",
    "Unit=gccgw-platform-third-party-subscription-refresh.service",
    "WantedBy=timers.target"
  ]) {
    assert.equal(timer.includes(line), true, line);
  }
  assert.match(timer, /6h \(OnUnitActiveSec\) is the initial interval/);
  assert.match(timer, /drop-in override/);
  assert.match(timer, /not installed or enabled/);
  assert.equal(timer.includes("example.invalid"), false);

  const packageJson = JSON.parse(readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["platform:third-party-subscription:refresh"],
    "node scripts/platform-third-party-subscription-refresh.mjs"
  );
  assert.equal(existsSync(CLI_PATH), true);
});
