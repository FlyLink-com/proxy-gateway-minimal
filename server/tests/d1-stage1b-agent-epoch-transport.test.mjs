// D1 Stage 1B — Agent transport writer-epoch forwarding.
//
// Synthetic fixtures only (throwaway Ed25519 keys, fake node/channel
// refs, in-memory stub transport), mirroring server/tests/
// agent-g4-contract.test.mjs. Nothing here connects to BWH, a Worker,
// or any real control plane. The writer epoch is only ever supplied by
// a test-controlled coordinator receipt provider; it is never guessed
// or defaulted by the client.

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createAgentClient,
  createMemoryLock,
  createMemoryStateStore,
  isValidWriterEpoch,
  writerErrorCode,
} from "../../agent/g4/agent-client.mjs";
import {
  createManifestVerifier,
  desiredStateDigest,
  signManifest,
} from "../../agent/g4/manifest.mjs";
import { buildChannelReceipt } from "../../agent/g4/receipt.mjs";

const NOW = Date.parse("2026-06-11T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const KEY_ID = "manifest-key-synth-1";
const NODE = "node-synth-01";
const CHANNELS = ["chan-synth-hy2", "chan-synth-vless"];

const MATERIAL_A = Buffer.from("synthetic-material-a");
const MATERIAL_B = Buffer.from("synthetic-material-b");
const MATERIALS = [
  { channelRef: "chan-synth-hy2", edgeCredentialRef: "cred-synth-a", bytes: MATERIAL_A },
  { channelRef: "chan-synth-vless", edgeCredentialRef: "cred-synth-b", bytes: MATERIAL_B },
];

let replayCounter = 0;
function makeDesired({ generation = "gen-1" } = {}) {
  const materials = MATERIALS.map((m) => ({
    channelRef: m.channelRef,
    edgeCredentialRef: m.edgeCredentialRef,
    digest: createHash("sha256").update(m.bytes).digest("hex"),
  }));
  const manifest = {
    nodeRef: NODE,
    channelRefs: [...CHANNELS],
    generation,
    desiredStateRef: `desired-${generation}`,
    desiredStateDigest: desiredStateDigest({
      nodeRef: NODE,
      channelRefs: CHANNELS,
      generation,
      desiredStateRef: `desired-${generation}`,
      materials,
    }),
    issuedAt: iso(NOW - 60_000),
    expiresAt: iso(NOW + 600_000),
    antiReplayId: `arp-synth-${(replayCounter += 1)}`,
    keyId: KEY_ID,
  };
  return { manifest, signature: signManifest(manifest, privateKey), materials };
}

function makeVerifier() {
  return createManifestVerifier({
    publicKeys: new Map([[KEY_ID, publicKey]]),
    now: () => new Date(NOW),
  });
}

function writerError(code, statusCode) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function makeClient(overrides = {}) {
  const calls = { apply: 0, fetchHeaders: [], submitted: [], fetchCalls: 0 };
  const transport = overrides.transport ?? {
    async fetchDesiredState(args) {
      calls.fetchCalls += 1;
      calls.fetchHeaders.push(args?.headers ?? {});
      return makeDesired({ generation: "gen-1" });
    },
    async submitReceipt(receipt, { headers } = {}) {
      calls.submitted.push({ receipt, headers: headers ?? {} });
    },
  };
  const client = createAgentClient({
    nodeRef: NODE,
    channelRefs: CHANNELS,
    transport,
    materialStore: overrides.materialStore ?? {
      async resolve(ref) {
        const found = MATERIALS.find((m) => m.edgeCredentialRef === ref);
        if (!found) throw new Error(`unknown ref ${ref}`);
        return found.bytes;
      },
    },
    verifier: overrides.verifier ?? makeVerifier(),
    stateStore: overrides.stateStore ?? createMemoryStateStore(),
    lock: overrides.lock ?? createMemoryLock(),
    apply: overrides.apply ?? (async () => { calls.apply += 1; }),
    config: overrides.config ?? { dryRun: false, applyEnabled: true },
    ...(overrides.epochProvider !== undefined ? { epochProvider: overrides.epochProvider } : {}),
    ...(overrides.writerEpochForwarding !== undefined
      ? { writerEpochForwarding: overrides.writerEpochForwarding }
      : {}),
  });
  return { client, calls };
}

test("S1B-AGT-1: writer-epoch forwarding is off by default and sends no header", async () => {
  const { client, calls } = makeClient();
  const result = await client.runOnce();
  assert.equal(result.status, "applied");
  assert.equal(calls.fetchHeaders.length, 1);
  assert.ok(!("x-writer-epoch" in calls.fetchHeaders[0]), "no epoch header without forwarding");
  assert.equal(calls.submitted.length, 2);
  for (const { headers } of calls.submitted) {
    assert.ok(!("x-writer-epoch" in headers), "no epoch header without forwarding");
  }
});

test("S1B-AGT-2: forwarding attaches the coordinator epoch to fetch and receipt calls", async () => {
  const { client, calls } = makeClient({
    writerEpochForwarding: true,
    epochProvider: () => "3",
  });
  const result = await client.runOnce();
  assert.equal(result.status, "applied");
  assert.equal(calls.fetchHeaders[0]["x-writer-epoch"], "3");
  assert.equal(calls.submitted.length, 2);
  for (const { headers } of calls.submitted) {
    assert.equal(headers["x-writer-epoch"], "3");
  }
});

test("S1B-AGT-3: forwarding without an available epoch fails closed before any call", async () => {
  const stateStore = createMemoryStateStore();
  const { client, calls } = makeClient({
    stateStore,
    writerEpochForwarding: true,
    epochProvider: () => null,
  });
  const result = await client.runOnce();
  assert.equal(result.status, "retry_later");
  assert.equal(result.stage, "fetch");
  assert.equal(result.code, "writer_epoch_required");
  assert.equal(calls.fetchCalls, 0, "no transport call may be made without an epoch");
  assert.equal(calls.apply, 0);
  const state = await stateStore.load();
  assert.ok(state.pendingClaim, "the pending claim is preserved for the next cycle");
});

test("S1B-AGT-4: malformed coordinator epochs fail closed without a transport call", async () => {
  for (const badEpoch of ["007", "0", "2147483648", "abc", "1.5", ""]) {
    const { client, calls } = makeClient({
      writerEpochForwarding: true,
      epochProvider: () => badEpoch,
    });
    const result = await client.runOnce();
    assert.equal(result.status, "retry_later", `epoch ${JSON.stringify(badEpoch)}`);
    assert.equal(result.code, "writer_epoch_invalid", `epoch ${JSON.stringify(badEpoch)}`);
    assert.equal(calls.fetchCalls, 0, `epoch ${JSON.stringify(badEpoch)}`);
    assert.equal(calls.apply, 0);
  }
});

test("S1B-AGT-5: a stale epoch on fetch retries later with the code preserved", async () => {
  const stateStore = createMemoryStateStore();
  const transport = {
    async fetchDesiredState() {
      throw writerError("writer_epoch_stale", 409);
    },
    async submitReceipt() {},
  };
  const { client, calls } = makeClient({
    stateStore,
    transport,
    writerEpochForwarding: true,
    epochProvider: () => "2",
  });
  const result = await client.runOnce();
  assert.equal(result.status, "retry_later");
  assert.equal(result.stage, "fetch");
  assert.equal(result.code, "writer_epoch_stale");
  assert.equal(calls.apply, 0);
  const state = await stateStore.load();
  assert.ok(state.pendingClaim, "the pending claim is preserved after a stale epoch");
  assert.equal(state.generation, undefined, "no generation is recorded on a rejected fetch");
});

test("S1B-AGT-6: frozen authority on fetch retries later with no local fallback", async () => {
  const stateStore = createMemoryStateStore();
  const transport = {
    async fetchDesiredState() {
      throw writerError("writer_authority_not_d1", 503);
    },
    async submitReceipt() {},
  };
  const { client, calls } = makeClient({
    stateStore,
    transport,
    writerEpochForwarding: true,
    epochProvider: () => "3",
  });
  const result = await client.runOnce();
  assert.equal(result.status, "retry_later");
  assert.equal(result.stage, "fetch");
  assert.equal(result.code, "writer_authority_not_d1");
  assert.equal(calls.apply, 0, "frozen authority must not trigger a local apply");
  const state = await stateStore.load();
  assert.equal(state.generation, undefined);
});

test("S1B-AGT-7: a lost receipt acknowledgment retries with the same idempotency key", async () => {
  const stateStore = createMemoryStateStore();
  let submitAttempts = 0;
  const submittedKeys = [];
  const transport = {
    async fetchDesiredState(args) {
      return makeDesired({ generation: "gen-1" });
    },
    async submitReceipt(receipt, { headers } = {}) {
      submitAttempts += 1;
      submittedKeys.push(receipt.idempotencyKey);
      assert.equal(headers["x-writer-epoch"], "3", "recovered receipts also carry the epoch");
      if (submitAttempts === 1) throw new Error("synthetic ack lost");
    },
  };
  const { client, calls } = makeClient({
    stateStore,
    transport,
    writerEpochForwarding: true,
    epochProvider: () => "3",
  });
  const first = await client.runOnce();
  assert.equal(first.status, "retry_later");
  assert.equal(first.stage, "receipt");
  assert.equal(calls.apply, 1, "apply runs exactly once despite the lost ack");
  const midState = await stateStore.load();
  assert.equal(midState.pendingReceipts.length, 2, "receipts stay pending after a lost ack");

  const second = await client.runOnce();
  assert.equal(second.status, "unchanged", "the generation is already recorded");
  assert.equal(second.receiptsRecovered, 2);
  assert.equal(calls.apply, 1, "the retry must not re-apply");
  assert.equal(submitAttempts, 3, "two pending receipts are resubmitted once each");
  assert.equal(submittedKeys[1], submittedKeys[0], "resubmission reuses the receipt idempotency key");
  assert.notEqual(submittedKeys[2], submittedKeys[0], "the other channel has its own idempotency key");
  const endState = await stateStore.load();
  assert.deepEqual(endState.pendingReceipts, []);
});

test("S1B-AGT-8: recovered pending receipts are resubmitted with the epoch header", async () => {
  const receipt = buildChannelReceipt({
    nodeRef: NODE,
    channelRef: CHANNELS[0],
    generation: "gen-1",
    desiredStateRef: "desired-gen-1",
    materialDigests: [{
      channelRef: CHANNELS[0],
      edgeCredentialRef: "cred-synth-a",
      digest: createHash("sha256").update(MATERIAL_A).digest("hex"),
    }],
    idempotencyKey: "receipt-synth-recovery-1",
    status: "applied",
    detail: { mode: "apply" },
  });
  const stateStore = createMemoryStateStore({
    pendingReceipts: [receipt],
    deferredReceipts: [],
  });
  const submitted = [];
  const transport = {
    async fetchDesiredState() {
      return makeDesired({ generation: "gen-1" });
    },
    async submitReceipt(receiptArg, { headers } = {}) {
      submitted.push({ receipt: receiptArg, headers });
    },
  };
  const { client } = makeClient({
    stateStore,
    transport,
    writerEpochForwarding: true,
    epochProvider: () => "5",
  });
  const result = await client.runOnce();
  assert.equal(result.status, "applied");
  assert.equal(submitted.length, 3, "one recovered receipt plus two new receipts");
  assert.equal(submitted[0].receipt.idempotencyKey, "receipt-synth-recovery-1");
  assert.equal(submitted[0].headers["x-writer-epoch"], "5");
});

test("S1B-AGT-9: isValidWriterEpoch accepts only the wire format", () => {
  for (const valid of ["1", "2147483647", "42"]) assert.equal(isValidWriterEpoch(valid), true);
  for (const invalid of ["0", "01", "2147483648", "-1", "1.5", "", "abc", null, undefined, 1, 1.5, {}, []]) {
    assert.equal(isValidWriterEpoch(invalid), false, `expected invalid: ${JSON.stringify(invalid)}`);
  }
  assert.equal(writerErrorCode({ code: "writer_epoch_stale" }), "writer_epoch_stale");
  assert.equal(writerErrorCode({ code: "writer_authority_not_d1" }), "writer_authority_not_d1");
  assert.equal(writerErrorCode({ code: "claim_expired" }), null);
  assert.equal(writerErrorCode(new Error("plain")), null);
  assert.equal(writerErrorCode(null), null);
});

test("S1B-AGT-10: a stale epoch on receipt submission keeps receipts pending", async () => {
  const stateStore = createMemoryStateStore();
  const transport = {
    async fetchDesiredState() {
      return makeDesired({ generation: "gen-1" });
    },
    async submitReceipt() {
      throw writerError("writer_epoch_stale", 409);
    },
  };
  const { client, calls } = makeClient({
    stateStore,
    transport,
    writerEpochForwarding: true,
    epochProvider: () => "2",
  });
  const result = await client.runOnce();
  assert.equal(result.status, "retry_later");
  assert.equal(result.stage, "receipt");
  assert.equal(result.code, "writer_epoch_stale");
  assert.equal(calls.apply, 1);
  const state = await stateStore.load();
  assert.equal(state.pendingReceipts.length, 2, "receipts stay pending after a stale epoch");
});

test("S1B-AGT-11: a numeric coordinator epoch is normalized to the wire header", async () => {
  // The coordinator receipt carries the epoch as a number; the wire
  // header is always its decimal ASCII string.
  const { client, calls } = makeClient({
    writerEpochForwarding: true,
    epochProvider: () => 3,
  });
  await client.runOnce();
  assert.equal(calls.fetchHeaders[0]["x-writer-epoch"], "3");
  assert.ok(calls.fetchCalls > 0, "the fetch ran with the normalized epoch");
  // Non-integer / out-of-range numbers stay invalid.
  for (const badEpoch of [0, 1.5, 2147483648, -1]) {
    const rejected = makeClient({
      writerEpochForwarding: true,
      epochProvider: () => badEpoch,
    });
    const outcome = await rejected.client.runOnce();
    assert.equal(outcome.status, "retry_later", `epoch ${badEpoch}`);
    assert.equal(outcome.code, "writer_epoch_invalid", `epoch ${badEpoch}`);
    assert.equal(rejected.calls.fetchCalls, 0, `epoch ${badEpoch}`);
  }
});
