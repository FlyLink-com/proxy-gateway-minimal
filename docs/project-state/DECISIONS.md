# Project Decisions

Last verified: 2026-07-14, America/Los_Angeles.

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
- `decision`: Use `project-state/current.json`, `lanes.json`, and `tasks.json`
  as the compact machine-readable coordination layer, with Markdown for
  explanation and live verification for drift-prone facts.
- `context`: The repository already has JSON state, a checker, and a documented
  control-plane boundary; Issue #484 must not create a competing machine state.
- `consequences`: This knowledge layer references the JSON files and does not
  create `project-state.yaml`, a database, service, dashboard, or external
  dependency.
- `evidence`: `docs/PROJECT_CONTROL_PLANE.md`, `project-state/*.json`,
  `scripts/check-project-state.mjs`.
- `supersedes`: `none`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

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

## Issue #484 Scope Decision

### DEC-issue-484-derived-layer

- `status`: `proposed`
- `decision`: Add a derived documentation/index layer, preserve the existing
  JSON mechanism, avoid automation, and remain independent from Issue #437.
- `context`: Issue #484 authorizes one Draft docs-only PR but does not authorize
  a second source of truth, runtime work, or a long-term policy change before
  review and merge.
- `consequences`: The new documents defer to the authority matrix and become an
  accepted project decision only if PR #485 is reviewed and merged.
- `evidence`: GitHub Issue #484 and Draft PR #485.
- `supersedes`: `none`.
- `last_verified`: 2026-07-14, America/Los_Angeles.
