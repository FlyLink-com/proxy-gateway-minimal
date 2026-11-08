# D1 T2-C3 JSON 26-field Writer/Transform Review v1

> **Status:** Field inventory and dynamic writer-path review completed for 24 active JSON fields. Two passkey credential fields remain explicitly DEFERRED under the future-auth gate. C3 overall remains OPEN for Auth0 identity externalization and C2 keyed-digest replacement.
> **Source of truth:** `docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json` (26 JSON fields).
> **Execution:** Node.js v22.23.1 in isolated non-production Vercel sandboxes; better-sqlite3 12.10.0 / SQLite 3.53.1 for SQLite suites.

## 1. Field-by-field matrix

| # | Source field | Disposition | Writer / transform contract | Dynamic evidence |
|---:|---|---|---|---|
| 1 | `platform_accounts.metadata_json` | TRANSFORM | `accountMetadataJson()` source allowlist; `projectAccountMetadataForD1()` safe target projection gate | `platform-subscription-control-db.test.mjs`; `control-json-contracts.test.mjs` |
| 2 | `platform_issuance_requests.metadata_json` | TRANSFORM | `issuanceMetadataJson()`: CLI, data-pack v1 and Wallet-first chain variants | `platform-subscription-control-db.test.mjs` |
| 3 | `platform_audit_events.metadata_json` | TRANSFORM | `auditMetadataJson()`: entity/action-specific exact unions | `platform-subscription-control-db.test.mjs` |
| 4 | `platform_edge_registered_nodes.channel_refs_json` | KEEP | `safeControlRefList()`: non-empty canonical control refs; deduplicated before serialization | `platform-subscription-control-db.test.mjs` |
| 5 | `platform_edge_registered_nodes.metadata_json` | TRANSFORM | `edgeNodeMetadataJson()`: exact first-boot packet field set and fingerprint format | `platform-subscription-control-db.test.mjs` |
| 6 | `platform_portal_access_requests.event_json` | TRANSFORM | `portalAccessEventJson()`: registered event variants and exact fields | `platform-subscription-control-db.test.mjs`; `control-json-contracts.test.mjs` |
| 7 | `platform_portal_passkey_credentials.public_key_jwk_json` | DEFER | Future-auth credential material; no D1 projection/import in this T2 path | Future-auth gate; credential-summary redaction regression |
| 8 | `platform_portal_passkey_credentials.transports_json` | DEFER | Future-auth credential transport metadata; no D1 projection/import in this T2 path | Future-auth gate; credential-summary redaction regression |
| 9 | `platform_portal_second_factor_challenges.allowed_factors_json` | KEEP | `portalSecondFactorAllowedFactors()`; reader accepts legacy array and v1 `{version, allowedFactors, rememberMe}` envelope | `platform-subscription-control-db.test.mjs`; `platform-portal-browser-sessions.test.mjs` |
| 10 | `platform_coin_commerce_offer_versions.important_notices_zh_json` | KEEP | `normalizeCoinCommerceOffer()` through offer row projection and publish writer | `platform-coin-commerce-store.test.mjs`; `platform-coin-commerce-migrations.test.mjs`; deferred-store suite |
| 11 | `platform_coin_commerce_offer_versions.important_notices_en_json` | KEEP | Same versioned offer contract as field 10 | Same offer/deferred-store suites |
| 12 | `platform_coin_commerce_offer_versions.accepted_coin_types_json` | KEEP | `normalizeCoinCommerceOffer()`: supported coin-type allowlist | Same offer/deferred-store suites |
| 13 | `platform_coin_commerce_quotes.allocation_json` | KEEP | `normalizeAllocation()`: exact item shape, coin-type order, positive units and amount reconciliation | `platform-coin-commerce-store.test.mjs` |
| 14 | `platform_coin_commerce_quotes.before_balance_json` | KEEP | `balanceProjection()` and immutable quote snapshot | `platform-coin-commerce-store.test.mjs` |
| 15 | `platform_coin_commerce_quotes.after_balance_json` | KEEP | `balanceProjection()`, allocation reconciliation and immutable quote snapshot | `platform-coin-commerce-store.test.mjs` |
| 16 | `platform_coin_commerce_orders.offer_snapshot_json` | KEEP | `normalizeStoredOffer()` plus immutable order-snapshot trigger | `platform-coin-commerce-store.test.mjs`; `platform-coin-commerce-migrations.test.mjs` |
| 17 | `platform_coin_commerce_orders.allocation_snapshot_json` | KEEP | `normalizeAllocation()` plus immutable order-snapshot trigger | Same commerce-store/migration suites |
| 18 | `platform_coin_commerce_fulfillment_commands.payload_json` | TRANSFORM | `parseCommandPayload()`: exact keys and equality to order/offer-derived expected payload | `platform-coin-commerce-store.test.mjs` |
| 19 | `platform_referral_policies.policy_json` | KEEP | `policySnapshot()`: exact seven-field policy contract | `platform-portal-referral.test.mjs` |
| 20 | `platform_referral_origins.policy_json` | KEEP | Same `policySnapshot()`; historical origin policy must equal the policy effective at credit time | `platform-portal-referral.test.mjs` |
| 21 | `platform_deferred_resource_transitions.offer_snapshot_json` | KEEP | `normalizeOfferSnapshot()`: offer-version/category/delivery and plan-rank binding | `platform-deferred-resource-transition-store.test.mjs` |
| 22 | `platform_deferred_resource_transitions.allocation_snapshot_json` | KEEP | `normalizeAllocationSnapshot()`: exact five-field allocation items, unique lots, sequential order and amount reconciliation | `platform-deferred-resource-transition-store.test.mjs` |
| 23 | `platform_wallet_first_deferred_checkout_quotes.offer_snapshot_json` | KEEP | Wallet-first quote contract normalizes the immutable published offer snapshot | `wallet-first-deferred-checkout-adapter.test.mjs`; `wallet-first-deferred-checkout-migrations.test.mjs` |
| 24 | `platform_wallet_first_deferred_checkout_quotes.allocation_json` | KEEP | Wallet-first quote contract canonicalizes and reconciles allocation against amount | Same wallet-first adapter/migration suites |
| 25 | `platform_wallet_first_deferred_checkout_quotes.before_balance_json` | KEEP | Wallet-first quote contract projects and persists the before-balance snapshot | Same wallet-first adapter/migration suites |
| 26 | `platform_wallet_first_deferred_checkout_quotes.after_balance_json` | KEEP | Wallet-first quote contract derives and persists the after-balance snapshot | Same wallet-first adapter/migration suites |

## 2. Fixed-runtime regression evidence

All five focused suite groups passed twice. No skipped tests.

| Suite group | Cases per run | Run 1 TAP SHA-256 | Run 2 TAP SHA-256 |
|---|---:|---|---|
| SQLite control-store / account, issuance, audit, edge, Portal event, passkey summary and second-factor writers | 45 | `b7d0e4da530d0b2ae4535adbeeaf27be45c7bb835f0a68c9e76a8d5637ade74a` | `690d044fa2d92675d193827d0bd0192e5c57c80dc54f62da40f27395b23cbc30` |
| JSON contracts + payment-action custody + key escrow + source inventory | 48 | `37f1ab071b3e6915f2f63a90d9bfb139f43f5ce15cf3cd56bf2f253831d3137e` | `66ad182eea46dadcd111c0ca429690d305478fd5e829190b9b8b6cd60fb9392` |
| Commerce offer, quote, order, fulfillment and migration contracts | 113 | `73806fb43b54f55d5ee82ed88cf8597ac97391b3d57a59d7f9a43bd0b80090c5` | `1ab797ea567419899a7ee806d3714046ebe72a62d2de2a59004e66aa923d42ac` |
| Deferred transitions, referral policy/origin, Portal browser and second-factor compatibility | 68 | `720c3d0d58a2aa4094365fe1e84f6259eead9d7650739c417561a0b74686ea22` | `360f1e7e48fa8a3541d1e368b07948512fb355d99ac7da175a1e460b3cd0c8ca` |
| Wallet-first deferred checkout quote and migration contracts | 16 | `ec8f891840658794375993cc8687e7509489b78874280805732f5cded53fb960` | `9c4acf258a2d51117cf810473d64a99231e826ae91d35d2d885726146628ca9b` |

**Total:** 290 distinct focused test cases per pass; 580 successful test executions across the two passes.

## 3. Review conclusion

- All 24 active JSON fields have an identified writer/reader contract and a focused dynamic test suite.
- The two passkey credential JSON fields remain DEFERRED, not silently KEEP or TRANSFORM. They stay outside the current D1 import path until the future-auth/Auth0 decision and credential portability/security review.
- The C3 account metadata field is the remaining substantive transform boundary: raw identity/display values must be externalized to Auth0, and low-entropy SHA-256 digests must be replaced by approved domain-separated HMACs or removed through a documented purpose decision.
- The 26-field writer/transform inventory review is complete as a source-only evidence task. It does not mean the target D1 migration is approved or that production rows were inspected.

## 4. Remaining gates

C3 remains OPEN for Auth0 identity mapping and C2 HMAC custody/replacement. T2 remains OPEN/BLOCKED. No BWH connection, production-row read, D1 DDL apply, D1 data load, Worker/DO deployment, production writer change, merge or cutover occurred. BWH remains the only production control-data writer.
