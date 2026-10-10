#!/usr/bin/env node

// Refresh enabled third-party subscription sources.
//
//   node scripts/platform-third-party-subscription-refresh.mjs
//   node scripts/platform-third-party-subscription-refresh.mjs --apply
//
// Without --apply this is a dry run: it lists how many enabled sources would
// be refreshed and does not fetch. --apply is required to mutate.
//
// Exit codes follow scripts/platform-lead-retention.mjs:
//   0  disabled, planned (dry-run), or completed (apply, no source failures)
//   20 blocked: missing or invalid db path, missing or invalid secret,
//      schema absent, or store unavailable. No fetch.
//   30 refresh_failed: one or more sources failed. Last-good nodes are kept.
//      stderr is one line: third_party_refresh_failed count=N
//   64 invalid_command_contract: arguments are not exactly [] or ["--apply"],
//      or THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS is set and is
//      not a safe non-negative integer
//   70 internal_error
//
// THIRD_PARTY_SUBSCRIPTION_ENABLED must be a truthy env flag (1/true/yes/on,
// same set as envFlag in server/state.mjs). Otherwise the process exits 0
// with status disabled and does not open the database or the network.
//
// THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS defaults to 21600
// (6 hours). A source whose last successful refresh (last_refresh_at) is
// newer than that interval is skipped, so an accidental second run does not
// fetch again. Failed attempts do not update last_refresh_at.

import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPortalTotpSecretProtector } from "../server/services/platform/portal-totp-verifier.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../server/services/platform/third-party-subscription-store.mjs";

export const DEFAULT_REFRESH_MIN_INTERVAL_SECONDS = 21600;

const SOURCE_ID_PATTERN = /^tpsrc_[0-9a-f]{32}$/;
const SAFE_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;
const TRUTHY_FLAGS = new Set(["1", "true", "yes", "on"]);

function enabledFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  return TRUTHY_FLAGS.has(normalized);
}

export function parseRefreshArguments(args) {
  if (!Array.isArray(args)) return null;
  if (args.length === 0) return { apply: false };
  if (args.length === 1 && args[0] === "--apply") return { apply: true };
  return null;
}

export function parseMinIntervalSeconds(value) {
  const text = String(value ?? "").trim();
  if (!text) return DEFAULT_REFRESH_MIN_INTERVAL_SECONDS;
  if (!/^(0|[1-9]\d*)$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) return null;
  return parsed;
}

function shortCode(value, fallback) {
  const code = String(value || "");
  return SAFE_CODE_PATTERN.test(code) ? code : fallback;
}

function sourceId(value) {
  const id = String(value || "");
  return SOURCE_ID_PATTERN.test(id) ? id : "redacted";
}

function emptySources() {
  return { total: 0, due: 0, refreshed: 0, failed: 0, skipped: 0 };
}

function jsonLine({ status, mode, reason, sources, items }) {
  return `${JSON.stringify({
    status,
    mode,
    reason,
    sources,
    items
  })}\n`;
}

function commandResult({
  exitCode,
  status,
  mode,
  reason,
  sources = emptySources(),
  items = [],
  stderr = ""
}) {
  return {
    exitCode,
    stdout: jsonLine({ status, mode, reason, sources, items }),
    stderr
  };
}

function resolveNow(nowFn) {
  const value = typeof nowFn === "function" ? nowFn() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function refreshedWithinInterval(lastRefreshAt, now, minIntervalSeconds) {
  if (!minIntervalSeconds) return false;
  if (lastRefreshAt == null || lastRefreshAt === "") return false;
  const then = Date.parse(lastRefreshAt);
  if (!Number.isFinite(then)) return false;
  return now.getTime() - then < minIntervalSeconds * 1000;
}

function closeStore(store) {
  try {
    store?.close?.();
  } catch {
    // The command result is already decided.
  }
}

export async function runThirdPartySubscriptionRefresh({
  args = [],
  env = {},
  fetchFn,
  resolveFn,
  nowFn,
  openStore
} = {}) {
  const parsed = parseRefreshArguments(args);
  const requestedMode = Array.isArray(args) && args.includes("--apply") ? "apply" : "dry-run";
  if (!parsed) {
    return commandResult({
      exitCode: 64,
      status: "blocked",
      mode: requestedMode,
      reason: "invalid_command_contract"
    });
  }
  const mode = parsed.apply ? "apply" : "dry-run";
  if (!enabledFlag(env.THIRD_PARTY_SUBSCRIPTION_ENABLED)) {
    return commandResult({
      exitCode: 0,
      status: "disabled",
      mode,
      reason: "disabled"
    });
  }
  const minIntervalSeconds = parseMinIntervalSeconds(
    env.THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS
  );
  if (minIntervalSeconds === null) {
    return commandResult({
      exitCode: 64,
      status: "blocked",
      mode,
      reason: "invalid_min_interval"
    });
  }
  const dbPath = String(env.THIRD_PARTY_SUBSCRIPTION_DB_PATH || "").trim();
  const secretKey = String(env.THIRD_PARTY_SUBSCRIPTION_SECRET_KEY || "").trim();
  if (!dbPath) {
    return commandResult({
      exitCode: 20,
      status: "blocked",
      mode,
      reason: "missing_db_path"
    });
  }
  if (!isAbsolute(dbPath)) {
    return commandResult({
      exitCode: 20,
      status: "blocked",
      mode,
      reason: "invalid_db_path"
    });
  }
  if (!secretKey) {
    return commandResult({
      exitCode: 20,
      status: "blocked",
      mode,
      reason: "missing_secret_key"
    });
  }
  let secretProtector;
  try {
    secretProtector = createPortalTotpSecretProtector({ key: secretKey });
  } catch {
    return commandResult({
      exitCode: 20,
      status: "blocked",
      mode,
      reason: "invalid_secret_key"
    });
  }
  const now = resolveNow(nowFn);
  if (!now) {
    return commandResult({
      exitCode: 70,
      status: "internal_error",
      mode,
      reason: "internal_error"
    });
  }
  const opener = openStore || createSqliteThirdPartySubscriptionStore;
  let store;
  try {
    store = opener({
      dbPath,
      secretProtector,
      fetchFn,
      resolveFn,
      nowFn: () => new Date(now.getTime())
    });
  } catch {
    return commandResult({
      exitCode: 20,
      status: "blocked",
      mode,
      reason: "store_unavailable"
    });
  }
  if (!store?.available) {
    closeStore(store);
    return commandResult({
      exitCode: 20,
      status: "blocked",
      mode,
      reason: "schema_absent"
    });
  }

  try {
    const sources = store.listSources();
    const enabledSources = sources.filter((source) => source.enabled === true);
    const skippedIds = new Set();
    for (const source of enabledSources) {
      if (refreshedWithinInterval(source.lastRefreshAt, now, minIntervalSeconds)) {
        skippedIds.add(source.id);
      }
    }
    const dueSources = enabledSources.filter((source) => !skippedIds.has(source.id));
    if (!parsed.apply) {
      return commandResult({
        exitCode: 0,
        status: "planned",
        mode,
        reason: "dry_run",
        sources: {
          total: sources.length,
          due: dueSources.length,
          refreshed: 0,
          failed: 0,
          skipped: skippedIds.size
        },
        items: enabledSources.map((source) => ({
          id: sourceId(source.id),
          status: skippedIds.has(source.id) ? "skipped_min_interval" : "would_refresh"
        }))
      });
    }

    let refreshed = 0;
    let failed = 0;
    const items = [];
    for (const source of enabledSources) {
      const id = sourceId(source.id);
      if (skippedIds.has(source.id)) {
        items.push({ id, status: "skipped_min_interval" });
        continue;
      }
      if (id === "redacted") {
        failed += 1;
        items.push({ id, status: "invalid_source_id" });
        continue;
      }
      try {
        const outcome = await store.refreshSource(source.id);
        if (outcome?.ok === true) {
          refreshed += 1;
          items.push({ id, status: "refreshed" });
        } else {
          failed += 1;
          items.push({
            id,
            status: shortCode(outcome?.lastErrorCode, "refresh_failed")
          });
        }
      } catch {
        failed += 1;
        items.push({ id, status: "refresh_failed" });
      }
    }
    const stderr = failed > 0 ? `third_party_refresh_failed count=${failed}\n` : "";
    return commandResult({
      exitCode: failed > 0 ? 30 : 0,
      status: failed > 0 ? "refresh_failed" : "completed",
      mode,
      reason: failed > 0 ? "source_refresh_failed" : "ok",
      sources: {
        total: sources.length,
        due: dueSources.length,
        refreshed,
        failed,
        skipped: skippedIds.size
      },
      items,
      stderr
    });
  } catch {
    return commandResult({
      exitCode: 70,
      status: "internal_error",
      mode,
      reason: "internal_error"
    });
  } finally {
    closeStore(store);
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const left = resolve(entry);
    const right = resolve(fileURLToPath(import.meta.url));
    return left === right || left.toLowerCase() === right.toLowerCase();
  } catch {
    return false;
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const result = await runThirdPartySubscriptionRefresh({ args: argv, env });
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

if (isDirectRun()) {
  await main();
}
