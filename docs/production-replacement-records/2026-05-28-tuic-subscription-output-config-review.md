# TUIC Subscription Output Config Review

Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / canary-only TUIC subscription-output config review branch
```

Approval phrase:

```text
Approve canary-only TUIC subscription-output config review branch for channel-lab-b. No production deployment.
```

## Scope

Approved:

```text
add a repository-only synthetic config review fixture
run activation package tooling against the synthetic review fixture
run channel production module tooling against the synthetic review fixture result
record whether a TUIC canary config shape can pass repository review
keep current runtime config unchanged
```

Explicitly not approved:

```text
no production deployment
no production subscription-output mutation
no change to config/proxy-servers.json
no production YAML generation or recording
no public subscription URL generation
no Aliyun runtime mutation
no Aliyun provider firewall mutation
no host firewall mutation
no Cloud Assistant command creation or invocation
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

No real secrets, tokens, subscription URLs, raw logs, private keys, raw runtime
configs, SQLite rows, credentials, customer data, raw provider-firewall rule
IDs, exact management-source values, raw channel endpoints, or YAML were
recorded. The review fixture uses `.invalid` hosts and review-only placeholder
credential values. It is intentionally not deployable.

## Inputs

Previous dry-run record:

```text
docs/production-replacement-records/2026-05-28-tuic-subscription-output-dry-run-package.md
```

Dry-run bundle:

```text
docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/
```

New review-only config fixture:

```text
docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/proxy-servers-tuic-canary-review.json
```

New review outputs:

```text
docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/activation-package-review-config.json
docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/production-module-review-config.json
```

The current runtime config remains:

```text
config/proxy-servers.json
```

It was not modified in this gate.

## Review Fixture Shape

The review fixture contains:

```text
baseline candidate:
  name: prod-edge-a
  protocol: ss
  role: baseline
  host class: .invalid synthetic placeholder

canary candidate:
  name: channel-lab-b-tuic
  protocol: tuic
  role: canary
  host class: .invalid synthetic placeholder
```

This fixture proves repository tooling behavior only. It must not be deployed
or copied into runtime config.

## Commands

Activation package with current config, from the previous dry run:

```powershell
node scripts/channel-subscription-activation-package.mjs `
  docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/activation-flow-fixture.json `
  config/proxy-servers.json
```

Activation package with review-only config:

```powershell
node scripts/channel-subscription-activation-package.mjs `
  docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/activation-flow-fixture.json `
  docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/proxy-servers-tuic-canary-review.json
```

Production module with review-only activation package:

```powershell
node scripts/channel-production-module.mjs `
  docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/activation-package-review-config.json `
  docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/canary-evidence.json
```

These commands were repository-local only. They did not contact Aliyun, AWS,
channel-lab-b, DNS, Nginx, systemd, SQLite, or any public subscription route.

## Results

Current `config/proxy-servers.json` result:

```text
activation package status: blocked_before_risk_a_subscription_output_activation_request
activation package blocker:
  - missing_subscription_output_config

production module status: blocked_before_production_module_branch_review
production module blockers:
  - activation_package_not_ready
  - candidate_missing_from_activation_package
```

Review-only config fixture result:

```text
activation package status: ready_for_risk_a_subscription_output_activation_request
activation package blockers: none
render proof ready: true
record template ready: true
approval request ready: true
execution authority: not_granted
YAML returned: false

production module status: ready_for_production_module_branch_review
production module blockers: none
short canary passed: true
activation package ready: true
production activation ready: false
execution authority: not_granted
YAML returned: false
```

## Interpretation

The repository tooling can represent the intended TUIC canary config shape and
produce safe review metadata when the canary candidate exists in the config.

The current runtime config is still not ready for activation:

```text
current config: blocked
review-only synthetic config: review-ready
actual production activation: not authorized
```

This means the next production-facing step, if desired, is not all-user rollout.
It is a separate A-tier canary activation gate that must decide whether and how
to add a real `channel-lab-b` TUIC canary candidate for one controlled access.

## Not Performed

```text
no config/proxy-servers.json change
no production subscription output changed
no production YAML generated or recorded
no public subscription URL generated
no Aliyun host command executed
no Cloud Assistant command created or invoked
no DNS, Nginx, systemd, firewall, runtime, or production config changed
no tenant, artifact, SQLite, or customer data changed
no edge traffic activated
no all-user rollout
no channel-lab-b runtime mutation or cleanup
no production authority transfer
```

## Remaining Gates

Still required before any canary activation:

```text
1. Decide whether Aliyun host-internal evidence will be obtained or explicitly
   waived for canary-only output.
2. Replace the synthetic review fixture with a separately approved real
   canary-only subscription-output config change or equivalent controlled
   activation mechanism.
3. Define the controlled access scope without recording secrets, tokens,
   subscription URLs, customer data, or channel credentials.
4. Prove rollback readiness for that controlled access.
5. Request the separate exact A-tier activation approval phrase before any
   subscription-output mutation.
```

Recommended later approval phrase:

```text
Approve canary-only TUIC subscription-output activation for channel-lab-b on one controlled operator access. No all-user rollout.
```

## Conclusion

```text
TUIC subscription-output config review: completed
current config: blocked by missing_subscription_output_config
review-only config fixture: ready_for_production_module_branch_review
production deployment: not performed
subscription-output mutation: not performed
production activation authority: not granted
next step: host-internal evidence / waiver decision, then exact canary activation approval if continuing
```
