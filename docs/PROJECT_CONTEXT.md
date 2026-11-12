# Project Context

Last updated: 2026-11-12 UTC.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: project_context
  superseded_by: null
  last_verified_at: 2026-11-12
  production_authority: false
```

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Most recent full source reconciliation record:
>   `master@eadefd98357a6bb616c5dd54c984ec265695acad` (2026-10-23 UTC; historical snapshot, not current Master)
> - Source/production boundary: #764 reset/collector and preserved #767 guard
>   are recorded BWH overlays; #769 is desktop Portal only. Later merged
>   deploy notes record the #785 three-module BWH overlay and the #786
>   application `control-plane-pr786-c7b094592662-mixed` layered on it.
>   None establishes a whole-master backend deployment. Merged source after 2026-10-11,
>   through the 2026-10-23 source cutoff, does not change this boundary. Current
>   runtime alignment was not read
> - Delivery navigation projection:
>   [GCC WebOS — Delivery Project #1](https://github.com/orgs/FlyLink-com/projects/1)
> - Earlier A3, expiry, source-capability and provider observations retain
>   their original dates; new PR reads do not refresh their runtime evidence
> - Production state: Refer to `docs/CURRENT_RELEASE_STATE.md`; this handoff
>   records the release identity but does not duplicate its runtime evidence
> - Production impact: None; this Risk C handoff changes no release, runtime,
>   provider, schema, credential, or customer data
> - Source of truth for: Compact project orientation, source capability
>   boundaries, reviewed lane taxonomy, and navigation
> - Execution authority: None

This file is the compact entrypoint for continuing
`proxy-gateway-minimal`. Historical execution detail belongs in the indexed
records under `docs/`, not in this handoff. It does not authorize production,
provider, DNS, Nginx, systemd, firewall, schema, deploy, promotion, rollback,
credential, payment, subscription-material, or customer-data actions.

## Scoped continuation (2026-10-12)

The newer [metering closeout](CURRENT_RELEASE_STATE.md#scoped-metering-closeout-2026-10-12)
records #773/#774 BWH local-three recovery and subsequent natural accounting;
do not restart the old preparation workflow. Identity is still degraded with
retention pending, and the recovery-before counts are unavailable. This is a
PR-record reconciliation, not a fresh production read. Third-party subscription
planning remains independent in #762 and its stacked implementation #771;
neither is deployed by this closeout. Re-read those native PRs before work.

## Read First

Use the repository entry order required by `AGENTS.md` and restated by
`docs/README.md`:

1. `docs/CURRENT_RELEASE_STATE.md` for dated deployed/runtime evidence
2. `RELEASE_MANIFEST.md` for the release identity contract
3. `docs/PROJECT_CONTEXT.md` for the current source-coordination boundary
4. `git status --short --branch`
5. `docs/README.md`
6. The subsystem README relevant to the task
7. [GCC WebOS — Delivery Project #1](https://github.com/orgs/FlyLink-com/projects/1) to navigate relevant
   Issue/PR items, followed by fresh native records
8. Live GitHub, deployment, or production inventory required by the task risk

`AGENTS.md` always applies. Project #1 is a mutable navigation projection;
native Issue and PR records remain authoritative for their own
state, and dated production receipts require fresh task-specific verification.
`project-state/lanes.json` owns reviewed lane definitions.
`project-state/current.json` and `project-state/tasks.json` are dated
compatibility snapshots; neither can override fresh GitHub, deployment, or
runtime evidence or authorize mutation. The Issue #675 B-tier migration aligns
their active documentation, brief, handoff, and checker consumers: generated
orientation excludes snapshot status/queue fields and mechanically requires a
fresh native Issue/PR read before current sequencing.

**Authority boundary:** The repository-local cutover is enforced, but it does
not make Project #1 or local JSON a work authority. Native Issue/PR records own
current work state and sequencing, Project #1 remains navigation only, and
operators and agents must fail closed against the relevant domain owner when
evidence conflicts or cannot be read.

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

## Scoped continuation (2026-10-23)

The newer [source reconciliation](CURRENT_RELEASE_STATE.md#source-reconciliation-2026-10-23)
advances the source cutoff to `master@eadefd98357a6bb616c5dd54c984ec265695acad`
and records the merged third-party distribution (#762/#771 and the Admin
node workspace series), data-pack (#753), usage-ledger
(#789/#790/#791/#792/#794; #793 is still an open Draft),
distribution-routing (#796) and Admin user-commerce (#799) source lines,
plus the current six open Draft PRs. The 2026-10-12 continuation below is
superseded where it describes third-party subscription work as planning:
that work landed as source on 2026-10-13 and is not deployed by either
closeout. This is a GitHub-record reconciliation, not a fresh production
read; merged source does not establish a whole-master backend deployment.
Re-read the native PRs before work. The delivery navigation projection now
points at the renamed FlyLink-com organization. That link update does not
migrate the pinned read-only Project export contract:
`project-state/project-v2-contract.json` still fixes `target.owner` and
`target.repository` to the pre-rename `gccwebos-com` values, and changing
that checksum-pinned contract is a separate reviewed contract change
outside this docs-only alignment.

## DDD Context Map (2026-11-11; derived PR classification)

The business spine above remains the stable architecture boundary. The detailed
bounded-context catalogue, ownership distinctions, context relationships, and
2026-11-11 PR-to-domain snapshot are maintained in
[DDD Context Map](project-map/DDD_CONTEXT_MAP.md).

That map is a derived classification, not a second live queue or a service
decomposition plan. Native GitHub PRs still own current status, exact HEAD,
reviews, and checks; source contracts and code own implemented behavior. Its
PR snapshot does not refresh the source/production cutoffs or runtime evidence
recorded elsewhere in this handoff.

## Approved Cloudflare Control-Plane Target (2026-11-04; not deployed)

The owner approved the target direction for Cloudflare Workers to host the
control-plane API and one Cloudflare D1 database to become the authoritative
business-control store after separately gated implementation and migration.

Target responsibility split:

- Cloudflare Worker: authenticated Admin / User Portal / client control-plane
  API, domain services, authorization, safe audit, and the asynchronous D1
  repository layer.
- One D1 database: first target is the existing shared `control.sqlite`
  boundary; domains that currently share this database remain in one
  transactional control store.
- BWH and edge nodes: data-plane agent, protocol runtimes, protected local
  runtime material, config-test/apply, node health, and usage collection.
- BWH agent communication: authenticated outbound polling/receipt protocol;
  no direct D1 access, no D1 credentials on nodes, and no public Admin surface
  on a data-plane node.

This is an approved target, not current runtime state. The source cutoff still
uses Node/Express, synchronous `better-sqlite3`, and SQLite. The root
`wrangler.jsonc` remains static-assets-only; no Worker API, D1 binding, remote
D1 resource, or production route has been created by this decision.

The initial D1 scope is one database matching the shared `control.sqlite`
path. `subscriptions.sqlite` and the optional third-party subscription store
remain outside the first cutover until their ownership and API dependencies
are explicitly resolved. Raw edge credential material remains in protected
BWH custody and is never migrated into D1.

No dual writes are permitted. SQLite remains authoritative until an exact
Risk A migration and cutover gate is completed. Remote Cloudflare resources,
secrets, routes, DNS, production data inventory, schema/data migration, and
production cutover each require their own approval. See
`docs/CLOUDFLARE_D1_DATABASE_EVALUATION.md` and
`docs/CLOUDFLARE_PUBLIC_SITE_CI.md`.

## Repository And Delivery Index

Repository: `FlyLink-com/proxy-gateway-minimal`

The source cutoff inspected for the 2026-10-23 docs-only alignment is
`master@eadefd98357a6bb616c5dd54c984ec265695acad`. Resolve the live `master`
SHA before a later source decision. The
[2026-10-11 reconciliation](CURRENT_RELEASE_STATE.md#source-and-deployment-reconciliation-2026-10-11)
records exact-source validation, dated deployment composition, open Drafts and
remaining unknowns. Native Issue/PR records remain authoritative; this handoff
does not keep a live queue or reactivate paused implementation work.

The account panel belongs to this repository's User Portal and `/api/portal`
control-plane domain. `admin/README.md` maps its legacy and desktop builds;
the protected Admin console is a separate frontend surface. Mobile and Android
consume the backend contract and require their own source, client and release
acceptance. The dated 2026-10-09 linked records paired data-pack backend #753
with mobile #13, and native-session backend #755 with Android #26; all four
were Draft at that cutoff. Client repositories were not refreshed by this
2026-10-11 minimal-repository closeout.
Company-site publication is separate: the recorded BWH cutover retained the
existing company apex/www site and did not deploy a new site build.

Use [GCC WebOS — Delivery Project #1](https://github.com/orgs/FlyLink-com/projects/1)
only to navigate mutable Issue/PR, status, lane and risk projections. Resolve
scope, sequencing and completion from fresh native records and exact-SHA checks.
`project-state/*.json` remains dated compatibility input, not a parallel task
list. Cross-repository feature completion cannot be inferred from one merge or
one frontend build.

## Current Source Capability Boundary

The matrix and non-activation observations in this section retain their
2026-09-14 reconciliation cutoff; they are not a new 2026-10-11 domain audit.
Use the linked fresh snapshot above for recent PR and deployment state.

The detailed source/test matrix is
`docs/OPERATIONS_PLANE_SOURCE_REALITY.md`. Its Operations capability matrix is
a dated source-reality inventory. The A3 row below additionally reflects the
2026-08-26 production closeout without reclassifying any other domain:

| Domain | Established in source | Still not established by this evidence |
| --- | --- | --- |
| Admin / Operations | Admin auth/session foundations, backend read-capability registry, partial protected read routes, safe projections, and PR #729 `admin-auth` client/boundary source | Full route-wide RBAC, production enablement, and Admin `Usage & Channels` consumption of the traffic projection |
| Wallet-first / Coin Ledger extension | Wallet-first model and additive reverse-reference migration | Application of the four wallet-first schemas, wallet-first writes, or wallet-first activation |
| Wallet-first Recharge / Payment extension | Provider-neutral durable store/coordinator and Portal routes; PayPal sandbox plus XSD/ChaoJiPay source adapters | New wallet-first provider activation, refund/reconciliation operations, or wallet-first production migration |
| Wallet-first Commerce extension | Offer, Checkout Quote, Commerce Order, Fulfillment Command | Wallet-first/deferred schema or runtime activation and new live fulfillment |
| Account Resource Authority | Exact Authority/provenance source, migration, and default-off Commerce binding | Authority production assignment, schema apply, or runtime activation |
| Traffic / trust | Protected usage projection and fail-closed trusted-proxy/XFF handling | Admin `Usage & Channels` consumption, production proxy-topology validation |
| A3 dependency materialization | Source contracts, physical collector, exact-head XFS quota and service-native smoke proofs, explicit XFS/bounded admission paths, hardened staging/controller flow, exact artifact materialization and production promotion through PRs #646-#667 | Promotion-09 ended `promoted_verified` for `control-plane-b5ca23db-a3-sync-20260825`; durable artifact retention remains Issue #597, and no schema or feature activation is inferred |

The 2026-08-26 terminal receipt recorded exact source `b5ca23db...` as
available on that host at the promotion cutoff, but the event did not apply the
four wallet-first schemas or enable the wallet-first/deferred/Authority lane.
Promotion-09 explicitly recorded no schema mutation or feature activation.
Current host and runtime availability require fresh inventory; the entries
above therefore remain dated non-activation evidence for those lanes.

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

## Reviewed Work-Lane Taxonomy

Project #1 projects the work items currently present in that Project and the
six live coordination fields. Native Issue and PR records, plus fresh
reconciliation, determine repository work completeness and item state.
`project-state/lanes.json` owns lane definitions and safety boundaries. Issue
bodies remain authoritative for scope, declared risk, done criteria, and links
to any required production gate. For current lane membership, the Project
`Lane` field is a mutable navigation classification whose values are checked
against `lanes.json`; it is not execution or production authority.

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
additional Project taxonomy. Read current Issue and PR state from their native
records, using Project #1 only for navigation rather than maintaining a second
status table here.

## Release And Artifact State

The release model is:

```text
Source -> Artifact -> Release -> Deployment -> Runtime State
```

`master` is reviewed source, not a production-version claim. Artifact Manifest
v1 covers `control-plane-app`, `portal-static`, and `admin-static`.

The latest read BWH receipts add #764 reset/collector, retained #767 containment
and #769 desktop Portal to the earlier composition. Exact source, artifact/check
links, Deploy Notes and acceptance limits are indexed in
`docs/CURRENT_RELEASE_STATE.md`. #763's backend dependency deployment is still
unproven in that mixed app; the newer master-built desktop artifact is a
separate release unit. #768 real-account display confirmation remains open.
The 2026-08-26 A3 receipt remains historical evidence for its original target.

See `RELEASE_MANIFEST.md` for the stable contract. No current artifact retention,
live service identity or production health is inferred from this docs read.

## Production Boundary

The only compact production snapshot is
`docs/CURRENT_RELEASE_STATE.md`. Its 2026-10-11 section indexes later BWH
deployment records and their incomplete business/client acceptance. No live
runtime, host, provider or customer-account reads were performed here.

The following older observations retain their own historical cutoffs:

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

Project #1 is a mutable navigation projection of repository work. Its item set,
status distribution, review view, and Lane/Risk values may be read for
coordination, but they do not own current Issue/PR state, review state, or
sequencing; those require fresh native records. This handoff no longer
preserves copied Issue, PR, or branch counts.

The latest retained security/governance observations remain separately dated:

- the A3 release-source CI, CodeQL, Release Artifact, Dependency Artifact, and
  production dry-run evidence applies to
  `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`, not to the later source cutoff;
- the 2026-09-12 API readback reported zero open Dependabot alerts, secret
  scanning disabled, and unavailable code-scanning alert inventory because
  Code Security is not enabled; the 2026-09-14 inventory did not re-query
  those counts
- the same dated 2026-09-12 source inventory found 13 of 40 workflow Action
  `uses:` references full-SHA pinned and 27 mutable tags;
- rulesets, required reviews, Environment protection, provider settings, and
  deployment settings require fresh live readback before relying on them.

Issues #597 and #598 retain release-lifecycle and supply-chain work. Issue #673
remains a release-maturity/governance index card. Issue #695 was observed closed
on 2026-10-09; closure is not current runtime proof.
Project status is navigation only and cannot upgrade these dated observations
or create production authority.

## Dated Gap Observations — Fresh Read Required

The list below retains the 2026-09-14 handoff cutoff. Later BWH source and
deployment receipts are indexed above; this is not the current task queue.

The following observations were retained at this handoff's stated evidence
cutoffs. They are not a live backlog or current completion claim; reconcile the
relevant native Issue/PR, source, Checks, and task-specific runtime evidence
before using one to select work.

1. The control-plane identity was verified by promotion-09 on 2026-08-26; Portal,
   Admin, company-site, rendering, and runtime-config identities still require
   their own task-specific read-only inventory before production action.
2. Admin backend read capabilities are only partially enforced. PR #729 added
   Admin `/api/admin-auth` client and boundary source after the 2026-09-12
   matrix; production enablement, complete RBAC, and the traffic projection
   consumer remain unproven.
3. The four wallet-first schemas, wallet-first/deferred runtime, and Account
   Resource Authority are not proven applied or enabled in production. The
   2026-08-26 terminal receipt preserved the prior documented legacy Wallet,
   Commerce, and XSD recharge state without revalidating current runtime state.
4. Wallet-first provider refund/reconciliation paths and new live
   credential/callback setup are not established.
5. The 2026-08-26 control-plane release has a durable Deploy Note and dated
   terminal identity readback; current runtime identity still requires a fresh
   read. Build evidence alone does not establish durable Portal/Admin artifacts
   or their production activation records.
6. Mutable GitHub counts and the expiry/alignment table were refreshed on
   2026-09-14 in `docs/CURRENT_RELEASE_STATE.md`. Rulesets beyond the observed
   `Validate` requirement, Environment protection, provider settings, and
   production runtime identity still require a fresh readback when they matter
   to a decision.
7. A3 dependency materialization and `control-plane-app` promotion completed at
   exact source `b5ca23db...`; promotion-09 ended `promoted_verified`. The old
   XFS-only A3-2 inventory is historical, while schema/feature activation and
   other release units remain outside the completed A3 boundary.
8. A 2026-09-14 GitHub API readback recorded the deployed-source Actions
   artifacts as expired at 2026-09-08T13:42Z. Expiry does not invalidate the
   recorded deployment evidence, but it prevents a later promotion from
   downloading that same packet. Current-`master` artifacts exist as separate
   undeployed build evidence. The terminal receipt recorded a retained rollback
   release; its current availability requires fresh inventory. Longer recovery
   windows, rollback retention, SBOM, provenance/signing, and the remaining
   mutable Action references remain scoped under #597/#598.
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
- [GCC WebOS — Delivery Project #1](https://github.com/orgs/FlyLink-com/projects/1): mutable navigation projection
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
- Use current Git source and native live Issue/PR records for sequencing, with
  Project #1 as navigation only; do not reactivate historical lanes from a
  frozen snapshot.
