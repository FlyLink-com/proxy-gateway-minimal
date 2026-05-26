# Aliyun Promotion Runbook Readiness

Date: 2026-05-27, Asia/Shanghai.

Risk: C docs-only runbook readiness record.

Branch: `codex/aliyun-promotion-runbook-package-5`

## Boundary

This record closes the repository-only Package 5 design task for the Aliyun
Subscription Control Platform MVP. It prepares the later Risk A promotion path
but does not execute any production operation.

Performed:

```text
updated Aliyun promotion gates in the runbook
separated read-only inventory from mutation gates
made accepted-outage rollback posture explicit
documented state-copy prerequisites
documented public-boundary dry run, DNS promotion, observation, rollback, and
cleanup separation
updated project context and project-state orientation
```

Not performed:

```text
no Aliyun deployment
no DNS change
no public listener exposure
no production traffic movement
no production state copy
no SQLite, tenant, artifact, or subscription output mutation
no Nginx, systemd, UFW, WireGuard, AWS, or security-group mutation
no edge traffic activation
no service restart
no secret, token, subscription URL, private key, SQLite row, or customer data
readout
```

## Agent / Task Routing

Lead agent:

```text
Codex
```

Primary unit:

```text
Production Ops Agent
```

Supporting units:

```text
Subscription Access Agent for state-copy and artifact-boundary language
Validation / CI Agent for Package 5 validation evidence
Lead Agent for project-state and context synchronization
Sidecar Reviewer for read-only Package 5 scope review
```

Follow-up agent suitability:

```text
Production Ops Agent should own the next Risk A live inventory refresh.
Validation / CI Agent can own repo-only validation and HP evidence when code or
clean-host validation is required.
Subscription Access Agent should review any later state-copy or artifact
promotion plan before execution.
```

## Design Outcome

The runbook now treats promotion as seven gates:

```text
Gate 0: Repo-Only Runbook PR
Gate A: Live Inventory Refresh
Gate B: Source Access Or Source-State Decision
Gate C: Private State-Copy Validation
Gate D: Public Boundary Dry Run
Gate E: DNS And Production Distribution Promotion
Gate F: Observation, Rollback, And Cleanup Decision
```

The key design correction is rollback posture. Earlier promotion language could
be read as if rollback were a direct return to a currently running
`prod-edge-a`. Current project context records an accepted outage after the
Singapore stop-only cleanup, with `prod-edge-a` and `prod-edge-b` stopped.
Therefore the promotion runbook now requires a fresh rollback-source decision:

```text
accepted-outage rollback
rollback-start-needed
live-source-ready
clean-start authority accepted
```

The runbook does not let stale 2026-05-26 state-copy preflight evidence stand
in for current production facts. Later A-tier work must refresh live Aliyun,
AWS, DNS, endpoint, firewall, Nginx, service, and SQLite posture before it can
mutate anything.

## Validation Scope

This was a docs/project-state package. Validation should prove the repository
state is internally consistent, not that Aliyun is deployed.

Required for this PR:

```text
npm run project-state:check
git diff --check origin/master...HEAD
```

Not required for this PR:

```text
HP ci-full
npm test
npm run admin:test
npm run admin:build
```

Those broader validations remain appropriate for B-tier code/UI changes or
when clean-host validation is explicitly requested.

## Next Gate

The next executable Risk A gate should be one of:

```text
Aliyun promotion Gate A live inventory refresh
prod-edge-a source access / source-state planning
clean edge node rebuild planning
rollback-start planning for stopped AWS Singapore nodes if temporary restore is
needed
```

None of those gates is approved by this record.
