# Local Client Unit

Last updated: 2026-05-25, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: local_client_unit
  superseded_by: null
  last_verified_at: 2026-05-25
  production_authority: false
```

> Status:
> - Type: Active unit design
> - Risk: C for this document
> - Execution authority: Does not authorize code, AWS, DNS, Nginx, systemd,
>   production config, node, tenant, artifact, secret, deploy, cutover, system
>   proxy, driver, TUN, or public listener changes
> - Production impact: None
> - Source of truth for: local client responsibility boundaries and Local Edge
>   Agent client-side design ownership

## Purpose

The Local Client Unit owns the user-side access path from supported clients into
the platform-controlled network delivery model.

The default client boundary is:

```text
Clash/Mihomo remains the router and user-facing client.
Local Edge Agent is the loopback-only channel adapter direction.
Subscription Access Control remains the access authority.
Edge / Node Capacity remains the remote data-plane authority.
```

## Responsibilities

```text
Clash/Mihomo import and routing expectations
Local Edge Agent loopback adapter behavior
local generated Clash/Mihomo subscription shape
loopback-only local proxy endpoints
local diagnostics and redacted support signals
channel adapter behavior from local client to approved remote edge capability
fail-closed client behavior when no valid channel is available
client-side bootstrap consumption
local development profile boundaries
```

Design defaults:

```text
bind local agent listeners to 127.0.0.1 by default
emit local loopback nodes to Clash/Mihomo
avoid exposing remote edge credentials or tenant tokens in local YAML
fail closed when channel profile, bootstrap, or remote channel is unavailable
redact tokens, artifact URLs, credentials, raw targets, payloads, and customer
  URLs from diagnostics
```

## Explicit Non-Responsibilities

```text
commercial entitlement source of truth
plan, package, billing, renewal, or CRM logic
server-side token or opaque artifact authority
production node lifecycle
prod-edge-a / prod-edge-b / prod-edge-c promotion
Server Edge Mesh
HP Relay promotion
production remote-edge rollout
system proxy mutation unless separately approved
WinINet / PAC mutation
route table mutation
TUN driver, virtual NIC, or driver installation
public listener by default
production Nginx, DNS, systemd, or security group changes
```

## Inputs

```text
subscription access output
opaque or device-scoped bootstrap material
agent bootstrap material
approved remote-edge channel capabilities
approved edge identity and channel policy summaries
local runtime configuration for development-only profiles
operator diagnostic requests
```

## Outputs

```text
local Clash/Mihomo subscription expectations
local loopback proxy endpoint expectations
Local Edge Agent behavior contracts
redacted diagnostics summaries
client-side fail-closed behavior requirements
local prototype validation requirements
open decisions for client packaging and channel design
```

## Interfaces With Other Units

```text
Subscription Access Control:
  consumes access/bootstrap material
  does not create its own entitlement or token authority

Edge / Node Capacity:
  consumes approved remote-edge channel capabilities and health summaries
  does not decide production node lifecycle or promotion

Product Business:
  consumes supported client expectations and user journey requirements

Commercial / Entitlement:
  consumes only entitlement-derived access decisions through Subscription Access
  Control

Operator Lab:
  may consume HP Relay or channel-manager evidence after it is documented
  lab evidence does not become official runtime without separate design

Validation / CI:
  provides repository validation requirements for local-agent prototypes

Production Operations:
  required for real production activation, remote-edge exposure, node changes,
  Nginx/DNS/systemd/security-group changes, service installation, or rollout
```

## Current Repository Anchors

```text
docs/DOMAIN_UNIT_BOUNDARIES.md
docs/LOCAL_EDGE_AGENT_DESIGN.md
docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md
docs/VALIDATION_BASELINE.md
agent/local-edge-agent.mjs
agent/channel-profile.mjs
agent/diagnostics.mjs
agent/edge-tunnel.mjs
agent/socks5-adapter.mjs
server/tests/local-edge-agent.test.mjs
server/tests/local-edge-agent-runtime.test.mjs
server/tests/local-edge-channel-profile.test.mjs
server/tests/local-edge-tunnel.test.mjs
server/tests/local-edge-socks-adapter.test.mjs
```

Current prototype state is repository-only. It covers loopback subscription
generation, redacted diagnostics, local-development channel profiles, and
fail-closed behavior. It does not authorize production remote transport, device
credential issuance, service installation, system proxy mutation, TUN, virtual
NIC, or production activation.

## Risk And Validation

```text
Default risk:
  C for local client design docs
  B for repository-only Local Edge Agent prototype code with focused tests
  A for production activation, remote-edge protocol exposure, device credential
    issuance, service installation, system proxy mutation, TUN/driver work,
    traffic routing changes, node changes, Nginx/DNS/systemd/security-group
    changes, or production artifact/bootstrap migration

Docs-only validation:
  git diff --check origin/master...HEAD

Future code validation:
  git diff --check origin/master...HEAD
  npm test
```

## Next Tasks

```text
keep Local Client separate from Subscription Access Control and Edge / Node Capacity
define a narrow bootstrap contract between Subscription Access Control and Local
  Edge Agent
decide the first production-grade agent-to-edge protocol in a separate design
define local diagnostic support-bundle redaction rules
define packaging and installation boundaries before service/tray/auto-update work
add focused tests when local-agent behavior changes
```

## Paused / Blocked Items

```text
production Local Edge Agent activation
device credential issuance for production tenants
production remote-edge transport
system proxy mutation
WinINet / PAC mutation
TUN or virtual NIC
driver installation
Windows service installation
auto-update
public listener
HP Relay promotion into official runtime
Server Edge Mesh use as client transport
legacy subscription route retirement
```
