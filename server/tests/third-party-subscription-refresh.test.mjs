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
const INLINE_YAML = [
  "proxies:",
  "  - name: HK",
  "    type: ss",
  "    server: 203.0.113.10",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  "    password: synthetic-password"
].join("\n");
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
    fetchFn: fetchFn || (async () => {
      throw new Error("network");
    }),
    resolveFn: async () => {
      throw new Error("dns");
    },
    nowFn: nowFn || (() => new Date(STARTED_AT))
  });
}

function seedInline(dbPath, sources) {
  const store = openStore(dbPath);
  try {
    assert.equal(store.available, true);
    return sources.map((source) => store.createInlineSource({
      yamlContent: INLINE_YAML,
      ...source
    }));
  } finally {
    store.close();
  }
}

function insertLegacyRemote(dbPath, {
  id = `tpsrc_${"11".repeat(16)}`,
  url = SOURCE_URL,
  enabled = 1,
  planId = "yearly",
  lastRefreshAt = null
} = {}) {
  const database = new Database(dbPath);
  const protector = createPortalTotpSecretProtector({ key: SECRET_KEY });
  const at = STARTED_AT;
  const dedupKey = "22".repeat(32);
  database.prepare(`
    insert into platform_third_party_sources (
      id, name, protected_url, region_override, enabled, status,
      last_refresh_at, last_error_code, created_at, updated_at
    ) values (?, 'legacy-remote', ?, null, ?, 'ready', ?, null, ?, ?)
  `).run(id, protector.protect(url), enabled, lastRefreshAt, at, at);
  database.prepare(
    "insert into platform_third_party_source_tiers (source_id, plan_id) values (?, ?)"
  ).run(id, planId);
  database.prepare(`
    insert into platform_third_party_nodes (
      id, source_id, fingerprint, display_name, country_code, region,
      protocol, protected_config, last_seen_at, active
    ) values (?, ?, ?, 'HK', 'HK', 'HK', 'ss', ?, ?, 1)
  `).run(
    `tpnode_${"33".repeat(16)}`,
    id,
    dedupKey,
    protector.protect(JSON.stringify({
      protocol: "ss",
      host: "203.0.113.10",
      port: 8388,
      cipher: "aes-256-gcm",
      password: "synthetic-password",
      name: "HK",
      displayName: "HK",
      countryCode: "HK",
      region: "HK",
      dedupKey
    })),
    at
  );
  database.close();
  return id;
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
      args: [],
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
      args: [],
      env: enabledEnv(dbPath, { THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: "not-a-key" }),
      openStore: () => {
        opened += 1;
        throw new Error("db");
      }
    });
    assert.equal(badKey.exitCode, 20);
    assert.equal(parseLine(badKey).reason, "invalid_secret_key");
    assert.equal(opened, 0);

    const blockedApply = await runThirdPartySubscriptionRefresh({
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
    assert.equal(blockedApply.exitCode, 20);
    assert.equal(parseLine(blockedApply).reason, "remote_refresh_disabled");
    assert.equal(opened, 0);
    assert.equal(fetched, 0);
    assertNoMaterial(`${absent.stdout}${missingKey.stdout}${badKey.stdout}${blockedApply.stdout}`);
  });
});

test("dry-run counts due sources and does not fetch or change rows", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "third-party.sqlite");
    applySchema(dbPath);
    const [inline] = seedInline(dbPath, [
      { name: "synthetic-on", tiers: ["monthly_basic"], enabled: true },
      { name: "synthetic-off", tiers: ["yearly"], enabled: false }
    ]);
    const legacyId = insertLegacyRemote(dbPath);
    const database = new Database(dbPath);
    database.prepare("update platform_third_party_sources set last_refresh_at = null where id = ?")
      .run(inline.id);
    database.close();
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
    assert.equal(body.sources.total, 3);
    assert.equal(body.sources.due, 1);
    assert.equal(body.sources.refreshed, 0);
    assert.equal(body.sources.failed, 0);
    assert.equal(body.sources.skipped, 0);
    assert.equal(body.items.find((item) => item.id === inline.id).status, "skipped_inline");
    assert.equal(body.items.find((item) => item.id === legacyId).status, "would_refresh");
    assert.equal(body.items.some((item) => item.id === inline.id && item.status === "would_refresh"), false);
    assert.equal(fetched, 0);
    assert.deepEqual(sourceSnapshot(dbPath), before);
    assertNoMaterial(result.stdout);

    const spawned = runCli([], enabledEnv(dbPath));
    assert.equal(spawned.status, 0);
    const spawnedBody = JSON.parse(spawned.stdout);
    assert.equal(spawnedBody.status, "planned");
    assert.equal(spawnedBody.sources.due, 1);
    assert.equal(spawnedBody.items.find((item) => item.id === inline.id).status, "skipped_inline");
    assert.equal(spawned.stderr, "");
    assert.deepEqual(sourceSnapshot(dbPath), before);
    assertNoMaterial(`${spawned.stdout}${spawned.stderr}`);
  });
});

test("apply is blocked before store or secret access and does not change rows", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "third-party.sqlite");
    applySchema(dbPath);
    const [inline] = seedInline(dbPath, [
      { name: "synthetic-on", tiers: ["monthly_basic"], enabled: true }
    ]);
    insertLegacyRemote(dbPath, { lastRefreshAt: "2026-10-09T00:00:00.000Z" });
    const before = sourceSnapshot(dbPath);
    const secretReads = [];
    const env = new Proxy({
      THIRD_PARTY_SUBSCRIPTION_ENABLED: "true",
      THIRD_PARTY_SUBSCRIPTION_DB_PATH: dbPath,
      THIRD_PARTY_SUBSCRIPTION_SECRET_KEY: SECRET_KEY,
      THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS: "0"
    }, {
      get(target, prop, receiver) {
        if (prop === "THIRD_PARTY_SUBSCRIPTION_SECRET_KEY" || prop === "THIRD_PARTY_SUBSCRIPTION_DB_PATH") {
          secretReads.push(String(prop));
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    let opened = 0;
    let fetched = 0;
    const result = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env,
      nowFn: () => new Date(STARTED_AT),
      fetchFn: async () => {
        fetched += 1;
        throw new Error("network");
      },
      resolveFn: async () => {
        fetched += 1;
        throw new Error("dns");
      },
      openStore: () => {
        opened += 1;
        throw new Error("store");
      }
    });
    assert.equal(fetched, 0);
    assert.equal(opened, 0);
    assert.deepEqual(secretReads, []);
    assert.equal(result.exitCode, 20);
    assert.equal(result.stderr, "");
    const body = parseLine(result);
    assert.equal(body.status, "blocked");
    assert.equal(body.mode, "apply");
    assert.equal(body.reason, "remote_refresh_disabled");
    assert.equal(body.sources.total, 0);
    assertNoMaterial(`${result.stdout}${result.stderr}`);
    assert.deepEqual(sourceSnapshot(dbPath), before);
    const spawned = runCli(["--apply"], enabledEnv(dbPath));
    assert.equal(spawned.status, 20);
    assert.equal(JSON.parse(spawned.stdout).reason, "remote_refresh_disabled");
    assert.deepEqual(sourceSnapshot(dbPath), before);
    assert.equal(inline.enabled, true);
  });
});

test("min interval dry-run still classifies remote rows and apply stays blocked", async () => {
  await withTempDirAsync(async (directory) => {
    const dbPath = join(directory, "third-party.sqlite");
    applySchema(dbPath);
    const legacyId = insertLegacyRemote(dbPath, { lastRefreshAt: STARTED_AT, enabled: 1 });
    const before = sourceSnapshot(dbPath);
    let fetched = 0;
    const fetchFn = async () => {
      fetched += 1;
      throw new Error("network");
    };
    const resolveFn = async () => {
      fetched += 1;
      throw new Error("dns");
    };
    const skipped = await runThirdPartySubscriptionRefresh({
      args: [],
      env: enabledEnv(dbPath),
      nowFn: () => new Date("2026-10-10T01:00:00.000Z"),
      fetchFn,
      resolveFn
    });
    assert.equal(skipped.exitCode, 0);
    const skippedBody = parseLine(skipped);
    assert.equal(skippedBody.sources.due, 0);
    assert.equal(skippedBody.sources.skipped, 1);
    assert.equal(skippedBody.items[0].id, legacyId);
    assert.equal(skippedBody.items[0].status, "skipped_min_interval");
    assert.equal(fetched, 0);
    assert.deepEqual(sourceSnapshot(dbPath), before);

    const due = await runThirdPartySubscriptionRefresh({
      args: [],
      env: enabledEnv(dbPath),
      nowFn: () => new Date("2026-10-10T06:00:00.000Z"),
      fetchFn,
      resolveFn
    });
    assert.equal(due.exitCode, 0);
    assert.equal(parseLine(due).sources.due, 1);
    assert.equal(parseLine(due).items[0].status, "would_refresh");
    assert.equal(fetched, 0);
    assert.deepEqual(sourceSnapshot(dbPath), before);

    const apply = await runThirdPartySubscriptionRefresh({
      args: ["--apply"],
      env: enabledEnv(dbPath),
      nowFn: () => new Date("2026-10-10T06:00:00.000Z"),
      fetchFn,
      resolveFn
    });
    assert.equal(apply.exitCode, 20);
    assert.equal(parseLine(apply).reason, "remote_refresh_disabled");
    assert.equal(fetched, 0);
    assert.deepEqual(sourceSnapshot(dbPath), before);
    assertNoMaterial(`${skipped.stdout}${due.stdout}${apply.stdout}`);
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
