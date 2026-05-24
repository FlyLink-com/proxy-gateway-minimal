# Subscription V2 Replacement Design

> Status:
> - Type: Active design contract
> - Risk: C for this document, B for code implementation, A for production
>   activation
> - Execution authority: Does not authorize code deployment, production config
>   changes, node migration, DNS changes, or traffic cutover
> - Production impact: None until separately approved
> - Source of truth for: replacing the MVP single-node subscription output with
>   Subscription V2

## Purpose

Subscription V1 was the MVP subscription path. It proves that a tenant token can
fetch `/sub/clash.yaml`, but the effective output is still scoped to one
configured node through the tenant `nodeId`.

Subscription V2 is the replacement model. It keeps the user-facing subscription
entry stable while allowing the platform to publish a multi-node edge set after
green and future nodes have been validated.

## Core Decision

User subscriptions are not node packages.

The long-term user entitlement model has only two business limits:

```text
time
traffic
```

Nodes are platform delivery capacity and operational routing, not a commercial
tier. A valid user should receive the currently approved platform node set.
Operator-only node assignment remains a maintenance and canary control, not a
pricing or product segmentation model.

## Current Baseline

Current implementation facts:

- `/sub/clash.yaml?token=...` is the stable subscription entry.
- Tenant tokens and temporary links are already validated server-side.
- Expired or disabled tenants are rejected during token resolution.
- `generateClashSubscription()` can render multiple servers when given a
  multi-server proxy config.
- `SubscriptionCore.resolveTenantAccess()` now treats default-primary tenants
  as V2 multi-node subscribers and explicit non-default node assignments as
  operator canary overrides.
- PR #66 added operator-only tenant node reassignment, with explicit `nodeId`
  required for reassignment.

Production facts:

- Production traffic still serves from blue.
- Green is a healthy current-code replacement candidate.
- DNS still points to blue.
- Cutover is not approved and is not immediately ready.
- Production `config/proxy-servers.json` has not registered green as an emitted
  production node.

## Goals

- Keep the existing subscription URL stable.
- Keep existing tenant tokens stable.
- Replace MVP single-node output with V2 multi-node output after validation.
- Treat time and traffic as the only user entitlement limits.
- Make the default valid-user output a platform-approved active node set.
- Preserve operator-only canary control for specific tenants.
- Keep expired and disabled tenant behavior unchanged.
- Avoid exposing provider names, cloud vendors, blue/green internals, or
  sensitive values in generated node labels.
- Roll out through green validation before production activation.

## Non-Goals

- No production activation in this document.
- No AWS, DNS, Nginx, HTTPS, systemd, deploy, or cutover operation.
- No SQLite schema migration in the first implementation.
- No self-service user portal.
- No payment integration.
- No pricing tier or commercial node package model.
- No traffic quota enforcement in the first multi-node renderer.
- No data-plane traffic accounting or blocking design here.

Traffic quota is a separate design problem because Clash/Mihomo clients connect
directly to Shadowsocks nodes after fetching YAML. Subscription-layer 403s can
stop future refreshes, but they do not prove data-plane traffic blocking for
already cached nodes.

## Subscription V2 Model

### Stable User Contract

The user-facing contract remains:

```text
GET /sub/clash.yaml?token=...
```

V2 must not require users to re-import subscriptions or receive a new token.

### Valid Tenant Output

For a valid tenant, V2 returns Clash/Mihomo YAML containing the approved active
node set.

Example shape:

```yaml
proxies:
  - name: "prod-edge-a"
    type: ss
    server: "ss-sg.globalcirclecat.com"
    port: 18388
    cipher: "aes-256-gcm"
    password: "redacted-runtime-value"
  - name: "prod-edge-b"
    type: ss
    server: "approved-second-node.example"
    port: 18388
    cipher: "aes-256-gcm"
    password: "redacted-runtime-value"

proxy-groups:
  - name: GLOBAL
    type: select
    proxies:
      - "prod-edge-a"
      - "prod-edge-b"
      - DIRECT
```

The first V2 implementation should keep `type: select`. Do not introduce
automatic fallback, URL testing, or health-check groups until client behavior is
validated separately.

### Tenant Node Override

Existing `tenant.nodeId` should not become a product entitlement.

For V2:

- If a tenant has the default primary node assignment, emit the default V2
  active node set.
- If an operator explicitly assigns a tenant to a non-default node, emit only
  that node for canary or maintenance validation.

This preserves PR #66's operator control without forcing a schema migration.

### Node Identity

Generated node names should use provider-neutral labels, such as:

```text
prod-edge-a
prod-edge-b
prod-edge-c
```

Do not expose cloud provider names, instance roles, internal blue/green labels,
or region/provider implementation details in user-facing subscription labels.

### Time Limit

Existing expiry semantics continue:

- `disabled` stored status remains operator-driven.
- `expired` remains computed from `expiresAt`.
- Expired tenants receive `403` during token resolution.

### Traffic Limit

V2 should reserve room for traffic-limit decisions, but the first replacement
implementation must not claim tenant-level data-plane enforcement.

Future traffic quota work must answer:

- How traffic is measured per tenant.
- Whether tenant-level Shadowsocks credentials or ports are required.
- Whether node-level traffic accounting is acceptable as an interim metric.
- How over-limit users are blocked in the data plane, not only at subscription
  refresh time.

## Implementation Boundary

The first code implementation is B-tier:

```text
Risk: B / compact code change
Scope:
  - subscription selection logic
  - Clash YAML generation tests
  - subscription core tests
  - docs sync if needed
No AWS / production / DNS / Nginx / HTTPS / deploy / cutover
Validation:
  - git diff --check origin/master...HEAD
  - node --test server/tests/clash-subscription.test.mjs server/tests/subscription-service.test.mjs server/tests/admin-subscriptions.test.mjs
  - npm test
```

Production activation remains A-tier:

```text
Risk: A / production node-config and subscription output activation
Requires:
  - green validation with V2 output
  - fresh production backup decision
  - approved production node config
  - rollback plan to V1 output
  - explicit operator approval
```

## Test Contract

The B-tier implementation should prove:

- Existing valid tenant token still returns `200`.
- Existing expired tenant still returns `403`.
- Existing disabled tenant still returns `403`.
- Existing tenant subscription URL and token behavior do not change.
- Default valid tenant receives multiple approved nodes when the proxy config
  contains multiple active nodes.
- Tenant explicitly assigned to a non-default node receives that node only.
- Generated YAML includes all emitted nodes in `proxies`.
- Generated YAML includes all emitted nodes in the `GLOBAL` proxy group.
- Generated YAML does not expose provider names or internal blue/green labels
  when provider-neutral names are configured.
- Temporary links follow the same node-output behavior as their parent tenant.

## Rollout Path

1. Land this design document.
2. Implement V2 output in a B-tier PR with tests.
3. Deploy and validate V2 on green only.
4. Validate Clash/Mihomo import behavior using non-production test tokens.
5. Request a separate A-tier production activation plan.
6. Activate V2 production output only after backup, rollback, and operator
   approval gates are satisfied.

## Rollback Model

Rollback must be able to return to MVP behavior:

```text
valid tenant -> one configured primary node
```

Rollback must not require user token rotation or subscription URL changes.

## Explicit Open Decisions

- Whether the default active node set is "all configured production nodes" or
  an explicit allowlist in `config/proxy-servers.json`.
- Whether `prod-edge-c` should ever appear in normal subscriptions or remain
  recovery-only.
- Whether V2 production activation should happen before or after blue-to-green
  traffic cutover.
- How traffic quota will be measured and enforced in the data plane.
