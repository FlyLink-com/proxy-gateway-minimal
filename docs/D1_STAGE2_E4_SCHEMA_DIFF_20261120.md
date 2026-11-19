# Stage 2 — E4 target/schema boundary audit (read-only evidence)

Date: 2026-11-20. Source repository:
`FlyLink-com/proxy-gateway-minimal@11dd1cfb208b78a85ce77b8c8aef2b6763f9000a`.
Source-definition inventory: `docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json`
(cut `be261abc`, **source-only**, no production observed data).
Field policy: `docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json` (**DRAFT**,
not a completed target data-custody approval). Remote evidence:
read-only Cloudflare D1 `sqlite_master` + per-table `PRAGMA table_info`
on 2026-11-20. No records read, no mutations performed.

**Account boundary:** Cloudflare Primary `gccltd.co2026@gmail.com`
(`17d66c001f9d851fa0d5a88cd311c2c0`).
Remote database **E4 only**: `flylink-control-migration-e4`,
ID `05732071-22a5-4e04-834c-f5dd4407a462`.
The separate Staging D1 `1ec6458a-0ac0-4ab0-92f3-5ba58b775acc`
was not used as the E4 schema authority.

## Verified object comparison

| Category | Observed | Interpretation |
| --- | ---: | --- |
| Repository source-defined candidate tables | 70 | Historical inventory maximum, not live BWH observation |
| E4 tables | 85 | Read-only `sqlite_master` observation |
| Source/E4 table names in common | 68 | Existence only; **not** migration eligibility |
| Source-only (absent from E4) | 2 | Both optional/conditional ads-consent |
| E4-only names outside historical source-70 inventory | 17 | Multiple Worker/Agent/identity and later feature tables |
| E4 triggers | 88 | Observed, not yet validated against source trigger semantics |
| E4 writer authority fence objects | 0 | No Stage-1 D1 authority installation at E4 |
| Identical column-name sets among the 68 common tables | 66 | Name-set check only; constraints require separate review |
| Column-name-set exceptions among common tables | 2 | Specific drift detailed below |

Two source-only optional tables not observed in E4:
`platform_ads_consent_decisions`,
`platform_ads_click_consent_claims`.
Neither should be auto-created on E4 without a production-presence
and feature-activation decision.

17 E4-only table names (relative to **historical 70-table** inventory;
this is not evidence that they are absent from present-day BWH source):
- `agent_api_credentials`
- `agent_apply_receipts`
- `agent_credential_events`
- `agent_desired_state_materials`
- `agent_desired_states`
- `agent_manifest_claims`
- `agent_node_channels`
- `agent_nodes`
- `agent_request_nonces`
- `platform_edge_desired_state_channels`
- `platform_edge_desired_states`
- `platform_identity_bindings`
- `platform_identity_deletion_jobs`
- `platform_identity_deletion_proofs`
- `platform_identity_deletion_tombstones`
- `platform_portal_subscription_link_resets`
- `platform_write_idempotency_keys`

## Column-level findings — do not assume E4 schema parity

The checked 70 table names were introspected with read-only
`PRAGMA table_info` in bounded batches; 68 existed.
All present tables showed the same column type names for shared
columns and consistent column NOT NULL flags in this inventory cut.
Two require review before any row import:

1. `platform_edge_apply_receipts`: E4 has **six additional columns**
   relative to source inventory:
   `node_ref`, `generation`, `receipt_digest`,
   `reason_code`, `listener_present`, `credential_count`.
   Validate provenance and target/source transformation rather than
   silently inserting defaults.
2. `platform_payment_orders_legacy_archive_20260803`: E4 lacks two
   source-inventory columns `checkout_url` and `checkout_qr_code`.
   These are action/capability material and should **not** be copied
   blindly; check field-custody decision and conditional-archive presence.

Five table-level/composite primary keys are reported differently by
the *source JSON per-column PK flag* versus `PRAGMA table_info`:
`platform_data_pack_edge_credentials`,
`platform_quota_counters`,
`platform_usage_counter_cursors`,
`platform_portal_edge_credentials`,
`platform_referral_policies`.
This is a **metadata granularity discrepancy**, not proven DDL drift:
the source inventory also records table-level PK constraints. Check
full CREATE TABLE SQL, FK DAG and unique indexes before marking parity.

## Eligibility gate remains BLOCKED

The current T2 field-disposition JSON says **64 KEEP, 4 CONDITIONAL,
2 DEFER** at table level; across 820 source fields:
712 KEEP, 59 CONDITIONAL, 7 EXTERNALIZE, 19 TRANSFORM and 23 DEFER.
Its status is `DRAFT_FIELD_DISPOSITION_PROPOSAL`.
Neither 68 overlapping names nor 66 equal column-name sets is
authorization to transfer actual rows.

Required before a real loader targets E4:
1. Rebase source schema inventory to the exact new source commit, run
   source-migration checksum verification (historical plan mentions
   19 versions), reconcile its BWH *observed* object presence separately.
2. Obtain an approved, field-by-field transform/exclude mapping,
   preserving identity, credential, payment capability and retention
   custody rules; hash-only deltas cannot reconstruct row payloads.
3. Validate FK/UNIQUE/CHECK/trigger behavior and topological import
   order; re-run offline G6-style fixture and failure recovery.
4. Close Muse BWH unfenced entrypoints U-F1..U-F18 and U-01..U-10,
   including U-F18 credential-only reconciliation, before source freeze.
5. Implement source-export transport with tamper-evident manifest,
   per-batch digest, snapshots/deletes and multi-run idempotency, then
   stage a separate *synthetic-only* E4-compatible import test.
6. Require data-preservation, financial-ledger reconciliation, recovery
   receipts, end-to-end Worker smoke and explicit final cutover gate.

**No E4 database mutation, production read, customer row migration, BWH
operation, D1_ACTIVE activation, Ready or merge occurred in this audit.**
