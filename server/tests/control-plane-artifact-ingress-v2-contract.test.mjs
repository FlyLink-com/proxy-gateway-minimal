import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactIngressV2ContractError,
  buildIngressV2Header,
  validateIngressV2Header
} from "../../scripts/control-plane-artifact-ingress-v2-contract.mjs";

const NOW = "2026-09-03T06:00:00.000Z";
const SHA256 = "b".repeat(64);
const SOURCE_COMMIT = "a".repeat(40);
const PACKET_ID = "11111111-1111-4111-8111-111111111111";

function entries() {
  return [
    { name: "artifact.json", sizeBytes: 1, sha256: SHA256 },
    { name: "proxy-gateway-release.zip", sizeBytes: 2, sha256: SHA256 },
    { name: "proxy-gateway-release.zip.sha256", sizeBytes: 3, sha256: SHA256 },
    { name: "dependency-artifact.json", sizeBytes: 4, sha256: SHA256 },
    { name: "node-modules.tar", sizeBytes: 5, sha256: SHA256 },
    { name: "release-label.txt", sizeBytes: 6, sha256: SHA256 }
  ];
}

function header() {
  return buildIngressV2Header({
    packetId: PACKET_ID,
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: "2026-09-04T06:00:00.000Z",
    entries: entries()
  });
}

test("v2 contract fixes the exact six-file stage order", () => {
  const value = header();
  assert.equal(value.schemaVersion, "2");
  assert.equal(value.aggregateSizeBytes, 21);
  assert.deepEqual(value.entries.map(({ name }) => name), entries().map(({ name }) => name));
});

test("v2 contract rejects overlong TTL, reordered entries, and archive/checksum drift", () => {
  const value = header();
  for (const invalid of [
    { ...value, expiresAt: "2026-09-04T06:00:00.001Z" },
    { ...value, entries: [value.entries[1], value.entries[0], ...value.entries.slice(2)] },
    {
      ...value,
      entries: value.entries.map((entry, index) => index === 2
        ? { ...entry, name: "proxy-gateway-other.zip.sha256" }
        : entry)
    }
  ]) {
    assert.throws(
      () => validateIngressV2Header(invalid, { now: NOW }),
      (error) => error instanceof ArtifactIngressV2ContractError
    );
  }
});
