# Cloudflare Workers + D1 Control-Plane Architecture Decision

Last updated: 2026-11-06, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: cloudflare_workers_d1_control_plane
  superseded_by: null
  last_verified_at: 2026-11-06
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

The preferred initial communication pattern is **BWH-initiated authenticated polling or another explicitly reviewed outbound agent channel**. Do not expose a new inbound management port on BWH as a shortcut. The exact agent authentication, replay protection, command lease, acknowledgement, retry, and receipt protocol remains a source-design task. The G1-30 communication and material-custody text is finalized but **pending the owner's formal approval**; it is not an approved implementation contract.

### Rendering and desired-state phase boundary

The JP-01 #826 GitHub Orchestrator / BWH Renderer / Node Renderer dual-side arrangement describes the **current-phase JP-01 rollout contract only**. It does not define the future Workers + D1 renderer data-source contract. In the future phase, Worker-side desired-state authority and BWH/node-side rendering execution must be connected by a separate reviewed handoff contract. Do not assume that the current BWH-local SQLite renderer read or the #826 Dual-Side Gate automatically carries over after cutover. This architecture decision does not authorize that renderer transition.

## Current repository boundaries

The following paths and ownership were read from `server/state.mjs` and the current store implementations at the source cutoff above.

| Store | Current path selection | Current responsibility | Target treatment |
| --- | --- | --- | --- |
| Control database | `SUBSCRIPTION_CONTROL_DB_PATH`, then `CONTROL_DB_PATH`, otherwise `.proxy-gateway/control.sqlite` | Shared business-control state; Wallet, Commerce, Payment, Ads Consent, and platform control stores receive the shared path | **First D1 target**, one database |
| Subscription runtime database | `SUBSCRIPTION_DB_PATH`, otherwise `.proxy-gateway/subscriptions.sqlite` | Technical tenant, audit, temporary-link, and subscription-artifact state | Excluded from first D1 cutover; resolve ownership and route dependencies before moving subscription-rendering APIs |
| Optional third-party subscription database | `THIRD_PARTY_SUBSCRIPTION_DB_PATH` | Third-party subscription source and distribution state | Remains separate pending its own dependency, authority, and transaction review |
| Edge credential-material file store | Configured protected file path | Actual per-order runtime material, including protocol UUID/password values | Remains in protected BWH custody; never copy raw material into D1 |

The shared `controlDbPath` is passed to the platform subscription-control store and to the Coins Wallet, Coins Commerce, Payment, and Ads Consent stores, among other control-plane components. Those domains must remain within one D1 transaction boundary unless a future architecture decision proves an alternative consistency model.

The control database includes the business-control tables documented in `docs/SUBSCRIPTION_CONTROL_DATABASE.md`, including accounts, entitlements, issuance requests, issued-link references, quota counters, device bindings, revocations, audit events, and edge desired-state / receipt coordination. Additional source-owned modules add wallet, commerce, payment, portal, referral, usage, and authority objects. This is a domain summary, not an exhaustive schema inventory. For the source-level table detail, use `docs/CONTROL_DATABASE_SCHEMA_MATRIX.md`: its 48-table core slice plus the six G1-21–G1-26 companion annexes in §6 complete the 70-table integrated inventory. This inventory does not establish which optional or archival tables are present in production.

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

The source SQLite control store is **not** a safe-reference-only database. The `assertNoUnsafeFields()` helper is an input-shape guard invoked by selected store APIs (including account, entitlement, issuance, audit, quota/device, and edge-agent operations); it rejects configured key-name fragments only on those call paths. It is not a SQL constraint, a table-wide scan, a value-level PII detector, or a guarantee that every write path excludes raw data. `assertNoUnsafeControlValues()` is narrower still: it validates metadata passed through `edgeRegisteredNodeRecord()`. Neither helper is applied by `upsertLead()`, `upsertPortalAccessRequest()`, or `createPortalTotpCredential()`.

The current source schema and write paths contain these explicit exceptions:

| Source table / columns | Current source behavior and classification | Target D1 disposition |
| --- | --- | --- |
| `platform_leads.email`, `platform_leads.message` | `upsertLead()` stores the email address and free-text message in text columns. These are direct contact and free-text PII. The current lead-review queue assigns a 90-day expiry and purges expired leads. | Do not copy raw email or message into the D1 control rows. D1 may retain opaque lead/contact references and non-sensitive workflow state. The raw values require a separately approved PII custody store outside D1; its exact service/location is not selected by this document. Preserve the current 90-day expiry unless a separate retention decision changes it. |
| `platform_portal_access_requests.subscription_url` | `upsertPortalAccessRequest()` stores the supplied URL as text. Treat it as secret-bearing subscription material unless proven otherwise. | Exclude the raw URL from D1, Worker payloads, and logs. Keep the material in BWH protected storage or another separately approved secret store; D1 may retain only an opaque material reference/digest and lifecycle state. Define access, expiry, revocation, rotation, and recovery before migration. |
| `platform_portal_totp_credentials.encrypted_totp_secret` | The Portal auth path stores a protected TOTP value. New repository-generated credentials use `v2:aes-256-gcm:*` when the 32-byte `USER_PORTAL_TOTP_SECRET_KEY` is configured outside the repository. Legacy `enc:<base32>` values remain readable for compatibility but are **not encrypted**. | Keep both the TOTP secret and its encrypted blob out of D1 under the current secret-custody rule. Store them in a dedicated credential store with the key outside D1; D1 may retain an opaque credential reference, status, failure/lock counters, and lifecycle timestamps. Legacy values require an explicit re-enrollment, re-protection, or other approved disposition before migration. |

These are source-schema exceptions, not evidence that a target PII/credential store has already been provisioned. Until each field has an approved destination, access policy, encryption/key-custody contract, retention/deletion behavior, and restore/rollback procedure, exclude it from automatic source-to-D1 mapping. Do not copy the source tables unchanged into D1 or infer that the input guard makes that safe. The existing SQLite source remains authoritative until the separate Risk A cutover; this document does not authorize row export, data movement, resource creation, or production migration.

Source evidence: `server/services/platform/subscription-control-db.mjs` (the guard and the three writers), `server/services/platform/lead-review-queue.mjs` (lead retention), and `docs/USER_PORTAL_AUTH_BOUNDARY.md` (TOTP key and legacy-format boundary).

The protected edge credential-material store is separate from the control database. Its current file implementation serializes records containing UUID/password material and applies owner-only directory/file permissions; the module does not provide application-layer encryption. This decision does not upload, copy, or migrate that material. Any future change in credential custody requires a separate threat model, key-management decision, access policy, rotation plan, and Risk A approval.

Worker authentication and authorization must preserve the current account, session, Admin, Portal, and agent trust boundaries. The design must specify cookie/session protections, CSRF controls where applicable, rate limiting, credential storage, token rotation, replay protection for agents, and redacted audit/observability. Secrets belong only in an approved secret-management surface, never in D1 rows, source, logs, or PR evidence.

Historical runtime identities, stale identity-map entries, and traffic-accounting history are not migration cleanup candidates. Preserve stable references and historical ledger facts. Do not reclassify, rotate, activate, or delete Japan/other node identities as part of this migration. Any change to runtime-principal bindings or protected material remains subject to `docs/IDENTITY_LIFECYCLE.md` and its separate Identity Gate / retention process.

Never put raw SQLite rows, customer data, runtime UUIDs, passwords, tokens, subscription URLs, raw configs, private logs, or secret values in this document, PR description, test output, or migration evidence. Use aggregate counts, safe references, and non-reversible digests only where the approved validation contract permits them.

## Phased implementation and migration gates

The owner decision authorizes the target direction and source-level design work. The sequence below is the implementation order; it does not authorize remote resource creation or production mutation.

| Gate | Required work | Exit evidence | Authority |
| --- | --- | --- | --- |
| G0 — Architecture direction | **Approved 2026-11-04:** Workers control-plane API + one D1 control database; BWH remains data plane | This decision record and updated Cloudflare boundary/context docs | Completed |
| G1 — Source inventory | Map all control-plane routes, stores, schemas, migration IDs/checksums, indexes, triggers, foreign keys, transaction participants, and data ownership | Exact-source inventory and dependency map; G1-F independent review declared passed by Yi on 2026-11-05; no customer rows or secret output | Source-level G1 complete; production DB inventory still needs separate Risk A approval |
| G2 — Local D1 compatibility spike | Use local D1 and synthetic fixtures only; test schema SQL, constraints, batches, sessions, pagination, migration ledger, and representative transaction patterns | Repeatable tests and parity report; no remote Cloudflare resource or production data | **ACCEPTED WITH DOCUMENTED LIMITATIONS** on 2026-11-06; see the evidence index and dated acceptance record. This is not full D1 equivalence or migration approval. |
| G3 — Worker API vertical slice | Implement a narrow Worker API and async D1 repository; begin with a safe read-only projection, then prove one bounded write flow with synthetic data | API contract tests, auth/redaction tests, transaction and failure tests | **Local source slice merged:** #831 read API + #833 bounded idempotent write; Worker suite 30/30 on the #833 head. Synthetic D1 only; not deployed. |
| G4 — BWH agent contract | Implement synthetic outbound polling, scoped command delivery, idempotent acknowledgement, retry/lease behavior, and redacted receipts | Protocol contract tests; no live node or runtime material | **Local Agent + Worker source contracts merged:** #834 Agent-side and #838 Worker endpoints. Worker Miniflare D1 suite passed on the exact #838 source head. No BWH connection, systemd installation, or deployment. |
| G5 — Remote staging | Create a non-production Worker/D1 environment, secrets, bindings, and isolated route only after exact approval | Resource inventory, access boundary, staging validation, cost/retention plan | Separate explicit Cloudflare account/resource approval |
| G6 — Offline migration rehearsal | Use synthetic or separately approved immutable fixture; compare schema, aggregate counts, safe digests, financial invariants, and restore behavior | Reproducible reconciliation and tested recovery evidence | Source / isolated fixture; production inventory remains separately gated |
| G7 — Production cutover | Freeze the source writer, take and verify an immutable backup, apply the exact reviewed migration, reconcile, and switch one authoritative writer | Exact Risk A approval, backup identity, migration identity, validation receipt, and rollback/forward-recovery readiness | **Risk A; not authorized by this decision** |
| G8 — Post-cutover recovery | Prove D1 export/restore, RPO/RTO, and recovery of writes accepted after cutover | Tested recovery evidence and explicit recovery decision | Separate Risk A gate |


## 2026-11-05 PST / 2026-11-06 UTC — Source-only implementation progress

This dated addendum supersedes the earlier G2/G3/G4 progress assumptions in the original gate table. It records repository evidence only; it does not promote a source slice to a remote runtime or production state.

| Gate | Current source evidence | Current status |
| --- | --- | --- |
| G2 — Local D1 compatibility | The Rev2 compatibility report records the local synthetic dual-engine results, including the 57/56/1 transaction correction and the 39-item pagination probe. The evidence index is [G2_D1_COMPATIBILITY_EVIDENCE_INDEX_2026-11-05.md](G2_D1_COMPATIBILITY_EVIDENCE_INDEX_2026-11-05.md). | **HOLD FOR CLOSEOUT / core compatibility conditions passed / total gate not closed.** This is not a G2 PASS or migration approval. |
| G2-C1 — Scheme C source migration | [PR #832](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/832) merged the source migration 20261105_001_coin_commerce_initial_confirmation_guard_plan_c at 5c1bccb526d49d45056d2b8780464e0d091b30c4. | Source migration is in master. No persistent SQLite or remote D1 apply was performed. |
| G3 — Worker local vertical slice | [PR #831](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/831) added the read API; [PR #833](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/833) added the bounded idempotent write. The Worker suite is 30/30 on the #833 head; its Worker CI and applicable root CI jobs succeeded. | **Local source slice complete.** Synthetic D1 only; no remote Worker/D1, production route, or data cutover. |
| G4 — BWH Agent HTTPS contract | [PR #834](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/834) merged the Agent-side contract. Its final reviewed head was 733d5888ca7e4ff8bed88a4174c5283099b54724; merge commit is 42db751defaaf9e1d24906cd03b7a4d4856aad30. The 22 contract tests and stub-control-plane smoke passed; six P2 findings were remediated before merge. | **Agent-side contract source complete; Worker-side /v1/agent/desired-state and /v1/agent/receipts remain open.** No BWH connection or systemd installation. |
| G5 — Remote staging | No remote Worker/D1 resource, secret, binding, route, or Cloudflare account configuration is created by the source PRs above. | Not started; requires a separate exact Cloudflare resource approval. |
| G6–G8 | Offline migration rehearsal, production cutover, and post-cutover recovery remain separate gates. | Not authorized by the source evidence above. |

At this update, master is 42db751defaaf9e1d24906cd03b7a4d4856aad30. The G2 test baseline 63082bae5d980c3905d6e7405329b19e6c4e38ac remains the historical source cutoff for the G2 dual-engine evidence; it must not be rewritten as the current master.

The current production authority remains Node/Express + SQLite. No remote Cloudflare D1/Worker was created or deployed; no production secret, route, DNS, BWH connection, production database read/write, migration apply, or traffic switch occurred. Passing source CI does not authorize any of those actions.

## 2026-11-06 PST / 2026-11-06 UTC — G2 acceptance and G4 source integration closeout

This dated status supersedes the earlier G2/G3/G4 status assumptions above and in the 2026-11-05 addendum. It records source and local synthetic evidence only; it does not authorize remote staging or production work.

| Gate | Current evidence | Current status |
| --- | --- | --- |
| G2 — Local D1 compatibility | PR [#836](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/836) merged as `c50dc1df0d6b8e28d15e0bc8c53a11cbe86ffb40`; closeout Issue [#830](https://github.com/FlyLink-com/proxy-gateway-minimal/issues/830) closed. Accepted scope is the Rev2 report, stages 1–7 receipts, and local Wrangler/Miniflare D1 synthetic validation. | **ACCEPTED WITH DOCUMENTED LIMITATIONS.** Not full D1 equivalence and not production migration approval. Limits: FK 68 PASS / 58 attribution-limited; CHECK 246 PASS / 27 attribution-limited; 60 ordinary full indexes definition-only; multi-replica `withSession()` and concurrent-write pagination snapshot semantics unverified; G1-29 cross-database subscription fulfillment outside scope; production migration set remains `not_observed`. |
| G3 — Worker API vertical slice | [#831](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/831) read API and [#833](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/833) bounded idempotent write are merged. Worker suite 30/30 was recorded on the #833 head. | Local synthetic D1 source slice complete; no remote Worker/D1, production route, or data cutover. |
| G4 — BWH Agent contract | [#834](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/834) merged Agent-side contract; [#838](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/838) merged Worker-side `/v1/agent/desired-state` and `/v1/agent/receipts`. Worker Miniflare D1 suite [Run 42212113001](https://github.com/FlyLink-com/proxy-gateway-minimal/actions/runs/42212113001) succeeded on the exact #838 source head. Master CI [Run 42216358621](https://github.com/FlyLink-com/proxy-gateway-minimal/actions/runs/42216358621) succeeded on merge commit `c8336ae6b0112ed3fb823d6bec29e1b34ad2a9fb`. | Local Agent ↔ Worker ↔ D1 synthetic contract source is merged. No BWH connection, Agent installation, timer activation, remote D1/Worker, or deployment. |
| G5 — Remote staging | No remote Worker/D1, Cloudflare secret, binding, route, or account setting has been created by these source changes. | Not started; requires separate exact Cloudflare account/resource approval and a staging access/cost/retention plan. |
| G6 — Offline migration rehearsal | No production data or production database inventory was used in the local G2/G3/G4 work. | Separate offline/immutable-fixture plan and evidence still required. |
| G7 — Production cutover | Existing Node/Express + SQLite remains the production control-plane authority. | Risk A; not authorized. No dual write or traffic split. |
| G8 — Post-cutover recovery | No D1 production cutover has occurred. | Separate recovery design, restore rehearsal, and Risk A decision required. |

Current master at this record is `c8336ae6b0112ed3fb823d6bec29e1b34ad2a9fb`. The G2 test baseline `63082bae5d980c3905d6e7405329b19e6c4e38ac` remains the historical source cutoff for the G2 compatibility evidence and is not rewritten as the current master.

The open [PR #837](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/837) is a separate test-only correction to align AGT-POLL-2 with the approved G1-30 rule that 60 seconds is a design target, not a hard-coded production timer fact. It does not change Agent runtime behavior or configure/activate a timer; its exact-head CI and independent review are pending.

Production boundary remains unchanged: Node/Express + SQLite is the single production writer; no remote D1/Worker, production secrets, BWH/SSH, production data read/write, DNS, deployment, systemd installation, or traffic cutover occurred. Never infer production authority from local Miniflare tests or a source merge.

### Gate numbering across the G1 workstream and this architecture plan

The `G0`–`G8` labels above are Cloudflare architecture stages. They are **not interchangeable** with the separate G1-E / G1-F workstream labels:

- Workstream **G1** (source inventory, including G1-F independent review) corresponds to this plan's **G1 — Source inventory**.
- A separate workstream **G2 release decision** authorizes only entry into this plan's **G2 — Local D1 compatibility spike**, using local synthetic data.
- Passing the workstream G2 spike does **not** authorize this plan's G3–G8 stages. In particular, **G7 production cutover remains a separate Risk A decision**.

The existing SQLite snapshot/restore contract in `docs/CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md` applies only to the current SQLite file and its WAL/service-custody procedure. It is not a D1 backup or restore runbook. A future D1 plan must separately validate Time Travel, export/backup retention (including any proposed R2 use), restore, and post-restore reconciliation. No R2 resource or backup schedule is created by this decision.

## Current go / no-go

- **GO:** architecture direction, repository documentation, source-level route/schema inventory, and repository-only Worker/Agent implementation with local synthetic data. G2 is **ACCEPTED WITH DOCUMENTED LIMITATIONS**; G3 and G4 source slices are merged. These are source/local-simulation results only.
- **NO-GO:** G5 remote Worker/D1 staging, Cloudflare secrets/bindings/routes, DNS/custom-domain changes, production database inventory, real-data migration, payment/provider activation, BWH access/runtime mutation, and production cutover until their separate exact approvals are granted.
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
