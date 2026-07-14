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
> - Index scope: Blocker record format and currently verified Engineering
>   Enablement information gaps at the stated cutoff

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

- `status`: `open`
- `description`: The checked-in `project-state/*.json` snapshots use a
  2026-07-11 cutoff and source `e1beacc1`, while this branch started from
  `origin/master` at `ab8b0ec2`; current GitHub also has more open Issues and
  PRs than those snapshots record.
- `impact`: Agents cannot use the JSON counts, branch list, recent-PR list, or
  detailed queue as confirmed-current facts without live Git/GitHub checks.
- `owner`: `unassigned`; PR #482 is an independently open reconciliation PR,
  but this task does not assign ownership or modify that PR.
- `resolution`: Merge or supersede a reviewed reconciliation that updates the
  existing JSON mechanism, then run `npm run project-state:check` and refresh
  current Git/GitHub evidence.
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
- `evidence`: Issue #484 scope and the execution-authority headers in
  `docs/CURRENT_RELEASE_STATE.md` and `docs/PROJECT_CONTEXT.md`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

## Facts Not Promoted To Current Blockers

The 2026-07-11 project snapshot records detailed Traffic Accounting and runtime
identity gaps. Newer Traffic Accounting PRs exist on `master`, and this task
did not perform live runtime inventory. Those dated details remain evidence in
their source documents; they are not copied here as confirmed-current
production blockers.

Issue #437 being open is a current fact. An open Issue is not automatically a
blocker for Issue #484, and Issue #484 does not execute or block it.
