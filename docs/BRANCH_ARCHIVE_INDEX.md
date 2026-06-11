# Branch Archive Index

Last checked: 2026-06-11, America/Los_Angeles.

> Status:
> - Type: GitHub branch / PR archive index
> - Risk: C
> - Execution authority: Inventory and documentation only
> - Production impact: None
> - Source of truth for: Which GitHub branches are active, pending decision, or
>   archive candidates at the time of this inventory

This document records the current GitHub branch posture so old branches and
stale pull requests do not compete with the active source path. It does not
delete branches, close pull requests, merge code, deploy artifacts, or authorize
production work.

## Current Baseline

| Item | Current value |
| --- | --- |
| Repository | `gaoyi1020-web/proxy-gateway-minimal` |
| GitHub repository archived | No |
| Default branch | `master` |
| Current active service-lane PR | `#299` from `feat/install-config-wizard` into `master` |
| Current edge-agent PR | `#300` from `codex/edge-agent-production-activation` into `feat/install-config-wizard` |
| Branches merged into `origin/master` | `origin/master` only |
| Branches not merged into `origin/master` | 12 remote branches |

## Active Branch Chain

These branches are still part of the current active work path and must not be
deleted or archived until their PRs are resolved.

| Branch | PR | Base | Posture | Decision |
| --- | --- | --- | --- | --- |
| `master` | N/A | N/A | GitHub default branch. | Keep. |
| `feat/install-config-wizard` | `#299` | `master` | Active service-lane closeout branch. | Keep until #299 is merged or explicitly replaced. |
| `codex/edge-agent-production-activation` | `#300` | `feat/install-config-wizard` | Active edge-agent pull/apply/receipt runtime and production-gate documentation branch. | Keep until #300 is merged into #299 or explicitly superseded. |

## Open PRs Requiring Decision

These branches have open pull requests. They are not automatically safe to
delete. Each needs an explicit merge, close, rebase, or archive decision.

| PR | Branch | Base | Draft | Updated | Suggested posture |
| --- | --- | --- | --- | --- | --- |
| `#298` | `cloudflare/workers-autoconfig` | `master` | No | 2026-06-08 | Review separately. Cloudflare static-site work may be useful, but it is not part of the current edge-agent chain. |
| `#297` | `docs/aws-prod-candidate-private-validation` | `master` | Yes | 2026-06-02 | Archive candidate after extracting any durable AWS staging facts into the active records. |
| `#294` | `codex/gccgw-install-flow-hardening` | `master` | Yes | 2026-06-03 | Review for reusable installer hardening before archive. |
| `#291` | `docs/plan-subscription-factory-boundary` | `master` | Yes | 2026-05-31 | Archive candidate if superseded by current single-control-plane and edge-agent docs. |
| `#290` | `codex/user-portal-ui-boundary-cleanup` | `master` | Yes | 2026-05-31 | Archive or rebase only if user-portal UI cleanup is still needed after current portal work. |
| `#289` | `codex/user-portal-subscription-refresh` | `master` | Yes | 2026-05-31 | Archive candidate if superseded by current order/refresh lifecycle work. |
| `#276` | `codex/aliyun-production-upgrade-package` | `master` | Yes | 2026-05-29 | Historical Aliyun package candidate. Archive unless a fresh Risk A Aliyun gate reactivates it. |
| `#272` | `docs/project-context-slimming` | `master` | Yes | 2026-05-29 | Archive candidate if its useful context has already been incorporated into current docs. |

## Remote Branches Without Open PRs

These branches are not merged into `origin/master` and have no currently open
pull request in the latest GitHub inventory. They are stronger archive/delete
candidates, but still require a final diff review before deletion.

| Branch | Suggested posture | Required check before deletion |
| --- | --- | --- |
| `codex/user-portal-aliyun-rc` | Archive candidate. | Confirm no unique user-portal production facts remain outside current Vultr/SGP records. |
| `docs/edge-network-routing-optimization` | Archive candidate. | Confirm any durable routing lessons are represented in current network/channel docs. |

## Cleanup Rules

1. Merge or close active PRs before deleting their source branches.
2. Do not delete `feat/install-config-wizard` until `#299` is merged, closed, or
   explicitly superseded.
3. Do not delete `codex/edge-agent-production-activation` until `#300` is merged,
   closed, or explicitly superseded.
4. Before deleting any non-active branch, compare its diff against the active
   docs and code path and record the decision in this index or a replacement
   archive record.
5. Do not copy secrets, tokens, subscription URLs, account credentials, private
   keys, SQLite rows, raw env files, or raw runtime logs into archive records.
6. Remote branch deletion requires a separate explicit operator approval.

## Recommended Next Gate

After `#300` is reviewed:

1. Merge `#300` into `feat/install-config-wizard` if it remains the accepted
   edge-agent implementation.
2. Re-run the PR validation on `#299`.
3. Decide whether `#299` becomes the current `master` update.
4. Return to this index and close or delete stale PR branches that are no longer
   part of the active source path.
