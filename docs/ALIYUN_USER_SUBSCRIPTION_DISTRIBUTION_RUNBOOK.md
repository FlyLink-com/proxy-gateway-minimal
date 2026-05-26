# Aliyun User Management / Subscription Distribution Runbook

Last updated: 2026-05-26, Asia/Shanghai.

> Status:
> - Type: Active architecture and Risk A runbook
> - Risk: C for this document; A for any Aliyun, HP, AWS, DNS, Nginx,
>   systemd, firewall, security-group, SQLite, secret, artifact, tenant,
>   node-output, traffic, stop, termination, or cutover mutation
> - Execution authority: Does not authorize cleanup, deploy, DNS migration,
>   production authority transfer, node shutdown, termination, or security-group
>   deletion by itself
> - Production impact: None
> - Source of truth for: the near-term business split where Aliyun owns the
>   user-management and subscription-distribution platform, HP remains
>   validation/operator lab, and non-Aliyun nodes enter a separate controlled
>   retirement queue

## Business Decision

The near-term infrastructure split is:

```text
Aliyun:
  user management / subscription distribution platform
  future sub-control-a candidate

HP:
  local Linux manual CI
  operator lab and network research

all other nodes:
  drain and retire through separate explicit Risk A gates
```

The separate technical MVP branch owns new transport/channel capability work.
That branch should not be coupled to this management/distribution platform
until both tracks have their own validation evidence and an explicit
integration gate.

Current technical MVP branch observed during this runbook creation:

```text
PR: #129
Branch: codex/local-edge-channel-probe-harness
Purpose: local edge channel probe / benchmark / manager work
Status: open draft, mergeable at the time of read-only check
```

## Meaning Of User Management / Subscription Distribution

In this project, the Aliyun platform is deliberately small:

```text
user / tenant records
subscription lifecycle management
opaque artifact issuance and validation
Subscription V2 rendering
subscription and channel policy distribution
private Admin API
SQLite subscription and artifact authority until another approved store exists
backup and restore responsibility
Nginx public subscription boundary after approval
```

It does not mean:

```text
general proxy data-plane node
manual CI host
HP operator lab
new transport MVP implementation branch
public Admin UI
user VPN
automatic traffic failover
unapproved WireGuard mesh
edge-node lifecycle owner
```

## MVP Scope

The first Aliyun platform build should stay intentionally small:

```text
private operator/Admin access
user or tenant record management
subscription lifecycle management
opaque artifact issuance and validation
Subscription V2 rendering
public subscription distribution endpoint after promotion approval
backup and restore procedure for the subscription database
```

Explicitly defer:

```text
payment / billing / CRM workflows
automatic node health routing
transport protocol experiments
edge-node lifecycle management
multi-region control plane
distributed database
public Admin UI
self-hosted CI
```

This is a management and distribution platform, not a new networking stack.

## Repository Implementation Status

Repository-only platform work has started without production authority:

```text
private Admin subscriptions workflow: implemented
customer-facing user portal MVP shell: implemented in repository only
Subscription V2 renderer: implemented
opaque artifact issue / refresh / rotate / revoke contracts: implemented
overview distribution readiness summary: implemented for configured inventory
public registration/auth model: not approved
runtime promotion to Aliyun: not approved
production state copy to Aliyun: not completed
DNS or public traffic migration: not approved
```

## Current Read-Only Facts

These facts were refreshed read-only on 2026-05-26. They are drift-prone and
must be refreshed again before any A-tier mutation.

Aliyun SWAS:

```text
Instance id: 3e9253d3fb044463b876edacf6af8784
Public IP: 47.251.178.125
Private IP: 172.18.54.13
Region: us-west-1
Status: Running
Spec: 2 CPU, 2 GiB memory, 40 GiB disk, 200 Mbps bandwidth
Documented inventory:
  docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup-inventory.md
```

HP:

```text
Host: hp-server
Role: local-ci-a and operator lab only
Manual CI: bootstrapped and archive validation passed
Documented records:
  docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md
  docs/production-replacement-records/2026-05-26-local-linux-ci-bootstrap-validation.md
```

Current DNS:

```text
sub.globalcirclecat.com -> 13.215.156.159
ss-sg.globalcirclecat.com -> 13.215.156.159
TTL: 600
```

Current AWS inventory:

```text
i-0b7791340d3fedff5:
  status: stopped under accepted outage decision
  public IP: none after stop
  documented role: prod-edge-a / stopped former production target
  security group: sg-0379ece0b3d305c43

i-0ad8676ee113d14cb:
  status: stopped under accepted outage decision
  public IP: none after stop
  documented role: prod-edge-b / stopped former green candidate
  security group: sg-06682c36aa03834f7

i-004ab1c6c71d06bca:
  status: stopped
  documented role: legacy blue under review, not terminated
  security group: sg-04a165ec77f430ee8

i-0589aac321172dd74:
  status: stopped
  documented role: historical proxy-gateway node, not staging
  security group: sg-0748fd9a7f936e28d

i-0609ff48af3946c1c:
  status: stopped
  documented project tag: MeshCentral
  note: do not mutate as part of proxy-gateway cleanup without separate owner
    confirmation
```

Stop-only cleanup record:

```text
docs/production-replacement-records/2026-05-26-singapore-prod-edge-stop.md
```

## Target End State

Near-term target:

```text
Aliyun:
  sub-control-a
  owns user management and subscription distribution
  serves public subscription refresh only after promotion approval
  keeps Admin private
  does not run CI
  does not act as an edge proxy node unless a separate temporary exception is
  approved

HP:
  local-ci-a
  operator lab
  no production authority
  no public subscription service
  no edge production duty

AWS prod-edge-a / prod-edge-b:
  drained from subscription output
  no longer receive new user traffic
  stopped after observation and explicit approval
  terminated only after a later approval proves no rollback dependency remains
```

## Parallel Workstream Boundary

### Platform Track

Owner for this branch of work:

```text
Aliyun user management / subscription distribution platform
```

Allowed after explicit gates:

```text
Aliyun CI cleanup
Aliyun candidate hardening
proxy-gateway candidate bootstrap
private candidate validation
state-copy validation
Nginx public boundary
DNS migration
```

Node drain and retirement are adjacent operations after promotion; they are not
part of the platform bootstrap itself.

### Technical MVP Track

Owner:

```text
PR #129 and follow-up technical branches
```

Allowed in that track:

```text
local edge channel manager
probe harness
benchmark harness
new transport candidate experiments
HP / lab evidence when explicitly scoped
```

Not allowed in that track without a separate A-tier gate:

```text
production DNS
Aliyun production authority
AWS node shutdown
Nginx production config
SQLite production state
public Admin exposure
```

### Integration Gate

The two tracks merge only after both are independently validated:

```text
Aliyun platform:
  can issue and render stable subscription artifacts safely

technical MVP:
  can provide measured channel capability without production authority

integration:
  control plane may distribute channel policy or bootstrap information only
  after a separate design and validation record
```

## Execution Phases

### Phase 0: Record Decision And Current Inventory

Allowed now:

```text
docs-only runbook updates
project-state updates
read-only cloud inventory
read-only PR inventory
```

Forbidden now:

```text
cleanup
deploy
DNS change
Nginx change
systemd change
SQLite movement
secret movement
node-output mutation
AWS stop or terminate
security-group deletion
traffic cutover
```

### Phase 1: Aliyun CI Lane Cleanup

Goal:

```text
Retire Aliyun from the manual CI lane before it becomes a production-control
candidate.
```

Required approval phrase:

```text
Approve Aliyun manual CI lane cleanup. No production authority transfer, no DNS change, no user traffic.
```

Cleanup execution record:

```text
docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup.md
```

That record removed only root user npm/cache residue and matching CI archive
files. It did not perform DNS, Nginx, systemd, firewall, WireGuard, SQLite,
tenant, artifact, production-authority, or user-traffic mutation.

Allowed:

```text
remove leftover CI cache/workspace/archive material identified in the read-only
inventory
recheck that GitHub config and git credentials are absent
record cleanup evidence
```

Forbidden:

```text
production deploy
DNS changes
service startup
Nginx changes
SQLite movement
token or secret printing
AWS node changes
```

### Phase 2: Aliyun Candidate Hardening And Bootstrap

Goal:

```text
Prepare Aliyun as a private subscription-control candidate without production
authority.
```

Required approval phrase:

```text
Approve Aliyun subscription control-plane candidate preparation. No DNS change, no user traffic, no production authority transfer, no edge traffic.
```

Required actions:

```text
decide whether existing wg-home should remain, be scoped, or be removed
harden firewall before public service exposure
install or configure Nginx only as candidate boundary
deploy proxy-gateway from a validated commit
run app on loopback
validate /api/health locally
validate Admin requires auth locally
confirm no edge proxy listener is opened
confirm no production DNS points to candidate
```

Execution record:

```text
docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md
```

Current status:

```text
Aliyun candidate app is active on 127.0.0.1:3456.
Candidate Nginx is active on 127.0.0.1:18080.
UFW is active with default deny incoming and OpenSSH plus existing wg-home
51820/udp allowed.
Public checks from HP show 3456, 18080, 80, and 443 closed and SSH open.
AliDNS still points sub.globalcirclecat.com and ss-sg.globalcirclecat.com to
13.215.156.159.
No production authority, DNS, user traffic, state-copy, edge traffic, AWS, or
public Admin mutation has been performed.
```

### Phase 3: Production State Copy Validation

Goal:

```text
Validate Aliyun rendering with approved production-derived state while still
keeping production authority on the current host.
```

Requires separate approval because SQLite and artifact state are sensitive.

Required approval phrase:

```text
Approve Aliyun private state-copy validation. No DNS change, no user traffic, no public Admin, no production authority transfer.
```

Required validation:

```text
fresh source backup exists
source SQLite integrity_check passes
private transfer path approved
candidate SQLite integrity_check passes
candidate renders subscription output privately
opaque artifact behavior is validated privately
no raw tokens, subscription URLs, .env values, private keys, or customer data
are printed or recorded
rollback source remains current production authority
```

Current preflight record:

```text
docs/production-replacement-records/2026-05-26-aliyun-state-copy-preflight.md
docs/production-replacement-records/2026-05-26-prod-edge-a-source-internal-state-copy-inspection.md
```

Current preflight status:

```text
Aliyun private candidate app, loopback Nginx, UFW, and candidate SQLite
integrity are healthy.
AliDNS still points sub.globalcirclecat.com and ss-sg.globalcirclecat.com to
13.215.156.159.
No public Admin, public 80/443/3456/18080 exposure, DNS change, user traffic
change, production authority transfer, or state-copy was observed or performed.
State-copy validation remains blocked because prod-edge-a source internal SSH
inspection timed out during banner exchange, so source SQLite integrity and
fresh source backup have not been verified in this gate.
Follow-up source internal inspection confirmed EC2 health and public endpoint
health, but SSM is unavailable and SSH TCP/22 closes before banner/auth, so
source command execution remains blocked.
```

Recommended source-access planning gate before private state-copy validation:

```text
Approve prod-edge-a source access remediation planning. Read-only planning only. No reboot, no stop, no service restart, no security-group change, no DNS change, no SQLite copy.
```

### Phase 4: Aliyun Distribution Promotion

Goal:

```text
Move public user-management-backed subscription distribution authority to
Aliyun.
```

Required approval phrase:

```text
Approve Aliyun production subscription distribution promotion. Include DNS change, production state copy, Nginx public boundary, and rollback to current prod-edge-a.
```

Required validation:

```text
final backup
candidate service active
candidate Nginx config test passes
public /api/health passes after DNS/gateway change
public Admin remains blocked
authorized subscription refresh passes
opaque artifact canary passes if still active
current production rollback path is documented
observation window is started
```

### Phase 5: Adjacent AWS Node Drain

Goal:

```text
Stop new user traffic from depending on AWS nodes before shutdown.
```

Required approval phrase:

```text
Approve AWS node drain preflight. Read-only only. No stop, no terminate, no DNS change, no security-group change.
```

Latest read-only cleanup preflight:

```text
docs/production-replacement-records/2026-05-26-non-aliyun-node-cleanup-preflight.md
```

That preflight did not perform cleanup. It confirmed `prod-edge-a` is still
blocked by authoritative DNS and public gateway dependency, while `prod-edge-b`
is still blocked by the documented temporary secondary-slot dependency.

Drain criteria before any stop:

```text
Aliyun is serving subscription distribution successfully
Subscription output no longer emits AWS edge nodes, or the operator accepts the
remaining client cache window explicitly
DNS no longer points subscription or node-host names to AWS nodes
rollback dependency is documented
current AWS instance and security-group inventory is refreshed
```

### Phase 6: AWS Node Stop

Goal:

```text
Stop non-Aliyun / non-HP nodes after drain and observation.
```

Required approval phrase:

```text
Approve AWS node drain and stop after Aliyun promotion. No termination, no security-group deletion, rollback window preserved.
```

Stop order:

```text
1. prod-edge-b / green carrying instance, if no longer emitted or needed
2. prod-edge-a, only after DNS and subscription authority are on Aliyun and the
   rollback plan accepts instance stop risk
3. historical stopped nodes remain stopped; do not start them for cleanup
4. MeshCentral-tagged node is out of this project's cleanup unless separately
   confirmed
```

### Phase 7: Termination And Security-Group Cleanup

Goal:

```text
Remove cloud cost and obsolete ingress only after rollback no longer needs the
nodes.
```

Required approval phrase:

```text
Approve AWS node termination and security-group cleanup after observation window. No rollback dependency remains.
```

Required evidence:

```text
Aliyun promotion observation window passed
no subscription output references retired nodes
no DNS record references retired AWS IPs
no rollback dependency remains
backup retention decision is recorded
security-group references are inventoried
```

## Hard Stops

Stop and do not mutate if any of these are true:

```text
Aliyun still contains unmanaged credentials or unrelated production secrets
Aliyun firewall cannot be hardened
WireGuard wg-home role is undecided
Nginx cannot block public Admin
SQLite backup or restore validation fails
subscription output still depends on AWS nodes without operator acceptance
DNS still points user traffic to a node being stopped
rollback depends on an instance being terminated
raw secrets, tokens, subscription URLs, private keys, or customer data would be
printed or recorded
```

## Validation Matrix

```text
Docs/project-state:
  npm run project-state:check
  git diff --check origin/master...HEAD

Aliyun cleanup:
  cleanup-specific read-only recheck
  no GitHub config or git credentials
  no manual-CI workspace or archive

Aliyun candidate:
  local /api/health
  local Admin auth boundary
  Nginx config test if configured
  firewall/listener inventory
  no public DNS cutover

State-copy validation:
  source integrity_check
  candidate integrity_check
  private subscription rendering
  private opaque artifact validation

Promotion:
  public /api/health
  public Admin blocked
  authorized subscription refresh
  DNS and rollback verification

Node drain/stop:
  subscription output inventory
  DNS inventory
  AWS instance inventory
  rollback check
```

## Current Next Action

The next executable gate is:

```text
clean edge node rebuild planning, or Aliyun production subscription
distribution promotion planning after private state validation is unblocked.
```

Do not move DNS, promote production authority, expose public Admin, start edge
traffic, restart stopped AWS nodes, terminate instances, or delete security
groups before source access planning, any approved source access remediation,
private validation, state handling, promotion, rebuild, rollback, and cleanup
gates are separately approved and recorded.
