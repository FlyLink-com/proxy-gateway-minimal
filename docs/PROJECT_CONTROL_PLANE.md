# Project Control Plane

Last updated: 2026-08-30, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: project_state_model
  superseded_by: null
  last_verified_at: 2026-08-30
  production_authority: false
```

> Status:
> - Type: Active project-control design
> - Risk: C
> - Execution authority: Does not authorize code, CI host, AWS, DNS, Nginx,
>   HTTPS, production config, node, tenant, secret, SQLite, deploy, or cutover
>   changes
> - Production impact: None
> - Source of truth for: How structured project state complements docs without
>   replacing production verification

## Purpose

The documentation set has outgrown a pure Markdown-only operating model. Docs
remain necessary for explanations, decisions, runbooks, and audit records, but
they should not also be the only machine-readable task and state control layer.

This document introduces a lightweight project control plane:

```text
docs/
  explanations, architecture, runbooks, execution records, historical evidence

project-state/
  dated coordination snapshots, lanes, task contracts, and validation hints

scripts/ or future tooling
  consistency checks, index checks, stale-state checks, and sensitive-data scans

GitHub PRs / Issues
  review, discussion, approval, and merge boundaries
```

The initial implementation was intentionally small and docs-only. It now also
includes offline compatibility checking and a reviewed Project v2
configuration contract. The dated JSON state files remain orientation inputs
rather than a live work index. This model adds no database, daemon, runtime
mutation, production integration, or Project writeback.

## Boundary

The project control plane is a repository coordination layer. It is not:

- a runtime control plane
- a deployment system
- a secrets store
- a production inventory source
- a substitute for Risk A runbooks
- a substitute for live AWS, DNS, Nginx, systemd, or endpoint verification
- a self-hosted CI system
- an agent memory replacement

`AGENTS.md` always applies. Any production-adjacent task first completes the
mandatory release/context sequence it defines:

```text
AGENTS.md
docs/CURRENT_RELEASE_STATE.md
RELEASE_MANIFEST.md
docs/PROJECT_CONTEXT.md
git status --short --branch
```

Then continue through repository navigation and the task-specific Risk A gate:

```text
docs/README.md
task-relevant subsystem README
fresh native Issue and PR records for current scope, state, and sequencing
relevant active runbook
read-only live inventory
explicit operator approval for mutation
```

## Files

### `project-state/lanes.json`

Machine-readable reviewed lane definitions and safety boundaries.

Use it to answer:

- which lanes are defined and what does each lane mean?
- what docs and code areas belong to each lane?
- which non-goals and risk boundaries apply?

Resolve a current item's state, scope, declared risk, and done criteria from its
native Issue or PR record. Project #1's `Lane` field is the mutable navigation
classification for current lane membership; validate its value against the
reviewed definitions in this file. Neither the Project field nor this file
grants execution authority.

### `project-state/current.json`

Dated compatibility snapshot.

Use it to recover the documented product spine, evidence cutoffs, redacted
blocker references, and validation hints. Do not use it as live Issue, PR,
Project, branch, deployment, provider, or runtime state. Resolve drift-prone
facts from the native domain owner.

### `project-state/tasks.json`

Dated compatibility snapshot of earlier queue and task contracts.

Use it only for historical task IDs and risk, file-scope, validation, and
approval constraints after resolving current status from native Issues and
PRs. It must not answer which task is next.

For current compatibility handling and rollout status, see
`docs/PROJECT_CONTEXT.md`. Snapshot-derived hints remain non-authoritative;
perform a fresh native Issue/PR read before current sequencing.

### `project-state/project-v2-contract.json`

Reviewed, non-live configuration contract for organization Project #1.

Use it to answer:

- which six Project fields are managed, and what are their exact names, types,
  and semantic options?
- which managed fields are required for repository Issues versus pull requests?
- which views and native workflow transitions are expected?
- what consistency grace and authority boundaries must a reader preserve?

The contract contains no live items, counts, queue, branch, check, deployment,
or runtime state. GraphQL field and option IDs are not guessed or copied into
this semantic contract; tasks that depend on them require a fresh authoritative
read. The contract is SHA-256 pinned and validated with the other reviewed
project-state inputs. Its `itemFieldRequirements` keeps managed-repository
Issues at all six required fields while requiring only `Status` for
managed-repository pull requests; absence of the other five optional PR slots
is not a contract violation. Views and native workflows are reviewed static
expectations, not evidence that the live Project currently matches them.

## Ownership

```text
docs/PROJECT_CONTEXT.md:
  stable narrative context, authority boundaries, and dated evidence pointers

docs/README.md:
  human documentation index

docs/PROJECT_OPERATING_MODEL.md:
  risk tiers, lanes, gates, and stability principles

docs/PROJECT_SIMPLIFICATION_MAP.md:
  cleanup priorities, code inventory candidates, stop-doing boundaries

docs/MULTI_AGENT_OPERATING_MODEL.md:
  lead/subagent task packet and verification rules

docs/GITHUB_ISSUE_PR_WORKFLOW.md:
  canonical Project field, view, workflow, Issue, and PR semantics

project-state/lanes.json:
  reviewed lane definitions and safety boundaries

project-state/current.json and project-state/tasks.json:
  dated compatibility snapshots; not live sequencing
  repository-local consumers require a fresh native Issue/PR read

project-state/project-v2-contract.json:
  reviewed Project configuration and read-only authority boundary; no live values
```

Do not duplicate full historical execution records in `project-state`. Keep
only IDs, summaries, and links.

## Update Rules

Update `project-state` only to keep its dated compatibility contracts
internally truthful when any of these reviewed facts change:

- stable product-spine definition
- reviewed lane definitions, risk boundaries, or primary docs/code areas
- evidence cutoff or referenced receipt boundary
- redacted blocker-reference snapshot
- legacy task risk, file-scope, validation, or approval constraints
- validation baseline summary

Every such update remains dated and non-authoritative for current sequencing.
Do not copy live Issue, PR, Project, branch, deployment, provider, or runtime
facts into these snapshots. Resolve them from the native domain owner. If a
change is only historical evidence, write an execution record and link it from
the relevant index.

The complete reviewed bytes of `project-state/current.json`,
`project-state/lanes.json`, and `project-state/tasks.json` are SHA-256 pinned by
`scripts/check-project-state.mjs`; only checkout-level `CRLF` to `LF`
normalization precedes hashing. A legitimate snapshot update and its matching
checker digest are one coupled B-tier review unit. The reviewer must inspect the
new JSON bytes and rationale before accepting the digest; a digest-only refresh
is not a valid repair.

## Risk Rules

The structured files do not lower risk:

```text
C-tier:
  project-state docs-only changes that do not alter pinned JSON or checker code

B-tier:
  scripts that validate project-state, docs indexes, or code-module inventory;
  any pinned project-state JSON update together with its checker digest

A-tier:
  anything that mutates production, cloud, DNS, Nginx, systemd, node config,
  tenant state, artifacts, SQLite authority, deployment, or cutover
```

If a JSON file says a node is active, that is only a documented snapshot. Before
changing a real node, verify live state.

## No-Secrets Policy

Never store these in `project-state`:

- raw subscription URLs
- tokens
- passwords
- private keys
- cloud credentials
- customer data
- production `.env` values
- unredacted logs
- full opaque artifact paths that reveal secret material

It is acceptable to store non-secret public domains, public IPs, node labels,
file paths to redacted records, and references to where a secret is held, as
long as the secret value itself is not included.

## Implemented Tooling

The repository-local checker validates the reviewed structured inputs:

```text
npm run project-state:check
```

It validates complete SHA-256 pins, JSON shape, dates, lane document references,
task risk/validation, historical A-tier blocking contracts, unsafe paths and
symlinks, authority wording, and sensitive-data patterns. It also validates
the Project v2 contract's six unique fields and options and requires its Lane
options to match `project-state/lanes.json` exactly.

## Future Tooling

Future B-tier readers may add complete, redacted live-evidence adapters for
native Issue and PR inventory, Project configuration, exact source ancestry,
and exact-head required checks. Each adapter must declare completeness before
any dependent comparison can run. Remaining offline checks may cover
`docs/README.md` pointers, bounded `PROJECT_CONTEXT.md` growth, and genuinely
stale timestamps or branch names.

Project field writeback remains a separate later stage. It must default to
dry-run, bind exact reviewed input and evidence digests, show a bounded
mutation plan, require exact operator approval, reject concurrent change, and
read every changed field back. This static-contract slice generates no
mutation or auto-fix plan. Do not build a service or database until JSON plus
bounded commands prove insufficient.

## Read Order

Always apply `AGENTS.md` and complete its mandatory release/context sequence:

```text
AGENTS.md
docs/CURRENT_RELEASE_STATE.md
RELEASE_MANIFEST.md
docs/PROJECT_CONTEXT.md
git status --short --branch
```

Then open the documentation index:

```text
docs/README.md
```

For a normal project task, continue with:

```text
task-relevant subsystem README
native live Issue and PR records when current status or sequencing matters
Project #1, including `Lane`, as mutable navigation classification only
relevant lane in project-state/lanes.json
project-state/current.json and project-state/tasks.json only when dated
  compatibility context is needed
relevant detailed docs
```

For a production task:

```text
relevant Risk A runbook
latest execution record
fresh live read-only inventory
explicit operator approval before mutation
```

The control plane improves orientation. It does not replace native Issue/PR
state, live verification, or engineering validation.
