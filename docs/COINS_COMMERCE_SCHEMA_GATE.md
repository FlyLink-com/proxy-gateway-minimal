# Coins Commerce Schema Gate

Last updated: 2026-11-05.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: source_only_coins_commerce_schema_gate
  superseded_by: null
  last_verified_at: 2026-11-05
  production_authority: false
```


This is a source-only Risk A runbook for the additive Coins Commerce schema.
It is not production authority, does not record a current deployment, and
contains no production database path. Every production use requires a new,
exact operator gate and fresh read-only evidence.

## Source contract

The reviewed migration identity is:

```text
20260726_001_coin_commerce_foundation
```

The exact DDL checksum must be read from the reviewed source commit's
`COIN_COMMERCE_MIGRATIONS[0].ddlChecksum` export. From that exact local
checkout, use this read-only command; it opens no database and displays no
database path:

```powershell
node --input-type=module -e "import { COIN_COMMERCE_MIGRATIONS } from './server/services/platform/coin-commerce-migrations.mjs'; process.stdout.write(COIN_COMMERCE_MIGRATIONS[0].ddlChecksum + '\n')"
```

Do not copy a checksum from an old report.
Commerce reuses `platform_schema_migrations`; it does not create a second
ledger. Apply requires the exact Wallet foundation migration and checksum.
It adds only seven `platform_coin_commerce_*` tables and their named indexes
and triggers. It does not alter Wallet-owned objects.

The CLI has no environment-derived or default database path:

```powershell
npm run platform:coin-commerce:schema -- --mode validate --db-path <absolute-reviewed-path>
npm run platform:coin-commerce:schema -- --mode dry-run --db-path <absolute-reviewed-path> --temp-root <absolute-owned-temp-root>
npm run platform:coin-commerce:schema -- --mode apply --db-path <absolute-reviewed-path> --confirm-migration-id 20260726_001_coin_commerce_foundation --confirm-ddl-checksum <exact-reviewed-checksum>
```

`validate` and `dry-run` reject apply confirmations. `apply` rejects missing or
non-exact confirmations. Stdout is one closed JSON line; it never contains the
database path, filename, SQL, rows, IDs, references, or exception text.

## Required production approval packet

Before any separately approved production use, prepare all of the following
without changing the target:

1. Fresh read-only inventory that identifies the host/runtime role, service
   state, immutable release/source identity, and the database file identity.
2. Exact database identity using an operator-supplied absolute path, ownership,
   permissions, size, hash, SQLite header, journal mode, and active-writer
   inventory. Never infer the path from an environment default.
3. Read-only schema validation proving the exact Wallet migration row/checksum,
   current migration ledger shape, integrity checks, and whether any Commerce
   object or migration row already exists.
4. A restorable, immutable backup identity, storage location, checksum,
   retention window, and restore-test evidence. A copy without a restore test
   is not an accepted backup.
5. The exact Commerce migration ID and checksum from the candidate source,
   plus the exact command line with placeholders resolved by the operator.
6. RPO/rollback decision: the approved acceptable write-loss window, writer
   quiescence plan, restore owner, time limit, and stop/forward-fix decision.
7. Explicit operator approval bound to the host, database identity, source
   commit, backup, migration ID/checksum, command, validation plan, and time
   window.

No source merge, CI result, artifact, dry-run, or prior approval substitutes
for this packet.

## Dry-run gate

Run `dry-run` only after the read-only inventory and backup plan are reviewed.
It opens the source read-only with `fileMustExist`, creates one online-backup
snapshot below the operator-owned temporary root, applies and validates only
that snapshot, verifies the source file hash is unchanged, and removes the
owned temporary directory on success or failure.

Stop if the Wallet dependency is missing or mismatched, the ledger is
incompatible, a Commerce object exists without the exact migration row, any
schema object differs, either integrity check fails, the source changes, or
temporary cleanup cannot be proved.

## Apply and readback gate

Only the separately approved operator may execute `apply`. Quiesce writers as
specified in the approval packet, re-read the target and backup identities,
then use both exact confirmations. Apply acquires one immediate transaction,
re-reads the Wallet dependency and migration ledger after locking, executes
only the reviewed additive DDL, inserts one checksum-bound migration row, and
performs closed inspection before commit completion is accepted.

Immediately run `validate` and independently read back:

- the exact Commerce migration row and checksum;
- all seven ordered table definitions and column facts;
- restrictive immediate foreign keys with no cascades;
- all nine named indexes and sixteen named immutability/lifecycle triggers;
- `quick_check` success and zero `foreign_key_check` rows;
- unchanged Wallet-owned object SQL;
- the approved database and release identities.

Schema apply alone must leave both Wallet and Commerce runtime feature flags
false. It does not authorize routes, stores, payment, fulfillment, Portal,
Admin, provider access, deployment, or customer-data writes.

## Local synthetic validation

Run `npm run platform:coin-commerce:local-validation` to execute the closed
local proof. It creates and deletes only internally owned temporary SQLite
files, binds only an ephemeral IPv4 loopback listener, and uses exclusively
synthetic identities, balances, Orders, and fulfillment effects. It accepts no
database path or production credential. A PASS is not production inventory,
schema-apply authority, deployment, runtime enablement, provider proof, or
customer fulfillment.

## Failure, rollback, and forward-fix

Before commit, any rejection must roll back the transaction and stop. Do not
edit the migration ledger or partially recreate objects by hand.

After a committed additive migration, prefer an additive forward fix when the
database remains healthy and the approved RPO would make restore unsafe.
Restore is allowed only under the separately approved rollback decision, after
writers are stopped and the backup identity/checksum is reverified. Validate
the restored database and service boundary before reopening writers.

Stop and escalate on identity drift, lock contention, unplanned writers,
backup/restore uncertainty, checksum mismatch, unexpected objects or rows,
integrity failure, source mutation during dry-run, cleanup failure, or any
request to enable runtime behavior in the same gate.


## Initial-confirmation guard Plan C follow-on migration

The optional initial-confirmation extension remains anchored by
`20260906_001_coin_commerce_initial_confirmation`. The approved Scheme C
forward migration is a separate, checksum-bound follow-on:

- Migration ID:
  `20261105_001_coin_commerce_initial_confirmation_guard_plan_c`
- Checksum source:
  `COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS[0].ddlChecksum`
- DDL contract: domain-separated SHA-256 over the exact UTF-8 DROP/CREATE
  statements joined with NUL; always read the value from the exact reviewed
  source commit rather than copying a historical checksum.
- Scope: replace only
  `coin_commerce_initial_confirmations_insert_guard`; preserve all 44
  database predicates in S1/S2/S3/S4 (18/16/9/1), the single trigger name,
  and the original `coin_commerce_initial_confirmation_binding_invalid`
  rejection signature. The original extension migration ID/checksum remain
  unchanged.

The dedicated schema command supports read-only `validate`, private-clone
`dry-run`, and confirmation-bound `apply`:

```sh
npm run platform:coin-commerce:initial-confirmation-guard:schema -- --mode validate --db-path <absolute-reviewed-path>
npm run platform:coin-commerce:initial-confirmation-guard:schema -- --mode dry-run --db-path <absolute-reviewed-path> --temp-root <absolute-owned-temp-root>
npm run platform:coin-commerce:initial-confirmation-guard:schema -- --mode apply --db-path <absolute-reviewed-path> --confirm-migration-id 20261105_001_coin_commerce_initial_confirmation_guard_plan_c --confirm-ddl-checksum <exact-reviewed-checksum>
```

This source change and its local synthetic tests do not authorize running
`apply` against a persistent BWH database, remote D1, or production. Any
persistent or remote execution remains subject to its own exact database,
backup, host, source, and Risk A approval gate. The existing unused-extension
inverse removes the follow-on ledger row together with the extension only
when the confirmation table is empty.
