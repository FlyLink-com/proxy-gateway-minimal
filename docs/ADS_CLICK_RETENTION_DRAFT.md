# Google Ads click-ID retention operation

Status: Draft / source-only. The operation is not wired to startup, a scheduler, an API route, or a production CLI.

## Retention rule

Raw click identifiers in `platform_ads_click_claims` and `platform_ads_click_bindings` have a maximum storage age of 90 days from server-side capture time (`created_at`). The boundary is inclusive: a row with `created_at <= now - 90 days` is eligible.

## Apply behavior

The operation requires an injected SQLite database handle and an explicit `apply: true` call. It never opens a database path and never creates schema.

For eligible click claims it:

1. Replaces the claim with a value-free `invalid_click` tombstone, clearing click type, click value, click timestamp, and consent bits.
2. Deletes corresponding raw click bindings.
3. Deletes the non-sensitive order/account linkage rows introduced by the consent gate.
4. Marks pending outbox rows `skipped / click_retention_expired`, preventing a late retry from using expired click data.
5. Leaves the outbox row itself intact for its separate audit/finance retention policy.

The tombstone preserves first-claim/idempotency semantics without preserving the raw click identifier. Repeated execution is idempotent.

## Dry-run and output

`inspectAdsClickRetention` and `runAdsClickRetention(..., { apply: false })` return aggregate counts only. Results do not include order references, account references, click values, or raw rows. Missing claim schema returns a blocked result and does not create tables.

## Explicitly out of scope

- No production database connection or mutation.
- No scheduled job, cron, Worker, CLI, or startup hook.
- No automatic retention policy for conversion outbox rows.
- No deletion of financial transaction records.
- No legal determination of the appropriate retention period; 90 days is the source-side maximum currently specified for raw click IDs and still requires the separate Risk A privacy review before activation.
