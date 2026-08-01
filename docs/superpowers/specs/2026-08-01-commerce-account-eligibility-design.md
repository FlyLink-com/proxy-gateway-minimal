# Commerce Account Eligibility Design

## Status

- Risk: B for repository source and tests.
- Production impact: none from this document or its source PR. A later control-plane deployment remains Risk A.
- Release unit: `control-plane-app`.
- Source baseline: `master@a452fa6f757f8de180259d9b016d3ddae023c447`.

## Problem

The Portal storefront belongs to an active user account. A product purchase may
later create or update the account's single service entitlement, but an
existing service entitlement is not a prerequisite for browsing the catalog.

The current production eligibility reader calls
`resolveAccountServiceEntitlement`. Accounts with no entitlement or multiple
historical current entitlements therefore receive no eligible offers even when
the account is active, is in the Commerce canary, and the production catalog is
published.

## Decision

Separate account-level storefront access from service fulfillment:

1. Catalog eligibility requires an active account, Commerce activation for that
   account, and an exact published offer version.
2. Catalog eligibility does not read or mutate entitlements, access requests,
   issued links, runtime tenants, wallets, orders, or ledger rows.
3. Purchase fulfillment remains fail-closed until it can prove the service
   state required by its existing renewal path. First-service issuance is not
   silently added to this narrow fix; its contract must be implemented and
   reviewed separately if the existing code does not already support it.
4. Historical entitlement archival is separate Risk A data governance and is
   not a storefront activation dependency.

## Alternatives Considered

- Recommended: make storefront eligibility account-level and keep fulfillment
  validation separate. This matches product ownership and lets new or legacy
  accounts browse without weakening fulfillment safety.
- Archive production entitlement duplicates first. Rejected as an activation
  dependency because it couples storefront visibility to historical service
  cleanup and still blocks accounts with no prior service.
- Select one entitlement when duplicates exist. Rejected because it guesses at
  customer service state and hides data debt inside a read path.

## Data Flow

```text
active account + Commerce cohort + published offer
  -> offer is visible
  -> authenticated account chooses an offer
  -> wallet/order coordinator validates and records the purchase
  -> fulfillment creates or updates the account's service entitlement
```

Only the first arrow changes in this PR. Wallet debit, order persistence,
idempotency, service issuance/renewal, and runtime delivery retain their
existing contracts.

## Failure Behavior

- Missing, inactive, suspended, or disabled account: offer is unavailable.
- Account outside the Commerce cohort: offer is unavailable.
- Unknown or unpublished offer version: offer is unavailable.
- Missing or ambiguous historical entitlement: does not affect catalog
  visibility, but existing fulfillment validation may still reject checkout.
- Dependency errors remain fail-closed and do not expose internal state.

## Tests

Focused tests must prove that:

- an active activated account with multiple current entitlements can see a
  published offer;
- an active activated account with no entitlement can see a published offer;
- inactive accounts, non-activated accounts, and unknown offers remain denied;
- catalog reads create no entitlement, wallet, order, ledger, or fulfillment
  mutation;
- existing fulfillment reconciliation tests remain unchanged and passing.

Repository validation follows the server/shared-source baseline: focused Node
tests, `npm test`, and `git diff --check origin/master...HEAD`.

## Non-goals

- No production data archive or migration.
- No Wallet schema, balance initialization, or ledger change.
- No order, pricing, immutable catalog, payment provider, callback, or canary
  configuration change.
- No Portal static change or second storefront implementation.
- No first-service fulfillment redesign hidden inside catalog eligibility.
