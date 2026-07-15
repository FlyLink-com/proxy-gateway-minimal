# Production Edge Fleet Plan

Last updated: 2026-07-07, Asia/Shanghai.

> Status:
> - Type: Active planning document
> - Risk: A
> - Execution authority: Does not authorize cloud mutation, DNS mutation, production config changes, node identity migration, secret copying, SQLite copying, traffic cutover, or standby promotion by itself
> - Production impact: None unless separately approved
> - Source of truth for: Provider-neutral production edge data-plane slot model
>   and third-node standby planning

## Purpose

This document defines the provider-neutral production edge data-plane fleet
model for the proxy gateway. The original AWS carrying instances for
`prod-edge-a` and `prod-edge-b` were permanently terminated on 2026-05-29, so
the current value of this document is slot planning and clean-edge rebuild
guidance rather than evidence of active AWS edge capacity:

```text
prod-edge-a: historical production primary slot; carrying instance terminated
prod-edge-b: historical iteration/canary secondary slot; carrying instance terminated
prod-edge-c: future third recovery/standby slot
```

This is edge data-plane planning. The current subscription control-plane split
is the Vultr Japan control plane plus Vultr Japan / Singapore data-plane lane
described in `docs/VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md` and
`docs/SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md`.

Current status override, 2026-06-13:

```text
Vultr Japan is the current production control-plane authority.
Vultr Japan and Vultr Singapore are the active production data-plane direction.
Historical Aliyun near-term distribution wording below is no longer current
production authority.
Reusable clean-node work follows docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md.
```

Current domain-lane override, 2026-07-07:

```text
The current production subscription/control-plane lane is gccwebos.com.
Use sub.gccwebos.com for the public subscription gateway and jp.gccwebos.com
for Japan QUIC client host/SNI/certificate alignment. globalcirclecat.* names
in older records are historical unless a newer execution record explicitly
scopes them.
```

The AWS staging node-image readiness validation is recorded in
`docs/production-replacement-records/2026-06-13-aws-staging-node-image-readiness-validation.md`.
That record validates the no-secret image readiness and first-boot packet helper
path with synthetic safe input only; it is not production activation and not
control-plane registration completion.

Therefore this document remains useful for understanding historical edge slot
dependencies and future clean-edge rebuild planning, but it is not live
inventory and not proof of active edge capacity. Use the current Vultr
status/plan docs and node-image runbook before any new edge-node work.

The plan is documentation-only. It does not rename current runtime nodes,
change generated subscriptions, create a third node, change DNS, change
production `.env`, copy secrets, copy SQLite data, or move traffic.

## Relationship To Other Docs

- `docs/NODE_NAMING.md`: provider-neutral node naming policy.
- `docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md`: target split between
  subscription control-plane authority and edge data-plane capacity.
- `docs/VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md` and
  `docs/SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md`: current Vultr Japan
  control-plane plus Vultr Japan / Singapore data-plane production lane.
- `docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md`: current reusable no-secret
  machine-image / first-boot registration runbook for new production-capable
  data-plane nodes.
- `docs/CONTROL_PLANE_NODE_REGISTRATION_CLOSEOUT.md`: current C-tier closeout
  plan for turning node-image readiness into control-plane registration,
  protected material handoff, desired-state generation, and receipt-gated
  rendering. Execution remains Risk A.
- `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`: historical former target
  split where Aliyun became the subscription control-plane candidate, local
  Linux became manual CI, and non-Aliyun / non-HP nodes drained through
  controlled retirement. It has no current lane authority; a fresh Risk A gate
  would be required to reopen Aliyun.
- `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`: historical business
  split and node drain / stop / termination gates for the former Aliyun
  promotion lane; no current control-plane authority.
- `docs/JAPAN_TUIC_PER_ORDER_CREDENTIAL_UPGRADE_RUNBOOK.md`: current
  production gate for upgrading the Japan TUIC data-plane node to support
  per-order credential add, disable, rotate, and activation before forced order
  expiry is claimed.
- `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md`: fallback clean
  new-server gates for a future `sub-control-a` candidate. It is not an edge
  slot and does not create `prod-edge-c`.
- `docs/PRODUCTION_DR.md`, `docs/PRODUCTION_REPLACEMENT.md`, and
  `docs/PRODUCTION_CUTOVER_STRATEGY.md`: historical AWS recovery, replacement,
  and cutover evidence only. They do not select a current target or authorize
  current operations. Start current lane selection at
  `docs/RUNTIME_LANE_AUTHORITY.md`, then use the applicable current
  lane-specific runbook and a new exact Risk A gate.
- `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`: DNS/domain implementation gates and
  rollback commands.
- `docs/production-replacement-records/2026-05-24-green-candidate-creation.md`:
  historical validated AWS candidate record; not current capacity or
  production authority.

If this plan conflicts with a later execution record, the latest explicitly
approved execution record wins for the work it performed.

## Current Facts

Current durable facts:

```text
prod-edge-a target slot:
  Current role: historical production primary edge slot
  Current traffic: no active AWS carrying instance
  Current public traffic host: no active AWS carrying instance; older
    sub.globalcirclecat.com Aliyun wording is historical and not the current
    Vultr/gccwebos.com lane
  Current runtime identity: provider-neutral prod-edge-a slot preserved for rebuild planning

prod-edge-b target slot:
  Current role: historical iteration/canary secondary edge slot
  Current traffic: no active AWS carrying instance
  Current validation: historical only; the carrying instance was terminated
  Current runtime identity: provider-neutral prod-edge-b slot preserved for rebuild planning

prod-edge-c target slot:
  Current role: future third recovery/standby slot
  Current traffic: no
  Current instance: none assigned by this document
  Current GitHub state: repo-only build-material package under ops/edge-node/
```

Vultr Japan now carries the documented production control-plane authority for
the current `gccwebos.com` lane. The target direction is to keep
subscription authority separate from replaceable edge capacity. This document
only defines edge slots. It does not authorize `sub-control-a` / `sub-control-b`
creation, database movement, artifact movement, DNS migration, clean edge
bootstrap, or runtime role changes. New reusable node work is governed by
`docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md` and still requires separate Risk A
production gates before any real node activation.

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

Historical co-located responsibilities included:

- Public subscription gateway route through the approved public host.
- Shadowsocks node for production clients before Aliyun promotion and later
  AWS retirement.
- Loopback Admin/API runtime.
- SQLite subscription store primary source of truth until another data
  topology is explicitly approved.

Target edge-only responsibilities should narrow to data-plane capacity and
health reporting after a separately approved control/edge split.

Do not rename the current live runtime identity to `prod-edge-a` without a
separate Risk A node identity migration.

### prod-edge-b

`prod-edge-b` is the second production edge slot for iteration, canary, and
maintenance validation.

Possible modes:

```text
warm standby: deployed and validated, no customer traffic by default
canary node: selected test tenants receive this node
active secondary: generated subscriptions may list both prod-edge-a and prod-edge-b
```

Default recommendation:

```text
Use prod-edge-b as the iteration/canary slot after it has an approved independent node identity.
It may appear in Subscription V2 output when production node-config approval has explicitly added it.
Treat the current carrying instance as replaceable implementation detail, not the durable identity.
```

`prod-edge-b` must keep an independent node ID. It must not reuse the primary
slot identity and must not become the subscription gateway authority.

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
edge-a.gccwebos.com
edge-b.gccwebos.com
edge-c.gccwebos.com
```

Subscription gateway host:

```text
sub.gccwebos.com
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

Use when the goal is to keep the second slot available without serving ordinary
traffic.

Required before promotion:

- fresh service health check;
- fresh SQLite backup/restore decision;
- public boundary validation;
- node identity migration plan;
- rollback plan.

### Path 2: prod-edge-b as iteration/canary node

Use when the goal is controlled small-scope traffic validation.

Required before promotion:

- independent node ID such as `prod-edge-b`;
- provider-neutral DNS node host;
- selected test tenants;
- generated YAML validation without recording raw subscription URLs;
- rollback to primary-only subscription output.

### Path 2b: prod-edge-b as active secondary output

Use when the goal is Subscription V2 multi-node delivery while keeping
`prod-edge-a` as the subscription gateway and primary slot.

Required before keeping it active:

- explicit Risk A production node-config approval;
- fresh health check for the carrying instance;
- confirmation that Subscription V2 output lists provider-neutral labels;
- rollback plan to remove `prod-edge-b` from generated subscriptions without
  changing subscription URLs or tenant tokens;
- lifecycle owner for replacing the carrying instance when it is no longer the
  desired iteration node.

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
1. Should prod-edge-b remain active secondary output, canary-only, or warm standby?
2. Should prod-edge-c be cold standby with build materials, or pre-created warm standby?
3. Should node hosts be edge-a/b/c.gccwebos.com?
4. Should generated subscriptions ever list multiple nodes for normal tenants?
5. What is the maximum acceptable SQLite staleness for standby recovery?
6. Who can approve secret/data restore to prod-edge-b or prod-edge-c?
7. How long should old primary paths remain available after a cutover?
```

## Recommended Next Work

Recommended sequence:

```text
1. Use the Vultr Japan / Singapore status and single-control-plane /
   multi-data-plane plan as the current production orientation.
2. Use this edge fleet plan only for slot semantics, historical dependency
   archaeology, and future clean-edge rebuild planning.
3. Use docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md for reusable no-secret node-image
   readiness and first-boot registration design.
4. Treat the 2026-06-13 AWS staging validation record as staging proof only:
   it does not activate a production node or complete control-plane
   registration.
5. Move to a separate Risk A control-plane closeout gate before any production
   first-boot registration ingestion, protected material handoff, desired-state
   generation, receipt-gated rendering, DNS, Nginx, firewall, or traffic change.
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
