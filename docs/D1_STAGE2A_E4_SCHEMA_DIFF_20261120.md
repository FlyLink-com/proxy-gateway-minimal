# Stage 2A — control.sqlite source-candidate vs E4 D1 read-only schema comparison

Evidence date: 2026-11-20. Exact repository source inventory:
`docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json` from `015fae70c47bb29534bc1c9b5fae15d5d2ea020b`
(its own evidence source cut is `be261abc...`, **not** a live BWH inspection).
This is **not** an approved target schema or a production presence check.

Cloudflare: **Primary** `gccltd.co2026@gmail.com`, account `17d66c001f9d851fa0d5a88cd311c2c0`.
Target read-only inventory: existing **E4** D1 `flylink-control-migration-e4`,
ID `05732071-22a5-4e04-834c-f5dd4407a462`.
No E4 mutation, production BWH access, export or D1_ACTIVE transition.

## Observed set comparison

| Dimension | Result | Interpretation |
|---|---:|---|
| Source-only schema candidate tables | 70 | 48 core + 22 companion, includes conditional tables |
| E4 actual table objects | 85 | Read-only `sqlite_master`, excluding SQLite/CF internal names |
| Name intersection | 68 | Not proof of DDL/invariant equivalence |
| Source-only | 2 | Both conditional Ads Consent tables |
| E4-only | 17 | G4/identity/control additions; not all source-migration targets |
| Shared tables with differing column-name sets | 2 | Must disposition explicitly |
| E4 column-inventory rows | 951 | Read-only `pragma_table_info` over 85 tables |

### Source-only conditional tables (not permission to blindly CREATE)

- `platform_ads_consent_decisions`
- `platform_ads_click_consent_claims`

Their disposition is `CONDITIONAL` in the T2 proposal, and the source
inventory explicitly marks feature-gated production presence unobserved.
Do not materialize them until applicability, owner and target DDL are approved.

### E4-only tables (17)

- G4 Agent protocol (9):
  `agent_api_credentials`, `agent_apply_receipts`, `agent_credential_events`,
  `agent_desired_state_materials`, `agent_desired_states`,
  `agent_manifest_claims`, `agent_node_channels`, `agent_nodes`,
  `agent_request_nonces`.
- Additional control-plane (8):
  `platform_edge_desired_state_channels`,
  `platform_edge_desired_states`, `platform_identity_bindings`,
  `platform_identity_deletion_jobs`,
  `platform_identity_deletion_proofs`,
  `platform_identity_deletion_tombstones`,
  `platform_portal_subscription_link_resets`,
  `platform_write_idempotency_keys`.

These are **additional target objects**, not authorization to send new
business payloads or raw credential values from BWH.

### Two same-name tables with column-set differences

1. `platform_edge_apply_receipts`: source 15 columns, E4 21.
   Target-only fields: `node_ref`, `generation`,
   `receipt_digest`, `reason_code`, `listener_present`,
   `credential_count`. Determine derivation, defaults, constraints,
   and G4 ownership before data import.
2. `platform_payment_orders_legacy_archive_20260803`: source 30
   columns, E4 28. Source-only: `checkout_url`,
   `checkout_qr_code`. These can carry payment capabilities;
   **never copy them** to D1. Archive presence itself is conditional;
   preserve the T2 payment-action custody gate and a reviewed
   non-capability alternative.

The other 66 shared table names had equal column **name sets** in this
read-only check. This does **not** validate PK/FK/CHECK, triggers,
defaults, collations, types, or data. An additional DDL/semantic matrix
and reviewed field disposition are required.

## T2 policy is not approved by these counts

The T2 field disposition artifact remains a **proposal**:
70 tables; 820 source fields; 64 KEEP, 4 CONDITIONAL, 2 DEFER;
712 KEEP, 59 CONDITIONAL, 7 EXTERNALIZE, 19 TRANSFORM, 23 DEFER
fields. Production table presence and row contents were not inspected.
T2-C1..C6 ownership/retention/key/payment constraints remain separate
gates. Exclude `subscriptions.sqlite`, third-party subscription
database, protected edge-material files, and raw credential custody.

## Stage 2 offline execution envelope

This PR adds a synthetic-only, local Miniflare D1 rehearsal engine
for the first **two** FK-linked business examples (`platform_accounts`,
`platform_entitlements`). This is a test of checkpoint/transaction/replay
mechanics, **not** a complete 70-table loader. It accepts only
strictly whitelisted `s2s-` synthetic IDs, a local-fixture sentinel,
and no credential or payment-capability fields. It is never imported
by the deployed Worker route and cannot apply to E4 without
constructing a prohibited local sentinel.

**Next required engineering:** independently checked target DDL for
all approved tables; source-snapshot provenance/19 full migration
checksum verification; 70-table mapping policy, FK ordering, bulk
pagination and tombstone/delta replay, U-F18 credential reconciliation,
money/ledger consistency, resumable long-run failure testing, and
shadow-read comparison. Keep BWH production as writer until the
final coordinated transfer.
