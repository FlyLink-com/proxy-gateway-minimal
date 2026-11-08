# D1 T2 Source Write-Path Audit v1 — Draft

Status: SOURCE WRITE-PATH INVENTORY COMPLETED; SECURITY BLOCKERS REMAIN. This is a source-code audit, not a production-data audit and not a T2 approval.

- Repository: FlyLink-com/proxy-gateway-minimal
- Draft branch: docs/d1-target-schema-g6-rehearsal-plan-20261107
- Draft base: 294a24cba7e9c5e31c98e20b6827cca4b66b706b
- Source anchor: master at be261abc60f28bb2733764fa5364ab44b3e76844
- Schema authority: docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json
- No BWH connection, production customer data, real secret, remote D1 mutation, deployment, CI, PR or merge was used.

## 1. Audit result

The machine-readable inventory contains exactly 26 JSON columns. The current source paths have been mapped to their persistence entrypoints and observed production callers. This does not mean all writers already enforce the target allowlists.

Additional source findings:

- Six lease-token columns exist. Five default issuers produce 32 random bytes encoded as 64 lowercase hex; one reservation issuer produces a prefixed UUIDv4 reference.
- Six raw idempotency-key columns are in scope for HMAC transformation. Provider event dedupe is a separate seventh HMAC domain.
- A separate existing wallet-first setup handoff field, idempotency_key_hash, is already an unkeyed SHA-256 digest. It is not one of the six raw fields and needs an explicit compatibility decision.
- Account metadata currently includes raw email references and a raw display name. Several related digests are unkeyed SHA-256 of low-entropy personal or registration data; these are not anonymization.
- Payment next_action_url is persisted and projected to Portal. HTTPS validation does not remove signed-query, bearer-path or QR capability risk.
- Edge notification generation has two observed production builder formats, but the persistence writer accepts arbitrary non-empty text.
- Passkey JSON has a persistence helper but no production service caller was found; the table remains deferred.

## 2. Complete 26-column write-path matrix

| # | Source column | Current writer / evidence | Observed validation | T2 assessment |
|---:|---|---|---|---|
| 1 | platform_accounts.metadata_json | createAccount in subscription-control-db.mjs:1537-1546; callers in portal-registration.mjs:308-335, portal-initial-account-issuance.mjs:93-100, subscription-issuance.mjs:166-176 and 260-270 | jsonObject plus recursive key-name guard; no exact value schema | BLOCKED: raw loginRef/displayRef email values and displayName are written; unkeyed digests also present |
| 2 | platform_issuance_requests.metadata_json | createIssuanceRequest in subscription-control-db.mjs:5827-5847; subscription-issuance.mjs:211-213; wallet-first chain insert/update in subscription-control-db.mjs around 3778-3794 and 3909-3925 | jsonObject plus key-name guard; current producers have a small number of recognizable variants | CONDITIONAL: define a closed versioned union and reject arbitrary metadata at the persistence boundary |
| 3 | platform_audit_events.metadata_json | recordAuditEvent in subscription-control-db.mjs around 7840-7855; callers in subscription-issuance.mjs, portal-access-requests.mjs and internal control-store flows; direct fixed-shape INSERT in coin-commerce-initial-confirmation.mjs around 278-285; metering-reset receipt writer in coin-commerce-store.mjs around 6953-6956 | generic recordAuditEvent boundary plus one direct SQL writer; direct writer currently serializes a fixed 17-key evidence object | BLOCKED: include every direct writer in the entity/action allowlist and prevent new bypasses |
| 4 | platform_edge_registered_nodes.channel_refs_json | edgeRegisteredNodeRecord / upsertEdgeRegisteredNode in subscription-control-db.mjs around 7874-7880; node-registration-ingestion.mjs and node-registration-execution.mjs | safeControlRefList and opaque-ref validation | SOURCE SHAPE ACCEPTABLE; retain exact uniqueness and ref grammar in D1 |
| 5 | platform_edge_registered_nodes.metadata_json | same edge-node persistence entrypoints around 7882-7910 and 7938; first-boot builder in node-registration-ingestion.mjs:185-193 | jsonObject plus unsafe-control-value scan; no exact key allowlist | CONDITIONAL: enforce the observed edge-node metadata key set, not only value filtering |
| 6 | platform_portal_access_requests.event_json | upsertPortalAccessRequest in subscription-control-db.mjs:8377-8451; event builders in portal-access-requests.mjs; wallet-first event writers in subscription-control-db.mjs around 3834-3839 and 3967-3972; subscription-link-reset writer in portal-subscription-link-reset-store.mjs around line 208 | jsonObject only at persistence boundary | BLOCKED: define the closed event union and per-event keys |
| 7 | platform_portal_passkey_credentials.public_key_jwk_json | createPortalPasskeyCredential in subscription-control-db.mjs around 8708-8718 | generic jsonObject | DEFER: no production caller found; do not copy table or rows in T2 |
| 8 | platform_portal_passkey_credentials.transports_json | same helper | generic jsonArray | DEFER: no production caller found; future transport enum required |
| 9 | platform_portal_second_factor_challenges.allowed_factors_json | createPortalSecondFactorChallenge in subscription-control-db.mjs around 8768-8786; production caller in user-portal-auth.mjs | array/wrapper serialization; reader recognizes totp and passkey, writer does not enforce the same enum | CONDITIONAL: enforce unique non-empty totp/passkey enum at write and D1 boundaries |
| 10 | platform_coin_commerce_offer_versions.important_notices_zh_json | insertPublishedOffer in coin-commerce-store.mjs around 721-744 | non-empty unique string list | BLOCKED: no per-item length cap or URL/PII/markup filter |
| 11 | platform_coin_commerce_offer_versions.important_notices_en_json | same writer | non-empty unique string list | BLOCKED: same as Chinese notices |
| 12 | platform_coin_commerce_offer_versions.accepted_coin_types_json | same writer | normalized supported coin-type enum list | SOURCE SHAPE ACCEPTABLE; retain non-empty/unique enum constraints |
| 13 | platform_coin_commerce_quotes.allocation_json | quote write in coin-commerce-store.mjs around 1303-1318 | aggregate allocation list, exact entries coinType and amountUnits | SOURCE SHAPE ACCEPTABLE; use coin-allocation-aggregate/v1, not lot-allocation schema |
| 14 | platform_coin_commerce_quotes.before_balance_json | same quote write | projectCoinWalletBalance output | SOURCE SHAPE ACCEPTABLE; preserve exact wallet-balance snapshot union |
| 15 | platform_coin_commerce_quotes.after_balance_json | same quote write | projectCoinWalletBalance output | SOURCE SHAPE ACCEPTABLE; preserve arithmetic reconciliation |
| 16 | platform_coin_commerce_orders.offer_snapshot_json | order write in coin-commerce-store.mjs around 2380-2391 | normalized commerce offer snapshot | SOURCE SHAPE ACCEPTABLE; exact offer schema required |
| 17 | platform_coin_commerce_orders.allocation_snapshot_json | same order write | aggregate allocation list, coinType and amountUnits | SOURCE SHAPE ACCEPTABLE; use coin-allocation-aggregate/v1 |
| 18 | platform_coin_commerce_fulfillment_commands.payload_json | command write in coin-commerce-store.mjs around 3410-3418; commandPayloadForOrder / parseCommandPayload | exact offerVersionRef, delivery discriminated union, optional authority; parser rejects unknown keys | SOURCE SHAPE ACCEPTABLE; preserve exact discriminated union |
| 19 | platform_referral_policies.policy_json | publishPolicy / policySnapshot in portal-referral-service.mjs around lines 102-124 | exact normalized policy snapshot | SOURCE SHAPE ACCEPTABLE; keep exact versioned policy keys |
| 20 | platform_referral_origins.policy_json | origin snapshot writer in portal-referral-service.mjs around line 332 | copy of normalized policy snapshot | SOURCE SHAPE ACCEPTABLE; same policy schema, no independent free-form writer |
| 21 | platform_deferred_resource_transitions.offer_snapshot_json | transition insert in deferred-resource-transition-store.mjs around 2077-2095 | normalized offer snapshot and canonical JSON | SOURCE SHAPE ACCEPTABLE; reuse commerce-offer-snapshot/v1 |
| 22 | platform_deferred_resource_transitions.allocation_snapshot_json | same transition insert | normalized lot allocation and canonical JSON | SOURCE SHAPE ACCEPTABLE; use wallet-lot-allocation/v1 |
| 23 | platform_wallet_first_deferred_checkout_quotes.offer_snapshot_json | wallet-first-deferred-checkout-quote-contract.mjs around 500-524 | normalized offer and canonical JSON | SOURCE SHAPE ACCEPTABLE; reuse commerce-offer-snapshot/v1 |
| 24 | platform_wallet_first_deferred_checkout_quotes.allocation_json | same quote writer | normalized lot allocation and canonical JSON | SOURCE SHAPE ACCEPTABLE; use wallet-lot-allocation/v1 |
| 25 | platform_wallet_first_deferred_checkout_quotes.before_balance_json | same quote writer | projectCoinWalletBalance output and canonical JSON | SOURCE SHAPE ACCEPTABLE; preserve exact wallet-balance snapshot union |
| 26 | platform_wallet_first_deferred_checkout_quotes.after_balance_json | same quote writer | projectCoinWalletBalance output and canonical JSON | SOURCE SHAPE ACCEPTABLE; preserve arithmetic reconciliation |

### 2.1 Distinct allocation contracts

Do not merge these shapes:

- coin-allocation-aggregate/v1: exact entries {coinType, amountUnits}; used by commerce quotes and commerce orders.
- wallet-lot-allocation/v1: exact entries {lotRef, allocationSequence, coinType, allocatedUnits, expiresAt}; used by deferred resource transitions and wallet-first deferred checkout quotes.
- wallet-balance-snapshot/v1: exact projection from projectCoinWalletBalance, including the exists=false branch and the exists=true branch with walletRef. Preserve totals, spendableUnits, heldUnits and pendingUnits as safe integers.

### 2.2 Account metadata and PII blocker

The account metadata writer is not safe to copy as-is.

- portal-registration.mjs writes loginRef and displayRef values containing the email address, and also writes registration metadata containing contactDigest, loginDigest, displayDigest, useCaseDigest, source-IP digests and request-key digests.
- portal-initial-account-issuance.mjs writes displayName.
- The recursive unsafe-field guard checks property names, not the semantic content of values. loginRef and displayRef do not contain the blocked word email; displayName is also not rejected.
- The digest helper uses ordinary SHA-256, not HMAC. A digest of an email, IP address, display name or short use-case text remains vulnerable to offline dictionary matching.

Required disposition:
1. Remove loginRef, displayRef and displayName from D1 account metadata. If the UI needs a display name, move it to an explicitly approved profile/identity store.
2. Keep only a closed set of non-PII flags, bounded enums, timestamps and opaque refs.
3. If email equality lookup must remain, transform the existing SHA-256 email digest into a keyed, domain-separated HMAC envelope and update future writes/lookups to the same two-step transform. The migration can HMAC the historical digest without exporting raw email.
4. Drop display/use-case digests unless a concrete lookup requirement exists. If source-IP/request-key digests remain, use separate keyed domains or exclude them.
5. No PII key is provisioned by this audit.

### 2.3 Direct audit INSERT discovered in source follow-up

A source search for `insert into platform_audit_events` found a direct runtime writer in `server/services/platform/coin-commerce-initial-confirmation.mjs` (source anchor `be261abc60f28bb2733764fa5364ab44b3e76844`, around lines 278-285). It bypasses `recordAuditEvent` and inserts `effect.metadata_json` directly.

The direct writer's builder is `resourceEvidence()` (around lines 106-182) and currently emits this exact schema for entity/action `coin_commerce_subscription_fulfillment / subscription_fulfillment_applied`:

- Exact keys: `version`, `commandRef`, `orderRef`, `accountId`, `requestRef`, `entitlementRef`, `issuedLinkRef`, `tenantRef`, `artifactRef`, `offerVersionRef`, `portalPlan`, `durationDays`, `monthlyTrafficGb`, `trafficLimitBytes`, `validFrom`, `previousValidUntil`, `targetValidUntil`.
- `version` is exactly integer `1`; `durationDays` is constrained by the source flow to `30` or `365`; numeric traffic values must remain bounded safe integers; date values are canonical source timestamps; all reference fields are opaque refs, not raw identity or subscription material.
- The same source path computes an integrity digest over the audit effect and writes the audit row and initial-confirmation row in one SQLite transaction. Preserve this atomicity and the exact metadata bytes/semantics during transformation.

This is a positive narrow-schema source path, but it does not close the general audit contract: `recordAuditEvent` still accepts a generic object, and the direct SQL writer proves that allowlist enforcement only inside `recordAuditEvent` would be incomplete. The target writer contract must dispatch on the exact `entity_type + action` pair and cover both entrypoints, or consolidate them behind one validated persistence boundary.

### 2.3 Other generic JSON blockers

- audit metadata: require an allowlist selected by entity_type + action; do not accept a generic object.
- issuance metadata: define the small observed producer union and reject other metadata.
- edge-node metadata: exact keys from the first-boot builder are source, receiptGateRequired, imageSafeConfirmed, artifactHashRecorded, wireguardPlanRef, wireguardPublicKeyFingerprint and agentAuthFingerprint; no extra keys.
- portal access events: define the observed union: traffic_supply_suspended, subscription_disabled, subscription_expired, delivery_generation_reissued, traffic_supply_resumed, wallet_first_resource_effect_applied and subscription_link_reset. Each event gets its own exact fields and timestamp/ref validation.
- second-factor JSON: only totp and passkey; versioned wrapper keys must be exactly version, allowedFactors and rememberMe when that wrapper form is used.
- commerce notices: operator-curated text only; set bounded item/count limits and reject URLs, markup/script, PII and secret-like strings before migration.

## 2.4 Writer-boundary enforcement matrix — 2026-11-07 follow-up

The 26-column inventory is complete as a source-path map, but this follow-up separates the current runtime enforcement from the proposed target contract. The key finding is that most high-risk JSON writers serialize a caller-supplied object after only generic shape checks; an allowlist in a downstream Worker or migration loader would be too late.

| JSON contract family | Current persistence boundary | Current enforcement observed | Required target enforcement |
|---|---|---|---|
| account-metadata/v1 | `createAccount()` in `subscription-control-db.mjs` | `assertNoUnsafeFields(input)` checks key names recursively; `jsonObject()` checks object shape only | Exact versioned keys and per-value types/enums; reject raw email/display refs, display name and low-entropy unkeyed digests |
| issuance-metadata/v1 | `createIssuanceRequest()` plus wallet-first chain insert/update in `subscription-control-db.mjs` | Draft now enforces exactly `{}`, `{cli:"platform:issue-subscription"}`, or the five-key `wallet_first_unique_v1` / `wallet_first_resource_chain_v1` v1 chain shape; refs use `safeControlRef` | CLOSED AT CURRENT STORE WRITERS; future variants require an explicit versioned contract |
| audit-metadata/v1 | `recordAuditEvent()` in `subscription-control-db.mjs` | Same generic object checks; one direct INSERT in `coin-commerce-initial-confirmation.mjs` | Exact schema selected by entity_type + action, enforced at every write entrypoint; direct writer must call same validator or be removed |
| edge-node-metadata/v1 | `edgeRegisteredNodeRecord()` used by upsert and insert-if-absent | Draft now enforces the exact first-boot key set, fixed source and receipt gate, boolean flags, safe WireGuard planRef, and optional lowercase SHA-256 identity fingerprints | CLOSED AT CURRENT STORE WRITERS; non-registration/test fixtures must use the same source contract |
| portal-access-event/v1 | `upsertPortalAccessRequest()` | `jsonObject()` only for event payload | Closed event discriminated union and exact keys per event; reject unknown event type/key/version |
| second-factor-list/v1 | `createPortalSecondFactorChallenge()` | `jsonArray()` plus optional boolean check for rememberMe; factors are not enum-checked here | Non-empty unique enum list limited to totp/passkey, or exact wrapper {version:1,allowedFactors,rememberMe}; reject duplicates and unknown keys |
| commerce-notices/v1 | `insertPublishedOffer()` | Persists normalizedOffer notice arrays as JSON; current normalization checks non-empty unique strings but lacks full item/count bounds and content filtering | Bounded item count and UTF-8 length; reject URLs, markup/script, PII and secret-like text before persistence |

### 2.5 Source-derived writer details and test obligations

- Account registration caller `portal-registration.mjs` currently writes 22 metadata keys (including raw `loginRef` and `displayRef`, and ordinary SHA-256 digests); the key-name guard does not catch these values. `portal-initial-account-issuance.mjs` separately writes `displayName`. These are explicit blockers, not merely a future schema concern.
- Issuance source producers are now closed in Draft: empty metadata for callers with no metadata, the exact CLI marker `{cli:"platform:issue-subscription"}`, and the five-key wallet-first chain variant (`commercialModel`, `resourceModel`, `resourceModelVersion`, `initialTransitionRef`, `lastTransitionRef`). Both initial insert and subsequent `lastTransitionRef` update use the same validator; unknown keys/versions and unsafe refs fail closed.
- Audit metadata has at least three independent source shapes: issuance compensation (`{compensation:...}`), entitlement traffic-limit change (`requestRef, reasonCode, previousTrafficLimitBytes, trafficLimitBytes`), and coin-commerce fulfillment's fixed 17-key evidence object. Additional actions must be enumerated from every caller before the allowlist is declared complete.
- The coin-commerce initial-confirmation direct writer remains inside the same SQLite transaction as its confirmation row. Do not consolidate it by moving the audit write outside that transaction.
- Portal event source names recorded in §2.3 form a closed candidate union, but every event's exact payload keys still require one-by-one source extraction and positive/negative fixtures.
- The second-factor persistence writer previously accepted values that the current reader may later ignore. Draft commit `c39b3987b557274fce2b9c4aabbf11367454245f` now enforces a non-empty, unique `totp` / `passkey` allowlist at the persistence boundary; integration assertions were added in `591629b0b0aaeab8679d2f79b793bef67137b19d`. Focused helper tests passed 4/4, but the full store test file has not yet been run.
- Commerce notice normalization is an input-level business validator, not a guarantee that already-normalized or internal callers cannot supply unsafe notice strings. Validate again at the final persistence boundary.

**Current result:** write-path discovery is complete for all 26 listed columns. Draft now closes the issuance metadata union and edge-node metadata allowlist at their current store writers. Account metadata remains BLOCKED by identity/PII custody; audit metadata remains BLOCKED by action-specific unions and a direct SQL writer; portal events remain BLOCKED by per-event unions and direct writers; commerce notices remain BLOCKED by bounds/content filtering. Passkey JSON remains DEFER. The full repository test file and CI have not been run.

## 3. Lease, idempotency and generation field audit

### 3.1 Lease token issuer formats

Five fields use a default 32-byte random token rendered as 64 lowercase hex:

- platform_coin_commerce_fulfillment_commands.lease_token
- platform_deferred_resource_transitions.lease_token
- platform_deferred_resource_transition_rebases.lease_token
- platform_wallet_first_resource_effect_runtime_claims.lease_token
- platform_portal_registration_welcome_coin_grants.lease_token

One field is different:

- platform_deferred_resource_transition_reservations.lease_token is created by coin-wallet-store.mjs using nextRef("deferred_reservation_lease"), whose default format is deferred_reservation_lease_ followed by randomUUID().

The target digest therefore treats each source token as an opaque UTF-8 string. Do not decode the 64-hex text into bytes and do not assume every issuer has the same grammar.

Lease target formula:
SHA-256(UTF8("flylink:d1:lease-token:v1\0") || LP(UTF8(raw_lease_token)))

LP is a four-byte unsigned big-endian byte length followed by the UTF-8 bytes. Preserve lease_generation, lease_until, status, attempt counters and every existing CAS predicate. Never store or log raw lease tokens.

### 3.2 Six raw idempotency columns and provider event

The six raw source columns are:

1. platform_coin_operation_receipts.idempotency_key
2. platform_coin_commerce_operation_receipts.idempotency_key
3. platform_deferred_resource_transition_operation_receipts.idempotency_key
4. platform_payment_orders.create_idempotency_key
5. platform_wallet_first_deferred_checkout_quotes.reserve_idempotency_key
6. platform_portal_registration_welcome_coin_grants.idempotency_key

Preserve each existing actor/account scope, operation type and replay-conflict behavior. The wallet-first quote reserve binding also retains its actor-type and actor-ref equality checks.

Provider event dedupe is separate: platform_payment_receipts.event_dedupe_key, scoped by merchant_scope_digest. It must use a separate provider-event key and domain.

Envelope format:
hmac-sha256:v1:<key-id>:<64-lowercase-hex>

Idempotency HMAC input:
HMAC-SHA-256(K[key_id],
  UTF8("flylink:d1:idempotency:v1\0") ||
  LP(UTF8(key_id)) ||
  LP(UTF8(domain)) ||
  LP(UTF8(actor_scope)) ||
  LP(UTF8(operation_type)) ||
  LP(UTF8(raw_idempotency_key)))

Provider-event HMAC input:
HMAC-SHA-256(K_provider[key_id],
  UTF8("flylink:d1:provider-event:v1\0") ||
  LP(UTF8(key_id)) ||
  LP(UTF8(merchant_scope_digest)) ||
  LP(UTF8(raw_event_dedupe_key)))

Key IDs are public metadata, not secrets. Key material is at least 32 random bytes and remains outside D1/source/logs. Unknown key IDs fail closed. New writes use the active key; lookups calculate candidates for retained key IDs until all rows and retry/reconciliation windows have expired or been re-keyed.

### 3.3 Existing pre-hashed wallet-first handoff exception

platform_wallet_first_setup_delivery_handoffs.idempotency_key_hash is not one of the six raw columns. Its current source algorithm is unkeyed SHA-256 over a domain prefix, NUL separator and raw idempotency key. The input validator permits a 16-128 character reference but does not prove minimum entropy. session_binding_hash is also an existing domain-separated unkeyed SHA-256 value.

Do not silently classify these as HMAC. Decide whether to:
- HMAC the legacy digest as a derived input and update source writes/lookups to the same versioned envelope; or
- retain a narrowly scoped legacy digest only after proving the input entropy and retention window are sufficient.

This exception needs its own compatibility test and owner decision.

### 3.4 Edge notification generation

Two production builder formats were found:
- gen_ followed by 24 lowercase hex characters;
- gen_scoped_ followed by 32 lowercase hex characters.

The `recordEdgeDesiredStateNotification` writer previously validated only required text. Draft commit `2a6865bdafcb27f6a741f84171220d27eca77576` now enforces the exact union `gen_[0-9a-f]{24}` / `gen_scoped_[0-9a-f]{32}` without trimming or coercing non-string input. Draft commit `11a4a8e6a7872a73cc1d5568a6255b2e0e983e4a` also applies `safeControlRef` to notification `id`, `nodeRef`, `channelRef`, and `desiredStateRef`. Integration assertions are in `254c0ad408052373de3e2963c3339bee18e9a89d`. Focused validator tests passed 5/5. Production stored values were not read; keep the field CONDITIONAL until a separately approved inventory/fixture proves historical values conform or are quarantined.

## 4. Payment action custody decision

Source evidence: payment-store.mjs normalizes HTTPS redirect/QR values, persists next_action_url in payment receipts and returns the URL through receipt/order projections while the order is pending or entry-ready. HTTPS alone does not prove the value is not a bearer capability.

Recommendation: Cloudflare Durable Objects with SQLite storage, one object per payment order, as the custody and lifecycle authority for raw payment action values. D1 stores only action_ref, type, expiry and status. Use application-layer AES-256-GCM encryption with a Worker secret binding; the encryption key is never stored in D1.

A valid action may be resolved repeatedly while active so a user can reopen a QR or redirect after a refresh. First read does not consume it. Consume only after verified payment settlement; revoke on cancellation/replacement; expire at provider/order expiry.

The full interface, failure-recovery saga, alarm behavior, restore reconciliation and operational approvals are in docs/D1_T2_PAYMENT_ACTION_CUSTODY_DESIGN_V1.md. This is a recommendation only; no Durable Object or key was created.

## 5. Retention and minimization

The only accepted numeric retention in this pass remains the existing 90-day Leads rule. The source has short active validity windows for some payment/quote records, but active expiry is not record retention.

docs/D1_T2_RETENTION_DECISION_RECORDS_V1.md records each data class, observed expiry, purge evidence, owner role required and unresolved decision. Raw usage samples remain excluded. Financial/audit/idempotency and portal event retention remain pending domain-owner/legal decisions. No default indefinite retention is authorized.

## 6. T2 closure gates

T2 remains BLOCKED until all applicable gates are closed:

1. Remove raw email/displayName from account metadata and decide the profile/identity source.
2. Approve separate keyed pseudonymization domains for any retained email/IP/request-key digests; no real key is provisioned.
3. Close the exact writer-boundary allowlists for account, issuance, audit, edge metadata, portal events, second-factor factors and commerce notices.
4. Resolve the existing wallet-first setup handoff unkeyed digest exception.
5. Approve idempotency/provider-event/PII key custody, key IDs, rotation and historical retry compatibility.
6. Approve payment action custody owner, Worker/DO interface, TTL, key custody and restore/outage operations.
7. Obtain named retention owners and approved periods for every unresolved class.
8. Enforce the generation grammar at the source writer and obtain an independent compatibility review without reading production values.
9. Obtain a separate independent T2 review using docs/D1_T2_INDEPENDENT_REVIEW_PACKET_V1.md.
10. Keep G2 limitations explicit: FK/CHECK attribution gaps, definition-only ordinary indexes, multi-replica withSession bookmark behavior and concurrent pagination snapshot semantics still require targeted evidence.

## 7. Authorization

Repository-only documentation and synthetic test design. No production DB reads, BWH connection, real secrets, remote D1 mutation, Worker/DO deployment, CI, PR, merge, dual-write, DNS or cutover. BWH remains production's only writer. A future G6 PASS authorizes consideration of the next separately approved step only.

## 8. Source-contract follow-up — 2026-11-07

The source audit corrected two earlier assumptions: one of six lease issuers uses a prefixed UUIDv4 rather than a 32-byte hex token, and the account metadata guard does not prevent raw email/displayName values or unkeyed SHA-256 PII digests from entering JSON. The 26-field writer inventory is now recorded in the companion audit.

The synthetic vector file contains nine tests covering five-hex/one-UUID lease issuer formats, all six idempotency HMAC domains, provider-event separation, PII digest pseudonymization, length-prefix ambiguity, key-ID envelope parsing and the two observed generation forms. The isolated Node test run passed 9/9. No full repository suite or CI was run.

The custody design recommends Durable Objects SQLite storage but is not implemented. The retention register has only the existing Leads 90-day period accepted; all other unresolved domain periods remain pending. The independent-review packet is prepared but has not been signed by a separate reviewer.

T2 is not approved and production migration is not authorized.


### 2.6 Draft writer implementation evidence — 2026-11-07

- Issuance metadata validator: source commit `a1b55bcc33e745b7094c93141d4a05530812c216`; store regression tests: `0943ffe6b2f98841edb1ec58b866c4034bc3bbc4`.
- Edge-node metadata validator: source commit `559156cbf8c4f841a80b20b68289811fb89efbba`; store regression tests: `4c0e3c7c32227dfbb581582f6e3123a495d366de`; preflight seed fixture aligned: `87e0147a8154b99339a8090f19e4793fc121196f`.
- A source-mirroring pure synthetic harness passed 10/10 issuance cases and 10/10 edge-metadata cases. This is not a run of the repository's Node test files.
- The complete `server/tests/platform-subscription-control-db.test.mjs` file, the preflight test file, the full repository suite and CI remain NOT RUN.
- No production historical JSON values were read. The validators are source-contract enforcement on the Draft branch only.
