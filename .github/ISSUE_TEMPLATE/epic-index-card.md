---
name: Epic / Index Card
about: Track multi-PR, A-tier, source/production drift, or long-running work
title: "Epic: "
labels: ""
assignees: ""
---

<!--
Use this issue as an index card when the work needs durable tracking.

Create one for:
- Risk A work or any production/runtime/deploy/rollback gate.
- Work expected to span more than one PR.
- Source/production drift reconciliation.
- Archive, stale-branch, or historical-version cleanup.
- Main lanes such as payment, auth, user portal, traffic accounting, or data
  plane integration.

Small single-PR Risk B/C work may skip an issue when the PR body is enough.
Do not include secrets, raw configs, subscription URLs, credentials, SQLite
rows, customer data, or provider tokens.
-->

## Goal

<!-- State the user-visible or operator-visible outcome. -->

## Risk

- Risk: A / B / C
- Production/runtime impact: none / read-only / mutation gated separately
- Secrets/customer-data posture:

## Scope

<!-- What this index card owns. -->

## Not Included

<!-- Explicitly list tempting adjacent work that is outside this card. -->

## Source / Production Drift

- State: aligned / drift / runtime-only / artifact-only / unknown
- Current source evidence:
- Current runtime evidence:
- Required reconciliation:

## Required PRs

- [ ] PR 1:
- [ ] PR 2:

## Validation

<!-- Name required checks or runbooks without pasting raw sensitive output. -->

- [ ] Validation command or gate:

## Done Criteria

<!-- Use objective, checkable closure criteria. -->

- [ ] Source state is merged or intentionally archived.
- [ ] Runtime or production state is validated or explicitly out of scope.
- [ ] Required docs, records, or closeout notes are updated.
- [ ] Remaining follow-up work is linked to a new issue or PR.

## Links

- Related PRs:
- Runbooks or records:
- Follow-up issues:
