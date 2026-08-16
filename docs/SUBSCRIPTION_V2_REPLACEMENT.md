# Subscription V2 Replacement Design

Last updated: 2026-08-16.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: subscription_v2_replacement_design
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


> Status:
> - Type: Active production contract and closeout record
> - Risk: C for this document, B for code implementation, A for production
>   activation or retirement actions
> - Execution authority: Does not authorize code deployment, production config
>   changes, node migration, DNS changes, traffic cutover, legacy endpoint
>   removal, green cleanup, or legacy-blue retirement
> - Production impact: None until separately approved
> - Source of truth for: current Subscription V2 production behavior and the
>   remaining closure gates after replacing MVP single-node output

## Purpose

Subscription V1 was the MVP subscription path. It proves that a tenant token can
fetch `/sub/clash.yaml`, but the effective output is still scoped to one
configured node through the tenant `nodeId`.

Subscription V2 is the production renderer model. It keeps the current legacy
subscription entry compatible while allowing the platform to publish a
multi-node edge set.

Device-scoped opaque subscription URLs are the follow-up access model for the
same V2 YAML output. That design lives in
`docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md` and covers random-looking
refreshable artifact URLs, server-side token containment, and device-abuse
signals. It does not change this V2 renderer contract by itself.

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

- The legacy query-token subscription endpoint is the current compatible entry.
- Tenant tokens and temporary links are already validated server-side.
- Expired or disabled tenants are rejected during token resolution.
- `generateClashSubscription()` can render multiple servers when given a
  multi-server proxy config.
- `SubscriptionCore.resolveTenantAccess()` now treats default-primary tenants
  as V2 multi-node subscribers and explicit non-default node assignments as
  operator canary overrides.
- PR #66 added operator-only tenant node reassignment, with explicit `nodeId`
  required for reassignment.
- PR #78 activated Subscription V2 in production on `prod-edge-a` and recorded
  the active production tenant migration from the legacy node name to
  `prod-edge-a`.

Production facts:

- Current production MVP target is `prod-edge-a`.
- Authoritative DNS for the subscription gateway and primary Shadowsocks node
  points to the `prod-edge-a` production target.
- Production V2 output currently emits `prod-edge-a` plus temporary
  `prod-edge-b`.
- `prod-edge-b` is the current green node and remains temporary secondary
  capacity until it is replaced by a durable second node or explicitly removed
  from production output.
- Legacy blue is no longer the durable production target. It remains only for
  review, dependency drain, lessons learned, and controlled exit.
- Device-scoped opaque subscription artifacts are documented but not
  implemented or activated.

## Goals

- Keep the existing legacy subscription entry compatible during renderer
  migration.
- Keep existing tenant records and server-side tokens stable.
- Keep V2 multi-node output as the current production subscription renderer.
- Treat time and traffic as the only user entitlement limits.
- Make the default valid-user output a platform-approved active node set.
- Preserve operator-only canary control for specific tenants.
- Keep expired and disabled tenant behavior unchanged.
- Avoid exposing provider names, cloud vendors, blue/green internals, or
  sensitive values in generated node labels.
- Keep remaining shutdown and migration work behind explicit A-tier gates.

## Non-Goals

- No new production activation in this document.
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

### Legacy Compatibility Contract

V2 renderer migration must preserve the current legacy subscription endpoint.
The renderer should not require users to receive new tenant tokens only because
the YAML output changed from single-node to multi-node.

The long-term product access model is device-scoped opaque subscription
artifacts. That model should keep tenant tokens server-side and avoid embedding
token-shaped values in the user-visible URL. The renderer must remain usable
from either access layer.

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

## Implementation Status

The V2 renderer implementation has landed and is active in production. Default
primary tenants receive the configured V2 node set, while explicit non-default
tenant node assignment remains an operator canary override.

The original code implementation was B-tier:

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

The production activation was A-tier and is recorded separately:

```text
Risk: A / production node-config and subscription output activation
Record:
  docs/production-replacement-records/2026-05-24-prod-edge-a-production-activation.md
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

## Completed Rollout

Completed:

1. Landed the V2 replacement design.
2. Implemented V2 output in a B-tier code PR with tests.
3. Validated V2 on green and clean `prod-edge-a` candidates.
4. Restored fresh legacy-blue-derived SQLite data to `prod-edge-a`.
5. Activated `prod-edge-a` as the production MVP target through an A-tier
   production activation record.
6. Corrected the active production tenant `nodeId` to `prod-edge-a` after an
   initial import failure caused by the legacy node assignment.

## Remaining Closure Gates

Do not treat V2 activation as permission to close every legacy or temporary
path. Close each path through its own gate:

| Item | Current state | Closure rule |
| --- | --- | --- |
| Legacy query-token subscription endpoint | Still the compatible production refresh path. | Do not remove until device-scoped opaque artifacts are implemented, validated, migrated, and explicitly activated. |
| `prod-edge-b` / current green | Currently emitted as temporary secondary node in V2 output. | Do not stop or terminate while it remains in production node config. First replace it with a durable second node or remove it from emitted V2 output through A-tier production node-config work. |
| Legacy blue | No longer durable production target; kept for review and controlled exit. | Run a read-only retirement preflight before shutdown or termination. Any stop/terminate/security-group change remains A-tier. |
| Direct production DNS/runtime rollback | Available only through recorded production runbook paths. | Any rollback or DNS change remains A-tier and must preserve subscription refresh behavior. |
| Device-scoped opaque artifacts | Design documented only. | Implementation is separate work; production activation requires Nginx/logging review and explicit A-tier approval. |
| Traffic quota enforcement | Not implemented in V2 renderer. | Requires separate data-plane traffic accounting design; subscription refresh blocking alone is not data-plane enforcement. |
| HTTPS | Not issued or activated by V2 production activation. | Requires separate domain/Nginx/Certbot approval and rollback plan. |

## Rollback Model

Rollback from V2 output must be able to return to MVP behavior:

```text
valid tenant -> one configured primary node
```

Rollback must not require user token rotation or subscription URL changes.

## Explicit Open Decisions

- Whether the default active node set should remain the current configured
  production nodes or move to an explicit allowlist field.
- Whether `prod-edge-c` should ever appear in normal subscriptions or remain
  recovery-only.
- Whether current `prod-edge-b` should be replaced by a durable second node or
  removed from V2 output before green cleanup.
- When and how legacy blue should be retired after read-only retirement
  preflight.
- When device-scoped opaque subscription artifacts should replace the legacy
  query-token URL as the product access model.
- How traffic quota will be measured and enforced in the data plane.
