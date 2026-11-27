import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, desiredStateDigest, sha256Hex } from "../../../agent/g4/manifest.mjs";
import { buildChannelReceipt, buildReceiptIdempotencyKey, receiptFingerprint } from "../../../agent/g4/receipt.mjs";
import { reconcileHistoricalAgentEvidence } from "../../../agent/g4/local-epoch-reconciliation.mjs";

// Contract fixture only. The three inputs represent separately collected synthetic
// copies. A label or timestamp here is not production proof of provenance.
const bindingFields = ["nodeRef", "generation", "desiredStateRef", "desiredStateDigest"];
const observedRuntime = "synthetic-node-runtime-readback";
const sameBinding = (a, b) => bindingFields.every((key) => a[key] === b[key]);
const materialSet = (rows) => rows.map(canonicalJson).sort();
function reconcile({ agent, worker, node, window }) {
  const invalid = { allowDispatch: false, ledger: "unconfirmed", node: "inconclusive" };
  const intent = agent.pendingApply;
  const manifest = worker.claim.manifest;
  const channels = manifest.channelRefs;
  if (intent.schemaVersion !== "agent-apply-intent/v1"
    || !/^[1-9][0-9]{0,9}$/.test(intent.writerEpoch) || Number(intent.writerEpoch) >= worker.writerEpoch
    || worker.claim.originalEpoch !== intent.writerEpoch
    || !sameBinding(intent, manifest) || intent.desiredStateDigest !== desiredStateDigest(manifest)
    || !channels.length || new Set(channels).size !== channels.length
    || manifest.materials.some((m) => !channels.includes(m.channelRef))
    || !channels.every((c) => manifest.materials.some((m) => m.channelRef === c))) return invalid;

  const scope = canonicalJson({ nodeRef: intent.nodeRef, channelRefs: [...channels].sort() });
  const receipts = channels.map((channelRef) => {
    const { nodeRef, desiredStateRef, generation } = intent;
    const fields = { nodeRef, desiredStateRef, generation, channelRef };
    return { ...buildChannelReceipt({
      ...fields, materialDigests: manifest.materials.filter((m) => m.channelRef === channelRef),
      idempotencyKey: buildReceiptIdempotencyKey(fields), status: "applied", detail: { mode: "apply" },
    }), writerEpoch: intent.writerEpoch };
  });
  const historical = reconcileHistoricalAgentEvidence({
    writerEpoch: worker.writerEpoch, claimRows: worker.claimRows, receiptRows: worker.receiptRows,
    state: { pendingClaim: { writerEpoch: intent.writerEpoch, idempotencyKey: intent.claimIdempotencyKey,
      scopeFingerprint: scope }, pendingReceipts: receipts },
  });
  const claim = historical.items.find((item) => item.source === "pending_claim");
  if (claim?.result !== "claim_seen_needs_review") return invalid;
  const ledger = historical.items.filter((item) => item.source === "pending_receipt")
    .every((item) => item.result === "applied_receipt_recorded") ? "receipt_records_match" : "unconfirmed";

  const unique = new Set(node.map((x) => x.channelRef));
  const valid = window.from <= window.until && unique.size === node.length && node.every((x) =>
    channels.includes(x.channelRef) && sameBinding(x, intent) && x.source === observedRuntime
    && Number.isSafeInteger(x.observedAt) && x.observedAt >= window.from && x.observedAt <= window.until
    && x.configTest === true && x.serviceActive === true && x.listenerPresent === true
    && canonicalJson(materialSet(x.materials))
      === canonicalJson(materialSet(manifest.materials.filter((m) => m.channelRef === x.channelRef))));
  return { allowDispatch: false, ledger, node: !valid || !node.length ? "inconclusive"
    : unique.size === channels.length ? "all_channels_observed" : "partial" };
}

function copies() {
  const nodeRef = "node-synthetic", generation = "gen-new", desiredStateRef = "desired-synthetic";
  const channelRefs = ["ch-a", "ch-b"];
  const materials = channelRefs.map((channelRef, i) => ({
    channelRef, edgeCredentialRef: "credential-synthetic-" + i, digest: ["a", "b"][i].repeat(64),
  }));
  const manifest = { nodeRef, generation, desiredStateRef, channelRefs, materials };
  manifest.desiredStateDigest = desiredStateDigest(manifest);
  const intent = { schemaVersion: "agent-apply-intent/v1", writerEpoch: "3",
    claimIdempotencyKey: "claim:node-synthetic:synthetic-claim-key", nodeRef, generation,
    desiredStateRef, desiredStateDigest: manifest.desiredStateDigest };
  const agent = { pendingApply: intent };
  const worker = { writerEpoch: 5, claim: { originalEpoch: "3", manifest }, receiptRows: [], claimRows: [{
    idempotency_key: intent.claimIdempotencyKey, node_ref: nodeRef, status: "completed",
    request_fingerprint: sha256Hex(canonicalJson({ nodeRef, channelRefs })),
  }] };
  const node = channelRefs.map((channelRef, i) => ({
    nodeRef, channelRef, generation, desiredStateRef, desiredStateDigest: manifest.desiredStateDigest,
    source: observedRuntime, observedAt: 250, configTest: true, serviceActive: true, listenerPresent: true,
    materials: [structuredClone(materials[i])],
  }));
  return { agent, worker, node, window: { from: 200, until: 300 } };
}

function check(input, node, ledger = "unconfirmed") {
  const before = JSON.stringify(input);
  assert.deepEqual(reconcile(input), { node, ledger, allowDispatch: false });
  assert.equal(JSON.stringify(input), before, "the evidence copies are not modified");
}

test("one observed channel is partial, even when the Worker claim completed", () => {
  const input = copies();
  input.node.pop();
  check(input, "partial");
});

test("identical material bytes do not identify the generation", () => {
  const input = copies();
  input.node[0].generation = "gen-old";
  check(input, "inconclusive");
});

test("complete node observation without a Worker receipt is not ledger confirmation", () => {
  check(copies(), "all_channels_observed");
});

test("stale, duplicate, and desired-state-only observations stay inconclusive", () => {
  for (const change of [x => { x.node[0].observedAt = 199; }, x => x.node.push(x.node[0]),
    x => { x.node[0].source = "desired-state"; }, x => { x.node[0].listenerPresent = false; },
    x => { x.worker.claim.originalEpoch = "2"; }, x => { x.node[0].materials[0].digest = "0".repeat(64); }]) {
    const input = copies();
    change(input);
    check(input, "inconclusive");
  }
});

test("matching receipt records and observed runtime are independent and never authorize dispatch", () => {
  const input = copies();
  for (const observation of input.node) {
    const { nodeRef, channelRef, generation, desiredStateRef } = observation;
    const fields = { nodeRef, channelRef, generation, desiredStateRef };
    const receipt = buildChannelReceipt({ ...fields, materialDigests: observation.materials,
      idempotencyKey: buildReceiptIdempotencyKey(fields), status: "applied", detail: { mode: "apply" } });
    input.worker.receiptRows.push({
      idempotency_key: receipt.idempotencyKey, fingerprint: receiptFingerprint(receipt),
      node_ref: nodeRef, channel_ref: channelRef, generation, desired_state_ref: desiredStateRef,
      material_digests_json: JSON.stringify(observation.materials), status: "applied", detail_mode: "apply",
    });
  }
  check(input, "all_channels_observed", "receipt_records_match");
  input.node = [];
  check(input, "inconclusive", "receipt_records_match");
});
