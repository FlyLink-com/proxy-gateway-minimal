## Summary

<!-- 1-3 sentences. State the intent and the concrete scope. -->

## Issue / Index Card

<!--
PRs are execution summaries and validation receipts. GitHub Issues are durable
index cards for Risk A, multi-PR, source/production drift, archive, or main-lane
work. Use Refs # when this PR contributes to an issue; use Closes # only when
the issue's done criteria are fully satisfied.
-->

- Issue: None / Refs # / Closes #
- Issue role: none / index card / epic / A-tier gate
- Close behavior: refs only / closes when done criteria are complete

## Agent / Task Routing

- Lead agent:
- Supporting agents used: None / list names and scope
- Primary unit:
- Secondary units:
- Follow-up agent suitability:
- Recommended next owner:

## Risk

<!-- If sequencing matters, add Priority: P0/P1/P2 and a brief reason here.
Otherwise omit it. Priority does not change Risk or grant approval. -->

- Risk: A / B / C
- Process:
- Expected PR count:
- Production/AWS/Aliyun impact:
- Runtime/node/DNS/traffic impact:
- Auth/schema/migration impact:
- Secrets or customer-data handling:
- Approval status:

## Identity Impact

<!--
Identity is an impact dimension, not a release unit. Set true only when the
change can alter runtime principals or their mapping to stable accounting
references. Do not include UUIDs, credential references, controller payloads,
raw config, database rows, or customer data. See docs/IDENTITY_LIFECYCLE.md.
-->

- identity_impact: false / true
- identity_gate: Not applicable / surface + pending state / aggregate result

## Execution

<!-- List the actual code, docs, tests, or approved no-op/inventory performed. -->

## Validation

<!-- Check only what applies and replace placeholders with actual results.
Separate new runs, verified reused evidence, and unverified items, with their
source/time/scope where relevant. Keep Source/Artifact/Release/Deployment/Runtime
evidence distinct; add task-specific business acceptance only when applicable.
For an execution packet, core CI alone does not validate changed wrappers,
parsers, guards or controllers. Use this section, not a second status report. -->

- [ ] `git diff --check origin/master...HEAD`
- [ ] `npm run project-state:check` (required for `project-state/` or checker changes)
- [ ] Targeted tests:
- [ ] `npm test` (server/shared code or B-tier repo tooling)
- [ ] `npm run admin:test` (Admin UI changes)
- [ ] `npm run admin:build` (Admin UI changes)
- [ ] Manual CI lane:
- [ ] Risk A runbook-specific validation:
- [ ] Identity Gate declaration/evidence reviewed (`identity_impact: true` only)

Result:

## Deploy Note

<!-- Only fill this section after a production deploy, rollback, or static
replacement. Leave as "Not deployed" otherwise. -->

- deployed_at: Not deployed
- release_unit:
- source_commit:
- artifact_or_release:
- target:
- backup:
- validation:
- identity_gate: Not applicable / aggregate before-after result

## Remaining Gates

<!-- Name future work or approval gates. Say "None" only when no required work remains for this PR scope. -->

- None / next gate:
