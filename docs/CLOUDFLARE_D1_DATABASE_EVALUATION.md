# Cloudflare D1 Database Evaluation

Last updated: 2026-11-04 UTC.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: cloudflare_d1_database_evaluation
  superseded_by: null
  last_verified_at: 2026-11-04
  production_authority: false
```

> Status:
> - Type: Feasibility and decision record; not an approved target architecture
> - Risk: C for this document; A for any D1 resource, Worker/API, schema migration, data movement, or production cutover
> - Decision: **Cloudflare D1 is not adopted**
> - Existing Cloudflare public-site scope remains unchanged
> - Source review cutoff: `master@3768644aa33a01af55d5da6444acebe16f78fd64`
> - Production, provider, credential, database, and runtime authority: none

## Executive decision

Cloudflare D1 is a possible future database target, but it is **not approved for this repository's control plane at this time**.

The current repository has an explicit Cloudflare public-site boundary: the Cloudflare lane builds and verifies static assets from `admin/dist-site`; it does not move Express, SQLite, the control plane, Admin API, User Portal API, subscription API, protocol nodes, or runtime adapters to Cloudflare. The root `wrangler.jsonc` is an assets-only configuration and has no D1 binding or application API entrypoint.

A D1-backed control plane would therefore require a separately reviewed architecture decision and an explicit change to the current Cloudflare integration boundary. This evaluation does not make that change.

The current architecture remains the existing Node/Express modular monolith with its SQLite stores and one authoritative subscription control plane. Do not create multiple D1 databases, split domains that currently share one SQLite file, or introduce dual-write / second-source-of-truth behavior as part of this proposal.

## Existing Cloudflare boundary

The active repository contract is `docs/CLOUDFLARE_PUBLIC_SITE_CI.md`:

- The Cloudflare public-site lane is limited to static assets built into `admin/dist-site`.
- Its allowed work is static-site build/verification and a Wrangler dry-run.
- Moving Express, SQLite, the control plane, Admin API, User Portal API, subscription API, protocol nodes, or runtime adapters to Cloudflare is outside that lane.
- The document does not authorize Cloudflare account, DNS, Worker route, secret, API, subscription, payment, or runtime changes.

The current root `wrangler.jsonc` declares the static asset directory only. It has no `d1_databases` binding and no Worker application entrypoint for the control-plane API.

The JP-01 programme's “D1” label in its dual-side integration sequence is a stage name and is unrelated to Cloudflare D1.

## Current repository storage boundaries

The following paths and ownership were read from `server/state.mjs` and the current store implementations at the source cutoff above.

| Store | Current path selection | Current responsibility | Evaluation treatment |
| --- | --- | --- | --- |
| Control database | `SUBSCRIPTION_CONTROL_DB_PATH`, then `CONTROL_DB_PATH`, otherwise `.proxy-gateway/control.sqlite` | Business control state and the domain stores wired to the shared `controlDbPath` | The only initial D1 candidate to evaluate, if the Cloudflare boundary is separately changed |
| Subscription runtime database | `SUBSCRIPTION_DB_PATH`, otherwise `.proxy-gateway/subscriptions.sqlite` | Technical tenant, audit, temporary-link, and subscription-artifact state | Keep separate during the first evaluation; do not silently merge it into the control database |
| Optional third-party subscription database | `THIRD_PARTY_SUBSCRIPTION_DB_PATH` | Third-party subscription source and distribution state; both store constructors receive this configured path | Keep its existing boundary until its dependencies and consistency requirements are separately reviewed |
| Edge credential-material file store | Configured protected file path | Actual per-order runtime material, including protocol UUID/password values | **Never copy raw material into D1 as part of this proposal** |

The shared `controlDbPath` is passed to the platform subscription-control store and to the Coins Wallet, Coins Commerce, Payment, and Ads Consent stores, among other control-plane components. Those domains must not be split into separate D1 databases without proving that their current transaction, foreign-key, idempotency, and recovery contracts remain intact.

The control database contains the business-control tables documented in `docs/SUBSCRIPTION_CONTROL_DATABASE.md`, including accounts, entitlements, issuance requests, issued-link references, quota counters, device bindings, revocations, audit events, and edge desired-state / receipt coordination. Additional source-owned modules add wallet, commerce, payment, portal, referral, usage, and authority objects. The table list in this paragraph is a domain summary, not an exhaustive schema inventory.

The subscription runtime repository currently creates:

- `subscription_tenants`
- `subscription_audit_events`
- `subscription_temp_links`
- `subscription_artifacts`

The third-party distribution migration owns its own named policy, routes, and owned-node objects. Its schema is defined by the existing third-party and subscription-distribution migration modules; this evaluation does not rename or merge those objects.

## Candidate scope if the boundary is changed

If a separate owner decision authorizes a Cloudflare-backed control plane, the first feasibility target should be **one D1 database corresponding to the existing shared `controlDbPath`**, not one D1 database per business domain.

That candidate would need to preserve:

- the single authoritative control-plane ownership model;
- current domain table ownership and foreign-key relationships;
- Coin Ledger as the financial fact, with wallet balance remaining a projection;
- payment / recharge / commerce idempotency and reconciliation semantics;
- exact migration IDs, DDL checksums, and the existing `platform_schema_migrations` contract;
- safe references and redacted audit/receipt boundaries;
- the current separation between business control data and technical subscription runtime state.

The existing `subscriptions.sqlite` and optional third-party store are not included in this first candidate. Their migration would require a separate dependency and transaction analysis. Do not create `D1-SUBSCRIPTION`, `D1-THIRDPARTY`, or a secret-material database merely to mirror current filenames.

No dual writes are allowed as a migration shortcut. A cutover must have one authoritative writer at a time, with a separately approved and tested recovery path.

## Integration and compatibility assessment

### Node application compatibility

The current server uses Node.js and synchronous `better-sqlite3` repositories. Cloudflare D1 is accessed through the Workers D1 API, whose prepared statements, `batch()`, and `withSession()` are asynchronous Worker-side interfaces.

D1 is therefore **not a replacement SQLite file path** for the current Node process. A production integration would require an explicit Worker-backed API / repository adapter or another separately reviewed access path, plus conversion of affected repository calls and transaction boundaries. No such API adapter is present in the current assets-only Cloudflare configuration.

This is an architecture change, not a configuration-only migration.

### Transaction and consistency compatibility

Cloudflare documents that:

- `D1Database.batch()` executes the supplied statements sequentially in one SQL transaction and rolls back the batch if a statement fails.
- `withSession()` provides sequential consistency for queries in a session, with bookmarks available to carry read consistency between sessions.
- D1 migrations are versioned SQL files applied through Wrangler; local and remote migration targets are distinct.

These capabilities are useful, but they do not prove that existing `better-sqlite3` callback transactions, synchronous read-modify-write sequences, cross-store coordination, or file-lock assumptions can be ported unchanged. Every current transaction participant and idempotency path must be inventoried and tested against the D1 API.

The D1 migration design must also define how repository-owned migration IDs and DDL checksums relate to Wrangler's `d1_migrations` history. Do not discard or silently rewrite the existing domain migration ledger.

### Workload and limits

No current database size, row-count inventory, peak write rate, query-latency distribution, or Cloudflare D1 cost estimate was collected for this evaluation.

Before choosing D1, measure the actual control database and representative workload. Validate write contention, p95/p99 latency from the control-plane host, batch sizes, pagination, query-result limits, daily read/write volume, storage growth, and account-plan limits against the current Cloudflare documentation. Do not hardcode a plan quota into this design.

## Data protection and identity boundaries

The control database intentionally stores safe references and rejects raw fields such as email, URL, token, secret, credential, password, raw payload, and YAML. That contract must remain true after any future migration.

The protected edge credential-material store is separate from the control database. Its current file implementation serializes records containing UUID/password material and applies owner-only directory/file permissions; the module does not provide application-layer encryption. This evaluation does not upload, copy, re-encrypt, or otherwise migrate that material. Any future cloud custody design requires its own threat model, key-management decision, access policy, rotation plan, and Risk A approval.

Historical runtime identities, stale identity-map entries, and traffic-accounting history are not migration cleanup candidates. Preserve stable references and historical ledger facts. Do not reclassify, rotate, activate, or delete Japan/other node identities as part of a database evaluation. Any change to runtime-principal bindings or protected material is subject to `docs/IDENTITY_LIFECYCLE.md` and its separate Identity Gate / retention process.

Never put raw SQLite rows, customer data, runtime UUIDs, passwords, tokens, subscription URLs, raw configs, or private logs in this document, PR description, test output, or migration evidence. Use aggregate counts, safe references, and non-reversible digests only where the approved validation contract permits them.

## Required decision and migration gates

The sequence below is a future planning order, not authorization to execute it.

| Gate | Required work | Exit evidence | Authority |
| --- | --- | --- | --- |
| G0 — Architecture decision | Decide whether the current Cloudflare public-site boundary should be changed and whether a Worker-backed control-plane API is acceptable | Explicit owner decision; updated architecture and Cloudflare boundary documents | Separate approval |
| G1 — Read-only inventory | Inventory exact SQLite paths, schemas, migration IDs/checksums, table counts, indexes, triggers, foreign keys, data sizes, and transaction participants without exposing rows | Dated aggregate-only inventory tied to an exact source and database identity | Separate Risk A gate for production inventory |
| G2 — Synthetic compatibility spike | Create no production resource; use local D1 and synthetic fixtures to test schema SQL, constraints, batches, sessions, pagination, and repository transaction patterns | Repeatable tests with no real user or production data | Source-only review |
| G3 — Adapter design | Define the authenticated Worker API, request allowlist, authorization, idempotency, timeouts, error mapping, observability redaction, and failure behavior | Reviewed API contract and repository adapter design | Separate source review |
| G4 — Offline migration rehearsal | Migrate a synthetic or separately approved immutable fixture; compare schema, aggregate counts, safe digests, financial invariants, and restore behavior | Reproducible reconciliation and restore evidence | Source / isolated fixture |
| G5 — Production migration | Freeze the source writer, take and verify an immutable backup, apply the exact reviewed migration, reconcile, and make one controlled cutover | Exact Risk A approval, backup identity, migration identity, validation receipt, and rollback/recovery readiness | **Risk A; not authorized here** |
| G6 — Post-cutover recovery | Prove D1 export/restore and the recovery path for writes accepted after cutover | Tested RPO/RTO and a forward-recovery or restore decision | Separate Risk A gate |

The existing SQLite snapshot/restore contract in `docs/CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md` is specific to the current SQLite file and its WAL / service-custody procedure. It is not a D1 backup or restore runbook. A future D1 proposal must separately design and test D1 export, R2 retention, Time Travel use, restore, and post-restore reconciliation. Time Travel alone is not evidence that the complete application recovery procedure works.

## Current go / no-go

**NO-GO for adoption or implementation under the current authorization.**

The following are still open and must not be inferred:

1. Whether the owner wants to revise the existing Cloudflare public-site-only boundary.
2. Whether a Worker-backed API surface is acceptable within the single-control-plane architecture.
3. Whether the actual control database size, write pattern, latency, and cost fit D1.
4. Whether every current transaction, migration, and recovery contract can be represented safely through D1.
5. Whether any additional SQLite store should ever move; this document selects none.
6. Whether a separate encrypted custody system is required for runtime material; raw material is excluded regardless.

Until these decisions are closed, keep the current SQLite source of truth and existing Cloudflare static-site scope unchanged. Do not create a D1 database, add a D1 binding, add a Worker API, migrate data, run remote migrations, change secrets, or modify production.

## References

Repository contracts:

- [Cloudflare Public Site CI](CLOUDFLARE_PUBLIC_SITE_CI.md)
- [Single Control Plane / Multi Data-Plane Plan](SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md)
- [Subscription Control Database](SUBSCRIPTION_CONTROL_DATABASE.md)
- [Control-Plane SQLite Snapshot and Restore Contract](CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md)
- [Runtime Identity Binding Lifecycle](IDENTITY_LIFECYCLE.md)
- [Coins Wallet Schema Gate](COINS_WALLET_SCHEMA_GATE.md)
- [Coins Commerce Schema Gate](COINS_COMMERCE_SCHEMA_GATE.md)

Cloudflare documentation:

- [D1 Worker API: D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Export and save a D1 database to R2](https://developers.cloudflare.com/workflows/examples/backup-d1/)
