# T2 Field Disposition — Independent Structural Review

> **Review status:** STRUCTURAL PASS WITH OPEN CONTRACT BLOCKERS.
> **Scope:** repository-only validation of the T2 field map against the T1 source inventory. This is not domain-owner approval, target DDL approval, production inventory, or migration authorization.
> **Reviewed branch head:** `1fd17f0196cca62757440ee5f627767f85dae986`.

## 1. Artifact reviewed

- `docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json`
- T1 inventory: `docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json`
- Source anchor: `master@be261abc60f28bb2733764fa5364ab44b3e76844`

## 2. Structural verification

| Check | Result |
|---|---:|
| Tables represented | 70 |
| Fields represented | 820 |
| Exact source field coverage | 820 / 820 |
| Missing / extra / duplicate field keys | 0 / 0 / 0 |
| Source type / nullability / PK / default / CHECK metadata mismatches | 0 |
| Unknown rule IDs | 0 |
| Duplicate target column names within a table | 0 |
| Invalid disposition/inclusion combinations | 0 |
| KEEP | 712 |
| TRANSFORM | 19 |
| EXTERNALIZE | 7 |
| DEFER | 23 |
| CONDITIONAL | 59 |
| Low-confidence field decisions | 1 |

The target candidate count is 790 = 820 - 7 EXTERNALIZE - 23 DEFER. Conditional fields remain candidates only after their exact gates pass; this is not a statement that 790 columns are production-present or ready to load.

## 3. Sensitive-field review

The seven EXTERNALIZE fields are:
- `platform_leads.email`
- `platform_leads.message`
- `platform_portal_access_requests.subscription_url`
- `platform_portal_totp_credentials.encrypted_totp_secret`
- `platform_payment_receipts.next_action_url`
- `platform_payment_orders_legacy_archive_20260803.checkout_url`
- `platform_payment_orders_legacy_archive_20260803.checkout_qr_code`

Lease capability fields are transformed to one-way SHA-256 digests with a domain prefix; generation, expiry, state guards and fencing remain required. Idempotency fields use versioned HMAC-SHA-256 and retain their exact actor/operation uniqueness and replay scope. No HMAC key has been provisioned or recorded.

## 4. Conditional and deferred tables

- Usage samples: conditional on finite retention, minimization, aggregation and query-load approval.
- Legacy Payment archive: conditional on exact legacy source fingerprint; D1 should construct final archive shape directly, not replay SQLite RENAME.
- Ads Consent tables: conditional on feature gate and source fingerprint; preserve `ad_personalization = 0` and epoch-ms semantics.
- Password and Passkey credential tables: DEFER; no production credential rows are assumed.
- Portal Link Reset, Ads Conversion, `subscriptions.sqlite`, third-party subscription DB and BWH credential-material files remain excluded from the first shared-control D1 boundary.

## 5. Open blockers — T2 is not fully approved

1. Domain-owner review and named accountable owners are pending; `ownerDomain` is not an individual approval.
2. Idempotency HMAC key custody, versioning, rotation and historical replay compatibility are not designed.
3. Every JSON field still needs an exact versioned schema/allowlist; generic unsafe-field scanning is insufficient.
4. Opaque-reference grammar and historical value conformance have not been tested against production values. Do not infer opacity from a `_ref` or `_id` suffix.
5. Provider event dedupe semantics and payment action URL custody/retrieval contracts remain unresolved.
6. Financial/audit/session/challenge/usage/consent retention schedules are incomplete. Business expiry is not automatically record-retention approval.
7. One low-confidence field remains: `platform_edge_desired_state_notifications.generation` is classified CONDITIONAL pending a stronger text/enum contract.
8. The accepted G2 compatibility limitations remain: attribution-limited FK/CHECK evidence, definition-only ordinary indexes, multi-replica `withSession()` bookmark behavior, and concurrent pagination snapshot semantics.

## 6. Next actions within T2

- Resolve the eight blockers above through source-contract review and synthetic tests; no production values are needed.
- Write explicit per-field JSON schemas and opaque-ref grammar.
- Specify HMAC key ID/version interfaces without provisioning secrets; test deterministic synthetic vectors and key-rotation/replay compatibility.
- Confirm provider event and action URL contracts using source documentation/test doubles.
- Obtain domain-owner decisions for retention and the single low-confidence field.
- Only then mark the field-disposition contract approved and proceed to T3 target DDL proposal.

## 7. Authorization boundary

Repository-only documentation and structural validation. No BWH connection, production DB read, customer row or credential access, remote D1 mutation, Worker deployment, CI, PR, merge or cutover. BWH remains the only production writer. G6 remains isolated synthetic/local D1 only.
