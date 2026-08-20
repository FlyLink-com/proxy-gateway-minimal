# TUIC Subscription Output Dry-Run Package


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: tuic_subscription_output_dry_run_package
  superseded_by: null
  last_verified_at: 2026-05-28
  production_authority: false
```


Date: 2026-05-28, Asia/Shanghai.

Risk:

```text
A / canary-only TUIC subscription-output activation dry-run package
```

Approval phrase:

```text
Approve canary-only TUIC subscription-output activation dry-run package for channel-lab-b. No production mutation.
```

## Scope

Approved:

```text
build a repository-safe activation-flow fixture
run subscription activation package tooling against current local repository config
run channel production module tooling against the generated package
record safe package metadata and blockers
record that no production mutation was performed
```

Explicitly not approved:

```text
no production subscription-output mutation
no public subscription URL generation
no production YAML generation or recording
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
IDs, exact management-source values, raw channel endpoints, or YAML were
recorded.

## Inputs

Planning record:

```text
docs/production-replacement-records/2026-05-28-tuic-subscription-output-canary-planning.md
```

Dry-run package bundle:

```text
docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/
```

Bundle files:

```text
manifest.json
activation-flow-fixture.json
canary-evidence.json
activation-package-current-config.json
production-module-current-config.json
```

Activation-flow intent:

```text
baseline candidate: prod-edge-a / ss / stable
canary candidate: channel-lab-b-tuic / tuic / weak-network
canary evidence: 180/180 successful operator-device samples, 0 failures, 0 local error-like log lines
execution authority: not_granted
```

The current local repository config source was:

```text
config/proxy-servers.json
```

The local process used a dummy in-process password environment value only to
allow local config validation. No production secret was loaded, copied, printed,
or recorded.

## Commands

The activation-flow fixture and canary evidence were generated through the
repository service layer:

```powershell
node <inline repository service invocation>
```

The activation package was generated with:

```powershell
node scripts/channel-subscription-activation-package.mjs `
  docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/activation-flow-fixture.json `
  config/proxy-servers.json
```

The production module package was generated with:

```powershell
node scripts/channel-production-module.mjs `
  docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/activation-package-current-config.json `
  docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/canary-evidence.json
```

These commands were local repository dry-run commands only. They did not
contact Aliyun, AWS, channel-lab-b, Nginx, systemd, DNS, SQLite, or any public
subscription route.

## Results

Activation-flow fixture:

```text
mode: channel-subscription-activation-flow-fixture/v1
flow status: ready_for_a_tier_subscription_output_activation_request
blockers: none
execution authority: not_granted
```

Activation package against current repository config:

```text
mode: channel-subscription-activation-package
status: blocked_before_risk_a_subscription_output_activation_request
blockers:
  - missing_subscription_output_config
render proof ready: false
record template ready: true
approval request ready: false
execution authority: not_granted
YAML returned: false
```

Production module package:

```text
mode: channel-production-module
status: blocked_before_production_module_branch_review
blockers:
  - activation_package_not_ready
  - candidate_missing_from_activation_package
short canary passed: true
activation package ready: false
production activation ready: false
execution authority: not_granted
YAML returned: false
```

## Interpretation

The dry-run did not fail because of TUIC measurement quality. It failed closed
because the current repository subscription-output config does not contain the
`channel-lab-b-tuic` canary candidate required by the activation-flow fixture.

That is the correct result for this gate:

```text
TUIC runtime evidence: sufficient for planning
current subscription-output config: not ready for canary activation
production module branch review: blocked
actual subscription-output activation: not authorized
```

## Not Performed

```text
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
1. Decide whether Aliyun host-internal inventory will be obtained or explicitly
   waived for canary-only output.
2. Prepare a separate canary-only subscription-output config review branch or
   equivalent controlled config package that adds the `channel-lab-b-tuic`
   candidate without deploying it.
3. Re-run the activation package dry-run against that controlled config.
4. Prove rollback readiness for the controlled canary access.
5. Request the separate exact A-tier activation approval phrase before any
   subscription-output mutation.
```

Recommended next approval phrase for repository-only config review:

```text
Approve canary-only TUIC subscription-output config review branch for channel-lab-b. No production deployment.
```

Recommended later approval phrase for actual canary activation remains:

```text
Approve canary-only TUIC subscription-output activation for channel-lab-b on one controlled operator access. No all-user rollout.
```

## Conclusion

```text
TUIC subscription-output dry-run package: executed
activation package: blocked_before_risk_a_subscription_output_activation_request
primary blocker: missing_subscription_output_config
production module: blocked_before_production_module_branch_review
subscription-output mutation: not performed
production activation authority: not granted
next step: canary-only config review branch or explicit stop
```
