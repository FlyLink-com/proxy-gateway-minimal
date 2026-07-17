# GitHub Japan Additive Repair Native Direct Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blocked six-secret approval-bundle workflow with a source-only, TDD-verified Mode 1 lane that lets the single GitHub operator repeat read-only inspection and execute exactly one fixed `additive_missing_only` Japan runtime-config repair through a crash-aware forced-command runner.

**Architecture:** GitHub Actions is the execution and procedural approval plane; a root-owned forced-command entrypoint, builtin-only Node preload TCB, and runner are the technical enforcement plane. The fixed eight-line entrypoint starts Node with literal `--import=/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs` and then the literal runner main module. The preload same-FD verifies every not-yet-evaluated application module before root evaluation. A closed stdin frame carries only the selected operation, exact workflow commit, fixed public nonce/Gate identity, and frozen artifact; the host validates the artifact independently, serializes every operation with OS `flock`, and uses a durable nonce ledger, monotonic journal, deterministic backup, fsync envelope, aggregate validation, rollback, and separate terminal closeout.

**Tech Stack:** Node.js 22 ESM, built-in `node:test`, `node:crypto`, `node:fs`, `node:stream`, POSIX shell, util-linux `flock`, GitHub Actions YAML, OpenSSH forced command, existing artifact Git-tree verifier, frozen Japan repair helper and natural-observation helper.

## Global Constraints

- **Risk: A (source-only implementation, production impact none).**
- **Process:** approved Mode 1 design -> this TDD plan -> one source-only PR -> exact-head CI/security scans -> merge -> exact CI Identity Bootstrap Gate -> repeatable inspect -> separate exact Quantitative Production Execution Gate -> terminal closeout -> separate GitHub secret cleanup Gate.
- **Expected PR count:** one source-only implementation PR. Do not split spec, plan, code, tests, or runbook into separate PRs.
- **Validation:** focused RED/GREEN per task, full `npm test`, `git diff --check origin/master...HEAD`, exact-head GitHub CI, CodeQL/code scanning, available dependency/secret scanning, and independent security review.
- **Production/AWS impact:** none during this plan. This is source-only: do not
  install anything, make a network request, access or mutate GitHub settings or
  secrets, dispatch the workflow, connect with SSH, inspect or write production,
  access a provider, deploy an application, restart a service, change
  schema/database state, or perform AWS actions.
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
- The Task 4 schema-3 binding policy in the active design supersedes all older
  root-only-final-owner, `trusted_root_concurrency_not_machine_proven`,
  incomplete code-closure, and marker-only authorization text. The exact
  residual is `bound_writer_concurrency_not_machine_proven`.
- The CI Identity Bootstrap Gate is authorization-last and rollback-first:
  stage rollback, bind and
  read back the complete installed code/tool/path/account/sshd/sudo closure,
  add the exact canonical authorization line as the final mutation, remove it
  as the first rollback mutation, then remove and directory-fsync the exact
  dedicated sudoers file. The Gate and workflow dispatch remain
  prohibited until Task 8 atomically removes the v1 path and enables strict
  framed schema-3 CLI dispatch.
- Tasks 5-8 reopen and same-FD-fstat every protected file immediately before
  every read, helper spawn, backup, apply, restore, observation, or
  authorization replacement. Owner-writable inputs receive immediate pre/post
  digests. Helper pathname reopen retains the explicit bound-writer residual
  and is never claimed race-free.

## File Map

| File | Responsibility |
| --- | --- |
| `scripts/japan-tuic-additive-repair-frame.mjs` | Canonical closed control JSON plus bounded framed stdin encoder/reader with strict EOF. |
| `server/tests/japan-tuic-additive-repair-frame.test.mjs` | Canonical order, duplicate/extra keys, invalid UTF-8, truncation, size, operation, and trailing-byte tests. |
| `scripts/japan-tuic-additive-repair-state.mjs` | Fixed nonce/claim derivation, journal schema/transitions, durable exclusive writes, atomic replacement, file/dir fsync, and state readback. |
| `server/tests/japan-tuic-additive-repair-state.test.mjs` | Concurrent claim, CAS/transition, crash-window, raw-nonce absence, and injected fsync/rename failures. |
| `scripts/japan-tuic-additive-repair-contract.mjs` | v3 frozen identities, Mode 1 control validation, aggregate validators, strict receipt schemas, and workflow CLI. |
| `server/tests/japan-tuic-additive-repair-contract.test.mjs` | v3 control/receipt/timestamp/error tests; removes the v1 approval-bundle model. |
| `scripts/japan-tuic-additive-repair-bootstrap.mjs` | Builtin-only fixed Node preload TCB that independently validates the canonical binding code envelope and same-FD verifies runner/contract/frame/state before root evaluation. |
| `server/tests/japan-tuic-additive-repair-bootstrap.test.mjs` | Pre-import ordering, six-role manifest, builtin-only graph, same-FD drift/EOF, TCB self-check labeling, and tampered-module sentinel tests. |
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
- Produces temporarily: `JAPAN_TUIC_REPAIR_GATE_V3` schema `3`, `buildOperationControl({ operation, workflowCommit, runAttempt })`, `validateOperationControl(control)`, `validateInspectReceipt(input)`, `validateExecuteReceipt(input)`, `validateCloseoutReceipt(input)`, and CLI commands `artifact`, `frame`, and `receipt`. The existing `JAPAN_TUIC_REPAIR_GATE` v1 export remains only for the separately named private legacy local-test helper through Task 8; it is never reachable from exported schema-3 validation or direct CLI dispatch.

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
call it. Task 8 deletes the runner's private v1 validator/helper and execution
path; Task 9 removes any then-uncalled contract/workflow compatibility export.
Use the exact timestamp regex:

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

### Task 4: Pre-Import Bootstrap, Environment-Scrubbed Entrypoint, And Binding

**Files:**
- Create: `scripts/japan-tuic-additive-repair-bootstrap.mjs`
- Create: `server/tests/japan-tuic-additive-repair-bootstrap.test.mjs`
- Create: `scripts/japan-tuic-additive-repair-entrypoint.sh`
- Create: `server/tests/japan-tuic-additive-repair-entrypoint.test.mjs`
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Produces: a fixed builtin-only Node preload at
  `/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs` that
  independently validates the binding code envelope and same-FD verifies
  runner/contract/frame/state before Node evaluates the main graph.
- Produces: the uninstalled source template for
  `/usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint`;
  `buildCanonicalRunnerBinding(input)`; `buildCanonicalSshTopology(input)`;
  `buildCanonicalSshIncludeClosure(input)`;
  `buildCanonicalSshMatchCoverage(input)`;
  `buildCanonicalSudoSourceClosure(input)`;
  `buildCanonicalSudoEffectivePolicy(input)`;
  `parseCanonicalAuthorizedKeyLine(input)`;
  `loadRootOwnedBinding({ path, effectiveUid, pathOperations })`;
  `validateRunnerBinding(input, context)` schema `3`; and
  `validateTrustedPathChain(path, policy, operations, consumeOpened?)`;
  `validateNativeLinuxOpenFlags({ platform, constants })`;
  `attestOpenedSecurityCapability(input)`; and
  `attestBootstrapRunnerBinding(input, context)`.
- The authorization builders are operations-driven:
  `buildCanonicalSshIncludeClosure({ pathOperations, sourceOperations })`,
  `buildCanonicalSudoSourceClosure({ pathOperations, sourceOperations })`, and
  their topology/effective-policy consumers accept bound account evidence plus
  those operations, never caller-built file/Match/rule/effective records.
  `pathOperations` remains exactly `lstat, open, fstat, read, close`;
  `sourceOperations` is exactly `readDirectory, validateSudoers`. Capability
  attestation receives only same-FD
  `fgetxattr(fd, "security.capability", 65536)` and maps only `ENODATA` or
  `ENOATTR` to absence; writer attestation receives a
  collector and derives its required owner/unit/process coverage from binding
  policy rather than a caller's zero-count claim.
- The fixed installed closure is bootstrap
  `/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs`, entrypoint
  `/usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint`, runner
  `/usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs`, contract
  `/usr/local/libexec/gccgw/japan-tuic-additive-repair-contract.mjs`, frame
  `/usr/local/libexec/gccgw/japan-tuic-additive-repair-frame.mjs`, state module
  `/usr/local/libexec/gccgw/japan-tuic-additive-repair-state.mjs`, binding
  `/etc/gccgw/japan-tuic-additive-repair-binding.json`, state root
  `/var/lib/gccgw/japan-tuic-additive-repair`, subdirectories `backups` and
  `tmp`, lock `repair.lock`, authorization file
  `/etc/ssh/authorized_keys/gccgw-japan-repair-ci`, account home
  `/var/lib/gccgw-japan-repair-ci`, login shell `/usr/bin/dash`, and dedicated
  sudoers file `/etc/sudoers.d/gccgw-japan-repair-ci`.
- Entrypoint metadata is root:root/file/`0755`/`nlink=1`; bootstrap and the four
  application modules are root:root/file/`0644`/`1`; binding and lock are
  root:root/file/`0600`/`1`;
  state/backup/temporary are root:root/directory/`0700`/null; authorization is
  root:root/file/`0600`/`1`; home is root:root/directory/`0755`/null; login
  shell is root:root/file/`0755`/`1` plus exact digest; sudoers is
  root:root/file/`0440`/`1` plus exact content digest. Lock absence fails;
  neither Task 4 nor `flock` creates it.
- The binding's exact top-level order is `schemaVersion, gateId, expectedEuid,
  expectedWorkflowCommit, expectedNonceSha256, expectedClaimSha256,
  codeManifest, toolManifest, sshAuthorization, sudoAuthorization, paths,
  pathPolicies, units, writerFreeze, authorizationMarker`. One builder recursively emits every
  nested object and UTF-8 bytes exactly
  `JSON.stringify(canonicalBinding) + "\n"`.
- Require `schemaVersion="3"`, exact V3 Gate/nonce digest constants,
  `expectedEuid=0`, primitive lowercase 40-hex workflow commit, and recompute
  `expectedClaimSha256` from that commit plus the fixed Gate, nonce, artifact,
  release unit, strategy, surface, and target. Every path is a distinct
  canonical POSIX absolute primitive. Fixed-role policies cannot be relaxed by
  binding input; `units` is exact `service, timer`, and
  `authorizationMarker` is the unique safe marker.
- `codeManifest` order is
  `bootstrap, contract, entrypoint, frame, runner, state`.
  Every code value order is
  `path, sizeBytes, sha256, type, uid, gid, mode, nlink`; size is a positive
  safe integer, entrypoint is at most 16384 bytes, bootstrap is at most 65536
  bytes, and each other ESM module is at most 1048576 bytes.
  The unchanged `toolManifest` order is
  `dash, env, flock, node, sudo, systemctl, unzip, visudo`, with respective
  fixed paths `/usr/bin/dash`, `/usr/bin/env`, `/usr/bin/flock`,
  `/usr/bin/node`, `/usr/bin/sudo`, `/usr/bin/systemctl`, `/usr/bin/unzip`, and
  `/usr/sbin/visudo`. Every tool value order is
  `path, sizeBytes, sha256, type, uid, gid, mode, nlink, capabilitySha256`;
  size is positive safe integer no greater than 268435456 bytes; content and
  raw `security.capability` digests are exact lowercase SHA-256, using empty
  bytes when capability is absent. All tools are root:root regular and `nlink=1`;
  `sudo` alone is mode `04755`, all others are `0755`, and every capability is
  absent. Symlinks and alternate resolved/package paths are rejected.
- The pre-import TCB is exactly the kernel/filesystem and trusted root boundary,
  the already executing sudo/dash/env/flock/Node chain, the exact entrypoint
  bytes, the exact bootstrap bytes, and Node's reviewed builtin loader/runtime
  base. Installation-time same-FD readback and root-only ancestry authorize
  those already executing bytes. Runtime entrypoint/bootstrap/Node checks are
  defense in depth and must not be reported as self-authorization.
- Bootstrap has only an exact reviewed `node:` builtin static-import allowlist.
  It has no local static import, `import()`, CommonJS `require`, `createRequire`,
  `node:module`, loader registration, `eval`, or `Function`; it does not import
  or call the runner validator. Before main evaluation it independently parses
  the fixed canonical binding and same-FD validates runner, contract, frame,
  and state. The total JavaScript `import()` count across bootstrap plus the
  four-module application closure is
  exactly one, at the runner's verified-artifact callsite.
- `sshAuthorization` order is `algorithm, authorizedKeysFile,
  authorizedKeysLineSha256, effectiveConfigSha256, homeDirectory,
  homeDirectoryPolicy, loginShell, loginShellPolicy, publicKeyBlobSha256, uid,
  username`. Nested home policy order is `type,uid,gid,mode,nlink`; nested shell
  policy order is `type,uid,gid,mode,nlink,sha256`. Projection is explicit:
  `loginShell === toolManifest.dash.path`, and shell
  type/uid/gid/mode/nlink/SHA equal the dash entry. Dash `sizeBytes` and
  `capabilitySha256` are validated only by the full tool entry and are not
  fields of `loginShellPolicy`.
- `sudoAuthorization` order is `schemaVersion, type, username, uid,
  sudoersFile, sudoersFileSha256, command, commandArguments, runAsUid, runAsGid,
  nonInteractive, nopasswd, envReset, setenvAllowed, securePath,
  otherRuleCount, sourceClosureSha256, effectivePolicySha256`.
- `paths` order is `authorizedKeys, backupDirectory, currentMap, lockFile,
  materialStore, mihomoConfig, naturalObservation, producerStatus,
  stateDirectory, sudoersFile, temporaryRoot`; `pathPolicies` repeats that order and each
  value is `type, uid, gid, mode, nlink`. `units` order is `service, timer`.
  `writerFreeze` order is `knownWriterCount, evidenceSha256, residualRisk` with
  exact values `0`, lowercase 64-hex, and
  `bound_writer_concurrency_not_machine_proven`. This supersedes the old
  root-only final-owner wording and old residual literal everywhere in the
  active design/plan.

- [ ] **Step 1: Write the complete failing entrypoint, import-closure, binding, and SSH-policy tests**

Assert the entrypoint bytes are exact, including `#!/usr/bin/dash`, one
`exec /usr/bin/env -i`, fixed `LANG`/`PATH`, absolute bound `flock`/Node/lock/
bootstrap/runner/binding paths, literal fixed `--import=` before the literal
main runner, and no variable command, secondary command path, `eval`, `sh -c`,
relative executable, or use of `$SSH_ORIGINAL_COMMAND`. Require exactly eight
physical lines.

Under the bound Node test runtime, use syntax-aware ESM parsing such as
`vm.SourceTextModule` plus a token-aware dynamic-code walker across bootstrap,
runner, contract, frame, and state. Require bootstrap's exact builtin-only graph
and zero local imports, `import()`, require/createRequire, eval, or loader
registration. Require exactly the runner/contract/frame/state application graph
with its reviewed `node:` allowlist. Reject bare packages,
absolute/file/data URLs, query/hash specifiers, `node:module`, `createRequire`,
CommonJS `require`, and unlisted local modules. Permit exactly one total
JavaScript `import()` callsite: the frozen runner import of
`scripts/traffic-accounting-natural-observation.mjs` after verified artifact
size/hash/central-directory-manifest/safe-extraction validation; reject spaced,
commented, or non-runner dynamic-import and module-loading bypasses. Assert all
six `codeManifest` roles, including bootstrap and entrypoint, and all eight
`toolManifest` roles
are present with exact paths/order/metadata/content/capability digests. Assert
`sudo` is exactly `04755`, every other tool is `0755`, every capability digest
is the SHA-256 of absent/empty raw capability bytes, and any symlink or
alternate resolved/package path is rejected. Require exact manifest
`sizeBytes`, entrypoint 16384/16385, bootstrap 65536/65537, other ESM
1048576/1048577 boundaries, tool
268435456/268435457 boundaries, same-FD fstat-size equality, exact-size read,
confirmed zero-byte EOF, and rejection of early EOF or trailing byte.

Add a subprocess/loader ordering fixture for each of runner, contract, frame,
and state: content/hash or uid/gid/mode/nlink drift plus a top-level sentinel
must produce sentinel count zero and runner call count zero before sanitized
rejection. A positive control proves the sentinel evaluates only after clean
preload success. Entry point/bootstrap/Node/root are explicitly the pre-import
TCB; bootstrap self-read and entrypoint readback are defense in depth.

Freeze CI Identity Bootstrap Gate dry-run fixtures for native same-FD capability
attestation: `ENODATA` and `ENOATTR` absence; unexpected capability bytes;
wrong descriptor; unsupported or other error; oversize xattr; and digest
mismatch. Every non-absence/error/mismatch blocks before authorization, and no
fixture is described as runtime xattr validation.

Add one end-to-end Gate-attestation matrix across every six-code and
eight-tool role. For each role independently cover exact fd propagation through
open/fstat/read/capability/EOF/post-fstat/close, size mismatch, early EOF,
trailing byte, wrong fd, digest drift, metadata drift, ceiling and ceiling+1,
and exactly-once close. Capability fixtures additionally cover `ENODATA`,
`ENOATTR`, unexpected bytes, unsupported/arbitrary errors, non-Buffer results,
a 65536-byte nonempty value rejected as unexpected, a 65537-byte value rejected
as oversize, and wrong digest. Add integration fixtures that mutate one SSH
source/Match, one sudo source/rule/Defaults value, one writable-owner or bound
unit/known-process writer observation, one manifest role, and one capability;
every mutation must reject before any authority callback. Writer evidence is
derived from every owner-write policy, both exact bound units, and every known
process; callers cannot assert `knownWriterCount=0` or an evidence digest.

Test the exact recursive canonical binding order and field names above. Reject
schema 1 through exported `validateRunnerBinding`; require its exact context
keys `effectiveUid, pathOperations` and numeric
`input.expectedEuid === context.effectiveUid === 0`. The separately named
private legacy validator is reachable only from the isolated local v1 helper
through Task 8 and is never dispatched by the exported validator.

Use injected operations with exact contract `lstat, open, fstat, read, close`
and bigint stats. Assert that the fd returned from `open` is the only fd passed
to `fstat`, `read`, and `close`; no path-based read occurs. Cover bigint
dev/ino mismatch; exact `O_RDONLY|O_NOFOLLOW|O_CLOEXEC` plus directory-only
`O_DIRECTORY`; positive short reads; EINTR-only retry; confirmed zero-byte EOF;
binding sizes 65536 accepted and 65537 rejected; code-file 1 MiB limit; fatal
UTF-8; BOM; CR; duplicate/reordered keys; prefix/suffix/second-line/trailing
bytes; returned counts outside `0..length`; wrong fd; post-consumption
type/uid/gid/mode/nlink drift including directory-sentinel count drift, plus
dev/ino/size drift; and exactly-once close on success, consumer failure, read
failure, and close failure. Every exposed failure is only
`restricted_identity_rejected`.

Freeze `sshAuthorization` for algorithm `ssh-ed25519`, exact positive uid,
username `gccgw-japan-repair-ci`, fixed home/shell, exact passwd identity,
root-controlled home chain, locked password, one effective authorization file,
and exactly one active nonblank/noncomment entry equal to the canonical line.
Add a focused login-shell projection test: path/type/uid/gid/mode/nlink/SHA
must equal `toolManifest.dash`; size and capability remain mandatory on the dash
tool entry but absent from `loginShellPolicy`.
The canonical SSH topology builder has exact keys/order:

```text
schemaVersion, type, username, uid, homeDirectory, loginShell,
passwordLocked, authenticationMethods, pubkeyAuthentication,
passwordAuthentication, keyboardInteractiveAuthentication,
hostbasedAuthentication, gssapiAuthentication, kerberosAuthentication,
permitUserEnvironment, acceptedEnvironmentNames,
forceCommand, chrootDirectory,
disableForwarding, permitTunnel,
authorizedKeysFiles, authorizedKeysCommand, authorizedPrincipalsFiles,
authorizedPrincipalsCommand, trustedUserCAKeys,
activeAuthorizationEntryCount, targetKeyOccurrenceCount,
addressDependentAuthorizationBranchCount, includeClosureSha256,
matchCoverageSha256
```

Require schema `1`, type `japan_ci_ssh_authorization_topology`, bound account
values, password locked, only `authenticationMethods=["publickey"]`, pubkey
true, every other authentication boolean false, user environment false,
accepted environment names empty, `forceCommand="none"`,
`chrootDirectory="none"`, `disableForwarding=true`, `permitTunnel=false`, the
sole bound authorization file, command
fields `"none"`, principals/CA arrays empty, counts `1/1/0`, and lowercase
closure/coverage digests. Reject unresolved Include/Match/conditional/address/
host branches or alternate password, keyboard-interactive, host-based, GSSAPI,
Kerberos, CA/principals, AuthorizedKeysCommand, file-expansion paths, effective
server forced command, chroot, forwarding, or tunnel. Derive global, Include,
account-applicable Match-scoped, and default effective values. Add RED/GREEN
fixtures for default/explicit deny for both controls, global forwarding/tunnel
allow, Match-scoped allow, and unresolved conditional alongside the
ForceCommand/ChrootDirectory cases. Any non-`none` command/chroot or any
effective forwarding/tunnel permission blocks the CI Identity Bootstrap Gate
and Task 8 closeout so
the key command and bound absolute paths remain effective authority. Per-key
`restrict` and no-forwarding options are defense in depth, not a substitute for
these account-effective values.
`effectiveConfigSha256` is over UTF-8
`JSON.stringify(canonicalTopology) + "\n"`.

Freeze SSH digest preimages, not caller-provided digest strings. Include closure
has exact keys `schemaVersion, type, rootConfig, files`; files retain resolved
OpenSSH expansion order and each item has
`ordinal, path, sha256, uid, gid, mode, nlink`. Require canonical absolute,
root-owned regular, `nlink=1`, no group/other write, bytewise lexical glob
expansion, and rejection of missing/duplicate/cyclic/ambiguous/unresolved
includes. Match coverage has exact keys
`schemaVersion, type, username, groupIds, branches`; group IDs are unique
ascending, branches stay in Include/source order with exact keys
`ordinal, sourceOrdinal, lineNumber, conditions, accountDisposition,
variableDimensions`, and disposition is only `disjoint` or `exact_user`.
Any matching branch must be exact-user with no variable dimensions; unresolved
host/address/local-address/local-port/group/user-negation or other context
fails. Both digests are derived from canonical JSON+LF by the builder.
The parser derives `accountDisposition`, source coordinates/order,
variable dimensions, and every global/default/applicable-Match effective value
from the trusted closure. It evaluates positive, negative, and wildcard User
and Group patterns against the exact bound username and ordered group identity;
coordinates must belong to the derived closure and be strictly monotonic.
Caller labels, safe-looking aggregate values, source ordinals, or effective
booleans are never accepted as evidence.

The shared source-closure builder uses `schemaVersion="1"`, exact type
`japan_ci_sshd_source_closure` for SSH and
`japan_ci_sudo_source_closure` for sudo, exact roots
`/etc/ssh/sshd_config` and `/etc/sudoers`, and the same file-item builder and
serializer. Every closure file is at most 1 MiB and is metadata-validated,
read, hashed, and confirmed at EOF from one trusted descriptor; only the
subsystem-native expansion order differs.
Both builders are operations-driven from their fixed roots. SSH derives
directive/pattern/glob/source order; sudo derives `include`/`includedir` order
and reviewed filename filtering. Raw directory basenames receive fatal UTF-8
round-trip validation and bytewise sorting where native rules require it.
Missing, duplicate, cyclic, ambiguous, zero-match, unsupported, or unresolved
expansion fails. Callers cannot supply a closure file list, bytes, metadata,
digest, order, disposition, rule count, tag, Defaults value, or effective-policy
claim. Sudo syntax validation runs only fixed `/usr/sbin/visudo -cf
/etc/sudoers`; semantic authorization is still parser-derived from the same
trusted closure.

The Match record is schema `"1"`, exact type
`japan_ci_sshd_match_coverage`. Each condition has exact keys
`name, patterns`; name is one lowercase literal `user, group, host, address,
localaddress, localport, rdomain, localnetwork, all`, appears once at most, and
remains source-ordered. Each pattern has exact keys `negated, value`; boolean
negation plus a nonempty printable ASCII value without whitespace, comma,
backslash, control byte, or Unicode normalization. Preserve literal `*`/`?`,
reject duplicate name/pattern pairs and require `patterns` as an explicit JSON
array. Freeze `all` with exact object shape `{name:"all", patterns:[]}` and
exact no-space `JSON.stringify` bytes `{"name":"all","patterns":[]}`; require
at least one pattern for every other condition, and require
`variableDimensions` unique in
fixed order `host, address, localaddress, localport, rdomain, localnetwork`.
Unsupported names, ambiguous negation, escapes, or unparsable wildcard
semantics fail closed.

Freeze canonical sudo policy. `sudoAuthorization` is schema `1`, type
`japan_ci_sudo_authorization`, the bound account, fixed
`/etc/sudoers.d/gccgw-japan-repair-ci`, exact file digest, exact entrypoint,
`commandArguments=[]`, run-as `0:0`, noninteractive/NOPASSWD/env_reset true,
SETENV false, secure path `/usr/sbin:/usr/bin:/sbin:/bin`, and
`otherRuleCount=0`. Require the exact sudoers empty-argument marker `""` and
reject wildcard/argument variation, aliases, alternate RunAs, other effective
rule, SETENV, or broad sudo. Sudo source closure uses the same ordered file-item
schema with sudo include ordering and include rejection. Effective policy has
exact keys `schemaVersion, type, username, uid, command, commandArguments,
runAsUid, runAsGid, nonInteractive, nopasswd, envReset, setenvAllowed,
securePath, matchedRuleCount, otherRuleCount, sourceClosureSha256`, with matched
count `1`. Both digests are builder-derived canonical JSON+LF. `visudo -cf`
success is required but cannot replace semantic comparison. The effective
record is schema `"1"`, exact type `japan_ci_sudo_effective_policy`, and its
source-closure digest comes only from the shared trusted-read builder.

Freeze the shared Task 8 ASCII key-line parser: at most 16384 bytes plus one
LF; no CR/NUL/additional lines/tokens/unknown or duplicate options/escapes;
exact option sequence, then `ssh-ed25519`, one canonical base64 token, and exact
terminal marker. Decode/re-encode must reproduce base64 exactly. The SSH wire
blob contains length-prefixed `ssh-ed25519`, exactly one 32-byte Ed25519 key,
and EOF. Line and embedded algorithms match before blob/full-line digest
comparison; no shell text is evaluated.

Test fixed path roles and dynamic observed metadata. Ancestors are uid-0
nonsymlink directories without group/other write. A file has `nlink=1`; a
directory policy has JSON `nlink=null` only as a not-bound sentinel: lstat and
fstat observed link counts are positive BigInts and equal within the
validation, never compared to null. File policies reject null and require
exact integer/observed `1`. Test zero/negative directory counts, lstat/fstat
count drift, and file-null rejection. `currentMap` is exact mode `0600` with observed
uid/gid. Material store, Mihomo config, natural observation, and producer
status accept only exact observed mode `0400` or `0600`, plus exact observed
uid/gid: owner-only readable, non-executable, and never group/other accessible.
Any other observed mode blocks without normalization and requires a separate
permission-hardening Gate. Non-root final owner is allowed only when its role
minimum and binding policy pass. Assert writer inventory covers every principal with
write capability and every known service/timer/process writer, known active
count is zero, and the exact new residual is serialized.

Compare code/tool modes as low 12 permission/special bits: every non-sudo role
rejects setuid, setgid, or sticky, while sudo requires setuid and rejects
setgid/sticky drift. Runtime path policies compare low 9 permission bits and
require `mode <= 0777` and `(mode & 0022) === 0`; both initial and
post-consumption stats separately require `(mode & 07000) === 0` before the
low-nine comparison.

Freeze audited Linux flag values independently of the host runtime:
`O_RDONLY=0x00000`, `O_DIRECTORY=0x10000`, `O_NOFOLLOW=0x20000`, and
`O_CLOEXEC=0x80000`. File opens use `0xA0000`; directory opens use `0xB0000`.
Native operation creation fails closed on non-Linux, any absent flag, or any
numeric drift. Windows fixtures inject and assert these audited values rather
than deriving expectations from the same incomplete host `fs.constants`.

Every canonical path and raw includedir basename must survive exact UTF-8
encode/decode round trip. Reject unpaired-surrogate aliases and compare encoded
path-byte identities for uniqueness; preserve valid non-ASCII scalar paths only
when their byte identities remain distinct.

Finally, invoke the current runner directly and require zero stdout, exact
stderr bytes
`{"schemaVersion":"3","type":"japan_tuic_additive_repair_pre_migration","error":"restricted_identity_rejected"}\n`,
exit `1`, and zero binding-load, operations-factory, stdin/artifact-read,
output-before-rejection, or legacy-helper calls. Own-property `NODE_OPTIONS`
or `NODE_PATH` is rejected even when empty; any nonempty
`SSH_ORIGINAL_COMMAND`, including whitespace-only, is rejected before those
calls.

- [ ] **Step 2: Run focused tests and witness RED**

```powershell
node --experimental-vm-modules --test server/tests/japan-tuic-additive-repair-bootstrap.test.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: RED on the missing exact fixed-preload dash entrypoint, missing
builtin-only bootstrap and pre-import sentinel ordering, six-role schema-3
closure, same-FD/bigint reader, eight-tool manifest, canonical SSH Include/Match and sudo
policies, ForceCommand/ChrootDirectory enforcement,
DisableForwarding/PermitTunnel enforcement, exact Match-all bytes,
post-consumption full-policy drift, directory-nlink sentinel, login-shell
projection, audited Linux flag absence/drift, surrogate UTF-8 path aliases,
capability dry-run fixtures, six-code/eight-tool/source/writer integration,
parser, and exact pre-migration behavior.

- [ ] **Step 3: Add the exact no-variable entrypoint and builtin-only preload**

The committed template is the only command target allowed by `authorized_keys`
and sudoers. `authorized_keys` invokes exactly
`/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint`
with no caller-controlled argument. The entrypoint bytes are:

```sh
#!/usr/bin/dash
set -eu
exec /usr/bin/env -i LANG=C.UTF-8 PATH=/usr/bin:/bin \
  /usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 \
  /var/lib/gccgw/japan-tuic-additive-repair/repair.lock \
  /usr/bin/node --disable-proto=throw --import=/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs \
  /usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs \
  --binding /etc/gccgw/japan-tuic-additive-repair-binding.json
```

The bootstrap is a preload, not a replacement main module and not a loader that
dynamic-imports the runner. Its top-level builtin-only code validates exact
root invocation and argv, loads the fixed canonical binding with the same-FD
bounded reader, requires exact six-role order, and verifies
runner/contract/frame/state path/type/uid/gid/mode/nlink/size/hash and protected
parents before returning. Only then may Node evaluate the literal runner main
module. Bootstrap/entrypoint self-checks are defense in depth; install-time
readback is authority for those already evaluated TCB bytes.

The CI Identity Bootstrap Gate derives code/tool digests from the exact merged commit,
binds installed bytes and exact executable metadata, and configures the fixed
sudoers file for exactly this no-argument entrypoint with empty-argument marker
`""`, `env_reset`, no `SETENV`, and exact `secure_path`. Only the Gate uses a
native same-FD `fgetxattr` attestation for raw `security.capability`: absent
`ENODATA`/`ENOATTR` maps to SHA-256 of empty bytes and every other error fails.
Runtime does not claim xattr revalidation. The root-owned
OS/runtime/library/capability base beneath the eight bound tools remains an
explicit platform trust boundary. No installation occurs in this task.

- [ ] **Step 4: Implement preload verification, recursive canonical binding, and derived authorization evidence**

Implement the exact interfaces and nested orders above. `validateTrustedPathChain`
is synchronous: canonical POSIX absolute lexical path; bigint lstat of `/` and
each component exactly once; exact final lstat type/uid/gid/mode; file
nlink policy and observed count exact `1`; directory policy sentinel null with
positive-BigInt lstat count; required open flags; same-fd bigint fstat/dev+ino;
file count still `1`, directory fstat count positive and equal to lstat;
optional synchronous consumer that cannot close; post-consumption fstat that
repeats the complete final type/uid/gid/mode/nlink policy including directory-
null sentinel semantics and requires unchanged dev/ino/size; and exactly-once
close in `finally`, with close failure still fail-closed.

`loadRootOwnedBinding` accepts only the fixed binding path and fixed metadata;
reads the verified fd from position zero in a bounded short-read/EINTR loop;
requires fstat size `1..65536`, accumulated length equal to fstat size, and
actual EOF; then fatal-decodes and compares exact canonical JSON+one-LF bytes.
It never uses path `stat`/`readFile`. Runtime `validateRunnerBinding` checks all
six code roles, all eight tools' path/content/type/uid/gid/mode/nlink,
login-shell equality, and every protected path before an operation. Code, tool,
SSH closure, and sudo closure bytes use the same fd loop. Entrypoint, ESM,
tool, and source-closure reads use their exact 16 KiB, bootstrap 64 KiB,
other-ESM 1 MiB, 256 MiB, and 1 MiB ceilings. Same-FD fstat size equals
manifest `sizeBytes`; read exactly that size, confirm zero-byte EOF, then hash.
Early EOF, mismatch, ceiling+1, and trailing byte fail. The CI Identity
Bootstrap Gate additionally attests tool
capability digests before authorization; runtime deliberately makes no xattr
claim.

Implement the bootstrap without importing any application helper. It owns a
minimal independent canonical binding/code-envelope validator and same-FD
reader for runner/contract/frame/state, and returns only after those four match.
It never performs SSH/sudo/capability/writer/frame/host operations. Test that
any application module's top-level sentinel remains zero on every metadata or
byte rejection.

Implement SSH and sudo closure builders as operations-driven native parsers
over the fixed roots and one shared same-FD 1 MiB reader. Derive Match
disposition/order/effective SSH fields, sudo rule/tags/Defaults/counts, and
writer evidence inside the attestation path; delete every caller-asserted
semantic input. Implement runtime low-nine mode rules and audited Linux flags
exactly as frozen above, plus strict UTF-8 path-byte identity.

The root-owned binding is authoritative for observed final uid/gid/mode and is
not client input. Keep all path/stat/open/read/consume/close errors sanitized.
Initial validation is not a use-time guarantee; expose the same trusted-open
primitive for Tasks 5-8.

- [ ] **Step 5: Implement exact pre-migration isolation and run GREEN**

Keep schema 1 in only the separately named private local-test helper. Until
Task 8, production CLI dispatch is mechanically disabled with the exact
stderr/exit/call-count behavior above. The entrypoint source remains
uninstalled; workflow dispatch and the CI Identity Bootstrap Gate are prohibited.

```powershell
node --experimental-vm-modules --test server/tests/japan-tuic-additive-repair-bootstrap.test.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git add scripts/japan-tuic-additive-repair-bootstrap.mjs scripts/japan-tuic-additive-repair-entrypoint.sh scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-bootstrap.test.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): harden Japan repair forced entrypoint"
```

Expected: every exact RED class above is GREEN; the preload still performs no
host authorization or production operation, and no install, network, SSH,
GitHub, CI Identity Bootstrap Gate, workflow dispatch, or production action
occurs.

---

### Task 5: Host Artifact Verification And Read-Only Inspection

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Consumes: `readRepairFrame()`, Mode 1 contract, durable state snapshot, and
  Task 4 trusted same-FD open/read primitives plus exact binding policy.
- Produces: `inspectJapanTuicAdditiveRepair({ binding, frame, operations })`, `reconcileClaimedState({ snapshot, operations })`, and host operations for verified scratch receive/extract/cleanup. Only the separately named private v1 helper remains callable by injected local tests; direct runner invocation continues the exact Task 4 pre-migration failure until Task 8 replaces it.

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

For every protected artifact, binding path, state record, target, material,
Mihomo config, natural observation, and producer-status read, assert immediate
reopen with the exact Task 4 policy, same-fd fstat/read/EOF, and no path-based
read. For owner-writable roles, assert immediate pre/post digest equality.
Inject metadata or digest drift between initial binding validation and each use
and require zero claim, backup, helper, observation, or authorization calls.

- [ ] **Step 2: Run focused runner tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL because the new host inspection interfaces are absent; direct
runner invocation still passes the exact Task 4 pre-migration fail-closed test.

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

Initial binding validation is not reused as proof. Reopen and same-FD validate
each protected input immediately at its actual read/observation boundary. A
helper that reopens an artifact-extraction pathname remains under the exact
separate artifact authority and bound-writer residual; do not claim race
freedom.

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
CI Identity Bootstrap Gate writer-freeze evidence; `${basename}.<digits>.tmp`
residue; target
symlink; `nlink != 1`; owner/mode drift; map digest different from durable
backup original; unsupported file or directory fsync. Every rejection before
helper spawn has apply count zero.

At each state read, stable snapshot, backup source read, backup creation,
helper spawn, target apply readback, timer/producer/natural-observation read,
reopen and same-FD validate against the exact binding role. Assert immediate
pre/post digests for owner-writable inputs, and inject drift at each boundary.
Drift before claim produces no durable write; drift after claim follows the
exact journal/rollback/indeterminate matrix and never silently retries.

- [ ] **Step 2: Run focused tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL on missing v3 claim/backup/apply behavior and crash assertions.

- [ ] **Step 3: Implement the minimum journal-driven state machine**

Reuse the frozen helper only from the host-verified artifact. Do not patch or
substitute it. Treat its rename as a write boundary, not success. The runner's
compensating envelope enforces the exact pre/post checks and fsync order above.
The future CI Identity Bootstrap Gate inventory and Production Gate freeze every known legal
writer; the runner verifies the root-owned parent, binding-authoritative exact
target metadata/digest, and bound writer-freeze identity immediately before
spawn. A non-root final target owner is allowed only when the exact observed
policy and role minimum pass. Unobserved root or bound-owner same-inode mutation
remains the exact `bound_writer_concurrency_not_machine_proven` residual, not a
claimed proof.

- [ ] **Step 4: Run GREEN and complete failure matrix**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
node --experimental-vm-modules --test server/tests/japan-tuic-additive-repair-frame.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-bootstrap.test.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
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

Before every backup-record read, backup-byte read, restore temporary creation,
restore source read, target replacement/readback, and post-restore aggregate
read, reopen and same-FD validate the corresponding exact role. Owner-writable
backup/target inputs receive immediate pre/post digests. Inject metadata,
inode, size, or digest drift at each boundary and require fail-closed journal
results with no second apply, restore, or authorization mutation.

- [ ] **Step 2: Run focused tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL on rollback durability and state-aware replay assertions.

- [ ] **Step 3: Implement restore and ledger-first replay**

Derive the backup path internally from claim digest; never use an in-memory
`Map` or client path. Restore through same-directory exclusive temp, verify the
backup record/hash/owner/mode, fsync file, atomic rename, fsync parent, then run
the frozen dry-run and exact before-state checks. Each protected byte read uses
the Task 4 verified descriptor immediately at use; owner-writable bytes receive
pre/post digest checks. Execute reads ledger/journal before old pre-state and
never resumes an already-claimed operation.

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
- Produces: `closeoutJapanTuicAdditiveRepair({ binding, control, operations })`,
  strict framed `runJapanTuicAdditiveRepairCli()`, the final shared canonical
  SSH topology/Include/Match builders, sudo source/effective-policy builders,
  and bounded public-key-line parser frozen in Task 4,
  and CLI exit classes `0`, `1`, `2`; entrypoint lock exit `75` remains outside
  Node.

**Blocking entry condition:** Task 8 must not begin and framed dispatch must not
be enabled until Task 4's pre-import sentinel, syntax-aware import/source
enumeration, six-code/eight-tool manifest, operations-driven SSH/sudo closure,
derived Match/effective-policy, runtime mode/Linux-flag, capability, writer,
same-FD EOF/drift, and surrogate UTF-8 matrices are all GREEN and every Task 4
reviewer Important/Minor finding is closed. A partial pass or caller-asserted
digest/semantic record keeps Task 8 blocked.

- [ ] **Step 1: Write failing closeout and CLI tests**

Closeout requires a matching claim plus journal/terminal result exactly
`applied_validated` or `rolled_back_validated`. Before any mutation, use the
Task 4 same-FD primitive and shared parser/builder to revalidate exact passwd
uid/home/shell and login-shell digest, root-controlled home/source chain,
locked password, the complete account-wide public-key-only sshd topology,
Include/Match closure and coverage digests, one effective authorization file,
exactly one active line matching public-key blob hash, full line hash, and
terminal marker, effective global and Match-scoped ForceCommand and
ChrootDirectory both `none`, account-applicable DisableForwarding `true` and
PermitTunnel `false`, and the canonical sudo source/effective policy
with exactly one no-argument rule and no other rule. Marker count alone and `visudo -cf`
alone are never authority.

Test topology drift, alternate source/credential, extra active entry, duplicate
key/line, line-hash-only or marker-only collision, noncanonical base64,
embedded-algorithm mismatch, shell/home/passwd drift, Include/Match ambiguity,
global or Match-scoped ForceCommand/ChrootDirectory drift, default/global/Match
DisableForwarding or PermitTunnel drift and unresolved conditional branches,
sudo include/rule/default/RunAs/argument/alias drift, alternate sudo source,
and metadata/inode/digest drift before and after replacement-temporary creation.
Before temporary creation, an exact unchanged readback may produce
`closeout_blocked`/`retained`. Once temporary creation succeeds, any parse,
topology, write, fsync, rename, directory-fsync, or readback ambiguity is
`cleanup_indeterminate`/`unknown`, never retained or removed.

The success path uses exclusive SSH temporary creation to build exactly a
zero-byte root:root mode-`0600`, `nlink=1` regular file, validates that
temporary by same FD, fsyncs it, atomically replaces the authorization file,
fsyncs the parent, then same-FD proves size zero and SHA-256 of empty bytes.
Deletion, whitespace, comments, or any other representation fails. It next
unlinks the exact dedicated sudoers file and directory-fsyncs its parent. Final
same-FD topology/source readback must prove the public-key blob absent from the
sole zero-byte SSH source, the sudoers file absent, and the dedicated sudo rule
absent from canonical sudo source/effective policy. Only all proofs emit
`authorization_removed`. Transport-level receipt loss is classified by the
contract/workflow in Task 9 because the host cannot observe loss after stdout.

CLI tests feed strict inspect/execute/closeout frames, require one canonical
receipt line, bounded stderr, and rejection of raw ZIP/v1 input, arguments other
than exact `--binding`, `SSH_ORIGINAL_COMMAND`, `NODE_OPTIONS`, and `NODE_PATH`.
They also prove every Task 5-8 protected read/replacement reaches the same-FD
use-time validator and that direct invocation remains the exact pre-migration
failure until the atomic switch in this task.

- [ ] **Step 2: Run focused tests and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-runner.test.mjs
```

Expected: FAIL on closeout and framed CLI assertions.

- [ ] **Step 3: Implement terminal closeout and atomically switch the CLI**

`inspect` and `execute` never revoke authorization. Closeout validates the
exact terminal, line/blob/marker, same-FD, canonical SSH, and canonical sudo
predicates before mutation and after durable SSH replacement plus sudoers
removal, then returns the
design's exact closed receipt. After all three operations pass
exported-function tests, replace the raw ZIP/v1 CLI with strict frame dispatch
and delete the private legacy validator/helper, v1 execution path, and old
receipt expectations in the same commit. The runner imports
`JAPAN_TUIC_REPAIR_GATE_V3`, never the temporary v1 constant. Only after this
commit's tests pass may the separate CI Identity Bootstrap Gate be written or executed.
The entrypoint continues to preload the fixed builtin-only bootstrap and then
names runner as the literal main module; Task 8 must not replace that ordering
with bootstrap `import()` of runner or add any loader surface.

- [ ] **Step 4: Run GREEN, fresh security review, and commit**

```powershell
node --experimental-vm-modules --test server/tests/japan-tuic-additive-repair-frame.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-bootstrap.test.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git add scripts/japan-tuic-additive-repair-runner.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
git commit -m "feat(ci): separate Japan repair terminal closeout"
```

Expected: all PASS; no active raw ZIP/v1 CLI or marker-only closeout path
remains, and only complete SSH topology plus line/blob absence plus dedicated
sudo-rule absence can report `authorization_removed`.

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
bootstrap, contract, frame, state, entrypoint, and runner text and require neither public
identity path, key ID, `JAPAN_CI_APPROVAL_BUNDLE`, nor offline signer reference.
Require runbook text for Mode 1 trust root, five secrets, fixed nonce digest,
repeatable inspect, master freeze/rebind, claimed replay, prepared/unclaimed new
Gate, crash recovery, terminal closeout, `cleanup_indeterminate`, and separate
GitHub secret cleanup Gate.

Also require runbook/static evidence for the fixed installed paths and metadata,
six-entry code manifest in
`bootstrap, contract, entrypoint, frame, runner, state` order, eight-entry tool
manifest with CI Identity Bootstrap Gate-only native
same-FD capability attestation, exact `sizeBytes` ceilings/EOF and low-12-bit
special-mode rules, exact schema-3 recursive orders, the exact eight-line
`/usr/bin/dash` entrypoint with fixed `--import=` preload followed by literal
runner main, explicit entrypoint/bootstrap/Node/root pre-import TCB, bootstrap
self-checks labelled defense in depth, builtin-only preload with no local or
dynamic loader surface, pre-evaluation same-FD verification of all four
application modules, exactly one total JavaScript `import()` at the runner
verified-artifact callsite, `/usr/bin/dash` shebang
and explicit login-shell/dash projection, exclusive repair account and sole
authorization source, canonical complete SSH topology plus exact
Include/Match preimages/nested grammar with global and Match-scoped
ForceCommand/ChrootDirectory both `none`, account-applicable DisableForwarding
`true` and PermitTunnel `false` with default/global/Match/unresolved-conditional
fixtures, exact Match-all object shape and no-space JSON bytes, canonical sudo
source/effective policy
and fixed sudoers rule, bounded line/blob parser, observed final-owner
`0400`/`0600` role modes, exact
`bound_writer_concurrency_not_machine_proven` residual, same-FD bigint/EOF/
exactly-once-close and shared operations-driven 1 MiB closure-read contract,
derived Match/source-order/effective SSH and sudo evidence with no caller
assertions, runtime six-code/eight-
tool manifest coverage without an xattr revalidation claim, Tasks 5-8 use-time
revalidation, Task 8 zero-byte fsynced SSH-file plus absent parent-fsynced
sudoers closeout, directory-null sentinel with positive/equal BigInt link
counts and file-null rejection, post-consumption full type/uid/gid/mode/nlink
revalidation including directory count drift, runtime mode `<=0777`/no `0022`/
no `07000`, required Linux flag absence/drift, surrogate UTF-8 path rejection,
CI Identity Bootstrap Gate capability dry-run and six-code/eight-tool/source/
manifest/writer integration matrices, and the exact
pre-migration failure through Task 8. Static tests must reject the obsolete
shebang, obsolete residual, root-only-final-owner authority, and marker-only or
SSH-only success language.

- [ ] **Step 2: Run test and witness RED**

```powershell
node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: FAIL on the v1 runbook and missing active Mode 1 index references.

- [ ] **Step 3: Reconcile documentation and retain public files as dormant**

Mark the 2026-07-16 offline plan superseded by the 2026-07-17 Mode 1 plan.
Replace the runbook's required-reviewer/sixth-secret/offline-bundle path with the
selected single-operator model and exact post-merge Gate sequence. State that
the CI Identity Bootstrap Gate makes execute technically reachable and the Production Gate is
procedural, not host arming. State that source/merge/artifact do not deploy.
Add the active spec/plan to `docs/README.md`.

Document the CI Identity Bootstrap Gate as rollback-first and authorization-last:
stage rollback; derive exact merged-source code/tool digests and Gate-native capability
attestations plus the absent/unexpected/wrong-fd/error/oversize/digest-mismatch
dry-run matrix; inventory and bind fixed paths, observed role metadata, writers,
passwd/home/shell, line/blob, complete sshd Include/Match topology, and complete
sudo source/effective policy; require effective global and Match-scoped
ForceCommand/ChrootDirectory both `none`, account-applicable DisableForwarding
`true`, and PermitTunnel `false`; install and same-FD read back the entire
closure;
then add the canonical authorization line as the final mutation. The first
rollback mutation removes it, then removes and directory-fsyncs the dedicated
sudoers file. Any ambiguity blocks rather than normalizes.
State that the CI Identity Bootstrap Gate and dispatch are prohibited until
Task 8's strict framed
migration is merged and verified.

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
node --experimental-vm-modules --test server/tests/japan-tuic-additive-repair-frame.test.mjs server/tests/japan-tuic-additive-repair-state.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-bootstrap.test.mjs server/tests/japan-tuic-additive-repair-entrypoint.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-workflow.test.mjs
```

Expected: all tests PASS, zero failures/skips unless an existing test has an
explicit platform skip unrelated to production behavior.

The focused result must explicitly include the Task 4 recursive import-closure,
six-code/eight-tool manifests, CI Identity Bootstrap Gate-only capability attestation boundary,
pre-import tampered-module sentinel ordering, exact eight-line fixed-preload
entrypoint, builtin-only bootstrap with no local/dynamic/loader escape,
entrypoint/bootstrap/Node/root TCB and self-check-as-defense-in-depth labels,
exactly one total JavaScript `import()`, capability dry-run fixtures for
absent/unexpected/wrong-fd/error/
oversize/digest mismatch,
exact size/ceiling/EOF and low-12-bit special-mode boundaries, canonical
schema, SSH topology/Include/Match/parser including explicit pattern arrays and
fixed `all`, global and Match-scoped ForceCommand/ChrootDirectory `none`,
account-applicable DisableForwarding `true` and PermitTunnel `false` with
default/explicit-deny, global-allow, Match-scoped-allow, and unresolved-
conditional fixtures, exact Match-all object shape and no-space JSON bytes,
explicit login-shell/dash projection, canonical sudo
source/effective policy and exact no-argument rule, operations-driven same-FD
1 MiB source reads, derived disposition/source-order/effective facts with no
caller assertions, six-code/eight-tool/source/manifest/writer integration,
runtime mode and audited Linux flag absence/drift, surrogate UTF-8 round-trip
rejection, same-FD bigint/EOF/close, directory-null positive/equal BigInt sentinel
plus file-null rejection and post-consumption type/uid/gid/mode/nlink drift,
`0400`/`0600` role-mode/writer residual, exact
pre-migration call-count, lock-precreation, Tasks 5-8 use-time drift, and
zero-byte-fsynced-SSH plus absent-parent-fsynced-sudo non-marker-only closeout
matrices. Treat any missing test class as
a verification failure, not an allowed skip.

- [ ] **Step 2: Run full repository validation and diff checks**

```powershell
npm test
git diff --check origin/master...HEAD
git status --short --branch
```

Expected: full suite PASS; diff check empty; only intentional files present.
Before accepting that result, scan the active entrypoint/design/plan/runner and
tests for obsolete `#!/bin/sh`,
`trusted_root_concurrency_not_machine_proven`, root-only-final-owner authority,
an obsolete code-manifest role set, direct Node runner startup without the fixed preload,
bootstrap dynamic-import of runner, bootstrap self-authorization, caller-
asserted SSH/sudo/Match/writer evidence, zero-fallback Linux flags, or marker-
only `authorization_removed`; any active occurrence fails the task.

- [ ] **Step 3: Run independent spec, security, and code-quality reviews**

Use fresh reviewers for:

- design/plan compliance and exact file surface;
- attack-path review of workflow input, Environment secrets, forced command,
  binding, installed ESM/tool closure, same-FD reads, complete SSH account
  topology including ForceCommand/ChrootDirectory and
  DisableForwarding/PermitTunnel global/Match/default derivation, exact
  Match-all bytes, directory-link sentinel plus post-consumption full-policy
  drift, login-shell projection, capability dry-run evidence, line/blob parser,
  use-time validation, frame, ledger/journal, helper envelope, rollback,
  CI Identity Bootstrap Gate authorization-last ordering, and closeout;
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
