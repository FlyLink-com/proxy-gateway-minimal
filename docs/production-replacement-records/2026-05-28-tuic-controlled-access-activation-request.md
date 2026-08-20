# TUIC Controlled-Access Activation Request Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: tuic_controlled_access_activation_request
  superseded_by: null
  last_verified_at: 2026-05-28
  production_authority: false
```


Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / canary-only TUIC subscription-output activation request packet
```

Approval basis:

```text
operator agreed to prepare the next activation request packet
```

This record does not grant activation authority. It converts the accumulated
TUIC and Aliyun evidence into a reviewable request packet for the next exact
A-tier decision.

## Scope

Approved:

```text
summarize the ready evidence for a one-controlled-access TUIC canary request
define activation-time fresh checks
define hard stops
record the exact approval phrase required for the later activation
keep execution authority not_granted
```

Explicitly not approved:

```text
no production subscription-output mutation
no change to config/proxy-servers.json
no production YAML generation or recording
no subscription URL generation or recording
no Aliyun runtime mutation
no Aliyun provider firewall mutation
no host firewall mutation
no Cloud Assistant command invocation
no DNS mutation
no Nginx mutation or reload
no systemd restart
no tenant or artifact mutation
no SQLite copy or row mutation
no edge traffic activation
no all-user rollout
no channel-lab-b runtime mutation
no channel-lab-b cleanup
no production authority transfer
```

No secrets, tokens, subscription URLs, raw logs, private keys, raw runtime
configs, SQLite rows, credentials, customer data, raw provider-firewall rule
IDs, exact management-source values, raw channel endpoints, host names, raw
ports, or YAML were recorded.

## Inputs

Evidence records:

```text
docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-extended-measurement.md
docs/production-replacement-records/2026-05-28-aliyun-tuic-host-provider-inventory.md
docs/production-replacement-records/2026-05-28-aliyun-cloud-assistant-tuic-host-inventory.md
docs/production-replacement-records/2026-05-28-tuic-subscription-output-dry-run-package.md
docs/production-replacement-records/2026-05-28-tuic-subscription-output-config-review.md
docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation-mechanism.md
```

Dry-run bundle:

```text
docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/
```

New request-packet artifact:

```text
docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/activation-request-packet.json
```

The request-packet artifact is summary-only. It records prerequisites,
activation-time fresh checks, hard stops, not-authorized actions, and the
exact approval phrase. It does not contain real node hosts, ports, credentials,
subscription URLs, tokens, YAML, customer data, or runtime config.

## Ready Evidence

Current evidence supports requesting a narrow canary decision:

```text
operator-device TUIC measurement: ready_for_operator_decision
Aliyun provider-firewall evidence: available_read_only
Aliyun host-internal evidence: available_via_cloud_assistant_read_only_inventory
synthetic config review: ready_for_production_module_branch_review
controlled-access mechanism: ready_for_exact_activation_approval_review
```

This does not mean production activation has happened. It means the next
decision can be narrowed to a one-controlled-access TUIC subscription-output
canary if the operator gives the exact approval phrase below.

## Required Activation-Time Fresh Checks

The later exact-approved activation must refresh these checks at the moment of
activation:

```text
Aliyun public health returns 200
Aliyun public Admin remains 404
Aliyun public no-token subscription remains 401
channel-lab-b TUIC runtime health is refreshed read-only
rollback previous output state is recorded
controlled scope remains one operator access
```

The activation record must include only redacted summaries. It must not record
raw subscription URLs, credentials, channel endpoints, runtime configs, SQLite
rows, or YAML.

## Hard Stops

The later activation must stop before mutation if any condition is true:

```text
operator gives only a short confirmation instead of the exact approval phrase
scope is not exactly one controlled operator access
fresh Aliyun public-boundary check fails
fresh channel-lab-b runtime-health check fails
rollback previous output state is missing
stable default output would change
raw hosts, ports, URLs, credentials, tokens, YAML, or customer data would be recorded
public Admin exposure changes
```

## Required Approval Phrase

The later activation requires this exact phrase:

```text
Approve canary-only TUIC subscription-output activation for channel-lab-b on one controlled operator access. No all-user rollout.
```

Short confirmations such as `yes`, `agree`, `continue`, `approved`, or `同意`
are not sufficient for the activation. They can only authorize more
repo-only planning or review work.

## Result

```text
TUIC controlled-access activation request packet: recorded
ready evidence: summarized
activation-time fresh checks: defined
hard stops: defined
execution authority: not_granted
production subscription-output mutation: not performed
edge traffic activation: not performed
all-user rollout: not performed
next step: wait for the exact approval phrase before any canary activation
```
