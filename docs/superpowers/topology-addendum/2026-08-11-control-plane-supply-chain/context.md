# Control-Plane Supply-Chain Topology Addendum: Evidence Context

> Status:
> - Type: Derived design-review evidence inventory
> - Risk: A
> - Process: Read-only evidence -> design options -> operator selection -> later explicit implementation approval
> - Expected PR count: One docs-only addendum Draft now; future PR count remains part of the decision
> - Validation: Evidence hashes, document authority, project-state check, JSON parse, Mermaid source review, and diff check
> - Production/AWS impact: None
> - Production authority: False
> - Execution authority: None
> - Target revision: `9033f67f76573f9c5bccd17c3762a1608f1c4b9c`
> - Evidence collection SHA-256: `7d04a3e95d8d745fed8f4c86cf5045d85ac6429aefcd129b7023fded743e8eb1`

This directory is a derived and revisable design product. It does not amend the
canonical production-deploy design, approve a dependency or package, modify a
GitHub setting, authorize PR #600 to leave Draft, publish an artifact, dispatch
a workflow, or authorize staging or production access.

## Local Analysis Context

- Active repository: `D:\Projects\proxy-gateway-minimal`
- Isolated analysis worktree:
  `D:\Projects\proxy-gateway-minimal\.worktrees\control-plane-topology-addendum`
- Analysis branch: `docs/control-plane-topology-addendum`
- Source drift at capture: none between local `origin/master` and remote
  `refs/heads/master`
- Capture time: `2026-08-11T00:17:57-07:00`
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
| `E10` | Live PR #600 summary | Redacted compact JSON; `aa693a2c9c51182f1cc24195184cc299ad88bf5a4340baa829c49abe63188b9a` | PR #600 is open, Draft, behind current master, and cannot satisfy the missing owner topology by itself. |
| `E11` | Cross-document authority-cycle diagnosis | Derived from `E01`–`E04`; no separate source artifact | Promoting diagnostics or placing the owner inside its own lock/closure would violate the single-owner and independent-bootstrap invariants. |

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

## Evidence Hash Profile And Collection Manifest

Repository text evidence `E01`–`E08` uses profile `repo_text_lf`: decode the
tracked blob as UTF-8, normalize CRLF to LF, retain the final LF, then SHA-256
the resulting bytes. Redacted live evidence `E09`–`E10` uses profile
`redacted_json_compact`: SHA-256 the exact one-line UTF-8 JSON bytes below,
without a trailing LF. Keys appear in the fixed order shown; no identity,
credential, URL, run ID, or reviewer login is retained.

`E09` canonical redacted bytes:

```json
{"can_admins_bypass":true,"custom_branch_policies":false,"environment":"vultr-japan-production","prevent_self_review":true,"protected_branches":true,"reviewer_count":1,"reviewer_types":["User"],"ruleset":"master-governance-single-owner","ruleset_bypass_actor_count":0,"ruleset_enforcement":"active","ruleset_required_approvals":0,"ruleset_required_review_thread_resolution":false,"ruleset_required_status_checks":["Validate"]}
```

`E10` canonical redacted bytes:

```json
{"base_ref_oid":"f28d15d756e495bb18a7e7552e56f8bda6b267e5","deployment_count":0,"file_count":11,"head_ref_oid":"371e1a671e606f5ac14df5bbea99bc62a08cf08c","is_draft":true,"merge_state_status":"BEHIND","number":600,"review_decision":"","state":"OPEN","unresolved_bot_review_thread_count":1,"validate_conclusion":"FAILURE"}
```

The collection digest is SHA-256 of the exact one-line UTF-8 JSON array below,
without a trailing LF. Entries are sorted by `evidenceId`; object key order is
fixed as shown. `E11` is a derived inference and is deliberately not a source
artifact in this ten-item collection.

```json
[{"evidenceId":"E01","hashProfile":"repo_text_lf","label":"docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md","sha256":"77547423d469bc8777a0fa98188292bdd37454c13d454dc586149eb4325cc262"},{"evidenceId":"E02","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-production-deploy-implementation-program.md","sha256":"a110ebbd5d0430d0f20fe789e95548426019e94dad69e01abf089fc36378a9a6"},{"evidenceId":"E03","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md","sha256":"1c3e5101776a7e91df548c0d38ca50d49adc536d4391fa2cd3b52a04ab89565d"},{"evidenceId":"E04","hashProfile":"repo_text_lf","label":"docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md","sha256":"d2c7cc78b7c6cadd7d8221f417e0152111d4a18cabaf8f5d24d8ad3232b34286"},{"evidenceId":"E05","hashProfile":"repo_text_lf","label":".github/workflows/production-deploy-dry-run.yml","sha256":"51394f59f4ba9bba10815299a70874322fff59d30002769ce06662332ece0b9b"},{"evidenceId":"E06","hashProfile":"repo_text_lf","label":".github/workflows/release-artifact.yml","sha256":"5cc83158c486682b7c175c14efbab6b704d56db7fbbbf4b66995ad1b6f06a202"},{"evidenceId":"E07","hashProfile":"repo_text_lf","label":".github/workflows/japan-runtime-config-additive-repair.yml","sha256":"42b01083e5eab95f8797e6c2cce04bc61714a5fbad76b6cab21f7d27819a6ff7"},{"evidenceId":"E08","hashProfile":"repo_text_lf","label":"AGENTS.md","sha256":"430ddf51a3cf61d1e0123938231f24b1f42f17c0284406a187b8a4c869f0b56e"},{"evidenceId":"E09","hashProfile":"redacted_json_compact","label":"live-environment-ruleset-summary","sha256":"ec0982fe564eadeddc6f7367d76fe2621f11dd004f4b5bbdccf20b9c45cfd432"},{"evidenceId":"E10","hashProfile":"redacted_json_compact","label":"live-pr-600-summary","sha256":"aa693a2c9c51182f1cc24195184cc299ad88bf5a4340baa829c49abe63188b9a"}]
```

## Evidence Limitations

- No external Sigstore dependency, package version, executable digest, trust
  root set, CT log key set, API, or repository path is approved by this Draft.
- No performance or memory benchmarks were run. Resource effects in the
  proposal are source-derived or hypothetical and include a measurement plan.
- No workflow was dispatched. No source implementation, Release asset, lock,
  npm closure, Environment, secret, host, database, or production state was
  created or modified.
- The existing diagnostic verifiers are deliberately non-authoritative. Their
  current fixed failure is evidence of a safe stop, not evidence that complete
  Sigstore verification works.
- Live GitHub configuration can drift. Reviewers must refresh `E09` before any
  future Settings, publication, staging, or production decision.
