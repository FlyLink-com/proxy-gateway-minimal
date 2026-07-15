# Project Blockers

Last verified: 2026-07-14, America/Los_Angeles.

> Status:
> - Type: Blocker registry and template
> - Risk: C
> - Execution authority: Does not authorize production, provider, runtime,
>   deployment, rollback, schema, auth, credential, or customer-data actions
> - Production impact: None
> - Authority: Derived/index view only; current blockers require the evidence
>   source named by each record
> - Index scope: Blocker record format and current source-governance and
>   production-information gaps at the stated cutoff

## Blocker Template

```yaml
id: BLOCKER-<stable-id>
status: open | monitoring | resolved | information_gap
description: <verified condition, without speculation>
impact: <what decision or work cannot safely proceed>
owner: <verified owner or unassigned>
resolution: <objective evidence required to close the blocker>
evidence:
  - <repository path, Issue, PR, or command with cutoff>
last_verified: <date and timezone>
```

Rules:

- Use `unassigned` when no ownership evidence exists; do not guess a person.
- Record a production/runtime condition only from fresh evidence collected
  under the appropriate gate.
- Keep dated facts labeled as dated. Do not carry them forward as current.
- Resolution is evidence needed, not permission to execute a mutation.
- Never include secrets, credentials, protected material, raw configuration,
  raw logs, database rows, or customer data.

## Verified Records

### BLOCKER-state-snapshot-drift

- `status`: `monitoring`
- `description`: Draft PR #482 now reconciles `project-state/*.json`, the
  authoritative entry documents, and these derived views to the source cutoff
  at `master@20bb8257513153de7d5f75d45de7b748ceea6438`. The correction is not
  authoritative on `master` until the Draft PR is separately reviewed and
  merged.
- `impact`: Agents reading `master` must continue to verify drift-prone GitHub
  facts live until the reconciliation is merged; PR #482 can be reviewed as
  the bounded remediation candidate.
- `owner`: `unassigned`; remediation evidence is carried by Draft PR #482.
- `resolution`: Complete PR #482 local and exact-head validation, formal
  review, separate Ready approval, and separate merge; then refresh live
  GitHub evidence before marking this record resolved.
- `evidence`: `project-state/current.json`, `project-state/lanes.json`,
  `project-state/tasks.json`, local Git inventory, and current GitHub PR #482.
- `last_verified`: 2026-07-14, America/Los_Angeles.

### BLOCKER-live-runtime-state-unverified

- `status`: `information_gap`
- `description`: This Risk C task performed no live production or runtime
  inventory.
- `impact`: No current production release, service health, runtime identity,
  or remediation status can be asserted from this work.
- `owner`: `unassigned`.
- `resolution`: A future task with the required Risk A boundary must perform
  fresh read-only inventory before any related claim or mutation.
- `evidence`: PR #482 scope and the execution-authority headers in
  `docs/CURRENT_RELEASE_STATE.md` and `docs/PROJECT_CONTEXT.md`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

## Facts Not Promoted To Current Blockers

The 2026-07-11 project snapshot records detailed Traffic Accounting and runtime
identity gaps. Newer Traffic Accounting PRs exist on `master`, and this task
did not perform live runtime inventory. Those dated details remain evidence in
their source documents; they are not copied here as confirmed-current
production blockers.

Issue #437 being open is a current fact. Closed Issue #484 and merged PR #485
do not execute, resolve, reprioritize, or block it.
