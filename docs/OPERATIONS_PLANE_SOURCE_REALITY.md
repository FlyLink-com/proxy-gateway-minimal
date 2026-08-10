# Operations Plane Source Reality

> Status:
> - GitHub: #561 under #557
> - Source evidence cutoff: `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`
> - Source evidence observed: 2026-08-09
> - Prior inventory ref: `master@1b41a63337271cf1d5f0553ef4e3a61c3190e5e5`
> - Inventory type: repository source and test evidence only
> - Risk: C
> - Production/runtime authority: none
> - Live verification: not performed

This document reconciles GCC Operations Plane planning with the source that
already exists. It prevents a new Operations issue from rebuilding Admin,
Wallet, Commerce, traffic, or safe-read capabilities that are already present.

It does not prove that a source capability is included in a deployed artifact,
that a migration was applied, that a default-off path was enabled or configured,
that production data exists, or that the capability is active at runtime.
Release and live state remain owned by `docs/CURRENT_RELEASE_STATE.md` plus
fresh approved evidence. Open Draft PRs #592-#594 are outside this cutoff.

## State Vocabulary

| State | Meaning |
| --- | --- |
| `implemented_source` | Source and focused tests establish the capability. |
| `implemented_source_not_deployed` | Source exists, but matching deployment evidence is absent or explicitly excluded. |
| `partial` | A usable foundation exists, but a named invariant or consumer is missing. |
| `fixture_or_static_only` | The frontend model or fixture exists without a proven backend-owned fact source. |
| `document_only` | A reviewed contract or plan exists without matching implementation evidence. |
| `missing` | The inventory did not establish the requested capability. |
| `production_unknown` | Repository evidence cannot prove current live state. |

## Capability Matrix

| Capability | Source and test evidence | Current consumer | Source state | Remaining gap |
| --- | --- | --- | --- | --- |
| Admin bootstrap, TOTP enrollment, login challenge, session cookie, expiry, session status, and logout | `server/services/platform/admin-auth.mjs`, `server/routes/admin-auth.mjs`, `server/tests/platform-admin-auth.test.mjs`, `server/tests/admin-auth-routes.test.mjs` | Backend `/api/admin-auth/*` route family only | `implemented_source` | `admin/src` does not call `/api/admin-auth/*`; `admin/src/App.tsx` still uses the console-token path. Frontend login integration, durable operator ownership, deployment identity, and runtime activation remain unproven. |
| Admin login/TOTP abuse control | `server/routes/admin-auth.mjs` and Admin auth route tests | Public Admin-auth routes | `implemented_source` | Production configuration and current runtime behavior remain separate evidence. |
| Explicit Admin roles and read capabilities | `server/services/platform/admin-authorization.mjs`, `server/middleware/admin-authorization.mjs`, `server/tests/platform-admin-authorization.test.mjs`, Admin route tests | Capability-protected Operations Overview routes | `partial`, default-off | Backend roles `admin` and `super_admin` receive the seven shared `*.read` capabilities; `super_admin` also receives `audit.read`. `ADMIN_AUTHORIZATION_ENABLED` is default-off and only bounded routes enforce it. This backend model is distinct from frontend manifest permissions. Complete route coverage and mutation authority are missing. |
| Multi-operator administration and high-risk step-up | Relationship/DTO planning only | Future privileged Operations workflows | `document_only` | Prove product need and existing store gaps before adding source. |
| Admin shell, app manifest, navigation, System Search, and module registration | `admin/src/app/admin-app-manifest.ts`, `admin/src/app/navigation.ts`, search/manifest/navigation tests | Admin React/Vite shell | `implemented_source` | Reconcile current registered apps with older planned/locked app tables. |
| Safe-read projection and table query contracts | `admin/src/app/admin-safe-read-projection.ts`, `admin/src/app/admin-safe-read-page-model.ts`, `admin/src/app/admin-table-query-state.ts`, focused tests | Operations Overview, Accounts & Resources, Usage & Channels owner models | `implemented_source` | Identify which projections consume backend facts and which still use fixture/static input. |
| Operations Overview owner model | `admin/src/app/operations-overview-owner-model.ts`, `admin/src/test/operations-overview-owner-model.test.ts` | Admin Operations Overview | `implemented_source` | Backend ownership and metric definitions are incomplete for some displayed summaries. |
| Accounts & Resources owner model | `admin/src/app/accounts-resources-owner-model.ts` and safe-read model tests | Admin account/resource workspace | `implemented_source` | Reconcile live DTO coverage, account privacy fields, and lifecycle ownership with #438. |
| Usage & Channels owner model | `admin/src/app/usage-channels-owner-model.ts` and focused tests | Admin monitoring workspace model | `implemented_source` | It does not fetch the collector-status route; displayed collector/receipt facts remain static or injected until a frontend adapter is implemented. |
| Protected traffic collector projection | `server/services/platform/traffic-collector-admin-projection.mjs`, `server/routes/admin-platform.mjs`, `server/tests/traffic-collector-admin-projection.test.mjs` | Protected `/api/admin/platform/traffic-collector-status` route | `implemented_source` | No `admin/src` consumer is established at this cutoff. Runtime freshness, deployment identity, and accounting completeness remain separate evidence. |
| Coin Wallet projection, Coin Ledger reads, and reference indexes | `server/services/platform/coin-wallet-store.mjs`, `server/services/platform/coin-wallet-reference-index-migrations.mjs`, `server/routes/portal-coin-wallet.mjs`, focused Wallet/reference-index/route tests | Authenticated Portal Wallet and domain stores | `implemented_source_not_deployed` | Coin Ledger is immutable financial fact and Wallet is its projection. Migration apply, deployed identity, production balances, and settlement are not established. |
| Coin Commerce order flow | Coin Commerce domain/store/coordinator/routes and focused tests | Authenticated Portal Marketplace and Orders | `implemented_source_not_deployed` | Source establishes Offer -> Checkout Quote -> Commerce Order -> Fulfillment Command. A Commerce Order spends Coins for a product; it is not a Recharge/Payment Order. Production catalog, schema apply, fulfillment activation, and runtime expiry remain separate Gates. |
| Account Resource Authority and Commerce binding | `server/services/platform/account-resource-authority*.mjs`, Account Resource Authority migrations, Commerce authority tests, `docs/ACCOUNT_RESOURCE_AUTHORITY_LIFECYCLE.md` | Default-off Coin Commerce authority selection | `implemented_source_not_deployed` | The authority selects an exact request + entitlement + issued-link/version triad and preserves immutable Quote provenance. It is not merely the current active lifecycle row. Schema apply, account assignment, deployment, and activation are unproven. |
| Portal Wallet, Commerce Orders, and Recharge UI integration | `admin/src/features/user-portal/{wallet,commerce,recharge}`, Portal panels, clients, and focused tests | Portal source | `implemented_source_not_deployed` | Current live Portal identity, deployed runtime configuration, real return/callback behavior, and production data remain unverified. |
| Durable provider-neutral Recharge/Payment | Payment Store/migrations, recharge coordinator, Portal recharge route, Wallet transaction participant, and focused tests | Default-off Portal Recharge source path | `implemented_source_not_deployed` | Source can converge normalized capture/callback evidence and credit `paid_coins` exactly once. Production migration, provider proof, callback ingress, credential binding, Wallet mutation, refund, and reconciliation are not established. |
| PayPal Sandbox, XSD, and ChaoJiPay provider assembly | Static registry, provider codecs/runtimes/adapters, `server/state.mjs`, HTTP settlement and state tests | Default-off Recharge runtime assembly | `implemented_source_not_deployed`, default-off | Recharge requires `PLATFORM_COIN_RECHARGE_ENABLED` and exactly one provider flag. Source support is not evidence of a credential, merchant, live call, callback registration, settlement, or production activation. Refund/reconcile remain disabled. |
| Generic Operations response envelope and full DTO family | `docs/ADMIN_BACKEND_DTO_CONTRACT.md` plus several partial source consumers | Planned Admin backend integration | `partial` | Map each DTO to implemented backend fact, static fixture, or missing endpoint before adding code. |
| Commercial Dashboard metrics | Operations frontend models and DTO documents | Planned commercial-pilot Dashboard | `fixture_or_static_only` / `partial` | Establish domain-owned definitions, freshness, denominators, settlement status, and deterministic drill-down. |
| Admin action audit trail | Audit-oriented planning documents; no generic actor/capability/action result store established by this inventory | Future controlled Operations mutations | `missing` | Define append-only audit ownership after inventorying existing mutation receipts and domain histories. |
| Generic `platform_operations_events` store | Explicitly excluded by `docs/LEAD_DURABILITY_SCHEMA_GATE.md` | None | `missing` | Do not cite #475 as implementation evidence. Add only if a later proven invariant requires it. |
| Lead durability | `platform_leads` gate and retention source with `server/tests/platform-lead-retention-operations.test.mjs`, `server/tests/platform-lead-review-queue.test.mjs`, `server/tests/platform-lead-routes.test.mjs`, and `server/tests/public-leads.test.mjs` | Lead review queue | `implemented_source` with separately recorded production history | Keep Lead private-data retention separate from Admin action audit and Coin Ledger. |
| Runtime/node operational mutations | Governed repair, release, and runtime planning/receipts | Control Plane and runtime owners | `partial` | Operations Plane may show safe facts, but node restart/config/apply remains separately gated Risk A authority. |

## Important Separations

### Source, Artifact, Deployment, And Runtime

Use four independent statements:

```text
source_state
artifact_state
deployment_state
runtime_state
```

A source test does not prove an artifact. An artifact does not prove deployment.
A deployment record does not prove current runtime state. A UI model does not
prove a backend fact source.

### Financial Truth

```text
verified provider fact
  -> Recharge/Payment Order and immutable Payment Receipt
  -> paid_coins Coin Ledger posting

Offer -> Checkout Quote -> Commerce Order
  -> Coin Hold/capture -> Fulfillment Command/result
  -> Coin Ledger posting

Coin Ledger
  -> Operations projection
```

Coin Ledger entries and provider-normalized Payment Receipts are financial
facts; Coin Wallet balance is a projection. A Recharge/Payment Order buys paid
Coins, while a Commerce Order spends Coins for a product. Traffic usage samples
and rollups are accounting evidence, not the Coin Ledger. Dashboard metrics are
aggregates. Admin audit records who requested, approved, or executed an
operation; it is not a replacement for Payment, Commerce Order, Coin Ledger,
or traffic evidence.

### Operational Events And Audit

Keep these domains distinct:

| Domain | Purpose |
| --- | --- |
| Coin Ledger | Immutable paid/bonus/reward Coin movement and reversals. |
| Recharge/Payment Order and Receipt | Fiat-to-paid-Coins lifecycle and normalized provider facts. |
| Commerce Order and Fulfillment | Coins-for-product lifecycle and delivery commands/results. |
| Traffic accounting evidence | Per-credential usage samples, rollups, quota decisions, and collector status. |
| Runtime receipts | Runtime apply/reconcile evidence. |
| Lead history | Private Lead review and retention behavior. |
| Admin action audit | Actor, capability, reason, approval, target safe ref, and result. |
| Dashboard projection | Read-only aggregation with freshness and drill-down. |

## Reconciled Documentation Boundary

### Current Release State

`docs/CURRENT_RELEASE_STATE.md` records this exact source cutoff separately from
production evidence. Its 2026-07-20 deployment event and earlier fully
reconciled production snapshot remain dated evidence; neither is silently
promoted to current-live identity without a fresh Risk A inventory.

### Admin Backend DTO Contract

The full proposed DTO family remains a design contract, while bounded source
implementations now exist. Its current addendum distinguishes backend auth and
partial authorization, safe-read models, the unconsumed collector route,
Wallet/Commerce/Recharge reads, and missing DTO families.

### Admin App And Relationship Documents

The manifest is the frontend registration source of truth. Its `view`/
`inspect` vocabulary is not the backend `*.read` capability model. Static
registration or frontend visibility does not establish backend authorization,
and a backend route does not establish a frontend consumer.

### Operations Foundation

The accepted Lead durability boundary explicitly declined the proposed generic
Operations event table. #475 supplies Lead durability history and governance
context, not a reusable Admin audit store.

## Remaining Operations Plane Work

After this reconciliation, the proven next gaps are:

1. Integrate the Admin frontend with the existing `/api/admin-auth/*` session
   boundary, then complete backend route coverage without conflating frontend
   manifest permissions with backend capabilities.
2. Connect existing safe-read models to backend-owned facts, including an
   explicit Usage & Channels adapter for the collector route, and keep
   static/fixture areas explicit.
3. Define commercial metric contracts only after Payment, Order, Fulfillment,
   Wallet, and traffic truth owners are established.
4. Establish a privacy-bounded Admin action audit contract before enabling
   Operations mutations.
5. Add user/payment/Coins/catalog operational workflows as narrow consumers of
   existing domain commands.
6. Build the pilot Dashboard last, from versioned facts with freshness and
   drill-down; never merge Coin Ledger, Payment, Commerce, and traffic evidence
   into one ambiguous "ledger" model.

## Issue Mapping

| Issue | Corrected role |
| --- | --- |
| #557 | Operations Plane v1 parent and sequencing boundary. |
| #561 | Current source/document reconciliation; first Operations documentation slice. |
| #558 | Reconcile existing Admin auth and add only missing RBAC/capability behavior. |
| #559 | Reconcile existing read models and complete only missing metric contracts. |
| #560 | Reconcile existing event/receipt facts and establish the missing Admin action audit trail. |
| #437 | Remains the active traffic-accounting business lane. |
| #438 | Owns account/resource lifecycle truth. |
| #439 | Owns provider-neutral commercial foundation. |
| #524 | Owns durable Coins settlement, fulfillment, and runtime-expiry activation. |

## Validation Boundary

This document is complete only when:

- every implemented claim is backed by source plus focused tests;
- every deployment/runtime claim remains linked to independent evidence;
- static/fixture data is not presented as a backend fact;
- stale documents link here or carry a reconciliation addendum;
- #557–#560 target only proven gaps;
- documentation authority checks, project-state checks, diff checks, and
  relevant repository validation pass in CI.

No statement in this document authorizes production, provider, credential,
schema, payment, wallet, account, node, runtime, artifact, deployment, or live
verification work.

## Prior Cutoff: 2026-07-31 Post-Merge Source Reconciliation

This retained addendum records repository source progress at its dated cutoff.
The 2026-08-09 matrix above supersedes it for current source planning. It does
not establish artifact, deployment, configuration, or live-runtime state.

### Operations Overview Read Envelope

PR #566 is merged. Its source head was
`cf0e945e6814d425ae6a4a6d896e3e76894c6b58`, and the corresponding master
merge commit is `b4125acd543c422e854ba142e3a2bfc227470012`.
Comparing that PR head with the merge commit yields zero file changes; the
merge commit is one commit ahead. PR-head CI #1357 passed. No separate
merge-commit CI run is claimed here.

The first versioned Operations Overview Envelope source slice is now
`implemented_source`:

- `GET /api/admin/operations/overview`;
- route registration gated by the Admin authorization feature flag;
- required capability `operations.read`;
- Subscription Owner counts allowlisted to exactly `total`, `active`,
  `expiring`, and `disabledOrExpired`;
- successful HTTP 200 responses use the versioned Operations read Envelope.

This establishes a read-only Admin capability and Envelope implementation in
repository source. `ADMIN_AUTHORIZATION_ENABLED` remains default-off, and
this reconciliation has not verified production deployment or activated the
authorization path in production.

### Merged Follow-Up And Remaining Scope

PR #567 is merged. Its source head was
`bc5b33f8ee2f8b2354593558f3035caf3a4cafda`, and the corresponding master
merge commit is `1429ed7ca398e8ec622bfcbcc1fd565aa085b736`.
Comparing that source head with the merge commit yields zero file changes; the
merge commit is one commit ahead. PR-head CI #1360 passed and independent
review passed. This establishes the real `createApp()` HTTP 401 contract and
its integration coverage in repository source; it does not prove deployment or
production authorization activation.

Issue #559 remains open and partial. The complete Operations DTO and metrics
family, domain-owned definitions, freshness and denominator contracts,
financial reconciliation, and deterministic drill-down coverage are not
completed by the first Overview slice.

Repository source recorded by this reconciliation now includes both the
versioned Operations Overview Envelope and the merged real-`createApp()` HTTP
401 integration coverage for both capability-protected Overview paths. No production authorization flag, environment,
deployment, artifact, provider, credential, schema, payment, Wallet, Runtime,
or node state was changed or activated by this Risk C reconciliation.
