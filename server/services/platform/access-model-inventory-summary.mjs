const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "generatedAt",
  "tenantCounts",
  "artifactCounts",
  "temporaryLinkCounts",
  "legacyRoute",
  "publicBoundary",
  "loggingPosture",
  "notes"
]);
const ALLOWED_COUNT_KEYS = new Set(["enabled", "disabled", "expired", "active", "revoked", "rotated"]);
const ALLOWED_TEMPORARY_LINK_COUNT_KEYS = new Set(["active", "expired"]);
const ALLOWED_LEGACY_ROUTE_KEYS = new Set(["present", "noTokenRejected"]);
const ALLOWED_PUBLIC_BOUNDARY_KEYS = new Set([
  "healthOk",
  "adminBlocked",
  "appPortPublic",
  "privateNginxPublic"
]);
const ALLOWED_LOGGING_POSTURE_KEYS = new Set([
  "nginxArtifactPathRedaction",
  "appRawSecretLoggingObserved"
]);
const SENSITIVE_TEXT_PATTERN = /https?:|token=|secret|credential|customer|@|\/sub\/clash\.yaml/i;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeSummaryError() {
  return new Error("safe access model inventory summary requires only supported summary fields");
}

function assertExactKeys(value, allowedKeys) {
  if (!isObject(value)) {
    throw safeSummaryError();
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw safeSummaryError();
    }
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function safeNotes(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = text(value);
    if (!normalized || seen.has(normalized)) continue;
    if (SENSITIVE_TEXT_PATTERN.test(normalized)) {
      throw safeSummaryError();
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function safeCount(value) {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw safeSummaryError();
  }
  return value;
}

function safeCounts(value, allowedKeys, outputKeys) {
  const input = value ?? {};
  assertExactKeys(input, allowedKeys);
  return Object.fromEntries(outputKeys.map((key) => [key, safeCount(input[key])]));
}

function safeLegacyRoute(value) {
  const input = value ?? {};
  assertExactKeys(input, ALLOWED_LEGACY_ROUTE_KEYS);
  return {
    present: input.present === true,
    noTokenRejected: input.noTokenRejected === true
  };
}

function safePublicBoundary(value) {
  const input = value ?? {};
  assertExactKeys(input, ALLOWED_PUBLIC_BOUNDARY_KEYS);
  return {
    healthOk: input.healthOk === true,
    adminBlocked: input.adminBlocked === true,
    appPortPublic: input.appPortPublic === true,
    privateNginxPublic: input.privateNginxPublic === true
  };
}

function safeLoggingPosture(value) {
  const input = value ?? {};
  assertExactKeys(input, ALLOWED_LOGGING_POSTURE_KEYS);
  const nginxArtifactPathRedaction = text(input.nginxArtifactPathRedaction);
  if (!nginxArtifactPathRedaction) {
    throw safeSummaryError();
  }
  return {
    nginxArtifactPathRedaction,
    appRawSecretLoggingObserved: input.appRawSecretLoggingObserved === true
  };
}

function buildBlockers({ legacyRoute, publicBoundary, loggingPosture }) {
  const blockers = [];
  if (!legacyRoute.present) {
    blockers.push("legacy query-token route status is not present");
  }
  if (!legacyRoute.noTokenRejected) {
    blockers.push("legacy no-token refresh rejection not verified");
  }
  if (!publicBoundary.healthOk) {
    blockers.push("public subscription boundary health not verified");
  }
  if (!publicBoundary.adminBlocked) {
    blockers.push("public Admin blocking not verified");
  }
  if (publicBoundary.appPortPublic) {
    blockers.push("app port appears publicly reachable");
  }
  if (publicBoundary.privateNginxPublic) {
    blockers.push("private Nginx port appears publicly reachable");
  }
  if (loggingPosture.nginxArtifactPathRedaction !== "present") {
    blockers.push("artifact-path log redaction not present");
  }
  if (loggingPosture.appRawSecretLoggingObserved) {
    blockers.push("application raw secret logging observed");
  }
  return blockers;
}

export function buildAccessModelInventorySummary(input = {}) {
  assertExactKeys(input, ALLOWED_TOP_LEVEL_KEYS);

  const tenantCounts = safeCounts(input.tenantCounts, ALLOWED_COUNT_KEYS, [
    "enabled",
    "disabled",
    "expired"
  ]);
  const artifactCounts = safeCounts(input.artifactCounts, ALLOWED_COUNT_KEYS, [
    "active",
    "revoked",
    "rotated"
  ]);
  const temporaryLinkCounts = safeCounts(
    input.temporaryLinkCounts,
    ALLOWED_TEMPORARY_LINK_COUNT_KEYS,
    ["active", "expired"]
  );
  const legacyRoute = safeLegacyRoute(input.legacyRoute);
  const publicBoundary = safePublicBoundary(input.publicBoundary);
  const loggingPosture = safeLoggingPosture(input.loggingPosture);
  const blockers = buildBlockers({ legacyRoute, publicBoundary, loggingPosture });

  return {
    ok: true,
    mode: "access-model-inventory-summary",
    generatedAt: text(input.generatedAt) || new Date().toISOString(),
    readiness: {
      artifactIssuanceInventoryReady: blockers.length === 0,
      blockers
    },
    tenantCounts,
    artifactCounts,
    temporaryLinkCounts,
    legacyRoute,
    publicBoundary,
    loggingPosture,
    notes: safeNotes(input.notes),
    safety: {
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noArtifactIssuance: true,
      noLegacyTokenRetirement: true,
      omittedFields: [
        "rawSubscriptionUrls",
        "rawArtifactUrls",
        "tokens",
        "artifactSecrets",
        "customerEmails",
        "sqliteRows",
        "credentials"
      ]
    }
  };
}
