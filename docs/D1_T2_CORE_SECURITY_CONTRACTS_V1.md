# D1 T2 Core Security Contracts v1.1 — Draft

> **Status:** DESIGN PROPOSAL / SYNTHETIC-TEST CONTRACT. Not domain-owner approval, not production DDL, not secret provisioning, not production migration authorization.
> **Source anchor:** `master@be261abc60f28bb2733764fa5364ab44b3e76844`.
> **Draft branch:** `docs/d1-target-schema-g6-rehearsal-plan-20261107`.
> **Scope:** close the design for (1) lease/idempotency digests, (2) JSON allowlist boundaries, (3) payment-action URL custody, and (4) retention defaults, using repository evidence only.

## 0. Decisions at a glance

| Area | Current contract | Status |
|---|---|---|
| Lease capability | SHA-256 over a domain-separated, length-prefixed UTF-8 token string; issuer grammar is field-specific | 2 known-answer vectors pass; no source token format is assumed universal |
| Idempotency | Six raw fields use HMAC with key ID in a versioned envelope; provider event uses a separate key/domain | 7 HMAC vectors pass; key custody approval remains pending |
| PII-derived lookup digests | Separate keyed pseudonymization domains or exclude; raw email/displayName are not D1 metadata | BLOCKED |
| JSON | All 26 columns mapped to current writers; generic persistence boundaries still need exact allowlists | BLOCKED |
| Payment action | Durable Objects SQLite storage recommended for encrypted short-lived action custody | Design only; no DO or key created |
| Retention | Existing Leads 90-day rule retained; other domain periods require named owner decisions | OPEN |
| Independent review | Review packet prepared | Awaiting a separate reviewer |

Companion evidence:
- Source write-path audit: docs/D1_T2_SOURCE_WRITE_PATH_AUDIT_V1.md
- Payment custody design: docs/D1_T2_PAYMENT_ACTION_CUSTODY_DESIGN_V1.md
- Retention decisions: docs/D1_T2_RETENTION_DECISION_RECORDS_V1.md
- Independent review packet: docs/D1_T2_INDEPENDENT_REVIEW_PACKET_V1.md

## 1. Lease capability digest

### 1.1 Source evidence

There are six source lease_token columns, but the issuers do not all use the same representation.

Five default issuers use randomBytes(32).toString("hex"), exactly 64 lowercase hexadecimal characters:
- platform_coin_commerce_fulfillment_commands.lease_token
- platform_deferred_resource_transitions.lease_token
- platform_deferred_resource_transition_rebases.lease_token
- platform_wallet_first_resource_effect_runtime_claims.lease_token
- platform_portal_registration_welcome_coin_grants.lease_token

The reservation issuer is different:
- platform_deferred_resource_transition_reservations.lease_token is created by coin-wallet-store.mjs through nextRef("deferred_reservation_lease"), whose default output is deferred_reservation_lease_ followed by randomUUID().

Lease fencing is not merely a timeout. Preserve token + generation + lease deadline + status predicates, attempt counters and all existing compare-and-swap guards.

### 1.2 Target representation

Target column: lease_token_hash (TEXT, versioned SHA-256 digest).

Formula:
SHA-256(UTF8("flylink:d1:lease-token:v1\0") || LP(UTF8(raw_lease_token)))

LP(x) is a four-byte unsigned big-endian byte length followed by x. The input is the exact canonical source token string as UTF-8. Do not decode 64-hex text into bytes; do not assume all six issuers have 64-hex values.

Preserve:
- lease_generation as the monotonic fencing counter;
- lease_until with identical UTC timestamp semantics;
- status/state and attempt counters;
- all existing CAS predicates and terminal guards.

Never store or log raw lease tokens in D1, Worker logs, traces, fixtures, reports or audit metadata. A Worker receives a raw token only at claim time from the trusted issuer; it computes the digest for subsequent verification. Raw token delivery remains transient and must be redacted from receipts.

### 1.3 Required synthetic tests

- Known-answer digest for a 64-lowercase-hex issuer token.
- Known-answer digest for the prefixed UUIDv4 reservation token.
- Field-specific issuer grammar rejects mixed formats, uppercase and malformed UUIDs.
- Same token + same domain/version produces the same digest; a changed token or domain produces a different digest.
- Correct token/generation/deadline/state succeeds; wrong token, stale generation, expired deadline, wrong status and terminal replay fail in the existing state-machine tests.
- A worker holding an old token cannot mutate after lease reclaim.
- Search D1 fixtures, logs, traces and report bundle for the raw synthetic token; expect zero matches.

## 2. Idempotency digest and replay compatibility

### 2.1 Scope that must not change

The digest is a storage transformation only. Preserve the exact source uniqueness scope and replay semantics:
- platform_coin_operation_receipts: actor scope + operation type + idempotency key.
- platform_coin_commerce_operation_receipts: actor scope + operation type + idempotency key.
- platform_deferred_resource_transition_operation_receipts: actor scope + operation type + idempotency key.
- platform_payment_orders: account scope + create idempotency key.
- platform_wallet_first_deferred_checkout_quotes: reserve actor scope + reserve idempotency key; retain the existing actor-type and actor-ref equality checks.
- platform_portal_registration_welcome_coin_grants: actor scope + idempotency key.

Same-scope/same-key/same-request replay returns the original result. Same-scope/same-key/different-request retains current conflict behavior. No cross-scope dedupe is allowed.

platform_payment_receipts.event_dedupe_key is a separate provider-event domain with current uniqueness scope (merchant_scope_digest, event_dedupe_key). It uses a separate key ring and domain; do not reuse the idempotency key or domain.

### 2.2 Target representation and byte encoding

Use a versioned TEXT envelope:
hmac-sha256:v1:<key-id>:<64-lowercase-hex>

Key ID grammar: [A-Za-z0-9][A-Za-z0-9._-]{0,31}. Key ID is public metadata and is included both in the envelope and in the MAC input.

LP(x) is a four-byte unsigned big-endian byte length followed by UTF-8 bytes.

Idempotency formula:
HMAC-SHA-256(K[key_id],
  UTF8("flylink:d1:idempotency:v1\0") ||
  LP(UTF8(key_id)) ||
  LP(UTF8(domain)) ||
  LP(UTF8(actor_scope)) ||
  LP(UTF8(operation_type)) ||
  LP(UTF8(raw_idempotency_key)))

Provider-event formula:
HMAC-SHA-256(K_provider[key_id],
  UTF8("flylink:d1:provider-event:v1\0") ||
  LP(UTF8(key_id)) ||
  LP(UTF8(merchant_scope_digest)) ||
  LP(UTF8(raw_event_dedupe_key)))

The domain is a fixed allowlisted identifier per source column family. Never derive a domain from untrusted request data.

### 2.3 Key custody and rotation

- No key value is created, committed, provisioned or stored in Notion as part of this work.
- Idempotency, provider-event and PII-pseudonymization keys are separate key families; do not reuse the provider-event or PII key for idempotency.
- Runtime key is supplied only through an approved secret binding; never D1, source, migration SQL, logs or CI artifacts.
- Migration runner and Worker use the same key ID and byte-exact encoding.
- During rotation, keep a read key ring for every still-live key ID. New writes use the active key; lookups calculate candidate envelopes for active and retained IDs. Retire an old key only after every dependent row and retry/reconciliation window expires or is re-keyed under a separately tested process.
- Historical SQLite raw keys are transformed in a protected local/isolated environment. No raw key enters JSON/CSV exports, logs or evidence bundles.
- Unknown/missing key ID fails closed. Never fall back to plaintext.

### 2.4 PII-derived digest treatment

portal-registration.mjs currently derives contactDigest, loginDigest, displayDigest, useCaseDigest, source-IP digests and request-key digests with ordinary SHA-256. These values are not anonymous when the source domain is low entropy.

If an equality/lookup requirement remains, transform the historical SHA-256 digest as an input to a separate keyed domain:
HMAC-SHA-256(K_pii[key_id],
  UTF8("flylink:d1:pii-digest:v1\0") ||
  LP(UTF8(key_id)) ||
  LP(UTF8(domain)) ||
  LP(UTF8(legacy_sha256_digest_hex)))

Future source writes compute the same legacy digest from the source value in memory and then apply the same HMAC. This preserves equality without exporting raw email/IP. Use separate domains for account email, source IP, request key and any other retained class. Drop display/use-case digests unless a concrete lookup requirement exists. If displayName is needed by the UI, store it in an explicitly approved profile/identity system, not account metadata.

### 2.5 Existing pre-hashed wallet-first handoff exception

platform_wallet_first_setup_delivery_handoffs.idempotency_key_hash is not one of the six raw columns. Its current source algorithm is unkeyed SHA-256 over a domain prefix, NUL separator and raw idempotency key. The input validator allows 16-128 characters but does not prove minimum entropy. session_binding_hash is also an existing domain-separated unkeyed SHA-256 value.

Do not silently classify these as HMAC. Decide whether to HMAC the legacy digest as a derived input and update source writes/lookups, or retain a narrowly scoped compatibility exception only after proving entropy and retention are sufficient. This exception needs its own compatibility test and owner decision.

### 2.6 Required synthetic tests

- Known-answer vectors for all six idempotency column families.
- Separate provider-event key/domain vector.
- Separate PII-digest domain vector.
- Length-prefix ambiguity corpus never collides by encoding.
- Same scope/key/request replay returns original receipt; changed request conflicts.
- Different actor/operation scopes remain independent.
- Dual-key rotation read tests; new writes use active key; old rows remain replayable during retention.
- Missing/unknown key ID fails closed; no plaintext fallback.
- Synthetic key and raw key are absent from all output artifacts.

## 3. JSON allowlist contracts

A JSON column name is not a schema. Every field gets a named, versioned schema; unknown keys and unknown versions fail closed. Canonical JSON uses UTF-8, deterministic object-key order, no duplicate keys, no NaN/Infinity and explicit integer bounds. Do not stringify arbitrary source objects.

### 3.1 Complete 26-column inventory

| Source field | Contract ID | Target rule |
|---|---|---|
| platform_accounts.metadata_json | account-metadata/v1 | Closed allowlist of safe flags, bounded enums, UTC timestamps and opaque refs; no loginRef, displayRef, displayName or unkeyed low-entropy digests |
| platform_issuance_requests.metadata_json | issuance-metadata/v1 | Closed union of observed CLI source metadata and wallet-first resource-chain metadata; no generic pass-through |
| platform_audit_events.metadata_json | audit-metadata/v1 | Exact schema selected by entity_type + action; no generic catch-all |
| platform_edge_registered_nodes.channel_refs_json | opaque-ref-list/v1 | Unique array of validated opaque channel refs |
| platform_edge_registered_nodes.metadata_json | edge-node-metadata/v1 | Exact first-boot metadata key set; reject unknown keys and unsafe values |
| platform_portal_access_requests.event_json | portal-access-event/v1 | Closed event union for the observed lifecycle/reset/wallet-first event types |
| platform_portal_passkey_credentials.public_key_jwk_json | webauthn-public-jwk/v1 | DEFER with table; future allowlist permits public JWK members only and rejects private d |
| platform_portal_passkey_credentials.transports_json | webauthn-transports/v1 | DEFER with table; future transport enum allowlist |
| platform_portal_second_factor_challenges.allowed_factors_json | second-factor-list/v1 | Non-empty unique array or exact versioned wrapper; factors limited to totp and passkey |
| platform_coin_commerce_offer_versions.important_notices_zh_json | commerce-notices/v1 | Bounded operator-curated text; reject URLs, markup/script, PII and secret-like content |
| platform_coin_commerce_offer_versions.important_notices_en_json | commerce-notices/v1 | Same as Chinese notices |
| platform_coin_commerce_offer_versions.accepted_coin_types_json | coin-type-list/v1 | Non-empty unique enum array from supported coin types |
| platform_coin_commerce_quotes.allocation_json | coin-allocation-aggregate/v1 | Exact {coinType, amountUnits} entries; positive safe integers and sum equals quote amount |
| platform_coin_commerce_quotes.before_balance_json | wallet-balance-snapshot/v1 | Exact projectCoinWalletBalance snapshot union |
| platform_coin_commerce_quotes.after_balance_json | wallet-balance-snapshot/v1 | Same balance schema and arithmetic reconciliation |
| platform_coin_commerce_orders.offer_snapshot_json | commerce-offer-snapshot/v1 | Exact normalized offer shape |
| platform_coin_commerce_orders.allocation_snapshot_json | coin-allocation-aggregate/v1 | Exact {coinType, amountUnits} entries; sum equals order amount |
| platform_coin_commerce_fulfillment_commands.payload_json | commerce-fulfillment-payload/v1 | Exact offerVersionRef, delivery discriminated union and optional authority |
| platform_referral_policies.policy_json | referral-policy/v1 | Exact normalized source policy keys/enums/bounded rates |
| platform_referral_origins.policy_json | referral-policy/v1 | Copy of the same exact policy schema; no independent free-form writer |
| platform_deferred_resource_transitions.offer_snapshot_json | commerce-offer-snapshot/v1 | Same normalized offer schema |
| platform_deferred_resource_transitions.allocation_snapshot_json | wallet-lot-allocation/v1 | Exact {lotRef, allocationSequence, coinType, allocatedUnits, expiresAt} entries |
| platform_wallet_first_deferred_checkout_quotes.offer_snapshot_json | commerce-offer-snapshot/v1 | Same normalized offer schema |
| platform_wallet_first_deferred_checkout_quotes.allocation_json | wallet-lot-allocation/v1 | Same exact lot-allocation schema |
| platform_wallet_first_deferred_checkout_quotes.before_balance_json | wallet-balance-snapshot/v1 | Exact balance schema |
| platform_wallet_first_deferred_checkout_quotes.after_balance_json | wallet-balance-snapshot/v1 | Exact balance schema and arithmetic reconciliation |

### 3.2 Observed source schemas and unresolved writers

- Commerce aggregate allocation and wallet lot allocation are distinct contracts. Do not use one permissive schema for both.
- wallet-balance-snapshot/v1 is the exact projectCoinWalletBalance union: exists=false branch and exists=true branch with walletRef, status, version, totals, spendableUnits, heldUnits and pendingUnits.
- commerce-fulfillment-payload/v1 is built by commandPayloadForOrder and parsed by parseCommandPayload; preserve the exact discriminated union.
- referral-policy/v1 is built by policySnapshot and copied to origins; retain exact keys.
- account, issuance, audit, edge metadata and portal event stores currently accept generic objects. The companion source audit records every observed writer and caller, but target approval requires enforcement at the persistence boundary.
- Account metadata is a hard blocker: raw email references and displayName are present, and ordinary SHA-256 of email/IP/request data is not treated as anonymization.
- Commerce notices currently have non-empty/unique string validation but no complete length or content filter.
- Second-factor readers recognize totp/passkey, but the writer must enforce the same enum before persisting.
- Passkey JSON remains deferred and must not be copied.

Full writer evidence: docs/D1_T2_SOURCE_WRITE_PATH_AUDIT_V1.md.

### 3.3 Required synthetic tests

For every schema ID:
- valid minimal and maximal accepted fixtures;
- unknown top-level/nested key and unknown version rejected;
- PII/secret/URL/token/path/free text rejected where not explicitly allowed;
- invalid enum, duplicate array member, invalid timestamp and unsafe integer rejected;
- deterministic canonical serialization and stable digest;
- trigger-consumed JSON fields continue to satisfy cross-table proof conditions;
- no excluded raw value appears in D1 fixture, Worker payload or evidence bundle.

## 4. Payment action URL custody

### 4.1 Source evidence and risk

payment-store.mjs normalizes HTTPS redirect/QR values, persists next_action_url in payment receipts and returns the raw value through receipt/order projections while the order is pending or entry-ready. HTTPS validation does not prove the URL is non-capability-bearing: signed query parameters, opaque bearer paths and QR payloads can still authorize payment.

### 4.2 Target D1 contract

D1 must not store raw URL or raw QR payload. Store only:
- next_action_ref: opaque random reference to the action object;
- next_action_type: enum redirect | qr_code;
- next_action_expires_at: canonical UTC ISO timestamp;
- lifecycle state: active / consumed / expired / revoked.

Custody recommendation: Cloudflare Durable Objects with SQLite storage, one object per payment order. Store the raw value as application-layer AES-256-GCM ciphertext under a Worker secret binding; D1 stores only the reference and state. This is a technical recommendation, not an implementation authorization.

Resolution is repeatable while the action is active so a user can reopen a QR/redirect after refresh. First read does not consume the action. Consume only after verified payment settlement; revoke on cancellation/replacement; expire no later than provider/order expiry.

### 4.3 Required custody interface

- putAction({orderRef, accountRef, type, rawValue, expiresAt, providerRequestRef, attemptRef}) -> actionRef
- resolveAction({authenticatedSession, orderRef, actionRef}) -> rawValue (server-side response only)
- markConsumed({actionRef, verifiedPaymentReceipt}) -> redactedReceipt
- revokeAction({actionRef, reasonCode, at}) -> redactedReceipt
- purgeExpired({boundedBefore, limit}) -> redactedReceipt

Full storage selection, saga ordering, alarm retry, PITR restore and outage behavior are in docs/D1_T2_PAYMENT_ACTION_CUSTODY_DESIGN_V1.md.

### 4.4 Required synthetic tests

- Signed/bearer HTTPS URL and QR payload never enter D1.
- Cross-account/order actionRef lookup fails.
- Expired/revoked/consumed refs fail.
- Active action can be resolved again after page refresh.
- First read does not consume the action.
- Logs, traces and errors contain only actionRef and safe reason code.
- Custody outage fails closed; payment order remains reconcilable; no false payment success.
- Backup/restore retains pointer integrity without re-authorizing stale actions.

## 5. Retention and minimization

Only the existing Leads 90-day expiry/purge rule is accepted in this pass. Payment order and wallet-first quote TTLs are active validity windows, not record-retention periods.

| Data class | Contract |
|---|---|
| Leads email/message | Preserve existing 90-day expiry and purge; external PII custody same or shorter; purge receipt redacted |
| Raw usage samples | Exclude from initial D1 migration until finite TTL, aggregation/minimization and workload purpose are approved |
| Financial ledger / payment receipts / immutable audit | Do not invent a duration; Finance/Legal/domain owner must decide retention and terminal behavior |
| Idempotency receipts | Retain at least max(client retry, provider replay, reconciliation closeout); exact bound and key-version availability require domain approval |
| Sessions / second-factor challenges | Preserve expires_at / used_at / revoked_at; define bounded post-terminal retention and cleanup |
| Ads Consent evidence | Conditional on feature/source fingerprint; retention and consent-history requirements require privacy owner approval |
| Legacy payment archive | Conditional on exact source fingerprint; preserve immutable facts under approved financial retention; raw URL/QR stays external |
| Deferred / future password/passkey tables | Deferred; no rows or retention policy inferred |
| Account identity / registration-risk digests | Remove raw values; keyed pseudonyms only if required; TTL and access require identity/privacy owner |
| Payment action ciphertext | Expire no later than provider expiry and purge on terminal state; redacted tombstone duration requires payment owner approval |

Business expiry is not record-retention authorization. No default indefinite retention. See docs/D1_T2_RETENTION_DECISION_RECORDS_V1.md for the owner decision register.

## 6. Remaining source-contract closure gates

The source audit and synthetic vectors are complete for this pass, but T2 remains BLOCKED. Close these before T2 approval:
1. Remove/externalize raw email and displayName from account metadata.
2. Approve keyed pseudonymization domains and key custody for retained email/IP/request-key digests; no real key is provisioned.
3. Enforce exact writer-boundary allowlists for account, issuance, audit, edge metadata, portal events, second-factor factors and commerce notices.
4. Resolve the existing wallet-first setup handoff unkeyed digest exception.
5. Approve idempotency/provider-event/PII key custody, key IDs, rotation and historical replay compatibility.
6. Approve payment custody owner, Worker/DO interface, TTL, key custody and restore/outage operations.
7. Obtain named retention owners and approved periods for all unresolved classes.
8. Enforce the observed generation grammar at the source writer; production values were not read.
9. Obtain a separate independent T2 review using docs/D1_T2_INDEPENDENT_REVIEW_PACKET_V1.md.
10. Keep G2 limitations explicit: FK/CHECK attribution gaps, definition-only ordinary indexes, multi-replica withSession bookmark behavior and concurrent pagination snapshot semantics still require targeted evidence.

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
