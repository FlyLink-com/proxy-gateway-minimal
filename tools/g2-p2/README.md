# G2-P2 — CHECK de-guarding probe

Proves, one by one, the **18 guard-shielded CHECKs** (C5-03-02) from the
G2 residual-risk adjudication, on **both engines** — better-sqlite3 /
SQLite and local Miniflare D1 — with local synthetic data only.

- Baseline: master `ba6ca8bc` (PR #874 merged; production stays pr799).
  Branch rebased onto `446d125a` (PR #876 merged); the dual-engine run
  was re-executed at the new head with identical results (see below).
- Fixture: `g2-p2-fixture.json` (18 items: CHK-01..CHK-18).
- Results: `g2-p2-results.json` (written by the runner).
- Receipt: `docs/D1_G2_P2_CHECK_DEGUARD_RECEIPT_V1.md`.

## Design (de-guarded experiment set)

The CHECK definitions under test are **byte-identical to production DDL
by construction**: the experiment schema is built from this checkout's
own migration modules, through their fail-closed apply entry points, in
G2 DAG order plus the Plan C guard step
(`lib/build-control-schema.mjs`). Only the shielding guards are
omitted — and every omitted trigger is **RAISE-only** (verified: no DML
in any trigger body after stripping RAISE calls), so omitting it cannot
change CHECK / FK / UNIQUE semantics. A guard only ever *adds* a
rejection; it never creates a check violation.

Omitted triggers (37 = P1's 31 plus 6 this probe needs):

- P1's 31 (10 INSERT guards, 18 UPDATE guards, 3 DELETE guards — see
  `tools/g2-p1/README.md` for the full list).
- 2 shielding INSERT guards P1 never tripped, because its probes kept
  the guarded state: `deferred_resource_transition_reservations_initial_state_reserved`
  (CHK-10) and `platform_scheduled_plan_switches_insert_guard`
  (CHK-14/CHK-15).
- 4 UPDATE state/CAS guards the trial loop discovered intercepting the
  violation/boundary UPDATE probes:
  `deferred_resource_transition_rebases_state_transition`,
  `deferred_resource_transition_rebases_lease_cas_update`,
  `deferred_resource_transition_reservations_state_transition`,
  `deferred_resource_transitions_state_transition`. They enforce the
  state machine / lease-CAS protocol, not CHECK semantics.

Each fixture item records its own omission list with the reason it was
needed, its seed statements (reused verbatim from the frozen P1
fixture, `g2-p1-fixture.json` SHA-256
`63ee5f8ea73f6ade1cc7ee69385b26bfe81e0a651874aa71a7188675add9974a`),
its probe SQLs, and its expected outcomes.

Per item, the probes are (one fresh SQLite DB + one fresh isolated D1
DB per item, in this order):

- **Positive control** — INSERT a legal clone of the seed row with
  fresh unique values (expect ok).
- **Violation** — UPDATE the seed row's target column(s) to a value
  violating only the target CHECK (expect CHECK, and the error must echo
  the frozen CHECK expression, whitespace-normalized). UPDATE (not
  INSERT) is used so the probe cannot collide with the positive clone's
  fresh unique values and cannot be mis-attributed to UNIQUE / FK.
- **Boundary** — UPDATE the seed row to a boundary value (accept, or a
  second distinct reject with the same CHECK expression echoed).
  CHK-02's accept-boundary is an INSERT clone instead: its boundary
  value (version = 1) already equals the seed value and
  (account_id, version) is UNIQUE, so the clone is repointed to acct-2.

Terminal state is a full dump of every table on both engines and must
be identical. An item is PROVEN only if every probe matches its
expectation on **both** engines and the terminal states agree.
Anything that cannot be proven without changing CHECK semantics is
recorded UNPROVEN with a reason — never filled PASS. Unexecuted ≠ PASS.

## Running it

```sh
cd tools/g2-p2
npm ci            # installs pinned better-sqlite3 + miniflare (needs the proxy env vars intact)
npm run probe     # node g2-p2-run.mjs — writes g2-p2-results.json, exit 0 iff all 18 PROVEN
```

**Miniflare needs the proxy env vars cleared** (it talks to workerd over
localhost; with the egress proxy set, startup hangs):

```sh
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy npm run probe
```

`npm run probe:sqlite-only` runs the SQLite side only (fast smoke test;
not a substitute for the dual-engine run).

The runner first verifies the rebuilt experiment schema against the
fixture's frozen hashes (object SHA-256, 127-FK inventory, all 18 CHECK
expressions present in the live-built DDL, the 37-trigger omission
union) and refuses to report PASS if any of them mismatches. It replays
the frozen probe SQL verbatim and requires the frozen SQLite trial
signatures to reproduce exactly. It never mutates the fixture.

## D1 notes (verified while building this probe)

- D1 error texts (single-statement `run()`): `D1_ERROR: CHECK
  constraint failed: <expr>: SQLITE_CONSTRAINT | cause: CHECK
  constraint failed: <expr>`. The expression text is identical to
  SQLite's (whitespace-normalized); the signature matcher recognises
  it. D1 echoes the **column** CHECK before the table CHECK, exactly
  like SQLite (verified on CHK-01/07/10/13/14, whose violations also
  fail the table-level state-coupling CHECK).
- D1 does **not** expose its SQLite version (`sqlite_version()` is
  unauthorized); the results record the Miniflare + workerd versions
  instead.
- `PRAGMA foreign_keys` reads 1 on D1 and `= OFF` is accepted but
  ineffective — FKs are always enforced.

## Results (this run)

Dual-engine run at baseline `ba6ca8bc`, re-executed after the rebase
onto `446d125a` (2026-11-14):

- **18/18 PROVEN; schema verification PASSED; exit code 0.**
- `g2-p2-results.json` SHA-256:
  `02500f4ddc0f825bc6f61dd81cd34994df9b84f437c4abb504b0bee7078c6abe`.
- `g2-p2-fixture.json` SHA-256:
  `a77279ef524e0c3da907cfa039ad0f6a79a96016006177b1c7e40dc5a18f3091`.
- `g2-p2-ddl-diff.json` SHA-256:
  `eb70f18fb8755f7482ffb8caf51b4075b3043c2e3f0fd2f03b16c76596b51586`.
- Versions: Node v22.23.1, better-sqlite3 12.10.0, SQLite 3.53.1,
  Miniflare 4.20251109.0, workerd 1.20251109.0.
- The run took ~70 seconds (18 items). The results at `446d125a` are
  identical to the run at `ba6ca8bc` except for the `generatedAt`
  timestamp; the #876 delta is tools/g2-p1 + docs only, so the
  experiment-schema hash is unchanged (`e84fbeaf…`).

## Files

| File | What it is |
| --- | --- |
| `g2-p2-run.mjs` | The runner (verification + per-item dual-engine runs + verdicts). |
| `g2-p2-fixture.json` | Frozen per-item specs: seeds, probes, expectations, omissions. |
| `g2-p2-results.json` | Runner output (per-item outcomes on both engines + terminal states). |
| `g2-p2-ddl-diff.json` | Frozen G2-baseline → ba6ca8bc CHECK comparison (18/18 identical, normalized). |
| `lib/build-control-schema.mjs` | Experiment-schema builder (checkout's own migration modules). |
| `lib/engines.mjs` | Dual-engine layer (better-sqlite3 + Miniflare D1 pool, signatures, dumps). |
| `package.json` / `package-lock.json` | Pinned deps: better-sqlite3 12.10.0, miniflare 4.20251109.0. |

## Non-goals

- No production DDL or migration is modified; no BWH / remote D1 / DO
  access; no real keys; local synthetic data only.
- This probe covers C5-03-02 only. The 58 FKs + 4 ARA unique indexes
  are G2-P1 (PR #876, merged); concurrent pagination is G2-P3
  (separate probe, not started); the legacy-archive CHECKs are G2-P4
  (deferred by Yi's ruling — only if the target migration scope
  explicitly includes the archive table).
