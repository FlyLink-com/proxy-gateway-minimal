# Stage 2A/B synthetic offline migration rehearsal — execution receipt

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: source_only_d1_stage2_synthetic_rehearsal_receipt
  superseded_by: null
  last_verified_at: 2026-11-20
  production_authority: false
```

Date: 2026-11-20. Target branch:
`feat/d1-stage2-offline-import-reconcile-20261120` (Draft PR #899,
stacked on #897 → #895 → #894). No merge or Ready.

## Source and D1 schema provenance

- Historical source inventory:
  `docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json`, 70 candidate tables,
  820 fields, source evidence cut `be261abc...`. This is **not**
  an observed BWH production snapshot.
- E4 read-only table/column-name inventory:
  `docs/evidence/D1_STAGE2A_E4_COLUMNS_METADATA_20261120.json`,
  85 table names, 951 column names, 68 shared name sets,
  2 source-only optional Ads Consent tables, 17 E4-only tables,
  2 shared column-set differences (edge apply receipt +6,
  legacy payment archive -2 sensitive checkout capability fields).
- Read-only E4 D1 identity:
  `05732071-22a5-4e04-834c-f5dd4407a462`,
  Cloudflare Primary `gccltd.co2026@gmail.com`, account
  `17d66c001f9d851fa0d5a88cd311c2c0`.
- Source T2 dispositions remain **pending owner approval**;
  equal column-name sets on 66 shared tables do not prove
  DDL/constraint, data, custody or retention parity.

## Actually executed in synthetic Miniflare

| Scope | Implementation | Proof |
|---|---|---|
| Full synthetic snapshot | `tools/d1-stage2/offline-rehearsal.mjs` | 2 business tables (accounts → entitlements), schema sentinel, 8 tests |
| Atomic checkpoint | Target INSERT + immutable checkpoint log in one D1 `batch()` | lost-ack retry, duplicate/replay and partial-batch PK conflict rollbacks |
| Run provenance | Snapshot/plan SHA-256, run identity, batch PK/digest and row count | changed snapshot or corrupt checkpoint aborts |
| Reconciliation | Per-row canonical comparison and scoped target row count | mismatches and extra synthetic rows rejected |
| Synthetic delta | `tools/d1-stage2/offline-delta-replay.mjs` | 6 tests; deletes child → parent, upserts parent → child |
| Delta guard | Exact old-row CAS-style CHECK guard before UPDATE/DELETE, in same D1 batch | stale source row / concurrent target drift rejects and rolls back |
| Schema evidence | Versioned metadata + `stage2-e4-schema-snapshot.test.mjs` | 4 tests for identity, set diff and sensitive archive omissions |

CI evidence:
- Control Plane Worker workflow run **#177**, head
  `ce60478d76c857121f18d8443257a041b2545994`: **178/178**
  Node/Miniflare tests PASS, **30/30** C2 policy tests PASS,
  `C2_POLICY_CHECK: PASS`. This is the pinned observed result
  before this receipt's documentation-only commits; re-run latest
  exact PR head before treating the final PR as independently reviewed.

## Exact limitations

The source integration revision verifies the registered run identity before
the first delta batch, including when another plan registers the same run
first. Replay removes obsolete entitlements, upserts accounts and
entitlements in foreign-key order, then deletes obsolete accounts. This
supports retaining an entitlement while moving it to a different account.
Verification is scoped to the versioned synthetic Miniflare fixture.
Earlier delta runs have a different plan hash and reject with
`stage2_run_identity_mismatch`. Repeat those rehearsals in a fresh disposable
Miniflare fixture. Earlier full-snapshot checkpoints remain compatible.

- These tools live under `tools/` and use **only a caller-supplied
  local Miniflare D1** protected by a dedicated
  `stage2_local_rehearsal_sentinel`. They are not imported by the
  deployed Worker; there is no HTTP/admin import route.
- Only two synthetic FK-linked business table names/fields are allowed.
  Every PK/owner reference must begin `s2s-` and real credential,
  identity, payment-action capability fields are rejected.
- The synthetic delta is **not CDC**: the test supplies immutable
  before/after row sets. The Muse source contract has fingerprint-only
  differences, not approved row bytes or ordered durable changes.
- No Stage 2 code was applied to remote Staging or E4, no BWH
  production DB or customer-row contact, no real WAL export,
  no D1_ACTIVE, and no dual writer.
- Full stage closure is **blocked** on T2-C1..C6 field/custody
  decisions, exact 19 source migration checksum run, all-table target
  DDL/transform/constraint parity, durable source export/order,
  U-F18 credential-only parity, financial ledger invariants, a safe
  source freeze/drain, G6 offline sign-off and independent review.

## Next handoff

`docs/D1_STAGE2_BWH_EXPORT_MUSE_HANDOFF_V1.md` contains Muse's
offline source export, row batch metadata, durable delta ordering and
freeze/credential reconciliation acceptance. This is a development
contract, **not** permission to execute on production.

Reviewers should verify exact head + non-author test run, 70/85
snapshot provenance, and negative tests before accepting a stage.
