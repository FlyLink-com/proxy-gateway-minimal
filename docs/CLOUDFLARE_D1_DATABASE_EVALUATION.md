# Cloudflare Workers + D1 Control-Plane Architecture Decision

Last updated: 2026-11-04, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: cloudflare_workers_d1_control_plane
  superseded_by: null
  last_verified_at: 2026-11-04
  production_authority: false
```

> Status:
> - Type: Owner-approved target architecture direction and staged implementation plan
> - Owner decision: **Approved on 2026-11-04** — Cloudflare Workers may become the control-plane API host and Cloudflare D1 the authoritative control database after gated migration
> - Risk: C for this document; B for repository-only implementation and local synthetic D1 tests; A for remote Cloudflare resources, D1 bindings, secrets, Worker routes, production schema/data migration, DNS, or cutover
> - Current runtime: **not migrated**; Node/Express and SQLite remain the current source of truth
> - Source review cutoff: `master@3768644aa33a01af55d5da6444acebe16f78fd64`
> - This document grants no production, provider, credential, database, deployment, or runtime mutation authority

## Executive decision

The owner has approved the target direction to extend Cloudflare beyond static hosting and, after separately gated implementation and migration, host:

1. the platform control-plane API on Cloudflare Workers; and
2. the authoritative business-control database on one Cloudflare D1 database.

This is an approved architecture direction, **not a statement that the new runtime exists or is deployed**. At this source cutoff, the repository still runs its Node/Express modular monolith with synchronous `better-sqlite3` repositories and SQLite stores. The root `wrangler.jsonc` remains an assets-only static-site configuration; no Worker control-plane entrypoint, D1 binding, remote D1 database, or production route was created by this decision.

The target preserves the existing single-control-plane / multi-data-plane contract. It does not create a control plane per node, split business domains that currently share `control.sqlite`, or permit dual writes. The initial D1 data target is one database corresponding to the current shared `controlDbPath`. The subscription runtime database, optional third-party subscription database, and protected edge credential-material store remain outside the first migration scope until their ownership and dependency contracts are separately resolved.

## Approved target architecture

```text
Admin / User Portal / company clients
              |
              v
Cloudflare Worker — Control-plane API
  authentication / sessions / authorization
  account, entitlement, wallet, ledger
  recharge / payment / commerce
  resource authority / issuance
  safe Admin projections / audit
  edge desired-state and receipt coordination
              |
              v
       One Cloudflare D1 database
       (initially maps shared control.sqlite)
              |
       authenticated, narrow agent API
              ^
              |
BWH data-plane agent — outbound pull / receipt
  protected local runtime material
  protocol config / config-test / service apply
  node health and usage collection
              |
              v
       Japan / other edge runtimes
```

### Cloudflare Workers owns

- The public control-plane API used by Admin, User Portal, and approved client surfaces.
- Authentication/session enforcement, authorization, request validation, rate limiting, safe audit, and redacted observability.
- Domain use cases and the asynchronous D1 repository layer.
- The single authoritative write path for the D1-owned control-plane domains after cutover.
- A narrow, authenticated interface for data-plane agents to fetch their scoped desired-state commands and submit redacted receipts.

### Cloudflare D1 owns

The first D1 database should correspond to the existing shared `control.sqlite` boundary. Keep the existing business domains in one database so that their current transaction and integrity relationships can be preserved:

- account, access, entitlement, issuance, and resource-authority records;
- subscription control, quota, device-binding, revocation, and audit facts;
- immutable Coin Ledger facts and wallet balance projections;
- recharge/payment, commerce order, quote, and fulfillment state;
- referral, usage-accounting, and safe operational projections where the source confirms they share the control database;
- edge desired-state, command coordination, and redacted receipt records.

This is one logical control database with domain-owned tables and repositories, not a database-per-domain design. The exact table inventory, foreign keys, triggers, indexes, migration IDs, and transaction participants must be captured before implementation is considered complete.

### BWH and edge nodes retain

- Protocol runtimes and node-local runtime configuration.
- Protected per-order credential material, including UUID/password values.
- Config-test, controlled service apply/restart, runtime health, and node-local usage collection.
- The data-plane agent that communicates with the Worker through an authenticated outbound connection.

The BWH agent must not connect directly to D1, receive a D1 credential, become a second business database, or expose a public Admin surface. It receives only the commands and safe references required for its own node. It returns redacted receipts; raw credential material never travels through D1, API responses, logs, or documentation.

The preferred initial communication pattern is **BWH-initiated authenticated polling or another explicitly reviewed outbound agent channel**. Do not expose a new inbound management port on BWH as a shortcut. The exact agent authentication, replay protection, command lease, acknowledgement, retry, and receipt protocol remains a source-design task.

## Current repository boundaries

The following paths and ownership were read from `server/state.mjs` and the current store implementations at the source cutoff above.

| Store | Current path selection | Current responsibility | Target treatment |
| --- | --- | --- | --- |
| Control database | `SUBSCRIPTION_CONTROL_DB_PATH`, then `CONTROL_DB_PATH`, otherwise `.proxy-gateway/control.sqlite` | Shared business-control state; Wallet, Commerce, Payment, Ads Consent, and platform control stores receive the shared path | **First D1 target**, one database |
| Subscription runtime database | `SUBSCRIPTION_DB_PATH`, otherwise `.proxy-gateway/subscriptions.sqlite` | Technical tenant, audit, temporary-link, and subscription-artifact state | Excluded from first D1 cutover; resolve ownership and route dependencies before moving subscription-rendering APIs |
| Optional third-party subscription database | `THIRD_PARTY_SUBSCRIPTION_DB_PATH` | Third-party subscription source and distribution state | Remains separate pending its own dependency, authority, and transaction review |
| Edge credential-material file store | Configured protected file path | Actual per-order runtime material, including protocol UUID/password values | Remains in protected BWH custody; never copy raw material into D1 |

The shared `controlDbPath` is passed to the platform subscription-control store and to the Coins Wallet, Coins Commerce, Payment, and Ads Consent stores, among other control-plane components. Those domains must remain within one D1 transaction boundary unless a future architecture decision proves an alternative consistency model.

The control database includes the business-control tables documented in `docs/SUBSCRIPTION_CONTROL_DATABASE.md`, including accounts, entitlements, issuance requests, issued-link references, quota counters, device bindings, revocations, audit events, and edge desired-state / receipt coordination. Additional source-owned modules add wallet, commerce, payment, portal, referral, usage, and authority objects. This is a domain summary, not an exhaustive schema inventory.

The subscription runtime repository currently creates:

- `subscription_tenants`
- `subscription_audit_events`
- `subscription_temp_links`
- `subscription_artifacts`

The optional third-party distribution store has its own migration and owned objects. Neither database is silently merged into the first D1 database. Before claiming that the complete User Portal or public subscription-rendering path has moved to Workers, the project must explicitly resolve how these stores are accessed, migrated, or retired. No temporary bridge may become an unreviewed second writer.

## Worker application and repository design

The current server uses Node.js and synchronous `better-sqlite3` repositories. D1 is accessed through the Workers D1 API, with asynchronous prepared statements, `batch()`, and `withSession()`. D1 is not a SQLite file path that the existing Node process can open.

The Worker implementation therefore needs a deliberate application boundary:

1. Extract or isolate domain rules from Node process, filesystem, and synchronous database dependencies.
2. Define Worker request handlers and domain services around explicit input/output contracts.
3. Implement asynchronous D1 repositories using prepared statements and bounded query shapes.
4. Port each domain transaction and idempotency contract with tests; do not assume synchronous SQLite transaction callbacks translate directly.
5. Keep Node-only runtime operations in the BWH agent or another explicitly scoped execution adapter, not in the Worker request path.

The Worker path must not depend on native `better-sqlite3`, local SQLite files, arbitrary filesystem access, systemd, protocol binaries, or a Node server being co-located with D1.

### Transaction and consistency requirements

Cloudflare documents that:

- `D1Database.batch()` executes supplied statements sequentially in one SQL transaction and aborts/rolls back the batch when a statement fails.
- `withSession()` provides sequential consistency for queries in a session; session bookmarks can be used to carry read consistency.
- D1 migrations are versioned SQL files applied through Wrangler, with local and remote targets kept distinct.

These features are useful, but they do not prove that existing `better-sqlite3` callback transactions, synchronous read-modify-write sequences, cross-store coordination, or file-lock assumptions can be ported unchanged. Each transaction participant must be mapped to an explicit D1 transaction/batch or a redesigned idempotent workflow.

Required invariants include:

- Coin Ledger remains the immutable financial fact stream; wallet balance is a projection.
- Payment/recharge settlement and commerce fulfillment remain idempotent and reconcilable.
- A D1 transaction must not be presented as atomic with a BWH operation or another SQLite database.
- Edge commands use durable desired-state references, idempotency keys, leases/retries, and redacted receipts.
- Read-after-write paths that affect balance, entitlements, orders, or issuance must use a consistency strategy that is explicitly tested.
- Repository migration IDs and DDL checksums remain auditable; the relationship to Wrangler's `d1_migrations` history must be defined rather than silently replacing the existing migration ledger.

Where a workflow spans D1 and BWH, use a durable command/outbox pattern with idempotent execution and explicit receipts. Do not claim distributed ACID semantics.

## Cloudflare configuration and delivery boundary

Keep the current static-site lane intact:

- Root `wrangler.jsonc` remains the static asset configuration for `admin/dist-site` until a separately reviewed implementation changes it.
- The static-site build, verifier, and dry-run continue to validate only the public static bundle.
- Do not mix backend Worker deployment credentials or D1 migrations into the public-site static build lane.

The control-plane Worker should use a **separate, explicitly named configuration** (proposed: `wrangler.control-plane.jsonc`) with its own Worker entrypoint, D1 binding, migrations directory, validation commands, and deployment gate. The name and exact layout may be refined during implementation, but the separation between static-site and control-plane delivery must remain.

The Worker CI lane should, at minimum, run source/environment checks, Worker bundle validation, local D1 migration application, schema/constraint tests, domain transaction tests, API contract tests, redaction checks, and synthetic edge-agent protocol tests. Pull-request validation must not require production credentials and must not deploy or run remote migrations.

No Worker route, custom domain, DNS, Cloudflare account setting, D1 binding, secret, or remote D1 resource is created by this architecture decision.

## Workload, limits, and cost gate

No current control database size, row-count inventory, peak write rate, query-latency distribution, or Cloudflare D1 cost estimate was collected for this decision.

Before staging or production selection, measure the actual source database and representative workload. Validate:

- storage size and growth;
- read/write volume and peak write concurrency;
- p50/p95/p99 latency from relevant client and agent regions;
- query plans, indexes, batch sizes, pagination, and query-result sizes;
- D1 storage, row read/write, CPU, request, and account-plan limits;
- read-replica behavior and consistency needs for the exact read paths;
- expected cost under current plan and forecast usage.

Do not hardcode plan quotas or infer capacity from a synthetic fixture. If measured workload does not fit the selected D1 plan or latency envelope, stop and revise the target before production migration.

## Data protection, authentication, and identity boundaries

The current control database intentionally stores safe references and rejects raw fields such as email, URL, token, secret, credential, password, raw payload, and YAML. Preserve and test that boundary in the Worker API and D1 repositories.

The protected edge credential-material store is separate from the control database. Its current file implementation serializes records containing UUID/password material and applies owner-only directory/file permissions; the module does not provide application-layer encryption. This decision does not upload, copy, or migrate that material. Any future change in credential custody requires a separate threat model, key-management decision, access policy, rotation plan, and Risk A approval.

Worker authentication and authorization must preserve the current account, session, Admin, Portal, and agent trust boundaries. The design must specify cookie/session protections, CSRF controls where applicable, rate limiting, credential storage, token rotation, replay protection for agents, and redacted audit/observability. Secrets belong only in an approved secret-management surface, never in D1 rows, source, logs, or PR evidence.

Historical runtime identities, stale identity-map entries, and traffic-accounting history are not migration cleanup candidates. Preserve stable references and historical ledger facts. Do not reclassify, rotate, activate, or delete Japan/other node identities as part of this migration. Any change to runtime-principal bindings or protected material remains subject to `docs/IDENTITY_LIFECYCLE.md` and its separate Identity Gate / retention process.

Never put raw SQLite rows, customer data, runtime UUIDs, passwords, tokens, subscription URLs, raw configs, private logs, or secret values in this document, PR description, test output, or migration evidence. Use aggregate counts, safe references, and non-reversible digests only where the approved validation contract permits them.

## Phased implementation and migration gates

The owner decision authorizes the target direction and source-level design work. The sequence below is the implementation order; it does not authorize remote resource creation or production mutation.

| Gate | Required work | Exit evidence | Authority |
| --- | --- | --- | --- |
| G0 — Architecture direction | **Approved 2026-11-04:** Workers control-plane API + one D1 control database; BWH remains data plane | This decision record and updated Cloudflare boundary/context docs | Completed |
| G1 — Source inventory | Map all control-plane routes, stores, schemas, migration IDs/checksums, indexes, triggers, foreign keys, transaction participants, and data ownership | Exact-source inventory and dependency map; no customer rows or secret output | Repository/source review; production DB inventory still needs separate Risk A approval |
| G2 — Local D1 compatibility spike | Use local D1 and synthetic fixtures only; test schema SQL, constraints, batches, sessions, pagination, migration ledger, and representative transaction patterns | Repeatable tests and parity report; no remote Cloudflare resource or production data | Source-only / isolated fixture |
| G3 — Worker API vertical slice | Implement a narrow Worker API and async D1 repository; begin with a safe read-only projection, then prove one bounded write flow with synthetic data | API contract tests, auth/redaction tests, transaction and failure tests | Separate source PR review |
| G4 — BWH agent contract | Implement synthetic outbound polling, scoped command delivery, idempotent acknowledgement, retry/lease behavior, and redacted receipts | Protocol contract tests; no live node or runtime material | Separate source PR review |
| G5 — Remote staging | Create a non-production Worker/D1 environment, secrets, bindings, and isolated route only after exact approval | Resource inventory, access boundary, staging validation, cost/retention plan | Separate explicit Cloudflare account/resource approval |
| G6 — Offline migration rehearsal | Use synthetic or separately approved immutable fixture; compare schema, aggregate counts, safe digests, financial invariants, and restore behavior | Reproducible reconciliation and tested recovery evidence | Source / isolated fixture; production inventory remains separately gated |
| G7 — Production cutover | Freeze the source writer, take and verify an immutable backup, apply the exact reviewed migration, reconcile, and switch one authoritative writer | Exact Risk A approval, backup identity, migration identity, validation receipt, and rollback/forward-recovery readiness | **Risk A; not authorized by this decision** |
| G8 — Post-cutover recovery | Prove D1 export/restore, RPO/RTO, and recovery of writes accepted after cutover | Tested recovery evidence and explicit recovery decision | Separate Risk A gate |

The existing SQLite snapshot/restore contract in `docs/CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md` applies only to the current SQLite file and its WAL/service-custody procedure. It is not a D1 backup or restore runbook. A future D1 plan must separately validate Time Travel, export/backup retention (including any proposed R2 use), restore, and post-restore reconciliation. No R2 resource or backup schedule is created by this decision.

## Current go / no-go

- **GO:** architecture direction, repository documentation, source-level route/schema inventory, and local synthetic D1/Worker compatibility work.
- **NO-GO:** remote D1 creation, Worker production routes, Cloudflare secrets, DNS/custom-domain changes, production database inventory, real-data migration, payment/provider activation, BWH runtime mutation, and production cutover until their separate gates are approved.
- **Current source of truth:** existing Node/Express + SQLite remains authoritative until a completed Risk A cutover. No dual write and no early traffic split.
- **Initial D1 scope:** one database corresponding to shared `control.sqlite`. No database-per-domain split.
- **Out of first scope:** `subscriptions.sqlite`, the optional third-party subscription database, and all raw edge credential material.

## References

Repository contracts:

- [Cloudflare Public Site CI](CLOUDFLARE_PUBLIC_SITE_CI.md)
- [Single Control Plane / Multi Data-Plane Plan](SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md)
- [Project Context](PROJECT_CONTEXT.md)
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
