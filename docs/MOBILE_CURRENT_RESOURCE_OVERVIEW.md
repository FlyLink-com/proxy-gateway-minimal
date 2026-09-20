# Mobile current resource overview

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: mobile_current_resource_overview
  superseded_by: null
  last_verified_at: 2026-09-19
  production_authority: false
```

Risk: B source-only. Process: intent, endpoint and tests together. Expected PR count: one small backend dependency for the existing independent mobile PR. Production/AWS impact: none. Auth/schema/migration/identity impact: none (`identity_impact: false`).

Release unit: control-plane-app. Issue: None (bounded source integration). Lead: Codex; Luna assisted browser-session route coverage and source review. No merge or production promotion requested by this draft.

## Contract and source

GET `/api/portal/resources/current/overview` uses the existing Portal session boundary and returns `{resource}` with no-store. It accepts no account or resource selector. `none` and `reconciliation_required` remain distinct. `available` adds an opaque resourceRef plus usage to the existing plan/validUntil/setupAvailable projection.

The same SQLite read snapshot resolves the verified current resource chain, then filters usage samples by account, entitlement, request and existing billing cycle. Usage is the sum of stored deltas, not the latest historical record or raw cumulative counters. Samples beyond the read clock are excluded. No new counters, collector, policy, migrations or stored identities are introduced.

Usage fields: totalBytes, usedBytes, remainingBytes, collectionStatus, updatedAt, cycleStartedAt, cycleEndsAt. Without a sample, used/remaining/updatedAt are null and state is pending. Actual zero is measured_zero. A last observation older than five minutes is labelled stale while preserving the actual value. This label is presentation freshness, not a charging rule.

resourceRef correlates account/request/current transition through a one-way digest. It is not a subscription credential and changes when the applied plan transition changes. Mobile uses it to isolate setup recovery. Private chain identifiers and subscription material are not returned.

## Validation

- Targeted resource effect handler, current projection, overview routes, setup routes and browser-session routes: 35 passed, 0 failed/skipped.
- Real SQLite tests cover none, pending, zero, measured, delayed sample, unrelated account, prior/future cycle and plan switch without old usage leakage.
- Browser-session route tests include the new read path: missing/stale context, cross-origin, logout replay and second-account mismatch remain rejected.
- Mobile opt-in HTTP integration traverses real local store/adapters/SubscriptionCore/escrow, reads the new DTO, reuses handoff after lost response and completes acknowledgement without duplicate resource generation.
- Full Windows `npm test`: 5126 total, 4991 pass, 79 fail, 56 skip. Source-boundary/project-state/path failures need baseline classification before Ready; no full-baseline success claimed.

## Release dependency

Mobile must not be promoted before this endpoint exists on its target backend. Source implementation does not deploy either repository. Existing desktop endpoint remains unchanged; this is not a new dual-frontend framework. No production database/config/node action, migration, merge or deployment in this source batch.
