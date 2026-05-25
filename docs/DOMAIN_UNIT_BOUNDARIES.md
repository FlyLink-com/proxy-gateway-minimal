# Domain Unit Boundaries

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Active architecture boundary
> - Risk: C for this document
> - Execution authority: Does not authorize code, commercial system, billing,
>   CI host, AWS, DNS, Nginx, HTTPS, production config, node, tenant, secret,
>   SQLite, deploy, or cutover changes
> - Production impact: None
> - Source of truth for: separating product business, commercial entitlement,
>   subscription access, nodes, local client, validation, operator lab, and
>   production operations responsibilities

## Purpose

The project is no longer only a minimal subscription gateway. It now has
multiple domains that must stay separate:

```text
product business
commercial entitlement
subscription access control
edge / node capacity
local client adapter
validation / CI
operator lab
production operations
```

Do not collapse these into one "subscription management" bucket. Each unit
should own one kind of decision, expose a narrow interface, and avoid reaching
into another unit's state.

## Core Decision

Use domain units as the first sorting layer before choosing a risk tier, branch,
PR scope, test matrix, or agent task packet.

```text
Business is business.
Commercial is commercial.
Nodes are nodes.
Validation proves repository quality.
Operator lab produces research evidence.
Production operations execute gated external changes.
```

A later system may integrate these units, but integration should happen through
explicit interfaces, not by sharing secrets, databases, node configs, or
runtime assumptions.

## Unit Map

### 1. Product Business Unit

Owns the user-facing product promise:

```text
what service the user receives
subscription/import experience
device and local-agent user journey
supported client expectations
operator-visible product workflows
```

Consumes:

```text
commercial entitlement summaries
subscription access capabilities
edge capacity status
validation evidence
operator feedback
```

Produces:

```text
product requirements
user-facing behavior decisions
workflow priorities
acceptance criteria
```

Does not own:

```text
orders or payments
production node config
edge mesh membership
CI execution
AWS or DNS mutation
```

### 2. Commercial / Entitlement Unit

Owns commercial rights and limits:

```text
plan or package definition
validity window
quota or traffic entitlement
renewal and expiration policy
order / payment status when such systems exist
customer commercial status
```

Produces an entitlement decision, not a network route:

```text
subject may use the service
entitlement is active / expired / disabled
time limit
quota limit
commercial flags needed by product and access control
```

Does not own:

```text
Subscription V2 YAML rendering
opaque artifact storage
tenant token hashing
node health
edge listener ports
Clash/Mihomo config details
```

Current repository state:

```text
No full commercial system exists in this repo.
Existing subscription expiry/status logic is a technical access model, not a
complete billing or CRM system.
```

### 3. Subscription Access Control Unit

Owns the technical access boundary between business/commercial decisions and
network delivery:

```text
server-side subscription state
opaque artifact issuance and validation
token hashing and visible-once token behavior
device bootstrap records when implemented
Subscription V2 rendering
Admin API for access operations
subscription access audit boundaries
```

Consumes:

```text
product requirements
commercial entitlement decisions
approved edge inventory
operator actions
```

Produces:

```text
safe subscription output
opaque artifact responses
local-agent bootstrap material
node policy for delivery
operator summaries without raw secrets
```

Does not own:

```text
payment collection
edge-node runtime implementation
HP Relay experiment state
manual CI host lifecycle
production deployment approval
```

Current repository anchor:

```text
server/services/subscriptions/*
server/routes/subscription.mjs
server/routes/admin-subscriptions.mjs
server/services/clash-subscription.mjs
```

### 4. Edge / Node Capacity Unit

Owns data-plane capacity:

```text
prod-edge-a / prod-edge-b / future prod-edge-c roles
node identity and naming
approved listener set
edge health and readiness
upstream path research when promoted out of lab
maintenance mode
edge-level counters safe for diagnostics
private mesh membership when approved
```

Produces:

```text
capacity status
health summaries
approved edge endpoints
rollback / replacement evidence
```

Does not own:

```text
customer commercial status
tenant token authority
opaque artifact authority
Admin UI exposure
subscription DB authority
billing decisions
```

Any real production node, DNS, Nginx, systemd, security group, edge mesh, or
node config change remains Risk A.

### 5. Local Client Unit

Owns the user's local access path:

```text
Clash/Mihomo import and routing expectations
Local Edge Agent loopback adapter
local diagnostics
channel adapter behavior
fail-closed client-side behavior
```

Consumes:

```text
subscription access output
agent bootstrap material
approved remote-edge channel capabilities
```

Does not own:

```text
commercial entitlement source of truth
production node lifecycle
server edge mesh
HP Relay promotion
system proxy mutation unless a separate design approves it
TUN driver or public listener by default
```

Current repository anchor:

```text
agent/*
server/tests/local-edge-*.mjs
docs/LOCAL_EDGE_AGENT_DESIGN.md
```

### 6. Validation / CI Unit

Owns repository validation evidence:

```text
local focused tests
npm test
Admin tests and build
GitHub Actions when available
Aliyun manual CI fallback while GitHub-hosted Actions is blocked
validation records
```

Produces:

```text
repository-quality evidence
clean-environment validation evidence
failure logs with secrets redacted
```

Does not own:

```text
staging approval
production approval
deploy permission
AWS mutation
tenant mutation
node promotion
```

Manual CI is a fallback validation path, not staging and not production.

### 7. Operator Lab Unit

Owns experiments and field research:

```text
HP Relay diagnostics
local path testing
upstream behavior research
channel-manager evidence
network-route experiments
operator-only troubleshooting
```

Produces:

```text
research notes
candidate hypotheses
test evidence that may inform later designs
```

Does not own:

```text
CI
staging
production
prod-edge-c
official Local Edge Agent runtime
customer traffic service
server edge mesh membership
```

Promotion from operator lab into product, node, or production work requires a
separate design and the appropriate risk gate.

### 8. Production Operations Unit

Owns gated external state changes:

```text
AWS resources
DNS
Nginx
HTTPS
systemd
SQLite backup / restore
production runtime config
production tenant or artifact state
node lifecycle
rollback and execution records
```

Consumes:

```text
approved runbooks
read-only inventory
operator approval
validation evidence
rollback plans
```

Produces:

```text
execution records
verified production state changes
rollback evidence
incident or closeout records
```

Does not own:

```text
product pricing
commercial package design
repository-only architecture decisions
operator lab experiments unless explicitly promoted
```

Production operations are always serialized when they mutate external state.

## Cross-Unit Flow

The normal conceptual flow is:

```text
Product Business
  defines the user-facing promise

Commercial / Entitlement
  decides whether the subject has rights to use the service

Subscription Access Control
  turns entitlement and policy into safe technical access

Delivery / Local Client
  imports, bootstraps, and presents the access path to the user

Edge / Node Capacity
  carries data-plane traffic through approved nodes

Validation / CI
  proves repository changes before merge or handoff

Production Operations
  executes approved external changes with rollback

Operator Lab
  supplies research evidence without becoming a runtime authority
```

## Interface Rules

Use these rules when designing future code, docs, or task packets:

```text
Business may request capabilities; it must not edit node config directly.
Commercial may produce entitlement; it must not render Clash YAML directly.
Subscription Access may render access; it must not collect payment.
Nodes may report capacity; they must not decide customer rights.
Local Client may adapt traffic; it must not become subscription authority.
CI may validate commits; it must not approve deployment.
Operator Lab may produce evidence; it must not become production by accident.
Production Ops may execute approved changes; it must not rewrite product scope.
```

## Planning Matrix

| Question | Primary unit | Typical risk |
| --- | --- | --- |
| What should users experience? | Product Business | C/B unless code changes |
| What did the user buy or renew? | Commercial / Entitlement | C for design, A/B once integrated |
| Is this subject allowed to refresh/import? | Subscription Access Control | B, A if production semantics change |
| What YAML or artifact is returned? | Subscription Access Control | B, A if production output changes |
| Which server carries traffic? | Edge / Node Capacity | A for production |
| How does the local app connect? | Local Client | B, A if device/runtime activation |
| Did the repo pass checks? | Validation / CI | C/B |
| Can HP test a path? | Operator Lab | local experiment unless promoted |
| Should DNS/Nginx/systemd/SQLite change? | Production Operations | A |

## Anti-Collapse Rules

Do not make these category mistakes:

```text
Do not treat a node as a customer package.
Do not treat a commercial plan as a node selector.
Do not treat an opaque artifact as billing proof.
Do not treat HP Relay as CI, staging, production, or prod-edge-c.
Do not treat Aliyun manual CI as staging or deploy approval.
Do not treat Server Edge Mesh as user VPN or customer data routing.
Do not treat Local Edge Agent as a replacement for Clash/Mihomo UI in V1.
Do not treat repository docs as production inventory.
```

## Relationship To Existing Docs

```text
docs/units/README.md:
  per-unit design index and standard unit template

docs/PROJECT_OPERATING_MODEL.md:
  workflow layers, lanes, PR cadence, and risk tiers

docs/PROJECT_SIMPLIFICATION_MAP.md:
  cleanup map and active product spine

docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md:
  control-plane and edge-node split

docs/LOCAL_EDGE_AGENT_DESIGN.md:
  local client adapter design

docs/SERVER_EDGE_MESH_DESIGN.md:
  private edge management and recovery architecture

docs/CI_MANUAL_VALIDATION.md:
  manual CI fallback workflow
```

If a future design conflicts with this document, update the boundary first or
state the exception explicitly in the approved design.

## Non-Goals

This document does not authorize or implement:

```text
billing system
CRM
package catalog
commercial payment integration
new repository code
production node changes
DNS / Nginx / HTTPS / systemd changes
SQLite migration
artifact expansion
legacy query-token retirement
HP Relay promotion
WireGuard setup
self-hosted runner registration
```

## Recommended Next Step

Use this boundary before the next major task split:

```text
1. Assign every new task to exactly one primary unit.
2. List secondary impacted units only when they have a real interface.
3. Keep commercial entitlement design separate from subscription access code.
4. Keep edge-node work separate from user package or business workflow work.
5. Keep HP Relay as operator lab evidence unless a promotion design is approved.
```
