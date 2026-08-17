# Validation Baseline

Last updated: 2026-08-17, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: validation_baseline
  superseded_by: null
  last_verified_at: 2026-08-17
  production_authority: false
```

> Status:
> - Type: Active validation entrypoint
> - Risk: C
> - Execution authority: Does not authorize CI host startup, staging,
>   production, AWS, DNS, Nginx, HTTPS, systemd, node, tenant, SQLite, secret,
>   artifact, deploy, or cutover changes
> - Production impact: None
> - Source of truth for: Which validation commands to run for current repo work

## Purpose

Use this file to choose the current validation commands for a PR. Keep pass
counts and one-off historical validation evidence in PR bodies, execution
records, or `docs/PROJECT_CONTEXT.md` only when they change current state.

This file answers:

```text
What should I run for this risk tier and touched surface?
```

It does not answer:

```text
What passed on every historical PR?
Is production healthy right now?
Is a deploy, cutover, or CI host run approved?
```

## Four-Gate Validation Model

Validation closes one gate at a time. These rules are prospective and do not
change the outcome or classification of any historical gate receipt.

| Gate | Validation responsibility | Boundary |
| --- | --- | --- |
| Source Gate | Prove source intent, allowed files, focused tests, the full touched-surface baseline, and diff checks on the exact source head. | Normally Risk B for server/shared source; docs-only work remains Risk C. |
| Merge Gate | Re-read the exact head, reviews, required checks, Ready state, and merge eligibility before integration. | Source validation does not authorize artifact or production work. |
| Artifact Gate | Verify the exact `master` commit, artifact identity, SHA-256, manifest, and retrievability through the required deployment and rollback window. | Short-lived build artifacts alone are build evidence, not a durable release boundary. |
| Production Gate | Start from fresh live inventory and exact operator approval, then validate the exact target, backup, mutation, service or endpoint result, aggregate identity evidence when applicable, and rollback-ready state. | Always Risk A and runbook-specific. |

The release process may therefore use an `A envelope / B source core`:
server/shared implementation normally completes its Source and Merge Gates as
Risk B, while runtime, provider, deployment, promotion, and rollback mutation
is held for a separate Risk A Production Gate. `identity_impact: true` records
the downstream evidence requirement but does not alone make a source-only PR
Risk A.

Passing validation at one gate neither validates nor authorizes a later gate.
A release cannot become `ready` until its Artifact Gate proves that the exact
artifact remains retrievable through deployment and rollback via a durable
store or an explicitly verified target backup.

## PR Completion Gate

Before a PR is marked Ready, submitted for merge, or reported complete, confirm
that the PR contains all three parts of its approved scope:

```text
design / intent recorded
execution or approved no-op / inventory performed
validation evidence recorded
```

For implementation PRs, validation means the relevant command set in this file
has actually been run. For Risk A PRs, validation means the relevant runbook and
execution record contain the runbook-specific checks. For spec-only,
runbook-only, or inventory-only PRs, the PR body must explicitly state that no
runtime mutation was performed and list the next approval gate.

This PR completion check closes only the applicable Source and Merge readiness
work. It does not imply that an Artifact or Production Gate has passed.

## Validation Ownership And Stop Semantics

One controller owns final validation of the exact head and all GitHub
integration. Implementers run scoped implementation validation only and report
the commands and results to that controller. Semantic reviewers remain
read-only unless separately authorized. The controller must re-run or verify
the complete required baseline rather than treating an implementer's focused
result as final merge evidence.

Before asking for execution approval, verify transport, tool, repository, and
exact-head readability. A pre-approval transport failure is a setup failure,
not a business remediation result. Durable execution approval is single-use:
once execution begins, the approval is consumed and cannot be reused.

Any head, scope, test, identity, or mutation-boundary failure stops the active
gate. Preserve historical receipts without rewriting or retroactive
reclassification; a corrected attempt uses a new exact gate and, when approval
is required, a new approval.

## Baseline Commands

### C: Docs Only

Run:

```powershell
npm run docs:authority:strict
git diff --check origin/master...HEAD
```

Use for:

- README and docs navigation changes.
- Runbook text changes with no execution.
- Current-state or handoff updates.
- Architecture docs that do not change code or external state.

Do not run app tests by default for C-tier docs-only work unless the doc change
updates command contracts, generated examples, or validation tooling.

#### Hosted CI lane classification

The stable `Validate` check uses the docs-only lane only when every changed
path is a root `*.md`, `docs/**/*.md`, `ops/**/*.md`, or
`.github/**/*.md` file. Its diff-check and document-authority steps use
`always()` and run `git diff --check` plus
`npm run docs:authority:strict`; the docs-only lane then skips dependency
installation, tests, and builds. The authority check validates declared
metadata fields and rejects duplicate active canonical `authority_scope`
values without creating a new required context or approval gate.

All other inputs use the full code lane. This includes `project-state` JSON,
workflow YAML, non-Markdown files below `docs/`, `ops/`, or `.github/`, mixed
changes, an empty or invalid path list, and an unreadable Git diff.
Project-state JSON therefore uses the code lane in hosted CI even when its
local risk-tier command set remains narrower.
The classifier converts only the exact lowercase docs-only lane to the numeric
`run_full` output `0`. Every other lane value produces `1`; a missing or
unexpected `run_full` value also defaults to full validation and packaging
rather than a silent skip.
If the exact non-dispatch diff range cannot be read, classification remains
fail-closed and the always-run diff-check step fails instead of checking a
smaller substitute range.
`workflow_dispatch` always selects full validation. On a docs-only push to
`master`, the Release Artifact workflow skips its three packaging jobs; a
manual dispatch always packages. This routing changes CI workload only and
does not grant artifact, provider, deployment, or production authority.

### C/B: Project-State JSON Or State Tooling

Run:

```powershell
npm run project-state:check
git diff --check origin/master...HEAD
```

Also run `npm test` when changing the checker implementation or its tests.

Use for:

- `project-state/*.json`
- `docs/PROJECT_CONTROL_PLANE.md`
- `scripts/check-project-state.mjs`
- `server/tests/project-state-check.test.mjs`

### B: Gate Ledger, Attribution, Or Repair Routing

Run:

```powershell
npm run governance:check
node --test server/tests/gate-governance.test.mjs server/tests/ci-workflow-contract.test.mjs
npm test
git diff --check origin/master...HEAD
```

Use for:

- `project-state/gates.json` and `project-state/repair-policy.json`
- failure-attribution, Gate ledger, and repair-policy schemas
- Gate/receipt transition validation or retry/escalation routing
- the read-only governance Actions jobs

Hosted pull-request and `master` validation reads the exact base ledger when it
exists and validates the append-only transition to the checked-out ledger. A
missing base ledger is accepted only for an empty prospective bootstrap. Manual
dispatch validates the current snapshot. This check records routing eligibility
only: it does not reopen a consumed Gate, execute a repair, create an approval,
change repository settings, or authorize artifact or production work.

The state validator does not authenticate remote comment actors or bodies and
does not bind a future repair commit's actual diff. Those are separate
provenance-verifier and executor responsibilities required before any automatic
mutation lane can be enabled.

`Governance evidence` runs on the candidate checkout and is diagnostic.
`Governance snapshot` is the separately named manual-dispatch context.
`Governance trusted advisory` runs trusted base-branch validator code through
`pull_request_target`, reads exact regular-file blobs for candidate ledger and
policy state without executing candidate code, verifies the immutable trust
root, and checks the exact base transition. Because its check suite is bound to
the base identity rather than the latest PR head, it is not eligible for direct
required-check mapping. The later settings/Actions Gate must first establish an
exact-head publication or protected pull-request trust model.

### B: Server Or Shared Runtime Code

Run:

```powershell
git diff --check origin/master...HEAD
npm test
```

Add a focused targeted test first when changing a narrow route, service, parser,
store, renderer, middleware, or helper.

Use for:

- `server/**/*.mjs`
- root runtime entrypoints
- subscription renderer and store behavior
- route/auth/rate-limit/logging behavior
- local agent code when no Admin UI is touched

### B: Admin UI

Run:

```powershell
git diff --check origin/master...HEAD
npm run admin:test
npm run admin:build
npm test
```

Use for:

- `admin/src/**/*`
- Admin connection/auth UX
- operator workflow changes
- UI state, visible-once URL handling, confirmation flows, or layout changes

### B: Local Edge Agent Prototype

Run:

```powershell
git diff --check origin/master...HEAD
npm test
```

Also run a local smoke check only when the changed code affects the foreground
agent process, listener binding, local generated YAML, diagnostics, or SOCKS5
adapter behavior.

The Local Edge Agent remains loopback-only unless a separate gate approves
otherwise.

### A: Production, Cloud, Node, Or Runtime Mutation

No generic command list is enough for A-tier work. Use the relevant runbook and
execution record template.

Required shape:

```text
read-only inventory
dry-run or explicit no-op check
operator approval
backup or rollback plan
mutation
endpoint/service/data validation
rollback evidence or rollback-ready state
execution record
```

A-tier work includes:

- AWS or Aliyun resource mutation.
- DNS, Nginx, HTTPS, systemd, security-group, node, tenant, SQLite, artifact, or
  deploy/cutover changes.
- Production subscription output or runtime config changes.
- WireGuard install, keys, UDP ingress, service start, or live mesh validation.
- Legacy query-token retirement or broader opaque artifact issuance.

## Manual CI Fallback

GitHub-hosted Actions have previously been blocked by account billing or
spending-limit state. When manual CI is needed, follow
`docs/CI_MANUAL_VALIDATION.md`.

The target manual CI host is local Linux after bootstrap and validation. The
historical Aliyun validation host remains a fallback record, but it should not
stay the routine CI host if that Aliyun server is being prepared as production
subscription control plane.

HP `local-ci-a` lane selection is defined in `docs/CI_MANUAL_VALIDATION.md`:

- `ci-smoke` for quick local confidence on docs, project-state, or narrow
  follow-up work.
- `ci-full` for CI-equivalent HP archive validation when hosted Actions cannot
  start and clean-host merge evidence is needed.
- `ci-visual` for rendered UI, portal, public-site, or browser workflow
  evidence when the change has visible UX impact.

Manual CI fallback is:

- A validation workaround.
- Not staging.
- Not production.
- Not a self-hosted runner assumption.
- Not deploy approval.

Do not start a manual CI host or copy archives to it unless the task explicitly
requires that validation level. Do not run every PR through every manual lane;
choose the narrowest lane that proves the actual risk.

## Historical Evidence

Historical pass counts belong in:

- The PR body for that PR.
- Execution records under `docs/*-records/`.
- `docs/PROJECT_CONTEXT.md` only when the result changes current state,
  blockers, or next actions.

Do not keep growing current handoff docs with old pass-count lists.

## Quick Selection

```text
docs only -> git diff --check
project-state JSON -> project-state:check + diff check
server/shared code -> npm test + diff check
Admin UI -> admin:test + admin:build + npm test + diff check
production/cloud/node/runtime -> runbook-specific A-tier gate
```
