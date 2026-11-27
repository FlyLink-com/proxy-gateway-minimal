# U-F16 Agent epoch handoff: local review draft

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: source_only_uf16_local_synthetic_review
  superseded_by: null
  last_verified_at: 2026-11-26
  production_authority: false
```

**U-F16 stays locked; E3 stays NO-GO.** This is a local test of the launcher and protocol, not authority to deploy, set a production epoch, contact BWH/E4/Staging, enable D1 writes, or change a service/timer. The R5 production T5 unfreeze receipt is not an Agent D1 activation receipt and is not a fixture input.

## Review candidate

- The migration coordinator is the proposed publisher of an authenticated, short-lived projection of the current verified T2/R1 receipt. Before publishing, check the durable log and the current authoritative phase and epoch. A valid historical digest alone says nothing about currentness.
- The Agent consumes a read-only projection, not a database. The projection should bind the intended environment and recipient, receipt digest, issue time, expiry and epoch. It must not contain credentials. No default epoch; missing, malformed, or expired handoffs stop the flow.
- The test-only launcher accepts numeric loopback HTTP only. The installed service stays default-off and cannot enable epoch forwarding. Redirects are refused. The test uses a separate ephemeral Ed25519 key and validates the signature, target origin, node, and expiry, re-reading before each send. Nothing in this draft designates the production trust root, publisher process, transport, permissions, or failure SLO.
- Worker/D1 authority remains the final gate. When the epoch changes, do not relabel a pending claim/receipt; keep old pending receipts for separately reviewed reconciliation. On a Worker rejection preserve the stable error code. Do not fall back to BWH writes.
- Review must decide how to publish/revoke/rotate this projection, what policy resolves old pending state, and how to reconcile a local effect that was already in flight at phase change. The test does not prove instantaneous revocation of a signed projection or an end to in-flight node-side effects.

## Local verification

Run the Worker package tests with its pinned dependencies on Node 22+. The integrated probe creates synthetic T2, T3 and R1 receipts with the real coordinator on temporary SQLite, verifies them against the coordinator log, and runs a test-only oneshot process over loopback using the real Agent client and file apply routine against an isolated Miniflare Worker/D1. The only local apply is writing synthetic materials into a temporary directory. It covers default-off, missing, tampered, expired and retired authority, lost first receipt response, no duplicate apply, and retaining old pending receipts unchanged after R1 activates a new epoch. A test fixture mirrors the current coordinator phase and epoch into local Worker D1; no automated publication or remote cutover is claimed.

## Offline reconciliation probe

`reconcileHistoricalAgentEvidence` compares copies supplied by the test/operator, never queries a remote service and is not wired into the launcher. It uses the original idempotency key and checks the Worker fingerprint, node/channel/generation/scope, recorded outcome and material digests. Exact apply and dry-run receipts are distinguished. A claim match only shows a Worker claim record, even when the lease is completed or expired. Missing, mismatching, duplicate or unbound evidence stays for review: absence does not mean no local effect.

The current epoch must come from separately verified evidence. Existing receipt rows do not store the accepting epoch and cannot independently prove a node-side effect or authorize a retry. This prototype reports local ordinals and statuses only; never archives or rewrites state, sends old receipts, re-runs work, or grants dispatch. The test-only launcher/Miniflare test compares a synthetic partial receipt ledger and a post-R1 exact match while preserving the original queue byte-for-byte.

### Local CLI for evidence copies

Run only against synthetic, static local copies. The Agent input is a copy of its state JSON. The Worker input is a JSON object with `schemaVersion: "uf16-offline-worker-evidence/v1"`, the separately verified `writerEpoch`, and explicit `receiptRows` and `claimRows` arrays (empty arrays are allowed). Receipt rows carry `idempotency_key`, `fingerprint`, `node_ref`, `channel_ref`, `generation`, `desired_state_ref`, `material_digests_json`, `status` and `detail_mode`; claim rows carry `idempotency_key`, `node_ref`, `request_fingerprint` and `status`. The CLI does not acquire or certify those inputs.

```sh
node scripts/d1-uf16-reconcile-local.mjs --agent-state ./synthetic-agent.json --worker-ledger ./synthetic-worker.json
```

Stdout is a versioned redacted JSON report identifying records only by queue and ordinal. The same copies produce the same output. Exit 0 means only matching records or no queued evidence, not permission; 1 means evidence needs review; 2 means invalid input. Every result sets `allowDispatch: false`. There are no writes, database connections, launches or network calls; do not pass live state files. The 4 MiB per-copy limit is intentional.

### Local interruption guard

The test-only launcher enables the apply-intent guard and a strict durable JSON store. The guard saves the original claim key, epoch and desired-state identity before any local effect. It syncs the new state file before replacing the old file and syncs the containing directory. Invalid existing JSON is not treated as empty. The successful post-apply state atomically replaces the intent with the receipt queue. If the process stops before that replacement, restart retains the intent and reports `apply_reconciliation_required` before any new fetch, apply or receipt. A changed epoch or scope cannot clear the intent. The offline report surfaces it for review without printing its contents.

Process-exit tests cover complete and partial local file artifacts, same-epoch and advanced-epoch restart, failure to persist the intent, and corrupt state. These tests do not prove physical power-loss durability or production node actuation. Production service startup does not enable this guard; a production state directory and recovery/clearing procedure still require separate review.

## S3 source candidate: shared startup composition

The installed G4 CLI delegates to the same startup code used by the synthetic
candidate, but it supplies no staged adapter. There is no environment switch
for the installed CLI, no launch unit change, and M-10 stays in force. Only
the separately invoked test harness supplies a local handoff reader. The
staged path requires a numeric loopback HTTP origin, refuses redirects, uses
durable intent storage and preserves stable Worker writer errors.

Candidate duties to review, not an operating authorization:

- **Issue:** the proposed coordinator verifies the current T2/R1 receipt,
  durable journal and active phase/epoch before a publisher may provide a
  short-lived projection. The Agent does not read either database directly.
- **Revoke:** disable the old epoch at the Worker/D1 authority first. Then
  withdraw the projection, stop publishing it, and inspect in-flight work.
  Key removal is not evidence that an earlier node-side effect stopped.
- **Rotate:** use a separate projection-signing key, not an Agent bearer token
  or a manifest key. The synthetic oneshot only reads the configured public
  key at startup; after replacement it rejects old signatures and accepts the
  new matching projection. Key custody, rollout, and revocation timing for the
  real environment are still subject to approval.
- **Recover:** keep old pending receipts and interrupted apply intents as
  evidence. Never relabel, replay, clear state, or fall back to writes on BWH.

No production signers, real keys, remote target, node runtime apply, service
rollout, or switch authorization are supplied by this candidate.
