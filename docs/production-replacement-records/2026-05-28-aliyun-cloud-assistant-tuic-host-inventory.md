# Aliyun Cloud Assistant / TUIC Host Inventory


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_cloud_assistant_tuic_host_inventory
  superseded_by: null
  last_verified_at: 2026-05-28
  production_authority: false
```


Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / Aliyun Cloud Assistant read-only host inventory for TUIC subscription-output integration
```

Approval phrase:

```text
Approve Aliyun Cloud Assistant read-only host inventory for TUIC subscription-output integration. No runtime mutation.
```

## Scope

Approved:

```text
inspect SWAS Cloud Assistant availability through read-only API
invoke Cloud Assistant with read-only host inventory commands
summarize Aliyun host-internal service, loopback, SQLite, Nginx, listener, and
resource facts
record whether the previous SSH-only host-internal blocker is resolved
```

Explicitly not approved:

```text
no Aliyun runtime mutation
no Aliyun provider firewall mutation
no host firewall mutation
no DNS mutation
no Nginx mutation or reload
no systemd restart
no production config mutation
no subscription-output mutation
no tenant or artifact mutation
no SQLite copy or row dump
no edge traffic activation
no all-user rollout
no channel-lab-b runtime mutation
no channel-lab-b cleanup
no production authority transfer
```

No secrets, tokens, subscription URLs, raw logs, private keys, raw runtime
configs, SQLite rows, credentials, customer data, raw provider-firewall rule
IDs, exact management-source values, raw channel endpoints, YAML, or raw Cloud
Assistant command output were recorded.

## Inputs

Previous host/provider record:

```text
docs/production-replacement-records/2026-05-28-aliyun-tuic-host-provider-inventory.md
```

That record confirmed provider identity and provider-firewall posture, but host
internal service/SQLite/Nginx evidence remained blocked over SSH.

## Cloud Assistant API Path

The local Aliyun CLI SWAS plugin was inspected before invocation.

Usable SWAS Cloud Assistant APIs:

```text
describe-cloud-assistant-status
describe-invocations
run-command
describe-invocation-result
```

The Cloud Assistant status check confirmed the SWAS instance is available for
Cloud Assistant command execution.

The first status query without an explicit `--region us-west-1` hit the default
regional endpoint and returned `NotFoundInstance`; it was not treated as host
evidence. Subsequent calls used both:

```text
--region us-west-1
--biz-region-id us-west-1
```

## Current Invocation Summary

Current Cloud Assistant invocations for this gate:

```text
initial inventory invocation: success, no stdout captured, not used as evidence
host inventory invocation: success
path and SQLite summary invocation: success
```

The invocation IDs are retained only as provider-side audit handles in the PR
context. Raw command output and raw command bodies are not recorded here.

## Host-Internal Results

Host and runtime:

```text
OS: Ubuntu 24.04.2 LTS
kernel: 6.8.0-63-generic
candidate service: active / enabled / success / NRestarts 0
Nginx: active / enabled / success / NRestarts 0
certbot.timer: active / enabled
aegis.service: failed / enabled / result signal
```

Loopback health:

```text
candidate app loopback /api/health: HTTP 200
Nginx loopback /api/health: HTTP 200
```

SQLite:

```text
candidate working directory: set and exists
candidate unit file: present
candidate service user: set
subscriptions.sqlite files found under expected host search roots: 1
candidate SQLite integrity_check: ok
```

Nginx:

```text
nginx -t: ok
$request_uri references in rendered Nginx config: 0
access_log directive count: 6
```

Listeners:

```text
22: listening
80: listening
443: listening
3456: listening
18080: listening
51820: listening
```

The listener summary is host-internal only. Provider-firewall evidence from the
previous record still governs public exposure: 3456/18080 have no provider
allow rule and were closed_or_timeout from the HP external vantage.

Resource summary:

```text
memory available: approximately 1.1 GiB
root disk used: 9%
loopback / primary NIC / wg-home RX/TX drops: 0 in sampled counters
```

## Integration Assessment

Resolved by this gate:

```text
Aliyun host-internal service inventory is no longer blocked by SSH
candidate app and Nginx loopback health are confirmed
candidate SQLite integrity is confirmed
Nginx config test is confirmed
Nginx query-token log-redaction posture remains compatible with $uri-style logging
```

Still blocked before canary-only subscription-output activation:

```text
current runtime config still lacks the real channel-lab-b TUIC canary candidate
synthetic review fixture has not been replaced by an approved real controlled-access mechanism
controlled access scope and rollback evidence still need to be recorded
no exact canary activation approval exists
```

## Not Performed

```text
no runtime file changed
no service restarted or reloaded
no Nginx config changed or reloaded
no Aliyun provider firewall changed
no host firewall changed
no DNS changed
no production config changed
no subscription output changed
no tenant, artifact, or SQLite data changed
no raw logs, raw config, env, credentials, tokens, subscription URLs, YAML, or
customer data copied or recorded
no edge traffic activated
no all-user rollout
no channel-lab-b runtime mutation or cleanup
no production authority transfer
```

## Result

```text
Aliyun Cloud Assistant host-internal inventory: completed
previous Aliyun host-internal SSH blocker: resolved for read-only evidence via Cloud Assistant
Aliyun runtime/service/Nginx/SQLite posture: healthy enough for next canary-planning review
subscription-output activation: not performed
production activation authority: not granted
next step: define real one-controlled-access TUIC canary config/activation mechanism, rollback evidence, and request exact A-tier activation approval if continuing
```

Recommended later approval phrase:

```text
Approve canary-only TUIC subscription-output activation for channel-lab-b on one controlled operator access. No all-user rollout.
```
