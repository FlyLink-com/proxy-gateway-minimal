# G2-P1 — FK-body + unique-index-body probe

Proves, one by one, the **58 attribution-limited foreign keys** (C5-03-01)
and the **4 ARA unique indexes** (C5-03-04) from the G2 residual-risk
adjudication, on **both engines** — better-sqlite3 / SQLite and local
Miniflare D1 — with local synthetic data only.

- Baseline: master `44d2b02d` (PR #875 merged; production stays pr799).
- Fixture: `g2-p1-fixture.json` (62 items: FK-01..FK-58, IDX-01..IDX-04).
- Results: `g2-p1-results.json` (written by the runner).
- Receipt: `docs/D1_G2_P1_FK_UNIQUE_INDEX_BODY_RECEIPT_V1.md`.

## Design (guard-aware fixture)

The FK definitions under test are **byte-identical to production DDL by
construction**: the experiment schema is built from this checkout's own
migration modules, through their fail-closed apply entry points, in G2
DAG order plus the Plan C guard step (`lib/build-control-schema.mjs`).
Only the shielding guards are omitted — and every omitted trigger is
**RAISE-only** (verified: no DML in any trigger body after stripping
RAISE calls), so omitting it cannot change FK / CHECK / UNIQUE
semantics. A guard only ever *adds* a rejection; it never creates a
foreign-key, check, or unique violation.

Omitted triggers (31 = the union of the per-item omission lists in the
fixture; the runner verifies the union against this list and that every
listed trigger existed in the built schema):

- INSERT guards (10): the three ARA insert guards, the commerce
  authority quote-bindings insert guard, the four deferred-transition
  binding insert guards, the Plan C
  `coin_commerce_initial_confirmations_insert_guard`, and
  `deferred_resource_transitions_initial_state_reserved` (transitions
  effect_* INSERT probes must carry `effect_applied` state, which that
  insert-state guard forbids).
- UPDATE guards (18): `revoke_only_update`, the identity-immutable /
  snapshot-immutable / update-deny guards on receipts, orders, quotes,
  bindings, rebases, allocations, reservations, transitions, payment
  receipts, referral accruals/bindings/origins, scheduled switches, and
  the initial-confirmations immutable guard.
- DELETE guards (3): `account_resource_authorities_delete_deny`,
  `platform_referral_profile_no_delete`,
  `platform_referral_touches_immutable_delete`.

Each fixture item records its own omission list with the reason it was
needed, its seed statements, its probe SQLs, its expected outcomes, and
its reference census (every other FK that references the same parent
row, so a delete-parent refusal cannot be mis-attributed).

Per item, the probes are:

- **FK items** — INSERT an orphan row (expect FK), UPDATE the seed row's
  FK column to an orphan (expect FK; transitions effect_* items use the
  legal two-step state path reserved → processing → effect_applied),
  INSERT a positive control with all FKs real (expect ok), DELETE the
  parent (expect FK refusal, child rows unchanged). The delete census is
  recomputed live on both engines and compared with the frozen census.
- **Index items** — P1 seed active row exists; P2 second active row with
  the same key column (expect UNIQUE naming that column); P3 same-key
  revoked row (expect ok — the predicate excludes it); P4 update the
  revoked row back to active (expect UNIQUE naming that column).

One pair (fresh SQLite DB + fresh isolated D1 DB) per item; terminal
state is a full dump of every table on both engines and must be
identical. An item is PROVEN only if every probe matches its
expectation on **both** engines and the terminal states agree.

## Running it

```sh
cd tools/g2-p1
npm ci            # installs pinned better-sqlite3 + miniflare (needs the proxy env vars intact)
npm run probe     # node g2-p1-run.mjs — writes g2-p1-results.json, exit 0 iff all 62 PROVEN
```

**Miniflare needs the proxy env vars cleared** (it talks to workerd over
localhost; with the egress proxy set, startup hangs):

```sh
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy npm run probe
```

`npm run probe:sqlite-only` runs the SQLite side only (fast smoke test;
not a substitute for the dual-engine run).

The runner first verifies the rebuilt experiment schema against the
fixture's frozen hashes (object SHA-256, 127-FK inventory, the 4 ARA
index SQLs, the 31-trigger omission union) and refuses to report PASS
if any of them mismatches. It never mutates the fixture.

## D1 notes (verified while building this probe)

- D1 error texts (single-statement `run()`): `D1_ERROR: FOREIGN KEY
  constraint failed: SQLITE_CONSTRAINT`, `D1_ERROR: UNIQUE constraint
  failed: <table>.<col>: SQLITE_CONSTRAINT`, `D1_ERROR: CHECK
  constraint failed: ...`. The signature matcher recognises all three.
- D1 does **not** expose its SQLite version (`sqlite_version()` is
  unauthorized); the results record the Miniflare + workerd versions
  instead.
- `PRAGMA foreign_keys` reads 1 on D1 and `= OFF` is accepted but
  ineffective — FKs are always enforced.

## Results (this run)

Dual-engine run at baseline `ba6ca8bc` (2026-11-14):

- **62/62 PROVEN (FK 58/58, indexes 4/4); schema verification PASSED;
  exit code 0.**
- `g2-p1-results.json` SHA-256:
  `3f0e74ece9fab35d19fb02c17997a9e5e46413f1e9cf98d9b2f5f2a1156add88`.
- `g2-p1-fixture.json` SHA-256:
  `63ee5f8ea73f6ade1cc7ee69385b26bfe81e0a651874aa71a7188675add9974a`.
- Versions: Node v22.23.1, better-sqlite3 12.10.0, SQLite 3.53.1,
  Miniflare 4.20251109.0, workerd 1.20251109.0.
- The run took ~4 minutes (mostly the 62 D1 database builds).
  The same fixture was first run at `44d2b02d` with identical results
  (results SHA-256
  `9f6c1e724306a709b26de3ebd069acb5642b053b0c402cddd12b4b5197a9c798`);
  the #874 delta is docs-only, so the experiment-schema hash is
  unchanged (`e7ae56a7…`).

## Files

| File | What it is |
| --- | --- |
| `g2-p1-run.mjs` | The runner (verification + per-item dual-engine runs + verdicts). |
| `g2-p1-fixture.json` | Frozen per-item specs: seeds, probes, expectations, omissions, census. |
| `g2-p1-results.json` | Runner output (per-item outcomes on both engines + terminal states). |
| `g2-p1-ddl-diff.json` | Frozen G2-baseline → 44d2b02d DDL diff + live FK/index verification. |
| `lib/build-control-schema.mjs` | Experiment-schema builder (checkout's own migration modules). |
| `lib/engines.mjs` | Dual-engine layer (better-sqlite3 + Miniflare D1 pool, signatures, dumps). |
| `package.json` / `package-lock.json` | Pinned deps: better-sqlite3 12.10.0, miniflare 4.20251109.0. |

## Non-goals

- No production DDL or migration is modified; no BWH / remote D1 / DO
  access; no real keys; local synthetic data only.
- This probe covers C5-03-01 + C5-03-04 only. The 18 CHECKs (G2-P2)
  and concurrent pagination (G2-P3) are separate probes.
