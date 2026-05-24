# prod-edge-a Candidate Preflight

Date: 2026-05-24, Asia/Shanghai.

> Status:
> - Type: Production candidate preflight and approval gate record
> - Risk: A
> - Execution authority: Does not authorize AWS creation, DNS mutation, production config changes, secret copying, SQLite copying, service start, or traffic cutover
> - Production impact: None at this planning stage
> - Source of truth for: Preconditions before creating a clean new `prod-edge-a` candidate

## Scope

This record converts the legacy blue incident findings and production edge
fleet plan into the exact preconditions for a clean new `prod-edge-a`
production candidate.

It does not execute or approve:

- AWS instance creation;
- security group creation or mutation;
- DNS mutation;
- Nginx mutation;
- HTTPS issuance;
- production `.env` change or copying;
- `CONSOLE_TOKEN` or `SS_PASSWORD` copying;
- SQLite backup copying or restore;
- production `config/proxy-servers.json` changes;
- service start, restart, stop, or reload;
- green promotion;
- legacy blue shutdown or termination;
- production traffic cutover.

## Current Inputs

Relevant current records:

- `docs/production-incident-records/2026-05-24-legacy-blue-connectivity-review.md`
- `docs/PRODUCTION_EDGE_FLEET.md`
- `docs/PRODUCTION_REPLACEMENT.md`
- `docs/PRODUCTION_DR.md`
- `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`
- `docs/SUBSCRIPTION_V2_REPLACEMENT.md`

Current durable facts:

```text
Legacy blue:
  Public IP: 47.129.247.102
  Current role: legacy primary path, under incident review
  Future role: review hold / lessons learned / controlled exit only

Current green:
  Public IP: 18.136.102.226
  Current role: temporary validated replacement candidate
  Future role: hold temporarily until cutover, canary, or cleanup is approved

Future prod-edge-a:
  Current instance: none
  Target role: clean provider-neutral primary candidate
  Required approval: separate Risk A creation approval
```

Subscription V2 renderer is now implemented in repository code. It keeps
subscription URLs and tenant tokens stable, emits the configured V2 node set
for default-primary tenants, and keeps explicit non-default tenant node
assignment as an operator canary override. Activating new production node
config or migrating production tenants remains Risk A production node-config
work.

## Required Approval Phrase

The next mutating step must use this exact approval phrase:

```text
Create a clean prod-edge-a production candidate. Do not cut over traffic.
```

This approval phrase authorizes only the creation and validation of a clean
`prod-edge-a` candidate according to the approved execution plan. It does not
authorize DNS cutover, production config migration, tenant migration, green
promotion, legacy blue shutdown, or traffic cutover.

## Preconditions Before Creation

Before creating the candidate, the execution record must define:

```text
Candidate identity:
  Node ID: prod-edge-a
  Customer-visible label: prod-edge-a or approved provider-neutral equivalent
  No provider, region, color, instance ID, or public IP in durable node identity

Build source:
  Exact Git commit or release artifact
  Node/npm versions
  Runtime path
  Bootstrap source and script version

Host shape:
  Region / availability target
  AMI
  Architecture
  Instance type
  Root volume size
  Root volume encryption decision
  Tags

Network policy:
  Public HTTP gateway port
  Public Shadowsocks TCP/UDP port
  SSH source restriction
  No public 3456 / 18180 / 1080
  No public Admin UI or Admin API

Secret and data boundary:
  Production .env source and destination
  CONSOLE_TOKEN handling
  SS_PASSWORD handling
  SQLite backup source
  SQLite restore target
  Service user ownership
  No secret/data copied into GitHub, docs, chat, PRs, or logs

Cutover stance:
  Candidate creation only
  DNS remains unchanged unless separately approved
  Production config remains unchanged unless separately approved
  Tenant assignments remain unchanged unless separately approved
  Current green remains temporary unless separately promoted or cleaned up
```

## Legacy Blue Lessons To Preserve

The new candidate must absorb these lessons from the legacy blue incident:

- Do not use cloud-provider, region, blue/green, instance, or IP identifiers as
  durable node identity.
- Do not rely on a single unconfirmed public IP as the only durable service
  path.
- Treat path-level TCP timeout evidence as operationally important but do not
  overstate it as global customer impact without additional vantage evidence.
- Keep protocol hardening, data-plane traffic accounting, and Subscription V2
  production activation as separate workstreams.
- Keep rollback and exit decisions explicit: DNS rollback, node-config
  rollback, tenant-assignment rollback, green cleanup, and legacy-blue
  retirement are separate approvals.

## Candidate Validation Checklist

The candidate creation execution record must record these checks after build:

```text
Repository validation:
  npm ci
  npm ci --prefix admin
  npm test
  npm run admin:test
  npm run admin:build

Host-local validation:
  proxy-gateway-console.service active
  proxy-gateway-ss.service active
  nginx active
  nginx -t ok
  local /api/health -> 200
  local /api/admin/subscriptions without token -> 401
  SQLite integrity_check -> ok

Public boundary:
  public /api/health -> 200
  public /api/admin/* -> 404
  public /sub/clash.yaml without token -> 401
  public / -> 404
  Shadowsocks port reachable

Security/logging:
  Admin UI not public
  3456 / 18180 / 1080 not public
  access logs do not record raw query tokens
  no raw systemctl status, process command lines, tokens, passwords, URLs, or customer data recorded

Subscription behavior:
  valid subscription fetch works without recording the raw URL or token
  generated YAML uses provider-neutral node identity
  default-primary tenant V2 behavior is understood
  canary override behavior is not used for production tenants unless separately approved
```

## Creation Record Must State

The mutating candidate creation record must explicitly state:

- instance ID;
- public IP;
- security group;
- exact deployed commit;
- Node and npm versions;
- runtime path;
- source of bootstrap files;
- whether production secrets were copied;
- whether SQLite was restored;
- whether any DNS changed;
- whether any production config changed;
- whether any tenant assignment changed;
- whether any customer traffic was moved;
- cleanup or retention decision.

## Non-Goals

This preflight does not implement or authorize:

- AWS creation;
- DNS updates;
- HTTPS;
- Nginx production mutation;
- production `.env` mutation;
- production node config mutation;
- production tenant migration;
- green promotion;
- legacy blue stop, terminate, or retirement;
- public Admin UI;
- protocol obfuscation;
- traffic accounting or quota enforcement;
- active-active;
- automatic failover.

## Recommended Next Action

If the operator accepts this preflight, the next step is a separate explicit
Risk A execution approval:

```text
Create a clean prod-edge-a production candidate. Do not cut over traffic.
```

If that approval is not granted, keep current green as the temporary candidate
and keep legacy blue in review hold until a separate cleanup or retirement
decision is approved.

## Validation

Repository validation for this record:

```text
git diff --check origin/master...HEAD
```
