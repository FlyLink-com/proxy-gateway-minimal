# GitHub Issue And PR Workflow

Last updated: 2026-08-30, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: github_issue_pr_workflow
  superseded_by: null
  last_verified_at: 2026-08-30
  production_authority: false
```


> Status:
> - Type: Active workflow rule
> - Risk: C
> - Execution authority: Does not authorize production, AWS, Vultr, Aliyun,
>   DNS, Nginx, systemd, firewall, SQLite, node, tenant, artifact, payment,
>   deploy, rollback, secret, token, subscription URL, credential, or
>   customer-data actions
> - Production impact: None
> - Source of truth for: How GitHub Issues, PRs, and Project #1 split tracking,
>   summarization, validation, projection, and closeout ownership

## Purpose

Use GitHub Issues as durable index cards. Use PRs as execution summaries and
validation receipts.

This keeps iteration fast while preserving traceability for work that cannot be
understood from a single diff. The issue owns the long-running intent, scope,
state, required PRs, and done criteria. The PR owns the concrete change,
validation result, deploy note if applicable, and remaining gates for that
specific diff.

## Four Release Gates

Apply these gates prospectively. They do not rewrite, reopen, or retroactively
reclassify any historical Issue comment, approval, Deploy Note, rollback, or
other gate receipt.

| Gate | Required boundary | Default risk |
| --- | --- | --- |
| Source Gate | Record source intent, allowed files, focused and full validation, and diff checks for the exact source head. | Follows the touched surface; normally Risk B for server or shared source, and Risk C for docs-only work. |
| Merge Gate | Bind reviews, required checks, the Ready transition, and merge to the exact reviewed head. | Follows the source change; it does not authorize artifact publication or production mutation. |
| Artifact Gate | Bind the exact artifact to the exact `master` commit, immutable artifact identity, SHA-256, manifest, and retrievability through the deployment and rollback window via a durable store or an explicitly verified target backup. | Short-lived GitHub Actions artifacts are build evidence only; they cannot make a release `ready` or authorize deployment. |
| Production Gate | Use fresh live inventory, exact operator approval, an exact target and mutation boundary, backup, target validation, aggregate identity evidence when applicable, and rollback-ready evidence. | Always Risk A. |

This is an `A envelope / B source core` model: a release path that may
eventually reach production can keep a focused server/shared source PR at Risk
B while the later runtime or provider mutation remains a separate Risk A
Production Gate. Passing one gate does not imply, consume, or authorize the
next gate.

Setting `identity_impact: true` records downstream runtime impact and the need
for later Identity Gate evidence. It does not, by itself, elevate a source-only
PR from Risk B to Risk A. Any runtime, provider, deployment, promotion, or
rollback mutation remains separately gated as Risk A.

## Preflight, Approval Consumption, And Gate Stops

Before requesting execution approval, the controller checks that the intended
transport and tools work and that the repository and exact head are readable.
A transport or tool failure found before approval is a setup failure, not a
business remediation result, and must not be recorded as a successful, failed,
or rolled-back remediation attempt.

A durable execution approval is bound to the exact gate, head, scope, target,
and mutation boundary stated in its approval text. It is consumed when the
controller begins the approved execution. Once consumed, it is never reused,
including after a stopped, failed, or rolled-back attempt; a retry requires a
new exact gate and new approval.

An unexpected head, scope, test, identity, or mutation-boundary result stops
the active gate. Do not widen scope, cross into the next gate, or continue under
the consumed approval. Preserve the receipt as recorded and open a corrected
gate prospectively instead of editing historical evidence.

## Machine-Readable Failure Attribution And Repair Routing

`project-state/gates.json` is a prospective-only, machine-readable evidence
index. It does not backfill historical Issue comments and does not replace the
durable proposal, approval, or terminal receipt. Each ledger entry binds the
Gate scope and evidence digests, and a blocked Gate may only advance through:

```text
terminal_blocked
  -> failure_attributed
  -> repair_routed
  -> successor_proposed
```

The v1 validator proves structure, identity consistency, append-only history,
and deterministic routing. It does not prove that a referenced GitHub comment
exists, who authored it, or that its body matches the digest. Any future repair
executor must first perform connector-backed provenance readback and bind the
category-specific repair delta plus the actual changed-file diff; the ledger
alone is never mutation authority.

`project-state/repair-policy.json` controls routing. A failure is eligible for
the `codex_auto_repair` lane only when its effective risk is B or C, attribution
has high confidence, its category is explicitly allowlisted, no escalation
invariant is affected, and its immutable successor-lineage retry budget remains
available. The route is eligibility evidence for a bounded Codex-owned
successor; it does not reopen or continue a consumed Gate and does not itself
authorize a source, GitHub, provider, runtime, or production mutation.

The ledger binds the exact repair-policy SHA-256. Within schema version 1 the
policy is immutable across a normal ledger transition, and its hard safety
floor cannot be removed: Risk A has no automatic retry, B/C retry budgets are
at most one, automatic categories remain allowlisted, and every security,
credential, production, scope, sensitive-output, and contract invariant remains
an escalation condition.

The default escalation invariants include scope drift, security or credential
boundary changes, production-boundary changes, sensitive output, and contract
changes. Any such invariant routes to operator review. An unsupported category,
insufficient attribution confidence, or exhausted retry budget also routes to
operator review. Risk A in either the Gate or the attributed failure always
requires a new operator approval; Codex may prepare the successor evidence but
cannot consume that approval on the operator's behalf.

Repository trust-root files, all Actions workflows/actions, non-documentation
`ops/` files, and `deployments/` state always route to operator review even if
an attribution labels the transport failure B or C. Attribution cannot lower a
scope-derived protection boundary.

Retry attempts are derived from the immutable predecessor relationship rather
than trusted from a new event in isolation. A successor cannot reset the retry
budget to zero. Automatic successors inherit the exact lineage, subject, risk,
source head, and scope; operator-authorized successors may change the approved
scope but cannot lower risk or change the issue/PR/purpose identity. Approval
events bind the exact Gate, lineage, authority, source head, and scope digest.
A policy-routed successor records `repair_policy` authorization rather than
pretending an operator approval occurred. Successor timestamps must follow the
predecessor's final event. An expired Gate may later append only an exact
`successor_proposed` link; it cannot resume execution under the expired
authorization.

A blocked receipt can occur before approval, after approval was recorded but
before consumption, or after consumption. Its state claims separately record
source-file changes, commit creation, push delivery, and any retained local
state digest. This permits an honest fail-closed receipt without treating a
dirty worktree as production mutation. The validator also rejects historical
event rewrites, Gate deletion or reordering, evidence identity or role reuse,
non-deterministic route claims, unsafe repository paths, and a successor not
named by its exact predecessor.

Actions separates three contexts:

- `Governance evidence` runs candidate code for ordinary CI evidence and never
  shares a name with the trusted advisory context.
- `Governance snapshot` is manual and validates only the current snapshot.
- `Governance trusted advisory` uses `pull_request_target`, trusted base-branch
  validator code, and read-only checkout of only the candidate state files. It
  compares exact base/head ledgers and policies from regular Git blobs without
  following candidate symlinks, and rejects candidate changes to its trust-root
  workflow, validator, schemas, or repair policy. It does not execute candidate
  code or retain checkout credentials.

These workflows neither create a successor nor change GitHub settings.
`pull_request_target` runs against the base branch identity, so this advisory
context must not be mapped directly as a latest-head required check. A separate
settings/Actions design Gate must choose a protected pull-request trust root or
an exact-head status publication mechanism before machine enforcement is
claimed. Trust-root upgrades also require that independent lane.

## Command Ownership And Enforcement Evidence

One controller owns final validation for the exact head and all GitHub
integration for the change. Implementers modify only their assigned scope, run
only the scoped implementation validation requested by the controller, and
return the result without merging or advancing another gate. Semantic
reviewers are read-only unless a separate authorization explicitly grants a
write or execution boundary.

Issue comments and approval text are durable process evidence, not platform
enforcement. Claim branch or ruleset protection, or deployment-environment
protection, only after live readback of the applicable settings. A workflow
capable of a real production deployment must remain disabled or require an
independently enforced approval; comments or approval wording alone are not
sufficient enforcement.

## When An Issue Is Required

Create or link an issue before opening the PR when any of these are true:

- The work is Risk A.
- The work is expected to require more than one PR.
- The work reconciles source state with production/runtime state.
- The work archives stale branches, stale docs, old release packages, or
  historical versions.
- The work belongs to a main lane: payment, auth, user portal, traffic
  accounting, subscription rendering, data-plane integration, runtime
  collection, or production operations.

## When An Issue Is Optional

An issue is optional for:

- Small single-PR Risk C docs updates.
- Small single-PR Risk B fixes with local validation.
- Targeted test coverage or typo/copy changes.
- PRs where the PR template alone fully captures the intent, validation, and
  remaining gates.

Optional does not mean forbidden. If a small change is part of a larger lane,
link it back to the lane issue.

## Issue Ownership

An issue should track:

- Goal and operator/user outcome.
- Risk tier and production/runtime posture.
- In-scope and out-of-scope work.
- Source/production drift status when relevant.
- Required PR list and current completion state.
- Validation gates and done criteria.
- Links to runbooks, execution records, superseded PRs, and follow-up issues.

Issues must not contain secrets, raw configs, subscription URLs, credentials,
SQLite rows, customer data, provider tokens, or raw private logs.

## PR Ownership

A PR should summarize:

- The linked issue or a clear reason that no issue is needed.
- The concrete files and behavior changed by this diff.
- Risk tier and production/runtime impact.
- Actual validation commands and results.
- Deploy note only when a deploy, rollback, or static replacement was actually
  performed.
- `identity_impact` and the Identity Gate posture when runtime principals or
  their accounting bindings can change.
- Remaining gates for work outside the PR scope.

Use `Refs #123` when the PR contributes to the issue but does not complete the
done criteria. Use `Closes #123` only when the issue's done criteria are fully
satisfied by the merged PR.

## Identity-Impacting Work

Identity is not a release unit. Keep the existing `release_unit` and set
`identity_impact: true` when a source change or runtime Change Record can alter
Xray or Mihomo principals, protected usage maps, material bindings, or
collector identity resolution.

At PR time, declare a safe logical `surface` and keep the downstream runtime
Identity Gate `pending` unless an approved target-runtime action already
produced evidence. That pending downstream gate does not by itself change the
risk of a source-only PR. After an actual identity-impacting deployment, the
Deploy Note records aggregate before/after counts and the final `verified`,
`degraded`, or `blocked` state. Runtime health alone is not evidence of
identity synchronization.

Stale map entries do not serve as historical accounting storage. They require
a separate read-only retention review before removal because residual runtime
observations may still exist. See `docs/IDENTITY_LIFECYCLE.md` for lifecycle,
count semantics, retention states, and the no-sensitive-output boundary.

## Risk Mapping

| Risk | Issue rule | PR rule | Validation |
| --- | --- | --- | --- |
| C | Optional unless part of a larger lane. | One focused PR. | `git diff --check origin/master...HEAD` |
| B | Optional for a single focused fix; required if multi-PR. | Intent, code, tests, and docs in one PR when feasible. | Touched-surface tests plus diff check. |
| A | Required before mutation or production gate execution. | Runbook, approval evidence, execution, validation, and rollback are auditable. | Runbook-specific validation only. |

## Project Board Use

The organization-owned [GCC WebOS — Delivery Project #1](https://github.com/orgs/gccwebos-com/projects/1)
is the live portfolio index for this repository. It does not replace Git,
Issues, PRs, deployment receipts, or production evidence.

Keep authority separated:

- An Issue owns the durable goal, scope, declared risk, done criteria, and links
  to any required Risk A gate; an Issue field or status never grants mutation
  authority.
- A PR owns the concrete diff, tests, Deploy Note when applicable, and
  remaining gates.
- Project #1 projects live work through six narrow fields: `Status`, `Lane`,
  `Risk`, `Source / Production State`, `Validation State`, and
  `Production Impact`.
- Within that projection, `Lane` is the mutable navigation classification for
  current item membership. Native Issue/PR records still own item state, scope,
  declared risk, done criteria, and links; Project fields grant no authority.
- `project-state/lanes.json` owns reviewed lane definitions and safety
  boundaries. Dated state snapshots may preserve evidence, but they do not own
  current Issue, PR, Project, deployment, or runtime facts.

### Reviewed Project configuration

This document is the canonical human-readable owner for Project #1 field,
view, and native-workflow semantics. The matching reviewed machine contract is
`project-state/project-v2-contract.json`. That contract fixes expected names,
types, options, filters, and workflow transitions; it does not store live item
values. A live export discovers GraphQL field and option IDs on every read
instead of treating guessed or historical IDs as authority.

All six managed fields are single-select fields:

| Contract key | Project field | Exact reviewed options | Semantic owner |
| --- | --- | --- | --- |
| `status` | `Status` | `Backlog`, `Todo`, `In Progress`, `Blocked`, `Done` | Native Issue/PR lifecycle remains authoritative; Project workflow or manual projection only. |
| `lane` | `Lane` | `traffic-accounting`, `portal-lifecycle`, `commercial-foundation`, `operations-foundation`, `version-management`, `dependency-materialization`, `legacy-retirement` | `project-state/lanes.json` owns definitions and safety boundaries. |
| `risk` | `Risk` | `A`, `B`, `C` | Native Issue/PR declaration and the applicable runbook own risk. |
| `source-production-state` | `Source / Production State` | `aligned`, `drift`, `runtime-only`, `artifact-only`, `unknown` | Exact source, artifact, deployment, and fresh runtime evidence own the underlying facts. |
| `validation-state` | `Validation State` | `Not started`, `Running`, `Passed`, `Blocked` | Exact-head required checks and task-specific receipts own validation. |
| `production-impact` | `Production Impact` | `none`, `read-only`, `mutation gated separately` | The task risk boundary and exact Production Gate own production authority. |

Field requiredness is explicitly scoped by the contract's
`itemFieldRequirements`; the existence of six managed fields does not make all
six mandatory on every Project item:

| Project item scope and native kind | Required managed fields |
| --- | --- |
| `managed_repository` Issue | `Status`, `Lane`, `Risk`, `Source / Production State`, `Validation State`, `Production Impact` |
| `managed_repository` pull request | `Status` only |

The live export still collects all six field slots for both kinds. A non-null
optional PR value must still bind to the observed field and option IDs and use
a declared option, but an empty optional PR slot is not missing-field drift.
Draft, external-repository, and unavailable-content items are outside these
requiredness rules.

The four maintained views are:

| View | Layout | Exact filter | Grouping |
| --- | --- | --- | --- |
| `Portfolio Triage` | table | `is:issue is:open` | none |
| `Execution Board` | board | `is:issue is:open` | group by `Status`; slice by `Lane` |
| `Risk A Gates` | board | `risk:A -status:Done` | group by `Status` |
| `Review Queue` | table | `is:pr is:open -is:draft` | none |

The six enabled native workflows are:

| Workflow | Trigger/filter | Action |
| --- | --- | --- |
| `Auto-add to project` | Repository `proxy-gateway-minimal`; `is:issue,pr is:open` | Add matching item. |
| `Item added to project` | Item added | Set `Status=Todo`. |
| `Item closed` | Issue or PR closed | Set `Status=Done`. |
| `Item reopened` | Issue or PR reopened | Set `Status=Todo`. |
| `Pull request linked to issue` | PR linked to Issue | Set `Status=In Progress`. |
| `Pull request merged` | PR merged | Set `Status=Done`. |

Auto-close Issue and auto-add sub-issues remain disabled. No custom Action,
PAT, or GitHub App is part of this configuration.

### Read-only machine projection

Use the repository CLI to produce a redacted live projection and evaluate only
the evidence domains it actually collected:

```text
gccgw project export --json
gccgw project drift --input <project-export.json> --json
```

`project drift` always loads and byte-verifies the checked-in
`project-state/project-v2-contract.json`; it has no alternate-contract flag.
Missing or non-canonical contract bytes make the report `indeterminate` and
exit `2`, so only a report with `canonicalContract: true` can be clean or
classify proven drift. Every successful export embeds the canonical contract
SHA-256 used to produce it; drift rejects a missing or different export digest
as `indeterminate` instead of reinterpreting an old export under new semantics.

The export contains Project identity, the six-field manifest, redacted
Issue/PR identity and lifecycle state, managed field values, pagination
completeness, and a bounded consistency fence. It excludes titles, bodies,
comments, actors, assignees, reviewers, free-text Project values, secrets, raw
GraphQL responses, and production data; the reviewed Project title itself is
part of target identity, but export emits only whether the live title matches
that reviewed value. Issue, PR, and Draft titles are excluded. External-
repository items use a fixed redacted native shape, and unexpected managed
option names are represented only by non-semantic observed markers.

The first drift-report version checks the collected Project target, managed
field configuration, per-native-kind requiredness, and item lifecycle
projection only. This comparison begins only after export has produced a
complete normalized manifest; an exporter fail-closed error remains
`indeterminate`, not proven schema drift. Stable observed `missing`,
`ambiguous`, wrong-type, and option-set states are complete manifest evidence
and can therefore be proven schema drift. Project view definitions and native
workflow configuration, independent repository-wide native inventory, source
ancestry, exact-head required checks, and production evidence are explicitly
`not_collected` / `not_evaluated`; absence of that evidence is never converted
into `aligned`, `Passed`, `Done`, or production authority. The commands perform
no mutation and are not added to offline CI or `project verify`.

Always create a fresh export immediately before running drift. A saved
export's `generatedAt` is only its observation point: drift v1 does not prove
`exportFreshness`, and neither the timestamp nor a prior report may authorize
automatic writeback. Time-based native lifecycle drift is proven only when the
export records a trusted GitHub HTTP observation clock; a local-system clock
produces `review_required` instead.

| Drift outcome | Exit | Meaning |
| --- | ---: | --- |
| `clean_in_evaluated_scope` | 0 | No proven or review finding in the explicitly evaluated domains only. |
| `drift` | 1 | At least one proven drift finding. |
| `review_required` | 2 | Evidence needs human review; no automated repair is implied. |
| `indeterminate` or CLI failure | 2 | Input, authority, completeness, or command evaluation failed closed. |

Automation must read `outcome`, `coverage`, and `reviewCount` together.
`reviewCount > 0` is never global clean or permission to skip human review.

Issue #675 completes the repository-local consumer cutover. Active guidance
classifies `project-state/current.json` and `project-state/tasks.json` as dated
compatibility snapshots, historicalizes the old human current-state view, and
removes snapshot queue/status fields from generated brief and handoff output.
The checker requires explicit observation/live-read boundaries and pins the
complete reviewed contents of all three compatibility JSON files by SHA-256.
Only checkout-level `CRLF` to `LF` normalization is allowed before hashing;
every other byte change fails closed. Handoff output begins with a fresh native
Issue/PR read. This mechanical boundary does not grant work authority to
Project #1 or local JSON. Conflicts must still be resolved from the relevant
native domain owner, never by choosing whichever copied value appears newer.

### Repository-local `current` / `tasks` / `lanes` consumer inventory — 2026-08-29

This inventory was reviewed against `master@0d224051c1bb51b376c236869b00a459ab2d7cb3`.
It is a dated code/document classification, not a current work queue. Repeat
the review whenever one of these three snapshot consumers or schemas changes.
The direct executable and validation inventory for `current.json`, `tasks.json`,
and `lanes.json` is exhaustive at this cutoff; documentation rows enumerate
active authority surfaces that were reviewed, rather than every historical or
navigational mention of `project-state`. The separate `gates.json` and
`repair-policy.json` governance ledger is not migrated by Issue #675.

| Class | Reviewed paths | Boundary |
| --- | --- | --- |
| Active command dispatch | `package.json`, `bin/gccgw.mjs`, `server/services/cli/router.mjs` | Dispatches the checked brief, handoff, and validation commands; it does not derive current work from JSON. |
| Active validation routing | `scripts/precommit-check.mjs`, `scripts/ci-change-classifier.mjs`, `.github/workflows/ci.yml`, `.github/workflows/production-deploy-dry-run.yml` | Classifies snapshot changes into fail-closed full validation and invokes `project-state:check` directly or through the server test suite; it does not consume JSON status, queue, production, or approval claims. |
| Classifier-driven artifact routing | `.github/workflows/release-artifact.yml` | Uses the same classifier to fail snapshot changes into full source, Portal, and Admin artifact packaging. It does not run `project-state:check`, validate snapshot semantics, or grant artifact/deployment authority. |
| Active direct brief consumers | `scripts/agent-brief.mjs`, `scripts/project-handoff-brief.mjs` | Both read the three snapshots. `agent-brief` runs the checker; handoff requires readable JSON and emits only allowlisted stable projections. Neither emits a live queue: current work, ordering, and status require fresh native Issue/PR reads. |
| Active schema/authority check | `scripts/check-project-state.mjs` | Pins the three reviewed compatibility JSON contents by SHA-256 after checkout-only `CRLF` to `LF` normalization, then rejects queue/status authority, mutable counts, stale approval claims, unsafe paths, and malformed dated snapshots. Any intentional snapshot edit is coupled to review of this checker constant and is therefore B-tier. Its sensitive scan also covers the separate governance ledger; it does not validate live GitHub or production state. |
| Reviewed machine inputs | `project-state/current.json`, `project-state/tasks.json`, `project-state/lanes.json` | `current.json` and `tasks.json` are dated compatibility snapshots; `lanes.json` is stable taxonomy and safety boundaries only. Their contents and the checker digest manifest form one reviewed B-tier change unit. |
| Boundary and routing tests | `server/tests/agent-brief.test.mjs`, `server/tests/project-handoff-brief.test.mjs`, `server/tests/project-state-check.test.mjs`, `server/tests/cli-router.test.mjs`, `server/tests/precommit-check.test.mjs`, `server/tests/ci-change-classifier.test.mjs`, `server/tests/ci-workflow-contract.test.mjs`, `server/tests/gate-governance.test.mjs` | Covers output filtering, invalid/stale input failure, schema/semantic bypasses, command routing, validation selection, CI lane/workflow contracts, and governance-state sensitive scanning. |
| Active governance docs | `README.md`, `README_EN.md`, `docs/AGENT_ONBOARDING.md`, `docs/ADMIN_CONSOLE_RELATIONSHIP_DRAFT.md`, `docs/BRANCH_AND_SERVICE_OPERATING_MODEL.md`, `docs/CHANNEL_CANARY_SERVER_SELECTION.md`, `docs/GITHUB_ISSUE_PR_WORKFLOW.md`, `docs/MULTI_AGENT_OPERATING_MODEL.md`, `docs/NODE_ONBOARDING_RUNBOOK.md`, `docs/PROJECT_CONTEXT.md`, `docs/PROJECT_CONTROL_PLANE.md`, `docs/PROJECT_OPERATING_MODEL.md`, `docs/PROJECT_SIMPLIFICATION_MAP.md`, `docs/README.md`, `docs/RUNTIME_LANE_AUTHORITY.md`, `docs/agent-model/SESSION_PROTOCOL.md`, `docs/project-map/ARCHITECTURE_MAP.md`, `docs/project-map/DEPENDENCY_MAP.md`, `docs/project-state/DECISIONS.md`, `ops/README.md`, `project-state/README.md` | Uses the canonical reading order and domain-scoped authority model. Mutable facts require fresh reads. |
| Other reviewed active guidance/validation surfaces | `AGENTS.md`, `docs/CURRENT_RELEASE_STATE.md`, `RELEASE_MANIFEST.md`, `docs/VALIDATION_BASELINE.md`, `docs/units/README.md`, `docs/units/VALIDATION_CI_UNIT.md`, `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md`, `deployments/production-template/runbook.md`, `.github/pull_request_template.md` | Reviewed as active guidance, runbook, template, or validation surfaces. They reference the snapshots/checker but do not consume JSON queue, current task status, production truth, or approval authority. |
| Historical compatibility docs | `docs/ADMIN_CONSOLE_REBUILD_WORKTREE_ORGANIZATION.md`, `docs/project-state/BLOCKERS.md`, `docs/project-state/CURRENT_STATE.md`, `docs/project-state/MILESTONES.md` | Preserved as dated historical evidence; never a current queue, production inventory, or approval source. |
| Historical plan inputs | `docs/superpowers/plans/2026-06-09-historical-residue-closeout.md`, `docs/superpowers/plans/2026-06-11-sgp-protected-material-sync.md`, `docs/superpowers/plans/2026-07-14-governance-state-reconciliation.md` | Historical cutoff plans retained in place for archaeology. Their old sequencing, counts, checkboxes, and controller language is not active instruction. |
| Reviewed future-plan reference | `docs/superpowers/plans/2026-07-15-governed-repair-framework-implementation.md` | Any future implementation must preserve the distinct authority scopes and may emit only dated compatibility snapshots. |

This list includes unchanged command surfaces so omission cannot be mistaken
for deactivation. Dated execution records and production receipts outside the
listed active set remain historical evidence only; a current decision must
read the relevant native authority again.

`clean-edge-readiness-summary` and `node-image-provisioning-readiness-summary`
consume a caller-supplied `projectStateCheckPassed` attestation, not any of the
three snapshot files. They remain downstream fail-closed gates and are not
direct state consumers in this migration.

The configuration above was read back on 2026-08-30. The repository items open
at the initial 2026-08-28 setup were imported once; Auto-add does not backfill
historical matches. Use native `Reviewers`, `Assignees`, `Linked pull
requests`, `Labels`, `Milestone`, and `Repository` fields instead of
duplicating them.

Do not copy live Issue counts, PR counts, Project statuses, review queues,
branch counts, or manual completion percentages into canonical docs or state
JSON. Resolve them from GitHub when a current decision depends on them. A workflow-driven automatic transition to `Done` records only item closure or
PR merge. `Done` may also be set manually, so it is always an index field; it
does not prove deployment, runtime validation, production completion, or Risk A
authorization.

The Project is an index, not approval. Risk A work still requires the exact
runbook, fresh read-only inventory, operator approval, backup, validation, and
rollback gates.

## Operating Rule

For long-running work, open the issue first and let PRs reference it. For fast
single-PR work, keep the issue optional and make the PR body complete.
