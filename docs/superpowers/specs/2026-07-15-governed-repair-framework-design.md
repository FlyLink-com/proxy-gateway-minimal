# Governed Repair Framework Design

Last updated: 2026-07-15, America/Los_Angeles.

> Status:
> - Design state: Frozen after five-part architecture, protocol,
>   authorization, execution, and threat-model review
> - Risk: C for this design document; follow-up source implementation is B;
>   write-executor activation, repository settings, and trust-root enforcement
>   require separate exact Risk A Gates
> - Source baseline: `master@0066a0be8246c75f9c3e565ec0d5db28afe7dcb7`
> - Candidate dependency: PR #499 at
>   `38ab085abca2699588811d39edbb7c36e02ea35c` remains Open/Draft and is not
>   trusted source until independently reviewed and merged
> - Production impact: None
> - Execution authority: None. This document does not authorize source,
>   workflow, GitHub settings, artifact, provider, credential, runtime,
>   deployment, promotion, rollback, Ready, or merge actions.

## Goal

Build an AI-assisted release-governance repair loop that reduces Operator
interruptions without granting AI approval, merge, deployment, or production
authority.

The framework turns immutable failure evidence into a bounded repair proposal,
requires an independently verified human approval, executes one approved
workflow-only change in an isolated branch, creates a Draft PR, validates it
with trusted-base code, and records append-only evidence.

The governing responsibility split is:

```text
AI       -> observe, classify, and propose
Policy   -> route and enforce the risk floor
Human    -> authorize the exact Repair Plan
Machine  -> admit and execute one bounded change
Ledger   -> preserve immutable evidence
```

## Non-goals

Phase 1 does not provide:

- direct writes to `master`;
- automatic Ready, merge, check rerun, deployment, promotion, rollback, or
  production repair;
- generic application-code, test-contract, dependency, or security autofix;
- credential, provider, OIDC, environment-secret, runtime, or customer-data
  access;
- a second Gate ledger, repair router, business-state database, queue,
  workflow engine, or microservice;
- trust in candidate workflow code, candidate Actions, upstream artifacts, raw
  logs, or model confidence as execution authority.

The first source-mutation lane is workflow repair after one exact Operator
approval. It is distinct from the read-only, zero-file-delta recovery lane in
the existing Phase 1 roadmap. Neither lane inherits mutation authority from
PR #499.

## Authority And Document Relationship

This document is the architecture and machine-contract authority for the
Governed Repair Framework. It does not itself authorize implementation.

- `docs/superpowers/plans/2026-07-15-semi-automated-governance-phase1.md`
  remains the current implementation roadmap until a separately reviewed plan
  reconciles it with this frozen design.
- PR #499 is the candidate implementation of Gate Ledger v1, strict failure
  attribution, transition validation, retry budgets, and the shared Policy
  Router. This design reuses those components and does not create replacements.
- `docs/EXECUTION_CONTRACT_V1.md` remains the process-execution foundation.
- `docs/GITHUB_ISSUE_PR_WORKFLOW.md` remains the Issue, PR, and durable-evidence
  workflow authority.

## End-to-end Architecture

```text
Failure Event
  -> Failure Observation Record
  -> Attribution Engine
  -> shared #499 Policy Router
  -> Repair Planner
  -> trusted-base read-only validation
  -> Operator approval
  -> Provenance Verifier
  -> Executor Admission Controller
  -> Bounded Repair Executor
  -> isolated branch and Draft PR
  -> trusted-base exact-head validation
  -> append-only terminal receipt
```

No upstream result implies downstream authority. In particular, Attribution
does not grant repair authority, a Policy Router decision does not authenticate
approval provenance, and an upstream Actions artifact does not authorize a
write-token job.

## Component Boundaries

| Component | Responsibility | Forbidden responsibility |
| --- | --- | --- |
| Observer | Freeze one redacted failure-evidence object. | Classify risk, plan repair, or write the repository. |
| Attribution | Explain the technical cause and affected invariants. | Grant authority or select writable files. |
| Policy Router | Apply risk, path, confidence, retry, and escalation policy. | Authenticate GitHub actors or execute changes. |
| Repair Planner | Produce an exact digest-bound Repair Plan and proposal. | Approve, execute, merge, deploy, or expand scope. |
| Provenance Verifier | Verify actor, comment, plan, policy, lineage, head, and expiry. | Decide how to repair the failure. |
| Admission Controller | Atomically claim one valid approval and enforce all preconditions. | Generate or broaden a patch. |
| Bounded Executor | Apply one verified patch and create one Draft PR. | Retry, force-push, Ready, merge, deploy, or use candidate code as authority. |
| Trusted Validator | Validate the candidate with unchanged trusted-base code. | Accept candidate self-validation. |
| Ledger | Preserve append-only evidence and transitions. | Become business state or mutation authority. |

## Failure Observation Record

The Observer emits one canonical immutable object:

```yaml
schemaVersion: "1"
observationId: <safe-id>
repository: gccwebos-com/proxy-gateway-minimal
workflow:
  name: <workflow-name>
  path: <repository-path>
  trustedWorkflowSha: <full-sha>
  permissionsDigest: <sha256>
authority:
  observerVersion: <version>
  observerBinaryDigest: <sha256>
  sourceAuthorityDigest: <sha256>
run:
  id: <github-run-id>
  attempt: <positive-integer>
  event: <event-name>
  checkName: <check-name>
  conclusion: <conclusion>
source:
  headSha: <full-sha>
  baseSha: <full-sha>
  treeSha: <full-sha>
runner:
  os: <runner-os>
  image: <runner-image>
evidence:
  logDigest: <sha256>
  artifactDigests: []
  redactionPolicyDigest: <sha256>
observedAt: <canonical-timestamp>
observationUsabilityExpiry: <canonical-timestamp>
recordDigest: <domain-separated-sha256>
```

`observationUsabilityExpiry` limits use as a new Repair Plan input; it does not
erase or invalidate the historical failure fact. Raw logs, secrets, tokens,
credentials, complete GitHub payloads, and customer data are never stored in
the record or ledger.

A run, attempt, head, base, workflow identity, Observer identity, or evidence
change creates a new observation. Missing exact identity or evidence produces
an incomplete observation that can only route to abstain or Operator review.

## Attribution Contract

Failure Attribution v1 keeps PR #499's top-level category vocabulary. A
versioned `reasonCode` provides technical detail without creating a second
router.

Representative mappings are:

| Category | Allowed reason-code examples |
| --- | --- |
| `execution_transport` | `shell_argument_binding`, `encoding_mismatch`, `path_resolution`, `empty_output_type_loss`, `process_result_tokenization` |
| `ci_configuration` | `permission_contract`, `environment_contract`, `timeout_contract`, `retry_contract`, `artifact_retention_contract` |
| `test_fixture` | `obsolete_expectation`, `fixture_time_drift`, `platform_assumption` |
| `unknown` | `insufficient_evidence`, `conflicting_evidence`, `unsupported_failure` |

The result contains:

```yaml
observationDigest: <sha256>
classifierVersion: <version>
classifierRulesDigest: <sha256>
classifierMode: deterministic | assisted | unknown
category: <PR-499-category>
reasonCode: <versioned-reason-code>
technicalImpact: []
confidence: high | medium | low
affectedInvariants: []
evidenceRefs: []
decisionReason:
  category: <reason>
  blockers: []
  missingEvidence: []
```

Attribution does not output governance risk, approval, execution, writable
files, or mutation authority. The shared Policy Router derives governance risk
from the technical result, target path, capability boundary, protected scope,
policy, and retry lineage. Ambiguous or unsupported evidence produces
`category: unknown`.

## Planner Decision Model

The Planner can emit exactly four decisions:

```yaml
decision:
  - proposal_ready
  - operator_escalation
  - abstain
  - no_repair
```

It cannot emit `approved`, `execute`, `ready`, `merge`, or `deploy`.

A proposal requires a complete observation, a valid attribution, a current
Policy Router result, a current policy digest, and a frozen repository
identity. Workflow, Action, validator, policy, classifier, and other trust-root
paths have a minimum B risk floor even when the technical cause is a simple
transport failure.

## Repair Plan

The Repair Plan is immutable and is the only input accepted by Admission:

```yaml
schemaVersion: "1"
planId: <safe-id>
parentReceipt: <receipt-id>
observationDigest: <sha256>
attributionDigest: <sha256>
policyVersion: <version>
policyDigest: <sha256>
plannerVersion: <version>
repository: gccwebos-com/proxy-gateway-minimal
validationBase: <trusted-base-sha>
mutationTarget: <exact-target-sha>
frozenTree: <tree-sha>
frozenIdentityDigest: <sha256>
scope:
  allowedFiles: []
  allowedDelta: <versioned-delta-id>
  forbiddenDelta: []
  semanticConstraints: []
patch:
  encoding: canonical-unified-diff
  digest: <sha256>
  sizeBytes: <bounded-size>
transportContracts:
  commandIntentDigest: <sha256>
  stdoutContractDigest: <sha256>
  stderrContractDigest: <sha256>
  exitCodeContractDigest: <sha256>
  workingDirectoryDigest: <sha256>
  environmentContractDigest: <sha256>
validation:
  trustedValidatorSha: <full-sha>
  commands: []
  expectedChecks: []
  exactHeadRequired: true
approval:
  required: true
  authorizationPolicyDigest: <sha256>
withdrawal:
  unmerged: close_draft_pr
  merged: separate_inverse_pr
  receiptMode: append_only
retry:
  attempt: 0
  budget: 1
createdAt: <canonical-timestamp>
expiresAt: <canonical-timestamp>
planDigest: <domain-separated-sha256>
```

Approver identity is not embedded in the pre-approval plan. Approval is a
separate first-class event that binds the immutable `planDigest`. A head,
policy, validator, scope, patch, transport contract, or expiry change
invalidates the approval.

Phase 1 accepts only a small, canonical, plan-contained workflow patch. A patch
that exceeds the configured size, needs arbitrary code generation, or cannot
be expressed and verified as the approved semantic delta routes to Operator
review outside this executor.

## Domain-separated Digests

Every object uses canonical JSON with duplicate-key rejection and explicit
domain separation:

```text
OBSERVATION:v1\0<canonical-json>
ATTRIBUTION:v1\0<canonical-json>
PLAN:v1\0<canonical-json>
APPROVAL:v1\0<canonical-json>
CLAIM:v1\0<canonical-json>
EXECUTION:v1\0<canonical-json>
RECEIPT:v1\0<canonical-json>
```

The verifier binds object type, schema version, repository, lineage, subject,
and policy before comparing a digest. A digest valid in one domain cannot be
substituted into another domain.

## Operator Approval Protocol

The Operator uses a short structured command:

```text
/repair approve proposal=<comment-id> plan=<plan-id>
/repair reject proposal=<comment-id> plan=<plan-id>
/repair withdraw proposal=<comment-id> plan=<plan-id>
```

The Operator does not copy a long approval paragraph or SHA-256 value. The
Verifier resolves the proposal by immutable comment ID and plan ID, reads the
canonical plan, and recomputes the full digest.

The approval event records:

```yaml
schemaVersion: "1"
eventType: approval_recorded | approval_rejected | approval_withdrawn
decision: approve | reject | withdraw
proposalCommentId: <github-comment-id>
proposalCommentDigest: <sha256>
proposalCreatedAt: <canonical-timestamp>
proposalUpdatedAt: <canonical-timestamp>
proposalProvenanceDigest: <sha256>
planId: <safe-id>
planDigest: <sha256>
approvalCommentId: <github-comment-id>
approvalCommentDigest: <sha256>
actorIdentity:
  userId: <github-node-id>
  teamDigest: <sha256>
  role: <verified-role>
authorizationPolicyDigest: <sha256>
decidedAt: <canonical-timestamp>
effectiveUntil: <canonical-timestamp-or-null>
approvalDigest: <domain-separated-sha256>
```

The Verifier rejects edited, deleted, duplicate, replayed, expired, stale, or
unauthorized comments; an actor/team/role mismatch; a non-unique proposal and
approval pair; and a head, scope, policy, plan, or lineage mismatch.

Approval events are immutable. The validator derives
`recorded_not_consumed`, `consumed`, `withdrawn`, `expired`, or `invalidated`
from ordered `approval_recorded`, `approval_rejected`, `approval_withdrawn`,
`approval_consumed`, `approval_expired`, `approval_invalidated`, and claim
events;
it never edits an earlier approval event to change its state. The proposal
provenance digest reuses the canonical comment-identity envelope defined by
the existing Phase 1 roadmap.

## Approval Consumption And Durable Claim

Approval consumption is single-use and atomic. GitHub Actions concurrency is
only runner coordination and is not the source of truth for state correctness.

The initial implementation must provide an atomic create-if-absent claim with
an immutable claim owner and payload. The minimal GitHub-native design is a
namespaced annotated Git tag object plus an atomically created tag ref:

```text
refs/tags/governance-claim/<plan-id>
```

The annotated tag message contains the canonical Claim envelope, including the
run ID, plan, approval, policy, mutation target, lock owner, and consumed time.
Only one runner can create the claim ref. On a lost response, a runner reads
the ref and tag object back and proceeds only when the claim owner and every
digest match its own admission. Claim refs are never updated or deleted by the
framework. Creation authorization and immutability use independently audited
controls: a creation ruleset admits the repository's GitHub Actions App, while
a separate update/delete ruleset gives that App no bypass and freezes its empty
or explicitly approved bypass-set digest.

Phase 1 does not claim that generic `GITHUB_TOKEN` identity proves which job
created a ref. Instead, Admission requires a repository-wide exclusive claim
capability proof: the protected workflow path/SHA and DAG, the complete set of
jobs with `contents: write`, every such job's permission digest, and the only
allowed claim-namespace call site are enumerated and digest-bound. Canonical
Actions readback binds the trusted run and attempt; the Claim envelope's job
fields are cross-check data, not self-authentication. Any additional write
capability, call site, bypass actor, workflow drift, ref deletion, ref
replacement, or tag-object mismatch invalidates execution and requires
reconciliation. If the repository cannot prove atomic create-if-absent,
repository-wide claim-capability exclusivity, and irreversible namespace
protection, the write executor remains disabled.

The lifecycle is:

```text
approval_recorded
  -> final provenance readback
  -> atomic claim
  -> unique durable approval_consumed event
  -> bounded execution
```

A withdrawal before claim prevents execution. After claim, the approval stays
consumed. A withdrawal may close an unmerged Draft PR and append evidence, but
it does not erase the claim, commit, or receipt. A merged change requires a new
inverse Repair Plan and approval.

## Gate Ledger Reuse

Phase 1 reuses Gate Ledger v1 and its event vocabulary:

```text
predecessor:
terminal_blocked
  -> failure_attributed
  -> repair_routed
  -> successor_proposed

successor:
proposed
  -> approval_recorded
  -> approval_consumed
  -> terminal_passed | terminal_blocked
```

Observation, Repair Plan, Approval, Claim, and execution receipts are
digest-bound evidence for these events. `execution_started` remains an
execution-receipt event rather than a Gate transition. No Repair FSM or second
ledger is introduced.

Each transition remains one unique append-only durable Issue comment. The
claim does not substitute for the `approval_consumed` ledger event: claim
creation and exact readback happen first, then the unique consumption event is
published and read back before any repair/source mutation is admitted.

## GitHub Actions Runtime Architecture

The workflow layers and privileged job boundaries are:

```text
observe.yml
  -> plan-and-propose.yml
  -> approval-intake.yml
  -> repair-executor.yml / trusted-preflight job
  -> repair-executor.yml / read-only-admission job
  -> repair-executor.yml / claim-writer job
  -> repair-executor.yml / approval-consumption-receipt job
  -> repair-executor.yml / post-claim-admission job
  -> repair-executor.yml / bounded-publisher job
  -> repair-executor.yml / trusted-exact-head job
  -> repair-executor.yml / terminal-receipt job
```

Each workflow and privileged job records:

```yaml
workflowIdentity:
  workflowPath: <path>
  workflowSha: <full-sha>
  permissionsDigest: <sha256>
tokenScope:
  repository: gccwebos-com/proxy-gateway-minimal
  permissions: <canonical-permission-map>
  expires: <job-token-expiry-or-job-boundary>
```

Permissions are job-specific and fixed when each job starts; they are not
dynamically elevated inside a running job:

| Job | Exact Phase 1 repository permissions |
| --- | --- |
| Observer / Attribution / Planner | `actions: read`, `contents: read`, `issues: read`, `pull-requests: read`; all writes denied. |
| Proposal publisher | `issues: write`; repository-content, Actions, checks, and PR writes denied. |
| Approval intake / pre-claim and post-claim Admission | `actions: read`, `contents: read`, `issues: read`, `pull-requests: read`; all writes denied. Fresh team/role authority comes from the separately approved canonical GitHub connector/App boundary, not candidate input. |
| Trusted preflight | `actions: read`, `contents: read`, `issues: read`, `pull-requests: read`; all writes denied. |
| Claim writer | `actions: read`, `contents: write`, `issues: read`, `pull-requests: read`; its sole mutation is create-if-absent under the protected `refs/tags/governance-claim/` namespace. |
| Approval-consumption receipt publisher | `actions: read`, `contents: read`, `issues: write`, `pull-requests: read`; checks, contents, and PR writes denied. |
| Bounded publisher | `actions: read`, `contents: write`, `pull-requests: write`, `issues: read`; checks, environments, deployments, and Issue writes denied. |
| Trusted exact-head validator | `actions: read`, `checks: write`, `contents: read`, `issues: read`, `pull-requests: read`; contents, Actions, Issues, and PR writes denied. |
| Terminal receipt publisher | `actions: read`, `checks: read`, `contents: read`, `issues: write`, `pull-requests: read`; all other writes denied. |

No PAT, private key, long-lived token, OIDC, provider credential, environment
secret, or production credential is allowed. Checkout uses a pinned Action and
`persist-credentials: false`. Tokens never enter output, artifacts, cache,
logs, plans, or receipts.

Any job with a write token must not execute candidate checkout code, candidate
Actions, candidate workflows, upstream artifacts, candidate scripts,
submodules, hooks, package lifecycle scripts, or caches. Event fields are data
and are never interpolated directly into a shell command.

Read-only Admission and the Claim writer are separate jobs. The Claim writer
receives no candidate checkout and runs only the pinned trusted-base claim
client. Successful claim creation and exact readback are required inputs to a
later Executor job; the claim job itself cannot create a branch, commit, or PR.
The Claim writer, bounded publisher, exact-head validator, and terminal receipt
publisher freshly re-read and verify canonical GitHub evidence, their own
workflow identity, the policy and plan digests, and the exact predecessor state
before their sole permitted mutation. Proposal and approval-consumption
publishers verify a digest-bound envelope, append one new comment, and read
that exact comment back. No Issue comment alone grants execution authority.

## Executor Admission And Claim Controller

The read-only Admission job first requires:

```yaml
observationDigest_match: true
attributionDigest_match: true
planDigest_match: true
approvalDigest_match: true
policyDigest_match: true
trustedValidatorDigest_match: true
validationBase_match: true
mutationTarget_match: true
workflowIdentity_match: true
tokenScope_allowed: true
derivedApprovalState: recorded_not_consumed
expiry_valid: true
retry_budget_available: true
concurrency_lock_acquired: true
branch_absent: true
```

The Claim writer then repeats all canonical readbacks, verifies the read-only
Admission digest, atomically creates the protected claim, and reads back the
ref, annotated tag object, repository claim-capability proof, target, and
payload. A separate
approval-consumption receipt job then freshly reads the claim, appends exactly
one `approval_consumed` event comment, and reads back its unique comment ID and
digest. The post-claim Admission rechecks every stable identity, policy,
workflow, scope, branch, expiry, and retry predicate above, but replaces the
pre-claim approval predicate with:

```yaml
derivedApprovalState: consumed
durable_claim_created: true
exact_claim_ownership: true
approvalConsumptionReceiptDigest_match: true
```

The bounded publisher starts only after this post-claim predicate set passes.
A failed condition prevents the next privileged job from starting. A second
runner cannot infer ownership from Actions concurrency.

## Executor Forbidden Matrix

Phase 1 proposal eligibility is:

| Change | Disposition |
| --- | --- |
| Bounded `timeout-minutes` change | Proposal-first eligible. |
| Predeclared non-sensitive `env` value | Proposal-first eligible. |
| One-attempt retry policy | Proposal-first eligible. |
| Bounded artifact retention | Proposal-first eligible. |
| Shell, encoding, or path transport change | Eligible only when all transport-contract digests remain unchanged. |
| Permission reduction | Proposal-first eligible. |
| Permission increase | Operator and security escalation; not executable by the Phase 1 adapter. |
| Trigger, OIDC, secret, environment, deploy, provider, runtime, or production step | Forbidden. |
| New third-party Action or changed Action pin | Forbidden. |
| Candidate self-validation or candidate code in a write job | Forbidden. |
| Business source, dependency, schema, database, or production config | Forbidden. |

The Executor also rejects rename, copy, delete, binary change, symlink, file
mode change, generated/untracked file, path escape, YAML anchor semantic
smuggling, or any actual diff outside the exact plan.

## Branch, Commit, And Draft PR

```yaml
branch:
  name: codex/governance-repair/<plan-id>
  base: <mutation-target>
  commits: 1
  forcePush: false
  reuse: false
pullRequest:
  base: master
  draft: true
  autoReady: false
  autoMerge: false
  checkRerun: false
  reviewThreadMutation: false
```

Execution order is fixed:

1. In the no-write trusted-preflight job, check out the exact mutation target,
   verify a clean tree/index, dry-run and apply the plan-contained patch in an
   ephemeral copy, and run only trusted-base validator and contract-test
   binaries with candidate files treated as inert data.
2. Re-read canonical evidence in read-only Admission; preflight output is
   advisory evidence and never grants authority.
3. Create and read back the durable claim in the isolated Claim writer job.
4. Publish and uniquely read back the durable `approval_consumed` event.
5. In an independent no-write post-claim Admission job, freshly re-read the
   claim, workflow-capability set, approval-consumption receipt, plan, policy,
   head, branch absence, and expiry.
6. In the bounded publisher, freshly revalidate the post-claim Admission
   digest and all canonical evidence; check out the exact mutation target,
   verify a clean tree/index, and apply the exact patch once.
7. Verify actual files, semantic delta, before/after trees, blobs, modes,
   symlinks, generated files, and transport contracts using only pinned
   trusted-base code. Never execute candidate tests, scripts, Actions,
   workflows, hooks, or package lifecycle code in a write-token job.
8. Create exactly one commit, push normally to the deterministic isolated
   branch, and create exactly one Draft PR.
9. Continue through a separate `needs`-bound trusted exact-head job in the
   same protected workflow run. It ignores upstream authority claims, freshly
   reads the Draft PR head, and treats candidate content only as inert data.
10. Require the exact candidate head, trusted validator and workflow SHAs,
   expected App, and successful check before recording validation success.

The PR body records observation, attribution, plan, approval, claim, policy,
before/after tree, commit, validation, and withdrawal evidence. No workflow or
receipt claims that the Draft PR is Ready, merge-approved, deployed, or
production-aligned.

## Trusted Validation

The trusted exact-head result binds:

```yaml
repository: gccwebos-com/proxy-gateway-minimal
headSha: <candidate-head>
validatorSha: <trusted-base-sha>
workflowPath: <trusted-workflow-path>
workflowSha: <trusted-workflow-sha>
workflowRunId: <run-id>
workflowRunAttempt: <attempt>
checkName: <stable-name>
expectedAppId: <verified-github-app-id>
conclusion: success
```

Name-only, wrong-App, old-head, skipped, neutral, cancelled, timed-out, or
missing checks are not success. Candidate workflow changes cannot validate the
validator or executor version that produced them.

The design does not assume that ordinary `pull_request` checks will start for
a Draft PR created with `GITHUB_TOKEN`. The trusted exact-head job is a
job-permission-isolated `needs` successor inside the same workflow execution
whose path/SHA passed Admission; it is not started through `actions: write` and
does not depend on a candidate `pull_request` trigger. It freshly re-reads the
remote PR head and publishes only the bound check. Enabling this trusted
workflow and its ruleset is a separate exact settings/activation Gate.

The Draft PR records required reviews and checks, but effective protection
depends on a separately approved GitHub ruleset/settings Gate. Until that Gate
passes, process evidence is not represented as platform enforcement.

## Execution Evidence And Withdrawal

The terminal execution evidence includes:

```yaml
beforeTreeDigest: <sha256>
afterTreeDigest: <sha256>
changedBlobList: []
governanceMutationState: none | claim_created | unknown
repairMutationState: none | branch_created | draft_pr_created | partial_remote_state | unknown
claimEvidence:
  claimRef: <ref-or-null>
  tagObjectSha: <sha-or-null>
  targetSha: <sha-or-null>
  expectedAppId: <app-id-or-null>
  workflowIdentityDigest: <sha256-or-null>
  runId: <run-id-or-null>
  runAttempt: <attempt-or-null>
  jobIdentityDigest: <sha256-or-null>
  claimCapabilityProofDigest: <sha256-or-null>
  observedState: absent | exact | mismatch | unknown
remoteEvidence:
  branchRef: <ref-or-null>
  commitRef: <sha-or-null>
  prNumber: <number-or-null>
executionState: <state>
canonicalResult: <result>
reconciliationRequired: <boolean>
```

Receipts are append-only. An unmerged withdrawal closes the Draft PR and adds a
withdrawal event; it never edits or deletes prior receipts. A merged change is
reversed only through a separately approved inverse PR.

## Failure Recovery Semantics

| Failure point | Required result |
| --- | --- |
| Before durable claim | Prove both governance and repair mutation are `none`; approval remains unconsumed or is explicitly invalidated. |
| After claim but before repair/source mutation | Governance mutation is `claim_created`; approval remains consumed; prove repair mutation `none` or report unknown; terminal blocked receipt; no automatic retry. |
| Push succeeds but PR creation fails | `partial_remote_state`; retain and read back the branch; reconciliation required. |
| Draft PR exists but checks fail or do not trigger | Keep Draft; terminal blocked; no automatic rerun. |
| Receipt publication response is lost | Idempotent readback; unknown remains `canonical_result: unavailable`. |
| Runner is cancelled after claim or repair/source mutation may have started | Preserve the proved claim state; report repair mutation as unknown when needed; reconciliation required. |
| Operator withdraws before claim | Stop with no branch or PR. |
| Operator withdraws after Draft PR creation | Close the Draft PR and append withdrawal evidence. |

The system may report that it does not know. It must never translate unknown
execution state into `mutation: none`.

## Threat Model

### Assets

- Operator approval authority and single-use approval state;
- workflow, router, policy, classifier, validator, and executor trust root;
- job-scoped GitHub token and actual permission snapshot;
- observation, plan, approval, claim, execution, and receipt integrity;
- exact head, tree, branch, commit, PR, and remote mutation state.

### Actors And Inputs

- Operator-controlled: short approval, rejection, and withdrawal commands;
- developer-controlled: candidate branch and normal reviewed source changes;
- attacker-controlled or untrusted: PR content, Issue text before provenance
  verification, event fields, raw logs, artifacts, candidate Actions, branch
  names, and external failure messages;
- platform-controlled: GitHub actor, App, run, check, repository, and team/role
  identities, which still require fresh readback and digest binding.

A fully compromised GitHub platform or malicious repository administrator is
outside the mechanism's prevention boundary. An admin, default branch, App, or
authorization-policy identity change invalidates existing approvals and
requires fresh governance review.

### P0 Threats

1. A write-token job executes candidate code or artifact and leaks authority.
2. Two runners consume one approval.
3. A digest is substituted across schema, repository, or lineage domains.
4. A candidate modifies its own validator or executor and self-attests.
5. Token permissions, secret access, or mutation scope expand silently.
6. Push, PR, or receipt responses are lost and retry duplicates mutation.
7. A same-name, wrong-App, old-head, skipped, or neutral check is accepted.
8. A repair bypasses the Draft PR and writes `master` directly.

### P1 Threats

- replayed, edited, deleted, duplicated, Unicode-confused, unauthorized, or
  stale-team approval;
- approval/withdraw race, head/policy/workflow/validator drift, or expired
  evidence;
- pre-created branch, branch collision, force-push, or changed PR base/head/
  Draft state;
- YAML, symlink, mode, rename, binary, untracked, secret, deploy, or Action-pin
  smuggling;
- correct artifact bytes from the wrong repository, run, attempt, or head;
- missing checks treated as success or partial remote state treated as no
  mutation.

### P2 Threats

- comment or failure-event spam, API rate limiting, pending-run replacement,
  Issue locking, evidence-retention loss, runner clock drift, schema downgrade,
  default-branch/App identity changes, log prompt injection, and availability
  degradation.

P2 conditions can only produce abstain, blocked, or Operator escalation. They
cannot increase authority.

## Failure-injection Requirements

| Injection | Mandatory result |
| --- | --- |
| Candidate code attempts to expose a token | Trusted-base rejection; candidate never receives the write token. |
| Workflow, Action, validator, or permissions digest drifts | Approval invalidated. |
| Duplicate JSON key, encoding ambiguity, or cross-domain digest | Parser/domain rejection. |
| Actor unauthorized or removed after approval | Fresh role readback rejects execution. |
| Comment edited, deleted, duplicated, or replayed | Invalidated; never consumed twice. |
| Two runners consume concurrently | Durable claim has exactly one winner. |
| Claim ref is deleted, replaced, recreated, or either ruleset/bypass set changes | Repository claim-capability proof and dual-ruleset readback reject execution; reconciliation required. |
| Approve and withdraw race | Proved order or blocked result. |
| Same branch name exists | Collision; no reuse or force-push. |
| Runner stops before claim | Prove no mutation. |
| Runner stops after claim | Reconciliation required; no retry. |
| Push/PR succeeds but response is lost | Exact remote readback; no duplicate creation. |
| PR base, head, Draft state, or branch changes | Blocked; previous checks invalid. |
| Symlink, mode, rename, untracked, or YAML semantic smuggling | Actual and semantic diff rejection. |
| Artifact digest matches but provenance differs | Provenance rejection. |
| Check has wrong App, head, or non-success conclusion | Admission/validation rejection. |
| Checks do not trigger | Draft remains blocked. |
| Ordinary PR checks do not start for an automated Draft | The same trusted workflow's isolated exact-head job must publish the bound check; no success is inferred. |
| Receipt write is uncertain | Idempotent readback or reconciliation; never infer success. |
| Log includes prompt injection or a secret canary | Treated only as data; no execution or leakage. |
| Plan, policy, approval, or evidence expires or drifts | Expired/invalidated; no grace execution. |

## Test Layers

```yaml
schema_unit:
  - canonicalization
  - duplicate_key_rejection
  - domain_binding
policy_contract:
  - risk_floor
  - unknown_abstain
  - retry_budget
temp_repository_integration:
  - durable_claim
  - branch_collision
  - actual_diff
  - partial_remote_state
workflow_static:
  - permissions
  - triggers
  - pinned_actions
  - no_untrusted_interpolation
shadow_actions:
  - read_only
  - no_remote_mutation
activation_probe:
  - separate_exact_Risk_A_Gate
```

All P0 and P1 injections must have deterministic expected states. Tests use
synthetic evidence and isolated repositories; they do not require production,
provider, credential, or customer-data access.

## Security Exit Criteria

The MVP cannot activate a write executor until all of the following are true:

```yaml
P0_injections_blocked: 100%
unauthorized_mutations: 0
duplicate_executions: 0
false_trusted_check_acceptance: 0
secret_leakage: 0
unknown_state_reported_as_no_mutation: 0
Risk_A_auto_execution: 0
```

Metrics never override a safety invariant.

## Delivery Sequence

The implementation sequence is:

1. Close PR #499 through independent review, Ready, and merge decisions.
2. Deliver canonical JSON, domain-separated digest utilities, schemas, and
   ledger-event validation in one B-tier PR.
3. Deliver Observation and deterministic Attribution in read-only shadow mode.
4. Deliver Repair Plan, short approval parsing, and provenance verification.
5. Deliver Admission and a bounded executor with no registered write adapter
   and no enabled workflow caller.
6. Deliver read-only Actions shadow routing and freeze evaluation evidence.
7. Deliver the single workflow-repair adapter and Draft PR executor disabled
   by default.
8. Protect the trust root, required checks, reviews, and GitHub App identity
   through separate source and settings Gates.
9. Activate one workflow-repair category only through a separate exact Risk A
   Gate after shadow metrics and failure injection pass.

Project-state reconciliation remains a separate Risk C PR. Artifact Gates,
deployment, provider access, runtime mutation, and production alignment remain
forbidden until durable artifact, deployment/rollback binding, and platform
enforcement are complete.

## Implementation Prerequisites

Before any write executor can be enabled, implementation must finalize and
test:

- the exact GitHub workflow/job permission matrix;
- the JSON schemas and canonicalization/domain-separation library;
- the durable claim adapter and crash-safe reconciliation path;
- the repository-wide `contents: write` capability inventory and exclusive
  claim-namespace call-site proof;
- required-review, required-check, expected-App, and environment prerequisites;
- the protected claim-tag namespace, frozen bypass set, and trusted
  `needs`-bound exact-head validation path;
- the threat-model and failure-injection test suite;
- evidence retention long enough for the complete shadow evaluation window.

## Design Exit State

```yaml
Governed_Repair_Framework:
  architecture: complete
  machine_contracts: complete
  authorization_model: complete
  execution_boundary: complete
  threat_model: complete
  source_implementation_ready: true
  write_executor_activation_ready: false
  write_executor_enabled: false
  production_authority: false
```

The framework is ready for an implementation plan. It is not ready for write
executor activation, Artifact Gate, deployment, or production alignment.
