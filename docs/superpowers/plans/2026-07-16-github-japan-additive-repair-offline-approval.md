# GitHub Japan Additive Repair Offline Approval Implementation Plan

> **Superseded:** The operator selected GitHub-native Mode 1 on 2026-07-17.
> Active implementation authority is
> `docs/superpowers/plans/2026-07-17-github-japan-additive-repair-native-direct.md`.
> This offline-signature plan is retained as historical evidence only and must
> not be executed or mixed with the Mode 1 plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obsolete self-approved Japan production workflow with a source-only, TDD-verified v2 lane that supports repeatable read-only inspection and exactly one offline-signed `additive_missing_only` production write, while preserving host-side atomic nonce enforcement, rollback, and separately verified cleanup.

**Architecture:** Keep GitHub as the execution plane, an Ed25519 private key on the existing encrypted removable drive as the approval plane, and a forced-command production runner as the final enforcement plane. Split the new security boundary into focused approval, framed-transport, and nonce/journal modules; update the existing contract, runner, workflow, and runbook to compose those modules without accepting arbitrary commands or paths.

**Tech Stack:** Node.js ESM, built-in `node:test`, built-in `node:crypto`/`node:fs`/`node:stream`, GitHub Actions YAML, OpenSSH forced command, existing artifact Git-tree verifier, existing Japan additive repair helper and natural-observation helper.

## Global Constraints

- **Risk: A**
- **Process:** approved formal design -> this implementation plan -> exact local Offline Signing Key Generation Gate -> one source-only TDD PR -> exact CI Identity Bootstrap Gate -> inspect-only validation -> separate exact Quantitative Production Execution Gate.
- **Expected PR count:** one source-only implementation PR after this plan. No spec/plan split beyond the already committed formal design and this plan.
- **Validation:** focused RED/GREEN tests per task, full local project validation, exact-head GitHub CI and security checks, and `git diff --check origin/master...HEAD`.
- **Production/AWS impact:** none during source implementation. No GitHub Environment mutation, credential installation, workflow dispatch, SSH, provider access, production read, production write, deploy, restart, database/schema change, or AWS action is authorized by this plan.
- Design authority is `docs/superpowers/specs/2026-07-16-github-japan-additive-repair-offline-approval-design.md`.
- Release unit is `japan-runtime-config`; identity surface is `japan-tuic`; `identity_impact: true`.
- Bundle schema is `2`; execution Gate ID is `github-actions-japan-tuic-additive-repair-20260716-002`.
- Frozen source commit is `47a2a9583fb44cb905e91aade02ae5aa3d635d94`.
- Frozen artifact run is `29495150692`; file is `proxy-gateway-control-plane-cumulative-20260716-003.zip`; size is `4744340`; SHA-256 is `d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd`.
- Frozen mutation is `add=3`, `remove=0`, `deferred_remove=27`, `changed=0`, `missing_material=0`, `projected_map=82`.
- Before Identity Gate is `expected=55`, `mapped=52`, `missing=3`, `stale=27`, `changed=0`, `missing_material=0`.
- After Identity Gate is `expected=55`, `mapped=55`, `missing=0`, `stale=27`, `changed=0`, `missing_material=0`, `retention_state=pending`, `state=degraded`.
- User-visible operations are exactly `inspect` and `execute`; internal host-only terminal operation is `closeout`.
- `inspect` is repeatable, does not require a Bundle, and must not claim a nonce, create a backup, apply, roll back, remove host authorization, or mutate GitHub material.
- `execute` requires the signed Bundle at GitHub preflight and host pre-claim. Only the exclusive nonce claim transitions into the write phase.
- A claimed nonce is never released. Ledger entries remain at least 30 days. The Gate journal and protected backup are not temporary-cleanup targets.
- No application deploy, release-pointer change, dependency installation on target, service/timer restart, manual collector invocation, stale deletion, schema/database mutation, provider/network/account mutation, or infrastructure expansion.
- No general shell, PTY, agent/port/X11 forwarding, SCP, rsync, arbitrary remote command, client-controlled host path, helper path, target, count, strategy, or script.
- Never print or persist a private signing key, SSH private key, raw endpoint, host, runtime principal, UUID, credential reference, protected path/content/digest, controller payload, raw config/env, database row, log, customer data, or provider response.
- The production signing private key must not exist before a separately approved exact local Gate. The plan deliberately contains no removable-drive path; that path and its digest must be bound from live read-only discovery in the future Gate packet.
- Every behavior change follows RED -> GREEN -> focused regression -> commit. Do not combine multiple tasks before witnessing the required failing test.

## File Map

| File | Responsibility |
| --- | --- |
| `scripts/japan-tuic-offline-approval.mjs` | Exact ordered payload, Ed25519 key ID, Bundle sign/verify, and bounded signer CLI. It never accepts SSH material. |
| `server/tests/japan-tuic-offline-approval.test.mjs` | Ephemeral test-key coverage for canonical signing, tamper rejection, TTL, nonce, redaction, and CLI output. |
| `scripts/japan-tuic-additive-repair-frame.mjs` | Closed binary stdin frame for `inspect`, `execute`, and internal `closeout`; exact length and trailing-byte enforcement. |
| `server/tests/japan-tuic-additive-repair-frame.test.mjs` | Unknown operation, oversized Bundle, wrong artifact length, truncation, trailing input, and successful round-trip tests. |
| `scripts/japan-tuic-additive-repair-state.mjs` | Atomic nonce claim, nonce-digest-only ledger identity, aggregate Gate journal validation, atomic replacement, and latest-journal readback. |
| `server/tests/japan-tuic-additive-repair-state.test.mjs` | Exclusive-create race, raw nonce absence, journal schema, atomic replacement, latest selection, and safe-error tests. |
| `config/japan-production-approval-ed25519-public.pem` | Exact public approval key generated only after the local key-generation Gate. Public material only. |
| `config/japan-production-approval-ed25519-key-id.txt` | Exact lowercase SHA-256 of the approved SPKI DER. Public material only. |
| `scripts/japan-tuic-additive-repair-contract.mjs` | v2 frozen public identities, GitHub approval wrapper, aggregate candidate/state/observation validators, operation/closeout receipt schemas, and CLI. |
| `server/tests/japan-tuic-additive-repair-contract.test.mjs` | v2 contract and receipt tests with no production key or production data. |
| `scripts/japan-tuic-additive-repair-runner.mjs` | Binding validation, host-side approval verification, inspect/execute/closeout orchestration, fixed adapter, rollback, and sanitized host receipt. |
| `server/tests/japan-tuic-additive-repair-runner.test.mjs` | State-machine, failure-injection, cleanup retention, host adapter, framed CLI, and redaction tests. |
| `.github/workflows/japan-runtime-config-additive-repair.yml` | Manual master-only operation selector, secretless preflight, five-secret host job, framed SSH calls, receipt validation, and internal closeout call. |
| `server/tests/japan-tuic-additive-repair-workflow.test.mjs` | Static permissions, trigger, operation separation, secret boundary, ordering, forbidden capability, and documentation tests. |
| `docs/GITHUB_DEPLOYMENT_RUNBOOK.md` | Exact future Gate sequence, Bundle signing/dispatch, repeatable inspect, nonce semantics, terminal cleanup, and current `not_deployed` state. |

---

## Mandatory Pre-Implementation Gate P0: Offline Signing Key Generation

P0 must complete after this plan is approved and before Task 1 begins. It is a mandatory authorization stop, not implementation discretion. No production or GitHub authority is included.

- [ ] **P0.1: Perform read-only live discovery only**

After the operator unlocks the existing encrypted removable drive, inspect only the drive identity needed for binding and one new private-key destination that does not exist. Determine one locally installed Ed25519-capable cryptographic tool, its exact executable path, version, and SHA-256. Compute only the intended private path SHA-256; do not record or print the raw path. Record the two intended public repository outputs:

```text
config/japan-production-approval-ed25519-public.pem
config/japan-production-approval-ed25519-key-id.txt
```

Do not create a key during discovery.

- [ ] **P0.2: Present a new exact Risk A local Gate**

The Gate must bind:

- exact cryptographic executable path digest, binary SHA-256, version, and closed Ed25519 command sequence;
- encrypted-drive identity summary and new private-path SHA-256 only;
- PKCS#8 private-key format, SPKI public-key format, exclusive-create behavior, and expected private-file size category;
- the two exact public repository paths;
- key ID derivation as lowercase SHA-256 of SPKI DER;
- allowed output: command success, public key ID, private-file existence/size category, process cleanup, and drive relock state;
- prohibited output/copies: raw private key, raw private path, environment, unrelated drive files, GitHub mutation, SSH, provider/production access, or normal-disk private copy.

Do not proceed until the user explicitly approves that exact Gate.

- [ ] **P0.3: Execute once and read back the closed result**

After approval, run only the Gate-bound command sequence. If any destination exists, stop without overwrite or a second destination. Read back only:

- private file exists on the encrypted drive and is within the approved size category;
- public key parses as Ed25519 SPKI;
- key ID file equals SHA-256 of the public SPKI DER;
- no process-level credential remains;
- encrypted drive is locked.

The private key remains outside Git and normal local storage. Only the two public files proceed into Task 7 for source binding and commit.

---

### Task 1: Exact Offline Approval Protocol And Local Signer

**Files:**
- Create: `scripts/japan-tuic-offline-approval.mjs`
- Create: `server/tests/japan-tuic-offline-approval.test.mjs`

**Interfaces:**
- `JAPAN_TUIC_APPROVAL_PAYLOAD_KEYS`
- `approvalKeyId(publicKeyInput)`
- `buildApprovalPayload({ keyId, workflowCommit, approvalNonce, issuedAt, expiresAt })`
- `signApprovalBundle({ privateKeyInput, workflowCommit, now, ttlMilliseconds, randomBytesFn })`
- `verifyApprovalBundle({ bundle, publicKeyInput, current, now, requireUnexpired })`
- `runJapanTuicOfflineApprovalCli(options)`

- [ ] **Step 1: Write the canonical success test with an ephemeral Ed25519 key**

```js
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  approvalKeyId,
  signApprovalBundle,
  verifyApprovalBundle
} from "../../scripts/japan-tuic-offline-approval.mjs";

function testKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyInput: privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKeyInput: publicKey.export({ type: "spki", format: "pem" })
  };
}

test("signs and verifies the exact v2 production-write payload", () => {
  const keys = testKeys();
  const bundle = signApprovalBundle({
    privateKeyInput: keys.privateKeyInput,
    workflowCommit: "a".repeat(40),
    now: "2026-07-16T20:00:00.000Z",
    ttlMilliseconds: 30 * 60 * 1000,
    randomBytesFn: () => Buffer.alloc(32, 0x4a)
  });

  const result = verifyApprovalBundle({
    bundle,
    publicKeyInput: keys.publicKeyInput,
    current: {
      repository: "gccwebos-com/proxy-gateway-minimal",
      ref: "refs/heads/master",
      workflowPath: ".github/workflows/japan-runtime-config-additive-repair.yml",
      workflowCommit: "a".repeat(40)
    },
    now: "2026-07-16T20:10:00.000Z",
    requireUnexpired: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.keyId, approvalKeyId(keys.publicKeyInput));
  assert.equal(result.approvalNonce, Buffer.alloc(32, 0x4a).toString("hex"));
});
```

Run:

```powershell
node --test server/tests/japan-tuic-offline-approval.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Implement the exact ordered payload and key identity**

Use this exact key order:

```js
export const JAPAN_TUIC_APPROVAL_PAYLOAD_KEYS = Object.freeze([
  "schemaVersion",
  "keyId",
  "authorizationClass",
  "gateId",
  "repository",
  "ref",
  "workflowPath",
  "workflowCommit",
  "releaseUnit",
  "target",
  "surface",
  "strategy",
  "artifactSourceCommit",
  "artifactRunId",
  "artifactFile",
  "artifactSizeBytes",
  "artifactSha256",
  "add",
  "remove",
  "deferredRemove",
  "changed",
  "missingMaterial",
  "projectedMap",
  "approvalNonce",
  "issuedAt",
  "expiresAt"
]);

export function approvalKeyId(publicKeyInput) {
  const key = createPublicKey(publicKeyInput);
  const der = key.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}
```

`buildApprovalPayload` must fill every immutable string exactly from the design and accept only the five dynamic fields named in its interface. Serialize by iterating `JAPAN_TUIC_APPROVAL_PAYLOAD_KEYS`; reject non-string values, key drift, non-canonical timestamps, non-40-hex commits, non-64-hex nonce, issue time after now, expiry at or before issue time, and TTL above `1800000` milliseconds.

The Bundle encoder must sign the compact UTF-8 bytes and return compact outer JSON with keys ordered `payloadBase64Url`, `signatureBase64Url`. The verifier must:

```js
const outer = parseExactCompactJson(bundle, ["payloadBase64Url", "signatureBase64Url"]);
const payloadBytes = decodeCanonicalBase64Url(outer.payloadBase64Url);
const signatureBytes = decodeCanonicalBase64Url(outer.signatureBase64Url);
if (!verify(null, payloadBytes, publicKey, signatureBytes)) {
  throw safeError("approval_signature_invalid");
}
const payload = parseExactCompactJson(
  payloadBytes.toString("utf8"),
  JAPAN_TUIC_APPROVAL_PAYLOAD_KEYS
);
```

Cap the complete Bundle at `8192` UTF-8 bytes before parsing. Reconstruct the exact ordered compact payload and require byte equality so whitespace, duplicate keys, reordered keys, extra keys, missing keys, and non-string values fail closed. Errors contain only fixed safe codes.

- [ ] **Step 3: Add mutation, lifetime, encoding, and redaction tests**

Add table-driven tests for every signed field plus tests for wrong public key, wrong key ID, extra/missing/duplicate fields, reordered payload keys, whitespace, invalid UTF-8, padded or mixed-alphabet Base64URL, oversized Bundle, invalid nonce, future issue time, expired approval, and TTL over 30 minutes.

Use fixed safe assertions:

```js
assert.throws(
  () => verifyApprovalBundle(input),
  (error) => error.code === "approval_signature_invalid"
    && !error.message.includes("gccwebos-com")
    && !error.message.includes("BEGIN PRIVATE KEY")
);
```

- [ ] **Step 4: Add a bounded signer CLI without production material**

The CLI subcommands are closed:

```text
sign --private-key PATH --workflow-commit COMMIT --ttl-minutes 30
key-id --public-key PATH
verify --bundle-file PATH --public-key PATH --workflow-commit COMMIT
```

Rules:

- `sign` generates the 32-byte nonce internally and writes only the Bundle to stdout.
- Private-key files are read as bounded `Buffer` values, zeroed in `finally`, and never named in output or errors. Drop key-object references without claiming OS memory erasure.
- Tests use temporary directories and ephemeral keys only. No fixed test private key is committed.

Run:

```powershell
node --test server/tests/japan-tuic-offline-approval.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add scripts/japan-tuic-offline-approval.mjs server/tests/japan-tuic-offline-approval.test.mjs
git commit -m "feat(ci): add offline production approval protocol"
```

---

### Task 2: Closed Framed SSH Transport

**Files:**
- Create: `scripts/japan-tuic-additive-repair-frame.mjs`
- Create: `server/tests/japan-tuic-additive-repair-frame.test.mjs`

**Interfaces:**
- `JAPAN_TUIC_REPAIR_FRAME`
- `encodeJapanTuicRepairFrame({ operation, bundle, artifact })`
- `decodeJapanTuicRepairFrame(input)`
- `runJapanTuicRepairFrameCli(options)`

- [ ] **Step 1: Write round-trip and rejection tests**

Define one binary frame: ASCII magic `GCCGW-JAPAN-REPAIR`, one version byte `2`, one operation byte, unsigned 32-bit big-endian Bundle length, unsigned 32-bit big-endian artifact length, then Bundle bytes and artifact bytes. Operation codes are exactly `inspect=1`, `execute=2`, `closeout=3`.

```js
test("round-trips the execute frame without interpreting signed bytes", () => {
  const artifact = Buffer.alloc(4744340, 0x21);
  const encoded = encodeJapanTuicRepairFrame({
    operation: "execute",
    bundle: "{\"payloadBase64Url\":\"AA\",\"signatureBase64Url\":\"AA\"}",
    artifact
  });
  const decoded = decodeJapanTuicRepairFrame(encoded);
  assert.equal(decoded.operation, "execute");
  assert.equal(decoded.bundle.includes("payloadBase64Url"), true);
  assert.deepEqual(decoded.artifact, artifact);
});
```

Add exact failures for wrong magic/version, unknown operation, Bundle over 8192 bytes, inspect with non-empty Bundle, execute/closeout with empty Bundle, inspect/execute artifact not exactly `4744340`, closeout with non-empty artifact, truncation, declared-length mismatch, and trailing bytes.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-frame.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Implement the bounded codec and file-only encoder CLI**

```js
export const JAPAN_TUIC_REPAIR_FRAME = Object.freeze({
  magic: "GCCGW-JAPAN-REPAIR",
  version: 2,
  maxBundleBytes: 8192,
  artifactSizeBytes: 4744340,
  operations: Object.freeze({ inspect: 1, execute: 2, closeout: 3 })
});
```

`decodeJapanTuicRepairFrame` accepts a `Buffer` only and rejects input before slicing if total length exceeds the maximum possible frame. The CLI reads bounded files and supports only:

```text
encode --operation inspect --artifact PATH --output PATH
encode --operation execute --bundle-file PATH --artifact PATH --output PATH
encode --operation closeout --bundle-file PATH --output PATH
```

The output uses exclusive create and mode `0600`. It prints one fixed aggregate success record and never prints the Bundle, input paths, or bytes.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-frame.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit Task 2**

```powershell
git add scripts/japan-tuic-additive-repair-frame.mjs server/tests/japan-tuic-additive-repair-frame.test.mjs
git commit -m "feat(ci): add closed Japan repair frame"
```

---

### Task 3: Atomic Nonce Ledger And Aggregate Gate Journal

**Files:**
- Create: `scripts/japan-tuic-additive-repair-state.mjs`
- Create: `server/tests/japan-tuic-additive-repair-state.test.mjs`

**Interfaces:**
- `nonceDigest(approvalNonce)`
- `inspectNonceClaim({ ledgerDirectory, approvalNonce })`
- `claimNonce({ ledgerDirectory, approvalNonce })`
- `validateGateJournal(input)`
- `writeGateJournal({ journalDirectory, nonceSha256, journal })`
- `readGateJournal({ journalDirectory, nonceSha256 })`
- `readLatestGateJournal({ journalDirectory })`

- [ ] **Step 1: Write exclusive-claim and no-raw-nonce tests**

```js
test("permits exactly one atomic claim and stores no raw nonce", () => {
  const root = mkdtempSync(join(tmpdir(), "japan-state-"));
  const ledgerDirectory = join(root, "ledger");
  mkdirSync(ledgerDirectory, { mode: 0o700 });
  const approvalNonce = "42".repeat(32);

  assert.deepEqual(claimNonce({ ledgerDirectory, approvalNonce }), {
    claimed: true,
    nonceSha256: nonceDigest(approvalNonce)
  });
  assert.deepEqual(claimNonce({ ledgerDirectory, approvalNonce }), {
    claimed: false,
    nonceSha256: nonceDigest(approvalNonce),
    reason: "already_claimed"
  });

  const entry = join(ledgerDirectory, nonceDigest(approvalNonce));
  assert.equal(readFileSync(entry, "utf8").includes(approvalNonce), false);
});
```

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-state.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Implement digest-only exclusive claim**

Validate nonce as lowercase 64-hex, resolve child paths only under the supplied absolute directory, then use `openSync(path, "wx", 0o600)` and `closeSync`. Store a fixed empty marker or fixed schema marker with no nonce. Map `EEXIST` only to `already_claimed`; all other filesystem errors become fixed safe categories.

- [ ] **Step 3: Write and implement the closed journal schema**

The journal contains exactly string values and booleans:

```js
const journal = {
  schemaVersion: "2",
  gateId: "github-actions-japan-tuic-additive-repair-20260716-002",
  phase: "observation_validated",
  productionResult: "applied_validated",
  nonceClaimed: true,
  backupCreated: true,
  applyAttempted: true,
  observationPassed: true,
  rollbackVerified: false,
  hostAuthorizationRemoved: false,
  expected: "55",
  mapped: "55",
  missing: "0",
  stale: "27",
  changed: "0",
  missingMaterial: "0",
  safeErrorCategory: "none"
};
```

Closed phase enum:

```text
pre_claim_validated
nonce_claimed
backup_created
apply_attempted
rollback_attempted
observation_validated
terminal
closed_out
```

Closed production result enum:

```text
pending
stopped_after_claim
applied_validated
rolled_back_validated
indeterminate
```

Write to a same-directory exclusive temporary file with mode `0600`, fsync it, rename atomically, and fsync the directory where supported. Remove only the uncommitted temporary file on failure. Journal filenames are exactly the nonce SHA-256. `readLatestGateJournal` selects by filesystem modification time, fails closed on an exact tie, and never returns a raw path or digest.

Add tests for missing/extra fields, invalid enums, non-boolean flags, raw-nonce absence, atomic replacement, interrupted temporary write, latest selection, tie failure, and redacted filesystem errors.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-state.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit Task 3**

```powershell
git add scripts/japan-tuic-additive-repair-state.mjs server/tests/japan-tuic-additive-repair-state.test.mjs
git commit -m "feat(ci): add repair nonce and journal state"
```

---

### Task 4: Upgrade The Shared Contract To v2

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-contract.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-contract.test.mjs`

**Interfaces:**
- Preserve artifact, candidate, post-apply, and natural-observation validators.
- Replace the v1 unsigned approval contract with the Task 1 verifier.
- Replace the single v1 receipt with `validateOperationReceipt(receipt)` and `validateCloseoutReceipt(receipt)`.
- Add `wrapGitHubReceipt({ hostReceipt, runId, runAttempt })`; host receipts never accept run metadata from stdin.

- [ ] **Step 1: Change tests first to the v2 Gate and signed approval**

```js
test("publishes only the approved v2 execution identity", () => {
  assert.equal(JAPAN_TUIC_REPAIR_GATE.schemaVersion, "2");
  assert.equal(
    JAPAN_TUIC_REPAIR_GATE.executionGateId,
    "github-actions-japan-tuic-additive-repair-20260716-002"
  );
  assert.equal("runId" in JAPAN_TUIC_REPAIR_GATE, false);
  assert.equal("runAttempt" in JAPAN_TUIC_REPAIR_GATE, false);
});
```

Change approval tests to generate ephemeral Ed25519 keys and call:

```js
validateExecutionApproval({
  bundle,
  publicKeyInput,
  current: {
    repository: "gccwebos-com/proxy-gateway-minimal",
    ref: "refs/heads/master",
    workflowPath: ".github/workflows/japan-runtime-config-additive-repair.yml",
    workflowCommit: "a".repeat(40)
  },
  now: "2026-07-16T20:10:00.000Z",
  requireUnexpired: true
});
```

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs
```

Expected: FAIL because the current contract still publishes schema `1` and Gate `-001`.

- [ ] **Step 2: Implement operation and closeout receipts**

`inspect` host receipt is aggregate-only and exact:

```js
{
  schemaVersion: "2",
  type: "japan_tuic_additive_repair_operation",
  operation: "inspect",
  productionResult: "not_attempted",
  nonceState: "not_applicable",
  candidate: { add: "3", remove: "0", deferredRemove: "27", changed: "0", missingMaterial: "0", projectedMap: "82" },
  identity: { expected: "55", mapped: "52", missing: "3", stale: "27", changed: "0", missingMaterial: "0", retentionState: "pending", state: "degraded" },
  writes: "0",
  restartDelta: "0",
  hostAuthorization: "retained",
  safeErrorCategory: "none"
}
```

`execute` allows only these production results:

```text
stopped_pre_claim_retryable
already_claimed_read_only
stopped_after_claim
applied_validated
rolled_back_validated
indeterminate
```

Only `applied_validated` and `rolled_back_validated` may use `hostAuthorization=retained_pending_closeout` and `closeout=host_cleanup_pending`. `stopped_pre_claim_retryable` must use `hostAuthorization=retained`, and `stopped_after_claim` or `indeterminate` must not claim cleanup completion.

The closeout receipt is exact:

```js
{
  schemaVersion: "2",
  type: "japan_tuic_additive_repair_closeout",
  operation: "closeout",
  productionResult: "applied_validated",
  hostAuthorization: "removed",
  closeout: "github_cleanup_pending",
  safeErrorCategory: "none"
}
```

`wrapGitHubReceipt` validates decimal `runId` and `runAttempt`, adds them only after the host receipt is validated, and never signs or sends them to the host.

- [ ] **Step 3: Update the CLI and regress all contract tests**

Closed commands:

```text
artifact --input PATH
approval --bundle-file PATH --public-key PATH
receipt --input PATH --run-id DECIMAL --run-attempt DECIMAL
closeout-receipt --input PATH
```

The `approval` command obtains repository/ref/workflow path/workflow commit from fixed GitHub environment variables, never from JSON input. It writes only a fixed safe validation record. Receipt commands write validated aggregate JSON only.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit Task 4**

```powershell
git add scripts/japan-tuic-additive-repair-contract.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
git commit -m "refactor(ci): bind Japan repair contract to signed v2 gate"
```

---

### Task 5: Implement The Host Inspect/Execute/Closeout State Machine

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Binding changes:**
- Set `schemaVersion` to `2` and Gate ID to `github-actions-japan-tuic-additive-repair-20260716-002`.
- Preserve existing absolute protected paths and systemd unit identities.
- Add absolute root-owned paths `approvalPublicKey`, `nonceLedgerDirectory`, and `gateJournalDirectory`.
- Require the authorization marker to bind the v2 Gate and exact CI fingerprint during the later bootstrap Gate.

- [ ] **Step 1: Write binding and framed-CLI RED tests**

Change `validBinding()` to include the three new paths, then require:

```js
assert.equal(validateRunnerBinding(validBinding()).schemaVersion, "2");
assert.throws(
  () => validateRunnerBinding({
    ...validBinding(),
    paths: { ...validBinding().paths, nonceLedgerDirectory: "relative/ledger" }
  }),
  (error) => error.code === "binding_validation_failed"
);
```

Replace the raw-ZIP CLI test with encoded `inspect`, `execute`, and `closeout` frames. Assert that `SSH_ORIGINAL_COMMAND` is ignored and no argv value can select an operation or host path.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL on schema and raw stdin assumptions.

- [ ] **Step 2: Extract one shared read-only inspection pipeline**

Implement:

```js
export async function inspectJapanTuicAdditiveRepair({
  rawBinding,
  artifactBytes,
  operations,
  journalReadback = true
}) {
  const binding = validateRunnerBinding(rawBinding);
  const received = await operations.receiveArtifactBytes(artifactBytes);
  await operations.verifyArchive(received);
  const extracted = await operations.extractArchive(received);
  await operations.verifyGitTree(extracted);
  await operations.verifyHostBinding(binding);
  const first = await operations.collectCandidate(extracted);
  await operations.waitForStableSnapshot();
  const second = await operations.collectCandidate(extracted);
  validateStableCandidate(first, second);
  const identity = await operations.collectIdentityGate();
  const runtime = await operations.collectRuntimeBaselines();
  const journal = journalReadback
    ? await operations.readLatestGateJournal(binding.paths.gateJournalDirectory)
    : { present: false };
  return buildInspectionReceipt({ candidate: second, identity, runtime, journal });
}
```

The helper always runs without `--apply`. This path has no methods for nonce claim, backup, apply, rollback, or authorization removal. Tests inject traps for all write methods and assert zero calls.

- [ ] **Step 3: Write pre-claim, nonce-race, and post-claim failure tests**

Add separate tests proving:

- signature/artifact/target/snapshot/candidate failures return `stopped_pre_claim_retryable`, perform zero protected writes, retain host authorization, and clean only received/extracted temporary files;
- expiry is checked again immediately before `claimNonce`;
- `claimNonce=false` returns `already_claimed_read_only` plus current aggregate inspection and performs no backup/apply;
- backup failure after a successful claim returns `stopped_after_claim`, keeps the ledger entry and authorization, and requires a new Bundle for another write;
- process interruption after claim is reconstructed from ledger plus journal by later `inspect`.

The call order assertion for the first write boundary is exact:

```js
assert.deepEqual(calls.slice(-4), [
  "verifyApprovalImmediatelyBeforeClaim",
  "claimNonce",
  "writeJournal:nonce_claimed",
  "createProtectedBackup"
]);
```

- [ ] **Step 4: Implement execute with durable phase transitions**

```js
export async function executeJapanTuicAdditiveRepair({
  rawBinding,
  artifactBytes,
  bundle,
  operations,
  now
}) {
  const binding = validateRunnerBinding(rawBinding);
  const approval = await operations.verifyApproval({
    bundle,
    publicKeyPath: binding.paths.approvalPublicKey,
    now,
    requireUnexpired: true
  });
  const inspection = await inspectJapanTuicAdditiveRepair({
    rawBinding: binding,
    artifactBytes,
    operations,
    journalReadback: true
  });
  await operations.verifyApprovalImmediatelyBeforeClaim(approval);
  const claim = await operations.claimNonce(
    binding.paths.nonceLedgerDirectory,
    approval.approvalNonce
  );
  if (!claim.claimed) {
    return buildAlreadyClaimedReceipt(inspection);
  }
  await operations.writeGateJournal("nonce_claimed", claim.nonceSha256);
  return executeClaimedRepair({ binding, inspection, approval, claim, operations });
}
```

`executeClaimedRepair` writes the journal after backup, immediately before and after apply, before and after rollback, after natural observation, and at terminal classification. Expiry is not checked after claim.

`verifyApprovalImmediatelyBeforeClaim` must obtain a fresh clock value inside that operation; it must not reuse the GitHub preflight timestamp or the timestamp captured at runner startup.

- [ ] **Step 5: Preserve rollback semantics and remove premature cleanup**

Update existing apply/observation tests to require:

- post-apply invariant, owner/group/mode, observation, timeout, restart delta, or evidence uncertainty triggers restore;
- verified restore returns `rolled_back_validated`;
- unverified restore returns `indeterminate`;
- success returns `applied_validated` while final identity remains `degraded` because `stale=27`;
- execution `finally` removes artifact/extracted temp only; it does not edit `authorized_keys`.

Delete the current `cleanupHost` call from the execute path. Keep a narrowly named temporary cleanup helper.

- [ ] **Step 6: Implement terminal-only closeout**

```js
export async function closeoutJapanTuicAdditiveRepair({
  rawBinding,
  bundle,
  operations
}) {
  const binding = validateRunnerBinding(rawBinding);
  const approval = await operations.verifyApproval({
    bundle,
    publicKeyPath: binding.paths.approvalPublicKey,
    requireUnexpired: false
  });
  const nonceState = await operations.inspectNonceClaim(
    binding.paths.nonceLedgerDirectory,
    approval.approvalNonce
  );
  const journal = await operations.readGateJournal(
    binding.paths.gateJournalDirectory,
    nonceState.nonceSha256
  );
  assertCloseoutEligible(journal);
  await operations.removeMarkedHostAuthorization(binding);
  await operations.verifyMarkedHostAuthorizationAbsent(binding);
  await operations.writeClosedOutJournal(journal);
  return buildCloseoutReceipt(journal.productionResult);
}
```

Closeout accepts only a claimed nonce and terminal `applied_validated` or `rolled_back_validated` journal. It cannot receive an artifact or call inspect/apply/rollback. Test wrong Bundle, absent ledger, non-terminal journal, `stopped_after_claim`, `indeterminate`, wrong marker, removal failure, and successful readback.

- [ ] **Step 7: Integrate the fixed frame dispatcher and host adapter**

`runJapanTuicAdditiveRepairCli` accepts exactly `--binding ABSOLUTE_PATH`, reads stdin with a hard maximum equal to the largest valid frame, decodes once, and switches only over the three fixed operations. `SSH_ORIGINAL_COMMAND` is ignored. The production adapter suppresses helper stdout/stderr and maps failures to fixed categories.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```powershell
git add scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): add inspect execute and closeout states"
```

---

### Task 6: Redesign The GitHub Workflow Around Public Signed Input

**Files:**
- Modify: `.github/workflows/japan-runtime-config-additive-repair.yml`
- Modify: `server/tests/japan-tuic-additive-repair-workflow.test.mjs`

- [ ] **Step 1: Replace obsolete workflow assertions with v2 RED tests**

Require this exact trigger surface:

```yaml
on:
  workflow_dispatch:
    inputs:
      operation:
        description: Closed Japan repair operation
        required: true
        type: choice
        default: inspect
        options:
          - inspect
          - execute
      approval_bundle:
        description: Offline-signed v2 Bundle; required only for execute
        required: false
        type: string
        default: ""
```

Static tests must assert:

- only `workflow_dispatch` exists;
- `operation` is exactly the two values with `inspect` default;
- `approval_bundle` is not a secret and is never echoed;
- permissions are exactly `actions: read`, `contents: read`;
- preflight contains no `environment`, `secrets`, SSH, SCP, rsync, host, endpoint, or private key;
- host job uses exactly five Environment secrets and never references `JAPAN_CI_APPROVAL_BUNDLE`;
- execute approval verification occurs before the host job can receive secrets;
- inspect builds only an inspect frame and cannot reach claim/backup/apply/rollback/closeout;
- closeout frame construction is internal and conditional on a validated terminal result;
- no push, pull request, schedule, reusable caller, OIDC write, repository/deployment/package write, debug tracing, service restart, dependency installation, or raw receipt output.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: FAIL because the current workflow has no inputs and requires the obsolete Environment approval secret.

- [ ] **Step 2: Implement secretless preflight**

Preflight must:

1. reject non-master ref;
2. reject a non-empty Bundle for `inspect`;
3. require and validate the Bundle for `execute` against the committed public key and exact current workflow commit;
4. checkout and verify the frozen artifact source/tree independently;
5. download and verify exact artifact run/file/size/SHA-256;
6. publish only fixed readiness outputs, never the Bundle or artifact contents.

Keep:

```yaml
permissions:
  actions: read
  contents: read

concurrency:
  group: japan-runtime-config-additive-repair
  cancel-in-progress: false
```

- [ ] **Step 3: Implement one protected host job with inspect/execute branches**

The job boundary is:

```yaml
operate:
  needs: preflight
  if: needs.preflight.outputs.ready == 'true'
  environment: vultr-japan-production
```

Map exactly these secrets inside that job:

```yaml
JAPAN_CI_HOST: ${{ secrets.JAPAN_CI_HOST }}
JAPAN_CI_PORT: ${{ secrets.JAPAN_CI_PORT }}
JAPAN_CI_USER: ${{ secrets.JAPAN_CI_USER }}
JAPAN_CI_PRIVATE_KEY: ${{ secrets.JAPAN_CI_PRIVATE_KEY }}
JAPAN_CI_KNOWN_HOSTS: ${{ secrets.JAPAN_CI_KNOWN_HOSTS }}
```

Write the public Bundle input to a runner-temp mode-`0600` file without echo. Build the selected frame using Task 2 CLI. Send it through one pinned-host SSH session to the fixed forced command. Validate the aggregate host receipt using Task 4 CLI.

Because GitHub jobs do not share a filesystem, the protected job must download the same frozen run/file again and repeat exact size, SHA-256, archive-entry, and Git-tree verification before building the frame. It must not trust a preflight filesystem path or a mutable artifact name.

For `inspect`, stop after successful receipt validation. For `execute`:

- `stopped_pre_claim_retryable` and `already_claimed_read_only` do not build closeout and preserve temporary credentials;
- `stopped_after_claim` and `indeterminate` fail closed and preserve authorization for exact recovery Gate handling;
- only `applied_validated` or `rolled_back_validated` builds a second internal `closeout` frame with the same Bundle and no artifact;
- validate the closeout receipt before reporting `hostAuthorization=removed` and `closeout=github_cleanup_pending`.

Always delete GitHub runner temporary key, known-hosts, Bundle, frame, artifact, and receipt files in an `if: always()` step. Do not delete Environment secrets from the workflow.

- [ ] **Step 4: Add quantitative summary assertions**

The workflow summary is aggregate-only. `inspect` requires:

```text
auth_marker_entries=1
environment_secret_names=5
nonce_ledger_entries=0
add=3 remove=0 deferred_remove=27 changed=0 missing_material=0 projected_map=82
protected_writes=0 service_restart_delta=0 timer_restart_delta=0
```

Successful execute requires:

```text
nonce_ledger_entries=0->1
mapped=52->55 missing=3->0 stale=27
service_restart_delta=0 timer_restart_delta=0
natural_observation=pass identity_state=degraded
host_authorization_entries=1->0
github_environment_secret_names=5->0 after operator cleanup
adjacent_mutations=0
```

The workflow may report `github_environment_secret_names=5->0` only from later controller readback evidence, not by assuming cleanup.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```powershell
git add .github/workflows/japan-runtime-config-additive-repair.yml server/tests/japan-tuic-additive-repair-workflow.test.mjs
git commit -m "feat(ci): require offline approval for Japan repair"
```

---

### Task 7: Bind The Gate-Generated Public Signing Identity

**Files:**
- Create after approval: `config/japan-production-approval-ed25519-public.pem`
- Create after approval: `config/japan-production-approval-ed25519-key-id.txt`
- Modify: `server/tests/japan-tuic-offline-approval.test.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-workflow.test.mjs`

P0 must already have generated the two public files and completed private-material cleanup and drive relock readback. This task never reopens the encrypted drive and never reads the private key.

- [ ] **Step 1: Bind public material in tests**

Add tests that read the committed public key and key-ID files, assert Ed25519 type, assert lowercase 64-hex key ID, recompute the ID from SPKI DER, and prove workflow/contract paths reference the same two files. Never add or scan the removable-drive path into repository fixtures.

Run:

```powershell
node --test server/tests/japan-tuic-offline-approval.test.mjs server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Secret and private-key repository scan**

```powershell
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "BEGIN (OPENSSH |EC |RSA )?PRIVATE KEY|JAPAN_CI_PRIVATE_KEY\s*[:=]\s*[^$]" .
git status --short
```

Expected: no private-key material; only expected symbolic workflow secret references, if matched.

- [ ] **Step 3: Commit only public material and tests**

```powershell
git add config/japan-production-approval-ed25519-public.pem config/japan-production-approval-ed25519-key-id.txt server/tests/japan-tuic-offline-approval.test.mjs server/tests/japan-tuic-additive-repair-workflow.test.mjs
git commit -m "chore(ci): pin Japan approval public key"
```

---

### Task 8: Reconcile Runbook And Source-Only State

**Files:**
- Modify: `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`
- Modify: `server/tests/japan-tuic-additive-repair-workflow.test.mjs`

- [ ] **Step 1: Write documentation RED assertions**

Require the runbook to contain:

```text
production_state: not_deployed
authorizationClass: production_write_once
github-actions-japan-tuic-additive-repair-20260716-002
inspect is repeatable and does not consume a nonce
five temporary Environment connection secrets
offline encrypted removable-drive Ed25519 signer
pre-claim failures retain temporary access
claimed nonce is never released
closeout uses a second internal forced-command frame
stale=27 and identity state remains degraded
control-plane-app remains separately gated
```

Require absence of `JAPAN_CI_APPROVAL_BUNDLE`, required reviewer, second account, six Environment secrets, unsigned approval JSON, and claims that source merge deploys production.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: FAIL on the obsolete runbook text.

- [ ] **Step 2: Rewrite only the Japan additive repair runbook section**

Document the exact Gate sequence and stop conditions from the formal design. Distinguish:

- public signing Bundle from five secret SSH transport values;
- `inspect` from permanent monitoring;
- pre-claim retryability from post-claim nonce consumption;
- host authorization cleanup from GitHub Environment secret cleanup;
- `applied_validated` from healthy identity;
- source readiness from deployment authority.

Keep the superseded v1 design/runbook warning and point operators to the v2 formal design and this plan.

- [ ] **Step 3: Re-run the documentation contract**

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
git diff --check
```

Expected: both PASS.

- [ ] **Step 4: Commit Task 8**

```powershell
git add docs/GITHUB_DEPLOYMENT_RUNBOOK.md server/tests/japan-tuic-additive-repair-workflow.test.mjs
git commit -m "docs(ci): document offline-approved Japan repair"
```

---

### Task 9: Full Source Validation, Security Review, And Draft PR

**Files:**
- Review all files listed in the File Map.
- Do not change production or GitHub settings.

- [ ] **Step 1: Run focused suites together**

```powershell
node --test server/tests/japan-tuic-offline-approval.test.mjs server/tests/japan-tuic-additive-repair-frame.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: PASS with zero failed, skipped, cancelled, or pending tests.

- [ ] **Step 2: Run the complete required local validation matrix**

```powershell
npm test
npm run admin:test
npm run admin:build
npm run cloudflare:site:validate
npm run project-state:check
git diff --check origin/master...HEAD
```

Expected: every command exits `0`.

- [ ] **Step 3: Perform the exact security-boundary review**

Review the changed surface for:

- signature coverage and canonical byte handling;
- duplicate JSON and Base64URL ambiguity;
- key-ID/public-key identity;
- TTL checked twice before claim and never after claim;
- exclusive nonce create and no automatic release;
- journal atomicity and safe enums;
- inspect zero-write capability;
- closeout terminal eligibility;
- forced-command and frame bounds;
- authorization retention on retryable/disconnected states;
- rollback verification and `indeterminate` fail-closed behavior;
- output redaction and absence of private material;
- workflow permission/trigger/secret/job boundaries;
- no application deploy, restart, stale delete, schema/database, provider, network, or infrastructure scope.

Run:

```powershell
git diff --stat origin/master...HEAD
git diff --name-status origin/master...HEAD
git status --short --branch
```

Expected: only the planned source, tests, public key material, design/plan, and runbook files; clean worktree after commits.

- [ ] **Step 4: Push and open one Draft source-only PR**

Push `codex/docs-japan-offline-approval-design` and create one Draft PR. The PR body must include:

- `Risk: A`
- `release_unit: japan-runtime-config`
- `identity_impact: true`
- intent and exact v2 trust boundary;
- frozen artifact/count identities;
- test commands and actual results;
- `production_state: not_deployed`;
- explicit non-goals;
- key-generation Gate evidence limited to public key ID and cleanup/relock categories;
- separate future CI Identity Bootstrap and Quantitative Production Execution Gates.

- [ ] **Step 5: Complete exact-head GitHub quality/security gates**

Wait for and review exact-head results for repository CI, CodeQL, code quality, dependency review, code scanning, secret scanning, vulnerability tasks, and the new Deep Security Scan if available. Treat pending, cancelled, stale-head, or actionable findings as blockers. Fix findings in the same PR with focused RED/GREEN tests and re-run the full local matrix before pushing again.

- [ ] **Step 6: Final promotion decision**

Mark the PR Ready and merge only when:

- all exact-head checks are complete and non-actionable;
- the diff matches the formal design;
- no private key or removable-drive path is present;
- the PR still has no Environment/host/provider/production mutation;
- the runbook still says `production_state: not_deployed`;
- the next action is a new exact CI Identity Bootstrap Gate, not workflow dispatch.

After merge, read back the merge commit and record it as the only workflow commit eligible for the later bootstrap Gate. Do not create the CI SSH identity or dispatch `inspect` under this plan.

## Completion Boundary

This implementation plan is complete when one source-only v2 PR is merged with exact-head validation and the repository contains only the public signing identity. It does not complete the bootstrap, production repair, production cleanup, retention work, or later `control-plane-app` canary.

## Design Coverage Audit

| Approved design surface | Implemented by |
| --- | --- |
| GitHub execution, offline approval, host enforcement | P0 and Tasks 1, 5, 6, 7 |
| Exact v2 signed payload, Ed25519 key ID, TTL, canonical bytes | Tasks 1 and 4 |
| Repeatable `inspect`, signed `execute`, internal `closeout` | Tasks 2, 5, and 6 |
| Atomic nonce claim and retained aggregate journal | Tasks 3 and 5 |
| Retryable pre-claim, consumed post-claim, rollback, indeterminate | Tasks 4 and 5 |
| Temporary host and GitHub credential cleanup boundaries | Tasks 5, 6, and 8 |
| Offline key lifecycle and separate future production Gates | P0 and Tasks 7, 8, and 9 |
| TDD, quantitative acceptance, exact-head security scanning | Tasks 1-9 |
