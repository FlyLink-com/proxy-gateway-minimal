# D1 G2-P3 Pagination Concurrency Receipt v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_g2_p3_pagination_concurrency_receipt
  superseded_by: null
  last_verified_at: 2026-11-15
  production_authority: false
```

Status: **EVIDENCE COMPLETE for C5-03-08 (probe evidence only)**.
This document records probe results only. It does not declare a T2
PASS, does not authorize production migration, deployment, BWH
access, remote D1/DO access, or production switching. Production
remains pr799.

## 0. Verdict summary

| Case | Workload | Proven | Total |
| --- | --- | --- | --- |
| L1 | inserts with NEWER keys | 1 | 1 |
| L2 | inserts with OLDER keys | 1 | 1 |
| L3 | inserts INTERLEAVED in the key range | 1 | 1 |
| L4 | inserts inside a same-timestamp tie group | 1 | 1 |
| L5 | key-changing UPDATE, not-yet-read row (miss boundary) | 1 | 1 |
| L6 | key-changing UPDATE, already-read row (duplicate boundary) | 1 | 1 |
| L7 | DELETE of a not-yet-read row (absent boundary) | 1 | 1 |
| L8 | control: no concurrent writes | 1 | 1 |
| L9 | MIXED workload (newer + older + tie inserts + delete) | 1 | 1 |
| **Total** | | **9** | **9** |

- **UNPROVEN: 0. FAILED: 0.**
- Every case is PROVEN on **both** engines (better-sqlite3 / SQLite
  and local Miniflare D1): the returned frozen rows match the
  declared expectation exactly (missed / duplicated / absent), every
  returned extra is a row the schedule inserted, the full page
  sequences are byte-identical across engines, the page sequences
  match the independent JavaScript simulation, and the terminal ledger
  states are byte-identical across engines.
- Schema verification PASSED before any probe ran (see §2).
- The claim proven is: **the paginated reader returns every record
  that existed before the cutoff watermark exactly once — no missed,
  no duplicated — under concurrent inserts** (L1–L4, L8, L9), and the
  mechanism boundaries for key-changing updates and deletes are
  documented exactly (L5–L7). The exactly-once claim for production
  rests on (a) the insert-only proof **plus** (b) the ledger
  immutability guards (see §5).

## 1. Baselines, versions, hashes

- **Source baseline (fixture frozen at)**: master `b4bac535`
  ("test(g2-p2): CHECK de-guarding probe for the 18 guard-shielded
  CHECKs (C5-03-02) (#878)", merged 2026-11-14T16:19:21Z). The
  branch was created on `446d125a` (PR #876) and rebased onto
  `b4bac535` after #878 merged; the #878 delta is tools/g2-p2 + docs
  only and does not touch the pagination code. The schema trial was
  re-executed at `b4bac535` (identical object hashes) and the full
  dual-engine run was executed at `b4bac535`.
- **Historical G2 test baseline**: master
  `63082bae5d980c3905d6e7405329b19e6c4e38ac`
  (stage-7 pagination evidence, `pagination-results.json` SHA-256
  `c26541f857f5b85352893c67c74a10fd7255dc3d4aac62fb753d3f2dea33f435`:
  26 data-layer checks dual-engine consistent + 13 application-layer
  cursor checks separately verified, NOT engine evidence). Stage 7
  explicitly excluded concurrent writes — that exclusion is exactly
  the gap this probe closes for the ledger.
- **Production**: pr799 (unchanged; every merge is source-only).
- **Data**: local synthetic data only. No remote Cloudflare, BWH, or
  production connection was used; no real keys; no production data.
  Seed is the stage-7 seed verbatim (112 statements: 60 ledger rows
  in wallet `wallet-pg-1`, 48 accounts).

| Artifact | SHA-256 |
| --- | --- |
| `tools/g2-p3/g2-p3-fixture.json` | `930838beddffb72f1c5c541783d6b78b1646d0e160ecafd3801516a5091575eb` |
| `tools/g2-p3/g2-p3-results.json` | `725b04d6207899657764e04e7fb918904d22bfca24610eb699a14da735a5372c` |
| `tools/g2-p3/g2-p3-ddl-diff.json` | `3e2c4db16a31690bf64ea0f3bb8b7ce1bccd9e4089a2b467d3ccc75e06121f9e` |

- Experiment-schema object SHA-256:
  `3055172e2dc4b6987826ab3d25fd855642ee007f54db8b630d20011f20b27c1c`
  (74 tables / 94 indexes / 91 triggers built / 33 omitted / 58
  remaining; 128 FK pragma rows; 19 ledger rows in the migration
  census).
- Full-schema object SHA-256 (0 omitted):
  `6e98d3f1c8e5e622f94dd9fa488f54adca4e64e5b34c1207e54fd19ec68b4a70`
  (identical to P1's and P2's — no migration changed).
- Ledger table SQL SHA-256:
  `0d03a24329841a28e43a7ce881ae924fa70f57b98ab64453d865d7d974080313`.
- Watermark SHA-256:
  `622cf067adfc090ac43e39c5578451521d8d77c7787f453da145bbe6bc74a316`
  (frozen ordered list of the 60 `(occurred_at, entry_ref)` pairs at
  traversal start).
- Ledger pagination SQL (whitespace-normalized) SHA-256:
  `94b4ca3172d82ab01b7cb0ecb8f28bdbd9e7018c73e33e11f41602e47ef01aac`
  (identical to the stage-7 frozen copy — see §2).
- Versions: Node v22.23.1, better-sqlite3 12.10.0, SQLite 3.53.1,
  Miniflare 4.20251109.0, workerd 1.20251109.0. D1's SQLite version is
  not exposed (`sqlite_version()` is unauthorized on D1) — recorded
  as a limitation, not assumed.

## 2. Schema verification (runner, before any probe)

All five checks passed before any case ran:

1. **Omission union matches the builder**: 33 triggers =
   P1's 31 + the 2 ledger immutability guards
   (`platform_coin_ledger_entries_immutable_update`,
   `platform_coin_ledger_entries_immutable_delete`). All 33 verified
   RAISE-only by a body-scoped check (trigger body between BEGIN/END,
   `raise(abort, '…')` stripped, no `insert into` / `update X set` /
   `delete from` / `replace into` remains): **violations: none**.
2. **Experiment-schema object SHA-256 matches the fixture**:
   `3055172e…` (see §1).
3. **Frozen LEDGER_SQL matches the live production source** at the
   baseline (whitespace-normalized): extracted from
   `server/services/platform/coin-wallet-store.mjs`
   `listLedgerEntries` (line 2936) and verified identical to the
   stage-7 frozen copy. The probe tests current production code, not
   a stale copy. See `tools/g2-p3/g2-p3-ddl-diff.json`
   (ledger `identicalNormalized: true`).
4. **Accounts directory SQL matches the stage-7 frozen copy after
   inlining the registration-source constant**: extracted from
   `server/services/platform/subscription-control-db.mjs`
   `listUserMonitorAccountDirectory` (line 2024) +
   `USER_MONITOR_REGISTRATION_SOURCE_SQL` (line 1997). The predicate,
   ORDER BY and LIMIT are identical; only the extraction into a named
   constant changed. See the ddl-diff file
   (accounts `identicalNormalizedAfterInlining: true`,
   SHA-256 `eb8f4a26…`).
5. **Watermark recomputation matches the fixture**: the frozen seed
   re-run on a throwaway SQLite DB produces the same 60 ordered keys
   and the same SHA-256 (`622cf067…`).

## 3. Method (cutoff watermark + interleaved traversal)

**Production read path under test** (baseline `b4bac535`):

- Store layer: `coin-wallet-store.mjs` `listLedgerEntries`
  (line 2936): `select ledger.*, lot.coin_type as coin_type from
  platform_coin_ledger_entries as ledger left join
  platform_coin_lots as lot on lot.lot_ref = ledger.lot_ref and
  lot.wallet_ref = ledger.wallet_ref where ledger.wallet_ref = ? and
  (? is null or ledger.occurred_at < ? or (ledger.occurred_at = ?
  and ledger.entry_ref < ?)) order by ledger.occurred_at desc,
  ledger.entry_ref desc limit ?`. Limit default 100, hard cap
  `MAX_LEDGER_PAGE_SIZE = 500` (line 21); a cursor must supply both
  `afterOccurredAt` and `afterEntryRef` or neither.
- Service layer: `admin-user-monitor.mjs` `readCoins` (line 425):
  `parseLimit` (default limit, `MAX_LIMIT = 100`), fetch `limit + 1`,
  `hasMore = rows.length > limit`, page = first `limit`,
  `nextCursor` = last page row's `(occurred_at, entry_ref)` tuple
  (base64url-encoded) or null.

**Probe parameters**: page size 5 (12 static pages over the 60
frozen rows); seed = stage-7 shape (40 entries at
`2026-03-05T12:00:00.000Z`, refs `le-pg-1001..1040`; 20 at
`2026-02-05T12:00:00.000Z`, refs `le-pg-2001..2020`; wallet
`wallet-pg-1`, lot `lot-pg-1`, receipt `wop-pg-1`, origin
`origin-pg-1`).

**Watermark definition**: W = the set of `(occurred_at, entry_ref)`
pairs present in the wallet's ledger at traversal start. A row is
"before the watermark" iff its pair is in W. The watermark is a
frozen JSON artifact in the fixture (keys + SHA-256); later writes
cannot change it. Both engines must agree with it before the
traversal starts (mismatch = case FAILED fast).

**Interleaving**: after page N is fetched, the writer batch
scheduled at `afterPage: N` is applied — synchronously, in the same
process, between the reader's page requests. That is exactly the
hazard window of a real sequential reader while writers commit
between its requests. It is **not** OS-thread parallelism and **not**
multi-copy production concurrency (local D1 is a single copy). The
same schedule runs on both engines; each case uses a fresh DB pair.

**Expectations**: declared per case from first principles, then
checked against an **independent JavaScript simulation** of the
keyset semantics (sort `(occurred_at DESC, entry_ref DESC)`, keyset
predicate, limit+1 paging, schedule applied between pages) **before
freezing**. The generator fails loudly on any disagreement — it
caught one real expectation error during development (L3: an insert
scheduled after page 10 sorts ahead of the page-10 cursor and is
never returned; the schedule was moved to after page 8 — see the run
log). Expectations are never fitted to engine output.

**Verdict rules**: PROVEN iff, on BOTH engines, the returned frozen
rows match the declared expectation exactly, every returned extra is
a row the schedule inserted, the full page sequences are
byte-identical across engines, and the page sequences match the
simulation. FAILED = expectation mismatch (exact deviation
recorded). UNPROVEN = a case could not be executed/measured.
Unexecuted is never filled PASS.

**Seed-application note**: the stage-7 seed's statement order relies
on a `DEFERRABLE INITIALLY DEFERRED` FK
(`platform_coin_credit_origins.lot_ref → platform_coin_lots`, lot
inserted after the origin row), so the runner applies the seed
inside one transaction on SQLite and one D1 batch on the other
engine. Per-statement autocommit fails with a foreign-key error at
statement 51 — that is a property of the seed order, not of the
schema, and the receipt records it so the next reader does not
re-discover it.

## 4. Per-case results

Page size 5 in all cases. "Pages" = number of pages the reader
fetched. "Terminal rows" = ledger rows in the final dump (60 frozen
± inserts/deletes). Terminal states (full ledger dump + seed-parent
row counts) are byte-identical across engines in every case; seed
parents are untouched (48 accounts, 1 credit origin, 1 lot, 1
operation receipt, 1 wallet) in every case.

| Case | Pages | Frozen returned | Missed | Duplicated | Extras returned | Terminal rows |
| --- | --- | --- | --- | --- | --- | --- |
| L1 insert-newer | 12 | 60/60 once | — | — | none | 64 |
| L2 insert-older | 13 | 60/60 once | — | — | 9104, 9103, 9102, 9101 (tail pages) | 64 |
| L3 insert-mid | 13 | 60/60 once | — | — | 9204, 9203, 9202, 9201 (mid pages) | 64 |
| L4 insert-tie | 13 | 60/60 once | — | — | 1010a only | 63 |
| L5 update-miss | 12 | 59/60 | le-pg-1030 | — | none | 60 |
| L6 update-dup | 13 | 60/60 + 1 dup | — | le-pg-1040 ×2 | none | 60 |
| L7 delete-absent | 12 | 59/60 | le-pg-1020 (deleted) | — | none | 59 |
| L8 control | 12 | 60/60 once | — | — | none | 60 |
| L9 mixed | 13 | 59/60 | le-pg-1020 (deleted) | — | 1010a, 9201, 9101 | 63 |

Notes per case:

- **L1**: four newer inserts (`2026-03-06`, refs `le-pg-9001..9004`,
  after pages 1/4/7/10) sort above every cursor, so the traversal
  never returns them. Frozen set exactly once.
- **L2**: four older inserts (`2026-02-04`, refs `le-pg-9101..9104`)
  sort after every frozen row and appear on tail pages as
  post-watermark extras. Frozen set exactly once.
- **L3**: four interleaved inserts (`2026-02-20`, refs
  `le-pg-9201..9204`, after pages 1/3/5/8) sort between the two
  frozen tie groups and appear on mid pages. Frozen set exactly
  once.
- **L4**: three tie-group inserts at `2026-03-05` (refs
  `le-pg-1010a/1020a/1030a`, after pages 2/5/8). Only `le-pg-1010a`
  is returned: it was inserted while its key was still behind the
  reader's cursor; `1020a`/`1030a` were inserted after the reader
  had already passed their key positions, so they sort ahead of the
  cursor and are never returned. Frozen set exactly once either way.
  This is the cursor-crossing rule: whether a concurrent insert is
  seen depends on the cursor at insert time, not only on its key.
- **L5**: `le-pg-1030` (static page 3) had its `occurred_at` moved
  to `2026-03-06` after page 1 — newer than the page-1 cursor — so
  it is never returned: exactly that row MISSED. De-guarded only.
- **L6**: `le-pg-1040` (read on page 1) had its `occurred_at` moved
  to `2026-02-04` after page 1 — older than the page-1 cursor — so
  it is returned AGAIN on the tail page: exactly that row
  DUPLICATED. De-guarded only.
- **L7**: `le-pg-1020` (static page 5) was deleted after page 1, so
  it is never returned: ABSENT (recorded as missed-by-deletion, not
  as a pagination miss). De-guarded only.
- **L8**: control, no writes: 12 pages, frozen set exactly once.
  Reproduces the stage-7 class-2 traversal on the new baseline.
- **L9**: mixed (newer insert after page 1, older after page 2, tie
  insert after page 3, delete of `le-pg-1020` after page 4, mid
  insert after page 5): the newer insert is never returned; the
  older, tie and mid inserts are returned as extras in key order;
  the deleted row is absent; every other frozen row appears exactly
  once.

## 5. Production facts that bound the claim

Verified by reading source and DDL at `b4bac535` (recorded here so
the claim's scope is exact):

1. `platform_coin_ledger_entries` has **two unconditional RAISE-only
   guards**: `platform_coin_ledger_entries_immutable_update` and
   `platform_coin_ledger_entries_immutable_delete` (both `select
   raise(abort, 'coin_ledger_immutable')`). In production, ledger
   entries can NEVER be updated or deleted. The realistic
   concurrent-write shape is therefore INSERT-ONLY; L5/L6/L7 ran in
   the de-guarded experiment schema and document the mechanism
   boundary. The exactly-once claim for production rests on (a) the
   insert-only proof (L1–L4, L8, L9) **plus** (b) these guards.
2. **No triggers at all on `platform_accounts`** (verified in the
   built schema). The directory declaration states this honestly —
   see the separate declaration document.
3. **No FKs reference `platform_coin_ledger_entries`** (verified).
   A ledger-row delete is blocked only by the immutable_delete
   guard, which the experiment schema omits.
4. Ledger page index
   `platform_coin_ledger_entries_wallet_page_idx (wallet_ref,
   occurred_at DESC, entry_ref DESC)` is present.
5. The production ledger query at `b4bac535` is byte-identical
   (whitespace-normalized) to the stage-7 frozen copy (§2.3). The
   accounts query is identical after inlining one constant (§2.4).

## 6. Limitations (read before reusing this evidence)

1. **Local single-copy evidence only.** Both engines are local
   (better-sqlite3/SQLite 3.53.1 ↔ local Miniflare D1). Production
   D1 is multi-copy; the bookmark/replication semantics of a
   production multi-copy read path are NOT proven here. A future read
   path depending on production snapshot semantics must verify
   separately (C5-03-06, ACCEPT RESIDUAL — unchanged by this probe).
2. **Interleaving is deterministic, not OS-thread parallel.** Writer
   batches run between the reader's page requests in one process.
   That is the exact hazard window for a sequential reader, but it
   does not model lock contention, write-write conflicts, or
   transaction aborts.
3. **No snapshot isolation claim.** Each page reads the latest
   committed state; there is no cross-page snapshot. Post-watermark
   rows CAN appear mid-traversal (L2/L3/L4/L9) — the claim is
   exactly-once for the **pre-watermark** set, not a frozen snapshot
   of the whole table.
4. **Keyset exactly-once depends on immutable sort keys.** If a
   row's `(occurred_at, entry_ref)` changes mid-traversal it can be
   missed (L5) or duplicated (L6); if it is deleted it is absent
   (L7). For the ledger this is guarded in production (§5.1). For
   any other table the same protection must be proven separately —
   the account directory has no such guard (§5.2; see the separate
   declaration).
5. **D1's SQLite version is not exposed** (`sqlite_version()` is
   unauthorized on D1). The D1 side is identified by Miniflare
   4.20251109.0 + workerd 1.20251109.0, not by a SQLite version
   number.
6. **Page size 5 is a probe parameter**, not production's (service
   default 100, store cap 500). The mechanism is page-size
   independent (the cursor predicate is the same), but the exact page
   counts in §4 are specific to size 5.

## 7. Reproducible commands

```sh
cd tools/g2-p3
npm ci
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy npm run probe
# exit 0 iff all 9 PROVEN and schema verification passed
# npm run probe:sqlite-only   # SQLite side only (fast smoke test)
```

## 8. Non-goals and next gate

- No production code changed; no server behavior changed; no
  production data, keys, or remote access involved.
- The account directory is **declared, not probed**, in this batch:
  see `docs/D1_G2_P3_ACCOUNT_DIRECTORY_CONSISTENCY_DECLARATION_V1.md`.
- C5-03-08 is now **evidence-complete for the ledger keyset
  mechanism**; the residual that remains is the production
  multi-copy snapshot semantics (item 06, ACCEPT RESIDUAL) and the
  directory's concurrent behavior (declared, not executed).
- G2-P4 stays deferred per Yi's 2026-11-14 ruling (Archive
  conditional — only if the target scope explicitly includes the
  archive tables).
- Next gate: independent review of this batch (fresh reviewer,
  exact-head verification), then Yi's merge authorization. This
  document does not request either.
