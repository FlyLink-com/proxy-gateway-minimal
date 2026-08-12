# Control-Plane Supply-Chain Topology Addendum: Evidence Context

> Status:
> - Type: Derived design-review evidence inventory with Route A blocked, Route B design Gate published, and FX2-E Gate published but execution-request packet not yet requestable
> - Risk: A
> - Process: Read-only evidence -> G0 topology selection -> P2-D complete -> P2-S0 Gate publication -> Route A Gate publication and blocked preflight -> Route B design Gate publication -> FX2-E Gate publication -> docs-only execution-request amendment -> separately authorized protected Environment, source, generation, retirement, custody, and P2-S decisions -> later explicit profile and implementation decisions
> - Expected PR count: 1 docs-only PR for this amendment; any Route B Settings mutation, producer source, generation execution, workflow retirement, custody handoff, and P2-S action require separate approval
> - Validation: Evidence hashes, document authority, project-state check, JSON parse, Mermaid/link review, targeted document-authority regression, and diff check
> - Production/AWS impact: None
> - Production authority: False
> - Execution authority: None
> - Frozen P2-D design-evidence revision: `9ebc08492af170a470182ba827da052fa41b81b2`
> - Frozen P2-D design-evidence collection SHA-256: `fc34014aff12217b2e0386346b2ed98bb767b5688be79917dd80d0a841aadeaa`
> - P2-D completion revision: `d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f`
> - P2-S0 Gate publication revision: `046952402c5ded1412e58fe860c6eb9ad426ced5`
> - P2-S0-FX1 Gate publication revision: `6d6a0a197e89706d4de591f0d8cbecaef18df2c1`
> - P2-S0-FX2 Gate publication revision: `a413f636267a3b0fcfc65f7b911fa50f6cd95ea4`
> - P2-S0-FX2-E Gate initial publication revision: `015ad0b74851b54ebdfbef9a882471fb048b1f8f`

This directory is a derived and revisable design product. It does not amend the
canonical production-deploy design, approve a dependency or package, modify a
GitHub setting, authorize P2-S execution or fixture acquisition/generation,
implement a verification owner, publish an artifact, dispatch a workflow, or
authorize staging or production access. PR #603 completed the P2-D governance
loop, PR #605 published the P2-S0 Gate definition, and PR #608 published the
Route A fixture-acquisition Gate. Its completed preflight still had only one of
fourteen selectors filled and returned `BLOCKED_INPUT`. PR #609 then published
the Route B generation-design Gate without granting source, Settings, or
  generation authority. PR #610 published the FX2-E protected-Environment Gate
  without granting Settings execution. None selected the candidate profile or
  proved feasibility. Current work is limited to the docs-only FX2-E execution-
  request amendment; no executable request packet exists yet. Until a later explicit profile decision and
canonical cross-document reconciliation, the existing full-Sigstore/Rekor/CT
requirements and current runtime hard stop remain authoritative.

## Initial Route A Analysis Context

- Active repository: `D:\Projects\proxy-gateway-minimal`
- Isolated analysis worktree:
  `D:\Projects\proxy-gateway-minimal\.worktrees\p2-s0-target-fixture-gate`
- Analysis branch: `docs/p2-s0-target-fixture-gate`
- Source drift at capture: none between local `origin/master` and remote
  `refs/heads/master`
- Capture time: `2026-08-11T16:34:24Z`
- Source evidence mode: repository documents plus redacted, read-only GitHub
  configuration summaries

The primary checkout contained unrelated changes before this analysis started.
No evidence was read from those changed bytes. Repository evidence below was
read from the isolated exact-master worktree.

## Current Route B Design Context

- Isolated design worktree:
  `D:\Projects\proxy-gateway-minimal\.worktrees\p2-s0-route-b-design-gate`
- Design branch: `docs/p2-s0-route-b-design-gate`
- Exact remote-master binding:
  `6d6a0a197e89706d4de591f0d8cbecaef18df2c1`
- Exact master tree: `243824bbb51fb3b2d30d5397b39549d36499dd44`
- Route B inventory and official-contract refresh completion time:
  `2026-08-11T18:41:05Z`
- Source evidence mode: repository bytes, redacted read-only GitHub metadata,
  and current official GitHub attestation documentation

The primary checkout still contains unrelated user changes. Route B design
reads and writes only the isolated exact-master worktree. No workflow, package,
lockfile, Settings, Release, Environment, fixture, dispatch, host, or
production state was modified.

## Current FX2-E Execution-Request Context

- Isolated Gate worktree:
  `D:\Projects\proxy-gateway-minimal\.worktrees\p2-s0-route-b-environment-gate`
- Amendment branch: `docs/p2-s0-fx2e-execution-request`
- Exact remote-master binding:
  `015ad0b74851b54ebdfbef9a882471fb048b1f8f`
- Exact master tree: `09b28a5eb3422c88ceaf466554139a34a7b5199e`
- Initial FX2-E Gate publication: PR #610; Gate blob
  `2003f51b925a78ab942fe6f1ef8dd8df61cdc7ad`
- Read-only post-publication rebind completion time: `2026-08-12T02:40:22Z`
- Source evidence mode: repository bytes, redacted read-only GitHub metadata,
  and current official GitHub Environment documentation

The dedicated `p2-s0-route-b-fixture-generation` Environment remains absent.
PR #610 published the Gate definition but granted no Settings authority. This
turn prepares only a docs-only execution-request amendment and records a
redacted independent-human declaration. Because this amendment cannot bind its
own future merge/latest Gate blob and the independent reader has not completed a
session-specific readback, the request packet remains not prepared and current
output remains `BLOCKED_INPUT`. No Environment, ruleset, secret, variable,
workflow, Release, Deployment, fixture, artifact, host, or production state was
created, changed, or deleted.

## Evidence Inventory

| Evidence | Reader-facing title | Source and SHA-256 | What it establishes |
| --- | --- | --- | --- |
| `E01` | Canonical production-deploy design | `docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md`; `77547423d469bc8777a0fa98188292bdd37454c13d454dc586149eb4325cc262` | The current graph stops at `full_sigstore_owner_topology_unapproved`; a future owner must precede lock publication, serve Foundation and Artifact, and keep complete CT/SCT authority private. |
| `E02` | Implementation program | `docs/superpowers/plans/2026-08-08-github-control-plane-production-deploy-implementation-program.md`; `a110ebbd5d0430d0f20fe789e95548426019e94dad69e01abf089fc36378a9a6` | The retained bootstrap-plus-main order cannot place the owner early enough; lock postverification, an offline npm closure, and a new Risk A resume approval are conjunctive prerequisites. |
| `E03` | Foundation and Linux feasibility plan | `docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md`; `1c3e5101776a7e91df548c0d38ca50d49adc536d4391fa2cd3b52a04ab89565d` | The current Foundation verifier is diagnostic-only; publication remains inert until one full owner and an independently verified offline closure exist. |
| `E04` | Artifact and workflow plan | `docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md`; `d2c7cc78b7c6cadd7d8221f417e0152111d4a18cabaf8f5d24d8ad3232b34286` | Artifact must consume the same owner without minting a second authority, and Environment policy is part of the authorization input. |
| `E05` | Existing production dry run | `.github/workflows/production-deploy-dry-run.yml`; `51394f59f4ba9bba10815299a70874322fff59d30002769ce06662332ece0b9b` | The current workflow builds a review packet and explicitly performs no production host mutation; it is not a formal deploy executor. |
| `E06` | Existing release-artifact workflow | `.github/workflows/release-artifact.yml`; `5cc83158c486682b7c175c14efbab6b704d56db7fbbbf4b66995ad1b6f06a202` | Successful packaging is artifact evidence only and does not establish deployment authority. |
| `E07` | Restricted Japan config repair workflow | `.github/workflows/japan-runtime-config-additive-repair.yml`; `42b01083e5eab95f8797e6c2cce04bc61714a5fbad76b6cab21f7d27819a6ff7` | The existing Environment-bound path is narrowly scoped to additive config repair and cannot be reused as a general deployment channel. |
| `E08` | Repository Risk A operating rules | `AGENTS.md`; `430ddf51a3cf61d1e0123938231f24b1f42f17c0284406a187b8a4c869f0b56e` | Production and provider work requires read-only inventory, exact approval, validation, rollback, and closeout; source or CI evidence is not deployment authority. |
| `E09` | Live Environment and ruleset summary | Redacted compact JSON; `ec0982fe564eadeddc6f7367d76fe2621f11dd004f4b5bbdccf20b9c45cfd432` | `vultr-japan-production` has one user reviewer, self-review prevention, and protected-branch policy, but `can_admins_bypass=true`; master requires zero approvals and only the strict `Validate` status check. |
| `E10` | Merged PR #600 summary | Redacted compact JSON; `3ccaaf16a2f2a1086b3d4d328ab236912fbcdf54f74763b09b13436292fd26cb` | PR #600 merged as the exact 11-file dormant checkpoint at `9ebc0849`; its successful checks and merge do not supply the missing owner or authorize publication. |
| `E11` | Cross-document authority-cycle diagnosis | Derived from `E01`–`E04`; no separate source artifact | Promoting diagnostics or placing the owner inside its own lock/closure would violate the single-owner and independent-bootstrap invariants. |
| `E12` | GitHub private-attestation and trusted-root summary | Official GitHub documentation plus redacted compact readback; `fbcb88ffb797ff9a8e08d81c5235eafc31077d5a4d11c065cfa521fd102edd14` | The repository is private; GitHub documents no transparency log for its private Sigstore instance; the current root output contains one no-tlog/no-ctlog line with six certificate authorities and six timestamp authorities. The applicable root and real bundle shape remain P2-S questions. |
| `E13` | Merged PR #603 P2-D closeout summary | Redacted compact JSON; `57f6fec97b80c8be221d3403d50e9831365f74a9cb681a1fc77e8de427b857e0` | PR #603 merged the exact seven-path P2-D record with verified base/head parents, identical approved/merged trees, zero unresolved threads, and successful checks. Exact head/merge attribution recorded zero workflow dispatch and deployment; the post-merge Release Artifact run created Actions artifacts but no GitHub Release. |
| `E14` | Merged PR #605 P2-S0 Gate publication summary | Redacted compact JSON; `2dbdc737703ced6ad7f82ec4b80dc2658d77c951d0cc840b2bb045e52fbd81ee` | PR #605 merged the exact six-path Gate package with verified base/head parents, identical approved/merged trees, zero unresolved threads, and successful head/post-merge checks. It published a Gate definition only; no workflow dispatch, deployment, GitHub Release, fixture, or P2-S authority resulted. |
| `E15` | Exact-master target-fixture gap summary | Redacted compact JSON; `97d0571e4f60d2ad11e3a370de3d93ec15e6c0855d8dce236281767b54ace4d7` | Exact current source has nine tracked workflows and no observed attestation producer or target fixture. The latest Release Artifact run produced three ordinary artifacts; all 468 visible artifact metadata names had zero attestation/fixture keyword matches. No artifact was downloaded, so external or opaque fixture availability remains unestablished rather than globally disproven. |
| `E16` | Merged PR #608 P2-S0-FX1 Gate publication summary | Redacted compact JSON; `0b8f0f5d8aec74149b25a49b5821dbfbd37fffb240aa13b16b43b0f7060a926c` | PR #608 merged the exact six-path Route A Gate package with verified base/head trees, zero unresolved threads, successful checks, zero dispatches and deployments, and successful post-merge workflows. Publication granted no acquisition, generation, or P2-S authority. |
| `E17` | Route A terminal preflight snapshot | Redacted compact JSON; `2a1a1e693792dfdd06caef1978d05390060fc3533f6bc3b1ba7a233b27b65529` | At current master, repository-visible workflow and artifact metadata still expose no target fixture or producer, external custody remains `not_established`, and only one of fourteen Route A selectors is filled. Route A remains `BLOCKED_INPUT`; no raw byte was read and no write or dispatch occurred. |
| `E18` | Private-attestation eligibility and official Action/Environment contract | Official GitHub documentation plus redacted plan/repository readback; `426a244e0b10d374b8671fbdc8fa7d95d10b1d0edfbf624448d822e4af4d67e1` | The repository is private and organization-owned; the organization plan currently reads `enterprise`, satisfying the documented plan prerequisite for private attestations. Current official guidance recommends `actions/attest`, documents the API write and bundle output, and says `deployment: false` preserves required Environment reviewers while creating no Deployment object. No dependency or Settings change is selected. |
| `E19` | Open producer-conflict snapshot | Redacted compact JSON; `054d94f998bb17dc9673a225b56e52b3419595b1fb8443169aaeb9b6936abaa7` | Draft PR #594 contains a conflicting attestation/Release publisher and is a hard blocker before any Route B source Gate can pass. Draft PR #606 may delete workflows and requires exact rebind if merged. Neither Draft is current capability. |
| `E20` | Merged PR #609 P2-S0-FX2 Gate publication summary | Redacted compact JSON; `2d167c785d9e5c2a8ddbb359cdae13a8e520f8eb3fe23e3e24e7b89a2bb24814` | PR #609 merged the exact six-path Route B design package with identical approved/merged trees, successful checks, zero dispatches/deployments, and successful post-merge runs. Publication granted no Settings, source, generation, custody, or P2-S authority. |
| `E21` | FX2-E protected-Environment read-only preflight | Official GitHub documentation plus redacted compact JSON; `277e23f299ef5fd346a5ef86463c442f6f38752ea6353e9a871c89753f8a8cfe` | The target Environment is absent, nine workflows expose only three known static Environment bindings and zero dynamic/target/OIDC/attestation references, repository retention is `90/90`, and an account-distinct reviewer pair is available without proving independent-human control. Exact Settings mutation remains unapproved. |
| `E22` | Merged PR #610 FX2-E Gate publication summary | Redacted compact JSON; `d8568910422b2cece8caf1c60faf69efbd32ac3a0ef093fe9200beb770481924` | PR #610 merged the exact six-path FX2-E docs Gate with identical approved/merged trees, successful checks and post-merge runs, zero dispatches/deployments, and no GitHub Release. Publication granted no Settings execution or downstream authority. |
| `E23` | FX2-E post-publication live rebind | Redacted compact JSON; `87f2cd8a8d78abd9774fb8cc098293ef614ef2ef8a34f1cf357e956796cf6484` | Exact master now contains the published Gate; the target Environment remains absent, workflow producer/reference counts remain zero, name-set/ruleset/retention digests are frozen, the identity-safe Environment-configuration profile remains unbound, and no GitHub write occurred. This pre-amendment snapshot is not an executable request packet. |

## Redacted Live Configuration Summary

The live configuration summary intentionally omits reviewer identity and all
credentials:

```json
{
  "environment": "vultr-japan-production",
  "reviewer_count": 1,
  "reviewer_types": ["User"],
  "prevent_self_review": true,
  "protected_branches": true,
  "custom_branch_policies": false,
  "can_admins_bypass": true,
  "ruleset": "master-governance-single-owner",
  "ruleset_enforcement": "active",
  "required_approvals": 0,
  "required_review_thread_resolution": false,
  "required_status_checks": ["Validate"],
  "bypass_actor_count": 0
}
```

This summary is a point-in-time observation, not a request to change Settings.
Any later Settings Gate must take a fresh before snapshot, define the exact
allowed mutation, obtain approval, and compare an independent after readback.

## P2-D Private-Attestation Evidence Summary

GitHub documents that private repositories use GitHub's Sigstore instance and
that this instance has no transparency log. GitHub's offline-verification
guidance also treats a custom trusted root as a refreshed input for newly
imported signed material, while the GitHub CLI describes verified timestamps
as coming from either a transparency log or a timestamp authority:

- <https://docs.github.com/en/enterprise-cloud@latest/actions/concepts/security/artifact-attestations>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline>
- <https://cli.github.com/manual/gh_attestation_verify>

Observed at `2026-08-11T12:38:13Z` with GitHub CLI `2.92.0`:

- repository visibility was `PRIVATE`;
- `gh attestation trusted-root` returned two compact JSON lines;
- root line 0 had SHA-256
  `844a1c6de3986c9f02070266b25e0d1a2fa99ceccc89f6b9ad90aae47b62a16e`,
  two transparency logs, two CT logs, two certificate authorities, and one
  timestamp authority;
- root line 1 had SHA-256
  `f7a479f2bd2cc8d0389c74e99319a68524f3019d283d1c93d6de24362717012c`,
  zero transparency logs, zero CT logs, six certificate authorities, and six
  timestamp authorities.

The documented private-instance behavior is consistent with root line 1, but
this is an inference rather than a completed cryptographic mapping. P2-S must
use a real private-repository bundle and the official verifier as an oracle to
prove which exact root, certificate authority, timestamp authority, bundle arm,
and timestamped bytes apply. Until then, no RFC3161, Fulcio, CT/SCT, Rekor, or
private-profile success claim is available.

## P2-D Governance Closeout Summary

PR #603 completed P2-D at merge
`d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f`. Its parents are exact base
`9ebc08492af170a470182ba827da052fa41b81b2` and approved head
`16e0bd3095fd5d7a68410ef2fa5fd5877814e77a`; both the merge commit and
approved head resolve to tree `6182df7a32479924aaba49cecd9a5fb170cb3690`.
The exact seven-path docs-only scope, zero unresolved threads, checks, and
post-merge workflows were independently read back. Three Actions artifacts
were created by the existing Release Artifact workflow, but it created no
GitHub Release; no deployment or workflow dispatch was attributable to the
approved head or merge SHA.

This is governance completion, not feasibility evidence. P2-S has not started,
no target fixture was established, and the candidate profile remains
unselected. The next completed milestone was publication of the docs-only
[P2-S0 Gate package](gates/p2-s0-feasibility-gate.md).

## P2-S0 Gate Publication Summary

PR #605 published the six-path P2-S0 Gate package at merge
`046952402c5ded1412e58fe860c6eb9ad426ced5`. Its parents are exact base
`d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f` and approved head
`efbc8915be48b3d9cb6e442ad6fd55c7f7464baa`; both the merge commit and
approved head resolve to tree `7c171b70026181cf543d62c805712a5966a7947f`.
The exact six-path docs-only scope, zero unresolved threads, head checks, and
post-merge CI, CodeQL, and Release Artifact workflows were independently read
back. The post-merge Release Artifact run created three ordinary Actions
artifacts and no GitHub Release. No workflow dispatch or Deployment was
attributable to the approved head or merge SHA.

Publication makes the Gate definition a repository record. It does not grant
the Gate, fill any of its eight input classes, authorize fixture acquisition or
generation, or start P2-S.

## P2-S0 Target-Fixture Gap Summary

Read-only inventory at exact current source
`046952402c5ded1412e58fe860c6eb9ad426ced5` found nine tracked workflow files.
None contains `actions/attest`, `actions/attest-build-provenance`,
`gh attestation`, `id-token: write`, or `attestations: read/write`. The tracked
Foundation publisher remains a fixed hard stop, and the Release Artifact
workflow only packages ordinary Actions artifacts.

Release Artifact run `31511439433` completed successfully for the exact source
and produced `proxy-gateway-046952402c5d`, `portal-static-046952402c5d`, and
`admin-static-046952402c5d`. Repository-wide Actions metadata exposed 468
artifact rows at capture time; zero artifact names matched `attest`, `sigstore`,
`rfc3161`, `fixture`, or `bundle`. No artifact content was downloaded or
inspected, and no external custody source was supplied. The defensible result is
therefore `external_existing_fixture_status: not_established`, not a claim that
a fixture is globally absent.

The parent Gate remains `not_granted` with current output `BLOCKED_INPUT`. The
docs-only
[P2-S0-FX1 target-fixture-acquisition Gate](gates/p2-s0-target-fixture-acquisition-gate.md)
was later published by PR #608. Its original capture remains frozen; it does
not authorize download, generation, workflow change, dispatch, dependency
selection, oracle execution, P2-S, Settings, Release, Environment, staging,
host, or production operations.

## P2-S0-FX1 Publication And Route A Preflight

PR #608 published the six-path FX1 package at merge
`6d6a0a197e89706d4de591f0d8cbecaef18df2c1`. Its exact base was
`ebf303d9c36c91837f41efd153a7cda5d0a6ae7f`, approved head was
`b2df940edb36225d8f0c5ee00b9fe94e5be66bab`, and both approved head and merge
resolve to tree `243824bbb51fb3b2d30d5397b39549d36499dd44`.
The six successful and one skipped checks, zero unresolved review threads,
successful post-merge CI/CodeQL/Release Artifact runs, zero exact-merge
Deployments, zero Releases, and zero head/merge workflow dispatches were read
back. The Release Artifact run created three ordinary Actions artifacts only.

The follow-up Route A preflight at that exact master still found nine tracked
workflows, no attestation producer references, 471 visible Actions artifact
metadata rows, and zero fixture/attestation name matches. Only the target
repository selector was filled; thirteen of fourteen execution selectors
remained missing. No artifact was downloaded, no raw private byte was read, no
workflow was dispatched, and no GitHub write occurred. External custody
remains `not_established`.

This snapshot is terminal `BLOCKED_INPUT` for this Route A attempt, not
evidence of global absence. A future named custodian may support a superseding
Route A Gate, but the historical snapshot and its source binding must never be
rewritten as success.

## Route B Eligibility And Conflict Summary

Current read-only API output reports that the private repository is owned by an
organization whose plan class is `enterprise`. Current official GitHub
documentation requires GitHub Enterprise Cloud for private-repository artifact
attestations, so the plan prerequisite is presently satisfied. This is a
drift-prone eligibility input and not proof that any run will succeed. It must
be refreshed before source merge and again before generation.

Official `actions/attest` documentation currently recommends that Action for
new implementations, documents job-level `contents: read`, `id-token: write`,
and `attestations: write` for provenance, uploads the attestation to the GitHub
Attestations API, and exposes a JSON Sigstore `bundle-path`. No Action version,
commit, blob, transitive dependency, or runner is selected by this record.

Official Environment-control documentation says a job may set
`deployment: false`: required reviewers and wait timers still apply, no
Deployment object is created, and custom deployment-protection Apps are
incompatible. Route B therefore freezes `deployment: false` and forbids custom
protection Apps while still requiring the separately approved reviewer-based
Environment.

- <https://github.com/actions/attest>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations>
- <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments>

Open Draft PR #594 is not current capability, but its exact head contains a
competing Foundation publisher with attestation and Release-write authority.
It must be closed without merge, with exact state/head readback, before a Route
B source Gate can pass. Any salvage must be independently reimplemented from
fresh master rather than reusing that head. Open Draft PR #606 may remove two
workflows; if it or any other PR moves master first, all Route B source bindings
must be refreshed. Issue #598 is a coordination index, not immutable authority,
and its description is already stale about merged PR #593.

## Route B Design Gate Publication Summary

PR #609 published the docs-only
[P2-S0-FX2 target-fixture-generation design Gate](gates/p2-s0-target-fixture-generation-gate.md)
at `a413f636267a3b0fcfc65f7b911fa50f6cd95ea4`. It defines a proposed new
direct manual workflow, exactly-one canonical non-production subject, minimum
job permissions, exact Action-pin requirements, GitHub Attestations API and
subject-artifact custody, one-shot limitations, ineligible-history handling,
and the serial Environment/source/generation/retirement/custody approval
sequence. Publication did not grant the Gate or any downstream authority.

The design explicitly recognizes that a merged `workflow_dispatch` workflow
with OIDC and attestation write permission is a real callable surface, not a
dormant hard stop. Before source merge, a separate Settings Gate must establish
and read back the dedicated protected Environment. After any consumed run, a
separate source-retirement PR and no-extra-run readback must complete before any
positive custody handoff or retry. The Environment and retirement controls are
both required; this Gate grants neither.

A future dispatch necessarily creates bounded GitHub run/job/check/log/audit
metadata, and the protected attestation job creates Environment reviewer-
approval/control metadata. The job must use `deployment: false`, retaining
required review while creating no Deployment object; `deployments=[]` directly
proves the absent parent and zero target-associated status children are inferred. A
successful run may additionally create one attestation and one subject/manifest
artifact. Every created object must be retention/lifecycle-classified, redacted,
and read back: configurable artifact/log retention is bounded, while other
persistent objects are recorded as eligible or ineligible history. Cleanup
cannot claim those GitHub objects were erased.

The future source and source-retirement PRs also have GitHub-side effects: PR
checks/advisories/default CodeQL and current master CI/Release Artifact/default
CodeQL may run, and Release Artifact may create ordinary Actions artifacts.
Each source Gate must freeze and read back those expected automatic objects,
directly observe zero unexpected GitHub Release, target Deployment, or producer
run, and infer only that the exact source/retirement activity produced no
fixture attestation from zero producer run/subject plus the frozen automatic-
trigger and allowed-write/readback surface. No repository-wide attestation
absence is claimed.
Ordinary packaging artifacts are not Route B fixture evidence.

Generated evidence must be labeled `origin_route: route_b_generated` and can
never be backfilled as Route A custody success. A later Environment-bound source
merge may only request a separate generation Gate; any consumed generation run
must be followed by retirement, and only a successful retired run may request a
separate Route B custody handoff. That handoff may only return one input to the
parent P2-S0 reevaluation. The official offline verifier oracle and the other
seven input classes remain independent prerequisites.

## FX2-E Environment Settings Gate Summary

PR #610 published the docs-only
[P2-S0-FX2-E protected-Environment Settings Gate](gates/p2-s0-target-fixture-generation-environment-settings-gate.md).
It remains not granted. The current work item is a docs-only execution-request
amendment; it does not create a request envelope or authorize Settings. Fresh
read-only rebind `E23` found six existing Environments and no exact or normalized
match for `p2-s0-route-b-fixture-generation`; direct GET returned `404`. The
nine tracked workflows have three known static Environment bindings, zero
dynamic/caller-controlled selectors, zero references to that Environment, and
zero `id-token: write`, `attestations: write`, or `actions/attest` references.

Official request semantics require a custom deployment-branch policy for exact
`master`. `protected_branches=true` is rejected because it can expand to every
protected branch. The desired state instead uses
`protected_branches=false`, `custom_branch_policies=true`, and exactly one
`type=branch,name=master` policy. The public Environment REST request does not
document a `can_admins_bypass` write field. The value observed in current GET
responses is a live extension rather than a stable documented field. The future
operation must use the documented GitHub Settings UI control and independently
read back the extension as Boolean `false`; missing, null, non-Boolean, or true
fails closed.

The current repository artifact/log-retention readback is `90/90`; FX2-E only
freezes and later rechecks that value. It does not change retention. The user
confirmed one exact User as Settings operator/future dispatch actor and a second
account- and human-distinct User as Environment reviewer/after-reader; the
reviewer declares a separate authenticated session and no Settings mutation
role. To avoid enumerable disclosure of the low-entropy identity set, the
repository stores no raw identity, plain identity/request-body SHA, or keyed
commitment. The typed, domain-separated HMAC preimages, normalization, key
lifecycle, and independent recomputation protocol all remain unbound future
packet inputs. The identity-safe existing-Environment configuration collection
is also `null`. The declarations do not yet prove the independent
session's complete repository plus organization-audit read capability. This
amendment also cannot bind its own future merge/latest Gate blob. The immutable
request envelope, exact UTC window/deadline, machine-checkable receipts,
authoritative single-consumer persistence surface, and independent-reader
receipt therefore remain absent. A positive closeout additionally
requires an expected actor/target/window platform receipt matching a separately
frozen live event shape that explicitly proves Boolean false (or exact observed
Boolean true-to-false transition). A merely non-null field is insufficient, and
positive output must wait for the bound post-deadline full audit sweep.
GitHub publishes no arrival SLA, so delayed evidence is pending until the
project deadline and never positive.

If a future separately approved Settings execution fails after its first write,
the safe default is to stop. Only an exact readable custom-mode state with zero
branch policies and zero consumers, secrets, variables, Apps, Deployments, runs,
or unexpected writes may be labeled inert partial state. Every broader or
ambiguous state is `NO_GO_OPTION1`. Automatic deletion is not authorized;
remediation or deletion needs a new exact Settings/destructive Gate. No positive
FX2-E receipt can authorize or substitute for FX2-S.

## Evidence Hash Profile And Collection Manifest

The P2-D design-input collection remains frozen exactly as reviewed at
`master@9ebc08492af170a470182ba827da052fa41b81b2`; P2-D completion does not
rewrite that historical input. Repository text evidence `E01`–`E08` uses
profile `repo_text_lf`: decode the tracked blob as UTF-8, normalize CRLF to LF,
retain the final LF, then SHA-256 the resulting bytes. Redacted design-input
evidence `E09`, `E10`, and `E12` uses profile `redacted_json_compact`: SHA-256
the exact one-line UTF-8 JSON bytes below,
without a trailing LF. Keys appear in the fixed order shown; no identity,
credential, URL, run ID, or reviewer login is retained.

`E09` canonical redacted bytes:

```json
{"can_admins_bypass":true,"custom_branch_policies":false,"environment":"vultr-japan-production","prevent_self_review":true,"protected_branches":true,"reviewer_count":1,"reviewer_types":["User"],"ruleset":"master-governance-single-owner","ruleset_bypass_actor_count":0,"ruleset_enforcement":"active","ruleset_required_approvals":0,"ruleset_required_review_thread_resolution":false,"ruleset_required_status_checks":["Validate"]}
```

`E10` canonical redacted bytes:

```json
{"base_ref_oid":"52d5bf99bf201ce1315d09da10c9bd0ebff1f13d","check_other_terminal_count":0,"check_skipped_count":1,"check_success_count":6,"file_count":11,"head_ref_oid":"cfd36ad2d5ca5ef168cb57224fd2344e3121e52e","is_draft":false,"merge_commit":"9ebc08492af170a470182ba827da052fa41b81b2","number":600,"review_decision":"","state":"MERGED"}
```

`E12` canonical redacted bytes:

```json
{"captured_at":"2026-08-11T12:38:13Z","gh_version":"2.92.0","private_repository":true,"private_sigstore_transparency_log_documented":false,"root_0":{"certificate_authority_count":2,"ctlog_count":2,"sha256":"844a1c6de3986c9f02070266b25e0d1a2fa99ceccc89f6b9ad90aae47b62a16e","timestamp_authority_count":1,"tlog_count":2},"root_1":{"certificate_authority_count":6,"ctlog_count":0,"sha256":"f7a479f2bd2cc8d0389c74e99319a68524f3019d283d1c93d6de24362717012c","timestamp_authority_count":6,"tlog_count":0},"trusted_root_line_count":2}
```

`E13` is separate P2-D phase-completion evidence, not an entry in the frozen
design-input collection. Its canonical redacted bytes are:

```json
{"approved_head_tree":"6182df7a32479924aaba49cecd9a5fb170cb3690","base_ref_oid":"9ebc08492af170a470182ba827da052fa41b81b2","changed_path_count":7,"changed_paths":["docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/context.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/diagrams/unify-supply-chain-authority-before.mmd","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/diagrams/unify-supply-chain-authority-in-repo-unified-owner-after.mmd","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/diagrams/unify-supply-chain-authority-permanent-no-go-after.mmd","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.json","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/proposals/unify-supply-chain-authority.md"],"changed_paths_sha256":"e78f34a7ad239c26912c5357d5d7523ae5050c895f54ee62099ecf62cd86ff64","check_other_terminal_count":0,"check_skipped_count":1,"check_success_count":6,"head_or_merge_sha_workflow_dispatch_count":0,"head_ref_oid":"16e0bd3095fd5d7a68410ef2fa5fd5877814e77a","is_draft":false,"merge_commit":"d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f","merge_sha_deployment_count":0,"merge_tree":"6182df7a32479924aaba49cecd9a5fb170cb3690","number":603,"postmerge_ci_success":true,"postmerge_codeql_success":true,"postmerge_release_artifact_actions_artifact_count":3,"postmerge_release_artifact_github_release_count":0,"postmerge_release_artifact_success":true,"review_decision":"","state":"MERGED","unresolved_review_thread_count":0}
```

`E14` is separate P2-S0 Gate-publication evidence. It does not rewrite the P2-D
design-input collection or grant the Gate. Its canonical redacted bytes are:

```json
{"approved_head_tree":"7c171b70026181cf543d62c805712a5966a7947f","base_ref_oid":"d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f","changed_path_count":6,"changed_paths":["docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/context.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/diagrams/unify-supply-chain-authority-in-repo-unified-owner-after.mmd","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/gates/p2-s0-feasibility-gate.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.json","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/proposals/unify-supply-chain-authority.md"],"changed_paths_sha256":"9d843b9e03117639eb22e46b4787cb8799e84903f254f136aa5e919f24315b11","check_other_terminal_count":0,"check_skipped_count":1,"check_success_count":6,"head_or_merge_sha_workflow_dispatch_count":0,"head_ref_oid":"efbc8915be48b3d9cb6e442ad6fd55c7f7464baa","is_draft":false,"merge_commit":"046952402c5ded1412e58fe860c6eb9ad426ced5","merge_sha_deployment_count":0,"merge_tree":"7c171b70026181cf543d62c805712a5966a7947f","number":605,"postmerge_ci_success":true,"postmerge_codeql_success":true,"postmerge_release_artifact_actions_artifact_count":3,"postmerge_release_artifact_github_release_count":0,"postmerge_release_artifact_success":true,"review_decision":"","state":"MERGED","unresolved_review_thread_count":0}
```

`E15` is separate exact-current-source input-gap evidence. It records metadata
and actions not taken; it contains no artifact content or external-custody
claim. Its canonical redacted bytes are:

```json
{"actions_artifact_metadata_total_count":468,"actions_artifact_name_match_count":0,"actions_artifact_name_match_scope":"all_repository_actions_artifact_metadata","artifact_download_performed":false,"capture_at":"2026-08-11T16:34:24Z","current_master":"046952402c5ded1412e58fe860c6eb9ad426ced5","current_master_tree":"7c171b70026181cf543d62c805712a5966a7947f","current_release_artifact_actions_artifact_count":3,"current_release_artifact_names":["admin-static-046952402c5d","portal-static-046952402c5d","proxy-gateway-046952402c5d"],"current_release_artifact_run_conclusion":"success","current_release_artifact_run_id":31511439433,"current_source_attestation_action_reference_count":0,"current_source_attestation_permission_reference_count":0,"current_source_id_token_write_reference_count":0,"current_source_workflow_count":9,"external_existing_fixture_status":"not_established","fixture_generation_or_acquisition_performed":false,"tracked_attestation_producer_status":"not_observed","tracked_target_private_fixture_status":"not_observed","workflow_dispatch_performed":false}
```

`E16` is separate FX1 Gate-publication evidence. It does not grant Route A or
rewrite `E15`. Its canonical redacted bytes are:

```json
{"approved_head_tree":"243824bbb51fb3b2d30d5397b39549d36499dd44","base_ref_oid":"ebf303d9c36c91837f41efd153a7cda5d0a6ae7f","changed_path_count":6,"changed_paths":["docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/context.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/gates/p2-s0-feasibility-gate.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/gates/p2-s0-target-fixture-acquisition-gate.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.json","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/proposals/unify-supply-chain-authority.md"],"changed_paths_sha256":"525c03ecc529a64c74091a7bbe4230c674b3600e7d71a4a5a0d2f4e0da09354a","check_other_terminal_count":0,"check_skipped_count":1,"check_success_count":6,"head_or_merge_sha_workflow_dispatch_count":0,"head_ref_oid":"b2df940edb36225d8f0c5ee00b9fe94e5be66bab","is_draft":false,"merge_commit":"6d6a0a197e89706d4de591f0d8cbecaef18df2c1","merge_sha_deployment_count":0,"merge_tree":"243824bbb51fb3b2d30d5397b39549d36499dd44","number":608,"postmerge_ci_success":true,"postmerge_codeql_success":true,"postmerge_release_artifact_actions_artifact_count":3,"postmerge_release_artifact_github_release_count":0,"postmerge_release_artifact_success":true,"review_decision":"","state":"MERGED","unresolved_review_thread_count":0}
```

`E17` is the later Route A preflight snapshot. It records new metadata without
changing the earlier `E15` count or capture. Its canonical redacted bytes are:

```json
{"actions_artifact_metadata_total_count":471,"actions_artifact_name_match_count":0,"actions_artifact_name_match_scope":"all_repository_actions_artifact_metadata","artifact_download_performed":false,"capture_at":"2026-08-11T18:06:06Z","current_master":"6d6a0a197e89706d4de591f0d8cbecaef18df2c1","current_master_tree":"243824bbb51fb3b2d30d5397b39549d36499dd44","current_release_artifact_actions_artifact_count":3,"current_release_artifact_names":["admin-static-6d6a0a197e89","portal-static-6d6a0a197e89","proxy-gateway-6d6a0a197e89"],"current_release_artifact_run_conclusion":"success","current_release_artifact_run_id":31516627284,"current_source_attestation_action_reference_count":0,"current_source_attestation_permission_reference_count":0,"current_source_id_token_write_reference_count":0,"current_source_workflow_count":9,"external_existing_fixture_status":"not_established","fixture_generation_or_acquisition_performed":false,"github_write_performed":false,"route_a_complete_selector_count":1,"route_a_required_selector_count":14,"route_a_status":"BLOCKED_INPUT","tracked_attestation_producer_status":"not_observed","tracked_target_private_fixture_status":"not_observed","workflow_dispatch_performed":false}
```

`E18` records the redacted current plan/repository eligibility and official
Action/Environment contract. It selects no dependency or Settings change. Its
canonical redacted bytes are:

```json
{"actions_attest_bundle_output_documented":true,"actions_attest_bundle_serialization":"json_sigstore_bundle","actions_attest_current_recommendation":"actions/attest","capture_at":"2026-08-11T18:41:05Z","environment_deployment_false_creates_deployment_object":false,"environment_deployment_false_custom_protection_app_compatible":false,"environment_deployment_false_required_reviewers_apply":true,"official_action_dependency_selected":false,"official_docs_private_attestation_requires":"github_enterprise_cloud","organization_plan_class":"enterprise","private_attestation_eligibility":"plan_prerequisite_satisfied_feature_execution_unproven","private_repository":true,"repository_owner_type":"Organization","required_future_job_permissions":["attestations: write","contents: read","id-token: write"],"workflow_or_settings_change_performed":false}
```

`E19` records only the open competing Drafts relevant to Route B source
readiness. Neither Draft is merged capability. Its canonical redacted bytes
are:

```json
{"capture_at":"2026-08-11T18:06:06Z","current_master":"6d6a0a197e89706d4de591f0d8cbecaef18df2c1","github_write_performed":false,"open_pr_594":{"base_ref_oid":"02fc63a3f949b748dcccf26ba7d310be82f4b6df","head_publisher_blob":"cbe9ba8f949d3c6519a0a6b889177bb8d3c50d4f","head_ref_oid":"a3f2817d696ee9bb66f1e849e0b35e77105fde8e","head_tree":"60e705b6865bf75e5ccb021174914a1c94fee323","merge_state":"CONFLICTING","number":594,"observed_write_capabilities":["attestations: write","contents: write","id-token: write","release create/upload/publish"],"state":"OPEN_DRAFT","source_gate_blocker":true},"open_pr_606":{"base_ref_oid":"d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f","head_ref_oid":"e174ea257d102f5a820b11bf88f7fd0016e07fb4","merge_state":"BEHIND","number":606,"proposed_workflow_deletion_count":2,"source_rebind_if_merged":true,"state":"OPEN_DRAFT"}}
```

`E20` is separate FX2 Gate-publication evidence. It does not grant FX2 or
rewrite `E18`/`E19`. Its canonical redacted bytes are:

```json
{"approved_head_tree":"488dfff3ee29e5e70b9b23c1cf226119d06f063f","base_ref_oid":"6d6a0a197e89706d4de591f0d8cbecaef18df2c1","changed_path_count":6,"changed_paths":["docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/context.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/gates/p2-s0-feasibility-gate.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/gates/p2-s0-target-fixture-generation-gate.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.json","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/proposals/unify-supply-chain-authority.md"],"changed_paths_sha256":"cb3208bc7a54b28635d0a1c26ea17921266006aa8033af27d1d578a7b64f6d5d","check_other_terminal_count":0,"check_skipped_count":1,"check_success_count":6,"head_or_merge_sha_workflow_dispatch_count":0,"head_ref_oid":"4f150126f796aea8df5cb96755efa1142d2d4a5f","is_draft":false,"merge_commit":"a413f636267a3b0fcfc65f7b911fa50f6cd95ea4","merge_sha_deployment_count":0,"merge_tree":"488dfff3ee29e5e70b9b23c1cf226119d06f063f","number":609,"postmerge_ci_success":true,"postmerge_codeql_success":true,"postmerge_release_artifact_actions_artifact_count":3,"postmerge_release_artifact_github_release_count":0,"postmerge_release_artifact_success":true,"review_decision":"","state":"MERGED","unresolved_review_thread_count":0}
```

`E21` is the later FX2-E read-only preflight and official Settings-contract
receipt. It records no reviewer identity and no GitHub write. Its canonical
redacted bytes are:

```json
{"actions_artifact_and_log_retention_days":90,"actions_artifact_and_log_retention_maximum_allowed_days":90,"actions_attest_reference_count":0,"attestations_write_reference_count":0,"can_admins_bypass_false_documented_write_surface":"github_settings_ui","can_admins_bypass_get_field_observed":true,"capture_at":"2026-08-11T20:03:23Z","current_master":"a413f636267a3b0fcfc65f7b911fa50f6cd95ea4","current_master_tree":"488dfff3ee29e5e70b9b23c1cf226119d06f063f","current_workflow_dynamic_environment_selector_count":0,"current_workflow_environment_binding_count":3,"current_workflow_tree":"1a95a55d23f6e7b2d5e60556b9934027b0974b09","dedicated_environment":"p2-s0-route-b-fixture-generation","dedicated_environment_get_status":404,"dedicated_environment_match_count":0,"distinct_account_pair_available":true,"distinct_human_operator_status":"not_established","environment_name_set_sha256":"fabc78eebd9c9a12ad067f5b37b25227245a86b6ae5d2e17999d4901accdf179","existing_environment_count":6,"github_write_performed":false,"id_token_write_reference_count":0,"organization_plan_class":"enterprise","private_repository":true,"repository_actions_retention_mutation_authorized":false,"repository_owner_type":"Organization","target_environment_workflow_reference_count":0,"tracked_workflow_count":9}
```

`E22` records only the initial FX2-E Gate publication through PR #610. It does
not grant that Gate or any Settings execution. Its canonical redacted bytes are:

```json
{"approved_head_tree":"09b28a5eb3422c88ceaf466554139a34a7b5199e","base_ref_oid":"a413f636267a3b0fcfc65f7b911fa50f6cd95ea4","changed_path_count":6,"changed_paths":["docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/context.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/gates/p2-s0-feasibility-gate.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/gates/p2-s0-target-fixture-generation-environment-settings-gate.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.json","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/hardening.md","docs/superpowers/topology-addendum/2026-08-11-control-plane-supply-chain/proposals/unify-supply-chain-authority.md"],"changed_paths_sha256":"264cdc7dbfa275721c3bac721e18b0f2109de07f3700d9599f5e95848f3af3cd","check_other_terminal_count":0,"check_skipped_count":1,"check_success_count":6,"head_or_merge_sha_workflow_dispatch_count":0,"head_ref_oid":"d27be502560c9992170e12393d1decf1013d9882","is_draft":false,"merge_commit":"015ad0b74851b54ebdfbef9a882471fb048b1f8f","merge_sha_deployment_count":0,"merge_tree":"09b28a5eb3422c88ceaf466554139a34a7b5199e","number":610,"postmerge_ci_success":true,"postmerge_codeql_success":true,"postmerge_release_artifact_actions_artifact_count":3,"postmerge_release_artifact_github_release_count":0,"postmerge_release_artifact_success":true,"review_decision":"","state":"MERGED","unresolved_review_thread_count":0}
```

`E23` is the fresh read-only post-publication rebind. It records no identity,
credential, raw audit payload, or GitHub write. The earlier candidate
Environment-configuration collection used identity-derived reviewer material;
that candidate is excluded and the canonical receipt records the collection as
`null` pending an identity-safe profile. Its canonical redacted bytes are:

```json
{"actions_artifact_and_log_retention_days":90,"actions_artifact_and_log_retention_maximum_allowed_days":90,"actions_attest_reference_count":0,"attestations_write_reference_count":0,"capture_at":"2026-08-12T02:40:22Z","current_master":"015ad0b74851b54ebdfbef9a882471fb048b1f8f","current_master_tree":"09b28a5eb3422c88ceaf466554139a34a7b5199e","current_workflow_dynamic_environment_selector_count":0,"current_workflow_environment_binding_count":3,"current_workflow_manifest_sha256":"f7ad1217b14bd4488cdba16f8afde7c4377768e7d7a518ce8a832d4b0fe7d994","current_workflow_static_environment_bindings":[{"environment":"cloudflare-production","job":"deploy","path":".github/workflows/deploy-cloudflare-site.yml"},{"environment":"vultr-japan-production","job":"execute","path":".github/workflows/japan-runtime-config-additive-repair.yml"},{"environment":"vultr-japan-production","job":"probe","path":".github/workflows/japan-runtime-config-bootstrap-probe.yml"}],"current_workflow_tree":"1a95a55d23f6e7b2d5e60556b9934027b0974b09","dedicated_environment":"p2-s0-route-b-fixture-generation","dedicated_environment_deployment_count":0,"dedicated_environment_get_status":404,"dedicated_environment_match_count":0,"dedicated_environment_partial_state":"absent_no_partial_state","dedicated_environment_subordinate_get_statuses":{"branch_policies":404,"custom_apps":404,"custom_rules":404,"secrets":404,"variables":404},"environment_config_collection_sha256":null,"environment_config_collection_status":"unbound_identity_safe_profile_required","environment_name_set_sha256":"fabc78eebd9c9a12ad067f5b37b25227245a86b6ae5d2e17999d4901accdf179","existing_environment_count":6,"fx2e_gate_blob":"2003f51b925a78ab942fe6f1ef8dd8df61cdc7ad","fx2e_gate_bytes_sha256":"232deac71a99ba9e56402604445b3bc680718221914cbb32b3b36a4bb51097b0","fx2e_gate_commit":"015ad0b74851b54ebdfbef9a882471fb048b1f8f","github_write_performed":false,"id_token_write_reference_count":0,"open_pr_count":4,"open_prs":[{"base_ref_oid":"64c6eadf34dd3de764238b010ed791048549c80f","fx2e_settings_blocker":false,"fx2s_source_blocker":false,"head_ref_oid":"35a46387024c331f9bbf6454d70b8bf0531335e7","merge_state":"BEHIND","number":592,"rebind_if_merged":true,"state":"OPEN_DRAFT","workflow_change_count":0},{"base_ref_oid":"02fc63a3f949b748dcccf26ba7d310be82f4b6df","fx2e_settings_blocker":false,"fx2s_source_blocker":true,"head_ref_oid":"a3f2817d696ee9bb66f1e849e0b35e77105fde8e","merge_state":"CONFLICTING","number":594,"rebind_if_merged":true,"state":"OPEN_DRAFT","workflow_change_count":3},{"base_ref_oid":"d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f","fx2e_settings_blocker":false,"fx2s_source_blocker":false,"head_ref_oid":"bcebf99c25f621a60715e4c5c8bab23df8403e73","merge_state":"BEHIND","number":604,"rebind_if_merged":true,"state":"OPEN_DRAFT","workflow_change_count":0},{"base_ref_oid":"d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f","fx2e_settings_blocker":false,"fx2s_source_blocker":false,"head_ref_oid":"e174ea257d102f5a820b11bf88f7fd0016e07fb4","merge_state":"BEHIND","number":606,"rebind_if_merged":true,"state":"OPEN_DRAFT","workflow_change_count":2}],"ruleset_bypass_actor_count":0,"ruleset_enforcement":"active","ruleset_id":18935716,"ruleset_required_approvals":0,"ruleset_required_status_checks":["Validate"],"ruleset_summary_sha256":"3041ba53741bdcaf1359ce2bc1f0bd271475f14db4a29b908c0560385ec0ebf9","target_environment_workflow_reference_count":0,"tracked_workflow_count":9}
```

The `E23` workflow manifest is an ordinal path/blob array serialized as compact
UTF-8 JSON without BOM or trailing LF. The Environment name-set digest contains
only NFC names in ordinal order. The full existing-Environment configuration
collection remains `null` until a profile can represent reviewers without any
identity-derived digest or enumerable oracle. The ruleset summary is a fixed
redacted compact-JSON profile. Parent-Environment absence makes subordinate
`404` responses not-enumerable, not zero-count results.

The embedded Environment-name-set digest normalizes API-returned names to NFC,
preserves case, sorts by ordinal Unicode scalar order, and hashes the UTF-8
compact JSON array without BOM or trailing LF. The captured names are ASCII, so
scalar/code-unit order is identical. Target collision checks separately use
NFKC plus invariant case-folding.

The collection digest is SHA-256 of the exact one-line UTF-8 JSON array below,
without a trailing LF. Entries are sorted by `evidenceId`; object key order is
fixed as shown. `E11` is a derived inference and is deliberately not a source
artifact in this eleven-item collection. `E13` through `E23` are also
deliberately excluded because they record later phase completion, Gate
publication, input-gap/preflight, eligibility, conflict, and Settings-contract
evidence rather than P2-D design inputs.

```json
[{"evidenceId":"E01","hashProfile":"repo_text_lf","label":"docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md","sha256":"77547423d469bc8777a0fa98188292bdd37454c13d454dc586149eb4325cc262"},{"evidenceId":"E02","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-production-deploy-implementation-program.md","sha256":"a110ebbd5d0430d0f20fe789e95548426019e94dad69e01abf089fc36378a9a6"},{"evidenceId":"E03","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md","sha256":"1c3e5101776a7e91df548c0d38ca50d49adc536d4391fa2cd3b52a04ab89565d"},{"evidenceId":"E04","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md","sha256":"d2c7cc78b7c6cadd7d8221f417e0152111d4a18cabaf8f5d24d8ad3232b34286"},{"evidenceId":"E05","hashProfile":"repo_text_lf","label":".github/workflows/production-deploy-dry-run.yml","sha256":"51394f59f4ba9bba10815299a70874322fff59d30002769ce06662332ece0b9b"},{"evidenceId":"E06","hashProfile":"repo_text_lf","label":".github/workflows/release-artifact.yml","sha256":"5cc83158c486682b7c175c14efbab6b704d56db7fbbbf4b66995ad1b6f06a202"},{"evidenceId":"E07","hashProfile":"repo_text_lf","label":".github/workflows/japan-runtime-config-additive-repair.yml","sha256":"42b01083e5eab95f8797e6c2cce04bc61714a5fbad76b6cab21f7d27819a6ff7"},{"evidenceId":"E08","hashProfile":"repo_text_lf","label":"AGENTS.md","sha256":"430ddf51a3cf61d1e0123938231f24b1f42f17c0284406a187b8a4c869f0b56e"},{"evidenceId":"E09","hashProfile":"redacted_json_compact","label":"live-environment-ruleset-summary","sha256":"ec0982fe564eadeddc6f7367d76fe2621f11dd004f4b5bbdccf20b9c45cfd432"},{"evidenceId":"E10","hashProfile":"redacted_json_compact","label":"live-pr-600-merged-summary","sha256":"3ccaaf16a2f2a1086b3d4d328ab236912fbcdf54f74763b09b13436292fd26cb"},{"evidenceId":"E12","hashProfile":"redacted_json_compact","label":"github-private-attestation-root-summary","sha256":"fbcb88ffb797ff9a8e08d81c5235eafc31077d5a4d11c065cfa521fd102edd14"}]
```

## Evidence Limitations

- No external Sigstore dependency, Action version/full-SHA pin, executable
  digest, trust root set, CA/TSA/log key set, producer API contract, or source
  path is approved by P2-D, P2-S0/FX1/FX2/FX2-E publication, or this FX2-E
  execution-request amendment. The proposed workflow/test paths are design
  boundaries only.
- `github_private_rfc3161_v1` is a candidate profile name, not a selected or
  implemented success profile. The observed root counts do not prove that a
  target-workflow bundle contains or correctly binds an RFC3161 timestamp.
- The canonical plans still require complete Rekor and CT/SCT verification.
  This derived proposal cannot weaken or supersede those requirements; a later
  explicit profile decision and canonical reconciliation would be required.
- No performance or memory benchmarks were run. Resource effects in the
  proposal are source-derived or hypothetical and include a measurement plan.
- P2-S was designed but not executed. No real target-workflow private bundle was
  observed in current source or supplied by an external custodian. Artifact-name
  metadata does not prove opaque contents or global absence. Generating one
  would require separately approved producer-source, one-shot execution,
  lifecycle-closeout, and custody-handoff Gates.
- The current Enterprise plan readback satisfies only the documented plan
  prerequisite. It does not prove repository feature availability, successful
  generation, bundle shape, RFC3161 binding, or offline oracle behavior.
- A future manual workflow carrying OIDC and attestation write permission is a
  real callable surface after merge. Process guards are not machine-enforced
  one-shot approval; a separately approved exact FX2-E Settings execution before
  source merge and a reviewed source-retirement merge after the run are both
  required.
- `actions/attest` writes to the GitHub Attestations API. A future generation
  execution therefore cannot claim scratch-only or zero-external-write
  behavior. This docs-only turn performed none of those writes.
- No artifact was downloaded and no workflow was dispatched. No source
  implementation, dependency change, Release asset, lock, npm closure,
  Environment, secret, variable, ruleset, host, database, or production state
  was created or modified.
- The existing diagnostic verifiers are deliberately non-authoritative. Their
  current fixed failure is evidence of a safe stop, not evidence that complete
  Sigstore verification works.
- Live GitHub configuration can drift. Reviewers must refresh `E23`, bind the
  amendment merge/latest Gate blob, and refresh the official request contract
  before any FX2-E Settings approval; refresh `E09`
  before later publication/staging/production decisions, refresh `E12` before
  any profile or trust-rotation decision, and refresh `E17` through `E23`
  before any Route B source or generation decision.
