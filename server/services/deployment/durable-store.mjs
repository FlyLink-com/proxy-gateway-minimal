import { sha256Hex } from "./canonical-json.mjs";
import { ATOMIC_LOGICAL_RECORD_EXPORTS } from "./foundation-contract.mjs";

function hasExactKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function assertSha256(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("durable_expected_digest_invalid");
  }
}

function assertNativeResult(result, operation, outcomes) {
  if (result === null
      || typeof result !== "object"
      || !outcomes.includes(result.outcome)) {
    throw new Error(`${operation}_result_invalid`);
  }
}

export function createDurableStore(dependencies) {
  if (!hasExactKeys(dependencies, ["contracts", "fsOps", "native"])) {
    throw new Error("durable_store_dependencies_invalid");
  }

  const { contracts, fsOps, native } = dependencies;
  if (!(contracts instanceof Map)
      || !Number.isSafeInteger(fsOps?.rootFd)
      || fsOps.rootFd < 0
      || native === null
      || typeof native !== "object"
      || ATOMIC_LOGICAL_RECORD_EXPORTS.some((name) => typeof native[name] !== "function")) {
    throw new Error("durable_store_dependencies_invalid");
  }

  function contractFor(logicalId) {
    if (typeof logicalId !== "string") throw new Error("durable_logical_id_unknown");
    const contract = contracts.get(logicalId);
    if (contract === undefined
        || contract === null
        || !Number.isSafeInteger(contract.maxBytes)
        || contract.maxBytes < 0) {
      throw new Error("durable_logical_id_unknown");
    }
    return contract;
  }

  function copyAndValidateBytes(contract, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length > contract.maxBytes) {
      throw new Error("durable_record_too_large");
    }
    return Buffer.from(bytes);
  }

  async function readbackExact(logicalId, expectedSha256) {
    contractFor(logicalId);
    assertSha256(expectedSha256);
    const result = await native.durableReadLogical({
      directoryFd: fsOps.rootFd,
      logicalId,
      expectedSha256
    });
    if (result === null
        || typeof result !== "object"
        || !Buffer.isBuffer(result.bytes)
        || result.sha256 !== expectedSha256
        || sha256Hex(result.bytes) !== expectedSha256) {
      throw new Error("durable_readback_digest_mismatch");
    }
    return Buffer.from(result.bytes);
  }

  return Object.freeze({
    async publishImmutable(logicalId, bytes) {
      const contract = contractFor(logicalId);
      const ownedBytes = copyAndValidateBytes(contract, bytes);
      const sha256 = sha256Hex(ownedBytes);
      const result = await native.durablePublishNoReplace({
        directoryFd: fsOps.rootFd,
        logicalId,
        bytes: ownedBytes
      });
      assertNativeResult(result, "durable_publish", ["created", "already_equal"]);
      if (result.sha256 !== sha256) throw new Error("durable_publish_digest_mismatch");
      return Object.freeze({ outcome: result.outcome, sha256 });
    },

    async casCanonical(logicalId, expectedSha256, nextBytes) {
      const contract = contractFor(logicalId);
      assertSha256(expectedSha256);
      const ownedNextBytes = copyAndValidateBytes(contract, nextBytes);
      const nextSha256 = sha256Hex(ownedNextBytes);
      const result = await native.durableCompareAndSwap({
        directoryFd: fsOps.rootFd,
        logicalId,
        expectedSha256,
        nextBytes: ownedNextBytes
      });
      assertNativeResult(result, "durable_cas", ["replaced", "already_equal"]);
      if (result.sha256 !== nextSha256) throw new Error("durable_cas_digest_mismatch");
      return Object.freeze({ outcome: result.outcome, sha256: nextSha256 });
    },

    async unlinkVerified(logicalId, expectedSha256) {
      contractFor(logicalId);
      assertSha256(expectedSha256);
      const result = await native.durableUnlinkVerified({
        directoryFd: fsOps.rootFd,
        logicalId,
        expectedSha256
      });
      assertNativeResult(result, "durable_unlink", ["removed", "already_absent"]);
      if (result.present !== false) throw new Error("durable_unlink_result_invalid");
      return Object.freeze({ outcome: result.outcome, present: false });
    },

    readbackExact
  });
}
