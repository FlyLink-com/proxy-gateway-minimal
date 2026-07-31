# Coin Wallet Reference Indexes Design

> Status:
> - Type: design specification pending written-spec review
> - Approved through: scope, DDL shape, migration isolation, rollback boundary,
>   and local validation contract
> - Source baseline:
>   `master@b949b15b676af5837c8eeb04494a425524496d9d`
> - Risk: A, source-only SQLite schema/migration
> - Process: independent migration module and closed CLI, synthetic SQLite TDD,
>   local query-plan proof, and no production connection
> - Expected PR count: 1
> - Release unit: `control-plane-app`
> - Production state: `not_deployed`
> - Identity impact: `false`
> - Production/AWS impact: none
> - Production authority: none

## Purpose

Add three narrowly scoped secondary indexes required by the bounded Coin Wallet
reverse-reference checks used by the Commerce canary funding verifier.

The current Wallet foundation can locate:

- Ledger rows by `wallet_ref` through
  `platform_coin_ledger_entries_wallet_page_idx`; and
- Hold allocations by `hold_ref` through the existing unique constraint on
  `(hold_ref, lot_ref)`.

It cannot perform the other three reverse-reference branches without scanning
their base tables:

- Hold allocations by `lot_ref`;
- Ledger entries by `lot_ref`; and
- Ledger entries by `hold_ref`.

This PR supplies only those access paths. It does not change the Wallet ledger,
order flow, product catalog, fulfillment, payment provider, runtime flags, or
Portal behavior.

## Confirmed Baseline

The frozen Wallet foundation migration is:

```text
migration_id:
  20260723_001_coin_wallet_foundation
ddl_checksum:
  03422fd22ae8047aea8374ed0e34ebaaf8663c90c24d7bbefef11d66498b02e7
```

The existing implementation is deliberately single-migration:

- `server/services/platform/coin-wallet-migrations.mjs` owns one migration ID,
  one statement set, one aggregate checksum, and its existing public API;
- `scripts/platform-coin-wallet-schema.mjs` confirms only that foundation
  migration; and
- both use the shared `platform_schema_migrations` ledger.

The successor work must not edit the foundation statements, migration ID,
checksum calculation, exports, CLI contract, or tests in a way that changes
their established behavior. New tests import the foundation constants and
prove the exact checksum remains unchanged.

## Selected Architecture

Use an independent successor migration module and an independent closed CLI.
They reuse the existing `platform_schema_migrations` table but do not turn the
foundation runner into a general migration framework.

Planned source boundaries are:

```text
server/services/platform/coin-wallet-reference-index-migrations.mjs
  -> successor migration identity, DDL checksum, inspection, apply, and dry-run

scripts/platform-coin-wallet-reference-index-schema.mjs
  -> closed validate/dry-run/apply operator interface

server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
  -> migration, rollback, restore, and EXPLAIN QUERY PLAN proof

server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs
  -> process boundary, exact confirmations, exit classes, and safe output
```

The package command is:

```text
platform:coin-wallet:reference-index-schema
```

This approach keeps the original migration immutable, gives the additive
change its own checksum and ledger row, and limits the future production gate
to one exact successor migration.

Rejected alternatives:

- Appending the indexes to the foundation statements, because that would change
  a checksum that may already be recorded.
- Refactoring the foundation runner into a multi-migration framework, because
  that expands the blast radius and changes an established Risk A interface.
- Adding covering or composite indexes, because the verifier filters on one
  reference column per branch and does not need a broader write-cost surface.
- Adding runtime `INDEXED BY` hints, because the schema should supply ordinary
  planner access paths without coupling Wallet Store code to a migration name.

## Migration Contract

The successor migration identity is:

```text
20260730_001_coin_wallet_reference_indexes
```

It has an independently derived SHA-256 DDL checksum. The implementation will
derive that digest from the exact normalized statements below using this exact
domain-separated byte sequence:

```text
GCCWEBOS:COIN_WALLET_REFERENCE_INDEX_DDL:v1\0<normalized statement 1>\0<normalized statement 2>\0<normalized statement 3>
```

Statement normalization is byte-for-byte equivalent to the frozen Wallet
foundation normalizer. The implementation then freezes the resulting digest
through module and CLI tests. The spec does not invent a digest before the
implementation bytes exist.

The exact DDL is:

```sql
CREATE INDEX platform_coin_hold_allocations_lot_ref_idx
  ON platform_coin_hold_allocations(lot_ref);

CREATE INDEX platform_coin_ledger_entries_lot_ref_idx
  ON platform_coin_ledger_entries(lot_ref);

CREATE INDEX platform_coin_ledger_entries_hold_ref_idx
  ON platform_coin_ledger_entries(hold_ref);
```

All three are full, non-unique, single-column indexes. In particular,
`platform_coin_ledger_entries_hold_ref_idx` is not partial. The full index keeps
the migration and planner contract uniform and avoids depending on inference
that a future query predicate implies `hold_ref IS NOT NULL`.

The successor module:

1. has no database or filesystem side effect on import;
2. requires the exact foundation ledger row and foundation checksum;
3. verifies that the existing Wallet schema remains compatible;
4. rejects a target index name or SQL collision instead of adopting it;
5. permits unrelated schema objects and later migration-ledger rows;
6. inserts its own migration row only after all three indexes are created; and
7. treats an exact existing migration row plus exact indexes as an idempotent
   replay.

A missing foundation, foundation checksum drift, incompatible migration ledger,
successor checksum drift, missing successor object, altered index SQL, or
pre-existing target-name collision is a closed schema rejection.

## Apply And Inspection Semantics

`validate` opens the explicit absolute database path read-only and reports only
closed status, aggregate checks, the required migration identity, applied or
pending migration identity, and safe reason codes.

`dry-run` copies the explicit database into an owned temporary directory,
applies the successor only to that copy, validates the result, and proves that
the source database bytes are unchanged. It removes the owned temporary
directory on success and failure.

`apply` requires:

```text
--mode apply
--db-path <absolute path>
--confirm-migration-id 20260730_001_coin_wallet_reference_indexes
--confirm-ddl-checksum <exact successor checksum>
```

There is no environment-variable or repository-relative database fallback.
The module uses one SQLite `BEGIN IMMEDIATE` transaction for the dependency
check, collision check, three `CREATE INDEX` statements, and migration-ledger
insert. Exact successor-object and ledger postconditions execute before that
transaction returns and commits. Any statement, ledger insert, or postcondition
failure rolls back all of that transaction.

The CLI emits one safe JSON object and uses the established exit classes:

| Exit | Meaning |
| --- | --- |
| `0` | The requested source/synthetic operation completed and closed checks passed. |
| `2` | CLI shape or exact apply confirmation was rejected. |
| `3` | Dependency, schema, index, ledger, or integrity state was rejected. |
| `4` | A transient database or local infrastructure condition prevented a safe result. |

The required state matrix is:

| Mode and observed state | `ok` | `schemaState` | Exit |
| --- | --- | --- | --- |
| `validate`: exact foundation and exact successor | `true` | `ready` | `0` |
| `validate`: exact foundation, successor absent | `false` | `pending` | `3` |
| `dry-run`: exact foundation, successor absent | `true` | `ready` on the owned snapshot | `0` |
| `apply`: exact foundation, successor absent | `true` | `ready` | `0` |
| Any mode: foundation, ledger, successor row, index, or integrity drift | `false` | `blocked` | `3` |

The pending `validate` result includes only the successor migration ID in
`pendingMigrationIds` and the safe `required_migration_missing` reason. An
exact replay has no pending migration and performs no DDL or clock call.

Output and errors must not contain an absolute path, filename, SQL text, raw
exception, SQLite row, account ID, Wallet reference, order reference, customer
data, secret, token, subscription URL, or credential.

## Query-Plan Contract

The consumer performs five base-table lookup branches:

```text
Ledger:
  wallet_ref = ?
  lot_ref IN (SELECT value FROM json_each(?))
  hold_ref IN (SELECT value FROM json_each(?))

Hold allocations:
  hold_ref IN (SELECT value FROM json_each(?))
  lot_ref IN (SELECT value FROM json_each(?))
```

Local `EXPLAIN QUERY PLAN` TDD uses a representative synthetic database with
the foundation and successor applied. It must establish:

1. all five base-table branches use `SEARCH`;
2. allocation `lot_ref` uses
   `platform_coin_hold_allocations_lot_ref_idx`;
3. Ledger `lot_ref` uses `platform_coin_ledger_entries_lot_ref_idx`;
4. Ledger `hold_ref` uses `platform_coin_ledger_entries_hold_ref_idx`;
5. the Ledger `wallet_ref` and allocation `hold_ref` branches remain indexed;
6. no plan detail contains a base-table `SCAN` of
   `platform_coin_ledger_entries` or
   `platform_coin_hold_allocations`.

The assertion may accept `json_each`, materialized CTE, compound-query, or
temporary B-tree scans. It must not freeze planner node IDs, output ordering,
SQLite auto-index numbers, or unrelated temporary-plan details.

This PR tests the query shape but does not modify the Wallet Store consumer.
After this PR merges, the paused Risk B Commerce canary-readiness branch may
rebase and complete its verifier against the merged schema contract.

## Rollback And Recovery

There is no production down-migration CLI.

Before any future production apply, the source PR can be reverted normally.
During apply, SQLite transaction rollback is the primary failure boundary: a
failed operation leaves neither a partial index set nor the successor ledger
row.

Local validation additionally proves:

- on a disposable synthetic database, dropping exactly the three successor
  indexes and deleting exactly the successor ledger row restores the
  pre-migration logical owned-object and migration-ledger state while
  preserving canonical Wallet and unrelated sentinel data;
- a whole-database backup made before apply opens independently, passes
  `quick_check`, and can be restored into another owned local path; and
- the restored copy has the exact foundation state and no successor ledger row
  or index.

The disposable DROP proof is test-only and is not shipped as an operator
command. It does not require database-file bytes, SQLite root pages,
`schema_version`, or page layout to equal their pre-migration values. Once a
production database may contain financial writes, forward-fix is preferred.
Whole-database restore can discard unrelated writes and therefore requires a
separately approved RPO decision and a new exact Risk A recovery gate.

## TDD And Validation

Implementation begins with failing focused tests and covers:

- side-effect-free import and the exact successor migration identity;
- unchanged foundation migration ID, checksum, exports, and CLI behavior;
- exact foundation dependency success, missing dependency, checksum drift, and
  incompatible-ledger rejection;
- exact apply, exact replay, future ledger-row tolerance, target-name
  collision, altered index SQL, and confirmation mismatch;
- injected failure after each DDL boundary and atomic rollback;
- read-only validate and source-preserving dry-run cleanup;
- disposable DROP proof and local backup/restore proof;
- the five-branch `EXPLAIN QUERY PLAN` contract;
- closed CLI JSON, stable exit classes, and absence of sensitive output.

Required source-PR validation is:

```powershell
node --test server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
node --test server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs
node --test server/tests/platform-coin-wallet-migrations.test.mjs
node --test server/tests/platform-coin-wallet-schema-cli.test.mjs
node --check scripts/platform-coin-wallet-reference-index-schema.mjs
npm run docs:authority:check
npm test
git diff --check origin/master...HEAD
```

Tests use only owned temporary SQLite databases and synthetic references. They
do not connect to, copy, inspect, or modify production.

## Documentation Scope

The implementation PR updates:

- `docs/COINS_WALLET_SCHEMA_GATE.md` with the independent successor command,
  dependency, validation, and future production-gate boundary;
- `docs/SUBSCRIPTION_CONTROL_DATABASE.md` with successor schema ownership;
- `docs/README.md` with the active spec and command navigation; and
- `package.json` with the closed successor CLI command.

It does not update a Deploy Note or claim a release, artifact, deployment,
runtime, or production result.

## Deferred Production Gate

Merge of the Risk A source PR proves only reviewed migration capability. It
does not authorize SSH, production inventory, backup creation, schema apply,
service restart, Wallet runtime changes, Commerce canary, or customer-data
access.

After merge, a separate Wallet schema gate must bind:

- a fresh read-only target and service inventory;
- the exact merged source commit and immutable artifact;
- the exact foundation and successor migration IDs and checksums;
- a verified whole-database backup and restore decision;
- maintenance, stop, validation, and rollback conditions; and
- explicit operator approval.

That future gate stops after schema readback. Wallet runtime and Commerce
runtime remain independent later gates.

## Acceptance Criteria

The source PR is complete only when:

1. the foundation migration checksum remains exactly unchanged;
2. only the three approved full single-column indexes are added;
3. the successor is independently checksum-bound and ledger-recorded;
4. dependency, collision, drift, transaction, rollback, and restore tests pass;
5. all five verifier branches use indexed base-table searches locally;
6. no Wallet, order, catalog, fulfillment, provider, or runtime behavior
   changes;
7. all required focused and repository validations pass;
8. the PR states `production_state: not_deployed`; and
9. no production connection, mutation, deployment, or activation occurs.
