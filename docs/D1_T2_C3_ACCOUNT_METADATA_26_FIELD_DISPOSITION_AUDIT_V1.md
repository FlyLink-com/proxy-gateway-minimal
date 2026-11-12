# D1 T2-C3 Account Metadata 26-field Disposition Audit v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: d1_t2_c3_account_metadata_26_field_disposition_audit
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```


> **Status:** SOURCE-ONLY FIELD AUDIT. No account metadata was read from BWH or production.
> **Source:** `server/services/platform/subscription-control-db.mjs`, `ACCOUNT_METADATA_FIELDS` and `accountMetadataJson()` (exact child-branch blob reviewed).
> **Target rule:** The legacy SQLite JSON object is not a D1 load contract. Apply the dispositions below before any target D1 write.

## 1. Exact field inventory

The source allowlist contains **26 fields**, of which **8 are unkeyed SHA-256 digests**. The current writer explicitly documents that raw login/display refs and unkeyed SHA-256 digests must be externalized/replaced before any D1 account-metadata load.

| # | Field | Current source validation | Data classification | D1 target disposition |
|---:|---|---|---|---|
| 1 | `source` | lowercase token | Operational metadata | Keep only if target purpose is documented; normalize to bounded enum |
| 2 | `channel` | lowercase token | Operational metadata | Keep only if target purpose is documented; bounded enum |
| 3 | `synthetic` | boolean | Environment/test marker | Keep only as explicit test provenance; never use to infer production presence |
| 4 | `displayName` | free text, max 254, controls rejected | Direct identifier / personal data | Do not place in generic account metadata; use approved profile field with access/retention controls |
| 5 | `loginRef` | email-shaped string, max 254 | Direct identifier / authentication PII | Externalize to Auth0 identity mapping; D1 stores only opaque Auth0 subject/reference |
| 6 | `displayRef` | free text, max 254 | Direct identifier / personal data | Externalize to approved profile store; do not load raw into generic control metadata |
| 7 | `initialAccount` | boolean | Business state | Keep if product semantics require it; define immutable owner/source |
| 8 | `requireSecuritySetup` | boolean | Security workflow state | Keep only as a derived, explicit workflow state; Auth0/MFA remains authoritative |
| 9 | `registrationSource` | fixed `self_service_portal` | Acquisition/provenance | Keep as bounded enum if needed for reporting |
| 10 | `singleSubscriptionOnly` | boolean | Commercial policy | Keep only if this policy remains supported and has a named owner |
| 11 | `subscriptionLimit` | integer 1–20 | Commercial policy | Prefer normalized entitlement/account policy column; do not leave implicit in JSON |
| 12 | `contactDigest` | 64 lowercase hex | Unkeyed SHA-256 pseudonym | Do not migrate as-is; replace with purpose-separated keyed HMAC only if contact matching has an approved purpose |
| 13 | `loginDigest` | 64 lowercase hex | Unkeyed SHA-256 pseudonym of login | Do not migrate as-is; replace with identity-provider subject or purpose-separated keyed HMAC if strictly required |
| 14 | `displayDigest` | 64 lowercase hex | Unkeyed SHA-256 pseudonym | Do not migrate as-is; remove unless a documented matching use exists; otherwise keyed HMAC |
| 15 | `useCaseDigest` | nullable 64 lowercase hex | Unkeyed SHA-256 pseudonym of potentially sensitive free text | Default DROP; only retain a purpose-limited keyed HMAC after Privacy approval |
| 16 | `intentPlan` | trial/monthly/yearly | Commercial intent | Keep only if still needed; normalize to bounded enum |
| 17 | `requestedDeviceCount` | integer 1–20 | Product preference | Keep only if needed for fulfillment; otherwise drop after fulfillment |
| 18 | `primaryRegion` | lowercase token | Service preference | Keep as bounded region code if operationally required |
| 19 | `legalAgreementAccepted` | boolean | Consent evidence | Preserve in dedicated consent record, not generic metadata |
| 20 | `legalAgreementAcceptedAt` | ISO timestamp | Consent evidence | Preserve in dedicated consent record with immutable version/reference |
| 21 | `termsVersion` | bounded token | Consent evidence | Preserve in dedicated consent record |
| 22 | `privacyVersion` | bounded token | Consent evidence | Preserve in dedicated consent record |
| 23 | `legalAgreementSourceIpDigest` | nullable 64 lowercase hex | Unkeyed IP pseudonym / personal data | Do not migrate as-is; minimize. If legally required, purpose-separated keyed HMAC with finite TTL |
| 24 | `legalAgreementRequestKeyDigest` | nullable 64 lowercase hex | Unkeyed request correlation pseudonym | Do not migrate as-is; replace with short-lived purpose-separated HMAC or drop |
| 25 | `registrationSourceIpDigest` | nullable 64 lowercase hex | Unkeyed IP pseudonym / personal data | Do not migrate as-is; minimize. If strictly required, purpose-separated keyed HMAC with finite TTL |
| 26 | `registrationRequestKeyDigest` | nullable 64 lowercase hex | Unkeyed request correlation pseudonym | Do not migrate as-is; replace with short-lived purpose-separated HMAC or drop |

## 2. Required target transformations

1. **Identity:** remove raw `loginRef`; Auth0 is the target authentication authority. Retain only an opaque Auth0 subject or stable internal account reference, with explicit uniqueness and recovery rules.
2. **Profile:** `displayName` and `displayRef` move out of generic control metadata. A profile field requires an identified data owner, access policy, purpose, and retention.
3. **Digest migration:** all eight current digest fields are plain SHA-256, not keyed HMAC. They cannot be re-keyed from the digest alone. Either drop them, recompute from an authorized canonical source during a separately approved migration, or leave the affected matching capability unavailable until re-consent/re-enrollment. Do not silently relabel them as HMAC.
4. **Consent:** fields 19–22 should map to a dedicated append-only consent evidence model containing subject, purpose/document version, accepted time, source, and evidence reference. IP/request correlation is not automatically part of the consent record.
5. **Business policy:** fields 7–11 and 16–18 should be normalized into explicit typed columns or bounded enums only where current product behavior requires them. Remove stale/unused fields rather than preserving them for convenience.
6. **Privacy defaults:** `useCaseDigest`, IP digests, and request-key digests default to DROP pending a documented purpose and Privacy owner decision.

## 3. C3 acceptance checklist

- [x] Exact 26-field legacy source allowlist enumerated.
- [x] Eight unkeyed SHA-256 digest fields identified.
- [x] Raw email/display identifiers identified.
- [x] Source contract explicitly states this is not the D1 target projection.
- [x] Auth0 identity, consent evidence, profile data, business state, and pseudonymous data separated.
- [ ] Account/Identity owner approves the target identity mapping and profile destination.
- [ ] Privacy owner approves or drops each digest purpose and its TTL.
- [ ] Legal/Compliance owner confirms consent evidence fields and jurisdictional retention.
- [ ] D1 target projection is implemented and covered by writer integration tests.
- [ ] Full `platform-subscription-control-db.test.mjs` and exact-head 26-field writer-path regression pass.

## 4. Explicit non-authorization

This audit does not authorize reading production account metadata, migrating any raw email/display value or digest, changing Auth0, creating a D1 table, running DDL, loading rows, or deleting legacy fields. It is a source-grounded disposition proposal. C3 remains OPEN until the named domain decisions and target writer evidence are complete.
