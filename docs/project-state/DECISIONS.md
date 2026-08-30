# Project Decisions

Last verified: 2026-08-29, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: decisions
  superseded_by: null
  last_verified_at: 2026-08-29
  production_authority: false
```

> Status:
> - Type: Decision register and template
> - Risk: C
> - Execution authority: Does not authorize production, provider, runtime,
>   deployment, promotion, rollback, schema, auth, credential, or
>   customer-data actions
> - Production impact: None
> - Authority: Derived decision index only; each decision defers to its cited
>   accepted repository evidence
> - Index scope: Confirmed long-term repository decisions and evidence pointers
>   at the stated cutoff

## Decision Template

```yaml
id: DEC-<stable-id>
status: proposed | accepted | superseded
decision: <one testable sentence>
context: <problem and boundary>
consequences:
  - <expected effect or trade-off>
evidence:
  - <repository path, Issue, or PR>
supersedes: <decision id or none>
last_verified: <date and timezone>
```

Do not put secrets, credentials, protected material, private runtime data,
database rows, or customer data in a decision record.

## Dated Evidence Cutoff

These decisions are reconciled to
`master@5b61d9d787e2f98e9f834fe05de6dcbb6805cea7` on 2026-07-15, after
PRs #486-#492 and #494 merged. The observed repository has 16 remote branches,
two open Draft PRs (#476/#479), no open non-Draft PRs, and five open Issues
(#437/#438/#439/#440/#475).

Those counts and item states are historical evidence only. They are not a
current queue or inventory; resolve mutable work from fresh native Issue/PR
records and use Project #1 only as a navigation projection.

Issue #437 was reopened by receipt `issuecomment-4976074286`; PR #482 had been
recorded as its closer despite explicitly denying resolution. PR #479 remains
at `58ccdccc6af5ed120541f03d2713857e4a9a8a65`, behind `master`, with zero
unresolved non-outdated review threads. Gate
`pr479-forward-pending-rollback-obligation-remediation-20260715-003` was
approved by `issuecomment-4979572712` and terminated blocked at `fresh_binding`
by `issuecomment-4979585832` because of
`worktree_submodule_guard_null_wrapper_failure`. That approval is consumed and
nonreusable, no later durable Gate exists, and PR #479 is not deployed.
This reconciliation performs no production inventory or change; the retained
production/runtime evidence cutoff remains dated at `2026-07-11T13:03:40Z`.

## Accepted Decisions

### DEC-modular-monolith

- `status`: `accepted`
- `decision`: Keep the product a release-managed modular monolith with thin
  adapters and explicit control-plane/data-plane boundaries; do not introduce
  microservices, queues, or a database replacement without a separate measured
  need and reviewed direction change.
- `context`: The foundation freeze and current project context describe one
  repository and shared domain services; derived source/role maps must not imply
  independently deployed services.
- `consequences`: Directory and role maps describe logical ownership without
  claiming independently deployed services.
- `evidence`: `docs/FOUNDATION_FREEZE_2026_07_09.md`,
  `docs/PROJECT_CONTEXT.md`, `project-state/current.json`.
- `supersedes`: `none`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

### DEC-project-state-json

- `status`: `accepted`
- `decision`: Use `project-state/lanes.json` for reviewed lane definitions and
  `current.json` / `tasks.json` as dated compatibility contracts, with Markdown
  for explanation. Native Issue/PR records own current work state and
  sequencing; Project #1 is a mutable navigation projection only.
- `context`: The repository already has JSON state, a checker, and a documented
  control-plane boundary; Issue #484 must not create a competing machine state.
- `consequences`: This knowledge layer references the JSON files but does not
  expose their dated status or queue hints as current work. It does not create
  `project-state.yaml`, a database, service, dashboard, or external dependency.
- `evidence`: `docs/PROJECT_CONTROL_PLANE.md`, `project-state/*.json`,
  `scripts/check-project-state.mjs`.
- `supersedes`: `none`.
- `last_verified`: 2026-08-29, America/Los_Angeles.

### DEC-independent-release-gates

- `status`: `accepted`
- `decision`: Treat Source, Merge, Artifact, and Production gates as separate;
  passing one gate neither proves nor authorizes the next.
- `context`: Current release governance separates reviewed source, immutable
  artifacts, promotion authority, and live runtime evidence.
- `consequences`: A merged PR or successful build cannot be reported as a
  production release or current runtime state.
- `evidence`: `RELEASE_MANIFEST.md`,
  `docs/GITHUB_ISSUE_PR_WORKFLOW.md`, merged PR #480.
- `supersedes`: `none`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

### DEC-risk-tier-workflow

- `status`: `accepted`
- `decision`: Use Risk C for docs-only work, Risk B for focused repository
  implementation, and Risk A for production/provider/runtime/auth/schema or
  deployment mutations, with validation and approval weight determined by the
  risk.
- `context`: Documentation, source implementation, and external mutation have
  different evidence and approval requirements in this repository.
- `consequences`: Engineering roles and workflow stages cannot lower the risk
  tier or bypass a required gate.
- `evidence`: `AGENTS.md`, `docs/AGENT_ONBOARDING.md`,
  `docs/VALIDATION_BASELINE.md`.
- `supersedes`: `none`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

### DEC-stable-validate-ci-routing

- `status`: `accepted`
- `decision`: Route docs-only and code changes within CI, always run diff
  checking, and retain one stable required `Validate` context until separately
  reviewed stable contexts and settings enforcement exist.
- `context`: PR #483 merged at
  `2413c101724df45579ebf4b9e0f306d32d9bb1af`. Exact-master CI
  `29418796398`, Release Artifact `29418796724`, and CodeQL
  `29418794902`/`29418794903` succeeded at the current source cutoff.
  Cloudflare workflow `29391680029` completed build and verification for
  `329eb282ef88e7ab41bee1252f22fe3570f7d3c8`, with deploy skipped. These runs
  are source/build evidence only.
- `consequences`: Ruleset `18935716` still strictly requires only `Validate`,
  with zero approvals and no review-thread resolution. Six environments exist;
  only `artifact-publication` has a branch policy, and none has reviewer
  enforcement. Machine governance remains incomplete.
- `evidence`: Merged PR #483 and the exact-master workflow runs above.
- `supersedes`: `none`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

### DEC-issue-pr-ownership

- `status`: `accepted`
- `decision`: Use Issues as durable intent/index cards and PRs as concrete
  execution summaries and validation receipts.
- `context`: Long-running intent and one-diff execution evidence need different
  ownership while preserving a minimal PR count.
- `consequences`: Draft PRs remain Draft until intent, execution, validation,
  and remaining gates are complete; merge is not release.
- `evidence`: `docs/GITHUB_ISSUE_PR_WORKFLOW.md`,
  `.github/pull_request_template.md`.
- `supersedes`: `none`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

## Derived Project-Intelligence Layer Decision

### DEC-issue-484-derived-layer

- `status`: `accepted`
- `decision`: Add a derived documentation/index layer, preserve the existing
  JSON mechanism, avoid automation, and remain independent from Issue #437.
- `context`: Issue #484 authorized one docs-only PR without authorizing a
  second source of truth or runtime work. PR #485 was reviewed and merged at
  `master@20bb8257513153de7d5f75d45de7b748ceea6438`; later PRs #482 and #483
  reconciled the current state and CI routing without changing that decision.
- `consequences`: The derived documents defer to the authority matrix and the
  existing JSON mechanism; they remain indexes without execution authority.
- `evidence`: Closed GitHub Issue #484 and merged PR #485.
- `supersedes`: `none`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

## Historical Security And Next-Gate Boundary (2026-07-15 Cutoff)

The 2026-07-15 GitHub snapshot recorded 0 open code-scanning alerts, 0 open
Dependabot alerts, and 0 open secret-scanning alerts at that source cutoff.
Those counts are historical; successful CodeQL execution remains
source-analysis evidence rather than production proof.

At that cutoff, the recorded ordered path was to establish a new durable #437
successor proposal after the
blocked, consumed Gate `pr479-forward-pending-rollback-obligation-remediation-20260715-003`;
complete any newly authorized PR #479 remediation, current-master integration,
exact-head checks, formal review, Ready, and merge through independent
approvals; finish the Gate
ledger/validator, stable CI contexts plus settings Gate, durable artifact
retention/binding, and minimal organization/runtime-evidence model in separate
PRs; only then establish independent Artifact and Risk A production-alignment
Gates.

That sequence is retained for archaeology only and is invalid for current work
ordering. Fresh native Issue/PR records own current state and sequencing.
