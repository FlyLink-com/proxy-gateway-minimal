# Stage 2 BWH → D1 source/export handoff and final migration gate (v1)

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: source_only_d1_stage2_bwh_export_handoff
  superseded_by: null
  last_verified_at: 2026-11-20
  production_authority: false
```

- Date: 2026-11-20.
- Worker stack in the original handoff: #894 → #895 → #897 → #899.
- BWH source candidate: Draft PR #896 at `015fae70c47bb29534bc1c9b5fae15d5d2ea020b`.
- Production writer: BWH. D1 activation requires its own migration gate.

This is an implementable **next task contract for Muse**, not an instruction
to access BWH production, extract customer rows, or mutate remote E4. Do the
work on a separate offline Draft PR with synthetic fixtures and report the
exact head + independently executed tests.

## What Stage 2A already proves

- Read-only historical 70-table source-candidate inventory vs existing E4
  85-table schema with 68 shared, 2 source-only conditional Ads Consent
  tables and 17 target-only control/Agent tables. Column-name differences
  on `platform_edge_apply_receipts` (+6 on E4) and conditional legacy
  payment archive (`checkout_url`, `checkout_qr_code` excluded on E4).
  See `D1_STAGE2A_E4_SCHEMA_DIFF_20261120.md` and
  `evidence/D1_STAGE2A_E4_COLUMNS_METADATA_20261120.json`.
- A standalone Node-side offline runner for **local Miniflare only**,
  exactly two synthetic parent/child business tables, strict `s2s-`
  fixtures, T2-sensitive fields blocked, atomic batch + checkpoint log,
  deterministic replay and per-row/namespace reconciliation.
- The source `source-delta.mjs` in Muse PR #896 enumerates PK and
  fingerprints of inserted/updated/deleted rows **without payloads**.
  That is sufficient for change detection, NOT sufficient to construct
  target row INSERT/UPDATE mutations.

## Required source-side additions (Muse PR, offline only)

1. **Manifest and source identity.** At a pinned source commit, verify
   the full `platform_schema_migrations` ledger and all **19** current
   migration IDs/checksums, including conditional object presence.
   Produce a consistent immutable synthetic WAL snapshot and metadata:
   `sourceSnapshotId`, source schema digest, exact DB-boundary identity,
   source migration ledger digest, mapping version, snapshot hash,
   source authority+epoch and expected table list. Don't equate
   historical 70/820 candidate counts to observed production counts.
2. **Safe export row batches.** For each explicitly owner-approved
   table/column mapping, return canonical, bounded, PK-ordered synthetic
   row payloads plus a stable page identity: table, full PK tuple,
   starting/ending PK, row count, approved-column list, byte length,
   canonical content hash and checkpoint/continuation token.
   Validate the complete field disposition *before* any data leaves
   the source: KEEP/TRANSFORM/CONDITIONAL/EXTERNALIZE/DEFER is a policy
   decision, not something inferred from a same-named D1 column.
   Do not use naive per-table OFFSET pagination over a changing DB.
3. **Sensitive-field exclusion.** Never include raw email/PII,
   password or TOTP secrets, raw edge credential material, payment
   checkout URLs/QR capabilities, third-party subscription data, or
   retained credential blobs. Transform or defer only under the
   approved T2 owner contracts; plain SHA-256 of low-entropy PII is
   not accepted anonymization. No real HMAC/crypto key material in
   D1, fixtures, logs, payload receipts or repository.
4. **Deletion/incremental manifest.** Emit insert/update/delete
   changes since a *durable, ordered* high-water mark, including
   tombstones/deleted PKs. Prove ordering and gap detection across
   restarts, journal truncation, callbacks, background writers and
   replays. Existing fingerprint-only diffs have **no guaranteed
   source transaction order**; do not describe them as live CDC.
5. **U-F18 credential-only reconciliation.** The existing fingerprint
   intentionally hides credential values; `platform_portal_edge_credentials`
   lacks `updated_at`. Implement a separate source-side
   tamper-evident/opaque-version comparison or other approved custody
   protocol to detect same-row-count credential rotations without
   leaking sensitive value bytes to D1. Until independently reviewed,
   this is a **cutover blocker**; do not claim source/target parity.
6. **Freeze execution and drain.** Coordinate all remaining
   unfenced U-F1..U-F18 / U-01..U-10 writer entry points. A receipt
   from one `BEGIN IMMEDIATE` read proves no concurrent write lock
   during that read, *not* scheduler quiescence, completed async
   callbacks, durable high-watermark completeness or a safe
   cross-system freeze. Build separate positive receipts for these.
7. **Crash and integrity tests.** Add tests with cross-connection
   WAL readers/writers, crashed export between pages, same PK
   modified after checkpoint, missing/deleted table, silent
   credential-only change, duplicate/resorted callbacks, large
   batches bounded by D1 limits, FK parent-before-child and reverse
   delete ordering, and a malicious manifest using an unapproved
   column. Fail closed before cross-system apply.

## Matching D1-side follow-ups (Worker/G6 program)

- Extend the reviewed **2-table local rehearsal** to all approved
  target tables, adding cross-table FK DAG ordering, fully specified
  column transformation functions and CHECK/unique/trigger parity.
- Keep migration-run provenance separate from Wrangler
  `d1_migrations` and source `platform_schema_migrations`.
- Enforce a stable run ID + immutable snapshot, page hash and table
  mapping hash. Commit every D1 page and its checkpoint together.
  On replay, identical row is a no-op, divergent same-PK row rejects
  the entire page, and unsupported delete/field mapping rejects.
- Compare row counts and PK-set digests, materialized field hashes
  after approved transformations, FK/integrity probes, finance
  ledger and wallet invariants, and an independent deleted-row audit.
  Do not treat matching counts alone as a PASS.
- Test interrupted import, incomplete checkpoints, dual-run races,
  missing/reordered pages, wrong schema/epoch, poisoned payload,
  cryptographic hash mismatch, and recovery to a known immutable
  checkpoint. Target E4/remote imports remain **disabled** until G6
  offline and T2-C1..C6 evidence is independently reviewed.
- Run shadow read only via safe **SELECT-only** interfaces. G4
  `GET /v1/agent/desired-state` is *write-bearing* and cannot be
  used as a side-effect-free shadow read.

## Acceptance criteria for Stage 2 (not yet met)

A full Stage 2 completion receipt must contain: exact signed-off
T2 field dispositions, reproducible 19-migration source ledger,
approved source→target schema/column map, canonical snapshot manifest,
all-table synthetic replay with atomic checkpoints, deterministic
failure recovery, delete/credential reconciliation (U-F18), FK and
financial invariants, independent reviewer approval, and a verified
cutover-facing *no dual writer* handoff protocol.

**Do not do:** touch the other Cloudflare account, apply E4 DDL/import,
reconfigure a production Worker binding, freeze/stop live BWH, rotate
production credential material, enable `writerEpochForwarding` against
production, mark the Draft PRs Ready/merged, or activate `D1_ACTIVE`
based on these offline tests.
