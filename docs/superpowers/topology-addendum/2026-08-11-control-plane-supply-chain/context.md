# Control-Plane Supply-Chain Topology Addendum: Evidence Context

> Status:
> - Type: Derived design-review evidence inventory with P2-S0 published and target-fixture Gate preparation current
> - Risk: A
> - Process: Read-only evidence -> G0 topology selection -> P2-D complete -> P2-S0 Gate publication -> target-fixture Gate preparation -> separately authorized acquisition and P2-S decisions -> later explicit profile and implementation decisions
> - Expected PR count: 1 docs-only PR for this Gate; any Route B source PR and later execution Gates require separate approval, while three later topology source checkpoints remain prospective
> - Validation: Evidence hashes, document authority, project-state check, JSON parse, Mermaid source review, and diff check
> - Production/AWS impact: None
> - Production authority: False
> - Execution authority: None
> - Frozen P2-D design-evidence revision: `9ebc08492af170a470182ba827da052fa41b81b2`
> - Frozen P2-D design-evidence collection SHA-256: `fc34014aff12217b2e0386346b2ed98bb767b5688be79917dd80d0a841aadeaa`
> - P2-D completion revision: `d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f`
> - P2-S0 Gate publication revision: `046952402c5ded1412e58fe860c6eb9ad426ced5`

This directory is a derived and revisable design product. It does not amend the
canonical production-deploy design, approve a dependency or package, modify a
GitHub setting, authorize P2-S execution or fixture acquisition/generation,
implement a verification owner, publish an artifact, dispatch a workflow, or
authorize staging or production access. PR #603 completed the P2-D governance
loop, and PR #605 published the P2-S0 Gate definition. Neither selected the
candidate profile nor proved feasibility. Current input status remains
`BLOCKED_INPUT`; until a later explicit profile decision and canonical cross-
document reconciliation, the existing full-Sigstore/Rekor/CT requirements and
current runtime hard stop remain authoritative.

## Local Analysis Context

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
current work item is the docs-only
[P2-S0-FX1 target-fixture-acquisition Gate](gates/p2-s0-target-fixture-acquisition-gate.md).
It defines a future exact read-only custody handoff only. It does not authorize
download, generation, workflow change, dispatch, dependency selection, oracle
execution, P2-S, Settings, Release, Environment, staging, host, or production
operations.

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

The collection digest is SHA-256 of the exact one-line UTF-8 JSON array below,
without a trailing LF. Entries are sorted by `evidenceId`; object key order is
fixed as shown. `E11` is a derived inference and is deliberately not a source
artifact in this eleven-item collection. `E13`, `E14`, and `E15` are also
deliberately excluded because they record later phase completion, Gate
publication, and current input-gap evidence rather than P2-D design inputs.

```json
[{"evidenceId":"E01","hashProfile":"repo_text_lf","label":"docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md","sha256":"77547423d469bc8777a0fa98188292bdd37454c13d454dc586149eb4325cc262"},{"evidenceId":"E02","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-production-deploy-implementation-program.md","sha256":"a110ebbd5d0430d0f20fe789e95548426019e94dad69e01abf089fc36378a9a6"},{"evidenceId":"E03","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md","sha256":"1c3e5101776a7e91df548c0d38ca50d49adc536d4391fa2cd3b52a04ab89565d"},{"evidenceId":"E04","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md","sha256":"d2c7cc78b7c6cadd7d8221f417e0152111d4a18cabaf8f5d24d8ad3232b34286"},{"evidenceId":"E05","hashProfile":"repo_text_lf","label":".github/workflows/production-deploy-dry-run.yml","sha256":"51394f59f4ba9bba10815299a70874322fff59d30002769ce06662332ece0b9b"},{"evidenceId":"E06","hashProfile":"repo_text_lf","label":".github/workflows/release-artifact.yml","sha256":"5cc83158c486682b7c175c14efbab6b704d56db7fbbbf4b66995ad1b6f06a202"},{"evidenceId":"E07","hashProfile":"repo_text_lf","label":".github/workflows/japan-runtime-config-additive-repair.yml","sha256":"42b01083e5eab95f8797e6c2cce04bc61714a5fbad76b6cab21f7d27819a6ff7"},{"evidenceId":"E08","hashProfile":"repo_text_lf","label":"AGENTS.md","sha256":"430ddf51a3cf61d1e0123938231f24b1f42f17c0284406a187b8a4c869f0b56e"},{"evidenceId":"E09","hashProfile":"redacted_json_compact","label":"live-environment-ruleset-summary","sha256":"ec0982fe564eadeddc6f7367d76fe2621f11dd004f4b5bbdccf20b9c45cfd432"},{"evidenceId":"E10","hashProfile":"redacted_json_compact","label":"live-pr-600-merged-summary","sha256":"3ccaaf16a2f2a1086b3d4d328ab236912fbcdf54f74763b09b13436292fd26cb"},{"evidenceId":"E12","hashProfile":"redacted_json_compact","label":"github-private-attestation-root-summary","sha256":"fbcb88ffb797ff9a8e08d81c5235eafc31077d5a4d11c065cfa521fd102edd14"}]
```

## Evidence Limitations

- No external Sigstore dependency, package version, executable digest, trust
  root set, CA/TSA/log key set, API, or repository path is approved by P2-D,
  P2-S0 publication, or this target-fixture Gate preparation.
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
  would require separately approved source and workflow-dispatch Gates.
- No artifact was downloaded and no workflow was dispatched. No source
  implementation, dependency change, Release asset, lock, npm closure,
  Environment, secret, host, database, or production state was created or
  modified.
- The existing diagnostic verifiers are deliberately non-authoritative. Their
  current fixed failure is evidence of a safe stop, not evidence that complete
  Sigstore verification works.
- Live GitHub configuration can drift. Reviewers must refresh `E09` before any
  future Settings, publication, staging, or production decision, and refresh
  `E12` before any profile or trust-rotation decision.
