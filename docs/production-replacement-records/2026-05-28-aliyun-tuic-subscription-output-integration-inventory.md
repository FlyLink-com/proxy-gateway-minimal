# Aliyun / TUIC Subscription Output Integration Inventory

Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / read-only Aliyun subscription distribution and TUIC production-module integration inventory
```

Approval basis:

```text
operator agreed to enter production maintenance and prepare Aliyun subscription distribution integration
```

## Scope

Approved:

```text
inspect repository state
inspect public Aliyun subscription boundary behavior
inspect channel-lab-b AWS state through read-only AWS API
attempt Aliyun host-internal read-only inventory
record integration blockers and next gates
```

Explicitly not approved:

```text
no Aliyun runtime mutation
no Aliyun firewall or provider firewall mutation
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
configs, SQLite rows, credentials, customer data, or exact management-source
values were recorded.

## Inputs

Repository:

```text
PR #255: merged
PR #257: merged
channel production module: present in master
```

Relevant module:

```text
npm run channel:production-module -- <activation-package.json> <canary-evidence.json>
```

The module produces safe production-module branch review metadata only. It does
not grant production activation authority, return YAML, expose hosts or ports,
submit approvals, mutate subscription output, contact edge nodes, move traffic,
or activate production.

Channel candidate:

```text
protocol: TUIC
target label: channel-lab-b
runtime record: docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-runtime.md
operator-device canary record: docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-operator-device-canary.md
short canary result: 20/20 HTTP 204 samples, failed 0
```

## Public Aliyun Boundary

Direct public boundary checks used the recorded Aliyun subscription-boundary
address with explicit hostname resolution override to avoid local DNS/proxy
pollution.

Results:

```text
https://sub.globalcirclecat.com/api/health -> 200
https://sub.globalcirclecat.com/api/admin/subscriptions -> 404
https://sub.globalcirclecat.com/sub/clash.yaml without token -> 401
https://sub.globalcirclecat.com/ -> 404
```

Observed timing from the operator device:

```text
health total: 1.357563s
admin-block total: 1.262477s
no-token subscription total: 1.284728s
root total: 1.311050s
```

Conclusion:

```text
Aliyun public subscription boundary remains behaviorally correct for health,
Admin blocking, no-token subscription blocking, and root blocking.
```

## DNS Observation

The operator-device default and explicitly selected public DNS queries returned
`198.18.0.0/15` addresses. That range is consistent with local proxy or DNS
interception behavior, so these local DNS results were not treated as
authoritative project DNS evidence.

Conclusion:

```text
do not use current operator-device DNS result as authoritative AliDNS evidence
for this inventory
```

Future mutation gates must use AliDNS API or a trusted remote vantage before
any DNS-related conclusion.

## Aliyun Host-Internal Inventory

Attempted:

```text
ssh miyao
```

Result:

```text
TCP/22 reachable from the operator device, but SSH session closes before
host-internal commands can run.
```

No host-internal facts were refreshed in this record. The attempted shell
inventory was stopped and not treated as evidence.

Blocked host-internal checks:

```text
proxy-gateway-candidate.service status
nginx status
local loopback /api/health
SQLite integrity_check
active listener inventory
Nginx config inspection
journal summary
```

Conclusion:

```text
Aliyun host-internal inventory is blocked before subscription-output activation
planning can be considered ready.
```

## Public Port Drift Signal

Short TCP probes from the operator device observed TCP connectability on:

```text
80
443
3456
18080
```

HTTP checks:

```text
80 /api/health -> 200
3456 /api/health -> TCP connect, HTTP timeout with no response within 5s
18080 /api/health -> TCP connect, HTTP timeout with no response within 5s
```

This does not prove public Admin exposure, because HTTP did not return an app
response on 3456 or 18080. It does prove the previous assumption "externally
closed" needs a fresh provider-firewall / host-listener read-only review before
any subscription-output activation gate.

Conclusion:

```text
3456/18080 public-port posture is inconclusive and must be re-inventoried from
host/provider views before activation
```

## channel-lab-b Read-Only State

AWS read-only state:

```text
region: ap-northeast-1
instance: running
instance type: t3.small
public IPv4: recorded in the channel-lab-b execution records
private IPv4: recorded in the channel-lab-b execution records
security group: recorded in the channel-lab-b execution records
```

No channel-lab-b host-internal runtime mutation, restart, config readout, secret
readout, or cleanup was performed in this inventory.

## Integration Assessment

Ready:

```text
TUIC short canary has enough evidence to enter production-module branch review
repo has channel production module helper and CLI in master
Aliyun public subscription boundary behavior is still correct
channel-lab-b AWS instance is running
```

Blocked before activation:

```text
Aliyun host-internal inventory is blocked by SSH session closure
3456/18080 public-port posture needs fresh provider/host inventory
TUIC still lacks extended measurement comparable to the Hysteria2 bundle
no subscription-output activation approval exists
no rollback evidence exists for Aliyun -> TUIC subscription-output canary
```

## Result

```text
Aliyun / TUIC integration inventory: recorded
production subscription-output activation: not ready
production subscription-output mutation: not performed
edge traffic activation: not performed
next gate: resolve host-internal / port-posture inventory, then extended TUIC measurement or activation planning
```

## Recommended Next Actions

```text
1. Run a separate Aliyun host-internal access / provider-firewall read-only inventory.
2. Run extended channel-lab-b TUIC measurement if the operator wants comparable TUIC data.
3. Build a canary-only subscription-output activation plan after the two blockers above are resolved.
4. Keep all-user rollout, DNS changes, production config changes, and edge traffic activation blocked.
```

Possible next approval phrase for measurement:

```text
Approve extended channel-lab-b TUIC measurement on the operator device. No all-user rollout.
```

Possible next approval phrase for Aliyun access / port posture inventory:

```text
Approve Aliyun host-internal and provider-firewall read-only inventory for TUIC subscription-output integration. No mutation.
```
