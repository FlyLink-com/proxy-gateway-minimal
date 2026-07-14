# GitHub Issue And PR Workflow

Last updated: 2026-07-14, America/Los_Angeles.

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
