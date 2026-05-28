# TUIC Controlled Operator Access Activation

Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / canary-only TUIC subscription-output activation for one controlled access
```

Approval phrase received:

```text
Approve canary-only TUIC subscription-output activation for channel-lab-b on one controlled operator access. No all-user rollout.
```

## Scope

Approved:

```text
activate TUIC subscription output for exactly one controlled operator access
add the real channel-lab-b TUIC canary candidate to the Aliyun runtime config
store TUIC runtime material only in the protected Aliyun environment file
restart proxy-gateway-candidate.service only as needed to load the runtime config
bind the single active controlled operator access from stable prod-edge-a output
to channel-lab-b-tuic
validate public boundary, artifact refresh, runtime config, and SQLite aggregate
state
record rollback evidence and backup labels
```

Explicitly not approved:

```text
no all-user rollout
no DNS mutation
no Nginx config mutation or reload
no provider-firewall mutation
no host-firewall mutation
no public Admin exposure
no channel-lab-b runtime mutation or cleanup
no production authority transfer
no legacy query-token retirement
no broader opaque artifact issuance
no raw hosts, ports, credentials, tokens, subscription URLs, YAML, SQLite rows,
raw logs, customer data, or raw Cloud Assistant command output recorded
```

## Preconditions

Previous records:

```text
docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-extended-measurement.md
docs/production-replacement-records/2026-05-28-aliyun-cloud-assistant-tuic-host-inventory.md
docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation-request.md
docs/production-replacement-records/2026-05-28-tuic-controlled-operator-access-creation.md
```

Fresh public boundary before activation:

```text
HTTPS /api/health: 200
HTTPS /api/admin/subscriptions: 404
HTTPS /sub/clash.yaml without token: 401
```

Fresh channel-lab-b runtime health:

```text
mihomo-tuic.service: active
NRestarts: 0
UDP/443 listener: present
recent error-like count: 0
```

Fresh Aliyun host aggregate before activation:

```text
proxy-gateway-candidate.service: active
Nginx: active
runtime config stable_count: 2
runtime config canary_count: 0
channel-lab-b-tuic in runtime config: false
SQLite integrity_check: ok
active tenants: 1
active opaque artifacts: 1
controlled access ready: true
already bound to TUIC: false
```

## Execution Notes

Earlier hard stops during this gate:

```text
local command line too long: stopped before Cloud Assistant invocation
empty uploaded script output: no mutation, not used as evidence
env_missing hard stop: stopped before mutation
dotenv environment-file validation failed after config/environment backup and
write, but before service restart or controlled-access binding
```

The successful continuation sourced the active systemd environment file
directly and then completed the activation.

Executed changes:

```text
added channel-lab-b-tuic as a canary TUIC candidate in Aliyun runtime config
stored TUIC UUID/password material only in the protected Aliyun environment file
validated the runtime config without recording raw material
restarted proxy-gateway-candidate.service to load the runtime config
updated exactly one active controlled operator access from prod-edge-a to
channel-lab-b-tuic
inserted one controlled_operator_tuic_activation audit event
```

Cloud Assistant audit handles retained in PR context:

```text
successful activation continuation invoke id: t-usw6m8f1peeylmo
post-activation aggregate verification invoke id: t-usw6m8fit0h3400
```

Raw command bodies, raw command output, runtime config contents, environment
values, SQLite rows, YAML, artifact URLs, and subscription URLs are not recorded.

## Validation

Post-activation public subscription boundary:

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
returned body bytes: 1021
TUIC output count: 1
SS output count: 0
token query marker in returned body: no
artifact path marker in returned body: no
```

Aliyun runtime and SQLite aggregate state:

```text
proxy-gateway-candidate.service: active
Nginx: active
loopback /api/health: 200
SQLite integrity_check: ok
runtime config stable_count: 2
runtime config canary_count: 1
channel-lab-b-tuic in runtime config: true
candidate protocol: tuic
candidate role: canary
candidate UUID environment reference present: true
candidate password environment reference present: true
candidate UUID environment value present: true
candidate password environment value present: true
active opaque artifacts: 1
active artifact tenants bound to channel-lab-b-tuic: 1
active artifact tenants bound to prod-edge-a: 0
controlled_operator_tuic_activation audit events: 1
```

Backup labels:

```text
proxy-servers-before-tuic-activation-20260528T112400Z.json
env-before-tuic-activation-20260528T112400Z
subscriptions-before-tuic-activation-20260528T112400Z.sqlite
subscriptions-before-tuic-binding-20260528T112503Z.sqlite
```

## Not Performed

```text
no all-user rollout
no DNS change
no Nginx config change or reload
no provider-firewall change
no host-firewall change
no public Admin exposure
no channel-lab-b runtime mutation or cleanup
no production authority transfer
no legacy query-token retirement
no broader opaque artifact issuance
no raw subscription URL, artifact URL, token, credential, YAML, SQLite row,
customer data, raw runtime config, raw environment value, or raw Cloud
Assistant output recorded
```

## Rollback Model

Rollback requires a separate exact approval unless an immediate safety incident
requires emergency action.

Expected rollback shape:

```text
restore the controlled operator access node_id to prod-edge-a
restore Aliyun runtime config and environment from the recorded backup labels,
or remove the channel-lab-b-tuic candidate and TUIC environment keys
restart proxy-gateway-candidate.service to reload the restored runtime config
verify public health/Admin/no-token behavior
verify controlled opaque artifact returns stable output again
leave channel-lab-b running unless a separate cleanup approval is received
```

## Result

```text
canary-only TUIC subscription-output activation: completed
controlled access scope: exactly one active controlled operator access
controlled artifact output: TUIC only
stable/default output: unchanged for broader users
all-user rollout: not performed
next safe gate: operator-device import/refresh validation and observation,
then retain / rollback / broader rollout decision under separate approval
```
