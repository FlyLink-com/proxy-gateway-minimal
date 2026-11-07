# D1 T2 Core Security Contracts v1 — Draft

> **Status:** DESIGN PROPOSAL / SYNTHETIC-TEST CONTRACT. Not domain-owner approval, not production DDL, not secret provisioning, not production migration authorization.
> **Source anchor:** `master@be261abc60f28bb2733764fa5364ab44b3e76844`.
> **Draft branch:** `docs/d1-target-schema-g6-rehearsal-plan-20261107`.
> **Scope:** close the design for (1) lease/idempotency digests, (2) JSON allowlist boundaries, (3) payment-action URL custody, and (4) retention defaults, using repository evidence only.

## 0. Decisions at a glance

| Area | Proposed contract | Status |
|---|---|---|
| Lease capability | SHA-256 over domain prefix + exactly 32 random bytes; store versioned digest; preserve lease fencing | Source-supported design; synthetic vectors required |
| Idempotency | HMAC-SHA-256 with purpose-specific domain + key ID; preserve scope/unique/replay behavior; historical key migration needs a separately supplied migration key | Design defined; key custody/rotation approval open |
| JSON | Exact field-specific schemas; reject unknown keys, recursive secrets/PII/URLs/free text; no generic pass-through | Partial source schema identified; exhaustive callsite catalog still open |
| Payment action URL | Raw URL/QR stays in separate short-lived custody; D1 stores opaque action ref/type/expiry/state only | Boundary defined; custody provider/API and recovery SLA open |
| Retention | Preserve lead 90-day purge; usage raw samples excluded until policy; financial/audit/session/consent TTLs must be domain-approved before production copy | Safe exclusions defined; remaining schedules open |

## 1. Lease capability digest

### 1.1 Source evidence

Current lease issuers generate `randomBytes(32).toString("hex")` and validate exactly 64 lowercase hexadecimal characters. The lease is not merely a timeout: source operations compare token + generation + lease deadline + status to fence stale workers. Relevant source modules include:
- `server/services/platform/coin-commerce-store.mjs`
- `server/services/platform/deferred-resource-transition-store.mjs`
- `server/services/platform/coin-wallet-store.mjs`

### 1.2 Target representation

For each source `lease_token`, target column is `lease_token_hash` (TEXT, 64 lowercase hex) with:
```text
SHA-256(UTF8("flylink:d1:lease-token:v1:") || decodeHex(raw_lease_token))
```
The digest is a verifier, not a replacement for the lease state machine. Preserve:
- `lease_generation` (monotonic fencing counter)
- `lease_until` (same UTC timestamp semantics)
- status/state and attempt counters
- all existing compare-and-swap predicates and terminal guards

Never store or log raw lease token in D1, Worker logs, traces, fixtures, reports or audit metadata. A Worker receives a raw token only at claim time from the trusted issuer; it computes the digest for subsequent verification. Raw token delivery remains transient and must be redacted from receipts.

### 1.3 Required synthetic tests

- Token generator produces 32 random bytes; reject wrong length, non-hex, uppercase/noncanonical encoding.
- Same token + same domain/version produces same digest.
- Different domains and versions produce different digests.
- Correct token/generation/deadline/state succeeds; wrong token, stale generation, expired deadline, wrong status and replay after terminal state fail.
- A worker holding an old token cannot mutate after lease reclaim.
- Search D1 rows, logs, traces, fixtures and report bundle for the raw synthetic token; expect zero matches.

## 2. Idempotency digest and replay compatibility

### 2.1 Scope that must not change

The digest is only a storage transformation. Preserve the exact existing uniqueness scope and replay semantics:
- `platform_coin_operation_receipts`: actor scope + operation type + idempotency key.
- `platform_coin_commerce_operation_receipts`: actor scope + operation type + idempotency key.
- `platform_deferred_resource_transition_operation_receipts`: actor scope + operation type + idempotency key.
- `platform_payment_orders`: account scope + create idempotency key.
- `platform_wallet_first_deferred_checkout_quotes`: reserve actor scope + reserve idempotency key.
- `platform_portal_registration_welcome_coin_grants`: actor scope + idempotency key.

A same-scope/same-key/same-request replay must return the original result. A same-scope/same-key/different-request replay must retain the current conflict behavior. No new cross-scope dedupe is allowed.

The same contract also applies to `platform_payment_receipts.event_dedupe_key`: its current uniqueness scope is `(merchant_scope_digest, event_dedupe_key)`. Compute a provider-event HMAC under a separate `flylink:d1:provider-event:v1` domain, scoped by the stable merchant-scope digest. Do not reuse the idempotency HMAC domain or key. Keep the merchant-scope digest and receipt payload digest as separate evidence fields.

### 2.2 Target representation

Use one versioned envelope in TEXT:
```text
hmac-sha256:v1:<64-lowercase-hex>
```
Digest input uses an unambiguous length-prefixed encoding, not string concatenation with delimiters:
```text
HMAC-SHA-256(
  K[key_id],
  "flylink:d1:idempotency:v1" ||
  LP(UTF8(domain)) ||
  LP(UTF8(actor_scope)) ||
  LP(UTF8(operation_type)) ||
  LP(UTF8(raw_idempotency_key))
)
```
`LP(x)` is a fixed-width unsigned length prefix followed by x. Domain is a fixed allowlisted identifier per source column family. The envelope key ID is public metadata; the key material is not.

### 2.3 Key custody and rotation

- No key value is created, committed, provisioned, or stored in Notion as part of this work.
- Runtime key is supplied only through the approved secret binding of the component computing the digest; never D1, source, migration SQL, logs or CI artifacts.
- Migration runner and Worker must use the same key ID and byte-exact encoding.
- During rotation, keep a read key ring for every still-live key ID. New writes use the active key ID; lookups calculate candidate digests for active and retained IDs. Retire an old key only after every row and retry/reconciliation window that depends on it has expired or has been re-keyed under a separately tested process.
- Historical SQLite rows contain raw keys. Their migration transform must run in a protected local/isolated environment with a migration-only key binding; no raw key enters an intermediate JSON/CSV export or log. Migration is blocked until key custody and historical retry compatibility are approved.
- If historical raw keys cannot be transformed under the approved custody contract, stop; do not silently drop idempotency protection or re-key with a new random value.

### 2.4 Required synthetic tests

- Exact known-answer HMAC vectors for each domain and key ID.
- Length-prefix ambiguity corpus (e.g. ("ab","c") vs ("a","bc")) never collides by encoding.
- Same scope/key/request replay returns original receipt; changed request conflicts.
- Different actor/operation scopes remain independent.
- Dual-key rotation read tests; new writes use active key ID; old rows remain replayable during retention.
- Missing/unknown key ID fails closed; no fallback to plaintext.
- Secret scanner proves key and raw idempotency key absent from all output artifacts.

## 3. JSON allowlist contracts

A JSON column name is not a schema. Every field gets a named versioned schema; unknown keys and unknown versions fail closed. Recursive validation rejects:
- credential/secret/password/private-key/token/bearer/session/cookie fields;
- raw subscription/payment/action URLs, signed query strings and data-URI/QR payloads;
- email, phone, personal names where not explicitly allowed, free-form user text and filesystem paths;
- raw UUID/password/config/YAML/runtime material;
- non-finite numbers, integers outside safe bounds, duplicate semantic entries and unsupported enum values.

Canonical JSON uses UTF-8, deterministic object-key order, no duplicate keys, no NaN/Infinity, and explicit integer bounds. Do not stringify arbitrary source objects.

### 3.1 Field-specific inventory

| Source field | Contract ID | Target rule |
|---|---|---|
| `platform_accounts.metadata_json` | `account-metadata/v1` | Explicit account metadata keys only; opaque refs, bounded enums and UTC timestamps; no arbitrary profile/contact fields |
| `platform_issuance_requests.metadata_json` | `issuance-metadata/v1` | Request/issuance safe codes and opaque refs only; purpose is separately conditional and must be allowlisted |
| `platform_audit_events.metadata_json` | `audit-metadata/v1` | Action-specific schema selected by (entity_type, action); no generic catch-all; existing fulfillment proof keys must remain exact |
| `platform_edge_registered_nodes.metadata_json` | `edge-node-metadata/v1` | Reuse source's `assertNoUnsafeControlValues` as a baseline only; define exact provider/region/role/release metadata keys and reject extras |
| `platform_portal_access_requests.event_json` | `portal-access-event/v1` | Event object allowlist; known reset event is exactly `{type:"subscription_link_reset", occurredAt:<canonical UTC ISO timestamp>}`; other event types need explicit schemas |
| `platform_coin_commerce_fulfillment_commands.payload_json` | `commerce-fulfillment-payload/v1` | Exact keys `offerVersionRef`, `delivery`, optional `authority`; delivery uses subscription_plan/data_pack discriminated union; refs and bounded numeric fields only |
| `platform_coin_commerce_orders.offer_snapshot_json` | `commerce-offer-snapshot/v1` | Exact normalized offer shape: refs/version/category/title/summary/importantNotices/baseCoinUnits/referencePrice/acceptedCoinTypes/delivery |
| `platform_coin_commerce_orders.allocation_snapshot_json` | `coin-allocation/v1` | Array of exact `{coinType, amountUnits}`; allowed coin types ordered bonus_coins, paid_coins, reward_coins; positive safe integers; sum equals order amount |
| `platform_coin_commerce_quotes.allocation_json` | `wallet-allocation/v1` | Array of exact lot allocation entries; unique lot refs, ordered sequence, coin type, allocated units and nullable expiry; sum equals amount |
| `platform_coin_commerce_quotes.before_balance_json` / `after_balance_json` | `wallet-balance-snapshot/v1` | Exact wallet balance counters; integer safe bounds; arithmetic transition must reconcile to quote/hold/ledger facts |
| `platform_deferred_resource_transitions.offer_snapshot_json` | `commerce-offer-snapshot/v1` | Same offer schema as commerce order snapshot |
| `platform_deferred_resource_transitions.allocation_snapshot_json` | `wallet-allocation/v1` | Same exact lot allocation schema; total and sequence invariants preserved |
| `platform_wallet_first_deferred_checkout_quotes.offer_snapshot_json` | `commerce-offer-snapshot/v1` | Same offer schema |
| `platform_wallet_first_deferred_checkout_quotes.allocation_json` | `wallet-allocation/v1` | Same exact lot allocation schema |
| `platform_wallet_first_deferred_checkout_quotes.before_balance_json` / `after_balance_json` | `wallet-balance-snapshot/v1` | Same exact balance schema and arithmetic invariants |
| `platform_referral_policies.policy_json` / `platform_referral_origins.policy_json` | `referral-policy/v1` | Exact source policy keys/enums/bounded rates; no user-controlled JSON |
| `platform_coin_commerce_offer_versions.important_notices_zh_json` / `important_notices_en_json` | `commerce-notices/v1` | Bounded curated operator copy only; reject URLs, markup/script, PII and secret-like content |
| `platform_coin_commerce_offer_versions.accepted_coin_types_json` | `coin-type-list/v1` | Non-empty unique enum array from supported coin types |
| `platform_portal_second_factor_challenges.allowed_factors_json` | `second-factor-list/v1` | Non-empty unique array from the supported factor enum |
| `platform_edge_registered_nodes.channel_refs_json` | `opaque-ref-list/v1` | Unique array of validated opaque channel refs |
| `platform_portal_passkey_credentials.public_key_jwk_json` / `transports_json` | `webauthn-public-data/v1` | DEFER with table; future contract permits public JWK members only, rejects private `d`; transports enum allowlist |

### 3.2 Explicit incompleteness

The source currently has a generic `assertNoUnsafeFields()` key-name guard and a narrower edge metadata value validator; neither is a whole-table guarantee. The table above establishes target schema IDs and safe high-level shapes, but it does **not** claim every current producer's exact key set has been enumerated. Before T2 approval, enumerate all INSERT/UPDATE call sites and tests for the five metadata/event columns and every JSON schema above (26 JSON columns in the T2 inventory, including deferred Passkey JSON). In particular, `account-metadata/v1`, `issuance-metadata/v1`, `audit-metadata/v1`, `edge-node-metadata/v1`, referral policy and wallet balance snapshots need exact exhaustive key sets from all source writers.

### 3.3 Required synthetic tests

For every schema ID:
- valid minimal and maximal accepted fixtures;
- unknown top-level key, nested key and unknown version rejected;
- nested PII/secret/URL/token/path/free text rejected;
- invalid enum, duplicate array member, invalid timestamp and unsafe integer rejected;
- deterministic canonical serialization and stable digest;
- trigger-consumed JSON fields continue to satisfy existing cross-table proof conditions;
- no excluded raw value appears in D1 fixture, Worker payload or evidence bundle.

## 4. Payment action URL custody

### 4.1 Source evidence and risk

The current payment store accepts HTTPS redirect/QR URLs, excludes URL username/password/fragment, persists `next_action_url`, and returns the URL to the Portal projection while the order is pending/entry-ready. HTTPS validation does not prove the URL is non-capability-bearing: signed query parameters, opaque bearer paths, and QR payloads can still authorize payment.

### 4.2 Target D1 contract

D1 must not store raw URL or raw QR payload. Store only:
- `next_action_ref`: opaque random reference to an action object in the separately approved custody service;
- `next_action_type`: enum `redirect | qr_code`;
- `next_action_expires_at`: canonical UTC ISO timestamp;
- lifecycle state: pending / consumed / expired / revoked as required by the action contract.

The custody object contains the raw URL/QR encrypted at rest under a key not available to D1 SQL or ordinary Worker logs. Retrieval requires authenticated server-side authorization bound to the payment order/account, single-purpose access, expiry check and audit reference. Never expose the raw URL in structured logs, traces, error messages, D1 query results, analytics or generic receipts.

### 4.3 Custody interface required before implementation

- `putAction({orderRef, accountRef, type, rawValue, expiresAt}) -> actionRef`
- `resolveAction({actionRef, orderRef, accountRef, now}) -> rawValue` (authorized server-side response only)
- `revokeAction({actionRef, reasonCode, at}) -> receiptRef`
- `purgeExpiredActions({boundedBefore, limit}) -> redactedReceipt`

The implementation owner, store technology, key custody, access-control policy, TTL, deletion proof, backup/restore and outage behavior remain unselected. Until that is approved, the migration must exclude raw action values and must not claim the existing payment UI can be switched to D1 without an action-resolution adapter. If action custody is unavailable, payment action display fails closed; do not fall back to putting the URL in D1.

### 4.4 Required synthetic tests

- HTTPS URL containing signed query or bearer-like path is never stored in D1.
- QR data containing URL/token is never stored in D1.
- Cross-account/order actionRef lookup fails.
- Expired/revoked/consumed refs fail.
- Logs, traces and errors contain only actionRef and safe reason code.
- Custody outage fails closed and payment order remains reconcilable; no false payment success.
- Backup/restore retains reference integrity without exposing raw action values.

## 5. Retention and minimization

| Data class | Contract |
|---|---|
| Leads email/message | Preserve existing 90-day expiry and purge. External PII custody must use the same or shorter window; purge receipt is redacted. |
| Raw usage samples | Exclude from initial D1 migration. Reconsider only with a finite TTL, aggregation/minimization decision and query-workload justification. |
| Financial ledger / payment receipts / immutable audit | Do not invent a duration. Domain owner/legal basis must specify retention and terminal-state behavior before production load; maintain immutability during approved period. |
| Idempotency receipts | Retain at least the maximum client retry + provider replay + reconciliation window. Exact bound must be set per domain; key version remains available for every retained digest. |
| Sessions / second-factor challenges | Preserve expires_at / used_at / revoked_at semantics; define a bounded post-terminal security-audit window before production copy. |
| Ads Consent evidence | Conditional on feature/source fingerprint. Retention and consent-history requirements require owner approval; preserve `ad_personalization = 0` and original epoch-ms semantics. |
| Legacy payment archive | Conditional on exact source fingerprint; preserve immutable audit facts under approved financial retention. Raw action URL/QR remains external. |
| Deferred / future password/passkey tables | Deferred; no rows or retention policy inferred. |

Business expiry is not the same as record-retention authorization. No default indefinite retention. No production copy while the required retention schedule is TBD.

## 6. Remaining source-contract closure gates

The four designs above are proposed, not approved. Close these before marking T2 complete:
1. Enumerate all JSON writers and exact allowlist keys for all 21 JSON columns (including deferred columns).
2. Add a named domain owner and approve retention periods for each retention class except the already established Leads 90-day rule.
3. Approve key custody and rotation model for idempotency HMAC; no key provisioning is included.
4. Approve payment action custody owner/API/TTL/restore contract.
5. Resolve `platform_edge_desired_state_notifications.generation`: source DDL is TEXT and write API accepts required text; keep it TEXT, but require a bounded safe-generation grammar before classifying as unconditional KEEP. Until producer contract is exhaustive, remain CONDITIONAL.
6. Keep G2 limitations explicit: FK/CHECK attribution gaps, definition-only ordinary indexes, multi-replica `withSession()` bookmark behavior and concurrent pagination snapshot semantics still require targeted evidence.

## 7. Authorization

Repository-only documentation and synthetic test design. No production DB reads, BWH connection, real secrets, remote D1 mutation, Worker deployment, CI, PR, merge, dual-write, DNS or cutover. BWH remains production's only writer. A future G6 PASS authorizes consideration of the next separately approved step only.

 
### T2 source-contract follow-up — 2026-11-07

Repository source inspection confirmed:
- Lease producers currently issue 32-byte random values rendered as 64 lowercase hex; lease checks include generation/deadline/state fencing.
- Six source `lease_token` columns are in scope for SHA-256 digest transformation.
- Six source idempotency columns are in scope for HMAC transformation; Payment `event_dedupe_key` is a seventh, separate provider-event HMAC domain, preserving `(merchant_scope_digest, event_dedupe_key)` uniqueness.
- T2 inventory contains 26 JSON columns, not 21. The security contract document has been corrected to enumerate all 26; Passkey JSON remains deferred.
- Payment `next_action_url` currently flows through order/receipt projections to Portal; HTTPS-only validation does not rule out signed/bearer query or QR capabilities. A custody adapter is required before D1 can replace the source URL.
- Source edge notification `generation` is TEXT and its writer currently validates only required text. It remains CONDITIONAL pending a bounded safe-generation grammar and producer callsite proof.

This source inspection did not execute production code or read production values. Exact exhaustive JSON writer key enumeration remains open; current helper-level validation is not treated as proof of a complete allowlist.
