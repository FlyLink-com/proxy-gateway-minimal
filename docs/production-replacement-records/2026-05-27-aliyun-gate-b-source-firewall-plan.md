# Aliyun Gate B Source-State And Firewall Hardening Plan

Date: 2026-05-27, Asia/Shanghai.

Risk: C for this repository planning record; A for any future source access,
rollback-start, backup, state-copy, provider-firewall, host-firewall, Nginx,
DNS, public listener, node lifecycle, tenant, artifact, or production-authority
mutation.

Branch: `codex/aliyun-gate-b-source-firewall-plan`

Operator request:

```text
Continue.
```

## Boundary

This record converts Gate A live inventory findings into the next decision and
approval path. It is intentionally repository-only.

Performed:

```text
reviewed the current project handoff and Aliyun runbook
reviewed the latest Gate A live inventory record
defined source-state decision options
defined provider-firewall hardening target posture
defined future approval phrases and validation evidence
updated repository source-of-truth docs and project-state orientation
```

Not performed:

```text
no Aliyun command execution
no AWS command execution
no HP command execution
no DNS change
no Nginx, systemd, UFW, WireGuard, provider-firewall, or security-group mutation
no service restart, start, stop, reload, or reboot
no AWS start, stop, reboot, termination, or volume action
no production backup, state copy, SQLite restore, tenant mutation, or artifact mutation
no public listener exposure
no edge traffic activation
no production authority transfer
no secret, token, subscription URL, private key, SQLite row, .env value, or
customer data readout
```

## Agent / Task Routing

Lead agent:

```text
Codex
```

Primary unit:

```text
Production Operations Agent
```

Supporting units:

```text
Subscription Access Control Agent for state-copy and clean-start implications
Validation / CI Agent for repository validation evidence
Edge / Node Capacity Agent for rollback-start and clean edge rebuild implications
```

Follow-up agent suitability:

```text
Production Operations Agent:
  owns future Aliyun firewall hardening and public-boundary gates

Subscription Access Control Agent:
  owns clean-start versus state-preserving subscription authority decision inputs

Edge / Node Capacity Agent:
  owns rollback-start and clean edge rebuild planning if service restoration
  needs edge capacity before Aliyun promotion
```

Recommended next owner:

```text
Production Operations Agent, with Subscription Access Control Agent review
before any state-source approval phrase is requested.
```

## Inputs

Primary input records:

```text
docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md
docs/production-replacement-records/2026-05-27-aliyun-gate-a-live-inventory.md
docs/production-replacement-records/2026-05-26-aliyun-state-copy-preflight.md
docs/production-replacement-records/2026-05-26-prod-edge-a-source-internal-state-copy-inspection.md
docs/production-replacement-records/2026-05-26-singapore-prod-edge-stop.md
```

Gate A facts this plan depends on:

```text
Aliyun candidate app is healthy on 127.0.0.1:3456.
Aliyun candidate Nginx is healthy on 127.0.0.1:18080.
Aliyun candidate SQLite integrity_check is ok.
HP public-boundary checks do not observe Aliyun public 80/443/3456/18080 exposure.
AliDNS still points subscription domains to 13.215.156.159.
AWS prod-edge-a and prod-edge-b are stopped and have no public IP association.
Aliyun provider firewall is too broad.
Host UFW currently blocks most public paths except SSH and the existing wg-home UDP path.
Tracked repository node config still references stopped or stale AWS targets.
```

## Gate B Decision Frame

Gate B should answer one question before private state-copy validation:

```text
What source of subscription authority should Aliyun use?
```

There are three viable paths.

### Path 1: Clean-Start Control Plane

Meaning:

```text
Aliyun becomes a new subscription-control authority without copying historical
AWS SQLite or artifact state.
```

Use when:

```text
the operator accepts the current service outage as a reset window
existing historical tenant/subscription state is not required for the next MVP
new users, grants, artifacts, and subscription outputs can be issued from Aliyun
old links can remain unavailable until new grants are issued
```

Benefits:

```text
avoids blocked prod-edge-a SSH/SSM source access
avoids moving sensitive historical SQLite/artifact state
reduces promotion dependency on stopped AWS nodes
fits the stated Aliyun platform MVP if customer state can be reissued
```

Risks:

```text
existing users may lose old subscription continuity
old opaque artifacts and legacy query-token links are not preserved
manual user/account/grant reconstruction may be required
business communication may be needed before any real user-facing activation
```

Required next approval:

```text
Approve Aliyun clean-start subscription control-plane authority planning. No DNS change, no public listener exposure, no state copy, no production traffic, no public Admin, no edge traffic, and no AWS mutation.
```

This approval would still be planning-only unless the approval explicitly
authorizes implementation steps.

### Path 2: State-Preserving Rescue-Volume Or Source-Access Remediation

Meaning:

```text
Recover or inspect the stopped AWS source state before Aliyun receives
subscription authority.
```

Preferred state-preserving direction:

```text
EBS snapshot / rescue-volume inspection from the stopped prod-edge-a root volume
or data volume, if the operator decides historical state must be preserved.
```

Why this is preferred over SSH-first remediation:

```text
previous source inspection could not execute commands because SSM was unavailable
and SSH closed before banner/auth
the instances are now stopped, so SSH-first remediation requires instance start
and may still fail before auth
rescue-volume work can inspect state without relying on the old instance boot path
```

Risks:

```text
volume snapshot, attach, mount, and backup extraction are all Risk A mutations
the rescue helper must not receive production secrets beyond the approved state
material
raw SQLite rows, subscription URLs, tokens, private keys, and .env values must
not be printed or copied into docs
backup movement must be private, verified, and reversible
```

Required next approval:

```text
Approve prod-edge-a source-state rescue planning. Read-only plan only first. No instance start, no volume attach, no snapshot, no SQLite copy, no DNS change, no security-group change, and no production traffic.
```

Later implementation would need a separate approval that names the exact AWS
volume/snapshot/helper path and rollback/cleanup plan.

### Path 3: Rollback-Start Before State Copy Or Temporary Restore

Meaning:

```text
Start a stopped AWS node before relying on it as a live source or temporary
restore target.
```

Use when:

```text
the operator needs temporary service restoration before Aliyun is promoted
or a running source host is required for a chosen state extraction path
```

Risks:

```text
stopped instances may receive new public IPv4 addresses
DNS and tracked config may still point at stale addresses
old SSH/SSM access blockers may remain after start
starting a former production node can create ambiguous production authority
unless DNS, Nginx, subscription output, and observation windows are explicitly
controlled
```

Required next approval:

```text
Approve AWS Singapore rollback-start preflight. Read-only planning only first. No instance start, no DNS change, no security-group change, no service restart, no SQLite copy, and no user traffic.
```

Any actual start action requires a later mutation approval that names the exact
instance, expected public IP handling, rollback target, validation checks, and
stop/cleanup criteria.

## Gate B Recommendation

Recommended default path:

```text
Path 1: Clean-start control plane, unless the operator explicitly requires
historical subscription state preservation.
```

Reason:

```text
the project is already in accepted-outage posture
prod-edge-a/prod-edge-b are stopped and no longer provide a live source
previous source command execution was blocked before the stop-only cleanup
Aliyun candidate is already privately healthy
the near-term product target is a small user-management and subscription
distribution platform, not an exact historical runtime clone
```

If historical user continuity is required:

```text
prefer Path 2 rescue-volume/source-state planning over Path 3 rollback-start
because it avoids granting ambiguous live service authority to a stopped AWS
node before the source state question is answered.
```

If immediate temporary service restoration is required:

```text
Path 3 rollback-start becomes a separate production restore gate and should not
be bundled with Aliyun state-copy validation.
```

Gate B output status:

```text
source-copy status: blocked until operator chooses clean-start or state-preserving path
rollback-source status: rollback-start-needed if AWS is used for temporary restore
privacy boundary: no source backup or state material may move until a separate
approved path defines private transfer, integrity checks, backup retention, and
redaction rules
```

## Provider-Firewall Hardening Plan

Gate A found broad Aliyun provider firewall rules, including public 80/443,
3128, 1194, all UDP, and all TCP+UDP ranges. Host UFW currently blocks most
public paths, but provider firewall must be least-privilege before any
public-boundary dry run.

### Target Posture Before Gate D

Provider firewall target before public-boundary dry run:

```text
22/tcp:
  allow only approved operator management source ranges where provider supports it

80/tcp:
  closed until an approved HTTP challenge or public-boundary dry run requires it

443/tcp:
  closed until Gate D explicitly stages public subscription boundary
  later allow only for public subscription boundary, not public Admin

3456/tcp:
  always closed publicly; app remains loopback-only

18080/tcp:
  always closed publicly; candidate Nginx remains loopback-only until a staged
  public config is explicitly approved

51820/udp:
  choose one before promotion:
    accept as scoped operator-lab path,
    restrict to approved operator/HP sources if provider supports it,
    or remove/disable through a separate WireGuard cleanup approval

3128/tcp, 1194/tcp, broad TCP/UDP, and all other unused inbound:
  remove
```

Host UFW target:

```text
default deny incoming
default allow outgoing
OpenSSH restricted as much as practical
no public app port
no public candidate Nginx loopback port
only approved public-boundary ports after Gate D
wg-home accepted/scoped/removed before promotion decision
```

### Hardening Execution Gate

Required approval phrase for a later mutation PR/record:

```text
Approve Aliyun provider firewall hardening. Restrict inbound to documented management and approved public-boundary ports only. No DNS change, no Nginx public promotion, no production authority transfer, no state copy, no user traffic, no edge traffic, and rollback by restoring the recorded provider firewall rules.
```

Required pre-mutation evidence:

```text
fresh Aliyun provider firewall inventory
fresh Aliyun host listener inventory
fresh UFW status
fresh candidate app and loopback Nginx health
current operator management source decision
explicit wg-home keep/scope/remove decision
recorded rollback copy of the existing provider firewall rule set
```

Required post-mutation validation:

```text
Aliyun host SSH remains reachable from approved operator path
candidate app health still passes on 127.0.0.1:3456
candidate Nginx health still passes on 127.0.0.1:18080
HP public-boundary checks still see 3456 and 18080 closed
80/443 remain closed unless explicitly approved for the same gate
removed broad ports are no longer externally reachable from HP where testable
UFW and provider firewall posture are both recorded
```

Rollback:

```text
restore the exact recorded provider firewall rules if management access,
candidate health, or intended public-boundary posture fails
do not change DNS as part of firewall rollback
do not start or stop AWS nodes as part of firewall rollback
do not expose Admin as part of firewall rollback
```

## Sequencing

Recommended next sequence:

```text
1. Operator chooses clean-start versus state-preserving source path.
2. If clean-start is accepted, define candidate-state initialization and
   customer/grant reissue plan.
3. If state preservation is required, run a source-state rescue planning gate
   before any AWS volume or instance mutation.
4. In parallel or immediately after the source decision, request Aliyun provider
   firewall hardening approval.
5. Only after source decision and firewall hardening are complete, request Gate C
   private state-copy validation or clean-start private rendering validation.
6. Gate D public-boundary dry run remains blocked until firewall posture and
   public Admin blocking are proven.
```

Do not combine these into one mutation approval:

```text
source-state recovery
firewall hardening
private state-copy or clean-start initialization
public-boundary staging
DNS promotion
edge node rebuild
rollback-start
AWS termination or security-group cleanup
```

## Next Approval Options

Option A, preferred if historical state is not required:

```text
Approve Aliyun clean-start subscription control-plane authority planning. No DNS change, no public listener exposure, no state copy, no production traffic, no public Admin, no edge traffic, and no AWS mutation.
```

Option B, if historical state must be preserved:

```text
Approve prod-edge-a source-state rescue planning. Read-only plan only first. No instance start, no volume attach, no snapshot, no SQLite copy, no DNS change, no security-group change, and no production traffic.
```

Option C, if temporary AWS restore is required:

```text
Approve AWS Singapore rollback-start preflight. Read-only planning only first. No instance start, no DNS change, no security-group change, no service restart, no SQLite copy, and no user traffic.
```

Option D, needed before Gate D regardless of source path:

```text
Approve Aliyun provider firewall hardening. Restrict inbound to documented management and approved public-boundary ports only. No DNS change, no Nginx public promotion, no production authority transfer, no state copy, no user traffic, no edge traffic, and rollback by restoring the recorded provider firewall rules.
```

## Validation

Repository validation for this planning record:

```text
npm run project-state:check
git diff --check origin/master...HEAD
```

Runtime validation is not performed by this record.
