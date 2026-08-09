import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ATOMIC_LOGICAL_RECORD_EXPORTS,
  FOUNDATION_NATIVE_EXPORTS,
  HARDENED_C17_PIE_V1_FLAGS,
  REQUIRED_LINUX_FEATURES
} from "../services/deployment/foundation-contract.mjs";
import { createDurableStore } from "../services/deployment/durable-store.mjs";

const LOGICAL_ID = "foundation-test-rotation-journal-v1";
const PREDECESSOR_SHA256 = "a".repeat(64);

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createMemoryFs() {
  return Object.freeze({ rootFd: 17 });
}

function createRecordingNative(calls, options = {}) {
  const state = options.initialBytes === undefined
    ? Buffer.from('{"state":"previous"}')
    : options.initialBytes === null
      ? null
      : Buffer.from(options.initialBytes);
  let current = state;
  const applied = options.alreadyAppliedBytes ? Buffer.from(options.alreadyAppliedBytes) : null;

  function record(operation, args) {
    calls.push({ operation, args });
  }

  return {
    async durableReadLogical(args) {
      record("durableReadLogical", args);
      if (current === null) throw new Error("durable_record_absent");
      return Object.freeze({ bytes: Buffer.from(current), sha256: sha256Hex(current) });
    },
    async durablePublishNoReplace(args) {
      record("durablePublishNoReplace", args);
      if (current === null) {
        current = Buffer.from(args.bytes);
        return Object.freeze({ outcome: "created", sha256: sha256Hex(current) });
      }
      if (current.equals(args.bytes)) {
        return Object.freeze({ outcome: "already_equal", sha256: sha256Hex(current) });
      }
      return Object.freeze({ outcome: "conflict", sha256: sha256Hex(current) });
    },
    async durableCompareAndSwap(args) {
      record("durableCompareAndSwap", args);
      if (applied !== null) {
        current = Buffer.from(applied);
        return Object.freeze({ outcome: "already_equal", sha256: sha256Hex(current) });
      }
      current = Buffer.from(args.nextBytes);
      return Object.freeze({ outcome: "replaced", sha256: sha256Hex(current) });
    },
    async durableUnlinkVerified(args) {
      record("durableUnlinkVerified", args);
      if (current === null) {
        if (options.unlinkMarker?.logicalId === args.logicalId
            && options.unlinkMarker.expectedSha256 === args.expectedSha256) {
          return Object.freeze({ outcome: "already_absent", present: false });
        }
        throw new Error("durable_unlink_evidence_missing");
      }
      current = null;
      return Object.freeze({ outcome: "removed", present: false });
    }
  };
}

function createAtomicHarness(options = {}) {
  const calls = options.calls ?? [];
  return {
    calls,
    contracts: new Map([[LOGICAL_ID, Object.freeze({ maxBytes: 4096 })]]),
    fsOps: createMemoryFs(),
    native: createRecordingNative(calls, options)
  };
}

test("exports the complete frozen Foundation vectors exactly once", () => {
  assert.deepEqual(ATOMIC_LOGICAL_RECORD_EXPORTS, [
    "durableReadLogical",
    "durablePublishNoReplace",
    "durableCompareAndSwap",
    "durableUnlinkVerified"
  ]);
  assert.equal(FOUNDATION_NATIVE_EXPORTS.length, 15);
  assert.deepEqual(HARDENED_C17_PIE_V1_FLAGS, [
    "-std=c17",
    "-O2",
    "-fPIE",
    "-pie",
    "-fstack-protector-strong",
    "-Wl,-z,relro,-z,now",
    "-Wall",
    "-Wextra",
    "-Werror"
  ]);
  assert.equal(REQUIRED_LINUX_FEATURES.length, 14);
  assert.equal(Object.isFrozen(ATOMIC_LOGICAL_RECORD_EXPORTS), true);
  assert.equal(Object.isFrozen(FOUNDATION_NATIVE_EXPORTS), true);
  assert.equal(Object.isFrozen(HARDENED_C17_PIE_V1_FLAGS), true);
  assert.equal(Object.isFrozen(REQUIRED_LINUX_FEATURES), true);
});

test("accepts only the named dependency object with all four atomic exports", () => {
  const harness = createAtomicHarness();
  assert.throws(
    () => createDurableStore({ contracts: harness.contracts, native: harness.native }),
    /durable_store_dependencies_invalid/
  );
  assert.throws(() => createDurableStore({
    contracts: harness.contracts,
    fsOps: harness.fsOps,
    native: harness.native,
    rootPath: "forbidden"
  }), /durable_store_dependencies_invalid/);
  for (const operation of ATOMIC_LOGICAL_RECORD_EXPORTS) {
    const native = { ...harness.native, [operation]: undefined };
    assert.throws(() => createDurableStore({
      contracts: harness.contracts,
      fsOps: harness.fsOps,
      native
    }), /durable_store_dependencies_invalid/);
  }
});

test("publishes only through the fixed logical record map with exact-byte replay", async () => {
  const calls = [];
  const { contracts, fsOps, native } = createAtomicHarness({ calls, initialBytes: null });
  const store = createDurableStore({ contracts, fsOps, native });
  const bytes = Buffer.from("{}");
  const created = await store.publishImmutable(LOGICAL_ID, bytes);
  const replay = await store.publishImmutable(LOGICAL_ID, Buffer.from("{}"));
  assert.equal(created.outcome, "created");
  assert.equal(replay.outcome, "already_equal");
  assert.equal(created.sha256, sha256Hex(bytes));
  assert.deepEqual(calls.map(({ operation }) => operation), [
    "durablePublishNoReplace",
    "durablePublishNoReplace"
  ]);
  await assert.rejects(() => store.publishImmutable("../../escape", Buffer.from("{}")), /durable_logical_id_unknown/);
  await assert.rejects(() => store.publishImmutable(LOGICAL_ID, Buffer.alloc(4097)), /durable_record_too_large/);
  await assert.rejects(() => store.publishImmutable(LOGICAL_ID, Buffer.from('{"different":true}')), /durable_publish_result_invalid/);
});

test("CAS is one native transaction and never read-then-write", async () => {
  const calls = [];
  const { contracts, fsOps, native } = createAtomicHarness({ calls });
  const store = createDurableStore({ contracts, fsOps, native });
  const result = await store.casCanonical(
    LOGICAL_ID,
    PREDECESSOR_SHA256,
    Buffer.from('{"state":"armed"}')
  );
  assert.equal(result.outcome, "replaced");
  assert.deepEqual(calls.map(({ operation }) => operation), ["durableCompareAndSwap"]);
  assert.equal(calls.some(({ operation }) => operation === "durableReadLogical"), false);
  assert.equal(calls.some(({ operation }) => operation === "durablePublishNoReplace"), false);
});

test("lost-response replay succeeds only for exact successor bytes", async () => {
  const next = Buffer.from('{"state":"in_progress"}');
  const { contracts, fsOps, native } = createAtomicHarness({ alreadyAppliedBytes: next });
  const store = createDurableStore({ contracts, fsOps, native });
  assert.equal((await store.casCanonical(LOGICAL_ID, PREDECESSOR_SHA256, next)).outcome, "already_equal");
  await assert.rejects(() => store.casCanonical(
    LOGICAL_ID,
    PREDECESSOR_SHA256,
    Buffer.from('{"state":"different"}')
  ), /durable_cas_digest_mismatch/);
});

test("verified unlink never treats unexplained absence as replay success", async () => {
  const absentHarness = createAtomicHarness({ initialBytes: null });
  const store = createDurableStore({
    contracts: absentHarness.contracts,
    fsOps: absentHarness.fsOps,
    native: absentHarness.native
  });
  await assert.rejects(() => store.unlinkVerified(LOGICAL_ID, PREDECESSOR_SHA256), /durable_unlink_evidence_missing/);

  const replayHarness = createAtomicHarness({
    initialBytes: null,
    unlinkMarker: { logicalId: LOGICAL_ID, expectedSha256: PREDECESSOR_SHA256 }
  });
  const replay = createDurableStore({
    contracts: replayHarness.contracts,
    fsOps: replayHarness.fsOps,
    native: replayHarness.native
  });
  assert.equal((await replay.unlinkVerified(LOGICAL_ID, PREDECESSOR_SHA256)).outcome, "already_absent");
});

test("readback verifies the native result digest without a mutation", async () => {
  const bytes = Buffer.from('{"state":"stable"}');
  const calls = [];
  const { contracts, fsOps, native } = createAtomicHarness({ calls, initialBytes: bytes });
  const store = createDurableStore({ contracts, fsOps, native });
  assert.deepEqual(await store.readbackExact(LOGICAL_ID, sha256Hex(bytes)), bytes);
  assert.deepEqual(calls.map(({ operation }) => operation), ["durableReadLogical"]);
});
