# DDD Context Map

Last verified: 2026-11-11 UTC.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: ddd_context_map
  superseded_by: null
  last_verified_at: 2026-11-11
  production_authority: false
```

> Status:
> - Type: Derived DDD bounded-context and PR-to-domain crosswalk
> - Risk: C
> - Execution authority: Does not authorize source implementation, PR retargeting, merge, artifact publication, provider access, deployment, runtime mutation, schema migration, credential, payment, subscription, or customer-data actions
> - Production impact: None
> - Source of truth: Stable business spine in `docs/PROJECT_CONTEXT.md`; source responsibilities in subsystem READMEs and code; current PR state in native GitHub records
> - Snapshot: 21 open PRs and the G6 integration lane read on 2026-11-11; current Master at `84b81ab0024a64607c9ca4ca2f05dd5c4529b5a0`

## 1. Purpose and authority

This document maps the repository's existing work to DDD bounded contexts so that later development, review, and integration can be planned against business ownership rather than PR titles or branch names.

It is a derived architecture crosswalk, not a second work queue:

- Native GitHub Issues and PRs remain authoritative for live state, review decisions, exact HEADs, checks, and merge eligibility.
- Source code, schemas, and the owning domain contracts remain authoritative for implemented behavior.
- `docs/PROJECT_CONTEXT.md` remains the stable project handoff and business-spine authority.
- `docs/project-map/ARCHITECTURE_MAP.md` remains the higher-level Control Plane / Data Plane / Release Plane map and precedence index.
- `docs/project-map/DEPENDENCY_MAP.md` remains the Feature → Issue → PR → Artifact → Runtime relationship convention.
- This file classifies ownership and records a dated PR snapshot. It does not replace those sources or authorize any action.

The PR table is a point-in-time snapshot, not a live queue. Re-read each native PR before selecting, sequencing, retargeting, closing, or merging work. The recorded ahead/behind figures compare each PR head with the Master SHA above; they measure branch freshness, not code conflict count or review quality. A branch being marked mergeable by GitHub is not proof of fresh base, passing validation, or merge readiness.

## 2. DDD modeling rules

1. **A bounded context is a business-model boundary, not a deployment unit.** Keep the existing modular monolith and separately gated Worker / Agent surfaces. This map does not propose microservice extraction.
2. **One domain owns each business fact.** Other contexts consume its contract or a safe projection; they do not write around it.
3. **Adapters are not business authorities.** Admin, User Portal, company site, CLI, Express routes, Worker entrypoints, and provider adapters translate requests and responses.
4. **Project phase labels are not domains.** C1, C2, D1, T2, G6, M0, JP-01, and similar labels describe workstreams, gates, or phases. They must be mapped to the business contexts they affect.
5. **A PR may cross contexts, but it must have one primary owner.** Record secondary impacts and the contract between them; do not hide cross-domain coupling behind one broad PR title.
6. **Do not collapse similar-looking records.** Coin Ledger entries are financial facts; traffic samples and usage rollups are usage evidence; recharge/payment orders are not Commerce Orders; customer identity is not node identity; key custody is not MFA.
7. **Shared storage does not erase domain ownership.** The current SQLite / control-store arrangement remains a modular-monolith implementation detail. No dual writes, new queue, second source of truth, or production schema change is implied by this map.

Aggregate names below are candidate model vocabulary for ownership discussions. They are not claims that every candidate is already implemented as a concrete aggregate class or table.

## 3. Bounded-context catalogue

| Bounded context | Domain role | Owns / candidate aggregates | Source surfaces and boundary |
| --- | --- | --- | --- |
| Identity & Access | Supporting | AccountIdentity, AdminPrincipal, PortalSession, MFAEnrollment | Portal/Admin authentication, Auth0/OIDC integration, MFA and native session lifecycle. Owns authentication identity and session facts; does not own Coins, orders, entitlements, node identities, or key custody. |
| Wallet & Financial Ledger | Core | CoinWallet projection, CoinLedgerEntry | Coins balance projection and immutable financial fact stream. The ledger is authoritative for financial entries; the displayed wallet balance is a projection. Never use traffic usage as a financial ledger or overwrite historical entries to match a UI. |
| Payment & Recharge | Core | RechargeOrder, PaymentConfirmation, Settlement | Recharge/payment order lifecycle and confirmation. A confirmed recharge settles into the wallet ledger idempotently; it is not a product purchase or entitlement by itself. |
| Offer & Commerce | Core | OfferVersion, CheckoutQuote, CommerceOrder, Coupon, DataPackOffer | Public offer catalog, pricing, checkout quote, product purchase, coupons, and data-pack / relay-pack offers. A Commerce Order buys a product with Coins; it is distinct from a Recharge/Payment Order. |
| Entitlement & Resource Authority | Core | Subscription, Entitlement, AccountResourceAuthority, FulfillmentCommand | Owns the right to consume a purchased service and the exact resource-issuance provenance. Account Resource Authority binds request, entitlement, issued link/version, and Quote provenance; payment success alone does not prove activation or delivery. |
| Metering & Usage Accounting | Core | UsageObservation, MeteringSession, UsageLedger, Checkpoint, UsageReceipt | Owns observed traffic use, metering checkpoints, usage journals, and quota evidence. Usage facts are distinct from Coin Ledger facts. Unknown, not_collected, and partial are not zero. |
| Traffic & Capacity Policy | Core | ProtocolRatingPolicy, SharedBandwidthPolicy, CapacityAllocation | Owns protocol rating and shared-bandwidth / capacity policy decisions. It consumes usage evidence but does not become the authority for raw usage observations. |
| Node Provisioning & Runtime Delivery | Core | NodeIdentity, ProvisioningRequest, ImageCandidate, DesiredState, RuntimeReceipt | Owns node lifecycle, image verification, provider preflight, desired-state delivery, and redacted runtime receipts. Node identity is not customer identity; data-plane nodes do not own accounts, commercial entitlements, or public Admin. |
| Key Custody & Deployment Authority | Supporting | KeyCustodyRecord, KeyVersion, EscrowRecord, DeploymentPrincipal, CryptoWorkerPolicy | Owns key custody, escrow / rotation contracts, Crypto Worker deployment-principal trust, and configuration-drift policy. It is separate from user/admin authentication and MFA. |
| Operations Read Models | Supporting | RegistrationGrowthProjection, CollectorObservation, PaymentGrossAggregate, UsageLedgerQuery | Owns safe, read-only operational aggregates and Admin projections. It may read domain-owned facts through approved interfaces; it does not post ledger entries, settle payments, activate subscriptions, or mutate node state. |
| Release & Engineering Governance | Generic / supporting | SourceGateEvidence, ArtifactIdentity, ReleaseUnit, DeployNote, RuntimeEvidenceReference | Owns the traceability model for source, review, artifact, release, deployment, and runtime evidence. It is not a business domain and does not turn a merged PR or successful build into production state. |
| Platform Adapters & Infrastructure | Generic | No business aggregate | Express, Workers, D1 adapters, Admin UI, CLI, provider API clients, and persistence composition. These implement ports and transport; they do not own the business facts above. |

### Source ownership crosswalk

- `server/routes/` is the HTTP adapter boundary; `server/services/` contains domain/application behavior and integration services; `server/state.mjs` composes runtime dependencies.
- `admin/` owns the shared React/Vite workspace for protected Admin, User Portal, and company-site surfaces. Those surfaces remain adapters and distinct release units.
- `workers/control-plane/` is a local synthetic-data slice for the approved future Workers + D1 direction. It is not the current production control plane and does not own a second business truth.
- `workers/crypto/` and `tools/c2-worker-config-policy/` support the Key Custody & Deployment Authority context; source presence does not mean a remote Worker is deployed.
- `agent/`, `ops/node-provisioning/`, `schemas/`, selected scripts, and `server/services/edge/` support Node Provisioning, Runtime Delivery, and Metering contracts. They do not grant runtime or provider access.

## 4. Context relationships

| Upstream context | Downstream context | Business contract | Non-negotiable boundary |
| --- | --- | --- | --- |
| Identity & Access | Portal, Admin, Commerce, Operations adapters | Authenticated subject and authorization decision | Identity provider claims do not directly become wallet, order, entitlement, or node state. |
| Payment & Recharge | Wallet & Financial Ledger | Confirmed settlement posts one idempotent immutable credit entry | A payment confirmation is not a product order and must not directly activate a subscription. |
| Wallet & Financial Ledger | Offer & Commerce | Checkout reads wallet availability and posts the approved debit through the wallet contract | Never mutate a balance projection directly or rewrite ledger history. |
| Offer & Commerce | Entitlement & Resource Authority | Accepted Commerce Order produces an idempotent fulfillment request | Offer, quote, order, payment, and entitlement remain distinct facts. |
| Entitlement & Resource Authority | Node Provisioning & Runtime Delivery | Authorized resource request / desired-state intent | Provisioning must not infer entitlement from a payment, UI state, or node availability. |
| Node Provisioning & Runtime Delivery | Data Plane | Scoped desired state, protected references, and redacted receipts | No raw secrets, customer data, or unbounded controller payloads in the handoff. |
| Data Plane | Metering & Usage Accounting | Authenticated, scoped usage observations and receipts | Runtime observation does not automatically authorize accounting correction, quota reset, or identity retirement. |
| Metering & Usage Accounting | Traffic & Capacity Policy | Usage evidence and bounded quota / rating inputs | Preserve missingness and provenance; usage is not Coins or revenue. |
| Traffic & Capacity Policy | Node Provisioning & Runtime Delivery | Versioned policy / capacity intent | Policy changes are not proof that a node applied the desired state. |
| Key Custody & Deployment Authority | Platform Worker / deployment adapters | Deployment principal, custody, rotation, and drift-control contracts | MFA does not prove independent key recovery; local Worker tests do not prove remote deployment or custody. |
| Business contexts | Operations Read Models | Safe, bounded read projections | Read models do not become write authorities for their source domains. |
| Release & Engineering Governance | All release-bearing source contexts | Exact source / artifact / release / deployment evidence | Source, artifact, deployment, and runtime states remain separate gates. |

### Candidate event vocabulary

The following names are proposed vocabulary for future explicit, versioned contracts. They are not claims that these domain events already exist in the codebase:

- Payment & Recharge → Wallet: `PaymentSettled`
- Wallet → Offer & Commerce: `CoinLedgerEntryPosted`
- Offer & Commerce → Entitlement: `CommerceOrderAccepted`, `FulfillmentRequested`
- Entitlement → Node Provisioning: `EntitlementGranted`, `ResourceProvisioningRequested`
- Node Provisioning → Data Plane: `DesiredStatePublished`
- Data Plane → Metering: `UsageReceiptAccepted`
- Metering → Traffic & Capacity: `QuotaEvidenceUpdated`
- Traffic & Capacity → Node Provisioning: `TrafficPolicyPublished`
- Key Custody → Deployment Authority: `KeyCustodyAttested`

Before implementing an event, define its owner, immutable identity, aggregate ID, occurred-at time, schema version, idempotency key, replay behavior, and failure/reconciliation semantics. Do not introduce a queue merely to adopt event terminology.

## 5. Open PR-to-domain map (2026-11-11 snapshot)

There were 21 open PRs at the snapshot cutoff. “M=Y/N” is GitHub's mergeable readback only; “R=APP” means an APPROVED review was observed on the exact HEAD listed; “R=—” means no review submission was observed; “R=comments” means comments existed but no approval was observed. These are not Source Gate or Merge Gate conclusions.

The Master comparison column is ahead / behind relative to Master `84b81ab0024a64607c9ca4ca2f05dd5c4529b5a0`. For stacked / G6 / review-only branches, the base lane is shown instead of a misleading Master delta.

### Identity, access, and security

| PR | Primary context and secondary impact | Base lane | Exact HEAD | Snapshot / review |
| --- | --- | --- | --- | --- |
| [#842](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/842) | Identity & Access; Key Custody / security primitives | review-only baseline branch | bc3f8c9a713de05715f42f733b8fa72ba53d4477 | OPEN Draft; M=Y; R=APP exact HEAD; review anchor, not a Master merge target. |
| [#843](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/843) | Identity & Access; TOTP re-enrollment and custody decisions | child of #842 source-hardening branch | 4be493a06a55d245bd2d89a1019f62922ab251bb | OPEN Draft; M=Y; R=APP exact HEAD; prior change request was followed by a corrective review and approval. |
| [#844](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/844) | Identity & Access; synthetic-only migration validation tooling | #843 re-enrollment branch; PR base snapshot c6a70b3f | 1f32d50d702be5b5a4d73624fd8f1e2dd236e9b6 | OPEN Draft; M=Y; R=APP exact HEAD; #843 current HEAD is four commits ahead of this PR's recorded base snapshot. Reconcile before integration. |
| [#848](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/848) | Identity & Access; Browser Portal and Admin adapters | #844 validator branch; base snapshot matches #844 HEAD | 3a5788251dcdec10f20c452ef539b59011570db1 | OPEN Draft; M=Y; R=APP exact HEAD after corrections. |
| [#849](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/849) | Identity & Access; Control Plane Worker / OIDC adapter | master | 51145b237e4f89b4ee8a1bf4d28dbc1d81919610 | OPEN Draft; M=Y; R=APP exact HEAD; Master delta +64 / −9. Control Plane Worker workflow succeeded; CI was skipped, not passed. |
| [#853](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/853) | Identity & Access decision reconciliation; Release / documentation governance | G6 staging branch after #852 merge | 993aab6571f31047b531b3dc506cf54be268e67b | OPEN Draft; M=Y; R=—; docs-only G6 lane, not a Master PR. |
| [#755](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/755) | Identity & Access; native session renewal | master | 0cc44b00bec5652ed77e17446f26b93e8ca533a5 | OPEN Draft; M=N; R=—; Master delta +1 / −510; stale branch requires source comparison before deciding successor or closure. |

### Wallet, payment, offers, and entitlement

| PR | Primary context and secondary impact | Base lane | Exact HEAD | Snapshot / review |
| --- | --- | --- | --- | --- |
| [#845](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/845) | Entitlement & Resource Authority; Wallet, Identity, and Key Custody | feat/c1-risk-a-proof-window-contract-20261108; no matching PR was found in the current search | 00c5d5e8ad8ff6497ff368fa5ed3f03cba01526e | OPEN Draft; M=Y; R=APP exact HEAD; Master delta +231 / −9. The parent-branch lineage must be identified before integration. |
| [#770](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/770) | Offer & Commerce; public User Portal catalog adapter | master | 262cf0fb7067f355cacb1a6175b8dd32de4edfa4 | OPEN Draft; M=N; R=—; Master delta +3 / −480; revalidate against current offer/catalog source before preserving. |
| [#787](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/787) | Offer & Commerce; Entitlement / quota and Node Provisioning for residential relay packs | codex/data-pack-commerce, the historical head branch of merged PR #753 | c5011c6f1b37a7db41032f7c69f18cda3cf43fcc | OPEN Draft; M=Y; R=—; default-off backend; Master delta +6 / −342. #753 merged to Master on 2026-10-15; reconcile this child against that merged source and current Master. |

### Metering, usage, traffic, and capacity

| PR | Primary context and secondary impact | Base lane | Exact HEAD | Snapshot / review |
| --- | --- | --- | --- | --- |
| [#812](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/812) | Metering & Usage Accounting; read-only M0 diagnostics | master | 56f2bb8d3cb16c8c488fed05b39c4297771a888a | OPEN Draft; M=Y; R=—; Master delta +78 / −294; read-only diagnostic scope does not establish production metering health. |
| [#793](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/793) | Metering & Usage Accounting; Operations ledger-query performance | master | 387185d0b931ad727fb25c3a9297901e2e2739d2 | OPEN Draft; M=N; R=—; Master delta +3 / −313; no production timeout conclusion follows from this probe alone. |
| [#797](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/797) | Traffic & Capacity Policy; Metering and Operations projections | master | 4bd6302aff5925e3a5d2cc3a1b76098144336cc8 | OPEN Draft; M=Y; R=—; Master delta +2 / −308; separate rating policy from usage accounting and Admin projection. |
| [#798](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/798) | Traffic & Capacity Policy; BWH data-plane capacity enforcement | master | a0571e90ee0818af29b138837310c479fb1208f8 | OPEN Draft; M=Y; R=—; Master delta +7 / −308; keep policy decision separate from applied node state. |

### Node identity, provisioning, and runtime delivery

| PR | Primary context and secondary impact | Base lane | Exact HEAD | Snapshot / review |
| --- | --- | --- | --- | --- |
| [#810](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/810) | Node Provisioning & Runtime Delivery; legacy node identity continuity evidence | master | d3fdf1983607a0bf1df2b84cc5ac7efec1fecbc0 | OPEN non-Draft; M=N; R=APP exact HEAD; docs-only; Master delta +13 / −296. Approval does not remove the stale-base / mergeability blocker. |
| [#823](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/823) | Node Provisioning & Runtime Delivery; JP child engineering status and topology docs | master | d5d13d0ad50086994f9b3892ca1c0fd367cfc043 | OPEN Draft; M=N; R=—; Master delta +22 / −265; reconcile against later JP child D1/D2/E1 work before reusing the docs. |
| [#824](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/824) | Node Provisioning & Runtime Delivery; read-only R2 image verification | master | f93c5f8076e14ae460aee65782fd04fe2210ffff | OPEN Draft; M=Y; R=—; Master delta +34 / −265; image verification gate is not image deployment or node activation. |
| [#825](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/825) | Node Provisioning & Runtime Delivery; Vultr API preflight and pipeline orchestration | master | 52e419e5e2379bb776cfa773bd87f53b735d2a90 | OPEN Draft; M=N; R=—; Master delta +2 / −265; Risk A target is declared, but this PR snapshot does not authorize provider access or provisioning. |

### Operations and release governance

| PR | Primary context and secondary impact | Base lane | Exact HEAD | Snapshot / review |
| --- | --- | --- | --- | --- |
| [#802](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/802) | Operations Read Models; registration growth and collector observation | master | 9b37c1276bb09d9dc93bad0e320fd6fce296672b | OPEN non-Draft; M=Y; R=APP exact HEAD; Master delta +2 / −296; read-only projection, not collector write authority. |
| [#804](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/804) | Payment & Recharge; read-only Operations gross aggregate | master | 03305e1d2c08cac185d308843122c8965f1cda52 | OPEN non-Draft; M=Y; R=APP exact HEAD; Master delta +3 / −296; gross order amount is not settled revenue, net revenue, or wallet balance. |
| [#800](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/800) | Release & Engineering Governance; dated release/context documentation | master | 9021b42fa2e704a67bd477d7b610ef755be9a418 | OPEN non-Draft; M=N; R=comments only; Master delta +3 / −306; re-read current canonical docs before deciding whether this snapshot is superseded. |

## 6. G6 staging integration already completed

G6 is an integration lane, not a DDD bounded context and not Master. The following PRs are merged into the G6 staging branch:

| PR | Primary context | Merge commit | Result |
| --- | --- | --- | --- |
| [#846](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/846) | Key Custody & Deployment Authority; Identity, data governance, and payment-action custody contracts | 0fe25da36e4ce9ef805ea1eda92c69ae6765a475 | Merged 2026-11-10 into the G6 rehearsal branch. |
| [#852](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/852) | Key Custody & Deployment Authority; Crypto Worker deployment principal and config-drift policy | 3490de6046a4fe48346984b22b0bba4a31546df4 | Merged 2026-11-11 on top of #846 in G6. |
| [#855](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/855) | Cross-context integration of Identity & Access and Key Custody hardening | 76982c43b7f3b6c6a6022ae317603111 | Merged 2026-11-11 on top of #852 in G6; not merged to Master. |

For #855, exact merge commit CI run 43011278299 reported Source checks, Governance snapshot, Prerequisite checks, Build and verify assets, and Validate as SUCCESS. Governance evidence, Foundation inventory, and Dependency artifact were SKIPPED. Skipped jobs are not passes and must be evaluated under the applicable Master integration gate.

PR #842 remains open as a review/source anchor even though #855 carried its scoped source hardening into G6. Do not merge #842 directly to Master merely because its source review is approved.

## 7. Integration risks and recommended sequence

### P0 — Preserve the verified G6 lane and reconcile the identity chain

1. Treat #846 → #852 → #855 as one G6 staging lineage. Keep its merge commits and exact CI receipt together; do not describe it as Master or production.
2. Reconcile #853 against the G6 base after #852. It has no review at the snapshot cutoff.
3. For the Identity chain, preserve #842 as the review anchor, #843 as the re-enrollment successor, #844 as synthetic-only validation tooling, and #848 as the Portal/Admin normalization child.
4. Before integrating #844, reconcile its recorded base snapshot c6a70b3f with #843's current HEAD 4be493a0; the latter is four commits ahead.
5. Treat #849 as a separate OIDC gateway implementation. Its exact-head approval does not convert the skipped CI job into a pass.
6. Trace #845's base branch lineage before integrating its Wallet-first / resource-setup slice.

### P1 — Rebuild stale Master-based candidates from current source

The following branches are substantially behind Master in the snapshot: JP child / provisioning PRs #810, #823, #824, #825; metering / traffic PRs #812, #793, #797, #798; Operations PRs #802, #804; release docs #800; commerce PRs #770 and #787; and native session PR #755.

Do not bulk-retarget or merge them. For each PR:

1. Re-read its exact diff and native review / check history.
2. Compare the changed files and business contract with current Master and already merged successors.
3. Decide explicitly: retain and rebase, create a bounded successor PR carrying only still-needed changes, split by context, or close as superseded.
4. Preserve historical approvals and validation as historical evidence; do not reuse them as approval of a changed HEAD.
5. Run the validation baseline for the resulting exact source head before any Ready or merge decision.

Special cases:

- #787 is based on the historical branch of #753, which has already merged to Master. Reconcile the child with #753's merged behavior and current product / quota contracts before creating a successor.
- #810, #802, and #804 have exact-head APPROVED reviews, but their branches are still 296 commits behind current Master. Approval does not solve base drift.
- #800 modifies canonical release/context documents and has no approval at its listed HEAD. Reconcile its content with current documents rather than merging an old snapshot.
- #797 and #798 touch overlapping traffic / subscription-distribution surfaces. Keep the rating-policy and shared-bandwidth contexts separate, then define their shared capacity contract.
- #793 is a read-performance probe; it must not be reported as a production timeout fix without production evidence.
- #823 is documentation-only and should be reconciled with later JP child D1/D2/E1 work before reuse.
- #824 and #825 are provisioning gates; read-only preflight or image verification is not provider mutation, image deployment, or runtime acceptance.

### P2 — Make future PRs domain-addressable

For each new or materially revised PR, its description should state:

- Primary bounded context.
- Secondary contexts affected.
- Owning aggregate / business fact.
- Upstream contract consumed and downstream contract produced.
- Files and adapters changed.
- Exact-head validation and review evidence.
- Remaining artifact / deployment / runtime gates.

Do not create another machine-readable queue or copy PR status into project-state JSON. Keep this document as a human-readable classification map and use native GitHub records for mutable state.

## 8. Maintenance rule

Refresh this map only when a domain boundary changes, a meaningful PR integration wave completes, or a new PR materially changes the context map. At every refresh:

1. Read the live native PR record and exact changed-file list.
2. Record exact HEAD and base lane; compare to current Master or the intended staging base.
3. Verify review state against that exact HEAD.
4. Separate Draft, non-Draft, approved, mergeable, CI-passed, merged-to-G6, merged-to-Master, deployed, and runtime-validated states.
5. Preserve historical evidence without reclassifying it as current.

This document itself does not require every PR to be merged. Its purpose is to make ownership, dependencies, and safe integration decisions explicit before code moves between lanes.
