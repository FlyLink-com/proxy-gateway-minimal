# TUIC Controlled-Access Activation Mechanism Review


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: tuic_controlled_access_activation_mechanism
  superseded_by: null
  last_verified_at: 2026-05-28
  production_authority: false
```


Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / canary-only TUIC subscription-output controlled-access activation mechanism review
```

Approval basis:

```text
operator agreed to continue after the Aliyun Cloud Assistant read-only host inventory
```

## Scope

Approved:

```text
define the real controlled-access mechanism required before any TUIC canary activation
add a repository-safe mechanism artifact to the existing dry-run bundle
record the remaining activation blockers after Cloud Assistant host evidence
keep execution authority not_granted
```

Explicitly not approved:

```text
no production subscription-output mutation
no change to config/proxy-servers.json
no production YAML generation or recording
no public subscription URL generation
no Aliyun runtime mutation
no Aliyun provider firewall mutation
no host firewall mutation
no Cloud Assistant command invocation
no DNS mutation
no Nginx mutation or reload
no systemd restart
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
IDs, exact management-source values, raw channel endpoints, host names, raw
ports, or YAML were recorded.

## Inputs

Resolved prerequisite:

```text
docs/production-replacement-records/2026-05-28-aliyun-cloud-assistant-tuic-host-inventory.md
```

Existing dry-run bundle:

```text
docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/
```

New mechanism artifact:

```text
docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/controlled-access-mechanism.json
```

The mechanism artifact is summary-only. It records control points, rollback
points, hard stops, and not-authorized actions. It does not contain real node
hosts, ports, credentials, subscription URLs, tokens, YAML, customer data, or
runtime config.

## Mechanism Decision

The first TUIC subscription-output activation, if later separately approved,
must be a one-controlled-access canary:

```text
candidate: channel-lab-b-tuic
candidate pool: canary
baseline output: unchanged
stable users: unchanged
all-user rollout: not allowed
execution authority in this record: not_granted
```

The activation mechanism must not be a default-pool migration. It must not put
the TUIC candidate into broad stable output. It must not silently expose TUIC to
all existing imports.

## Required Future Activation Mechanics

The later exact-approved activation must define all of these without recording
sensitive values:

```text
1. The controlled access scope.
2. The real config change or equivalent controlled activation mechanism.
3. The previous controlled-access output state.
4. The rollback action that restores the previous output.
5. Fresh Aliyun public-boundary validation.
6. Fresh channel-lab-b runtime health validation.
7. Operator-device import/refresh and short client probe validation.
8. Observation duration and stop conditions.
```

The controlled access may be implemented through whichever production-safe
mechanism is explicitly approved later, such as a narrowly scoped config change
plus operator-only access binding. This record does not choose or execute that
production mechanism.

## Remaining Blockers

Resolved:

```text
Aliyun host-internal evidence: available through Cloud Assistant read-only inventory
TUIC extended measurement: ready_for_operator_decision
repository synthetic config review: ready_for_production_module_branch_review
```

Still blocked:

```text
real controlled-access scope is not recorded
real config or equivalent activation mechanism is not approved
rollback evidence is not recorded
fresh runtime/public-boundary checks for the activation moment are not recorded
exact canary activation approval is not granted
```

## Rollback Model

Rollback for the future activation must be ready before any output change:

```text
remove channel-lab-b TUIC from the controlled access
restore the previous controlled-access output
disable or revoke only test access material if it was created for the canary
confirm public subscription-boundary health remains 200
confirm public Admin remains blocked
confirm no-token subscription refresh remains 401
confirm default stable output was not changed
```

If rollback requires stable-user impact, the activation gate must stop before
any subscription-output mutation.

## Result

```text
TUIC controlled-access activation mechanism: recorded
host-internal evidence gap: resolved
controlled-access activation authority: not granted
current runtime config: unchanged
subscription-output mutation: not performed
edge traffic activation: not performed
all-user rollout: not performed
next step: exact canary activation approval only after controlled scope, real mechanism, rollback evidence, and fresh checks are recorded
```

Recommended later approval phrase:

```text
Approve canary-only TUIC subscription-output activation for channel-lab-b on one controlled operator access. No all-user rollout.
```
