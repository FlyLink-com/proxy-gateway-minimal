# Full metering connection retention and capacity recovery

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: full_metering_retention_recovery
  superseded_by: null
  last_verified_at: 2026-09-12
  production_authority: false
```

Risk: B source core / A production recovery. One implementation PR.
`release_unit: control-plane-app`; `identity_impact: false` (no principal,
credential binding, resolver, runtime configuration or entitlement changes).

## Intent and observed failure

Production read-only inspection at 2026-09-12 12:48 UTC established that the
five-source collector failed on September 10 at 19:54 UTC with
`full_metering_payload_invalid`; its OnFailure unit stopped the timer. The
checkpoint was 33,539,446 bytes against a 33,554,432 byte limit. Japan TUIC
accounted for 88,864 retained connections, 88,790 closed. A zero-byte pending
temporary at the failure timestamp and no formal pending intent confirmed the
serialization-stage failure. The independent Singapore TUIC sidecar remained
healthy. These are dated observations, not current activation authority.

The operator authorized the minimum repair and requested automatic cleanup of
connection records older than one month. This implementation defines a month as
30 consecutive 24-hour days, evaluated against a successfully verified source
observation, not connection creation time or the browser clock.

## Contract

- Automatically expire only closed history strictly older than 30 days. Keep
  exact-boundary history and active connections, even when active for 30 days.
- Preserve cumulative usage, carry usage, sample IDs, ledger/rollups, account
  rights and the existing initial metering boundary. Cleanup itself never adds
  or subtracts metered bytes.
- Keep compact exact-hash closed-connection guards during retention. Reject
  reappearance within retention. After expiry, first observation establishes a
  zero-charge baseline; do not bill the old cumulative counter again.
- Separate the active-observation limit from retained-history capacity. Compact
  already-closed records rather than silently delete history younger than 30 days.
- Validate legacy state before a versioned conversion. Retain aggregate
  conversion evidence/original digests; do not claim an archived full payload
  remains reconstructible after authorized retention cleanup.
- Read legacy journal envelopes, and recover any existing durable intent before
  new observations. Small envelopes stay legacy JSON; large envelopes use the
  explicit `GCCFMJ2\n` header, uint64-LE decoded size, and gzip body. The logical
  version-1 context/envelope digest and write-ahead replay sequence do not change.
- Bound legacy JSON at 32 MiB, new stored files at 128 MiB and decoded/canonical
  data at 256 MiB. Decompression enforces the declared size as a hard output
  limit, independently verifies actual size and the logical digest/context.
- Finish encoding before creating a temporary file; prepare pending and
  checkpoint bytes before applying the batch. Do not create orphan files on
  serialization failure or discard an intent after database failure.
- Scope/generation transition records retain receipts and before/after digests,
  not duplicate full history snapshots. `beforePayloadDigest` and
  `afterPayloadDigest` cover complete state objects; receipt state digests retain
  their existing definition over the internal payload excluding `stateDigest`.

## Validation and production continuation checklist

1. TDD: 30-day before/exact/after boundary, active/retired/generation history,
   first post-expiry baseline, replay rejection, accounting preservation and old
   state conversion. Above-100k history and a roughly 30-day synthetic workload
   must be exercised; 88k alone is not long-term capacity evidence.
2. Journal: above-32-MiB payload, old/new mixed recovery, all three crash stages,
   digest/context/corruption/length/decompression checks, no orphan on failed
   serialization, real disposable SQLite sample/rollup conservation.
3. Run touched-suite and full server tests. Linux native filesystem/fsync and
   runtime validation must be recorded separately from Windows results. The
   existing nonproduction Aliyun host is preferred when reachable; a local owned
   Linux fixture is a valid source validation fallback, not production proof.
4. Fresh production aggregate inventory must establish installed helper and unit
   identities, stopped main/legacy writers, healthy sidecar/application,
   checkpoint validity, pending/lock status, protected storage headroom and exact
   deployment artifact. Do not replay the September 8 activation package.
5. Before any production mutation, create/verify a fresh host-local online
   database backup and preserve the stopped collector's journal/config/unit
   preimages. No production database, raw journal, material or secrets leave the
   host. Do not disturb the independent sidecar or restart application/nodes.
6. Promote only the immutable helper/import closure and the exact collector
   command binding. Keep configuration, initial baseline and runtime inputs.
   Run source preflight and read-only old-state compatibility checks; enable the
   existing main timer once, then observe distinct successful natural runs and
   aggregate sample progress.
7. On failure stop the main timer and preserve journal/pending/committed samples.
   Never restore the whole database over live writes or run old code against a
   converted state. Roll back helper/unit only before a new-format commit; after
   conversion retain the compatible helper stopped for diagnosis. Do not
   enable the retired legacy collector.
8. Record exact source/artifact, backup, mutation, validation and final timer state
   in a Deploy Note only after execution. This document alone proves no deployment.

Normal continuation may account for provable increments after the original
activation baseline, including surviving cumulative counters across a pause.
This is not estimated historical backfill, a new baseline, or a Coins debit.
Missing closed-connection tail bytes and cross-cycle intervals remain subject
to the existing conservative accounting rules.

## Source validation recorded on 2026-09-12

- Counter TDD red: initial retention tests 1 passed / 8 failed; journal capacity
  red: 8 passed / 6 failed before implementation.
- Isolated Ubuntu 24.04, Node 22.23.1, real Linux `better-sqlite3`: all 13
  `full-metering*.test.mjs` files passed, 284 passed / 0 failed / 0 skipped.
  This includes three SQLite recovery stages with automatic retention,
  after-expiry zero-charge baseline, and preservation of rights and rollups.
- The 1,330,000-history workload retained 53,200,000 packed bytes (70,933,336
  base64 bytes), then expired correctly: 3.55 seconds wall time, peak RSS
  580,600 KiB, no swap, exit 0. This is fixture peak memory, not a daemon limit.
- Fresh aggregate host inspection at 13:11 UTC found 7,293,591,552 available
  memory bytes, no collector MemoryMax cap, and over 142 GB free storage.
  No collector or application was started/restarted during inspection.
- Windows full suite initially reported 5,080 total / 5,012 passed / 12 failed /
  56 skipped. One failure was this new document's missing metadata (corrected);
  the remaining failures involve unrelated platform/path/CRLF/source-contract
  checks and are not represented as a green full suite. Linux full-suite
  results and release state will be recorded after they actually complete.

Local validation logs are under the ignored task artifact directory
`.codex-artifacts/metering-retention-linux-20260912-01/`. Code-review and fixture
results do not assert that production metering has resumed.
