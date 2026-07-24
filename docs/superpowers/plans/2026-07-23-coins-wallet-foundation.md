# Coins Wallet Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Every code
> task also requires `superpowers:test-driven-development`. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first source-only Coins PR: an account-owned, lot-based,
immutable wallet foundation with explicit schema migrations, atomic wallet
operations, and a default-off runtime gate. Source reversal, recovery cases,
recovery resolutions, and wallet restrictions are deferred to a later
additive-migration PR.

**Architecture:** Keep Coins outside the existing startup-created control-store
DDL. A dedicated migration module owns the exact schema and `validate`,
`dry-run`, and `apply` commands. A dedicated SQLite wallet store validates but
never creates schema, performs every balance mutation in one outer
`BEGIN IMMEDIATE` transaction, and exposes no generic balance or SQL escape
hatch. `state.mjs` opens the store only when `COINS_WALLET_ENABLED=true`.

**Tech Stack:** Node.js ES modules, `better-sqlite3`, SQLite constraints and
triggers, built-in `node:test`, worker threads or child processes for real
write contention, PowerShell validation commands, Markdown gate documentation.

## Global Constraints

- **Risk:** A for the entire PR1 because it introduces SQLite schema and
  migration tooling, even though the work remains source-only and default-off.
- **Process:** clean worktree, source-only TDD, exact schema inspection,
  migration dry-run against synthetic databases, full server regression, then
  a separate operator-controlled production gate.
- **Expected PR count:** one source-only Draft PR for this foundation. A
  production database migration, runtime activation, frontend enablement, and
  deployment are not part of that PR and cannot share its approval.
- **Production/AWS impact:** none. Do not SSH, inspect or modify a production
  database, change an environment value, deploy, publish static assets, call a
  provider, or create real wallet balances.
- Work only in
  `D:\Projects\proxy-gateway-minimal-worktrees\coins-wallet-foundation` on
  `codex/coins-wallet-foundation`. Do not copy the dirty main checkout, a
  generated directory, an archived checkout, or Draft PR #526 as an
  implementation base.
- Treat
  `docs/superpowers/specs/2026-07-23-coins-wallet-promotion-design.md` as the
  product and domain authority for this PR.
- PR1 contains no HTTP routes, session/header parsing, Portal/Admin UI,
  product/Offer records, promotion profiles or links, reward policies,
  provider/webhook code, recharge intent, commerce order, fulfillment,
  entitlement, scheduler activation, or production migration.
- PR1 contains no refund or chargeback source reversal, recovery case,
  source-reversal allocation, recovery resolution, wallet restriction, spend
  freeze, same-type recovery payment, or waiver implementation. Those require
  a later additive migration and separately reviewed APIs.
- `paid_coins`, `bonus_coins`, and `reward_coins` remain separate lot types.
  There is no withdrawal, fiat exchange, user transfer, trade, negative
  balance, or cross-type recovery.
- General allocation order is all eligible `bonus_coins`, with finite expiry
  in FEFO order and `expiresAt = null` last, then `paid_coins`, then
  `reward_coins`. Reward-only operations accept only `reward_coins`.
- Future refund/chargeback and recovery work must preserve same-type recovery
  and append-only history, but PR1 neither records nor exposes that state.
- No API named `setBalance`, `adjustBalance`, `updateBucket`, generic
  `runInTransaction`, or equivalent is allowed.
- All unit inputs and derived sums must satisfy `Number.isSafeInteger`, be
  non-negative at rest, and stay within JavaScript's safe-integer range.
- All financial foreign keys reject deletion and never use
  `ON DELETE CASCADE`. Ledger rows reject `UPDATE` and `DELETE` with database
  triggers.
- The store computes a canonical request digest from normalized business
  parameters. Callers cannot supply `requestDigest`.
- Every mutation has its own exact-field request allowlist and its own
  canonical business projection for digesting. The union of digest fields
  across operations is not an API request allowlist.
- `acceptedCoinTypes` is a mathematical set. Its canonical normalized
  representation is the accepted subset ordered by the fixed platform
  priority `bonus_coins`, `paid_coins`, `reward_coins`; caller order cannot
  alter allocation policy or the request digest. Duplicate and empty accepted
  sets are invalid.

The exact operation-domain business projections are:

| Operation type | Exact canonical business projection |
| --- | --- |
| `credit_coins` | `accountId, coinType, amountUnits, availability, sourceType, sourceRef, sourceDigest, expiresAt`; only when `coinType = reward_coins`, additionally `policyRef, policyVersion` |
| `confirm_coin_credit` | `lotRef, amountUnits` |
| `create_coin_hold` | `walletRef, purpose, purposeRef, amountUnits, acceptedCoinTypes, expiresAt` |
| `capture_coin_hold` | `holdRef` |
| `release_coin_hold` | `holdRef` |
| `expire_coin_hold` | `holdRef, expiresAt`; the deadline is read from the immutable durable hold row |
| `expire_coin_lot` | `lotRef, expiresAt`; the deadline is read from the durable lot row |

For `credit_coins`, paid and bonus projections contain no policy fields;
`expiresAt` is always present using its canonical value, including `null`.
The canonical digest is the domain-separated operation type plus the
key-sorted canonical projection. Strings must already be non-empty normalized
values and are never silently trimmed. Unit fields are safe integers, and a
hold amount is additionally positive. Timestamps are exact UTC ISO values.
`acceptedCoinTypes` uses the fixed `bonus_coins`, `paid_coins`, `reward_coins`
set order.

The operation wrapper fields `actorScope`, `idempotencyKey`, `actorType`, and
`actorRef` are not part of the business projection. Receipt identity is
exactly `(actorScope, operationType, idempotencyKey)` under the existing unique
contract; `actorType` and `actorRef` are audit metadata bound by the first
claim. No projection contains current wallet state, a result, or a read model.
- Deterministic business failures such as `insufficient_balance` are durable
  and replayable. `SQLITE_BUSY`, injected faults, and unexpected
  infrastructure failures roll back completely and are not cached as final
  business outcomes.
- No external call or callback may execute inside a wallet transaction.
- Do not commit, push, open/ready/merge a PR, or execute an `apply` against any
  non-synthetic database until the user grants that exact action. Commit
  commands below are conditional checkpoints, not current authorization.

---

### Task 0: Establish the clean dependency and baseline state

**Files:**

- Verify only; no source file changes

- [x] **Step 1: Confirm the intended worktree and base**

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/master
```

Expected before implementation:

```text
branch: codex/coins-wallet-foundation
base: f82eb4f66bb3d2f0a2bbc8018d3f95145658e8ac
only the approved design and plan documents are untracked
```

Stop if the branch/base changes or another source file is dirty. Reconcile
against the then-current `origin/master`; do not copy or reset the dirty main
checkout.

- [x] **Step 2: Install the locked dependencies before the first RED test**

The clean worktree currently has no `node_modules`, and migration/store tests
load `better-sqlite3`. Run:

```powershell
npm ci
```

Record an install failure honestly; a dependency-load failure is not a valid
RED product test.

- [x] **Step 3: Run the existing database/state baseline**

```powershell
node --test server/tests/platform-subscription-control-db.test.mjs server/tests/state.test.mjs
```

Record the exact pass/fail count. If the unchanged baseline fails for a product
reason, stop and reconcile it before adding Coins code.

### Task 1: Freeze pure Coin contracts and deterministic allocation

**Files:**

- Create: `server/services/platform/coin-wallet-domain.mjs`
- Create: `server/tests/platform-coin-wallet-domain.test.mjs`

**Interfaces:**

```js
export const COIN_TYPES;
export const COIN_ALLOCATION_PRIORITY;

export function assertCoinUnits(value, field);
export function normalizeCoinType(value);
export function normalizeAcceptedCoinTypes(values);
export function canonicalWalletRequestDigest(operationType, input);
export function allocateCoinLots({
  lots,
  amountUnits,
  acceptedCoinTypes,
  now
});
export function projectCoinWalletBalance({ wallet, lots, activeAllocations });
```

`canonicalWalletRequestDigest` uses a domain-separated, key-sorted JSON
projection containing only normalized business fields:

```js
sha256(
  `GCCWEBOS:COIN_WALLET_REQUEST:v1\0${operationType}\0`
  + canonicalJson(normalizedInput)
)
```

The allocator returns a new immutable list:

```js
[
  {
    lotRef,
    coinType,
    allocationSequence,
    allocatedUnits
  }
]
```

It filters rejected types, zero/depleted lots, and expired bonus lots before
sorting. Within one type it sorts by `expiresAt` with null last, then
`createdAt`, then `lotRef`.

- [x] **Step 1: Write failing validation and digest tests**

Cover zero/positive/max-safe units, negative/fractional/unsafe values, unknown
Coin types, duplicate accepted types, stable digest vectors, key-order
independence, operation-domain separation, rejection of an empty accepted set,
and rejection of extra or non-normalized fields. Prove that permutations of
the same accepted Coin set normalize to the fixed
`bonus_coins`, `paid_coins`, `reward_coins` subset order and produce the same
request digest. Cover the exact canonical vector and extra-field rejection for
each of the seven operation-domain projections, including conditional
reward-policy fields and canonical null expiry.

- [x] **Step 2: Write failing allocation tests**

Cover:

- earliest-expiry bonus before later bonus;
- bonus before paid before reward;
- deterministic same-time tie breaking;
- accepted-type filtering;
- reward-only allocation;
- exclusion of expired bonus;
- exact allocation across several lots;
- insufficient allocation returning a closed result without mutating input;
- aggregate overflow.

- [x] **Step 3: Run the focused test and verify RED**

```powershell
node --test server/tests/platform-coin-wallet-domain.test.mjs
```

Expected: FAIL because the domain module does not exist.

- [x] **Step 4: Implement the minimal pure module**

Do not import SQLite, state, Portal, Admin, provider, catalog, order, or
fulfillment modules. Use explicit allowlists and safe addition:

`normalizeAcceptedCoinTypes` must reject duplicates and an empty set, then
return the accepted subset in fixed platform-priority order. It must not retain
caller order or expose a caller-controlled allocation priority.

```js
function safeAdd(left, right, field) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw coinWalletError("coin_units_overflow", field);
  }
  return result;
}
```

- [x] **Step 5: Re-run and verify GREEN**

```powershell
node --test server/tests/platform-coin-wallet-domain.test.mjs
```

- [x] **Step 6: Conditional commit checkpoint (not executed; commit not authorized)**

Only after explicit commit authorization:

```powershell
git add server/services/platform/coin-wallet-domain.mjs server/tests/platform-coin-wallet-domain.test.mjs
git commit -m "feat(platform): define Coin wallet domain contracts"
```

### Task 2: Add the exact, versioned Coins schema migration

**Files:**

- Create: `server/services/platform/coin-wallet-migrations.mjs`
- Create: `server/tests/platform-coin-wallet-migrations.test.mjs`

**Interfaces:**

```js
export const COIN_WALLET_MIGRATIONS;
export const REQUIRED_COIN_WALLET_MIGRATION_ID;

export function inspectCoinWalletSchema({ database });
export function validateCoinWalletSchema({ dbPath, database } = {});
export async function dryRunCoinWalletMigrations({ dbPath, tempRoot } = {});
export function applyCoinWalletMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {});
```

The first and only PR1 migration ID is:

```text
20260723_001_coin_wallet_foundation
```

It creates these exact owned objects:

```text
platform_schema_migrations
platform_coin_wallets
platform_coin_lots
platform_coin_holds
platform_coin_hold_allocations
platform_coin_operation_receipts
platform_coin_credit_origins
platform_coin_ledger_entries
```

It also creates named indexes for wallet/account lookup, eligible lot
allocation, active hold expiry, operation replay, and ledger pagination, plus
immutable-ledger triggers.

Schema requirements:

- `platform_coin_wallets.account_id` is unique and references
  `platform_accounts(id)`;
- wallet status is `active | frozen | closed`;
- lot type is `paid_coins | bonus_coins | reward_coins`;
- every lot bucket is an integer `>= 0`;
- the six lot buckets sum exactly to `issued_units`;
- paid and reward lots require null `expires_at`;
- allocations are positive integers with `unique(hold_ref, lot_ref)`;
- hold status is `active | captured | released | expired | invalidated`;
- operation receipt identity is
  `unique(actor_scope, operation_type, idempotency_key)`;
- terminal operation receipts retain `wallet_ref`,
  `previous_wallet_version`, `resulting_wallet_version`,
  `resulting_wallet_status`, `result_ref`, `safe_result_code`, and
  `completed_at`;
- credit origin identity is
  `unique(wallet_ref, coin_type, source_type, source_ref)`;
- no table, index, or trigger is created by importing this module.

The lot/origin pair may use deferred foreign keys so the credit origin, lot,
receipt, and ledger can commit atomically without a nullable authority window.

- [x] **Step 1: Write failing fresh and legacy migration tests**

Use file-backed synthetic databases and cover:

- fresh database already containing the exact `platform_accounts` dependency;
- a legacy sentinel table preserved byte-for-byte;
- first apply creates the migration ledger, all owned objects, and its ledger
  row in one transaction;
- repeated apply is a no-op;
- migration ID/checksum mismatch fails closed;
- incompatible same-name `platform_schema_migrations` table fails closed;
- incompatible same-name domain table fails closed;
- when the required migration row is absent, any pre-existing PR1-owned table,
  index, or trigger fails closed even if its SQL happens to match;
- a fault injected before the migration ledger insert rolls back every object.

- [x] **Step 2: Write failing exact validation tests**

Use `sqlite_master`, `PRAGMA table_info`, `foreign_key_list`, `index_list`,
`index_info`, and trigger SQL normalization to verify the exact PR1 schema.
Validation must:

- open `readonly: true, fileMustExist: true` when it owns the connection;
- perform no write;
- accept unrelated future migration rows but require the PR1 ID/checksum;
- reject a missing column, altered check, missing index, missing trigger,
  incompatible foreign key, or checksum drift;
- return only closed reason codes and object counts;
- run `PRAGMA quick_check` and `PRAGMA foreign_key_check`.

- [x] **Step 3: Write failing dry-run tests**

Prove `dryRunCoinWalletMigrations`:

1. opens the source without initializing schema;
2. uses SQLite's online backup API to make a consistent temporary snapshot;
3. applies and validates only the snapshot;
4. reports the pending/applied migration IDs and checks;
5. leaves the source hash, schema, and data unchanged;
6. removes the temporary snapshot on success and failure.

- [x] **Step 4: Run the focused test and verify RED**

```powershell
node --test server/tests/platform-coin-wallet-migrations.test.mjs
```

Expected: FAIL because the migration module does not exist.

- [x] **Step 5: Implement one atomic initial migration**

Re-inspect the ledger and owned objects after acquiring the immediate lock.
Use one outer immediate transaction:

```js
const migrate = database.transaction(() => {
  assertMigrationLedgerCompatible(database);
  const applied = findRequiredMigrationRow(database, migration.id);
  if (!applied) {
    assertPr1OwnedObjectsAreAbsent(database);
  } else {
    assertAppliedMigrationAndOwnedObjectsAreExact(database, migration);
    return;
  }
  executeMigrationStatements(database, migration);
  insertMigrationLedgerRow(database, migration, nowFn());
});

migrate.immediate();
```

Do not add Coins DDL to
`server/services/platform/subscription-control-db.mjs`. Do not implement a down
migration, table drop, automatic repair, or startup apply.

- [x] **Step 6: Re-run and verify GREEN**

```powershell
node --test server/tests/platform-coin-wallet-migrations.test.mjs
```

- [x] **Step 7: Conditional commit checkpoint (not executed; commit not authorized)**

Only after explicit commit authorization:

```powershell
git add server/services/platform/coin-wallet-migrations.mjs server/tests/platform-coin-wallet-migrations.test.mjs
git commit -m "feat(platform): add explicit Coin wallet migration"
```

### Task 3: Add a closed migration CLI and Risk A gate document

**Files:**

- Create: `scripts/platform-coin-wallet-schema.mjs`
- Create: `server/tests/platform-coin-wallet-schema-cli.test.mjs`
- Create: `docs/COINS_WALLET_SCHEMA_GATE.md`
- Modify: `package.json`
- Modify: `docs/README.md`
- Modify: `docs/SUBSCRIPTION_CONTROL_DATABASE.md`

**CLI contract:**

```text
node scripts/platform-coin-wallet-schema.mjs \
  --mode validate|dry-run|apply \
  --db-path <absolute-path> \
  [--temp-root <absolute-path>] \
  [--confirm-migration-id 20260723_001_coin_wallet_foundation] \
  [--confirm-ddl-checksum <sha256>]
```

Rules:

- `--mode` and absolute `--db-path` are always required;
- no environment-variable or repository-relative database fallback exists;
- `--temp-root` is accepted only for `dry-run`;
- both confirmation flags are mandatory and exact only for `apply`;
- duplicate, unknown, empty, relative, or mode-incompatible arguments fail;
- the default is never `apply`;
- stdout is exactly one closed JSON object and stderr contains no raw SQL,
  absolute path, database filename, row, account ID, or exception text;
- stable exit codes distinguish success, contract rejection,
  schema/integrity rejection, and transient infrastructure failure.

Example safe result:

```json
{
  "ok": true,
  "mode": "dry-run",
  "schemaState": "ready",
  "requiredMigrationId": "20260723_001_coin_wallet_foundation",
  "sourceChanged": false,
  "checks": {
    "schemaExact": true,
    "quickCheck": true,
    "foreignKeys": true
  }
}
```

- [x] **Step 1: Write failing CLI process tests**

Spawn Node with an isolated environment. Cover all modes, argument rejection,
missing database, incompatible schema, locked database, one-line JSON, stable
exit codes, output redaction, dry-run source zero-write, and apply confirmation
ID/checksum mismatch.

- [x] **Step 2: Run the focused CLI test and verify RED**

```powershell
node --test server/tests/platform-coin-wallet-schema-cli.test.mjs
```

Expected: FAIL because the script and package command do not exist.

- [x] **Step 3: Implement the thin CLI**

Add:

```json
"platform:coin-wallet:schema": "node scripts/platform-coin-wallet-schema.mjs"
```

The script only parses, calls the migration module, serializes closed output,
sets `process.exitCode`, and closes owned resources. It contains no DDL.

- [x] **Step 4: Write the source-only schema gate runbook**

`docs/COINS_WALLET_SCHEMA_GATE.md` must state:

- current source presence is not production migration evidence;
- `validate` and `dry-run` do not authorize `apply`;
- production apply requires a fresh read-only inventory, verified backup
  checksum plus `quick_check`, exact artifact/source identity, explicit
  operator approval, maintenance/rollback decision, apply, readback, and
  runtime gate remaining false;
- no down migration exists after financial data;
- forward-fix is preferred; whole-database restore requires an explicit RPO
  decision;
- the document contains commands with placeholders only and no real path,
  secret, account, wallet, order, or customer data.

Index the runbook in `docs/README.md`. Update
`docs/SUBSCRIPTION_CONTROL_DATABASE.md` to state that its startup DDL does not
own Coins and that Coins uses a separately gated migration ledger.

- [x] **Step 5: Verify CLI and documentation**

```powershell
node --test server/tests/platform-coin-wallet-schema-cli.test.mjs
npm run docs:authority:check
```

- [x] **Step 6: Conditional commit checkpoint (not executed; commit not authorized)**

Only after explicit commit authorization:

```powershell
git add scripts/platform-coin-wallet-schema.mjs server/tests/platform-coin-wallet-schema-cli.test.mjs package.json docs/COINS_WALLET_SCHEMA_GATE.md docs/README.md docs/SUBSCRIPTION_CONTROL_DATABASE.md
git commit -m "feat(platform): gate Coin wallet schema operations"
```

### Task 4: Build the validating wallet store and atomic credit path

**Files:**

- Create: `server/services/platform/coin-wallet-store.mjs`
- Create: `server/tests/platform-coin-wallet-store.test.mjs`

**Factory:**

```js
export function createSqliteCoinWalletStore({
  dbPath,
  database,
  nowFn = () => new Date(),
  refFactory
} = {});
```

Construction rules:

- exactly one of `dbPath` or `database` is required;
- an owned connection enables foreign keys and a bounded busy timeout, but
  does not change journal mode or execute DDL;
- `validateCoinWalletSchema` runs before methods become available;
- `close()` closes only an owned connection and is idempotent;
- the raw database and generic transaction functions are never returned.

**Read methods:**

```js
getWallet(walletRef)
getWalletByAccountId(accountId)
getWalletProjection({ walletRef, accountId })
getLot(lotRef)
listLots({ walletRef, coinType, includeDepleted = false } = {})
getHold(holdRef)
listHolds({ walletRef, status } = {})
getOperationReceipt({ actorScope, operationType, idempotencyKey })
listLedgerEntries({
  walletRef,
  afterOccurredAt,
  afterEntryRef,
  limit = 100
} = {})
```

A missing account wallet projection returns:

```js
{
  exists: false,
  status: "not_created",
  version: 0,
  totals: {
    paid_coins: 0,
    bonus_coins: 0,
    reward_coins: 0
  },
  spendableUnits: 0,
  heldUnits: 0,
  pendingUnits: 0
}
```

It performs no write.

**First mutation:**

```js
creditCoins({
  accountId,
  coinType,
  amountUnits,
  availability,       // pending | available
  sourceType,
  sourceRef,
  sourceDigest,
  policyRef = null,
  policyVersion = null,
  expiresAt = null,
  operation: {
    actorScope,
    idempotencyKey,
    actorType,
    actorRef
  }
})
```

Rules:

- first valid credit lazily creates the account's wallet with version `0`;
- paid and bonus credit enters `available`; reward credit enters `pending`;
- paid/reward expiry must be null;
- policy fields are required together and only for reward credit;
- one immediate transaction claims the operation receipt, claims the unique
  credit origin, inserts the lot, increments wallet version once, appends the
  immutable ledger, and marks the receipt succeeded;
- a second idempotency key for the same credit origin cannot mint again;
- same operation key plus same digest replays the closed result;
- same operation key plus different digest throws `idempotency_conflict`;
- source digest is stored but raw provider or customer evidence is not.

- [ ] **Step 1: Write failing store-construction and read tests**

Cover missing schema fail-closed, exact schema success, injected versus owned
connection, idempotent close, missing-wallet zero projection with no table
changes, pagination bounds, and no raw database surface.

- [ ] **Step 2: Write failing credit and replay tests**

Cover every allowed initial Coin state, invalid state/type/expiry/policy,
safe-integer edges, aggregate overflow, lazy wallet creation, account FK
failure, wallet version `0 -> 1`, shared ledger version interval, identical
replay, digest conflict, and credit-origin collision under another
idempotency key.

- [ ] **Step 3: Run the focused test and verify RED**

```powershell
node --test server/tests/platform-coin-wallet-store.test.mjs
```

Expected: FAIL because the wallet store does not exist.

- [ ] **Step 4: Implement one reusable immediate-operation kernel**

The private kernel must preserve this order:

```text
normalize and validate
  -> compute canonical digest
  -> BEGIN IMMEDIATE
  -> claim/replay operation receipt
  -> perform domain writes
  -> increment wallet version once
  -> append ledger rows with one version interval
  -> complete receipt
  -> COMMIT
```

Use `database.transaction(callback).immediate()`. Do not reuse the existing
control store's deferred `runInTransaction`.

Return only:

```js
{
  ok,
  replayed,
  operationRef,
  walletRef,
  safeResultCode,
  resultRef,
  previousWalletVersion,
  resultingWalletVersion,
  resultingWalletStatus
}
```

`resultRef` may be null only for a documented deterministic failure or
no-result operation. Successful credit, hold, capture, release, and expiry
operations return their stable domain reference. The same operation identity
and request digest returns the stored envelope with only `replayed` changing
from `false` to `true`; a different digest throws `idempotency_conflict`.
Current wallet projections, lot details, hold details, allocations, and ledger
entries come from the read methods above. Replay must not reconstruct a
historic rich wallet or operation-specific result from current mutable fields,
and receipts must not store serialized JSON result blobs or duplicate mutable
lot, Offer, or order snapshots. This freezes the source contract; it does not
claim the Store implementation is already aligned.

Normalize validation, conflict, busy, and infrastructure failures to errors
with a safe `code`; do not include SQL or raw rows in messages.

Credit and replay tests compare the stable envelope fields. For identical
replay, every field must equal the stored first response except `replayed`,
which changes from `false` to `true`; tests must not require historical wallet,
lot expiry, policy, source, bucket, or operation-specific result fields.

- [ ] **Step 5: Re-run and verify GREEN**

```powershell
node --test server/tests/platform-coin-wallet-domain.test.mjs server/tests/platform-coin-wallet-migrations.test.mjs server/tests/platform-coin-wallet-store.test.mjs
```

- [ ] **Step 6: Conditional commit checkpoint**

Only after explicit commit authorization:

```powershell
git add server/services/platform/coin-wallet-store.mjs server/tests/platform-coin-wallet-store.test.mjs
git commit -m "feat(platform): add durable Coin credit store"
```

### Task 5: Add confirmation, deterministic holds, and real contention tests

**Files:**

- Modify: `server/services/platform/coin-wallet-store.mjs`
- Modify: `server/tests/platform-coin-wallet-store.test.mjs`
- Create: `server/tests/platform-coin-wallet-concurrency.test.mjs`

**Mutation methods:**

```js
confirmCoinCredit({
  lotRef,
  amountUnits,
  operation
})

createCoinHold({
  walletRef,
  purpose,            // product_purchase | reward_adjustment
  purposeRef,
  amountUnits,
  acceptedCoinTypes,
  expiresAt,
  operation
})
```

Rules:

- confirmation moves only `reward_coins.pending_units` to available;
- confirmation may be partial but never exceeds pending;
- confirmation is allowed for `active` and `frozen` wallets and rejects
  `closed` wallets;
- `createCoinHold.amountUnits` must be a positive safe integer before opening
  the transaction; the generic zero-capable balance-unit validator is not a
  sufficient hold-amount guard;
- `createCoinHold` and every other mutation accept only their exact declared
  fields and digest only their operation-specific canonical business
  projection; a cross-operation digest-field union is not a request allowlist;
- an active wallet may create a new hold;
- frozen or closed wallets reject new holds;
- wallet status is re-read after the immediate write lock is obtained;
- `product_purchase` follows accepted types and
  bonus-FEFO -> paid -> reward;
- accepted Coin types are normalized as an order-independent set in fixed
  `bonus_coins`, `paid_coins`, `reward_coins` order; duplicates and an empty
  set are invalid, and caller reordering cannot change allocation priority or
  the request digest;
- `reward_adjustment` requires exactly `reward_coins`;
- hold creation is all-or-nothing;
- before persistence, allocations must have sequences exactly `1..N`, each
  allocation amount must be a positive safe integer, and their safe-integer
  sum must equal the positive hold amount exactly;
- insufficient balance commits one failed receipt only and writes no hold,
  allocation, lot update, ledger, or wallet-version change;
- hold creation queries database UTC inside the same `BEGIN IMMEDIATE`
  transaction. The same locked `dbNow` requires `expiresAt > dbNow`, excludes
  bonus lots whose `expiresAt <= dbNow`, and timestamps the hold, allocations,
  ledger rows, and receipt;
- JavaScript wall-clock time obtained before the transaction is not authority
  for the hold deadline or lot eligibility;
- replay lookup occurs inside the immediate transaction before current
  wallet/lot state is re-evaluated. A stored terminal result therefore remains
  stable after a later status or balance change, while a first-time missing or
  disallowed-state rejection writes no receipt.

**Frozen D2a terminal outcomes:**

| Operation | Terminal status | `ok` | `safeResultCode` | `resultRef` | Version interval |
| --- | --- | ---: | --- | --- | --- |
| `confirm_coin_credit` success | `succeeded` | true | `confirmed` | confirmed `lotRef` | `n -> n+1` |
| `create_coin_hold` success | `succeeded` | true | `held` | created `holdRef` | `n -> n+1` |
| `create_coin_hold` insufficient balance | `failed` | false | `insufficient_balance` | null | `n -> n` |

D2a has no other durable failed or no-result outcome. Operation-specific
receipt validation accepts only the terminal codes and result shapes in this
table; the existing `credit_coins` success remains `credited`. A same-digest
replay returns the stored nine-field Task 4 envelope with only `replayed`
changing. A different digest returns `idempotency_conflict`. D2a “no-op” means
only replay of an existing terminal receipt; it never permits a newly succeeded
receipt with a null `resultRef`. The insufficient-balance branch commits
exactly one failed receipt and zero lot, hold, allocation, ledger, or
wallet-version changes.

The only safe non-terminal Store errors for D2a are:

```text
invalid_wallet_request
non_normalized_wallet_request
invalid_coin_units
invalid_coin_type
invalid_accepted_coin_types
duplicate_coin_type
invalid_wallet_timestamp
invalid_coin_expiry
wallet_not_found
lot_not_found
wallet_not_active
coin_credit_not_confirmable
idempotency_conflict
idempotency_unavailable
wallet_busy
wallet_infrastructure_error
```

Empty accepted sets use `invalid_accepted_coin_types`; duplicates use
`duplicate_coin_type`. Unknown Coin types, or a `reward_adjustment` that does
not accept exactly `reward_coins`, use `invalid_coin_type`. A syntactically
valid hold deadline at or before locked database UTC uses
`invalid_coin_expiry`; malformed timestamps use `invalid_wallet_timestamp`.
Wrong lot Coin type or a confirmation amount greater than current pending
units uses `coin_credit_not_confirmable`. Exact shape or purpose violations use
`invalid_wallet_request`. All messages remain generic and expose no SQL, rows,
paths, or request data. Transient busy, infrastructure/integrity failures,
invalid requests, missing subjects, and disallowed current state roll back or
write nothing; none is a terminal receipt.

**Frozen D2a ledger audit binding:**

- confirmation writes exactly one `pending_to_available` row with
  `lot_ref=lotRef`, `hold_ref=null`, `order_ref=null`, and
  `source_type/source_ref` copied from the confirmed lot;
- hold creation writes one `available_to_held` row per allocation, with
  `lot_ref` identifying that allocation's lot, `hold_ref=holdRef`, and
  `source_type/source_ref` copied from that lot;
- `product_purchase` uses `order_ref=purposeRef`; `reward_adjustment` uses
  `order_ref=null`;
- every row shares the operation ref, actor metadata, previous/resulting wallet
  versions, resulting wallet status, and locked database timestamp.

The D2a write order is:

```text
normalize exact request and positive units
  -> compute exact canonical digest
  -> BEGIN IMMEDIATE
  -> find/replay prior receipt
  -> load and validate locked wallet/lot state
  -> query locked database UTC where required
  -> claim started receipt
  -> compute and fully validate allocations before financial writes
  -> write guarded lot changes
  -> write hold and immutable allocations where applicable
  -> increment wallet version exactly once
  -> append directional ledger rows
  -> complete terminal receipt with exactly-one-row check
  -> COMMIT
```

Hold and allocation refs may be generated before persistence, but all
allocations must be validated before the first financial write. Each lot update
is guarded by wallet/lot identity and a sufficient source bucket and must
change exactly one row. Ref collisions, guard misses, allocation corruption,
SQL faults, and exact-one-row failures roll back the started receipt and all
writes. Insufficient balance branches only after locked state/time validation,
completes the failed receipt with equal versions and status, and commits.

- [ ] **Step 1: Write failing confirmation and hold tests**

Cover:

- exact, symbol-key, and non-enumerable request rejection plus positive units
  before transaction entry;
- accepted-set canonicalization, purpose policy, same-digest replay, and digest
  conflict;
- partial/full reward confirmation, active/frozen/closed state, wrong type,
  pending underflow, stable `lotRef`, and exact confirmation-ledger audit
  fields;
- locked database UTC past, exact/effectively-equal, and future deadlines with
  no wall-clock sleep, plus bonus-lot eligibility at that same time;
- finite bonus, non-expiring bonus, paid, and reward allocation with
  `order_ref` and accepted-type filtering;
- exact `1..N` allocations, positive safe units, safe exact sum, guarded bucket
  changes, one wallet-version interval, and exact per-lot ledger audit fields;
- the exact three terminal outcome envelopes above, including durable
  insufficient-balance replay with zero financial side effects;
- late ref collision and guarded-update fault rollback with no terminal
  receipt.

- [ ] **Step 2: Write failing two-connection contention tests**

This is the separate D2b concurrency task. It is not part of D2a contract
implementation or acceptance.

Use one file-backed WAL database and two independent SQLite connections hosted
in workers or child processes with a start barrier. Give the wallet enough
available units for exactly one hold, then race distinct operation keys.

Assert:

- at most one hold succeeds;
- no lot becomes negative;
- total lot invariant holds;
- allocation totals match the winning hold;
- the losing caller either records deterministic insufficient balance after
  acquiring the lock or receives transient `wallet_busy`;
- a transient busy outcome has no final failed receipt;
- retry after the winner commits produces a safe deterministic result.

Do not use same-thread `Promise.all` as evidence of concurrency because
`better-sqlite3` calls are synchronous.

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
node --test server/tests/platform-coin-wallet-store.test.mjs server/tests/platform-coin-wallet-concurrency.test.mjs
```

- [ ] **Step 4: Implement confirmation and hold allocation**

Follow the frozen D2a write order above. Replay precedes current-state
evaluation. Query and reuse one locked database UTC value for hold deadline,
bonus eligibility, and operation timestamps. Allocate only from locked state,
validate every allocation before financial writes, use guarded lot updates,
write the exact ledger audit bindings, and complete only one of the three
allowed terminal outcomes.

- [ ] **Step 5: Re-run and verify GREEN**

```powershell
node --test server/tests/platform-coin-wallet-domain.test.mjs server/tests/platform-coin-wallet-store.test.mjs server/tests/platform-coin-wallet-concurrency.test.mjs
```

- [ ] **Step 6: Conditional commit checkpoint**

Only after explicit commit authorization:

```powershell
git add server/services/platform/coin-wallet-store.mjs server/tests/platform-coin-wallet-store.test.mjs server/tests/platform-coin-wallet-concurrency.test.mjs
git commit -m "feat(platform): add atomic Coin holds"
```

### Task 6: Complete capture, release, expiry, and rollback guarantees

**Files:**

- Modify: `server/services/platform/coin-wallet-store.mjs`
- Modify: `server/tests/platform-coin-wallet-store.test.mjs`
- Create: `server/tests/platform-coin-wallet-atomicity.test.mjs`
- Modify: `server/tests/platform-coin-wallet-concurrency.test.mjs`

**Mutation methods:**

```js
captureCoinHold({ holdRef, operation })
releaseCoinHold({ holdRef, operation })
expireCoinHold({ holdRef })
expireCoinLot({ lotRef })
```

Worker identities are derived internally:

```text
hold-expiry:<hold_ref>:<expires_at>
lot-expiry:<lot_ref>:<expires_at>
```

**Frozen lifecycle terminal outcomes:**

| Operation/outcome | Receipt status | `ok` | `safeResultCode` | `resultRef` | Version interval | Allowed resulting wallet status |
| --- | --- | ---: | --- | --- | --- | --- |
| `capture_coin_hold` success | `succeeded` | true | `captured` | exact `holdRef` | `n -> n+1` | `active` |
| `capture_coin_hold` at/after immutable deadline | `failed` | false | `hold_expired` | null | `n -> n` | `active` |
| `release_coin_hold` success | `succeeded` | true | `released` | exact `holdRef` | `n -> n+1` | `active/frozen/closed` |
| `expire_coin_hold` active due success | `succeeded` | true | `expired` | exact `holdRef` | `n -> n+1` | `active/frozen/closed` |
| `expire_coin_hold` due after another terminal transition | `succeeded` | true | `expiry_processed` | exact `holdRef` | `n -> n` | `active/frozen/closed` |
| `expire_coin_lot` due with positive available units | `succeeded` | true | `expired` | exact `lotRef` | `n -> n+1` | `active/frozen/closed` |
| `expire_coin_lot` due with zero available units | `succeeded` | true | `expiry_processed` | exact `lotRef` | `n -> n` | `active/frozen/closed` |

All seven outcomes use the existing stable nine-field envelope. Lifecycle
receipt validation rejects every other code/result/version/status combination
as `idempotency_unavailable`. `expiry_processed` means that the exact due
worker identity was durably processed without changing a wallet bucket. It
does not claim that a captured, released, expired, or invalidated hold changed
to expired, or that protected held lot units moved.

Same identity and digest replays the terminal envelope with only `replayed`
changing; a different digest returns `idempotency_conflict`. A distinct
capture/release key re-evaluates current state. A non-active hold returns
`coin_hold_not_active` with no receipt and never reports another operation's
transition as its own success. Capture requires locked
`dbNow < hold.expiresAt`; equality or later stores only the exact
`failed/hold_expired/null/n -> n` receipt. Expiry before its durable deadline
returns `not_due` without a receipt. At or after the deadline, a terminal hold
or a finite bonus lot with zero available units stores the corresponding
`expiry_processed/n -> n` receipt with zero financial writes. Held units
remain protected and a later release or hold expiry still routes already-due
bonus units directly to expired.

The lifecycle slice has exactly these first-time non-terminal safe errors:

```text
invalid_wallet_request
non_normalized_wallet_request
hold_not_found
lot_not_found
wallet_not_active
coin_hold_not_active
coin_lot_not_expirable
not_due
idempotency_conflict
idempotency_unavailable
wallet_busy
wallet_infrastructure_error
```

They create no receipt. Except for the exact durable `hold_expired` capture
outcome above, no lifecycle deterministic failed receipt is permitted.
Malformed or extra/Symbol/non-enumerable fields, caller-supplied expiry
deadline or operation data, missing subjects, wrong/nonfinite lot type,
disallowed state, contention, corruption, unsafe arithmetic, reference/CAS
failure, and SQL faults map only to this safe boundary.
Malformed or noncanonical durable hold/lot `expires_at`, malformed locked
database UTC, and impossible durable lot type/bucket/deadline combinations are
integrity corruption: they create no receipt and map only to
`wallet_infrastructure_error`. `coin_lot_not_expirable` is reserved for a
structurally valid subject that is legitimately not a finite-expiry
`bonus_coins` lot.

Capture/release accept exactly `{ holdRef, operation }`; the operation wrapper
requires exact own data fields `actorScope`, `idempotencyKey`, `actorType`, and
`actorRef`. Expiry accepts exactly `{ holdRef }` or `{ lotRef }` and rejects
caller deadline, operation, actor, key, or digest fields. Expiry derives:

```text
actorScope = system:coin-wallet-expiry
actorType  = system
actorRef   = coin_wallet_expiry_worker

expire_coin_hold:
  idempotencyKey = hold-expiry:<holdRef>:<durable canonical expiresAt>
  digest fields  = holdRef, expiresAt

expire_coin_lot:
  idempotencyKey = lot-expiry:<lotRef>:<durable canonical expiresAt>
  digest fields  = lotRef, expiresAt
```

The canonical deadline is read without reformatting from the durable subject
inside `BEGIN IMMEDIATE`. Capture/release validate the request, enter the
immediate transaction, replay/conflict before current state, then load and
validate hold, wallet, allocations, one database UTC, outcome, refs and
arithmetic before the started receipt and guarded writes. Expiry validates the
request, enters the immediate transaction, loads the durable subject and
deadline, rejects missing/wrong/nonfinite subjects, derives identity/digest,
replays before wallet/state/time checks, reads one database UTC, rejects early
`not_due`, classifies the financial or no-op result, validates allocations or
buckets and refs, then claims the started receipt and performs guarded writes.

Lifecycle ledger rows bind the actual lot and moved units, copied lot
`source_type/source_ref`, exact actor evidence, one shared operation ref,
wallet version interval/status, and locked database UTC. Capture uses
`held_to_consumed`; release and hold expiry use `held_to_available` or
`held_to_expired` per lot; lot expiry uses `available_to_expired`.
Capture/release/hold-expiry rows use the exact hold reference and use
`order_ref=purposeRef` only for `product_purchase`, otherwise null. Lot expiry
uses null hold/order refs. Failed and no-op outcomes write no ledger.

**Schema blocker:** lifecycle Store work is blocked until the still-unpublished
PR1 schema adds and independently re-reviews two narrow null-safe triggers
that reject changes to `platform_coin_holds.expires_at` and
`platform_coin_lots.expires_at`. Store CAS must also bind the original
deadline, but Store discipline is not deadline authority. Task A5 does not
implement the triggers and does not establish schema readiness.

Rules:

- capture and release are whole-hold only;
- active wallets may capture a user hold; frozen and closed wallets reject
  capture after status is re-read under the immediate write lock;
- release and expiry remain allowed for mandatory cleanup on active, frozen,
  and closed wallets, with closed limited to that cleanup boundary;
- capture before the database deadline moves held to consumed;
- release before bonus expiry returns held to available;
- release after bonus expiry moves held to expired;
- ordinary lot expiry moves only unheld available bonus units to expired;
- active held units stay protected from ordinary lot expiry;
- hold expiry changes the hold to expired and releases every allocation,
  returning unexpired units to available and expired bonus units to expired;
- an early expiry call returns transient `not_due` without a final receipt;
- repeated due expiry replays and cannot move units twice;
- capture versus expiry is decided under the same immediate lock;
- capture, release, and hold expiry re-read immutable allocations inside that
  same immediate transaction and require sequences exactly `1..N`, positive
  allocation amounts, a safe-integer sum exactly equal to
  `hold.amount_units`, matching wallet/lot ownership, and sufficient per-lot
  held coverage; any mismatch is an infrastructure-integrity failure that
  rolls back and is never stored as a deterministic business-failure receipt;
- PR1 ledger `operation` values are exactly `credit`,
  `pending_to_available`, `available_to_held`, `held_to_consumed`,
  `held_to_available`, `held_to_expired`, and `available_to_expired`;
  confirmation, hold, capture, and ordinary lot expiry use their corresponding
  directional value, while release and hold expiry choose
  `held_to_available` or `held_to_expired` independently per lot at the exact
  database UTC deadline;
- generic `release`, `expiry`, and `balance_update` ledger operation values are
  forbidden; no-op and deterministic-failure receipts write no ledger rows;
- every row for one multi-lot operation shares the operation ref, previous and
  resulting wallet versions, and resulting wallet status;
- capture, release, and due expiry return only the seven frozen terminal
  outcomes above; same-identity same-digest replay changes only `replayed`.

- [ ] **Step 0: Pass the independent deadline-immutability schema gate**

Before writing or running any lifecycle Store test, a separate A-gate schema
task must add the two null-safe deadline triggers, update the DDL checksum and
exact migration tests, and receive independent review PASS. Until then, both
lifecycle Store tests and implementation are prohibited.

- [ ] **Step 1: Write failing lifecycle tests**

Cover all seven exact terminal outcomes, distinct-key non-active hold
rejection, durable capture `hold_expired`, early no-receipt `not_due`, due
hold/lot `expiry_processed`, ordinary
bonus expiry, protected held bonus, release after expiry, hold expiry across
multiple Coin types, exact-boundary database time, active/frozen/closed capture
and cleanup matrix, exact `1..N` allocation sequence and safe sum revalidation,
wallet/lot ownership and per-lot held-coverage corruption, fail-closed rollback
without a deterministic receipt, replay, digest conflict, and wallet version
once per multi-lot operation. Assert every directional ledger operation code,
the absence of generic `release`, `expiry`, and `balance_update`, the
per-lot `held_to_available` versus `held_to_expired` destination at the exact
database UTC boundary, no ledger row for no-op/deterministic failure, and
shared multi-lot operation ref/version/status fields. Compare the stable
envelope for successful, failed, no-op, and expiry replay without rebuilding
historical expiry, policy, source, bucket, or current-wallet fields.
For both expiry operation domains, prove the digest projection uses the exact
deadline read from the immutable durable hold row or durable lot row and
rejects a caller-substituted deadline or extra field.
Assert every non-terminal lifecycle error creates no receipt and every
malformed code/result/version/status combination is
`idempotency_unavailable`.
Cover malformed/noncanonical durable deadlines, malformed locked database UTC,
and impossible durable lot type/bucket/deadline combinations as no-receipt
`wallet_infrastructure_error`; reserve `coin_lot_not_expirable` for a
structurally valid but non-finite-bonus subject.

- [ ] **Step 2: Write failing race tests**

Race capture against hold expiry and lot expiry against release using separate
connections/workers. Assert exactly one legal transition wins and every replay
has the same stable envelope except for `replayed`.

- [ ] **Step 3: Write failing fault-injection rollback tests**

For each multi-write operation, install temporary `BEFORE INSERT` or
`BEFORE UPDATE` triggers that `RAISE(ABORT, ...)` at successive write points.
After each injected failure assert:

- wallet version unchanged;
- lot buckets unchanged;
- no partial hold/allocation/ledger/receipt row;
- retry after removing the trigger succeeds exactly once.

- [ ] **Step 4: Run focused tests and verify RED**

```powershell
node --test server/tests/platform-coin-wallet-store.test.mjs server/tests/platform-coin-wallet-atomicity.test.mjs server/tests/platform-coin-wallet-concurrency.test.mjs
```

- [ ] **Step 5: Implement the four terminal operations**

Do not begin Store work until the two deadline-immutability triggers have been
added to the unpublished PR1 schema and independently re-reviewed. Then use
the existing private immediate-operation kernel. Database-derived UTC must
be read under the transaction. Re-read wallet status and immutable allocations
after the immediate lock, validate allocation integrity before any mutation,
and treat corruption as a rollback-only infrastructure failure. Never run a
timer, worker loop, order callback, or fulfillment callback in PR1.

- [ ] **Step 6: Verify ledger immutability**

Add direct synthetic attempts to update and delete a ledger row and require
the named triggers to reject both. Correct history only by appending later
entries.

- [ ] **Step 7: Re-run and verify GREEN**

```powershell
node --test server/tests/platform-coin-wallet-store.test.mjs server/tests/platform-coin-wallet-atomicity.test.mjs server/tests/platform-coin-wallet-concurrency.test.mjs
```

- [ ] **Step 8: Conditional commit checkpoint**

Only after explicit commit authorization:

```powershell
git add server/services/platform/coin-wallet-store.mjs server/tests/platform-coin-wallet-store.test.mjs server/tests/platform-coin-wallet-atomicity.test.mjs server/tests/platform-coin-wallet-concurrency.test.mjs
git commit -m "feat(platform): close Coin hold lifecycle"
```

### Task 7: Verify the PR1 scope and record recovery deferral

**Files:**

- Verify only; no source or test changes

PR1 stops at Wallet Core. Refund/chargeback reversal, source-reversal
allocations, recovery cases, recovery resolutions, wallet restrictions, spend
freeze, same-type recovery payment, and Admin waiver resolution require a
later additive-migration PR.

- [ ] **Step 1: Search the proposed PR1 schema and store surface**

Confirm that the PR1 migration owns only the migration ledger and the seven
Wallet Core tables, and that the store exports no recovery, reversal,
restriction, waiver, or recovery-payment API.

- [ ] **Step 2: Verify the dependency boundary**

Confirm that no PR1 source or test creates or imports commerce orders,
products/Offers, fulfillment commands, a delivery coordinator, providers,
HTTP routes, Portal/Admin UI, or production migration behavior.

- [ ] **Step 3: Record the additive boundary**

The handoff must state that recovery and the future SQLite-backed thin
order/delivery coordinator are unimplemented future work. Do not add checked
implementation steps or placeholder schema for either boundary.

### Task 8: Wire the default-off runtime gate without routes or workers

**Files:**

- Modify: `server/state.mjs`
- Modify: `server/tests/state.test.mjs`
- Modify: `.env.example`

**Runtime contract:**

```text
COINS_WALLET_ENABLED=false
```

```js
platform: {
  coinsWalletEnabled,
  coinsWalletStore
}
```

Dependency direction:

```text
state.mjs
  -> coin-wallet-store.mjs
       -> coin-wallet-migrations.mjs  // validate only

platform-coin-wallet-schema.mjs
  -> coin-wallet-migrations.mjs
```

- [ ] **Step 1: Write failing state tests**

Cover:

- flag absent/empty/false -> disabled;
- disabled -> `coinsWalletStore === null`, no extra connection, no Coins schema
  requirement, and no Coins table created;
- injected store while disabled is rejected or ignored according to one
  explicit tested contract;
- enabled with missing migration -> startup fails closed;
- enabled with checksum/schema mismatch -> startup fails closed;
- enabled with exact schema -> store exposed;
- closing state closes only a store owned by state;
- injected store is not closed by state;
- no Coins route, HTTP handler, timer, worker, provider, order, or fulfillment
  registration appears.

- [ ] **Step 2: Run the focused state test and verify RED**

```powershell
node --test server/tests/state.test.mjs
```

- [ ] **Step 3: Add minimal state ownership**

Add `coinsWalletEnabled = envFlag(env.COINS_WALLET_ENABLED)` near existing
default-off route gates. When enabled:

```js
const ownsCoinsWalletStore = !options.coinsWalletStore;
const coinsWalletStore = coinsWalletEnabled
  ? options.coinsWalletStore || createSqliteCoinWalletStore({
      dbPath: controlDbPath
    })
  : null;
```

If store validation fails after state opened an owned control store, close
already-owned resources before rethrowing. Extend `close()` idempotently and
expose only the two platform fields. Do not alter
`subscription-control-db.mjs`.

Add a documented default-false placeholder to `.env.example`; do not set it on
any host or environment.

- [ ] **Step 4: Re-run and verify GREEN**

```powershell
node --test server/tests/state.test.mjs server/tests/platform-coin-wallet-migrations.test.mjs server/tests/platform-coin-wallet-store.test.mjs
```

- [ ] **Step 5: Conditional commit checkpoint**

Only after explicit commit authorization:

```powershell
git add server/state.mjs server/tests/state.test.mjs .env.example
git commit -m "feat(platform): gate Coin wallet runtime"
```

### Task 9: Full source-only verification and handoff

**Files:**

- Modify if needed:
  `docs/superpowers/specs/2026-07-23-coins-wallet-promotion-design.md`
- Modify if needed:
  `docs/superpowers/plans/2026-07-23-coins-wallet-foundation.md`
- Verify all files changed by Tasks 1-6 and Task 8; Task 7 is a no-code scope
  verification

- [ ] **Step 1: Confirm the Task 0 dependency and baseline evidence**

Do not defer dependency installation to final verification. Confirm Task 0
recorded a successful `npm ci` and the unchanged database/state baseline. If
`package-lock.json` changed during implementation, rerun `npm ci` and the
baseline before continuing.

- [ ] **Step 2: Run each focused test file**

```powershell
node --test server/tests/platform-coin-wallet-domain.test.mjs
node --test server/tests/platform-coin-wallet-migrations.test.mjs
node --test server/tests/platform-coin-wallet-schema-cli.test.mjs
node --test server/tests/platform-coin-wallet-store.test.mjs
node --test server/tests/platform-coin-wallet-atomicity.test.mjs
node --test server/tests/platform-coin-wallet-concurrency.test.mjs
node --test server/tests/state.test.mjs
```

Record the exact pass/fail counts. Fix failures through the same RED/GREEN task;
do not weaken assertions to obtain green.

- [ ] **Step 3: Run the combined changed-surface suite**

```powershell
node --test server/tests/platform-coin-wallet-domain.test.mjs server/tests/platform-coin-wallet-migrations.test.mjs server/tests/platform-coin-wallet-schema-cli.test.mjs server/tests/platform-coin-wallet-store.test.mjs server/tests/platform-coin-wallet-atomicity.test.mjs server/tests/platform-coin-wallet-concurrency.test.mjs server/tests/state.test.mjs
```

- [ ] **Step 4: Run repository validation**

```powershell
npm test
npm run docs:authority:check
git diff --check
git diff --check origin/master...HEAD
$untracked = git ls-files --others --exclude-standard
foreach ($path in $untracked) {
  git diff --no-index --check -- NUL $path
  if ($LASTEXITCODE -gt 1) { exit $LASTEXITCODE }
}
```

Portal/Admin builds are intentionally omitted because PR1 changes no frontend
source or static artifact. This omission is not evidence of Portal/Admin
production identity. `git diff --check origin/master...HEAD` becomes meaningful
only after an authorized commit; the working-tree and per-untracked-file checks
are mandatory before that point.

- [ ] **Step 5: Perform the reverse-scope audit**

```powershell
rg -n -g 'coin-wallet-*.mjs' "paypal|webhook|provider|CommerceWorkspace|PortalPreviewRoute|setBalance|adjustBalance|ON DELETE CASCADE" server/services/platform
rg -n "paypal|webhook|provider|CommerceWorkspace|PortalPreviewRoute|setBalance|adjustBalance|ON DELETE CASCADE" scripts/platform-coin-wallet-schema.mjs
rg -n "CREATE TABLE.*platform_coin|platform_schema_migrations" server/services/platform/subscription-control-db.mjs
rg -n -g 'coin-wallet-*.mjs' "recovery|reverseCoinCredit|source_reversal|wallet_restriction|waiver" server/services/platform server/tests
git status --short --branch
git diff --stat
git diff --stat origin/master...HEAD
```

Expected:

- no provider, preview shell, arbitrary balance, or cascade dependency;
- no Coins DDL in the existing startup-created control store;
- no recovery case, source-reversal allocation, recovery resolution, wallet
  restriction, spend-freeze, or reversal API in PR1;
- only the approved PR1 source, tests, docs, package script, state flag, and
  `.env.example` placeholder changed;
- no generated artifact, database, backup, credential, or customer data is
  tracked.

- [ ] **Step 6: Independent review**

Ask one reviewer to inspect transaction/idempotency/concurrency behavior and a
second reviewer to inspect migration/deferral/scope behavior. Resolve every
blocker and rerun the affected focused tests plus Steps 3-5.

- [ ] **Step 7: Prepare a Draft-only handoff**

The handoff must distinguish:

```text
implemented source
locally verified tests
synthetic migration dry-run
not production-migrated
runtime gate default false
no HTTP/frontend/provider/fulfillment
no recovery/reversal/restriction object or API
```

It must explicitly restate that the user's checkout/commerce UX is future PR2
work and recharge UX is future PR5 work: selecting Coins, reading a zero or
insufficient projection, and offering a user-controlled recharge navigation
must never create a hold, provider order, entitlement, automatic redirect,
automatic recharge, or automatic purchase resumption.

- [ ] **Step 8: Conditional final commit / Draft PR gate**

Only after explicit authorization, stage exactly reviewed files and create the
approved source commit(s). Pushing or opening a Draft PR requires separate
explicit authorization. Ready, merge, production migration, activation, and
deployment remain prohibited.
