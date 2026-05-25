# Operator Lab Promotion Checklist

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Operator Lab promotion checklist
> - Risk: C for this document
> - Execution authority: Does not authorize production, CI, staging, AWS,
>   DNS, Nginx, HTTPS, systemd, production config, node, tenant, artifact,
>   secret, SQLite, deploy, or cutover changes
> - Production impact: None

## Purpose

Define what evidence is sufficient to propose promoting an Operator Lab
finding into another unit. Operator Lab produces evidence — it does not
become runtime authority by default.

## General Promotion Requirements

Any finding proposed for promotion must:

```text
[ ] Have redacted, reproducible evidence (not just one observation).
[ ] Clearly state which target unit would receive the finding.
[ ] Identify the interface through which the finding flows.
[ ] Include a risk assessment (C / B / A).
[ ] List what would break if the finding is wrong.
```

## Unit-Specific Requirements

### → Product Business

Target: user-facing behavior, workflow, or acceptance criteria change.

```text
Sufficient evidence:
  [ ] User-visible behavior observed (not internal implementation detail).
  [ ] Reproduced without production-side state changes.
  [ ] Does not depend on a single operator's local configuration.
  [ ] Linked to a specific product requirement or workflow.

Insufficient:
  - "It worked once on my machine."
  - Internal counter or log without user-facing impact.
  - Findings that require production secrets to reproduce.
```

### → Local Client

Target: Local Edge Agent adapter, Clash/Mihomo integration, or local path.

```text
Sufficient evidence:
  [ ] Reproduced on a clean local setup (not the operator's daily machine).
  [ ] Channel behavior is understood and documented.
  [ ] Failure classes are classified using diagnostics.mjs contract.
  [ ] Does not conflate HP Relay with official Local Edge Agent runtime.
  [ ] Edge tunnel behavior is separated from direct-tcp behavior.

Insufficient:
  - HP Relay success treated as "agent works."
  - Channel_profile experiments without diagnostics snapshots.
  - Loopback-only results assumed to hold for remote edges.
```

### → Edge / Node Capacity

Target: node health, readiness, capacity, or mesh membership.

```text
Sufficient evidence:
  [ ] Path research is reproducible outside the operator's environment.
  [ ] Edge node identity boundaries are respected (no shared secrets).
  [ ] Evidence does not mutate AWS, DNS, Nginx, systemd, or security groups.
  [ ] A separate Risk A runbook exists before any node change.

Insufficient:
  - HP Relay used as a node health check.
  - "prod-edge-c" claims based on local experiments.
  - Edge tunnel diagnostics treating operator lab as node authority.
```

### → Validation / CI

Target: repository test or validation script.

```text
Sufficient evidence:
  [ ] Hypothesis is expressed as a testable assertion.
  [ ] Reproduction steps are mechanical (not operator-dependent).
  [ ] Existing test infrastructure can run the new test.
  [ ] Secrets and production endpoints are not required.

Insufficient:
  - "My manual test passed" without a repo test.
  - Tests that depend on live production endpoints.
  - Alignment with CI workflows that are blocked by billing.
```

### → Production Operations

Target: runbook, deployment, rollback, or production state change.

```text
Sufficient evidence:
  [ ] A separate Risk A runbook exists with operator approval.
  [ ] Read-only production inventory was verified before the proposal.
  [ ] Rollback plan is documented.
  [ ] Endpoint verification is scripted and reviewable.

Insufficient:
  - "HP Relay connected to production" treated as approval.
  - Operator Lab findings used to bypass Risk A gates.
  - Evidence that mixes experiment state with production state.
```

## Promotion Decision Record

Use this template for any proposed promotion:

```markdown
## Promotion Proposal: [title]

| Field | Value |
|---|---|
| Proposal date | YYYY-MM-DD |
| Operator Lab observation ref | [link to evidence] |
| Target unit | Product / Local Client / Edge / Validation / Prod Ops |
| Risk tier | C / B / A |
| Interface | [e.g., "Local Client — channel_profile contract"] |

### Evidence Summary

[Concise summary of redacted evidence]

### Pre-Promotion Checklist

[ ] General requirements met?
[ ] Unit-specific requirements met?
[ ] Evidence is redacted and reviewable?
[ ] Risk assessment complete?
[ ] Failure scenarios documented?

### Decision

- [ ] Propose promotion
- [ ] Hold — more evidence needed
- [ ] Reject — incompatible with target unit boundaries

### Approver

[Unit owner or designated reviewer]
```

## Non-Promotable Findings

These findings must NOT be proposed for promotion:

```text
- "HP Relay works as CI." (CI is a different unit.)
- "HP Relay works as staging." (No staging concept currently.)
- "HP Relay can carry customer traffic." (Operator Lab never carries traffic.)
- "HP Relay validated the production node." (Production Ops owns validation.)
- "HP Relay is prod-edge-c." (Edge Node Capacity owns node identity.)
```
