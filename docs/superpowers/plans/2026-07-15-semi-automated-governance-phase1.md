# Semi-Automated Governance Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Operator interruptions by turning evidence-complete Risk B/C failures into attributable, policy-routed, provenance-bound repair proposals and, only after a successful shadow period, permit one narrowly bounded Risk C read-only transport recovery.

**Architecture:** Extend the source-only Execution Contract v1 and the candidate Gate governance model from PR #499 with separate provenance, planning, execution, and platform-enforcement boundaries. Keep the repository as a modular monolith using Node.js modules, JSON Schema, repository state, and GitHub Actions; do not introduce a workflow engine, queue, new database, or production caller.

**Tech Stack:** Node.js 22, ECMAScript modules, JSON Schema draft 2020-12, Node test runner, Git, GitHub Actions, GitHub API readback through an injected connector boundary.

## Global Constraints

- This document and its index entry are Risk C, documentation-only, with `release_unit: none`, `production_state: not_applicable`, and `identity_impact: false`.
- The verified source baseline for this plan is `master@c550c04515aaf64882be85089e169253114d7274`, which contains Execution Contract v1 from PR #498.
- PR #499 is a candidate dependency at `38ab085abca2699588811d39edbb7c36e02ea35c`; it is OPEN/Draft with successful current checks and is not treated as merged source.
- PR #479 remains an independent OPEN/Draft delivery lane at `58ccdccc6af5ed120541f03d2713857e4a9a8a65`; this plan neither changes nor approves it.
- `codex_auto_repair` in the PR #499 candidate means routing eligibility only. It always has `mutation_authority: false` until every later verifier, executor, and activation boundary passes.
- Risk A, low-confidence attribution, protected scope, security or credential boundaries, production boundaries, scope drift, sensitive output, and exhausted retry budgets always route to Operator review.
- The first automatic execution capability is limited to Risk C, read-only process-transport recovery with zero changed files and one attempt per immutable lineage. It does not include source repair, tests, Git commit/push, PR mutation, merge, settings mutation, artifact publication, provider access, runtime action, deployment, promotion, or rollback.
- B-tier code or test remediation remains proposal-first and requires one Operator boundary approval during Phase 1.
- The Gate ledger remains an append-only evidence index. It is not a business-state database and does not authenticate GitHub actors or comment bodies by itself.
- An LLM confidence claim alone never grants repair eligibility. Automatic eligibility requires a versioned deterministic classifier, evidence digests, and an explicit `unknown`/abstain route.
- Do not store secrets, tokens, subscription URLs, credentials, raw process output, raw config, customer data, private runtime identity, or unredacted GitHub payloads.
- Each implementation PR below has its own source Gate, validation, formal review, Ready decision, and merge decision. A completed Gate never authorizes the next Gate automatically.
- Future Gate `change_id` values are created only when their proposal can bind a fresh exact head and predecessor receipt. This plan fixes Gate boundaries, not future time-sensitive identities.

---

## 1. Verified Starting Point

### 1.1 Available on `master`

Execution Contract v1 currently provides:

```text
createExecutionIntent()
  -> resolveExecutable()
  -> createReadbackInterface()
  -> executeExecutionContract()
  -> buildExecutionReceipt()
```

Its implementation is isolated in `server/services/execution-contract.mjs`. It uses `shell: false`, a deterministic executable identity, explicit child environment, bounded time/output, aggregate before/after readback, and redacted receipts. It deliberately does not authenticate approvals or act as a Gate executor.

### 1.2 Candidate capability in PR #499

PR #499 proposes:

```text
terminal_blocked
  -> failure_attributed
  -> repair_routed
  -> successor_proposed
```

It adds strict failure-attribution, repair-policy, and Gate-ledger schemas; append-only transition validation; retry-budget enforcement; and read-only Actions evidence. It does not provide an attribution producer, provenance authentication, Repair Plan, proposal writer, actual-diff binding, bounded executor, exact-head trusted status, or ledger publisher.

### 1.3 Trust interpretation

The Phase 1 authority chain is:

```text
Failure Receipt
  -> Attribution
  -> Policy Decision
  -> Repair Plan
  -> Provenance Verification
  -> Bounded Execution
  -> Validation
  -> Terminal Receipt
```

No upstream result implies a downstream permission:

| Component | Decides | Must not decide |
| --- | --- | --- |
| Attribution | Why the failure occurred and which invariants are affected | Whether mutation is authorized |
| Policy Router | Candidate lane, retry budget, and escalation | Whether remote evidence is authentic |
| Repair Planner | Exact successor proposal and bounded Repair Plan | Whether the plan may execute |
| Provenance Verifier | Actor/body/digest/lineage/head/scope authenticity | How to repair the failure |
| Executor | Execute one already verified structured plan | Expand scope, retry, approve, merge, or deploy |
| Ledger | Preserve immutable evidence and transitions | Become business state or mutation authority |

---

## 2. Phase 1 Contracts

### 2.1 Governance provenance envelope

The verifier consumes a connector-read envelope with these exact logical fields:

The digest literals below are synthetic structural examples, not repository or
approval evidence.

```json
{
  "schemaVersion": "1",
  "repositoryId": "R_repository_node_id",
  "repositoryName": "gccwebos-com/proxy-gateway-minimal",
  "subjectType": "issue",
  "subjectNumber": 437,
  "commentNodeId": "IC_comment_node_id",
  "actorId": "U_actor_node_id",
  "actorLoginDigest": "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
  "repositoryRole": "maintain",
  "authorizedTeamSetDigest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "authorizationPolicyDigest": "8ca4737109a75afb81e8e68df4824a41c48aa9bd717811a4c3ddc79481a6c27d",
  "authorizationObservedAt": "2026-07-15T00:00:00.000Z",
  "bodySha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "createdAt": "2026-07-15T00:00:00.000Z",
  "updatedAt": "2026-07-15T00:00:00.000Z",
  "recordRole": "approval",
  "proposalId": "gate-proposal-id",
  "approvalId": "gate-approval-id",
  "parentReceiptId": "parent-terminal-receipt-id",
  "sourceHead": "c550c04515aaf64882be85089e169253114d7274",
  "scopeDigest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "policyDigest": "8ca4737109a75afb81e8e68df4824a41c48aa9bd717811a4c3ddc79481a6c27d",
  "expiresAt": "2026-07-15T01:00:00.000Z"
}
```

The connector does not assert actor authorization. The verifier derives
`operator`, `repair_policy`, or `unauthorized` from an independently protected
authorization policy plus fresh repository-role/team readback. It rejects
edited or deleted records, unexpected actors, duplicate roles, stale
authorization observation, actor/team/policy mismatch, body/digest mismatch,
stale heads, expired approval, wrong parent receipt, wrong scope/policy digest,
and a non-unique proposal/approval pair. Raw comment text is read only for
digest verification and is not stored in the ledger.

### 2.2 Deterministic attribution result

Failure Attribution v1 from PR #499 remains strict and unchanged. Producer
metadata is carried by a separate envelope so existing
`validateFailureAttribution()` continues to receive only its approved v1
fields:

```json
{
  "schemaVersion": "1",
  "classifierVersion": "1",
  "classifierRulesDigest": "8ca4737109a75afb81e8e68df4824a41c48aa9bd717811a4c3ddc79481a6c27d",
  "evidenceDigest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "attribution": {
    "schemaVersion": "1",
    "failureId": "failure-id",
    "gateId": "gate-id",
    "stage": "execution_transport",
    "category": "execution_transport",
    "failureRisk": "C",
    "confidence": "high",
    "affectedInvariants": ["process_transport"],
    "evidenceRefs": ["terminal-receipt-id"],
    "observedAt": "2026-07-15T00:00:00.000Z"
  }
}
```

Conflicting, incomplete, or unsupported evidence produces a valid v1
attribution with `category: unknown` and never an automatic route.

### 2.3 Repair Plan

The Repair Plan is the only input accepted by a future bounded executor:

As above, digest values in this structural example are synthetic unless they
match a separately verified live binding.

```json
{
  "schemaVersion": "1",
  "planId": "repair-plan-id",
  "parentReceiptId": "parent-terminal-receipt-id",
  "attributionDigest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "provenanceDigest": "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
  "policyVersion": "1",
  "policyDigest": "8ca4737109a75afb81e8e68df4824a41c48aa9bd717811a4c3ddc79481a6c27d",
  "risk": "C",
  "confidence": "high",
  "category": "execution_transport",
  "classifierVersion": "1",
  "repository": "gccwebos-com/proxy-gateway-minimal",
  "exactHead": "c550c04515aaf64882be85089e169253114d7274",
  "frozenTree": "eee178b2160d75f9143da416f22e053fd0e2574c",
  "frozenIdentityDigest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "preRegisteredIntentRef": "execution-intent:readback-id",
  "executionId": "readback-execution-id",
  "commandId": "readback-command-id",
  "intentDigest": "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
  "expectedExecutable": {
    "basename": "git.exe",
    "pathSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "contentSha256": "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"
  },
  "mutationClass": "read_only",
  "allowedDelta": "process_invocation_transport_only",
  "fileMutationAllowlist": [],
  "forbiddenActions": [
    "source_mutation",
    "test_mutation",
    "commit",
    "push",
    "pull_request_mutation",
    "settings_mutation",
    "artifact_publication",
    "provider_access",
    "runtime_mutation",
    "deployment",
    "promotion",
    "rollback"
  ],
  "validation": ["frozen_intent_digest", "zero_file_delta", "terminal_receipt"],
  "retryAttempt": 0,
  "retryBudget": 1,
  "createdAt": "2026-07-15T00:00:00.000Z",
  "expiresAt": "2026-07-15T01:00:00.000Z"
}
```

`retryAttempt` is derived from immutable lineage. Creating a new successor does not reset the budget. A transport failure after process start or an unavailable terminal receipt consumes the attempt unless a later reconciliation proves that execution never started.

`fileMutationAllowlist` is an executor field and is distinct from the inherited
Gate `scope.allowedFiles`, which remains non-empty under Gate Ledger v1. A
read-only repair inherits the exact Gate scope and source head while granting
the executor zero writable repository files. The Repair Plan digest binds the
pre-registered Execution Intent and the resolved executable path/content
identity because Execution Contract v1 does not include resolved executable
identity in `intentDigest`.

### 2.4 Actual-change evidence

A `fileMutationAllowlist` subset check is necessary but insufficient. The executor contract must freeze and compare:

- repository, base, head, tree, index, and worktree identity;
- regular file versus symlink;
- add, modify, delete, rename, and copy status;
- executable bit and file mode;
- text versus binary diff;
- generated and untracked files;
- per-file before/after SHA-256;
- category-specific semantic delta.

Plan verification, execution, post-execution diff, and receipt construction occur in one isolated checkout. Any head, tree, index, policy, approval, or provenance change produces a blocked result and prevents continuation.

### 2.5 Receipt uncertainty

If an execution may have changed state but durable receipt publication fails, the result must not claim `mutation: none`:

```yaml
execution_state: mutation_may_have_occurred
canonical_result: unavailable
reconciliation_required: true
```

Only a later read-only reconciliation Gate may establish the canonical result.

### 2.6 Canonical evidence publication and authorization consumption

For Phase 1, the canonical remote evidence surface is one unique append-only
GitHub Issue comment for each persisted Gate or repair-execution event on the
Gate subject Issue. A check run is a replaceable aggregate projection and never
the canonical receipt. Publication requires:

- one digest-bound idempotency key for each Gate/execution event;
- one writer identity, `github-actions[bot]`, using the run-scoped
  `GITHUB_TOKEN`;
- one non-cancelling concurrency group per Gate lineage;
- a pre-write uniqueness readback and a post-write node/body/actor/count
  readback;
- no comment update protocol: each event gets a new comment and an existing
  comment is never overwritten;
- edited/deleted detection through comment node ID, equality of `createdAt` and
  original `updatedAt`, and body digest;
- a blocked reconciliation result when uniqueness or readback cannot be
  proven.

Automatic Risk C recovery preserves Gate Ledger v1's exact event vocabulary
and predecessor/successor split:

```text
predecessor Gate:
terminal_blocked
  -> failure_attributed
  -> repair_routed
  -> successor_proposed

successor Gate:
proposed
  -> approval_recorded (authorization.authority = repair_policy)
  -> approval_consumed (authorization.authority = repair_policy)
  -> terminal_passed | terminal_blocked
```

Remote publication therefore creates unique canonical comments for:

1. the predecessor `successor_proposed` event;
2. the successor `proposed` event;
3. the successor `approval_recorded` event;
4. the successor `approval_consumed` event;
5. the separate repair-execution `execution_started` receipt;
6. the successor terminal event.

Each comment has its own sequence-bound idempotency key. Missing, duplicated,
edited, reordered, or unreadable comments stop the chain and require
reconciliation; later comments cannot repair an earlier missing event in place.

The authorization event binds Gate, lineage, source head, scope, Repair Plan,
policy, retry attempt, expiry, and writer identity digests. Once execution
starts, the authorization remains consumed even when process execution or
terminal publication fails. `execution_started` belongs only in the separate
repair-execution receipt and is not a Gate Ledger v1 event. Routing eligibility
cannot skip either approval event or resume the consumed predecessor Gate.

---

## 3. Exact PR And Gate Decomposition

### Dependency lane: existing work, no new authority from this plan

| Order | Deliverable | Required boundary |
| --- | --- | --- |
| P0 | Finish PR #479 under its current successor lineage | Independent Risk A source Gate, exact-head checks, formal Ready review, separate Ready and merge approvals |
| P1 | Formally review and close PR #499 | Independent B-tier review, Ready, and merge; candidate routing is not treated as source before merge |
| P2 | Reconcile `project-state` after P0/P1 | Separate Risk C PR; source facts only, no provider/runtime refresh |

P0 and P1 may be scheduled independently when their own fresh bindings allow it. P2 occurs only after the source heads it describes are final.

Hard implementation dependencies are enforced as follows:

```text
P1 (#499 merged on a freshly rebound master)
  -> Task 2
  -> Task 3
  -> Task 4
  -> Task 5
Task 3 + Task 5
  -> Task 6
  -> Task 7
  -> Task 8
  -> Task 9
```

Task 4 may be prepared only after Task 2 is merged; it does not need Task 3 to
collect shadow decisions. Task 6 needs both the executor contract from Task 3
and a passing shadow evaluation from Task 5. No task consumes a Draft PR as
trusted source.

### Task 1: Publish this Phase 1 design

**Risk / process / PR count:** Risk C / docs-only / one Draft PR.

**Files:**

- Create: `docs/superpowers/plans/2026-07-15-semi-automated-governance-phase1.md`
- Modify: `docs/README.md`

**Interfaces:**

- Consumes: `master@c550c04515aaf64882be85089e169253114d7274`, PR #499 candidate head `38ab085abca2699588811d39edbb7c36e02ea35c`, and read-only PR state.
- Produces: a non-authoritative implementation and Gate decomposition for Phase 1.

- [x] **Step 1: Record verified baseline and non-authority boundaries**

  Record the exact source and candidate identities above. Do not update project-state, PR bodies, Issues, GitHub settings, artifacts, runtime, or production.

- [x] **Step 2: Define trust separation and the initial auto-execution ceiling**

  Define routing as eligibility only and restrict initial execution to Risk C, read-only transport recovery, zero file delta, and one lineage attempt.

- [x] **Step 3: Add the plan to the documentation index**

  Add one active-roadmap row under `Workflow / Agent Rules` in `docs/README.md`.

- [x] **Step 4: Validate the documentation change**

  Run:

  ```powershell
  npm run docs:authority:check
  git diff --check
  git status --short
  ```

  Expected: both validation commands exit `0`, dirty diff check produces no
  output, and status lists only the two scoped documentation files. The status
  inventory is required because `git diff --check` does not inspect untracked
  files.

- [x] **Step 5: Commit and open one Draft PR**

  Commit only the two scoped files with:

  ```text
  docs: plan semi-automated governance phase 1
  ```

  After the commit, run:

  ```powershell
  git diff --check origin/master...HEAD
  ```

  Expected: exit `0` with no output, now including the newly tracked plan.

  The PR body records Risk C, the exact baseline, actual validation, `release_unit: none`, `production_state: not_applicable`, and explicit non-authority for #479/#499 mutation, Ready, merge, settings, artifacts, providers, runtime, or production.

### Task 2: Deterministic attribution, provenance verifier, and Repair Plan generator

**Risk / process / PR count:** Risk B / one source PR / one B-tier Source Gate.

**Hard prerequisite:** PR #499 has passed formal review, merged, and the Task 2
proposal has rebound to the new exact `master` and policy digest.

**Files:**

- Create: `schemas/failure-attribution-result-v1.schema.json`
- Create: `schemas/governance-authorization-policy-v1.schema.json`
- Create: `schemas/governance-provenance-v1.schema.json`
- Create: `schemas/repair-plan-v1.schema.json`
- Create: `project-state/governance-authorization-policy.json`
- Create: `server/services/governance/failure-attributor.mjs`
- Create: `server/services/governance/provenance-verifier.mjs`
- Create: `server/services/governance/repair-planner.mjs`
- Create: `server/tests/governance-provenance-repair-plan.test.mjs`
- Modify: `scripts/check-project-state.mjs`
- Modify: `docs/GITHUB_ISSUE_PR_WORKFLOW.md`
- Modify: `docs/VALIDATION_BASELINE.md`

**Interfaces:**

- Consumes: a protected authorization policy, versioned deterministic attribution rules, `validateFailureAttribution()`, `routeGateFailure()`, the immutable policy digest, connector-read provenance envelopes, and a frozen repository snapshot.
- Produces: `attributeGateFailure(input) -> strict attribution or unknown`, `verifyGovernanceProvenance(input) -> { ok, provenanceDigest, errors }`, `createRepairPlan(input) -> frozen RepairPlan`, and `renderSuccessorProposal(plan) -> { body, bodySha256 }`.

- [ ] **Step 1: Write failing schema and service tests**

  Cover deterministic category matches, conflicting evidence returning `unknown`, unsupported evidence returning `unknown`, valid provenance, edited comment, wrong actor, duplicate approval, stale head, wrong parent receipt, scope/policy mismatch, expiry, Risk A, low confidence, and immutable lineage retry count.

- [ ] **Step 2: Verify the focused tests fail for missing contracts**

  Run:

  ```powershell
  node --test server/tests/governance-provenance-repair-plan.test.mjs
  ```

  Expected: failure because the schemas/modules do not yet exist.

- [ ] **Step 3: Implement strict schemas, verifier, planner, and deterministic proposal rendering**

  Unknown fields fail closed. Producer metadata remains outside strict Failure
  Attribution v1. Any ambiguous or unsupported evidence returns a valid
  `unknown` attribution. Actor authorization is derived from protected policy
  plus fresh repository-role evidence and is never trusted from a connector
  field. The planner accepts only successful provenance and a deterministic
  route. It never calls GitHub, writes a file, starts a process, or grants
  authority.

- [ ] **Step 4: Run focused, governance, full, and diff validation**

  Run:

  ```powershell
  node --test server/tests/governance-provenance-repair-plan.test.mjs server/tests/gate-governance.test.mjs
  npm run governance:check
  npm run project-state:check
  npm test
  git diff --check
  git status --short
  ```

  Expected: all tests pass, governance and project-state snapshots pass, full
  suite has zero failures, dirty diff check has no output, and status lists
  only the files declared in this Task.

- [ ] **Step 5: Commit, validate the committed range, and deliver through independent decisions**

  Commit with `feat(governance): bind provenance and repair plans`, then run:

  ```powershell
  git diff --check origin/master...HEAD
  ```

  Expected: exit `0` with no output. The terminal receipt may state
  `repair_plan_generation: available`; it must state
  `execution_authority: absent` and `github_write: none`. Formal review, Ready,
  and merge remain separate decisions.

### Task 3: Bounded executor and actual-diff verifier, disabled by default

**Risk / process / PR count:** Risk B / one source PR / one B-tier Source Gate.

**Hard prerequisite:** Task 2 is merged and the Gate binds the merged schemas,
policy, authorization policy, provenance verifier, and Repair Plan identity.

**Files:**

- Create: `schemas/repair-execution-receipt-v1.schema.json`
- Create: `server/services/governance/git-change-evidence.mjs`
- Create: `server/services/governance/bounded-repair-executor.mjs`
- Create: `server/tests/bounded-repair-executor.test.mjs`
- Modify: `docs/GITHUB_ISSUE_PR_WORKFLOW.md`
- Modify: `docs/VALIDATION_BASELINE.md`

**Interfaces:**

- Consumes: a verified frozen Repair Plan, verified provenance digest, an injected repair adapter, and Execution Contract v1.
- Produces: `captureRepositorySnapshot()`, `verifyActualChange(plan, before, after)`, and `executeBoundedRepair(input) -> repair execution receipt`.

- [ ] **Step 1: Write failing negative-boundary tests**

  Cover symlink replacement, rename/copy, delete/add, executable-bit change, binary diff, generated/untracked file, head/index drift, policy/provenance drift, out-of-scope file, wrong semantic delta, process timeout, output overflow, and receipt-publication uncertainty.

- [ ] **Step 2: Verify the focused tests fail before implementation**

  Run:

  ```powershell
  node --test server/tests/bounded-repair-executor.test.mjs
  ```

  Expected: failure because the executor modules do not yet exist.

- [ ] **Step 3: Implement the source-only executor bridge**

  The module has no CLI, workflow caller, GitHub token, registered real repair adapter, production caller, commit/push behavior, or default enablement. Tests use isolated temporary repositories and deterministic fake adapters.

- [ ] **Step 4: Run focused, execution-contract, full, and diff validation**

  Run:

  ```powershell
  node --test server/tests/bounded-repair-executor.test.mjs server/tests/execution-contract.test.mjs server/tests/gate-governance.test.mjs
  npm test
  git diff --check
  git status --short
  ```

  Expected: all tests pass, full suite has zero failures, dirty diff check has
  no output, and status lists only the declared files.

- [ ] **Step 5: Commit, validate the committed range, and deliver without activation**

  Commit with `feat(governance): add disabled bounded repair executor`, then
  run `git diff --check origin/master...HEAD`. Expected: exit `0` with no
  output. The terminal receipt must state `executor_contract: available`,
  `registered_adapters: 0`, `automatic_execution: disabled`, and
  `production: unchanged`.

### Task 4: GitHub Actions shadow routing

**Risk / process / PR count:** Risk B / one workflow PR / one workflow trust-root Gate.

**Hard prerequisite:** Task 2 is merged. The workflow reuses only merged
attribution, authorization-policy, provenance, routing, and planning code.

**Files:**

- Create: `.github/workflows/governance-repair-shadow.yml`
- Create: `scripts/build-governance-shadow-evidence.mjs`
- Create: `server/tests/governance-shadow-workflow.test.mjs`
- Modify: `server/tests/ci-workflow-contract.test.mjs`
- Modify: `docs/VALIDATION_BASELINE.md`
- Modify: `package.json`

**Interfaces:**

- Consumes: completed CI/Governance failures, trusted `master` validator code, exact PR head metadata, read-only GitHub API evidence, and the Phase 1 planner.
- Produces: redacted `governance-shadow-result.json` and a job summary containing a stable event ID, exact head, result digest, attribution, route, proposal candidate digest, reason code, evidence expiry, and abstain/escalation result.

- [ ] **Step 1: Write workflow-contract tests before adding the workflow**

  Assert `contents: read`, `actions: read`, `pull-requests: read`,
  `issues: read`, no secrets, no candidate-code execution under
  `pull_request_target` or `workflow_run`, no `issues: write`, no
  `checks: write`, no commit/push/PR mutation, and
  `cancel-in-progress: false`.

- [ ] **Step 2: Verify the focused workflow test fails**

  Run:

  ```powershell
  node --test server/tests/governance-shadow-workflow.test.mjs server/tests/ci-workflow-contract.test.mjs
  ```

  Expected: failure because the shadow workflow does not yet exist.

- [ ] **Step 3: Implement read-only shadow evidence**

  Trigger on completion of the named CI workflow through `workflow_run`, check
  out only `${{ github.workflow_sha }}`, and verify that SHA before executing
  repository code. Treat the triggering run head and all PR/event fields as
  untrusted data; never check out or execute the candidate head. The workflow
  binds the exact candidate head and never publishes a durable successor,
  approval, or terminal receipt. Actions artifacts are diagnostic evidence,
  not the durable Gate ledger.

  Define `shadowEventId` as the colon-joined tuple
  `workflowRunId:runAttempt:candidateHead` in the schema, store the
  exact workflow run URL, result SHA-256, creation time, and evidence expiry,
  and print the same canonical JSON digest in both artifact and job summary.
  Before observation begins, verify that Actions run/log retention exceeds the
  planned observation window. If evidence would expire before Task 5 can
  freeze the dataset, shadow evaluation is blocked rather than inferred.

  If Issue provenance or repository-role authorization cannot be read and
  verified with the read-only token, emit `abstained_unverified_provenance` and
  do not generate a proposal candidate.

  GitHub documents that `github.workflow_sha` identifies the commit containing
  the workflow file and warns that `workflow_run` can have privileged token or
  secret access. The contract therefore keeps explicit read-only permissions,
  no secrets, pinned third-party Actions, and no untrusted checkout or cache.

- [ ] **Step 4: Run workflow, governance, full, and diff validation**

  Run:

  ```powershell
  node --test server/tests/governance-shadow-workflow.test.mjs server/tests/ci-workflow-contract.test.mjs server/tests/gate-governance.test.mjs
  npm run governance:check
  npm test
  git diff --check
  git status --short
  ```

  Expected: all tests pass, full suite has zero failures, dirty diff check has
  no output, and status lists only the declared files.

- [ ] **Step 5: Commit, validate the range, and observe exact-head checks without changing rulesets**

  Commit with `ci: add governance repair shadow routing`, run
  `git diff --check origin/master...HEAD`, and require exit `0` with no output.
  The PR remains Draft until its workflow trust-root review is complete. Ready,
  merge, required-check mapping, and GitHub settings remain independent
  decisions.

### Task 5: Shadow evaluation and policy calibration

**Risk / process / PR count:** Risk C / read-only evaluation Gate / zero expected PRs unless evidence documentation must be corrected.

**Hard prerequisite:** Task 4 is merged and the read-only workflow has produced
an evidence set whose earliest item remains retrievable through the complete
evaluation window.

**Files:** None.

**Interfaces:**

- Consumes: at least 14 calendar days and at least 20 shadow events, including every evidence-complete non-A B/C event and every unknown/abstained event observed during the window.
- Produces: one terminal evaluation receipt with `eligible_to_prepare_activation` or `changes_required`.

- [ ] **Step 1: Freeze the denominator and metric definitions**

  Build a sorted read-only dataset manifest containing, for every observed
  event: `shadowEventId`, workflow run ID/attempt/URL, exact head, result digest,
  created time, expiry time, classification, route, proposal-candidate digest
  or explicit absence, and durable Operator disposition reference or explicit
  `not_reviewed`. Hash the complete manifest and include its digest in the
  evaluation receipt so the metrics can be reproduced.

  Use separate fixed denominators:

  - `machine_parseable_receipts`: every shadow event in the window;
  - `known_BC_attribution_coverage`: every evidence-complete non-A B/C event,
    including unknown/abstained classifications in the denominator;
  - `proposals_accepted_without_rewrite`: only events for which the planner
    emitted a proposal candidate and an Operator made a disposition;
  - `false_safe_route`: every route that received independent review.

  Every auto-eligible route must receive independent review. Require at least
  10 proposal dispositions and at least 10 independently reviewed
  auto-eligible routes in addition to the overall 20-event floor. A zero or
  below-minimum denominator is `insufficient_evidence`, not a passing zero or
  100 percent result. Do not remove hard cases to improve percentages.

- [ ] **Step 2: Calculate the approved metrics**

  Require:

  ```yaml
  machine_parseable_receipts: ">= 95%"
  known_BC_attribution_coverage: ">= 80%"
  proposals_accepted_without_rewrite: ">= 70%"
  false_safe_route: 0
  unauthorized_mutations: 0
  Risk_A_auto_execution: 0
  retry_budget_exceeded_without_escalation: 0
  unresolved_receipt_reconciliation: 0
  ```

  Also report median Operator interactions, Operator override rate and reasons, repeated failures with the same root cause, successor depth, and time from detection to terminal receipt.

- [ ] **Step 3: Issue one read-only evaluation result**

  Passing evaluation permits preparation of Task 6 only. It does not enable a workflow, mutate policy, grant GitHub permissions, or authorize automatic source changes.

### Task 6: Candidate for one-shot Risk C read-only transport recovery

**Risk / process / PR count:** Risk A governance-control-plane source change / one source PR / no settings mutation in the source Gate.

**Hard prerequisite:** Task 3 is merged and Task 5 has a passing terminal
evaluation receipt. The proposal binds both exact identities.

**Files:**

- Create: `schemas/repair-activation-v1.schema.json`
- Create: `server/services/governance/repair-adapters/readback-transport.mjs`
- Create: `server/services/governance/durable-evidence-publisher.mjs`
- Create: `scripts/run-governance-readonly-recovery.mjs`
- Create: `.github/workflows/governance-c-readonly-recovery.yml`
- Create: `server/tests/governance-readonly-recovery.test.mjs`
- Modify: `server/tests/ci-workflow-contract.test.mjs`
- Modify: `docs/GITHUB_ISSUE_PR_WORKFLOW.md`
- Modify: `docs/VALIDATION_BASELINE.md`

**Interfaces:**

- Consumes: a Task 5 passing receipt, exact Repair Plan, verified repair-policy authorization, pre-registered Execution Contract intent, and the run-scoped least-privilege `GITHUB_TOKEN` created by GitHub Actions.
- Produces: one idempotently published read-only successor proposal/receipt chain and one redacted execution receipt. The publisher writes only a digest-bound Issue/check evidence envelope and immediately reads it back for node identity, actor, body digest, and uniqueness.

- [ ] **Step 1: Lock the only initial automatic lane**

  Require all of:

  ```yaml
  risk: C
  category: execution_transport
  confidence: high
  mutationClass: read_only
  allowedDelta: process_invocation_transport_only
  fileMutationAllowlist: []
  retryBudget: 1
  command_intent_change: forbidden
  production_authority: false
  repository_mutation: none
  production_mutation: none
  governance_evidence_mutation: bounded_append_only_event_set
  ```

  The recovery may replace only the failed transport envelope with the pre-verified Execution Contract runner. Executable identity, arguments, working directory, environment, timeout, output bound, readback contract, head, policy, and scope remain byte/digest identical.

- [ ] **Step 2: Write negative tests for every authority boundary**

  Reject source/test/workflow diff, changed command intent, missing provenance, non-C risk, non-read-only plan, second attempt, protected evidence, changed exact head, secret access, commit/push/PR mutation, provider/runtime/deployment action, and ambiguous execution state.

- [ ] **Step 3: Implement the disabled candidate**

  The workflow job is disabled unless the protected repository variable
  `GOVERNANCE_C_READONLY_RECOVERY_ENABLED` equals `true`; the variable is
  absent during this source PR. Use only `contents: read`, `actions: read`,
  `pull-requests: read`, `issues: write`, and `checks: write`. Do not use a
  private key, PAT, stored credential, `contents: write`, or
  `pull-requests: write`.

  The run-scoped `GITHUB_TOKEN` may append exactly one canonical Issue comment
  per event enumerated in section 2.6 and publish a check projection. The writer
  uses a lineage concurrency lock with `cancel-in-progress: false`, an
  idempotency key, pre/post uniqueness readback, actor/node/body verification,
  and the authorization-consumption sequence in section 2.6. Task 8 must
  protect the trust root before Task 9 can set the enable variable.

- [ ] **Step 4: Run focused, governance, full, diff, and exact-head validation**

  Run:

  ```powershell
  node --test server/tests/governance-readonly-recovery.test.mjs server/tests/bounded-repair-executor.test.mjs server/tests/execution-contract.test.mjs server/tests/gate-governance.test.mjs server/tests/ci-workflow-contract.test.mjs
  npm run governance:check
  npm test
  git diff --check
  git status --short
  ```

  Expected: all tests pass, full suite has zero failures, dirty diff check has
  no output, and status lists only the declared files.

- [ ] **Step 5: Commit, validate the range and exact head, then merge without activation**

  Commit with `feat(governance): add disabled read-only recovery`, run
  `git diff --check origin/master...HEAD`, and require all exact-head GitHub
  checks to pass. The source terminal receipt must state
  `automatic_execution: disabled`, `credential_binding: none`,
  `settings_mutation: none`, and `production: unchanged`.

### Task 7: Protect the governance trust root in source

**Risk / process / PR count:** Risk A governance trust-root source change / one
source PR / no settings mutation or lane activation.

**Hard prerequisite:** Task 6 is merged with automatic execution disabled.

**Files:**

- Create: `.github/CODEOWNERS`
- Create: `.github/workflows/governance-exact-head.yml`
- Create: `server/tests/governance-exact-head-workflow.test.mjs`
- Modify: `server/tests/ci-workflow-contract.test.mjs`
- Modify: `docs/GITHUB_ISSUE_PR_WORKFLOW.md`
- Modify: `docs/VALIDATION_BASELINE.md`

**Interfaces:**

- Consumes: fresh team/reviewer inventory, the merged trust-root path set, and the merged governance validators.
- Produces: CODEOWNERS coverage and a stable exact-head `Governance exact-head` check generated by trusted base code, with the publisher integration ID recorded in check evidence.

- [ ] **Step 1: Freeze the trust-root path and reviewer set**

  Include all governance workflows, schemas, policy/state files, provenance and
  executor modules, evidence publisher, validation scripts, and CODEOWNERS
  itself. The proposal records the exact team slug and team identity obtained
  from fresh GitHub readback; the implementation may not invent or silently
  substitute a reviewer.

- [ ] **Step 2: Write failing CODEOWNERS and workflow trust tests**

  Require trusted `pull_request_target` base code, exact candidate-head status
  publication, a `workflow_dispatch` self-probe that targets only its own exact
  merged workflow SHA, pinned Actions, no candidate-code execution, no cache,
  no secrets, and only `contents: read`, `pull-requests: read`, and
  `checks: write`. A trust-root upgrade cannot be validated by the upgraded
  candidate code itself.

- [ ] **Step 3: Implement source protection without changing settings**

  Publish the `Governance exact-head` check against the candidate SHA after
  validating candidate state blobs with the unchanged base trust root. Keep
  `GOVERNANCE_C_READONLY_RECOVERY_ENABLED` absent. Record the check run's
  integration/App ID and slug; a matching context name from another publisher
  is not equivalent evidence. The self-probe cannot accept an arbitrary SHA;
  it reads and verifies `${{ github.workflow_sha }}`.

- [ ] **Step 4: Validate, commit, and deliver**

  Run focused workflow tests, `npm test`, `git diff --check`, and scoped status
  inventory. Commit with `ci: protect governance trust root`, then run
  `git diff --check origin/master...HEAD` and wait for exact-head checks. Ready
  and merge require independent decisions. After merge, a separately allowed
  self-probe records the first exact context/publisher integration evidence for
  Task 8. The terminal receipt states `settings_mutation: none` and
  `automatic_execution: disabled`.

### Task 8: Enforce trust-root protection in GitHub settings

**Risk / process / PR count:** Risk A supply-chain/settings Gate / zero source
PRs / one exact settings mutation with the recovery lane still disabled.

**Hard prerequisite:** Task 7 is merged and its exact `master` checks pass.

**Files:** None.

**Interfaces:**

- Consumes: exact merged source SHA, ruleset/branch-protection inventory, team availability, CODEOWNERS readback, and the stable exact-head check name.
- Produces: one settings terminal receipt or blocked receipt; never a source merge or production deployment.

- [ ] **Step 1: Perform fresh read-only settings and team inventory**

  Verify repository plan capability, master ruleset, required checks, current
  bypass actors, required-review settings, conversation-resolution setting,
  exact team identity, CODEOWNERS evaluation, workflow permissions, the exact
  successful check publisher integration ID, and the disabled recovery
  variable.

- [ ] **Step 2: Apply only the approved trust-root enforcement delta**

  Require at least one review, required CODEOWNER review for trust-root paths,
  conversation resolution, and `Governance exact-head` bound to both its exact
  context and publisher integration ID. If the current plan/API cannot bind the
  integration identity, stop blocked rather than requiring a name-only check.
  Remove bypass only when supported by the approved plan and exact proposal.
  Keep the recovery variable absent/false and do not change environments,
  secrets, artifacts, deployments, providers, or production.

- [ ] **Step 3: Read back enforcement and close the settings Gate**

  Confirm every exact setting, team binding, check context, and bypass result.
  Passing Task 8 permits preparation of Task 9 only; it does not activate the
  lane.

### Task 9: Activate and validate the one-shot Risk C lane

**Risk / process / PR count:** Risk A governance activation Gate / zero source
PRs / one repository-variable mutation.

**Hard prerequisite:** Task 8 has a passed terminal receipt and a fresh readback
shows the trust root remains enforced at the exact Task 7 source SHA.

**Files:** None.

**Interfaces:**

- Consumes: exact source/workflow/policy/intent digests, Task 5 metrics, Task 8 enforcement receipt, and the run-scoped `GITHUB_TOKEN` permission model.
- Produces: an activation receipt or blocked receipt; never a source merge or production action.

- [ ] **Step 1: Bind the only settings delta and rollback**

  Change only `GOVERNANCE_C_READONLY_RECOVERY_ENABLED` from absent/false to
  `true`. The rollback is the exact inverse variable change. Do not modify token
  defaults, workflow files, rulesets, teams, environments, secrets, or branch
  settings in this Gate.

- [ ] **Step 2: Execute one synthetic repository-safe event**

  Prove policy authorization recorded then consumed, one attempt, zero file and
  repository mutation, exact intent/executable identity, exactly-once canonical
  Issue evidence, check projection, terminal readback, and no Risk B/A
  eligibility.

- [ ] **Step 3: Fail closed or enter observation**

  Any mismatch immediately restores the variable to false under the approved
  rollback and records a blocked receipt without retry. Success records
  `repository_mutation: none`,
  `governance_evidence_mutation: bounded_append_only_event_set`,
  `production_mutation: none`, and begins bounded observation; it grants no
  wider category or file-mutation authority.

---

## 4. Phase 1 Exit Criteria

Phase 1 is complete only when:

```yaml
operator_work:
  C_read_only_transport: automatic_once_within_policy
  B_source_or_test: one_boundary_approval
  A_or_unknown: explicit_operator_decision

safety:
  false_safe_route: 0
  unauthorized_mutation: 0
  Risk_A_auto_execution: 0
  retry_budget_violation: 0

evidence:
  provenance_authenticated: true
  actual_change_bound_to_plan: true
  receipt_uncertainty_reconciled: true
  exact_head_validation: true
  trust_root_machine_enforced: true
```

Metrics may improve efficiency targets, but no percentage overrides a safety invariant.

---

## 5. Later Horizontal Expansion

Later work stays outside the Phase 1 Gates and follows this dependency order:

1. **Lifecycle Contract v1, Risk B source-only:** define common `domain`, `subject`, `generation`, `authority`, `intent`, child outcomes, obligations, evidence, and compensation without unifying domain-specific states.
2. **Obligation durability:** add a minimal SQLite obligation journal/outbox only when a real consumer exists. Repository code may be B-tier; schema activation and production worker enablement require separate Risk A Gates.
3. **Durable artifact and rollback binding:** bind source SHA, artifact SHA-256, previous-known-good artifact, retention deadline, deployment identity, and rollback window outside short-lived Actions artifacts.
4. **Read-only runtime evidence:** bind observation freshness, deployment/artifact identity, aggregate identity health, accounting freshness, and reconciliation status without mutation authority.
5. **Extended platform enforcement:** add stable Security and Artifact required checks plus artifact/production environment reviewers through independent settings Gates; Phase 1 protects only the governance trust root.
6. **Operational resilience:** establish incident severity, current Japan/SGP DR authority, restore rehearsal, RTO/RPO drafts, observation-based SLOs, and error budgets before staging fault injection.
7. **Production alignment:** only after the artifact and runtime evidence chain is complete, establish an independent Artifact Gate followed by an exact Risk A production-alignment Gate.

Explicitly deferred:

- generic BPM/workflow engines, event-sourcing rewrites, Redis, Kafka, Temporal, or new microservices;
- general Risk B automatic source repair;
- automatic merge, deployment, promotion, rollback, production repair, or failover;
- production Chaos, active-active, or multi-region routing;
- credential-level authorization expansion or a universal cross-domain state enum.

The governing principle is:

```text
safe execution
  -> explainable attribution
  -> bounded recovery
  -> lifecycle correctness
  -> measurable resilience
  -> controlled production authority
```

## References

- [GitHub Actions contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts) for `github.workflow_sha` and untrusted context handling.
- [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) for privileged trigger and untrusted-checkout boundaries.
- [GitHub Actions token authentication](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication) for the run-scoped `GITHUB_TOKEN` and explicit permission reduction.
