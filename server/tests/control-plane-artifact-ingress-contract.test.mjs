import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactIngressContractError,
  buildIngressHeader,
  validateIngressHeader
} from "../../scripts/control-plane-artifact-ingress-contract.mjs";

const NOW = "2026-09-03T06:00:00.000Z";
const SOURCE_COMMIT = "a".repeat(40);
const SHA256 = "b".repeat(64);

function entries() {
  return [
    { name: "source-archive", sizeBytes: 11, sha256: SHA256 },
    { name: "dependency-artifact", sizeBytes: 13, sha256: SHA256 },
    { name: "manifest", sizeBytes: 17, sha256: SHA256 },
    { name: "checksum", sizeBytes: 19, sha256: SHA256 }
  ];
}

test("buildIngressHeader fixes the only accepted object order and a bounded TTL", () => {
  const header = buildIngressHeader({
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: "2026-09-04T06:00:00.000Z",
    entries: entries()
  });

  assert.deepEqual(header.entries.map((entry) => entry.name), [
    "source-archive",
    "dependency-artifact",
    "manifest",
    "checksum"
  ]);
  assert.equal(header.aggregateSizeBytes, 60);
  assert.equal(validateIngressHeader(header, { now: NOW }).sourceCommit, SOURCE_COMMIT);
});

test("ingress headers fail closed for TTL, path-like labels, and source drift", () => {
  const header = buildIngressHeader({
    sourceCommit: SOURCE_COMMIT,
    issuedAt: NOW,
    expiresAt: "2026-09-04T06:00:00.000Z",
    entries: entries()
  });

  assert.throws(
    () => validateIngressHeader({ ...header, expiresAt: "2026-09-04T06:00:00.001Z" }, { now: NOW }),
    (error) => error instanceof ArtifactIngressContractError && error.code === "artifact_ingress_expiry_invalid"
  );
  assert.throws(
    () => validateIngressHeader({
      ...header,
      entries: [{ ...header.entries[0], name: "../source-archive" }, ...header.entries.slice(1)]
    }, { now: NOW }),
    (error) => error instanceof ArtifactIngressContractError && error.code === "artifact_ingress_entry_invalid"
  );
  assert.throws(
    () => validateIngressHeader({ ...header, sourceCommit: "not-a-commit" }, { now: NOW }),
    (error) => error instanceof ArtifactIngressContractError && error.code === "artifact_ingress_source_invalid"
  );
});
