# Stage 2 — Muse BWH safe source export / D1 reconciliation handoff (draft)

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: source_only_d1_stage2_bwh_export_d1_reconciliation_handoff
  superseded_by: null
  last_verified_at: 2026-11-20
  production_authority: false
```

Date: 2026-11-20. Worker Draft PR #898 (stacked on #897/#895/#894).
Muse BWH predecessor Draft PR #896 at
`015fae70c47bb29534bc1c9b5fae15d5d2ea020b`.
All source export implementation is a **new task**, not claimed to be
in PR #896. This contract is source-code guidance and does not authorize
production BWH access, export, freeze, or E4 mutation.

## Stage 2A actually delivered (synthetic-only)

- `workers/control-plane/test/support/stage2-offline-migration.mjs`:
  immutable manifest, 25-record bounded pages, SHA256 replay digest,
  monotone table-local sequence/checkpoint CAS, row-fingerprint
  compare-before-update/delete, atomic D1 batch/rollback, digest-only
  reconciliation. `createEpochFencedD1` wraps every write.
- `workers/control-plane/test/support/stage2-synthetic-source.mjs`:
  select-only keyset page reader, initial-snapshot adapter; only synthetic
  `platform_accounts` and `platform_entitlements` allowlisted fields
  can be transferred, never raw identity/credential/payment values.
- `workers/control-plane/test/fixtures/stage2-offline-inbox.sql`:
  isolated test-only D1 scratch tables and fail-closed sequence/fingerprint
  triggers. **Not** a Wrangler or remote E4 migration file.
- Every row identifier must begin `synth-`; no customer rows accepted.
  No background traffic or public HTTP migration endpoint.
- `docs/D1_STAGE2_E4_SCHEMA_DIFF_20261120.md` pins the read-only
  E4 object comparison and warns on unapproved T2 dispositions.

The implementation is stored under `test/support`, not the Worker `src` module tree, so the standard Worker source upload must not include it. No route invokes it.\n\nThis is a bounded **engineering rehearsal**, not a production-eligible
target loader. Its SHA256 payload binds retries and detects corruption,
but is **not a sender-authentication signature**.

## Required source/target wire contract for Stage 2B

The eventual independently reviewed source exporter must emit a
cryptographically authenticated envelope (the agent transport's scoped
Bearer token is *not* a substitute for a signed export manifest):

`manifest`:
- `runId`, immutable `sourceSnapshotId`, source database identity
  (opaque, never filename-derived), exact source commit and complete
  source-migration IDs/checksums;
- `sourceSchemaSha256`, approved `mappingSha256`,
  `targetSchemaSha256`, field/custody policy version;
- explicit ordered table allowlist, exclusions, projection version,
  immutable page sequence contract, source high-watermark;
- expiration/nonce/replay domain and authenticated signature or
  equivalent trusted service-binding identity.

`batch`:
- table, strictly increasing sequence, `startAfterPk` (null first
  batch), bounded sorted rows/changes, `lastPk` or derivable last PK;
- operation `upsert` or `delete`, previous projected-row SHA256
  for updates/deletes (null for first insertion), current approved
  projected row or explicit tombstone, payload SHA256;
- source identity + run ID included in authenticated digest domain;
  exact replay returns prior receipt, changed replay hard-fails;
- source/target checkpoint and applied batch commit **atomically**
  with the target row mutation, never asynchronous write-behind;
- source-side checkpoints for unavailable/deleted credential fields
  must be handled by *separate custody review*, not by inventing a
  credential digest or copying raw protected materials.

`receipt`:
- `runId`, manifest digest, table/sequence/last PK, applied vs replayed,
  row counts and digest; source PK/fingerprint reconciliation per table,
  FK/invariant and immutable financial ledger checks; sealed total
  reconciliation receipt after all expected tables are covered.

## Newer production-source discrepancy (Phase 6, 2026-11-17)

The project owner's Notion overview was updated on 2026-11-18
(https://app.notion.com/p/415dbee187838173ab58fb2cfec94475)
with Phase 6 production BWH **read-only** findings: 20 missing tables,
9 unapplied migrations, 2 reverse-drift tables, 3 tables outside the
old inventory, and unresolved ledger anomalies. Phase 6 concludes
**production migration NO-GO**; the existing read-only window is
closed. The 70-table historical source inventory is no longer a
production-schema census. Stage 2B source exporter must first reconcile
the exact observed pr799 schema and owner decisions (not just clone
the historical inventory), or remain entirely synthetic.

This PR neither re-runs Phase 6 SQL nor extends its closed production
read authorization. No production snapshot, row export or remote E4
write is allowed based on the Stage 2A test results.

## Muse source-side Stage 2B tasks

1. Review, in BWH repository source only, the approved first-D1 table
   boundary (`control.sqlite`, **not** `subscriptions.sqlite`,
   third-party source DB, or raw edge credential-material files).
2. Reconcile the historical 70-table and 820-field inventory to the
   exact source schema and E4's 85-table current target. The 2 optional
   ads-consent tables and 17 E4-only tables need explicit ownership.
3. Supply an immutable snapshot exporter: WAL-safe source snapshot,
   drained/fenced writers and consistent source migration ledger.
   `writer-freeze-receipt.mjs` currently **does not** prove drained
   schedulers or in-flight work; a real freeze coordinator is missing.
4. Implement bounded, read-only, keyset-paginated **approved-field**
   exports from frozen or immutable synthetic source fixtures.
   The existing `source-delta.mjs` emits only PK/fingerprints and **no
   row values**, so it is insufficient to populate target rows.
5. Implement deleted-row tombstones and projected-field hash continuity
   including the pre-update hash, without leaking credential-only
   material. U-F18 remains open and must not be silently counted as
   reconciled.
6. Independently test interrupted source pages, duplicated/corrupted
   signatures, deleted row replay, unapproved field attempts, PK and
   composite-PK ordering, journal replays and multi-run high-watermarks.
7. Review remaining unfenced BWH write-path inventory (U-F1..U-F18,
   U-01..U-10); do not start a real freeze or dual write.

## Review and production cutover criteria

Stage 2A offline rehearsal is accepted **only** when Miniflare CI
passes, synthetic-only SQL and table allowlist are proven, duplicate
batches/restarts/deltas/fingerprint conflicts roll back correctly, and
the E4 read-only schema report identifies all differences.

Stage 2 overall **cannot be marked production-ready** until:
- T2 owner-approved 70-to-target column transformations and credential/
  identity/payment custody, or explicit reviewed exclusions;
- target DDL with FK/UNIQUE/CHECK/trigger and migration-ledger parity;
- source snapshot/exporter and authenticated ingest implemented;
- checkpoint/resume under crash, full source/target reconciliation, no
  orphan rows or financial ledger mismatches;
- full BWH source writer fence and quiescence proof, U-F18 resolved;
- independent review and separate user-authorized production cutover
  gate; no D1_ACTIVE transition or direct BWH database commands before it.

Never confuse `BWH_ACTIVE` default Staging D1 or a local synthetic
`D1_ACTIVE` fixture with production writer handover.
