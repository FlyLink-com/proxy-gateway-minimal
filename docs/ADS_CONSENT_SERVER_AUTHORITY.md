# Server-authoritative Google Ads consent

Status: Draft / source-only. This document does not authorize production schema creation, feature-flag enablement, deployment, or Google Ads delivery.

## Decision model

The Portal consent endpoint is the only source of truth for the account-level `ad_user_data` decision:

- `GET /api/portal/ads-consent` reads the decision for the account resolved from the authenticated Portal session.
- `POST /api/portal/ads-consent` accepts exactly `{ "adUserData": true | false }`.
- The request cannot choose an account. The route derives `accountRef` from `requirePortalSession()`.
- `ad_personalization` is structurally fixed to `false`; no route input can enable it.
- The decision is account-scoped and remains effective across Portal sessions until the account changes it.
- The server decision timestamp must be no later than the purchase's transaction timestamp; a grant arriving after purchase commit cannot retroactively authorize that order, including during the post-commit measurement step.
- A client-supplied `adsClick.consent` descriptor is not authorization. Click values are persisted only when the server-side account decision is currently granted and the descriptor itself is valid.

The account reference is an internal account key, not an anonymous identifier. The consent table stores no email, phone, IP address, click ID, browser cookie, session credential, or raw request body.

## Grant and revocation

A newly granted server decision does not retroactively authorize older browser-only claims. During the first grant, any existing click claim without a server-created order/account consent link is compacted to a value-free tombstone, its binding is deleted, and any pending outbox row is skipped as `consent_unverified`.

A transition to `adUserData: false` is processed in one SQLite transaction:

1. Change the account decision to denied.
2. Replace every raw click claim for the account, including pre-ledger legacy claims, with a value-free `invalid_click` tombstone.
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

## Browser and Portal consent boundaries

- The public-site preference is browser-scoped and remains in the site consent cookie. The public-site UI is the only surface that writes it; capture and handoff code may read it as a browser-side prerequisite. Portal account-consent hydration and submission must never change it.
- Portal account consent is account-scoped and authoritative only through the authenticated Portal endpoints. Portal hydration and account-choice submission must never write the public-site cookie.
- The two decisions are independent: public-site consent is required before capturing and handing off a click ID; Portal account consent is separately required before the server persists a purchase claim. A browser preference alone never authorizes a server-side claim.
- The Portal UI hydrates the account decision after authentication and keeps the current decision in page memory for purchase gating. A denied or unknown server decision clears the Portal click handoff without changing the site preference.
- The deferred wallet-first path exposes the committed transition timestamp as canonical UTC ISO text. The store strictly converts that value to epoch milliseconds before comparing it with the consent ledger's numeric timestamp; malformed values fail closed. A grant later than the purchase transaction cannot authorize that order.

## Validation

The source tests use only in-memory SQLite databases and synthetic identifiers. They cover:

- unknown-by-default behavior and no schema creation while disabled;
- authenticated Portal account scoping;
- rejection of client-supplied account references and non-boolean decisions;
- server-side grant as a prerequisite for click-ID persistence;
- deferred wallet-first timestamp normalization, including rejection of a grant later than the purchase transaction;
- independent Portal account consent and public-site browser preference, including hydration and submission without cross-writing;
- revocation redaction of claims and bindings;
- stopping pending outbox rows;
- aggregate-only revocation results and idempotent repeated withdrawal.

Production validation, legal review, schema approval, Cloudflare/Nginx log review, and all feature activation remain separate Risk A gates.
