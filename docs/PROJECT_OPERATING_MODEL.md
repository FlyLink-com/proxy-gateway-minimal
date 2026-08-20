# Project Operating Model

Last updated: 2026-05-31, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: project_operating_model
  superseded_by: null
  last_verified_at: 2026-05-31
  production_authority: false
```


> Status:
> - Type: Active operating model
> - Risk: C
> - Execution authority: Does not authorize code, CI host, AWS, DNS, Nginx,
>   HTTPS, production config, node, tenant, secret, SQLite, or cutover changes
> - Production impact: None
> - Source of truth for: How to reason about project lanes, validation,
>   production gates, and user-facing subscription stability

## Summary

This project uses GitHub and the local checkout as the code and documentation
source of truth, PRs as change boundaries, local Linux as the target manual CI
fallback while GitHub-hosted Actions is blocked, and production changes only
through serial Risk A runbooks and execution records. Historical Aliyun manual
CI evidence remains valid, but Aliyun is now being separated from the CI lane
so it can be evaluated as the future subscription control plane.

Use `docs/MULTI_AGENT_OPERATING_MODEL.md` when a task needs multiple agents,
independent analysis tracks, or explicit subagent task packets.
Use `docs/DOMAIN_UNIT_BOUNDARIES.md` when a task needs to separate product
business, commercial entitlement, subscription access, edge nodes, local
client work, validation, operator lab, and production operations.
Use `docs/units/README.md` when a task needs the detailed design for one
specific unit and its interfaces.
Use `docs/PROJECT_SIMPLIFICATION_MAP.md` when a task needs docs slimming,
module classification, cleanup queue ordering, or a decision on whether a new
idea belongs on the active product spine.
Use `docs/PROJECT_CONTROL_PLANE.md` and `project-state/*.json` when a task
needs compact machine-readable state, lane, and backlog orientation.
Use `docs/VALIDATION_BASELINE.md` when a task needs the current validation
command matrix; keep historical pass counts in PRs or execution records.

Product direction: keep the user subscription entry stable while evolving the
subscription control plane, edge-node capacity, production hosts, DNS, and
operational controls behind that entry.

## Four Layers

```text
1. Source of truth
   GitHub master + local checkout
   code, docs, runbooks, execution records

2. Development and validation
   local development, targeted tests, npm test
   GitHub Actions when available
   local Linux manual CI host while GitHub-hosted Actions is blocked

3. Production operations
   subscription control plane, edge data plane
   AWS EC2, DNS, Nginx, systemd, SQLite, node config
   Risk A runbooks, explicit approval, execution records

4. User delivery
   sub.globalcirclecat.com
   ss-sg.globalcirclecat.com
   Clash/Mihomo subscription refresh and direct node connection
```

Do not collapse these layers. A repository merge does not imply production
activation. A runbook does not imply execution approval. A validation host is
not staging or production.

## Domain Units

Use domain units before choosing a branch, task packet, or implementation
surface:

```text
Product business:
  user-facing service promise, workflows, and acceptance criteria

Commercial / entitlement:
  packages, validity, quota, renewal, and customer commercial status

Subscription access control:
  artifacts, tokens, device bootstrap, Subscription V2 output, Admin access ops

Edge / node capacity:
  prod-edge fleet, health, upstream path, node replacement, private mesh when approved

Local client:
  Clash/Mihomo expectations and Local Edge Agent loopback adapter

Validation / CI:
  local tests, GitHub Actions, local Linux manual CI evidence

Operator lab:
  HP Relay and network/channel experiments, not runtime authority

Production operations:
  AWS, DNS, Nginx, HTTPS, systemd, SQLite, node lifecycle, rollback records
```

Business, commercial entitlement, subscription access, and nodes must not be
treated as the same unit. See `docs/DOMAIN_UNIT_BOUNDARIES.md` for the detailed
interface rules and anti-collapse checks.

## Active Source Of Truth

Active code and docs live in:

```text
GitHub: gaoyi1020-web/proxy-gateway-minimal
Local:  D:\Projects\proxy-gateway-minimal
```

Use `docs/PROJECT_CONTEXT.md` for current handoff state and
`docs/README.md` for documentation navigation. Use
`docs/MULTI_AGENT_OPERATING_MODEL.md` for agent role decomposition,
parallelization rules, task-packet requirements, and subagent verification
contracts. Use `docs/PROJECT_SIMPLIFICATION_MAP.md` for the current product
spine, active cleanup lanes, and stop-doing boundaries. Use
`docs/PROJECT_CONTROL_PLANE.md` and `project-state/*.json` for structured
orientation only; production facts in those files still require live
verification before mutation. Use `docs/VALIDATION_BASELINE.md` for current
validation commands. Historical checkouts and historical design artifacts are
background only unless current docs explicitly reference them.

## Production Model

Current production is still partly co-located, but target production identity
uses separate control-plane and edge-node names:

```text
sub-control-a: primary subscription control-plane authority, targeting Aliyun
  after CI exits and Risk A inventory approves it
sub-control-b: future standby / restore target for subscription control
prod-edge-a: current primary edge data-plane slot
prod-edge-b: iteration / canary edge data-plane slot
prod-edge-c: future recovery / standby edge data-plane slot
```

Legacy names such as blue or green may appear in historical execution records,
but new durable planning should use provider-neutral names. See
`docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md` for the control/edge split,
`docs/NODE_NAMING.md` for naming rules, and
`docs/PRODUCTION_EDGE_FLEET.md` for edge fleet planning.

Production facts drift. Before production-adjacent work, read
`docs/PROJECT_CONTEXT.md`, then verify live state with the relevant read-only
inventory commands.

## Subscription Product Model

The user-facing contract should stay stable:

```text
subscription refresh entry
server-side credential or opaque artifact
time entitlement
traffic entitlement
local agent bootstrap path
```

Node output is platform delivery capacity, not a pricing tier. Subscription V2
can change the emitted node set behind the stable refresh entry. Operator-only
node assignment is a maintenance and canary mechanism, not a self-service plan
system.

Opaque subscription artifacts are the follow-up access model for random-looking
per-device refresh URLs and local-agent bootstrap. Repository support exists,
but broader artifact issuance, legacy query-token retirement, and device-abuse
enforcement remain separate work with their own gates.

There is no active tenant-migration workstream in the current product plan. Use
tenant language only when describing the historical SQLite subscription model,
server-side compatibility records, or already-recorded production actions. The
active architecture direction is:

```text
local proxy production agent
subscription control plane
server-side multi-node edge networking
stable user-facing subscription/import experience
```

## Work Lanes

Use short-lived branches and small PRs:

```text
docs/<topic>: documentation, facts, runbooks, execution records
refactor/<topic>: compact implementation or cleanup
feat/<topic>: feature implementation
test/<topic>: focused test work
ops/<topic>: operational plans, preflights, or execution records
```

Keep lanes separate:

```text
Architecture lane:
  docs, design contracts, route audits, node naming, operating model

CI lane:
  GitHub Actions status, local Linux manual CI host, validation records

Operator lab lane:
  HP Relay diagnostics, local path experiments, channel-manager evidence
  not CI, not staging, not production, not deploy approval

Code capability lane:
  server, Admin UI, renderer, repository, tests

Production ops lane:
  subscription control plane, edge data plane
  AWS, DNS, Nginx, HTTPS, systemd, SQLite backup/restore, node lifecycle
```

Code and docs branches may run in parallel when they do not touch the same
source-of-truth files. Real external mutation must be serial.

Multi-agent work follows the same rule. Agents may parallelize independent
analysis or implementation tracks, but the lead agent remains responsible for
integration, source-of-truth updates, final verification, and user-facing
claims.

## PR Definition Of Done

Every PR must close its assigned loop before it can be marked Ready, submitted
for merge, or reported as complete.

Required PR loop:

```text
design / intent:
  what this PR is meant to change
  risk tier and explicit non-goals
  expected production / cloud / runtime impact

execution:
  repository changes, execution record, or approved inventory actually done
  source-of-truth docs and project-state updated when facts changed

validation:
  commands or runbook-specific checks actually run
  failures or skipped checks explained
  remaining gates stated explicitly

agent / task routing:
  lead agent name
  supporting agents used, or none
  primary unit and secondary impacted units
  whether the task is suitable for future specialist agents
  recommended next owner when follow-up work remains
```

Incomplete PRs stay Draft. A PR that contains only design, only inventory, or
only a runbook can still be valid only when that is its explicitly approved
scope; in that case the PR body must say what was not executed and which gate
comes next.

PR descriptions should use `.github/pull_request_template.md` unless a more
specific runbook requires a stricter format. The template's Agent / Task
Routing section is mandatory even for single-agent PRs; write `none` or `not
applicable` rather than omitting the field. This keeps future multi-agent task
splitting visible in the PR history.

Do not split design, execution, and validation across separate PRs by default.
Use a split only when the risk model requires it, when the operator explicitly
approves a spec-only / inventory-only gate, or when external mutation must wait
for a later Risk A approval.

## Stage Reporting

There is no fixed "every five merged PRs" reporting rule. Create a stage report
only when it is useful for handoff or risk control, such as after a production
gate, a long-running work lane, a major product direction change, or an
operator request.

When a stage report is needed, include:

```text
PR range and PR numbers
what changed and why
risk tier for the work
validation evidence, including manual CI when used
production, AWS, DNS, Nginx, HTTPS, systemd, tenant, artifact, and cutover impact
open blockers and recommended next actions
```

Do not treat stage reporting as a closeout requirement after every small PR.
Routine PRs should rely on their PR body, validation evidence, and updated
project-state or docs when those are part of the approved scope.

## Risk Tiers

Use the project A/B/C model from `AGENTS.md`.

```text
C: docs-only
   Validation: see docs/VALIDATION_BASELINE.md; usually git diff --check
   No code or external mutation.

B: compact code change
   Validation: see docs/VALIDATION_BASELINE.md; targeted tests plus npm test,
   and Admin tests/build when needed.
   No AWS, DNS, production, Nginx, HTTPS, systemd, deploy, or cutover mutation.

A: production, cloud, DNS, Nginx, systemd, auth model, schema, node, deploy
   Requires runbook or execution record, read-only inventory, explicit approval,
   validation, rollback path, and serialized execution.
```

If a change affects generated production subscription output, production node
config, production tenants, DNS, or runtime state, treat it as Risk A even when
the repository code change looks small.

Subagent work does not lower risk. A Risk A task remains Risk A even when a
subagent performs only one part of the analysis.

## Control, Delivery, And Data Planes

```text
Control plane:
  Admin API, Subscription Core, SQLite, artifacts, operator actions, runbooks
  sub-control-a / future sub-control-b

Delivery plane:
  /sub/clash.yaml, future /sub/a/*, Subscription V2 YAML renderer

Data plane:
  Shadowsocks nodes, prod-edge fleet, Clash/Mihomo direct connections
  future Local Edge Agent remote-edge channels
```

Clash/Mihomo clients fetch YAML from the delivery plane and then connect
directly to Shadowsocks nodes. Real traffic accounting cannot be solved by the
Node HTTP bridge alone; it requires a separate data-plane design.

## Decision Checklist

Before changing direction, ask:

```text
Does the user subscription entry stay stable?
Does this only touch repo docs or code?
Does this mutate external state?
Does this change production subscription output?
Does this alter token, URL, artifact, tenant, or device semantics?
Is there a rollback path?
Which current doc is the source of truth?
```

Prefer changes that keep subscription URLs and user tokens stable, move node
maintenance behind DNS/config/operator controls, and preserve auditable
execution records for every external state change.

## Non-Goals

This document does not:

```text
authorize production work
replace AGENTS.md
replace PROJECT_CONTEXT.md
replace active runbooks
define secret handling beyond existing boundaries
approve HTTPS, DNS, node, tenant, or artifact activation
```

When in doubt, use the stricter risk tier and update the relevant source of
truth before proceeding.
