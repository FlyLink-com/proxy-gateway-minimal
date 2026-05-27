# TUIC Runtime Inventory Execution

Date: 2026-05-27, Asia/Shanghai.

Risk:

```text
A / read-only channel runtime inventory
```

Approval phrase:

```text
Approve Channel Runtime Canary Stage 0 read-only inventory for TUIC. No runtime mutation.
```

## Scope

Approved:

```text
read existing channel-lab-a records
verify live channel-lab-a identity and lifecycle state
inspect current cloud network posture
attempt read-only host runtime inventory without changing access
review TUIC runtime package source options without installing or downloading
decide channel-lab-a reuse vs channel-lab-b selection vs stop
```

Explicitly not approved:

```text
install TUIC
download or stage TUIC binaries on a remote host
write TUIC config
open or change UDP ports
change provider firewall or security groups
restart, stop, or reconfigure Hysteria2
change DNS
change Nginx
change systemd units
change production config
change subscription output
generate operator-device TUIC client material
run operator-device traffic through TUIC
touch Aliyun subscription-distribution runtime
start stopped AWS prod-edge nodes
clean up channel-lab-a
copy secrets, credentials, raw logs, subscription URLs, artifact URLs, or
  customer data into docs, PRs, chat, or logs
```

## Inputs

Source records:

```text
docs/production-replacement-records/2026-05-26-channel-lab-a-creation.md
docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-runtime.md
docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-extended-measurement.md
docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-gate.md
```

## AWS Control-Plane Inventory

Read-only AWS EC2 inventory:

```text
provider-neutral label: channel-lab-a
cloud provider: AWS
region: ap-southeast-1
instance id: i-0f2cf745a1bb5ba51
instance state: running
instance status checks: system ok, instance ok
instance type: t3.small
architecture: x86_64
platform: Linux/UNIX
public IPv4: 18.143.186.75
private IPv4: 172.31.33.46
subnet: subnet-059b79e4b6e8e512b
VPC: vpc-01be6089f9892a651
security group: sg-0cad3c8a7380528f9 / channel-lab-a
network interface: attached and in-use
SSM managed instance status: not registered
```

Tag summary:

```text
Name: channel-lab-a
Role: channel-canary
ProtocolCandidate: Hysteria2
NoProductionTraffic: true
CleanupReview: 72h
```

No AWS mutation was performed.

## Security Group / Network Inventory

Current security group inbound posture:

```text
tcp/22: operator SSH source only; source /32 redacted
udp/443: public Hysteria2 canary exposure
```

Current security group egress posture:

```text
all outbound IPv4 traffic allowed
```

Network ACL posture for the VPC subnet set:

```text
default VPC network ACL is associated with the channel-lab-a subnet
default ACL allows all inbound and outbound IPv4 traffic before default deny
```

No provider firewall, security group, or network ACL change was performed.

## Host Internal Inventory Attempt

The inventory attempted SSH read-only access using the documented AWS key pair
for `channel-lab-a`.

Observed result:

```text
tcp/22: TCP connection established from the operator device path
ssh banner: timed out before banner/auth
remote commands executed: none
host-internal inventory: blocked
```

Because SSH did not reach banner/auth and SSM is not registered for the
instance, this inventory did not verify live host-internal state for:

```text
OS package state
Hysteria2 service state
Hysteria2 restart count
current host listening ports
host firewall state
host CPU/memory/disk counters
host network counters
TUIC binary absence/presence
```

The latest repository record before this inventory still documents Hysteria2
v2.9.2 as active on UDP/443, but that runtime state was not reverified inside
the host during this Stage 0 execution.

## TUIC Runtime Package Source Review

Repository metadata review only; no TUIC binary was downloaded, staged, or
installed.

Checked upstream source metadata:

```text
upstream repository: EAimTY/tuic
latest release tag observed during inventory: tuic-server-1.0.0
latest release published_at: 2023-06-08T07:40:51Z
matching architecture assets observed:
  tuic-server-1.0.0-x86_64-unknown-linux-gnu
  tuic-server-1.0.0-x86_64-unknown-linux-gnu.sha256sum
  tuic-server-1.0.0-x86_64-unknown-linux-musl
  tuic-server-1.0.0-x86_64-unknown-linux-musl.sha256sum
```

Deployment remains blocked until a future gate chooses a pinned asset, checksum
verification procedure, local staging boundary, service name, config path, and
cleanup path.

## Coexistence Assessment

Known constraints:

```text
channel-lab-a was created and tagged for Hysteria2 canary work
current security group exposes UDP/443 for Hysteria2 only
previous runtime record documents Hysteria2 listening on UDP/443
TUIC would also need a UDP listen port
host-internal runtime state could not be reverified in this inventory
```

Implications:

```text
TUIC cannot be assumed safe to deploy on UDP/443 while Hysteria2 owns that port.
TUIC on channel-lab-a would require either:
  a separate approved UDP port plus provider firewall/security-group change
  or a separately approved Hysteria2 cleanup/reconfiguration
Neither option is authorized by this Stage 0 inventory.
```

## Decision

```text
TUIC Stage 0 read-only inventory: executed
runtime deployment readiness: blocked
recommended path: do not deploy TUIC on channel-lab-a yet
preferred next action: choose a fresh channel-lab-b selection/creation gate for
  clean TUIC comparison, or explicitly approve channel-lab-a SSH/access
  remediation plus a separate port/cleanup plan before reuse
```

Rationale:

```text
channel-lab-a cloud identity and network exposure are clear.
Host-internal runtime inventory is blocked by SSH banner timeout.
Hysteria2 occupies the documented UDP/443 canary role.
The current security group has no separate TUIC candidate port.
Running TUIC on channel-lab-a without a new gate would mix runtime candidates
  and weaken rollback/measurement evidence.
```

## Stop Conditions Triggered

This inventory triggered the following stop conditions from the gate record:

```text
Hysteria2 cleanup or coexistence risk is unclear
candidate port conflicts with existing services or policy
firewall/security-group rollback path for a second UDP port is not approved
host-internal runtime state could not be verified
```

## Not Performed

```text
no TUIC inventory mutation
no TUIC binary download
no TUIC binary staging
no TUIC install
no TUIC config
no new service
no systemd change
no Hysteria2 restart, stop, cleanup, or reconfiguration
no provider firewall or security-group change
no DNS change
no Nginx change
no production config change
no subscription output change
no operator-device TUIC material
no operator-device TUIC traffic
no Aliyun subscription-distribution runtime change
no stopped AWS prod-edge node start
no channel-lab-a cleanup
no secrets, tokens, subscription URLs, artifact URLs, SQLite contents, cloud
  credentials, raw logs, or customer data recorded
```

## Next Gates

Recommended next gate if TUIC should be compared cleanly:

```text
Create a clean channel-lab-b TUIC comparison candidate. No production traffic.
```

Alternative next gates, if the operator wants to reuse channel-lab-a instead:

```text
Approve channel-lab-a SSH/access remediation planning for TUIC inventory only. No runtime mutation.
Approve channel-lab-a TUIC separate-port deployment planning. No runtime mutation.
Approve channel-lab-a Hysteria2 cleanup planning. No TUIC runtime mutation.
```

Any deployment, port exposure, cleanup, operator-device canary, broader rollout,
or production traffic remains separately gated.

## Validation For This Record

Repository validation:

```powershell
git diff --check origin/master...HEAD
npm run project-state:check
```
