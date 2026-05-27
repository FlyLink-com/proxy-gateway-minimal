# Access Model Inventory Summary

Date: 2026-05-27

## Status

```text
Risk: B / repo-only tooling
Production impact: none
Aliyun impact: none
DNS/Nginx/systemd/firewall impact: none
Artifact issuance: not performed
Legacy query-token retirement: not performed
```

This document defines the repository helper for converting operator-provided
subscription-access inventory facts into a safe summary artifact for later
Risk A preflight review.

It does not query Aliyun, read SQLite, issue opaque artifacts, rotate or retire
legacy tokens, change subscription output, mutate runtime state, or connect to
production.

## Purpose

The future opaque artifact issuance and legacy query-token retirement gates need
fresh inventory evidence, but the evidence must not put raw subscription URLs,
tokens, artifact secrets, customer identifiers, credentials, or SQLite rows into
terminal output, PRs, docs, or chat.

The helper provides a narrow local contract:

```text
safe operator JSON
  -> normalized access-model inventory summary
  -> blocker list for artifact-issuance preflight
```

## Entry Points

Programmatic API:

```js
import { buildAccessModelInventorySummary } from "proxy-gateway-minimal";
```

CLI:

```powershell
npm run platform:access-inventory-summary -- path\to\safe-inventory.json
```

## Accepted Input Shape

Only these top-level fields are accepted:

```text
generatedAt
tenantCounts
artifactCounts
temporaryLinkCounts
legacyRoute
publicBoundary
loggingPosture
notes
```

The input is expected to contain counts, booleans, and safe note labels only.
Unknown fields are rejected with a generic safe-summary error that does not echo
the submitted value.

## Output Summary

The output includes:

```text
readiness.artifactIssuanceInventoryReady
readiness.blockers
tenantCounts
artifactCounts
temporaryLinkCounts
legacyRoute
publicBoundary
loggingPosture
safety
```

The `safety` section always states:

```text
summaryOnly: true
noRuntimeMutation: true
noProductionMutation: true
noArtifactIssuance: true
noLegacyTokenRetirement: true
```

## Blockers

The helper reports blockers when the safe input does not prove:

```text
legacy query-token route is still present
no-token legacy refresh is rejected
public subscription boundary health is verified
public Admin is blocked
app port is not publicly reachable
private Nginx port is not publicly reachable
artifact-path log redaction is present
application raw secret logging was not observed
```

These blockers are advisory preflight evidence only. They do not grant
permission to fix runtime state.

## Sensitive Output Rules

Do not pass or record:

```text
raw subscription URLs
raw artifact URLs
raw artifact secrets
tokens
customer emails
SQLite rows
credentials
raw logs containing sensitive values
```

If those values are needed for a real gate, inspect them only inside the
approved A-tier execution boundary and record non-secret summaries.

## Relationship To A-Tier Gates

This helper supports the common read-only preflight in:

```text
docs/production-replacement-records/2026-05-27-opaque-artifact-issuance-and-legacy-token-retirement-runbook.md
```

It is not a replacement for that runbook. The broader opaque artifact issuance
and legacy query-token retirement gates still require their own exact approval
phrases, live inventory, validation, rollback posture, and execution records.
