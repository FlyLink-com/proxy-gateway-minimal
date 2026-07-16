# GitHub Japan Additive Repair CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a source-only, manually dispatched GitHub Actions lane that can later execute exactly one quantitative Japan TUIC `additive_missing_only` repair through a temporary forced-command SSH identity, with stable preflight, aggregate-only evidence, automatic map rollback, and fail-closed cleanup.

**Architecture:** Keep the existing production dry-run workflow unchanged. Add a shared JavaScript contract for frozen artifact/count/receipt validation, a dependency-injected host runner whose production adapter reads a root-owned local binding, and a two-job GitHub workflow that performs no-secret preflight before entering `vultr-japan-production`. The source PR cannot access production because Environment secrets and the host forced-command binding are established only by later exact Risk A Gates.

**Tech Stack:** Node.js 22 ESM, built-in `node:test`, GitHub Actions YAML, built-in `fs`/`crypto`/`child_process`, OpenSSH client, systemd read-only metadata, existing `mihomo-tuic-usage-map-rebuild.mjs`, existing `traffic-accounting-natural-observation.mjs`.

## Global Constraints

- Design authority: `docs/superpowers/specs/2026-07-16-github-japan-additive-repair-cicd-design.md`.
- Capability: `github-japan-runtime-config-additive-repair-cicd@v1`.
- Release unit: `japan-runtime-config`; identity surface: `japan-tuic`; identity impact: `true`.
- The existing `Production Deploy Dry Run` workflow remains non-mutating and credential-free.
- Tool source commit is exactly `47a2a9583fb44cb905e91aade02ae5aa3d635d94`.
- Tool artifact run is exactly `29495150692`.
- Tool artifact file is exactly `proxy-gateway-control-plane-cumulative-20260716-003.zip`.
- Tool artifact size is exactly `4744340` bytes.
- Tool artifact SHA-256 is exactly `d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd`.
- Earlier review basis is `japan-tuic-identity-additive-repair-20260716-002`;
  it is not CI execution authority.
- Planned one-time CI execution Gate ID is exactly
  `github-actions-japan-tuic-additive-repair-20260716-001` and remains
  unapproved during source implementation.
- Frozen mutation is `add=3`, `remove=0`, `deferred_remove=27`, `changed=0`, `missing_material=0`, `projected_map=82`.
- Expected before Identity Gate is `55/52/3/27/0/0`; expected after is `55/55/0/27/0/0`, `retention_state=pending`, `state=degraded`.
- No application deployment, release-pointer change, dependency install on target, service/timer restart, manual collector invocation, stale deletion, schema/database mutation, or infrastructure expansion.
- No general SSH shell, PTY, port/agent/X11 forwarding, SCP, rsync, arbitrary remote command, operator-key reuse, or provider API access.
- No raw endpoint, host, UUID, credential reference, protected path/content/digest, controller response, environment value, database row, log, customer data, or secret in output.
- The three additions are one atomic unit. The implementation must not split them into `1 + 2`.
- Implementation follows strict red-green-refactor. Every behavior change starts with a focused failing test and a witnessed expected failure.

### Security Scan Remediation Amendment

The exact-head Deep Security Scan completed after the initial implementation
plan identified two direct blockers for this PR. The following requirements
supersede any later plan snippet that still shows dispatcher confirmation or
manifest-only artifact validation:

- `workflow_dispatch` has no inputs; the dispatcher cannot supply an approval,
  Gate ID, workflow commit, artifact identity, or confirmation.
- Secretless preflight checks out the frozen source commit independently and
  verifies the artifact digest plus its canonical Git tree before reporting
  ready.
- `vultr-japan-production` must enforce protected `master`, a required reviewer
  distinct from the dispatcher, and prevent self-review.
- The execute job accepts only `JAPAN_CI_APPROVAL_BUNDLE`, a closed, unexpired
  JSON object bound to the exact repository, workflow ref/commit, run ID,
  run attempt, artifact SHA-256, and target. Its maximum lifetime is 30 minutes.
- The approval bundle is the sixth temporary Environment secret and is deleted
  with the five connection secrets during separately authorized closeout.
- `scripts/artifact-git-tree-verifier.mjs` and
  `server/tests/artifact-git-tree-verifier.test.mjs` own the independent source
  tree proof and its traversal, duplicate, file-set, content, and mode tests.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/japan-tuic-additive-repair-contract.mjs` | Frozen public identities, aggregate candidate/post-state validators, natural-observation acceptance, and aggregate receipt validation/CLI. No filesystem paths or SSH behavior. |
| `scripts/artifact-git-tree-verifier.mjs` | Secretless canonical comparison of the frozen ZIP with the exact trusted Git commit. |
| `scripts/japan-tuic-additive-repair-runner.mjs` | Dependency-injected repair state machine plus the production host adapter/CLI. Reads a root-owned binding, receives the exact ZIP on stdin, invokes only fixed helper/system commands, rolls back on post-apply failure, and emits one sanitized receipt. |
| `server/tests/japan-tuic-additive-repair-contract.test.mjs` | Unit coverage for frozen identities, count drift, observation thresholds, receipt schema, and redaction. |
| `server/tests/artifact-git-tree-verifier.test.mjs` | Artifact path, blob, mode, duplicate, traversal, and safe-output coverage. |
| `server/tests/japan-tuic-additive-repair-runner.test.mjs` | Success, pre-apply stop, rollback, cleanup, timer, archive, host-adapter, and protected-output tests using temporary fixtures and injected operations. |
| `server/tests/japan-tuic-additive-repair-workflow.test.mjs` | Static workflow security and ordering contract. |
| `.github/workflows/japan-runtime-config-additive-repair.yml` | Manual two-job GitHub execution lane: secretless preflight followed by protected restricted execution. |
| `docs/GITHUB_DEPLOYMENT_RUNBOOK.md` | Operator-facing source/credential/execution Gate sequence, secret names, cleanup, and explicit current non-deployed status. |

The shared contract is intentionally separate from the runner so GitHub can
validate artifact metadata and the returned receipt without importing any host
operations. The runner remains one file because the orchestration and its
fixed host adapter change as a single forced-command review unit.

---

### Task 1: Frozen Aggregate Contract And Receipt Validator

**Files:**
- Create: `scripts/japan-tuic-additive-repair-contract.mjs`
- Create: `server/tests/japan-tuic-additive-repair-contract.test.mjs`

**Interfaces:**
- Produces: `JAPAN_TUIC_REPAIR_GATE`, `validateArtifactIdentity(input)`, `validateCandidateReport(report)`, `validatePostApplyIdentity(report)`, `validateNaturalObservation(input)`, `validateExecutionReceipt(receipt)`, and `runJapanTuicRepairContractCli(options)`.
- Consumes: no repository runtime state and no external dependency.
- Error contract: throw only `JapanTuicRepairContractError` with one of the fixed safe codes; never include supplied values in the error message.

- [ ] **Step 1: Write failing frozen-identity and count tests**

Create the test file with a canonical artifact input and assert exact acceptance
plus one-field-at-a-time rejection:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  JAPAN_TUIC_REPAIR_GATE,
  validateArtifactIdentity,
  validateCandidateReport,
  validatePostApplyIdentity
} from "../../scripts/japan-tuic-additive-repair-contract.mjs";

const artifact = () => ({
  runId: 29495150692,
  fileName: "proxy-gateway-control-plane-cumulative-20260716-003.zip",
  sizeBytes: 4744340,
  sha256: "d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd",
  sourceCommit: "47a2a9583fb44cb905e91aade02ae5aa3d635d94"
});

const candidate = () => ({
  ok: true,
  candidateReady: true,
  candidate: {
    addCount: 3,
    removeCount: 0,
    deferredRemoveCount: 27,
    deferredChangedCount: 0,
    missingMaterialCount: 0,
    projectedMapCount: 82,
    ready: true
  }
});

test("freezes the approved source, artifact, and additive counts", () => {
  assert.equal(validateArtifactIdentity(artifact()).ok, true);
  assert.equal(validateCandidateReport(candidate()).candidateReady, true);
  assert.equal(JAPAN_TUIC_REPAIR_GATE.strategy, "additive_missing_only");
});

test("rejects any artifact or candidate drift with fixed safe codes", () => {
  assert.throws(
    () => validateArtifactIdentity({ ...artifact(), sizeBytes: 4744341 }),
    (error) => error.code === "artifact_identity_mismatch"
  );
  const drifted = candidate();
  drifted.candidate.addCount = 2;
  assert.throws(
    () => validateCandidateReport(drifted),
    (error) => error.code === "expected_count_mismatch"
  );
  assert.doesNotMatch(
    (() => {
      try { validateArtifactIdentity({ ...artifact(), fileName: "/protected/value" }); }
      catch (error) { return error.message; }
      return "";
    })(),
    /protected|value/
  );
});

test("requires the exact degraded post-apply Identity Gate", () => {
  assert.equal(validatePostApplyIdentity({
    runtimeCount: 55,
    mappedCount: 55,
    missing: 0,
    stale: 27,
    changed: 0,
    missingMaterial: 0,
    retentionState: "pending",
    state: "degraded"
  }).state, "degraded");
});
```

- [ ] **Step 2: Run the contract test and witness RED**

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`scripts/japan-tuic-additive-repair-contract.mjs`.

- [ ] **Step 3: Implement the minimal frozen contract**

Create the module with immutable constants and exact-integer comparison. Use
this public shape:

```js
export const JAPAN_TUIC_REPAIR_GATE = Object.freeze({
  schemaVersion: "1",
  gateBasis: "japan-tuic-identity-additive-repair-20260716-002",
  executionGateId: "github-actions-japan-tuic-additive-repair-20260716-001",
  releaseUnit: "japan-runtime-config",
  surface: "japan-tuic",
  strategy: "additive_missing_only",
  artifact: Object.freeze({
    runId: 29495150692,
    fileName: "proxy-gateway-control-plane-cumulative-20260716-003.zip",
    sizeBytes: 4744340,
    sha256: "d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd",
    sourceCommit: "47a2a9583fb44cb905e91aade02ae5aa3d635d94"
  }),
  candidate: Object.freeze({
    addCount: 3,
    removeCount: 0,
    deferredRemoveCount: 27,
    deferredChangedCount: 0,
    missingMaterialCount: 0,
    projectedMapCount: 82
  }),
  before: Object.freeze({
    runtimeCount: 55, mappedCount: 52, missing: 3,
    stale: 27, changed: 0, missingMaterial: 0
  }),
  after: Object.freeze({
    runtimeCount: 55, mappedCount: 55, missing: 0,
    stale: 27, changed: 0, missingMaterial: 0,
    retentionState: "pending", state: "degraded"
  })
});

export class JapanTuicRepairContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "JapanTuicRepairContractError";
    this.code = code;
  }
}

function exactInteger(actual, expected, code = "expected_count_mismatch") {
  if (!Number.isInteger(actual) || actual !== expected) {
    throw new JapanTuicRepairContractError(code);
  }
}

export function validateArtifactIdentity(input = {}) {
  const expected = JAPAN_TUIC_REPAIR_GATE.artifact;
  if (input.runId !== expected.runId
    || input.fileName !== expected.fileName
    || input.sizeBytes !== expected.sizeBytes
    || input.sha256 !== expected.sha256
    || input.sourceCommit !== expected.sourceCommit) {
    throw new JapanTuicRepairContractError("artifact_identity_mismatch");
  }
  return { ok: true, ...expected };
}
```

Implement `validateCandidateReport` against `report.candidate`, and
`validatePostApplyIdentity` against `JAPAN_TUIC_REPAIR_GATE.after`. Return new
objects containing only the validated aggregate fields.

- [ ] **Step 4: Run the focused tests and witness GREEN**

Run the same `node --test` command.

Expected: PASS, 3 tests, 0 failures.

- [ ] **Step 5: Add natural-observation and receipt tests, then witness RED**

Extend the test file with:

```js
import {
  validateExecutionReceipt,
  validateNaturalObservation
} from "../../scripts/japan-tuic-additive-repair-contract.mjs";

test("accepts only a later natural observation with no Japan TUIC regression", () => {
  const result = validateNaturalObservation({
    applyBoundary: "2026-07-16T20:00:00.000Z",
    baseline: { collectorCount: 5, unresolvedTotal: 1, timerRestarts: 0, serviceRestarts: 0 },
    current: {
      capturedAt: "2026-07-16T20:05:00.000Z",
      collectorInvocationObserved: true,
      timerActive: true,
      timerEnabled: true,
      timerRestarts: 0,
      serviceRestarts: 0,
      collectorCount: 5,
      unresolvedTotal: 1,
      japanTuicUnresolved: 0,
      omittedCollectorCount: 0,
      omittedProducerCount: 0,
      provenanceConserved: true,
      validatorPassed: true
    }
  });
  assert.equal(result.accepted, true);
});

test("rejects a pre-apply observation and any new unresolved result", () => {
  const base = {
    applyBoundary: "2026-07-16T20:00:00.000Z",
    baseline: { collectorCount: 5, unresolvedTotal: 1, timerRestarts: 0, serviceRestarts: 0 },
    current: {
      capturedAt: "2026-07-16T20:05:00.000Z",
      collectorInvocationObserved: true,
      timerActive: true,
      timerEnabled: true,
      timerRestarts: 0,
      serviceRestarts: 0,
      collectorCount: 5,
      unresolvedTotal: 1,
      japanTuicUnresolved: 0,
      omittedCollectorCount: 0,
      omittedProducerCount: 0,
      provenanceConserved: true,
      validatorPassed: true
    }
  };
  assert.throws(
    () => validateNaturalObservation({ ...base, current: { ...base.current, capturedAt: base.applyBoundary } }),
    (error) => error.code === "natural_observation_failed"
  );
  assert.throws(
    () => validateNaturalObservation({ ...base, current: { ...base.current, unresolvedTotal: 2 } }),
    (error) => error.code === "natural_observation_failed"
  );
});

test("validates an aggregate receipt without preserving unknown fields", () => {
  const receipt = validateExecutionReceipt({
    schemaVersion: "1",
    type: "japan_tuic_additive_repair_execution",
    productionResult: "applied_validated",
    hostCredentialCleanup: "verified",
    closeout: "github_cleanup_pending",
    candidate: JAPAN_TUIC_REPAIR_GATE.candidate,
    identityAfter: JAPAN_TUIC_REPAIR_GATE.after,
    naturalObservation: { accepted: true, collectorCount: 5, unresolvedTotal: 1 },
    ignoredProtectedValue: "/must/not/survive"
  });
  assert.equal(receipt.productionResult, "applied_validated");
  assert.equal(JSON.stringify(receipt).includes("must/not/survive"), false);
});
```

Run the focused test.

Expected: FAIL because the three functions are not implemented.

- [ ] **Step 6: Implement the observation, receipt, and CLI contract**

Implement exact scalar checks. `validateNaturalObservation` must require:

```js
const accepted = Date.parse(current.capturedAt) > Date.parse(applyBoundary)
  && current.collectorInvocationObserved === true
  && current.timerActive === true
  && current.timerEnabled === true
  && current.timerRestarts === baseline.timerRestarts
  && current.serviceRestarts === baseline.serviceRestarts
  && current.collectorCount === baseline.collectorCount
  && current.unresolvedTotal <= baseline.unresolvedTotal
  && current.japanTuicUnresolved === 0
  && current.omittedCollectorCount === 0
  && current.omittedProducerCount === 0
  && current.provenanceConserved === true
  && current.validatorPassed === true;
```

`validateExecutionReceipt` must rebuild a whitelist-only object and accept only
`applied_validated`, `rolled_back_validated`, `stopped_pre_apply`, or
`indeterminate`. Add a CLI with two subcommands:

```text
artifact --manifest <file> --artifact <file> --run-id 29495150692
receipt --input <file>
```

The artifact command computes the local file size/SHA-256, reads
`artifact.json`, calls `validateArtifactIdentity`, and prints only
`{"ok":true,"type":"japan_tuic_artifact_preflight"}`. The receipt command
prints only the validated whitelist object. On error, print a fixed safe object
with `ok=false` and `error=<safe code>`.

- [ ] **Step 7: Run focused tests and commit Task 1**

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs
git diff --check
git add scripts/japan-tuic-additive-repair-contract.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
git commit -m "feat(ci): add Japan repair execution contract"
```

Expected: all focused tests pass and the commit contains only the contract and
its test.

---

### Task 2: Dependency-Injected Forced-Command Repair State Machine

**Files:**
- Create: `scripts/japan-tuic-additive-repair-runner.mjs`
- Create: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Consumes: Task 1 validators and the exact helper/validator modules extracted from the approved tool artifact.
- Produces: `validateRunnerBinding(value)`, `validateArchiveEntries(entries)`, `deriveWaitBudget(timerState)`, `executeJapanTuicAdditiveRepair(options)`, `createHostOperations(options)`, and `runJapanTuicAdditiveRepairCli(options)`.
- Internal state-machine helpers defined in this task: `validateBeforeIdentity`,
  `validateAppliedReport`, `validatePostApplyCandidate`,
  `assertStableAggregate`, `assertMetadataPreserved`,
  `waitForNaturalObservation`, `verifyRollback`, and `buildReceipt`. These are
  private functions; later tasks call only the exported interfaces above.
- `options.operations` interface:

```ts
receiveArtifact(stdin): Promise<{ path: string, sizeBytes: number, sha256: string }>
listArchiveEntries(path): Promise<string[]>
extractArtifact(path): Promise<{ root: string }>
runMapHelper({ root, binding, apply }): Promise<object>
readIdentityGate({ root, binding }): Promise<object>
readFileMetadata(path): Promise<{ mode: number, uid: number, gid: number }>
createBackup(binding): Promise<{ ref: string }>
restoreBackup(binding, backup): Promise<void>
readTimerState(binding): Promise<{ active: boolean, enabled: boolean, timerRestarts: number, serviceRestarts: number, intervalSeconds: number }>
readNaturalObservation({ root, binding }): Promise<object>
sleep(milliseconds): Promise<void>
removeTemporaryMaterial(binding): Promise<boolean>
revokeOwnAuthorization(binding): Promise<boolean>
```

- The root-owned binding schema contains only `schemaVersion`, `gateId`, exact
  absolute local paths under `paths`, fixed unit names under `units`, and one
  authorization marker. `paths` has exactly `currentMap`, `mihomoConfig`,
  `materialStore`, `producerStatus`, `naturalObservation`, `backupDirectory`,
  `temporaryRoot`, and `authorizedKeys`. `units` has exactly `timer` and
  `service`, whose values must be `gccgw-traffic-usage-collect.timer` and
  `gccgw-traffic-usage-collect.service`. Counts, artifact identities, strategy,
  channel, and output policy come from Task 1 constants and cannot be
  overridden.

- [ ] **Step 1: Write failing binding, archive, and wait-budget tests**

Create tests that use synthetic paths in a temporary directory and assert:

```js
test("binding accepts only the exact gate and fixed production unit names", () => {
  const binding = validBinding();
  assert.equal(validateRunnerBinding(binding).gateId, JAPAN_TUIC_REPAIR_GATE.executionGateId);
  assert.throws(
    () => validateRunnerBinding({ ...binding, gateId: "another-gate" }),
    (error) => error.code === "target_identity_mismatch"
  );
});

test("archive inspection requires reviewed helpers and rejects unsafe paths", () => {
  assert.deepEqual(validateArchiveEntries([
    "scripts/mihomo-tuic-usage-map-rebuild.mjs",
    "scripts/traffic-accounting-natural-observation.mjs",
    "server/services/platform/traffic-collector-admin-projection.mjs",
    "server/services/platform/traffic-collector-status-producers.mjs"
  ]), {
    safe: true,
    entryCount: 4
  });
  for (const entry of ["../escape", "/absolute", "C:/windows"]) {
    assert.throws(() => validateArchiveEntries([entry]), (error) => error.code === "artifact_identity_mismatch");
  }
});

test("wait budget uses two live intervals plus sixty seconds and caps at twelve minutes", () => {
  assert.equal(deriveWaitBudget({ intervalSeconds: 300 }), 660000);
  assert.equal(deriveWaitBudget({ intervalSeconds: 600 }), 720000);
  assert.throws(() => deriveWaitBudget({ intervalSeconds: 0 }), (error) => error.code === "stable_snapshot_unavailable");
});
```

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the runner.

- [ ] **Step 2: Implement binding/archive/wait validation and witness GREEN**

Create the runner exports. Binding validation must reject missing, relative,
NUL-containing, duplicate, or extra fields without printing field values.
Archive entries are accepted only when every name is a normalized relative path
and the four exact reviewed helper/import files in the test are present. The
full repository source tree is allowed because the approved ZIP is a `git
archive` of the exact source commit and its complete bytes are already frozen
by SHA-256. ZIP symlink/device entries are rejected by the host adapter before
extraction.

Implement:

```js
export function deriveWaitBudget({ intervalSeconds } = {}) {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw safeError("stable_snapshot_unavailable");
  }
  return Math.min(720_000, (intervalSeconds * 2 + 60) * 1000);
}
```

Run the focused tests. Expected: PASS for binding, archive, and wait budget.

- [ ] **Step 3: Write the failing success-path state-machine test**

Build a fake operation set that records method names and returns two identical
candidate reports, one backup, an accepted post-apply identity, and a later
natural observation. Assert exact order:

```js
assert.deepEqual(calls, [
  "receiveArtifact",
  "listArchiveEntries",
  "extractArtifact",
  "runMapHelper:dry",
  "readIdentityGate:before",
  "runMapHelper:dry",
  "readIdentityGate:before",
  "readFileMetadata:before",
  "readTimerState:before",
  "readNaturalObservation:baseline",
  "createBackup",
  "runMapHelper:apply",
  "runMapHelper:dry",
  "readIdentityGate:after",
  "readFileMetadata:after",
  "readTimerState:after",
  "readNaturalObservation:current",
  "removeTemporaryMaterial",
  "revokeOwnAuthorization"
]);
assert.equal(receipt.productionResult, "applied_validated");
assert.equal(receipt.hostCredentialCleanup, "verified");
assert.equal(receipt.closeout, "github_cleanup_pending");
```

Run the focused test. Expected: FAIL because
`executeJapanTuicAdditiveRepair` is not implemented.

- [ ] **Step 4: Implement the minimal success state machine and witness GREEN**

Implement this fixed phase model:

```js
const phase = {
  applied: false,
  backup: null,
  productionResult: "stopped_pre_apply"
};

try {
  const artifact = await operations.receiveArtifact(artifactStream);
  validateArtifactIdentity({ ...artifact, runId: JAPAN_TUIC_REPAIR_GATE.artifact.runId,
    fileName: JAPAN_TUIC_REPAIR_GATE.artifact.fileName,
    sourceCommit: JAPAN_TUIC_REPAIR_GATE.artifact.sourceCommit });
  validateArchiveEntries(await operations.listArchiveEntries(artifact.path));
  const extracted = await operations.extractArtifact(artifact.path);
  const first = validateCandidateReport(await operations.runMapHelper({ root: extracted.root, binding, apply: false }));
  const beforeOne = validateBeforeIdentity(await operations.readIdentityGate({ root: extracted.root, binding, phase: "before" }));
  const second = validateCandidateReport(await operations.runMapHelper({ root: extracted.root, binding, apply: false }));
  const beforeTwo = validateBeforeIdentity(await operations.readIdentityGate({ root: extracted.root, binding, phase: "before" }));
  assertStableAggregate(first, second, beforeOne, beforeTwo);
  const metadataBefore = await operations.readFileMetadata(binding.paths.currentMap);
  const timerBefore = await operations.readTimerState(binding);
  const observationBefore = await operations.readNaturalObservation({ root: extracted.root, binding, phase: "baseline" });
  phase.backup = await operations.createBackup(binding);
  const applyBoundary = now().toISOString();
  validateAppliedReport(await operations.runMapHelper({ root: extracted.root, binding, apply: true }));
  phase.applied = true;
  validatePostApplyCandidate(await operations.runMapHelper({ root: extracted.root, binding, apply: false }));
  validatePostApplyIdentity(await operations.readIdentityGate({ root: extracted.root, binding, phase: "after" }));
  assertMetadataPreserved(metadataBefore, await operations.readFileMetadata(binding.paths.currentMap));
  const timerAfter = await operations.readTimerState(binding);
  const observation = await waitForNaturalObservation({ operations, extracted, binding,
    baseline: observationBefore, applyBoundary, timerBefore, timerAfter });
  phase.productionResult = "applied_validated";
  return buildReceipt({ phase, observation });
} catch (error) {
  if (!phase.applied) return buildStoppedReceipt(error);
  await operations.restoreBackup(binding, phase.backup);
  await verifyRollback(operations, binding);
  phase.productionResult = "rolled_back_validated";
  return buildReceipt({ phase, error });
} finally {
  await operations.removeTemporaryMaterial(binding);
  await operations.revokeOwnAuthorization(binding);
}
```

The concrete implementation must preserve cleanup results in the returned
receipt even though JavaScript `return` is evaluated before `finally`; use a
single mutable safe receipt and return only after the `finally` block.

- [ ] **Step 5: Write failing rollback and cleanup tests**

Inject failures after apply for post-identity, metadata, timer, natural
observation, and deadline paths. For each case assert `restoreBackup` occurs
once, rollback performs a fresh dry-run/identity/metadata read, and the result
is `rolled_back_validated`. Add separate failures proving:

- a pre-apply count mismatch never calls backup/apply/restore;
- failed rollback becomes `indeterminate` with
  `error=rollback_verification_failed`;
- cleanup always runs after success, stop, rollback, and thrown adapter errors;
- cleanup failure sets `hostCredentialCleanup=failed` and
  `closeout=incomplete` without exposing the underlying exception;
- no captured output contains protected fixture paths, UUID-like strings, or
  fixture secrets.

Run the focused test. Expected: FAIL on the first unimplemented rollback or
cleanup invariant.

- [ ] **Step 6: Implement rollback, cleanup, and sanitized receipt paths**

Implement one catch boundary that maps only the fixed safe error codes from the
spec. Rollback must restore only the bound backup and then prove the exact
before candidate, Identity Gate, and owner/mode metadata. Cleanup order is
temporary source first, marked authorization second. The backup is never
removed by cleanup.

Run the focused test. Expected: all state-machine cases pass.

- [ ] **Step 7: Commit Task 2**

```powershell
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git diff --check
git add scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): orchestrate restricted Japan repair"
```

---

### Task 3: Production Host Adapter And Forced-Command CLI

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Consumes: the Task 2 operation interface.
- Produces: `createHostOperations({ binding, stdin, stdout, stderr })` and a
  direct-invocation CLI that accepts only `--binding <absolute-root-owned-file>`.
- External executables: exact `/usr/bin/node`, `/usr/bin/unzip`, and
  `/usr/bin/systemctl` paths verified by the future bootstrap Gate. Invoke with
  `execFile` argument arrays; never invoke a shell.

- [ ] **Step 1: Write failing host-adapter filesystem and process tests**

Use a temporary directory and injected `execFileFn` to assert:

- artifact stdin is written mode `0600`, capped at `4744340` bytes, hashed, and
  rejected on any extra or missing byte;
- `unzip -Z1` and `unzip -ZTs` are called before `unzip -qq -d`;
- ZIP traversal, absolute names, symlinks, devices, or a missing required helper
  stop before extraction;
- map helper invocation uses an argument array with the six exact expected
  counts and `--strategy additive_missing_only`; `--apply` appears only in the
  apply phase;
- systemd is queried only with `show` for the two fixed units and fixed
  properties; no `start`, `restart`, `enable`, `disable`, or daemon mutation is
  possible;
- helper/systemd stderr is discarded and mapped to a safe code;
- backup creation uses exclusive creation, copies bytes, and records metadata
  without returning its path;
- restore uses a same-directory temporary file, owner/mode restoration, and
  atomic rename;
- authorization cleanup removes only the exact marked line and refuses zero or
  multiple matches.

Run the focused test. Expected: FAIL because production operations are absent.

- [ ] **Step 2: Implement artifact receive and archive extraction**

Use `createWriteStream` with `flags: "wx"`, `mode: 0o600`, and a transform that
aborts after `sizeBytes + 1`. Compute SHA-256 while streaming, then call
`validateArtifactIdentity`. Parse `unzip -Z1` names and `unzip -ZTs` entry types
without printing either output. Extract into a newly created mode-`0700`
directory under the bound temporary root.

Run the artifact subset. Expected: PASS.

- [ ] **Step 3: Implement fixed helper and systemd adapters**

Map helper arguments exactly:

```js
const args = [
  helperPath,
  "--current-map", binding.paths.currentMap,
  "--mihomo-config", binding.paths.mihomoConfig,
  "--material-store", binding.paths.materialStore,
  "--status-path", binding.paths.producerStatus,
  "--strategy", "additive_missing_only",
  "--expected-add", "3",
  "--expected-remove", "0",
  "--expected-deferred-remove", "27",
  "--expected-changed", "0",
  "--expected-missing-material", "0",
  "--expected-projected-map-count", "82"
];
if (apply) args.push("--apply");
```

Capture stdout with a strict byte limit, parse one JSON object, and discard
stderr. For systemd, parse only `ActiveState`, `UnitFileState`, `NRestarts`,
`LastTriggerUSec`, and `NextElapseUSecRealtime`. Derive a positive live interval
from the last/next trigger boundary and use `deriveWaitBudget`.

Run adapter tests. Expected: PASS.

- [ ] **Step 4: Implement protected observation, backup, rollback, and cleanup**

Read the bound natural-observation JSON with a strict byte cap and pass it to
the extracted `traffic-accounting-natural-observation.mjs` validator through
`/usr/bin/node` stdin. Inspect the protected input in memory only to obtain the
safe target aggregate and never serialize the input. Return only:

```js
{
  capturedAt,
  collectorInvocationObserved,
  timerActive,
  timerEnabled,
  timerRestarts,
  serviceRestarts,
  collectorCount,
  unresolvedTotal,
  japanTuicUnresolved,
  omittedCollectorCount,
  omittedProducerCount,
  provenanceConserved,
  validatorPassed
}
```

Implement backup/restore with fs primitives and the bound directory. Implement
temporary cleanup and exact-marker authorization removal with read-after-write
verification. Never return paths, digests, raw identifiers, or raw errors.

- [ ] **Step 5: Write failing CLI/redaction tests, then implement the CLI**

Test that the CLI:

- rejects every argument except one `--binding` absolute file;
- rejects binding owner/mode that is not the bootstrap-reviewed root-owned
  `0600` boundary on Linux;
- emits exactly one receipt JSON object on stdout;
- emits one fixed error object on stderr before a state machine exists;
- ignores `SSH_ORIGINAL_COMMAND` and never executes it;
- never echoes binding content, paths, archive entries, helper stderr, or
  protected observation input.

Implement direct invocation using `realpathSync`, call
`runJapanTuicAdditiveRepairCli`, and set only the returned numeric exit code.
Exit `0` for `applied_validated`, `2` for `rolled_back_validated` or
`stopped_pre_apply`, and `1` for indeterminate or invalid invocation.

- [ ] **Step 6: Run focused tests and commit Task 3**

```powershell
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git diff --check
git add scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): add forced-command Japan repair runner"
```

---

### Task 4: Protected Two-Job GitHub Workflow

**Files:**
- Create: `.github/workflows/japan-runtime-config-additive-repair.yml`
- Create: `server/tests/japan-tuic-additive-repair-workflow.test.mjs`

**Interfaces:**
- Consumes: Task 1 artifact/receipt CLI and the Task 3 host forced-command CLI installed later by Gate 2.
- Environment: `vultr-japan-production` only on the `execute` job.
- Temporary Environment secret names: `JAPAN_CI_APPROVAL_BUNDLE`,
  `JAPAN_CI_HOST`, `JAPAN_CI_PORT`,
  `JAPAN_CI_USER`, `JAPAN_CI_PRIVATE_KEY`, `JAPAN_CI_KNOWN_HOSTS`.
- Dispatch inputs: none. Approval is Environment-issued and run-bound.

- [ ] **Step 1: Write the failing workflow security contract**

Create a static test that reads the future workflow and requires:

```js
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s*(push|pull_request|pull_request_target|schedule):/m);
assert.match(workflow, /permissions:\r?\n  actions: read\r?\n  contents: read/);
assert.doesNotMatch(workflow, /id-token: write|contents: write|packages: write|deployments: write/);
assert.match(preflight, /if: github\.ref == 'refs\/heads\/master'/);
assert.doesNotMatch(preflight, /environment:|secrets\.|\bssh\b|\bscp\b|\brsync\b/);
assert.match(execute, /needs: preflight/);
assert.match(execute, /environment: vultr-japan-production/);
assert.match(execute, /concurrency:/);
assert.match(execute, /cancel-in-progress: false/);
assert.equal((workflow.match(/actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8\.0\.1/g) ?? []).length, 2);
assert.equal((workflow.match(/actions\/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6/g) ?? []).length, 3);
assert.equal((workflow.match(/actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6/g) ?? []).length, 2);
assert.doesNotMatch(workflow, /ssh\s+-v|set\s+-x|cat\s+.*(?:key|known|receipt)|tee\s+.*receipt/i);
assert.doesNotMatch(workflow, /systemctl\s+(?:start|restart|enable|disable)|npm\s+(?:ci|install)|\bscp\b|\brsync\b/);
```

Also assert that both jobs validate the artifact, only `execute` reads secrets,
preflight independently checks out source `47a2a9583fb44cb905e91aade02ae5aa3d635d94`
and runs the canonical artifact Git-tree verifier, `workflow_dispatch` has no
inputs, the execute job validates the exact `JAPAN_CI_APPROVAL_BUNDLE` before
connection material,
SSH has `BatchMode=yes`, `IdentitiesOnly=yes`, `StrictHostKeyChecking=yes`,
`LogLevel=ERROR`, forwarding disabled, and receipt validation occurs before any
summary output.

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: FAIL because the workflow does not exist.

- [ ] **Step 2: Implement the manual trigger and secretless preflight**

Create the workflow with:

```yaml
name: Japan Runtime Config Additive Repair

on:
  workflow_dispatch:

permissions:
  actions: read
  contents: read

jobs:
  preflight:
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    timeout-minutes: 10
```

Checkout the workflow commit and the frozen source commit independently, then
setup Node with the exact pinned identities listed in the test.
Download artifact name
`production-dry-run-japan-control-plane-control-plane-cumulative-20260716-003`
from run `29495150692`, call the Task 1 artifact CLI, and run the canonical
Git-tree verifier against the frozen source checkout. Emit only `ready=true`
through `GITHUB_OUTPUT`.

- [ ] **Step 3: Run the workflow test and confirm the expected partial RED**

Expected: trigger/preflight assertions pass; execute-job assertions fail because
the job is not yet present.

- [ ] **Step 4: Implement the protected execute job**

Add an `execute` job that:

- requires `preflight` and its exact `ready=true` output;
- repeats checkout, Node setup, artifact download, and artifact validation;
- binds `environment: vultr-japan-production`;
- validates the closed `JAPAN_CI_APPROVAL_BUNDLE` against the current
  repository, workflow ref/commit, run ID/attempt, artifact digest, target, and
  30-minute expiry before reading connection secrets;
- uses workflow-level concurrency group `japan-runtime-config-additive-repair`
  with `cancel-in-progress: false`;
- writes key and known-host material to `RUNNER_TEMP` with mode `0600` without
  printing it;
- validates port is an integer from `1` through `65535` and host/user are
  non-empty without printing their values;
- invokes only:

```bash
ssh -T \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o LogLevel=ERROR \
  -o ClearAllForwardings=yes \
  -o RequestTTY=no \
  -o UserKnownHostsFile="$KNOWN_HOSTS_FILE" \
  -i "$KEY_FILE" \
  -p "$JAPAN_CI_PORT" \
  -- "$JAPAN_CI_USER@$JAPAN_CI_HOST"
```

Redirect the approved artifact ZIP to stdin, stdout to a mode-`0600` receipt
file, and stderr to a mode-`0600` discard file. Never print the SSH command.
Run Task 1 `receipt` validation against the file. Append only the validated
whitelist receipt to `GITHUB_STEP_SUMMARY`, then fail the job for
`stopped_pre_apply`, `rolled_back_validated`, `indeterminate`, or host-cleanup
failure. `if: always()` cleanup removes the local key, known-hosts, receipt,
discard, and artifact directories and verifies absence.

- [ ] **Step 5: Run workflow and CI-lane tests, then commit Task 4**

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
npm run test:ci-lanes
git diff --check
git add .github/workflows/japan-runtime-config-additive-repair.yml server/tests/japan-tuic-additive-repair-workflow.test.mjs
git commit -m "feat(ci): add protected Japan repair workflow"
```

Expected: all workflow contract tests pass. No workflow is dispatched.

---

### Task 5: Runbook, Full Validation, And Source-Only Handoff

**Files:**
- Modify: `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`
- Modify only if required by an existing index contract: `docs/README.md`
- Verify: all Task 1-4 files

**Interfaces:**
- Consumes: the final source implementation and design.
- Produces: an operator runbook that names Gate 1 source review, Gate 2 CI
  identity bootstrap, Gate 3 quantitative execution, cleanup readback, and the
  later independent control-plane canary boundary.

- [ ] **Step 1: Write the runbook assertions before changing documentation**

Extend the workflow test or add assertions in the existing CI workflow contract
test requiring `docs/GITHUB_DEPLOYMENT_RUNBOOK.md` to contain:

```text
japan-runtime-config
vultr-japan-production
additive_missing_only
CI Identity Bootstrap Gate
Quantitative Production Execution Gate
JAPAN_CI_APPROVAL_BUNDLE
JAPAN_CI_PRIVATE_KEY
required reviewer
prevent self-review
artifact Git tree
host authorization revocation
GitHub secret deletion
control-plane-app is not authorized
```

Run the focused test. Expected: FAIL on the first missing runbook marker.

- [ ] **Step 2: Update the runbook with the exact non-deployed boundary**

Document:

- current source-only status and the fact that Environment secrets are absent;
- exact workflow trigger, artifact identity, and aggregate metrics;
- temporary secret names without values;
- bootstrap mutations and forbidden actions;
- execution phases, stop/rollback matrix, natural-observation thresholds, and
  12-minute cap;
- host self-revocation followed by operator-side GitHub secret deletion/readback;
- no application deploy/restart and no automatic canary authorization;
- short aggregate Change Record fields required after production execution.

Do not claim the workflow is deployed, enabled, credentialed, or production
validated.

- [ ] **Step 3: Run focused and complete local validation**

Run in this order:

```powershell
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
npm test
npm run admin:test
npm run admin:build
npm run cloudflare:site:validate
npm run project-state:check
git diff --check origin/master...HEAD
```

Expected: every command exits `0`. The Cloudflare command is a build/verify/dry
run only and must not deploy.

- [ ] **Step 4: Perform source security review**

Verify with repository searches:

```powershell
rg -n "pull_request_target|id-token: write|contents: write|packages: write|deployments: write|ssh -v|set -x|\bscp\b|\brsync\b|systemctl (start|restart|enable|disable)|npm (ci|install)" .github/workflows/japan-runtime-config-additive-repair.yml scripts/japan-tuic-additive-repair-*.mjs
rg -n "BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|password\s*[:=]|token\s*[:=]|(?:[0-9]{1,3}\.){3}[0-9]{1,3}" .github/workflows/japan-runtime-config-additive-repair.yml scripts/japan-tuic-additive-repair-*.mjs docs/GITHUB_DEPLOYMENT_RUNBOOK.md
```

Expected: the first search returns only test-forbidden text or no matches; the
second returns no credential, raw endpoint, or key material. Review the exact
diff for command injection, output leakage, unsafe archive handling, incomplete
rollback, and cleanup ordering.

- [ ] **Step 5: Commit Task 5**

```powershell
git add docs/GITHUB_DEPLOYMENT_RUNBOOK.md docs/README.md server/tests/japan-tuic-additive-repair-workflow.test.mjs
git commit -m "docs(ci): add Japan repair production gates"
```

Omit `docs/README.md` from `git add` when no index change is required.

- [ ] **Step 6: Push source branch and create a Draft PR**

Push `codex/github-japan-additive-repair-cicd-design` and create one Draft PR
declaring:

```yaml
capability: github-japan-runtime-config-additive-repair-cicd@v1
release_unit: japan-runtime-config
production_state: not_deployed
identity_impact: true
identity_gate:
  surface: japan-tuic
  state: pending
```

The PR body must include intent, files, exact local validation, no-production
statement, remaining Gate 2/Gate 3, rollback design, and code-quality/security
check requirements. Do not configure Environment secrets or trigger the new
workflow from the source PR.

- [ ] **Step 7: Review checks and close the source-only PR**

Wait for GitHub CI, CodeQL, dependency/security scanning, and code-quality
results. Fix all actionable findings in the same PR with focused regression
tests. Re-run the complete local validation after the last fix, review the
final changed surface, mark Ready only when the PR closure is complete, merge,
and verify the exact merge commit on `master`.

Production remains blocked after merge. The next action is to prepare, present,
and receive explicit approval for the exact CI Identity Bootstrap Gate; Gate 3
is prepared only after Gate 2 publishes a complete cleanup-capable receipt.

## Plan Self-Review Checklist

- [ ] Every design component maps to a Task 1-5 file and test.
- [ ] Artifact, candidate, before, and after identities match the approved spec.
- [ ] The workflow has separate secretless and Environment-bound jobs.
- [ ] No task changes the existing dry-run workflow's authority.
- [ ] No task creates or stores a production credential during source implementation.
- [ ] Success, stopped-pre-apply, rollback, indeterminate, and cleanup-failure paths are tested.
- [ ] Natural observation is timer-driven and bounded; no restart/manual trigger exists.
- [ ] The plan contains no placeholder, secret, endpoint, raw host, or production path.
- [ ] Control-plane canary work is explicitly deferred to a separate Gate and design.
