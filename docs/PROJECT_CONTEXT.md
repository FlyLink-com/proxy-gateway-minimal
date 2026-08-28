# Project Context

Last updated: 2026-08-28, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: project_context
  superseded_by: null
  last_verified_at: 2026-08-28
  production_authority: false
```

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Source reconciliation cutoff:
>   `master@2824d01f9523ff39805083744e7b0c4f30bfef50` (observed immediately before this
>   docs-only change)
> - Latest deployed control-plane source:
>   `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` (2026-08-26)
> - Source/production state: Drift; the source cutoff is later than the
>   deployed control-plane source
> - Live delivery index:
>   [GCC WebOS — Delivery Project #1](https://github.com/orgs/gccwebos-com/projects/1)
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

1. `docs/PROJECT_CONTEXT.md` for the current source-coordination boundary
2. `docs/CURRENT_RELEASE_STATE.md` for dated deployed/runtime evidence
3. `RELEASE_MANIFEST.md` for the release identity contract
4. [GCC WebOS — Delivery Project #1](https://github.com/orgs/gccwebos-com/projects/1) for live Issue/PR
   coordination
5. `git status --short --branch`
6. `docs/README.md`
7. The subsystem README relevant to the task
8. Live GitHub, deployment, or production inventory required by the task risk

`AGENTS.md` always applies. Project #1 is the dynamic work index; it does not
replace Issue/PR evidence or production receipts. `project-state/*.json` is a
reviewed coordination and lane-semantics layer; it must not copy mutable GitHub
counts, override canonical documents or live evidence, or authorize external
mutation.

`docs/CURRENT_RELEASE_STATE.md` and `RELEASE_MANIFEST.md` retain the 2026-08-26
A3 release wording that labels `b5ca23db...` as current source/master. Until a
separate docs-only authority reconciliation updates those canonical records,
interpret that wording only as the exact deployed/release source observed on
that date. It is not live `master` authority; live source must be read from Git.

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

## Repository And Delivery Index

Repository: `gccwebos-com/proxy-gateway-minimal`

The source cutoff inspected immediately before this docs-only reconciliation
was `master@2824d01f9523ff39805083744e7b0c4f30bfef50`. It is a dated reconciliation boundary, not a
permanent current-head claim. Resolve the live `master` SHA before every later
source decision.

The latest verified production control-plane source remains
`b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`, release
`control-plane-b5ca23db-a3-sync-20260825`, with A3 terminal state
`promoted_verified` on 2026-08-26. The source cutoff is later, so source and
production are explicitly in drift. This does not establish a Portal/Admin
static deployment.

Use [GCC WebOS — Delivery Project #1](https://github.com/orgs/gccwebos-com/projects/1) for live Issue, PR,
status, lane, risk, validation, and production-impact coordination. Use live
GitHub queries for current counts, review queues, branches, and Milestones.
Canonical docs and `project-state/*.json` intentionally do not copy those
mutable facts.

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

Project #1 owns current item membership and the six live coordination fields.
`project-state/lanes.json` owns lane definitions and safety boundaries. Issue
bodies remain authoritative for scope, risk, done criteria, and production
gates.

The Project-facing lanes are:

- `traffic-accounting`
- `portal-lifecycle`
- `commercial-foundation`
- `operations-foundation`
- `version-management`
- `dependency-materialization`
- `legacy-retirement`

Internal `code-boundary` and `production-operations` lanes remain in the
machine-readable model because existing tasks reference them; they are not
additional Project taxonomy. Read current Issue and PR state from Project #1
and GitHub rather than maintaining a second status table here.

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

Project #1 is now the dynamic repository-work index. Its current item set,
status distribution, review queue, and Lane/Risk values must be read live; this
handoff no longer preserves copied Issue, PR, or branch counts.

The latest retained security/governance observations remain separately dated:

- the A3 release-source CI, CodeQL, Release Artifact, Dependency Artifact, and
  production dry-run evidence applies to
  `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`, not to the later source cutoff;
- the 2026-08-22 API readback reported zero open Dependabot alerts, secret
  scanning disabled, and unavailable code-scanning alert inventory because
  Code Security was not enabled;
- the same dated source inventory found 13 of 40 workflow Action `uses:`
  references full-SHA pinned and 27 mutable tags;
- rulesets, required reviews, Environment protection, provider settings, and
  deployment settings require fresh live readback before relying on them.

Issues #597 and #598 retain release-lifecycle and supply-chain work. Project
status is navigation only and cannot upgrade these dated observations or create
production authority.

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
8. The deployed-source GitHub artifacts are temporary through 2026-09-08.
   Their expiry does not invalidate the retained host release, but it prevents a
   later promotion from downloading that same packet. Longer recovery windows,
   rollback retention, SBOM, provenance/signing, and the remaining mutable
   Action references remain scoped under #597/#598.
9. `docs/CURRENT_RELEASE_STATE.md` and `RELEASE_MANIFEST.md` still use dated
   `b5ca23db...` current-source wording. A separate C-tier docs reconciliation
   must correct those two authorities before this Draft is considered Ready.

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
- [GCC WebOS — Delivery Project #1](https://github.com/orgs/gccwebos-com/projects/1): live work index
- `docs/GITHUB_ISSUE_PR_WORKFLOW.md`: Issue, PR, and Project authority boundaries
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
