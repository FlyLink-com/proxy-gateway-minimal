# Aliyun / TUIC Host And Provider Inventory

Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / read-only Aliyun host-internal and provider-firewall inventory for TUIC subscription-output integration
```

Approval phrase:

```text
Approve Aliyun host-internal and provider-firewall read-only inventory for TUIC subscription-output integration. No mutation.
```

## Scope

Approved:

```text
inspect current repository and PR state
inspect Aliyun SWAS provider identity through read-only API
inspect Aliyun SWAS provider firewall rules through read-only API
attempt Aliyun host-internal inventory through the approved SSH alias
inspect external public-port behavior from the operator device
inspect external public-port behavior from the HP local Linux validation host
record blockers and next gates
```

Explicitly not approved:

```text
no Aliyun runtime mutation
no Aliyun provider firewall mutation
no host firewall mutation
no Cloud Assistant command creation or invocation
no DNS mutation
no Nginx mutation or reload
no systemd restart
no production config mutation
no subscription-output mutation
no tenant or artifact mutation
no SQLite copy
no edge traffic activation
no all-user rollout
no channel-lab-b runtime mutation
no channel-lab-b cleanup
no production authority transfer
```

No secrets, tokens, subscription URLs, raw logs, private keys, raw runtime
configs, SQLite rows, credentials, customer data, raw provider-firewall rule
IDs, or exact management-source values were recorded.

## Inputs

Current PR:

```text
PR #258: open / Draft / mergeable
branch: codex/aliyun-tuic-integration-inventory
```

Baseline integration record:

```text
docs/production-replacement-records/2026-05-28-aliyun-tuic-subscription-output-integration-inventory.md
```

## Aliyun SWAS Provider Inventory

Read-only SWAS API inventory confirmed:

```text
product: Aliyun Simple Application Server / SWAS
region: us-west-1
instance: 3e9253d3fb044463b876edacf6af8784
state: Running
business status: Normal
DDoS status: normal
public IPv4: 47.251.178.125
private IPv4: 172.18.54.13
OS image: Ubuntu 24.04
spec: 2 CPU / 2 GiB memory / 40 GiB ESSD / 200 Mbps bandwidth
charge type: prepaid
```

This confirms the provider identity still matches the Aliyun
subscription-distribution host recorded in the project state.

## Provider Firewall Inventory

Read-only SWAS provider firewall inventory found six allow rules:

```text
22/tcp: scoped management sources only
51820/udp: scoped wg-home lab sources only
80/tcp: public subscription boundary
443/tcp: public subscription boundary
3456/tcp: no provider allow rule
18080/tcp: no provider allow rule
```

The raw rule IDs and exact source CIDR values were intentionally not recorded.

Conclusion:

```text
provider firewall posture is compatible with public subscription boundary on
80/443 while keeping 3456/18080 closed at the provider layer
```

## Cloud Assistant Read-Only Status

Read-only Cloud Assistant status:

```text
Cloud Assistant status for the Aliyun SWAS instance: installed / available
custom user commands: none
recent invocations: none
```

No Cloud Assistant command was created or invoked in this inventory. Command
creation or invocation is treated as a separate host-internal execution path
that requires explicit approval because it creates provider-side execution
records even if the shell commands are read-only.

## SSH Host-Internal Attempt

The local SSH alias resolves to the Aliyun public host on port 22 and uses a
configured local identity. The private key path was not recorded.

Attempted:

```text
ssh miyao true
```

Result:

```text
TCP/22 reaches the host, but SSH times out during banner exchange before any
host-internal command can run.
```

Blocked host-internal checks:

```text
proxy-gateway-candidate.service status
nginx status
certbot.timer status
aegis.service status
local loopback /api/health
SQLite integrity_check
active listener inventory
Nginx config inspection
journal summary
```

Conclusion:

```text
host-internal inventory remains blocked over SSH
```

## Public-Port Behavior

Operator-device HTTPS/HTTP checks:

```text
http://47.251.178.125/api/health -> 200
https://sub.globalcirclecat.com/api/health -> 200
http://47.251.178.125:3456/api/health -> HTTP timeout
http://47.251.178.125:18080/api/health -> HTTP timeout
```

Operator-device raw TCP probes still reported connectability on 3456/18080, but
that conflicts with provider firewall inventory and external HP checks. It is
treated as local-path or local-proxy contamination, not as authoritative public
exposure evidence.

HP local Linux validation-host checks:

```text
22/tcp: reachable
80/tcp: reachable
443/tcp: reachable
3456/tcp: closed_or_timeout
18080/tcp: closed_or_timeout
http://47.251.178.125/api/health -> 200
https://sub.globalcirclecat.com/api/health -> 200
http://47.251.178.125:3456/api/health -> timeout
http://47.251.178.125:18080/api/health -> timeout
```

Conclusion:

```text
the previous 3456/18080 uncertainty is resolved at provider and HP-vantage
levels: 3456/18080 are not publicly reachable for usable HTTP service
```

## Integration Assessment

Ready:

```text
Aliyun SWAS provider identity is confirmed
Aliyun provider firewall posture is compatible with public 80/443 only
Aliyun public subscription boundary remains behaviorally healthy
HP external vantage confirms 3456/18080 are closed_or_timeout
channel-lab-b TUIC short canary and production-module branch package exist
```

Still blocked before subscription-output activation:

```text
Aliyun host-internal service/SQLite/Nginx inventory remains blocked over SSH
TUIC still lacks extended measurement comparable to the Hysteria2 bundle
no subscription-output activation approval exists
no rollback evidence exists for Aliyun -> TUIC subscription-output canary
Cloud Assistant read-only command invocation was not approved or performed
```

## Result

```text
Aliyun provider firewall inventory: completed read-only
Aliyun public 3456/18080 exposure concern: resolved as not publicly usable from provider/HP evidence
Aliyun host-internal inventory: still blocked over SSH
production subscription-output activation: not ready
production subscription-output mutation: not performed
edge traffic activation: not performed
```

## Recommended Next Actions

```text
1. Decide whether host-internal inventory should proceed through SSH access
   remediation or a separate Cloud Assistant read-only command gate.
2. Run extended channel-lab-b TUIC measurement if comparable channel data is
   required before activation planning.
3. Build a canary-only subscription-output activation plan only after
   host-internal evidence and TUIC measurement requirements are resolved.
4. Keep all-user rollout, DNS changes, production config changes, and edge
   traffic activation blocked.
```

Possible next approval phrase for Cloud Assistant host-internal inventory:

```text
Approve Aliyun Cloud Assistant read-only host inventory for TUIC subscription-output integration. No runtime mutation.
```

Possible next approval phrase for measurement:

```text
Approve extended channel-lab-b TUIC measurement on the operator device. No all-user rollout.
```
