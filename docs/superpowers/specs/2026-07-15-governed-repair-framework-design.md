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
- Before PR #499 can merge, its unpublished Attribution and Router contracts
  must be migrated together to the V2 contracts below. If any V1 object already
  exists in merged or durable history, it remains immutable historical evidence;
  it is never rewritten, reinterpreted as V2, or admitted into a V2 lineage.
  Fresh V2 Attribution and Router results are required instead. Every ledger
  event binds the Attribution schema version, Router version, policy digest,
  Attribution digest, and Router-result digest.
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
  trustedWorkflowBlobOid: <git-blob-oid>
  trustedWorkflowContentSha256: <sha256>
  permissionsDigest: <sha256>
authority:
  observerVersion: <version>
  observerBinaryDigest: <sha256>
  sourceAuthorityDigest: <sha256>
run:
  id: <github-run-id>
  attempt: <positive-integer>
  workflowId: <github-workflow-id>
  event: <event-name>
  checkName: <check-name>
  status: <status>
  conclusion: <conclusion>
source:
  headSha: <full-sha>
  baseSha: <full-sha>
  treeSha: <full-sha>
runner:
  declaredOs: <runner-os>
  declaredImage: <trusted-runs-on-label>
  labelsDigest: <sha256>
evidence:
  evidenceKind: github_job_step_metadata | redacted_log_summary
  evidenceDigest: <sha256>
  artifactDigests: []
  redactionPolicyDigest: <sha256>
observedAt: <canonical-timestamp>
observationUsabilityExpiry: <canonical-timestamp>
recordDigest: <domain-separated-sha256>
```

`github_job_step_metadata` hashes the closed trusted workflow identity,
head/base/tree, declared runner profile, canonical job/step names and outcomes,
and closed reason code. It never hashes or reads source-run log text.
`redacted_log_summary` is accepted only when an upstream separately trusted
redactor has already produced the bounded structured digest; raw text is never
an Observer input.

`observationUsabilityExpiry` limits use as a new Repair Plan input; it does not
erase or invalidate the historical failure fact. Raw logs, secrets, tokens,
credentials, complete GitHub payloads, and customer data are never stored in
the record or ledger.

A run, attempt, head, base, workflow identity, Observer identity, or evidence
change creates a new observation. Malformed fields are contract errors. Missing
exact identity or evidence produces a tagged `abstain` result with closed
`missingFields`; it does not fabricate a schema-valid Observation or digest and
can only route to Operator review.

`run.workflowId`, `run.event`, `run.status`, `run.conclusion`, and
`run.checkName` are trusted facts, not event-payload hints. The first four come
from the canonical workflow-run-attempt readback; `checkName` comes from the
unique trusted job/check inventory bound to the approved workflow blob. An
untrusted trigger payload may supply correlation values only: every supplied
value must equal the trusted fact and is then discarded. It may never fill a
missing trusted field or become an Observation digest input.

The reader returns exactly one `SourceRunFacts/v1` value:

```yaml
schemaVersion: "1"
repository: gccwebos-com/proxy-gateway-minimal
workflow:
  name: <trusted-name>
  path: <repository-path>
  blobOid: <git-blob-oid>
  contentSha256: <sha256>
  permissionsDigest: <sha256>
run:
  workflowId: <github-workflow-id>
  id: <github-run-id>
  attempt: <positive-integer>
  event: <event-name>
  status: completed
  conclusion: <non-null-closed-conclusion>
  selectedCheckName: <unique-policy-check-name>
source:
  headSha: <full-sha>
  baseSha: <full-sha>
  treeSha: <full-sha>
runner:
  declaredOs: <runner-os>
  declaredImage: <trusted-runs-on-label>
  labelsDigest: <sha256>
jobs: <closed-sorted-job-and-step-outcomes>
reasonCode: <closed-reason-code>
occurredAt: <selected-job-completed-at>
evidenceDigest: <projection-digest>
```

`status` must be `completed`; conclusion and selected-job completion time must
be present. Exactly one policy-named check/job must exist. Zero or multiple
matches, label/workflow/permission drift, or a run/job conclusion mismatch
abstains. `blobOid` is the Git identity and `contentSha256` is the byte identity;
neither is called a workflow SHA. `evidenceDigest` uses
`SOURCE_FACTS:v1\0` after deleting only that field.

For `github_job_step_metadata`, `createFailureObservation()` accepts exactly
three closed inputs: `SourceRunFacts/v1`, `ObserverIdentity/v1`, and
`ObservationPolicy/v1`. `ObserverIdentity/v1` contains exactly
`observerVersion`, `observerBinaryDigest`, and `sourceAuthorityDigest`.
`ObservationPolicy/v1` contains exactly `redactionPolicyDigest` and a positive,
bounded `usabilityDurationSeconds`; both values are frozen by the proposal.
No event payload, wall clock, caller-supplied workflow field, or free-form
evidence field is accepted.

The complete normative mapping is:

| Observation field | Sole source |
| --- | --- |
| `schemaVersion` | literal `"1"` |
| `observationId` | `"observation-" + <OBSERVATION_ID-domain-sha256>` |
| `repository` | `sourceFacts.repository` |
| `workflow.name` / `workflow.path` | the identically named `sourceFacts.workflow` fields |
| `workflow.trustedWorkflowBlobOid` | `sourceFacts.workflow.blobOid` |
| `workflow.trustedWorkflowContentSha256` | `sourceFacts.workflow.contentSha256` |
| `workflow.permissionsDigest` | `sourceFacts.workflow.permissionsDigest` |
| `authority.*` | the identically named `observerIdentity` fields |
| `run.id` / `attempt` / `workflowId` / `event` / `status` / `conclusion` | the identically named `sourceFacts.run` fields |
| `run.checkName` | `sourceFacts.run.selectedCheckName` |
| `source.*` / `runner.*` | the identically named `sourceFacts` fields |
| `evidence.evidenceKind` | literal `github_job_step_metadata` |
| `evidence.evidenceDigest` | `sourceFacts.evidenceDigest` |
| `evidence.artifactDigests` | literal empty array |
| `evidence.redactionPolicyDigest` | `observationPolicy.redactionPolicyDigest` |
| `observedAt` | `sourceFacts.occurredAt` |
| `observationUsabilityExpiry` | `occurredAt + usabilityDurationSeconds` |
| `recordDigest` | the `OBSERVATION:v1\0` projection digest |

The ID suffix is exactly lowercase hex
`SHA256(UTF8("OBSERVATION_ID:v1\0") || canonicalJsonBytes({
sourceFactsEvidenceDigest: sourceFacts.evidenceDigest, observerIdentity }))`.
No truncation is permitted. `sourceFacts.jobs` and `sourceFacts.reasonCode` are consumed only while
revalidating `sourceFacts.evidenceDigest`; they are not copied into the smaller
Observation envelope. Timestamp addition uses canonical UTC arithmetic and
never the execution clock. Overflow, a non-canonical timestamp, a missing
field, or a digest mismatch abstains without producing an Observation.
`parseTriggerCorrelation()` may compare only repository, run ID, and attempt
from an untrusted event payload; the correlation object is discarded and is
never an Observation or digest input. A separate closed constructor governs
`redacted_log_summary`; it is not represented as a `SourceRunFacts/v1` mapping.

## Attribution Contract V2

Failure Attribution V2 keeps PR #499's top-level category vocabulary. A
versioned `reasonCode` provides technical detail without creating a second
router. The V2 record is facts-only and uses the `ATTRIBUTION:v2\0` digest
domain; it is not wire-compatible with V1.

Representative mappings are:

| Category | Allowed reason-code examples |
| --- | --- |
| `execution_transport` | `shell_argument_binding`, `encoding_mismatch`, `path_resolution`, `empty_output_type_loss`, `process_result_tokenization` |
| `ci_configuration` | `permission_contract`, `environment_contract`, `timeout_contract`, `retry_contract`, `artifact_retention_contract` |
| `test_fixture` | `obsolete_expectation`, `fixture_time_drift`, `platform_assumption` |
| `unknown` | `insufficient_evidence`, `conflicting_evidence`, `unsupported_failure` |

The result contains:

```yaml
schemaVersion: "2"
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

Attribution returns `{ record, attributionDigest }`; the digest is a sidecar and
is not injected into the record. Attribution does not output `failureRisk`,
governance risk, approval, lane, execution, writable files, or mutation
authority. Assisted classification may add explanation but cannot raise the
category, confidence, eligibility, or authority of a deterministic result.
Ambiguous, conflicting, unsupported, or low-confidence evidence produces
`category: unknown` or a fail-closed result.

## Policy Router V2 Contract

The shared Router is the sole governance-risk authority. Its exact logical
input is:

```yaml
gateRisk: A | B | C
attributionRecord: <Attribution-V2-record>
attributionDigest: <sha256>
scope:
  targetPaths: []
  capabilityIds: []
  protectedScope: false
policyVersion: <version>
policyDigest: <sha256>
retryLineage:
  lineageDigest: <sha256>
  parentReceipt: <receipt-id>
  attempt: <non-negative-integer>
  budget: <non-negative-integer>
```

Its closed output is:

```yaml
schemaVersion: "2"
routerVersion: repair-router/v2
repository: gccwebos-com/proxy-gateway-minimal
attributionDigest: <sha256>
gateRisk: A | B | C
scopeDigest: <sha256>
governanceRisk: A | B | C
lane: codex_auto_repair | codex_successor_preparation | operator_review
proposalEligible: <boolean>
shadowEligible: <boolean>
executionAuthority: false
operatorApprovalRequiredForMutation: true
newGateRequired: true
retry:
  attempt: <non-negative-integer>
  budget: <non-negative-integer>
  remaining: <non-negative-integer>
reasonCodes: []
policyVersion: <version>
policyDigest: <sha256>
lineageDigest: <sha256>
```

The Router is a pure policy function and returns the shared tagged result
`{ ok: true, code: 'accepted', value: { record, routerResultDigest } }`.
`operator_review` is a successful routing decision, not an error result.
Malformed contracts throw the shared contract error; an expected denial or
unknown state returns the shared `{ ok: false, code, details }` form. The
sidecar digest uses `ROUTER_RESULT:v2\0` over the complete closed record and therefore binds the
repository, Gate risk, exact scope digest, Attribution, policy, retry lineage,
and decision. The Repair Plan and ledger route event both bind this digest; a
Router result cannot be replayed across repository, scope, Gate risk, policy,
or lineage.

`governanceRisk` is the maximum of the Gate risk and policy-derived category,
target-path, capability, and protected-scope floors. Trust-root files have a B
floor; permission expansion, OIDC, secrets, deployment, provider, runtime,
production, validator/executor self-change, identity or authority drift, and
scope expansion are protected and route to Operator review. Risk A, unknown or
low-confidence Attribution, policy conflict, and exhausted retry budget also
route to Operator review. Every route has `executionAuthority: false`; every
mutation Repair Plan requires a new Gate and explicit Operator approval.

During the PR #499 migration only, the validator may read its unpublished V1
fixtures to prove rejection or historical isolation. `failureRisk` is
deprecated and forbidden in newly emitted V2 Attribution. The V2 Router must
preserve the immutable retry lineage rather than resetting a successor budget.

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
routerResultDigest: <sha256>
policyVersion: <version>
policyDigest: <sha256>
plannerVersion: <version>
repository: gccwebos-com/proxy-gateway-minimal
repositoryObjectFormat: sha1
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
  encoding: exact-file-replacements/v1
  replacements:
    - path: .github/workflows/example.yml
      operation: replace
      beforeBlobOid: <git-blob-oid>
      beforeSha256: <sha256>
      beforeMode: "100644"
      afterContentBase64: <canonical-base64-of-exact-after-bytes>
      afterSha256: <sha256>
      afterSizeBytes: <bounded-size>
      afterMode: "100644"
  aggregateDigest: <sha256>
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

Phase 1 accepts only a small, canonical, plan-contained list of exact file
replacements. Replacement entries are sorted by UTF-8 path bytes and are
unique. Paths are repository-relative NFC strings with `/` separators and may
name only existing regular files in `allowedFiles`; add, delete, rename, copy,
symlink, submodule, binary, mode change, and path escape are forbidden. The
before Git blob OID, before SHA-256, and mode must match the frozen tree. The
decoded after bytes are the only authorized mutation bytes and must be UTF-8,
LF-only, BOM-free, NUL-free, and size bounded. The aggregate digest uses
`PATCH_SET:v1\0` over the complete closed replacement list. There is no
Git-version-dependent unified-diff normalization step. A replacement set that
exceeds the configured size, needs arbitrary code generation, or cannot be
verified as the approved semantic delta routes to Operator review outside this
executor.

`afterContentBase64` uses RFC 4648 standard Base64 with required canonical
padding. Marker/comment bodies use RFC 4648 URL-safe Base64 without padding.
Whitespace, alternate alphabet, non-canonical padding, and multiple textual
encodings of the same bytes are rejected.

## Domain-separated Digests

Every object uses canonical JSON with duplicate-key rejection and explicit
domain separation:

```text
OBSERVATION:v1\0<canonical-json>
OBSERVATION_ID:v1\0<canonical-json>
ATTRIBUTION:v2\0<canonical-json>
ROUTER_RESULT:v2\0<canonical-json>
PLAN:v1\0<canonical-json>
APPROVAL:v1\0<canonical-json>
CLAIM:v1\0<canonical-json>
EXECUTION:v1\0<canonical-json>
RECEIPT:v1\0<canonical-json>
SHADOW_DATASET:v1\0<canonical-json>
SHADOW_EVALUATION:v1\0<canonical-json>
SHADOW_EVIDENCE:v1\0<canonical-json>
SOURCE_FACTS:v1\0<canonical-json>
PATCH_SET:v1\0<canonical-json>
SHADOW_ASSESSMENT:v1\0<canonical-json>
SHADOW_ASSESSMENT_TEMPLATE:v1\0<canonical-json>
SHADOW_RUN_KEY:v1\0<canonical-json>
FAILURE_LINEAGE:v1\0<canonical-json>
PROJECT_STATE_SELECTOR:v1\0<canonical-json>
PROJECT_STATE_SELECTOR_RESULT:v1\0<canonical-json>
```

Every digest is computed from a non-self-referential signed projection. The
projection is a deep copy of the final closed envelope with exactly the
record-type self-digest field deleted:

| Record | Self-digest field excluded from its own projection |
| --- | --- |
| Observation | `recordDigest` |
| Attribution V2 | None; `attributionDigest` is a sidecar |
| Router Result V2 | None; `routerResultDigest` is a sidecar |
| Repair Plan | `planDigest` |
| Approval recorded | `approvalDigest` |
| Approval rejection/state event | `eventDigest` |
| Claim | `claimDigest` |
| Execution / terminal receipt | `receiptDigest` |
| Shadow evidence | `recordDigest` |
| Source facts | `evidenceDigest` |
| Shadow assessment | `assessmentDigest` |
| Shadow assessment template | `templateDigest` |
| Shadow dataset | `manifestDigest` |
| Shadow evaluation | `evaluationDigest` |
| Project-state selector manifest | `manifestDigest` |
| Project-state selector command result | `resultDigest` |

The exact algorithm is:

```text
projection = deepClone(finalEnvelope)
delete projection[recordType.selfDigestField]
digest = lowercaseHex(
  SHA256(UTF8(domainPrefix) || canonicalJsonBytes(projection))
)
```

Construction validates the unsigned projection, computes the digest, assembles
the final envelope, and validates the final closed schema. Verification first
validates the final envelope, recreates the projection, and compares the digest
in constant time. A self-digest field must be deleted for projection; `null`, an
empty string, a zero digest, or deletion of any other field is invalid. Nested
and cross-object digests remain in the projection. Each domain has fixed input
bytes and expected-digest test vectors, including cross-domain, repository,
lineage, and single-field mutation failures.

The verifier also binds object type, schema version, repository, lineage,
subject, and policy before comparing a digest. A digest valid in one domain
cannot be substituted into another domain.

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
eventType: approval_recorded | approval_rejected
decision: approve | reject
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

`/repair withdraw` does not reuse this proposal-decision envelope. It creates
only the closed `approval_withdrawn` state event below and must reference an
existing `approvalDigest`. Approval events are immutable. The validator derives
`recorded_not_consumed`, `consumed`, `withdrawn`, `expired`, or `invalidated`
from ordered `approval_recorded`, `approval_rejected`, `approval_withdrawn`,
`approval_consumed`, `approval_expired`, `approval_invalidated`, and claim
events;
it never edits an earlier approval event to change its state. The proposal
provenance digest reuses the canonical comment-identity envelope defined by
the existing Phase 1 roadmap.

Approval state events are a closed discriminated union; there is no generic
`evidenceRefs` escape hatch:

```yaml
withdrawn:
  eventType: approval_withdrawn
  approvalDigest: <sha256>
  reasonCode: operator_withdrawn
  commandCommentIdentityDigest: <sha256>
  actorIdentity: <closed-actor-identity>
  authorityDigest: <sha256>
  occurredAt: <canonical-timestamp>

consumed:
  eventType: approval_consumed
  approvalDigest: <sha256>
  reasonCode: claim_consumed
  claimDigest: <sha256>
  consumptionReceiptDigest: <sha256>
  occurredAt: <canonical-timestamp>

expired:
  eventType: approval_expired
  approvalDigest: <sha256>
  reasonCode: approval_expired
  effectiveUntil: <canonical-timestamp>
  clockEvidenceDigest: <sha256>
  occurredAt: <canonical-timestamp>

invalidated:
  eventType: approval_invalidated
  approvalDigest: <sha256>
  reasonCode: head_drift | policy_drift | scope_drift | authority_drift | workflow_drift | lineage_drift | proposal_drift
  mismatchedField: validationBase | mutationTarget | policyDigest | scopeDigest | authorityDigest | workflowIdentityDigest | lineageDigest | proposalDigest
  expectedDigest: <sha256>
  actualDigest: <sha256-or-null>
  evidenceDigest: <sha256>
  occurredAt: <canonical-timestamp>
```

`approval_rejected` remains its own exact input event with
`reasonCode: operator_rejected`; it derives `invalidated(reason=rejected)` but
is never encoded as the `approval_invalidated` shape above. Every union member
also carries the common `schemaVersion`, unique `eventId`, and its own
`eventDigest` under `APPROVAL:v1\0`. Unknown event types, reasons, mismatch
fields, or extra fields fail closed.

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

The V2 `repair_routed` event is exact and does not embed the old V1
`repairAttempts` shortcut:

```yaml
schemaVersion: "2"
type: repair_routed
at: <canonical-timestamp>
parentReceiptDigest: <sha256>
observationDigest: <sha256>
attributionDigest: <sha256>
routerResult: <complete-closed-Router-Result-V2-record>
routerResultDigest: <sha256>
retry:
  attempt: <non-negative-integer>
  budget: <non-negative-integer>
  remaining: <non-negative-integer>
  lineageDigest: <sha256>
policyVersion: <version>
policyDigest: <sha256>
```

The validator recomputes `routerResultDigest`, requires `retry` and policy
fields to equal the embedded Router result, and rejects a V1/V2 mixture. V1
historical events remain readable only through their frozen V1 schema and are
never rewritten.

## Native GitHub API Transport V1

The framework uses one tested, repository-local native Node transport for its
closed GitHub evidence operations. `GitHubApiTransport/v1` is not a shell
execution helper, does not invoke `gh`, and does not extend Execution Contract
v1. It performs HTTPS requests directly and grants no authority: a Gate must
still bind the exact operation IDs, repository, authentication mode/proof,
trusted transport/helper transitive-closure manifest, Node executable
`executable-identity/v1`, API version, limits, and single-call budgets.

Its only first-hop origin is the literal `https://api.github.com:443`.
Caller-supplied origins, proxies, proxy environment variables, custom HTTPS
agents, custom DNS resolvers, and redirects are rejected. The only redirect
exception is the single, bounded `DOWNLOAD_SHADOW_RUN_LOGS` hop defined below.

The operation registry is closed to:

```text
READ_AUTHENTICATED_USER
READ_REPOSITORY
READ_PULL_REQUEST
LIST_PULL_REQUESTS_BY_HEAD
READ_GIT_REF
READ_GIT_COMMIT
LIST_COMMIT_CHECK_RUNS
READ_COMBINED_COMMIT_STATUS
LIST_WORKFLOW_RUNS
READ_WORKFLOW_RUN_ATTEMPT
LIST_RUN_JOBS
READ_REPOSITORY_CONTENT
LIST_ISSUE_COMMENTS
READ_ISSUE_COMMENT
READ_COLLABORATOR_PERMISSION
READ_TEAM_MEMBERSHIP
DOWNLOAD_SHADOW_RUN_LOGS
CREATE_DRAFT_PULL_REQUEST
```

The method/path templates are fixed:

| Operation | Method and REST path |
| --- | --- |
| `READ_AUTHENTICATED_USER` | `GET /user` |
| `READ_REPOSITORY` | `GET /repos/{owner}/{repo}` |
| `READ_PULL_REQUEST` | `GET /repos/{owner}/{repo}/pulls/{number}` |
| `LIST_PULL_REQUESTS_BY_HEAD` | `GET /repos/{owner}/{repo}/pulls?state=open&head={owner}:{branch}&base={base}&per_page=100&page={n}` |
| `READ_GIT_REF` | `GET /repos/{owner}/{repo}/git/ref/heads/{encoded-branch}` |
| `READ_GIT_COMMIT` | `GET /repos/{owner}/{repo}/git/commits/{sha}` |
| `LIST_COMMIT_CHECK_RUNS` | `GET /repos/{owner}/{repo}/commits/{sha}/check-runs?per_page=100&page={n}` |
| `READ_COMBINED_COMMIT_STATUS` | `GET /repos/{owner}/{repo}/commits/{sha}/status?per_page=100&page={n}` |
| `LIST_WORKFLOW_RUNS` | `GET /repos/{owner}/{repo}/actions/workflows/{workflow-id}/runs?created={from-inclusive}..{through-inclusive}&per_page=100&page={n}` |
| `READ_WORKFLOW_RUN_ATTEMPT` | `GET /repos/{owner}/{repo}/actions/runs/{run-id}/attempts/{attempt}` |
| `LIST_RUN_JOBS` | `GET /repos/{owner}/{repo}/actions/runs/{run-id}/attempts/{attempt}/jobs?per_page=100&page={n}` |
| `READ_REPOSITORY_CONTENT` | `GET /repos/{owner}/{repo}/contents/{encoded-path}?ref={sha}` |
| `LIST_ISSUE_COMMENTS` | `GET /repos/{owner}/{repo}/issues/{number}/comments?per_page=100&page={n}` |
| `READ_ISSUE_COMMENT` | `GET /repos/{owner}/{repo}/issues/comments/{comment-id}` |
| `READ_COLLABORATOR_PERMISSION` | `GET /repos/{owner}/{repo}/collaborators/{comment-actor-login}/permission` |
| `READ_TEAM_MEMBERSHIP` | `GET /orgs/{org}/teams/{team-slug}/memberships/{comment-actor-login}` |
| `DOWNLOAD_SHADOW_RUN_LOGS` | `GET /repos/{owner}/{repo}/actions/runs/{run-id}/attempts/{attempt}/logs` |
| `CREATE_DRAFT_PULL_REQUEST` | `POST /repos/{owner}/{repo}/pulls` |

Each operation constructs its own fixed REST path and method from validated
scalar identifiers. There is no caller-supplied URL, arbitrary method, GraphQL,
generic request, or custom header interface. The API version is fixed to
`2022-11-28`; pagination is `per_page=100` with monotonically increasing pages
to the first empty page. Every call has proposal-bound time, page, response,
archive, member-count, and expanded-byte limits. Response parsing rejects
duplicate JSON keys, invalid UTF-8, unexpected content type, ambiguous status,
rate-limit exhaustion, and truncated pagination.

`createGitHubApiTransport()` returns one frozen session with exactly these
methods and no generic `request()` escape hatch:

```js
proveAuthentication({ mode, expectedActorNodeId, repository,
  expectedWorkflowIdentity, expectedRunId, expectedRunAttempt })
readAuthenticatedUser({ expectedActorNodeId })
readRepository({ repository })
readPullRequest({ repository, prNumber })
listPullRequestsByHead({ repository, headOwner, headBranch, base })
readGitRef({ repository, branch })
readGitCommit({ repository, commitSha })
listCommitCheckRuns({ repository, headSha })
readCombinedCommitStatus({ repository, headSha })
listWorkflowRuns({ repository, workflowId, createdFrom, createdThrough })
readWorkflowRunAttempt({ repository, runId, runAttempt })
listRunJobs({ repository, runId, runAttempt })
readRepositoryContent({ repository, path, ref })
listIssueComments({ repository, issueNumber })
readIssueComment({ repository, commentId })
proveCommentActorAuthority({ repository, commentId, authorizationPolicy })
downloadShadowRunLogs({ repository, runId, runAttempt })
createDraftPullRequest({ repository, base, head, titleBytes, bodyBytes })
dispose()
```

All inputs are closed objects with validated scalar types and no extra fields.
Every operation resolves to `{ ok: true, code: 'accepted', value, evidence }`
or a closed tagged failure; `value` has a per-operation closed schema and
`evidence` contains only status, response-byte digest/length, page count and
rate-limit class. No raw header/body or token is returned. `dispose()` is
required in `finally`, overwrites the private token buffer, removes listeners,
marks the session closed, and makes every later call fail.

The closed `value` families are:

```yaml
authenticationProof: { mode: local_user | actions_installation, actorNodeId: <node-id-or-null>, repository, workflowIdentityDigest: <sha256-or-null>, runId: <integer-or-null>, runAttempt: <integer-or-null>, credentialAuthorityAssumption }
authenticatedUser: { actorNodeId, loginDigest, credentialAuthorityAssumption }
repository: { repositoryId, fullName, ownerNodeId, defaultBranch }
pullRequest: { prNumber, headSha, headRefName, headRepository, baseSha, baseRefName, isDraft, state, titleSha256, titleSize, bodySha256, bodySize, authorNodeId }
pullRequestList: { items: [pullRequest], paginationComplete: true }
gitRef: { refName, objectType: commit, objectSha }
gitCommit: { commitSha, treeSha, parentShas: [<full-sha>] }
checkRuns: { items: [{ checkRunId, name, appId, headSha, status, conclusion }], paginationComplete: true }
combinedStatus: { state, items: [{ statusId, context, creatorNodeId, sha, state }], paginationComplete: true }
workflowRuns: { reportedTotalCount, items: [{ runId, latestRunAttempt, workflowId, event, status, conclusion, headSha, headBranch, headRepository, pullRequestNumbers: [<integer>], createdAt }], paginationComplete: true }
workflowRunAttempt: { runId, runAttempt, workflowId, event, status, conclusion, headSha, headBranch, headRepository, pullRequestNumbers: [<integer>], createdAt, runStartedAt, updatedAt }
runJobs: { items: [{ jobId, name, status, conclusion, labelsDigest, startedAt, completedAt, steps: [{ number, name, status, conclusion }] }], paginationComplete: true }
repositoryContent: { path, blobOid, contentBase64, contentSha256, size }
issueComments: { items: [{ commentId, bodyBase64, bodySha256, actorNodeId, createdAt, updatedAt }], paginationComplete: true }
issueComment: { commentId, bodyBase64, bodySha256, actorNodeId, actorLoginDigest, createdAt, updatedAt }
commentActorAuthority: { commentId, actorNodeId, actorLoginDigest, repositoryPermission, repositoryRoleNameDigest, teamMembership: <closed-membership-or-null>, authorizationPolicyDigest, observedAt, authorityDigest }
shadowRunLogs: { archiveBytes: <Uint8Array>, archiveSha256, archiveSize, redirectHostClass }
```

Create operations return the corresponding `pullRequest` or `issueComment`
value after exact readback; a response that cannot be read back is tagged
`reconciliation_required`, never guessed from the request.

Authentication has one secret source only: a proposal-bound trusted credential
broker injects `GITHUB_TOKEN` through the frozen launcher into the trusted Node
child process. The transport captures it once,
deletes `process.env.GITHUB_TOKEN` immediately, never accepts a token argument,
never invokes a credential helper or stored-login fallback, and zeroes its
in-memory token buffer in `finally`. Before any other operation it completes
exactly one proposal-bound authentication mode:

- `local_user` executes `READ_AUTHENTICATED_USER` and matches the expected
  Operator/connector actor node ID. It is valid only for a user-bound token;
- `actions_installation` never calls `/user`. It executes `READ_REPOSITORY` and
  `READ_WORKFLOW_RUN_ATTEMPT` for the current trusted run, then binds repository,
  run ID/attempt, workflow/head identity, and declared job permissions. It
  records `actorNodeId: null` and never represents the triggering user as the
  credential principal.

The token prefix is not used as proof of token type. A failed, unsupported, or
ambiguous authentication proof is `abstain` before other operations. The
token, headers, signed URLs, and raw error bodies never enter stdout, logs,
digests, receipts, or exception serialization. Because GitHub does not always
expose effective token scope, an unprovable scope is recorded as
`credential_authority_assumption: full_repository`; the operation registry is
still the only authorized use.

Fresh Operator authority is never copied from a proposal. For a canonical
approval comment, `proveCommentActorAuthority()` internally reads the comment,
uses its actor login only in memory, requires the same actor node ID throughout,
and executes `READ_COLLABORATOR_PERMISSION`; when the authorization policy
requires a team, it also executes `READ_TEAM_MEMBERSHIP`. Repository permission
requires GitHub `Metadata: read`; team proof additionally requires organization
`Members: read`. The policy fixes the acceptable base/custom role and active
team membership. Output contains only actor node ID, login/role digests, closed
permission/membership facts, observation time, policy digest, and
`authorityDigest`; the raw login/team response is discarded and never logged or
persisted. Missing permission, invisible team, pending membership, actor drift,
or insufficient token authority blocks. A proposal-carried `teamDigest` or role
is only an expectation and cannot substitute for fresh readback.

The trusted-base bundle includes one reviewed PowerShell launcher with a closed
operation enum; it accepts no arbitrary script, module, command, URL, cwd,
environment, or argument list. A credential-free workflow command asks a
pre-existing trusted credential broker to invoke that launcher.

Every GitHub launcher session binds two independent complete
`executable-identity/v1` values:

```yaml
launcherHostExecutableIdentity: <complete executable-identity/v1 for pwsh>
nodeExecutableIdentity: <complete executable-identity/v1 for the trusted Node child>
```

Before attaching a token or starting the launcher, the broker re-resolves and
verifies `launcherHostExecutableIdentity`, then invokes its absolute
`canonicalPath`; PATH lookup, file association, `powershell`, or bare `pwsh`
resolution is forbidden. The invocation is exactly `-NoLogo -NoProfile
-NonInteractive -File <absolute-frozen-launcher-path>` followed by the
launcher's three closed flags.

The broker is the sole credential authority. The only token-bearing process
chain is the broker, the verified PowerShell launcher it creates, and that
launcher's verified Node child; ordinary, candidate, and interactive shells are
outside the chain and never receive the token. The broker injects the token only
into the verified launcher's process environment. If the broker cannot prove
the host identity or capability, the operation stays disabled. The launcher
captures and deletes its token environment entry, verifies its frozen script/
bundle identity, then re-resolves and verifies `nodeExecutableIdentity`. It
passes the captured token only to the Node child and starts that child through
`ProcessStartInfo` with `FileName = nodeExecutableIdentity.canonicalPath`,
`UseShellExecute = false`, an exact `ArgumentList`, trusted-base cwd/module
closure, empty `process.execArgv`, and a cleared minimal environment. The
launcher rejects `NODE_OPTIONS`, `NODE_PATH`, every loader or import hook,
`NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`,
`SSL_CERT_DIR`, and every conventional proxy variable before Node starts.
Candidate code, candidate paths, Git push, and validation remain
credential-free. Launcher/transport tests prove host or Node identity drift and
each forbidden startup/TLS environment fail before token attachment, Node
startup, or a request.

Every executable launch binds one closed identity:

```yaml
schemaVersion: executable-identity/v1
canonicalPath: <absolute-normalized-path>
sha256: <sha256>
version: <closed-version-string>
versionOutputSha256: <sha256>
fileSize: <non-negative-integer>
fileId:
  platform: windows | posix
  volumeOrDevice: <closed-scalar>
  objectIdOrInode: <closed-scalar>
regularFile: true
symlinkOrReparsePoint: false
observedAt: <canonical-timestamp>
```

The proposal freezes every executable identity independently. A GitHub session
freezes both `launcherHostExecutableIdentity` and `nodeExecutableIdentity`;
bounded Git evidence/publication freezes `gitExecutableIdentity`. The broker verifies the
launcher-host identity immediately before creating the token-bearing launcher
process. The launcher verifies the Node identity immediately before creating
the Node child. The bounded Git caller verifies Git immediately before every
read. Each verifier re-resolves the same canonical path and compares
regular-file type, reparse/symlink state, file ID, size, SHA-256, version-output
bytes, and version. Any mismatch stops before token attachment or target-command
execution.

The source publisher invokes only `gitExecutableIdentity.canonicalPath`, never
bare `git` or PATH resolution. Its sole protocol is HTTPS and, for this
repository, its sole literal remote is
`https://github.com/gccwebos-com/proxy-gateway-minimal.git`. The proposal freezes
cwd, literal refspec, complete Git identity, canonical `gitExecPath` and raw
readback digest, the complete identity of the one `git-remote-https` executable
directly beneath that path, and the credential broker plus its complete prompt-
helper executable and bundle identities. All identities, the broker's one-shot
repository/branch/operation capability, and the raw `git --exec-path` result are
revalidated immediately before publication.

Publication also freezes a closed `PublisherEnvironment/v1` manifest and
digest. Process creation starts from an empty environment and adds only frozen
OS/temp roots, isolated empty HOME/USERPROFILE/XDG_CONFIG_HOME roots, a minimal
Git runtime PATH, `GIT_CONFIG_NOSYSTEM=1`, the exact `GIT_EXEC_PATH`,
`GIT_TERMINAL_PROMPT=0`, the exact `GIT_ASKPASS` helper path, and an opaque
single-use broker handle; raw credentials are never environment values. Every
unlisted key is absent. Git config injection, SSH/askpass/proxy overrides,
alternate object/index/worktree/common-dir/namespace inputs, raw tokens, and
raw credentials are explicitly forbidden. The prompt helper accepts only the
expected HTTPS username/password pair, and the broker invalidates its handle
after the one push attempt.

The proposal also freezes the digest of a complete origin/scope-aware Git config
inventory. That value is the lowercase SHA-256 of the exact NUL-delimited raw
bytes returned by the plan's fixed command; raw config is never logged.
System/global config is disabled or redirected to proposal-frozen empty roots;
local config is rejected unless every key is in the plan's exact non-network
allowlist. Includes, URL rewriting, remote URL/pushurl/refspec, credential
helpers, HTTP headers/proxies, SSH command, hooks, helper/environment identity
drift, and config drift block before the single create-only push.

Only `DOWNLOAD_SHADOW_RUN_LOGS` permits a redirect: one authenticated request
to the exact `api.github.com` run-log endpoint may return one HTTPS `Location`;
the Location must use port 443, contain no userinfo or IP literal, and have a
DNS host ending in `.actions.githubusercontent.com` or matching one label plus
`.blob.core.windows.net`. The follow-up drops Authorization and cookies,
permits no caller-controlled headers, performs one bounded GET, and rejects
another redirect. The signed URL
is ephemeral transport state and is never logged, persisted, or digested.

The sole foundation write operation accepts only canonical JSON bytes from a
closed builder. `CREATE_DRAFT_PULL_REQUEST` fixes `draft: true` and rejects
Ready/merge fields. Every proposal freezes a per-operation call budget. A lost write response permits
GET-only reconciliation and never another POST under the consumed approval.
The transport's own tests use an injected HTTPS adapter and token canaries; no
test requires a live token.

Candidate repository code never executes in a token-bearing process. The
transport's own bootstrap PR is published and read back only by a pre-existing
trusted connector or manual Operator path that executes no candidate code.
After that trust root is independently reviewed and merged, every later writer
loads the transport, helper, and complete transitive import closure from an
independent trusted-base checkout whose path/blob/SHA-256 manifest is frozen by
the Gate. Candidate worktrees are data only and cannot participate in module
resolution, hooks, credential helpers, or publication. Tokens are child-process
scoped to the verified broker -> PowerShell launcher -> Node transport chain and
are absent from candidate tests, Git push, ordinary/candidate shells, and check
polling outside that session.

## Foundation Shadow Evidence Boundary

The foundation shadow lane is observation-only relative to repository and
governance state. It may use only `actions: read` and `contents: read`. It must
not upload an Actions
artifact, save a cache, append a job summary, publish an Issue comment, check,
branch, commit, PR, Gate receipt, or other remote record, or execute candidate
code, Actions, or workflows. Its only application output is one redacted,
canonical, bounded stdout marker inside the ordinary Actions run log. The run,
check, and log records GitHub creates as execution by-products do not become
Gate receipts, release artifacts, or authorization evidence.

The foundation implementation may ship only a fixed-false workflow contract
until a separately delivered trusted credential broker and settings Gate can
prove the launcher path. In that state it receives no token and emits no marker;
`shadow_observation_enabled: false`. Enabling the job is a later source/settings
change, not an implementation detail of the foundation PR.

The observation window cannot start until a fresh read-only inventory proves
that Actions run/log retention covers the complete evaluation window and
freeze buffer. Missing or expired logs remain `missing` denominator rows; they
are never silently removed. The shadow workflow has no `workflow_dispatch`
path in the metric population. Any separately authorized diagnostic run is
recorded outside the natural-event denominator.

The trusted shadow reader derives closed failure facts from GitHub's canonical
source-run job/step metadata, not source-run log text or candidate output. It
uses `actions: read` to enumerate every job and step and `contents: read` to
read the exact source workflow blob and Git commit/PR identity at the run head
as inert data. That blob
must equal a policy-approved trusted workflow digest, and the observed job/step
names must match its closed inventory, before stable outcomes can enter
Attribution. A workflow change, missing job/step, duplicate identity, unknown
conclusion, or mismatch forces `unknown/abstain`. The head commit binds tree
identity. The canonical workflow-run-attempt readback supplies a sorted unique
PR-number list: exactly one number requires exact PR readback and matching run/
PR head identity before its `baseSha` is accepted; zero numbers uses the
commit's unique first parent; multiple numbers abstain. The trusted `runs-on`
scalar plus canonical job labels bind
the declared runner profile. The derived facts contain only workflow blob/byte/
permissions identity, run event/status/conclusion/selected check, head/base/tree
identity, declared runner identity, stable job/step names and outcomes, the
selected completion timestamp, a closed reason code, and their domain-separated evidence digest;
they contain no command output, log excerpt, path supplied by a PR, secret,
token, credential, or free text. Source-run logs are never downloaded.

The read client is a capability-narrow wrapper over `GitHubApiTransport/v1`.
Only after a future broker/settings Gate enables the fixed-false workflow may
the trusted broker provide a job-scoped token with `actions: read` and
`contents: read`; the foundation workflow receives none. A separately approved local collection Gate binds the native
transport and Node identities, expected actor node ID, repository, limits, API
version, and the exact read-only operation set. The wrapper exposes no write
method. Source-run log access remains forbidden; only ordinary shadow-run logs
may use the bounded redirect protocol above. Timeout, rate-limit, pagination,
actor, workflow, or response ambiguity produces a tagged `abstain` and no
partial manifest.

## Shadow Dataset Completeness Contract

A trusted read-only collector, not the evaluator caller, constructs the closed
`governance-shadow-dataset/v1` manifest from all matching source CI workflow
runs in the frozen window. It fully paginates the source-run inventory and
left-joins each source run/attempt to the expected shadow run and stdout marker.
This preserves source runs for which the shadow workflow never triggered.

```yaml
schemaVersion: "1"
repository: gccwebos-com/proxy-gateway-minimal
sourceWorkflow:
  path: .github/workflows/ci.yml
  blobOid: <git-blob-oid>
  contentSha256: <sha256>
  trustedPolicyDigest: <sha256>
shadowWorkflow: <canonical-workflow-identity>
windowStart: <canonical-timestamp>
windowEnd: <canonical-timestamp>
inventoryCutoffAt: <proposal-frozen-canonical-timestamp>
inventoryFilterDigest: <sha256>
inventoryPartitions:
  - fromInclusive: <whole-second-canonical-timestamp>
    throughInclusive: <whole-second-canonical-timestamp>
    reportedTotalCount: <integer-0-through-999>
    returnedCount: <same-integer>
inventoryPartitionDigest: <sha256>
paginationComplete: true
inventoryRowCount: <non-negative-integer>
rows:
  - runKey: <digest(repository|sourceWorkflowDigest|runId|runAttempt)>
    lineageKey: <immutable-failure-lineage-digest-or-null>
    sourceWorkflowDigest: <sha256-of-exact-workflow-bytes>
    sourceRunId: <github-run-id>
    sourceRunAttempt: <positive-integer>
    sourceHead: <full-sha-or-null>
    checkName: <canonical-check-name-or-null>
    failureSignatureDigest: <sha256-or-null>
    shadowRunId: <github-run-id-or-null>
    shadowRunAttempt: <positive-integer-or-null>
    parseStatus: valid | invalid | unparseable | missing
    evidenceDigest: <sha256-or-null>
    operatorAssessment:
      status: accepted_without_rewrite | rewrite_required | escalated | not_eligible | not_reviewed
      assessmentRefDigest: <sha256-or-null>
      assessorAuthorityDigest: <sha256-or-null>
      adjudicatedRisk: A | B | C | unknown | null
      evidenceComplete: true | false | null
      routeSafety: safe | unsafe | not_reviewed
      independentlyReviewed: true | false
      classificationCorrect: true | false | null
manifestDigest: <projection-digest>
```

`inventoryCutoffAt` is fixed in the ex-ante collection proposal and is part of
the signed filter. Every collection and later reconstruction uses that same
literal cutoff and excludes source or shadow runs whose canonical GitHub
creation time is after it. Actual query time is operational telemetry only: it
is not a signed field and cannot change the manifest. A row that existed at the
cutoff but is no longer retrievable remains a deterministic `missing` row from
the frozen source-run inventory; if that inventory itself can no longer be
reconstructed, the dataset is unavailable rather than silently shortened.

GitHub limits workflow-run searches using the `created` filter to at most 1,000
results. The collector therefore begins with 336 proposal-bound, contiguous
UTC-hour partitions. Each partition is a non-overlapping whole-second inclusive
range; its end is one second before the next partition begins. If GitHub reports
`total_count >= 1000`, the collector recursively bisects at a whole-second
boundary and discards the parent result. A one-second partition that still
reports 1,000 or more is unprovable and forces `abstain`. Every accepted leaf
must report fewer than 1,000, return exactly that count through complete
pagination, and participate in an ordered partition manifest that covers the
frozen window without gaps or overlap. Duplicate `(runId, runAttempt)` keys
across leaves, boundary drift, or any count mismatch is `abstain`; rows are not
silently deduplicated. `inventoryPartitionDigest` binds the complete leaf
manifest and is included in `inventoryFilterDigest` and `manifestDigest`.

The list result's `latestRunAttempt` is not treated as the attempt that existed
at the cutoff. For every run, the collector reads attempt numbers `1` through
the listed latest value using `READ_WORKFLOW_RUN_ATTEMPT`, retains only attempts
whose canonical `runStartedAt <= inventoryCutoffAt`, and constructs one row per
retained attempt. It then repeats the complete partition inventory GET and
requires the `(runId, latestRunAttempt)` snapshot and partition digest to be
unchanged. A post-cutoff rerun is excluded by `runStartedAt`; an attempt-count
change during collection, an unavailable intermediate attempt, or inability to
reconstruct cutoff-time attempt membership makes the dataset unavailable. The
same rule applies to source and shadow runs; later attempts cannot replace the
natural first shadow attempt.

Every source run/attempt produces exactly one row. Duplicate run keys, an
incomplete pagination proof, a caller-preselected dataset, a mismatched source
or shadow identity, or an assessment without durable identity and authority
provenance fails closed. Reruns remain inventory rows, but the minimum event
count uses unique `lineageKey` values so reruns cannot inflate the sample.
For the shadow workflow, only the natural first attempt for that trigger may
populate `shadowRunId`/`shadowRunAttempt`; a manual rerun is recorded as
diagnostic metadata and cannot replace a missing/invalid natural attempt or
enter a metric denominator.

The key preimages are closed and domain-separated:

```text
runKey = SHA256(
  SHADOW_RUN_KEY:v1\0 || canonicalJsonBytes({
    repository, sourceWorkflowPath, sourceWorkflowDigest,
    sourceRunId, sourceRunAttempt
  })
)

lineageKey = SHA256(
  FAILURE_LINEAGE:v1\0 || canonicalJsonBytes({
    repository, sourceWorkflowPath, sourceHead,
    checkName, failureSignatureDigest
  })
)
```

The trusted Observer derives `failureSignatureDigest` from closed, redacted
failure facts and excludes run/shadow IDs, attempts, timestamps, and free text.
Only a schema-valid failure row has a `lineageKey`; non-failure and missing or
unparseable rows use `null`, remain in parseability, and cannot increase the
minimum lineage count.

Operator assessments are modeled before final evaluation, but this foundation
does not publish them. A future read-only candidate Gate must freeze the exact
336-hour window, `inventoryCutoffAt`, source/shadow workflow identities, Task
merge SHAs, collector/reader/native-transport/Node identities, endpoint set,
pagination and byte limits, and one-shot collection budget before collection.
The collector cannot choose a later window or favorable subset after observing
results.

The same future proposal must contain the complete sorted target set and closed
assessment template. The Operator supplies adjudicated risk, evidence
completeness, route safety, independent-review, classification-correctness, and
disposition; the framework never self-approves them. Those complete decisions
are frozen before approval, and the read-only candidate session accepts no new
decision input. The pure builder API is exact:

```js
buildAssessmentTemplate({ targets, operatorDecisions, windowDigest, datasetDigest, gateId })
finalizeAssessmentCandidate({ template })
```

`targets` are unique and sorted by `runKey`; `operatorDecisions` must cover the
same keys exactly. The template is:

```yaml
schemaVersion: "1"
batchId: <safe-id>
gateId: <gate-id>
repository: gccwebos-com/proxy-gateway-minimal
issueNumber: 437
windowDigest: <sha256>
datasetDigest: <sha256>
entries: <complete-sorted-closed-entry-list>
templateDigest: <projection-digest>
```

`templateDigest` uses `SHADOW_ASSESSMENT_TEMPLATE:v1\0` after deleting only
`templateDigest`. Candidate finalization accepts no proposal/approval readback,
actor, authority, receipt, timestamp, expiry, publication, or copied durable
input. It validates the complete template and embeds it byte-for-byte in this
closed local candidate:

```yaml
schemaVersion: "1"
candidateType: shadow_assessment_candidate
template:
  schemaVersion: "1"
  batchId: <safe-id>
  gateId: <gate-id>
  repository: gccwebos-com/proxy-gateway-minimal
  issueNumber: 437
  windowDigest: <sha256>
  datasetDigest: <sha256>
  entries: <complete-sorted-closed-entry-list>
  templateDigest: <sha256>
assessmentDigest: <projection-digest>
```

The `SHADOW_ASSESSMENT:v1\0` projection deletes only `assessmentDigest`; the
nested `templateDigest` remains covered. The candidate is local, redacted,
read-only, and same-invocation only. It is not a Gate receipt, approval record,
Issue comment, cross-Gate handoff, durable authority, or activation input and
cannot prove that its Operator decisions were durably authorized. A future
read-only Gate may bind `assessmentDigest` in separate ordinary proposal and
terminal-receipt records, but those external records never alter this schema or
grant publication authority.

Real assessment or evaluation publication is explicitly deferred. The
foundation transport does not expose `CREATE_ISSUE_COMMENT`. Before a future
version may add and call that operation, a separate source/settings
program must deliver all of the following as one reviewed protocol family:

- a closed `governance-evidence-publication-plan/v1` schema and digest domain;
- an approval event bound to that publication-plan digest, exact object type,
  repository, Issue, body digest, actor policy, expiry, and parent receipt;
- an atomic one-winner publication claim and single-use approval consumption
  mechanism with a protected namespace and machine-enforced capability set;
- a provenance verifier and Admission API specialized for evidence publication;
- lost-response, concurrent-writer, replay, late-duplicate, and reconciliation
  tests that prove no second POST is possible under one consumed approval.

The Repair Plan approval/claim types are not aliases for this protocol. Issue
comment absence/readback alone is not an atomic claim. Until the future protocol
is merged, protected, and independently enabled, assessment/evaluation
publisher modules and CLIs are absent. Foundation contract validation rejects
any module graph, workflow, plan, operation set, or CLI surface containing
`CREATE_ISSUE_COMMENT` or a framework-evidence publication entry point. Because
no callable publication entry point exists, foundation code does not promise a
runtime `publisher_disabled` result. Rejection is static or pre-admission and
occurs before a token-bearing transport session can be constructed.

The evaluator revalidates the filter digest, pagination proof, row count,
unique keys, assessment provenance, manifest digest, and every nullable-field
rule. It emits a schema-valid local candidate with its own
`evaluationDigest`; it does not publish that candidate or grant activation.

Shadow evaluation uses these fixed minimums and denominators:

```yaml
minimum_window_hours: 336
minimum_unique_failure_lineages: 20
minimum_proposal_dispositions: 10
minimum_independently_reviewed_auto_routes: 10
machine_parseable_results: ">=95%"
known_BC_attribution_coverage: ">=80%"
proposals_accepted_without_rewrite: ">=70%"
false_safe_route: 0
unauthorized_mutations: 0
Risk_A_auto_execution: 0
retry_budget_exceeded_without_escalation: 0
```

The local evaluation candidate is the following closed envelope; no additional
metric, timestamp, free-text reason, or nullable field is permitted:

```yaml
schemaVersion: "1"
repository: gccwebos-com/proxy-gateway-minimal
window:
  start: <canonical-timestamp>
  end: <canonical-timestamp>
  hours: 336
inventoryCutoffAt: <canonical-timestamp>
inventoryFilterDigest: <sha256>
manifestDigest: <sha256>
assessmentDigest: <sha256>
collectorIdentityDigest: <sha256>
evaluatorIdentity:
  evaluatorVersion: <version>
  evaluatorBinaryDigest: <sha256>
evaluationAsOf: <same-value-as-inventoryCutoffAt>
evidenceUsabilityExpiresAt: <inventoryCutoffAt-plus-seven-days>
minimums:
  uniqueFailureLineages: 20
  proposalDispositions: 10
  independentlyReviewedAutoRoutes: 10
counts:
  sourceRunRows: <non-negative-integer>
  uniqueFailureLineages: <non-negative-integer>
  proposalDispositions: <non-negative-integer>
  independentlyReviewedAutoRoutes: <non-negative-integer>
metrics:
  machineParseableResults:
    numerator: <non-negative-integer>
    denominator: <non-negative-integer>
    minimumBasisPoints: 9500
    actualBasisPoints: <integer-0-through-10000-or-null>
    status: pass | fail | insufficient
  knownBCAttributionCoverage:
    numerator: <non-negative-integer>
    denominator: <non-negative-integer>
    minimumBasisPoints: 8000
    actualBasisPoints: <integer-0-through-10000-or-null>
    status: pass | fail | insufficient
  proposalsAcceptedWithoutRewrite:
    numerator: <non-negative-integer>
    denominator: <non-negative-integer>
    minimumBasisPoints: 7000
    actualBasisPoints: <integer-0-through-10000-or-null>
    status: pass | fail | insufficient
zeroInvariants:
  falseSafeRoute: <non-negative-integer>
  unauthorizedMutations: <non-negative-integer>
  riskAAutoExecution: <non-negative-integer>
  retryBudgetExceededWithoutEscalation: <non-negative-integer>
result: passed | changes_required | insufficient_evidence
reasonCodes: [<closed-sorted-reason-code>]
evaluationDigest: <projection-digest>
```

`assessmentDigest` must bind one schema-valid local candidate from the same
invocation. It is not a durable assessment reference and confers no approval or
publication authority.

For every metric, `actualBasisPoints` is `null` if and only if the denominator
is zero and status is `insufficient`; otherwise it is
`floor(numerator * 10000 / denominator)` and status is derived from the fixed
minimum. A count below any fixed minimum makes the overall result
`insufficient_evidence`. Any metric `fail` or non-zero safety invariant makes
the result `changes_required`. `passed` requires every minimum, metric, and
zero invariant to pass. `evaluationAsOf` equals `inventoryCutoffAt` exactly;
`evidenceUsabilityExpiresAt` is deterministically seven days later. Actual
query or execution time is excluded from the envelope and digest.

Parseability includes every canonical source-run row, including `missing`,
`invalid`, and `unparseable`. Known B/C coverage includes all independently
adjudicated, evidence-complete non-A lineages; unknown and abstained results
remain in its denominator. Proposal acceptance counts only same-invocation
candidate entries whose exact template was externally frozen by that read-only
Gate; the candidate itself does not prove durability. False-safe routing covers every
independently reviewed auto-eligible route. A zero or below-minimum denominator
is `insufficient_evidence`, never a passing zero or 100 percent.

The local candidate is not a durable receipt. It cannot cross a Gate through a
temporary file, stdout marker, Actions artifact, cache, or copied Issue body.
The current foundation therefore stops at local candidate construction and
contract tests; it does not claim a live evaluation result.

A future durable publication program must regenerate the complete dataset and
evaluation inside the same admitted writer execution from canonical GitHub GET
evidence, then require the regenerated digests to equal its publication-plan
bindings. It may proceed only after the publication-specific plan, approval,
atomic claim, single-use consumption, protected capability, and reconciliation
protocol listed above exist. The writer must use the frozen trusted launcher and
`GitHubApiTransport/v1`; an ordinary Repair Plan approval, Issue-comment absence
check, invocation-local POST budget, or copied candidate is insufficient. Until
then `shadow_evaluation_durable: false` and no Task or receipt may claim
`shadow_framework: evaluated`.

## GitHub Actions Runtime Architecture

The privileged workflow architecture below belongs to the later activation
program. The foundation implementation delivers only the shadow boundary above
and pure or disabled contracts; it does not register these write jobs.

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
  remoteRefAbsentBeforePush: true
  createOnlyPush: true
  emptyExpectedValueLease: true
  forcePush: false
  reuse: false
pullRequest:
  base: master
  draft: true
  expectedTitleSha256: <sha256>
  expectedBodySha256: <sha256>
  expectedAuthorNodeId: <node-id>
  autoReady: false
  autoMerge: false
  checkRerun: false
  reviewThreadMutation: false
```

Execution order is fixed:

1. In the no-write trusted-preflight job, check out the exact mutation target,
   verify a clean tree/index, dry-run and apply the plan-contained exact file
   replacements in an
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
   verify a clean tree/index, and write the exact approved replacement bytes
   once.
7. Verify actual files, semantic delta, before/after trees, blobs, modes,
   symlinks, generated files, and transport contracts using only pinned
   trusted-base code. Never execute candidate tests, scripts, Actions,
   workflows, hooks, or package lifecycle code in a write-token job.
8. Create exactly one commit. Immediately before publication, prove the remote
   branch does not exist through canonical `READ_GIT_REF` `404/not_found`
   evidence. A trusted create-only publisher then pushes `taskHead` to the
   deterministic ref without `+`, force, ref reuse, hooks, candidate config, or
   credential-helper fallback. Read the remote ref back exactly and create one
   Draft PR.
9. Continue through a separate `needs`-bound trusted exact-head job in the
   same protected workflow run. It ignores upstream authority claims, freshly
   reads the Draft PR head, and treats candidate content only as inert data.
10. Require the exact candidate head, trusted validator and workflow SHAs,
   expected App, and successful check before recording validation success.

The PR body records observation, attribution, plan, approval, claim, policy,
before/after tree, commit, validation, and withdrawal evidence. Proposal-bound
canonical title/body byte digests and expected author node ID are verified on
the create response, ordinary readback, lost-response list-by-head
reconciliation, and every later exact-head read. Matching head/base/Draft alone
is insufficient. No workflow or receipt claims that the Draft PR is Ready,
merge-approved, deployed, or production-aligned.

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

Any local readback waiting for ordinary exact-head checks uses proposal-bound
bounded polling: at most 60 GET-only polls, a 30-second interval, and an exact
absolute deadline no later than 30 minutes after the first poll. Head/Draft/
state drift, an unexpected check, or a terminal non-success conclusion blocks
immediately. Pending checks may remain pending only until the next bounded
poll; deadline expiry is blocked. Polling never reruns a check or workflow and
never mutates GitHub state.

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
9. An Actions installation token is sent to a user-only endpoint, a triggering
   actor is misrepresented as credential principal, or inherited Node/TLS/proxy
   state intercepts a token before the trusted transport.

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
- workflow-run search caps, partition gaps/overlaps, or post-cutoff reruns
  silently remove or add denominator rows.

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
| Self-digest included in its own preimage or wrong field projected out | Projection/vector rejection. |
| Actor unauthorized or removed after approval | Fresh role readback rejects execution. |
| Comment edited, deleted, duplicated, or replayed | Invalidated; never consumed twice. |
| Two runners consume concurrently | Durable claim has exactly one winner. |
| Claim ref is deleted, replaced, recreated, or either ruleset/bypass set changes | Repository claim-capability proof and dual-ruleset readback reject execution; reconciliation required. |
| Approve and withdraw race | Proved order or blocked result. |
| Same branch name exists | Collision; no reuse or force-push. |
| Shadow workflow uploads an artifact, saves a cache, or appends a summary | Static workflow rejection. |
| Source-run pagination is incomplete or a missing shadow trigger is omitted | Dataset completeness rejection. |
| A created-time search reaches 1,000 results, partitions overlap/gap, or a one-second leaf remains saturated | Recursive proof or `abstain`; never claim complete pagination. |
| A rerun appears after the cutoff or during collection | Exclude by attempt `runStartedAt`; snapshot drift makes the dataset unavailable. |
| Installation auth calls `/user`, claims a user actor, or inherits preload/TLS/proxy state | Authentication/launcher rejection before any authorized operation. |
| A publisher trusts copied proposal/approval JSON instead of canonical GET evidence | Provenance rejection before write. |
| Metric denominator is zero/below minimum or lacks durable review provenance | `insufficient_evidence`; never passing. |
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
  - self_digest_projection
  - fixed_digest_vectors
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
  - complete_source_run_inventory
  - missing_shadow_left_join
  - durable_assessment_provenance
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

## Project-state Selector Manifest

The later status synchronization does not rely on guessed anchors. Task 1
delivers a read-only `ProjectStateSelector/v1` validator. A separate inventory
Gate constructs this closed manifest from the then-current six authority files:

```yaml
schemaVersion: "1"
repository: gccwebos-com/proxy-gateway-minimal
baseHead: <full-sha>
files:
  - path: <one-of-the-six-authority-paths>
    fileSha256: <sha256>
    fileSize: <non-negative-integer>
    expectedAfterFileSha256: <sha256>
    expectedAfterFileSize: <non-negative-integer>
    selectors:
      - kind: json_pointer
        pointer: <canonical-rfc6901-pointer>
        expectedMatchCount: 1
        beforeValueDigest: <sha256>
        afterValueType: canonical_json
        afterValueBase64: <canonical-standard-base64>
        afterValueDigest: <sha256>
        afterValueSize: <non-negative-integer>
      - kind: markdown_region
        selectorId: <safe-selector-id>
        expectedMatchCount: 1
        beforeValueDigest: <sha256>
        afterValueType: utf8_markdown_body
        afterValueBase64: <canonical-standard-base64>
        afterValueDigest: <sha256>
        afterValueSize: <non-negative-integer>
manifestDigest: <projection-digest>
```

Inventory constructs each complete expected after-file in memory and freezes
its SHA-256 and size. Pre-mutation verification requires the current bytes to
equal `fileSha256` and `fileSize`; post-mutation verification requires the
complete current file to equal `expectedAfterFileSha256` and
`expectedAfterFileSize`. This is the standalone proof that selected bodies have
the approved values and every non-selected byte is unchanged.

Manifest arrays are already canonical and are never silently normalized.
`files` are strictly increasing by Unicode code-point order of NFC `path`.
Within each file, selectors are strictly increasing by
`(kindOrder, selectorKey)`: `json_pointer` has order `0`, `markdown_region` has
order `1`, and `selectorKey` is respectively `pointer` or `selectorId`, compared
by Unicode code point. Markdown selector IDs are globally unique. Duplicate or
unsorted arrays are contract errors. `manifestDigest` uses
`PROJECT_STATE_SELECTOR:v1\0` after deleting only `manifestDigest`. The
validator proves every whole-file identity, exactly one match, before-value
digest, after-value type/bytes/digest/size, and selector non-overlap.

`json_pointer.pointer` is a canonical RFC 6901 string beginning with `/`;
segments use only the canonical `~0` and `~1` escapes, array indices use `0` or
a non-zero digit followed by digits, and a dangling/non-canonical `~`, missing
target, append token, or type mismatch blocks. The selected existing JSON value
is the replacement interval and `afterValueBase64` decodes to canonical JSON of
the proposal-bound type. `beforeValueDigest` hashes the canonical JSON bytes of
the selected value; after size/digest cover the decoded canonical JSON bytes.

`markdown_region.selectorId` matches
`[a-z0-9][a-z0-9._-]{0,63}`. It defines the literal UTF-8 full lines
`<!-- project-state-selector:<selectorId>:start -->` and
`<!-- project-state-selector:<selectorId>:end -->`. Each delimiter must occur
exactly once as a whole line, use the file's existing LF or CRLF terminator,
and the end line must follow the start line with the same terminator style. The
file must use one uniform line-ending style; mixed line endings block. The
selected raw-byte body begins after the start-line terminator and ends before
the end-line first byte; delimiter bytes are never replaced. Body digests,
sizes, and Base64 values cover those exact raw bytes. Files are UTF-8,
BOM-free, and NUL-free, but line endings are preserved byte-for-byte and never
normalized. All ranges are frozen before mutation, must be disjoint, and are
applied in descending byte-offset order to temporary siblings. The temporary
file must remain valid UTF-8, preserve every non-selected byte, and must not
introduce a duplicate delimiter or overlap.

The verifier/applicator CLIs accept only four closed input envelopes. Inventory
input is exactly:

```yaml
schemaVersion: "1"
mode: inventory
repository: gccwebos-com/proxy-gateway-minimal
baseHead: <full-sha>
repositoryRoot: <canonical-absolute-path>
selectorRequest:
  schemaVersion: "1"
  files:
    - path: <one-of-the-six-authority-paths>
      selectors:
        - kind: json_pointer
          pointer: <canonical-rfc6901-pointer>
          expectedMatchCount: 1
          afterValueType: canonical_json
          afterValueBase64: <canonical-standard-base64>
          afterValueDigest: <sha256>
          afterValueSize: <non-negative-integer>
        - kind: markdown_region
          selectorId: <safe-selector-id>
          expectedMatchCount: 1
          afterValueType: utf8_markdown_body
          afterValueBase64: <canonical-standard-base64>
          afterValueDigest: <sha256>
          afterValueSize: <non-negative-integer>
```

`ProjectStateSelectorRequest/v1` contains exactly `schemaVersion` and `files`;
each file contains exactly `path` and `selectors`, and each selector is exactly
one of the two discriminated shapes above. `selectorRequest` contains no
caller-supplied file hash, before-value digest,
matched offset, expected-after file identity, or inferred selector. Verification
inputs are exactly:

```yaml
# pre-mutation
schemaVersion: "1"
mode: pre-mutation
repositoryRoot: <canonical-absolute-path>
manifestBase64: <canonical-standard-base64>
manifestDigest: <sha256>
expectedHead: <manifest-baseHead>

# post-mutation
schemaVersion: "1"
mode: post-mutation
repositoryRoot: <canonical-absolute-path>
manifestBase64: <canonical-standard-base64>
manifestDigest: <sha256>
target:
  kind: worktree | commit
  head: <full-sha>
  parentHead: <full-sha-or-null>
```

For a `worktree` post target, `head` equals `manifest.baseHead` and
`parentHead` is `null`; the verifier reads the expected dirty authority files.
For a `commit` target, `head` is the proposal-bound exact commit,
`parentHead` equals `manifest.baseHead`, the worktree is clean, and the verifier
reads that commit tree. Any other topology blocks. Apply input is exactly:

```yaml
schemaVersion: "1"
mode: apply
repositoryRoot: <canonical-absolute-path>
manifestBase64: <canonical-standard-base64>
manifestDigest: <sha256>
expectedHead: <manifest-baseHead>
```

Every command writes one closed `ProjectStateSelectorCommandResult/v1`. Its
root fields are exactly `schemaVersion`, `mode`, `status`, `manifestDigest`,
`evidence`, `mutationState`, `canonicalResult`, `reasonCodes`, and
`resultDigest`. Accepted inventory evidence is exactly
`{ manifestBase64, fileCount, selectorCount }`; the root `manifestDigest` plus
this embedded Base64 value is the sole manifest output. Accepted pre-mutation
evidence is exactly `{ verifiedHead, verifiedParentHead: null,
targetKind: worktree, verifiedFileCount, verifiedSelectorCount }`. Accepted
post-mutation evidence is exactly `{ verifiedHead, verifiedParentHead,
targetKind, verifiedFileCount, verifiedSelectorCount,
nonSelectedBytesPreserved: true }`. Accepted apply evidence is exactly
`{ baseHead, changedPaths, preVerificationPassed: true,
postVerificationPassed: true }`.
Accepted status is `accepted`, `mutationState` is `none` except `completed` for
apply, `canonicalResult` is `passed`, and `reasonCodes` is empty.

The non-accepted `oneOf` permits only these tuples; `evidence` is always `null`
and `reasonCodes` is a sorted unique closed list:

| Mode/phase | `status` | `mutationState` | `canonicalResult` |
| --- | --- | --- | --- |
| inventory, pre-mutation, or post-mutation | `blocked` | `none` | `blocked` |
| inventory, pre-mutation, or post-mutation | `contract_error` | `none` | `blocked` |
| inventory, pre-mutation, or post-mutation | `internal_error` | `none` | `unavailable` |
| apply, before first replacement | `blocked` | `none` | `blocked` |
| apply, before first replacement | `contract_error` | `none` | `blocked` |
| apply, before first replacement | `internal_error` | `none` | `unavailable` |
| apply, after first replacement | `reconciliation_required` | `unknown` | `unavailable` |

Read-only modes never emit `reconciliation_required`. A contract error is
always pre-execution. Any apply failure after the first replacement, including
an internal/output persistence failure, is normalized to the final tuple above;
no `internal_error + unknown` variant exists. Exit `0/20/30/64/70` maps
respectively to accepted/blocked/reconciliation-required/contract-error/
internal-error. The result digest
uses `PROJECT_STATE_SELECTOR_RESULT:v1\0` after deleting only `resultDigest`.
For accepted results `manifestDigest` is non-null and exact; for non-accepted
results it is null only when no canonical manifest could be parsed, otherwise it
must equal that parsed manifest. Stdout is empty; no implicit second manifest or
result file exists.

Missing, duplicate, reversed, overlapping, or changed selectors block. Literal
fixed vectors cover LF, CRLF, Unicode, an empty body, delimiter text that is not
a whole line, mixed-EOL rejection, duplicate/missing/reversed delimiters,
overlap, an after body that introduces a duplicate delimiter, invalid UTF-8,
JSON `~0`/`~1` and array indices, unsorted file/selector rejection, every CLI
input/result mode, plus exact unchanged non-selected bytes. Each positive vector
freezes input/output Base64, matched raw offsets, before/after body digests,
before/expected-after whole-file SHA-256/size, final-file SHA-256, and command-
result digest; expected values are literal and never generated by the test.

The three current Markdown authority files contain no selector delimiters. After
the seven source PRs merge and before inventory, one independent C-tier
marker-bootstrap PR modifies only `docs/CURRENT_RELEASE_STATE.md`,
`RELEASE_MANIFEST.md`, and `docs/PROJECT_CONTEXT.md`. Its proposal binds the
exact master/file identities, globally unique selector IDs, and literal
full-line insertion boundaries. It may insert only paired start/end marker
lines; removing those new lines must reproduce every pre-change byte and
SHA-256. It cannot change, reorder, rewrap, normalize, or synchronize existing
content. `docs:authority:check`, `project-state:check`, marker-stripping byte
identity, exact scope, both diff checks, and exact-head validation must pass.
Selector inventory is ineligible until that PR is independently reviewed,
Ready, merged, and rebound as current master.

The later C-tier mutation Gate binds the resulting manifest and may replace
only the exact selected
values through the reviewed `applyProjectStateSelectors({ repositoryRoot,
manifestBytes })` applicator; it accepts no free-text path, selector, or value.
The applicator pre-verifies all six files, constructs and validates temporary
sibling bytes, then performs bounded per-file atomic replacement and
post-verification. Failure before the first replacement proves no mutation;
failure after any replacement is `status: reconciliation_required`,
`mutationState: unknown`, and `canonicalResult: unavailable` without retry. The
post-mutation verifier proves all other bytes and paths unchanged.

## Delivery Sequence

The implementation sequence is:

1. Close PR #499 through independent review, Ready, and merge decisions.
2. Deliver canonical JSON, domain-separated digest utilities, schemas, ledger
   events, the closed native read transport, trusted launcher, and selector
   verifier/applicator in one B-tier PR.
3. Deliver Observation and deterministic Attribution in read-only shadow mode.
4. Deliver Repair Plan, short approval parsing, and provenance verification.
5. Deliver pure pre/post-claim Admission with synthetic claim state only.
6. Deliver the bounded executor contract with no registered write adapter and
   no enabled workflow caller.
7. Deliver the fixed-false read-only Actions shadow contract, the complete
   read-only dataset collector, pure local evaluator contracts, and no evidence
   writer.
8. Deliver foundation failure-injection coverage.
9. Insert only the required Markdown selector delimiters through one independent
   C-tier marker-bootstrap PR; then freeze and validate one selector manifest
   read-only and synchronize merged-source/explicitly-not-enabled facts through
   a second independent C-tier project-state PR.
10. Close the read-only foundation program. No live assessment/evaluation
    publication is a completion condition.
11. In a future independent program, deliver the evidence-publication Plan,
    approval, atomic claim, Admission, protected capability, and writer.
12. Only after separate threat review and exact source/settings Gates may a
    future program collect live shadow metrics and consider one workflow-repair
    category. Artifact, deployment, and production remain later programs.

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
- Actions run/log retention long enough for the complete shadow evaluation
  window and freeze buffer, or a separately approved durable evidence mechanism
  that does not weaken the shadow read-only boundary.

## Design Exit State

```yaml
Governed_Repair_Framework:
  architecture: complete
  machine_contracts: complete
  authorization_model: complete
  execution_boundary: complete
  threat_model: complete
  read_only_foundation_implementation_ready: true
  governance_evidence_publication_implementation_ready: false
  router_contract_version: v2_required
  shadow_dataset_collector_complete: false
  shadow_observation_enabled: false
  shadow_evaluation_durable: false
  evidence_publication_admission_present: false
  atomic_evidence_publication_claim_present: false
  real_receipt_adapter_present: false
  artifact_publication_present: false
  write_executor_activation_ready: false
  write_executor_enabled: false
  production_authority: false
```

The framework is ready for an implementation plan. It is not ready for write
executor activation, Artifact Gate, deployment, or production alignment.
