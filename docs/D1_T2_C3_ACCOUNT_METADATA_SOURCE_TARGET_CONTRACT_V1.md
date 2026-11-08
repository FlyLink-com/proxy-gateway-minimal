# D1 T2-C3 Account Metadata Source/Target Contract v1

> **Status:** BWH source-writer contract and synthetic D1 projection gate validated. D1 account metadata migration remains **BLOCKED** pending Auth0 identity externalization and C2 HMAC custody.
> **Source branch:** `docs/t2-c3-account-metadata-contract-20261108`.
> **Production boundary:** Source-only code and synthetic tests. No BWH connection, production row read, D1 write, or cutover.

## 1. Source-writer defects found and corrected

The fixed Node 22.23.1 run of `platform-subscription-control-db.test.mjs` exposed four failures in the current source branch:

1. `createAccount()` incorrectly reused `issuanceMetadataJson()`. That rejected existing operator provisioning, Portal login and Portal registration account metadata.
2. `createIssuanceRequest()` used generic `jsonObject()`, so the closed issuance metadata union was not enforced at the actual writer.
3. The closed issuance union did not include the already-used data-pack v1 metadata shape.
4. The legacy Portal access schema-upgrade fixture attempted to write an obsolete event shape through the newly closed event writer.

Corrections:
- Added a separate, bounded `accountMetadataJson()` source-writer contract. It accepts the known BWH account metadata fields, validates field types and rejects unknown fields, unsafe keys, malformed login refs and malformed digests.
- Restored `issuanceMetadataJson()` at the issuance-request writer boundary and registered the exact data-pack v1 variant alongside the existing CLI and Wallet-first chain variants.
- Kept the legacy schema-upgrade test focused on schema compatibility by writing an empty event object; legacy event JSON is not reintroduced as a new writer variant.
- Added explicit source compatibility coverage for the full Portal registration metadata shape.

The account source-writer allowlist is explicitly **not** the D1 target allowlist. It preserves current BWH runtime compatibility while preventing arbitrary JSON writes.

## 2. Current source metadata classification

| Source field group | Fields | D1 disposition |
|---|---|---|
| Safe business/legal flags | `initialAccount`, `requireSecuritySetup`, `registrationSource`, `singleSubscriptionOnly`, `subscriptionLimit`, `intentPlan`, `requestedDeviceCount`, `primaryRegion`, `legalAgreementAccepted`, `legalAgreementAcceptedAt`, `termsVersion`, `privacyVersion` | Eligible for the versioned target allowlist after validation |
| Identity/display PII | `loginRef`, `displayRef`, `displayName` | Externalize to Auth0/identity profile; never copy into target `metadata_json` |
| Legacy unkeyed digests | `contactDigest`, `loginDigest`, `displayDigest`, `useCaseDigest`, `legalAgreementSourceIpDigest`, `legalAgreementRequestKeyDigest`, `registrationSourceIpDigest`, `registrationRequestKeyDigest` | Do not migrate as plain SHA-256; replace only through approved, domain-separated C2 HMAC or remove with an approved purpose decision |
| Source-only markers | `source`, `channel`, `synthetic` | Exclude from target business metadata; preserve source-only provenance separately where needed |

The existing email digests are deterministic SHA-256 values over low-entropy inputs. They are not treated as anonymization and are not accepted as D1-safe pseudonyms.

## 3. D1 target projection gate

Added `projectAccountMetadataForD1()` to `server/services/platform/control-json-contracts.mjs`.

- Emits only a versioned JSON object containing the safe business/legal allowlist.
- Rejects unknown fields, malformed safe values, accessors, proxies and non-plain objects.
- Reports identity fields as `identity_externalization_required`.
- Reports legacy digests as `keyed_digest_replacement_required`.
- Returns no `metadataJson` when either blocker exists; it does not silently drop PII or digest fields.
- Returns only source-only field names when those fields are intentionally excluded; their values are not projected.

This is a pure, source-only projection contract. It does not call Auth0, create HMACs, provision keys, or read source rows.

## 4. Fixed-runtime evidence

Runtime: Node.js v22.23.1; better-sqlite3 12.10.0; SQLite 3.53.1. All execution was in isolated non-production Vercel sandboxes.

### Full SQLite control-store suite

`server/tests/platform-subscription-control-db.test.mjs`:

- **45/45 PASS**, run 1; 0 failed, 0 skipped.
- TAP SHA-256: `b7d0e4da530d0b2ae4535adbeeaf27be45c7bb835f0a68c9e76a8d5637ade74a`.
- **45/45 PASS**, run 2; 0 failed, 0 skipped.
- TAP SHA-256: `690d044fa2d92675d193827d0bd0192e5c57c80dc54f62da40f27395b23cbc30`.

### JSON, payment custody, key escrow and source inventory contracts

Combined focused suite:
- **48/48 PASS**, run 1; TAP SHA-256 `37f1ab071b3e6915f2f63a90d9bfb139f43f5ce15cf3cd56bf2f253831d3137e`.
- **48/48 PASS**, run 2; TAP SHA-256 `66ad182eea46dadcd111c0ca429690d305478fd5e829190b9b8b6cd60fb9392`.
- `node --check`: **9/9 PASS**.
- The source-only schema inventory command passed with 70 tables, 820 columns, 126 foreign-key edges, 88 indexes, 91 triggers, and 19 source migration entries.

The 48 cases comprise:
- Shared JSON contracts, including the new D1 account metadata projection: 14.
- Synthetic payment-action custody: 14.
- Synthetic key escrow/restore: 10.
- Source-only schema inventory validator: 10.

## 5. Remaining C3 work

C3 remains OPEN. The validated source contract and synthetic projection gate do not close the target migration decision.

Remaining work:
1. Complete Auth0 identity mapping and prove the account-to-identity relation before removing legacy `loginRef`/`displayRef` dependencies.
2. Obtain the grouped C2 HMAC key-custody approval and implement domain-separated keyed replacements for only the digests with an approved continuing purpose.
3. Complete the field-specific allowlist and writer-path review for all 26 JSON fields; this account metadata contract is one field, not a substitute for the full 26-field review.
4. Reconcile the source/target projection with retention decisions and synthetic import/replay tests.

No target D1 data load, DDL apply, Worker/DO deployment, BWH mutation, or production writer change is authorized by this work. BWH remains the only production control-data writer.
