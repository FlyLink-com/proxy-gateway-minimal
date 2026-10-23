# Current Release State

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: current_release_state
  superseded_by: null
  last_verified_at: 2026-10-23
  production_authority: false
```

> Status:
> - Type: Dated documented source, validation and deployment snapshot
> - Git source cutoff: `master@eadefd98357a6bb616c5dd54c984ec265695acad`,
>   observed 2026-10-23 UTC; not a permanent current-head claim
> - Latest deployment records read: #764 reset/collector, preserved #767
>   containment and #769 desktop Portal, layered on the earlier BWH composition,
>   plus the 2026-10-12 metering closeout (#773-#778) and the later merged
>   deploy notes for #785/#786: the #786 note, preserved in
>   docs/DATA_PACK_RELEASE_READINESS_2026_10_15.md, records the BWH
>   application `control-plane-pr786-c7b094592662-mixed` layered on the
>   #785 three-module overlay. Those notes are recorded deployment
>   evidence, not a fresh host read
> - Source, build, deployment and runtime identities are distinct; the BWH
>   application is a documented composition, not the current whole `master`
> - This reconciliation read GitHub records only. No provider, host, account,
>   database or live runtime readback was performed
> - Execution authority: None

## Source Reconciliation (2026-10-23)

Risk C documentation reconciliation from native GitHub records read
2026-10-23 UTC. This scoped update supersedes the earlier top-level source
status only; the dated deployment and runtime facts below retain their
original cutoffs and are not refreshed or promoted by it. No provider, host,
account, database or live runtime readback was performed by this task; the
deployment records it carries forward, including the #785/#786 deploy
notes, are repository records, not new readback. Execution authority: none.

- Source cutoff is now `master@eadefd98357a6bb616c5dd54c984ec265695acad`
  (merge of #799, 2026-10-22). 28 PRs merged between the 2026-10-11 source
  cutoff (`483f535`) and this cutoff, including the prior reconciliation
  line itself: #765 (the 2026-10-11 source-and-deployment reconciliation),
  #766 (alignment with live GitHub titles) and #772 (monthly card
  plan switch, default off).
- Third-party subscription distribution landed as source: #762 distribution
  stages and #771 restricted inline YAML import (2026-10-13), the #779-#784
  and #788 Admin third-party node workspace series, and #785/#786 admission
  of evidenced legacy subscribers.
- #753 independent lifetime data packs merged 2026-10-15, still default-off.
  The Admin usage-ledger line landed as #789 with follow-up fixes #790,
  #791, #792 and #794 (2026-10-18 - 2026-10-19). Distribution routing and
  BWH supply control landed as #796 (2026-10-19). #799 added the
  default-off Admin user commerce console and API (2026-10-22).
- Issue #795 is closed in the native tracker as of this read (closed
  2026-10-22). That closure is a tracker state, not production evidence:
  the #796/#798 PR records state the production cutover was not executed
  by those PRs, and this reconciliation does not widen the closure into a
  deployment or runtime claim.
- Open native surface at this read: 18 open issues and six open Draft PRs -
  #798 (BWH shared-bandwidth policy), #797 (protocol traffic rating),
  #793 (Admin ledger row-budget probe), #787 (US residential relay pack,
  default-off), #770 (sessionless public offer catalog) and #755 (rotating
  native session renewal). Each Draft body states its own gate; none is
  approved for Ready, merge or deployment by this reconciliation.
- #768 remains open for real-account browser confirmation of the reset
  display fix, unchanged from the 2026-10-11 reconciliation.

## Scoped Metering Closeout (2026-10-12)

Risk C documentation reconciliation from native #773–#778 PR records; no host
access, source deployment, new accounting or cleanup. This scoped update
supersedes the earlier metering status only; the other dated release facts
below are not refreshed or promoted by it.

- #773 is merged as `e834185cca073455d8ac314cdf908ec8fc4c5e8d`; its frozen
  49-file collector is installed on BWH according to
  [the #776 Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/776).
- #774 recovery tools established a new local-three activation. The accepted
  zero-sample baseline preserved the old journal and accepted database usage;
  two positive natural collections followed timer enablement at
  `2026-10-12T10:28:07Z`. This is recorded operational recovery, not a live
  health check or permission to rerun initialization.
- #775's streaming-backup-hash fix is merged but was not the recovery command
  module used on that run. #777's aggregate checker is merged; the later
  after-read reports 32 runtime / 32 mapped per protocol, no missing/changed/
  missing-material identities, and stale 89 / 76 / 88. Before counts were not
  captured. Identity remains `degraded`, retention `pending`.
- [Recovery record and residual boundaries](FULL_METERING_NEW_ACTIVATION_RECOVERY.md#execution-closeout-and-remaining-evidence)
  retain the post-write failure, forward-only rollback, private backup and
  retention holds. #437, deferred SGP recovery and separate #763 dependency
  promotion are not closed. Do not treat the dated top-level snapshot or
  #773's original `not_deployed` body as the later execution state.

## Source And Deployment Reconciliation (2026-10-11)

Risk: C. Process: update the existing #765 documentation PR from native GitHub
records. Validation: document-authority and diff checks. Production/AWS impact:
none. This dated section supersedes the earlier snapshot's top-level task and
release status, without rewriting historical receipts or refreshing runtime
health. Exact-head source validation for this docs change belongs in #765.

### Later merged source and recorded deployment

| Boundary | Source and dated receipt | Established result and remaining limit |
| --- | --- | --- |
| Legacy refresh containment | [#767 deployment](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/767#issuecomment-6078816763), source `76715107c79ebbd7f853363348e8cc26a5679cdf`, 2026-10-09 | App/route containment and three Nginx refresh guards deployed. The later [metering receipt](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/767#issuecomment-6079130990) records zero-debit continuation followed by positive natural accounting; not a reconstruction of unknown historical intervals. |
| Reset backend, schema and independent collector | [#764 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/764#issuecomment-6079787973), source `fa492bd93c090e721da5ba3996c63a004ea03035`, 2026-10-09T11:11:23Z | Mixed app `control-plane-2dea45fcbac1-reset-fa492bd93c09-guard767`, additive reset journal and `collector-reset-fa492bd93c09` deployed; #752/#760/#761 base and #767 guard retained. No whole-master or dependency upgrade. Two natural observations passed with matching new sample/rollup increments and preserved history. |
| Desktop Portal immediate reset display | [#769 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/769#issuecomment-6106025567), source `483f535ee6d90fe222b866591ade19a7776b1d47`, 2026-10-11T05:54:12Z | Only desktop `/web/` static references updated to `pr769-483f535ee6d9`; ten public files passed exact size/MIME/hash checks. No backend, mobile, Admin or company-site deployment; no new real-account reset or accounting certification. |

The #769 artifact is `globalcircle-portal-web-pr769-483f535ee6d9.zip`, SHA-256
`df04ee0f34e5d8676b3633b687c621cb25f3e87b433e3172412af26be9f13ce9`.
Its receipt retains the prior static release and Nginx backup, verifies recharge
configuration unchanged, and records unchanged backend/protocol process
identity plus successful natural collector status. Those are observations at
that deployment cutoff, not a live read by this documentation task.

#764's [user closeout](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/764#issuecomment-6079900988)
confirmed the functional stage while reporting the immediate-display defect.
#769 fixes that source/UI behavior; [Issue #768](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/768)
remains open for real-account browser confirmation. The original reset scope
does not remotely erase already downloaded configs or revoke independent legacy
tenant-token URLs. Do not widen the user's brief functional confirmation into
a receipt for every acceptance item.

#764's aggregate identity gate retains `stale: 89 / 76 / 88`,
`retention_state: pending`, `state: degraded`; no global identity-healthy claim.
SGP recovery and boot-autostart policy remain separate. #769 did not re-read
the databases, checkpoints or identity maps. #763's backend dependency patches
still have no deployment proof in these mixed-app receipts; the newer desktop
artifact built from master is a different release unit. No global security or
Dependabot-closure conclusion follows from that frontend deployment.

### Open source work at this observation

A native PR read on 2026-10-11 found eight open Drafts: #753, #755, #762,
#765, #766, #770, #771 and #772. This is a dated snapshot, not a second task
queue. #765 is documentation closeout; #766's CI-source acceptance is being
completed separately. Neither is a deployment of the remaining features.

The third-party YAML implementation [#771](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/771)
targets #762's branch, not master. Public catalog #770 and monthly plan switch
#772 also remain unmerged. Data-pack #753 and native-session #755 retain their
own integration, client, migration and production boundaries. Re-read their
heads/reviews/checks before any later integration; historical passing results
or this list are not final-head merge evidence.

[CI status and run log](CI_STATUS_LOG.md) distinguishes the confirmed Actions
budget startup failure, local validation and the operator-approved temporary
PR-only merge exception. No hosted rerun was started by this documentation
work. No production action or new authority is granted here.

## Source And Deployment Reconciliation (2026-10-09)

Historical snapshot; the 2026-10-11 section above supersedes its then-current
PR/deployment status. The original evidence and limits below remain dated.

Risk: C. Process: docs-only reconciliation of existing native PR/Issue records.
Expected PR count: 1. Validation: document-authority checks and diff checks.
Production/AWS impact: none. This section supersedes older top-level "latest"
claims only for the evidence read here; dated historical records remain intact.

### Merged source and validation

[PR #763](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/763)
merged as `521bb535d0d385d533734b020cf96a533f6ed729` at
2026-10-09T07:11:34Z. Its only changes are two lockfiles: proxy-addr 2.0.8,
source-map-js 1.2.2, and brace-expansion 1.1.21 / 5.0.12.
Exact-merge [CI 37897623213](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37897623213),
[Dependency Artifact 37897623191](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37897623191),
[Release Artifact 37897623177](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37897623177)
and [Cloudflare Site 37897623237](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37897623237)
completed successfully: nine checks succeeded and two were skipped.
The skips were `Governance snapshot` and `Deploy public site`.

The PR records 5387 server tests and 1283 Admin tests passing, plus four frontend
build/verify pairs. These are reused exact-source CI results, not tests rerun by
this docs change. Builds include legacy Portal and desktop Portal artifacts;
they do not establish deployment. The eight disclosed baseline Admin lint
errors are outside that CI acceptance. Dependabot alert closure, deployed
dependency versions and current production vulnerability exposure were not
verified. No deployment of #763 is established by this evidence.

### Recorded production composition, not fresh runtime proof

| Boundary | Dated record | What the evidence does and does not establish |
| --- | --- | --- |
| Control-plane business source | [#752 BWH activation](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/752#issuecomment-6067109165), 2026-10-08, source `2dea45fcbac1e330c76678b49124e0fcb1f630ac` | BWH control activated; JP was recorded frozen. Later attachments below do not turn this into a whole-master deployment. |
| Current Portal/Admin/Sub public ingress and DNS | [#752 ingress](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/752#issuecomment-6073584759) and [DNS cutover](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/752#issuecomment-6074115920), 2026-10-09 | BWH entry and DNS checks passed; existing Portal/Admin static artifacts were retained. Company apex/www stayed on the existing Vercel site. This did not publish new frontend source or complete business acceptance. |
| Standalone local-three collector | [#759 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/759#issuecomment-6073183837), 2026-10-09, source `548378d35134dea74a42ae5892079c0c1c4cde49` | Independent collector install and idle natural-cycle recovery validated; no positive-user-traffic accounting proof. SGP remained paused/unknown; retained identity mapping remained degraded. |
| Subscription rendering | [#761 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/761#issuecomment-6075402400), 2026-10-09T06:06:18Z–06:08:55Z | Four-file overlay `40c7cc2390923a8c5904f349962ea1a85cdab6b6` on #752 business source and #760 renderer `47e4a3e9b321fe99595c77e1adaff9831d5faaa1`; terminal `applied_validated`. Flags and expiry notice deployed, but authenticated refresh/device acceptance and runtime traffic cutoff are not proven. |

The last row records derived release
`control-plane-2dea45fcbac1-render-40c7cc239092` and archive
`subscription-rendering-40c7cc239092.tar`, SHA-256
`1201b87da991fd7f352262d8b0aaf8e1777c106cd897a41daa8edfa46a8632d8`.
The original release remains a protected dependency for environment,
configuration and installed packages, not a cleanup candidate. The prior
[Japan #752 promotion](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/752#issuecomment-5856310002)
on 2026-09-27 and the A3 history below remain valid dated events.

Current runtime health/identity was not re-read. The DNS receipt also records a
JP SSH host-key mismatch that stopped that verification; no bypass or later JP
readback is inferred here. Real-account login/subscription acceptance, positive
usage, payment reconciliation, boot enablement, SGP recovery and full migration
closeout are not established by this inventory. Earlier static artifact and
provider-setting snapshots must not be used as current production identities.

### Native task state and client dependencies

Fresh PR reads on 2026-10-09, 07:25–07:27 UTC, found these four open Drafts.
This is a dated inventory, not a new execution queue or permission to resume
feature work.

| PR | Observed head | Boundary still open |
| --- | --- | --- |
| [#753 independent data packs](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/753) | `1efddbe4ef3e6b8b19c8615608d4bbd129bcde47` | Unmerged implementation; physical acceptance and production gates remain. Paired [mobile #13](https://github.com/gccltd/gccwebos-mobile/pull/13) is also open Draft. |
| [#755 native session renewal](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/755) | `0cc44b00bec5652ed77e17446f26b93e8ca533a5` | Unmerged, default-off backend/auth/schema contract. Paired [Android #26](https://github.com/gccwebos-com/gccwebos-android/pull/26) is also open Draft; no production renewal activation. |
| [#762 third-party YAML distribution](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/762) | `cf18b63f90f506614f769f732ae696c74ad83d41` | Stage document only; first-stage implementation and acceptance are not complete. |
| [#764 subscription download-link reset](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/764) | `58da6e4e733d279fe92718d55cec81e2bddd4635` | Unmerged, default-off implementation; review, acceptance and separately approved schema/production gates remain. |

[PR #730](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/730)
is now merged, [Issue #695](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/695)
is closed, and [PR #744](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/744)
is closed **unmerged**, with maintenance tracked by open
[Issue #745](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/745).
Closure alone is not source completion or runtime proof. Native Issue/PR records
own current status; Project #1 and `project-state/*.json` remain navigation and
dated compatibility inputs. No issue, feature gate or historical task is closed
by this docs PR.

## Historical Evidence Boundaries

Dated evidence sections below retain their 2026-07 through 2026-09 cutoffs.
Their "current", "latest", counts, open-task and non-activation statements
refer to those observations, not to 2026-10-09. Stable state labels and source
authorization contracts remain active. Use the reconciliation above and fresh
native records for later decisions; do not rewrite old receipts.

## A3 Production Closeout (2026-08-26)

At the 2026-08-26 deployment cutoff,
`master@b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` resolved to merged PR #667
and was the exact source of the latest recorded `control-plane-app`
deployment. Release Artifact
run `32854893859` produced `proxy-gateway-b5ca23db58c5` (Actions artifact ID
`9565756416`), and Dependency Artifact run `32854893837` produced
`control-plane-dependency-b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`
(Actions artifact ID `9565754679`). The source ZIP is 7,563,583 bytes with
SHA-256 `20bf7d56c63e5038497d1c12c53507267f4468516e2e23fe4732710658acb76d`;
the dependency archive is 26,664,960 bytes with SHA-256
`c87e70c8fbae033eb357b103ac2da554b99f6af4a50d02294fe1e615c3c7de5b`.
Production Deploy Dry Run `32856999391` also succeeded for that exact source.
The Actions artifacts were observed
unexpired through 2026-09-08; they remain short-lived build evidence even
though the exact downloaded packets were verified during this deployment. A
later 2026-09-14 GitHub API readback recorded those same artifacts as
`expired: true` with `expires_at` `2026-09-08T13:42Z`. That later observation
does not rewrite the original unexpired window.

The A3 candidate-preparation stage verified the exact staged source, protected
overlay, bounded dependency materialization, restricted service-native smoke,
terminal cleanup and materializer receipt before promotion. Promotion run
`a3b-b5ca23db-promote-20260826-09` then created and verified the shared SQLite
snapshot, atomically exchanged the release pointer, started the candidate once,
and completed the health gate. Terminal readback recorded
`promoted_verified`: the pointer and process working directory matched
`control-plane-b5ca23db-a3-sync-20260825`, the service was active/running with
result `success` and restart count zero, and no rollback start was used.

The durable execution evidence is the
[PR #667 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/667#issuecomment-5426440067)
and the
[Issue #636 closeout receipt](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636#issuecomment-5426441456).
A delayed public-only health window returned three HTTP 200 responses without
redirects. No database restore, schema mutation, feature activation,
runtime-identity change or old-release deletion occurred. The terminal receipt
recorded the previous immutable release as retained for code-pointer rollback.

This closes the A3 dependency-materialization and production-promotion outcome
for `control-plane-app`. It does not activate wallet-first, deferred-runtime or
Account Resource Authority functionality, apply their schema gates, or deploy
the Portal, Admin, company-site or runtime-config release units.

## Dated Expiry And Source-Alignment Inventory (2026-09-14)

Read-only C-tier inventory on 2026-09-14, America/Los_Angeles. It records
expired retrievability and mismatched “current” identities. It does not
authorize promotion, rollback, schema apply, feature activation, or runtime
mutation. Native Issue and PR records remain authoritative. Issue #695 remains
the separate Risk A current-runtime inventory. Draft PR #730 remains a
separate Issue #522 documentation PR. The dated Operations capability matrix in
`docs/OPERATIONS_PLANE_SOURCE_REALITY.md` remains a 2026-08-09 historical
inventory and is not rewritten here.

### Observed identities

| Layer | Identity observed 2026-09-14 | Boundary |
| --- | --- | --- |
| Recorded `control-plane-app` deployment | `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` (2026-08-26), release `control-plane-b5ca23db-a3-sync-20260825` | Promotion-09 receipt only; current runtime unread |
| Typical Issue Current Alignment cutoff | `836f23f667879b79e2ab2e825fb98e487cfa2165` (2026-08-30) | 120 commits behind current `master`; not current source capability |
| Prior canonical Git cutoff | `c8cb21d00479db40a288eed4ad7d1a75f819e1b0` (2026-09-12, PR #726) | Superseded as the latest Git cutoff by this inventory |
| Current `master` | `3565c54865676ba127b115f7f914a0359e545bf0` (PR #729) | Reviewed source; 164 commits ahead of the recorded deployment |
| Draft #730 head | `5b3d2c42083f020669bc1c01d42977a73818e5b8` | Unmerged #522 source-boundary docs; not `master` |

### Expired retrievability

GitHub API readback on 2026-09-14 for Release Artifact run `32854893859` and
Dependency Artifact run `32854893837` recorded:

| Artifact | `expires_at` | `expired` |
| --- | --- | --- |
| `proxy-gateway-b5ca23db58c5` | 2026-09-08T13:42:13Z | true |
| `control-plane-dependency-b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` | 2026-09-08T13:42:10Z | true |
| `portal-static-b5ca23db58c5` | 2026-09-08T13:42:29Z | true |
| `admin-static-b5ca23db58c5` | 2026-09-08T13:42:28Z | true |

Those packets cannot be re-downloaded from GitHub Actions for a later
promotion or replay. Expiry does not invalidate the PR #667 Deploy Note.

Current-`master` Release Artifact run `34736294252` for
`3565c54865676ba127b115f7f914a0359e545bf0` still listed unexpired artifacts
`proxy-gateway-3565c5486567`, `portal-static-3565c5486567`, and
`admin-static-3565c5486567` with observed `expires_at` 2026-09-27T03:46Z.
Those are build evidence for undeployed source. They are not the recorded
production packet and do not authorize a control-plane promotion.

### Alignment mismatches

1. Git `master` is 164 commits ahead of the recorded control-plane deployment.
   Current runtime identity remains unread (#695).
2. `docs/PROJECT_CONTEXT.md` at the 2026-09-12 cutoff still listed Admin
   frontend `/api/admin-auth` login integration as not established. PR #729
   added `admin-auth-client` and `admin-auth-boundary` source on current
   `master`. That source does not prove production enablement or complete
   RBAC (#558).
3. `docs/COINS_FIRST_COMMERCIAL_DECISION.md` on current `master` still uses
   the 2026-08-30 catalog/referral snapshot. Current source has a local 3-plan
   plus 2 data-pack validation catalog and first-recharge Portal metrics.
   Draft PR #730 is the separate docs repair and is not merged.
4. The 2026-09-12 GitHub inventory recorded zero open PRs and
   `master@c8cb21d...`. This inventory observes Draft PR #730 and
   `master@3565c548...`.
5. Current-head GitHub artifacts and the expired deployed-source artifacts
   are different packets. They must not be treated as one release identity.
6. Portal, Admin, and company-site production identities remain
   `deployed_unreconciled` or `unknown` and are not bound to current `master`
   Portal/Admin source.

### Automatic deployment wiring is only partial

The GitHub Actions environment is connected for source validation and
short-lived artifact publication. It is not an automatic production
promoter. 2026-09-14 workflow and variable readback:

| Path | What is connected | What is not automatic |
| --- | --- | --- |
| `ci.yml` | PR/`master` push validation | No deploy, no host access |
| `release-artifact.yml` | Non-docs `master` pushes (`ci-change-classifier` `run_full != 0`) package control-plane, Portal, and Admin artifacts | Docs-only `master` pushes classify `run_full=0` and skip those package jobs. Short-lived artifacts are build evidence, not a promotion |
| `control-plane-dependency-artifact.yml` | `master` push and pull_request still run the Linux dependency-artifact job | Short-lived build evidence, not a promotion |
| `deploy-cloudflare-site.yml` | `master` path pushes run build, verify, and Wrangler dry-run | The deploy job is skipped unless `CLOUDFLARE_SITE_AUTO_DEPLOY` is exactly `true`. Repository variable readback was not `true`. Run `34736294179` for PR #729 completed validate and skipped “Deploy public site” |
| `production-deploy-dry-run.yml` | Manual `workflow_dispatch` with confirmation text | Dry-run only: no SSH, symlink, systemd, Nginx, DNS, or SQLite mutation |
| `control-plane-artifact-ingress.yml` / v2 | Manual `workflow_dispatch` plus the `control-plane-artifact-ingress` environment | Not triggered by `master` push; packet delivery is not control-plane promotion |
| `japan-runtime-config-additive-repair.yml` | Manual `workflow_dispatch`. The merged-PR `approval_pr` contract is reusable source admission only | Not automatic on `master` push. A dispatch that passes preflight can run `execute` on `vultr-japan-production`, stream the frozen artifact over SSH, and succeed only when `productionResult === "applied_validated"`. That execution can apply the map and remains a separate Risk A gate |
| `control-plane-app` live promotion | Last recorded event is the 2026-08-26 operator-gated A3 promotion | No GitHub workflow auto-promotes Japan control plane on merge |
| Vercel company-site / Portal / Admin static | Historical staged-candidate / `deployed_unreconciled` or `unknown` evidence | No GitHub workflow in this repository auto-promotes those release units |

Automatic production promotion of `control-plane-app`, Portal, Admin, or
company-site is therefore not established. A green `master` workflow is not a
deploy.

Until these identities are re-read under their own gates, a later
`control-plane-app` promotion is not authorized from the expired A3 packet or
from current `master`.

## Dated GitHub Inventory (2026-09-14)

Read-only GitHub inventory on 2026-09-14. This is a dated mutable snapshot, not
a live queue and not a production runtime claim. Native Issue and PR records
remain authoritative for item state. `project-state/*.json` still must not copy
these counts.

- exact `master`: `3565c54865676ba127b115f7f914a0359e545bf0` (merged PR #729)
- open PRs: 1 Draft (#730)
- open Issues (16): #437, #438, #439, #522, #523, #524, #527, #551, #557,
  #558, #559, #560, #597, #598, #673, and #695
- remote heads: 72
- latest exact-`master` Release Artifact run: `34736294252` succeeded
- recorded `control-plane-app` deployment source remains
  `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` (2026-08-26); this inventory
  did not read production runtime
- Dependabot, secret-scanning, and Action-pin counts were not re-queried;
  retain the 2026-09-12 observations until a later inventory

## Prior Dated GitHub Inventory (2026-09-12)

Read-only GitHub inventory on 2026-09-12. This snapshot is retained as
historical mutable evidence. Native Issue and PR records
remain authoritative for item state. `project-state/*.json` still must not copy
these counts.

- exact `master`: `c8cb21d00479db40a288eed4ad7d1a75f819e1b0` (merged PR #726)
- open PRs: none
- open Issues (16): #437, #438, #439, #522, #523, #524, #527, #551, #557,
  #558, #559, #560, #597, #598, #673, and #695
- remote heads: 69
- Dependabot open alerts: 0
- secret scanning: disabled
- code-scanning alert inventory: unavailable; Code Security is not enabled
- latest exact-`master` Release Artifact run: `34677102430` succeeded
- recorded `control-plane-app` deployment source remains
  `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` (2026-08-26); this inventory
  did not read production runtime

Closed since the 2026-08-09 fifteen-issue snapshot: #521, #525, and #561.
Draft PRs #592 and #594 remain closed unmerged; #593 remains merged
docs-only. Those earlier item counts are historical context only.

## Dated Source And A3 Reconciliation (2026-08-23)

The reviewed source observed at the 2026-08-23 reconciliation cutoff was
`master@42d17885646d52387f9327f19e2a2e0d70b2b84e`, which includes merged PR
#662. Exact-master CI run `32645695594`, CodeQL run `32645695630`, Release
Artifact run `32645695598`, and Control Plane Dependency Artifact run
`32645695541` all succeeded. The same read-only GitHub inventory observed zero
open PRs, eighteen open Issues, and 117 remote branches.

Release Artifact run `32645695598` produced three temporary build artifacts:

- `proxy-gateway-42d17885646d` (Actions artifact ID `9494798503`);
- `portal-static-42d17885646d` (Actions artifact ID `9494802700`);
- `admin-static-42d17885646d` (Actions artifact ID `9494802010`).

Dependency Artifact run `32645695541` produced
`control-plane-dependency-42d17885646d52387f9327f19e2a2e0d70b2b84e`
with Actions artifact ID `9494801281`, size `6460706` bytes, and observed
expiry `2026-09-06T14:32:03Z`. These artifacts are temporary build evidence,
not durable release retention, deployment, rollback identity, or current
runtime proof.

Issue #636 A3 source work is merged through PR #662. PR #654's exact head
passed a disposable non-production XFS physical run that verified project-tree
setup, project accounting/enforcement, fixed byte and inode limits, rejected
byte and inode writes with Linux XFS `ENOSPC`, diagnostics integrity, and
complete cleanup/readback.

PR #656's exact head separately passed the restricted service-native smoke on
the non-production physical host. The fixed non-root principal, native module
and snapshot-import workload, cgroup v2 boundary, terminal/unit readback,
diagnostics integrity, and cleanup were verified. This closes both A3-1
physical evidence segments. Merged PR #658 added the production XFS runtime
source path, but only when the complete explicit tuple
`--enable-a3-materializer --a3-run-label <label> --a3-project-id <id>` is
supplied. Default and partial invocations remain fail-closed with
`worker_storage_limit_unavailable`.

Merged PR #662 adds a separate bounded artifact-admission path for the existing
production ext4 topology. It is also default-off and requires the complete
explicit tuple `--enable-bounded-artifact-admission --bounded-run-label
<label>`. The XFS route remains available. The bounded route binds the exact
artifact budget and filesystem topology, retains the service-native smoke and
fail-closed guards, and emits schema-4 receipts.

Production dry-run `32628957935` then built and validated the then-current
`master@b93577c99c1202d1f799e2da4e573c8ad7fcf13c` packet without host access
or mutation. The approved A3-2 read-only inventory
observed the live release recorded by PR #622, a healthy active/running service,
matching current/service/process working-directory identity, a clean candidate
namespace, cgroup v2, 140537528320 available bytes, and a read-only SQLite
`quick_check` result of `ok`. The fixed deployment root is on `ext4`, however,
with no project-quota mount option, accounting, enforcement, report, or project
ID. The then-current XFS-only production quota readback therefore could not
pass. That `master@b93577c...` A3-2 attempt remains a historical `NO-GO`; no
artifact upload, materialization, pointer switch, service change, quota change,
schema/feature activation, or promotion occurred. It does not evaluate the new
bounded route. A fresh Risk A read-only inventory and dry-run bound to exact
`master@42d17885646d52387f9327f19e2a2e0d70b2b84e` and artifact ID
`9494801281` were pending at that cutoff. The 2026-08-26 closeout above
supersedes that pending status with exact-source production evidence for
`master@b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`.

## Dated Source-Capability Reconciliation (2026-08-09)

The detailed reviewed source cutoff is
`master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`. It remains the dated
capability inventory below; the later control-plane deployment record does not
turn this inventory into evidence of feature activation.

Fresh aggregate production readback on 2026-08-14 distinguishes the unchanged
legacy surfaces from the new activation lane: legacy Portal routes, Coins
Wallet, Coins Commerce (audience `all_active`), and XSD recharge were already
enabled. The c06 deployment did not enable or revalidate those legacy surfaces.
The still-unenabled scope is limited to wallet-first, the deferred runtime,
Account Resource Authority, and the four wallet-first schema gates.

At this cutoff, source, tests, migrations, and default-off composition establish
the following implementation language:

- Admin authentication/session foundations, a backend read-capability registry,
  and an Operations read envelope exist. Enforcement is partial and default-off;
  the Admin frontend still has no `/api/admin-auth` login consumer.
- Coin Wallet is a balance projection and Coin Ledger is the immutable financial
  fact stream. Additive Wallet reference indexes exist as source/migration
  evidence; this dated inventory does not establish application of the four
  wallet-first schemas.
- Coins Commerce follows `Offer -> Checkout Quote -> Commerce Order ->
  Fulfillment Command`. Commerce Orders purchase products with Coins and are not
  Recharge/Payment Orders.
- Account Resource Authority can bind an exact request, entitlement, issued
  link/version, and immutable Quote provenance. Source availability does not
  establish production assignment or activation.
- Durable provider-neutral Recharge/Payment storage and coordination plus Portal
  routes exist in source. PayPal sandbox and the XSD/ChaoJiPay source runtimes
  remain source evidence here; this dated section does not state the current
  legacy XSD recharge runtime or enable a new wallet-first payment path.
- Traffic collection exposes protected usage samples and rollups. The Admin
  `Usage & Channels` surface does not yet consume that projection, and traffic
  accounting evidence is not the Coin Ledger.
- Forwarded-client attribution now treats the direct socket peer as authoritative
  unless that peer is explicitly trusted; malformed forwarded chains fail
  closed. This is source/test evidence, not proof of a deployed proxy topology.

The detailed capability/gap matrix is
`docs/OPERATIONS_PLANE_SOURCE_REALITY.md`. The GitHub counts observed on
2026-08-09—three open Draft PRs, no open non-Draft PR, and fifteen open
Issues—are retained only as historical context. At the 2026-08-22 inventory,
PR #592 and #594 are closed unmerged, PR #593 is merged docs-only, Issue #561
is closed, and there are no open PRs. The 2026-09-14 inventory above replaces
those item counts as the latest dated GitHub snapshot. The 2026-09-12
inventory is retained as a prior snapshot. Current sequencing must
still be resolved from native live Issues and PRs, using Project #1 only as
navigation; `project-state/*.json` does not own the live queue.

Source availability, clean validation, migrations, feature flags, and build
artifacts do not establish activation of the wallet-first/deferred/Authority
lane, application of its schemas, or current runtime identity. A Risk A action
still requires fresh read-only inventory and an exact approval gate.

## State Labels

- `active_documented`: the latest tracked execution record validated the unit,
  and no later tracked replacement was found. This is not current live proof.
- `deployed_unreconciled`: a deployment record exists, but exact current
  pointer, artifact, release-unit, or runtime lineage has not been freshly
  reconciled.
- `unknown`: current production identity cannot be proven from retained
  repository evidence.
- `disabled`: the unit is intentionally present without live activation.
- `not_deployed`: reviewed source is on `master` but no matching production
  promotion is recorded.

## Build Artifact State

Artifact Manifest v1 has build-time coverage for three release units:

| Release unit | Coverage | Boundary |
| --- | --- | --- |
| `control-plane-app` | Tracked | The source package emits a ZIP, checksum, and `artifact.json`. |
| `portal-static` | Tracked | The Portal job builds and verifies `admin/dist-portal`, then emits a ZIP, checksum, and `artifact.json`. |
| `admin-static` | Tracked | The Admin job builds and verifies `admin/dist`, then emits a ZIP, checksum, and `artifact.json`. |

The 2026-08-26 Deploy Note binds the deployment recorded at that cutoff to
exact source `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`, source artifact ID
`9565756416`,
dependency artifact ID `9565754679`, Production Deploy Dry Run `32856999391`
and release `control-plane-b5ca23db-a3-sync-20260825`. Earlier 2026-08-16 and
2026-08-14 control-plane deployments remain historical evidence. None of these
events records a Portal or Admin static promotion.

Runtime Config Identity v1 remains an offline deterministic observation
contract for `japan-runtime-config` and `sgp-runtime-config`. A generated
identity is not a deploy event, and this Risk C reconciliation did not observe
either live host.

The exact-source build proof used by the recorded 2026-08-26 deployment is
Release Artifact run `32854893859` plus Dependency Artifact run `32854893837`
for `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`.

## Historical Recorded Production Deployments (Through 2026-08-26)

### Deploy Note: A3 Production Sync Promotion (2026-08-26)

The authoritative execution record is the
[PR #667 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/667#issuecomment-5426440067).

**Deployment Metadata:**

- **deployed_at**: 2026-08-26T13:53:47.576Z
- **release_unit**: control-plane-app
- **source_commit**: b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c
- **artifact_or_release**: `proxy-gateway-b5ca23db58c5` / dependency artifact
  `control-plane-dependency-b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` /
  `control-plane-b5ca23db-a3-sync-20260825`
- **target**: vultr-japan-control
- **backup**: verified root-custody SQLite snapshot created before the pointer
  exchange; no restore performed

**Validation Results recorded at execution time:**

- Candidate preparation completed protected-overlay verification, bounded
  materialization and restricted service-native smoke.
- The pointer exchanged atomically; terminal pointer, service and process CWD
  identity matched the candidate.
- The candidate started exactly once. Final service state was active/running,
  result `success`, restart count zero; rollback start count remained zero.
- SQLite snapshot/custody and terminal readback passed. SQLite schema version
  remained 101 with aggregate schema entry count 225.
- No database restore, schema mutation, feature activation or old-release
  deletion occurred.
- A later public-only availability window returned three HTTP 200 responses
  without redirects; response bodies were not retained.

**Risk Classification:** A-tier
**Rollback Boundary:** the terminal receipt recorded the prior immutable
release as retained; code-pointer rollback and database restore remain
separate operator decisions, and neither was performed.

### Prior Deploy Note: Japan Control Plane Upgrade (2026-08-16)

The authoritative execution receipt is the existing
[PR #622 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/622#issuecomment-5305417656).

**Deployment Metadata:**

- **deployed_at**: 2026-08-16T02:46:11.800Z
- **release_unit**: control-plane-app
- **source_commit**: 57d7ab751b9c3b9111bc7d7e799c28d165fdabdb
- **artifact_or_release**:
  `control-plane-57d7ab751b9c-a5b2-20260816T002126Z-1786839686627`
- **target**: vultr-japan-control
- **backup**: fresh shared SQLite snapshot with detached integrity verification;
  no restore recorded

**Validation Results recorded at execution time:**

- Artifact/config assembly and the fresh SQLite snapshot were verified.
- The current pointer switched atomically; service PID/CWD binding and loopback
  health passed.
- A5E transition evidence validated four records; database quick/FK checks
  passed.
- Five newly introduced feature flags remained off.

The 2026-08-23 A3-2 read-only inventory independently observed this exact
release label as current and reconfirmed active/running service and CWD binding
without changing production state.

**Risk Classification:** A-tier
**Rollback Boundary:** pointer rollback and database restore remain separate
operator decisions; no database restore was performed.

### Prior Deploy Note: Japan Control Plane Upgrade (2026-08-14)

The authoritative execution receipt is the existing
[PR #616 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/616#issuecomment-5295613931).

**Deployment Metadata:**

- **deployed_at**: 2026-08-14T16:19:18Z
- **release_unit**: control-plane-app
- **source_commit**: c06f749f245247eea7e94c68f4249a0017e8e884
- **artifact_or_release**: `proxy-gateway-c06f749f2452` /
  `control-plane-c06f749f-20260814`
- **target**: vultr-japan-control
- **backup**: shared control-plane snapshot created and verified before the
  pointer switch; no restore performed

**Validation Results recorded at execution time:**

- Service active; the release pointer and service process working directory
  matched the new immutable release.
- Local and public health checks returned 200.
- The temporary runtime start guard was removed only after successful health
  validation.
- No Portal/static deployment, wallet-first schema enablement, wallet-first or
  deferred-runtime activation, Account Resource Authority activation, or
  runtime-identity change was performed.
- The existing legacy Portal routes, Coins Wallet, Coins Commerce (audience
  `all_active`), and XSD recharge retained their prior enabled state; they were
  not enabled or revalidated by this deployment.

**Risk Classification:** A-tier
**Rollback Boundary:** pointer rollback and database restore remain separate
operator decisions; no database restore was performed.

### Prior Deploy Note: Japan Control Plane Upgrade (2026-07-20)

This prior deployment event is retained as dated historical evidence.

**Deployment Metadata:**

- **deployed_at**: 2026-07-20 06:21:00 UTC
- **release_unit**: control-plane-app
- **source_commit**: 9982d378f93dd506c24c137197293f6942dc45ee
- **artifact_or_release**: releases/master-upgrade-20260720-9982d378
- **target**: vultr-japan-control:/opt/proxy-gateway-minimal-candidate/current
- **backup**: /opt/proxy-gateway-minimal-candidate/backups/upgrade-20260720-060639/
- **previous_release**: releases/phase2-control-plane-artifact-alignment-20260710-001

**Validation Results recorded at execution time:**

- Service Status: active (running), PID 1949527
- HTTP Console: 200 OK, "Proxy Gateway Console" title verified
- Service Ports: 3456 (Console), 18180 (HTTP Proxy) listening
- New Modules: `lead-retention-operations.mjs`, `gate-governance.mjs` present
- Database Schema: `platform_leads` table exists (0 records)
- Database Location:
  `/opt/proxy-gateway-minimal-candidate/shared/state/subscription-control.sqlite`
  (71M)
- Service Stability: no crash loops, 2+ minutes uptime post-restart

**Upgrade Scope recorded at execution time:**

- Japan TUIC repair CI/CD workflow
- Platform lead retention infrastructure
- Portal auth enhancements
- Governance framework

**Execution Notes:**

- Initial deployment encountered missing `config/` files due to incomplete
  transfer.
- Rollback was exercised: the symlink reverted to the old release and the
  service recovered.
- A second deployment succeeded after manual transfer of `config/*.json`.
- Schema initialization ran through `initializeSchema()` on service startup.
- The execution record classified runtime identity gates as unchanged.

**Risk Classification:** A-tier
**Rollback Plan:** Recorded as verified during the execution

## Historical Documented Production Snapshot (2026-08-26)

The 2026-08-26 Risk A promotion binds `control-plane-app` to the identity below.
Other release units retain their separate documented state and were not
reclassified by this deployment.

| Release unit | Documented identity | State | Evidence and boundary |
| --- | --- | --- | --- |
| `control-plane-app` | `control-plane-b5ca23db-a3-sync-20260825`; source `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`. | `active_documented` | PR #667 records exact source/dependency packets, bounded materialization, service-native smoke, verified snapshot, atomic pointer exchange, one candidate start, pointer/PID/CWD binding and health. Promotion-09 ended `promoted_verified`; no rollback, schema change or feature activation occurred. |
| `company-site-static` | Dated July evidence records Vercel deployment `5389897330`, source `7e9a8667657e5323e09ff7c262da85d26729e69b`, plus Cloudflare Worker deployment `540da82f-b04d-4d67-9c8d-c5542d55e8a5`. | `deployed_unreconciled` | Portable artifact lineage and current serving identity were not freshly reconciled. |
| `portal-static` | Last tracked restore artifact `globalcircle-portal-ca9f5702-20260708.tar`; SHA-256 `DD6CB14E2F519078917760E9ADE4033732D68960C17ABDAC67A471797DF9EEFC`. | `deployed_unreconciled` | No current immutable Portal artifact or live pointer was freshly reconciled. |
| `admin-static` | Current immutable production artifact identity not recorded. | `unknown` | Build evidence exists, but no production Admin promotion is proven here. |
| `japan-runtime-config` | Dated records `2026-07-09-japan-traffic-runtime-config-restore` and `japan-traffic-evidence-runtime-activation-20260710-001`. | `active_documented` | No later tracked replacement was found; no fresh live Runtime Config Identity observation was performed. |
| `sgp-runtime-config` | Dated record `2026-07-08-sgp-subscription-render-receipt-reconcile`. | `active_documented` | No later tracked replacement was found; no fresh live Runtime Config Identity observation was performed. |
| `subscription-rendering` | Receipt-gated rendering was recorded against the dated control-plane and SGP state. | `deployed_unreconciled` | No separately reconciled current immutable rendering artifact is recorded. |
| `attribution-appsflyer` | Disabled/dry-run baseline from `appsflyer-runtime-disabled-20260708-001`. | `disabled` | No live provider credentials or activation are recorded. |

## Dated Promotion Boundary

July Issue #457 evidence established that Vercel source merges could create
production-target candidates without moving the public custom aliases. July
Issue #462 evidence changed a Cloudflare native trigger from direct deploy to
version upload and then observed a saved version without active promotion.
Those records prove the boundary for those executions; they are not a fresh
2026-08-09 readback of provider settings, domains, deployments, or runtime
state. Any provider promotion or rollback remains a separate exact Risk A gate.

## Manual Japan Additive-Repair Source Authorization

The manual Japan runtime-config additive-repair workflow retains one active
source-only authorization contract. `approval_pr` must resolve a merged PR at
the exact workflow commit, its final head must have a successful `Validate`
check, and the latest-state approval must come from a reviewer other than the
actual triggering actor. While those conditions remain true, this merged-PR
source authorization is reusable; `approval_pr` is not a one-time or consumed
credential.

This contract authorizes source admission only. It does not bootstrap host
access, authorize workflow dispatch, read connection material, apply a map,
deploy a release, mutate runtime state, or prove production success. Each such
action remains behind its separate exact Risk A gate and current evidence.

## Historical Git Source And Deployment-Source Drift (2026-09-14)

The Git source cutoff observed on 2026-09-14 is
`master@3565c54865676ba127b115f7f914a0359e545bf0`. The latest recorded
control-plane deployment event used source
`b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c` on 2026-08-26. These identities
are intentionally distinct: current `master` is 164 commits ahead of that
deployment source, and the deployed-source GitHub Actions packets are expired.
This docs-only reconciliation performed no fresh
runtime readback and cannot state current runtime alignment. The A3 bounded
dependency materialization and promotion path is recorded as deployed and
verified for that `control-plane-app` release. The earlier XFS-only A3-2
`NO-GO` remains historical evidence explaining why the bounded ext4 route was
added; it is not the terminal A3 state recorded by the 2026-08-26 closeout.

Source/deployment alignment does not prove activation of wallet-first,
deferred runtime, Authority, or the four wallet-first schema gates. Promotion-09
explicitly recorded no schema mutation or feature activation.

The 2026-08-16 Deploy Note is scoped to `control-plane-app` and records five new
feature flags remaining off. It does not establish Portal/static deployment,
wallet-first schema enablement, wallet-first/deferred runtime activation,
Authority activation, or runtime-identity change. Portal production identity
remains `deployed_unreconciled`: before any Portal integration or activation,
its exact deployment/artifact, source commit, HTML entry, bootstrap, stylesheet,
and output directory must be bound and then validated in a separate approved
gate.

The next frontend remediation PR may address that boundary and the user-facing
flow, but its merge or preview validation does not authorize application of the
four wallet-first schemas or activation of the wallet-first/deferred/Authority
lane. Those remain separate Risk A actions.

## Evidence

- `RELEASE_MANIFEST.md`
- `docs/OPERATIONS_PLANE_SOURCE_REALITY.md`
- Detailed source-capability cutoff
  `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`
- Git source reconciliation cutoff observed 2026-09-14
  `master@3565c54865676ba127b115f7f914a0359e545bf0`
- Exact-`master` Release Artifact run `34736294252` (source evidence only)
- Prior Git source reconciliation cutoff observed 2026-09-12
  `master@c8cb21d00479db40a288eed4ad7d1a75f819e1b0`
- Prior exact-`master` Release Artifact run `34677102430` (source evidence only)
- Prior Git source reconciliation cutoff observed 2026-08-28
  `master@2824d01f9523ff39805083744e7b0c4f30bfef50`
- GitHub CI run `32854893874`
- GitHub CodeQL run `32854893258`
- GitHub Release Artifact run `32854893859`
- GitHub Dependency Artifact run `32854893837`
- GitHub Production Deploy Dry Run `32856999391`
- [PR #654 A3 quota physical proof](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/654)
- [PR #656 A3 service-native smoke proof](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/656)
- [PR #658 A3 source integration](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/658)
- [PR #662 bounded artifact admission](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/662)
- [Issue #636 A3 promotion boundary](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636)
- [Issue #636 A3-2 inventory receipt](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636#issuecomment-5385197978)
- [PR #667 final Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/667#issuecomment-5426440067)
- [Issue #636 production closeout receipt](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636#issuecomment-5426441456)
- Control-plane deployment-event source recorded 2026-08-26
  `b5ca23db58c55f2d73ec59ffa9525f85b92a8a9c`
- Release identity recorded by that deployment event
  `control-plane-b5ca23db-a3-sync-20260825`
- Prior release evidence:
  [PR #622 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/622#issuecomment-5305417656)
  and `control-plane-57d7ab751b9c-a5b2-20260816T002126Z-1786839686627`
- The dated deployment and production-replacement records indexed under
  `docs/production-replacement-records/`
