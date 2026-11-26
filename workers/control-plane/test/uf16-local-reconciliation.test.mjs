import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, sha256Hex } from "../../../agent/g4/manifest.mjs";
import { buildChannelReceipt, buildReceiptIdempotencyKey, receiptFingerprint } from "../../../agent/g4/receipt.mjs";
import { reconcileHistoricalAgentEvidence } from "../../../agent/g4/local-epoch-reconciliation.mjs";

function receipt(channelRef, status = "applied", writerEpoch = "3") {
  const fields = { nodeRef: "node-synth", desiredStateRef: "desired-synth", generation: "gen-synth", channelRef };
  return {
    ...buildChannelReceipt({
      ...fields,
      materialDigests: [{ channelRef, edgeCredentialRef: "cred-synth", digest: "a".repeat(64) }],
      idempotencyKey: buildReceiptIdempotencyKey(fields),
      status, detail: { mode: status === "applied" ? "apply" : "dry_run" },
    }),
    writerEpoch,
  };
}

const row = (r) => ({
  idempotency_key: r.idempotencyKey, fingerprint: receiptFingerprint(r),
  node_ref: r.nodeRef, channel_ref: r.channelRef, generation: r.generation,
  desired_state_ref: r.desiredStateRef, material_digests_json: JSON.stringify(r.materialDigests),
  status: r.status, detail_mode: r.detail.mode,
});

test("only exact historical matches are recognized and dry run is not applied", () => {
  const a = receipt("channel-a"), b = receipt("channel-b", "dry_run");
  const args = { state: { pendingReceipts: [a], deferredReceipts: [b] }, writerEpoch: 5, receiptRows: [row(b), row(a)], claimRows: [] };
  const before = JSON.stringify(args);
  const report = reconcileHistoricalAgentEvidence(args);
  assert.deepEqual(report, {
    status: "historical_receipts_matched", allowDispatch: false,
    items: [
      { source: "pending_receipt", index: 0, result: "applied_receipt_recorded" },
      { source: "deferred_receipt", index: 0, result: "dry_run_receipt_recorded" },
    ],
  });
  assert.equal(JSON.stringify(args), before);
  assert.equal(JSON.stringify(report).includes("cred-synth"), false);
});

test("receipt absence, conflicting durable evidence and duplicate queue entries stay unresolved", () => {
  const a = receipt("channel-a"), b = receipt("channel-b"), c = receipt("channel-c");
  const d = receipt("channel-d");
  const result = reconcileHistoricalAgentEvidence({
    writerEpoch: 5, claimRows: [],
    state: { pendingReceipts: [a, b, c, d], deferredReceipts: [d] },
    receiptRows: [{ ...row(b), material_digests_json: "[]" }, row(c), row(c), row(d)],
  });
  assert.equal(result.status, "review_required");
  assert.equal(result.allowDispatch, false);
  assert.deepEqual(result.items.map((i) => i.result), [
    "receipt_missing", "receipt_conflict", "ambiguous_ledger_evidence", "duplicate_local_evidence", "duplicate_local_evidence",
  ]);
});

test("unbound, current and future epochs never qualify as historical reconciled evidence", () => {
  const a = receipt("channel-a"), b = receipt("channel-b", "applied", "5"), c = receipt("channel-c", "applied", "6");
  delete a.writerEpoch;
  const bad = { ...receipt("channel-d"), idempotencyKey: "failed-local-binding" };
  const result = reconcileHistoricalAgentEvidence({
    writerEpoch: 5, receiptRows: [row(a), row(b), row(c)], claimRows: [], state: { pendingReceipts: [a, b, c, bad] },
  });
  assert.equal(result.allowDispatch, false);
  assert.deepEqual(result.items.map((i) => i.result), ["unbound_epoch", "current_epoch_out_of_scope", "future_epoch", "invalid_local_evidence"]);
});

test("even a completed claim with matching scope is not proof of applying", () => {
  const scope = canonicalJson({ nodeRef: "node-synth", channelRefs: ["channel-a", "channel-b"] });
  const pendingClaim = { writerEpoch: "3", idempotencyKey: "claim:node-synth:syntheticclaimkey01", scopeFingerprint: scope };
  const matched = { idempotency_key: pendingClaim.idempotencyKey, node_ref: "node-synth", request_fingerprint: sha256Hex(scope), status: "completed" };
  for (const [claimRows, expected] of [
    [[], "claim_missing"],
    [[matched], "claim_seen_needs_review"],
    [[{ ...matched, status: "expired" }], "claim_seen_needs_review"],
    [[{ ...matched, node_ref: "wrong-node" }], "claim_conflict"],
  ]) {
    assert.deepEqual(reconcileHistoricalAgentEvidence({ writerEpoch: 5, receiptRows: [], claimRows, state: { pendingClaim } }), {
      status: "review_required", allowDispatch: false, items: [{ source: "pending_claim", index: 0, result: expected }],
    });
  }
});

test("invalid imports and empty evidence fail closed", () => {
  const args = { writerEpoch: 5, receiptRows: [], claimRows: [], state: {} };
  assert.deepEqual(reconcileHistoricalAgentEvidence(args), { status: "no_evidence", allowDispatch: false, items: [] });
  for (const overrides of [{ writerEpoch: "05" }, { writerEpoch: 2147483648 }, { receiptRows: [null] }, { claimRows: null }, { state: { pendingReceipts: null } }, { state: { pendingReceipts: Array(4097).fill({}) } }]) {
    assert.deepEqual(reconcileHistoricalAgentEvidence({ ...args, ...overrides }), { status: "invalid_evidence", allowDispatch: false, items: [] });
  }
});

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../../scripts/d1-uf16-reconcile-local.mjs", import.meta.url));
function copies(t, state, rows) {
  const root = mkdtempSync(join(tmpdir(), "uf16-offline-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const agent = join(root, "agent-state.json");
  const ledger = join(root, "worker-ledger.json");
  writeFileSync(agent, JSON.stringify(state), { mode: 0o400 });
  writeFileSync(ledger, JSON.stringify({
    schemaVersion: "uf16-offline-worker-evidence/v1",
    writerEpoch: 5, receiptRows: rows, claimRows: [],
  }), { mode: 0o400 });
  return { root, agent, ledger };
}
function execCli(agent, ledger) {
  return spawnSync(process.execPath, [cli, "--worker-ledger", ledger, "--agent-state", agent], { encoding: "utf8", timeout: 5000 });
}

test("offline CLI emits deterministic redacted output and does not modify evidence copies", (t) => {
  const a = receipt("channel-a"), b = receipt("channel-b");
  const { agent, ledger } = copies(t, { pendingReceipts: [a, b] }, [row(a)]);
  const beforeAgent = readFileSync(agent);
  const beforeLedger = readFileSync(ledger);
  const first = execCli(agent, ledger);
  const second = execCli(agent, ledger);
  assert.equal(first.status, 1);
  assert.equal(second.status, 1);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.deepEqual(JSON.parse(first.stdout), {
    schemaVersion: "uf16-offline-reconciliation/v1",
    status: "review_required",
    allowDispatch: false,
    items: [
      { source: "pending_receipt", index: 0, result: "applied_receipt_recorded" },
      { source: "pending_receipt", index: 1, result: "receipt_missing" },
    ],
  });
  assert.deepEqual(readFileSync(agent), beforeAgent);
  assert.deepEqual(readFileSync(ledger), beforeLedger);
  for (const value of [agent, ledger, a.nodeRef, a.idempotencyKey, a.materialDigests[0].digest]) {
    assert.equal(first.stdout.includes(value), false);
  }
});

test("offline CLI success describes matching records, never dispatch permission", (t) => {
  const a = receipt("channel-a", "dry_run");
  const { agent, ledger } = copies(t, { deferredReceipts: [a] }, [row(a)]);
  const invoked = execCli(agent, ledger);
  assert.equal(invoked.status, 0);
  const report = JSON.parse(invoked.stdout);
  assert.equal(report.status, "historical_receipts_matched");
  assert.equal(report.items[0].result, "dry_run_receipt_recorded");
  assert.equal(report.allowDispatch, false);
});

test("offline CLI refuses malformed, unsupported, or oversized evidence without printing inputs", (t) => {
  const { root, agent, ledger } = copies(t, {}, []);
  const bad = join(root, "confidential-test-input.json");
  writeFileSync(bad, "{sensitive-test-marker");
  const large = join(root, "oversize.json");
  writeFileSync(large, "{}");
  truncateSync(large, 4 * 1024 * 1024 + 1);
  const wrongVersion = join(root, "wrong-version.json");
  writeFileSync(wrongVersion, JSON.stringify({ schemaVersion: "unknown", writerEpoch: 5, receiptRows: [], claimRows: [] }));
  for (const result of [execCli(bad, ledger), execCli(large, ledger), execCli(root, ledger), execCli(agent, wrongVersion), execCli("https://example.invalid/source", ledger)]) {
    assert.equal(result.status, 2);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.includes("sensitive-test-marker"), false);
    assert.equal(result.stdout.includes(root), false);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "invalid_evidence");
    assert.equal(report.allowDispatch, false);
  }
});

test("offline CLI rejects a symbolic link rather than following its target", { skip: process.platform === "win32" }, (t) => {
  const { root, agent, ledger } = copies(t, {}, []);
  const alias = join(root, "alias.json");
  symlinkSync(agent, alias);
  const result = execCli(alias, ledger);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, "invalid_evidence");
});

test("offline reconciliation never authorizes an interrupted apply without a receipt", (t) => {
  const { agent, ledger } = copies(t, {
    pendingApply: { claimIdempotencyKey: "private-claim", writerEpoch: "3", desiredStateDigest: "private-digest" },
  }, []);
  const report = execCli(agent, ledger);
  assert.equal(report.status, 1);
  assert.deepEqual(JSON.parse(report.stdout), {
    schemaVersion: "uf16-offline-reconciliation/v1", status: "review_required", allowDispatch: false,
    items: [{ source: "pending_apply", index: 0, result: "apply_intent_needs_review" }],
  });
  assert.equal(report.stdout.includes("private-"), false);
});
