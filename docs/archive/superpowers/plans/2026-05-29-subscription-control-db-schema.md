# Subscription Control Database Schema Plan

## Risk

B - repository-only service, tests, and docs. No production database migration,
no Aliyun mutation, no tenant/artifact mutation, no DNS, no Nginx, no public
Admin.

## Intent

Introduce a required business-control database layer that records account,
entitlement, issuance, safe runtime references, quota/device state, revocation,
and audit facts separately from the technical subscription runtime store.

## Implementation

1. Add a SQLite-backed platform service under
   `server/services/platform/subscription-control-db.mjs`.
2. Add focused tests covering lifecycle persistence and sensitive-field
   rejection.
3. Document the boundary in `docs/SUBSCRIPTION_CONTROL_DATABASE.md`.
4. Update project context and structured state so future work treats this layer
   as the business authority for subscription issuance.

## Validation

```powershell
node --test server\tests\platform-subscription-control-db.test.mjs
npm test
npm run project-state:check
git diff --check origin/master...HEAD
```

## CLI Integration

The real issuance CLI is wired to require `--control-db-path` during execution
and to persist safe business-control rows when a tenant/artifact is created.
Dry-run mode still performs no mutation.

## Follow-Up

Any production control-database migration, backfill, or Aliyun state write
remains A-tier.
