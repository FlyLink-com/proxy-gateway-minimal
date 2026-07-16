# Governed Repair Framework Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to execute this plan task-by-task. Every source
> task requires its own durable Gate, fresh identity binding, formal review,
> Ready approval, and merge approval.

**Goal:** Implement the source-only foundation of the Governed Repair
Framework: immutable failure observation, deterministic attribution,
policy-routed Repair Plans, provenance verification, pure Admission decisions,
a disabled bounded executor contract, a disabled read-only Actions shadow
contract, and
foundation threat-contract tests, plus the closed native GitHub evidence
transport, trusted launcher, and project-state selector verifier/applicator
needed to execute the plan. Governance-evidence publication remains a future
program because this foundation does not deliver an atomic publication claim.

**Architecture:** Reuse the Gate ledger, lifecycle validator, retry budget, and
Policy Router from PR #499 after their compatibility review. Add one canonical
contract/digest layer, keep facts, interpretation, authorization, execution,
and evidence as separate modules. The automatic repair publisher and executor
write adapters remain absent. A closed native GitHub REST transport exposes
only the proposal-bound Draft-PR operation for independently approved source
Gates; it grants no automatic authority. The only GitHub Actions surface
delivered here is a fixed-false, zero-token shadow workflow contract.

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
  shadow_read_only_candidate_sessions: 0
  project_state_marker_bootstrap_prs: 1
  project_state_selector_inventory_gates: 1
  shadow_assessment_publication_gates: 0
  evaluation_receipt_publication_gates: 0
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
| General process execution transport | `docs/EXECUTION_CONTRACT_V1.md` and `server/services/execution-contract.mjs` | Existing source authority; not used as a GitHub JSON/stdin adapter |
| Closed GitHub REST transport | `GitHubApiTransport/v1` in Task 1 | Planned native Node authority; no `gh` or credential fallback |
| Ledger, retry budget, transition validation, shared routing | PR #499 after compatible review and merge | Hard dependency, not trusted while Draft |
| Historical Phase 1 roadmap | `docs/superpowers/plans/2026-07-15-semi-automated-governance-phase1.md` | Historical; superseded for Tasks 1-9 execution |

This plan does not create a second ledger, router, retry budget, state machine,
business-state database, release registry, or execution contract. PR #499 must
not merge with the two known incompatible semantics. If an independently
discovered, already-published v1 contract later needs migration, that migration
requires a separate versioned plan and Gate; Task 1 cannot silently reinterpret
or rewrite v1 history.

## Non-goals

The following remain outside every Gate in this plan:

- a real GitHub claim writer or protected claim-tag namespace;
- a general or automatic GitHub write adapter; Task 1 adds only a closed native
  Node REST transport whose sole write operation creates a proposal-bound Draft
  PR for independently approved source delivery;
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
source implementation remains incomplete because the real claim writer,
repair-branch publisher, automatic Draft-PR caller, evidence-publication
Admission/writer, and activated write executor are deliberately absent. The
native transport and exact-head reader grant no automatic execution authority.
Completion is not activation eligibility.

## Hard Prerequisite: Close PR #499 Compatibly

No source task below may begin until PR #499 has an independent formal review,
has been synchronized with current `origin/master`, has new exact-head checks,
and has been separately approved Ready and merged.

The compatibility work is one bounded migration inside the existing #499 PR,
not a new Router or a second ledger. Its allowed files are the existing
Attribution, policy, Router, ledger-schema, validator, and focused test files in
#499; it must not modify application behavior, deployment, credentials,
settings, or production. Because PR #499 is not merged, newly emitted V1
Attribution/Route fixtures are replaced by V2 rather than rewritten later.

The compatibility delta is limited to these existing candidate surfaces:

- `project-state/repair-policy.json`;
- rename `schemas/failure-attribution-v1.schema.json` to
  `schemas/failure-attribution-v2.schema.json`;
- rename `schemas/repair-policy-v1.schema.json` to
  `schemas/repair-policy-v2.schema.json`;
- `.github/workflows/governance-validate.yml` (schema path/name references only);
- `schemas/gate-ledger-v1.schema.json`;
- `scripts/check-gate-governance.mjs`;
- `scripts/check-project-state.mjs`;
- `server/services/governance/gate-governance.mjs`;
- `server/tests/ci-workflow-contract.test.mjs` (focused path-contract assertion only);
- `server/tests/gate-governance.test.mjs`.

Any additional file need is scope expansion and requires a revised proposal;
it is not repaired inside the execution window.

The exact Attribution V2 record is:

```yaml
schemaVersion: "2"
observationDigest: <sha256>
classifierVersion: <version>
classifierRulesDigest: <sha256>
classifierMode: deterministic | assisted | unknown
category: <closed-PR-499-category>
reasonCode: <closed-versioned-code>
technicalImpact: []
confidence: high | medium | low
affectedInvariants: []
evidenceRefs: []
decisionReason:
  category: <closed-code>
  blockers: []
  missingEvidence: []
```

`failureRisk`, `governanceRisk`, `approvalRequired`, lane, file scope, and
mutation authority are forbidden Attribution fields. The compatible Router V2
must accept Gate risk, the Attribution record/digest, scope, policy identity,
and immutable retry lineage, and return this closed shape:

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

`routeGateFailure()` is a pure policy function and returns
`{ ok: true, code: 'accepted', value: { record, routerResultDigest } }`; the
sidecar uses `ROUTER_RESULT:v2\0` over the complete closed record. An
`operator_review` route is an accepted decision. Malformed contracts throw the
shared contract error; expected denial or unknown state uses the shared tagged
failure form. The route event and every Repair Plan bind that digest, so
repository, Gate risk, scope, policy, or lineage changes cannot replay the
decision.

The #499 migration also replaces the newly emitted V1 route event with this
closed V2 ledger event:

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

The validator recomputes the sidecar digest and requires the duplicated retry
and policy fields to equal the embedded Router record. `repairAttempts` is
forbidden in V2. Historical V1 events are read only by their frozen V1 schema
and cannot be mixed into a V2 lineage.

The policy must contain closed category, target-path, capability, and protected
scope risk floors. `governanceRisk` is their maximum with the Gate risk. A
workflow trust-root path has at least a B floor; permission expansion, OIDC,
secret, deploy, provider, runtime, production, validator/executor self-change,
identity/authority drift, and scope expansion are protected and cannot enter
the automatic lane. Risk A, unknown or low-confidence Attribution, policy
conflict, and exhausted budget always route to `operator_review`.

The #499 policy migration uses this closed V2 structure so the Router does not
invent risk rules in code:

```yaml
schemaVersion: "2"
retryBudget: { A: 0, B: 1, C: 1 }
categoryRiskFloor:
  baseline_identity_drift: A
  business_contract: A
  execution_transport: C
  transport_format: C
  docs_metadata: C
  test_fixture: B
  ci_configuration: B
  unknown: A
pathRiskFloors:
  - { prefix: ".github/workflows/", risk: B }
  - { prefix: ".github/actions/", risk: B }
  - { prefix: "server/services/governance/", risk: B }
capabilityRiskFloors: {}
protectedCapabilities:
  - permission_expansion
  - oidc
  - secret_access
  - deployment
  - provider
  - runtime
  - production
  - validator_self_change
  - executor_self_change
autoProposalCategories:
  - ci_configuration
  - docs_metadata
  - execution_transport
  - test_fixture
  - transport_format
escalationInvariants:
  - contract_change
  - credential_boundary
  - production_boundary
  - scope_drift
  - security_boundary
  - sensitive_output
```

Arrays are unique and sorted, prefix matching is repository-relative and
segment-aware, and a category absent from the closed map is invalid rather than
defaulted. Auto-proposal eligibility cannot lower any risk floor or protected
capability result.

The #499 RED/GREEN migration must prove that old `failureRisk` and
`approvalRequired: false` fixtures fail, V2 schema and Router output pass,
historical V1 fixtures remain explicitly isolated, retry lineage cannot reset,
ordinary workflow-only repair has the B floor, and protected paths remain
Operator-only. Task 1 consumes these exact merged V2 contracts and must not
repair them after #499 merges.
The focused GREEN command is
`node --test server/tests/gate-governance.test.mjs server/tests/ci-workflow-contract.test.mjs`;
the workflow test must prove every sparse-checkout/schema reference uses the V2
filenames and no V1 execution path remains.

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
  -> PR 6 disabled read-only Actions shadow contract and pure evidence builders
  -> PR 7 cross-component failure injection
  -> C-tier Markdown marker bootstrap
  -> read-only selector inventory Gate
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
contract_field_missing
contract_field_invalid
schema_id_unsupported
digest_mismatch
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
OBSERVATION_ID:v1\0
ATTRIBUTION:v2\0
ROUTER_RESULT:v2\0
PLAN:v1\0
APPROVAL:v1\0
CLAIM:v1\0
EXECUTION:v1\0
RECEIPT:v1\0
SHADOW_DATASET:v1\0
SHADOW_EVALUATION:v1\0
SHADOW_EVIDENCE:v1\0
SOURCE_FACTS:v1\0
SHADOW_RUN_KEY:v1\0
FAILURE_LINEAGE:v1\0
PROJECT_STATE_SELECTOR:v1\0
PROJECT_STATE_SELECTOR_RESULT:v1\0
PATCH_SET:v1\0
SHADOW_ASSESSMENT:v1\0
SHADOW_ASSESSMENT_TEMPLATE:v1\0
```

The digest input is `UTF8(domainPrefix) || canonicalJsonBytes(projection)`.
`projection` is a deep copy of the final closed envelope with only its own
self-digest field deleted: Observation `recordDigest`, Plan `planDigest`,
recorded Approval `approvalDigest`, approval rejection/state event
`eventDigest`, Claim `claimDigest`, receipt `receiptDigest`, shadow
evidence `recordDigest`, source facts `evidenceDigest`, assessment
`assessmentDigest`, assessment template
`templateDigest`, project-state selector `manifestDigest`, dataset
`manifestDigest`, project-state selector command result `resultDigest`, or shadow evaluation
`evaluationDigest`.
Attribution V2 and Router Result V2 return sidecar digests and therefore have no
self field to delete. `null`, empty-string, zero-digest, or deletion of another
field is invalid; nested and referenced digests remain covered. Construction
validates the unsigned projection, computes the digest, assembles the envelope,
and validates the final schema. Verification validates the final envelope,
recreates the projection, and compares in constant time. Every domain gets a
fixed byte/digest vector. A digest from one domain must never validate in
another domain even when payload bytes are otherwise identical.

The minimum Repair Plan binding is:

```yaml
schemaVersion: "1"
planId: repair-plan-example-001
parentReceipt: issuecomment-1001
observationDigest: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
attributionDigest: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
routerResultDigest: "abababababababababababababababababababababababababababababababab"
policyVersion: repair-policy/v2
policyDigest: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
plannerVersion: repair-planner/v1
repository: gccwebos-com/proxy-gateway-minimal
repositoryObjectFormat: sha1
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
  encoding: exact-file-replacements/v1
  replacements:
    - path: .github/workflows/example.yml
      operation: replace
      beforeBlobOid: "1111111111111111111111111111111111111111"
      beforeSha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
      beforeMode: "100644"
      afterContentBase64: <canonical-base64-of-exact-after-bytes>
      afterSha256: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
      afterSizeBytes: 512
      afterMode: "100644"
  aggregateDigest: "0808080808080808080808080808080808080808080808080808080808080808"
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

Replacement entries are sorted by UTF-8 path bytes and unique. Paths are
repository-relative NFC strings with `/` separators and may name only existing
regular files in `allowedFiles`. Each frozen before blob OID, before SHA-256 and
mode must match `mutationTarget`. Each decoded after value is UTF-8, LF-only,
BOM-free, NUL-free and size bounded; its SHA-256 and size are recomputed. Add,
delete, rename, copy, binary, symlink, submodule, mode change and path escape are
invalid. `patch.aggregateDigest` is `PATCH_SET:v1\0` over the complete closed
replacement list. Admission and Executor accept no external patch parameter.
After mutation, every changed blob byte and no other byte must equal the
approved replacement set; no Git-version-dependent canonical-diff procedure is
used.

`afterContentBase64` is RFC 4648 standard Base64 with canonical required
padding. Shadow/comment markers use RFC 4648 URL-safe Base64 without padding.
Decoders reject whitespace, alternate alphabets, non-canonical padding and any
second textual spelling of the same bytes.

All seven source PR tasks use the same two-phase local validation protocol.
RED/GREEN, full validation, `git diff --check`, and dirty/scope checks run
before commit.
Each proposal freezes literal `GATE_BASE`, `GATE_BRANCH`, expected PR
title/body digest, one complete `launcherHostExecutableIdentity` for the
PowerShell host, one independent complete `nodeExecutableIdentity` for the
trusted Node child, one complete `gitExecutableIdentity` for publication,
expected actor node ID,
expected PR author node ID, API version
`2022-11-28`, an `EXPECTED_CHECKS_MANIFEST` path, and exact-head polling values
`60` polls, `30` seconds, and an absolute deadline no later than 30 minutes
after the first poll. Preflight proves no open PR already uses the branch. For
Tasks 2-5, 6A, and 7, the mutation/validation process is strictly
credential-free: `GITHUB_TOKEN` and every GitHub write credential are absent
while candidate tests, scripts, hooks, and imports can execute. Those six
tasks freeze a trusted-publication bundle manifest from an independent clean
checkout of the already-merged base. The manifest covers
`GitHubApiTransport/v1`, the Draft-PR and exact-head helpers, and their complete
transitive import closure by path/blob/SHA-256; freezing only the transport file
is insufficient. Candidate-worktree module resolution is forbidden.

After the single local commit, the same Gate may enter a distinct trusted
publication phase only after fresh readback of the redacted handoff. A
pre-existing trusted Git publisher whose executable, credential broker, remote,
environment, config isolation, and create-only command are frozen in the
proposal publishes exactly `taskHead` to the proposal-bound branch. Candidate
hooks, ordinary credential helpers, candidate repository config, and candidate
code execution are disabled. Immediately before push, canonical `READ_GIT_REF`
must return the closed `not_found` result. The publisher uses an empty expected-
value lease `--force-with-lease=refs/heads/<branch>:` solely to prove the ref is
still absent; `+`, `--force`, a non-empty lease, ref reuse, or a second push is
forbidden. It then reads the remote ref back as exactly `taskHead`. The GitHub
API token path is exactly trusted credential broker -> verified token-bearing
PowerShell launcher -> verified Node child. The broker injects it only into the
launcher's process environment; the launcher captures and deletes that entry,
then injects it only into the Node child's minimal environment. No ordinary or
candidate shell, candidate worktree, validation process, or Git push process
holds the token, and the PR-create token is never reused by the later GET-only
check session. The Node transport captures/deletes/disposes it as specified.
The launcher uses the absolute hash-frozen Node executable, trusted-base cwd,
empty `process.execArgv`, and a minimal child environment. It rejects
`NODE_OPTIONS`, `NODE_PATH`, loader/import hooks,
`NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`,
`SSL_CERT_DIR`, and every conventional proxy variable before attaching the
token. No inherited preload, custom CA, TLS bypass, proxy, or candidate module
path is permitted.
Any inability to prove these process boundaries blocks; there is no fallback
to running helpers from the candidate checkout.

The merged trusted-base launcher is
`scripts/invoke-governance-github-session.ps1`. Its foundation operation enum is
exactly `VerifyBranchAbsent`, `CreateDraftPullRequest`, and
`VerifyPrExactHead`. Each ID maps to one manifest-frozen entry point. The
launcher accepts only `-Operation`, `-SessionInput`, and `-ResultOutput`; it
accepts no script, module, cwd, URL, token, method, header, environment override,
or arbitrary argument.

A pre-existing trusted credential broker is the sole credential authority. The
only token-bearing process chain is the broker, the verified PowerShell
launcher it creates, and that launcher's verified Node child; no ordinary,
candidate, or interactive shell may hold the token. Before creating that chain,
the broker verifies the proposal-frozen
`launcherHostExecutableIdentity` and starts that identity's absolute
`canonicalPath`; PATH lookup, file association, `powershell`, and bare `pwsh`
are forbidden. The launcher then verifies `nodeExecutableIdentity` and starts
the fixed Node entry point with `.NET ProcessStartInfo`,
`FileName = nodeExecutableIdentity.canonicalPath`, `UseShellExecute=false`, an
exact `ArgumentList`, trusted-base cwd, a cleared/minimal child environment,
bounded stdout/stderr, and exactly one child. If either identity or broker
capability is unavailable, publication stays disabled; there is no direct-Node,
bare-PowerShell, PATH, or candidate-checkout fallback. Tests prove a PATH-
shadowed host, host or Node SHA/file-ID/version drift, and a reparse/symlink host
all fail before token attachment or child startup.

Task 1 is a strict trust-root bootstrap exception. Its proposal freezes the
new module's allowed files, exact operation contract, tests and budgets, but
cannot pre-bind bytes that do not yet exist. Candidate Task 1 code is tested
only against injected fake HTTPS adapters and never runs in a token-bearing
process or job. It must not call its candidate Draft-PR or exact-head helpers
against GitHub. After its local commit, a separately authorized pre-existing
trusted connector or manual Operator path that executes no candidate
repository code performs branch publication, creates the Draft PR, and reads
back the PR/check state. If no such trusted path is available, Task 1 stops
after its local commit. The resulting candidate module identity is not a trust
proof; Task 1 cannot become Ready until independent formal review and exact-head
checks pass, and Tasks 2-5, 6A, and 7 cannot start until Task 1 is merged.

Tokenless candidate phase for Tasks 2-5, 6A, and 7:

```powershell
$ErrorActionPreference = 'Stop'
$taskHead = (git rev-parse HEAD).Trim()
if ($taskHead -notmatch '^[0-9a-f]{40}$') { throw 'invalid_task_head' }
if ((git status --porcelain=v1 --untracked-files=all).Length -ne 0) {
  throw 'worktree_or_index_not_clean'
}
git diff --check "$env:GATE_BASE..$taskHead"
if ($LASTEXITCODE -ne 0) { throw 'committed_diff_check_failed' }

# Rerun every validation command listed by the task here, in the listed order.
# The Gate proposal expands this comment to literal commands before approval.

if ((git rev-parse HEAD).Trim() -ne $taskHead) { throw 'head_drift' }
# Emit only the proposal-bound taskHead/branch/title/body/check-manifest
# digests. No token, URL, credential, or candidate module path is emitted.
```

The trusted publication phase consumes that closed handoff, re-reads the exact
remote ref after the external push, invokes the frozen trusted-base
`create-governance-draft-pr.mjs`, disposes its transport session, and later
invokes the frozen trusted-base `verify-pr-exact-head.mjs` in a new GET-only
session. Each session receives its job token only when the broker creates the
verified PowerShell launcher; that launcher deletes the inherited entry and
passes the token only to its verified Node child. The exact
CLI flags and poll budgets remain those shown by the corresponding helper
contracts below. `CREATE_DRAFT_PULL_REQUEST` has one call; a lost response uses
only the bounded list-by-head reconciliation and never a second POST.

The proposal must replace the validation comment with the task's exact literal
commands before approval; an unexpanded comment is invalid. Checks, review,
Ready, merge, and terminal receipts bind only `taskHead`. A merge/rebase or new
SHA invalidates prior exact-head evidence and requires fresh validation.
The verifier performs GET-only polling. Head/Draft/state drift, an unexpected
check, or a terminal non-success conclusion blocks immediately; pending checks
are tolerated only until the next bounded poll, and deadline expiry blocks.
It never reruns a check or workflow.

---

## Task 1: Contracts, Canonical Digests, And Existing Ledger Events

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Create: `server/services/governance/canonical-json.mjs`
- Create: `server/services/governance/governance-digests.mjs`
- Create: `server/services/governance/governance-contracts.mjs`
- Create: `server/services/governance/github-api-transport.mjs`
- Create: `scripts/invoke-governance-github-session.ps1`
- Create: `schemas/executable-identity-v1.schema.json`
- Create: `schemas/source-run-facts-v1.schema.json`
- Create: `schemas/failure-observation-v1.schema.json`
- Create: `schemas/repair-plan-v1.schema.json`
- Create: `schemas/governance-approval-v1.schema.json`
- Create: `schemas/governance-claim-v1.schema.json`
- Create: `schemas/repair-execution-receipt-v1.schema.json`
- Create: `schemas/project-state-selector-v1.schema.json`
- Create: `schemas/project-state-selector-command-v1.schema.json`
- Modify: `schemas/gate-ledger-v1.schema.json`
- Modify: `schemas/README.md`
- Modify: `server/services/governance/gate-governance.mjs`
- Create: `server/tests/governance-contracts.test.mjs`
- Create: `server/tests/fixtures/governance-digest-vectors.json`
- Create: `scripts/verify-pr-exact-head.mjs`
- Create: `scripts/verify-governance-branch-absence.mjs`
- Create: `scripts/create-governance-draft-pr.mjs`
- Create: `scripts/verify-project-state-selectors.mjs`
- Create: `scripts/apply-project-state-selectors.mjs`
- Create: `server/tests/verify-pr-exact-head.test.mjs`
- Create: `server/tests/verify-governance-branch-absence.test.mjs`
- Create: `server/tests/governance-github-api-transport.test.mjs`
- Create: `server/tests/governance-github-session-launcher.test.mjs`
- Create: `server/tests/create-governance-draft-pr.test.mjs`
- Create: `server/tests/verify-project-state-selectors.test.mjs`
- Create: `server/tests/apply-project-state-selectors.test.mjs`
- Create: `server/tests/fixtures/project-state-selector-vectors.json`
- Modify: `server/tests/gate-governance.test.mjs`

**Consumes:** the exact merged #499 ledger/router contracts.
**Produces:** canonical parsing, domain-separated digests, closed protocol
schemas, ledger event validation, a native closed GitHub REST transport,
a frozen trusted launcher/executable-identity contract, the closed
`SourceRunFacts/v1` schema/digest contract, create-only branch and
bounded Draft-PR/exact-head helpers, and the exact project-state selector
verifier/applicator pair.

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
export class GovernanceContractError extends Error {}
export function parseCanonicalJson(sourceBytes) {}
export function canonicalJsonBytes(value) {}
export function projectGovernanceRecord(schemaId, value) {}
export function digestGovernanceRecord(domain, projection) {}
export const GOVERNANCE_DIGEST_DOMAINS = Object.freeze({});
export const GOVERNANCE_SCHEMA_IDS = Object.freeze({});
export function parseGovernanceRecord(schemaId, sourceBytes) {}
export function assertGovernanceRecord(schemaId, value) {}
export function governanceContractErrorRecord(error) {}
```

Use SHA-256 and return lowercase 64-character hexadecimal digests. Do not use
ordinary `JSON.stringify()` as the canonical contract. Objects sort keys by
Unicode code point; arrays preserve order; non-finite numbers, `undefined`,
symbols, functions, duplicate keys, invalid UTF-8, and lone surrogates fail.
`parseCanonicalJson()` accepts only `Buffer` or `Uint8Array`. Add exact RED then
GREEN cases for `Buffer.alloc(0)`, UTF-8 BOM bytes, `Buffer.from([0xc3, 0x28])`,
negative zero, and the scalar-key ordering of `\uE000` versus `\u{1F600}`.
`GovernanceContractError` may retain an ordinary runtime message and stack, but
`governanceContractErrorRecord()` serializes exactly `{ name, code, path }`.
Use a zero-dependency, closed validator registry in
`governance-contracts.mjs`; schema/validator parity tests must prove identical
schema IDs, required fields, closed-field behavior, enums, and digest
projection rules. Portable schema files are not passive documentation. Task 1
registers only schemas that exist in Task 1. Task 6A must extend this same
registry and digest-domain table in the same commit that creates each shadow
schema; forward references to not-yet-existing schemas are forbidden.

`github-api-transport.mjs` exports exactly:

```js
export const GITHUB_API_VERSION = '2022-11-28';
export const GITHUB_API_ORIGIN = 'https://api.github.com:443';
export const GITHUB_OPERATION_IDS = Object.freeze({});
export function createGitHubApiTransport(options = {}) {}
```

`createGitHubApiTransport()` captures `process.env.GITHUB_TOKEN`, deletes that
property immediately, and fails if it is absent, empty, duplicated through a
caller option, or accompanied by a caller-supplied URL/method/header/origin,
proxy, custom HTTPS agent, or custom DNS resolver. It never invokes a child
process, `gh`, a credential helper, or stored-login fallback. Every first-hop
request uses literal `GITHUB_API_ORIGIN`; proxy environment variables and
redirects are rejected except for the one bounded shadow-log redirect below.
It exposes only typed methods for `READ_AUTHENTICATED_USER`,
`READ_REPOSITORY`, `READ_PULL_REQUEST`, `LIST_PULL_REQUESTS_BY_HEAD`, `READ_GIT_REF`,
`READ_GIT_COMMIT`, `LIST_COMMIT_CHECK_RUNS`,
`READ_COMBINED_COMMIT_STATUS`, `LIST_WORKFLOW_RUNS`, `LIST_RUN_JOBS`,
`READ_WORKFLOW_RUN_ATTEMPT`,
`READ_REPOSITORY_CONTENT`, `LIST_ISSUE_COMMENTS`, `READ_ISSUE_COMMENT`,
  `READ_COLLABORATOR_PERMISSION`, `READ_TEAM_MEMBERSHIP`,
  `DOWNLOAD_SHADOW_RUN_LOGS`, and `CREATE_DRAFT_PULL_REQUEST`. Each method
constructs a fixed REST path from validated
scalars, uses the fixed API version, and enforces proposal-bound operation,
page, byte, timeout, redirect, and write-call budgets. The token buffer is
overwritten in `finally`; errors expose only closed reason codes.

Tests inject an HTTPS adapter and token canaries. They prove exact operation/
endpoint/method mapping, complete pagination, response bounds, duplicate-key
and invalid-UTF-8 rejection, actor mismatch, no arbitrary request escape,
canonical write bodies, one-call write budgets, env deletion, token redaction,
and the one-redirect log-download protocol with Authorization/cookies removed.
They also prove the only first-hop origin is literal
`https://api.github.com:443`, proxy variables and custom agents/resolvers are
rejected, the normal operation set cannot redirect, and lost Draft-PR response
reconciliation uses exactly one complete list-by-head operation without a
second POST. They prove `local_user` uses `/user`,
`actions_installation` uses repository plus trusted-run proof without `/user`,
the triggering actor is never promoted to credential principal, and ambiguous
mode/scope abstains. Launcher tests use token canaries and reject non-empty
`process.execArgv`, preload/loader/module-path variables, TLS-bypass/custom-CA
variables, and every proxy-variable spelling before any request.
The redirect test permits only HTTPS port 443 without userinfo or IP literals
and a host ending in `.actions.githubusercontent.com` or matching one label
plus `.blob.core.windows.net`; every other host is rejected.
An unprovable token scope yields
`credential_authority_assumption: full_repository` and never a least-privilege
claim.

Draft-PR tests also prove canonical title/body SHA-256 and byte lengths plus
author node ID on ordinary create/readback, lost-response reconciliation, and
every exact-head poll. A same-head/base Draft with the wrong title, body, or
author is never accepted.

The transport session API is exactly the method list frozen in the design:
`proveAuthentication`, `readAuthenticatedUser`, `readRepository`,
`readPullRequest`, `listPullRequestsByHead`,
`readGitRef`, `readGitCommit`, `listCommitCheckRuns`,
`readCombinedCommitStatus`, `listWorkflowRuns`, `listRunJobs`,
`readWorkflowRunAttempt`,
`readRepositoryContent`, `listIssueComments`, `readIssueComment`,
`proveCommentActorAuthority`,
`downloadShadowRunLogs`, `createDraftPullRequest`, and
`dispose`. Every method returns the design's closed tagged result and
operation-specific value family; there is no generic request method.

`schemas/executable-identity-v1.schema.json` implements exactly the frozen
`executable-identity/v1` object: canonical absolute path, file SHA-256, version,
version-output SHA-256, size, platform file ID, regular-file and
symlink/reparse-point flags, and observation time. The PowerShell launcher host,
trusted Node child, and Task 5 Git capture seam share this parser but bind three
independent values. Immediately before its own launch boundary, the broker,
launcher, or Git caller re-resolves and compares path, type, file ID, size,
SHA-256, version bytes, and version. Drift blocks before a token is attached or
the target command runs.

Task 1 also registers `SourceRunFacts/v1`, `ObserverIdentity/v1`, and
`ObservationPolicy/v1` plus `SOURCE_FACTS:v1\0` and `OBSERVATION_ID:v1\0`.
The portable source-facts and failure-observation schemas contain those closed
definitions; literal independent digest vectors and schema/registry parity are
committed in the same PR. Task 1 validates only the contracts; the GitHub reader
that produces source facts remains Task 6A work. Task 2 can therefore consume
and verify all three inputs without a forward reference.

`scripts/invoke-governance-github-session.ps1` is a closed launcher, not a
general process helper. Its command line is exactly:

```powershell
& "<launcherHostExecutableIdentity.canonicalPath>" -NoLogo -NoProfile -NonInteractive `
  -File "<frozen-trusted-base>/scripts/invoke-governance-github-session.ps1" `
  -Operation <VerifyBranchAbsent|CreateDraftPullRequest|VerifyPrExactHead> `
  -SessionInput "<proposal-bound-absolute-canonical-json>" `
  -ResultOutput "<proposal-bound-absolute-redacted-json>"
```

The credential broker launches it with the token only in the launcher's
environment. The launcher clears that environment entry, validates the frozen
bundle/executable identities and hostile-environment denylist, then starts the
fixed Node entry point with `ProcessStartInfo.ArgumentList`. It cannot accept an
entry-point path, arbitrary argv, cwd, or environment override. Exit `0` means a
schema-valid `accepted` result; `20` means a closed `abstain/denied` result;
`30` means `reconciliation_required`; `64` means malformed input; and `70`
means a bounded transport/internal failure. Stdout/stderr contain only the
closed redacted launcher result, never tokens or GitHub bodies.

Before any other operation, the session requires one closed auth proof.
`local_user` uses `READ_AUTHENTICATED_USER` and an expected actor node ID.
`actions_installation` never calls `/user`; it uses `READ_REPOSITORY` plus
`READ_WORKFLOW_RUN_ATTEMPT` for the current trusted run and binds repository,
run/attempt, workflow/head identity, and declared permissions with
`actorNodeId: null`. A workflow triggering actor is not the credential
principal. Unsupported/ambiguous proof abstains, token prefixes are not proof,
and unprovable scope remains `credential_authority_assumption: full_repository`.

`proveCommentActorAuthority()` is the only authority-readback composite. It
derives the actor login internally from canonical Issue-comment GET evidence,
requires stable actor node identity, then calls the fixed collaborator-
permission endpoint and, when the digest-bound policy requires it, the fixed
team-membership endpoint. The token must expose repository `Metadata: read` and
organization `Members: read` for a team policy. Only the actor node ID, digested
login/role, and closed permission/active-membership facts leave the transport;
raw login and responses are never logged or persisted. Missing, invisible,
pending, or drifted authority blocks. Proposal-copied role/team facts are never
proof.

The launcher maps each operation to one exact Node CLI; the Node CLIs accept no
other flags:

```powershell
node "<frozen>/scripts/verify-governance-branch-absence.mjs" --input "<session-input>" --output "<result-output>"
node "<frozen>/scripts/create-governance-draft-pr.mjs" --input "<session-input>" --output "<result-output>"
node "<frozen>/scripts/verify-pr-exact-head.mjs" --input "<session-input>" --output "<result-output>"
```

The canonical session input is closed and contains repository, branch/base,
`taskHead`, title/body Base64 plus SHA-256 and byte lengths, expected PR author
node ID, expected actor/App identity, the independent launcher-host and Node
executable identities, bundle/transport identities,
API version, operation budgets, expected-check manifest digest and, for the
verifier, the exact poll count/interval/deadline. Token, URL, method, script,
module, free-form args, and copied readback values are forbidden. All helpers
use the launcher exit-code contract above.

`verify-governance-branch-absence.mjs` performs one `READ_GIT_REF` and accepts
only the transport's closed `not_found` status. Auth failure, ambiguous 404,
existing ref, or another response blocks. The trusted publisher then uses the
proposal-bound absolute `gitExecutableIdentity`, revalidates its complete
identity, and invokes this literal PowerShell command once:

```powershell
& "<gitExecutableIdentity.canonicalPath>" `
  -c "core.hooksPath=<null-device>" `
  push --porcelain --no-verify `
  --force-with-lease=refs/heads/<branch>: `
  https://github.com/gccwebos-com/proxy-gateway-minimal.git `
  <taskHead>:refs/heads/<branch>
```

The remote protocol is exactly HTTPS and the literal remote is exactly
`https://github.com/gccwebos-com/proxy-gateway-minimal.git`; SCP syntax, SSH,
HTTP, a remote name, redirects, URL rewriting, and any other host are rejected.
The proposal freezes publisher cwd, the literal remote/refspec, the complete
`gitExecutableIdentity`, canonical absolute `gitExecPath` plus the SHA-256 of
the raw `git --exec-path` result, the complete platform-specific
`remoteHelperExecutableIdentity` for the single `git-remote-https` executable
directly beneath that path, and the credential broker plus its complete
`credentialPromptExecutableIdentity` and bundle digest. Immediately before the
push, the publisher re-runs `git --exec-path` through the byte-preserving
envelope and revalidates Git, the HTTPS remote helper, the credential prompt
helper, and broker capability. Any path, file-ID, size, SHA-256, version,
bundle, protocol, repository, scope, expiry, or capability drift blocks before
Git starts.

The proposal also freezes one closed `PublisherEnvironment/v1` manifest and
`publisherEnvironmentDigest`. The publisher creates an empty environment and
adds only the proposal-frozen `SystemRoot`, `WINDIR`, `TEMP`, `TMP`, isolated
empty `HOME`, `USERPROFILE`, and `XDG_CONFIG_HOME`, the minimal Git runtime
`PATH`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_EXEC_PATH=<gitExecPath>`,
`GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=<credentialPromptExecutableIdentity.canonicalPath>`,
and one opaque, single-use, repository/branch/operation-bound broker handle.
The handle, rather than a raw token, is passed to the prompt helper; the helper
accepts only the exact HTTPS username/password prompt pair, returns no other
data, and the broker invalidates the handle after the one push attempt. The
manifest binds exact non-secret values and a digest of the broker capability,
never credential bytes. Every unlisted environment key is absent. In
particular, all `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_*`, `GIT_CONFIG_VALUE_*`,
`GIT_CONFIG_SYSTEM`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG`, `GIT_SSH*`,
`SSH_ASKPASS*`, `GIT_PROXY_COMMAND`, `GIT_OBJECT_DIRECTORY`,
`GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_DIR`, `GIT_WORK_TREE`,
`GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_NAMESPACE`, HTTP(S)/ALL proxy, raw
token, and raw credential variables are forbidden. Admission recomputes the
closed environment digest immediately before process creation and blocks any
extra, missing, or changed key/value.

Under that same closed environment, the publisher uses the frozen Git
executable to enumerate all remaining config exactly once with
`& "<gitExecutableIdentity.canonicalPath>" config --null --list --show-origin
--show-scope`; raw output is parsed in memory, never logged, and its exact bytes
are captured through the frozen byte-preserving `ProcessStartInfo` envelope,
not a PowerShell success pipeline, and bound as lowercase
`configInventorySha256 = SHA256(rawNulBytes)`. The
closed local-config allowlist is exactly `core.repositoryformatversion`,
`core.filemode`, `core.bare`, `core.logallrefupdates`, `core.ignorecase`, and
`core.precomposeunicode`. Any unlisted key, include, `url.*.insteadOf`,
`remote.*` URL/pushurl/refspec, credential helper, HTTP header/proxy, SSH command,
or config/environment drift blocks before push. The literal remote and refspec
come only from the proposal, not Git config. Candidate hooks and ordinary
credential helpers are forbidden; authentication comes only from the frozen
broker/helper closure above. The empty lease is mandatory and is not general
force-push authority. `+`, `--force`, a non-empty lease, retry, and a second
push are forbidden. A fresh `READ_GIT_REF` must then equal `taskHead`.

`create-governance-draft-pr.mjs` verifies the actor, rechecks the already-pushed
ref and completes `LIST_PULL_REQUESTS_BY_HEAD` to prove no OPEN PR exists for
the exact owner/branch/base. It spends one `CREATE_DRAFT_PULL_REQUEST` call with
`draft: true`, then performs `READ_PULL_REQUEST` and requires exact repository,
head/base, OPEN/Draft, title/body SHA-256 and lengths, and author node ID. If the
POST response is lost, it performs exactly one complete list-by-head pass,
requires exactly one candidate, then performs exact PR GET and the same full
comparison. Zero, multiple, or any mismatched content/author is
`reconciliation_required`; no second POST is allowed.

`verify-pr-exact-head.mjs` repeats the exact title/body/author and head/base/
Draft/state comparison on every poll before evaluating checks. Neither helper
accepts a token argument. Task 1 tests these helpers only with fake adapters;
the candidate helpers do not publish Task 1 itself.

`verify-project-state-selectors.mjs` validates the closed
`project-state-selector/v1` manifest defined by the frozen design. It supports
only the six authority paths and the discriminated `json_pointer` and
`markdown_region` objects. Markdown delimiters use exactly the frozen
`<!-- project-state-selector:<selectorId>:start|end -->` whole-line grammar;
the body raw-byte interval excludes delimiters and preserves LF/CRLF. It
requires one match per selector, validates file/before/after digests and
non-overlap, and in post-mutation mode proves all non-selected bytes unchanged.
It never writes a file. The fixed selector-vector fixture covers every positive
and negative case listed by the design, including literal expected matched
offsets, input/output Base64, body and final-file digests; tests never generate
or rewrite those expected values.

`schemas/project-state-selector-command-v1.schema.json` and the closed registry
define exactly `ProjectStateSelectorInventoryInput/v1`,
`ProjectStateSelectorPreInput/v1`, `ProjectStateSelectorPostInput/v1`,
`ProjectStateSelectorApplyInput/v1`, and
`ProjectStateSelectorCommandResult/v1`. The inventory request contains only
repository/base/root plus sorted authority paths, selector identities, and
exact after-value type/Base64/digest/size. It cannot carry file hashes, before
digests, matched offsets, or expected-after file identities. Inventory accepted
output embeds the sole manifest as canonical `manifestBase64` plus
`manifestDigest`; there is no implicit manifest file. Pre/post/apply inputs and
all accepted/error evidence fields are exactly the closed envelopes frozen in
the design. Extra fields, wrong modes, alternate encodings, or unsorted arrays
are contract errors.

The nested `ProjectStateSelectorRequest/v1` root has exactly `schemaVersion`
and `files`; each file item has exactly `path` and `selectors`. Each selector is
one closed `oneOf`: `{ kind: json_pointer, pointer, expectedMatchCount: 1,
afterValueType: canonical_json, afterValueBase64, afterValueDigest,
afterValueSize }` or `{ kind: markdown_region, selectorId,
expectedMatchCount: 1, afterValueType: utf8_markdown_body, afterValueBase64,
afterValueDigest, afterValueSize }`. Arrays use the design's mandatory ordering.

Its CLI is closed:

```powershell
node scripts/verify-project-state-selectors.mjs --mode <inventory|pre-mutation|post-mutation> --input "<absolute-canonical-json>" --output "<absolute-canonical-result-json>"
```

Exit `0` means `accepted`; `20` means `blocked`; `30` means
`reconciliation_required`; `64` means `contract_error`; and `70` means
`internal_error`. Stdout is empty; only the output file contains the closed
canonical result. The literal `--mode` must equal `input.mode`; mismatch is a
contract error. No selector, path, after value, repository identity, target,
or manifest byte may be supplied outside the mode-specific input.
`ProjectStateSelectorCommandResult/v1` implements the design's exact mode/phase
`oneOf`; read-only modes never use exit `30`, contract errors are pre-execution,
and every apply failure after the first replacement is normalized to
`reconciliation_required + unknown + unavailable`. No other status/mutation/
canonical-result tuple validates.

`apply-project-state-selectors.mjs` exports exactly
`applyProjectStateSelectors({ repositoryRoot, manifestBytes })` and accepts no
free-text replacement, path, selector, or value input. It first invokes the
same verifier in pre-mutation mode, locks the exact six authority files, builds
temporary siblings containing only the manifest-authorized bytes, verifies
all temporary bytes/digests and selector non-overlap, and only then atomically
renames each sibling into its corresponding file. It runs post-mutation
verification before returning. A failure before the first rename proves no
mutation; any failure after a rename returns
`status: reconciliation_required`, `mutationState: unknown`, and
`canonicalResult: unavailable` with no retry. It never regenerates a selector
or infers an after value.

Its only CLI is:

```powershell
node scripts/apply-project-state-selectors.mjs --input "<absolute-canonical-json>" --output "<absolute-canonical-result-json>"
```

The input contains only the design's exact apply envelope. It uses the same
`0/20/30/64/70` exit contract; any uncertain partial replacement is exit `30`
with `mutationState: unknown` and `canonicalResult: unavailable`, never an
ordinary mismatch.

Manifest files are strictly sorted by Unicode code-point order of NFC path.
Selectors are strictly sorted by `(kindOrder, selectorKey)`, with
`json_pointer = 0`, `markdown_region = 1`, and Unicode code-point comparison of
pointer/selector ID; Markdown IDs are globally unique. Inventory computes and
freezes complete expected-after file SHA-256/size. Literal vectors additionally
cover mixed-EOL rejection, after-body duplicate-delimiter rejection, unsorted
arrays, every mode-specific input/result, post-worktree/post-commit topology,
and output failure before versus after the first replacement.

`server/tests/fixtures/governance-digest-vectors.json` contains literal
`domainUtf8Hex`, `canonicalPayloadUtf8Hex`, and `expectedSha256` values. Tests
read the expected values; they never generate or rewrite them. At least one
vector is independently calculated with .NET SHA-256 during review and copied
as a literal, and every registered domain has a separate literal vector plus a
cross-domain rejection case. Unsigned projection validation is exposed only as
an internal constructor phase; the public parser accepts final signed envelopes
and cannot be switched into an unsigned mode by caller input.

The independent review anchor uses canonical payload UTF-8 hex
`7b22736368656d6156657273696f6e223a22766563746f722f7631222c2276616c7565223a22676f7665726e616e6365227d`.
The literal expected SHA-256 values for `domain || NUL || payload` are:

| Domain | Expected SHA-256 |
|---|---|
| `OBSERVATION:v1\0` | `a1b672e2a850266757b0bdee0a982bae6953d851a4b306c252fd89c0b1b449e9` |
| `OBSERVATION_ID:v1\0` | `428ac0edac4fd20182266ca924f5be31419ed663ca62450375cda9fd340afa1d` |
| `ATTRIBUTION:v2\0` | `7e590dfe6f84154d23754b10809674206c09c400668db1775b02ca81cc4c02bf` |
| `ROUTER_RESULT:v2\0` | `04bb13ca78627303b106c6bda45f9ee68391f9aa16d7e808d3ff8828d22eeb22` |
| `PLAN:v1\0` | `0be58bf5e8704ebeb39b46011e2d71b2eee8fd671cfb0571c8d39e0e89571856` |
| `APPROVAL:v1\0` | `0d82c074e00e098d983500ab364c5c09e7a683ade6fb4c312cf2a5b133345d24` |
| `CLAIM:v1\0` | `9f30d1f8aded880124926997dd9c3a37af3d17a4a7b0f2b08bc2788c31dbe97f` |
| `EXECUTION:v1\0` | `00e4a10afd8813131916060a6571698d5e4a8401985ad2b6724bbfc62a47f867` |
| `RECEIPT:v1\0` | `af4e46cb9959710f512155f3a686956b0a54cb796e1d0d2526e7930d60d5b3a7` |
| `SHADOW_DATASET:v1\0` | `d5ad8d71ec43942e0225106668482e075afcf13713c3fba04b0e3d40feaf5425` |
| `SHADOW_EVALUATION:v1\0` | `3ac1a2dee5e03e596f925760a99da661d87b9a9273ac8e15e82dce619922f996` |
| `SHADOW_EVIDENCE:v1\0` | `f8495194983e88eb600663e4cfce0efa0645e53a0eb2f76325688ff5fb736aeb` |
| `SOURCE_FACTS:v1\0` | `8d0db7042adede45c1c585b594d54c9bb7b63b1cbae15da6e95aea1e860f3f83` |
| `SHADOW_RUN_KEY:v1\0` | `a054a7555a2581d18156684555f0f187243125b732a3d9a868a07284c5726b38` |
| `FAILURE_LINEAGE:v1\0` | `9a06768f671780600ab02070bad6af70dce8d99f7b3a7ee84ff23cfb6fcc70a4` |
| `PROJECT_STATE_SELECTOR:v1\0` | `c4205cd9c08bf0776f6052216ccf63250b6c48dd20254e919c3d658e9245eb50` |
| `PROJECT_STATE_SELECTOR_RESULT:v1\0` | `01770f534a6a86166806a5fe2dc686e09c266ea02cbf201e497e833d00ecdf52` |
| `PATCH_SET:v1\0` | `411c56bf7117c79656b9957de79dc47236fdcf6fa4831da631b0724debbf209a` |
| `SHADOW_ASSESSMENT:v1\0` | `aa2103da9f136becf1c09605730da0158cd1b5b8ed82e32615ec767dc4151b30` |
| `SHADOW_ASSESSMENT_TEMPLATE:v1\0` | `588ed5c2679b936f8308377b10453d76c933049c4efe2352d1a3f9d304467984` |

Task 1 commits vectors for every registered core domain, including
`SOURCE_FACTS:v1\0`, `OBSERVATION_ID:v1\0`, and both project-state selector
domains. Task 6A appends only the five newly registered shadow-domain vectors;
neither task may compute expected values at test runtime.

`scripts/verify-pr-exact-head.mjs` uses an injected read-only client in tests.
Its real CLI requires proposal-frozen repository, PR number, expected head,
expected-check manifest, expected actor, native transport/Node identity, fixed
API version, max polls, interval and deadline. It permits only
`READ_AUTHENTICATED_USER`, `READ_PULL_REQUEST`, `LIST_COMMIT_CHECK_RUNS`, and
`READ_COMBINED_COMMIT_STATUS`. It requires the exact remote head, OPEN/Draft
state before Ready approval, unique check identity (`name`, App ID, head SHA),
terminal `success`, and no missing, duplicate, neutral, skipped, stale-head, or
unexpected required check. It performs at most 60 GET-only polls at 30-second
intervals before the proposal-frozen deadline. Head/state drift or terminal
failure blocks immediately; pending may continue only to the next bounded
poll; timeout blocks. It cannot rerun a check/workflow, emits only a redacted
verification envelope, and never prints auth state or raw headers.

### Step 3: Add failing schema and transition tests

Cover:

- unknown properties;
- schema downgrade;
- V2 `failureRisk` rejected and `technicalImpact` required;
- V2 `repair_routed` full Router-record/digest/retry/policy parity and V1/V2
  isolation;
- every self-digest projection, fixed digest vector, and included-self variant;
- approval events `recorded`, `rejected`, `withdrawn`, `expired`, and
  `invalidated`;
- claim evidence and approval-consumption receipt ordering;
- historical event rewrite and event reordering;
- an `execution_started` receipt event that does not become a Gate transition.

Run:

```powershell
node --test server/tests/governance-contracts.test.mjs server/tests/gate-governance.test.mjs server/tests/governance-github-api-transport.test.mjs server/tests/governance-github-session-launcher.test.mjs server/tests/verify-governance-branch-absence.test.mjs server/tests/create-governance-draft-pr.test.mjs server/tests/verify-pr-exact-head.test.mjs server/tests/verify-project-state-selectors.test.mjs server/tests/apply-project-state-selectors.test.mjs
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
node --test server/tests/governance-contracts.test.mjs server/tests/gate-governance.test.mjs server/tests/governance-github-api-transport.test.mjs server/tests/governance-github-session-launcher.test.mjs server/tests/verify-governance-branch-absence.test.mjs server/tests/create-governance-draft-pr.test.mjs server/tests/verify-pr-exact-head.test.mjs server/tests/verify-project-state-selectors.test.mjs server/tests/apply-project-state-selectors.test.mjs
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
```

Expected GREEN: all tests and checks pass; only the listed files are changed.
Commit once with:

```powershell
git add server/services/governance/canonical-json.mjs server/services/governance/governance-digests.mjs server/services/governance/governance-contracts.mjs server/services/governance/github-api-transport.mjs schemas/executable-identity-v1.schema.json schemas/source-run-facts-v1.schema.json schemas/failure-observation-v1.schema.json schemas/repair-plan-v1.schema.json schemas/governance-approval-v1.schema.json schemas/governance-claim-v1.schema.json schemas/repair-execution-receipt-v1.schema.json schemas/project-state-selector-v1.schema.json schemas/project-state-selector-command-v1.schema.json schemas/gate-ledger-v1.schema.json schemas/README.md server/services/governance/gate-governance.mjs scripts/invoke-governance-github-session.ps1 scripts/verify-governance-branch-absence.mjs scripts/verify-pr-exact-head.mjs scripts/create-governance-draft-pr.mjs scripts/verify-project-state-selectors.mjs scripts/apply-project-state-selectors.mjs server/tests/governance-contracts.test.mjs server/tests/governance-github-api-transport.test.mjs server/tests/governance-github-session-launcher.test.mjs server/tests/verify-governance-branch-absence.test.mjs server/tests/create-governance-draft-pr.test.mjs server/tests/verify-pr-exact-head.test.mjs server/tests/verify-project-state-selectors.test.mjs server/tests/apply-project-state-selectors.test.mjs server/tests/fixtures/governance-digest-vectors.json server/tests/fixtures/project-state-selector-vectors.json server/tests/gate-governance.test.mjs
git commit -m "feat: add governed repair machine contracts"
```

Stop after the local commit. Candidate Task 1 code receives no GitHub token and
does not publish or verify its own PR. Branch publication, Draft-PR creation,
and exact-head readback require the separately authorized trusted external
path defined in the shared bootstrap exception. Do not begin Task 2 until Task
1 has passed independent review and merged.

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

The fixture repeats the record's workflow/run/source/runner facts in one exact
`SourceRunFacts/v1`, adds the sorted job
`{ name: Validate, status: completed, conclusion: failure,
labelsDigest: abababababababababababababababababababababababababababababababab,
startedAt: 2026-07-15T19:55:00.000Z,
completedAt: 2026-07-15T20:00:00.000Z, steps: [{ name: Validate, outcome:
failure }] }`, `reasonCode: diff_check_failed`, and
`occurredAt: 2026-07-15T20:00:00.000Z`. Its independently precomputed literal
`evidenceDigest` is
`f08c395688493c74f211d3fe67e5ce20c00d5e722892f2e211aec2969bbcef78`.
The policy fixes redaction digest
`eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` and
`usabilityDurationSeconds: 14400`. From those exact inputs, the record must bind these literal outputs;
tests read but never regenerate the expected hashes:

```yaml
schemaVersion: "1"
observationId: observation-f0c9279b5096a97a6a8da1ae053a0bbff4d0fdd63043e0678156b95cbf83aeef
repository: gccwebos-com/proxy-gateway-minimal
workflow:
  name: CI
  path: .github/workflows/ci.yml
  trustedWorkflowBlobOid: "1111111111111111111111111111111111111111"
  trustedWorkflowContentSha256: "1212121212121212121212121212121212121212121212121212121212121212"
  permissionsDigest: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
authority:
  observerVersion: observer/v1
  observerBinaryDigest: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  sourceAuthorityDigest: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
run:
  id: 10001
  attempt: 2
  workflowId: 20002
  event: workflow_run
  checkName: Validate
  status: completed
  conclusion: failure
source:
  headSha: "2222222222222222222222222222222222222222"
  baseSha: "3333333333333333333333333333333333333333"
  treeSha: "4444444444444444444444444444444444444444"
runner:
  declaredOs: Linux
  declaredImage: ubuntu-24.04
  labelsDigest: "abababababababababababababababababababababababababababababababab"
evidence:
  evidenceKind: github_job_step_metadata
  evidenceDigest: f08c395688493c74f211d3fe67e5ce20c00d5e722892f2e211aec2969bbcef78
  artifactDigests: []
  redactionPolicyDigest: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
observedAt: 2026-07-15T20:00:00.000Z
observationUsabilityExpiry: 2026-07-16T00:00:00.000Z
recordDigest: b8d67f42067598b55e7e9de689175a5a651e30b0c6cbaea8f2a32fe3ea40041e
```

Test missing exact head/base/tree, workflow blob/byte/permission identity,
workflow ID/event/status/conclusion/check identity, declared runner identity,
observer identity, or evidence digest. Test that a secret canary and
prompt-injection sentence do not appear in the serialized record.

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

The function accepts already-redacted structured evidence, never raw logs. For
platform observations its inputs are exactly the merged Task 1
`SourceRunFacts/v1`, `ObserverIdentity/v1`, and `ObservationPolicy/v1` values.
It applies the design's complete normative mapping: platform facts come only
from source facts; authority comes only from observer identity;
`evidenceKind: github_job_step_metadata` and `artifactDigests: []` are fixed
literals; only redaction digest and bounded expiry duration come from the closed
policy; and `observationId`/`recordDigest` are computed. Event payloads cannot
fill any Observation field, and there is no wall-clock input.
For `github_job_step_metadata`, `evidenceDigest` is recomputed from the closed
trusted workflow, head/base/tree, declared runner profile, canonical job/step
names/outcomes and reason code. For `redacted_log_summary`, only the bounded
upstream structured digest is accepted; no source-run text is an input.
Malformed fields throw `GovernanceContractError`. Evidence-complete input
returns `{ ok: true, code: 'accepted', value: <deeply-frozen-record> }`.
Incomplete but otherwise well-formed identity/evidence returns `{ ok: false,
code: 'abstain', details: { missingFields: [...] } }`; it must not fabricate a
schema-valid Observation or digest. Expiry limits future repair usability; it
does not erase or invalidate the historical observation. For accepted input,
the record's `recordDigest` is the downstream `observationDigest`.

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
schemaVersion: "2"
observationDigest: b8d67f42067598b55e7e9de689175a5a651e30b0c6cbaea8f2a32fe3ea40041e
classifierVersion: attribution/v2
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
  - observation-f0c9279b5096a97a6a8da1ae053a0bbff4d0fdd63043e0678156b95cbf83aeef
decisionReason:
  category: deterministic_rule_match
  blockers: []
  missingEvidence: []
```

Tests must prove Attribution never emits `failureRisk`, `governanceRisk`, `approvalRequired`,
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
- Modify: `project-state/README.md`

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

Separate `validationBase` from `mutationTarget`. The Plan contains the complete
sorted exact-file replacement set, including frozen before blob OID/SHA/mode
and canonical-base64 after bytes with decoded size and SHA-256. Decoded after
bytes must be UTF-8, LF-only, BOM-free and NUL-free. Bind `routerResultDigest`,
allowed files, semantic constraints, transport contracts, trusted validator
SHA, expected checks, policy version, parent receipt, retry lineage, expiry,
and every forbidden action. Reject digest/size mismatch, ambiguous base64,
CRLF, duplicate or non-NFC path, add/delete/rename/copy/mode/symlink/submodule,
trailing content, and any external replacement parameter. A rendered proposal
contains both the machine envelope and a readable explanation; only the
envelope is authoritative.

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
export function createApprovalRecordedEvent(input) {}
export function createApprovalRejectionEvent(input) {}
export function createApprovalStateEvent(input) {}
export function assertApprovalEvent(event) {}
export function deriveApprovalState(events) {}
```

The parser performs syntax, Unicode, and extra-token validation only and returns
`{ action, proposalCommentId, planId, normalizedCommand }`.
`createApprovalRecordedEvent({ eventId, parsedCommand, proposalReadback,
approvalReadback, actorIdentity, authoritySnapshot, planDigest,
authorizationPolicyDigest, decidedAt, effectiveUntil })` accepts only
`action: approve`. `createApprovalRejectionEvent()` accepts the same identity
inputs for `reject`, fixes `reasonCode: operator_rejected`, and produces an
immutable rejection event without an approval capability.
`createApprovalStateEvent(input)` accepts this exact closed union; every member
also requires `schemaVersion: "1"`, unique `eventId`, `approvalDigest`,
`occurredAt`, and obtains `eventDigest` from the builder:

```js
{ eventType: 'approval_withdrawn', reasonCode: 'operator_withdrawn',
  commandCommentIdentityDigest, actorIdentity, authorityDigest }
{ eventType: 'approval_consumed', reasonCode: 'claim_consumed',
  claimDigest, consumptionReceiptDigest }
{ eventType: 'approval_expired', reasonCode: 'approval_expired',
  effectiveUntil, clockEvidenceDigest }
{ eventType: 'approval_invalidated',
  reasonCode: 'head_drift' | 'policy_drift' | 'scope_drift' |
    'authority_drift' | 'workflow_drift' | 'lineage_drift' | 'proposal_drift',
  mismatchedField: 'validationBase' | 'mutationTarget' | 'policyDigest' |
    'scopeDigest' | 'authorityDigest' | 'workflowIdentityDigest' |
    'lineageDigest' | 'proposalDigest',
  expectedDigest, actualDigest, evidenceDigest }
```

There is no generic `evidenceRefs` parameter. `actualDigest` may be `null` only
when canonical evidence is absent; all other member-specific fields are
required and extra fields fail. Builders validate
edited/deleted comments, actor authority,
proposal identity, Plan binding and unique event ID, then return a closed
event. `assertApprovalEvent()` independently validates schema and digest.
Derived state is one
of `recorded_not_consumed`, `consumed`, `withdrawn`, `expired`, or
`invalidated`, with the terminal event ID, digest, and reason. An
`approval_rejected` event derives `invalidated` with reason `rejected`. The
derivation never edits an input event.

Reject extra tokens, edits, duplicates, replay, wrong proposal or plan, stale
actor role, missing actor node ID, and a comment whose `createdAt` differs from
`updatedAt`. Bind `approvalCommentDigest`, actor node ID, team, role, created
time, plan digest, and policy digest. Task 4 may consume only events accepted by
`assertApprovalEvent()` and state returned by `deriveApprovalState()`.

The closed approval event envelope is:

```yaml
schemaVersion: "1"
eventId: approval-event-0001
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

Rejection uses the recorded identity fields but has `eventType:
approval_rejected`, `decision: reject`, no `approvalDigest`, and its own
`eventDigest`. Withdrawal, consumption, expiry and invalidation use the closed
state-event discriminated union always contains `{ schemaVersion, eventId,
eventType, approvalDigest, reasonCode, occurredAt, eventDigest }` plus only the
event-specific evidence fields defined above; they never reuse or mutate the
approval event. Duplicate event IDs, an invalid predecessor digest, or an
impossible ordered transition fail closed.

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
```

Expected GREEN: all tests pass and authorization policy validation is part of
`project-state:check`. Commit once:

```powershell
git add schemas/governance-authorization-policy-v1.schema.json project-state/governance-authorization-policy.json project-state/README.md server/services/governance/approval-command.mjs server/services/governance/provenance-verifier.mjs server/services/governance/repair-planner.mjs server/tests/governance-repair-plan-provenance.test.mjs scripts/check-project-state.mjs
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
- Create: `server/services/governance/synthetic-claim-store.mjs`
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
export function createInMemoryClaimStore() {}
```

Success returns `{ ok: true, code: 'preclaim_admitted', value: {
admissionDigest } }`; expected denial uses the shared tagged-result contract.
No returned value contains a GitHub credential or a mutation callback.

Required pre-claim predicates include exact Observation, Attribution, Plan,
approval, policy, parent receipt, validation base, mutation target, head, frozen
identity, expiry, workflow path/SHA/permission digest, trusted validator,
expected App ID, token scope, derived approval state, retry budget, capability
proof, concurrency lock, and branch absence. Any unknown predicate denies
Admission.

Run:

```powershell
node --test server/tests/governance-repair-admission.test.mjs
```

Expected RED: missing Admission module.

### Step 2: Implement the immutable Claim envelope

The Claim binds plan ID/digest, approval digest, owner run ID/attempt, expected
App ID, exact head, policy digest, trusted workflow and permission identities,
capability proof, acquired time, and claim namespace identity.
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
validationBase: "3333333333333333333333333333333333333333"
mutationTarget: "4444444444444444444444444444444444444444"
frozenIdentityDigest: "4545454545454545454545454545454545454545454545454545454545454545"
owner:
  runId: 10002
  runAttempt: 1
expectedAppId: "15368"
workflowIdentity:
  workflowPath: .github/workflows/repair-executor.yml
  workflowSha: "5555555555555555555555555555555555555555"
  permissionsDigest: "5656565656565656565656565656565656565656565656565656565656565656"
claimCapabilityProofDigest: "5757575757575757575757575757575757575757575757575757575757575757"
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

The injected store has exactly `read(planId)` and
`createIfAbsent(claimEnvelope)` operations. `createIfAbsent` returns only
`created`, `exists_exact`, `exists_conflict`, or `unknown`. `created` and
`exists_exact` require exact readback; `exists_conflict` and `unknown` return
`reconciliation_required`. These tests prove the abstract claim contract, not
real GitHub atomicity or namespace protection.

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
```

Expected GREEN: all synthetic races are deterministic; no network request or
repository mutation occurs. Commit once:

```powershell
git add server/services/governance/claim-envelope.mjs server/services/governance/claim-capability-verifier.mjs server/services/governance/synthetic-claim-store.mjs server/services/governance/repair-admission.mjs server/tests/governance-repair-admission.test.mjs
git commit -m "feat: add governed repair admission contracts"
```

Stop after exact-head checks. A real claim writer remains absent.

---

## Task 5: Disabled Bounded Executor Contract

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Modify: `server/services/execution-contract.mjs`
- Modify: `server/tests/execution-contract.test.mjs`
- Modify: `docs/EXECUTION_CONTRACT_V1.md`
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
- decoded replacement bytes, size, before/after identity, or aggregate digest
  differing from the Plan-contained replacement set;
- alternative bytes inside the same allowed file set;
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
approvedReplacementSetDigest: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
actualReplacementSetDigest: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
actualReplacementBytesEqual: true
```

The merged Execution Contract exposes only aggregate digests today; Task 5 must
not assume raw-byte access already exists. Add one backward-compatible,
in-process v1 capture seam to `server/services/execution-contract.mjs` and
document it explicitly:

```js
export async function executeBoundedProcessCapture({
  executableIdentity,
  argv,
  cwd,
  environment,
  stdinBytes = null,
  stdoutMaxBytes,
  stderrMaxBytes,
  timeoutMs
}) {}
```

The seam accepts the exact Task 1 `executable-identity/v1` value, an exact
argument array, a closed environment allowlist, bounded timeout/output sizes,
and no shell or command-line string. It returns only the closed process result:

```yaml
exitCode: <integer>
timedOut: <boolean>
stdoutBytes: <Uint8Array>
stderrBytes: <Uint8Array>
stdoutLength: <non-negative-integer>
stderrLength: <non-negative-integer>
stdoutSha256: <sha256>
stderrSha256: <sha256>
```

Legal zero-length output remains an explicit zero-length byte array and is
never collapsed to `null`; invalid UTF-8 remains bytes; overflow, timeout, and
non-zero exit are closed tagged results. Receipt serialization must never
serialize raw bytes. The caller parses only the closed grammar below and then
discards/zeroes retained buffers. If this seam cannot be added without changing
existing v1 behavior, Task 5 stops and requires a separately designed contract
version instead of silently widening v1.

`git-change-evidence.mjs` may invoke the seam only through the closed read-only
Git command enum `REV_PARSE_TREE`, `DIFF_NAME_STATUS_Z`, `LS_TREE_Z`, and
`CAT_FILE_BLOB`. It freezes Git executable path/SHA-256/version, repository,
object format, exact argv templates, cwd, empty stdin, environment allowlist,
timeouts, and byte limits. It rejects any other Git operation or caller-supplied
argv. Tests cover NUL-delimited filenames, legal empty output, invalid UTF-8,
stdout/stderr separation, overflow, timeout, and non-zero exit.

Before each Git launch, the seam must independently re-read the frozen
canonical path, regular-file and reparse/symlink flags, platform file ID, size,
SHA-256, version output bytes/digest, and parsed version. Any mismatch is a
closed identity failure before the Git command runs; a path string match alone
is insufficient.

The structural validator reconstructs the changed-blob list from the frozen
before/after trees, recomputes the exact replacement-set envelope, and requires
each changed after blob byte and the aggregate digest to equal the
Plan-contained replacement set before any semantic decision. This foundation
PR does not implement a
YAML parser or workflow-semantic
validator. `validateActualRepairDelta()` performs structural Git evidence and
transport-contract checks, then returns
`{ ok: false, code: 'semantic_validator_unavailable' }` for every workflow
source delta because `registered_semantic_validators` is zero. It must not use
regular expressions as a substitute for YAML semantics. A closed workflow
replacement grammar and trusted semantic validator belong to the later
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
```

Expected GREEN: all adversarial temporary-repository cases pass and the static
disabled-state assertion remains true. Commit once:

```powershell
git add server/services/execution-contract.mjs server/tests/execution-contract.test.mjs docs/EXECUTION_CONTRACT_V1.md server/services/governance/git-change-evidence.mjs server/services/governance/bounded-repair-executor.mjs server/tests/bounded-repair-executor.test.mjs
git commit -m "feat: add disabled bounded repair executor contract"
```

Stop after exact-head checks. Do not register an adapter.

---

## Task 6A: Disabled Read-only GitHub Actions Shadow Contract And Pure Evidence Builders

**Risk:** B
**Expected PR count:** 1
**Production impact:** None

**Files:**

- Create: `.github/workflows/governance-repair-shadow.yml`
- Create: `schemas/governance-shadow-evidence-v1.schema.json`
- Create: `schemas/governance-shadow-dataset-v1.schema.json`
- Create: `schemas/governance-shadow-assessment-template-v1.schema.json`
- Create: `schemas/governance-shadow-assessment-v1.schema.json`
- Create: `schemas/governance-shadow-evaluation-v1.schema.json`
- Create: `server/services/governance/governance-shadow-evaluation.mjs`
- Create: `scripts/read-governance-source-run-evidence.mjs`
- Create: `scripts/build-governance-shadow-evidence.mjs`
- Create: `scripts/build-governance-shadow-assessment.mjs`
- Create: `scripts/collect-governance-shadow-dataset.mjs`
- Create: `scripts/evaluate-governance-shadow.mjs`
- Create: `server/tests/governance-shadow-workflow.test.mjs`
- Create: `server/tests/governance-shadow-dataset.test.mjs`
- Modify: `server/tests/ci-workflow-contract.test.mjs`
- Modify: `server/services/governance/governance-contracts.mjs`
- Modify: `server/services/governance/governance-digests.mjs`
- Modify: `server/tests/governance-contracts.test.mjs`
- Modify: `server/tests/fixtures/governance-digest-vectors.json`
- Modify: `schemas/README.md`
- Modify: `package.json`

**Consumes:** canonical GitHub run/job/step metadata, the exact inert source
workflow blob, ordinary shadow-run logs through a bounded read-only client, and
merged framework modules. Source-run logs are forbidden.
**Produces:** pure reader/collector/evaluator contracts and a workflow that is
machine-disabled until a later broker/settings Gate. It does not emit a live
marker, upload an artifact,
append a job summary, or publish a durable proposal, approval, Gate receipt,
check, Issue comment, branch, commit, or PR.

The evidence schema has the closed root fields `schemaVersion`, `repository`,
`workflowIdentity`, `run`, `sourceRunFacts`, `observationDigest`,
`attributionDigest`, `policyDigest`, `routerResultDigest`, `routerDecision`,
`plannerDecision`, `proposalDigest`, `shadowResult`, `reasonCodes`, `createdAt`,
and `recordDigest`. Its closed `sourceRunFacts` subobject, and no root-level duplicate,
contains exactly `schemaVersion`, `repository`, `workflow`, `run`, `source`,
`runner`, `jobs`, `reasonCode`, `occurredAt`, and `evidenceDigest`.
`workflow` contains only `name`, `path`, `blobOid`, `contentSha256`, and
`permissionsDigest`; `run` contains only `workflowId`, `id`, `attempt`, `event`,
`status`, `conclusion`, and `selectedCheckName`; `source` contains only
`headSha`, `baseSha`, and `treeSha`. `runner` contains only `declaredOs`, `declaredImage`, and
`labelsDigest`; each job contains only stable name/status/conclusion,
`labelsDigest`, start/completion timestamps, and closed step names/outcomes. No
log text, free text, token, or raw response is permitted.
The dataset schema contains a frozen window and rows derived
from the complete source CI run inventory, left-joined to expected shadow runs
and stdout markers. Every source run/attempt remains a row with
`parseStatus: valid | invalid | unparseable | missing`, nullable shadow/evidence
run ID and attempt, a stable failure-lineage key, and a same-invocation local
assessment candidate or explicit `not_reviewed`. A missing
shadow trigger or missing/expired log remains
`missing`; it never disappears before evaluation. The dataset also contains
the exact ordered `inventoryPartitions` leaf list and
`inventoryPartitionDigest` defined by the frozen design.

No assessment/evaluation receipt schema, comment renderer, or publisher is
delivered. Assessment and evaluation values are local closed-schema candidates
only; they cannot be used as cross-Gate state or represented as durable
evidence.

The assessment-candidate schema contains exactly `schemaVersion`,
`candidateType: shadow_assessment_candidate`, the complete unchanged closed
`template`, and `assessmentDigest`. It rejects proposal, approval, actor,
authority, receipt, publication, created/expiry, copied-file, and earlier-Gate
fields. `assessmentDigest` covers the nested `templateDigest`; neither digest
proves durable Operator authority.

The evaluation schema implements the design's exact closed envelope with
`schemaVersion`, `repository`, `window`, `inventoryCutoffAt`,
`inventoryFilterDigest`, `manifestDigest`, `assessmentDigest`,
`collectorIdentityDigest`, `evaluatorIdentity`, `evaluationAsOf`,
`evidenceUsabilityExpiresAt`, `minimums`, `counts`, `metrics`,
`zeroInvariants`, `result`, `reasonCodes`, and `evaluationDigest` only. Its
three metrics have exactly `numerator`, `denominator`, `minimumBasisPoints`,
`actualBasisPoints`, and `status`; their fixed thresholds are 9500, 8000, and
7000 basis points. `minimums` contains exactly `uniqueFailureLineages`,
`proposalDispositions`, and `independentlyReviewedAutoRoutes`; `counts`
contains exactly `sourceRunRows` plus those same three names;
`zeroInvariants` contains exactly `falseSafeRoute`, `unauthorizedMutations`,
`riskAAutoExecution`, and `retryBudgetExceededWithoutEscalation`.
`actualBasisPoints` is `null` iff denominator is zero and
status is `insufficient`; otherwise it equals
`floor(numerator * 10000 / denominator)`. The fixed counts are 20 unique
failure lineages, 10 proposal dispositions, and 10 independently reviewed auto
routes. A deficient count is `insufficient_evidence`; any metric failure or
non-zero safety invariant is `changes_required`; only complete passing evidence
is `passed`. `evaluationAsOf` equals `inventoryCutoffAt` and
`evidenceUsabilityExpiresAt` equals that cutoff plus exactly seven days. Actual
query time is not a field or digest input.

Task 6A consumes the already-merged Task 1 `SourceRunFacts/v1` contract. It
extends the same schema registry and digest-domain table in the commit that
creates the five shadow schemas, and adds literal fixed vectors and registry/
schema parity tests only for those five new domains.

### Step 1: Write the failing workflow contract test

The test must assert the disabled foundation workflow has exactly:

```yaml
permissions: {}
```

It must reject `contents: write`, `issues: write`, `pull-requests: write`,
`checks: write`, `id-token: write`, every `secrets.*` reference, PATs, artifact upload, cache save,
job-summary append, unpinned Actions, `workflow_dispatch`, candidate workflow
execution, candidate Action execution, and candidate code execution.
The foundation workflow has no credential input at all and its sole job is
fixed-false. Tests reject `${{ github.token }}`, every token-bearing `env`,
direct `run: node`, arbitrary scripts, candidate modules, and any condition
that could enable the job. A later program must prove the trusted broker before
adding the read token and launcher call.

Run:

```powershell
node --test server/tests/governance-shadow-workflow.test.mjs server/tests/ci-workflow-contract.test.mjs
```

Expected RED: workflow missing.

### Step 2: Implement the trusted source-run evidence reader

`scripts/read-governance-source-run-evidence.mjs` exports exactly:

```js
export function createGitHubReadClient({ transport, repository,
  authProof, allowedOperations, limits }) {}
export async function readSourceRunEvidence({ client, repository, runId,
  runAttempt, trustedWorkflow }) {}
```

The client accepts only a Task 1 `GitHubApiTransport/v1` instance; no token,
URL, method, `gh` path or command string is accepted. Its operation set is
exactly `READ_REPOSITORY`, `READ_PULL_REQUEST`, `READ_GIT_COMMIT`,
`READ_WORKFLOW_RUN_ATTEMPT`, `LIST_RUN_JOBS`, and
`READ_REPOSITORY_CONTENT` for source facts.
`readSourceRunEvidence()` returns
`{ ok: true, code: 'accepted', value: { sourceFacts } }` or a shared tagged
`abstain`; malformed contracts throw the common contract error. `sourceFacts`
is the exact closed `SourceRunFacts/v1` object above.

In injected tests, and only in a future broker-admitted Actions workflow, the
native transport contract uses a job-scoped installation token with only
`actions: read` and `contents: read`, uses the closed
`actions_installation` proof, and never calls `/user` or claims a user actor.
The reader gets the exact source run jobs
and steps plus source workflow bytes at the run head. Workflow bytes are inert
data and must match the policy-approved digest. Job/step names and outcomes must
match the closed trusted inventory. It reads the head Git commit to bind
`treeSha` and reads the canonical workflow-run attempt to bind run ID/attempt,
workflow ID, head SHA/ref/repository, event, status, conclusion, updated time,
and sorted unique PR-number
list. With exactly one PR number it reads that PR and requires the PR head
identity to match the run before binding the PR's `baseSha`; with no PR it uses
the Git commit's unique first parent. Multiple PRs, no usable parent, or any
head/base/tree mismatch is `abstain`. `declaredImage`/OS come
from the trusted workflow's closed `runs-on` scalar and must match the canonical
job-label digest. Exactly one policy-bound check/job must match; its canonical
name becomes `selectedCheckName` and its completion timestamp becomes
`occurredAt`. Zero/multiple matches, incomplete status/conclusion, workflow
permissions/blob drift, label drift, or run/job outcome drift abstains.
`evidenceDigest` uses `SOURCE_FACTS:v1\0` over the closed facts
without that field. The reader never downloads source-run logs
and rejects duplicate identities, oversize output, pagination/rate-limit
ambiguity, and workflow/head mismatch. Tests inject the transport adapter and
token canaries; no token, raw response or free text may enter output.

`scripts/build-governance-shadow-evidence.mjs` exports exactly:

```js
export function parseTriggerCorrelation({ eventBytes, sourceFacts }) {}
export function buildShadowEvidence({ triggerCorrelation, sourceFacts,
  observerIdentity, policy }) {}
```

The builder has no network client and cannot reinterpret or supplement
`sourceFacts`. `parseTriggerCorrelation()` accepts raw untrusted event bytes,
projects only repository/run ID/attempt correlation fields, requires each to
equal `SourceRunFacts/v1`, then returns a closed value and discards the payload.
It cannot supply event, status, conclusion, check name, workflow identity,
source identity, runner identity, evidence, or timestamps. The builder applies
the frozen normative mapping: platform facts come only from source facts;
authority only from `observerIdentity`; evidence kind and the empty artifact
list are fixed literals; redaction digest and expiry duration come only from
`policy`; and only `observationId` and `recordDigest` are computed. It has no
wall-clock input. The shadow-evidence
`createdAt` is exactly `occurredAt`. Foundation
tests call the reader with an injected fake transport and pass only accepted
facts and correlation into the builder; the fixed-false workflow executes no
CLI or launcher.

The closed reason mapping is versioned with the evidence schema:
`diff_check_failed` and `docs_authority_failed` map to `docs_metadata`;
`dependency_install_failed`, `build_failed`, and `site_validation_failed` map
to `ci_configuration`; `server_or_admin_test_failed` maps to
`business_contract`; multiple failing groups, an early infrastructure failure,
or an unrecognized step maps to `unknown`. The mapping explains observed CI
facts only; it cannot infer a test root cause from log text. This makes known
B/C classifications reachable without turning an ambiguous test failure into a
safe route.

### Step 3: Implement the trusted-base evidence builder

`scripts/build-governance-shadow-evidence.mjs`, when exercised with fake
transport or by a future admitted launcher, treats `GITHUB_EVENT_PATH` as an
untrusted complete event payload and requires the trusted reader result. It
projects only a closed allowlist into a redacted in-memory input and never
persists or echoes the raw payload. It prints exactly one bounded
`GOVERNANCE_SHADOW_EVIDENCE_V1=<canonical-base64url>` marker that binds
`github.workflow_ref`, `github.workflow_sha`, run ID, attempt, repository,
 the source workflow run ID/attempt, candidate exact head, observer identity,
 check name, closed redacted `failureSignatureDigest`, classifier version,
 policy digest, Router result digest, and trusted script/reader blob digests.
The signature is derived only from validated platform job/step facts; raw log
content is never an Attribution input.

`shadowResult` is exactly `proposal_candidate`, `operator_escalation`,
`abstain`, or `no_repair`. The builder exits `0` for all schema-valid outcomes,
including `abstain`; malformed or unverifiable transport exits non-zero without
printing the marker. `proposalDigest` is `null` unless the Planner returns
`proposal_ready`. An incomplete Observation uses the tagged `abstain` result;
the shadow schema permits nullable downstream digests for that outcome and does
not fabricate an Observation.

### Step 4: Add abstention, collector, assessment, and injection tests

The pure fake-transport path must output `abstain` when canonical provenance
cannot be read, digests conflict, evidence is incomplete, policy is stale, or
the input carries prompt-injection content. The foundation workflow itself is
fixed-false and emits nothing.

Fixed tests also require `abstain` with no schema-valid Observation for forged
event correlation, run status/conclusion drift, zero or two policy-check
matches, workflow blob/byte/permissions drift, runner-label drift, PR/base/head/
tree drift, or a missing completion timestamp. One positive literal vector must
prove every `SourceRunFacts/v1` to Observation field mapping, timestamp/expiry
derivation, and both evidence/Observation digests.

`server/services/governance/governance-shadow-evaluation.mjs` exports exactly:

```js
export async function collectGovernanceShadowDataset({ client, repository,
  sourceWorkflow, shadowWorkflow, window, inventoryCutoffAt,
  assessmentCandidates, limits }) {}
export function evaluateGovernanceShadow({ dataset, evaluationAsOf,
  collectorIdentity, evaluatorIdentity }) {}
```

Both are pure relative to GitHub: the collector receives only an injected,
closed read client; the evaluator has no client. `assessmentCandidates` are
same-invocation local values only and may be empty; no copied comment, file,
artifact, cache, stdout marker, or earlier Gate is accepted as authority.

The foundation registers no shadow-evidence launcher operation. Task 6A modules expose only
pure builders/evaluators and injected-client library functions for contract
tests. Tests supply an in-memory fake read client directly; there is no
foundation CLI or workflow path that selects a client, transport, module, URL,
or entry point. The fixed-false workflow invokes none of these modules and has
no token. Only a later independently approved broker/settings activation Gate
may add shadow execution, and it must define separate non-overloaded operation
IDs, map each to one frozen entry point/input schema, extend the trusted bundle
and launcher tests, and enable exact read-only permissions. An operation ID may
never select among collector/evaluator/builder entry points from input data.

In injected tests, the collector permits only repository, workflow-run,
attempt, run-job, repository-content, and shadow-run-log GET operations. It
forbids source-run logs, Issue-comment consumption in this foundation, GraphQL,
arbitrary URLs, auth/token output, and credential fallback. The exact official
shadow-run-log operation alone may use the transport's one-redirect protocol.
Compressed/expanded byte and member limits apply before marker parsing. Every
list uses `per_page=100` and increasing pages until the first empty page;
workflow-run completeness additionally requires the partition/cap proof below.
Timeout, rate-limit, response-size, cutoff, or page ambiguity is
`abstain`; no partial manifest is valid. An unprovable token scope is recorded
as `credential_authority_assumption: full_repository` and never represented as
least privilege.

The collector fully paginates all matching source CI runs created no later than
the literal `inventoryCutoffAt`, separately
enumerates shadow runs, reads only their ordinary shadow logs, verifies the
redacted framework marker and
workflow/script identity, and left-joins by source run ID/attempt. It binds the
inventory cutoff/filter digest, emits rows for missing shadow runs and
invalid/unparseable/expired logs, rejects duplicate run keys, and verifies each
same-invocation assessment candidate's closed schema, template/window/dataset
bindings, ordered decision coverage, `templateDigest`, and `assessmentDigest`.
Assessment rows also bind `adjudicatedRisk`, `evidenceComplete`,
`routeSafety`, `independentlyReviewed`, and classification correctness. The
collector derives `runKey` with `SHADOW_RUN_KEY:v1\0` from repository, source
workflow path and exact workflow-byte digest, run ID, and attempt. For valid failure evidence only, it
 derives `lineageKey` with `FAILURE_LINEAGE:v1\0` from repository, source
workflow path, source head, check name, and the trusted failure-signature
digest; run/shadow IDs, attempts, timestamps, and free text are excluded.
Missing, unparseable, and non-failure rows have `lineageKey: null` and cannot
inflate the lineage denominator. Such candidates are local evaluation inputs,
not durable assessments. `workflow_dispatch` and other diagnostic runs are excluded from the
natural-event denominator. A caller-provided prefiltered run list is invalid.
Actual query time is excluded from the manifest and digest. Every reconstruction
uses the same cutoff; a run after it is excluded even if visible. Only the
natural first shadow attempt may populate the row; later manual rerun
attempts are diagnostic metadata and cannot replace a missing or invalid first
attempt or enter any denominator.

Workflow-run inventory never treats ordinary page exhaustion as proof against
GitHub's 1,000-result search cap. The collector starts with exactly 336
contiguous UTC-hour ranges and calls `LIST_WORKFLOW_RUNS` with whole-second
inclusive `createdFrom`/`createdThrough`. A range reporting 1,000 or more is
recursively bisected at a whole-second boundary; the parent result is discarded.
A one-second range still at the cap abstains. Every accepted leaf reports fewer
than 1,000 and must return exactly `reportedTotalCount` items with complete
pagination. The ordered leaf manifest must cover the window with no gap or
overlap; duplicate `(runId, runAttempt)`, boundary drift, or count mismatch
abstains instead of deduplicating. The complete partition digest is included in
the inventory filter and dataset digest. Tests include a synthetic window with
more than 1,000 runs, cap-triggered recursive splits, a saturated one-second
leaf, overlap, gap, duplicate, and count-mismatch cases.

The list response's `latestRunAttempt` is only an enumeration ceiling. For
each run, the collector reads attempts `1..latestRunAttempt` with
`READ_WORKFLOW_RUN_ATTEMPT`, retains only attempts whose canonical
`runStartedAt` is no later than `inventoryCutoffAt`, and emits one row per
retained attempt. At the end it repeats the complete partition inventory and
requires every `(runId, latestRunAttempt)` plus the partition digest to match
the initial snapshot. Post-cutoff reruns are excluded; a rerun during
collection, missing intermediate attempt, changed latest-attempt count, or
unprovable cutoff-time membership makes the dataset unavailable with no retry.
Tests cover post-cutoff reruns, a rerun arriving mid-collection, attempt-count
drift, and source/shadow attempt asymmetry.

`build-governance-shadow-assessment.mjs` is pure and exports exactly:

```js
export function buildAssessmentTemplate({ targets, operatorDecisions,
  windowDigest, datasetDigest, gateId }) {}
export function finalizeAssessmentCandidate({ template }) {}
```

Targets are unique and sorted by `runKey`; decisions cover the same keys
exactly. The template contains the complete entries and hashes under
`SHADOW_ASSESSMENT_TEMPLATE:v1\0`. Finalization accepts no proposal/approval
readback, approval event, actor, authority snapshot, timestamp, expiry, receipt,
publication, copied file, or earlier-Gate input. It validates and embeds the
closed template unchanged, derives only `assessmentDigest`, and returns the
local same-invocation candidate. It never accepts `result`, renders an Issue
body, builds a receipt, or has a GitHub client.

### Step 5: Add the exact read-only workflow

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

permissions: {}

concurrency:
  group: governance-repair-shadow-${{ github.event.workflow_run.id }}
  cancel-in-progress: false

jobs:
  shadow:
    if: ${{ false }}
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - name: Disabled until trusted credential broker admission
        shell: pwsh
        run: exit 1
```

The fixed-false job is intentional and contract-tested. It receives no token,
does not check out or execute repository code, and cannot be enabled by a
repository variable or event input. A later source/settings Gate may replace
the fixed-false body only after the trusted credential broker, frozen launcher
identity, required permissions/ruleset, and threat tests are independently
delivered. That future workflow must call the launcher rather than direct
`node`; it is outside this foundation plan.

The foundation workflow never checks out or executes a candidate and never
receives a token. The future observation window cannot start until a fresh
read-only inventory proves Actions run/log retention covers the fixed window
and freeze buffer, and the separate broker/settings Gate has enabled the
launcher path. No diagnostic artifact or durable evidence record is created by
this foundation workflow.

### Step 6: Verify and commit

Run:

```powershell
node --test server/tests/governance-shadow-workflow.test.mjs server/tests/governance-shadow-dataset.test.mjs server/tests/governance-github-api-transport.test.mjs server/tests/ci-workflow-contract.test.mjs server/tests/governance-observation-attribution.test.mjs server/tests/governance-repair-plan-provenance.test.mjs
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
```

Expected GREEN: all workflow contract tests pass; the workflow is fixed-false,
tokenless, and has no write surface. Commit once:

```powershell
git add .github/workflows/governance-repair-shadow.yml schemas/governance-shadow-evidence-v1.schema.json schemas/governance-shadow-dataset-v1.schema.json schemas/governance-shadow-assessment-template-v1.schema.json schemas/governance-shadow-assessment-v1.schema.json schemas/governance-shadow-evaluation-v1.schema.json schemas/README.md server/services/governance/governance-shadow-evaluation.mjs scripts/read-governance-source-run-evidence.mjs scripts/build-governance-shadow-evidence.mjs scripts/build-governance-shadow-assessment.mjs scripts/collect-governance-shadow-dataset.mjs scripts/evaluate-governance-shadow.mjs server/services/governance/governance-contracts.mjs server/services/governance/governance-digests.mjs server/tests/governance-contracts.test.mjs server/tests/fixtures/governance-digest-vectors.json server/tests/governance-shadow-workflow.test.mjs server/tests/governance-shadow-dataset.test.mjs server/tests/ci-workflow-contract.test.mjs package.json
git commit -m "feat: add disabled governance shadow contracts"
```

Stop after exact-head checks. The workflow remains disabled; no live shadow
output or evaluation is part of this Task.

---

## Deferred: Governance-evidence Publication Admission And Writer

This work is not a Task or PR in the foundation program. The foundation must
not create or merge `publish-governance-shadow-assessment.mjs`,
`publish-governance-shadow-evaluation-receipt.mjs`, another Issue-comment
writer, or a CLI/library entry point capable of publishing framework evidence.
Task 1 does not expose `CREATE_ISSUE_COMMENT`; Task 6A produces local candidates
only.

Real publication is ineligible until a future independent program delivers and
protects all of the following:

1. `GovernanceEvidencePublicationPlan/v1` and its own digest domain;
2. publication-specific approval and legal state-transition types;
3. an atomic create-if-absent publication claim and single-use approval
   consumption;
4. a protected claim namespace plus exclusive writer-capability proof;
5. publication Admission, provenance, lost-response, replay, late-duplicate,
   concurrent-writer, and reconciliation tests;
6. a trusted broker/launcher and bounded writer using a later reviewed native
   transport extension;
7. separate exact source, threat-review, and settings Gates.

The future plan must bind publication kind, parent receipt, repository/Issue,
ordered object keys/body digests, source identities, actor/App policy, expiry,
policy digest, and plan digest. Its atomic claim must bind plan/approval
digests, run/attempt, lock owner, and object-sequence digest. Only the one runner
that creates and exactly reads back the claim may consume approval or POST.
That admitted writer must call the merged
`collectGovernanceShadowDataset()` and `evaluateGovernanceShadow()` APIs itself
in the same trusted process from canonical GET evidence. It may not accept
`regeneratedEvaluationBytes`, a copied manifest, or a local candidate as an
input.
Invocation-local budgets, absence pagination, or post-write duplicate detection
do not substitute for atomic Admission. An ordinary Repair Plan approval cannot
authorize evidence publication.

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

**Consumes:** Tasks 1-5 and 6A.
**Produces:** one machine-readable foundation threat-model result. This PR may
change tests and the validator only; it must not fix component implementation
failures discovered during injection. It does not claim the frozen design's
full Security Exit Criteria because the real claim, repair-branch publisher,
evidence-publication Admission/writer, and workflow activation remain absent.

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
- Actions installation token incorrectly sent to `/user`, triggering actor
  misrepresented as credential principal, or ambiguous auth mode accepted;
- inherited Node preload/loader/module path, TLS bypass/custom CA, proxy, or
  candidate transitive dependency in a token-bearing process;
- workflow, validator, permission, expected-App, and trusted-SHA drift;
- candidate validator/executor self-attestation and direct-`master` write intent;
- silent secret-access, token-permission, or mutation-scope expansion;
- duplicate JSON keys, invalid UTF-8, schema downgrade, and cross-schema,
  cross-repository, cross-lineage, or cross-protocol-domain digest substitution;
- included-self digest preimages, wrong self-field deletion, and fixed-vector
  mismatch;
- unauthorized or stale actor; edited, deleted, duplicate, or replayed approval;
- two-runner claim collision and approve/withdraw race;
- claim deletion, replacement, lost response, namespace/ruleset/bypass drift;
- candidate code/Action/workflow execution in a token-bearing job;
- wrong App/head/check evidence passed to pure Admission;
- symlink, mode, rename, binary, submodule, and untracked-file smuggling;
- prompt injection and raw secret material;
- artifact upload, cache save, job-summary append, or another shadow write
  surface;
- source workflow-blob mismatch, duplicate/missing job or step, unclosed reason
  code, attempted source-log access, token canary, non-GET API call, off-host
  redirect, incomplete pagination, rate-limit ambiguity, stale native
  transport/Node identity, or stored-credential fallback;
- incomplete source-run pagination, a source run missing its expected shadow
  row, more than 1,000 created-filter results without recursive partition proof,
  a saturated one-second partition, partition gap/overlap/duplicate/count drift,
  a post-cutoff or mid-collection rerun, attempt-count drift, prefiltered dataset
  input, unproven Operator assessment, rerun-inflated lineage count, and
  zero/below-minimum metric denominators;
- assessment-batch subset selection, forged assessment candidate, evaluation
  input/digest mismatch, or any reachable foundation module/operation that can
  call `CREATE_ISSUE_COMMENT`;
- unknown mutation incorrectly reported as no mutation.
- an assessment candidate carrying approval, authority, receipt, publication,
  created/expiry, copied-file, or earlier-Gate fields; wrong template/candidate
  digest; or project-state partial replacement reported as no mutation.

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
- local evaluation candidate represented as a durable receipt.

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
- governance-evidence publication approval/claim race, terminal durable receipt
  loss, and remote reconciliation.

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
node --test server/tests/governed-repair-failure-injection.test.mjs server/tests/governance-contracts.test.mjs server/tests/governance-github-api-transport.test.mjs server/tests/governance-observation-attribution.test.mjs server/tests/governance-repair-plan-provenance.test.mjs server/tests/governance-repair-admission.test.mjs server/tests/bounded-repair-executor.test.mjs server/tests/governance-shadow-workflow.test.mjs server/tests/gate-governance.test.mjs server/tests/execution-contract.test.mjs server/tests/ci-workflow-contract.test.mjs
npm run governance:failure-injection
npm run governance:check
npm run project-state:check
npm run test:ci-lanes
npm run docs:authority:check
npm test
git diff --check
git status --short
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

## Deferred Tasks 8A-8D: Live Shadow Evaluation And Durable Publication

```yaml
status: deferred_ineligible
part_of_current_program_exit: false
commands_executable_now: false
production_impact: none
```

The current plan does not run a live assessment/evaluation window and does not
publish assessment data or an evaluation receipt. Tasks 8A-8D require the
future publication-specific plan, approval, atomic claim, Admission, protected
capability, trusted broker/launcher, retention proof, and source/settings Gates
defined above. An ordinary Repair Plan approval cannot enable them. No local
candidate, stdout marker, Actions artifact, cache, copied Issue body, or
invocation-local POST budget is a durable handoff. Until those prerequisites
merge and are independently enabled, all live commands are absent and the
canonical state remains `shadow_evaluation_operational_result: not_run` and
`shadow_evaluation_receipt_published: false`.

---

## Task 9A: Independent C-tier Markdown Marker Bootstrap

**Risk:** C
**Expected PR count:** 1
**Production impact:** None

After the seven source PRs merge, create one independent docs-only PR that may
modify only:

- `docs/CURRENT_RELEASE_STATE.md`
- `RELEASE_MANIFEST.md`
- `docs/PROJECT_CONTEXT.md`

Its proposal binds exact `origin/master`, all three file SHA-256 values, every
globally unique selector ID, and every literal full-line insertion boundary. It
may insert only paired
`<!-- project-state-selector:<selectorId>:start -->` and
`<!-- project-state-selector:<selectorId>:end -->` lines around the exact future
sync regions. It must not change, reorder, rewrap, normalize, or replace an
existing body byte. Removing only the inserted marker lines from each candidate
file must reproduce the exact pre-change bytes and SHA-256; original uniform LF
or CRLF style is preserved.

Run `npm run docs:authority:check`, `npm run project-state:check`,
`git diff --check`, the marker-stripping byte-identity proof, exact three-file
scope, post-commit `git diff --check origin/master...HEAD`, and the shared
exact-head validation. The PR does not synchronize project state or claim that
the framework is implemented. Task 9B is ineligible until this PR is formally
reviewed, independently made Ready, merged, and rebound as current master.

---

## Task 9B: Read-only Project-state Selector Inventory

**Risk:** C read-only evidence (ordinary Gate records only)
**Expected PR count:** 0
**Production impact:** None

After the seven source PRs actually merge, create a durable read-only proposal
that binds their merge SHAs, the then-current `origin/master`, the six exact
authority-file SHA-256 values, and one closed selector-request JSON containing
the intended discriminated JSON Pointer/Markdown-region objects and exact
canonical after values.
After approval, run once:

```powershell
node scripts/verify-project-state-selectors.mjs `
  --mode inventory `
  --input "<proposal-bound-absolute-canonical-json>" `
  --output "$env:RUNNER_TEMP\project-state-selector-inventory-result.json"
```

The input uses `ProjectStateSelectorInventoryInput/v1`; accepted output is
`ProjectStateSelectorCommandResult/v1` and carries the sole canonical manifest
as `evidence.manifestBase64` plus `manifestDigest`. The decoded
`ProjectStateSelector/v1` contains sorted unique file paths/selectors, exact
before and expected-after whole-file SHA-256/size, `expectedMatchCount: 1`,
before-value digest, canonical after-value type/base64/digest/size, and
`manifestDigest` under `PROJECT_STATE_SELECTOR:v1\0`. The validator rejects
missing, duplicate,
overlapping, type-incompatible or out-of-scope selectors. JSON pointers use
canonical RFC 6901 escapes; Markdown regions use the exact start/end whole-line
grammar, raw body intervals, and LF/CRLF preservation frozen by the design and
Task 1 vectors. This Gate reads only;
apart from its ordinary redacted terminal receipt it does not edit, commit,
push, open a PR, or publish project-state. The terminal receipt binds the exact
manifest/result digests; without exact readback Task 9C is ineligible. A later
proposal-preparation authorization may copy the canonical manifest bytes into the
Task 9C proposal but may not regenerate or alter it.

---

## Task 9C: Independent C-tier Project-state Synchronization

**Risk:** C
**Expected PR count:** 1
**Production impact:** None

After the seven source PRs merge, Task 9A is merged, and Task 9B passes,
synchronize only the
existing authorities:

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
  failure_observation_and_attribution: source_implemented_not_enabled
  repair_planner_and_provenance: true
  pre_post_claim_admission: synthetic_only
  bounded_executor_contract: disabled
  actions_shadow_contract: disabled
  foundation_failure_injection: passed

shadow_evaluation:
  operational_result: not_run
  durable_receipt: absent

not_enabled:
  - real_claim_writer
  - automatic_repair_branch_publisher
  - automatic_repair_draft_PR_publisher
  - governance_evidence_publication_admission
  - governance_evidence_writer
  - shadow_assessment_publication
  - shadow_evaluation_receipt_publication
  - repository_settings_enforcement
  - write_executor
  - production_executor

production: unchanged
```

The separately approved Task 9C proposal embeds the exact Task 9B manifest and
digest. Before mutation, require `origin/master`, every file SHA, selector,
match count, before value and manifest digest to match:

```powershell
node scripts/verify-project-state-selectors.mjs `
  --mode pre-mutation `
  --input "<proposal-bound-absolute-canonical-json>" `
  --output "$env:RUNNER_TEMP\project-state-pre-mutation.json"
```

Apply only the manifest's exact after values with the merged applicator. No
selector, anchor, path or value may be inferred at execution time:

```powershell
node scripts/apply-project-state-selectors.mjs `
  --input "<proposal-bound-absolute-canonical-json>" `
  --output "$env:RUNNER_TEMP\project-state-application.json"
```

The applicator must complete its built-in pre-verification, temporary-sibling
validation, atomic-replace sequence, and post-verification. A pre-rename
failure proves no mutation. Any partial-rename or uncertain result stops with
`mutationState: unknown`, `canonicalResult: unavailable`, and status
`reconciliation_required`; it is not retried or hand-edited. Then run:

```powershell
node scripts/verify-project-state-selectors.mjs `
  --mode post-mutation `
  --input "<proposal-bound-absolute-canonical-json>" `
  --output "$env:RUNNER_TEMP\project-state-post-mutation.json"
npm run docs:authority:check
npm run project-state:check
git diff --check
```

Post-mutation mode proves every expected-after whole-file identity, selected
value, and non-selected byte, plus all other paths and file count unchanged.
Any base drift, missing/multiple
anchor, selector overlap, value mismatch or extra byte is blocked. Expected
result: all commands pass; only the six existing authority files are changed.
Commit once under the separately approved C-tier Gate:

```powershell
git add project-state/current.json project-state/lanes.json project-state/tasks.json docs/CURRENT_RELEASE_STATE.md RELEASE_MANIFEST.md docs/PROJECT_CONTEXT.md
git commit -m "docs: synchronize governed repair foundation state"
```

Then follow the shared post-commit exact-head protocol, rerunning selector
post-mutation validation with `target.kind: commit`, exact head, and
`parentHead: manifest.baseHead`,
`project-state:check`, `docs:authority:check`, both diff checks, and the clean
worktree assertion against the committed head.

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
| Actions shadow surface is disabled/read-only by construction | Task 6A | fixed-false job and zero-token workflow contract tests |
| Shadow candidate data never executes with a write token | Tasks 6A and 7 | disabled workflow and token-canary tests |
| Governance-evidence writer is absent | Tasks 1, 6A, and 7 | no `CREATE_ISSUE_COMMENT`, publisher module, CLI, or workflow caller |
| No automatic Risk A execution | #499 + Tasks 3, 6A, and 7 | routing and failure-injection assertions |
| Retry budget cannot reset | #499 + Tasks 3 and 7 | immutable lineage tests |
| Foundation threat contracts are executable | Task 7 | machine-readable foundation result plus explicit activation blockers |
| Complete shadow denominator cannot be preselected | Task 6A | synthetic source-run pagination, left-join, missing-row, lineage, and manifest-digest tests |
| Local assessment/evaluation cannot impersonate durable evidence | Tasks 6A and 7 | candidate-only schemas and absent writer/receipt contracts |
| Project-state selectors are unique and exact | Tasks 1, 9A, and 9B | byte-preserving marker bootstrap plus closed manifest/read-only preflight |
| Project-state application is exact and fail-closed | Tasks 1 and 9C | manifest-only applicator, pre/post verification, and partial-replace reconciliation tests |
| Runtime truth remains separate | Task 9C | source-vs-enabled snapshot fields |

## Activation Is A Separate Future Program

Completion of this plan does not authorize or make eligible:

1. a real atomic GitHub claim writer;
2. an exclusive `contents: write` capability and claim-namespace ruleset;
3. a governance-evidence publication Plan, approval, atomic claim, Admission,
   protected writer capability, or durable shadow-evaluation receipt;
4. a trusted credential broker/settings activation for shadow observation;
5. a workflow repair adapter;
6. automatic repair-branch creation, exactly-one-commit publication, or repair
   Draft-PR creation (the source-task bootstrap Draft-PR helper grants no such
   framework capability);
7. a trusted exact-head validation publisher;
8. required checks, required reviews, conversation resolution, or environment
   reviewer settings;
9. artifact publication, deployment, rollback, provider, runtime, or
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
shadow_collection_contract_tests_passed: true
shadow_evaluation_contract_tests_passed: true
shadow_evaluation_operational_result: not_run
shadow_evaluation_candidate_generated: false
shadow_evaluation_receipt_published: false
assessment_publication_gates: 0
evaluation_receipt_publication_gates: 0
governance_evidence_publication_plan_present: false
atomic_evidence_publication_claim_present: false
governance_evidence_writer_present: false
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
