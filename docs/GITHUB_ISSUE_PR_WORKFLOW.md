# GitHub Issue And PR Workflow

Last updated: 2026-08-28, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: github_issue_pr_workflow
  superseded_by: null
  last_verified_at: 2026-08-28
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
- `project-state/lanes.json` owns reviewed lane definitions and safety
  boundaries. Dated state snapshots may preserve evidence, but they do not own
  current Issue, PR, Project, deployment, or runtime facts.

The repository-wide authority transition is not complete. Active documentation
and tooling still consume legacy sequencing or state rooted in
`docs/PROJECT_CONTROL_PLANE.md` and `project-state/tasks.json`. Until those
consumers are migrated, this section defines the target boundary rather than a
completed cutover. Conflicts are
transition blockers and must be resolved from the relevant domain owner, never
by choosing whichever copied value appears newer.

The native Project workflows verified on 2026-08-28 are:

- Auto-add items from `gccwebos-com/proxy-gateway-minimal` matching
  `is:issue,pr is:open`.
- Item added -> `Todo`.
- Item closed -> `Done`.
- Pull request linked -> `In Progress`.
- Pull request merged -> `Done`.
- Item reopened -> `Todo`.

Auto-close Issue and auto-add sub-issues remain disabled. No custom Action,
PAT, GitHub App, or Milestone was added for this integration. The repository items open at the time were imported once on 2026-08-28;
Auto-add does not backfill historical matches.

The maintained views are `Portfolio Triage`, `Execution Board`,
`Review Queue`, and `Risk A Gates`. Use native `Reviewers`,
`Assignees`, `Linked pull requests`, `Labels`, `Milestone`, and
`Repository` fields instead of duplicating them.

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
