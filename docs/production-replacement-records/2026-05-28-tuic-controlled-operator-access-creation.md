# TUIC Controlled Operator Access Creation

Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / controlled operator access creation for TUIC canary activation
```

Approval phrase received:

```text
Approve creation of one controlled operator access for TUIC canary activation on Aliyun. No all-user rollout, no DNS change, no Nginx change, no firewall change, no public Admin, no channel-lab-b cleanup.
```

## Scope

Approved:

```text
create exactly one controlled operator access on Aliyun
create exactly one active opaque artifact for that access
store visible-once operator handoff material outside the repository
keep the controlled access on the current stable output until a later TUIC
activation gate
record rollback previous-output state for the next activation attempt
validate public boundary and safe aggregate state
```

Explicitly not approved:

```text
no all-user rollout
no TUIC subscription-output activation
no config/proxy-servers.json mutation
no DNS mutation
no Nginx mutation or reload
no provider-firewall mutation
no host-firewall mutation
no public Admin exposure
no systemd restart or reload
no channel-lab-b runtime mutation or cleanup
no production authority transfer
no raw hosts, ports, credentials, tokens, subscription URLs, YAML, SQLite rows,
raw logs, customer data, or Cloud Assistant raw command output recorded
```

## Execution

Before mutation, the previous exact-approved activation attempt had stopped
because Aliyun had no active controlled operator access. This gate created one.

Creation method:

```text
local operator machine generated the opaque artifact secret
only hashes and safe metadata were sent to Aliyun
Aliyun SQLite was backed up before mutation
one tenant row was inserted
one active artifact row was inserted
one audit event row was inserted
```

Visible-once handoff:

```text
stored outside repository
path label: %LOCALAPPDATA%/proxy-gateway-minimal/controlled-access/
file ACL: current Windows operator user only
raw URL recorded in docs/PR/chat: no
```

Aliyun backup:

```text
backup label: subscriptions-before-tuic-access-20260528T104754928Z.sqlite
backup location: Aliyun app state backup directory
raw backup copied or recorded: no
```

## Previous Output / Rollback State

The new controlled operator access was created on the current stable node:

```text
previous output node: prod-edge-a
previous output protocol family: current stable SS output
TUIC node binding: not performed
channel-lab-b TUIC in runtime config: no
```

Rollback before TUIC activation is simple:

```text
revoke or delete the created artifact
disable or delete the created controlled operator tenant
leave runtime config unchanged
confirm public health/Admin/no-token behavior
```

Rollback after a future TUIC activation attempt must first restore the access
to the recorded previous output node.

## Validation

Public subscription boundary:

```text
HTTPS /api/health: 200
HTTPS /api/admin/subscriptions: 404
HTTPS /sub/clash.yaml without token: 401
```

Controlled opaque artifact refresh:

```text
status: 200
YAML recorded: no
raw subscription URL recorded: no
token-like prefix in returned body: no
artifact path in returned body: no
TUIC output count: 0
SS output count: 2
```

Aliyun SQLite aggregate state:

```text
SQLite integrity_check: ok
tenants_total: 2
tenants_status_active: 1
tenants_status_disabled: 1
tenants_node_prod_edge_a: 2
tenants_node_channel_lab_b_tuic: 0
active_artifacts: 1
active_artifact_tenant_count: 1
active_tenants_with_active_artifacts: 1
controlled-access audit events: 1
canary_bound_active_artifacts: 0
```

Runtime config aggregate state:

```text
config_has_channel_lab_b_tuic: no
config_canary_count: 0
config_stable_count: 2
```

## Not Performed

```text
no config/proxy-servers.json mutation
no TUIC candidate added to Aliyun runtime config
no production subscription output changed to TUIC
no production YAML generated or recorded
no public subscription URL generated or recorded in repository/docs/chat
no Nginx config changed or reloaded
no systemd service restarted or reloaded
no provider firewall changed
no host firewall changed
no DNS changed
no channel-lab-b runtime mutation or cleanup
no edge traffic activated beyond the one controlled artifact refresh check
no all-user rollout
no production authority transfer
```

## Result

```text
controlled operator access creation: completed
active controlled operator access count: 1
active opaque artifact count: 1
previous output state: stable prod-edge-a
TUIC subscription-output activation: not performed
next safe gate: retry exact canary-only TUIC subscription-output activation
with fresh checks and rollback evidence
```

## Next Gate

If continuing, re-request the exact TUIC activation phrase:

```text
Approve canary-only TUIC subscription-output activation for channel-lab-b on one controlled operator access. No all-user rollout.
```

That later gate may bind only this controlled operator access to
`channel-lab-b-tuic` if the runtime config candidate is safely added and fresh
checks pass. It still does not authorize all-user rollout, DNS changes, public
Admin exposure, channel-lab-b cleanup, or production authority transfer.
