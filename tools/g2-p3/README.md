# G2-P3: concurrent pagination semantics probe (C5-03-08)

Ledger pagination under concurrent writes, for the C5-03 item 08
residual: "并发写入下的快照语义完全未验；本地单副本证据强度有限"
(stage-7 explicitly excluded concurrent writes).

## What it proves

A paginated reader walking the Coins ledger with the **verbatim
production `listLedgerEntries` SQL** + the service-layer limit+1 /
hasMore / nextCursor logic returns every record that existed before
the traversal started (the **cutoff watermark**) **exactly once** —
no missed, no duplicated — under nine concurrent-write workloads,
on **both** engines (better-sqlite3 / SQLite ↔ local Miniflare D1),
with identical page sequences on both engines and agreement with an
independent JavaScript simulation of the keyset semantics.

What happens to records written AT/AFTER the watermark is recorded
case by case (never silently counted either way):

- inserts with keys **newer** than the cursor: never returned;
- inserts with keys **older** than the cursor: returned on tail pages
  as post-watermark extras;
- inserts **interleaved** in the key range / inside a tie group:
  returned iff their key is still behind the reader's cursor when
  they land (L3/L4 document the cursor-crossing rule);
- a **key-changing UPDATE** of a not-yet-read row: that row is MISSED
  (L5); of an already-read row: that row is DUPLICATED (L6);
- a **DELETE** of a not-yet-read row: that row is ABSENT (L7).

L5/L6/L7 run in the de-guarded experiment schema: production carries
two unconditional RAISE-only guards
(`platform_coin_ledger_entries_immutable_update` /
`..._immutable_delete`) that make those writes unreachable. The
exactly-once claim for production therefore rests on (a) the
insert-only proof (L1–L4, L8, L9) **plus** (b) the immutability
guards. The guards themselves are P1/P2-proven RAISE-only bodies
(see the receipt §2).

## The watermark

The watermark is the frozen ordered list of the 60
`(occurred_at, entry_ref)` pairs present in the wallet's ledger at
traversal start, plus its SHA-256 (`622cf067…`). It is a frozen JSON
artifact in the fixture — later writes cannot change it — and the
runner recomputes it from each engine's pre-traversal scan and
requires both engines to agree with the fixture before the traversal
starts.

## Concurrency model (read this before reusing the result)

The writer batches are applied **synchronously between the reader's
page requests**, in the same process, at fixed page boundaries. That
is exactly the hazard window of a real sequential reader while
writers commit between its requests. It is **not** OS-thread
parallelism and **not** multi-copy D1 production concurrency: local
D1 is a single copy. The receipt states this limitation plainly.
The claim proven here is about the **keyset mechanism** (cursor
predicate + sort order), not about a production replication topology.

## Layout

- `g2-p3-fixture.json` — frozen fixture: stage-7 seed verbatim (112
  statements), verbatim production LEDGER_SQL, the 60-key watermark,
  and the 9 cases with writer schedules + declared expectations.
  Every declared expectation was checked against the independent
  simulation **before** freezing; the generator fails loudly on any
  disagreement (it caught one real expectation error in L3 during
  development — see the run log).
- `g2-p3-run.mjs` — the runner. Rebuilds the experiment schema from
  this checkout's own migration modules, verifies it (omission union,
  object SHA, ledger SQL vs live source, accounts SQL vs stage-7
  frozen copy, watermark recomputation) **before** any probe, then
  runs all 9 cases on both engines. Exit 0 iff all PROVEN and
  verification passed.
- `g2-p3-results.json` — per-case results (pages, analysis,
  simulation agreement, terminal states).
- `g2-p3-ddl-diff.json` — stage-7 frozen pagination SQL vs live SQL
  at the baseline (ledger identical; accounts identical after
  inlining the registration-source constant).
- `lib/build-control-schema.mjs`, `lib/engines.mjs` — copied from the
  P1/P2 pattern (dual-engine harness: Miniflare named DBs + persist
  dir, never `":memory:"` bindings).
- `lib/traversal.mjs` — the service-shaped page driver, the
  independent keyset simulation, and the returned-ref analysis.
- `package.json`, `package-lock.json` — better-sqlite3 12.10.0,
  miniflare 4.20251109.0.

The fixture generator lives in scratch (not part of the PR); its
checks are described in the run log.

## How to run

```sh
cd tools/g2-p3
npm ci
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy npm run probe
# npm run probe:sqlite-only   # SQLite side only (fast smoke test)
```

Clear the proxy env vars for the Miniflare/workerd channel (the
egress proxy breaks it). The run takes ~20 s and writes
`g2-p3-results.json` + `g2-p3-ddl-diff.json` in place.

## Results (baseline `b4bac535`)

**9/9 PROVEN, 0 FAILED, 0 UNPROVEN.** Schema verification PASSED.
See `docs/D1_G2_P3_PAGINATION_CONCURRENCY_RECEIPT_V1.md` for the
full receipt, and
`docs/D1_G2_P3_ACCOUNT_DIRECTORY_CONSISTENCY_DECLARATION_V1.md` for
the separate account-directory consistency declaration (the directory
was **not** executed under concurrent writes in this batch — the
declaration says what its read path provides and what it does not).

## Non-goals

- No production code changed; no server behavior changed.
- No snapshot-isolation / repeatable-read claim: each page reads the
  latest committed state; there is no cross-page snapshot.
- No multi-copy / production-concurrency evidence (local single-copy
  D1 only).
- The account directory is declared, not probed, in this batch.
