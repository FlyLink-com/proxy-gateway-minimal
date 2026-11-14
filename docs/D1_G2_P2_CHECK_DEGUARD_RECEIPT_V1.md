# D1 G2-P2 CHECK De-Guarding Receipt v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_g2_p2_check_deguard_receipt
  superseded_by: null
  last_verified_at: 2026-11-14
  production_authority: false
```

Status: **EVIDENCE COMPLETE for C5-03-02 (probe evidence only)**.
This document records probe results only. It does not declare a T2 PASS,
does not authorize production migration, deployment, BWH access, remote
D1/DO access, or production switching. Production remains pr799.

## 0. Verdict summary

| Item | Proven | Total |
| --- | --- | --- |
| Guard-shielded CHECKs (C5-03-02) | 18 | 18 |
| **Total** | **18** | **18** |

- **UNPROVEN: 0. NEEDS-REVIEW: 0.**
- Every item is PROVEN on **both** engines (better-sqlite3 / SQLite and
  local Miniflare D1), with identical per-probe outcomes, the failing
  CHECK expression echoed verbatim on both engines, and identical
  terminal states (full dump of every table, compared byte-for-byte).
- Schema verification PASSED before any probe ran (see §2).
- The strict historical reading is kept: G2's 27 attribution-limited
  CHECKs are now 27 = **18 PROVEN-by-CHECK-body** (this probe) + 9
  legacy-archive CHECKs (G2-P4, deferred — only if the target migration
  scope explicitly includes the archive table).

## 1. Baselines, versions, hashes

- **Source baseline (fixture frozen at)**: master `ba6ca8bc`
  ("docs: M1 contract v0.5 draft (#874)", merged 2026-11-14T15:12:16Z).
  The branch was rebased onto master `446d125a` (PR #876, merged
  2026-11-14T16:01:16Z) and the dual-engine run was re-executed at the
  new head; the results are identical to the `ba6ca8bc` run except for
  the `generatedAt` timestamp, and the experiment-schema object hash is
  unchanged (see §2). The #876 delta is tools/g2-p1 + docs only.
- **Historical G2 test baseline**: master
  `63082bae5d980c3905d6e7405329b19e6c4e38ac` (check-census.json; the 18
  frozen CHECK expressions come from its census, verified unchanged
  against the live-built DDL at `ba6ca8bc` — see
  `tools/g2-p2/g2-p2-ddl-diff.json`, 18/18 identical normalized).
- **Production**: pr799 (unchanged; every merge is source-only).
- **Data**: local synthetic data only. No remote Cloudflare, BWH, or
  production connection was used; no real keys; no production data.
  Seeds are reused verbatim from the frozen P1 fixture
  (`g2-p1-fixture.json` SHA-256
  `63ee5f8ea73f6ade1cc7ee69385b26bfe81e0a651874aa71a7188675add9974a`).

| Artifact | SHA-256 |
| --- | --- |
| `tools/g2-p2/g2-p2-fixture.json` | `a77279ef524e0c3da907cfa039ad0f6a79a96016006177b1c7e40dc5a18f3091` |
| `tools/g2-p2/g2-p2-results.json` | `02500f4ddc0f825bc6f61dd81cd34994df9b84f437c4abb504b0bee7078c6abe` |
| `tools/g2-p2/g2-p2-ddl-diff.json` | `eb70f18fb8755f7482ffb8caf51b4075b3043c2e3f0fd2f03b16c76596b51586` |

| Version | Value |
| --- | --- |
| Node | v22.23.1 |
| better-sqlite3 | 12.10.0 |
| SQLite (better-sqlite3 side) | 3.53.1 |
| Miniflare | 4.20251109.0 |
| workerd | 1.20251109.0 |
| D1 SQLite version | not exposed by D1 (`sqlite_version()` is unauthorized) |

## 2. Schema verification (runner, before any probe)

The runner rebuilds the experiment schema from this checkout's own
migration modules and verifies it against the fixture's frozen values
before running any probe. All checks passed:

- Experiment-schema object SHA-256:
  `e84fbeaf23c9d89dc71c4ef30cf1b5a481e7a5e9972ba014d5b1d1d8d76112d6`
  (228 objects: 74 tables / 94 indexes / 54 triggers after omitting 37).
- Full-schema object SHA-256 (0 omitted, 91 triggers):
  `6e98d3f1c8e5e622f94dd9fa488f54adca4e64e5b34c1207e54fd19ec68b4a70`
  — identical to P1's full-schema hash, as expected (no migration
  changed between `ba6ca8bc` and `446d125a`).
- FK inventory: 127 constraints (128 pragma rows), identical to the
  frozen fixture inventory.
- All 18 frozen CHECK expressions are present (whitespace-normalized)
  in the live-built table DDL at `ba6ca8bc`.
- Omission union (37) matches the builder's list exactly.

## 3. Method (de-guarded experiment set)

The CHECK definitions under test are **byte-identical to production DDL
by construction**: the experiment schema is built from this checkout's
own migration modules, through their fail-closed apply entry points, in
G2 DAG order plus the Plan C guard step
(`tools/g2-p2/lib/build-control-schema.mjs`). Only the shielding guards
are omitted — and every omitted trigger is **RAISE-only** (verified: no
DML in any trigger body after stripping RAISE calls), so omitting it
cannot change CHECK / FK / UNIQUE semantics. A guard only ever *adds* a
rejection; it never creates a check violation.

Omitted triggers (37 = P1's 31 plus 6 this probe needs):

- P1's 31 (10 INSERT guards, 18 UPDATE guards, 3 DELETE guards — see
  `tools/g2-p1/README.md`).
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

Per-item probes (one fresh SQLite DB + one fresh isolated D1 DB per
item; probes run in this order):

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

An item is PROVEN only if every probe matches its expectation on
**both** engines and the terminal states agree. The runner exits
non-zero otherwise. The full per-probe outcomes, error texts, and
terminal-state dumps are in `tools/g2-p2/g2-p2-results.json`.

## 4. Per-item results

Outcome columns (identical on both engines): `positive / violation /
boundary`. Violation and boundary values are the exact values the
probes used; the CHECK column is the frozen expression the error must
echo.

| ID | Table.column | CHECK (short) | Violation → outcome | Boundary → outcome | Verdict |
| --- | --- | --- | --- | --- | --- |
| CHK-01 | platform_account_resource_authorities.status | status in ('active', 'revoked') | 'suspended' → CHECK | 'pending' → CHECK | PROVEN |
| CHK-02 | platform_account_resource_authorities.version | typeof(version) = 'integer' and version >= 1 | 0 → CHECK | 1 (INSERT clone, acct-2) → ok | PROVEN |
| CHK-03 | platform_account_resource_authorities.created_at | length(trim(created_at)) > 0 | '' → CHECK | '   ' → CHECK | PROVEN |
| CHK-04 | platform_account_resource_authorities.updated_at | length(trim(updated_at)) > 0 | '' → CHECK | '   ' → CHECK | PROVEN |
| CHK-05 | platform_account_resource_authorities (table) | active ⇒ revoked_* null; revoked ⇒ revoked_* non-empty | active + revoked_at set → CHECK | revoked + revoked_at = '' → CHECK | PROVEN |
| CHK-06 | platform_commerce_authority_quote_bindings.authority_version | typeof = 'integer' and between 1 and 9007199254740991 | 0 → CHECK | 9007199254740992 → CHECK | PROVEN |
| CHK-07 | platform_deferred_resource_transition_rebases.state | state in ('pending', 'processing', 'completed', 'reconciliation_required') | 'done' → CHECK | 'archived' → CHECK | PROVEN |
| CHK-08 | platform_deferred_resource_transition_rebases.lease_generation | typeof = 'integer' and between 0 and 2147483647 | -1 → CHECK | 2147483647 → ok | PROVEN |
| CHK-09 | platform_deferred_resource_transition_reservation_allocations.coin_type_snapshot | coin_type_snapshot in ('paid_coins', 'bonus_coins', 'reward_coins') | 'fiat_coins' → CHECK | 'usd_coins' → CHECK | PROVEN |
| CHK-10 | platform_deferred_resource_transition_reservations.state | state in ('reserved', 'processing', 'captured', 'released', 'reconciliation_required') | 'done' → CHECK | 'expired' → CHECK | PROVEN |
| CHK-11 | platform_deferred_resource_transitions.amount_units | typeof = 'integer' and between 1 and 9007199254740991 | 0 → CHECK | 9007199254740991 → ok | PROVEN |
| CHK-12 | platform_deferred_resource_transitions.rebase_generation | typeof = 'integer' and between 0 and 2147483647 | -1 → CHECK | 2147483647 → ok | PROVEN |
| CHK-13 | platform_deferred_resource_transitions.state | state in ('reserved', 'processing', 'effect_applied', 'settled', 'requote_required', 'cancelled', 'reconciliation_required') | 'done' → CHECK | 'failed' → CHECK | PROVEN |
| CHK-14 | platform_scheduled_plan_switches.status | status in ('scheduled', 'applying', 'applied', 'superseded') | 'done' → CHECK | 'cancelled' → CHECK | PROVEN |
| CHK-15 | platform_scheduled_plan_switches (table) | scheduled/applying ⇒ resolved_at null; applied ⇒ resolved_at non-empty; superseded ⇒ resolved_at + superseded_by non-empty | scheduled + resolved_at set → CHECK | applied + resolved_at = '' → CHECK | PROVEN |
| CHK-16 | platform_coin_commerce_initial_confirmations.attempt_count | typeof = 'integer' and between 1 and 2147483647 | 0 → CHECK | 2147483647 → ok | PROVEN |
| CHK-17 | platform_coin_commerce_initial_confirmations.lease_generation | typeof = 'integer' and between 1 and 2147483647 | 0 → CHECK | 2147483647 → ok | PROVEN |
| CHK-18 | platform_coin_commerce_initial_confirmations.confirmed_at | length = 24 and strict UTC-ms format and confirmed_at >= failed_updated_at | '2026-01-01T00:00:00Z' (20 chars) → CHECK | '2026-01-01T00:00:00.000Z' (valid format, earlier than failed_updated_at) → CHECK | PROVEN |

## 5. Attribution notes (read before reusing an item)

- **CHECK fires before FK.** Verified in a minimal experiment before
  building the fixture: a CHECK violation on a composite-FK column is
  reported as CHECK, an FK violation on the same column as FK. This is
  what makes CHK-06 provable (its column is part of the composite FK
  `(account_id, authority_version)`).
- **Column CHECKs are reported before table CHECKs.** Verified in a
  minimal experiment: when a mutation violates both, the error echoes
  the column CHECK expression. This is what makes CHK-01/07/10/13/14
  provable — each of their violations also fails the table-level
  state-coupling CHECK, but the column expression is reported first.
  CHK-05 and CHK-15 are the table CHECKs themselves (no column CHECK
  on the mutated columns also fails in those probes).
- **CHK-02's boundary is an INSERT clone**, not an UPDATE: the
  accept-boundary value (version = 1) already equals the seed value
  and (account_id, version) is UNIQUE, so the clone is repointed to
  acct-2 (the second account in the P1 seed set).
- **CHK-16/17/18 are the stage-3b variant items.** The Plan C variant
  retest left exactly these three initial-confirmations CHECKs shielded
  (attempt_count / lease_generation / confirmed_at); the variant
  candidates recorded in the stage-3b receipt are the violation values
  used here (0 / 0 / short malformed timestamp). In the de-guarded set
  the stage-3b open question ("no legal construction passes the guard
  while violating the CHECK in the full object set") is moot — the
  guard is omitted by design, and the CHECK body itself is what is
  under test.
- **What this probe does NOT prove.** The omitted guards' own
  invariants (state-machine legality, lease-CAS protocol, binding
  validity) are NOT re-proven here; they remain covered by the stage 2
  / stage 3 evidence, not by this probe. Omitting a guard proves the
  CHECK body in isolation; it says nothing about the guard.
- **No CHECK changed between the G2 baseline and this baseline.**
  `g2-p2-ddl-diff.json` compares each census expression with the
  live-built table DDL at `ba6ca8bc`: 18/18 identical
  (whitespace-normalized). The 9 legacy-archive CHECKs are out of scope
  (G2-P4, deferred).

## 6. D1 notes (verified while building this probe)

- D1 error texts (single-statement `run()`): `D1_ERROR: CHECK
  constraint failed: <expr>: SQLITE_CONSTRAINT | cause: CHECK
  constraint failed: <expr>`. The expression text is identical to
  SQLite's (whitespace-normalized); the signature matcher recognises
  it. Example (CHK-06, D1): `D1_ERROR: CHECK constraint failed:
  typeof(authority_version) = 'integer' and authority_version between
  1 and 9007199254740991: SQLITE_CONSTRAINT | cause: ...`.
- D1 does **not** expose its SQLite version (`sqlite_version()` is
  unauthorized); the results record the Miniflare + workerd versions
  instead.
- `PRAGMA foreign_keys` reads 1 on D1 and `= OFF` is accepted but
  ineffective — FKs are always enforced.

## 7. Reproducible commands

```sh
cd tools/g2-p2
npm ci
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy npm run probe
# exit 0 iff all 18 PROVEN and schema verification passed
# npm run probe:sqlite-only   # SQLite side only (fast smoke test)
```

Requirements: Node v22.x first in PATH (`~/node-v22.23.1-linux-x64/bin`);
`npm ci` needs the proxy env vars intact; the Miniflare run needs them
cleared. The runner never mutates the fixture; it rebuilds the
experiment schema from this checkout's own migration modules and
verifies object SHA-256, the 127-FK inventory, all 18 CHECK expressions
in the live DDL, and the 37-trigger omission union before running any
probe.

## 8. Non-goals and next gate

- No production DDL or migration is modified; no BWH / remote D1 / DO
  access; no real keys; local synthetic data only.
- This probe closes C5-03-02 (the 18 guard-shielded CHECKs). It does
  not close C5-03 as a whole: G2-P3 (concurrent pagination, C5-03-08)
  is the next probe in the adjudicated sequence, and G2-P4 (legacy
  archive, C5-03-03) starts only if the target migration scope
  explicitly includes the archive table.
- This receipt is probe evidence only. It does not declare a T2 PASS,
  does not authorize production migration or deployment, and does not
  change the standing state: **T2 remains BLOCKED** until the C6
  independent acceptance (B10) adjudicates the full closeout.
