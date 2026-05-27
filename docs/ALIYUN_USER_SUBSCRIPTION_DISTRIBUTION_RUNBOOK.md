# Aliyun User Management / Subscription Distribution Runbook

Last updated: 2026-05-27, Asia/Shanghai.

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

## Public Site / User Portal Separation

The public company site and the logged-in customer portal are separate delivery
planes:

```text
Public company site:
  brand, business contact, product/service explanation
  AI / automation / advertising cooperation positioning
  public advertising landing-page experiments when separately deployed
  no customer auth
  no subscription artifact
  no Admin API call
  no hard link to the customer portal

Dynamic customer portal:
  operator-issued entry
  may rotate by customer, time window, or risk state
  displays user subscription state after entry/auth
  keeps subscription material opaque and visible only inside the customer flow
```

The public site can run on an Aliyun website/domain after a separate deployment
gate, but it must not be the same public path as the logged-in portal. Avoid:

```text
/login on the public website
/use on the public website
portal subdomain directly derived from the public website domain
shared cookie domain between website and portal
shared analytics or scripts that correlate the two planes
```

Read-only Aliyun DNS inventory on 2026-05-26 showed the account currently has
eight domains available for planning:

```text
globalcirclecat.com
globalcirclecat.shop
globalcirclecat.cloud
globalcirclecat.icu
pleasehelpme.cn
pleasehelpme.shop
pleasehelpme.fun
pleasehelpme.cyou
```

Design implication:

```text
primary public brand site:
  can use a stable public brand domain after a separate deployment/DNS gate

mainstream-media advertising landing pages:
  can later use an approved domain pool for campaign segmentation, A/B tests,
  and lead-source separation

logged-in customer portal:
  remains operator-issued and dynamic
  must not be hard-linked from the public site or campaign pages
  must not share cookies or customer-specific access material with the public
  brand/advertising surface
```

This inventory is read-only planning evidence only. It is not a DNS change, not
a deployment decision, and not approval to expose any portal or subscription
endpoint.

Future dynamic portal entrance configuration can be modeled without storing
secrets in repository docs:

```yaml
portalEntrances:
  - customerRef: customer-public-id
    status: active
    hostRef: operator-issued-host
    pathRef: operator-issued-path
    delivery: out-of-band
    expiresAt: 2026-06-26T00:00:00Z
    rotationPolicy: manual-or-risk-triggered
```

The example above is a shape only. It is not a production config, not a DNS
change, not a portal host assignment, and not an authorization to expose the
portal publicly.

## Repository Implementation Status

Repository-only platform work has started without production authority:

```text
private Admin subscriptions workflow: implemented
customer-facing user portal MVP shell: implemented in repository only
  - current UI reference: EqualDCDN /use-style auth card plus user dashboard
  - includes login/signup shell, package selection, subscription link boxes,
    backup-link placeholder, app downloads, usage steps, and safety checklist
static company site preview: implemented in repository only
  - official site content is brand/business/cooperation explanation only
  - current positioning: geek-style AI / automation research company surface
  - cooperation directions: mainstream media advertising, operations growth,
    and frontier product research
  - visible lead collection posts to the repository-only public lead intake
    endpoint `/api/public/leads` with validation and success/error UI
  - no external Webhook, CRM, email automation, DNS, or production deployment is
    configured by this repository-only UI change
  - it must not hard-link the customer portal route, subscription artifacts,
    Admin API, or any login-after-entry URL
  - Aliyun DNS domain inventory has been read-only checked for future public
    site / campaign landing-page planning, with no DNS mutation
customer portal entrance model: planned as an operator-issued dynamic entry
  - future entry metadata may be represented by server-side YAML or another
    controlled config source
  - the public site must not embed the live portal host or path
Subscription V2 renderer: implemented
opaque artifact issue / refresh / rotate / revoke contracts: implemented
overview distribution readiness summary: implemented for configured inventory
public registration/auth model: not approved
public payment flow: not approved
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

## Promotion Gate Model

Package 5 of the Aliyun Subscription Control Platform MVP converts the later
Aliyun promotion into explicit gates. This section is a repo-only runbook
design. It does not execute any gate.

Current accepted-outage context changes the rollback model:

```text
prod-edge-a and prod-edge-b are documented as stopped after the Singapore
stop-only cleanup.

Do not describe rollback as "return to the current running prod-edge-a" unless
a fresh live inventory proves that a running rollback source exists.

The default rollback choice before promotion is now one of:
  keep accepted outage and revert Aliyun candidate/public-boundary changes, or
  request a separate rollback-start gate for stopped AWS nodes before relying
  on them as a rollback target.
```

### Gate 0: Repo-Only Runbook PR

Purpose:

```text
Complete the design and documentation package before any Aliyun promotion
operation.
```

Allowed:

```text
update this runbook
update project context and project-state orientation
record the Package 5 design closeout
run repository validation for docs/project-state consistency
```

Forbidden:

```text
SSH into Aliyun or AWS to perform mutation
copy production state
change DNS
expose public listeners
start, stop, reboot, terminate, or clean any node
```

Required validation:

```text
npm run project-state:check
git diff --check origin/master...HEAD
```

### Command Separation

Read-only inventory commands belong only to inventory records. Mutation commands
belong only to later approved A-tier execution records. Do not mix them in one
approval or one PR.

Allowed read-only command templates:

```powershell
git status --short --branch
git rev-parse HEAD

aliyun alidns DescribeDomainRecords --DomainName globalcirclecat.com --RRKeyWord sub --PageSize 10

aws ec2 describe-instances --region ap-southeast-1 --instance-ids <instance-id> --output table
aws ec2 describe-instance-status --region ap-southeast-1 --instance-ids <instance-id> --include-all-instances --output table

ssh -o BatchMode=yes miyao "hostname; date; systemctl is-active proxy-gateway-candidate nginx wg-quick@wg-home ufw; ss -lntup; curl -fsS http://127.0.0.1:3456/api/health"
ssh -o BatchMode=yes hp-server "hostname; date; nc -vz -w 3 <public-ip> 22"
```

The templates above must be adjusted to the approved host aliases and current
inventory target. They must not print `.env` values, private keys, tokens,
subscription URLs, SQLite rows, or customer data.

Mutation command families are never allowed in Gate 0 or Gate A:

```text
systemctl restart/start/stop
nginx config install or reload
ufw allow/delete/enable/disable
aliyun DNS add/update/delete
aws ec2 start/stop/reboot/terminate
aws security-group ingress/egress mutation
sqlite restore/import/copy from production state
rsync/scp of production state, .env, artifact state, or private keys
wg-quick up/down or WireGuard key generation
```

### Gate A: Live Inventory Refresh

Purpose:

```text
Replace stale 2026-05-26 planning facts with live evidence before any mutation.
```

Allowed read-only checks:

```text
git status and current commit for the operator checkout
Aliyun host identity, OS, disk, memory, listeners, UFW, Nginx, systemd, and
candidate app health
AliDNS records for subscription and edge hostnames
AWS instance state, public IP association, security groups, and tags for
prod-edge-a, prod-edge-b, legacy blue, and channel-lab-a
public endpoint behavior from the operator and HP vantage points
candidate SQLite integrity_check without row dumps
presence/absence of candidate backup files by name and metadata only
```

Forbidden in this gate:

```text
service restart
DNS change
firewall or security-group change
SQLite copy
artifact copy
production .env readout
secret, token, subscription URL, private key, SQLite row, or customer data
printing
AWS start, stop, reboot, terminate, or volume detach
```

Required output:

```text
new production-replacement-records entry
promotion readiness decision: blocked / ready-for-source-access / ready-for-state-copy
explicit rollback-source status: none / accepted-outage / rollback-start-needed / live-source-ready
```

### Gate B: Source Access Or Source-State Decision

Purpose:

```text
Decide how Aliyun can receive validated state, or explicitly choose a
fresh-control-plane start without copying unavailable production state.
```

Current known blocker:

```text
The latest recorded source inspection could not execute commands on prod-edge-a:
SSM was unavailable and SSH closed before banner/auth. That evidence is stale
after the stop-only cleanup and must be refreshed before a state-copy decision.
```

Allowed read-only planning:

```text
compare source-access options
identify whether rollback-start of stopped AWS nodes is required before source
backup
define rescue-volume, SSM bootstrap, SSH remediation, or clean-start options as
separate later approvals
define what state is intentionally abandoned if the operator chooses clean start
```

Forbidden in this gate:

```text
reboot
stop or start
security-group change
SSH service mutation
SSM agent installation
volume detach/attach
SQLite backup or copy
```

Required output:

```text
chosen next approval path
state-copy source status
rollback-source status
privacy boundary for any later backup movement
```

Latest Gate B planning record:

```text
docs/production-replacement-records/2026-05-27-aliyun-gate-b-source-firewall-plan.md
```

Latest clean-start planning record:

```text
docs/production-replacement-records/2026-05-27-aliyun-clean-start-control-plane-plan.md
```

Current planning outcome:

```text
recommended default: clean-start Aliyun control plane unless the operator
explicitly requires historical subscription state preservation

clean-start is now the active planning default for the next repo-only package:
new accounts, entitlements, subscription-access grants, opaque artifacts, and
Subscription V2 outputs should be issued from Aliyun clean-start authority
after the relevant private validation gates pass

state-preserving fallback: source-state rescue planning, preferably
rescue-volume/snapshot based before relying on SSH-first remediation

temporary restore fallback: separate AWS rollback-start preflight and mutation
approval before any stopped node is treated as a live source or user-facing
rollback target

source-copy status: not part of the clean-start default path; historical
source-copy remains blocked unless the operator later approves a
state-preserving source path

rollback-source status: rollback-start-needed if AWS is used for temporary
restore
```

Provider-firewall hardening is now a separate prerequisite before Gate D
public-boundary dry run. Gate A found Aliyun provider firewall rules too broad;
host UFW currently blocks most paths, but provider-level broad inbound rules
must not remain the safety boundary for promotion.

### Gate C-Start: Clean-Start Private Validation

Purpose:

```text
Validate candidate-only clean-start state and private subscription rendering
without copying historical AWS state and without exposing public traffic.
```

Prerequisites:

```text
clean-start repo implementation package has passed local validation
operator explicitly accepts clean-start authority for this gate
candidate backup and rollback/cleanup decision are defined
candidate app and loopback Nginx are healthy
provider-firewall hardening remains scheduled before any public-boundary dry run
raw tokens, subscription URLs, .env values, private keys, SQLite rows, and
customer data are never printed or recorded
```

Required approval phrase:

```text
Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy.
```

Allowed mutation only after explicit A-tier approval:

```text
candidate-only clean-start state initialization
candidate backup before and after validation
candidate SQLite integrity checks without row dumps
private app health, Admin auth-boundary, and subscription rendering checks
```

Forbidden in this gate:

```text
historical AWS state copy
DNS change
public 80/443 promotion
public Admin exposure
edge traffic activation
AWS rollback-start or source rescue
customer-facing announcement or rollout
```

Required output:

```text
clean-start private validation record
candidate health evidence
candidate SQLite integrity evidence
private subscription rendering evidence with sensitive material redacted
rollback or cleanup decision for candidate-only state
```

### Gate C: Private State-Copy Validation

Purpose:

```text
Prove Aliyun can render subscription artifacts from approved state while still
keeping public traffic and production authority unchanged.
```

Prerequisites:

```text
Gate A live inventory is fresh
Gate B source-state path is approved
fresh source backup exists if state is copied
source SQLite integrity_check passes if state is copied
candidate SQLite backup exists before restore
candidate SQLite integrity_check passes before and after restore
private transfer path is approved
raw tokens, subscription URLs, .env values, private keys, SQLite rows, and
customer data are never printed or recorded
```

Allowed mutation only after explicit A-tier approval:

```text
private backup transfer to Aliyun
candidate SQLite restore or import
candidate-only local service reload if required by the approved procedure
private rendering validation through loopback or operator tunnel
```

Forbidden in this gate:

```text
DNS change
public 80/443 exposure
public Admin exposure
user traffic movement
edge traffic activation
production authority transfer
```

Required output:

```text
state-copy validation record
candidate health evidence
private subscription rendering evidence with sensitive material redacted
rollback of candidate state or retained candidate backup path
```

### Gate D: Public Boundary Dry Run

Purpose:

```text
Prepare the Aliyun public subscription boundary without moving DNS or user
traffic.
```

Prerequisites:

```text
Gate C passed or a clean-start control-plane path is explicitly accepted
Admin routes remain private or blocked from the public boundary
Nginx config can be tested without exposing Admin
UFW and provider firewall posture are understood
WireGuard wg-home role is accepted, scoped, or separately removed
```

Allowed actions only after explicit A-tier approval:

```text
stage Nginx public server config without DNS cutover
run Nginx config test
validate local and tunnelled public-boundary behavior
confirm public Admin blocking rule
prepare rollback config files
```

Forbidden in this gate:

```text
DNS record mutation
user traffic movement
subscription output mutation
edge node rollout
unreviewed firewall exposure
```

### Gate E: DNS And Production Distribution Promotion

Purpose:

```text
Move subscription distribution authority to Aliyun after private validation and
public-boundary checks have passed.
```

Prerequisites:

```text
Gate A live inventory is current
Gate B source-state decision is explicit
Gate C private validation passed or clean-start authority is explicitly accepted
Gate D public boundary dry-run passed
rollback-source decision is explicit
final candidate backup exists
final AliDNS current values are recorded
observation window length is stated
```

Required approval phrase:

```text
Approve Aliyun production subscription distribution promotion. Allow the documented DNS and public subscription-boundary changes only. No public Admin, no edge traffic activation, no unrelated node mutation, and rollback follows the recorded accepted-outage or rollback-start decision.
```

Required validation after promotion:

```text
public /api/health returns expected authRequired health
public Admin remains blocked
authorized subscription refresh passes without exposing raw token or URL in logs
opaque artifact canary passes privately if still active and approved for this gate
AliDNS records match the approved target
old DNS values and rollback decision are recorded
observation window starts
```

### Gate F: Observation, Rollback, And Cleanup Decision

Purpose:

```text
Separate promotion success from cleanup of old nodes, old records, or lab paths.
```

Allowed read-only checks:

```text
public health and authorized subscription refresh sampling
Nginx and app logs for errors without sensitive output
AliDNS confirmation
subscription output inventory
AWS stopped-node inventory
```

Rollback choices:

```text
if accepted outage continues:
  revert Aliyun public boundary and DNS to the previously recorded state, then
  keep outage documented until another restore path is approved

if rollback-start was approved before promotion:
  start the approved rollback node and restore DNS/runtime according to that
  separate rollback-start record

if clean-start authority was accepted:
  restore candidate backup or disable public distribution according to the
  clean-start promotion record
```

Cleanup non-goals:

```text
no AWS termination
no security-group deletion
no channel-lab cleanup
no legacy query-token retirement
no broader opaque artifact issuance
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

Clean-start alternative:

```text
If historical state is not required, use Gate C-Start clean-start private
validation instead of production state-copy validation. Do not copy AWS SQLite,
opaque artifact, legacy query-token, or subscription-output state in that path.
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
Approve Aliyun production subscription distribution promotion. Allow the documented DNS and public subscription-boundary changes only. No public Admin, no edge traffic activation, no unrelated node mutation, and rollback follows the recorded accepted-outage or rollback-start decision.
```

Required validation:

```text
Gate A live inventory is current
Gate B source-state decision is explicit
Gate C private state-copy validation passed, or clean-start authority is
explicitly accepted
Gate D public-boundary dry run passed
rollback-source decision is explicit
final candidate backup
candidate service active
candidate Nginx config test passes
public /api/health passes after DNS/gateway change
public Admin remains blocked
authorized subscription refresh passes
opaque artifact canary passes if still active
accepted-outage or rollback-start path is documented
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
build the clean-start control-plane repo implementation package:
  clean-start initialization shapes,
  operator-safe decision summaries,
  private rendering dry-run support,
  tests,
  and docs/project-state synchronization;

then request separate A-tier approvals for:
  Aliyun clean-start private validation,
  Aliyun provider-firewall hardening,
  public-boundary dry run,
  DNS promotion,
  edge rebuild,
  or AWS rollback-start if temporary restore is needed.
```

Do not move DNS, promote production authority, expose public Admin, start edge
traffic, restart stopped AWS nodes, terminate instances, or delete security
groups before live inventory, clean-start or source-state planning, private
validation, public-boundary dry run, promotion, rebuild, rollback, and cleanup
gates are separately approved and recorded.
