# Recent PR Capability Map - 2026-07-09

> Status:
> - Type: Dated source/capability/release traceability snapshot
> - Risk: C
> - Production impact: None
> - Source baseline: `master` at `9d48592c`
> - Scope: The 10 most recently merged pull requests at the time of review
> - Execution authority: None. This document does not authorize deployment,
>   runtime mutation, static replacement, provider changes, credentials,
>   subscription material, or customer-data access.

## Purpose

This map translates recent pull requests from file-oriented summaries into
capability boundaries. It answers four separate questions:

1. What capability entered `master`?
2. Which source component produces it and who consumes it?
3. Which release unit would need promotion for production to consume it?
4. Is there evidence that the capability was actually deployed and validated?

The capability identifiers below are retrospective map labels, not formal
SemVer releases. They do not replace Git commits, artifacts, Deploy Notes, or
live runtime verification.

`Release unit if promoted` is also not a deployment claim. It identifies the
smallest expected deployment boundary based on the merged source. When the
source spans more than one boundary or ownership is ambiguous, the map records
that ambiguity instead of inventing a release assignment.

## Capability Map

| PR | Capability label | Producer and consumers | Release unit if promoted | `master` evidence | Production evidence |
| --- | --- | --- | --- | --- | --- |
| [#441](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/441) | `collector-state-contract@v1` | Producer: runtime usage-accounting projection. Current consumers: runtime report and redacted collector CLI summary. Future consumers remain outside this PR. | `control-plane-app` | Merged as `9d48592c`. | `not_deployed`; PR and Issue #437 explicitly separate source from production. |
| [#436](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/436) | `phase-2-foundation-baseline@v1` | Producer: current-state docs/project-state plus deterministic data-plane test fixtures. Consumers: agents, maintainers, and CI. | None; repository coordination and tests only. | Merged as `2ac196b7`. | No production action; fixture change does not alter production expiry behavior. |
| [#435](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/435) | `local-proxy-control-boundary@v1` | Producer: gated local proxy-control routes. Consumers: local operator console and diagnostics ownership. | `control-plane-app` | Merged as `53eb5a10`. | No matching production deployment asserted by the PR or current execution-record scan. |
| [#434](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/434) | `aliyun-runtime-default-retirement@v1` | Producer: explicit Mihomo adapter/CLI configuration boundary. Consumers: current runtime wiring, install/config tooling, and maintainers. | `control-plane-app` | Merged as `7d70292e`. | Source-only retirement; no production/provider/runtime mutation in the PR. |
| [#433](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/433) | `aliyun-gate-api-retirement@v1` | Producer: removal of retired server/Admin gate APIs and DTOs. Consumers: protected Admin and control-plane route ownership. | `control-plane-app` and `admin-static`; promotion must remain separate per unit. | Merged as `1935a806`. | Source-only cleanup; no matching production deployment asserted. |
| [#432](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/432) | `portal-preview-isolation@v1` | Producer: route-scoped construction of the preview fixture client. Consumers: real Portal route and local preview QA. | Unresolved shared static-source ownership: `admin-static` versus `portal-static` must be declared by a future artifact manifest before promotion. | Merged as `a7e25425`. | No production static replacement in the PR. Vercel/preview checks are not production-Portal deployment evidence. |
| [#427](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/427) | `foundation-freeze-and-archive-boundary@v1` | Producer: docs and project-state freeze/index. Consumers: agents, maintainers, and later lane planning. | None; docs/project-state only. | Merged as `790f20a6`. | No production action and no formal SemVer release declaration. |
| [#426](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/426) | `company-site-mobile-experience@v1` | Producer: GCC WebOS public-site responsive UI and copy. Consumers: public website visitors. | Execution record says `portal-static`, but the target was the company/public site; release-unit naming requires correction before the next public-site promotion. | Merged as `e853076d`. | A Vercel production deployment is recorded, but it used a prebuilt artifact from `1699a17a` plus dirty working-tree changes. The artifact is not proven reproducible from `e853076d`; treat this as a lineage gap, not commit-to-production parity. |
| [#425](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/425) | `subscription-refresh-abuse-controls@v1` | Producer: portal refresh cooldown and credential/artifact keyed subscription limiter. Consumers: Portal refresh and public subscription-fetch boundaries. | `control-plane-app` | Merged as `5d23e1ab`. | PR explicitly remained source-only; no matching production execution record was found in the current production-record scan. |
| [#424](https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/424) | `production-deployment-evidence-index@v1` | Producer: three execution records. Consumers: operators, agents, rollback review, and source/production reconciliation. | Evidence spans `control-plane-app` and `japan-runtime-config`; PR #424 itself is docs-only. | Merged as `b2ce22d8`. | Records already executed deployment of PR #417 quota auto-suspend, PR #418 account delivery lifecycle, and Japan metering runtime-config restoration. Merging #424 did not perform those actions. |

## Lane Attribution

| PRs | Lane posture | Follow-up decision |
| --- | --- | --- |
| #441 | Phase 2 Traffic Accounting Foundation | Current capability baseline. Collector error provenance is queued but not started. |
| #436 | Phase 2 foundation gate | Complete; do not reopen or add business scope. |
| #435, #434, #433 | Phase 1 retirement and ownership closeout | Historical predecessors for code-boundary work; no rebase or follow-up carrier branch. |
| #432, #425 | Portal lifecycle and access-boundary predecessors | Inputs to #438 only after traffic truth and protected projection stabilize. |
| #427 | Foundation freeze and Git/docs closeout | Complete dated governance snapshot. |
| #426 | Public company-site capability | Separate from Portal lifecycle; next deployment must repair release-unit and artifact lineage declarations. |
| #424 | Production evidence carrier | Retain as audit evidence; do not treat the docs PR commit as the deployed source commit. |

All 10 PRs are already merged into `master`. None should be closed, rebased,
or reopened as a new merge vehicle.

## Traceability Gaps Found

### 1. Public Site Versus Portal Static Ownership

The July 9 Vercel execution record labels the public company-site deployment as
`portal-static`. The target and validation were `gccwebos.com` public-site
surfaces, not the customer Portal static directory. Before another public-site
production promotion, choose and document one unambiguous release unit. Do not
silently reuse `portal-static` for two products.

### 2. Public-Site Artifact Lineage

The same execution record used a prebuilt artifact generated from commit
`1699a17a` plus dirty working-tree changes. PR #426 later placed the relevant
source changes on `master`, but the record does not prove that the deployed
artifact is reproducible from merge commit `e853076d`. A future promotion must
build from a clean source commit and bind that commit to the artifact.

### 3. Shared Admin/Portal Static Source

PR #432 changed `admin/src/App.tsx`, while its behavior affects the real Portal
route and the local preview route. The PR correctly did not deploy static
files, but a later promotion must state whether the artifact is `admin-static`
or `portal-static` and prove the target output contains only the intended
surface.

### 4. Evidence PRs Are Not Deployment PRs

PR #424 is a source-controlled audit index for earlier Risk A operations. Its
merge commit is not the source commit of either backend release and is not the
runtime-config artifact. Capability maps and Agents must preserve that
distinction.

## Future PR Metadata

The capability map supports the following minimal PR metadata. This section is
a recommendation only; the repository PR template is not changed by this task.

```yaml
phase: phase-2
phase_lane: traffic-accounting
capability: collector-error-provenance
capability_version: v1
producer: edge collector adapters
current_consumers: collector-state projection
future_consumers: protected Admin, alerts, approved Agent workflows
release_unit: control-plane-app
source_state: tested
production_state: not_deployed
boundary: no UI, runtime mutation, deployment, or recovery action
```

Capability labels explain behavior; Git commits identify source; artifacts
identify build output; Deploy Notes identify promotion; runtime validation
identifies observed production state. None of those layers substitutes for the
others.

## Gate Before The Next Traffic Slice

- Keep Issue #437 as the active index.
- Keep open implementation PR count at zero until this map is reviewed.
- Do not start Admin projection, pipeline hardening, Portal lifecycle, or
  recovery automation in parallel.
- Start collector error provenance only from the latest clean `master` after
  this capability map is accepted.

## Evidence Used

- Live GitHub metadata and merged diffs for PRs #441, #436, #435, #434, #433,
  #432, #427, #426, #425, and #424.
- `docs/production-replacement-records/2026-07-09-gccwebos-mobile-cta-vercel-production-deploy-execution.md`
- `docs/production-replacement-records/2026-07-09-account-resource-delivery-lifecycle-backend-deploy-execution.md`
- `docs/production-replacement-records/2026-07-09-japan-traffic-runtime-config-restore-execution.md`
- `docs/production-replacement-records/2026-07-09-traffic-quota-auto-suspend-backend-deploy-execution.md`
- `docs/GIT_DOCS_ARCHIVE_CLOSEOUT_2026_07_09.md`
- Live `master` and remote-head verification at `9d48592c`.

This is a dated map. Re-run GitHub, source, artifact, deployment, and live
runtime inventory before using it for any future production decision.
