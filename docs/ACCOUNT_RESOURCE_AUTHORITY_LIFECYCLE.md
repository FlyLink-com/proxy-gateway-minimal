# Account Resource Authority Lifecycle

Last updated: 2026-08-08.

> Status:
> - Type: Source implementation and Risk A runbook
> - Risk: A (schema, Commerce eligibility, and fulfillment-target lifecycle)
> - Release unit: `control-plane-app`
> - Identity impact: false for the empty-schema source change; any later
>   assignment must be evaluated independently
> - Execution authority: None
> - Production impact: None until separately approved schema, data, and runtime
>   Gates complete

## Purpose

Commerce must have one deterministic account-owned target before it can create
a Quote, reserve or capture Coins, create an Order, or dispatch fulfillment.
When several subscription resources remain current, their timestamps, usage,
runtime presence, or delivery refresh history do not prove which resource
superseded another. The existing fail-closed behavior is therefore correct.

Account Resource Authority adds an explicit selection layer:

```text
Account
  -> one active Commerce authority
       -> request + entitlement + issued link (one exact resource chain)
```

It does not rewrite the status or history of any non-authoritative resource.

## Lifecycle Boundary

Authority and resource lifecycle are different facts.

- `authority = active` means Commerce may use that exact resource chain as a
  prospective fulfillment target.
- A different resource without authority may remain `active`, `issued`, or
  otherwise unresolved. This source change does not delete, archive, revoke,
  expire, or retire it.
- Assignment is not evidence that the selected resource superseded another.
- No resolver may fall back to the latest-created, most-recently-used,
  runtime-present, or only sampled resource.
- In this contract, `lapsed` means an entitlement whose lifecycle status is
  still `active` but whose canonical `valid_until` is in the past. If a future
  lifecycle changes such rows to `expired`, supporting that state requires a
  separate review; the resolver must not silently broaden its accepted states.

This separation lets Commerce choose a reviewed target without manufacturing a
historical retirement claim.

## Schema Contract

The additive migration owns one authority table and its exact supporting
indexes. Each row binds:

- one account;
- one request;
- the matching entitlement;
- the matching issued link;
- lifecycle status (`active` or `revoked`);
- a monotonically increasing authority version;
- safe creation/update actor and reason metadata.

The schema enforces at most one `active` authority per account with a partial
unique index. Application validation must additionally prove that the request,
entitlement, and issued link form one internally consistent chain owned by the
same account. A foreign-key-valid but cross-wired chain is invalid.

The migration is additive and performs no authority assignment or historical
resource mutation.

The Commerce integration owns a separate additive table,
`platform_commerce_authority_quote_bindings`. It records the immutable Quote
reference, Authority identity and version, and exact request/entitlement/link
triad. It does not alter either foundational migration checksum and performs no
backfill. The Authority Commerce flag may be enabled only after both schemas
validate exactly.

The first successfully committed Authority-enabled Quote inserts one durable,
immutable sidecar binding in the same `BEGIN IMMEDIATE` as the Quote. From then
on `bindingRows > 0`. Quote expiry/staleness, Order terminalization, command
completion, and flag disablement never update or delete it. Operators must not
delete rows to manufacture `rollbackSafe = true`.

## Resolver And Transaction Contract

`resolveCommerceAuthority(account)` is fail-closed:

```text
no active authority        -> no_authority
more than one candidate    -> authority_conflict
missing or mismatched link -> authority_drift
one exact valid chain      -> authority + authority_version
```

There is no implicit fallback.

With `COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED=true`, Quote creation
records the resolved Authority identity, version, and exact resource triad in
the same `BEGIN IMMEDIATE` transaction as the Quote. Confirm re-reads that
snapshot and the active Authority in its Order/Hold transaction before any
Wallet write. A changed version or target invalidates the Quote and requires a
new Quote; the transaction does not create a Hold, Order, receipt, or event.

The existing Commerce cancel-window architecture creates the fulfillment
outbox only when Coins are captured, rather than during Confirm. Capture
therefore revalidates the same immutable snapshot again before `held` Coins can
become `consumed` or an outbox command can be created. The command carries the
snapshot through the coordinator. The subscription-control mutation then
revalidates Authority and version on its own SQLite connection inside the exact
transaction that mutates the authoritative entitlement and Portal request.
Only the recorded request/entitlement/link triad is eligible; the legacy
account-wide resolver, latest-lapsed selection, usage inference, initial
issuance, and old-resource fallback are not called in Authority mode.

The flag defaults to `false`. A fresh legacy database does not require an
Authority schema and does not call the Authority resolver; legacy Quote and
command shapes remain unchanged. If an exact Quote-binding namespace already
exists from an earlier enabled runtime, the disabled runtime reads only that
immutable provenance: bound active Quotes are stale, bound nonterminal Orders
are released or isolated before capture/dispatch, and terminal command history
remains read-only. Turning the flag off therefore cannot downgrade an existing
Authority-bound artifact into the legacy resolver path **when every process is
running this new binary**. This is not compatibility with a pre-Authority
release. Before activation, a Runtime Gate must prove that no old process
remains. After activation, rollback first means disabling the flag on this new
binary; returning to a pre-Authority release requires a separate drain,
artifact inventory, and rollback Gate.

An existing active offer may be renewed or extended only when the immutable
`offer_version_ref` is the same. Switching between monthly/annual products,
traffic sizes, or any other offer version requires a separately reviewed
product-transition contract. This PR does not infer or implement cross-package
replacement behavior.

## Foundational CLI Contract

The closed CLI is `scripts/platform-account-resource-authority-schema.mjs`.
It is inherited from the already-merged foundational Authority change; this PR
does not add or extend that CLI.
It accepts an absolute database path and emits one aggregate-only JSON object.
It never emits database paths, account identifiers, resource/request/
entitlement/link references, raw rows, SQL, credentials, subscription URLs, or
exception text.

Modes are intentionally separate:

| Mode | Purpose | Source mutation |
| --- | --- | --- |
| `validate` | Validate migration identity, exact owned schema, dependencies, and integrity | None |
| `dry-run` | Copy the database to an owned temporary directory and apply/validate the schema migration on the copy | None |
| `resolve-dry-run` | Validate the installed schema, then classify current accounts with the read-only authority resolver | None |
| `apply` | Apply the empty additive schema after exact migration ID and DDL checksum confirmation | Schema only |
| `rollback` | Remove the migration only after exact identity confirmation, proof that the authority table is empty, and proof that no external schema object depends on it | Schema only |

`dry-run` proves migration mechanics; it does not propose assignments.
`resolve-dry-run` may return aggregate counts such as resolved, missing,
conflicting, invalid, ambiguous-without-authority, single-binding-without-
authority, and no-binding accounts. These aggregates are diagnostic evidence,
not an auto-backfill plan.

`resolve-dry-run` exits successfully when the read-only diagnostic itself
completes, even when `resolutionReady` is false. A production Gate must assert
the JSON `resolutionReady` field and must not treat exit code `0` alone as
authority readiness.

Both `apply` and `rollback` require the exact migration ID and DDL checksum.
Rollback fails closed when any authority row exists or any external table,
view, index, or trigger depends on the authority table. The aggregate
`rollbackSafe` check is true only when `authorityRows = 0` and
`externalDependencies = 0`. Removing or changing authority data is a separate
data lifecycle operation and cannot be hidden in schema rollback.

Approved operators use the same immutable identity for both mutation modes:

```powershell
$dbPath = '<approved absolute database path>'
$migrationId = '<artifact REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID>'
$ddlChecksum = '<artifact ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS checksum>'

node scripts/platform-account-resource-authority-schema.mjs `
  --mode validate --db-path $dbPath
node scripts/platform-account-resource-authority-schema.mjs `
  --mode dry-run --db-path $dbPath
node scripts/platform-account-resource-authority-schema.mjs `
  --mode resolve-dry-run --db-path $dbPath
node scripts/platform-account-resource-authority-schema.mjs `
  --mode apply --db-path $dbPath `
  --confirm-migration-id $migrationId `
  --confirm-ddl-checksum $ddlChecksum
```

`rollback` uses the same confirmation flags but is not implied by an `apply`
approval. A production Gate must name rollback explicitly and prove the table
is empty and `externalDependencies = 0` immediately before execution.

## Commerce Schema And Assignment CLI Contract

The Commerce sidecar schema command and the foundational Authority assignment
command are separate closed operator entry points:

```text
npm run platform:account-resource-authority-commerce:schema -- ...
npm run platform:account-resource-authority:assignment -- ...
```

The schema command supports only `validate`, `dry-run`, `apply`, and `rollback`.
The assignment command supports only `plan`, `assign`, and `reassign`.
Assignment mutation requires the exact canonical request digest. The private
JSON fixes `newAuthorityRef`; reassign also fixes
`expectedPreviousAuthorityRef`, `expectedVersion`, and the target Resource
triad. Command output is aggregate-safe and never includes paths,
account/ref/triad/metadata, or private JSON.

The private JSON request and digest are fixed before execution. `plan` compares
the full exact lineage: authority ref, version, previous ref, Resource triad,
createdBy/reason, and prior revocation state. Reassign revoke+insert stays in
one top-level `BEGIN IMMEDIATE` and is atomic. No command automatically promotes
plan to apply or retries.

### Unknown-result recovery

After an unknown mutation result, a future production Gate may authorize
exactly one read-only `plan` with the same private request/digest:

| Classification | Required action |
| --- | --- |
| `applied_exact` | The transaction is exactly committed; mutation replay is forbidden; emit only the local `recovered_after_unknown` receipt. |
| `not_applied` | The exact prestate is unchanged; only an independently pre-authorized Gate may run one conditional mutation, which rechecks CAS inside its transaction. |
| `drift` | Any extra version, different ref, partial state, metadata/triad difference, or concurrency means stop and investigate. |
| `unknown` | The DB/plan cannot be read or the outcome cannot be proven; never reinterpret as `not_applied`; stop. |

The safe JSON is a local receipt. This change adds no receipt table and no other
schema.

## Schema Rollback And Recovery Boundaries

Sidecar rollback is allowed only for exact owned schema with `bindingRows = 0`
and `externalDependencies = 0`. Unknown counts, dependency enumeration failure,
checksum/schema drift, lock, or transaction failure stop with zero write.

Both schema dry-runs use SQLite online backup from a read-only source into an
owned disposable temporary snapshot. The snapshot proves migration mechanics
only; it is not a retained production backup and proves no RPO/restore
capability.

If both schemas are empty, rollback/readback order is mandatory: Commerce
sidecar first, then a separately approved foundational Authority rollback.
Reverse order is forbidden.

Once a binding exists, flag-off on the current Authority-aware binary is only
containment. Keep both schemas and use an additive forward fix. Any restore
alternative needs an independent Risk A RPO Backup/Recovery Gate naming the
exact backup identity, recovery point, acceptable data loss, writer quiescence,
and restore validation. Dry-run snapshot never qualifies. The existing runtime
boundary remains mandatory: before activation, prove that no old process
remains; returning to a pre-Authority release requires a separate drain,
artifact inventory, and rollback Gate.

## This Source-only PR

Included:

- source, tests, docs, this Risk A runbook, and future artifact coverage.

This PR contains source, tests, docs, and future artifact coverage only. It
performs no production inventory, backup, database access, schema apply, schema
rollback, Authority mutation, deployment, flag activation, Quote canary,
fulfillment, artifact build, publication, release, or release-state claim. It
adds no receipt table or other schema.

Still excluded:

- automatic backfill or automatic keeper selection;
- any assignment for `case_02` or the other ambiguous production accounts;
- first-purchase bootstrap for an account without an explicit Authority;
  zero-resource/no-Authority accounts remain fail-closed and are not eligible
  for an all-account Commerce activation or canary;
- payment-provider or recharge changes;
- retirement, archival, deletion, or status changes for unresolved resources;
- cross-package product transitions.

The `control-plane-app` package job uses generic exact-HEAD `git archive`
packaging. Because the source tree contains the two operator scripts and their
two service modules, a future exact-HEAD source archive will include those four
tracked paths. No artifact was built, published, released, or deployed here.

## Promotion Sequence

Each phase requires a separate Risk A review and approval:

1. **Schema Gate**: fresh read-only inventory, backup identity, migration
   dry-run, apply the empty schema, exact readback, integrity checks, and an
   empty-table/no-external-consumer rollback proof for the already-merged
   foundational Authority schema.
2. **Data Gate**: assign only explicitly approved account/resource chains.
   `case_02` requires its own exact assignment approval; unresolved resources
   remain unchanged. A reviewed controlled assignment runner or CLI is a
   source prerequisite; ad hoc SQL is forbidden.
3. **Integration Schema Gate**: separately dry-run/apply the empty immutable
   Quote-binding table and validate both dependency schemas. This source PR
   does not authorize that mutation. The reviewed Commerce schema command and
   the exact rollback or backup-recovery contract remain prerequisites before
   this Gate can execute.
4. **Runtime Gate**: deploy the resolver and integration with the Authority
   Commerce flag still default-off, prove that no pre-Authority process remains,
   run aggregate `resolve-dry-run`, and verify fail-closed behavior.
5. **Commerce Gate**: separately approve activation and a bounded Quote canary.

No phase inherits production authority from the preceding PR or Gate.

## Validation

Focused source validation:

```powershell
node --test server/tests/platform-account-resource-authority-migrations.test.mjs
node --test server/tests/platform-account-resource-authority.test.mjs
node --test server/tests/platform-account-resource-authority-schema-cli.test.mjs
node --test server/tests/platform-account-resource-authority-commerce-migrations.test.mjs
node --test server/tests/platform-coin-commerce-authority.test.mjs
npm test
git diff --check origin/master...HEAD
```

The exact test filenames may be run together once all source pieces are
present. Successful local tests do not authorize production schema or data
changes.

## Stop And Rollback Conditions

Stop before mutation when the database path or release identity is ambiguous,
the dependency schema is not exact, integrity checks fail, migration identity
or checksum differs, owned objects drift, or a write would exceed the approved
phase.

For the foundational empty schema, rollback is allowed only while the authority
table contains zero rows and has zero external schema consumers. Sidecar
rollback is separately allowed only under the exact empty-owned-schema contract
above. After a binding exists, keep both schemas and use an additive forward fix
unless an independently approved Risk A RPO Backup/Recovery Gate authorizes a
fully specified restore.
