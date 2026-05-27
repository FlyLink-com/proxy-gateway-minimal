import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAccessModelInventorySummary } from "../services/platform/access-model-inventory-summary.mjs";

function withJsonFile(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "access-model-inventory-summary-"));
  try {
    const path = join(tempDir, "inventory.json");
    writeFileSync(path, JSON.stringify(payload, null, 2));
    return fn(path);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("access model inventory summary normalizes safe preflight evidence", () => {
  const summary = buildAccessModelInventorySummary({
    generatedAt: "2026-05-27T20:10:00.000Z",
    tenantCounts: {
      enabled: 2,
      disabled: 1,
      expired: 0
    },
    artifactCounts: {
      active: 1,
      revoked: 0,
      rotated: 0
    },
    temporaryLinkCounts: {
      active: 1,
      expired: 2
    },
    legacyRoute: {
      present: true,
      noTokenRejected: true
    },
    publicBoundary: {
      healthOk: true,
      adminBlocked: true,
      appPortPublic: false,
      privateNginxPublic: false
    },
    loggingPosture: {
      nginxArtifactPathRedaction: "present",
      appRawSecretLoggingObserved: false
    },
    notes: ["inventory only", "inventory only", ""]
  });

  assert.deepEqual(summary, {
    ok: true,
    mode: "access-model-inventory-summary",
    generatedAt: "2026-05-27T20:10:00.000Z",
    readiness: {
      artifactIssuanceInventoryReady: true,
      blockers: []
    },
    tenantCounts: {
      enabled: 2,
      disabled: 1,
      expired: 0
    },
    artifactCounts: {
      active: 1,
      revoked: 0,
      rotated: 0
    },
    temporaryLinkCounts: {
      active: 1,
      expired: 2
    },
    legacyRoute: {
      present: true,
      noTokenRejected: true
    },
    publicBoundary: {
      healthOk: true,
      adminBlocked: true,
      appPortPublic: false,
      privateNginxPublic: false
    },
    loggingPosture: {
      nginxArtifactPathRedaction: "present",
      appRawSecretLoggingObserved: false
    },
    notes: ["inventory only"],
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
  });
  assert.doesNotMatch(JSON.stringify(summary), /secret|token=|customer@example\.com|\/sub\/clash\.yaml\?/);
});

test("access model inventory summary reports blockers without mutating anything", () => {
  const summary = buildAccessModelInventorySummary({
    tenantCounts: {
      enabled: 1
    },
    artifactCounts: {},
    legacyRoute: {
      present: false,
      noTokenRejected: false
    },
    publicBoundary: {
      healthOk: true,
      adminBlocked: false,
      appPortPublic: true,
      privateNginxPublic: true
    },
    loggingPosture: {
      nginxArtifactPathRedaction: "absent",
      appRawSecretLoggingObserved: true
    }
  });

  assert.equal(summary.readiness.artifactIssuanceInventoryReady, false);
  assert.deepEqual(summary.readiness.blockers, [
    "legacy query-token route status is not present",
    "legacy no-token refresh rejection not verified",
    "public Admin blocking not verified",
    "app port appears publicly reachable",
    "private Nginx port appears publicly reachable",
    "artifact-path log redaction not present",
    "application raw secret logging observed"
  ]);
  assert.equal(summary.safety.noArtifactIssuance, true);
  assert.equal(summary.safety.noLegacyTokenRetirement, true);
});

test("access model inventory summary rejects unsafe raw access data without echoing it", () => {
  assert.throws(
    () => buildAccessModelInventorySummary({
      tenantCounts: { enabled: 1 },
      artifactCounts: { active: 1 },
      legacyRoute: { present: true, noTokenRejected: true },
      publicBoundary: { healthOk: true, adminBlocked: true, appPortPublic: false, privateNginxPublic: false },
      loggingPosture: { nginxArtifactPathRedaction: "present", appRawSecretLoggingObserved: false },
      rawSubscriptionUrl: "https://sub.example/sub/clash.yaml?token=secret-token",
      artifactSecret: "artifact-secret",
      customerEmail: "customer@example.com"
    }),
    (error) => {
      assert.match(error.message, /safe access model inventory summary/);
      assert.doesNotMatch(error.message, /secret-token|artifact-secret|customer@example\.com|sub\.example/);
      return true;
    }
  );
});

test("access model inventory summary CLI prints safe JSON", () => {
  withJsonFile(
    {
      generatedAt: "2026-05-27T20:11:00.000Z",
      tenantCounts: {
        enabled: 1
      },
      artifactCounts: {
        active: 0
      },
      legacyRoute: {
        present: true,
        noTokenRejected: true
      },
      publicBoundary: {
        healthOk: true,
        adminBlocked: true,
        appPortPublic: false,
        privateNginxPublic: false
      },
      loggingPosture: {
        nginxArtifactPathRedaction: "present",
        appRawSecretLoggingObserved: false
      }
    },
    (path) => {
      const stdout = execFileSync(process.execPath, [
        "scripts/access-model-inventory-summary.mjs",
        path
      ], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const summary = JSON.parse(stdout);
      assert.equal(summary.ok, true);
      assert.equal(summary.mode, "access-model-inventory-summary");
      assert.equal(summary.readiness.artifactIssuanceInventoryReady, true);
      assert.doesNotMatch(stdout, /secret|token=|customer@example\.com|\/sub\/clash\.yaml\?/);
    }
  );
});
