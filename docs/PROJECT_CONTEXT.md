# Project Context

Last updated: 2026-08-09, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: project_context
  superseded_by: null
  last_verified_at: 2026-08-09
  production_authority: false
```

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Exact source cutoff:
>   `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`
> - Source inventory observed: 2026-08-09, America/Los_Angeles
> - Production state: Refer to `docs/CURRENT_RELEASE_STATE.md`; this handoff
>   does not duplicate or refresh live identity
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
- `master`, a migration, a default-off adapter, and a successful artifact run
  are source/build evidence, not deployed runtime state.

## Repository Snapshot

Repository: `gccwebos-com/proxy-gateway-minimal`

The read-only GitHub inventory observed on 2026-08-09 recorded:

- exact `master`: `02fc63a3f949b748dcccf26ba7d310be82f4b6df`
- current head: merged PR #590
- open Draft PRs: #592, #593, and #594
- open non-Draft PRs: none
- open Issues (15): #437, #438, #439, #521, #522, #523, #524, #525,
  #527, #551, #557, #558, #559, #560, and #561
- latest successful exact-source Release Artifact run: `31267179669`
- source artifact: `proxy-gateway-02fc63a3f949` (observed expiry
  2026-08-22)

These are dated mutable facts, not permanent documentation authority. Refresh
GitHub inventory before making a later current claim. Open Draft PRs are
excluded from the exact-`master` capability baseline.

## Current Source Capability Boundary

The detailed source/test matrix is
`docs/OPERATIONS_PLANE_SOURCE_REALITY.md`. At the exact cutoff, the principal
boundaries are:

| Domain | Established in source | Still not established by this evidence |
| --- | --- | --- |
| Admin / Operations | Admin auth/session foundations, backend read-capability registry, partial protected read routes, safe projections | Full route-wide RBAC, Admin frontend `/api/admin-auth` login integration, production enablement |
| Wallet / Coin Ledger | Durable Wallet/Ledger model and additive reverse-reference migration | Production schema apply, production Wallet writes or activation |
| Recharge / Payment | Provider-neutral durable store/coordinator and Portal routes; PayPal sandbox plus XSD/ChaoJiPay source adapters | Live provider credentials/activation, refund and reconciliation operations, production migration |
| Commerce | Offer, Checkout Quote, Commerce Order, Fulfillment Command | Production schema/runtime activation and live fulfillment |
| Account Resource Authority | Exact authority/provenance source, migration, and default-off Commerce binding | Production assignment, schema apply, or runtime activation |
| Traffic / trust | Protected usage projection and fail-closed trusted-proxy/XFF handling | Admin `Usage & Channels` consumption, production proxy-topology validation |

All entries above are source/test/migration/default-off evidence. They do not
prove a release was promoted or a provider/runtime path is live.

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

The former Japan runtime-config additive-repair and bootstrap-probe workflows
are retired and absent in this source revision:

- `.github/workflows/japan-runtime-config-additive-repair.yml`
- `.github/workflows/japan-runtime-config-bootstrap-probe.yml`

Their dated Gate and execution records remain historical evidence only. This
source retirement does not authorize dispatch, modify Secrets or the protected
Environment, prove host cleanup, or change production state. Restoring the old
files alone provides no execution authority; reactivation requires fresh
read-only inventory, dry-run validation, rollback planning, and a new exact
Risk A approval.

This is source-layer retirement only. It does not cancel or disable historical
run reruns; none is authorized here. A read-only historical-run inventory is
required before operational closure can be claimed.

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
| #561 | Documentation reconciliation | Keep canonical docs and project-state aligned to exact source evidence. |

The remaining open Issues stay independently scoped. PR #476 is closed
unmerged, and PR #479 is merged source-only; both are historical lane evidence,
not current open candidates or sequencing authority.

## Release And Artifact State

The release model is:

```text
Source -> Artifact -> Release -> Deployment -> Runtime State
```

`master` is reviewed source, not a production-version claim. Artifact Manifest
v1 covers `control-plane-app`, `portal-static`, and `admin-static`.

Release Artifact run `31267179669` successfully built all three units for exact
source `02fc63a3f949b748dcccf26ba7d310be82f4b6df`. The source artifact
`proxy-gateway-02fc63a3f949` was observed with an expiry of 2026-08-22. This is
short-lived build evidence only; it neither satisfies durable release
retention nor updates deployment/runtime identity.

See `RELEASE_MANIFEST.md` for the stable contract.

## Production Boundary

The only compact production snapshot is
`docs/CURRENT_RELEASE_STATE.md`. It distinguishes:

- the latest recorded deployment event on 2026-07-20 at source
  `9982d378f93dd506c24c137197293f6942dc45ee`;
- the last fully reconciled prior production snapshot at source
  `9bc03b413e58198a08617f2e587e0120eb4d6cb2`; and
- the current live identity, which was not freshly inventoried by this Risk C
  reconciliation.

Do not copy the dated deployment table into this handoff or infer current live
state from source/artifact evidence. Provider settings, domains, deployments,
runtime services, and production data require fresh task-specific inventory.

## Source Governance And Security Snapshot

The 2026-08-09 inventory refreshed only the repository source head, open
PR/Issue posture, and exact-source artifact evidence listed above. It did not
refresh code-scanning alerts, Dependabot alerts, secret-scanning alerts,
rulesets, environment protections, provider settings, or deployment settings.
Older counts and settings observations remain dated historical evidence and
must not be repeated as current claims.

## Active Gaps

1. Current production identity and the source-to-runtime delta require a fresh
   Risk A read-only inventory before any production action.
2. Admin backend read capabilities are only partially enforced; frontend
   Admin login integration and the traffic projection consumer remain pending.
3. Wallet, Commerce, Payment, Account Resource Authority, and provider-specific
   migrations/adapters are not proven applied or enabled in production.
4. Provider refund/reconciliation paths and live credential/callback setup are
   not established.
5. Artifact run `31267179669` is short-lived build evidence, not a durable
   Artifact Gate or deployment record.
6. Mutable GitHub counts and governance/security settings require a fresh
   readback when they matter to a decision.

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
