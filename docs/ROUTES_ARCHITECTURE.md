# Routes Architecture Audit

Last updated: 2026-05-24, Asia/Shanghai.

> Status:
> - Type: Active architecture audit
> - Risk: C
> - Execution authority: Does not authorize code, DNS, AWS, Nginx, production config, protocol, traffic-accounting, or subscription-access-model changes
> - Production impact: None
> - Source of truth for: Current Express route boundaries, subscription route behavior, and implemented versus not-yet-implemented subscription routing capabilities

## Purpose

This document records the current route-layer and subscription-control facts.
It is intentionally narrow: it describes what the repository implements today
and separates that from future architecture directions.

Use this before making claims about:

- public versus protected route boundaries;
- Admin subscription control endpoints;
- Subscription V2 node selection behavior;
- local device control routes;
- expired / disabled subscription behavior;
- future DPI, mixed-protocol, blackhole, traffic, or self-service features.

## Current Route Composition

`server/app.mjs` creates the Express app and wires routes in this order:

```text
1. JSON parser
2. GET /api/health
3. static public directory
4. /api/admin source-IP allowlist middleware
5. app-level Bearer auth middleware
6. /api/status
7. legacy proxy routes
8. system proxy routes
9. network routes
10. admin subscription routes, when subscription runtime exists
11. /sub rate limit
12. subscription routes
13. diagnostics routes
```

The public allowlist is currently:

```text
/api/health
/proxy.pac
/sub/clash.yaml
```

The auth middleware also has a public prefix for repository-level opaque
artifact refresh:

```text
/sub/a/
```

Any other `/api/*` path passes through Bearer auth. `/api/admin/*` also passes
through the admin source-IP allowlist before Bearer auth.

## Implemented Boundaries

### App-Level Public / Pre-Auth Surface

At the Express app level, these handlers are mounted before Bearer auth:

```text
GET /api/health
static files under public/
```

The auth middleware also has these public allowlist entries:

```text
/api/health
/proxy.pac
/sub/clash.yaml
```

And this public prefix:

```text
/sub/a/
```

This means `public/` static serving is part of the Express app pre-auth surface.
Do not confuse that with the public production gateway boundary.

`/sub/clash.yaml` is public at the middleware boundary because Clash/Mihomo
clients need to refresh subscriptions without Bearer admin auth. The route
still requires either a subscription token or the console token semantics
implemented by `server/routes/subscription.mjs`.

Production Nginx is stricter than the Express app surface. Current public
production access should continue to expose only `/api/health` and
`/sub/clash.yaml`; root and static UI paths are expected to return `404`.
Exposing opaque artifact paths publicly remains a separate Risk A production
activation decision because path artifacts are bearer secrets and require
Nginx logging review.

### Protected Control Routes

Protected control routes include:

```text
/api/status
/api/ss/*
/api/http-proxy/*
/api/proxy/*
/api/system-proxy/*
/api/env-proxy/*
/api/autostart/*
/api/network/*
/api/proxy/servers
/api/proxy/status
/api/nginx/status
/api/ping/:host
/api/proxy/test
/api/subscription/status
```

These routes rely on the app-level Bearer auth middleware and deployment
boundaries. They are not public endpoints.

### Admin Subscription Routes

Admin subscription routes are protected by both:

```text
/api/admin source-IP allowlist
Bearer auth
```

Implemented admin subscription endpoints include:

```text
GET  /api/admin/subscriptions
POST /api/admin/subscriptions
GET  /api/admin/subscriptions/:id
PATCH /api/admin/subscriptions/:id
POST /api/admin/subscriptions/:id/renew
POST /api/admin/subscriptions/:id/node
POST /api/admin/subscriptions/:id/disable
POST /api/admin/subscriptions/:id/enable
POST /api/admin/subscriptions/:id/reset-token
POST /api/admin/subscriptions/:id/temp-link
POST /api/admin/subscriptions/:id/artifacts
GET  /api/admin/subscriptions/:id/artifacts
POST /api/admin/subscription-artifacts/:id/revoke
POST /api/admin/subscription-artifacts/:id/rotate
GET  /api/admin/nodes
GET  /api/admin/overview
```

`POST /api/admin/subscriptions/:id/node` is the operator-only tenant node
assignment endpoint. It calls `core.setTenantNode(...)`; validation errors map
to `400`, and missing tenants map to `404`.

The artifact endpoints are operator-only controls for device-scoped opaque
subscription artifacts. Create and rotate responses can include a visible-once
artifact URL; list responses return only non-secret summaries.

## Subscription Route Behavior

`GET /sub/clash.yaml` currently behaves as follows:

```text
console token via query or Bearer:
  returns YAML generated from state.proxyConfig

no token:
  401

subscription token:
  core.resolveSubscriptionToken(token)
  failed result -> route returns result status and error
  successful result -> YAML generated from result.proxyConfig

subscription service failure:
  500 internal_error
```

The route does not directly decide which nodes a tenant receives. Node
selection happens inside subscription core / serializer logic.

`GET /sub/a/:artifact` is the repository-level opaque artifact refresh route.
It does not accept query-token fallback. It resolves a hashed artifact secret
through subscription core, applies the same tenant expiry/disabled checks, and
renders YAML from the resulting scoped Subscription V2 proxy config. Unknown
artifacts return a generic not-found response; revoked or rotated artifacts
return a gone response.

## Subscription V2 Node Selection

`core.resolveTenantAccess()` calls:

```text
cloneProxyConfigForSubscriptionOutput(proxyConfig, tenantAuth.nodeId)
```

Current `cloneProxyConfigForSubscriptionOutput(...)` behavior:

```text
tenant nodeId does not resolve to a configured named node:
  output has zero servers and access is rejected as node unavailable

tenant nodeId resolves to the first configured named node:
  output includes all configured named servers

tenant nodeId resolves to a non-default named node:
  output includes only that selected node
```

This is the current Subscription V2 behavior:

```text
default-primary tenants:
  receive the approved platform node set

explicit non-default tenant assignment:
  scopes that tenant to the selected node for operator canary / maintenance
```

Subscription URLs and tenant tokens remain stable under this model. Changing
production node config, emitted production nodes, or tenant assignments remains
Risk A production node-config work unless the change is purely local/test.

## Clash YAML Renderer

`generateClashSubscription(...)` emits Clash/Mihomo proxy entries from the
configured edge node protocol. Current repository support includes:

```text
type: ss
server
port
cipher
password

type: vless
server
port
uuid
udp
packet-encoding
tls
servername
network
flow
client-fingerprint
```

It creates `AUTO` url-test, `FALLBACK`, and `GLOBAL` select groups, then adds
`DIRECT` as the final option. Unsupported protocols fail closed instead of
being silently omitted or emitted.

The renderer does not currently emit other mixed protocol fields such as:

```text
ws-opts
sni
vmess
trojan
reality
grpc
```

## Expired And Disabled Subscription Behavior

Subscription core computes runtime status before generating YAML:

```text
stored disabled -> 403 Subscription disabled
expiresAt <= now -> 403 Subscription expired
otherwise -> continue
```

This means expired tenants are blocked at token resolution time. The system
does not currently materialize expired tenants into stored `disabled` status by
background cron, and `disabled` remains an operator-driven stored status.

## Local Device Control Routes

`server/routes/network.mjs` exposes:

```text
GET  /api/network/status
POST /api/network/repair
POST /api/network/reset
```

`server/routes/system-proxy.mjs` exposes:

```text
POST /api/system-proxy/:action
POST /api/env-proxy/on
POST /api/env-proxy/off
GET  /api/env-proxy/status
POST /api/autostart/on
POST /api/autostart/off
GET  /api/autostart/status
```

These route files delegate to `state.runCommand(...)`. They do not implement
their own route-local loopback checks. Their protection comes from:

```text
app-level Bearer auth
deployment boundary
Nginx public boundary
Admin UI local / SSH tunnel access model
```

## Not Implemented Today

The repository does not currently implement:

```text
automatic carrier / ISP / region / ASN detection
automatic DPI or SNI failure detection
automatic node reassignment based on carrier conditions
WebSocket + TLS mixed-protocol subscription output
VMess / Trojan / Reality / gRPC subscription rendering
blackhole node semantics
automatic abuse blocking or carrier-aware abuse detection
traffic accounting
traffic quota enforcement
self-service user portal
per-route loopback checks inside network.mjs or system-proxy.mjs
```

These may be future directions, but they are not current project facts.

## Future Work Boundaries

### Mixed Protocol / DPI Resistance

Adding DPI-resistant or mixed-protocol delivery would require at least:

```text
node config schema changes
Clash renderer support for protocol-specific fields
client compatibility tests
production service deployment for the selected protocols
Nginx / TLS / SNI decisions where applicable
Risk A production activation gate
```

This is not a route-layer-only change.

### Traffic Accounting

Clash/Mihomo subscription users connect directly to emitted Shadowsocks nodes.
Their real data-plane traffic does not pass through the local HTTP bridge route
layer. Traffic accounting requires a separate data-plane design, such as
ss-server, system network counters, per-port/per-user strategy, or another
approved collection mechanism.

### Blackhole / Abuse Controls

Tenant node assignment can point a tenant to a configured node, but there is no
first-class blackhole node policy today. Any blackhole behavior would require
explicit production node-config and operator policy design.

## Summary

Implemented today:

```text
route layering
app-level public allowlist
admin source-IP allowlist for /api/admin
Bearer auth for protected routes
Subscription V2 node selection
operator-only tenant node assignment
device-scoped opaque artifact repository/core/routes/admin support
expired / disabled token-resolution blocking
Shadowsocks and VLESS Clash YAML output
```

Not implemented today:

```text
automatic carrier/DPI detection
full mixed protocol or obfuscation matrix
blackhole node semantics
automatic carrier-aware abuse detection
traffic accounting or quota enforcement
self-service portal
route-local loopback checks for each control route file
```
