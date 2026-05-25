# Local Edge Agent Design

> Status:
> - Type: Active design proposal and repository prototype reference
> - Risk: C for this document, B for repository prototypes, A for production
>   activation or protocol/node rollout
> - Execution authority: Repository-only prototypes still do not authorize
>   production config changes, DNS changes, Nginx changes, node migration,
>   traffic cutover, customer migration, driver installation, or virtual NIC
>   changes
> - Production impact: None until separately approved
> - Source of truth for: the proposed local channel-adapter client direction

## Purpose

The current production subscription stack is now stable enough for controlled
opaque subscription delivery, but the 2026-05-25 local client investigation
showed an important data-plane gap:

```text
Subscription gateway and server health can be green while real Clash/Mihomo
proxy sessions still hit data-plane i/o timeout.
```

The immediate lesson is not that the Node subscription control plane failed.
The failure mode sits below subscription rendering: the local client selected a
Shadowsocks node, then real proxy sessions to that node timed out.

This document defines a next-generation client-side direction: a local edge
agent that acts as a channel adapter between Clash/Mihomo and the platform's
remote edge servers.

## Core Decision

Build the local agent as a channel adapter, not as a full network client in the
first version.

V1 must not:

```text
create a virtual NIC
install a driver
enable TUN
change system proxy settings
change WinINet / PAC
change routing tables
listen on public interfaces
replace Clash/Mihomo UI or rules
```

V1 should:

```text
listen only on 127.0.0.1
generate a local Clash/Mihomo subscription
expose local proxy endpoints for Clash/Mihomo to select
hold device-scoped credentials
connect to remote edge servers through platform-controlled channels
support remote-edge fallback without changing the user's imported subscription
collect local diagnostic signals
```

The key product boundary:

```text
Clash/Mihomo remains the router and user-facing client.
Local Edge Agent becomes the platform-controlled data-plane adapter.
Remote Edge becomes the platform-controlled server-side data plane.
```

## Why Not Start With TUN / Virtual NIC

Virtual NIC and TUN mode would make the product more powerful, but they also
move the project into a different risk class:

```text
driver installation
system network ownership
route table mutation
privileged service lifecycle
upgrade and rollback failures
EDR / antivirus false positives
support burden for broken networking
```

Those risks are not necessary for the first useful version. Because Clash/Mihomo
already handles routing, rule selection, and optional system proxy/TUN behavior,
the local agent can start as a loopback-only sidecar.

## Target Architecture

```text
Clash/Mihomo
  -> imports http://127.0.0.1:<agent-sub-port>/clash.yaml
  -> selects a local node emitted by the agent
  -> connects to 127.0.0.1:<agent-proxy-port>

Local Edge Agent
  -> authenticates device scope
  -> accepts local proxy traffic from Clash/Mihomo
  -> chooses a remote edge/channel policy
  -> transports traffic over platform-controlled protocol
  -> records local health and diagnostic summaries

Remote Edge
  -> authenticates agent/device session
  -> receives agent channel traffic
  -> performs remote outbound
  -> enforces tenant time / future traffic policy
  -> exports server-side health and accounting signals
```

## V1 Component Boundaries

### Local Subscription Server

Purpose:

```text
Return a local Clash/Mihomo YAML document that points to the local agent.
```

Rules:

```text
listen on 127.0.0.1 only
return only local loopback nodes
hide remote edge hostnames from Clash YAML where possible
avoid embedding tenant tokens in the YAML
support refresh without changing the imported local URL
```

Example shape:

```text
http://127.0.0.1:<agent-sub-port>/clash.yaml
```

The exact port is a local-agent runtime choice. It must not require public DNS
or production Nginx.

### Local Proxy Adapter

Purpose:

```text
Accept traffic from Clash/Mihomo and forward it over the selected platform
channel.
```

V1 can expose one or more local endpoints, such as:

```text
127.0.0.1:<agent-socks-port>
127.0.0.1:<agent-http-port>
```

The local endpoint is not the security boundary. Security is provided by:

```text
loopback-only binding
device credential
agent-to-edge authentication
server-side tenant entitlement checks
```

### Channel Manager

Purpose:

```text
Select and maintain the remote edge channel.
```

It should support:

```text
primary edge
secondary/canary edge
retry policy
health scoring
temporary quarantine of failing edge path
manual override for diagnostics
```

V1 should not attempt fully automatic global routing. It should provide enough
controlled fallback for the operator and one device.

### Device Identity Store

Purpose:

```text
Bind an installed agent to a device-scoped platform artifact.
```

V1 should avoid placing tenant tokens in local files. The agent may store:

```text
device id
artifact id or opaque bootstrap reference
device credential / refresh credential
local agent config
```

Local storage requirements:

```text
user-profile scoped
not committed to Git
not printed in logs
not included in support bundles without redaction
```

Windows DPAPI or an equivalent OS-backed secret store should be evaluated before
any production build.

### Diagnostics

Purpose:

```text
Make data-plane failures observable without exposing secrets.
```

V1 diagnostics should record summaries such as:

```text
remote edge selected
connect success/failure count
timeout count
last failure class
latency buckets
bytes by device session if available
agent version
```

Diagnostics must not record:

```text
raw subscription artifact URL
tenant token
remote secret
customer browsing URL
full target URL with query string
raw payload
```

## Remote Edge Responsibilities

The remote edge must become more than a raw Shadowsocks endpoint.

V1 remote-edge responsibilities:

```text
authenticate the local agent
terminate the platform-controlled channel
perform outbound proxying
support edge health checks
produce accounting-friendly summaries
allow controlled enable/disable by edge identity
```

Future remote-edge responsibilities:

```text
traffic accounting
quota enforcement
per-device session revocation
protocol rotation
multi-protocol channel support
abuse response
```

## Relationship To Existing Opaque Artifacts

Opaque artifacts remain useful, but their role changes.

Current model:

```text
Clash/Mihomo imports an opaque URL from production Nginx.
Server renders remote Shadowsocks nodes directly.
```

Agent model:

```text
Opaque artifact bootstraps the local agent.
Local agent serves the Clash/Mihomo subscription locally.
Clash/Mihomo sees loopback nodes.
The agent handles remote edge policy and transport.
```

This preserves the product direction:

```text
tenant token remains server-side
user-facing import remains opaque
device scope becomes meaningful
server can revoke or rotate device access
```

## Migration Strategy

Do not replace the current production subscription path immediately.

Recommended migration:

```text
Phase 0: design only
Phase 1: local prototype, no production activation
Phase 2: controlled operator-device canary
Phase 3: one production tenant canary
Phase 4: optional wider issuance
Phase 5: evaluate whether legacy remote-node YAML output can be retired
```

The current opaque artifact path and Subscription V2 renderer should remain
available during canary.

## Protocol Strategy

The objective is not to claim a channel is unblockable. The objective is to
make the channel platform-controlled and evolvable.

V1 protocol requirements:

```text
authenticated agent-to-edge session
encrypted transport
explicit version negotiation
keepalive and timeout signals
server-side revocation
clear telemetry boundaries
```

Future protocol options may include:

```text
TLS-based transport
WebSocket-based transport
HTTP/2 or HTTP/3 transport
pluggable channel profiles
protocol rotation by edge policy
```

The protocol layer must be designed separately before implementation. It should
not be hidden inside subscription rendering.

## Non-Goals For V1

V1 does not include:

```text
virtual NIC
TUN
kernel driver
system proxy mutation
WinINet / PAC mutation
route table mutation
public listening port
self-service portal
payment
full traffic quota enforcement
automatic carrier detection
automatic DPI bypass claims
all-user migration
legacy subscription route removal
```

## Risk Classification

Repository-only prototypes can be B-tier if they:

```text
do not touch production
do not change production subscription output
do not ship secrets
do not install services or drivers
do not modify system proxy
are covered by focused tests
```

Any real activation is A-tier if it touches:

```text
production edge servers
remote-edge protocol exposure
device credential issuance
production artifacts
tenant migration
Nginx / DNS / HTTPS
service installation
auto-update
traffic routing
quota enforcement
```

## First Implementation Slice

The first useful implementation should be deliberately small:

```text
local agent process
loopback-only subscription endpoint
loopback-only local proxy endpoint
static local Clash YAML pointing to the local proxy endpoint
single remote-edge channel profile
manual config file for dev only
basic health endpoint
redacted local diagnostics
unit tests for config, subscription generation, and secret redaction
```

This first slice should not be deployed to production. It should prove the
local sidecar boundary before any remote protocol or production canary work.

## Repository Prototype Status

The first repo-only skeleton now lives in:

```text
agent/local-edge-agent.mjs
agent/socks5-adapter.mjs
server/tests/local-edge-agent.test.mjs
server/tests/local-edge-socks-adapter.test.mjs
```

It implements only the local control surface:

```text
loopback-only config validation
local Clash/Mihomo YAML generation
foreground local agent app
GET /health
GET /clash.yaml
GET /diagnostics
redacted diagnostics summaries
standalone SOCKS5 CONNECT adapter with injected channel interface
fail-closed SOCKS5 behavior when the channel is unavailable
```

It deliberately does not implement:

```text
remote edge transport
HTTP proxy adapter
device credential storage
artifact bootstrap
Windows service installation
auto-update
system proxy changes
TUN / virtual NIC
production activation
```

The generated local Clash YAML points only to a loopback SOCKS5 endpoint and
does not expose remote edge hostnames, credentials, tenant tokens, or artifact
URLs. The SOCKS5 adapter is now a standalone module, but it requires an injected
channel implementation. The default foreground local agent still does not start
real traffic forwarding by itself, so this is not a usable traffic adapter until
a real agent-to-edge channel is added and wired into the agent runtime.

## Open Decisions

These decisions must be answered before implementation:

```text
implementation language and packaging model
local proxy protocol exposed to Clash/Mihomo
first agent-to-edge protocol profile
device credential storage mechanism
agent bootstrap flow from opaque artifact
local diagnostic format
remote edge API boundary
Windows service versus foreground/tray process
auto-update policy
support bundle redaction rules
```

## Recommended Next Step

Create an implementation plan for a local-only prototype:

```text
Risk: B / local prototype
No production activation
No system proxy mutation
No virtual NIC
No driver
No service installation
No production secrets
```

The prototype should validate the channel-adapter shape before the project
commits to a remote protocol or production migration.
