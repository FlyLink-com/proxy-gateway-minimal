import { createHash } from "node:crypto";

const PROTECTED_CONFIG_PATHS = new Set([
  "config/proxy-servers.json"
]);

const FORBIDDEN_PREFIX_RULES = [
  { prefix: ".worktrees/", reason: "development worktree residue must not be packaged" },
  { prefix: ".codex-artifacts/", reason: "local generated artifact workspace must not be packaged" },
  { prefix: ".codex-runtime/", reason: "local preview/runtime scratch files must not be packaged" },
  { prefix: ".claude/", reason: "local assistant settings must not be packaged" },
  { prefix: ".proxy-gateway/", reason: "runtime control files must not be packaged" }
];

const FORBIDDEN_SEGMENT_RULES = [
  { segment: ".claude", reason: "local assistant settings must not be packaged" }
];

const FORBIDDEN_EXACT_RULES = new Map([
  [".env", "protected environment file must not be packaged"],
  [".env.local", "protected environment file must not be packaged"]
]);

const FORBIDDEN_SUFFIX_RULES = [
  { pattern: /\.bak(?:[-_.].*)?$/i, reason: "ad-hoc backup file must not be packaged" },
  { pattern: /\.(?:sqlite|sqlite3|db|db-shm|db-wal)$/i, reason: "database file must not be packaged" },
  { pattern: /\.(?:pem|key|p12|pfx|crt|cer)$/i, reason: "key or certificate material must not be packaged" },
  { pattern: /\.(?:log|trace)$/i, reason: "runtime log file must not be packaged" }
];

function normalizePath(input) {
  return String(input || "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function classifyPath(path) {
  const normalized = normalizePath(path);
  if (!normalized) {
    return null;
  }

  for (const rule of FORBIDDEN_PREFIX_RULES) {
    if (normalized === rule.prefix.slice(0, -1) || normalized.startsWith(rule.prefix)) {
      return {
        path: normalized,
        severity: "blocker",
        code: "forbidden_prefix",
        reason: rule.reason
      };
    }
  }

  const segments = normalized.split("/");
  for (const rule of FORBIDDEN_SEGMENT_RULES) {
    if (segments.includes(rule.segment)) {
      return {
        path: normalized,
        severity: "blocker",
        code: "forbidden_segment",
        reason: rule.reason
      };
    }
  }

  const exactReason = FORBIDDEN_EXACT_RULES.get(normalized);
  if (exactReason) {
    return {
      path: normalized,
      severity: "blocker",
      code: "forbidden_exact",
      reason: exactReason
    };
  }

  for (const rule of FORBIDDEN_SUFFIX_RULES) {
    if (rule.pattern.test(normalized)) {
      return {
        path: normalized,
        severity: "blocker",
        code: "forbidden_suffix",
        reason: rule.reason
      };
    }
  }

  if (PROTECTED_CONFIG_PATHS.has(normalized)) {
    return {
      path: normalized,
      severity: "review",
      code: "protected_runtime_config",
      reason: "protected runtime config may intentionally differ from Git and requires explicit review"
    };
  }

  return null;
}

export function inspectProductionArtifactBoundary({ paths = [] } = {}) {
  const blockers = [];
  const reviewRequired = [];
  const seen = new Set();

  for (const rawPath of paths) {
    const normalized = normalizePath(rawPath);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    const classification = classifyPath(normalized);
    if (!classification) {
      continue;
    }
    if (classification.severity === "blocker") {
      blockers.push(classification);
    } else {
      reviewRequired.push(classification);
    }
  }

  return {
    ok: blockers.length === 0,
    totalPaths: seen.size,
    blockers,
    reviewRequired
  };
}

function normalizeText(input) {
  return String(input ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

export function compareNormalizedText({ left = "", right = "" } = {}) {
  const leftHash = sha256(normalizeText(left));
  const rightHash = sha256(normalizeText(right));
  return {
    equal: leftHash === rightHash,
    leftHash,
    rightHash
  };
}

export const productionArtifactBoundaryRules = Object.freeze({
  forbiddenPrefixes: FORBIDDEN_PREFIX_RULES.map((rule) => rule.prefix),
  forbiddenSegments: FORBIDDEN_SEGMENT_RULES.map((rule) => rule.segment),
  forbiddenExactPaths: Array.from(FORBIDDEN_EXACT_RULES.keys()),
  protectedConfigPaths: Array.from(PROTECTED_CONFIG_PATHS)
});
