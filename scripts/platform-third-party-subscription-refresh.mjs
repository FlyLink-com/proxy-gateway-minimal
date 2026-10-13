#!/usr/bin/env node

// Phase-one third-party subscription refresh gate.
//
//   node scripts/platform-third-party-subscription-refresh.mjs
//   node scripts/platform-third-party-subscription-refresh.mjs --apply
//
// Without --apply this is a dry run. It reads local source summaries and does
// not fetch. Inline YAML sources are reported as skipped_inline and are not
// due. A stored remote row may be described as would_refresh or
// skipped_min_interval; that is only a local summary.
//
// --apply does not refresh. With the feature flag enabled it returns
// blocked/remote_refresh_disabled before the database path, the secret, and
// the store are read, and before DNS or fetch. No environment flag bypasses
// this. Last-good rows stay untouched because the database is not opened.
//
// Exit codes follow scripts/platform-lead-retention.mjs:
//   0  disabled, or planned (dry-run)
//   20 blocked: dry-run missing or invalid db path, missing or invalid secret,
//      schema absent, or store unavailable; or --apply remote_refresh_disabled
//      while the feature flag is enabled. No fetch.
//   64 invalid_command_contract: arguments are not exactly [] or ["--apply"],
//      or THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS is set and is
//      not a safe non-negative integer
//   70 internal_error
//
// THIRD_PARTY_SUBSCRIPTION_ENABLED must be a truthy env flag (1/true/yes/on,
// same set as envFlag in server/state.mjs). Otherwise the process exits 0
// with status disabled and does not open the database, read the secret, or
// use the network.
//
// Dry-run still honors THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS
// (default 18000, 5 hours) for non-inline rows. The systemd unit stays
// uninstalled; --apply from that unit hits this gate.

import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPortalTotpSecretProtector } from "../server/services/platform/portal-totp-verifier.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../server/services/platform/third-party-subscription-store.mjs";

export const DEFAULT_REFRESH_MIN_INTERVAL_SECONDS = 18000;

const SOURCE_ID_PATTERN = /^tpsrc_[0-9a-f]{32}$/;
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
  if (parsed.apply) {
    return commandResult({
      exitCode: 20,
      status: "blocked",
      mode,
      reason: "remote_refresh_disabled"
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
      if (source.sourceKind === "inline-yaml") continue;
      if (refreshedWithinInterval(source.lastRefreshAt, now, minIntervalSeconds)) {
        skippedIds.add(source.id);
      }
    }
    const dueSources = enabledSources.filter((source) =>
      source.sourceKind !== "inline-yaml" && !skippedIds.has(source.id)
    );
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
        status: source.sourceKind === "inline-yaml"
          ? "skipped_inline"
          : skippedIds.has(source.id)
            ? "skipped_min_interval"
            : "would_refresh"
      }))
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
