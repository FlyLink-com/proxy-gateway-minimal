# Project Decisions

Last verified: 2026-07-14, America/Los_Angeles.

> Status:
> - Type: Decision register and template
> - Risk: C
> - Execution authority: Does not authorize production, provider, runtime,
>   deployment, promotion, rollback, schema, auth, credential, or
>   customer-data actions
> - Production impact: None
> - Source of truth for: Confirmed long-term repository decisions and their
>   evidence pointers at the stated cutoff

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
- `consequences`: Directory and role maps describe logical ownership without
  claiming independently deployed services.
- `evidence`: `docs/FOUNDATION_FREEZE_2026_07_09.md`,
  `docs/PROJECT_CONTEXT.md`, `project-state/current.json`.
- `supersedes`: `none`.

### DEC-project-state-json

- `status`: `accepted`
- `decision`: Use `project-state/current.json`, `lanes.json`, and `tasks.json`
  as the compact machine-readable coordination layer, with Markdown for
  explanation and live verification for drift-prone facts.
- `consequences`: This knowledge layer references the JSON files and does not
  create `project-state.yaml`, a database, service, dashboard, or external
  dependency.
- `evidence`: `docs/PROJECT_CONTROL_PLANE.md`, `project-state/*.json`,
  `scripts/check-project-state.mjs`.
- `supersedes`: `none`.

### DEC-independent-release-gates

- `status`: `accepted`
- `decision`: Treat Source, Merge, Artifact, and Production gates as separate;
  passing one gate neither proves nor authorizes the next.
- `consequences`: A merged PR or successful build cannot be reported as a
  production release or current runtime state.
- `evidence`: `RELEASE_MANIFEST.md`,
  `docs/GITHUB_ISSUE_PR_WORKFLOW.md`, merged PR #480.
- `supersedes`: `none`.

### DEC-risk-tier-workflow

- `status`: `accepted`
- `decision`: Use Risk C for docs-only work, Risk B for focused repository
  implementation, and Risk A for production/provider/runtime/auth/schema or
  deployment mutations, with validation and approval weight determined by the
  risk.
- `consequences`: Engineering roles and workflow stages cannot lower the risk
  tier or bypass a required gate.
- `evidence`: `AGENTS.md`, `docs/AGENT_ONBOARDING.md`,
  `docs/VALIDATION_BASELINE.md`.
- `supersedes`: `none`.

### DEC-issue-pr-ownership

- `status`: `accepted`
- `decision`: Use Issues as durable intent/index cards and PRs as concrete
  execution summaries and validation receipts.
- `consequences`: Draft PRs remain Draft until intent, execution, validation,
  and remaining gates are complete; merge is not release.
- `evidence`: `docs/GITHUB_ISSUE_PR_WORKFLOW.md`,
  `.github/pull_request_template.md`.
- `supersedes`: `none`.

## Issue #484 Scope Decision

The decision to add documentation only, preserve the existing JSON mechanism,
avoid automation, and remain independent from Issue #437 is accepted for Issue
#484's scope. It becomes a long-term project decision only if its Draft PR is
reviewed and merged; this file does not pre-authorize that outcome.
