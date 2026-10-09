# CI Status And Run Log

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: ci_status_and_run_log
  superseded_by: null
  last_verified_at: 2026-10-09
  production_authority: false
```

Risk: C. This is a dated, manually maintained evidence index, not a workflow,
live dashboard, merge waiver or production gate. It does not trigger CI, start
a validation host, change quotas/settings, or schedule execution.

Use [Validation Baseline](VALIDATION_BASELINE.md) for required local checks,
[Manual CI Validation](CI_MANUAL_VALIDATION.md) for separately scoped fallback
host procedures, and [Current Release State](CURRENT_RELEASE_STATE.md) for
source/deployment evidence. Older quota statements in historical runbooks do
not supersede the dated observation below.

## Current availability — 2026-10-09 UTC

- The operator confirmed that this month's GitHub Actions CI allowance is
  exhausted. This is an **operator-reported cause**, not an independently
  verified billing/API diagnosis; no billing or spending settings were read
  or changed for this record.
- #763's merge checks completed successfully earlier on the same day. #765's
  subsequent automatically created checks failed before any job steps were
  available. These facts are compatible and must retain their separate times
  and commits.
- During October 2026, do not manually dispatch or rerun hosted CI for this
  task. Keep local validation separate. Draft/Ready CI-policy changes are
  tracked separately and are not claimed implemented by this document.
- Existing workflow configuration may still automatically create runs on a
  documentation push. Observe those runs without retrying; their presence is
  not evidence of a manual dispatch or of a restored allowance.
- No current hosted pass is inferred for a later head from either a historical
  success or a successful local check.

## Pending manual master check — November 2026

Status: `not_run`. No run ID, execution date or exact source SHA exists yet.
This is a manual follow-up, not an automation or a scheduled dispatch.

1. In November, first re-read hosted availability and the repository's then
   current workflow and validation policy; a new month alone is not proof that
   the account can run CI.
2. Resolve the then-current remote `master` to its full SHA. Do **not** reuse
   `521bb535...`, the documentation PR head, or an old run's "Re-run" button as
   a substitute for the latest master validation requested here.
3. Manually run the applicable `CI` workflow on `master` only after confirming
   its actual scope. This item does not authorize deployment/artifact-ingress
   workflows, production access, quota increases or paid upgrades.
4. Bind the returned workflow run to its actual `head_sha`, event and UTC
   timestamps. If master moved between selection and dispatch, report the
   mismatch rather than claiming the intended SHA was tested or silently
   starting another run.
5. Record all terminal job results and available safe log evidence. Keep
   skipped, cancelled and unexecuted stages explicit. Do not close this item
   until the intended master validation has a recorded result; failures or
   access/allowance blockers remain open with their next decision.

## Result vocabulary

Preserve GitHub's raw `status` and `conclusion`, plus the actual execution
boundary. For local checks, record the command, environment and exit/result.

| Recorded result | Meaning |
| --- | --- |
| `queued` / `in_progress` | Pending or running; no terminal validation result yet. |
| `completed / success` | That workflow/check succeeded for its exact SHA and scope; skipped steps still stay skipped. |
| `completed / failure` | Reported failure. Distinguish executed test failures from a job that never started; missing logs do not identify the cause. |
| `completed / cancelled` | Cancelled, not passed; retain any earlier completed stages without treating the whole run as accepted. |
| `completed / skipped` | The check/job was intentionally or conditionally skipped; no execution evidence. |
| `not_run` | No execution was performed or no run was created for the planned work; not a fabricated GitHub conclusion. |
| Other raw conclusions | Preserve values such as `timed_out`, `action_required` or `neutral`; do not silently normalize them to success. |

## Recorded runs

This bounded log starts with the verified #763/#765 evidence. It is not a
backfill of every historical run. Times in hosted tables are GitHub
`created_at` to `updated_at` UTC, not inferred test-execution durations.

### #763 merged source — hosted, 2026-10-09

Branch: `master`. Exact SHA:
`521bb535d0d385d533734b020cf96a533f6ed729`. Event: `push`.
Evidence: [PR #763](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/763).

| Workflow and evidence | UTC interval | Raw status / conclusion |
| --- | --- | --- |
| [CI 37897623213](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37897623213) | 07:11:37Z–07:19:13Z | completed / success |
| [Dependency Artifact 37897623191](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37897623191) | 07:11:37Z–07:12:16Z | completed / success |
| [Release Artifact 37897623177](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37897623177) | 07:11:37Z–07:12:26Z | completed / success |
| [Cloudflare Site 37897623237](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37897623237) | 07:11:37Z–07:12:48Z | completed / success |

Exact-merge checks: nine `success`, two `skipped`. `Governance snapshot` and
`Deploy public site` were skipped. The CI/PR evidence records 5387 server tests,
1283 Admin tests and four frontend build/verify pairs passing. Admin lint was
outside that CI acceptance; eight disclosed baseline lint errors remain.
These are retained hosted results, not tests rerun by this documentation task.
Next: no repeat this month; no deployment or Dependabot closure inferred.

### #765 initial documentation head — local, 2026-10-09

Branch: `docs/source-release-alignment-20261009`. Exact published SHA:
`514038b4ba6ac4096df097918c57deaafd435460`. Event: local source validation,
recorded in [PR #765](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/765)
by 2026-10-09T07:34:28Z. No hosted workflow/run ID applies to this local entry.

- `npm run docs:authority:check`: success, 415 metadata blocks.
- `npm run docs:authority:strict`: success, 415 metadata blocks.
- Exact tree/range whitespace checks: success; four Markdown files only.
- Environment: Linux cloud workspace. Its source snapshot lacked one unrelated
  document PNG; this was not a full-checkout/archive validation. Exact diff
  used verified real commit/tree objects and changed text blobs. Remote tree
  readback confirmed the missing local PNG remained unchanged.
- Application tests, build and type checks: `not_run` for this C-tier change.
  Local document checks do not replace a hosted check or create a merge waiver.
- Next: keep Draft; later heads need their own applicable evidence.

### #765 initial documentation head — hosted, 2026-10-09

Branch and SHA: the same `514038b4...` head above. All four runs were created
at 2026-10-09T07:34:31Z and updated at 07:34:34Z automatically under the
then-existing configuration; no manual dispatch or rerun was performed.

| Workflow and evidence | Event | Raw status / conclusion |
| --- | --- | --- |
| [CI 37899804407](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37899804407) | pull_request | completed / failure |
| [Dependency Artifact 37899804513](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37899804513) | pull_request | completed / failure |
| [Governance Trusted Advisory 37899804427](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37899804427) | pull_request_target | completed / failure |
| [Foundation Inventory 37899804431](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37899804431) | pull_request | completed / failure |

Five failed checks had `steps: null`; the sixth, `Governance snapshot`, was
`skipped`. No compilation or test execution is established by these failures.
Validate job `113719445947` log retrieval returned `BlobNotFound`; the connector
could not read annotations. Do not invent a log, stack trace or test failure.
Reason: the operator subsequently confirmed the exhausted monthly allowance;
the available run/job API evidence independently proves only failure without
execution steps. Next: retain Draft, do not rerun this month, and use the
November latest-master manual follow-up above.

### #766 Draft CI-policy candidate — hosted, 2026-10-09

[PR #766](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/766)
remained Draft and unmerged at exact head
`143d03e00d5d58b7c2432405ea8d42dbffe242bd`. This candidate does not change
master's policy until separately reviewed and merged.

| Workflow and evidence | Event and UTC interval | Observed result |
| --- | --- | --- |
| [CI 37900689076](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37900689076) | pull_request, 07:43:47Z–07:43:51Z | completed / skipped; all eight jobs skipped, no steps |
| [Runtime certificate sync 37900688674](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37900688674) | pull_request, 07:43:47Z–07:43:55Z | completed / skipped; synthetic Linux job skipped, no steps |
| [Governance Trusted Advisory 37900688626](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/37900688626) | pull_request_target, 07:43:47Z–07:43:50Z | completed / failure; trusted advisory job has no steps |

The skipped checks establish no build/test pass. The advisory failure remains
visible rather than being folded into an "all skipped" result; its job-level
cause was not independently diagnosed. Next: keep Draft, no rerun this month;
the Ready/master path needs its own later authorized validation.

### Related repository Draft checks — 2026-10-09

Read-only cross-repository references, not changes to those repositories or
proof that their master policy has shipped. Both PRs were open Drafts when
read; their Ready-path hosted validation has not been established here.

| Repository / PR | Exact head | Run, event and UTC interval | Observed result |
| --- | --- | --- | --- |
| [gccltd/gccwebos-mobile #14](https://github.com/gccltd/gccwebos-mobile/pull/14) | `1363cd00c053e3d6cabc9b9905c0013865d7c14d` | [37899618163](https://github.com/gccltd/gccwebos-mobile/actions/runs/37899618163), pull_request, 07:32:35Z–07:32:36Z | completed / skipped; validate and build-candidate skipped, no steps |
| [gccltd/gccwebos-site #26](https://github.com/gccltd/gccwebos-site/pull/26) | `ad3ddba51d7034136ddf79ef668d5d89f12ba0fc` | [37899630106](https://github.com/gccltd/gccwebos-site/actions/runs/37899630106), pull_request, 07:32:42Z–07:32:43Z | completed / skipped; Test and build company site skipped, no steps |

These are actual skipped Actions jobs, not successful compilations. They do not
cover separate provider preview integrations. Next: retain the Draft boundary;
record any later authorized Ready/master validation separately.

## Append format and retention

Append a dated entry for meaningful new run results or a correction; do not
overwrite an old failure as success after a retry. Link corrections and later
attempts to the original. A documentation commit need not record itself, which
would create a self-referential update loop; use its PR's exact-head receipt
until a subsequent deliberate journal update.

```yaml
observed_at_utc: <ISO-8601 UTC observation time>
execution_started_at_utc: <ISO-8601 UTC or not_available>
execution_completed_at_utc: <ISO-8601 UTC or not_available>
environment: <hosted runner or local OS/runtime; no sensitive host details>
repository: <owner/name>
branch: <observed ref>
commit_sha: <full actual SHA or unresolved_for_future_not_run>
event: <push | pull_request | pull_request_target | workflow_dispatch | local>
workflow_or_command: <exact workflow name/path or local validation command>
run_id_and_attempt: <actual ID/attempt or not_applicable>
status: <raw hosted status or local execution state>
conclusion: <raw hosted conclusion or local exit/result; not_run if unexecuted>
execution_boundary: <ran | failed_before_steps | skipped | cancelled | not_run>
reason_and_source: <API/log fact, operator report, or explicitly unknown>
evidence: <PR/run/job/artifact links and safe aggregate results>
log_availability: <available | expired | missing | inaccessible | not_created>
next_step: <bounded follow-up, remaining blocker, or none>
```

Store only safe summaries and verified links. Never commit tokens, credentials,
raw environment/configuration, subscription URLs, customer data or unredacted
logs. A missing/expired log stays missing/expired; it is not a successful test.
