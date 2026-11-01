# Server-authoritative Google Ads consent

Status: Draft / source-only. This document does not authorize production schema creation, feature-flag enablement, deployment, or Google Ads delivery.

## Decision model

The Portal consent endpoint is the only source of truth for the account-level `ad_user_data` decision:

- `GET /api/portal/ads-consent` reads the decision for the account resolved from the authenticated Portal session.
- `POST /api/portal/ads-consent` accepts exactly `{ "adUserData": true | false }`.
- The request cannot choose an account. The route derives `accountRef` from `requirePortalSession()`.
- `ad_personalization` is structurally fixed to `false`; no route input can enable it.
- The decision is account-scoped and remains effective across Portal sessions until the account changes it.
- A client-supplied `adsClick.consent` descriptor is not authorization. Click values are persisted only when the server-side account decision is currently granted and the descriptor itself is valid.

The account reference is an internal account key, not an anonymous identifier. The consent table stores no email, phone, IP address, click ID, browser cookie, session credential, or raw request body.

## Revocation

A transition to `adUserData: false` is processed in one SQLite transaction:

1. Change the account decision to denied.
2. Replace any linked click claim with a value-free `invalid_click` tombstone.
3. Null the click type, click value, click timestamp, and consent bits from the claim.
4. Delete the corresponding click-binding rows.
5. Mark pending conversion outbox rows as `skipped / consent_revoked` so they cannot be uploaded.
6. Delete the non-sensitive order/account linkage rows.

The response contains aggregate counts only. It never returns order references or click values. Repeating the same withdrawal is idempotent and reports zero additional deletions.

Outbox rows are not deleted by this operation. They contain transaction/order references and remain subject to a separate finance, audit, and privacy retention decision. This change does not claim that those rows are anonymous.

## Feature gate and schema boundary

- `ADS_CLICK_BINDING_ENABLED` remains default-off.
- The consent SQLite connection is composed only when the Ads feature gate is explicitly enabled and the normal Coin Commerce store owns the control database path.
- Opening that existing database does not create consent tables.
- Consent tables are created only by an explicit authenticated consent write while the feature gate is enabled.
- When the feature gate is off, reads return `unknown`, writes are no-ops, and no consent schema is created.
- No production database is opened or migrated by this Draft PR. No deployment or flag change is part of this work.

## Frontend integration dependency

PR #815's consent UI must call the Portal endpoint after an authenticated account is available and hydrate the server decision before attempting click-ID measurement. Until that integration is merged and verified, the backend fails closed: a client preference alone cannot authorize click-ID persistence.

## Validation

The source tests use only in-memory SQLite databases and synthetic identifiers. They cover:

- unknown-by-default behavior and no schema creation while disabled;
- authenticated Portal account scoping;
- rejection of client-supplied account references and non-boolean decisions;
- server-side grant as a prerequisite for click-ID persistence;
- revocation redaction of claims and bindings;
- stopping pending outbox rows;
- aggregate-only revocation results and idempotent repeated withdrawal.

Production validation, legal review, schema approval, Cloudflare/Nginx log review, and all feature activation remain separate Risk A gates.
