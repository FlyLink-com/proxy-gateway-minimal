# Card 7 — seven-column synthetic round-trip evidence

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_card7_seven_column_roundtrip
  superseded_by: null
  last_verified_at: 2026-11-21
  production_authority: false
```

## Scope

This evidence is generated only from the in-memory 70-table synthetic fixture. The new test creates a second in-memory SQLite database as a stand-in target and executes the importer-generated D1 statement descriptors against that local database. It does not call the real E4 executor.

Run the focused test with:

    node --test server/tests/d1-card7-70-table-importer.test.mjs

## Seven-column coverage

| Field | Synthetic source values | Required readback behavior |
|---|---|---|
| platform_edge_agent_leases.released_at | NULL and ISO timestamp text | Preserve both values exactly |
| platform_edge_apply_receipts.node_ref | NULL and text reference | Preserve NULL and original text |
| platform_edge_apply_receipts.generation | NULL and text 007 | Preserve nullable TEXT and leading zero |
| platform_edge_apply_receipts.receipt_digest | NULL, UTF-8 text, and a BLOB | Preserve text bytes exactly; defer the entire BLOB row with D-1 |
| platform_edge_apply_receipts.reason_code | NULL and unlisted text | Preserve verbatim; do not enum-map |
| platform_edge_apply_receipts.listener_present | 0 and 1 | Preserve integer values exactly |
| platform_edge_apply_receipts.credential_count | 0 and 2147483647 | Preserve integer values without truncation or re-defaulting |

## Evidence emitted by the test

- Per-table source, target, and deferred counts.
- Per-table source/target hashes and row fingerprints.
- A checkpoint for each table. The lease checkpoint is LOADED; the receipt checkpoint remains PENDING because one of three source rows is deferred.
- An evidence SHA-256.
- An explicit independent-review receipt status of PENDING_INDEPENDENT_REVIEW. The implementation test does not self-sign or fabricate an independent review.

## Acceptance boundaries

- A successful local round-trip proves only that the synthetic source fixture, field transforms, generated statement descriptors, and in-memory target readback preserve the seven values.
- The BLOB receipt_digest case must defer the entire row; no truncation, coercion, or re-hashing is allowed.
- The real E4 executor remains disconnected and must continue to fail closed.
- No real BWH rows are read, no E4/D1 writes are made, and no production credentials, tokens, network clients, deployment, or cutover are involved.
- Independent review is still required before the seven-column synthetic acceptance can be marked complete.