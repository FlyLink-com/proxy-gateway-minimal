# GitHub Japan Additive Repair Native Direct Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blocked six-secret approval-bundle workflow with a source-only, TDD-verified Mode 1 lane that lets the single GitHub operator repeat read-only inspection and execute exactly one fixed `additive_missing_only` Japan runtime-config repair through a crash-aware forced-command runner.

**Architecture:** GitHub Actions is the execution and procedural approval plane; a root-owned forced-command entrypoint and runner are the technical enforcement plane. A closed stdin frame carries only the selected operation, exact workflow commit, fixed public nonce/Gate identity, and frozen artifact; the host validates the artifact independently, serializes every operation with OS `flock`, and uses a durable nonce ledger, monotonic journal, deterministic backup, fsync envelope, aggregate validation, rollback, and separate terminal closeout.

**Tech Stack:** Node.js 22 ESM, built-in `node:test`, `node:crypto`, `node:fs`, `node:stream`, POSIX shell, util-linux `flock`, GitHub Actions YAML, OpenSSH forced command, existing artifact Git-tree verifier, frozen Japan repair helper and natural-observation helper.

## Global Constraints

- **Risk: A (source-only implementation, production impact none).**
- **Process:** approved Mode 1 design -> this TDD plan -> one source-only PR -> exact-head CI/security scans -> merge -> exact CI Identity Bootstrap Gate -> repeatable inspect -> separate exact Quantitative Production Execution Gate -> terminal closeout -> separate GitHub secret cleanup Gate.
- **Expected PR count:** one source-only implementation PR. Do not split spec, plan, code, tests, or runbook into separate PRs.
- **Validation:** focused RED/GREEN per task, full `npm test`, `git diff --check origin/master...HEAD`, exact-head GitHub CI, CodeQL/code scanning, available dependency/secret scanning, and independent security review.
- **Production/AWS impact:** none during this plan. Do not mutate GitHub settings or secrets, dispatch the workflow, connect with SSH, inspect or write production, access a provider, deploy an application, restart a service, change schema/database state, or perform AWS actions.
- Design authority: `docs/superpowers/specs/2026-07-17-github-japan-additive-repair-native-direct-design.md`.
- Superseded design: `docs/superpowers/specs/2026-07-16-github-japan-additive-repair-offline-approval-design.md`.
- Release unit: `japan-runtime-config`; surface: `japan-tuic`; strategy: `additive_missing_only`; `identity_impact: true`.
- Execution Gate ID: `github-actions-japan-tuic-additive-repair-20260717-001`.
- Frozen public nonce: `88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b`.
- Expected nonce SHA-256: `af3b8363d75cf920ca5dea15835c1d6e33684997bc05fa48e2da6e7804e33029`.
- Frozen source commit: `47a2a9583fb44cb905e91aade02ae5aa3d635d94`.
- Frozen artifact run/file/size/SHA-256: `29495150692`, `proxy-gateway-control-plane-cumulative-20260716-003.zip`, `4744340`, `d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd`.
- Frozen artifact central-directory entry count/manifest SHA-256: `1217`, `39695581ec714c792540a2ffca6e040631f913be6b3839f14e78aad619b2609d`.
- Candidate: `add=3`, `remove=0`, `deferred_remove=27`, `changed=0`, `missing_material=0`, `projected_map=82`.
- Before: `expected=55`, `mapped=52`, `missing=3`, `stale=27`, `changed=0`, `missing_material=0`.
- After: `expected=55`, `mapped=55`, `missing=0`, `stale=27`, `changed=0`, `missing_material=0`, `retention_state=pending`, `state=degraded`.
- User-visible operations are exactly `inspect` and `execute`. `closeout` is internal and terminal-only.
- `inspect` may use verified scratch for the frozen artifact, but makes zero ledger, journal, backup, target, authorization, GitHub, rollback, or runtime writes.
- `execute` first reads ledger/journal. A claimed slot becomes zero-write `replay_reconciled` before old pre-state validation.
- An unclaimed durable `prepared` state is not automatically retried. A new exact Gate may authorize another first-attempt dispatch after stable revalidation.
- The claim is never released. Ledger, journal, and protected backup are not normal temporary-cleanup targets.
- No arbitrary nonce, Gate ID, host, path, target, command, strategy, count, or artifact workflow input.
- No general shell, PTY, forwarding, SCP, rsync, broad sudo, service control, manual collector invocation, stale deletion, app deploy, schema/database mutation, or provider/network/account expansion.
- Never print or write to durable host state, receipt, or log an SSH private key, offline private key, raw endpoint, raw nonce, host path, runtime principal, UUID, credential reference, raw config/env, database row, customer data, provider response, or raw error. The public frozen nonce may exist only in reviewed source and bounded ephemeral frame scratch.
- Every behavior change follows RED -> GREEN -> focused regression -> fresh task review -> commit. Do not combine tasks before witnessing the planned failure.

## File Map

| File | Responsibility |
| --- | --- |
| `scripts/japan-tuic-additive-repair-frame.mjs` | Canonical closed control JSON plus bounded framed stdin encoder/reader with strict EOF. |
| `server/tests/japan-tuic-additive-repair-frame.test.mjs` | Canonical order, duplicate/extra keys, invalid UTF-8, truncation, size, operation, and trailing-byte tests. |
| `scripts/japan-tuic-additive-repair-state.mjs` | Fixed nonce/claim derivation, journal schema/transitions, durable exclusive writes, atomic replacement, file/dir fsync, and state readback. |
| `server/tests/japan-tuic-additive-repair-state.test.mjs` | Concurrent claim, CAS/transition, crash-window, raw-nonce absence, and injected fsync/rename failures. |
| `scripts/japan-tuic-additive-repair-contract.mjs` | v3 frozen identities, Mode 1 control validation, aggregate validators, strict receipt schemas, and workflow CLI. |
| `server/tests/japan-tuic-additive-repair-contract.test.mjs` | v3 control/receipt/timestamp/error tests; removes the v1 approval-bundle model. |
| `scripts/japan-tuic-additive-repair-entrypoint.sh` | Digest-bound installation source for env-empty absolute-path `flock` + Node forced entrypoint. |
| `server/tests/japan-tuic-additive-repair-entrypoint.test.mjs` | Static absolute argv, env scrub, no PATH lookup, lock exit, and no remote command tests. |
| `scripts/japan-tuic-additive-repair-runner.mjs` | Root binding/path validation, host artifact verification, inspect/replay, durable execute/rollback, closeout, and sanitized CLI receipts. |
| `server/tests/japan-tuic-additive-repair-runner.test.mjs` | Binding/path, read-only call counts, state machine, helper envelope, crash injection, rollback, closeout, and redaction tests. |
| `.github/workflows/japan-runtime-config-additive-repair.yml` | Manual operation selector, two secretless artifact/tree checks, one five-secret SSH step, framed calls, receipt validation, and cleanup. |
| `server/tests/japan-tuic-additive-repair-workflow.test.mjs` | Trigger/input, pinned action, secret ordering/count, shell injection, SSH option, closeout, and forbidden-capability tests. |
| `config/japan-production-approval-ed25519-public.pem` | Dormant public Ed25519 identity; not an active Mode 1 dependency. |
| `config/japan-production-approval-ed25519-key-id.txt` | Dormant public key ID; not an active Mode 1 dependency. |
| `docs/GITHUB_DEPLOYMENT_RUNBOOK.md` | Mode 1 trust boundary, exact post-merge gates, repair lifecycle master freeze, receipts, recovery, and cleanup. |
| `docs/README.md` | Active design/plan navigation. |
| `docs/superpowers/plans/2026-07-16-github-japan-additive-repair-offline-approval.md` | Marked superseded; retained as historical evidence only. |

---

### Task 1: Closed Frame Protocol

**Files:**
- Create: `scripts/japan-tuic-additive-repair-frame.mjs`
- Create: `server/tests/japan-tuic-additive-repair-frame.test.mjs`

**Interfaces:**
- Produces: `FRAME_SCHEMA_VERSION`, `FRAME_MAGIC`, `canonicalRepairControl(input)`, `encodeRepairFrame({ control, artifact })`, `readRepairFrame(input, { expectedArtifactSize, maxControlBytes })`, `JapanTuicRepairFrameError`.
- Control forms:
  - inspect: `{ operation, runAttempt, schemaVersion, workflowCommit }`
  - execute/closeout: `{ executionGateId, executionNonce, operation, runAttempt, schemaVersion, workflowCommit }`

- [ ] **Step 1: Write failing canonical and framing tests**

Add tests that use a 40-hex workflow commit and a three-byte fixture artifact:

```js
const inspect = {
  operation: "inspect",
  runAttempt: "2",
  schemaVersion: "3",
  workflowCommit: "a".repeat(40)
};
const execute = {
  executionGateId: "github-actions-japan-tuic-additive-repair-20260717-001",
  executionNonce: "88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b",
  operation: "execute",
  runAttempt: "1",
  schemaVersion: "3",
  workflowCommit: "a".repeat(40)
};
assert.deepEqual(
  await readRepairFrame(Readable.from(encodeRepairFrame({ control: execute, artifact: Buffer.from("zip") })), {
    expectedArtifactSize: 3,
    maxControlBytes: 1024
  }),
  { control: execute, artifact: Buffer.from("zip") }
);
```

Cover all of these exact failures: wrong magic/version; unknown operation;
missing, extra, duplicate, or reordered JSON keys; invalid UTF-8; control over
1024 bytes; wrong artifact length; artifact on `closeout`; no artifact on
`inspect`/`execute`; header/body truncation; and one trailing byte.

- [ ] **Step 2: Run the focused test and witness RED**

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-frame.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`scripts/japan-tuic-additive-repair-frame.mjs`.

- [ ] **Step 3: Implement the minimal closed protocol**

Use ASCII magic `GCCGWJPR3\0`, a big-endian uint32 control length, a big-endian
uint32 artifact length, canonical UTF-8 JSON, then artifact bytes. Read only the
declared total plus one sentinel byte. Parse JSON, rebuild through
`canonicalRepairControl()`, and require the rebuilt bytes to equal the received
control bytes exactly; this rejects duplicate keys and reordered keys without a
third-party parser. Bound total input to `magic + 8 + 1024 + 4744340 + 1`.

```js
export const FRAME_SCHEMA_VERSION = "3";
export const FRAME_MAGIC = Buffer.from("GCCGWJPR3\0", "ascii");

export class JapanTuicRepairFrameError extends Error {
  constructor(code) {
    super(code);
    this.name = "JapanTuicRepairFrameError";
    this.code = code;
  }
}
```

All failures use only `frame_invalid`, `frame_too_large`, or
`frame_trailing_bytes`.

- [ ] **Step 4: Run GREEN and focused regression**

Run:

```powershell
node --test server/tests/japan-tuic-additive-repair-frame.test.mjs
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: new frame suite PASS; existing v1 contract/runner suites remain PASS.

- [ ] **Step 5: Fresh review and commit**

Review exact Task 1 diff for unbounded reads, permissive JSON, and raw control
output. Then:

```powershell
git add scripts/japan-tuic-additive-repair-frame.mjs server/tests/japan-tuic-additive-repair-frame.test.mjs
git commit -m "feat(ci): add closed Japan repair frame"
```

---

### Task 2: Durable One-Time State

**Files:**
- Create: `scripts/japan-tuic-additive-repair-state.mjs`
- Create: `server/tests/japan-tuic-additive-repair-state.test.mjs`

**Interfaces:**
- Produces: `EXPECTED_NONCE_SHA256`, `executionNonceSha256(nonce)`, `executionClaimSha256(control)`, `validateJournal(record)`, `validateJournalTransition(current, next)`, `createRepairStateStore({ paths, io })`.
- Store methods: `readSnapshot()`, `writePrepared(record)`, `claim(control)`, `transition(expectedSequence, next)`, `writeBackupReceipt(record)`, `readBackupReceipt()`.

- [ ] **Step 1: Write failing pure-schema and injected-I/O tests**

Create a fake `io` that records `open`, `write`, `fsyncFile`, `rename`,
`fsyncDirectory`, and `close` calls. Assert:

```js
assert.equal(
  executionNonceSha256("88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b"),
  "af3b8363d75cf920ca5dea15835c1d6e33684997bc05fa48e2da6e7804e33029"
);
assert.throws(
  () => store.claim({ ...executeControl, executionNonce: "0".repeat(64) }),
  { code: "execution_claim_mismatch" }
);
```

Test the exact claim, backup, and journal keys plus transition/field matrix from
the design. Reject a sequence skip, stale CAS, terminal regression, `applied`
without backup, a raw nonce field anywhere, and a timestamp outside
`YYYY-MM-DDTHH:mm:ss.sssZ` or one that fails exact ISO round-trip. Inject
failure at exclusive create, file fsync,
rename, and directory fsync; no later phase may appear. Race two `claim()`
calls and require exactly one create while the second reads the existing claim.

Require exact record literals and primitives: `schemaVersion: "3"`; types
`japan_tuic_additive_repair_claim`,
`japan_tuic_additive_repair_backup`, and
`japan_tuic_additive_repair_journal`; lowercase digest/commit widths;
nonnegative sequence/mode/uid/gid integers; canonical timestamps; and only the
designated string-or-null fields.

- [ ] **Step 2: Run focused test and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-state.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement canonical claim, journal, and durability primitives**

Use exact canonical claim keys:

```js
const CLAIM_KEYS = Object.freeze([
  "artifactSha256",
  "executionGateId",
  "executionNonce",
  "releaseUnit",
  "strategy",
  "surface",
  "target",
  "workflowCommit"
]);
```

The default Linux I/O opens new files with `O_CREAT | O_EXCL | O_WRONLY |
O_NOFOLLOW`, mode `0600`; atomic replacement creates a same-directory exclusive
temporary file, writes canonical single-line JSON, fsyncs it, renames it, then
opens/fsyncs the parent directory. The store writes only nonce/claim digests,
never `executionNonce`. Implement the exact claim/backup/journal keys,
phase-transition matrix, and phase-dependent null/non-null relationships from
the design. Journal transitions use exact `sequence + 1` CAS.

- [ ] **Step 4: Run GREEN, crash matrix, and raw-nonce scan**

```powershell
node --test server/tests/japan-tuic-additive-repair-state.test.mjs
rg -n "88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b" scripts/japan-tuic-additive-repair-state.mjs server/tests/japan-tuic-additive-repair-state.test.mjs
```

Expected: tests PASS; the nonce may occur only in test input and must not occur
in serialized ledger/journal assertions.

- [ ] **Step 5: Fresh review and commit**

Review transition completeness, fsync ordering, temp cleanup ownership, and
error redaction. Then:

```powershell
git add scripts/japan-tuic-additive-repair-state.mjs server/tests/japan-tuic-additive-repair-state.test.mjs
git commit -m "feat(ci): add durable Japan repair state"
```

---

### Task 3: Add Mode 1 Contract And Receipt Schemas

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-contract.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 canonical controls and frames; Task 2 nonce/claim digests.
- Produces temporarily: `JAPAN_TUIC_REPAIR_GATE_V3` schema `3`, `buildOperationControl({ operation, workflowCommit, runAttempt })`, `validateOperationControl(control)`, `validateInspectReceipt(input)`, `validateExecuteReceipt(input)`, `validateCloseoutReceipt(input)`, and CLI commands `artifact`, `frame`, and `receipt`. The existing `JAPAN_TUIC_REPAIR_GATE` v1 export remains only for unchanged compatibility callers through Task 8.

- [ ] **Step 1: Add failing Mode 1 tests beside temporary v1 compatibility tests**

Keep the existing v1 tests temporarily so the unmodified runner/workflow stay
green through Tasks 3-8. Add separate v3 tests that require:

```js
assert.deepEqual(buildOperationControl({
  operation: "execute",
  workflowCommit: "b".repeat(40),
  runAttempt: "1"
}), {
  executionGateId: "github-actions-japan-tuic-additive-repair-20260717-001",
  executionNonce: "88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b",
  operation: "execute",
  runAttempt: "1",
  schemaVersion: "3",
  workflowCommit: "b".repeat(40)
});
assert.throws(
  () => buildOperationControl({ operation: "execute", workflowCommit: "b".repeat(40), runAttempt: "2" }),
  { code: "workflow_identity_mismatch" }
);
```

Inspect accepts any positive run attempt. Execute and closeout accept only
`"1"`. Receipt tests cover the exact design enums and reject an unknown field,
raw nonce, raw path, endpoint-shaped value, multiline output, timestamp without
milliseconds, and contradictory phase/result.

Freeze the exact receipt keys from the design:

```text
inspect: schemaVersion, type, inspectionResult, journalPhase,
         terminalResult, candidate, identity, error
execute: schemaVersion, type, productionResult, journalPhase,
         terminalResult, closeoutEligible, rollbackVerified,
         candidate, identity, naturalObservation, error
closeout: schemaVersion, type, closeoutResult, terminalResult,
          hostAuthorizationCleanup, githubCleanup, error
```

Require `schemaVersion: "3"` and exact types
`japan_tuic_additive_repair_inspection`,
`japan_tuic_additive_repair_execution`, and
`japan_tuic_additive_repair_closeout`. Enforce the design's primitive,
object-or-null, enum, digest, timestamp, and error constraints for every field.

Test every enum/phase combination in the design matrix. In particular,
`replay_reconciled` may be nonterminal; only a matching durable
`applied_validated` or `rolled_back_validated` journal/terminal pair sets
`closeoutEligible: true`. Treat the active design's **Exact External Receipt
Matrix** as normative, including the claim-created/`prepared` crash row,
result-specific aggregate profiles, terminal-replay mismatch downgrade,
operation-specific safe-error subsets, and closeout mutation boundary.

- [ ] **Step 2: Run focused test and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs
```

Expected: FAIL because Mode 1 exports do not exist.

- [ ] **Step 3: Implement v3 while preserving frozen aggregate validators**

Keep artifact, candidate, before/after identity, and natural-observation
constants and validators. Add `JAPAN_TUIC_REPAIR_GATE_V3` and v3 interfaces
without changing the existing `JAPAN_TUIC_REPAIR_GATE` v1 export, v1 named
exports, or `approval` CLI yet; that compatibility surface is used only by
unchanged code and is removed with its callers in Task 9. No new Mode 1 code may
call it. Use the exact timestamp regex:

```js
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
```

Accept a timestamp only when the regex matches, `Date.parse(value)` is finite,
and `new Date(value).toISOString() === value`.

The `frame` CLI takes only `--operation`, `--workflow-commit`, `--run-attempt`,
and for inspect/execute the frozen `--artifact` path. It validates the artifact
before emitting binary stdout. The `receipt` CLI takes `--operation` and a
bounded file plus decimal `--ssh-status`, emits one canonical sanitized JSON
line, and never includes raw SSH stderr. Status `75` synthesizes the exact
operation-specific lock-conflict receipt from the design without parsing host
stdout; other nonzero/missing/invalid receipts are operation-specific
indeterminate evidence. Implement the design's exact `0..255` status grammar,
65536-byte input bound, canonical UTF-8 JSON plus one-LF requirement, nonzero
no-read rule, and non-`75` closeout `cleanup_indeterminate` mapping.

- [ ] **Step 4: Run GREEN and all Japan contract/frame/state suites**

```powershell
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-frame.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs
```

Expected: all PASS; v1 compatibility and its tests remain isolated through Task
8 and are removed in Task 9, while all new interfaces use schema `3`.

- [ ] **Step 5: Fresh review and commit**

```powershell
git add scripts/japan-tuic-additive-repair-contract.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
git commit -m "refactor(ci): switch Japan repair contract to mode one"
```

---

### Task 4: Environment-Scrubbed Forced Entrypoint And Binding

**Files:**
- Create: `scripts/japan-tuic-additive-repair-entrypoint.sh`
- Create: `server/tests/japan-tuic-additive-repair-entrypoint.test.mjs`
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Produces: a source template installed later at one digest-bound absolute path; `validateRunnerBinding(input, context)` schema `3`; `validateTrustedPathChain(path, policy, operations)`.
- Binding adds: `expectedEuid`, `expectedWorkflowCommit`, `expectedNonceSha256`, `expectedClaimSha256`, `writerFreeze`, `paths.stateDirectory`, and `paths.lockFile`; schema-3 binding checks use `JAPAN_TUIC_REPAIR_GATE_V3` while the temporary v1 execution helper remains isolated. `writerFreeze` has exact keys `knownWriterCount`, `evidenceSha256`, and `residualRisk`, requiring `0`, one 64-hex bootstrap evidence digest, and `trusted_root_concurrency_not_machine_proven`.

- [ ] **Step 1: Write failing entrypoint and binding tests**

Assert the shell source contains one `exec /usr/bin/env -i`, fixed `LANG` and
`PATH`, absolute `/usr/bin/flock`, conflict exit `75`, an absolute lock path,
absolute `/usr/bin/node`, absolute installed runner, and absolute binding. It
must not contain `$SSH_ORIGINAL_COMMAND`, `eval`, `sh -c`, relative executables,
`NODE_OPTIONS`, `NODE_PATH`, a variable command, or a second command path.

Add runner tests whose fake path operations return exact `lstat/open/fstat`
records. Accept only numeric EUID `0`, root-owned non-symlink components, fixed
file/dir modes, `nlink=1` files, mode-`0700` state/backup directories, and no
group/other writable component. Reject a symlink, owner drift, mode drift,
binding commit drift, nonce digest drift, claim digest drift, and EUID drift.

- [ ] **Step 2: Run focused tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: entrypoint module/file missing and binding schema assertions fail.

- [ ] **Step 3: Add the exact no-variable entrypoint**

The committed template is the only command target allowed by `authorized_keys`
and sudoers. `authorized_keys` invokes exactly
`/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint`
with no caller-controlled argument. The entrypoint bytes are:

```sh
#!/bin/sh
set -eu
exec /usr/bin/env -i LANG=C.UTF-8 PATH=/usr/bin:/bin \
  /usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 \
  /var/lib/gccgw/japan-tuic-additive-repair/repair.lock \
  /usr/bin/node --disable-proto=throw \
  /usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs \
  --binding /etc/gccgw/japan-tuic-additive-repair-binding.json
```

The bootstrap Gate must bind the installed bytes and configure sudoers for
exactly this no-argument absolute entrypoint with `env_reset`, no `SETENV`, and fixed
`secure_path`. No installation occurs in this task.

- [ ] **Step 4: Implement binding/path validation without touching production**

Upgrade binding schema to `3`. Validation first checks exact JSON keys and
frozen public identities, then uses injected `lstat/open/fstat/close` operations
to verify each component and the opened final inode. Reject `NODE_OPTIONS`,
`NODE_PATH`, and non-empty `SSH_ORIGINAL_COMMAND` when CLI tests bypass the
env-empty wrapper. Error output remains `restricted_identity_rejected` only.

- [ ] **Step 5: Run GREEN and commit**

```powershell
node --test server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git add scripts/japan-tuic-additive-repair-entrypoint.sh scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): harden Japan repair forced entrypoint"
```

Expected: focused suites PASS; no host or GitHub action occurs.

---

### Task 5: Host Artifact Verification And Read-Only Inspection

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Consumes: `readRepairFrame()`, Mode 1 contract, durable state snapshot.
- Produces: `inspectJapanTuicAdditiveRepair({ binding, frame, operations })`, `reconcileClaimedState({ snapshot, operations })`, and host operations for verified scratch receive/extract/cleanup. The existing execute CLI remains temporarily callable only by its existing local tests until Task 8 replaces it.

- [ ] **Step 1: Write failing host-verification and inspect call-count tests**

Use an operations spy with counters for `claim`, `writeJournal`, `createBackup`,
`runApply`, `restoreBackup`, and `revokeAuthorization`. For fresh inspect and
claimed inspect, require every counter to remain zero. Verify these classes:

```js
assert.equal((await inspectFresh()).inspectionResult, "ready_unclaimed_revalidation_required");
assert.equal((await inspectClaimed()).inspectionResult, "claimed_nonterminal");
assert.equal((await inspectTerminal()).inspectionResult, "terminal_reconciled");
assert.equal((await inspectIndeterminate()).inspectionResult, "indeterminate_reconciled");
```

Add host artifact failures for wrong exact size/SHA, entry count other than
`1217`, central-directory manifest digest other than
`39695581ec714c792540a2ffca6e040631f913be6b3839f14e78aad619b2609d`,
disallowed path, symlink entry, special file type, external-attribute drift,
truncation, trailing byte, and
scratch cleanup failure. Host verification must complete before state write or
candidate helper invocation. Add a claimed-success fixture whose current state
is after-state and prove old before-state validation is never called.

- [ ] **Step 2: Run focused runner tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL because the runner still consumes raw ZIP and only executes v1.

- [ ] **Step 3: Implement frame-first, ledger-first inspection**

The new exported inspect path reads one bounded frame, verifies
binding/control workflow commit and fixed claim identities, then receives the
artifact into mode-`0700` scratch and
mode-`0600` file. It fsyncs the artifact and scratch parent, validates size/hash,
parses the ZIP central directory, validates the exact count and the design's
length-prefixed manifest digest, rejects unsafe/symlink/special entries, then
validates strict EOF and extraction paths before full extraction. The exact
artifact hash plus full manifest digest is the complete allowlist; required
helper imports must each occur exactly once.

After host artifact verification, read ledger/journal before candidate state:

```text
claim present + successful terminal journal -> validate current aggregate terminal state
claim present + indeterminate journal -> indeterminate_reconciled, never closeout
claim present + nonterminal journal -> validate journal only, never old before-state
claim absent + prepared journal -> re-run read-only stable candidate, classify revalidation required
claim absent + no journal -> run two read-only stable candidate snapshots
```

Inspect may read timer/natural observation but never invokes the collector. It
always verifies scratch cleanup before emitting one bounded sanitized receipt.
Do not switch the production CLI entrypoint in Task 5; Task 8 performs that
atomic migration after execute/closeout are implemented, keeping every task
commit testable.

- [ ] **Step 4: Run GREEN, redaction scan, and commit**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-frame.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
rg -n "SSH_ORIGINAL_COMMAND|rawEndpoint|executionNonce|currentMap" server/tests/japan-tuic-additive-repair-runner.test.mjs
git add scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): add read-only Japan repair inspection"
```

Expected: suites PASS; any sensitive-looking fixture value is synthetic and is
asserted absent from receipts.

---

### Task 6: Durable Claim, Backup, And Apply Envelope

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: the success path of `executeJapanTuicAdditiveRepairV3({ binding, frame, operations })` and durable backup/apply operations.

- [ ] **Step 1: Write failing state-machine and crash-injection tests**

Cover exact ordered success calls:

```text
host artifact verify
ledger/journal read
two stable snapshots
prepared durable
claim exclusive + file/dir fsync
claimed durable
backup exclusive + metadata/hash + file/dir fsync
backup_ready durable
map/backup digest recheck + temp-residue rejection
apply_intent durable
frozen helper apply once
target fstat/hash/metadata + post aggregate
target fsync + parent fsync
applied durable
observing durable
natural observation
applied_validated durable
```

Inject crashes/failures after helper rename before target fsync, after target
fsync before parent fsync, and after parent fsync before `applied` journal.
Each original call remains durable `apply_intent` and apply count stays one.
Inject helper timeout with a synthetic residue and require no deletion or retry.

Test that apply preconditions reject: root-parent policy drift; missing exact
bootstrap writer-freeze evidence; `${basename}.<digits>.tmp` residue; target
symlink; `nlink != 1`; owner/mode drift; map digest different from durable
backup original; unsupported file or directory fsync. Every rejection before
helper spawn has apply count zero.

- [ ] **Step 2: Run focused tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL on missing v3 claim/backup/apply behavior and crash assertions.

- [ ] **Step 3: Implement the minimum journal-driven state machine**

Reuse the frozen helper only from the host-verified artifact. Do not patch or
substitute it. Treat its rename as a write boundary, not success. The runner's
compensating envelope enforces the exact pre/post checks and fsync order above.
The future bootstrap inventory and Production Gate freeze every known legal
writer; the runner verifies the root-only parent, exact target metadata/digest,
and bound writer-freeze identity immediately before spawn. An unknown root
writer remains the design's explicit residual risk, not a claimed proof.

- [ ] **Step 4: Run GREEN and complete failure matrix**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
node --test server/tests/japan-tuic-additive-repair-frame.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: all PASS; success apply count exactly one; every injected crash leaves
the expected durable phase and never invokes apply twice.

- [ ] **Step 5: Fresh security review and commit**

Review journal transitions, crash windows, path trust, helper argv, and output
redaction. Then:

```powershell
git add scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): enforce durable Japan repair execution"
```

---

### Task 7: Rollback And Claimed-State Replay

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Consumes: Task 6 execute envelope and Task 2 journal.
- Produces: `reconcileExecuteReplay({ snapshot, operations })`, durable restore, `rolled_back_validated`, `replay_reconciled`, and `indeterminate` execute receipts.

- [ ] **Step 1: Write failing rollback/replay tests**

Only failures at `apply_intent`, `applied`, or `observing` may enter durable
`rollback_intent`; require deterministic backup restore, target and parent
fsync, exact before identity/metadata, then `rolled_back_validated`. Failures at
`claimed` or `backup_ready` have not crossed the write boundary and become
durable `indeterminate` without restore. A failed restore/readback also becomes
durable `indeterminate`. For a claim ledger with journal phase
`prepared`, `claimed`, `backup_ready`, `apply_intent`, `applied`, `observing`, or
terminal, call execute again and assert backup/apply/rollback/authorization
mutation counts are zero. Validate current aggregate state according to the
journal and return `replay_reconciled`; only a matching applied/rolled-back
terminal pair sets `closeoutEligible: true`.

- [ ] **Step 2: Run focused tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL on rollback durability and state-aware replay assertions.

- [ ] **Step 3: Implement restore and ledger-first replay**

Derive the backup path internally from claim digest; never use an in-memory
`Map` or client path. Restore through same-directory exclusive temp, verify the
backup record/hash/owner/mode, fsync file, atomic rename, fsync parent, then run
the frozen dry-run and exact before-state checks. Execute reads ledger/journal
before old pre-state and never resumes an already-claimed operation.

- [ ] **Step 4: Run GREEN, review, and commit**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
git add scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): add Japan repair rollback reconciliation"
```

Expected: suites PASS; every claimed replay has zero write-operation calls.

---

### Task 8: Terminal Closeout And Framed CLI Migration

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-7.
- Produces: `closeoutJapanTuicAdditiveRepair({ binding, control, operations })`, strict framed `runJapanTuicAdditiveRepairCli()`, and CLI exit classes `0`, `1`, `2`; entrypoint lock exit `75` remains outside Node.

- [ ] **Step 1: Write failing closeout and CLI tests**

Closeout requires a matching claim plus journal/terminal result exactly
`applied_validated` or `rolled_back_validated`. It removes only the exact marked
`authorized_keys` line through exclusive temp, metadata preservation, file
fsync, atomic rename, parent fsync, and absence readback. Nonterminal,
indeterminate, missing claim, marker count other than one, or cleanup failure is
not success. The host tests cover blocked mutation, valid removal receipt, and
write/readback failure. Transport-level receipt loss is classified by the
contract/workflow in Task 9 because the host cannot observe loss after stdout.

CLI tests feed strict inspect/execute/closeout frames, require one canonical
receipt line, bounded stderr, and rejection of raw ZIP/v1 input, arguments other
than exact `--binding`, `SSH_ORIGINAL_COMMAND`, `NODE_OPTIONS`, and `NODE_PATH`.

- [ ] **Step 2: Run focused tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL on closeout and framed CLI assertions.

- [ ] **Step 3: Implement terminal closeout and atomically switch the CLI**

`inspect` and `execute` never revoke authorization. Closeout validates the
exact terminal predicate before mutation and returns the design's exact closed
receipt. After all three operations pass exported-function tests, replace the
raw ZIP/v1 CLI with strict frame dispatch and delete the v1 execution path and
old receipt expectations in the same commit. The runner imports
`JAPAN_TUIC_REPAIR_GATE_V3`, never the temporary v1 constant.

- [ ] **Step 4: Run GREEN, fresh security review, and commit**

```powershell
node --test server/tests/japan-tuic-additive-repair-frame.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git add scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): separate Japan repair terminal closeout"
```

Expected: all PASS; no active raw ZIP or v1 CLI path remains.

---

### Task 9: GitHub Manual Mode 1 Workflow

**Files:**
- Modify: `.github/workflows/japan-runtime-config-additive-repair.yml`
- Modify: `server/tests/japan-tuic-additive-repair-workflow.test.mjs`
- Modify: `scripts/japan-tuic-additive-repair-contract.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-contract.test.mjs`

**Interfaces:**
- Consumes: contract `artifact`, `frame`, and `receipt` CLIs.
- Produces: one `workflow_dispatch` choice input `operation`, `preflight` job, and Environment-bound `operate` job.

- [ ] **Step 1: Replace v1 workflow assertions with failing Mode 1 assertions**

Require the YAML to expose only:

```yaml
on:
  workflow_dispatch:
    inputs:
      operation:
        type: choice
        required: true
        options:
          - inspect
          - execute
```

Static tests require: `master` only; pinned full-SHA actions; minimal read
permissions; non-cancelling concurrency; no schedule/push/pull_request; no
`self-hosted` runner and exact `runs-on: ubuntu-latest` for both jobs; no
`JAPAN_CI_APPROVAL_BUNDLE`; exactly five secret references; all five references
inside one shell step; no `${{ inputs.operation }}` inside `run:`; artifact/tree
verification in both jobs before any secret reference; execute rejects
`github.run_attempt != 1`; inspect allows later attempts; strict SSH options
include `IdentityAgent=none`, `ProxyCommand=none`, `ProxyJump=none`, and
`ControlMaster=no`; closeout frame only follows validated terminal execute;
runner cleanup uses a trap and readback. Require explicit SSH status `75`
mapping: inspect -> `inspection_blocked`, execute -> non-closeout-eligible
`indeterminate`, closeout -> `closeout_blocked` with authorization retained.
No lock-conflict result triggers closeout or automatic retry.

Contract/workflow tests simulate a closeout call whose command may have run but
whose receipt is missing or invalid; every non-`75` closeout transport failure
becomes `cleanup_indeterminate` with host cleanup `unknown` and is never blindly
retried. Exit `75` proves the entrypoint body did not run and remains
`closeout_blocked` with authorization `retained`.

Contract tests now delete all v1 approval-bundle/TTL/run identity cases and
require `validateExecutionApproval`, `APPROVAL_MAX_TTL_MS`, the `approval` CLI,
and `JAPAN_CI_APPROVAL_BUNDLE` reads to be absent from final source.

- [ ] **Step 2: Run workflow tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: FAIL because v1 has no input, six-secret approval, one Git-tree check,
and secrets across steps.

- [ ] **Step 3: Implement secretless preflight and protected revalidation**

Both jobs independently checkout `github.sha`, checkout frozen source into a
separate directory, download run `29495150692`, and validate manifest/hash/tree.
Pass operation through a step environment variable to the Node validator; never
embed it into shell source. The protected job builds the frame before the
secret-bearing step.

Remove the temporary v1 compatibility exports/CLI from Task 3 in the same RED
to GREEN cycle. Export the v3 object as final `JAPAN_TUIC_REPAIR_GATE` (keeping
`JAPAN_TUIC_REPAIR_GATE_V3` only as a value-identical alias if the runner still
imports that name) and assert both names, if present, are strict-equal. At this
point no runner or workflow caller remains on v1.

- [ ] **Step 4: Implement one secret-bearing SSH/closeout/cleanup step**

Within one `set -euo pipefail` shell step: set `umask 077`; install a trap before
materialization; validate fixed-character host/user/port; write key and
known-hosts mode `0600`; call SSH with `-F /dev/null`, batch/no-password/no-TTY,
all forwarding/proxy/agent/control disabled, strict pinned known-hosts, one
connection attempt, and bounded timeouts; capture but never print stderr;
validate the receipt; if and only if execute is terminal, build and send the
internal closeout frame; remove key, known-hosts, frame, receipts, stderr, and
artifact scratch; verify absence. The sanitized summary reports
`github_cleanup_pending` only.

Host must match `^[A-Za-z0-9][A-Za-z0-9.:-]{0,254}$`; user must match
`^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$`; port must match
`^[1-9][0-9]{0,4}$` and parse within `1..65535`. These rules reject leading
`-`, whitespace, shell metacharacters, and noncanonical ports before SSH. Pass
the SSH exit status to the contract receipt CLI; status `75` synthesizes the
exact design receipt without trusting host stdout. Closeout runs only when the
validated execute receipt has `closeoutEligible === true`.

- [ ] **Step 5: Run GREEN and commit**

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
git add .github/workflows/japan-runtime-config-additive-repair.yml scripts/japan-tuic-additive-repair-contract.mjs server/tests/japan-tuic-additive-repair-workflow.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs
git commit -m "feat(ci): switch Japan repair workflow to mode one"
```

Expected: PASS; no workflow dispatch or secret access occurs.

---

### Task 10: Dormant Public Identity And Runbook Reconciliation

**Files:**
- Add: `config/japan-production-approval-ed25519-public.pem`
- Add: `config/japan-production-approval-ed25519-key-id.txt`
- Modify: `server/tests/japan-tuic-additive-repair-workflow.test.mjs`
- Modify: `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/plans/2026-07-16-github-japan-additive-repair-offline-approval.md`
- Modify: `docs/superpowers/specs/2026-07-17-github-japan-additive-repair-native-direct-design.md`

**Interfaces:**
- Produces: public identity hygiene evidence and active Mode 1 operational documentation.

- [ ] **Step 1: Write failing static/hygiene tests**

Parse the public PEM with Node crypto, require Ed25519 SPKI, derive lowercase
SHA-256 of SPKI DER, and compare to the 64-hex key-ID file. Scan active workflow,
contract, frame, state, entrypoint, and runner text and require neither public
identity path, key ID, `JAPAN_CI_APPROVAL_BUNDLE`, nor offline signer reference.
Require runbook text for Mode 1 trust root, five secrets, fixed nonce digest,
repeatable inspect, master freeze/rebind, claimed replay, prepared/unclaimed new
Gate, crash recovery, terminal closeout, `cleanup_indeterminate`, and separate
GitHub secret cleanup Gate.

- [ ] **Step 2: Run test and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: FAIL on the v1 runbook and missing active Mode 1 index references.

- [ ] **Step 3: Reconcile documentation and retain public files as dormant**

Mark the 2026-07-16 offline plan superseded by the 2026-07-17 Mode 1 plan.
Replace the runbook's required-reviewer/sixth-secret/offline-bundle path with the
selected single-operator model and exact post-merge Gate sequence. State that
bootstrap makes execute technically reachable and the Production Gate is
procedural, not host arming. State that source/merge/artifact do not deploy.
Add the active spec/plan to `docs/README.md`.

The two config files are public only. Do not read, locate, or copy the offline
private key. Do not reference the public files from active execution code.

- [ ] **Step 4: Run GREEN, diff check, and commit**

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
git diff --check
git add config/japan-production-approval-ed25519-public.pem config/japan-production-approval-ed25519-key-id.txt server/tests/japan-tuic-additive-repair-workflow.test.mjs docs/GITHUB_DEPLOYMENT_RUNBOOK.md docs/README.md docs/superpowers/plans/2026-07-16-github-japan-additive-repair-offline-approval.md docs/superpowers/specs/2026-07-17-github-japan-additive-repair-native-direct-design.md
git commit -m "docs(ci): document native Japan repair lifecycle"
```

Expected: test and diff check PASS; any staged identity material is public-only.

---

### Task 11: Full Verification, Independent Review, And Draft PR

**Files:**
- Verify all files changed by Tasks 1-10.
- Modify only files required by review findings.

**Interfaces:**
- Produces: exact source-head evidence for a Draft PR; no deployment authority.

- [ ] **Step 1: Run the focused Japan suite**

```powershell
node --test server/tests/japan-tuic-additive-repair-frame.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: all tests PASS, zero failures/skips unless an existing test has an
explicit platform skip unrelated to production behavior.

- [ ] **Step 2: Run full repository validation and diff checks**

```powershell
npm test
git diff --check origin/master...HEAD
git status --short --branch
```

Expected: full suite PASS; diff check empty; only intentional files present.

- [ ] **Step 3: Run independent spec, security, and code-quality reviews**

Use fresh reviewers for:

- design/plan compliance and exact file surface;
- attack-path review of workflow input, Environment secrets, forced command,
  binding, frame, ledger/journal, helper envelope, rollback, and closeout;
- code quality, test realism, and receipt redaction.

Fix every Critical/Important finding through a new RED/GREEN cycle. Re-run the
focused and full commands after the final fix.

- [ ] **Step 4: Commit final review fixes**

```powershell
git add --update
git diff --cached --check
git commit -m "test(ci): close Japan repair mode one review"
```

Skip this commit only if review creates no changes. Before staging, verify no
private key, credential, temporary receipt, or unrelated user file is present.

- [ ] **Step 5: Push and open one Draft PR**

```powershell
git push --set-upstream origin codex/docs-japan-offline-approval-design
gh pr create --draft --base master --head codex/docs-japan-offline-approval-design --title "Harden Japan additive repair CI/CD" --body-file .superpowers/sdd/japan-native-direct-pr-body.md
```

Create `.superpowers/sdd/japan-native-direct-pr-body.md` with `apply_patch`
before the command and delete it with `apply_patch` after PR creation. The
reviewed PR body must declare `Risk: A (source-only)`, one PR, release unit
`japan-runtime-config`, `identity_impact: true`, frozen artifact/counts, actual
test evidence, dormant offline identity, production impact none, and the three
unapproved post-merge Gates. Create the PR body as a reviewed repository-local
or runner-temp file without secrets; remove it after use if untracked.

- [ ] **Step 6: Wait for exact-head GitHub quality and security results**

Require the stable repository CI context, CodeQL/code scanning, dependency
alerts/checks, secret scanning, and Codex Security review available to the
repository for the exact PR head. Do not mark Ready or merge while any required
or security result is pending, failed, or has an unresolved Critical/Important
finding.

- [ ] **Step 7: Ready, merge, and source closeout only after PASS**

Reconfirm exact reviewed head and clean mergeability, mark Ready, merge through
the protected branch, and clean the local branch/worktree. Record source merge
only. Do not dispatch the workflow or claim production readiness. The next
action is the separately written and approved exact CI Identity Bootstrap Gate.
