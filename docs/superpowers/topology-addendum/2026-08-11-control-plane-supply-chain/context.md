# Control-Plane Supply-Chain Topology Addendum: Evidence Context

> Status:
> - Type: Derived design-review evidence inventory with P2-D profile proposal prepared
> - Risk: A
> - Process: Read-only evidence -> G0 topology selection -> P2-D proposal -> separately authorized P2-S execution -> later explicit profile and implementation decisions
> - Expected PR count: This docs-only P2-D preparation plus three future source PR checkpoints under the selected topology direction; P2-S is an isolated experiment, not a source PR
> - Validation: Evidence hashes, document authority, project-state check, JSON parse, Mermaid source review, and diff check
> - Production/AWS impact: None
> - Production authority: False
> - Execution authority: None
> - Target revision: `9ebc08492af170a470182ba827da052fa41b81b2`
> - Evidence collection SHA-256: `fc34014aff12217b2e0386346b2ed98bb767b5688be79917dd80d0a841aadeaa`

This directory is a derived and revisable design product. It does not amend the
canonical production-deploy design, approve a dependency or package, modify a
GitHub setting, authorize P2-S execution or fixture generation, implement a
verification owner, publish an artifact, dispatch a workflow, or authorize
staging or production access. The P2-D material prepared here is a candidate
profile amendment for review. Until a later explicit profile decision and
canonical cross-document reconciliation, the existing full-Sigstore/Rekor/CT
requirements and the current runtime hard stop remain authoritative.

## Local Analysis Context

- Active repository: `D:\Projects\proxy-gateway-minimal`
- Isolated analysis worktree:
  `D:\Projects\proxy-gateway-minimal\.worktrees\p2-private-attestation-profile`
- Analysis branch: `docs/p2-private-attestation-profile`
- Source drift at capture: none between local `origin/master` and remote
  `refs/heads/master`
- Capture time: `2026-08-11T12:38:13Z`
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

## Evidence Hash Profile And Collection Manifest

Repository text evidence `E01`–`E08` uses profile `repo_text_lf`: decode the
tracked blob as UTF-8, normalize CRLF to LF, retain the final LF, then SHA-256
the resulting bytes. Redacted live evidence `E09`, `E10`, and `E12` uses profile
`redacted_json_compact`: SHA-256 the exact one-line UTF-8 JSON bytes below,
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

The collection digest is SHA-256 of the exact one-line UTF-8 JSON array below,
without a trailing LF. Entries are sorted by `evidenceId`; object key order is
fixed as shown. `E11` is a derived inference and is deliberately not a source
artifact in this eleven-item collection.

```json
[{"evidenceId":"E01","hashProfile":"repo_text_lf","label":"docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md","sha256":"77547423d469bc8777a0fa98188292bdd37454c13d454dc586149eb4325cc262"},{"evidenceId":"E02","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-production-deploy-implementation-program.md","sha256":"a110ebbd5d0430d0f20fe789e95548426019e94dad69e01abf089fc36378a9a6"},{"evidenceId":"E03","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md","sha256":"1c3e5101776a7e91df548c0d38ca50d49adc536d4391fa2cd3b52a04ab89565d"},{"evidenceId":"E04","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md","sha256":"d2c7cc78b7c6cadd7d8221f417e0152111d4a18cabaf8f5d24d8ad3232b34286"},{"evidenceId":"E05","hashProfile":"repo_text_lf","label":".github/workflows/production-deploy-dry-run.yml","sha256":"51394f59f4ba9bba10815299a70874322fff59d30002769ce06662332ece0b9b"},{"evidenceId":"E06","hashProfile":"repo_text_lf","label":".github/workflows/release-artifact.yml","sha256":"5cc83158c486682b7c175c14efbab6b704d56db7fbbbf4b66995ad1b6f06a202"},{"evidenceId":"E07","hashProfile":"repo_text_lf","label":".github/workflows/japan-runtime-config-additive-repair.yml","sha256":"42b01083e5eab95f8797e6c2cce04bc61714a5fbad76b6cab21f7d27819a6ff7"},{"evidenceId":"E08","hashProfile":"repo_text_lf","label":"AGENTS.md","sha256":"430ddf51a3cf61d1e0123938231f24b1f42f17c0284406a187b8a4c869f0b56e"},{"evidenceId":"E09","hashProfile":"redacted_json_compact","label":"live-environment-ruleset-summary","sha256":"ec0982fe564eadeddc6f7367d76fe2621f11dd004f4b5bbdccf20b9c45cfd432"},{"evidenceId":"E10","hashProfile":"redacted_json_compact","label":"live-pr-600-merged-summary","sha256":"3ccaaf16a2f2a1086b3d4d328ab236912fbcdf54f74763b09b13436292fd26cb"},{"evidenceId":"E12","hashProfile":"redacted_json_compact","label":"github-private-attestation-root-summary","sha256":"fbcb88ffb797ff9a8e08d81c5235eafc31077d5a4d11c065cfa521fd102edd14"}]
```

## Evidence Limitations

- No external Sigstore dependency, package version, executable digest, trust
  root set, CA/TSA/log key set, API, or repository path is approved by this
  P2-D preparation.
- `github_private_rfc3161_v1` is a candidate profile name, not a selected or
  implemented success profile. The observed root counts do not prove that a
  target-workflow bundle contains or correctly binds an RFC3161 timestamp.
- The canonical plans still require complete Rekor and CT/SCT verification.
  This derived proposal cannot weaken or supersede those requirements; a later
  explicit profile decision and canonical reconciliation would be required.
- No performance or memory benchmarks were run. Resource effects in the
  proposal are source-derived or hypothetical and include a measurement plan.
- P2-S was designed but not executed. No real target-workflow private bundle is
  available in the current repository, and generating one would require a
  separately approved fixture-acquisition or workflow-dispatch Gate.
- No workflow was dispatched. No source implementation, dependency change,
  Release asset, lock,
  npm closure, Environment, secret, host, database, or production state was
  created or modified.
- The existing diagnostic verifiers are deliberately non-authoritative. Their
  current fixed failure is evidence of a safe stop, not evidence that complete
  Sigstore verification works.
- Live GitHub configuration can drift. Reviewers must refresh `E09` before any
  future Settings, publication, staging, or production decision, and refresh
  `E12` before any profile or trust-rotation decision.
