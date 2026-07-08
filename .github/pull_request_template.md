## Summary

<!-- 1-3 sentences. State the intent and the concrete scope. -->

## Agent / Task Routing

- Lead agent:
- Supporting agents used: None / list names and scope
- Primary unit:
- Secondary units:
- Follow-up agent suitability:
- Recommended next owner:

## Risk

- Risk: A / B / C
- Process:
- Expected PR count:
- Production/AWS/Aliyun impact:
- Runtime/node/DNS/traffic impact:
- Auth/schema/migration impact:
- Secrets or customer-data handling:
- Approval status:

## Execution

<!-- List the actual code, docs, tests, or approved no-op/inventory performed. -->

## Validation

<!-- Check only what applies and replace placeholders with actual results. -->

- [ ] `git diff --check origin/master...HEAD`
- [ ] `npm run project-state:check` (required for `project-state/` or checker changes)
- [ ] Targeted tests:
- [ ] `npm test` (server/shared code or B-tier repo tooling)
- [ ] `npm run admin:test` (Admin UI changes)
- [ ] `npm run admin:build` (Admin UI changes)
- [ ] Manual CI lane:
- [ ] Risk A runbook-specific validation:

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

## Remaining Gates

<!-- Name future work or approval gates. Say "None" only when no required work remains for this PR scope. -->

- None / next gate:
