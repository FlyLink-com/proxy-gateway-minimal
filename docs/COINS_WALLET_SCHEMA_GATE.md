# Coins Wallet Schema Gate

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: source_only_coins_wallet_schema_gate
  superseded_by: null
  last_verified_at: 2026-07-23
  production_authority: false
```

> Status:
> - Risk: A
> - Process: source-only CLI and synthetic SQLite validation
> - Expected PR count: one source PR for this bounded foundation
> - Validation: focused CLI process tests, document authority, syntax, and whitespace
> - Production/AWS impact: none

## Source-only boundary

The repository contains a checksum-bound Coins wallet migration module and a
closed operator CLI. Their presence proves only that reviewed source exists.
It is not evidence that any production database was inventoried, backed up,
migrated, read back, or attached to a runtime.

`validate` is read-only. `dry-run` applies the reviewed migration only to an
owned temporary snapshot and verifies that the source database does not change.
Neither mode authorizes `apply`. An `apply` invocation is also not production
approval by itself: it is a bounded mechanism that may be used only after the
separate gate below is completed for one exact target.

This document records no production database identity, migration receipt,
runtime identity, account, wallet, order, or customer fact.

The PR1 schema makes hold and lot `expires_at` immutable after insert. Later
lifecycle operations may update only their authorized hold status, lot buckets,
timestamps, and evidence; they cannot rewrite the original deadline. This is a
source-only schema contract and grants no production apply or runtime authority.

## Closed CLI contract

The CLI always requires an explicit mode and an absolute database path. It has
no environment-variable or repository-relative database fallback. `apply`
also requires the exact reviewed migration ID and DDL checksum.

Safe source or synthetic commands use placeholders only:

```powershell
node scripts/platform-coin-wallet-schema.mjs --mode validate --db-path "<ABSOLUTE_SYNTHETIC_DB_PATH>"
node scripts/platform-coin-wallet-schema.mjs --mode dry-run --db-path "<ABSOLUTE_SYNTHETIC_DB_PATH>" --temp-root "<ABSOLUTE_OWNED_TEMP_ROOT>"
node scripts/platform-coin-wallet-schema.mjs --mode apply --db-path "<ABSOLUTE_SYNTHETIC_DB_PATH>" --confirm-migration-id "<EXACT_REVIEWED_MIGRATION_ID>" --confirm-ddl-checksum "<EXACT_REVIEWED_DDL_SHA256>"
```

The command emits exactly one closed JSON object. Evidence must retain only
safe status fields and aggregate checks; it must not include an absolute path,
database filename, raw exception, SQL, SQLite row, account ID, wallet or order
reference, customer data, secret, token, subscription URL, or credential.

## Wallet reference-index successor

The independent Wallet reference-index successor is
`20260730_001_coin_wallet_reference_indexes`, with DDL checksum
`2d8a0122a5a9078e9d6422f5230b03ae54789d50d0252485a29766dd3ab71d2b`.
It requires the exact Wallet foundation ledger row and foundation checksum
before it can validate, dry-run, or apply its own three-index migration.

The closed successor CLI is available only for source or synthetic SQLite
paths:

```powershell
npm run platform:coin-wallet:reference-index-schema -- --mode validate --db-path "C:\synthetic\wallet.sqlite"
npm run platform:coin-wallet:reference-index-schema -- --mode dry-run --db-path "C:\synthetic\wallet.sqlite" --temp-root "C:\synthetic\wallet-index-dry-run"
npm run platform:coin-wallet:reference-index-schema -- --mode apply --db-path "C:\synthetic\wallet.sqlite" --confirm-migration-id "20260730_001_coin_wallet_reference_indexes" --confirm-ddl-checksum "2d8a0122a5a9078e9d6422f5230b03ae54789d50d0252485a29766dd3ab71d2b"
```

Source presence and a successful local dry-run do not prove production apply.
Any future production apply still requires a fresh inventory, verified backup,
the exact artifact, maintenance/stop/rollback conditions, and explicit
operator approval for one exact target. The successor has no production down
CLI; forward-fix is preferred. Its production schema readback stops before
Wallet or Commerce runtime activation, which remain separate later approvals.

Stable exit classes are:

| Exit | Meaning |
| --- | --- |
| `0` | The requested source/synthetic operation completed and its closed checks passed. |
| `2` | The CLI contract or exact apply confirmation was rejected. |
| `3` | The database schema or integrity state was rejected. |
| `4` | A transient database or local infrastructure condition prevented a safe result. |

## Production apply gate

No production `apply` may begin until one fresh approval packet contains all of
the following for one exact target and one exact release:

1. **Fresh read-only inventory:** verify the absolute database target, owning
   service, current release pointer, schema ledger state, storage headroom,
   maintenance constraints, and current backup mechanism without dumping rows
   or protected material.
2. **Verified backup:** create an immutable pre-change whole-database backup,
   record its SHA-256 and exact size in protected operator evidence, open a
   separate verification copy, and prove SQLite `quick_check` is `ok`.
3. **Exact source and artifact identity:** bind the reviewed source commit,
   immutable artifact or release, migration ID, and DDL checksum. Any identity
   drift invalidates the packet.
4. **Explicit operator approval:** obtain approval naming the exact target,
   release, migration identity, mutation boundary, forbidden actions,
   validation, and rollback decision. Source review, `validate`, `dry-run`, and
   a prior approval are not reusable approval.
5. **Maintenance and rollback decision:** decide whether service quiescence is
   required, define the maintenance window and stop conditions, and select
   forward-fix or whole-database restore before mutation.
6. **Apply:** invoke only the reviewed CLI with explicit `apply`, the approved
   absolute target, and both exact confirmation values. Do not use an
   environment or repository fallback.
7. **Readback:** re-run closed validation, verify the exact ledger identity,
   schema shape, `quick_check`, foreign-key check, service ownership, and
   unchanged non-Coins sentinel facts using aggregate evidence only.
8. **Runtime hard stop:** keep the Coins runtime gate false after schema apply.
   Schema presence does not authorize wallet writes, payment settlement,
   product purchase, credential issuance, public routes, or customer traffic.
   Runtime enablement requires a later independent approval.

Stop immediately if the target, release, migration ID, DDL checksum, backup
checksum, maintenance decision, approval, schema, integrity checks, or runtime
gate cannot be proven exact. A failed or partial operation is not migration
evidence and must not be reported as production-ready.

## Rollback and financial-data boundary

There is no automatic down migration or production down CLI after financial
data exists. Dropping or rewriting Coins tables would destroy ledger meaning
and is forbidden. Forward-fix is the preferred response to an additive schema
defect.

A whole-database restore may also roll back unrelated business writes. It is
allowed only after an explicit recovery-point objective (RPO) decision accepts
that data-loss window, identifies affected write domains, verifies the selected
backup and restore procedure, and obtains a new exact Risk A approval. Restore
readback must repeat SQLite integrity, schema, service, and runtime-gate checks
before traffic resumes.

## Source validation

These commands validate repository source only and use no production database:

```powershell
node --test server/tests/platform-coin-wallet-schema-cli.test.mjs
node --test server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
node --test server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs
npm run docs:authority:check
node --check scripts/platform-coin-wallet-schema.mjs
node --check scripts/platform-coin-wallet-reference-index-schema.mjs
git diff --check
```

Passing them does not change production state or grant apply, deployment, or
runtime authority.
