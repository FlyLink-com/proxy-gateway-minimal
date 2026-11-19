# Isolated Staging D1 writer fence — one-time manual DDL

Decision date: 2026-11-20.
This directory is **not** configured as a Wrangler migrations directory.
It is an explicit operator-reviewed SQL artifact for the existing
Staging database. Do not let routine Worker deploys apply it.

## Strict target and exclusions

- Cloudflare Principal: `gccltd.co2026@gmail.com`
- Account ID: `17d66c001f9d851fa0d5a88cd311c2c0`
- Worker: `flylink-control-plane-staging`
- Binding: `CONTROL_DB`
- Exact allowed Staging D1 ID: `1ec6458a-0ac0-4ab0-92f3-5ba58b775acc`
- **Never touch** migration target `flylink-control-migration-e4`
  (ID `05732071-22a5-4e04-834c-f5dd4407a462`),
  BWH production SQLite, another account or the public-site Worker.
- Master baseline `11dd1cfb208b78a85ce77b8c8aef2b6763f9000a`;
  Worker Stage 1A PR #894 and Stage 1B PR #895 remain Draft.
- Actual Staging Worker Version 5 is `26c7f7ef-7d05-4c06-a435-df41b8fecda8`.
  Deployment `6aa8873e-4057-4f67-abcd-09ea9c9a76f7`.

## Preflight / one-time apply

1. Read the current Cloudflare account identity, Staging D1 ID, Worker
   deployment version, and live binding names/types. Abort on mismatch.
2. Read-only query `sqlite_master`. Expect all **six** authority objects
   (2 tables and 4 triggers) to be absent. Stop if any pre-exist; never
   apply half a migration without investigating and restoring a
   reconciled state. Existing Agent test rows are preserved.
3. Review `authority-guard-v1.sql` against
   `../migrations/0005_writer_authority_guard_slice.sql`.
   `test/staging-authority-ddl.test.mjs` enforces byte-identical SQL
   bodies, with comments excluded. Use an atomic D1 API batch when
   applying, not independent DDL statements with no recovery plan.
4. Postflight query: both tables, all four triggers, exact singleton
   `{authority:'BWH',phase:'BWH_ACTIVE',epoch:1}`,
   gate row `{singleton:1,accepted_epoch:0}`. Query existing
   non-authority row counts to confirm no change.
5. Negative checks: attempt the gate UPSERT with epoch 1 under
   `BWH_ACTIVE` and an invalid phase transition. Both must abort and
   leave rows unchanged. Do **not** change Staging to `D1_ACTIVE`;
   reaching that state cannot safely return to BWH_ACTIVE without the
   reverse-reconciliation protocol.
6. Record exact SQL identity, result and Cloudflare readback in the
   owning PR. No migration is considered complete until both tables,
   triggers, singleton, default authority and negative tests verify.

Only the reviewed Staging D1 may receive this DDL. It is not an E4
production schema change, a snapshot import, a BWH freeze, or an Agent
live cutover. Only **synthetic** credentials/rows may be used in
separately authorized test paths.

The known unresolved integration items remain: BWH's unfenced
U-F1..U-F18 and U-01..U-10 inventory, U-F18 credential-only deltas,
a real freeze/drain coordinator, and post-freeze reconciliation.
