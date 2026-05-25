# Server Edge Mesh Design

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Active design proposal
> - Risk: C for this document, A for any server mesh creation, WireGuard
>   configuration, firewall change, routing change, production config change,
>   secret distribution, or traffic migration
> - Execution authority: Does not authorize cloud mutation, WireGuard setup,
>   DNS changes, security-group changes, Nginx changes, systemd changes,
>   production config changes, secret copying, SQLite copying, user-traffic
>   routing, or cutover
> - Production impact: None until separately approved
> - Source of truth for: the proposed server-side private edge mesh direction

## Purpose

The current production direction separates three concerns:

```text
subscription gateway:
  stable user refresh entry and opaque artifact delivery

subscription control plane:
  authoritative subscription state, artifact state, Admin, and rendering

local edge agent:
  future loopback-only client-side channel adapter

production edge fleet:
  prod-edge-a primary, prod-edge-b iteration/canary, prod-edge-c recovery slot
```

This document defines a fourth layer: a server-side private edge mesh. The mesh
is an operator-controlled network between edge servers. Its first job is to make
edge health, management, validation, and recovery traffic less dependent on each
server's public path.

The mesh is not a user-facing VPN product in V1.

## Core Decision

Use a server-side private mesh as production infrastructure, not as the first
client product surface.

Recommended V1 posture:

```text
prod-edge-a / prod-edge-b / future prod-edge-c
  -> private mesh interface
  -> edge health and management traffic
  -> controlled recovery and validation paths
```

V1 should not:

```text
route ordinary customer proxy traffic through the mesh
expose mesh endpoints to users
make Clash/Mihomo connect to the mesh
replace subscription rendering
replace Local Edge Agent
create automatic failover
claim DPI bypass or unblockable routing
```

V1 should:

```text
provide private server-to-server reachability
support edge health checks over private paths
support controlled service validation from one edge to another
support future service registry and edge status collection
avoid recording secrets or private keys in Git
remain optional until an explicit Risk A execution approval
```

## Relationship To Other Components

### Local Edge Agent

`docs/LOCAL_EDGE_AGENT_DESIGN.md` defines the client-side channel adapter. The
server mesh is complementary:

```text
Local Edge Agent:
  local device side
  loopback-only V1
  selected remote channel policy

Server Edge Mesh:
  server side
  private edge-to-edge reachability
  health, management, validation, and future routing support
```

The local agent should not require direct access to the private mesh in V1. If a
future local-agent protocol uses a mesh-backed gateway, that must be designed as
a separate production channel profile.

### Production Edge Fleet

`docs/PRODUCTION_EDGE_FLEET.md` defines the provider-neutral edge slots:

```text
prod-edge-a: current primary slot
prod-edge-b: iteration/canary secondary slot
prod-edge-c: future recovery/standby slot
```

The mesh should use these provider-neutral identities. Cloud provider names,
instance IDs, and public IPs belong in restricted inventory or execution
records, not in durable mesh identity.

### Subscription Control / Edge Split

`docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md` defines the target split
between subscription authority and edge capacity:

```text
sub-control-a / future sub-control-b:
  subscription state, artifacts, Admin, rendering, backup / restore authority

prod-edge-a / prod-edge-b / prod-edge-c:
  edge data-plane traffic and health / readiness reporting
```

The mesh belongs to the edge and operations side of that split. It can support
edge health and recovery, but it does not make edge nodes subscription
authorities.

### Subscription V2 And Opaque Artifacts

The mesh does not change the user subscription URL, tenant token model, or
opaque artifact design.

Current user-facing contract remains:

```text
user imports an approved subscription artifact
server renders dynamic Subscription V2 YAML
Clash/Mihomo connects to emitted nodes
```

The mesh can later improve how edge nodes are observed, validated, or promoted,
but it does not by itself change generated YAML.

## Candidate Technology

WireGuard is the preferred first candidate for the private server mesh because
it is small, widely deployed, and operationally understandable.

This document does not approve WireGuard installation or key generation.

Any future WireGuard execution record must define:

```text
node identity
private address range
peer list
allowed IPs
firewall rules
key generation and storage boundary
systemd lifecycle
rollback steps
validation commands
```

No WireGuard private key, preshared key, production `.env`, cloud credential,
SQLite database, subscription URL, tenant token, or customer data may be stored
in GitHub.

## V1 Mesh Scope

### Allowed Traffic

V1 mesh traffic should be limited to operator and platform control functions:

```text
edge health checks
service readiness checks
private API health probes
SQLite backup-transfer drills only when separately approved
deployment validation from one edge to another
future service registry heartbeats
future edge status publication
```

If SSH over mesh is ever allowed, it must be explicitly approved and recorded.
It should not silently replace the current public SSH security-group model.

### Disallowed Traffic

V1 must not carry:

```text
ordinary customer web/proxy traffic
Clash/Mihomo client traffic
opaque subscription artifact refresh traffic
public subscription gateway traffic
Admin UI public exposure
unapproved database replication
unapproved secret synchronization
auto-failover control
```

Those would move the mesh from an infrastructure control path into the product
data plane, which is a separate A-tier design and execution track.

## Proposed Topology

```text
prod-edge-a
  public: sub.globalcirclecat.com / ss-sg.globalcirclecat.com
  private mesh: edge-a mesh address

prod-edge-b
  public: iteration/canary node path
  private mesh: edge-b mesh address

prod-edge-c
  public: none until approved
  private mesh: edge-c mesh address after approved provisioning
```

Mesh addresses should use a dedicated private range that is not already used by
provider VPCs, local operator networks, or common VPN defaults.

The exact range is an open decision. Do not use this document as an implicit
allocation.

## Service Registry Direction

After a private mesh exists, the platform can add a small service registry
without adding a distributed database.

Recommended model:

```text
each edge publishes a signed or authenticated local status summary
the primary control plane reads status summaries over the private mesh
operators can compare public-path health and mesh-path health
Subscription V2 output remains explicit and operator-approved
```

Registry data should be low-risk operational state:

```text
edge id
agent/server version
service active states
public endpoint health summary
mesh endpoint health summary
last validation timestamp
maintenance mode flag
```

Registry data should not include:

```text
tenant tokens
opaque artifact values
SS_PASSWORD
CONSOLE_TOKEN
SQLite row contents
customer destination URLs
raw access logs
private keys
```

## Traffic Accounting Relationship

The mesh is not a complete traffic-accounting solution.

It may help collect server-side summaries, but user proxy traffic currently
goes through Shadowsocks data-plane nodes. Accurate tenant-level traffic
accounting still requires a separate data-plane design.

Mesh V1 may record:

```text
edge-level service health
edge-level connectivity
optional node-level byte counters if exposed safely
```

Mesh V1 must not claim:

```text
tenant-level quota enforcement
device-level traffic billing
automatic abuse detection
data-plane blocking for cached YAML users
```

## Security Boundaries

Required security rules:

```text
mesh interfaces are private only
mesh UDP port exposure is restricted to approved peers where possible
peer keys are generated on trusted hosts or approved operator machines
private keys never enter GitHub, PRs, docs, chat, CI logs, or support bundles
mesh access does not bypass Bearer auth for protected application APIs
Admin UI remains non-public
3456, 18180, and 1080 remain non-public
```

The mesh should reduce dependency on public paths for operator validation. It
must not become an unguarded management bypass.

## Rollout Strategy

### Phase 0: Design Only

This document.

No production mutation.

### Phase 1: Read-Only Inventory

Collect current facts before any mesh setup:

```text
prod-edge-a OS/kernel/network state
prod-edge-b OS/kernel/network state
candidate private CIDR conflicts
security-group posture
existing UDP exposure
systemd availability
WireGuard package availability
rollback constraints
```

### Phase 2: Single-Pair Mesh Canary

Create a mesh only between `prod-edge-a` and `prod-edge-b`.

Allowed validation:

```text
mesh ping or TCP health over private address
service health check from a to b and b to a
no customer traffic
no subscription output change
no DNS change
```

### Phase 3: Operational Health Channel

Use the mesh for structured health and readiness summaries.

No automatic failover.

### Phase 4: Recovery Drill

Use the mesh to support an approved backup-transfer or restore drill.

This remains A-tier and requires separate backup, restore, validation, and
cleanup records.

### Phase 5: Optional Product Data-Plane Research

Only after V1 is stable, evaluate whether any user traffic should use a
mesh-backed channel.

This is not part of V1.

## Validation Expectations

Any execution PR or record must include:

```text
target nodes
mesh address plan
peer identity list
package and kernel readiness
firewall/security-group delta
service lifecycle commands
private-path health checks
public-path non-regression checks
rollback commands
secret handling statement
```

For V1, successful validation means:

```text
private edge-to-edge health works
public subscription gateway is unchanged
public Shadowsocks behavior is unchanged
Subscription V2 output is unchanged
no customer traffic is moved
no secrets are recorded
```

## Non-Goals For V1

V1 does not include:

```text
client VPN
user-facing WireGuard profiles
Clash/Mihomo WireGuard nodes
TUN or virtual NIC on user devices
automatic failover
active-active database replication
distributed SQLite
traffic quota enforcement
tenant-level accounting
opaque artifact migration
legacy query-token route removal
DNS cutover
Nginx changes
prod-edge-c live creation
```

## Risk Classification

This design document is C-tier.

Repository-only scripts or templates can be B-tier only if they:

```text
do not contain real keys
do not touch production
do not open ports
do not start services
do not change node config
do not move traffic
```

Any real mesh setup is A-tier because it touches:

```text
production edge hosts
network interfaces
firewall/security-group posture
service lifecycle
private key material
operator access paths
future recovery behavior
```

## Open Decisions

Before implementation, decide:

```text
1. WireGuard versus another private mesh technology.
2. Private mesh CIDR and per-edge addressing.
3. Whether peer exposure uses public IP allowlists or provider-private paths.
4. Whether mesh SSH is allowed, and under what approval boundary.
5. How mesh keys are generated, backed up, rotated, and revoked.
6. Whether prod-edge-b remains the first peer or should be rebuilt first.
7. Whether prod-edge-c should remain build-material-only before joining mesh.
8. What health summary format is safe to collect.
9. Who can approve mesh recovery drills.
10. Whether any future Local Edge Agent channel may terminate on a mesh-backed gateway.
```

## Recommended Next Step

Create a read-only server mesh preflight record:

```text
Branch: ops/server-edge-mesh-preflight
Risk: A / read-only production network preflight
Goal: determine whether prod-edge-a and prod-edge-b are ready for a private
      server mesh canary
Production impact: read-only only
Validation: git diff --check origin/master...HEAD
```

The preflight should not install WireGuard, generate keys, open UDP ports,
change security groups, start services, change DNS, change Nginx, change
Subscription V2 output, move traffic, or copy secrets.
