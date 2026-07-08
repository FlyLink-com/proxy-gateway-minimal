# GitHub Issue And PR Workflow

Last updated: 2026-07-08, America/Los_Angeles.

> Status:
> - Type: Active workflow rule
> - Risk: C
> - Execution authority: Does not authorize production, AWS, Vultr, Aliyun,
>   DNS, Nginx, systemd, firewall, SQLite, node, tenant, artifact, payment,
>   deploy, rollback, secret, token, subscription URL, credential, or
>   customer-data actions
> - Production impact: None
> - Source of truth for: How GitHub Issues and PRs split tracking,
>   summarization, validation, and closeout ownership

## Purpose

Use GitHub Issues as durable index cards. Use PRs as execution summaries and
validation receipts.

This keeps iteration fast while preserving traceability for work that cannot be
understood from a single diff. The issue owns the long-running intent, scope,
state, required PRs, and done criteria. The PR owns the concrete change,
validation result, deploy note if applicable, and remaining gates for that
specific diff.

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
- Remaining gates for work outside the PR scope.

Use `Refs #123` when the PR contributes to the issue but does not complete the
done criteria. Use `Closes #123` only when the issue's done criteria are fully
satisfied by the merged PR.

## Risk Mapping

| Risk | Issue rule | PR rule | Validation |
| --- | --- | --- | --- |
| C | Optional unless part of a larger lane. | One focused PR. | `git diff --check origin/master...HEAD` |
| B | Optional for a single focused fix; required if multi-PR. | Intent, code, tests, and docs in one PR when feasible. | Touched-surface tests plus diff check. |
| A | Required before mutation or production gate execution. | Runbook, approval evidence, execution, validation, and rollback are auditable. | Runbook-specific validation only. |

## Project Board Use

A GitHub Project board is useful after the issue count becomes large enough to
need portfolio scanning, usually around 10 to 15 active index cards. Before
that point, labels and issue lists are usually lighter.

If a board is enabled, keep the fields small:

- Lane
- Risk
- Status
- Source/production state
- Validation state
- Production impact

The board is an index, not approval. Risk A work still requires the exact
runbook, read-only inventory, operator approval, backup, validation, and
rollback gates.

## Operating Rule

For long-running work, open the issue first and let PRs reference it. For fast
single-PR work, keep the issue optional and make the PR body complete.
