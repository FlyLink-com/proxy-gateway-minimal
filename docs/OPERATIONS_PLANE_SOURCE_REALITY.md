# Operations Plane Source Reality

> Status:
> - GitHub: #561 under #557
> - Inventory ref: `master@1b41a63337271cf1d5f0553ef4e3a61c3190e5e5`
> - Inventory type: repository source and test evidence only
> - Risk: C
> - Production/runtime authority: none
> - Live verification: not performed

This document reconciles GCC Operations Plane planning with the source that
already exists. It prevents a new Operations issue from rebuilding Admin,
Wallet, Commerce, traffic, or safe-read capabilities that are already present.

It does not prove that a source capability is deployed, configured, populated
with production data, or active at runtime. Release and live state remain owned
by `docs/CURRENT_RELEASE_STATE.md` plus fresh approved evidence.

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
| Admin bootstrap, TOTP enrollment, login challenge, session cookie, expiry, session status, and logout | `server/services/platform/admin-auth.mjs`, `server/routes/admin-auth.mjs`, `server/tests/platform-admin-auth.test.mjs`, `server/tests/admin-auth-routes.test.mjs` | Protected Admin entry and session gateway | `implemented_source` | Reconcile which auth composition is active, its durable operator/credential ownership, and its deployment identity. |
| Admin login/TOTP abuse control | `server/routes/admin-auth.mjs` and Admin auth route tests | Public Admin-auth routes | `implemented_source` | Production configuration and current runtime behavior remain separate evidence. |
| Explicit Admin roles and capability enforcement | App-manifest permission planning and DTO relationship documents; no general backend capability checker established by this inventory | Future Operations reads and mutations | `partial` | Define role-to-capability rules, enforce them in backend routes, and separate read from mutation authority. |
| Multi-operator administration and high-risk step-up | Relationship/DTO planning only | Future privileged Operations workflows | `document_only` | Prove product need and existing store gaps before adding source. |
| Admin shell, app manifest, navigation, System Search, and module registration | `admin/src/app/admin-app-manifest.ts`, `admin/src/app/navigation.ts`, search/manifest/navigation tests | Admin React/Vite shell | `implemented_source` | Reconcile current registered apps with older planned/locked app tables. |
| Safe-read projection and table query contracts | `admin/src/app/admin-safe-read-projection.ts`, `admin/src/app/admin-safe-read-page-model.ts`, `admin/src/app/admin-table-query-state.ts`, focused tests | Operations Overview, Accounts & Resources, Usage & Channels owner models | `implemented_source` | Identify which projections consume backend facts and which still use fixture/static input. |
| Operations Overview owner model | `admin/src/app/operations-overview-owner-model.ts`, `admin/src/test/operations-overview-owner-model.test.ts` | Admin Operations Overview | `implemented_source` | Backend ownership and metric definitions are incomplete for some displayed summaries. |
| Accounts & Resources owner model | `admin/src/app/accounts-resources-owner-model.ts` and safe-read model tests | Admin account/resource workspace | `implemented_source` | Reconcile live DTO coverage, account privacy fields, and lifecycle ownership with #438. |
| Usage & Channels owner model | `admin/src/app/usage-channels-owner-model.ts` and safe-read model tests | Admin monitoring workspace | `implemented_source` | Separate static presentation from traffic/receipt facts available through backend routes. |
| Protected traffic collector projection | `server/services/platform/traffic-collector-admin-projection.mjs`, `server/routes/admin-platform.mjs`, `server/tests/traffic-collector-admin-projection.test.mjs` | Protected Admin platform route and monitoring surfaces | `implemented_source` | Runtime freshness, deployment identity, and accounting completeness remain release/runtime evidence, not source claims. |
| Portal Wallet projection and Ledger reads | `server/routes/portal-coin-wallet.mjs`, `server/tests/portal-coin-wallet-routes.test.mjs` | Authenticated Portal Wallet | `implemented_source_not_deployed` | Reconcile artifact/deployment state; no direct balance mutation or production settlement is implied. |
| Coins catalog, quote, consumption order, cancel, list, and detail contracts | Portal Coin Commerce route/store source and `server/tests/portal-coin-commerce-routes.test.mjs` | Authenticated Portal Marketplace and Orders | `implemented_source_not_deployed` | Durable recharge settlement, real provider confirmation, fulfillment, and runtime expiry remain under #524. |
| Portal Wallet and Orders UI integration | `admin/src/features/user-portal/user-portal-page.tsx`, Wallet/Orders panels and tests, `docs/superpowers/specs/2026-07-27-portal-wallet-orders-readonly-design.md` | Portal static source | `implemented_source_not_deployed` | Current live Portal identity must be separately reconciled; recharge-order history remains unavailable without its durable source. |
| Provider-neutral payment capability and named disabled adapters | Payment provider registry/adapters/tests and #439/#524 source records | Future recharge settlement | `partial` | Provider credentials, verified live events, settlement, refund/chargeback execution, and production activation are not established. |
| Generic Operations response envelope and full DTO family | `docs/ADMIN_BACKEND_DTO_CONTRACT.md` plus several partial source consumers | Planned Admin backend integration | `partial` | Map each DTO to implemented backend fact, static fixture, or missing endpoint before adding code. |
| Commercial Dashboard metrics | Operations frontend models and DTO documents | Planned commercial-pilot Dashboard | `fixture_or_static_only` / `partial` | Establish domain-owned definitions, freshness, denominators, settlement status, and deterministic drill-down. |
| Admin action audit trail | Audit-oriented planning documents; no generic actor/capability/action result store established by this inventory | Future controlled Operations mutations | `missing` | Define append-only audit ownership after inventorying existing mutation receipts and domain histories. |
| Generic `platform_operations_events` store | Explicitly excluded by `docs/LEAD_DURABILITY_SCHEMA_GATE.md` | None | `missing` | Do not cite #475 as implementation evidence. Add only if a later proven invariant requires it. |
| Lead durability | `platform_leads` gate, retention scripts/systemd source, and tests described by `docs/LEAD_DURABILITY_SCHEMA_GATE.md` | Lead review queue | `implemented_source` with separately recorded production history | Keep Lead private-data retention separate from Admin action audit and business Ledger. |
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
Payment fact
  -> Order state
  -> Fulfillment command/result
  -> Wallet/Ledger posting
  -> Operations projection
```

The Ledger is the financial fact. Wallet balance is a projection. Dashboard
metrics are aggregates. Admin audit records who requested, approved, or
executed an operation; they are not a replacement for Payment, Order, or Ledger
facts.

### Operational Events And Audit

Keep these domains distinct:

| Domain | Purpose |
| --- | --- |
| Business Ledger | Financial value movement and reversals. |
| Payment/Order events | Commercial lifecycle facts. |
| Runtime receipts | Runtime apply/reconcile evidence. |
| Lead history | Private Lead review and retention behavior. |
| Admin action audit | Actor, capability, reason, approval, target safe ref, and result. |
| Dashboard projection | Read-only aggregation with freshness and drill-down. |

## Documentation Drift Requiring Reconciliation

### Current Release State

`docs/CURRENT_RELEASE_STATE.md` still contains a primary source cutoff at
`9982d378` and older per-unit tables. Current source inventory is
`1b41a633`. The document must add a dated source-only addendum without
rewriting historical production identities as current live proof.

### Admin Backend DTO Contract

The document currently says it is not an implemented API. That remains true for
the full proposed DTO family, but it is too broad: safe-read projection source,
traffic collector projection, Admin auth, Wallet reads, and Commerce reads now
exist. Each DTO must be marked implemented, partial, static-only, or missing.

### Admin App And Relationship Documents

The manifest is already the code source of truth. Older tables that describe
Admin pages or permission surfaces as future must be reconciled against the
current manifest and owner models. Static registration or frontend visibility
must not be described as backend authorization.

### Operations Foundation

The accepted Lead durability boundary explicitly declined the proposed generic
Operations event table. #475 supplies Lead durability history and governance
context, not a reusable Admin audit store.

## Remaining Operations Plane Work

After this reconciliation, the proven next gaps are:

1. Complete the Admin role/capability boundary by extending existing auth rather
   than replacing it.
2. Map existing safe-read models to backend-owned facts and mark static/fixture
   areas explicitly.
3. Define commercial metric contracts only after Payment, Order, Fulfillment,
   Wallet, and traffic truth owners are established.
4. Establish a privacy-bounded Admin action audit contract before enabling
   Operations mutations.
5. Add user/payment/Coins/catalog operational workflows as narrow consumers of
   existing domain commands.
6. Build the pilot Dashboard last, from versioned facts with freshness and
   drill-down.

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
