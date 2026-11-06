import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import test from "node:test";
import {
  createAgentClient,
  createMemoryLock,
  createMemoryStateStore,
} from "../../../agent/g4/agent-client.mjs";
import {
  createManifestVerifier,
  desiredStateDigest,
} from "../../../agent/g4/manifest.mjs";
import { buildReceiptIdempotencyKey } from "../../../agent/g4/receipt.mjs";
import {
  AGENT_CHANNEL_REFS,
  AGENT_TOKEN,
  createWorker,
} from "./helpers.mjs";
import { AgentRepository, MAX_OVERLAP_MS } from "../src/repositories/agent-repository.mjs";

const BASE = "http://control-plane.local";
const MATERIALS = new Map([
  ["cred-synth-a", Buffer.from("synthetic-material-a")],
  ["cred-synth-b", Buffer.from("synthetic-material-b")],
]);

function headersFor(agent, overrides = {}) {
  return {
    authorization: "Bearer " + (overrides.token ?? agent.token),
    "x-agent-key-id": overrides.keyId ?? agent.keyId,
    "x-agent-node-ref": overrides.nodeRef ?? agent.nodeRef,
    "x-agent-timestamp": overrides.timestamp ?? new Date().toISOString(),
    "x-agent-nonce": overrides.nonce ?? "nonce-" + crypto.randomUUID(),
    "idempotency-key": overrides.idempotencyKey ?? "claim:" + agent.nodeRef + ":" + crypto.randomUUID(),
  };
}

function desiredUrl(agent, channelRefs = agent.channelRefs) {
  const url = new URL(BASE + "/v1/agent/desired-state");
  url.searchParams.set("nodeRef", agent.nodeRef);
  url.searchParams.set("channelRefs", channelRefs.join(","));
  return url.toString();
}

async function fetchDesired(mf, agent, headers = headersFor(agent), channelRefs = agent.channelRefs) {
  return mf.dispatchFetch(desiredUrl(agent, channelRefs), { headers });
}

function receiptFor(agent, envelope, channelRef, status = "applied") {
  const materialDigests = envelope.materials.filter((item) => item.channelRef === channelRef);
  return {
    type: "gccgw_data_plane_apply_receipt",
    nodeRef: agent.nodeRef,
    channelRef,
    generation: envelope.manifest.generation,
    desiredStateRef: envelope.manifest.desiredStateRef,
    materialDigests,
    idempotencyKey: buildReceiptIdempotencyKey({
      desiredStateRef: envelope.manifest.desiredStateRef,
      generation: envelope.manifest.generation,
      channelRef,
    }),
    status,
    detail: { mode: status === "applied" ? "apply" : "dry_run" },
    redacted: true,
  };
}

async function postReceipt(mf, agent, receipt, headers = headersFor(agent)) {
  return mf.dispatchFetch(BASE + "/v1/agent/receipts", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", "idempotency-key": receipt.idempotencyKey },
    body: JSON.stringify(receipt),
  });
}


test("G4 desired-state claims are idempotent and expire without extending their lease", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());

  const idempotencyKey = "claim:" + agent.nodeRef + ":stable-claim-key-00000001";
  const first = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { idempotencyKey, nonce: "nonce-claim-first-000000001" }),
  );
  assert.equal(first.status, 200);
  const firstEnvelope = await first.json();
  assert.ok(Date.parse(firstEnvelope.manifest.expiresAt) - Date.parse(firstEnvelope.manifest.issuedAt) <= 120000);

  const replay = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { idempotencyKey, nonce: "nonce-claim-replay-00000001" }),
  );
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), firstEnvelope);

  const count = await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first();
  assert.equal(count.n, 1);

  const expiredAt = new Date(Date.now() - 1000).toISOString();
  await db.prepare(
    "UPDATE agent_manifest_claims SET lease_until = ? WHERE idempotency_key = ?",
  ).bind(expiredAt, idempotencyKey).run();

  const expired = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { idempotencyKey, nonce: "nonce-claim-expired-0000001" }),
  );
  assert.equal(expired.status, 410);
  assert.equal((await expired.json()).error.code, "claim_expired");

  const freshKey = "claim:" + agent.nodeRef + ":fresh-claim-key-0000000001";
  const fresh = await fetchDesired(mf, agent, headersFor(agent, { idempotencyKey: freshKey }));
  assert.equal(fresh.status, 200);
  const freshEnvelope = await fresh.json();
  assert.notEqual(freshEnvelope.manifest.antiReplayId, firstEnvelope.manifest.antiReplayId);
  const firstClaim = await db.prepare(
    "SELECT status FROM agent_manifest_claims WHERE idempotency_key = ?",
  ).bind(idempotencyKey).first();
  const freshClaim = await db.prepare(
    "SELECT status FROM agent_manifest_claims WHERE idempotency_key = ?",
  ).bind(freshKey).first();
  assert.equal(firstClaim.status, "expired");
  assert.equal(freshClaim.status, "leased");
});

test("G4 desired-state endpoint returns a signed manifest and refs/digests only", async (t) => {
  const { mf, agent } = await createWorker();
  t.after(() => mf.dispose());

  const response = await fetchDesired(mf, agent);
  assert.equal(response.status, 200);
  const envelope = await response.json();
  assert.deepEqual(Object.keys(envelope).sort(), ["manifest", "materials", "signature"]);
  assert.equal(envelope.manifest.nodeRef, agent.nodeRef);
  assert.deepEqual(envelope.manifest.channelRefs, AGENT_CHANNEL_REFS);
  assert.equal(envelope.manifest.generation, "gen-synth-001");
  assert.equal(envelope.manifest.keyId, agent.manifestKeyId);
  assert.deepEqual(
    Object.keys(envelope.materials[0]).sort(),
    ["channelRef", "digest", "edgeCredentialRef"],
  );
  const serialized = JSON.stringify(envelope);
  assert.ok(!serialized.includes("synthetic-material-a"));
  assert.ok(!serialized.includes("synthetic-material-b"));
  assert.ok(!serialized.includes(AGENT_TOKEN));

  const verifier = createManifestVerifier({
    publicKeys: new Map([[agent.manifestKeyId, createPublicKey(agent.manifestPublicKeyPem)]]),
  });
  const manifest = verifier.verify(envelope.manifest, envelope.signature, {
    expectedNodeRef: agent.nodeRef,
    expectedChannelRefs: agent.channelRefs,
  });
  assert.equal(
    manifest.desiredStateDigest,
    await desiredStateDigest({
      nodeRef: manifest.nodeRef,
      channelRefs: manifest.channelRefs,
      generation: manifest.generation,
      desiredStateRef: manifest.desiredStateRef,
      materials: envelope.materials,
    }),
  );
});

test("G4 Agent authentication fails closed on bad token, scope, timestamp and replay", async (t) => {
  const { mf, agent } = await createWorker();
  t.after(() => mf.dispose());

  const wrongToken = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { token: "synth-agent-token-that-is-not-valid-0001" }),
  );
  assert.equal(wrongToken.status, 401);

  const wrongScope = await fetchDesired(
    mf,
    agent,
    headersFor(agent),
    [...agent.channelRefs, "chan-outside-scope"],
  );
  assert.equal(wrongScope.status, 403);

  const stale = await fetchDesired(
    mf,
    agent,
    headersFor(agent, {
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }),
  );
  assert.equal(stale.status, 401);

  const replayHeaders = headersFor(agent, { nonce: "nonce-replay-00000000000001" });
  const first = await fetchDesired(mf, agent, replayHeaders);
  const replay = await fetchDesired(mf, agent, replayHeaders);
  assert.equal(first.status, 200);
  assert.equal(replay.status, 409);
  assert.equal((await replay.json()).error.code, "replay_detected");
});

test("G4 receipt idempotency keys are unambiguous for delimiter-bearing tuple values", async () => {
  const first = buildReceiptIdempotencyKey({
    desiredStateRef: "desired:x",
    generation: "gen",
    channelRef: "channel",
  });
  const second = buildReceiptIdempotencyKey({
    desiredStateRef: "desired",
    generation: "x:gen",
    channelRef: "channel",
  });
  assert.notEqual(first, second);
  assert.match(first, /^receipt:v1:[0-9a-f]{64}$/);
  assert.match(second, /^receipt:v1:[0-9a-f]{64}$/);
});

test("G4 receipt endpoint enforces binding, redaction and idempotent replay", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());

  const desiredResponse = await fetchDesired(mf, agent);
  assert.equal(desiredResponse.status, 200);
  const envelope = await desiredResponse.json();
  const receipt = receiptFor(agent, envelope, agent.channelRefs[0]);

  const first = await postReceipt(mf, agent, receipt);
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { recorded: true, replayed: false });

  const replay = await postReceipt(mf, agent, receipt);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { recorded: false, replayed: true });

  const conflict = await postReceipt(
    mf,
    agent,
    { ...receipt, status: "dry_run", detail: { mode: "dry_run" } },
  );
  assert.equal(conflict.status, 409);

  const unsafe = await postReceipt(
    mf,
    agent,
    { ...receipt, rawMaterial: "must-not-be-accepted" },
  );
  assert.equal(unsafe.status, 400);

  const rows = await db.prepare("SELECT * FROM agent_apply_receipts").all();
  assert.equal(rows.results.length, 1);
  assert.ok(!JSON.stringify(rows.results).includes("must-not-be-accepted"));
  assert.ok(!JSON.stringify(rows.results).includes(AGENT_TOKEN));
});

test("G4 desired-state claims reject per-channel material sets that cannot fit a bounded receipt", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());
  const extra = Array.from({ length: 32 }, (_, index) =>
    db.prepare(
      "INSERT INTO agent_desired_state_materials (desired_state_ref, channel_ref, edge_credential_ref, digest) VALUES (?, ?, ?, ?)",
    ).bind("desired-synth-001", agent.channelRefs[0], "cred-extra-" + String(index).padStart(3, "0"), "a".repeat(64)),
  );
  await db.batch(extra);
  const response = await fetchDesired(mf, agent);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "desired_state_too_large");
  const claims = await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first();
  assert.equal(claims.n, 0);
});

test("G4 receipts preserve an exact historical apply record after desired state revocation", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());
  const desired = await fetchDesired(mf, agent);
  assert.equal(desired.status, 200);
  const envelope = await desired.json();
  await db.prepare(
    "UPDATE agent_desired_states SET status = 'revoked' WHERE desired_state_ref = ?",
  ).bind(envelope.manifest.desiredStateRef).run();
  const receipt = receiptFor(agent, envelope, agent.channelRefs[0]);
  const response = await postReceipt(mf, agent, receipt);
  assert.equal(response.status, 201);
  const stored = await db.prepare(
    "SELECT status FROM agent_apply_receipts WHERE idempotency_key = ?",
  ).bind(receipt.idempotencyKey).first();
  assert.equal(stored.status, "applied");
});

test("G4 receipt generation validation matches the signed manifest safe-segment contract", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());
  await db.prepare(
    "UPDATE agent_desired_states SET generation = ? WHERE desired_state_ref = ?",
  ).bind("_gen-001", "desired-synth-001").run();
  const desired = await fetchDesired(mf, agent);
  assert.equal(desired.status, 200);
  const envelope = await desired.json();
  assert.equal(envelope.manifest.generation, "_gen-001");
  const receipt = receiptFor(agent, envelope, agent.channelRefs[0]);
  const response = await postReceipt(mf, agent, receipt);
  assert.equal(response.status, 201);
});

test("G4 receipt endpoint caps streamed request bodies before JSON parsing", async (t) => {
  const { mf } = await createWorker();
  t.after(() => mf.dispose());

  const oversizedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(16 * 1024 + 1));
    },
  });
  const response = await mf.dispatchFetch(BASE + "/v1/agent/receipts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: oversizedBody,
    duplex: "half",
  });

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "receipt_too_large");
});

test("G4 Agent client replaces a pending claim key when its authorized channel scope changes", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());

  const stateStore = createMemoryStateStore();
  const claimKeys = [];
  let loseFirstResponse = true;
  const transport = {
    async fetchDesiredState({ headers, channelRefs, idempotencyKey }) {
      claimKeys.push(idempotencyKey);
      const response = await fetchDesired(
        mf,
        agent,
        { ...headers, "idempotency-key": idempotencyKey },
        channelRefs,
      );
      if (!response.ok) throw new Error("desired-state HTTP " + response.status);
      const envelope = await response.json();
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new Error("simulated response loss after claim commit");
      }
      return envelope;
    },
    async submitReceipt(receipt, { headers }) {
      const response = await postReceipt(mf, agent, receipt, headers);
      if (!response.ok) throw new Error("receipt HTTP " + response.status);
      await response.json();
    },
  };
  const verifier = createManifestVerifier({
    publicKeys: new Map([[agent.manifestKeyId, createPublicKey(agent.manifestPublicKeyPem)]]),
  });
  const firstClient = createAgentClient({
    nodeRef: agent.nodeRef,
    channelRefs: agent.channelRefs,
    transport,
    materialStore: { async resolve(ref) { return MATERIALS.get(ref); } },
    verifier,
    stateStore,
    lock: createMemoryLock(),
    auth: { keyId: agent.keyId, token: agent.token },
    config: { dryRun: true, applyEnabled: false },
    apply: async () => {},
  });

  const first = await firstClient.runOnce();
  assert.equal(first.status, "retry_later");
  assert.equal(first.stage, "fetch");
  const firstClaim = await db.prepare(
    "SELECT channel_refs_json FROM agent_manifest_claims WHERE idempotency_key = ?",
  ).bind(claimKeys[0]).first();
  assert.deepEqual(JSON.parse(firstClaim.channel_refs_json), [...agent.channelRefs].sort());

  const narrowedChannels = [agent.channelRefs[0]];
  await db.prepare(
    "UPDATE agent_api_credentials SET channel_refs_json = ? WHERE key_id = ?",
  ).bind(JSON.stringify(narrowedChannels), agent.keyId).run();
  const secondClient = createAgentClient({
    nodeRef: agent.nodeRef,
    channelRefs: narrowedChannels,
    transport,
    materialStore: { async resolve(ref) { return MATERIALS.get(ref); } },
    verifier,
    stateStore,
    lock: createMemoryLock(),
    auth: { keyId: agent.keyId, token: agent.token },
    config: { dryRun: true, applyEnabled: false },
    apply: async () => {},
  });

  const second = await secondClient.runOnce();
  assert.equal(second.status, "applied", JSON.stringify(second));
  assert.equal(claimKeys.length, 2);
  assert.notEqual(claimKeys[0], claimKeys[1]);
  const count = await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first();
  assert.equal(count.n, 2);
});

test("G4 Agent client completes the Worker/D1 loop and recovers a lost receipt response without re-applying", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());

  let loseFirstClaimResponse = true;
  let loseFirstReceiptResponse = true;
  let applyCount = 0;
  const transport = {
    async fetchDesiredState({ headers, channelRefs, idempotencyKey }) {
      const response = await fetchDesired(
        mf,
        agent,
        { ...headers, "idempotency-key": idempotencyKey },
        channelRefs,
      );
      if (!response.ok) {
        const error = new Error("desired-state HTTP " + response.status);
        if (response.status === 410) error.code = "claim_expired";
        throw error;
      }
      const envelope = await response.json();
      if (loseFirstClaimResponse) {
        loseFirstClaimResponse = false;
        throw new Error("simulated response loss after claim commit");
      }
      return envelope;
    },
    async submitReceipt(receipt, { headers }) {
      const response = await postReceipt(mf, agent, receipt, headers);
      if (!response.ok) throw new Error("receipt HTTP " + response.status);
      await response.json();
      if (loseFirstReceiptResponse) {
        loseFirstReceiptResponse = false;
        throw new Error("simulated response loss after Worker commit");
      }
    },
  };
  const verifier = createManifestVerifier({
    publicKeys: new Map([[agent.manifestKeyId, createPublicKey(agent.manifestPublicKeyPem)]]),
  });
  const client = createAgentClient({
    nodeRef: agent.nodeRef,
    channelRefs: agent.channelRefs,
    transport,
    materialStore: {
      async resolve(ref) {
        const bytes = MATERIALS.get(ref);
        if (!bytes) throw new Error("unknown synthetic ref");
        return bytes;
      },
    },
    verifier,
    stateStore: createMemoryStateStore(),
    lock: createMemoryLock(),
    auth: { keyId: agent.keyId, token: agent.token },
    config: { dryRun: false, applyEnabled: true },
    apply: async () => { applyCount += 1; },
  });

  const first = await client.runOnce();
  assert.equal(first.status, "retry_later");
  assert.equal(first.stage, "fetch");
  assert.equal(applyCount, 0);
  const firstClaimCount = await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first();
  assert.equal(firstClaimCount.n, 1);

  const second = await client.runOnce();
  assert.equal(second.status, "retry_later");
  assert.equal(second.stage, "receipt");
  assert.equal(applyCount, 1);
  const afterSecond = await db.prepare("SELECT COUNT(*) AS n FROM agent_apply_receipts").first();
  assert.equal(afterSecond.n, 1);
  const secondClaimCount = await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first();
  assert.equal(secondClaimCount.n, 1);

  const third = await client.runOnce();
  assert.equal(third.status, "unchanged");
  assert.equal(third.receiptsRecovered, 2);
  assert.equal(applyCount, 1);
  const afterThird = await db.prepare("SELECT COUNT(*) AS n FROM agent_apply_receipts").first();
  assert.equal(afterThird.n, 2);
  const thirdClaimCount = await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first();
  assert.equal(thirdClaimCount.n, 2);
  const completedClaim = await db.prepare(
    "SELECT status FROM agent_manifest_claims WHERE status = ? LIMIT 1",
  ).bind("completed").first();
  assert.equal(completedClaim.status, "completed");
});

test("G4 credential rotation records new-key authentication before retiring the old key", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());

  const repository = new AgentRepository(db);
  const nextKeyId = "agent-key-synth-2";
  const nextToken = "synth-agent-token-next-key-for-local-g4-20261106";
  const nowIso = new Date().toISOString();
  await repository.beginRotation({
    currentKeyId: agent.keyId,
    nextKeyId,
    nextToken,
    nowIso,
    overlapMs: MAX_OVERLAP_MS,
  });
  await assert.rejects(
    repository.revokeAfterRotation(agent.keyId),
    (error) => error.code === "rotation_ack_required",
  );

  const newKeyResponse = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { keyId: nextKeyId, token: nextToken }),
  );
  assert.equal(newKeyResponse.status, 200);
  const nextCredential = await repository.findCredential(nextKeyId);
  assert.ok(nextCredential.auth_confirmed_at);

  const rotation = await repository.revokeAfterRotation(agent.keyId);
  assert.equal(rotation.activeKeyId, nextKeyId);
  assert.equal((await repository.findCredential(agent.keyId)).status, "revoked");
  assert.equal((await repository.findCredential(nextKeyId)).status, "active");

  const oldKeyResponse = await fetchDesired(mf, agent);
  assert.equal(oldKeyResponse.status, 401);
  const newKeyAgain = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { keyId: nextKeyId, token: nextToken }),
  );
  assert.equal(newKeyAgain.status, 200);
});

test("G4 a same-scope credential rotation can replay an unacknowledged claim", async (t) => {
  const { mf, agent } = await createWorker();
  t.after(() => mf.dispose());

  const idempotencyKey = "claim:" + agent.nodeRef + ":claim-before-rotation-00000001";
  const first = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { idempotencyKey, nonce: "nonce-claim-old-key-0000001" }),
  );
  assert.equal(first.status, 200);
  const originalEnvelope = await first.json();

  const repository = new AgentRepository(await mf.getD1Database("CONTROL_DB"));
  const nextKeyId = "agent-key-synth-claim-replay";
  const nextToken = "synth-agent-token-claim-replay-after-rotation-20261106";
  await repository.beginRotation({
    currentKeyId: agent.keyId,
    nextKeyId,
    nextToken,
    overlapMs: MAX_OVERLAP_MS,
  });
  const nextAuth = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { keyId: nextKeyId, token: nextToken }),
  );
  assert.equal(nextAuth.status, 200);

  const replay = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { keyId: nextKeyId, token: nextToken, idempotencyKey, nonce: "nonce-claim-new-key-0000001" }),
  );
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), originalEnvelope);
});

test("G4 expired overlap revokes only the candidate and retains the current key", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());

  const repository = new AgentRepository(db);
  const nextKeyId = "agent-key-synth-expired";
  const nextToken = "synth-agent-token-expired-key-for-local-g4";
  await repository.beginRotation({
    currentKeyId: agent.keyId,
    nextKeyId,
    nextToken,
    overlapMs: MAX_OVERLAP_MS,
  });
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  const activatedAt = new Date(Date.parse(expiredAt) - MAX_OVERLAP_MS).toISOString();
  await db.prepare(
    "UPDATE agent_api_credentials SET activated_at = ?, overlap_expires_at = ? WHERE key_id = ?",
  ).bind(activatedAt, expiredAt, nextKeyId).run();

  const expiredResponse = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { keyId: nextKeyId, token: nextToken }),
  );
  assert.equal(expiredResponse.status, 401);
  assert.equal((await repository.findCredential(nextKeyId)).status, "revoked");
  assert.equal((await repository.findCredential(agent.keyId)).status, "active");
  const events = await db.prepare(
    "SELECT event_type FROM agent_credential_events WHERE key_id = ?",
  ).bind(nextKeyId).all();
  assert.ok(events.results.some((event) => event.event_type === "overlap_expired"));
});

test("G4 an expired overlap blocks automatic rotations until an explicit manual ruling clears it", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());
  const repository = new AgentRepository(db);
  const expiredKeyId = "agent-key-synth-expired-ruling";
  const expiredToken = "synth-agent-token-expired-ruling-candidate-20261106";
  const startedAt = new Date(Date.now() - MAX_OVERLAP_MS - 5000);
  const expiredAt = new Date(startedAt.getTime() + MAX_OVERLAP_MS).toISOString();
  await repository.beginRotation({
    currentKeyId: agent.keyId,
    nextKeyId: expiredKeyId,
    nextToken: expiredToken,
    nowIso: startedAt.toISOString(),
    overlapMs: MAX_OVERLAP_MS,
  });
  await repository.expireOverlap(expiredKeyId, new Date().toISOString());
  await assert.rejects(
    repository.beginRotation({
      currentKeyId: agent.keyId,
      nextKeyId: "agent-key-synth-after-block",
      nextToken: "synth-agent-token-after-block-20261106",
    }),
    (error) => error.code === "rotation_exception_active",
  );
  await repository.clearRotationException({
    currentKeyId: agent.keyId,
    expiredCandidateKeyId: expiredKeyId,
    manualRulingRef: "manual-ruling-2026-11-06-001",
  });
  const next = await repository.beginRotation({
    currentKeyId: agent.keyId,
    nextKeyId: "agent-key-synth-after-ruling",
    nextToken: "synth-agent-token-after-ruling-20261106",
  });
  assert.equal(next.nextKeyId, "agent-key-synth-after-ruling");
});

test("G4 concurrent beginRotation calls create exactly one active candidate", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());

  let arrivals = 0;
  let releaseBarrier;
  const barrier = new Promise((resolve) => { releaseBarrier = resolve; });
  const racingDb = {
    prepare(sql) {
      const statement = db.prepare(sql);
      if (sql.includes("WHERE rotation_from_key_id = ? AND status = 'overlap' LIMIT 1")) {
        return {
          bind(...values) {
            const bound = statement.bind(...values);
            return {
              async first() {
                const result = await bound.first();
                arrivals += 1;
                if (arrivals === 2) releaseBarrier();
                await barrier;
                return result;
              },
            };
          },
        };
      }
      return statement;
    },
    batch: db.batch.bind(db),
  };
  const repository = new AgentRepository(racingDb);
  const outcomes = await Promise.allSettled([
    repository.beginRotation({
      currentKeyId: agent.keyId,
      nextKeyId: "agent-key-concurrent-a",
      nextToken: "synth-agent-token-concurrent-a-20261106",
    }),
    repository.beginRotation({
      currentKeyId: agent.keyId,
      nextKeyId: "agent-key-concurrent-b",
      nextToken: "synth-agent-token-concurrent-b-20261106",
    }),
  ]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = outcomes.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.code, "rotation_in_progress");
  const candidates = await db.prepare(
    "SELECT key_id FROM agent_api_credentials WHERE rotation_from_key_id = ? AND status = 'overlap'",
  ).bind(agent.keyId).all();
  assert.equal(candidates.results.length, 1);
});

test("G4 rotation race never retires the current key if the candidate is leaked before promotion", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());
  const nextKeyId = "agent-key-synth-race";
  const nextToken = "synth-agent-token-race-candidate-20261106";
  const setupRepository = new AgentRepository(db);
  await setupRepository.beginRotation({
    currentKeyId: agent.keyId,
    nextKeyId,
    nextToken,
    overlapMs: MAX_OVERLAP_MS,
  });
  const auth = await fetchDesired(
    mf,
    agent,
    headersFor(agent, { keyId: nextKeyId, token: nextToken }),
  );
  assert.equal(auth.status, 200);

  let injectLeak = true;
  const racingDb = {
    prepare: db.prepare.bind(db),
    batch: async (statements) => {
      if (injectLeak) {
        injectLeak = false;
        await new AgentRepository(db).revokeForLeak(nextKeyId);
      }
      return db.batch(statements);
    },
  };
  const racingRepository = new AgentRepository(racingDb);
  await assert.rejects(
    racingRepository.revokeAfterRotation(agent.keyId),
    (error) => error.code === "rotation_conflict",
  );
  assert.equal((await setupRepository.findCredential(agent.keyId)).status, "active");
  assert.equal((await setupRepository.findCredential(nextKeyId)).status, "revoked");
});

test("G4 emergency leak revocation is immediate and scoped to Agent communication keys", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());

  const repository = new AgentRepository(db);
  const nextKeyId = "agent-key-synth-leak-successor";
  const nextToken = "synth-agent-token-leak-successor-for-local-g4";
  await repository.beginRotation({
    currentKeyId: agent.keyId,
    nextKeyId,
    nextToken,
    overlapMs: MAX_OVERLAP_MS,
  });
  assert.equal(await repository.revokeForLeak(agent.keyId), true);
  assert.equal((await repository.findCredential(agent.keyId)).status, "revoked");
  assert.equal((await repository.findCredential(nextKeyId)).status, "active");
  const event = await db.prepare(
    "SELECT event_type FROM agent_credential_events WHERE key_id = ?",
  ).bind(agent.keyId).first();
  assert.equal(event.event_type, "key_revoked_leak");
});

test("G4 Agent signing fails closed when the Worker signing secret is absent", async (t) => {
  const { mf, agent } = await createWorker({ withAgentSigning: false });
  t.after(() => mf.dispose());

  const response = await fetchDesired(mf, agent);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "signing_unavailable");
});
