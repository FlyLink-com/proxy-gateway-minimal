# Project Control Plane

Last updated: 2026-05-25, Asia/Shanghai.

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
  machine-readable current state, lanes, tasks, and validation expectations

scripts/ or future tooling
  consistency checks, index checks, stale-state checks, and sensitive-data scans

GitHub PRs / Issues
  review, discussion, approval, and merge boundaries
```

The initial implementation is intentionally small and docs-only. It adds JSON
state files that make current project direction easier for agents to inspect,
without adding a database, service, external dependency, or production
integration.

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

Any production-adjacent task still starts from:

```text
AGENTS.md
docs/PROJECT_CONTEXT.md
relevant active runbook
read-only live inventory
explicit operator approval for mutation
```

## Files

### `project-state/lanes.json`

Machine-readable active work lanes.

Use it to answer:

- which lane does this task belong to?
- what docs should an agent read first?
- which code areas are in scope?
- which non-goals prevent lane confusion?
- what risk boundary applies?

### `project-state/current.json`

Compact current-state snapshot.

Use it to answer:

- what is the current product spine?
- what production facts are currently documented?
- what active branch/PR context is in progress?
- what directions and blockers are active?
- which facts require live verification before mutation?

This file is allowed to become stale. It must always point readers back to
`docs/PROJECT_CONTEXT.md` and live verification for drift-prone facts.

### `project-state/tasks.json`

Machine-readable backlog for the current simplification and product-control
work.

Use it to answer:

- what task is next?
- what risk tier applies?
- what files are allowed or forbidden?
- what validation command is expected?
- which tasks require A-tier approval?

## Ownership

```text
docs/PROJECT_CONTEXT.md:
  current narrative handoff and operational facts

docs/README.md:
  human documentation index

docs/PROJECT_OPERATING_MODEL.md:
  risk tiers, lanes, gates, and stability principles

docs/PROJECT_SIMPLIFICATION_MAP.md:
  cleanup priorities, code inventory candidates, stop-doing boundaries

docs/MULTI_AGENT_OPERATING_MODEL.md:
  lead/subagent task packet and verification rules

project-state/*.json:
  compact machine-readable state and task references
```

Do not duplicate full historical execution records in `project-state`. Keep
only IDs, summaries, and links.

## Update Rules

Update `project-state` when any of these change:

- active product spine
- lane list or lane ownership
- current branch/PR context for a long-lived project direction
- current production target summary
- blocker summary
- simplification/task backlog
- validation baseline summary

Do not update `project-state` for every small implementation detail. If a
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

For a normal project task:

```text
AGENTS.md
docs/PROJECT_CONTEXT.md
project-state/current.json
project-state/tasks.json
relevant lane in project-state/lanes.json
relevant detailed docs
```

For a production task:

```text
AGENTS.md
docs/PROJECT_CONTEXT.md
relevant Risk A runbook
latest execution record
live read-only inventory
explicit operator approval before mutation
```

The control plane improves orientation. It does not replace engineering
verification.
