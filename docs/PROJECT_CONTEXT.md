# Project Context

Last updated: 2026-08-26, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: project_context
  superseded_by: null
  last_verified_at: 2026-08-26
  production_authority: false
```

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Current source cutoff:
>   `master@b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`
> - Latest deployed control-plane source:
>   `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` (2026-08-26)
> - Source, artifact, production-promotion and delayed public-health evidence
>   for A3 were reconciled on 2026-08-26; unrelated mutable GitHub, provider and
>   production facts retain their separately dated evidence
> - Production state: Refer to `docs/CURRENT_RELEASE_STATE.md`; this handoff
>   records the release identity but does not duplicate its runtime evidence
> - Production impact: None; this Risk C handoff changes no release, runtime,
>   provider, schema, credential, or customer data
> - Source of truth for: Compact current project handoff, source capability
>   boundaries, active lanes, and navigation
> - Execution authority: None

This file is the compact entrypoint for continuing
`proxy-gateway-minimal`. Historical execution detail belongs in the indexed
records under `docs/`, not in this handoff. It does not authorize production,
provider, DNS, Nginx, systemd, firewall, schema, deploy, promotion, rollback,
credential, payment, subscription-material, or customer-data actions.

## Read First

Use this order before any work:

1. `docs/CURRENT_RELEASE_STATE.md`
2. `RELEASE_MANIFEST.md`
3. `docs/PROJECT_CONTEXT.md`
4. `git status --short --branch`
5. `docs/README.md`
6. The subsystem README relevant to the task
7. Live GitHub, deployment, or production inventory required by the task risk

`AGENTS.md` always applies. `project-state/*.json` is a compact coordination
layer; it does not override canonical documents or live evidence and does not
authorize external mutation.

## Current Classification

The project is a release-managed modular monolith with explicit source,
artifact, deployment, and runtime evidence domains. It contains a platform
foundation and several independently gated operational/commercial lanes. It is
not a fully reconciled platform product, and source capability must not be read
as production activation.

## Current Architecture

Use this source model:

```text
Adapters
  company site | User Portal | protected Admin | gccgw CLI

Control-plane domain spine
  identity/access
    -> Coin Wallet + immutable Coin Ledger
    -> Recharge/Payment -> paid_coins settlement
    -> Offer -> Checkout Quote -> Commerce Order -> Fulfillment Command
    -> Account Resource Authority -> delivery generation/artifact

Operations evidence
  traffic usage samples/rollups | audit | safe read projections

Data-plane/runtime
  desired state | protected material refs | redacted receipts | channel runtime
```

Keep these distinctions explicit:

- Coin Ledger is an immutable financial fact stream; traffic usage samples and
  rollups are a separate accounting-evidence domain.
- A Commerce Order buys a product with Coins; it is not a Recharge/Payment
  Order.
- Account Resource Authority binds an exact request, entitlement, issued
  link/version, and Quote provenance; it is not merely the currently active
  lifecycle row.
- Backend capabilities such as `operations.read` are not the same vocabulary
  as the Admin frontend manifest's `view`/`inspect` permissions.
- Except where an exact Deploy Note records the control-plane release, `master`,
  a migration, a default-off adapter, and a successful artifact run are
  source/build evidence, not deployed runtime state.

## Repository Snapshot

Repository: `gccwebos-com/proxy-gateway-minimal`

The source/artifact reconciliation observed on 2026-08-23 recorded the dated
counts below. They are retained as historical inventory rather than silently
refreshed by this deployment closeout:

- exact `master`: `42d17885646d52387f9327f19e2a2e0d70b2b84e`
- current head: merged PR #662
- open PRs: none
- open Issues (18): #437, #438, #439, #521, #522, #523, #524, #525,
  #527, #551, #557, #558, #559, #560, #597, #598, #632, and #636
- remote branches: 117 (count-only observation)
- successful exact-source CI run: `32645695594`
- successful exact-source CodeQL run: `32645695630`
- successful exact-source Release Artifact run: `32645695598`
- successful exact-source Dependency Artifact run: `32645695541`
- control-plane artifact: `proxy-gateway-42d17885646d` (ID `9494798503`)
- Portal artifact: `portal-static-42d17885646d` (ID `9494802700`)
- Admin artifact: `admin-static-42d17885646d` (ID `9494802010`)
- dependency artifact ID: `9494801281`, name
  `control-plane-dependency-42d17885646d52387f9327f19e2a2e0d70b2b84e`,
  size `6460706` bytes, observed expiry `2026-09-06T14:32:03Z`

These are dated mutable facts, not permanent documentation authority. Refresh
GitHub inventory before making a later current claim.

Current exact source is
`master@b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` (merged PR #667). Release
Artifact run `32854893859`, Dependency Artifact run `32854893837`, and
Production Deploy Dry Run `32856999391` succeeded for that source. The approved
2026-08-26 A3 promotion deployed release
`control-plane-b5ca23db-a3-sync-20260825` and ended `promoted_verified`. This
does not establish a Portal/Admin static deployment.

## Current Source Capability Boundary

The detailed source/test matrix is
`docs/OPERATIONS_PLANE_SOURCE_REALITY.md`. Its Operations capability matrix is
a dated source-reality inventory. The A3 row below additionally reflects the
2026-08-26 production closeout without reclassifying any other domain:

| Domain | Established in source | Still not established by this evidence |
| --- | --- | --- |
| Admin / Operations | Admin auth/session foundations, backend read-capability registry, partial protected read routes, safe projections | Full route-wide RBAC, Admin frontend `/api/admin-auth` login integration, production enablement |
| Wallet-first / Coin Ledger extension | Wallet-first model and additive reverse-reference migration | Application of the four wallet-first schemas, wallet-first writes, or wallet-first activation |
| Wallet-first Recharge / Payment extension | Provider-neutral durable store/coordinator and Portal routes; PayPal sandbox plus XSD/ChaoJiPay source adapters | New wallet-first provider activation, refund/reconciliation operations, or wallet-first production migration |
| Wallet-first Commerce extension | Offer, Checkout Quote, Commerce Order, Fulfillment Command | Wallet-first/deferred schema or runtime activation and new live fulfillment |
| Account Resource Authority | Exact Authority/provenance source, migration, and default-off Commerce binding | Authority production assignment, schema apply, or runtime activation |
| Traffic / trust | Protected usage projection and fail-closed trusted-proxy/XFF handling | Admin `Usage & Channels` consumption, production proxy-topology validation |
| A3 dependency materialization | Source contracts, physical collector, exact-head XFS quota and service-native smoke proofs, explicit XFS/bounded admission paths, hardened staging/controller flow, exact artifact materialization and production promotion through PRs #646-#667 | Promotion-09 ended `promoted_verified` for `control-plane-b5ca23db-a3-sync-20260825`; durable artifact retention remains Issue #597, and no schema or feature activation is inferred |

The 2026-08-26 control-plane promotion makes exact source `b5ca23db...`
available on that host, but it did not apply the four wallet-first schemas or
enable the wallet-first/deferred/Authority lane. Promotion-09 explicitly
recorded no schema mutation or feature activation. The entries above therefore
remain non-activation evidence for those lanes.

## Workflow Boundary

Risk tiers live in `AGENTS.md`:

- C: docs, runbooks, state records, and small governance corrections.
- B: focused source code, tests, local tooling, and protected UI behavior.
- A: production, providers, DNS, Nginx, systemd, firewall, auth model, schema,
  runtime config, deployment, promotion, rollback, or customer-data action.

A-tier work requires:

```text
read-only inventory
  -> reviewer-defined exact boundary
  -> explicit operator approval
  -> execution
  -> validation
  -> rollback evidence
```

Issues are durable index cards; PRs are execution summaries and validation
receipts. Passing a source, merge, or artifact gate does not authorize the next
gate.

The manual Japan runtime-config additive-repair workflow has a narrower active
source-only authorization contract. `approval_pr` must resolve a merged PR at
the exact workflow commit, its final head must have a successful `Validate`
check, and the latest-state approval must come from a reviewer other than the
actual triggering actor. While those conditions remain true, the merged-PR
source authorization is reusable; `approval_pr` is not a one-time or consumed
credential. It does not authorize workflow dispatch, host access, map apply,
deployment, runtime mutation, or production success; each remains a separate
exact Risk A gate.

## Active Work Lanes

Do not infer a single fixed serial order from the July snapshots. Use the live
Issue state and `project-state/*.json` for coordination. The current durable
areas include:

| Issues | Lane | Source posture |
| --- | --- | --- |
| #437 | Traffic Accounting | Usage evidence and identity/recovery work remain separately gated; do not conflate traffic rollups with Coin Ledger. |
| #438 | Portal Lifecycle | Extend the existing account/resource delivery and Portal auth foundations. |
| #439, #524 | Commercial / Payment / Authority | Extend Wallet, Recharge/Payment, Commerce, and Account Resource Authority without rebuilding parallel order or ledger models. |
| #557 | Operations Foundation | Reconcile the existing Operations/Admin source envelope before adding APIs or UI. |
| #558-#560 | Operations/Admin follow-ons | Treat safe backend reads, UI consumers, capability enforcement, metrics, and audit as distinct slices. |
| #597, #598 | Release maturity / supply chain | Close durable artifact/runtime traceability and full-SHA/SBOM/provenance/signing gaps. |
| #632 | Dependency artifact replay | Preserve the historical A2 audit boundary without inheriting old authorization. |

Issue #636's A3 production materialization/promotion outcome is complete and is
closed by this canonical reconciliation. Issue #561 is also closed. The
remaining open Issues stay independently scoped. PR
#476, #592, and #594 are closed unmerged; PR #479 is merged source-only and PR
#593 is merged docs-only. None is a current open candidate or production
authority.

## Release And Artifact State

The release model is:

```text
Source -> Artifact -> Release -> Deployment -> Runtime State
```

`master` is reviewed source, not a production-version claim. Artifact Manifest
v1 covers `control-plane-app`, `portal-static`, and `admin-static`.

The [PR #667 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/667#issuecomment-5426440067)
binds the latest recorded control-plane deployment to source
`b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` and release
`control-plane-b5ca23db-a3-sync-20260825`. Promotion-09 verified the pointer,
service/process CWD, snapshot/custody and health before ending
`promoted_verified`. This does not establish a Portal or Admin static
deployment.

The exact deployed-source build evidence is Release Artifact run `32854893859`
plus Dependency Artifact run `32854893837`; Production Deploy Dry Run
`32856999391` also succeeded. The GitHub artifacts remain temporary even though
the exact packets were verified during this deployment.

See `RELEASE_MANIFEST.md` for the stable contract.

## Production Boundary

The only compact production snapshot is
`docs/CURRENT_RELEASE_STATE.md`. It distinguishes:

- the 2026-08-26 `control-plane-app` deployment at source
  `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`, whose bounded materialization,
  service-native smoke, snapshot, atomic pointer exchange, process working
  directory and health were validated by promotion-09;
- the historical XFS-only A3-2 `NO-GO`: the fixed production deployment root
  was observed on `ext4` without the XFS project-quota boundary required by
  `master@b93577c...`; this did not evaluate PR #662's bounded route;
- the separately unreconciled Portal, Admin, company-site, rendering, and
  runtime-config identities; and
- the unenabled state of the four wallet-first schemas, wallet-first/deferred
  runtime, and Authority functionality. This does not describe the existing
  legacy Portal, Coins Wallet, Coins Commerce, or XSD recharge state.

Do not copy the dated deployment table into this handoff or infer current live
state from source/artifact evidence. Provider settings, domains, deployments,
runtime services, and production data require fresh task-specific inventory.

## Source Governance And Security Snapshot

The 2026-08-23 reconciliation refreshed the repository source head, open
PR/Issue posture, remote-branch count, and then-current workflows/artifacts.
Those counts remain dated. The selected GitHub security APIs and workflow
Action-reference counts remain the 2026-08-22 snapshot:

- exact-master CI `32645695594`, CodeQL `32645695630`, Release Artifact
  `32645695598`, and Dependency Artifact `32645695541` workflows succeeded;
- Dependabot reported zero open alerts;
- secret scanning is disabled;
- code-scanning alert inventory was unavailable because Code Security is not
  enabled, so no zero-alert claim is made;
- 13 of 40 workflow Action `uses:` references are full-SHA pinned; 27 mutable
  tag references remain.

Rulesets, environment protections, provider settings, and deployment settings
were not refreshed. The 2026-08-26 closeout refreshed only exact source/artifact
runs and the A3 `control-plane-app` execution boundaries described above:
promotion-09 terminal identity plus a later public-only health window. Issues
#597 and #598 retain the remaining release-maturity and supply-chain gaps.

## Active Gaps

1. The control-plane identity was verified by promotion-09 on 2026-08-26; Portal,
   Admin, company-site, rendering, and runtime-config identities still require
   their own task-specific read-only inventory before production action.
2. Admin backend read capabilities are only partially enforced; frontend
   Admin login integration and the traffic projection consumer remain pending.
3. The four wallet-first schemas, wallet-first/deferred runtime, and Account
   Resource Authority are not proven applied or enabled in production. This is
   separate from the retained legacy Wallet, Commerce, and XSD recharge state.
4. Wallet-first provider refund/reconciliation paths and new live
   credential/callback setup are not established.
5. The current control-plane release has a durable Deploy Note and fresh live
   identity readback, but build evidence alone does not establish durable
   Portal/Admin artifacts or their production activation records.
6. Mutable GitHub counts and governance/security settings require a fresh
   readback when they matter to a decision.
7. A3 dependency materialization and `control-plane-app` promotion completed at
   exact source `b5ca23db...`; promotion-09 ended `promoted_verified`. The old
   XFS-only A3-2 inventory is historical, while schema/feature activation and
   other release units remain outside the completed A3 boundary.
8. Exact-master artifacts are temporary through 2026-09-08; durable artifact,
   rollback retention, SBOM, provenance/signing, and the remaining 27 mutable
   Action references remain open under #597/#598.

## Validation Baseline

Use `docs/VALIDATION_BASELINE.md`.

- C docs-only: `git diff --check origin/master...HEAD`
- project-state changes: `npm run project-state:check` plus diff check
- server/shared source: focused tests, `npm test`, and diff check
- Admin UI: focused tests, `npm run admin:test`, `npm run admin:build`,
  `npm test`, and diff check
- A-tier: runbook-specific validation; no generic shortcut

GitHub Actions success is build evidence, not production evidence.

## Documentation Navigation

Use these entrypoints:

- `docs/README.md`: documentation index
- `docs/CURRENT_RELEASE_STATE.md`: documented release/deployment boundary
- `RELEASE_MANIFEST.md`: source/artifact/release/deployment/runtime model
- `docs/OPERATIONS_PLANE_SOURCE_REALITY.md`: Operations/Admin/Commerce source
  capability and gap matrix
- `docs/COINS_WALLET_SCHEMA_GATE.md`: Wallet and Coin Ledger schema boundary
- `docs/BILLING_RECHARGE_CONTRACT.md`: Recharge/Payment compatibility and
  durable-source boundary
- `docs/ACCOUNT_RESOURCE_AUTHORITY_LIFECYCLE.md`: exact resource-authority and
  Quote-provenance lifecycle
- `docs/TRAFFIC_ACCOUNTING_QUOTA_GATEWAY_PLAN.md`: traffic usage evidence plan
- `docs/GITHUB_ISSUE_PR_WORKFLOW.md`: Issue and PR ownership
- `docs/production-replacement-records/`: dated production execution evidence
- `docs/archive/`: superseded plans and historical context

## Guardrails

- Do not commit or output secrets, credentials, subscription material,
  production environment values, private keys, SQLite rows, raw runtime config,
  raw logs, or customer data.
- Do not expose public Admin.
- Do not mutate production, providers, DNS, Nginx, systemd, firewall, schema,
  auth, runtime, deployment, promotion, or rollback without an exact Risk A
  gate and operator approval.
- Do not treat a merged PR, successful CI run, artifact, migration, feature
  flag, runbook, or dated execution record as current production proof.
- Use current source and live Issue/project-state evidence for sequencing; do
  not reactivate historical lanes from a frozen snapshot.
