// U-F16 local-only coordinator → Agent launcher → Worker/D1 evidence.
//
// All fixtures are synthetic (s2s- prefix). No production data, no real
// credential material, no external network or remote D1 calls. Databases are
// in-memory or temp files; the durable authority guard is the real
// single-writer-authority implementation, so epoch +1 and the blocked
// T4 transition are enforced by the same trigger production would use.
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { ensureWriterAuthority, readWriterAuthority } from "../../../server/services/platform/single-writer-authority.mjs";
import {
  buildWriteLockReceipt,
  buildSchedulerQuiescenceReceipt,
  buildCallbackDrainReceipt,
  buildHwmCompletenessReceipt,
  buildFreezeReadinessBundle,
  SCHEDULER_JOBS,
  UNFENCED_WRITER_BASELINE,
} from "../../../server/services/platform/d1-stage2-freeze-drain.mjs";
import {
  ensureCredentialVersionTracking,
  buildCredentialVersionManifest,
} from "../../../server/services/platform/d1-stage2-credential-reconciliation.mjs";
import { SNAPSHOT_FIXTURE_DDL } from "../../../server/services/platform/d1-stage2-source-manifest.mjs";
import {
  VERIFICATION_CHECK_IDS,
  buildSnapshotGateManifest,
  buildWriterCoverageMatrix,
  createDrainTracker,
  buildDeltaCatchupReport,
  buildTwoSidedVerificationReport,
  createFreezeDrainCoordinator,
  verifyCoordinatorReceipt,
} from "../../../server/services/platform/d1-card9-freeze-drain-coordinator.mjs";

const SNAPSHOT = "s2s-card9-freeze-drain-001";
const CHECKPOINT = "s2s-checkpoint-card9-001";

function makeClock(t) {
  let nowMs = Date.parse("2026-11-21T00:00:00.000Z");
  const now = () => new Date(nowMs);
  return {
    now,
    advance(ms) { nowMs += ms; },
  };
}

function makeDb(t) {
  const db = new Database(":memory:");
  t.after(() => { if (db.open) db.close(); });
  db.exec(`create table s2s_items (id integer primary key, value text not null, updated_at text not null);
    create table s2s_notes (id integer primary key, body text not null);`);
  db.prepare("insert into s2s_items (id, value, updated_at) values (1, 'a', '2026-11-21T00:00:00.000Z'), (2, 'b', '2026-11-21T00:01:00.000Z')").run();
  db.prepare("insert into s2s_notes (id, body) values (1, 'n')").run();
  // G-2 (S4A precheck, Codex r4710015248): the fixture must carry the
  // same credential version tracking the T1 gate requires. Install the
  // triggers first, then seed synthetic credential rows so the
  // triggers record tracked version entries; the bundle built from
  // this db then carries a manifest hash bound to the current
  // snapshot. The T1 guard stays on — nothing here bypasses it.
  db.exec(SNAPSHOT_FIXTURE_DDL.platform_portal_edge_credentials);
  ensureCredentialVersionTracking(db);
  const digest = `sha256:${"a".repeat(64)}`;
  db.prepare(`insert into platform_portal_edge_credentials
    (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal)
    values ('s2s-request-001', 's2s-channel-a', 's2s-cred-001', ?, 0),
           ('s2s-request-002', 's2s-channel-b', 's2s-cred-002', ?, 0)`).run(digest, digest);
  ensureWriterAuthority(db);
  return db;
}

function makeCoordinator(t) {
  const clock = makeClock(t);
  const db = makeDb(t);
  const coordinator = createFreezeDrainCoordinator(db, { snapshotId: SNAPSHOT, now: clock.now });
  return { db, coordinator, clock };
}

function buildBundleFor(db, snapshotId) {
  const writeLock = buildWriteLockReceipt(db, { snapshotId, checkpointId: CHECKPOINT, outstandingJobs: [] });
  const schedulerQuiescence = buildSchedulerQuiescenceReceipt({
    snapshotId,
    evidence: Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true])),
  });
  const callbackDrain = buildCallbackDrainReceipt({ snapshotId, callbacks: [] });
  const hwmCompleteness = buildHwmCompletenessReceipt({
    snapshotId,
    highWaterMark: { seq: 7, snapshotId },
    manifestSeq: 7,
    rowCounts: { s2s_items: 2 },
  });
  // G-2: the readiness bundle carries the A2/A3 credential manifest
  // hash for this snapshot, so the coordinator's T1 re-read has a
  // baseline to verify against.
  const credentialManifestHash = buildCredentialVersionManifest(db, { snapshotId }).manifestHash;
  return buildFreezeReadinessBundle({ snapshotId, writeLock, schedulerQuiescence, callbackDrain, hwmCompleteness, credentialManifestHash });
}

function buildBundle(db) {
  return buildBundleFor(db, SNAPSHOT);
}

// All 28 items closed: fence every baseline id except U-F17, which is
// derived from U-01..U-10. U: every fenced claim carries the R7
// disposition record as its evidence ref.
const FENCED_REF = "decisions/D3_28_ITEMS_DISPOSITION_R7_2026-11-24.md (R7-approved writer dispositions)";
function fencedRefMap(ids) {
  return Object.fromEntries(ids.map((id) => [id, FENCED_REF]));
}
function closedCoverage() {
  const fenced = fencedRefMap(UNFENCED_WRITER_BASELINE.map((entry) => entry.id).filter((id) => id !== "U-F17"));
  return buildWriterCoverageMatrix({ fenced });
}

function drainedTracker(clock) {
  const tracker = createDrainTracker({ timeoutMs: 60000, now: clock.now });
  tracker.registerWrite("s2s-tx-1");
  tracker.registerCallback("s2s-cb-1");
  tracker.settleWrite("s2s-tx-1");
  tracker.settleCallback("s2s-cb-1");
  tracker.markSchedulerQuiesced();
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 }, maxUpdatedAt: { s2s_items: "2026-11-21T00:01:00.000Z" } });
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 }, maxUpdatedAt: { s2s_items: "2026-11-21T00:01:00.000Z" } });
  return tracker;
}

function passingVerification(context) {
  return buildTwoSidedVerificationReport({
    snapshotId: SNAPSHOT,
    context,
    checks: Object.fromEntries(VERIFICATION_CHECK_IDS.map((id) => [id, { passed: true, detail: `synthetic ${id}` }])),
  });
}

function appliedDelta(freezeReceiptDigest, manifestDigest) {
  return buildDeltaCatchupReport({
    snapshotId: SNAPSHOT,
    freezeReceiptDigest, manifestDigest,
    items: [{ table: "s2s_items", pk: "2", disposition: "applied" }],
  });
}

function freezeHappy(t) {
  const { db, coordinator, clock } = makeCoordinator(t);
  const result = coordinator.freeze({
    readinessBundle: buildBundle(db),
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  });
  return { db, coordinator, clock, result };
}

function driveToD1(t) {
  const ctx = freezeHappy(t);
  const { manifestDigest } = bindFrozenSnapshot(ctx);
  const { receiptDigest: freezeReceiptDigest } = ctx.result.freezeReceipt;
  const switched = ctx.coordinator.switchToD1({
    deltaReport: appliedDelta(freezeReceiptDigest, manifestDigest),
    verificationReport: passingVerification({ kind: "freeze-switch", freezeReceiptDigest, manifestDigest }),
    c1ApprovalRef: "s2s-c1-approval-001",
    handover: { verifiedBy: "s2s-reviewer-001", verifiedAt: "2026-11-21T00:05:00.000Z", receiptRef: "s2s-handover-001" },
  });
  return { ...ctx, switched };
}

// U-F10 D-2/D-3: the full snapshot-gate chain for a frozen coordinator —
// issue the run instruction (G1/G2), build a manifest for the snapshot
// taken under it, and bind the manifest to the freeze receipt. T2
// (switchToD1) refuses to run without this binding.
function bindFrozenSnapshot(ctx) {
  const { db, coordinator, result } = ctx;
  const schedulerQuiescence = buildSchedulerQuiescenceReceipt({
    snapshotId: SNAPSHOT,
    evidence: Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true])),
  });
  const callbackDrain = buildCallbackDrainReceipt({ snapshotId: SNAPSHOT, callbacks: [] });
  const instruction = coordinator.issueSnapshotGateInstruction({
    freezeReceipt: result.freezeReceipt,
    schedulerQuiescence,
    callbackDrain,
    operator: "s2s-operator-001",
    windowStart: "2026-11-21T00:05:00.000Z",
    windowEnd: "2026-11-21T00:10:00.000Z",
  });
  const manifest = buildSnapshotGateManifest({
    snapshotId: SNAPSHOT,
    checkpointId: CHECKPOINT,
    freezeReceiptDigest: result.freezeReceipt.receiptDigest,
    basename: "s2s-snapshot.sqlite",
    sha256: "a".repeat(64),
    byteCount: 4096,
    createdAt: "2026-11-21T00:05:00.000Z",
    quickCheck: true,
    foreignKeys: true,
    schemaVersion: 1,
    journalMode: "delete",
  });
  return coordinator.bindSnapshotManifest({
    instruction,
    manifest,
    acceptance: { quickCheck: true, foreignKeys: true },
  });
}

import { createWorker } from "./helpers.mjs";

function resumeAfterRecovery(coordinator, recoveryReceipt) {
  return coordinator.resumeToD1({
    reverificationReport: passingVerification({
      kind: "recovery-resume",
      epoch: recoveryReceipt.toEpoch,
      trigger: recoveryReceipt.gateRefs.trigger,
      recoveryReceiptDigest: recoveryReceipt.receiptDigest,
    }),
  });
}

// Test-only authority mirroring, not a production synchronization mechanism.
async function mirrorFixtureAuthority(db, receipt) {
  await db.prepare(
    "UPDATE platform_writer_authority SET authority = 'D1', phase = ?, epoch = ?, changed_at = ? WHERE singleton = 1"
  ).bind(receipt.to, receipt.toEpoch, "2026-11-21T00:06:00.000Z").run();
}

test("the isolated Worker accepts current T2 and R1 epochs, but not historical evidence", async t => {
  const { db: source, coordinator, switched } = driveToD1(t);
  const receipt = switched.coordinatorReceipt;
  assert.equal(verifyCoordinatorReceipt(source, receipt).valid, true);
  assert.equal(receipt.transitionId, "T2");
  assert.equal(receipt.to, "D1_ACTIVE");
  assert.equal(receipt.toEpoch, readWriterAuthority(source).epoch);
  assert.throws(() => verifyCoordinatorReceipt(source, { ...receipt, toEpoch: receipt.toEpoch + 1 }),
    { code: "freeze_coordinator_receipt_invalid" });

  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());
  const url = new URL("http://control-plane.local/v1/agent/desired-state");
  url.searchParams.set("nodeRef", agent.nodeRef);
  url.searchParams.set("channelRefs", agent.channelRefs.join(","));
  function request(epoch) {
    return mf.dispatchFetch(url, { headers: {
      authorization: "Bearer " + agent.token,
      "x-agent-key-id": agent.keyId,
      "x-agent-node-ref": agent.nodeRef,
      "x-agent-timestamp": new Date().toISOString(),
      "x-agent-nonce": "nonce-" + crypto.randomUUID(),
      "idempotency-key": "claim:" + agent.nodeRef + ":" + crypto.randomUUID(),
      "x-writer-epoch": String(epoch),
    } });
  }
  const wrong = await request(receipt.toEpoch + 1);
  assert.equal(wrong.status, 409);
  assert.equal((await wrong.json()).error.code, "writer_epoch_stale");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first()).n, 0);
  const good = await request(receipt.toEpoch);
  assert.equal(good.status, 200);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first()).n, 1);

  const recovery = coordinator.enterRecovery({ trigger: "e4-unavailable" });
  assert.equal(verifyCoordinatorReceipt(source, receipt).valid, true,
    "the old T2 receipt still verifies as historical evidence");
  assert.notEqual(receipt.toEpoch, readWriterAuthority(source).epoch);
  assert.equal(readWriterAuthority(source).phase, "RECOVERY");
  await mirrorFixtureAuthority(db, recovery.coordinatorReceipt);
  const duringRecovery = await request(receipt.toEpoch);
  assert.equal(duringRecovery.status, 503);
  assert.equal((await duringRecovery.json()).error.code, "writer_authority_not_d1");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first()).n, 1);

  const { coordinatorReceipt: resumed } = resumeAfterRecovery(coordinator, recovery.coordinatorReceipt);
  assert.equal(resumed.transitionId, "R1");
  assert.equal(verifyCoordinatorReceipt(source, resumed).valid, true);
  assert.equal(resumed.toEpoch, readWriterAuthority(source).epoch);
  await mirrorFixtureAuthority(db, resumed);
  const retired = await request(receipt.toEpoch);
  assert.equal(retired.status, 409);
  assert.equal((await retired.json()).error.code, "writer_epoch_stale");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first()).n, 1);

  const current = await request(resumed.toEpoch);
  assert.equal(current.status, 200, await current.text());
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agent_manifest_claims").first()).n, 2);
});

import { generateKeyPairSync, sign } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { localEpochProvider, localHandoffBytes } from "./fixtures/local-epoch-handoff.mjs";
import { reconcileHistoricalAgentEvidence } from "../../../agent/g4/local-epoch-reconciliation.mjs";

test("the local test launcher recovers receipts after T2 and keeps old-epoch work pending after R1", async t => {
  const { db: source, coordinator, switched } = driveToD1(t);
  const receipt = switched.coordinatorReceipt;
  assert.equal(verifyCoordinatorReceipt(source, receipt).valid, true);
  assert.equal(readWriterAuthority(source).epoch, receipt.toEpoch);
  assert.equal(readWriterAuthority(source).phase, "D1_ACTIVE");

  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());
  const root = await mkdtemp(join(tmpdir(), "flylink-local-epoch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const token = join(root, "token"), keys = join(root, "manifest.json");
  const handoffFile = join(root, "handoff.json"), pubFile = join(root, "handoff.pub");
  const stateDir = join(root, "state"), materials = join(root, "materials");
  await mkdir(materials, { mode: 0o700 });
  await writeFile(token, agent.token, { mode: 0o600 });
  await writeFile(keys, JSON.stringify({ [agent.manifestKeyId]: agent.manifestPublicKeyPem }));
  await writeFile(join(materials, "cred-synth-a"), "synthetic-material-a", { mode: 0o600 });
  await writeFile(join(materials, "cred-synth-b"), "synthetic-material-b", { mode: 0o600 });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  await writeFile(pubFile, publicKey.export({ type: "spki", format: "pem" }));
  let dropped = false;
  let redirectClaim = false;
  const observed = [];
  const proxy = createServer(async (req, res) => {
    try {
      const buffers = [];
      for await (const chunk of req) buffers.push(chunk);
      const post = req.method === "POST";
      observed.push([post ? "receipt" : "claim", req.headers["x-writer-epoch"]]);
      if (redirectClaim && req.url.startsWith("/v1/agent/desired-state")) {
        res.writeHead(307, { location: "/redirect-must-not-run" }).end();
        return;
      }
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.connection;
      const response = await mf.dispatchFetch("http://control-plane.local" + req.url, {
        method: req.method, headers, ...(post ? { body: Buffer.concat(buffers) } : {})
      });
      if (post && response.ok && !dropped) {
        dropped = true;
        await response.text();
        res.writeHead(502).end();
      } else {
        res.writeHead(response.status, { "content-type": "application/json" }).end(await response.text());
      }
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  t.after(() => { proxy.closeAllConnections(); proxy.close(); });
  const origin = "http://127.0.0.1:" + proxy.address().port;
  const env = {
    PATH: process.env.PATH, GCCGW_G4_BASE_URL: origin,
    GCCGW_G4_NODE_REF: agent.nodeRef, GCCGW_G4_CHANNEL_REFS: agent.channelRefs.join(","),
    GCCGW_G4_KEY_ID: agent.keyId, GCCGW_G4_TOKEN_FILE: token, GCCGW_G4_MANIFEST_KEYS_FILE: keys,
    GCCGW_G4_STATE_DIR: stateDir, GCCGW_G4_MATERIALS_DIR: materials,
    GCCGW_G4_DRY_RUN: "false", GCCGW_G4_APPLY_ENABLED: "true",
    GCCGW_G4_LOCAL_EPOCH_HANDOFF_FILE: handoffFile,
    GCCGW_G4_LOCAL_EPOCH_PUBLIC_KEY_FILE: pubFile
  };
  async function publish({ expired = false, tamper = false, candidate = receipt, signingKey = privateKey } = {}) {
    assert.equal(verifyCoordinatorReceipt(source, candidate).valid, true);
    const authority = readWriterAuthority(source);
    assert.equal(authority.phase, "D1_ACTIVE");
    assert.equal(authority.epoch, candidate.toEpoch);
    const target = await db.prepare("SELECT phase, epoch FROM platform_writer_authority WHERE singleton = 1").first();
    assert.equal(target.phase, "D1_ACTIVE");
    assert.equal(target.epoch, candidate.toEpoch);
    const now = Date.now();
    const payload = {
      kind: "g4-local-epoch-handoff-v1", origin, nodeRef: agent.nodeRef, epoch: candidate.toEpoch,
      receiptDigest: candidate.receiptDigest,
      issuedAt: expired ? now - 2000 : now, expiresAt: expired ? now - 1000 : now + 59_000
    };
    const signature = sign(null, localHandoffBytes(payload), signingKey).toString("base64url");
    if (tamper) payload.epoch++;
    await writeFile(handoffFile + ".new", JSON.stringify({ payload, signature }), { mode: 0o600 });
    await rename(handoffFile + ".new", handoffFile);
  }
  async function run(overrides = {}, launcher = "./fixtures/local-epoch-run-once.mjs") {
    let stdout, code = 0;
    try {
      ({ stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL(launcher, import.meta.url))],
        { timeout: 10000, env: { ...env, ...overrides } }));
    } catch (error) {
      ({ stdout, code } = error);
      assert.ok(stdout, error.stderr);
    }
    return { ...JSON.parse(stdout), exitCode: code };
  }
  const count = async table => (await db.prepare("SELECT COUNT(*) AS n FROM "+table).first()).n;
  const staged = (overrides = {}) => run(overrides, "./fixtures/local-epoch-entrypoint.mjs");
  assert.equal((await staged()).code, "writer_epoch_required");
  assert.equal((await staged({ GCCGW_G4_BASE_URL: "https://example.invalid",
    GCCGW_G4_LOCAL_EPOCH_PUBLIC_KEY_FILE: join(root, "missing-key") })).code, "staged_startup_rejected");
  assert.equal(observed.length, 0);
  // Default-off is the established behavior: no synthesized epoch.
  assert.equal((await run({
    GCCGW_G4_LOCAL_EPOCH_PROTOTYPE: "true",
    GCCGW_G4_STATE_DIR: join(root, "legacy-state"),
  }, "../../../agent/g4/run-once.mjs")).code, "writer_epoch_required");
  assert.deepEqual(observed.splice(0), [["claim", undefined]]);
  assert.equal(await count("agent_manifest_claims"), 0);
  await publish({ tamper: true });
  assert.equal((await staged()).code, "writer_epoch_invalid");
  await publish({ expired: true });
  assert.equal((await staged()).code, "writer_epoch_stale");
  assert.equal(observed.length, 0);

  await publish();
  const rotated = generateKeyPairSync("ed25519");
  await writeFile(pubFile, rotated.publicKey.export({ type: "spki", format: "pem" }));
  assert.equal((await staged()).code, "writer_epoch_invalid", "removed signing key fails closed");
  assert.deepEqual(observed, [], "local rejection does not contact the Worker");
  await publish({ signingKey: rotated.privateKey });
  redirectClaim = true;
  const redirect = await staged({ GCCGW_G4_STATE_DIR: join(root, "redirect-state") });
  redirectClaim = false;
  assert.equal(redirect.status, "retry_later");
  assert.deepEqual(observed.splice(0), [["claim", String(receipt.toEpoch)]],
    "staged startup does not follow a redirect or forward a second request");
  assert.equal(await count("agent_manifest_claims"), 0);
  const first = await staged();
  assert.equal(first.status, "retry_later");
  assert.equal(first.stage, "receipt");
  assert.equal(await count("agent_apply_receipts"), 1);
  const applied = join(stateDir, "applied", "gen-synth-001", "cred-synth-a");
  const originalStat = await stat(applied);
  assert.equal(await readFile(applied, "utf8"), "synthetic-material-a");
  const statePath = join(stateDir, "applied-state.json");
  const pending = await readFile(statePath);
  assert.equal(JSON.parse(pending).pendingReceipts.length, 2);
  const readEvidence = async (writerEpoch) => reconcileHistoricalAgentEvidence({
    state: JSON.parse(await readFile(statePath, "utf8")), writerEpoch,
    receiptRows: (await db.prepare(
      "SELECT idempotency_key, fingerprint, node_ref, channel_ref, generation, desired_state_ref, material_digests_json, status, detail_mode FROM agent_apply_receipts",
    ).all()).results,
    claimRows: [],
  });
  const recoverable = await readEvidence(receipt.toEpoch + 1);
  assert.equal(recoverable.status, "review_required");
  assert.equal(recoverable.allowDispatch, false);
  assert.deepEqual(recoverable.items.map((item) => item.result).sort(),
    ["applied_receipt_recorded", "receipt_missing"]);

  const second = await staged();
  assert.equal(second.status, "unchanged");
  assert.equal(await count("agent_apply_receipts"), 2);
  assert.equal((await stat(applied)).mtimeMs, originalStat.mtimeMs, "no repeated local apply");
  assert.ok(observed.every(([, epoch]) => epoch === String(receipt.toEpoch)));

  // Simulate an on-disk unacknowledged receipt still carrying the old epoch.
  await writeFile(statePath, pending, { mode: 0o600 });
  const oldSignedProjection = await readFile(handoffFile);
  const verifyOldProjection = localEpochProvider({
    baseUrl: origin, nodeRef: agent.nodeRef, handoffPath: handoffFile, publicKeyPath: pubFile,
  });
  const ledgerCounts = async () => Promise.all([
    count("agent_manifest_claims"), count("agent_apply_receipts"), count("agent_request_nonces"),
  ]);
  const recovery = coordinator.enterRecovery({ trigger: "e4-unavailable" });
  await mirrorFixtureAuthority(db, recovery.coordinatorReceipt);
  assert.equal(String(verifyOldProjection()), String(receipt.toEpoch), "the old projection has not expired");
  const beforeRecovery = await ledgerCounts();
  observed.length = 0;
  const recoveryClaimDir = join(root, "recovery-claim");
  const recoveryClaim = await staged({ GCCGW_G4_STATE_DIR: recoveryClaimDir });
  assert.equal(recoveryClaim.code, "writer_authority_not_d1");
  assert.equal(recoveryClaim.stage, "fetch");
  await assert.rejects(stat(join(recoveryClaimDir, "applied")), { code: "ENOENT" });
  const third = await staged();
  assert.equal(third.code, "writer_authority_not_d1");
  assert.equal(third.stage, "receipt");
  assert.deepEqual(observed, [["claim", String(receipt.toEpoch)], ["receipt", String(receipt.toEpoch)]]);
  assert.deepEqual(await readFile(statePath), pending, "old receipts stay pending");
  assert.deepEqual(await ledgerCounts(), beforeRecovery, "no claims, receipts or consumed nonces");

  const { coordinatorReceipt: resumed } = resumeAfterRecovery(coordinator, recovery.coordinatorReceipt);
  await mirrorFixtureAuthority(db, resumed);
  // The publisher has not removed or renewed the signed file yet.
  assert.deepEqual(await readFile(handoffFile), oldSignedProjection);
  assert.equal(String(verifyOldProjection()), String(receipt.toEpoch));
  const beforeStale = await ledgerCounts();
  observed.length = 0;
  const staleClaim = await staged({ GCCGW_G4_STATE_DIR: recoveryClaimDir });
  assert.equal(staleClaim.code, "writer_epoch_stale");
  assert.equal(staleClaim.stage, "fetch");
  const staleReceipt = await staged();
  assert.equal(staleReceipt.code, "writer_epoch_stale");
  assert.equal(staleReceipt.stage, "receipt");
  assert.deepEqual(observed, [["claim", String(receipt.toEpoch)], ["receipt", String(receipt.toEpoch)]]);
  assert.deepEqual(await readFile(statePath), pending);
  await assert.rejects(stat(join(recoveryClaimDir, "applied")), { code: "ENOENT" });
  assert.deepEqual(await ledgerCounts(), beforeStale, "rejection does not mutate any of the three ledgers");
  await publish({ candidate: resumed, signingKey: rotated.privateKey });
  observed.length = 0;
  const afterResume = await staged();
  assert.equal(afterResume.code, "writer_epoch_stale");
  assert.equal(afterResume.stage, "receipt");
  assert.equal(observed.length, 0, "never forward or relabel a queued receipt from an older epoch");
  assert.deepEqual(await readFile(statePath), pending, "keep the old receipt for reconciliation");
  assert.equal(await count("agent_apply_receipts"), 2);
  assert.equal((await stat(applied)).mtimeMs, originalStat.mtimeMs, "no local apply during recovery or retry");
  const reconciled = await readEvidence(resumed.toEpoch);
  assert.equal(reconciled.status, "historical_receipts_matched");
  assert.equal(reconciled.allowDispatch, false);
  assert.deepEqual(reconciled.items.map((item) => item.result), ["applied_receipt_recorded", "applied_receipt_recorded"]);
  assert.deepEqual(await readFile(statePath), pending, "reconciliation is read-only");
  assert.equal(await count("agent_apply_receipts"), 2);

  await t.test("full and partial interrupted applies require reconciliation, even after another epoch", async () => {
    const cases = [
      ["full", "GCCGW_TEST_EXIT_AFTER_LOCAL_APPLY"],
      ["partial", "GCCGW_TEST_EXIT_AFTER_FIRST_MATERIAL"],
    ];
    const strandedCopies = [];
    for (const [kind, failpoint] of cases) {
      const crashDir = join(root, "crash-window-" + kind);
      observed.length = 0;
      const crashed = await promisify(execFile)(process.execPath,
        [fileURLToPath(new URL("./fixtures/local-epoch-run-once.mjs", import.meta.url))], {
          timeout: 10000, env: { ...env, GCCGW_G4_STATE_DIR: crashDir, [failpoint]: "true" },
        }).then(() => null, (error) => error);
      assert.equal(crashed?.code, 86);
      assert.deepEqual(observed, [["claim", String(resumed.toEpoch)]]);
      const crashStatePath = join(crashDir, "applied-state.json");
      const before = await readFile(crashStatePath);
      const stranded = JSON.parse(before);
      assert.equal(stranded.pendingClaim, null);
      assert.equal(stranded.pendingReceipts?.length ?? 0, 0);
      assert.equal(stranded.generation ?? null, null);
      assert.equal(stranded.pendingApply.writerEpoch, String(resumed.toEpoch));
      assert.match(stranded.pendingApply.claimIdempotencyKey, /^claim:/);
      assert.equal(stranded.pendingApply.generation, "gen-synth-001");
      const applyDir = join(crashDir, "applied", "gen-synth-001");
      const path = join(applyDir, "cred-synth-a");
      const beforeRetry = await stat(path);
      assert.equal(await readFile(path, "utf8"), "synthetic-material-a");
      async function checkSecondMaterial() {
        const second = join(applyDir, "cred-synth-b");
        if (kind === "full") assert.equal(await readFile(second, "utf8"), "synthetic-material-b");
        else await assert.rejects(readFile(second), { code: "ENOENT" });
      }
      await checkSecondMaterial();
      observed.length = 0;
      const immediate = await run({ GCCGW_G4_STATE_DIR: crashDir });
      assert.equal(immediate.status, "skipped_locked");
      async function checkRefuses() {
        const restarted = await run({ GCCGW_G4_STATE_DIR: crashDir, GCCGW_TEST_ADVANCE_LOCK_CLOCK: "true" });
        assert.equal(restarted.exitCode, 4);
        assert.equal(restarted.code, "apply_reconciliation_required");
        assert.deepEqual(observed, [], "no new claim or receipt");
        assert.deepEqual(await readFile(crashStatePath), before, "intent retained byte-for-byte");
        assert.equal((await stat(path)).ino, beforeRetry.ino, "no duplicate file apply");
        await checkSecondMaterial();
      }
      await checkRefuses();
      strandedCopies.push(checkRefuses);
    }
    const recoveryAgain = coordinator.enterRecovery({ trigger: "e4-unavailable" });
    await mirrorFixtureAuthority(db, recoveryAgain.coordinatorReceipt);
    const { coordinatorReceipt: next } = resumeAfterRecovery(coordinator, recoveryAgain.coordinatorReceipt);
    await mirrorFixtureAuthority(db, next);
    await publish({ candidate: next, signingKey: rotated.privateKey });
    for (const checkRefuses of strandedCopies) await checkRefuses();
    assert.equal(await count("agent_apply_receipts"), 2);
  });

  await t.test("intent persistence failure cannot reach the local effect or receipt", async () => {
    const failedDir = join(root, "failed-intent");
    observed.length = 0;
    const out = await run({ GCCGW_G4_STATE_DIR: failedDir, GCCGW_TEST_FAIL_INTENT_SAVE: "true" });
    assert.equal(out.code, "apply_intent_save_failed");
    assert.deepEqual(observed.map(([kind]) => kind), ["claim"]);
    await assert.rejects(stat(join(failedDir, "applied")), { code: "ENOENT" });
    assert.equal(await count("agent_apply_receipts"), 2);
  });

  await t.test("invalid durable state blocks before network or file apply", async () => {
    const invalidDir = join(root, "invalid-agent-state");
    await mkdir(invalidDir);
    await writeFile(join(invalidDir, "applied-state.json"), "{invalid", { mode: 0o600 });
    observed.length = 0;
    const rejected = await run({ GCCGW_G4_STATE_DIR: invalidDir });
    assert.equal(rejected.code, "agent_state_unreadable");
    assert.deepEqual(observed, []);
    await assert.rejects(stat(join(invalidDir, "applied")), { code: "ENOENT" });
  });

});


test("the local epoch prototype refuses non-loopback origins before reading its key", () => {
  for (const baseUrl of ["https://example.invalid", "http://localhost:9999", "http://127.0.0.1:9999/path"]) {
    assert.throws(() => localEpochProvider({ baseUrl, nodeRef: "node-synth-01" }),
      { code: "writer_epoch_invalid" });
  }
});
