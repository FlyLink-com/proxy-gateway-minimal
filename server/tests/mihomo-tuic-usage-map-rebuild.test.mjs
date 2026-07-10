import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as usageMapRebuild from "../../scripts/mihomo-tuic-usage-map-rebuild.mjs";
import { createFileTrafficCollectorStatusStore } from "../services/platform/traffic-collector-admin-projection.mjs";

const {
  applyMihomoTuicUsageCredentialMap,
  buildMihomoTuicUsageCredentialMapReport
} = usageMapRebuild;

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_STALE = "33333333-3333-4333-8333-333333333333";
const CRED_A = "edgecred_alpha_001";
const CRED_B = "edgecred_beta_002";
const CRED_STALE = "edgecred_stale_003";

function mihomoConfigWith(...uuids) {
  return [
    "listeners:",
    "  - name: \"channel-vultr-a-tuic\"",
    "    type: tuic",
    "    users:",
    ...uuids.map((uuid, index) => `      \"${uuid}\": \"synthetic-password-${index}\"`),
    ""
  ].join("\n");
}

function materialRecords(...records) {
  return records.map(([uuid, credentialRef]) => ({
    credentialRef,
    materialDigest: `sha256:${credentialRef}`,
    material: {
      uuid,
      password: `synthetic-password-${credentialRef}`
    }
  }));
}

test("Mihomo TUIC usage map report rebuilds from config and material without exposing refs", () => {
  const report = buildMihomoTuicUsageCredentialMapReport({
    mihomoConfigText: mihomoConfigWith(UUID_A, UUID_B),
    materialRecords: materialRecords([UUID_A, CRED_A], [UUID_B, CRED_B]),
    currentMap: {
      [UUID_A]: CRED_A,
      [UUID_STALE]: CRED_STALE
    }
  });

  assert.equal(report.ok, true);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.currentMapCount, 2);
  assert.equal(report.rebuiltMapCount, 2);
  assert.equal(report.addCount, 1);
  assert.equal(report.removeCount, 1);
  assert.equal(report.missingMaterial, 0);
  assert.equal(report.candidateReady, true);
  assert.equal(report.safety.noRawRuntimePayload, true);
  assert.equal(report.safety.noSecretMaterialReturned, true);
  assert.equal(report.safety.redacted, true);
  assert.equal(JSON.stringify(report).includes(UUID_A), false);
  assert.equal(JSON.stringify(report).includes(UUID_B), false);
  assert.equal(JSON.stringify(report).includes(CRED_A), false);
  assert.equal(JSON.stringify(report).includes(CRED_B), false);
});

test("Mihomo TUIC usage map report blocks when config UUID lacks material", () => {
  const report = buildMihomoTuicUsageCredentialMapReport({
    mihomoConfigText: mihomoConfigWith(UUID_A, UUID_B),
    materialRecords: materialRecords([UUID_A, CRED_A]),
    currentMap: {
      [UUID_A]: CRED_A
    }
  });

  assert.equal(report.ok, false);
  assert.equal(report.candidateReady, false);
  assert.equal(report.missingMaterial, 1);
  assert.equal(report.nextAction, "resolve_missing_material_before_usage_map_apply");
  assert.equal(JSON.stringify(report).includes(UUID_B), false);
  assert.equal(JSON.stringify(report).includes(CRED_A), false);
});

test("Mihomo TUIC usage map producer distinguishes drift from missing material", () => {
  assert.equal(typeof usageMapRebuild.buildMihomoTuicUsageCredentialMapProducerStatus, "function");

  const drift = usageMapRebuild.buildMihomoTuicUsageCredentialMapProducerStatus({
    report: buildMihomoTuicUsageCredentialMapReport({
      mihomoConfigText: mihomoConfigWith(UUID_A, UUID_B),
      materialRecords: materialRecords([UUID_A, CRED_A], [UUID_B, CRED_B]),
      currentMap: {
        [UUID_A]: CRED_A,
        [UUID_STALE]: CRED_STALE
      }
    }),
    observedAt: "2026-07-10T14:00:00.000Z"
  });
  const missingMaterial = usageMapRebuild.buildMihomoTuicUsageCredentialMapProducerStatus({
    report: buildMihomoTuicUsageCredentialMapReport({
      mihomoConfigText: mihomoConfigWith(UUID_A, UUID_B),
      materialRecords: materialRecords([UUID_A, CRED_A]),
      currentMap: { [UUID_A]: CRED_A }
    }),
    observedAt: "2026-07-10T14:01:00.000Z"
  });

  assert.deepEqual(drift, {
    type: "traffic_collector_status_producer",
    schemaVersion: "1",
    producerRef: "japan_tuic_usage_credential_map",
    availability: "available",
    observedAt: "2026-07-10T14:00:00.000Z",
    channelRef: "channel-vultr-a-tuic",
    producerHealth: "degraded",
    producerCondition: "mapping_unresolved",
    lastSuccessAt: null,
    map: {
      status: "drifted",
      currentMapCount: 2,
      expectedMapCount: 2,
      addCount: 1,
      removeCount: 1,
      changedCount: 0,
      missingMaterialCount: 0
    },
    safety: {
      redacted: true,
      summaryOnly: true,
      protectedMaterialReturned: false
    }
  });
  assert.equal(missingMaterial.producerHealth, "failed");
  assert.equal(missingMaterial.producerCondition, "config_error");
  assert.equal(missingMaterial.map.status, "missing_material");
  assert.equal(missingMaterial.map.missingMaterialCount, 1);
  const verificationFailure = usageMapRebuild.buildMihomoTuicUsageCredentialMapProducerStatus({
    report: {
      type: "mihomo_tuic_usage_credential_map_rebuild",
      verificationFailed: true
    },
    observedAt: "2026-07-10T14:02:00.000Z"
  });
  assert.equal(verificationFailure.producerHealth, "failed");
  assert.equal(verificationFailure.producerCondition, "config_error");
  assert.equal(verificationFailure.map.status, "verification_failed");

  const serialized = JSON.stringify([drift, missingMaterial, verificationFailure]);
  assert.doesNotMatch(serialized, new RegExp(`${UUID_A}|${UUID_B}|${CRED_A}|${CRED_B}`, "i"));
  assert.doesNotMatch(serialized, /mihomoConfigText|materialRecords|"currentMap":|password|token/i);
});

test("Mihomo TUIC usage map producer detects value-only credential drift", () => {
  const report = buildMihomoTuicUsageCredentialMapReport({
    mihomoConfigText: mihomoConfigWith(UUID_A),
    materialRecords: materialRecords([UUID_A, CRED_A]),
    currentMap: { [UUID_A]: CRED_STALE }
  });
  const producer = usageMapRebuild.buildMihomoTuicUsageCredentialMapProducerStatus({
    report,
    observedAt: "2026-07-10T14:03:00.000Z"
  });

  assert.equal(report.addCount, 0);
  assert.equal(report.removeCount, 0);
  assert.equal(report.changedCount, 1);
  assert.equal(producer.producerHealth, "degraded");
  assert.equal(producer.producerCondition, "mapping_unresolved");
  assert.equal(producer.map.status, "drifted");
  assert.equal(producer.map.changedCount, 1);
  assert.doesNotMatch(JSON.stringify([report, producer]), new RegExp(`${UUID_A}|${CRED_A}|${CRED_STALE}`, "i"));
});

test("Mihomo TUIC usage map CLI writes a protected producer snapshot when configured", () => {
  const dir = mkdtempSync(join(tmpdir(), "mihomo-tuic-usage-map-status-"));
  try {
    const mapPath = join(dir, "usage-map.json");
    const configPath = join(dir, "mihomo.yaml");
    const materialPath = join(dir, "material.json");
    const statusPath = join(dir, "collector-status.json");
    writeFileSync(mapPath, `${JSON.stringify({ [UUID_A]: CRED_A })}\n`, { mode: 0o600 });
    writeFileSync(configPath, mihomoConfigWith(UUID_A));
    writeFileSync(materialPath, `${JSON.stringify(materialRecords([UUID_A, CRED_A]))}\n`, { mode: 0o600 });
    const output = [];

    const code = usageMapRebuild.runMihomoTuicUsageMapRebuildCli({
      argv: [
        "--current-map", mapPath,
        "--mihomo-config", configPath,
        "--material-store", materialPath,
        "--status-path", statusPath
      ],
      stdout: { write: (chunk) => output.push(String(chunk)) },
      stderr: { write: (chunk) => output.push(String(chunk)) },
      nowFn: () => new Date("2026-07-10T14:10:00.000Z")
    });

    assert.equal(code, 0);
    const projection = createFileTrafficCollectorStatusStore({ filePath: statusPath }).read();
    assert.equal(projection.availability, "not_observed");
    assert.equal(projection.producers.length, 2);
    const mapProducer = projection.producers.find((entry) => (
      entry.producerRef === "japan_tuic_usage_credential_map"
    ));
    const sidecarProducer = projection.producers.find((entry) => (
      entry.producerRef === "sgp_tuic_connection_delta_sidecar"
    ));
    assert.equal(mapProducer.producerHealth, "healthy");
    assert.equal(mapProducer.map.status, "in_sync");
    assert.equal(sidecarProducer.availability, "not_observed");
    assert.doesNotMatch(output.join(""), new RegExp(`${UUID_A}|${CRED_A}|synthetic-password`, "i"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Mihomo TUIC usage map CLI redacts input failure and records verification failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "mihomo-tuic-usage-map-failure-status-"));
  try {
    const mapPath = join(dir, "usage-map.json");
    const missingConfigPath = join(dir, "must-not-leak-config.yaml");
    const materialPath = join(dir, "material.json");
    const statusPath = join(dir, "collector-status.json");
    writeFileSync(mapPath, `${JSON.stringify({ [UUID_A]: CRED_A })}\n`, { mode: 0o600 });
    writeFileSync(materialPath, `${JSON.stringify(materialRecords([UUID_A, CRED_A]))}\n`, { mode: 0o600 });
    const output = [];
    let code;

    assert.doesNotThrow(() => {
      code = usageMapRebuild.runMihomoTuicUsageMapRebuildCli({
        argv: [
          "--current-map", mapPath,
          "--mihomo-config", missingConfigPath,
          "--material-store", materialPath,
          "--status-path", statusPath
        ],
        stdout: { write: (chunk) => output.push(String(chunk)) },
        stderr: { write: (chunk) => output.push(String(chunk)) },
        nowFn: () => new Date("2026-07-10T14:11:00.000Z")
      });
    });

    assert.equal(code, 1);
    const producer = createFileTrafficCollectorStatusStore({ filePath: statusPath })
      .read()
      .producers
      .find((entry) => entry.producerRef === "japan_tuic_usage_credential_map");
    assert.equal(producer.producerHealth, "failed");
    assert.equal(producer.producerCondition, "config_error");
    assert.equal(producer.map.status, "verification_failed");
    assert.doesNotMatch(output.join(""), /must-not-leak|usage-map\.json|material\.json/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Mihomo TUIC usage map apply writes rebuilt map only after expected counts match", () => {
  const dir = mkdtempSync(join(tmpdir(), "mihomo-tuic-usage-map-"));
  try {
    const mapPath = join(dir, "usage-map.json");
    writeFileSync(mapPath, `${JSON.stringify({ [UUID_A]: CRED_A, [UUID_STALE]: CRED_STALE }, null, 2)}\n`, {
      mode: 0o600
    });
    const beforeMode = statSync(mapPath).mode & 0o777;

    const report = applyMihomoTuicUsageCredentialMap({
      mapPath,
      mihomoConfigText: mihomoConfigWith(UUID_A, UUID_B),
      materialRecords: materialRecords([UUID_A, CRED_A], [UUID_B, CRED_B]),
      expectedAddCount: 1,
      expectedRemoveCount: 1,
      expectedMissingMaterial: 0
    });

    const nextMap = JSON.parse(readFileSync(mapPath, "utf8"));
    assert.equal(report.ok, true);
    assert.equal(report.mode, "apply");
    assert.equal(report.applied, true);
    assert.equal(report.addCount, 1);
    assert.equal(report.removeCount, 1);
    if (process.platform !== "win32") {
      assert.equal(report.finalMode, "600");
      assert.equal(statSync(mapPath).mode & 0o777, beforeMode);
    } else {
      assert.match(report.finalMode, /^[0-7]{3}$/);
    }
    assert.deepEqual(nextMap, {
      [UUID_A]: CRED_A,
      [UUID_B]: CRED_B
    });
    const producerStatus = usageMapRebuild.buildMihomoTuicUsageCredentialMapProducerStatus({
      report,
      observedAt: "2026-07-10T14:15:00.000Z"
    });
    assert.equal(producerStatus.producerHealth, "healthy");
    assert.equal(producerStatus.producerCondition, "ok");
    assert.equal(producerStatus.map.status, "in_sync");
    assert.equal(JSON.stringify(report).includes(UUID_A), false);
    assert.equal(JSON.stringify(report).includes(CRED_B), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
