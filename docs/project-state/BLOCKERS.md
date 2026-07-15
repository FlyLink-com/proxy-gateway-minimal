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
>   production-information gaps at
>   `master@2413c101724df45579ebf4b9e0f306d32d9bb1af`

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

- `status`: `resolved`
- `description`: The prior repository snapshot drift was reconciled by merged
  PR #482 at `06d69b2da07a50322a260bd08f160febaf7b6a7d`.
- `impact`: No current source-snapshot blocker remains at the 2026-07-14
  cutoff; drift-prone facts still require live verification after this cutoff.
- `owner`: `unassigned`.
- `resolution`: Merged PR #482 supplied the bounded source reconciliation;
  this record does not claim production reconciliation.
- `evidence`: PR #482 and
  `master@2413c101724df45579ebf4b9e0f306d32d9bb1af`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

### BLOCKER-pr-479-durable-successor-gate

- `status`: `open`
- `description`: Issue #437 was reopened by Risk C receipt
  `issuecomment-4976074286` because PR #482 was recorded as its closer despite
  explicitly denying resolution. Draft PR #479 remains at
  `03d744556be6785ac8c97dae2bc4fb79ae9e246f`, behind `master`, with three
  unresolved non-outdated threads. Its predecessor receipt
  `issuecomment-4966594034` is blocked, the predecessor approval is consumed,
  no durable successor Gate exists, and production state is `not_deployed`.
- `impact`: PR #479 cannot establish current-`master` integration, become
  Ready, merge, or proceed to Artifact/Production gates. Its old four green
  checks are not current-`master` integration evidence.
- `owner`: `unassigned`.
- `resolution`: Establish a durable successor Gate on #437, then complete
  source remediation, current-`master` integration, exact-head checks, formal
  review, Ready, and merge through independent approvals.
- `evidence`: Issue receipt `issuecomment-4976074286`, predecessor receipt
  `issuecomment-4966594034`, and current PR #479 read-only inventory.
- `last_verified`: 2026-07-14, America/Los_Angeles.

### BLOCKER-machine-governance-enforcement

- `status`: `open`
- `description`: PR #483 merged docs-only/code lane routing and always-run diff
  checking at `2413c101724df45579ebf4b9e0f306d32d9bb1af`, but ruleset
  `18935716` still has one strict required `Validate` context, zero approvals,
  and no review-thread-resolution requirement. Six environments exist; only
  `artifact-publication` has a branch policy, and none has reviewer enforcement.
- `impact`: Successful CI is source/build evidence, not independent merge,
  artifact, settings, or production approval.
- `owner`: `unassigned`.
- `resolution`: Implement the Gate ledger/validator and stable CI contexts in
  separate PRs, then use a separately approved settings Gate.
- `evidence`: PR #483 and exact-`master` CI `29381367549`, Release Artifact
  `29381367545`, CodeQL `29381507931`, and Cloudflare workflow `29381367553`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

### BLOCKER-live-runtime-state-unverified

- `status`: `information_gap`
- `description`: This Risk C task performed no live production or runtime
  inventory. The retained production/runtime evidence cutoff is dated at
  `2026-07-11T13:03:40Z`.
- `impact`: No current production release, service health, runtime identity,
  or remediation status can be asserted from this work.
- `owner`: `unassigned`.
- `resolution`: A future task with the required Risk A boundary must perform
  fresh read-only inventory before any related claim or mutation.
- `evidence`: This reconciliation scope and the execution-authority headers in
  `docs/CURRENT_RELEASE_STATE.md` and `docs/PROJECT_CONTEXT.md`.
- `last_verified`: 2026-07-14, America/Los_Angeles.

## Facts Not Promoted To Current Blockers

The 2026-07-11 project snapshot records detailed Traffic Accounting and runtime
identity gaps. Newer Traffic Accounting PRs exist on `master`, and this task
did not perform live runtime inventory. Those dated details remain evidence in
their source documents; they are not copied here as confirmed-current
production blockers.

Issue #437 being open is a current fact restored by
`issuecomment-4976074286`. PR #482 and PR #483 are merged as
`06d69b2da07a50322a260bd08f160febaf7b6a7d` and
`2413c101724df45579ebf4b9e0f306d32d9bb1af`. Five PRs and five Issues are
open across 18 observed remote branches. GitHub reports 39 open code-scanning
alerts (2 critical, 36 high, 1 medium), 3 Dependabot alerts (2 high, 1 low),
and 0 secret-scanning alerts; successful CodeQL execution does not resolve
alerts or prove exploitability.

## Ordered Resolution Queue

1. Establish a durable successor Gate on #437 for PR #479.
2. Complete PR #479 source remediation, current-`master` integration,
   exact-head checks, formal review, Ready, and merge through independent
   approvals.
3. Finish the Gate ledger/validator, stable CI contexts plus settings Gate,
   durable artifact retention/binding, and the minimal
   organization/runtime-evidence model through separate PRs.
4. Only then establish independent Artifact and Risk A production-alignment
   Gates.
