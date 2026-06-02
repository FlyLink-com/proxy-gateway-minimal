# Subscription Control Plane New Server Runbook

Last updated: 2026-06-01, Asia/Shanghai.

> Status:
> - Type: Active Risk A runbook
> - Risk: A
> - Execution authority: Does not authorize cloud provisioning, DNS changes,
>   Nginx changes, HTTPS issuance, systemd changes, SQLite restore, secret
>   movement, artifact expansion, production promotion, traffic cutover, or
>   edge-node lifecycle changes by itself
> - Production impact: None unless a later execution record is separately
>   approved
> - Source of truth for: using a clean new server as the fallback candidate
>   environment for the future subscription control plane if the Aliyun
>   control-plane path is rejected

## Purpose

The current preferred physical split path is documented in
`docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`: move CI to local Linux, then
evaluate the current Aliyun server as the future production subscription
control-plane candidate.

This clean new-server runbook remains active as the fallback path if the
Aliyun candidate is rejected by inventory, cleanup, security, operational
ownership, or capacity gates. It is still not the operator lab / HP relay and
not an edge data-plane server.

The narrow goal is:

```text
Create and validate a clean `sub-control-a` candidate server that can become
the subscription control-plane authority in a later separately approved phase
when the Aliyun candidate path is not acceptable.
```

This runbook is intentionally conservative. It treats the new server as a
candidate environment until promotion is separately approved.

## Required Approval Phrase

No command that creates or mutates cloud, DNS, Nginx, HTTPS, systemd, runtime
config, SQLite, secrets, artifacts, tenants, security groups, or node lifecycle
may be executed until the operator gives this exact approval:

```text
Approve clean sub-control-a candidate provisioning. No DNS change, no user traffic, no edge traffic, no production authority, no cutover.
```

This approval only covers creating and validating a clean candidate described
by this runbook. It does not approve:

```text
sub.globalcirclecat.com DNS changes
ss-sg.globalcirclecat.com DNS changes
production subscription output changes
legacy query-token retirement
broader opaque artifact issuance
tenant migration
production SQLite authority transfer
Admin UI public exposure
prod-edge-a or prod-edge-b lifecycle changes
prod-edge-c creation
WireGuard setup
Server Edge Mesh membership
Local Edge Agent production transport
customer traffic over the new server
```

## Not Performed Boundary

Unless a later execution record has exact A-tier approval and records matching
validation evidence, this runbook has not performed:

```text
cloud provisioning
DNS, Nginx, HTTPS, systemd, security-group, or firewall mutation
production secret, SQLite, tenant, artifact, or subscription-output movement
production authority transfer
customer traffic routing
promotion, cutover, or edge-node lifecycle changes
```

## Target Role

The new server role is:

```text
sub-control-a-candidate:
  clean candidate for future subscription control-plane authority
  runs proxy-gateway app for validation
  can validate Admin/API/subscription behavior through private operator access
  can validate artifact and subscription rendering from approved state copies
  does not run Shadowsocks data-plane service
  does not appear as a Clash/Mihomo proxy node
  does not receive production DNS
  does not own production SQLite authority until separately approved
```

The existing edge roles remain separate:

```text
prod-edge-a:
  current production co-located host and active primary edge slot

prod-edge-b:
  current iteration/canary secondary edge slot

prod-edge-c:
  future recovery / standby edge slot, not created by this runbook
```

## Architecture Boundary

The candidate server belongs to the subscription control plane:

```text
subscription access state
opaque artifact validation
Subscription V2 rendering
Admin API behind private operator access
edge inventory and node policy rendering
backup / restore validation
```

It must not absorb edge data-plane responsibilities:

```text
no customer proxy traffic
no Shadowsocks listener
no node entry in generated subscriptions
no Server Edge Mesh membership by default
no HP relay role
no CI host role
```

This keeps the split explicit:

```text
sub-control-a-candidate decides and renders allowed nodes.
prod-edge-* nodes carry proxy traffic.
```

## Prerequisites

Before provisioning, collect read-only inventory and record it in a new
execution record under `docs/production-replacement-records/` or another
approved production-ops record path:

```text
current production DNS records for sub.globalcirclecat.com and ss-sg.globalcirclecat.com
current prod-edge-a instance identity, public IP, private IP, and security group
current prod-edge-b carrying instance identity, public IP, private IP, and security group
current production service health and public endpoint behavior
current active production DB path from runtime config, without printing DB content
current backup location and latest backup timestamp, without copying backup into Git
current Nginx public boundary behavior
current Git commit intended for candidate deployment
current CI/manual CI validation evidence
```

Sensitive values must be described by location and verification result only.
Do not paste raw tokens, subscription URLs, private keys, passwords, `.env`
content, SQLite rows, customer data, or generated subscription YAML into chat,
docs, PRs, or CI logs.

## Preflight Check

Every execution must complete a fresh read-only preflight before any cloud,
host, DNS, Nginx, HTTPS, systemd, runtime-config, SQLite, secret, artifact,
tenant, security-group, or lifecycle mutation. The preflight record is required
to state:

```text
Risk: A / read-only
Mutation: none
Current production DNS and endpoint behavior: verified
Current production service, DB path, backup timestamp, and Nginx boundary: verified
Candidate commit and validation evidence: recorded
Secrets/customer data: not printed or copied into Git
Rollback/disposal owner: named
```

If any preflight fact is stale, missing, or inconsistent with the approval
phrase, stop before provisioning or mutation.

## Candidate Provisioning Scope

The candidate should be created as a clean server with a minimal surface:

```text
SSH:
  allowed only from the approved operator source

HTTP / HTTPS:
  closed by default unless a validation phase explicitly approves public
  boundary testing

Admin/API app port:
  loopback-only

Edge data-plane ports:
  closed

WireGuard / mesh UDP:
  closed
```

Required software baseline:

```text
Ubuntu LTS
Node.js 22
npm compatible with the repository lockfiles
git only if needed for checkout or archive unpacking
sqlite3 tooling for integrity validation
Nginx only if public boundary validation is explicitly approved
systemd service files only after service execution is approved
```

The candidate must be built from repository artifacts and approved runtime
configuration. Do not copy production `.env` or database files into the
repository, PR, or CI workspace.

## Phased Gates

### Phase 0: Repository Readiness

Validate the repository before any external mutation:

```text
npm run project-state:check
npm test
npm run admin:test
npm run admin:build
manual CI on the approved validation host when GitHub-hosted Actions is blocked
```

Passing repository validation is required evidence, but it is not production
approval.

### Phase 1: Read-Only Inventory

Collect live facts without mutation:

```text
AWS instance and security-group inventory
DNS inventory
prod-edge-a service and endpoint health
prod-edge-b carrying-instance service and endpoint health
production SQLite path and integrity status
backup freshness status
current public gateway allow/deny behavior
```

Stop if inventory contradicts the documented production snapshot.

### Phase 2: Clean Candidate Creation

After exact approval, create the clean candidate server and candidate security
group. The first acceptable state is:

```text
server exists
SSH works from approved operator source
no production DNS points to it
no user traffic reaches it
no edge data-plane ports are open
no production secrets have been copied
```

Record provider identity, region, instance size, public IP, private IP,
security group, image, tags, and creation time in the execution record.

### Phase 3: Candidate App Bootstrap

Install and validate the application runtime without production authority:

```text
Node.js 22 present
repository artifact deployed
npm ci passed
npm test passed on candidate or before artifact transfer
proxy-gateway app can start on loopback
/api/health returns healthy locally
Admin routes require auth locally
public Admin remains unavailable
```

Do not start Shadowsocks or any edge data-plane service on this candidate.

### Phase 4: State Copy Validation

Only after separate approval for state handling, validate with an approved copy
of production subscription state:

```text
fresh backup exists
backup transfer path is private
SQLite integrity check passes before restore
candidate restore is performed into candidate-only storage
candidate app reads restored state
subscription rendering works through private operator validation
artifact validation works through private operator validation
no raw URLs or tokens are printed
```

This phase still does not transfer production authority.

### Phase 5: Candidate Public Boundary Validation

Only if explicitly approved, validate a public Nginx boundary on the candidate
without production DNS:

```text
public /api/health behaves as expected
public Admin routes remain blocked
public subscription routes follow the approved candidate-only access model
logs redact sensitive request data
HTTP/HTTPS behavior is recorded
```

Do not point `sub.globalcirclecat.com` at the candidate in this phase.

### Phase 6: Promotion Decision

Promotion to real `sub-control-a` authority is a separate Risk A decision. It
requires a new promotion record covering:

```text
data authority source
final backup and restore steps
Nginx public boundary
DNS or gateway routing strategy
edge inventory source
rollback path to current prod-edge-a co-located authority
client subscription refresh validation
opaque artifact validation
operator approval
```

No promotion is implied by a healthy candidate.

## Hard Stop Rules

Stop immediately if any of these are true:

```text
live inventory does not match the approved execution record
the target host would receive production DNS before promotion approval
security group would expose Admin, app loopback port, Shadowsocks, or mesh UDP publicly
the candidate would run ss-server or appear as a subscription node
package install would remove or upgrade unrelated critical packages
production service health is degraded before mutation
SQLite integrity check fails before state handling
backup freshness cannot be proven
logs would expose token, subscription URL, password, private key, .env, SQLite content, or customer data
operator approval phrase is missing or different
rollback path is not written before promotion
```

## Validation Checklist

Repository validation:

```text
npm run project-state:check
npm test
npm run admin:test
npm run admin:build
git diff --check origin/master...HEAD
```

Candidate validation:

```text
hostname and OS recorded
Node.js 22 recorded
app loopback health passes
Admin auth boundary passes
public Admin exposure remains blocked if Nginx is installed
SQLite integrity passes if state is restored
artifact and subscription behavior validated without printing raw secrets
no edge data-plane listener is active
no production DNS points to the candidate
```

Promotion validation, if a later runbook approves it:

```text
pre-promotion backup recorded
post-promotion public subscription refresh passes
opaque artifact refresh passes
edge data-plane traffic still exits through prod-edge-* nodes
rollback command path verified
execution record updated
```

## Rollback And Disposal

Before promotion, rollback means disposal or parking of the candidate:

```text
stop candidate services
remove candidate-only restored state if no longer needed
close candidate security-group ingress
terminate candidate only after separate approval when it contains production-derived state
record cleanup evidence
```

After promotion, rollback must be defined by the separate promotion runbook. It
must include restoring `prod-edge-a` or another approved host as the
subscription control-plane authority.

## Relationship To Other Work

```text
docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md:
  target control-plane / edge-data-plane split

docs/PRODUCTION_EDGE_FLEET.md:
  edge data-plane slots; the new control-plane candidate is not prod-edge-c

docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md:
  preferred target split for current Aliyun subscription control, local Linux
  manual CI, and controlled non-Aliyun node drain / retirement

docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md:
  latest business split for Aliyun user management / subscription distribution,
  HP validation/lab, and non-Aliyun node retirement gates

docs/SUBSCRIPTION_OPAQUE_ACCESS_MODEL_GAP.md:
  opaque artifact rollout gaps; this runbook does not expand issuance

docs/CI_MANUAL_VALIDATION.md:
  manual CI fallback; the new server is not the CI host

docs/SERVER_EDGE_MESH_WIREGUARD_CANARY_RUNBOOK.md:
  private server mesh canary; not part of this candidate by default
```

## Non-Goals

This runbook does not authorize or perform:

```text
production DNS change
production traffic cutover
legacy query-token retirement
new customer-facing URL shape
broader opaque artifact issuance
tenant migration
payment / entitlement integration
edge-node lifecycle change
prod-edge-c creation
WireGuard installation
Local Edge Agent production transport
self-hosted CI runner setup
```

## Recommended Next Step

Use `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md` first. Return to this
runbook only if the Aliyun candidate path is rejected or explicitly paused.
The first fallback execution should be Phase 1 read-only inventory plus a
candidate provisioning approval request, not DNS, traffic, tenant, or
edge-node mutation.
