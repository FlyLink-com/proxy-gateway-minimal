# Production Edge Fleet Plan

Last updated: 2026-05-24, Asia/Shanghai.

> Status:
> - Type: Active planning document
> - Risk: A
> - Execution authority: Does not authorize cloud mutation, DNS mutation, production config changes, node identity migration, secret copying, SQLite copying, traffic cutover, or standby promotion by itself
> - Production impact: None unless separately approved
> - Source of truth for: Provider-neutral production edge slot model and third-node standby planning

## Purpose

This document defines the provider-neutral production edge fleet model for the
proxy gateway. It turns the current single-primary plus validated replacement
candidate state into a controlled three-slot plan:

```text
prod-edge-a: current production primary slot
prod-edge-b: validated second/replacement slot
prod-edge-c: future third recovery/standby slot
```

The plan is documentation-only. It does not rename current runtime nodes,
change generated subscriptions, create a third node, change DNS, change
production `.env`, copy secrets, copy SQLite data, or move traffic.

## Relationship To Other Docs

- `docs/NODE_NAMING.md`: provider-neutral node naming policy.
- `docs/PRODUCTION_DR.md`: production incident recovery and standby promotion
  gates.
- `docs/PRODUCTION_REPLACEMENT.md`: blue/green replacement gates.
- `docs/PRODUCTION_CUTOVER_STRATEGY.md`: EIP, DNS, and node-config cutover
  strategy decision.
- `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`: DNS/domain implementation gates and
  rollback commands.
- `docs/production-replacement-records/2026-05-24-green-candidate-creation.md`:
  current validated replacement candidate record.

If this plan conflicts with a later execution record, the latest explicitly
approved execution record wins for the work it performed.

## Current Facts

Current durable facts:

```text
prod-edge-a target slot:
  Current role: future clean primary production edge slot
  Current traffic: no dedicated provider-neutral runtime identity yet
  Current public traffic host: sub.globalcirclecat.com and ss-sg.globalcirclecat.com point to this slot
  Current runtime identity: legacy provider/region-revealing node still serves the current path, but should not become the future durable target

prod-edge-b target slot:
  Current role: validated production replacement candidate
  Current traffic: no
  Current validation: public boundary, systemd, SQLite integrity, and Shadowsocks TCP reachability passed
  Current runtime identity: still configured as a replacement candidate, not a durable second-node identity

prod-edge-c target slot:
  Current role: future third recovery/standby slot
  Current traffic: no
  Current instance: none assigned by this document
  Current GitHub state: repo-only build-material package under ops/edge-node/
```

The exact cloud provider, instance ID, public IP, and security group mappings
belong in execution records and restricted operational inventory. They should
not become durable node names or customer-visible labels.

The 2026-05-24 legacy blue connectivity review records the current operator
decision: preserve the legacy primary node for read-only review, lessons
learned, dependency drain, and controlled retirement; do not use it as the
future durable production target. A clean new `prod-edge-a` candidate requires
a separate Risk A creation and validation approval.

## Target Slot Semantics

### prod-edge-a

`prod-edge-a` is the primary production edge slot.

Expected responsibilities:

- Public subscription gateway route through the approved public host.
- Active Shadowsocks node for current production clients.
- Loopback Admin/API runtime.
- SQLite subscription store primary source of truth until another data
  topology is explicitly approved.

Do not rename the current live runtime identity to `prod-edge-a` without a
separate Risk A node identity migration.

### prod-edge-b

`prod-edge-b` is the second production edge slot.

Possible modes:

```text
warm standby: deployed and validated, no customer traffic by default
canary node: selected test tenants receive this node
active secondary: generated subscriptions may list both prod-edge-a and prod-edge-b
```

Default recommendation:

```text
Start as warm standby.
Promote to canary only after independent node identity, DNS, subscription YAML, and tenant assignment behavior are approved.
Do not make it active secondary by default.
```

`prod-edge-b` must have an independent node ID before it is used as a durable
second node. It must not reuse the primary slot identity.

### prod-edge-c

`prod-edge-c` is the third recovery/standby slot.

Default recommendation:

```text
cold standby with ready build materials
```

Meaning:

- GitHub contains bootstrap scripts, templates, and runbooks.
- The third node may remain uncreated or clean until explicitly approved.
- Production secrets and SQLite data are injected only during an approved
  recovery or standby provisioning action.
- The slot is not listed in generated subscriptions until approved.

This keeps the recovery path ready without creating a long-lived provider
fingerprint or unmanaged production node.

## GitHub Build Materials Boundary

GitHub may contain provider-neutral build materials for `prod-edge-c`, such as:

```text
ops/edge-node/bootstrap.sh
ops/edge-node/systemd/proxy-gateway-console.service
ops/edge-node/systemd/proxy-gateway-ss.service
ops/edge-node/nginx/proxy-gateway-public.conf
ops/edge-node/templates/env.example
ops/edge-node/templates/ss-server.json.example
ops/edge-node/templates/proxy-servers.json.example
ops/edge-node/README.md
```

These paths are tracked as repo-only recovery build materials. They do not
authorize live node creation, secret injection, SQLite restore, service start,
DNS mutation, or traffic cutover.

GitHub must not contain:

```text
production .env
CONSOLE_TOKEN
SS_PASSWORD
SQLite database files or backups
raw subscription URLs
generated YAML with embedded secrets
cloud credentials
private keys or PEM files
customer data
provider-specific secret inventory
```

Provider-specific commands may appear in an approved execution runbook only
when needed, but durable node identity and customer-visible labels must stay
provider-neutral.

## DNS Model

Recommended future provider-neutral node hosts:

```text
edge-a.globalcirclecat.com
edge-b.globalcirclecat.com
edge-c.globalcirclecat.com
```

Subscription gateway host:

```text
sub.globalcirclecat.com
```

Current DNS remains unchanged by this plan. Any DNS mutation remains Risk A and
requires:

- read-only DNS inventory;
- target record values;
- TTL and propagation expectation;
- rollback commands;
- public boundary validation;
- explicit operator approval.

## Subscription And Tenant Assignment Model

Before adding a second or third edge node to generated subscriptions, decide:

```text
single-node per tenant:
  each tenant receives one assigned edge node

multi-node subscription:
  selected tenants receive multiple nodes in Clash/Mihomo YAML

canary assignment:
  selected test tenants receive prod-edge-b or prod-edge-c first
```

Default recommendation:

```text
Keep existing tenants on the current primary slot.
Use canary tenant assignment before exposing new nodes broadly.
Do not list prod-edge-c in subscriptions until a recovery or standby promotion is explicitly approved.
```

Changing tenant `nodeId`, generated YAML node names, or production
`config/proxy-servers.json` is Risk A production node-config work.

## Data And Secret Handling

`prod-edge-b` and `prod-edge-c` require explicit data/secret handling before
serving production traffic.

Required gates:

- production `.env` source and destination are approved;
- `CONSOLE_TOKEN` handling is approved;
- `SS_PASSWORD` handling is approved;
- fresh SQLite backup exists and passes `pragma integrity_check`;
- restore target and service user are confirmed;
- no secret, token, SQLite content, subscription URL, or customer data is
  recorded in GitHub, PRs, docs, chat, or logs.

For `prod-edge-c`, prefer a just-in-time restore during recovery or scheduled
standby validation rather than keeping an unmanaged stale copy online.

## Promotion Paths

### Path 1: prod-edge-b as warm standby

Use when the goal is to keep the validated second slot available without
serving ordinary traffic.

Required before promotion:

- fresh service health check;
- fresh SQLite backup/restore decision;
- public boundary validation;
- node identity migration plan;
- rollback plan.

### Path 2: prod-edge-b as canary node

Use when the goal is controlled small-scope traffic validation.

Required before promotion:

- independent node ID such as `prod-edge-b`;
- provider-neutral DNS node host;
- selected test tenants;
- generated YAML validation without recording raw subscription URLs;
- rollback to primary-only subscription output.

### Path 3: prod-edge-c as recovery node

Use when both existing production slots are unavailable or an approved recovery
exercise is being run.

Required before promotion:

- build from GitHub materials or verified image;
- inject approved production secrets;
- restore approved SQLite backup;
- validate systemd, Nginx, SQLite, subscription, and Shadowsocks behavior;
- choose DNS or node-config cutover;
- retain rollback path if any primary slot is still reachable.

## Open Decisions

Before runtime work starts, decide:

```text
1. Should prod-edge-b remain warm standby or become canary?
2. Should prod-edge-c be cold standby with build materials, or pre-created warm standby?
3. Should node hosts be edge-a/b/c.globalcirclecat.com?
4. Should generated subscriptions ever list multiple nodes for normal tenants?
5. What is the maximum acceptable SQLite staleness for standby recovery?
6. Who can approve secret/data restore to prod-edge-b or prod-edge-c?
7. How long should old primary paths remain available after a cutover?
```

## Recommended Next Work

Recommended sequence:

```text
1. Approve this production edge fleet plan.
2. Record and absorb legacy blue incident findings before building a new primary candidate.
3. Create a separate Risk A plan for a clean prod-edge-a candidate.
4. Create a separate Risk A plan for prod-edge-b runtime identity migration.
5. Review and maintain repo-only build materials for prod-edge-c.
6. Only then execute node-config, DNS, tenant assignment, or standby promotion work.
```

For the third-node work, start with docs and repo-only build material
templates. Do not create a live third node until the build materials, secret
boundary, data restore process, and validation plan are approved.

## Non-Goals

This plan does not authorize or implement:

- provider-specific resource creation;
- new cloud instances;
- DNS changes;
- Nginx changes;
- HTTPS issuance;
- production `.env` changes;
- production `config/proxy-servers.json` changes;
- tenant `nodeId` migration;
- SQLite backup copying;
- secret copying;
- cutover from the current primary;
- automatic failover;
- active-active production.
