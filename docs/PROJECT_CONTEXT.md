# Project Context

Last updated: 2026-07-15, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: project_context
  superseded_by: null
  last_verified_at: 2026-07-15
  production_authority: false
```

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Execution authority: Does not authorize production, provider, DNS, Nginx,
>   systemd, firewall, schema, deploy, promotion, rollback, credential, payment,
>   subscription-material, or customer-data actions
> - Production impact: None
> - Production/runtime evidence cutoff: `2026-07-11T13:03:40Z`; dated evidence only
> - Source of truth for: Current repo orientation, Phase 2 queue, documented
>   release state, validation entrypoints, and first-pass Agent boundaries

This file is the compact entrypoint for continuing
`proxy-gateway-minimal`. Historical execution detail belongs in the indexed
records under `docs/`, not in this handoff.

## Read First

Use this order before any work:

1. `docs/CURRENT_RELEASE_STATE.md`
2. `RELEASE_MANIFEST.md`
3. `docs/PROJECT_CONTEXT.md`
4. `git status --short --branch`
5. `docs/README.md`
6. The subsystem README relevant to the task
7. Live GitHub, deployment, or production inventory required by the task risk

`project-state/*.json` is a compact coordination layer. It does not override
live production evidence or authorize external mutation.

## Current Classification

The project is a:

```text
Release-managed monorepo
  + Platform Foundation
  + Phase 2 Operational Reliability
```

It is not yet a fully reconciled platform product. Artifact governance is
stronger than deployment/runtime reconciliation, and commercial providers are
not live.

## Current Architecture

Use this mental model:

```text
Adapters
  company site | User Portal | protected Admin | CLI

Control plane
  Vultr Japan
  accounts | entitlements | orders/access requests | delivery | usage ledger

Interconnect
  authenticated desired-state, protected material refs, redacted receipts

Data plane
  Vultr Japan + Vultr Singapore
  VLESS Reality | Hysteria2 | TUIC

Evidence domains
  source | artifact | deployment | runtime observation
```

Do not derive production state from `master` alone. Artifact Identity and
Runtime Identity are independent evidence domains until explicit reconciliation
links them.

## Repository

Active checkout:

```text
D:\Projects\proxy-gateway-minimal
```

Repository:

```text
gccwebos-com/proxy-gateway-minimal
```

At the 2026-07-15 read-only source snapshot:

- `master`: `5b61d9d787e2f98e9f834fe05de6dcbb6805cea7`
- reconciliation inventory baseline: exact `master@5b61d9d787e2f98e9f834fe05de6dcbb6805cea7`
- observed remote branches (16): `origin/master`,
  `origin/codex/ci-lane-split`,
  `origin/codex/commercial-model-v1`,
  `origin/codex/fix-cumulative-usage-accounting`,
  `origin/codex/fix-pr471-credential-lifecycle-review`,
  `origin/codex/fix-trial-traffic-limit`,
  `origin/codex/operations-foundation`,
  `origin/codex/test-edge-material-valid-until`,
  `origin/codex/traffic-accounting-observation-validator`,
  `origin/codex/traffic-accounting-unresolved-provenance`,
  `origin/codex/traffic-lifecycle-enforcement`,
  `origin/docs/current-source-state-reconciliation`,
  `origin/docs/governance-state-reconciliation-20260714`,
  `origin/docs/infrastructure-access-rule`,
  `origin/docs/project-intelligence-layer`, and
  `origin/docs/release-governance-calibration`
- current head is merged PR #494: `5b61d9d787e2f98e9f834fe05de6dcbb6805cea7`
- open PRs (2): Draft #476 and #479; no open non-Draft PRs
- open Issues: #437, #438, #439, #440, and #475
- Issue #437 was reopened by Risk C receipt `issuecomment-4976074286` because
  PR #482 had been recorded as its closer despite explicitly denying resolution
- latest master CI: `29418796398`, success
- latest Release Artifact run: `29418796724`, success
- latest master CodeQL runs: `29418794902` and `29418794903`, success
- latest Deploy Cloudflare Site run: `29391680029`, build and verification
  succeeded for `329eb282ef88e7ab41bee1252f22fe3570f7d3c8`; deploy skipped

These are dated facts. Re-run Git and GitHub inventory before making a current
claim.

Historical checkouts under the former C drive project paths are archive or
reference surfaces, not active source.

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

Short replies alone do not authorize a production gate. The reviewer defines
scope, target, forbidden actions, validation, rollback, and stop conditions;
the operator approves or rejects that exact gate.

Every implementation PR must contain intent, execution, actual validation, and
remaining gates. Issues are durable index cards; PRs are execution summaries
and validation receipts.

## Phase 2 Queue

Keep one primary implementation lane active:

| Order | Issue | Lane | Current state |
| --- | --- | --- | --- |
| 1 | #437 | Traffic Accounting | Primary lane; reopened by Risk C receipt `issuecomment-4976074286`; Draft #479 remains behind `master`; Gate `pr479-forward-pending-rollback-obligation-remediation-20260715-003` terminated blocked and its approval is consumed |
| separate | #475 | Operations Foundation | Open source/schema lane; Draft #476 has merge conflicts, is not deployed, and carries no production schema initialization or runtime mutation authority |
| 2 | #438 | Portal Lifecycle | Queued after traffic semantics stabilize |
| 3 | #439 | Commercial Foundation | Queued; #472/#474 add source foundations while billing and AppsFlyer remain non-live |
| 4 | #440 | Code Boundary Cleanup | Opportunistic guardrail only |

Issues #457 and #462 are closed. Real merges proved that Vercel candidates and
Cloudflare saved versions do not become active production solely because source
was merged. Promotion remains separately gated.

At this inventory cutoff, two Draft PRs are open. #476 belongs to the separate
#475 operations-foundation source/schema lane and currently has merge
conflicts. #479 belongs to #437, is not deployed, and remains at
`58ccdccc6af5ed120541f03d2713857e4a9a8a65`, behind `master`, with zero
unresolved non-outdated review threads. Gate
`pr479-forward-pending-rollback-obligation-remediation-20260715-003` was
approved by `issuecomment-4979572712` and terminated blocked at `fresh_binding`
by `issuecomment-4979585832` because of
`worktree_submodule_guard_null_wrapper_failure`. The approval is consumed and
nonreusable, no later durable Gate exists, and successful checks on that head
are not current-`master` integration evidence.

Do not pre-create broad pipeline, Portal redesign, payment activation, or
architecture-refactor PRs. Each source PR must answer:

1. What capability does it produce?
2. Who consumes it now and later?
3. Why are adjacent runtime, UI, business, or deployment changes excluded?

## Release And Artifact State

The release model is:

```text
Source -> Artifact -> Release -> Deployment -> Runtime State
```

`master` is reviewed source, not a production-version claim.

Artifact Manifest v1 currently covers:

- `control-plane-app`
- `portal-static`
- `admin-static`

The latest source build proof is Release Artifact run `29418796724` for
`master@5b61d9d787e2f98e9f834fe05de6dcbb6805cea7`. It is artifact evidence only
and does not update any deployment or runtime identity.

Runtime Config Identity v1 provides an offline deterministic observation
identity generator for Japan and Singapore runtime config. It has not observed
production and does not contain deployment state.

This offline identity capability is separate from the protected traffic
Evidence Runtime on Japan. The latter is active in observation-only mode and
its read-only projection is reconciled; it does not influence accounting,
quota, recovery, or trust decisions.

See `RELEASE_MANIFEST.md` for the contract and
`docs/CURRENT_RELEASE_STATE.md` for current documented identities.

## Deployment Boundary

The company site uses Vercel Git integration:

- Production Branch: `master`
- `autoAssignCustomDomains=false`
- current public alias target:
  `proxy-gateway-minimal-hqdudl13g-gccltd.vercel.app`
- current GitHub Production deployment: `5389897330`
- latest staged candidate: Vercel deployment
  `proxy-gateway-minimal-l4wfa6q0h-gccltd.vercel.app`, GitHub deployment
  `5403913679`, source `e1beacc15fdc35661077cd3387f3ba17a3966e1a`
- staged proof: candidate READY, `production_environment=false`, and neither
  public custom alias moved

No Vercel promotion or rollback is authorized by this document.

The Cloudflare public-site workflow keeps automatic deploy disabled through
`CLOUDFLARE_SITE_AUTO_DEPLOY=false`. Pushes that match its paths may still run
build and verification. Manual deployment remains a separate production gate.

Cloudflare native Workers Builds is a separate provider path. The #461 merge
auto-promoted Worker deployment `540da82f-b04d-4d67-9c8d-c5542d55e8a5`
before that path was identified. Under Issue #462 approval, only the native
production trigger command was changed to `npx wrangler versions upload`.
The #463 merge proved version creation without active promotion, and Issue #462
is closed. The #468 merge created saved version
`407eb863-0e82-4e73-af54-3a44722b07c9`; the active deployment was not
independently re-read during this C-tier reconciliation.

At the latest read-only GitHub governance inventory, the private organization
uses the Team plan and `master` is protected by the active
`master-governance-single-owner` repository ruleset `18935716`. The ruleset blocks deletion
and non-fast-forward updates, requires pull requests, has no bypass actors, and
strictly requires the `Validate` check. It requires zero approving reviews and
does not require review-thread resolution. The `artifact-publication`
environment is limited to `master` by branch policy but has no reviewer or wait
timer; `Production`, `cloudflare-production`, `Preview`, and the two Vultr
production environments have no protection rules. Six environments exist;
only `artifact-publication` has a branch policy, and none has reviewer
enforcement. Process evidence therefore does not yet equal independently
enforced merge or deployment approval.

PR #483 introduced docs-only/code lane routing and always-run diff checking
while retaining one stable required `Validate` context. It did not create
independent lane contexts or change the ruleset/settings boundary above.

## Source Governance And Security Snapshot

CodeQL runs `29418794902` and `29418794903` completed successfully for exact
`master@5b61d9d787e2f98e9f834fe05de6dcbb6805cea7`. At this cutoff, GitHub reports
0 open code-scanning alerts, 0 open Dependabot alerts, and 0 open
secret-scanning alerts. Successful execution remains source-analysis evidence;
required-check policy and any production decision remain separate reviewed
actions.

## Documented Production Snapshot

The compact current snapshot is in `docs/CURRENT_RELEASE_STATE.md`.

Important boundaries:

- `control-plane-app`: `active_documented` as
  `phase2-control-plane-artifact-alignment-20260710-001`, source `9bc03b41`.
- `company-site-static`: `deployed_unreconciled`; current Vercel public and
  Cloudflare workers.dev identities are known, but portable artifact lineage is
  incomplete.
- `portal-static`: `deployed_unreconciled`.
- `admin-static`: `unknown` production identity.
- Japan and SGP runtime config: `active_documented`, not live-observed by
  offline Runtime Config Identity v1. Japan traffic Evidence Runtime is active
  observation-only and reconciled; identity sync remains degraded.
- `subscription-rendering`: `deployed_unreconciled`.
- AppsFlyer: disabled/dry-run only.

The documented control-plane source is an ancestor of current `master`.
PRs #466 through #468, #471, #473, #474, #477, #490, and #491 are source-only;
#478 is an offline validator; #481 is test-only; #486-#488 are Admin dependency
remediations without a recorded production promotion; and
#480/#485/#482/#483/#489/#492/#494 are governance, CI, or docs-only. Current
open PRs are not merged or deployed. No later source, CI, CodeQL, or artifact
evidence changes the dated production pointer.

## Active Blockers

1. #437 has a 2026-07-23 read-only Japan TUIC aggregate snapshot with
   `missing=3`, `stale=46`, and an additive-only candidate of `add=3`,
   `remove=0`. Periodic traffic collection is active, but identity mapping
   remains degraded. The source repair contract is merged; its protected
   production capability is not bootstrapped and map apply has not started.
2. Offline Runtime Config Identity has not observed Japan or Singapore
   production; this must not be confused with the active traffic Evidence
   Runtime.
3. Company site, Portal, Admin, and subscription-rendering lineage is not fully
   reconciled.
4. Billing and AppsFlyer are intentionally non-live.
5. The active `master` ruleset does not require an approving review or thread
   resolution, and deployment environments do not have reviewer enforcement.
6. GitHub currently reports zero open code-scanning, Dependabot, and
   secret-scanning alerts; this source snapshot is not production proof.
7. Draft PR #479 is behind current `master`; Gate
   `pr479-forward-pending-rollback-obligation-remediation-20260715-003`
   terminated blocked, and its approval is consumed and cannot be reused.

## Next Actions

1. Establish a new durable successor proposal on #437 after the blocked,
   consumed Gate `pr479-forward-pending-rollback-obligation-remediation-20260715-003`.
2. Complete any newly authorized PR #479 source remediation,
   current-`master` integration,
   exact-head checks, formal review, Ready, and merge through independent
   approvals.
3. Finish the Gate ledger/validator, stable CI contexts plus settings Gate,
   durable artifact retention/binding, and the minimal
   organization/runtime-evidence model through separate PRs.
4. Only then establish independent Artifact and Risk A production-alignment
   Gates.

Historical Aliyun, AWS canary, old carrier PR, and Admin OS task queues are not
current execution authority. Use Git history and the archive/index documents
only when archaeology is explicitly required.

## Validation Baseline

Use `docs/VALIDATION_BASELINE.md`.

Short matrix:

- C docs-only: `git diff --check origin/master...HEAD`
- project-state changes: `npm run project-state:check` plus diff check
- server/shared source: focused tests, `npm test`, and diff check
- Admin UI: focused tests, `npm run admin:test`, `npm run admin:build`,
  `npm test`, and diff check
- A-tier: runbook-specific validation; no generic shortcut

GitHub Actions success is build evidence, not production evidence.

## Documentation Navigation

Use these entrypoints:

- `docs/README.md`: full documentation index
- `docs/project-state/`: derived project-intelligence views; verify their dated
  cutoff and defer to the authoritative entry documents and JSON state
- `docs/CURRENT_RELEASE_STATE.md`: current documented release identities
- `RELEASE_MANIFEST.md`: source/artifact/release/deployment/runtime model
- `docs/GITHUB_ISSUE_PR_WORKFLOW.md`: Issue and PR ownership
- `docs/FOUNDATION_FREEZE_2026_07_09.md`: Phase 1 closeout boundary
- `docs/TRAFFIC_ACCOUNTING_QUOTA_GATEWAY_PLAN.md`: active #437 domain plan
- `docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md`: queued #438 domain plan
- `docs/BILLING_RECHARGE_CONTRACT.md`: queued #439 foundation
- `docs/PROJECT_SIMPLIFICATION_MAP.md`: cleanup and non-goal map
- `docs/production-replacement-records/`: production execution evidence
- `docs/archive/`: superseded plans and historical context

Do not copy historical execution narratives back into this file. Add only facts
that change current orientation, queue order, risk boundaries, or the documented
release snapshot.

## Guardrails

- Do not commit or output secrets, credentials, subscription material,
  production environment values, private keys, SQLite rows, raw runtime config,
  raw logs, or customer data.
- Do not expose public Admin.
- Do not mutate production, providers, DNS, Nginx, systemd, firewall, schema,
  auth, runtime, deployment, promotion, or rollback without an exact Risk A
  gate and operator approval.
- Do not treat a merged PR, successful CI run, artifact, runbook, or dated
  execution record as current production proof.
- Do not reactivate historical Aliyun/AWS lanes without a new Issue, fresh
  inventory, and explicit approval.
- Keep Phase 2 serial: #437, then #438, then #439; use #440 only when active
  work exposes a measured boundary.
