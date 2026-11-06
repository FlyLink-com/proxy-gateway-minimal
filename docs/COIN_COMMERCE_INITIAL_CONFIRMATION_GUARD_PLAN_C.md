# Coin Commerce initial-confirmation guard · Scheme C forward migration

- Status: source-level implementation; Draft PR only.
- Baseline: `master@63082bae5d980c3905d6e7405329b19e6c4e38ac`.
- Prior extension: `20260906_001_coin_commerce_initial_confirmation`.
- New migration: `20261105_001_coin_commerce_initial_confirmation_guard_plan_c`.
- Authorization: source migration, schema inspection/validation, and local synthetic tests only. No persistent database apply, remote resource, BWH, production data, DNS, or deployment.

## Purpose

The original INSERT guard has a 43-term flat conjunction plus a nested receipts anti-existence predicate. D1 stores the trigger definition but rejects DML compilation at expression depth 100. The approved Scheme C rewrite keeps one BEFORE INSERT trigger and all 44 database predicates while splitting the candidate chain into independent, primary-key-anchored EXISTS groups.

## Exact predicate partition

| Group | Predicates | Scope |
|---|---:|---|
| S1 | 18 | Failed command, reconciliation order, captured hold, owning wallet |
| S2 | 16 | Audit event identity and all JSON evidence bindings |
| S3 | 9 | Issuance request, active entitlement, active issued link |
| S4 | 1 | No existing fulfillment receipt for the command or requested receipt reference |
| **Total** | **44** | All checks remain in the database |

The trigger name remains `coin_commerce_initial_confirmations_insert_guard`. The rejection signature remains `coin_commerce_initial_confirmation_binding_invalid`. The immutable UPDATE and DELETE triggers and both downstream state-transition triggers remain unchanged. The application write module `coin-commerce-initial-confirmation.mjs` is unchanged.

The new migration contains exactly two DDL statements: DROP the existing INSERT guard, then CREATE the approved Scheme C guard. They run inside one immediate transaction with the new ledger insert, so a failure rolls back the replacement and ledger together.

## Migration ledger and validation

The new migration adds one row to the existing shared `platform_schema_migrations` table. It does not create a second ledger or change the original extension ID/checksum.

The checksum is a domain-separated SHA-256 over the exact UTF-8 DROP and CREATE statements joined by NUL. Read the value from `COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS[0].ddlChecksum` on the exact reviewed source commit.

The dedicated command `platform:coin-commerce:initial-confirmation-guard:schema` supports:

- `validate`: read-only validation of the original extension and the Plan C ledger/trigger.
- `dry-run`: apply on a private backup clone, validate, and verify that the source file and read-only source state remain unchanged.
- `apply`: requires the exact migration ID and checksum; no other write mode is exposed.

The existing `remove-unused` inverse for the optional extension also removes the follow-on Plan C ledger row, but only when the confirmation table is empty.

## Verification contract

- Keep the original foundation and extension checksums unchanged.
- Require the original extension ledger row before applying Plan C.
- Require the exact Plan C checksum and trigger SQL after apply.
- Assert all 44 expected predicate fragments remain present exactly once in the single guard.
- Verify legal recovery, invalid metadata binding, prior-receipt rejection, immutable UPDATE/DELETE, and both downstream terminal transitions.
- Verify wrong ID/checksum fail before writes and dry-run leaves the source unchanged.
- The prior G2 Miniflare D1 + better-sqlite3 91/91 trigger receipt remains independent compatibility evidence; it is not production migration approval or a substitute for these source migration tests.

## Explicit non-goals

No production DDL execution, customer data access, BWH connection, remote Cloudflare API/D1/Worker access, DNS change, deploy, feature enablement, or cutover. The Draft PR does not authorize any of those actions.
