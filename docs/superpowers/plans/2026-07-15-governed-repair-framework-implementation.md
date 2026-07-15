# Governed Repair Framework Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to execute this plan task-by-task. Every source
> task requires its own durable Gate, fresh identity binding, formal review,
> Ready approval, and merge approval.

**Goal:** Implement the source-only foundation of the Governed Repair
Framework: immutable failure observation, deterministic attribution,
policy-routed Repair Plans, provenance verification, pure Admission decisions,
a disabled bounded executor contract, read-only Actions shadow routing, and
foundation threat-contract tests.

**Architecture:** Reuse the Gate ledger, lifecycle validator, retry budget, and
Policy Router from PR #499 after their compatibility review. Add one canonical
contract/digest layer, keep facts, interpretation, authorization, execution,
and evidence as separate modules, and make every write-capable adapter absent
from this implementation phase. The only GitHub Actions surface delivered here
is a read-only shadow workflow.

**Tech Stack:** Node.js 22, ECMAScript modules, JSON Schema draft 2020-12,
Node's built-in test runner, Git, and GitHub Actions with explicitly read-only
permissions.

## Plan Status And Risk

```yaml
plan_state: proposed_for_independent_review
plan_risk: C
plan_process: docs_only
plan_expected_pr_count: 1
plan_validation:
  - npm run docs:authority:check
  - git diff --check origin/master...HEAD

implementation_program:
  prerequisite_prs: 1
  source_prs: 7
  shadow_evaluation_gates: 1
  final_state_sync_prs: 1

production_impact: none
execution_authority: none
write_executor_enabled: false
```

This plan does not authorize implementation. Each numbered source task is a
future B-tier change with an independently approved Gate. The design baseline
is `origin/master@0066a0be8246c75f9c3e565ec0d5db28afe7dcb7`; no future Gate
may reuse that identity as an execution binding. Every future Gate must bind
the then-current exact `origin/master`, branch head, file identity, policy
version, and predecessor receipt.

## Authority And Supersession

The active authorities are deliberately singular:

| Concern | Authority | Status |
|---|---|---|
| Architecture, security model, machine contracts | `docs/superpowers/specs/2026-07-15-governed-repair-framework-design.md` | Frozen design authority |
| Implementation order, exact source surfaces, PR boundaries | This plan | Proposed sequencing authority; active only after independent review and merge |
| Gate lifecycle, durable Issue/PR evidence | `docs/GITHUB_ISSUE_PR_WORKFLOW.md` | Existing workflow authority |
| Process execution transport | `docs/EXECUTION_CONTRACT_V1.md` and `server/services/execution-contract.mjs` | Existing source authority |
| Ledger, retry budget, transition validation, shared routing | PR #499 after compatible review and merge | Hard dependency, not trusted while Draft |
| Historical Phase 1 roadmap | `docs/superpowers/plans/2026-07-15-semi-automated-governance-phase1.md` | Historical; superseded for Tasks 2-9 execution |

This plan does not create a second ledger, router, retry budget, state machine,
business-state database, release registry, or execution contract. PR #499 must
not merge with the two known incompatible semantics. If an independently
discovered, already-published v1 contract later needs migration, that migration
requires a separate versioned plan and Gate; Task 1 cannot silently reinterpret
or rewrite v1 history.

## Non-goals

The following remain outside every Gate in this plan:

- a real GitHub claim writer or protected claim-tag namespace;
- a GitHub Issue, PR, check, or receipt write adapter;
- a branch, commit, push, or Draft PR publisher;
- repository ruleset, branch protection, required review, required check, or
  environment-reviewer mutation;
- automatic retry, automatic Ready, merge, artifact publication, deployment,
  provider, credential, runtime, promotion, rollback, or production action;
- application-code, test-contract, dependency, or security autofix;
- execution of candidate code, candidate workflow code, candidate Actions,
  candidate hooks, lifecycle scripts, caches, or untrusted artifacts in a
  write-token job.

The final state of this plan is `foundation_contracts_complete`. Full framework
source implementation remains incomplete because the real claim, publisher,
trusted exact-head, and durable receipt adapters are deliberately absent.
Completion is not activation eligibility.

## Hard Prerequisite: Close PR #499 Compatibly

No source task below may begin until PR #499 has an independent formal review,
has been synchronized with current `origin/master`, has new exact-head checks,
and has been separately approved Ready and merged.

The review must resolve both compatibility blockers:

1. `failure-attribution-v1` currently contains `failureRisk` and
   `routeGateFailure()` consumes it. Attribution must instead emit
   `technicalImpact`; the shared Policy Router alone derives governance risk.
2. Replace the ambiguous automatic-route `approvalRequired: false` field with
   explicit `proposalEligible`, `shadowEligible`, and
   `executionAuthority: false` fields, or remove that boolean entirely. Every
   Repair Plan created by this framework has `approval.required: true`.

The accepted automatic-route shape before merge is:

```yaml
lane: codex_auto_repair
proposalEligible: true
shadowEligible: true
executionAuthority: false
operatorApprovalRequiredForMutation: true
```

Task 1 may extend the compatible Attribution schema with frozen-design fields;
it must not be used to repair these two known #499 semantics after merge.

The compatible #499 contract must also preserve its immutable retry lineage:

```yaml
retry_budget:
  A: 0
  B: 1
  C: 1

phase_1_workflow_repair:
  first_attempt: 0
  maximum_budget: 1
  successor_resets_budget: false
```

Risk A, unknown attribution, low confidence, policy conflict, scope expansion,
identity or authority drift, and exhausted retry budget always route to an
Operator. The illustrative value `max_successor_attempts: 3` is not adopted.

After #499 merges, the first implementation Gate must record its exact merge
commit and rerun the prerequisite validation:

```powershell
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
```

Expected result: every command exits `0`; `git status --short` is empty. Any
failure blocks Task 1 and requires a new predecessor-specific Gate.

## Dependency Graph

```text
PR #499 compatible merge
  -> PR 1 contracts/digests/ledger events
  -> PR 2 observation/attribution
  -> PR 3 plan/approval/provenance
  -> PR 4 pure admission/synthetic claim
  -> PR 5 disabled executor contract
  -> PR 6 read-only Actions shadow
  -> PR 7 cross-component failure injection
  -> read-only shadow evaluation Gate
  -> C-tier project-state synchronization
```

The chain is serial because later modules consume the exact contracts produced
by earlier modules. No PR may pre-approve or automatically start its successor.

## Shared Machine Contracts

All protocol digests use canonical UTF-8 JSON, reject duplicate keys, reject
invalid UTF-8, reject unknown fields where the schema is closed, and bind the
repository, schema version, policy version, lineage, and protocol domain.

Parsing and schema failures throw `GovernanceContractError` with exactly
`name`, `code`, and `path`. Pure policy/admission/execution functions return a
tagged result and do not throw for expected denial:

```js
// success
{ ok: true, code: 'accepted', value: Object.freeze({}) }

// expected denial or unknown state
{ ok: false, code: 'provenance_mismatch', details: Object.freeze({}) }
```

Initial error codes are closed to:

```text
duplicate_json_key
invalid_utf8
utf8_bom_forbidden
empty_json_input
non_canonical_number
unknown_schema_field
schema_version_unsupported
provenance_mismatch
approval_invalid
approval_replayed
policy_conflict
executor_disabled
semantic_validator_unavailable
reconciliation_required
validation_rejected
abstain
```

Success codes are closed separately to `accepted`, `provenance_verified`,
`preclaim_admitted`, `postclaim_admitted`, and `execution_succeeded`.

Adding or changing a code is a contract version change, not an implementation
detail.

Exact domain prefixes are:

```text
OBSERVATION:v1\0
ATTRIBUTION:v1\0
PLAN:v1\0
APPROVAL:v1\0
CLAIM:v1\0
EXECUTION:v1\0
RECEIPT:v1\0
```

The digest input is `UTF8(domainPrefix) || canonicalJsonBytes`. A digest from
one domain must never validate in another domain even when payload bytes are
otherwise identical.

The minimum Repair Plan binding is:

```yaml
schemaVersion: "1"
planId: repair-plan-example-001
parentReceipt: issuecomment-1001
observationDigest: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
attributionDigest: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
policyVersion: repair-policy/v1
policyDigest: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
plannerVersion: repair-planner/v1
repository: gccwebos-com/proxy-gateway-minimal
validationBase: "1111111111111111111111111111111111111111"
mutationTarget: "2222222222222222222222222222222222222222"
frozenTree: "3333333333333333333333333333333333333333"
frozenIdentityDigest: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
scope:
  allowedFiles:
    - .github/workflows/example.yml
  allowedDelta: workflow-transport-only/v1
  forbiddenDelta:
    - permission_expansion
    - deploy_semantics
  semanticConstraints:
    - command_intent_digest_unchanged
    - stdout_contract_digest_unchanged
    - stderr_contract_digest_unchanged
    - exit_code_contract_digest_unchanged
patch:
  encoding: canonical-unified-diff
  digest: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
  sizeBytes: 512
transportContracts:
  commandIntentDigest: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
  stdoutContractDigest: "0101010101010101010101010101010101010101010101010101010101010101"
  stderrContractDigest: "0202020202020202020202020202020202020202020202020202020202020202"
  exitCodeContractDigest: "0303030303030303030303030303030303030303030303030303030303030303"
  workingDirectoryDigest: "0404040404040404040404040404040404040404040404040404040404040404"
  environmentContractDigest: "0505050505050505050505050505050505050505050505050505050505050505"
validation:
  trustedValidatorSha: "4444444444444444444444444444444444444444"
  commands:
    - npm run test:ci-lanes
  expectedChecks:
    - Governance Validate
  exactHeadRequired: true
approval:
  required: true
  authorizationPolicyDigest: "0606060606060606060606060606060606060606060606060606060606060606"
withdrawal:
  unmerged: close_draft_pr
  merged: separate_inverse_pr
  receiptMode: append_only
retry:
  attempt: 0
  budget: 1
createdAt: 2026-07-15T20:00:00.000Z
expiresAt: 2026-07-16T00:00:00.000Z
planDigest: "0707070707070707070707070707070707070707070707070707070707070707"
```

Natural-language-only Repair Plans are invalid. Human-readable proposal text
may explain the plan, but execution eligibility is derived only from the
schema-valid envelope and its digest.

---

## Task 1: Contracts, Canonical Digests, And Existing Ledger Events

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Create: `server/services/governance/canonical-json.mjs`
- Create: `server/services/governance/governance-digests.mjs`
- Create: `server/services/governance/governance-contracts.mjs`
- Create: `schemas/failure-observation-v1.schema.json`
- Create: `schemas/repair-plan-v1.schema.json`
- Create: `schemas/governance-approval-v1.schema.json`
- Create: `schemas/governance-claim-v1.schema.json`
- Create: `schemas/repair-execution-receipt-v1.schema.json`
- Modify: `schemas/failure-attribution-v1.schema.json`
- Modify: `schemas/gate-ledger-v1.schema.json`
- Modify: `server/services/governance/gate-governance.mjs`
- Create: `server/tests/governance-contracts.test.mjs`
- Modify: `server/tests/gate-governance.test.mjs`

**Consumes:** the exact merged #499 ledger/router contracts.
**Produces:** canonical parsing, domain-separated digests, closed protocol
schemas, and ledger event validation for approval/claim/execution evidence.

### Step 1: Write the failing canonicalization and domain tests

Add tests equivalent to:

```js
test('canonical JSON rejects duplicate keys', () => {
  assert.throws(
    () => parseCanonicalJson(
      Buffer.from('{"planId":"one","planId":"two"}', 'utf8')
    ),
    (error) => error.code === 'duplicate_json_key'
  );
});

test('the same payload cannot cross protocol domains', () => {
  const payload = { id: 'same-bytes' };
  assert.notEqual(
    digestGovernanceRecord('OBSERVATION:v1\0', payload),
    digestGovernanceRecord('PLAN:v1\0', payload)
  );
});
```

Run:

```powershell
node --test server/tests/governance-contracts.test.mjs
```

Expected RED: module-not-found or missing-export failure for
`canonical-json.mjs` or `governance-digests.mjs`.

### Step 2: Implement the minimum canonical parser and digest API

Export exactly:

```js
export function parseCanonicalJson(sourceBytes) {}
export function canonicalJsonBytes(value) {}
export function digestGovernanceRecord(domain, value) {}
export const GOVERNANCE_DIGEST_DOMAINS = Object.freeze({});
```

Use SHA-256 and return lowercase 64-character hexadecimal digests. Do not use
ordinary `JSON.stringify()` as the canonical contract. Objects sort keys by
Unicode code point; arrays preserve order; non-finite numbers, `undefined`,
symbols, functions, duplicate keys, invalid UTF-8, and lone surrogates fail.
`parseCanonicalJson()` accepts only `Buffer` or `Uint8Array`. Add exact RED then
GREEN cases for `Buffer.alloc(0)`, UTF-8 BOM bytes, `Buffer.from([0xc3, 0x28])`,
negative zero, and the scalar-key ordering of `\uE000` versus `\u{1F600}`.

### Step 3: Add failing schema and transition tests

Cover:

- unknown properties;
- schema downgrade;
- `failureRisk` rejected and `technicalImpact` required;
- approval events `recorded`, `rejected`, `withdrawn`, `expired`, and
  `invalidated`;
- claim evidence and approval-consumption receipt ordering;
- historical event rewrite and event reordering;
- an `execution_started` receipt event that does not become a Gate transition.

Run:

```powershell
node --test server/tests/governance-contracts.test.mjs server/tests/gate-governance.test.mjs
```

Expected RED: new schema/event fixtures are rejected for missing support, while
the explicit invalid fixtures fail for the asserted reason codes.

### Step 4: Implement closed schemas and integrate with the existing ledger

Extend only the merged #499 validator. Do not create a second ledger module or
router. Approval state is derived from ordered immutable events:

```text
recorded -> consumed
recorded -> withdrawn
recorded -> expired
recorded -> invalidated
proposal_pending -> approval_rejected event -> invalidated(reason=rejected)
```

`approval_rejected` is an immutable input event, not a sixth derived state. It
derives the frozen `invalidated` state with reason `rejected`, is terminal for
that proposal/plan pair, and can never be followed by `approval_consumed`. A
later approval requires a new immutable approval event; rejection is not
rewritten into approval.

`consumed`, `withdrawn`, `expired`, and `invalidated` are terminal for that
approval identity. A later action requires a new approval event.

### Step 5: Verify and commit

Run:

```powershell
node --test server/tests/governance-contracts.test.mjs server/tests/gate-governance.test.mjs
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
git diff --check origin/master...HEAD
```

Expected GREEN: all tests and checks pass; only the listed files are changed.
Commit once with:

```powershell
git add server/services/governance/canonical-json.mjs server/services/governance/governance-digests.mjs server/services/governance/governance-contracts.mjs schemas/failure-observation-v1.schema.json schemas/repair-plan-v1.schema.json schemas/governance-approval-v1.schema.json schemas/governance-claim-v1.schema.json schemas/repair-execution-receipt-v1.schema.json schemas/failure-attribution-v1.schema.json schemas/gate-ledger-v1.schema.json server/services/governance/gate-governance.mjs server/tests/governance-contracts.test.mjs server/tests/gate-governance.test.mjs
git commit -m "feat: add governed repair machine contracts"
```

Stop after the commit and exact-head checks. Do not begin Task 2.

---

## Task 2: Read-only Failure Observation And Attribution

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Create: `server/services/governance/failure-observer.mjs`
- Create: `server/services/governance/failure-attributor.mjs`
- Create: `server/tests/governance-observation-attribution.test.mjs`
- Create: `server/tests/fixtures/governed-repair/redacted-failure-run.json`

**Consumes:** Task 1 canonical contracts and merged #499 routing taxonomy.
**Produces:** immutable Failure Observation Records and reproducible
Attribution Results. It writes nothing to GitHub or the repository.

### Step 1: Write failing Observation tests

The record must bind:

```yaml
schemaVersion: "1"
observationId: observation-example-001
repository: gccwebos-com/proxy-gateway-minimal
workflow:
  name: CI
  path: .github/workflows/ci.yml
  trustedWorkflowSha: "1111111111111111111111111111111111111111"
  permissionsDigest: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
authority:
  observerVersion: observer/v1
  observerBinaryDigest: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  sourceAuthorityDigest: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
run:
  id: 10001
  attempt: 2
  event: workflow_run
  checkName: Validate
  conclusion: failure
source:
  headSha: "2222222222222222222222222222222222222222"
  baseSha: "3333333333333333333333333333333333333333"
  treeSha: "4444444444444444444444444444444444444444"
runner:
  os: Linux
  image: ubuntu-24.04
evidence:
  logDigest: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
  artifactDigests: []
  redactionPolicyDigest: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
observedAt: 2026-07-15T20:00:00.000Z
observationUsabilityExpiry: 2026-07-16T00:00:00.000Z
recordDigest: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
```

Test missing exact head, workflow identity, observer identity, or evidence
digest. Test that a secret canary and prompt-injection sentence do not appear in
the serialized record.

Run:

```powershell
node --test server/tests/governance-observation-attribution.test.mjs
```

Expected RED: missing `failure-observer.mjs` export.

### Step 2: Implement `createFailureObservation()`

Export exactly:

```js
export function createFailureObservation(input) {}
```

The function accepts already-redacted structured evidence, never raw logs. It
returns the deeply frozen closed record. Expiry limits future repair usability;
it does not erase or invalidate the historical observation.
The returned record's `recordDigest` is the value referenced as
`observationDigest` by downstream Attribution; no extra field is appended to
the closed Observation envelope.

Invalid or incomplete identity throws `GovernanceContractError` with a closed
contract code. Evidence-complete input returns the exact Observation envelope,
not a loosely shaped wrapper.

### Step 3: Write failing Attribution tests

Export target:

```js
export function attributeFailure(observation, classifier) {}
```

The return shape is `{ record, attributionDigest }`. `record` is the exact
closed Attribution envelope below; `attributionDigest` is the domain-separated
digest consumed by the Repair Plan and is not injected as an extra schema
field.

Required output fields:

```yaml
observationDigest: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
classifierVersion: attribution/v1
classifierRulesDigest: "0101010101010101010101010101010101010101010101010101010101010101"
classifierMode: deterministic
category: execution_transport
reasonCode: shell_argument_binding
technicalImpact:
  - process_invocation_not_started
confidence: high
affectedInvariants:
  - selected_executable_identity
evidenceRefs:
  - observation-example-001
decisionReason:
  category: deterministic_rule_match
  blockers: []
  missingEvidence: []
```

Tests must prove Attribution never emits `governanceRisk`, `approvalRequired`,
`allowedFiles`, `allowedDelta`, or execution authority. Conflicting, missing,
unsupported, assisted-only, or prompt-injected evidence always emits
`category: unknown` with `classifierMode: unknown`; only the downstream Router
or Planner may decide `abstain`.

### Step 4: Implement deterministic and assisted boundaries

`classifierMode` is one of `deterministic`, `assisted`, or `unknown`.
Deterministic rules must be versioned and digest-bound. Assisted output can
explain evidence but cannot upgrade eligibility or confidence beyond the
deterministic evidence. Governance risk remains a Router result.

### Step 5: Verify and commit

Run:

```powershell
node --test server/tests/governance-observation-attribution.test.mjs server/tests/governance-contracts.test.mjs server/tests/gate-governance.test.mjs server/tests/execution-contract.test.mjs
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
git diff --check origin/master...HEAD
```

Expected GREEN: all tests pass; no network or GitHub write is performed.
Commit once:

```powershell
git add server/services/governance/failure-observer.mjs server/services/governance/failure-attributor.mjs server/tests/governance-observation-attribution.test.mjs server/tests/fixtures/governed-repair/redacted-failure-run.json
git commit -m "feat: add governed failure observation and attribution"
```

Stop after exact-head checks. Do not begin Task 3.

---

## Task 3: Repair Plan, Short Approval, And Provenance Verification

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Create: `schemas/governance-authorization-policy-v1.schema.json`
- Create: `project-state/governance-authorization-policy.json`
- Create: `server/services/governance/approval-command.mjs`
- Create: `server/services/governance/provenance-verifier.mjs`
- Create: `server/services/governance/repair-planner.mjs`
- Create: `server/tests/governance-repair-plan-provenance.test.mjs`
- Modify: `scripts/check-project-state.mjs`

**Consumes:** immutable Observation, Attribution, shared Router decision, policy
and ledger state.
**Produces:** schema-valid Repair Plans, human-readable proposal rendering,
short approval events, and a pure provenance verdict. It publishes nothing.

### Step 1: Write failing planner tests

Export exactly:

```js
export function createRepairPlan(input) {}
export function renderSuccessorProposal(plan) {}
```

`createRepairPlan()` returns exactly one of:

```js
{ decision: 'proposal_ready', decisionReason: Object.freeze({}), plan: Object.freeze({}) }
{ decision: 'operator_escalation', decisionReason: Object.freeze({}), plan: null }
{ decision: 'abstain', decisionReason: Object.freeze({}), plan: null }
{ decision: 'no_repair', decisionReason: Object.freeze({}), plan: null }
```

`renderSuccessorProposal()` returns
`{ planId, planDigest, machineEnvelope, humanSummary }`; it has no connector or
network dependency.

Planner decisions are exactly:

```text
proposal_ready
operator_escalation
abstain
no_repair
```

Risk A, `unknown`, low confidence, protected scope, policy conflict, scope
expansion, expired evidence, and exhausted retry budget cannot produce
`proposal_ready`. A B-tier workflow-only plan fixes `retry.attempt: 0` and
`retry.budget: 1`. The plan contains `approval.required: true` and the
authorization-policy digest, but no approver identity, approval comment, or
approval event before approval occurs.

Run:

```powershell
node --test server/tests/governance-repair-plan-provenance.test.mjs
```

Expected RED: missing planner module or export.

### Step 2: Implement schema-valid Repair Plans

Separate `validationBase` from `mutationTarget`. Bind canonical patch digest,
patch size, allowed files, semantic constraints, transport contracts, trusted
validator SHA, expected checks, policy version, parent receipt, retry lineage,
expiry, and every forbidden action. A rendered proposal contains both the
machine envelope and a readable explanation; only the envelope is authoritative.

### Step 3: Write failing short-approval tests

Accepted commands are exactly:

```text
/repair approve proposal=123456 plan=repair-plan-example-001
/repair reject proposal=123456 plan=repair-plan-example-001
/repair withdraw proposal=123456 plan=repair-plan-example-001
```

Export:

```js
export function parseApprovalCommand(text) {}
export function deriveApprovalState(events) {}
```

The parser returns
`{ action, proposalCommentId, planId, normalizedCommand }`. Derived state is one
of `recorded_not_consumed`, `consumed`, `withdrawn`, `expired`, or
`invalidated`, with the terminal event ID, digest, and reason. An
`approval_rejected` event derives `invalidated` with reason `rejected`. The
derivation never edits an input event.

Reject extra tokens, edits, duplicates, replay, wrong proposal or plan, stale
actor role, missing actor node ID, and a comment whose `createdAt` differs from
`updatedAt`. Bind `approvalCommentDigest`, actor node ID, team, role, created
time, plan digest, and policy digest.

The closed approval event envelope is:

```yaml
schemaVersion: "1"
eventType: approval_recorded
decision: approve
proposalCommentId: "123456"
proposalCommentDigest: "1111111111111111111111111111111111111111111111111111111111111111"
proposalCreatedAt: 2026-07-15T20:00:00.000Z
proposalUpdatedAt: 2026-07-15T20:00:00.000Z
proposalProvenanceDigest: "2222222222222222222222222222222222222222222222222222222222222222"
planId: repair-plan-example-001
planDigest: "3333333333333333333333333333333333333333333333333333333333333333"
approvalCommentId: "123457"
approvalCommentDigest: "4444444444444444444444444444444444444444444444444444444444444444"
actorIdentity:
  userId: MDQ6VXNlcjE=
  teamDigest: "5555555555555555555555555555555555555555555555555555555555555555"
  role: release-operator
authorizationPolicyDigest: "6666666666666666666666666666666666666666666666666666666666666666"
decidedAt: 2026-07-15T20:01:00.000Z
effectiveUntil: 2026-07-16T00:00:00.000Z
approvalDigest: "7777777777777777777777777777777777777777777777777777777777777777"
```

Reject and withdraw use the same fields with their exact `eventType` and
`decision`; they do not reuse or mutate the approval event.

### Step 4: Write failing provenance tests

Export:

```js
export function verifyGovernanceProvenance(input) {}
```

Success is `{ ok: true, code: 'provenance_verified', value: {
provenanceDigest } }`. Every expected mismatch returns
`{ ok: false, code: 'provenance_mismatch', details: { mismatchedFields } }`.

The verifier must reject mismatched observation, attribution, proposal,
approval, parent receipt, exact head, frozen identity, policy version/digest,
lineage, expiry, actor authority, or retry attempt. A valid verdict carries no
mutation or approval-consumption capability.

### Step 5: Implement and verify

Run:

```powershell
node --test server/tests/governance-repair-plan-provenance.test.mjs server/tests/governance-observation-attribution.test.mjs server/tests/governance-contracts.test.mjs server/tests/gate-governance.test.mjs
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
git diff --check origin/master...HEAD
```

Expected GREEN: all tests pass and authorization policy validation is part of
`project-state:check`. Commit once:

```powershell
git add schemas/governance-authorization-policy-v1.schema.json project-state/governance-authorization-policy.json server/services/governance/approval-command.mjs server/services/governance/provenance-verifier.mjs server/services/governance/repair-planner.mjs server/tests/governance-repair-plan-provenance.test.mjs scripts/check-project-state.mjs
git commit -m "feat: add repair planning and provenance verification"
```

Stop after exact-head checks. Do not begin Task 4.

---

## Task 4: Pure Pre/Post-Claim Admission With Synthetic Claim State

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Create: `server/services/governance/claim-envelope.mjs`
- Create: `server/services/governance/claim-capability-verifier.mjs`
- Create: `server/services/governance/repair-admission.mjs`
- Create: `server/tests/governance-repair-admission.test.mjs`

**Consumes:** Task 3 provenance verdict, immutable approval events, policy,
workflow identity, and injected claim-store evidence.
**Produces:** pure pre-claim and post-claim decisions and a canonical Claim
envelope. No real tag writer or `contents: write` permission exists.

### Step 1: Write failing pre-claim tests

Export:

```js
export function evaluatePreClaimAdmission(input) {}
export function buildClaimEnvelope(input) {}
```

Success returns `{ ok: true, code: 'preclaim_admitted', value: {
admissionDigest } }`; expected denial uses the shared tagged-result contract.
No returned value contains a GitHub credential or a mutation callback.

Required pre-claim predicates include exact Observation, Attribution, Plan,
approval, policy, parent receipt, head, frozen identity, expiry, workflow path,
workflow SHA, permission digest, expected App ID, retry budget, and capability
proof. Any unknown predicate denies Admission.

Run:

```powershell
node --test server/tests/governance-repair-admission.test.mjs
```

Expected RED: missing Admission module.

### Step 2: Implement the immutable Claim envelope

The Claim binds plan ID/digest, approval digest, owner run ID/attempt, expected
App ID, exact head, policy digest, acquired time, and claim namespace identity.
No module in this task creates a Git ref or calls GitHub.

The closed synthetic Claim envelope is:

```yaml
schemaVersion: "1"
claimId: governance-claim-repair-plan-example-001
claimNamespace: refs/tags/governance-claim/
planId: repair-plan-example-001
planDigest: "1111111111111111111111111111111111111111111111111111111111111111"
approvalDigest: "2222222222222222222222222222222222222222222222222222222222222222"
policyDigest: "3333333333333333333333333333333333333333333333333333333333333333"
mutationTarget: "4444444444444444444444444444444444444444"
owner:
  runId: 10002
  runAttempt: 1
expectedAppId: "15368"
capabilityProofDigest: "5555555555555555555555555555555555555555555555555555555555555555"
acquiredAt: 2026-07-15T20:02:00.000Z
claimDigest: "6666666666666666666666666666666666666666666666666666666666666666"
```

### Step 3: Write claim-race and lost-response tests

Using an injected in-memory claim store, prove:

- two runners cannot both become winner;
- claim owner and digest are immutable;
- approval withdrawal between pre-claim and post-claim denies execution;
- lost create response requires exact readback;
- missing, replaced, deleted, or ambiguous claim becomes
  `reconciliation_required`;
- ruleset or bypass capability drift denies execution;
- unknown claim state never becomes `mutation: none`.

### Step 4: Implement post-claim Admission

Export:

```js
export function evaluatePostClaimAdmission(input) {}
```

Success returns `{ ok: true, code: 'postclaim_admitted', value: {
admissionDigest, claimDigest, approvalConsumptionReceiptDigest } }`. Missing or
ambiguous Claim/receipt readback returns `{ ok: false, code:
'reconciliation_required', details: { mutationMayHaveOccurred: true } }`.

Post-claim Admission rechecks every stable identity, the exact Claim envelope,
the unique durable approval-consumption receipt, and the capability proof. It
does not consume approval itself and does not invoke an Executor.

### Step 5: Verify and commit

Run:

```powershell
node --test server/tests/governance-repair-admission.test.mjs server/tests/governance-repair-plan-provenance.test.mjs server/tests/governance-contracts.test.mjs server/tests/gate-governance.test.mjs
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
git diff --check origin/master...HEAD
```

Expected GREEN: all synthetic races are deterministic; no network request or
repository mutation occurs. Commit once:

```powershell
git add server/services/governance/claim-envelope.mjs server/services/governance/claim-capability-verifier.mjs server/services/governance/repair-admission.mjs server/tests/governance-repair-admission.test.mjs
git commit -m "feat: add governed repair admission contracts"
```

Stop after exact-head checks. A real claim writer remains absent.

---

## Task 5: Disabled Bounded Executor Contract

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Create: `server/services/governance/git-change-evidence.mjs`
- Create: `server/services/governance/bounded-repair-executor.mjs`
- Create: `server/tests/bounded-repair-executor.test.mjs`

**Consumes:** an already verified Admission decision and an injected test
adapter.
**Produces:** before/after tree evidence, actual-diff validation, and a disabled
executor result. There are no registered write adapters, category-specific
semantic validators, or workflow callers.

Required static state:

```yaml
registered_write_adapters: 0
registered_semantic_validators: 0
workflow_callers: 0
automatic_execution: disabled
```

### Step 1: Write failing disabled-state tests

Export:

```js
export function collectGitChangeEvidence(input) {}
export function validateActualRepairDelta(plan, evidence) {}
export function executeBoundedRepair(input) {}
```

`collectGitChangeEvidence()` returns the closed before/after tree and blob
evidence. `validateActualRepairDelta()` returns the shared tagged result.
`executeBoundedRepair()` returns exactly one of `executor_disabled`,
`validation_rejected`, `execution_succeeded`, or
`reconciliation_required`; only the fake test adapter paired with an injected
test-only semantic validator can reach `execution_succeeded` in this phase.
Production registration remains zero for both adapters and validators.

Without an injected test adapter, `executeBoundedRepair()` must return
`executor_disabled` before any mutation attempt.

Run:

```powershell
node --test server/tests/bounded-repair-executor.test.mjs
```

Expected RED: missing executor module.

### Step 2: Add temporary-repository failure tests

Test and reject:

- changed files outside `allowedFiles`;
- symlinks, mode changes, renames, binary files, untracked files, and submodules;
- changed command-intent, stdout, stderr, exit-code, working-directory, or
  environment contract digest;
- stale head, dirty index, policy drift, provenance drift, timeout, and output
  overflow;
- ambiguous post-mutation state.

### Step 3: Implement exact change evidence

Evidence includes:

```yaml
beforeTreeDigest: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
afterTreeDigest: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
changedBlobList:
  - path: .github/workflows/example.yml
    beforeBlob: "1111111111111111111111111111111111111111"
    afterBlob: "2222222222222222222222222222222222222222"
actualFilesSubsetOfAllowed: true
```

Use `server/services/execution-contract.mjs` for shell-free, byte-preserving,
bounded process execution. Do not duplicate its executable-resolution logic.

This foundation PR does not implement a YAML parser or workflow-semantic
validator. `validateActualRepairDelta()` performs structural Git evidence and
transport-contract checks, then returns
`{ ok: false, code: 'semantic_validator_unavailable' }` for every workflow
source delta because `registered_semantic_validators` is zero. It must not use
regular expressions as a substitute for YAML semantics. A closed workflow
patch grammar and trusted semantic validator belong to the later
workflow-adapter plan.

### Step 4: Implement only a fake-adapter execution seam

Tests may inject an in-memory or temporary-repository adapter. Production code
must contain no GitHub adapter, CLI entry point, workflow caller, branch
publisher, commit/push logic, or PR creation logic.

If mutation may have occurred and verification is incomplete, return:

```yaml
result: unknown
mutation_may_have_occurred: true
canonical_result: unavailable
reconciliation_required: true
```

Never normalize this state to `mutation: none`.

### Step 5: Verify and commit

Run:

```powershell
node --test server/tests/bounded-repair-executor.test.mjs server/tests/governance-repair-admission.test.mjs server/tests/execution-contract.test.mjs server/tests/governance-contracts.test.mjs
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
git diff --check origin/master...HEAD
```

Expected GREEN: all adversarial temporary-repository cases pass and the static
disabled-state assertion remains true. Commit once:

```powershell
git add server/services/governance/git-change-evidence.mjs server/services/governance/bounded-repair-executor.mjs server/tests/bounded-repair-executor.test.mjs
git commit -m "feat: add disabled bounded repair executor contract"
```

Stop after exact-head checks. Do not register an adapter.

---

## Task 6: Read-only GitHub Actions Shadow Routing

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Create: `.github/workflows/governance-repair-shadow.yml`
- Create: `schemas/governance-shadow-evidence-v1.schema.json`
- Create: `schemas/governance-shadow-dataset-v1.schema.json`
- Create: `scripts/build-governance-shadow-evidence.mjs`
- Create: `scripts/evaluate-governance-shadow.mjs`
- Create: `server/tests/governance-shadow-workflow.test.mjs`
- Modify: `server/tests/ci-workflow-contract.test.mjs`
- Modify: `package.json`

**Consumes:** canonical public GitHub run/check metadata and merged framework
modules.
**Produces:** a redacted, run-scoped diagnostic artifact and job summary. It
does not publish a durable proposal, approval, Gate receipt, check, Issue
comment, branch, commit, or PR.

The evidence schema has the closed root fields `schemaVersion`, `repository`,
`workflowIdentity`, `run`, `source`, `observationDigest`,
`attributionDigest`, `policyDigest`, `routerDecision`, `plannerDecision`,
`proposalDigest`, `shadowResult`, `reasonCodes`, `createdAt`, and
`recordDigest`. The dataset schema contains a bounded evaluation window and an
array derived from canonical shadow-workflow run inventory. Every row always
includes repository, workflow SHA, run ID, run attempt, nullable
`artifactDigest`, `parseStatus: valid | invalid | unparseable | missing`, a
nullable parsed evidence identity, and one Operator assessment from
`accepted_without_rewrite`, `rewrite_required`, `escalated`, or
`not_eligible`. A failed builder or missing upload therefore produces a
`missing` row from Actions readback and remains in the parseability denominator
instead of disappearing before evaluation.

### Step 1: Write the failing workflow contract test

The test must assert the workflow has explicit top-level permissions no wider
than:

```yaml
permissions:
  actions: read
  contents: read
  issues: read
  pull-requests: read
```

It must reject `contents: write`, `issues: write`, `pull-requests: write`,
`checks: write`, `id-token: write`, secrets, PATs, cache usage, unpinned Actions,
candidate workflow execution, candidate Action execution, and candidate code
execution.

Run:

```powershell
node --test server/tests/governance-shadow-workflow.test.mjs server/tests/ci-workflow-contract.test.mjs
```

Expected RED: workflow missing.

### Step 2: Implement the trusted-base evidence builder

`scripts/build-governance-shadow-evidence.mjs` treats `GITHUB_EVENT_PATH` as an
untrusted complete event payload. It parses it as data, projects only a closed
allowlist into a redacted in-memory input, and never persists or echoes the raw
payload. It prints one schema-valid shadow result that binds
`github.workflow_ref`, `github.workflow_sha`, run ID, attempt, repository,
candidate exact head, observer identity, classifier version, policy digest, and
the trusted script blob digest. It never accepts raw log content.

`shadowResult` is exactly `proposal_candidate`, `operator_escalation`,
`abstain`, or `no_repair`. The builder exits `0` for all schema-valid outcomes,
including `abstain`; malformed or unverifiable transport exits non-zero after
writing no evidence file. `proposalDigest` is `null` unless the Planner returns
`proposal_ready`.

### Step 3: Add abstention and injection tests

The workflow must output `abstain` when canonical provenance cannot be read,
digests conflict, evidence is incomplete, policy is stale, or the input carries
prompt-injection content. Upstream artifacts are untrusted inputs and are
revalidated; they never grant execution or proposal-publication authority.

### Step 4: Add the exact read-only workflow

Implement this trigger, permission, and job shape exactly; later pin changes
require a separate reviewed dependency update:

```yaml
name: Governance Repair Shadow

on:
  workflow_run:
    workflows:
      - CI
    types:
      - completed
  workflow_dispatch:

permissions:
  actions: read
  contents: read
  issues: read
  pull-requests: read

concurrency:
  group: governance-repair-shadow-${{ github.event.workflow_run.id || github.run_id }}
  cancel-in-progress: false

jobs:
  shadow:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - name: Checkout trusted workflow source
        uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: ${{ github.workflow_sha }}
          persist-credentials: false
          fetch-depth: 1
      - name: Build redacted shadow evidence
        shell: bash
        run: >-
          node scripts/build-governance-shadow-evidence.mjs
          --event-file "$GITHUB_EVENT_PATH"
          --output "$RUNNER_TEMP/governance-shadow.json"
          --summary "$RUNNER_TEMP/governance-shadow.md"
      - name: Publish run-scoped diagnostic artifact
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: governance-repair-shadow-${{ github.run_id }}-${{ github.run_attempt }}
          path: ${{ runner.temp }}/governance-shadow.json
          if-no-files-found: error
          retention-days: 21
      - name: Append sanitized summary
        shell: bash
        run: cat "$RUNNER_TEMP/governance-shadow.md" >> "$GITHUB_STEP_SUMMARY"
```

`workflow_dispatch` without a complete source run produces `abstain`. The
checkout is the exact trusted workflow SHA, never the candidate head. The
event file is parsed as data; no event field is interpolated into a command.
Artifact retention exceeds the 14-day evaluation window but is still
diagnostic transport, not a durable Gate receipt or release artifact.

### Step 5: Verify and commit

Run:

```powershell
node --test server/tests/governance-shadow-workflow.test.mjs server/tests/ci-workflow-contract.test.mjs server/tests/governance-observation-attribution.test.mjs server/tests/governance-repair-plan-provenance.test.mjs
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
git diff --check origin/master...HEAD
```

Expected GREEN: all workflow contract tests pass; the workflow has no write
surface. Commit once:

```powershell
git add .github/workflows/governance-repair-shadow.yml schemas/governance-shadow-evidence-v1.schema.json schemas/governance-shadow-dataset-v1.schema.json scripts/build-governance-shadow-evidence.mjs scripts/evaluate-governance-shadow.mjs server/tests/governance-shadow-workflow.test.mjs server/tests/ci-workflow-contract.test.mjs package.json
git commit -m "feat: add read-only governance repair shadow routing"
```

Stop after exact-head checks. Shadow output is advisory only.

---

## Task 7: Foundation Failure-injection Contract

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Create: `scripts/check-governed-repair-failure-injection.mjs`
- Create: `server/tests/governed-repair-failure-injection.test.mjs`
- Create fixtures under: `server/tests/fixtures/governed-repair/failure-injection/`
- Modify: `package.json`

**Consumes:** Tasks 1-6.
**Produces:** one machine-readable foundation threat-model result. This PR may
change tests and the validator only; it must not fix component implementation
failures discovered during injection. It does not claim the frozen design's
full Security Exit Criteria because real claim, publisher, exact-head, and
receipt adapters are absent.

### Step 1: Create a failing coverage manifest

The validator requires a fixture and deterministic assertion for every row in
the matrix below. Start with an empty manifest and run:

```powershell
node --test server/tests/governed-repair-failure-injection.test.mjs
```

Expected RED: missing required injection cases.

### Step 2: Add foundation P0 injection fixtures

Cover:

- token/secret canary exposure;
- workflow, validator, permission, expected-App, and trusted-SHA drift;
- candidate validator/executor self-attestation and direct-`master` write intent;
- silent secret-access, token-permission, or mutation-scope expansion;
- duplicate JSON keys, invalid UTF-8, schema downgrade, and cross-schema,
  cross-repository, cross-lineage, or cross-protocol-domain digest substitution;
- unauthorized or stale actor; edited, deleted, duplicate, or replayed approval;
- two-runner claim collision and approve/withdraw race;
- claim deletion, replacement, lost response, namespace/ruleset/bypass drift;
- candidate code/Action/workflow execution in a token-bearing job;
- wrong App/head/check evidence passed to pure Admission;
- symlink, mode, rename, binary, submodule, and untracked-file smuggling;
- prompt injection and raw secret material;
- unknown mutation incorrectly reported as no mutation.

### Step 3: Add foundation P1 injection fixtures

Cover:

- Unicode-confused approval and approval/plan/policy/evidence expiry;
- retry-budget reset by a successor;
- classifier mode or rules digest drift;
- proposal/receipt/lineage mismatch;
- correct artifact bytes from the wrong repository, run, attempt, or head;
- partial synthetic claim state treated as no mutation;
- stdout, stderr, exit-code, working-directory, environment, or command-intent
  contract drift;
- timeout, output overflow, runner cancellation before claim, after claim, and
  after a possible mutation;
- terminal receipt publication loss and exact readback reconciliation.

Add deterministic P2 abstention fixtures for comment/event spam, API rate
limits, pending-run replacement, Issue locking, evidence-retention loss, runner
clock drift, default-branch/App identity changes, and availability degradation.
These fixtures may only produce `abstain`, `blocked`, or
`operator_escalation`; they never increase authority.

All implemented-path cases in this task use inert fixtures, pure decision
modules, or the Task 5 fake adapter. They do not create a remote branch, tag,
commit, PR, check, or receipt.

The following frozen injections are recorded as
`activation_blocking_expected_unimplemented` and are excluded from the
foundation pass denominator:

- two real runners competing for the durable GitHub claim;
- claim create/delete/replace/recreate and ruleset/bypass drift against the
  real namespace;
- push or Draft PR success with a lost response;
- direct `master` write or Draft-PR bypass by a real publisher;
- a candidate modifying the real validator/executor and self-attesting;
- workflow YAML anchor, alias, expression, permission, environment, Action-ref,
  deploy, or semantic smuggling against the future trusted semantic validator;
- artifact bytes matching while repository/run/attempt/head provenance differs;
- same-name wrong-App/old-head/non-success check acceptance;
- missing ordinary Draft checks and the trusted same-run exact-head fallback;
- pre-created branch, branch reuse, force-push, or changed PR base/head/Draft
  state;
- terminal durable receipt publication loss and remote reconciliation.

Fixtures may prove that absent adapters remain disabled, but they must not
claim that unimplemented remote behavior is secure. These cases become
required denominator entries in the later adapter/settings implementation
plan.

### Step 4: Implement the acceptance validator

The script outputs a redacted JSON summary with exact denominators and exits
non-zero unless all acceptance criteria hold:

```yaml
foundation_P0_injections_blocked: 100%
foundation_P1_injections_deterministic: 100%
unauthorized_mutations: 0
duplicate_executions: 0
secret_leakage: 0
unknown_reported_as_no_mutation: 0
Risk_A_auto_execution: 0
activation_blockers_unimplemented: 11
```

Any failure yields `changes_required`. Do not patch the failed component in
this PR; create a predecessor-bound successor Gate for that component.

### Step 5: Verify and commit

Run:

```powershell
node --test server/tests/governed-repair-failure-injection.test.mjs server/tests/governance-contracts.test.mjs server/tests/governance-observation-attribution.test.mjs server/tests/governance-repair-plan-provenance.test.mjs server/tests/governance-repair-admission.test.mjs server/tests/bounded-repair-executor.test.mjs server/tests/governance-shadow-workflow.test.mjs server/tests/gate-governance.test.mjs server/tests/execution-contract.test.mjs server/tests/ci-workflow-contract.test.mjs
npm run governance:failure-injection
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
git diff --check origin/master...HEAD
```

Expected GREEN: all listed criteria are exact; no production or GitHub write is
attempted. Commit once:

```powershell
git add scripts/check-governed-repair-failure-injection.mjs server/tests/governed-repair-failure-injection.test.mjs server/tests/fixtures/governed-repair/failure-injection package.json
git commit -m "test: add governed repair foundation threat coverage"
```

Stop after exact-head checks. The foundation contracts are test-complete; the
full framework source implementation and write paths remain incomplete.

---

## Task 8: Read-only Shadow Evaluation Gate

**Risk:** C
**Expected PR count:** 0
**Production impact:** None

Run this only after Tasks 1-7 are independently merged. The Gate reads frozen
shadow outputs for at least 14 consecutive days and at least 20 eligible
failure events. It performs no rerun and writes no repository, Issue, PR,
check, settings, artifact-registry, provider, runtime, or production state.

The input is one `governance-shadow-dataset/v1` manifest whose universe is a
canonical read-only inventory of every matching shadow workflow run. Every row
binds repository, workflow SHA, run ID, run attempt, nullable `artifactDigest`,
and `parseStatus: valid | invalid | unparseable | missing`. Valid rows
additionally bind a non-null evidence `recordDigest`, source head, Observation
digest, observed time, eligibility result, Operator assessment, interaction
count, and optional rewrite reason. Other rows keep parsed evidence fields
`null`; `missing` covers builder failure or absent artifact. The unique run key
for every row is the canonical digest of:

```text
repository | workflowSha | runId | runAttempt
```

The additional event key for a valid row is the canonical digest of:

```text
repository | workflowSha | runId | runAttempt | sourceHead | observationDigest
```

Duplicate run keys are rejected rather than counted twice. Valid duplicate
event keys or non-null artifact digests are also rejected. An eligible event
must
have a schema-valid result, deterministic known B/C attribution, current policy
route, `proposal_ready`, unexpired evidence, no protected scope, and no
authority or identity drift. Fourteen days means the interval from the earliest
to latest unique eligible `observedAt` is at least 336 hours.

Acceptance denominators are fixed:

```yaml
minimum_observation_days: 14
minimum_eligible_events: 20
machine_parseable_shadow_results: ">=95%"
known_BC_attribution_coverage: ">=80%"
proposals_accepted_without_rewrite: ">=70%"
unauthorized_mutations: 0
Risk_A_auto_execution: 0
retry_budget_exceeded_without_escalation: 0
machine_parseable_durable_receipts: not_measured_no_writer
```

Metric denominators are fixed:

- `machine_parseable_shadow_results`: schema-valid unique results divided by
  all unique canonical run-inventory rows, including invalid, unparseable, and
  missing rows;
- `known_BC_attribution_coverage`: deterministic known B/C results divided by
  unique evidence-complete B/C-eligible events;
- `proposals_accepted_without_rewrite`: `accepted_without_rewrite` divided by
  `accepted_without_rewrite + rewrite_required`; escalated and ineligible
  records are reported separately, not removed silently;
- false-attribution rate: incorrect deterministic classifications divided by
  all manually audited deterministic classifications.

Run exactly once against the frozen manifest:

```powershell
node scripts/evaluate-governance-shadow.mjs --manifest "$env:RUNNER_TEMP\governance-shadow-dataset.json" --output "$env:RUNNER_TEMP\governance-shadow-evaluation.json"
```

Expected result: exit `0`, a schema-valid aggregate with all exact numerators
and denominators, no raw logs or sensitive material, and no network mutation.
Any parse, identity, denominator, expiry, or threshold failure produces a
blocked result and no retry under the same approval.

Also report:

- Operator interactions per failure;
- proposal rewrite reasons;
- false-attribution rate;
- shadow recovery recommendation precision;
- successor lineage depth;
- elapsed time from observation to terminal shadow result.

Passing this Gate records only:

```yaml
shadow_framework: evaluated
write_executor: disabled
activation_eligible: false
production: unchanged
```

It does not authorize Task 9, an executor adapter, settings, or activation.

---

## Task 9: Independent C-tier Project-state Synchronization

**Risk:** C
**Expected PR count:** 1
**Production impact:** None

After the actual merges and shadow receipt exist, synchronize only the existing
authorities:

- `project-state/current.json`
- `project-state/lanes.json`
- `project-state/tasks.json`
- `docs/CURRENT_RELEASE_STATE.md`
- `RELEASE_MANIFEST.md`
- `docs/PROJECT_CONTEXT.md`

Do not add `docs/governance/current-state.md` or another parallel snapshot.
Record merged identities and distinguish source implementation from disabled
or absent capabilities.

Required final state:

```yaml
merged:
  gate_ledger_and_router: true
  repair_machine_contracts: true
  failure_observation_and_attribution: shadow_only
  repair_planner_and_provenance: true
  pre_post_claim_admission: synthetic_only
  bounded_executor_contract: disabled
  actions_shadow_routing: read_only
  foundation_failure_injection: passed

not_enabled:
  - real_claim_writer
  - repair_branch_publisher
  - draft_PR_publisher
  - repository_settings_enforcement
  - write_executor
  - production_executor

production: unchanged
```

Run:

```powershell
npm run docs:authority:check
npm run project-state:check
git diff --check
git diff --check origin/master...HEAD
```

Expected result: all commands pass; only the six existing authority files are
changed. Commit once under a separately approved C-tier Gate.

## Traceability Matrix

| Frozen requirement | Implemented by | Proved by |
|---|---|---|
| Immutable, identity-bound Observation | Task 2 | Observation identity/digest/expiry tests |
| Attribution explains but grants no authority | Task 2 + #499 Router | forbidden-field and unknown-route tests |
| Fixed machine-readable Repair Plan | Task 3 | closed schema and digest tests |
| Short, immutable, one-time approval | Tasks 1 and 3 | parse/replay/edit/state-derivation tests |
| Parent receipt, policy, head, lineage proof | Task 3 | provenance mismatch matrix |
| Pre/post-claim separation | Task 4 | race, withdrawal, and lost-response tests |
| Exclusive claim capability contract required | Task 4 | synthetic capability drift tests; real proof remains absent |
| Structural Git diff is bounded; missing semantic validator blocks execution | Task 5 | temporary-repository structural tests and `semantic_validator_unavailable` |
| Unknown mutation fails closed | Tasks 4, 5, and 7 | reconciliation assertions |
| Actions begins in shadow/read-only mode | Task 6 | workflow permission contract tests |
| Shadow candidate data never executes with a write token | Tasks 6 and 7 | read-only permission and token-canary tests |
| No automatic Risk A execution | #499 + Tasks 3, 6, 7 | routing and failure-injection assertions |
| Retry budget cannot reset | #499 + Tasks 3 and 7 | immutable lineage tests |
| Foundation threat contracts are executable | Task 7 | machine-readable foundation result plus explicit activation blockers |
| Runtime truth remains separate | Task 9 | source-vs-enabled snapshot fields |

## Activation Is A Separate Future Program

Completion of this plan does not authorize or make eligible:

1. a real atomic GitHub claim writer;
2. an exclusive `contents: write` capability and claim-namespace ruleset;
3. a workflow repair adapter;
4. isolated branch creation, exactly-one-commit publication, or Draft PR
   creation;
5. a trusted exact-head validation publisher;
6. required checks, required reviews, conversation resolution, or environment
   reviewer settings;
7. artifact publication, deployment, rollback, provider, runtime, or
   production alignment.

Those require a new threat review and separate exact Gates. In particular, the
component that decides whether execution is allowed must not be changed in the
same approval window as the component that performs the write.

## Program Exit Criteria

This foundation implementation program is complete only when all of the
following are proven by merged exact identities and durable receipts:

```yaml
PR_499_compatible_and_merged: true
source_PRs_merged: 7
formal_reviews_passed: 7
exact_head_checks_passed: 7
shadow_evaluation_passed: true
project_state_synchronized: true
foundation_contracts_complete: true
full_framework_source_implementation_complete: false
frozen_security_exit_criteria_applicable: false

registered_write_adapters: 0
workflow_callers_to_executor: 0
automatic_execution: disabled
Risk_A_auto_execution: 0
unauthorized_mutations: 0
production: unchanged
```

If any value cannot be proven, the program remains incomplete. A failed or
unknown Gate produces a terminal receipt and a fresh successor proposal; it
never reuses consumed approval or silently retries.

## Execution Handoff

After this plan is reviewed and merged, choose one execution mode:

1. **Subagent-Driven (recommended):** execute one independently approved B-tier
   PR at a time, with a fresh subagent review after each task and an Operator
   boundary before the next Gate.
2. **Inline Execution:** execute one task per separately approved session using
   `superpowers:executing-plans`, stopping after its commit, exact-head checks,
   and terminal receipt.

Either mode begins only after PR #499 is compatibly reviewed and merged. This
plan itself starts no source work.
