# T2 · D1 Field Disposition Contract v1

> **Status: Draft proposal — pending domain-owner review and final target-schema approval.** This is a field-level migration contract, not production data inspection, D1 SQL, or permission to migrate.
> Source head: `be261abc60f28bb2733764fa5364ab44b3e76844`; source inventory: `docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json`.

## 1. Scope and totals

- Shared `control.sqlite` only; first D1 target remains one database.
- BWH Node/Express + SQLite remains the sole production writer until a separately approved cutover. No dual-write.
- 70 source tables / 820 fields are classified. No production values were read; actual table presence remains NOT_OBSERVED.

| Table disposition | Tables |
|---|---:|
| KEEP | 64 |
| CONDITIONAL | 4 |
| DEFER | 2 |

| Field disposition | Fields |
|---|---:|
| KEEP | 712 |
| CONDITIONAL | 59 |
| EXTERNALIZE | 7 |
| TRANSFORM | 19 |
| DEFER | 23 |

Target-column candidates: **790** (including conditional columns). Unconditional KEEP/TRANSFORM columns: **731**. Low-confidence fields requiring review: **1**.

Every field row includes source affinity/nullability/PK/unique/default/check markers, proposed D1 column/type, disposition, rationale, confidence, domain owner, retention, transform, and required test IDs. Every row remains `PROPOSAL_PENDING_REVIEW`; a carried-forward policy basis is not a claim that this new per-field contract has been finally approved.

## 2. Critical data boundaries

| Source field(s) | Disposition | D1 target rule |
|---|---|---|
| `platform_leads.email`, `platform_leads.message` | EXTERNALIZE | Remove raw values; retain opaque contact reference only. Existing 90-day expiry/purge contract applies to contact custody. |
| `platform_portal_access_requests.subscription_url` | EXTERNALIZE | Remove raw URL; use opaque material reference (or reuse `artifact_id` only after proving it is opaque and resolvable). |
| `platform_portal_totp_credentials.encrypted_totp_secret` | EXTERNALIZE | No encrypted TOTP blob in D1; keep credential identity/status/counters. Legacy `enc:<base32>` is not true encryption; require re-registration/re-protection or approved custody. |
| `platform_payment_receipts.next_action_url` | EXTERNALIZE | Remove raw provider action URL; retain short-lived `next_action_ref`, type and expiry. |
| `platform_payment_orders_legacy_archive_20260803.checkout_url`, `checkout_qr_code` | EXTERNALIZE | Remove raw URL/QR payload; opaque reference/digest only if archive is proven present. |
| All `lease_token` columns | TRANSFORM | Rename to `lease_token_hash`; SHA-256 with domain prefix `flylink:d1:lease-token:v1`; preserve generation, expiry, state guards and fencing. |
| Raw idempotency key columns | TRANSFORM | Rename to `*_digest`; proposed versioned domain-separated HMAC-SHA-256. Key stays outside D1 and is not created in this task. |
| `metadata_json`, `event_json`, `payload_json` allowlisted fields | TRANSFORM | Canonical JSON + exact versioned recursive allowlist; reject unknown/sensitive keys and values. |
| Controlled snapshots / policy JSON | KEEP | TEXT only after exact schema validation and recursive sensitive-value rejection. |
| `platform_portal_password_credentials`, `platform_portal_passkey_credentials` | DEFER | Do not migrate credential rows. Empty schema inclusion is a separate DDL decision; no production rows are inferred from source DDL. |
| Ads Consent and Payment legacy archive | CONDITIONAL | Require exact feature/legacy gate and independently verified production presence; Ads Consent needs a versioned baseline fingerprint. |
| `platform_usage_samples` | CONDITIONAL | Require finite retention, aggregation decision, and workload justification; never copy unbounded history. |

Raw Edge UUID/password/private-key/rendered config/YAML remain in protected BWH custody and are outside the SQL inventory. D1 stores only opaque refs, digests, generation, status and safe receipts.

## 3. Type and representation contract

- Preserve source SQLite affinities: TEXT stays TEXT; INTEGER stays INTEGER; no blanket type coercion.
- Boolean fields remain INTEGER `0/1` with explicit CHECK; do not introduce a BOOLEAN storage type.
- Preserve TEXT ISO-UTC timestamps where source uses text; preserve Ads Consent epoch-millisecond timestamps as INTEGER.
- Preserve numeric safe-integer, sign, amount, byte, version, generation, percentage and currency-exponent bounds.
- JSON remains TEXT but must be canonical and field-specific; a `_json` suffix is not proof of safety.
- Existing `*_hash`, `*_digest`, `*_sha256`, `*_checksum` values require algorithm/domain/canonicalization verification; names alone do not establish safety.
- All `*_ref` / `*_id` / actor references remain only if opaque: not email, username, URL, absolute path, bearer token, raw credential or runtime material.
- Use `schemaDigest` as schema-content identity. Do not include SQLite `PRAGMA schema_version` in identity fingerprints.

## 4. Transaction and ledger invariants

1. Preserve `platform_schema_migrations` as the source business migration ledger and Wrangler `d1_migrations` as a separate D1 execution ledger. Complete Migration IDs are the identity; same-day duplicate sequence numbers are not collapsed.
2. Do not replay temporary Welcome Bonus 22-column rebuild steps; target the terminal 21-column shape directly.
3. Do not replay the conditional Payment legacy `RENAME`; construct a final archive target only after exact presence/fingerprint proof.
4. Payment remains Payment → Wallet → Payment → Referral multi-stage idempotent settlement/reconciliation, not one fictitious cross-store ACID transaction.
5. Subscription fulfillment remains D1 Control ↔ BWH runtime durable command/outbox/receipt/reconciliation; D1 and BWH do not share distributed ACID.
6. Deferred Transition remains a single-D1 atomic boundary with Lease fencing/outbox; Cron/Queues only wake/claim and do not replace the state machine.
7. Commerce's Wallet participant shares the same SQLite handle in source; same file path across separately opened stores does not imply one shared transaction.

## 5. Required test contracts

| Test ID | Required evidence |
|---|---|
| `T2-SCHEMA-001` — Field/schema parity | For every included field, D1 column name/type/nullability/default/PK/UNIQUE contract matches its mapping row. EXTERNALIZE and DEFER fields are absent from D1 target v1; CONDITIONAL fields are absent unless their gate passes. No source column is silently dropped or renamed without an explicit mapping. |
| `T2-KEEP-001` — KEEP preservation | Deterministic source-to-target mapping preserves values and ordering semantics. All opaque refs are checked by the reference contract; no raw PII, URL, file path, bearer token, or runtime material is accepted. |
| `T2-TRANSFORM-001` — Transform determinism | Transforms are deterministic for a fixed version and input. A replay produces the same target value; source values never appear in target dumps, logs, or test snapshots. Transform version is explicit and upgradeable without silent reinterpretation. |
| `T2-NO-LEAK-001` — No secret/PII leakage | D1 dump, Worker request/response, logs, traces, backups, and failure diagnostics contain none of the externalized raw values. Negative fixtures with signed URLs, bearer query strings, emails, free text, TOTP blobs, QR payloads, and raw edge materials are rejected or externalized. |
| `T2-CUSTODY-001` — External custody referential integrity | Every retained custody reference resolves to an approved custodian and lifecycle state. Expiry, revocation, purge, and deletion propagate without copying raw material into D1. |
| `T2-DEFER-001` — Deferred feature gate | Deferred tables/rows are not copied in target v1. Unexpected non-empty source rows fail closed and require a separate decision rather than silent omission. |
| `T2-GATE-001` — Conditional inclusion gate | Conditional source presence/feature predicate is independently proven. When false, target object/data is absent; when true, exact baseline fingerprint and approved migration path are required. |
| `T2-OPAQUE-REF-001` — Opaque reference validation | Reject email, username, URL, absolute path, bearer token, raw UUID/password, credential material, and unbounded user text. Validate namespace, stable identity, length, case, and owner relationship. |
| `T2-DIGEST-001` — Existing digest verification | Verify digest algorithm, domain prefix, canonicalization, encoding, and source generation before retaining existing digest columns. Never infer that a field is safe solely because its name ends in hash/digest/checksum. |
| `T2-LEASE-FENCE-001` — Lease digest and fencing | Store only versioned lease-token digest; compare submitted raw token after applying the same domain-separated digest. Preserve lease_generation, lease_until, state guards, expiry, and CAS/fencing behavior; stale generation/token must fail. Old lease token must not appear in D1 or logs. |
| `T2-IDEMPOTENCY-REPLAY-001` — Idempotency digest and replay | Use a versioned domain-separated HMAC digest for raw idempotency keys; HMAC key is held outside D1 and shared only with authorized migration/Worker runtimes. Same scope + same key + same request digest replays the same result; same scope + same key + different request digest fails with the existing conflict signature. Preserve actor_scope/operation_type uniqueness and cross-domain separation; test key rotation/version behavior. |
| `T2-JSON-ALLOWLIST-001` — Versioned JSON allowlists | Every JSON field has an exact versioned schema and canonical serialization. Recursively reject PII, URLs, tokens, passwords, private keys, raw UUID/password materials, arbitrary free text, unknown keys, oversized/deep structures. Do not treat assertNoUnsafeFields() as a whole-table guarantee. |
| `T2-TIME-SEMANTICS-001` — Timestamp semantics | Preserve TEXT ISO-UTC representation where source uses text; preserve INTEGER epoch-millisecond semantics for Ads Consent fields. Do not globally coerce timestamps or use SQLite PRAGMA schema_version as schema identity; schemaDigest is the content fingerprint. Test precision, timezone, ordering, nullability, and boundary comparisons. |
| `T2-BOOLEAN-CHECK-001` — Boolean representation | Keep booleans as INTEGER 0/1, not a new BOOLEAN storage type. Enforce CHECK(value IN (0,1)) and reject null/out-of-domain values where source contract is NOT NULL. |
| `T2-NUMERIC-RANGE-001` — Numeric bounds | Preserve INTEGER storage and source safe-integer limits; reject overflow, fractional, negative, and out-of-range values where disallowed. Validate financial amounts, units, bytes, counters, versions, currency exponents, and percentages with domain-specific bounds. |
| `T2-USAGE-RETENTION-001` — Usage minimization and retention | Do not migrate unbounded raw samples before finite retention and workload policy are approved. Compare permitted aggregates/rollups against synthetic source totals and verify purge/aggregation boundaries. |
| `T2-ADS-CONSENT-001` — Ads Consent gate and semantics | Require ADS_CLICK_BINDING_ENABLED and independently verified production object presence. Preserve ad_personalization=0 hard constraint and epoch-millisecond timestamps; create a versioned baseline fingerprint before migration. |
| `T2-TOTP-CUSTODY-001` — TOTP credential custody | No encrypted TOTP blob enters D1, Worker payloads, logs, or backups. Legacy enc:<base32> is not treated as encryption; require re-registration/re-protection or separate approved custody path before cutover. |
| `T2-FUTURE-AUTH-GATE-001` — Future auth schema gate | Do not infer production password/passkey rows from source DDL. Password verifier migration requires approved hashing/reset/abuse controls; passkey migration allows public JWK only and rejects private JWK member d. |
| `T2-FINANCIAL-INVARIANT-001` — Financial ledger and saga invariants | Preserve coin lot conservation, wallet versioning, immutable ledger, holds/allocations, order snapshots, and financial integer bounds. Payment settlement remains Payment → Wallet → Payment → Referral with idempotency and reconciliation; no false cross-store ACID claim. Deferred remains one-D1 strong atomic boundary with Lease/outbox; subscription fulfillment remains D1 ↔ BWH durable command/receipt/reconciliation. |

## 6. Open blockers before T2 can be accepted

- All field decisions remain proposals pending accountable domain-owner review and final target-schema approval.
- Named accountable owners are not assigned; current owner values identify source modules/domains only.
- Production table presence, source values, row counts, database size, WAL, workload, and retention distributions remain NOT_OBSERVED.
- Exact retention schedules remain unresolved for financial/audit records, sessions/challenges after expiry, usage samples, and consent evidence.
- Idempotency HMAC key custody/version/rotation is not designed or provisioned.
- Field-specific JSON allowlists are not yet specified for every JSON field.
- Opaque-reference grammar and historical value conformance have not been tested against production data.
- Provider event_dedupe_key semantics require provider-contract evidence.
- G2 accepted scope is local Wrangler/Miniflare plus synthetic data, not complete D1 equivalence; 42 companion FK/deferred behavior, CHECK functions, partial indexes, batch/withSession bookmarks and concurrent pagination snapshot semantics require explicit testing.
- 18 historical migration checksums retain G1-28 runtime-recomputation provenance plus current-head diff review; this is not a 19/19 current-head runtime re-execution. Plan C checksum was independently recomputed.

## 7. Validation and authorization boundary

- Generator output covers exactly 70 source tables and 820 source columns, preserving the source inventory reference for each field.
- This document proposes field treatment only; it does not generate target D1 DDL, transform real data, or claim any production values satisfy the rules.
- No BWH/production database or row values were accessed. No remote D1 resource was created or modified; no Apply, Worker deployment, CI, PR, merge, DNS, or cutover occurred.
- Next safe step: independent review of the 820-field map, resolve low-confidence and retention/HMAC/JSON blockers, then derive target DDL and synthetic fixtures as a separate Draft task.
