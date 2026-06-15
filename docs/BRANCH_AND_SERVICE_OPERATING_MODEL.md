# Branch And Service Operating Model

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Type: Active operating model
> - Risk: C
> - Execution authority: Does not authorize code, production, DNS, Nginx,
>   systemd, firewall, provider API, runtime config, schema migration,
>   account/password generation, subscription issuance, secrets, tokens,
>   subscription URL output, SQLite row dumps, or customer-data actions
> - Source of truth for: How to interpret local branches, PR lanes, service
>   ownership, and completion status after the project outgrew a single
>   `master`-only workflow

## Decision

Treat this repository as one modular monorepo with multiple work lanes and
service responsibilities, not as a simple `master` branch that directly mirrors
production.

`master` remains the integrated source baseline. It is not automatically the
latest production runtime, and production runtime state is not automatically a
Git branch. A change is only complete for its intended scope when the matching
code, tests, docs, deploy gate, runtime validation, and closeout evidence are
all present.

## Required Status Vocabulary

Use these status labels consistently:

| Status | Meaning | What it does not mean |
| --- | --- | --- |
| `planned` | Design or task boundary exists. | Code exists, tests pass, or production changed. |
| `coded` | Repo implementation exists in a branch/worktree. | It is merged, deployed, or runtime-valid. |
| `tested` | The declared repo validation commands passed. | Production was touched. |
| `deployed` | A reviewed artifact was installed in a target runtime. | It is merged to `master` or safe to repeat elsewhere. |
| `runtime-validated` | The deployed runtime passed its declared endpoint/service checks. | The repo branch is clean or all data-plane channels work forever. |
| `merged` | PR was merged into `master`. | Production is current or activated. |
| `archived` | Historical branch/doc/runtime evidence is retained for archaeology. | It is current authority. |

Do not collapse these labels. In particular, `deployed` is not `merged`, and
`merged` is not `deployed`.

## Branch Roles

| Branch / lane | Role | Merge posture | Runtime posture |
| --- | --- | --- | --- |
| `master` | Accepted integrated baseline. | Only merge validated, reviewable work. | Deployable only after a separate Risk A promotion gate. |
| `master` at `9d7b65b` | Point-in-time integrated baseline after PR #326 merged. | Open PRs remain active and must be evaluated from fresh GitHub inventory; start subsequent work from clean `master` unless a task explicitly states otherwise. | Deployable only after a separate Risk A promotion gate. |
| `codex/<topic>` | Narrow task or feature branch. | Merge or archive after its PR reaches a clear outcome. | No runtime authority by branch name. |
| `docs/<topic>` | Docs/runbook/status branch. | C-tier merge after docs validation. | No runtime authority. |
| `release/<target>` or artifact label | Candidate source for one reviewed deployment. | Should point back to a commit and artifact hash. | Runtime authority only after explicit deployment approval and validation. |
| `archive/*`, old worktrees, closed PR branches | Historical reference. | Do not keep as active sources unless revalidated and rebranched. | No runtime authority. |

## Current Branch Inventory

Point-in-time Git and PR inventory as of the latest GitHub/mainline closeout.
This table is an orientation aid only; refresh it with `git fetch --prune`,
`git branch -vv`, and `gh pr list` before making merge or production decisions.

| Branch / PR | Observed status | Current interpretation |
| --- | --- | --- |
| `master` / `origin/master` | At `9d7b65b` after PR #326 merged; open PRs #324 and #325 remain active at this point-in-time inventory. | Follow-on development baseline. Start new work from a clean `master` worktree and refresh open PR state before acting. |
| Historical PR backlog | Closed/merged at closeout unless a fresh GitHub inventory proves otherwise. | Do not reopen old branch context as active work without a new branch, current diff, and validation plan. |

## Service Ownership Map

| Service / surface | Owner lane | Current responsibility | Must not own |
| --- | --- | --- | --- |
| Control plane | Subscription Control Plane | Accounts, portal sessions, orders, subscription artifacts, credential lifecycle, usage ledger, admin/operator API. | Data-plane listener ownership or public Admin exposure. |
| Vultr Japan data plane | Edge Data Plane / Production Operations | Production VLESS Reality, Hysteria2, TUIC runtime capacity and loopback usage sources. | Customer/order truth. |
| Singapore data plane | Edge Data Plane / Production Operations | Additional VLESS Reality, Hysteria2, TUIC runtime capacity through remote handoff/apply gates. | Customer/order truth or independent portal database. |
| User portal | Product Business + Subscription Control Plane | User login, orders, subscription status, user-scoped usage/status, support requests. | Node-local account state or node selection as a normal user workflow. |
| Admin/operator panel | Production Operations + Subscription Control Plane | Local/SSH-protected operator review, order status, usage monitor, lifecycle controls. | Public web exposure. |
| Subscription renderer | Subscription Control Plane | Emit client proxy groups from the durable order/credential ledger. | Ad hoc in-memory maps or node-local account lists. |
| Runtime adapters | Edge Data Plane | Convert desired credential state into reviewed, config-tested runtime material or remote handoff receipts. | Business decisions, accounts, or package rules. |
| Usage collector | Subscription Control Plane + Edge Data Plane | Map runtime stats to `edgeCredentialRef`, then order/account rollups. | Present aggregate-only data as per-order usage. |
| Docs/records/project-state | Architecture + Production Operations | Current-state handoff, runbooks, validation evidence, and historical indexes. | Production approval by themselves. |

## Completion Gates

Use the smallest gate that matches the risk:

| Risk | Scope | Required closure |
| --- | --- | --- |
| C | Docs/index/runbook/status only. | `git diff --check` on touched docs and a clear statement that no production/runtime code changed. |
| B | Repo code or UI behavior without production mutation. | Targeted tests for touched code, plus `npm test`; Admin UI also needs `npm run admin:test` and `npm run admin:build`. |
| A | Production/cloud/auth/schema/deploy/runtime/node changes. | Read-only inventory, dry-run, explicit approval, backups, deployment/rollback plan, validation, and closeout record. |

## Merge And Archive Order

When closing the current phase, use this order:

1. Freeze the current source boundary: active checkout, current branch, dirty
   files, and generated artifacts.
2. Classify work by service lane: control plane, data plane, user portal,
   admin/operator panel, usage accounting, docs/records.
3. Split dirty work into mergeable units. Avoid one large PR that mixes
   runtime adapters, UI, docs, and deployment records without clear validation.
4. For each open draft PR, choose exactly one outcome: merge after validation,
   rebase into the current integration lane, or archive/close as superseded.
5. Update `docs/PROJECT_CONTEXT.md`, `project-state/*.json`, and execution
   records only after the actual merge/deploy outcome is known.

## Anti-Patterns

- Treating `master` as the live server state without runtime evidence.
- Treating a production deployment as already merged to `master`.
- Restoring retired node labels because they still appear in old branch names,
  old PRs, or old docs.
- Creating per-node user panels or per-node user databases.
- Letting data-plane nodes issue accounts, orders, or package limits.
- Rendering subscription channels from ad hoc maps that are not tied to the
  control-plane order/credential ledger.
- Showing usage rows that cannot be traced to account/order ownership as
  customer usage.

## Quick Commands

```powershell
git -C D:\Projects\proxy-gateway-minimal fetch origin --prune
git -C D:\Projects\proxy-gateway-minimal status --short --branch
git -C D:\Projects\proxy-gateway-minimal branch -vv --sort=-committerdate
gh pr list --state all --limit 20
git -C D:\Projects\proxy-gateway-minimal diff --check -- docs/BRANCH_AND_SERVICE_OPERATING_MODEL.md docs/PROJECT_CONTEXT.md docs/README.md
```
