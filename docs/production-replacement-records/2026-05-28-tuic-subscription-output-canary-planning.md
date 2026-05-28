# TUIC Subscription Output Canary Planning

Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / canary-only TUIC subscription-output activation planning
```

Approval phrase:

```text
Approve canary-only TUIC subscription-output activation planning for channel-lab-b. No mutation.
```

## Scope

Approved:

```text
define canary-only TUIC subscription-output activation gates
define the controlled canary shape for channel-lab-b
define required preflight evidence before any activation
define future dry-run and activation approval phrases
define rollback, observation, cleanup, and hard-stop boundaries
record that this is planning only
```

Explicitly not approved:

```text
no subscription-output mutation
no public subscription URL generation
no production YAML generation
no Aliyun runtime mutation
no Aliyun provider firewall mutation
no host firewall mutation
no Cloud Assistant command creation or invocation
no DNS mutation
no Nginx mutation or reload
no systemd restart
no production config mutation
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
IDs, exact management-source values, or channel endpoint details are recorded
in this plan.

## Inputs

Repository capability:

```text
PR #257: channel production module entered master
production-module output: branch review metadata only
subscription-output activation authority: not granted by repository tooling
```

Channel candidate evidence:

```text
channel-lab-b runtime:
  docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-runtime.md

short operator-device canary:
  docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-operator-device-canary.md

extended operator-device measurement:
  docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-extended-measurement.md
```

Current TUIC decision evidence:

```text
sample windows: 3
samples per window: 60
total samples: 180
success samples: 180
timeout samples: 0
local Mihomo error-like lines: 0
bundle status: ready_for_decision
investigation status: ready_for_operator_decision
recommended next action: prepare_risk_a_canary_gate
```

Aliyun integration evidence:

```text
baseline integration inventory:
  docs/production-replacement-records/2026-05-28-aliyun-tuic-subscription-output-integration-inventory.md

host/provider follow-up inventory:
  docs/production-replacement-records/2026-05-28-aliyun-tuic-host-provider-inventory.md
```

Current Aliyun posture:

```text
public subscription boundary: behaviorally healthy on 80/443
public Admin: blocked at the public boundary
3456/18080: not provider-open and closed_or_timeout from HP vantage
host-internal inventory: still blocked over SSH
Cloud Assistant: available but not invoked
```

## Planning Decision

The TUIC candidate has enough operator-device evidence to plan a canary-only
subscription-output activation path.

This does not make TUIC production-ready for all users. It only means the next
work can be a tightly scoped activation gate for one controlled operator access
or equivalent controlled canary access, after preflight evidence is refreshed.

## Canary Shape

The first activation, if separately approved later, should be:

```text
target: channel-lab-b TUIC only
scope: one controlled operator access or equivalent controlled canary access
entry model: existing subscription/import control plane
output model: canary-only TUIC node output for that controlled access
stable users: unchanged
all-user output: not changed
DNS: unchanged
Aliyun public boundary: unchanged
channel-lab-b runtime: unchanged unless a later runtime gate approves mutation
```

The canary must not be implemented as a broad default node-pool change. It must
not silently move stable subscription output to TUIC.

## Required Preconditions Before Activation

Before any future canary activation PR or execution record can be marked ready:

```text
1. PR #258 or its successor records must be reviewed and merged.
2. Aliyun public boundary health must be freshly rechecked.
3. Aliyun host-internal service/SQLite/Nginx evidence must be obtained, or the
   operator must explicitly accept a documented waiver for canary-only output.
4. channel-lab-b runtime health must be freshly checked read-only.
5. channel-lab-b cleanup/retain window must be stated.
6. The canary access scope must be named without recording secrets, tokens,
   subscription URLs, customer data, or endpoint credentials.
7. The activation package must be generated through repository-safe tooling and
   return only redacted review metadata.
8. Rollback steps must be available before the first subscription-output change.
```

The host-internal evidence gap is still real. This plan allows the next gate to
decide between read-only host-internal inventory and an explicit limited waiver;
it does not decide that waiver here.

## Future Dry-Run Gate

Recommended next repository-only dry-run approval phrase:

```text
Approve canary-only TUIC subscription-output activation dry-run package for channel-lab-b. No production mutation.
```

Allowed under that future dry-run:

```text
build a redacted activation-flow fixture
run render-proof tooling against local repository config
run activation-package tooling
run channel production-module tooling
record safe readiness metadata
```

Still not allowed under the dry-run:

```text
no production YAML generation
no subscription-output mutation
no Aliyun runtime mutation
no edge runtime mutation
no public subscription route change
no DNS, Nginx, systemd, firewall, or config mutation
no all-user rollout
```

## Future Activation Gate

Recommended exact approval phrase for a later canary activation:

```text
Approve canary-only TUIC subscription-output activation for channel-lab-b on one controlled operator access. No all-user rollout.
```

That later phrase should authorize only:

```text
create or update the controlled canary output path
validate import/refresh behavior on the operator device
observe canary behavior
record result and rollback readiness
```

It must not authorize:

```text
all-user rollout
default pool migration
DNS mutation
Nginx mutation or reload
Aliyun provider firewall mutation
channel-lab-b runtime mutation
systemd restart
production authority transfer
legacy query-token retirement
broader opaque artifact issuance
```

## Rollback Plan For Future Activation

Rollback must be ready before activation:

```text
1. Remove the TUIC canary output from the controlled access.
2. Restore the previous subscription output for that controlled access.
3. Revoke or rotate only the canary access material if it was created for the
   test and is no longer needed.
4. Confirm stable public subscription boundary remains health=200, public
   Admin=404, and no-token subscription refresh=401.
5. Confirm stable users and all-user output were not changed.
6. Record the rollback result without secrets, URLs, tokens, YAML, or raw logs.
```

If rollback cannot be proven without touching stable users, the activation gate
must stop before any subscription-output mutation.

## Observation Plan For Future Activation

Minimum canary observation:

```text
operator-device import or refresh succeeds
controlled canary output contains only the intended TUIC candidate shape
stable non-canary output remains unchanged
short HTTP probe through the controlled TUIC client path succeeds
no public Admin exposure
no unexpected Aliyun listener exposure
no error-like local client log summary above the agreed threshold
```

The observation record must store only aggregate and redacted evidence.

## Hard Stops

Stop before activation if any of these are true:

```text
Aliyun public health fails
public Admin returns anything other than blocked behavior
Aliyun host-internal evidence remains unavailable and no explicit waiver exists
channel-lab-b runtime health cannot be refreshed read-only
activation package exposes raw hosts, ports, URLs, credentials, YAML, tokens,
or customer data in repository output
rollback cannot be performed without stable-user impact
the requested scope expands beyond one controlled canary access
```

## Result

```text
TUIC subscription-output canary planning: recorded
activation authority: not granted
production subscription-output mutation: not performed
edge traffic activation: not performed
all-user rollout: not performed
next gate: dry-run package or host-internal evidence / waiver decision
```

## Recommended Next Actions

```text
1. Decide whether to refresh Aliyun host-internal evidence through SSH access
   remediation or a separate Cloud Assistant read-only host inventory gate.
2. If the operator accepts the remaining host-internal risk for canary-only
   output, record the waiver explicitly before activation.
3. Run the canary-only TUIC subscription-output activation dry-run package.
4. Only after dry-run review, request the separate exact canary activation
   approval phrase.
5. Keep DNS changes, Nginx changes, all-user rollout, production authority
   transfer, and channel-lab-b cleanup separately gated.
```
