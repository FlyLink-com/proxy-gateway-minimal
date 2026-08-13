import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEGACY_ENTITLEMENT_NORMALIZATION_POLICY,
  buildLegacyEntitlementNormalizationInventory,
  buildLegacyEntitlementNormalizationPlan,
  dryRunLegacyEntitlementNormalization,
  parseLegacyEntitlementNormalizationSnapshot
} from "../server/services/platform/legacy-entitlement-normalization.mjs";

const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_INPUT_REJECTED = 3;
const EXIT_UNEXPECTED_FAILURE = 4;
const FLAGS = new Set(["--mode", "--input-path"]);
const READ_ONLY_MODES = new Set(["inventory", "plan", "dry-run"]);
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const COUNT_KEYS = Object.freeze([
  "totalCases",
  "noServiceNoop",
  "requiresExplicitCanonicalChain",
  "requiresExplicitAuthorityAssignment",
  "requiresExplicitTransitionContract",
  "blockedAccountInactiveOrUnknown",
  "blockedDuplicateLoginIdentity",
  "blockedInflightCommerceOrReconciliation",
  "blockedLapsedOnly",
  "blockedFutureOrEffectBackedChain",
  "blockedPartialOrInconsistentChain",
  "blockedAuthorityConflict",
  "blockedAuthorityDrift",
  "blockedAuthorityVersionChanged",
  "blockedRuntimeOrIdentityUnverified",
  "manualReviewRequired"
]);
const REASON_KEYS = Object.freeze([
  "no_service_noop",
  "requires_explicit_canonical_chain",
  "requires_explicit_authority_assignment",
  "requires_explicit_transition_contract",
  "blocked_account_inactive_or_unknown",
  "blocked_duplicate_login_identity",
  "blocked_inflight_commerce_or_reconciliation",
  "blocked_lapsed_only",
  "blocked_future_or_effect_backed_chain",
  "blocked_partial_or_inconsistent_chain",
  "blocked_authority_conflict",
  "blocked_authority_drift",
  "blocked_authority_version_changed",
  "blocked_runtime_or_identity_unverified"
]);
const SAFE_REASON_CODES = new Set([
  "apply_not_supported",
  "argument_not_allowed_for_mode",
  "duplicate_argument",
  "empty_argument",
  "input_path_must_be_absolute",
  "input_path_network_forbidden",
  "input_path_database_forbidden",
  "input_path_extension_invalid",
  "input_path_required",
  "input_path_unreadable",
  "input_snapshot_rejected",
  "invalid_mode",
  "mode_required",
  "unknown_argument",
  "unexpected_execution_failure"
]);

class CliContractError extends Error {
  constructor(reasonCode, mode = null) {
    super("Legacy entitlement normalization CLI contract rejected");
    this.name = "CliContractError";
    this.reasonCode = reasonCode;
    this.mode = mode;
  }
}

function emptyCounts() {
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
}

function emptyReasonCounts() {
  return Object.fromEntries(REASON_KEYS.map((key) => [key, 0]));
}

function fixedChecks({ canonicalInput = false, dryRunVerified = false } = {}) {
  return Object.freeze({
    canonicalInput,
    noAutomaticSelection: true,
    noResourceBootstrap: true,
    noDataMutation: true,
    noCoinsOrCommerceEffects: true,
    dryRunVerified
  });
}

function fixedEffects() {
  return Object.freeze({
    autoSelectedChains: 0,
    plannedAssignments: 0,
    plannedTransitions: 0,
    zeroServiceResourceCreations: 0,
    coinsEffects: 0,
    commerceOrderEffects: 0,
    fulfillmentEffects: 0
  });
}

function closedOutput({
  ok = false,
  mode = null,
  planState = "not_generated",
  snapshotDigest = null,
  planDigest = null,
  checks = fixedChecks(),
  effects = fixedEffects(),
  counts = emptyCounts(),
  reasonCounts = emptyReasonCounts(),
  reasonCodes = []
} = {}) {
  return Object.freeze({
    schemaVersion: "1",
    ok,
    mode,
    planState,
    aggregateOnly: true,
    sourceChanged: false,
    executionAllowed: false,
    policyId: LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.policyId,
    snapshotDigest,
    planDigest,
    checks,
    effects,
    counts,
    reasonCounts,
    reasonCodes: Object.freeze([...reasonCodes])
  });
}

function contractError(reasonCode, mode = null) {
  throw new CliContractError(reasonCode, mode);
}

function isFullyQualifiedPath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) return false;
  if (process.platform !== "win32") return true;
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  const unc = /^[\\/]{2}([^\\/]+)[\\/]([^\\/]+)(?:[\\/]|$)/.exec(value);
  if (!unc) return false;
  const [, server, share] = unc;
  return ![".", "..", "?"].includes(server)
    && ![".", ".."].includes(share)
    && !/[<>:"|?*]/.test(server)
    && !/[<>:"|?*]/.test(share);
}

function isNetworkPath(value) {
  return typeof value === "string" && /^[\\/]{2}/.test(value);
}

function isDatabaseLikePath(value) {
  const extension = extname(value).toLowerCase();
  return [".db", ".sqlite", ".sqlite3"].includes(extension);
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) contractError("unknown_argument");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (typeof flag !== "string" || !FLAGS.has(flag)) contractError("unknown_argument");
    if (values.has(flag)) contractError("duplicate_argument");
    const value = argv[index + 1];
    if (index + 1 >= argv.length || typeof value !== "string" || value.length === 0 || FLAGS.has(value)) {
      contractError("empty_argument");
    }
    values.set(flag, value);
  }

  const mode = values.get("--mode") ?? null;
  if (!mode) contractError("mode_required");
  if (mode === "apply") contractError("apply_not_supported", mode);
  if (!READ_ONLY_MODES.has(mode)) contractError("invalid_mode", mode);
  const inputPath = values.get("--input-path");
  if (!inputPath) contractError("input_path_required", mode);
  if (isNetworkPath(inputPath)) contractError("input_path_network_forbidden", mode);
  if (!isFullyQualifiedPath(inputPath)) contractError("input_path_must_be_absolute", mode);
  if (isDatabaseLikePath(inputPath)) contractError("input_path_database_forbidden", mode);
  if (extname(inputPath).toLowerCase() !== ".json") {
    contractError("input_path_extension_invalid", mode);
  }
  return Object.freeze({ mode, inputPath });
}

function readCanonicalSnapshot(inputPath) {
  try {
    const metadata = lstatSync(inputPath);
    if (
      !metadata.isFile()
      || metadata.isSymbolicLink()
      || metadata.size <= 0
      || metadata.size > MAX_SNAPSHOT_BYTES
      || realpathSync(inputPath) !== resolve(inputPath)
    ) {
      throw new Error("input_snapshot_rejected");
    }
    return parseLegacyEntitlementNormalizationSnapshot(readFileSync(inputPath));
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EACCES" || error?.code === "EPERM") {
      throw new CliContractError("input_path_unreadable");
    }
    throw new CliContractError("input_snapshot_rejected");
  }
}

function successOutput(mode, result) {
  return closedOutput({
    ok: true,
    mode,
    planState: mode === "dry-run" ? "dry_run_complete" : "review_required",
    snapshotDigest: result.snapshotDigest,
    planDigest: result.planDigest ?? null,
    checks: fixedChecks({
      canonicalInput: true,
      dryRunVerified: mode === "dry-run" ? result.dryRunVerified : false
    }),
    counts: result.counts,
    reasonCounts: result.reasonCounts
  });
}

export async function runLegacyEntitlementNormalizationCli({ argv } = {}) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    if (error instanceof CliContractError && SAFE_REASON_CODES.has(error.reasonCode)) {
      return {
        exitCode: EXIT_CONTRACT_REJECTED,
        output: closedOutput({ mode: error.mode, reasonCodes: [error.reasonCode] })
      };
    }
    return {
      exitCode: EXIT_UNEXPECTED_FAILURE,
      output: closedOutput({ reasonCodes: ["unexpected_execution_failure"] })
    };
  }

  try {
    const snapshot = readCanonicalSnapshot(options.inputPath);
    if (options.mode === "inventory") {
      return { exitCode: EXIT_SUCCESS, output: successOutput(options.mode, buildLegacyEntitlementNormalizationInventory(snapshot)) };
    }
    if (options.mode === "plan") {
      return { exitCode: EXIT_SUCCESS, output: successOutput(options.mode, buildLegacyEntitlementNormalizationPlan(snapshot)) };
    }
    return { exitCode: EXIT_SUCCESS, output: successOutput(options.mode, dryRunLegacyEntitlementNormalization(snapshot)) };
  } catch (error) {
    if (error instanceof CliContractError && SAFE_REASON_CODES.has(error.reasonCode)) {
      return {
        exitCode: EXIT_INPUT_REJECTED,
        output: closedOutput({ mode: options.mode, reasonCodes: [error.reasonCode] })
      };
    }
    return {
      exitCode: EXIT_UNEXPECTED_FAILURE,
      output: closedOutput({ mode: options.mode, reasonCodes: ["unexpected_execution_failure"] })
    };
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const outcome = await runLegacyEntitlementNormalizationCli({ argv: process.argv.slice(2) });
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
