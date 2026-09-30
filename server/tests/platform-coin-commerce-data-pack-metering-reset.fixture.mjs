import { fullMeteringDigest } from "../../scripts/lib/full-metering-journal.mjs";

// Control-store unit tests attest synthetic collector receipts explicitly.
// This is not journal execution or physical/runtime evidence.
export function syntheticMeteringContinuation(proof, overrides = {}) {
  const previousCheckpointDigest = "b".repeat(64);
  return {
    version: 1, activationId: "synthetic_pack_reset_activation",
    context: { databaseIdentityDigest: "c".repeat(64), scopeDigest: "d".repeat(64) },
    previousSequence: 3, sequence: 4, previousCheckpointDigest,
    identityDigest: "e".repeat(64), proofDigest: fullMeteringDigest(proof),
    archiveName: `material-before-${previousCheckpointDigest}.json`,
    completedAt: "2026-10-01T00:00:01.000Z", ...overrides
  };
}
