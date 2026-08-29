# Project Control Plane

Last updated: 2026-08-28, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: project_state_model
  superseded_by: null
  last_verified_at: 2026-08-28
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

The initial implementation was intentionally small and docs-only. Its JSON
state files preserve dated project direction and constraints for agent
orientation; they are not a live work index. This model adds no database,
service, external dependency, or production integration.

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

Dated transitional compatibility snapshot.

Use it to recover the documented product spine, evidence cutoffs, redacted
blocker references, and validation hints. Do not use it as live Issue, PR,
Project, branch, deployment, provider, or runtime state. Resolve drift-prone
facts from the native domain owner.

### `project-state/tasks.json`

Dated transitional compatibility snapshot of earlier queue and task contracts.

Use it only for historical task IDs and risk, file-scope, validation, and
approval constraints after resolving current status from native Issues and
PRs. It must not answer which task is next.

For current compatibility handling and rollout status, see
`docs/PROJECT_CONTEXT.md`. Snapshot-derived hints remain non-authoritative;
perform a fresh native Issue/PR read before current sequencing.

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

project-state/lanes.json:
  reviewed lane definitions and safety boundaries

project-state/current.json and project-state/tasks.json:
  dated compatibility snapshots pending Issue #675; not live sequencing
```

Do not duplicate full historical execution records in `project-state`. Keep
only IDs, summaries, and links.

## Update Rules

Until Issue #675 completes the consumer migration, update `project-state` only
to keep its dated compatibility contracts internally truthful when any of
these reviewed facts change:

- active product spine
- lane list or lane ownership
- evidence cutoff or referenced receipt boundary
- redacted blocker-reference snapshot
- legacy task risk, file-scope, validation, or approval constraints
- validation baseline summary

Every such update remains dated and non-authoritative for current sequencing.
Do not copy live Issue, PR, Project, branch, deployment, provider, or runtime
facts into these snapshots. Resolve them from the native domain owner. If a
change is only historical evidence, write an execution record and link it from
the relevant index.

## Risk Rules

The structured files do not lower risk:

```text
C-tier:
  project-state docs-only changes and state-index updates

B-tier:
  scripts that validate project-state, docs indexes, or code-module inventory

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

## Future Tooling

The first repository-local checker is available:

```text
npm run project-state:check
```

It validates JSON parsing, required structured-state files, lane document
references, task risk/validation fields, A-tier blocked status, and raw secret
patterns in `project-state` plus declared source docs.

Future B-tier tooling can extend this to validate:

- every lane points to existing docs
- every task has a risk tier and validation command
- every A-tier task has forbidden mutation without approval
- docs/README includes active project-state pointers
- `PROJECT_CONTEXT.md` does not grow uncontrolled historical detail
- sensitive-data patterns are absent from docs and project-state
- stale timestamps or stale branch names are flagged

Do not build a service or database for this until JSON plus simple repository
checks become insufficient.

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
