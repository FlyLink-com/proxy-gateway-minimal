import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyMihomoTuicUsageCredentialMap,
  buildMihomoTuicUsageCredentialMapReport
} from "../../scripts/mihomo-tuic-usage-map-rebuild.mjs";

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
    assert.equal(JSON.stringify(report).includes(UUID_A), false);
    assert.equal(JSON.stringify(report).includes(CRED_B), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
