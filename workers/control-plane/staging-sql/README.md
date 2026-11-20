# Isolated Staging D1 writer fence — v1 execution record

Decision date: 2026-11-20.
This directory preserves the operator-reviewed one-time v1 SQL applied
to the isolated Staging database. The v1 execution is closed. Keep this
directory outside Wrangler migration discovery and preserve the SQL for audit.

## Strict target and exclusions

- Cloudflare Principal: `gccltd.co2026@gmail.com`
- Account ID: `17d66c001f9d851fa0d5a88cd311c2c0`
- Worker: `flylink-control-plane-staging`
- Binding: `CONTROL_DB`
- Exact allowed Staging D1 ID: `1ec6458a-0ac0-4ab0-92f3-5ba58b775acc`
- **Never touch** migration target `flylink-control-migration-e4`
  (ID `05732071-22a5-4e04-834c-f5dd4407a462`),
  BWH production SQLite, another account or the public-site Worker.
- At the time of execution, the master baseline was
  `11dd1cfb208b78a85ce77b8c8aef2b6763f9000a` and both Worker Stage 1A
  PR #894 and Stage 1B PR #895 were Draft.
- Actual Staging Worker Version 5 is `26c7f7ef-7d05-4c06-a435-df41b8fecda8`.
  Deployment `6aa8873e-4057-4f67-abcd-09ea9c9a76f7`.

## Recorded v1 procedure

The approved procedure for this completed execution specified:

1. Verify the Cloudflare account, Staging D1 identity, Worker version,
   and live binding names/types.
2. Use `sqlite_master` to verify absence of all **six** authority objects
   (2 tables and 4 triggers), with existing Agent test rows preserved.
3. Compare `authority-guard-v1.sql` with
   `../migrations/0005_writer_authority_guard_slice.sql`.
   `test/staging-authority-ddl.test.mjs` preserves byte equality of the SQL
   bodies, excluding the leading comments. The execution used one atomic batch.
4. Read back both tables, all four triggers, exact singleton
   `{authority:'BWH',phase:'BWH_ACTIVE',epoch:1}`,
   and gate row `{singleton:1,accepted_epoch:0}`. Verify unchanged
   non-authority row counts.
5. Confirm rejection of a gate UPSERT under `BWH_ACTIVE` and an invalid
   phase transition, with authority state unchanged.
6. Record the SQL identity, execution result, and readback in PR #897.

## Additive guard after v1

The v1 receipt covers the four triggers from `0005`. The local additive
`0006_writer_authority_insert_guard_slice.sql` defines a fifth trigger
that protects the seeded singleton from replacement. Remote coverage for
`0006` remains pending a separately approved Staging change and readback.
Keep v1 as a frozen record.

The known unresolved integration items remain: BWH's unfenced
U-F1..U-F18 and U-01..U-10 inventory, U-F18 credential-only deltas,
a real freeze/drain coordinator, and post-freeze reconciliation.
