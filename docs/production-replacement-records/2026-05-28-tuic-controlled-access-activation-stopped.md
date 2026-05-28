# TUIC Controlled-Access Activation Stopped Before Mutation

Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / canary-only TUIC subscription-output activation for one controlled operator access
```

Approval phrase received:

```text
Approve canary-only TUIC subscription-output activation for channel-lab-b on one controlled operator access. No all-user rollout.
```

## Scope

Approved intent:

```text
activate channel-lab-b TUIC subscription output for exactly one controlled
operator access
keep default stable subscription output unchanged
validate public subscription boundary and channel-lab-b runtime health first
record previous output state and rollback path before mutation
stop before mutation if any hard stop is hit
```

Explicitly not approved:

```text
no all-user rollout
no DNS mutation
no Nginx mutation or reload
no provider-firewall mutation
no host-firewall mutation
no public Admin exposure
no channel-lab-b runtime mutation or cleanup
no production authority transfer
no raw hosts, ports, credentials, tokens, subscription URLs, YAML, SQLite rows,
raw logs, customer data, or Cloud Assistant raw command output recorded
```

## Fresh Checks

Public subscription boundary:

```text
HTTPS /api/health: 200
HTTPS /api/admin/subscriptions: 404
HTTPS /sub/clash.yaml without token: 401
HTTPS /: 200
```

The root path now returns the public site surface. It is not an Admin exposure
change.

Aliyun host-internal read-only summary:

```text
proxy-gateway-candidate.service: active / running / success / NRestarts 0
nginx.service: active / running / success / NRestarts 0
runtime config stable nodes: 2
runtime config canary nodes: 0
runtime config has channel-lab-b-tuic: no
SQLite files under expected app state roots: 1
SQLite integrity_check: ok
tenants_total: 1
tenants_status_disabled: 1
active_artifacts: 0
active_artifact_tenant_count: 0
active_tenants_with_active_artifacts: 0
canary_bound_active_artifacts: 0
temp_links_unexpired_unused: 0
nginx -t: ok
$request_uri references in rendered Nginx config: 0
```

Channel-lab-b read-only runtime summary:

```text
AWS instance status: running / system ok / instance ok
mihomo-tuic.service: active / running / success / NRestarts 0
UDP candidate listener: present
recent service error-like line count: 0
```

## Stop Condition

The execution stopped before mutation because the approved scope required:

```text
exactly one controlled operator access
rollback previous-output state recorded for that access
```

The live Aliyun subscription state did not contain an active controlled
operator access to bind:

```text
active tenants with active artifacts: 0
active artifacts: 0
unexpired unused temporary links: 0
```

Creating or reissuing access material would be a separate tenant/artifact
mutation. It was not performed under this approval.

## Not Performed

```text
no config/proxy-servers.json mutation
no TUIC candidate added to Aliyun runtime config
no production subscription output changed
no production YAML generated or recorded
no public subscription URL generated or recorded
no Aliyun runtime file changed
no systemd service restarted or reloaded
no Nginx config changed or reloaded
no provider firewall changed
no host firewall changed
no DNS changed
no tenant row changed
no artifact row changed
no temporary link created
no SQLite row dump or customer data recorded
no channel-lab-b runtime mutation or cleanup
no edge traffic activated
no all-user rollout
no production authority transfer
```

## Result

```text
TUIC one-controlled-access activation: stopped before mutation
hard stop: no active controlled operator access exists
Aliyun public boundary: safe
Aliyun host services/config/SQLite: healthy for read-only evidence
channel-lab-b TUIC runtime: healthy for read-only evidence
subscription-output activation: not performed
next safe gate: define or create one controlled operator access under a
separate explicit approval before retrying activation
```

## Next Gate

If continuing, the next approval must explicitly cover the missing access
material and the activation together, or split them into two separate gates.
The next gate must state whether the operator wants to create a fresh controlled
operator access or re-enable/issue an approved existing access, and must still
keep all-user rollout, DNS, Nginx, public Admin, channel-lab-b cleanup, and
production authority transfer out of scope unless separately approved.
