# Node Naming Policy

Last updated: 2026-05-24, Asia/Shanghai.

> Status:
> - Type: Active policy
> - Risk: C for this document; A for runtime node identity migrations
> - Execution authority: Does not authorize production config, DNS, node, or subscription changes by itself
> - Production impact: None unless separately approved
> - Source of truth for: Provider-neutral node naming rules

## Purpose

Use provider-neutral names for production edge nodes. Node names are visible in
operator docs, tracked config, generated subscription YAML, logs, Admin views,
and incident records. They must not reveal cloud provider, region, hosting
vendor, instance purpose, or failover status unless an approved operational
record explicitly requires that detail.

## Naming Model

Use this public and operational node identity pattern:

```text
prod-edge-a
prod-edge-b
prod-edge-c
```

Meaning:

```text
prod: production edge fleet
edge: proxy edge node
a/b/c: stable neutral node slots
```

This naming is intentionally abstract. It does not encode provider, region,
instance ID, public IP, blue/green role, active/standby state, or customer
assignment.

## Current Target Slots

Future production node identity should converge toward:

```text
prod-edge-a: current primary production edge slot
prod-edge-b: current validated replacement/second-node slot
prod-edge-c: future third recovery/standby slot
```

This document does not rename existing runtime config. Historical execution
records and current production facts may still contain older provider- or
region-revealing names because they are factual records. Do not rewrite those
records unless a separate docs cleanup explicitly preserves audit value and
avoids changing operational history.

## Prohibited New Names

Do not introduce new node names that include:

```text
cloud provider names
hosting vendor names
region or city names
instance IDs
public IPs
blue / green / standby / backup roles
customer names
plan or tier names
```

Avoid examples like:

```text
aws-*
aliyun-*
tencent-*
*-singapore-*
*-hk-*
*-blue
*-green
*-standby
```

Those terms may still appear in execution records when recording existing
historical facts, but they should not be used as future durable node identity.

## Public DNS Names

Prefer provider-neutral DNS names for new node hosts:

```text
edge-a.globalcirclecat.com
edge-b.globalcirclecat.com
edge-c.globalcirclecat.com
```

The subscription gateway host may remain service-oriented:

```text
sub.globalcirclecat.com
```

Existing DNS names and records must not be changed by this policy alone. DNS
changes remain Risk A work and require the relevant runbook, rollback path, and
explicit operator approval.

## Config And Subscription Rules

For future migrations:

- `config/proxy-servers.json` node IDs should use provider-neutral names.
- Generated Clash/Mihomo YAML should expose provider-neutral node names.
- Admin UI node labels should use provider-neutral names.
- Tenant `nodeId` values should reference provider-neutral node IDs.
- Provider, instance ID, public IP, and secret mapping details belong only in
  restricted operational inventory or execution records.

Do not migrate stored tenant `nodeId`, production `.env`, production
`config/proxy-servers.json`, DNS, or generated subscription behavior as part of
this docs-only policy. Those changes are Risk A production node-config work.

## Third Node Guidance

The future third production recovery node should use:

```text
prod-edge-c
```

GitHub may contain build recipes, bootstrap scripts, templates, and runbooks for
that slot. GitHub must not contain production `.env`, `CONSOLE_TOKEN`,
`SS_PASSWORD`, SQLite data, raw subscription URLs, cloud credentials, customer
data, private keys, or provider-specific secret inventory.

## Migration Gate

Before any live node identity migration:

```text
Risk: A
Required:
  - read-only inventory
  - current node identity mapping
  - tenant nodeId impact review
  - subscription YAML compatibility review
  - DNS/client impact review
  - fresh SQLite backup and integrity_check
  - rollback commands
  - explicit operator approval
```

Recommended first migration target:

```text
legacy primary node identity -> prod-edge-a
validated second node identity -> prod-edge-b
future third recovery slot -> prod-edge-c
```

Do not make these migrations opportunistically while doing unrelated DNS,
green-candidate, or DR work.
