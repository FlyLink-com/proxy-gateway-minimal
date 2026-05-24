# Project Operating Model

Last updated: 2026-05-24, Asia/Shanghai.

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
source of truth, PRs as change boundaries, Aliyun as the manual CI fallback
while GitHub-hosted Actions is blocked, and AWS production changes only through
serial Risk A runbooks and execution records.

Product direction: keep the user subscription entry stable while evolving node
capacity, production hosts, DNS, and operational controls behind that entry.

## Four Layers

```text
1. Source of truth
   GitHub master + local checkout
   code, docs, runbooks, execution records

2. Development and validation
   local development, targeted tests, npm test
   GitHub Actions when available
   Aliyun manual CI host while GitHub-hosted Actions is blocked

3. Production operations
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

## Active Source Of Truth

Active code and docs live in:

```text
GitHub: gaoyi1020-web/proxy-gateway-minimal
Local:  C:\Users\g\Projects\订阅管理\proxy-gateway-minimal
```

Use `docs/PROJECT_CONTEXT.md` for current handoff state and
`docs/README.md` for documentation navigation. Historical checkouts and
historical design artifacts are background only unless current docs explicitly
reference them.

## Production Model

Current production identity uses provider-neutral node names:

```text
prod-edge-a: current primary production edge slot
prod-edge-b: iteration / canary secondary slot
prod-edge-c: future recovery / standby slot
```

Legacy names such as blue or green may appear in historical execution records,
but new durable planning should use provider-neutral names. See
`docs/NODE_NAMING.md` for naming rules and `docs/PRODUCTION_EDGE_FLEET.md` for
fleet planning.

Production facts drift. Before production-adjacent work, read
`docs/PROJECT_CONTEXT.md`, then verify live state with the relevant read-only
inventory commands.

## Subscription Product Model

The user-facing contract should stay stable:

```text
subscription refresh entry
server-side tenant token or future opaque artifact
time entitlement
traffic entitlement
```

Node output is platform delivery capacity, not a pricing tier. Subscription V2
can change the emitted node set behind the stable refresh entry. Operator-only
tenant node assignment is a maintenance and canary mechanism, not a self-service
plan system.

Opaque subscription artifacts are the follow-up access model for random-looking
per-device refresh URLs. Repository support exists, but production exposure,
artifact issuance, legacy query-token retirement, HTTPS, and device-abuse
enforcement remain separate work with their own gates.

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
  GitHub Actions status, Aliyun manual CI host, validation records

Code capability lane:
  server, Admin UI, renderer, repository, tests

Production ops lane:
  AWS, DNS, Nginx, HTTPS, systemd, SQLite backup/restore, node lifecycle
```

Code and docs branches may run in parallel when they do not touch the same
source-of-truth files. Real external mutation must be serial.

## Risk Tiers

Use the project A/B/C model from `AGENTS.md`.

```text
C: docs-only
   Validation: git diff --check origin/master...HEAD
   No code or external mutation.

B: compact code change
   Validation: targeted tests plus npm test, and Admin tests/build when needed.
   No AWS, DNS, production, Nginx, HTTPS, systemd, deploy, or cutover mutation.

A: production, cloud, DNS, Nginx, systemd, auth model, schema, node, deploy
   Requires runbook or execution record, read-only inventory, explicit approval,
   validation, rollback path, and serialized execution.
```

If a change affects generated production subscription output, production node
config, production tenants, DNS, or runtime state, treat it as Risk A even when
the repository code change looks small.

## Control, Delivery, And Data Planes

```text
Control plane:
  Admin API, Subscription Core, SQLite, operator actions, runbooks

Delivery plane:
  /sub/clash.yaml, future /sub/a/*, Subscription V2 YAML renderer

Data plane:
  Shadowsocks nodes, prod-edge fleet, Clash/Mihomo direct connections
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
