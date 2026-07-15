# Project Milestones

Last verified: 2026-07-14, America/Los_Angeles.

> Status:
> - Type: Evidence-backed milestone map
> - Risk: C
> - Execution authority: Does not authorize source implementation,
>   production, runtime, provider, deployment, promotion, rollback, or
>   customer-data actions
> - Production impact: None
> - Authority: Derived portfolio crosswalk only; does not rename GitHub phases,
>   Issues, or queue order
> - Index scope: Map the requested Foundation, Governance, Runtime, and
>   Commercial portfolio labels to current repository evidence

## Interpretation Rule

These phase names are a portfolio view. They do not create release units,
runtime states, or approval gates. A status is recorded only when the current
checkout or current GitHub inventory supports it. `Information gap` means the
repository has no explicit completion decision at this evidence cutoff.

## Portfolio To GitHub Crosswalk

The phase labels in this file are portfolio groupings accepted through closed
Issue #484 and merged PR #485. They do not rename the repository's official
GitHub Issues or create a new execution sequence.

| Portfolio label in this file | Current official repository/GitHub mapping | Queue effect |
| --- | --- | --- |
| Phase 0 Foundation | Source-level foundation freeze in `docs/FOUNDATION_FREEZE_2026_07_09.md`; not a GitHub Phase label. | None. |
| Phase 1 Governance | Cross-cutting repository/release governance contracts; no explicit GitHub milestone named `Phase 1 Governance` was verified. | None. |
| Phase 2 Runtime | Portfolio view over the active operational-reliability/runtime domain. GitHub Issue #437 remains `[Phase 2][Epic 1]`. | Issue #437 stays first. |
| Phase 3 Commercial | Portfolio view for future commercial maturity. GitHub Issue #439 remains `[Phase 2][Epic 3]`; this label does not rename it to GitHub Phase 3. | Issue #439 stays after #438. |

The authoritative serial queue remains:

```text
#437 Traffic Accounting
  -> #438 Portal Lifecycle
  -> #439 Commercial Foundation
```

Issue #440 remains the opportunistic code-boundary guardrail described by
`docs/PROJECT_CONTEXT.md`; this portfolio crosswalk does not change that rule.

The current source cutoff is
`master@2413c101724df45579ebf4b9e0f306d32d9bb1af`: PR #482 merged as
`06d69b2da07a50322a260bd08f160febaf7b6a7d` and PR #483 merged as the
current head. The observed repository has 18 remote branches, five open PRs
(Draft #476/#479 and non-Draft #486/#487/#488), and five open Issues
(#437/#438/#439/#440/#475).

## Phase 0 Foundation

**Goal**

Freeze the modular-monolith product and engineering baseline so later work
starts from `master`, preserves the stable product spine, and does not reopen
superseded carrier branches or mix unrelated runtime, frontend, commercial,
and governance changes.

**Status**

`source_frozen_not_feature_complete`

The repository contains a foundation freeze dated 2026-07-09. That document
explicitly says the freeze is not production proof and does not mean every
foundation capability is complete.

**Dependencies**

- `master` as the reviewed source baseline;
- current-first documentation and archive boundaries;
- risk-tiered validation and change control.

**Acceptance Criteria**

| Criterion | Evidence state |
| --- | --- |
| Modular-monolith and adapter boundaries are documented. | Met in `docs/FOUNDATION_FREEZE_2026_07_09.md` and `docs/PROJECT_CONTEXT.md`. |
| Historical carriers are not current merge vehicles. | Met in the foundation/archive records. |
| Foundation freeze is not misreported as production freeze or feature completion. | Required invariant; explicitly stated in the freeze document. |

## Phase 1 Governance

**Goal**

Keep source, review, artifact, deployment, and runtime evidence separate; use
Issues/PRs, Risk A/B/C, project-state JSON, validation receipts, and explicit
production gates as one auditable governance model.

**Status**

`partially_established_completion_not_declared`

The governance components exist, and PRs #480, #485, #482, and #483 are merged
in the current source baseline at
`master@2413c101724df45579ebf4b9e0f306d32d9bb1af`. PR #483 introduced
docs-only/code routing and always-run diff checking while retaining one stable
required `Validate` context. Exact-master CI `29381367549`, Release Artifact
`29381367545`, and CodeQL `29381507931` succeeded; Cloudflare workflow
`29381367553` completed build, verification, and dry-run with deploy skipped.
No checked-in record
reviewed by this task declares a portfolio milestone named `Phase 1
Governance` complete.

**Dependencies**

- Phase 0 source and archive boundaries;
- `AGENTS.md` risk tiers;
- `RELEASE_MANIFEST.md` four-gate model;
- `docs/GITHUB_ISSUE_PR_WORKFLOW.md` ownership rules;
- existing `project-state/*.json` and `npm run project-state:check`.

**Acceptance Criteria**

| Criterion | Evidence state |
| --- | --- |
| Source, Merge, Artifact, and Production gates are defined independently. | Met in current source docs. |
| Machine-readable coordination has one repository-local mechanism. | Met: `project-state/*.json`; this work adds no competing YAML. |
| Drift-prone GitHub/source snapshots are reconciled after queue changes. | Met for this cutoff by merged PR #482 and this bounded C-tier reconciliation. |
| Merge and environment settings independently enforce review. | Not met: ruleset `18935716` requires strict `Validate`, zero approvals, and no review-thread resolution; six environments exist, only `artifact-publication` has a branch policy, and none has reviewer enforcement. |
| A formal milestone completion decision exists. | Information gap. |

## Phase 2 Runtime

**Goal**

Improve operational reliability and traffic-accounting evidence while keeping
runtime, identity, quota, trust, deployment, and repair mutations behind their
required gates.

**Status**

`active_source_lane_live_runtime_not_assessed`

Current GitHub inventory confirms that Issue #437 is open after Risk C receipt
`issuecomment-4976074286` reopened it because PR #482 had been recorded as its
closer despite explicitly denying resolution. Draft PR #479 remains at
`03d744556be6785ac8c97dae2bc4fb79ae9e246f`, behind `master`, with three
unresolved non-outdated threads. Its predecessor receipt
`issuecomment-4966594034` remains blocked, its predecessor approval is
consumed, no durable successor Gate exists, and it is not deployed. Repository
handoff documents classify Phase 2 Operational Reliability as current, but
their detailed runtime snapshot remains dated at `2026-07-11T13:03:40Z` and
this task performed no live inventory. Old PR #479 checks are not
current-`master` integration evidence.

**Dependencies**

- Phase 1 source/release governance;
- verified control-plane and data-plane boundaries;
- Issue #437's own acceptance and sequencing rules;
- exact Risk A approval for any production/runtime mutation.

**Acceptance Criteria**

| Criterion | Evidence state |
| --- | --- |
| Issue #437 state is tracked through current GitHub evidence. | Partially met: current open state verified; detailed execution state intentionally not imported. |
| Source capabilities, artifact identity, deployment, and runtime observation are reconciled rather than inferred. | Required; current completion not asserted by this task. |
| Runtime-affecting changes have fresh inventory, approval, validation, and rollback evidence. | Not assessed; outside C-tier scope. |
| Phase closure is recorded explicitly. | Not met: Issue #437 remains open. |

## Phase 3 Commercial

**Goal**

Build a provider-neutral commercial foundation after operating and portal
lifecycle semantics are stable, with live payment and attribution providers
remaining separately gated.

**Status**

`queued_provider_activation_non_live`

Current GitHub inventory confirms Issue #439 is open. PR #472 is present on
`master` as a source-level commercial model change. Dated project state says
billing and AppsFlyer remain non-live; no live provider inventory was performed
by this task.

**Dependencies**

- Phase 2 traffic and quota semantics;
- Issue #438 portal lifecycle sequencing;
- provider-neutral contracts and fail-closed adapters;
- separate Risk A gates for live credentials, webhooks, settlement, payout,
  attribution dispatch, or production schema changes.

**Acceptance Criteria**

| Criterion | Evidence state |
| --- | --- |
| Commercial model and provider-neutral boundaries are source-reviewed. | Partially met; exact portfolio completion is not declared. |
| Live providers remain disabled until separately approved and validated. | Current documented rule; live state was not independently inventoried here. |
| Issue #439 done criteria are satisfied and explicitly closed. | Not met: Issue #439 is open. |
| Production commercial activation has its own Risk A evidence. | Information gap / future gate. |

## Status Change Rule

Update a milestone only from a merged source decision, current GitHub state, or
fresh approved runtime evidence appropriate to the risk. Do not infer phase
completion from a branch, Draft PR, successful build, artifact, or dated
snapshot alone.

## Ordered Next Gates

1. Establish a durable successor Gate on #437 for PR #479.
2. Complete PR #479 source remediation, current-`master` integration,
   exact-head checks, formal review, Ready, and merge through independent
   approvals.
3. Finish the Gate ledger/validator, stable CI contexts plus settings Gate,
   durable artifact retention/binding, and the minimal
   organization/runtime-evidence model through separate PRs.
4. Only then establish independent Artifact and Risk A production-alignment
   Gates.

The source-security snapshot is 39 open code-scanning alerts (2 critical, 36
high, 1 medium), 3 Dependabot alerts (2 high, 1 low), and 0 secret-scanning
alerts. Successful CodeQL execution does not resolve alerts or prove
exploitability.
