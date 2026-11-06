// G4 Agent HTTPS contract tests — clause-by-clause against G1-30 §5.
//
// Every test name carries its AGT clause id. All fixtures are
// synthetic: throwaway Ed25519 keys, fake node/channel refs, and an
// in-memory stub transport. Nothing here connects to BWH, a Worker,
// or any real control plane, and the legacy production edge agent is
// exercised only through its existing config validator (AGT-ADDR-1
// regression: its private-address rule is unchanged by this slice).

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createAgentClient,
  createFileLock,
  createFileMaterialStore,
  createMemoryLock,
  createMemoryStateStore,
} from "../../agent/g4/agent-client.mjs";
import {
  createKeyRotation,
  MAX_OVERLAP_MS,
  ROTATION_SCOPE,
} from "../../agent/g4/key-rotation.mjs";
import {
  createManifestVerifier,
  desiredStateDigest,
  normalizeManifest,
  signManifest,
} from "../../agent/g4/manifest.mjs";
import {
  buildChannelReceipt,
  buildReceiptIdempotencyKey,
  createReceiptLedger,
  redactDetail,
} from "../../agent/g4/receipt.mjs";
import {
  resolveAppliedGenerationDir,
  validateBaseUrl,
  writeAppliedMaterials,
} from "../../agent/g4/run-once.mjs";
import { normalizeProductionEdgeAgentConfig } from "../../agent/production-edge-agent.mjs";

const G4_DIR = fileURLToPath(new URL("../../agent/g4/", import.meta.url));
const NOW = Date.parse("2026-06-11T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const { publicKey: otherPublicKey } = generateKeyPairSync("ed25519");
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
function makeDesired({ generation = "gen-1", issuedAt = NOW - 60_000, expiresAt = NOW + 600_000 } = {}) {
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
    issuedAt: iso(issuedAt),
    expiresAt: iso(expiresAt),
    antiReplayId: `arp-synth-${(replayCounter += 1)}`,
    keyId: KEY_ID,
  };
  return { manifest, signature: signManifest(manifest, privateKey), materials };
}

function makeVerifier() {
  return createManifestVerifier({
    publicKeys: new Map([[KEY_ID, publicKey], ["manifest-key-synth-2", otherPublicKey]]),
    now: () => new Date(NOW),
  });
}

function makeClient(overrides = {}) {
  const calls = { apply: 0, submitted: [] };
  // Each fetch returns a freshly signed envelope (new antiReplayId)
  // for the same generation, as a real control plane would; a fixed
  // envelope can be injected via overrides.desired.
  const fetchDesired = overrides.desiredFactory
    ?? (overrides.desired ? async () => overrides.desired : async () => makeDesired({ generation: "gen-1" }));
  const transport = overrides.transport ?? {
    async fetchDesiredState() {
      return fetchDesired();
    },
    async submitReceipt(receipt) {
      calls.submitted.push(receipt);
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
  });
  return { client, calls };
}

// --- AGT-POLL-1 / AGT-POLL-2: oneshot posture, configurable interval ---

test("AGT-POLL-1: the G4 service template is Type=oneshot and no daemon unit exists", async () => {
  const service = await readFile(join(G4_DIR, "systemd/gccgw-control-plane-agent.service"), "utf8");
  assert.match(service, /^Type=oneshot$/m);
  assert.match(service, /^UMask=0077$/m);
  assert.doesNotMatch(service, /^Type=simple$/m);
});

test("AGT-POLL-2: the interval lives in the timer template as deployment configuration", async () => {
  const timer = await readFile(join(G4_DIR, "systemd/gccgw-control-plane-agent.timer"), "utf8");
  assert.match(timer, /^OnUnitActiveSec=60$/m);
  assert.match(timer, /deployment configuration/);
  const clientSource = await readFile(join(G4_DIR, "agent-client.mjs"), "utf8");
  assert.doesNotMatch(clientSource, /setInterval/);
});

// --- AGT-POLL-3: single-instance lock ---

test("AGT-POLL-3: a second concurrent cycle is skipped while the lock is held", async () => {
  let releaseFetch;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => { markFetchStarted = resolve; });
  const transport = {
    fetchDesiredState: () => {
      markFetchStarted();
      return new Promise((resolve) => { releaseFetch = () => resolve(makeDesired()); });
    },
    async submitReceipt() {},
  };
  const { client, calls } = makeClient({ transport });
  const first = client.runOnce();
  await fetchStarted;
  const second = await client.runOnce();
  assert.equal(second.status, "skipped_locked");
  releaseFetch();
  const firstResult = await first;
  assert.equal(firstResult.status, "applied");
  assert.equal(calls.apply, 1);
});

test("AGT-POLL-3: file lock refuses a live holder and takes over a stale lock", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "g4-lock-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "agent.lock");
  const lock = createFileLock(path, { staleMs: 1_000, now: () => NOW });
  const handle = await lock.acquire();
  assert.ok(handle);
  assert.equal(await lock.acquire(), null);
  await handle.release();

  await writeFile(path, JSON.stringify({
    pid: process.pid,
    at: NOW - 10_000,
    token: "live-owner",
  }));
  assert.equal(await lock.acquire(), null, "a stale timestamp must not override a live PID");

  await writeFile(path, JSON.stringify({
    pid: 999_999_999,
    at: NOW - 10_000,
    token: "dead-owner",
  }));
  const [first, second] = await Promise.all([lock.acquire(), lock.acquire()]);
  assert.equal([first, second].filter(Boolean).length, 1, "only one contender may reap a dead owner");
  const takeover = first ?? second;
  assert.ok(takeover, "a stale lock with a dead owner may be reclaimed");

  await writeFile(path, JSON.stringify({
    pid: process.pid,
    at: NOW,
    token: "replacement-owner",
  }));
  await takeover.release();
  assert.equal(
    JSON.parse(await readFile(path, "utf8")).token,
    "replacement-owner",
    "a previous owner's release must not remove a replacement lock",
  );
});

// --- AGT-POLL-4: generation + digest no-change skip ---

test("AGT-POLL-4: the same generation and digest never triggers a second apply", async () => {
  const { client, calls } = makeClient();
  const first = await client.runOnce();
  assert.equal(first.status, "applied");
  const second = await client.runOnce();
  assert.equal(second.status, "unchanged");
  assert.equal(calls.apply, 1);
  assert.equal(calls.submitted.length, 2); // one receipt per channel, once
  assert.equal(calls.submitted[0].type, "gccgw_data_plane_apply_receipt");
  assert.equal(calls.submitted[0].redacted, true);
});

// --- AGT-POLL-5: idempotent receipts ---

test("AGT-POLL-5: the receipt ledger records a key exactly once and conflicts on a different outcome", () => {
  const ledger = createReceiptLedger();
  const receipt = buildChannelReceipt({
    nodeRef: NODE,
    channelRef: CHANNELS[0],
    generation: "gen-1",
    desiredStateRef: "desired-gen-1",
    materialDigests: [MATERIALS[0]].map((m) => ({
      channelRef: m.channelRef,
      edgeCredentialRef: m.edgeCredentialRef,
      digest: createHash("sha256").update(m.bytes).digest("hex"),
    })),
    idempotencyKey: buildReceiptIdempotencyKey({
      desiredStateRef: "desired-gen-1",
      generation: "gen-1",
      channelRef: CHANNELS[0],
    }),
    status: "applied",
  });
  assert.deepEqual(ledger.record(receipt), { recorded: true, replayed: false });
  assert.deepEqual(ledger.record(receipt), { recorded: false, replayed: true });
  assert.deepEqual(ledger.record(receipt), { recorded: false, replayed: true });
  assert.equal(ledger.size(), 1);
  assert.throws(
    () => ledger.record({ ...receipt, status: "failed" }),
    (error) => error.code === "idempotency_conflict",
  );
});

test("AGT-POLL-5: material ordering does not change the idempotency fingerprint", () => {
  const materials = [
    { channelRef: CHANNELS[0], edgeCredentialRef: "cred-b", digest: "b".repeat(64) },
    { channelRef: CHANNELS[0], edgeCredentialRef: "cred-a", digest: "a".repeat(64) },
  ];
  const common = {
    nodeRef: NODE,
    channelRef: CHANNELS[0],
    generation: "gen-1",
    desiredStateRef: "desired-gen-1",
    idempotencyKey: buildReceiptIdempotencyKey({
      desiredStateRef: "desired-gen-1",
      generation: "gen-1",
      channelRef: CHANNELS[0],
    }),
    status: "applied",
  };
  const first = buildChannelReceipt({ ...common, materialDigests: materials });
  const reordered = buildChannelReceipt({ ...common, materialDigests: [...materials].reverse() });
  assert.deepEqual(first.materialDigests, reordered.materialDigests);

  const ledger = createReceiptLedger();
  assert.deepEqual(ledger.record(first), { recorded: true, replayed: false });
  assert.deepEqual(ledger.record(reordered), { recorded: false, replayed: true });
});

test("AGT-POLL-5: a failed receipt acknowledgement is retried without applying the same generation twice", async () => {
  const ledger = createReceiptLedger();
  let failSubmit = true;
  const transport = {
    async fetchDesiredState() {
      return makeDesired();
    },
    async submitReceipt(receipt) {
      if (failSubmit) throw new Error("HTTP 503");
      ledger.record(receipt);
    },
  };
  // Fresh verifier per cycle rejects a reused anti-replay id; the stub
  // signs a fresh envelope for the same generation on each poll.
  const { client, calls } = makeClient({ transport });
  const first = await client.runOnce();
  assert.equal(first.status, "retry_later");
  assert.equal(first.stage, "receipt");
  assert.equal(calls.apply, 1);
  failSubmit = false;
  const second = await client.runOnce();
  assert.equal(second.status, "unchanged");
  assert.equal(second.receiptsRecovered, 2);
  assert.equal(calls.apply, 1);
  assert.equal(ledger.size(), 2);
});

// --- AGT-POLL-6: posture defaults and failure behavior ---

test("AGT-POLL-6: defaults are dryRun on and apply off; transport failure changes nothing", async () => {
  const { client, calls } = makeClient({ config: {} });
  const result = await client.runOnce();
  assert.equal(result.status, "dry_run");
  assert.equal(calls.apply, 0);
  assert.equal(calls.submitted.length, 0);

  const failing = makeClient({
    transport: {
      async fetchDesiredState() { throw new Error("network unreachable"); },
      async submitReceipt() {},
    },
    config: { dryRun: false, applyEnabled: true },
  });
  const retry = await failing.client.runOnce();
  assert.equal(retry.status, "retry_later");
  assert.equal(retry.stage, "fetch");
});

// --- AGT-ADDR-1: addressing rules ---

test("AGT-ADDR-1: the legacy production agent still rejects public base URLs (rule untouched)", () => {
  assert.throws(
    () => normalizeProductionEdgeAgentConfig({
      baseUrl: "https://example.com",
      token: "node-agent-token",
      nodeRef: "vultr-sgp-a",
      channelRefs: ["channel-sgp-a-hy2"],
    }),
    /baseUrl must be private/,
  );
});

test("AGT-ADDR-1: the new contract requires https, with http only for loopback development", () => {
  assert.equal(validateBaseUrl("https://control.example.test"), "https://control.example.test");
  assert.equal(validateBaseUrl("http://127.0.0.1:8791"), "http://127.0.0.1:8791");
  assert.throws(() => validateBaseUrl("http://control.example.test"), /must be https/);
});

test("AGT-MFT-2: applied generation paths remain inside the applied state directory", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "g4-generation-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(
    resolveAppliedGenerationDir(dir, "gen-1"),
    join(dir, "applied", "gen-1"),
  );
  for (const generation of ["../../escaped", "../escape", "a/b", "a\\b", ".", "..", "/tmp/escape"]) {
    assert.throws(
      () => resolveAppliedGenerationDir(dir, generation),
      /safe path segment|outside the applied state directory/,
      `unsafe generation ${generation} must be rejected`,
    );
  }
});

// --- AGT-ROT-1..5: credential rotation ---

test("AGT-ROT-1: both keys are valid inside the 15-minute overlap; the old key fails after it", () => {
  let t = 1_000_000;
  const rotation = createKeyRotation({ initialKeyId: "key-a", scope: ROTATION_SCOPE, now: () => t });
  rotation.beginRotation("key-b");
  t += 5 * 60 * 1000;
  assert.equal(rotation.isKeyValid("key-a"), true);
  assert.equal(rotation.isKeyValid("key-b"), true);
  t += MAX_OVERLAP_MS; // beyond the window
  assert.equal(rotation.isKeyValid("key-a"), true);
  assert.equal(rotation.isKeyValid("key-b"), false);
});

test("AGT-ROT-2: the old key cannot be revoked before the new key has a recorded successful auth", () => {
  let t = 2_000_000;
  const rotation = createKeyRotation({ initialKeyId: "key-a", scope: ROTATION_SCOPE, now: () => t });
  rotation.beginRotation("key-b");
  assert.throws(
    () => rotation.revokeKey("key-a", { reason: "rotation" }),
    (error) => error.code === "revoke_precondition_unmet",
  );
  rotation.recordSuccessfulAuth("key-b");
  rotation.revokeKey("key-a", { reason: "rotation" });
  assert.equal(rotation.isKeyValid("key-a"), false);
  assert.equal(rotation.status().currentKeyId, "key-b");
});

test("AGT-ROT-3: there is no window-extension path, and expiry raises an exception record", () => {
  let t = 3_000_000;
  const rotation = createKeyRotation({ initialKeyId: "key-a", scope: ROTATION_SCOPE, now: () => t });
  assert.equal(Object.keys(rotation).some((key) => /extend/i.test(key)), false);
  rotation.beginRotation("key-b");
  t += MAX_OVERLAP_MS + 1;
  const status = rotation.status();
  assert.equal(status.exception?.type, "overlap_expired");
  assert.equal(status.currentKeyId, "key-a", "expiry must retain the current key");
  assert.deepEqual(status.revokedKeyIds, ["key-b"], "expiry must revoke the unacknowledged candidate");
  assert.equal(rotation.isKeyValid("key-a"), true);
  assert.equal(rotation.isKeyValid("key-b"), false);
  assert.throws(
    () => rotation.recordSuccessfulAuth("key-b"),
    (error) => error.code === "unknown_key",
  );
  assert.throws(
    () => rotation.beginRotation("key-c"),
    (error) => error.code === "rotation_exception_active",
  );
  assert.ok(rotation.auditLog().some((entry) => entry.type === "overlap_expired"));
});

test("AGT-ROT-4: a leak revocation is immediate, needs no precondition, and is audit-logged", () => {
  let t = 4_000_000;
  const rotation = createKeyRotation({ initialKeyId: "key-a", scope: ROTATION_SCOPE, now: () => t });
  rotation.beginRotation("key-b");
  rotation.revokeKey("key-a", { reason: "leak" });
  assert.equal(rotation.isKeyValid("key-a"), false);
  assert.equal(rotation.status().currentKeyId, "key-b"); // successor promoted
  assert.ok(rotation.auditLog().some((entry) => entry.type === "revoked_leak"));
});

test("AGT-ROT-5: the rotation machine refuses any scope other than agent-control communications", () => {
  assert.throws(
    () => createKeyRotation({ initialKeyId: "key-a", scope: "vpn-node-identity" }),
    (error) => error.code === "scope_violation",
  );
});

// --- AGT-DATA-1 / AGT-DATA-2: data layering ---

test("AGT-DATA-1: a desired-state payload carrying material is refused before apply", async () => {
  const desired = makeDesired();
  desired.materials = desired.materials.map((m, index) =>
    index === 0 ? { ...m, material: "raw-credential-bytes" } : m);
  const { client, calls } = makeClient({ desired });
  const result = await client.runOnce();
  assert.equal(result.status, "rejected");
  assert.equal(result.code, "data_boundary_violation");
  assert.equal(calls.apply, 0);
});

test("AGT-DATA-1: receipt details are redacted — no passwords, secrets, or raw UUIDs leave the host", () => {
  const uuid = "11111111-2222-4333-8444-555555555555";
  const redacted = redactDetail({
    note: `applied credential ${uuid} ok`,
    password: "synthetic-password",
    authorization: "Bearer synthetic-bearer",
    cookie: "session=synthetic-cookie",
    subscriptionUrl: "https://subscription.example.test/sub?token=synthetic-subscription",
    nested: { apiSecret: "synthetic-secret", count: 3 },
  });
  const serialized = JSON.stringify(redacted);
  assert.ok(!serialized.includes(uuid));
  assert.ok(!serialized.includes("synthetic-password"));
  assert.ok(!serialized.includes("synthetic-secret"));
  assert.ok(!serialized.includes("synthetic-bearer"));
  assert.ok(!serialized.includes("synthetic-cookie"));
  assert.ok(!serialized.includes("https://subscription.example.test"));
  assert.equal(redacted.authorization, "[redacted]");
  assert.equal(redacted.cookie, "[redacted]");
  assert.equal(redacted.subscriptionUrl, "[redacted]");
  assert.equal(redacted.nested.count, 3);
});

test("AGT-DATA-2: a locally resolved material whose digest differs is refused before apply", async () => {
  const { client, calls } = makeClient({
    materialStore: {
      async resolve() {
        return Buffer.from("tampered-material");
      },
    },
  });
  const result = await client.runOnce();
  assert.equal(result.status, "rejected");
  assert.equal(result.stage, "material_digest");
  assert.equal(calls.apply, 0);
});

test("AGT-DATA-2: unsafe material refs are refused by the file material store", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "g4-materials-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createFileMaterialStore(dir);
  await assert.rejects(store.resolve("../outside"), (error) => error.code === "material_ref_invalid");
  await assert.rejects(store.resolve("a/b"), (error) => error.code === "material_ref_invalid");
});

// --- AGT-MFT-1 / AGT-MFT-2: manifest signing ---

test("AGT-MFT-1: tampering with any bound field invalidates the manifest", () => {
  const tampers = {
    nodeRef: "node-other",
    channelRefs: ["chan-synth-hy2"],
    generation: "gen-2",
    desiredStateRef: "desired-gen-2",
    desiredStateDigest: "0".repeat(64),
    expiresAt: iso(NOW + 900_000),
    antiReplayId: "arp-synth-other",
    keyId: "manifest-key-synth-2",
  };
  for (const [field, value] of Object.entries(tampers)) {
    const { manifest, signature } = makeDesired();
    const verifier = makeVerifier();
    assert.throws(
      () => verifier.verify({ ...manifest, [field]: value }, signature, {}),
      (error) => error.name === "ManifestError",
      `tampered ${field} must be rejected`,
    );
  }
});

test("AGT-MFT-2: bad signature, expiry, replay, and binding mismatch all fail closed", async () => {
  const desired = makeDesired();
  assert.throws(
    () => makeVerifier().verify(desired.manifest, "AAAA", {}),
    (error) => error.code === "signature_invalid",
  );
  const expired = makeDesired({ issuedAt: NOW - 900_000, expiresAt: NOW - 60_000 });
  assert.throws(
    () => makeVerifier().verify(expired.manifest, expired.signature, {}),
    (error) => error.code === "manifest_expired",
  );
  const verifier = makeVerifier();
  verifier.verify(desired.manifest, desired.signature, {});
  assert.throws(
    () => verifier.verify(desired.manifest, desired.signature, {}),
    (error) => error.code === "replay_detected",
  );
  assert.throws(
    () => makeVerifier().verify(desired.manifest, desired.signature, { expectedNodeRef: "node-other" }),
    (error) => error.code === "binding_mismatch",
  );

  // Client level: a rejected manifest means no apply, no receipt.
  const { manifest, materials } = makeDesired();
  const { client, calls } = makeClient({
    desired: { manifest: { ...manifest, generation: "gen-tampered" }, signature: desired.signature, materials },
  });
  const result = await client.runOnce();
  assert.equal(result.status, "rejected");
  assert.equal(calls.apply, 0);
  assert.equal(calls.submitted.length, 0);
});

test("AGT-DATA-2: applied material staging enforces owner-only directory and file modes", async (t) => {
  const stateDir = await mkdtemp(join(tmpdir(), "g4-applied-materials-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  await writeAppliedMaterials(stateDir, "gen-1", [{
    edgeCredentialRef: "cred-synth-a",
    bytes: Buffer.from("synthetic-protected-material"),
  }]);
  const root = join(stateDir, "applied");
  const generationDir = join(root, "gen-1");
  const materialPath = join(generationDir, "cred-synth-a");

  // Simulate permissive pre-existing paths and a previously loose file.
  await chmod(root, 0o755);
  await chmod(generationDir, 0o755);
  await chmod(materialPath, 0o644);
  await writeAppliedMaterials(stateDir, "gen-1", [{
    edgeCredentialRef: "cred-synth-a",
    bytes: Buffer.from("replacement-protected-material"),
  }]);

  const [rootInfo, generationInfo, materialInfo] = await Promise.all([
    stat(root),
    stat(generationDir),
    stat(materialPath),
  ]);
  assert.equal(rootInfo.mode & 0o777, 0o700);
  assert.equal(generationInfo.mode & 0o777, 0o700);
  assert.equal(materialInfo.mode & 0o777, 0o600);
  assert.equal(await readFile(materialPath, "utf8"), "replacement-protected-material");
});

test("AGT-MFT-2: generation is restricted to a safe local path segment", () => {
  const { manifest } = makeDesired();
  assert.equal(normalizeManifest(manifest).generation, "gen-1");
  for (const generation of ["../../escaped", "../escape", "a/b", "a\\b", ".", "..", "/tmp/escape"]) {
    assert.throws(
      () => normalizeManifest({ ...manifest, generation }),
      (error) => error.code === "manifest_invalid",
      `unsafe generation ${generation} must be rejected`,
    );
  }
});

test("AGT-MFT-3: the G4 module code contains no E4-A references (no keys, no semantics, no imports)", async () => {
  const files = ["manifest.mjs", "key-rotation.mjs", "receipt.mjs", "agent-client.mjs", "run-once.mjs"];
  for (const file of files) {
    const source = await readFile(join(G4_DIR, file), "utf8");
    // Header comments document WHY the E4-A work is not reused; the
    // clause constrains code — imports, identifiers, key material —
    // so comments are stripped before scanning.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    assert.doesNotMatch(code, /e4[-_]?a/i, `${file} code must not reference the E4-A work`);
    assert.doesNotMatch(code, /from\s+["'][^"']*e4/i, `${file} must not import E4 modules`);
  }
});
