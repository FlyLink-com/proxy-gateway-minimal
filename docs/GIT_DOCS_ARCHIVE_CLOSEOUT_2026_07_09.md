# Git And Docs Archive Closeout - 2026-07-09

Last updated: 2026-07-09.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: git_docs_archive_closeout_2026_07_09
  superseded_by: null
  last_verified_at: 2026-07-09
  production_authority: false
```


> Status:
> - Type: Current Git/docs closeout index
> - Risk: C
> - Production impact: None
> - Execution authority: Does not authorize production, Vultr, DNS, Nginx,
>   systemd, firewall, SQLite, runtime config, deploy, rollback, credential,
>   token, subscription material, payment-provider, AppsFlyer live, or
>   customer-data actions.

## Purpose

This record supersedes the July 8 carrier-branch closeout queue as the current
Git hygiene and docs/archive index. It records that the July 8/9 focused PRs
were merged, stale carrier branches were not reused, local/remote branch residue
was cleaned, and the remaining work should start from a clean `master`.

The older records remain audit evidence:

- `docs/SOURCE_PRODUCTION_RECONCILIATION_2026_07_08.md`
- `docs/PR_CLOSEOUT_QUEUE_2026_07_08.md`

Do not treat those July 8 records as the current PR queue after this closeout.

The next-phase foundation freeze is recorded in
`docs/FOUNDATION_FREEZE_2026_07_09.md`. Treat it as the current process boundary
before opening new operating-lifecycle, AppsFlyer/attribution, versioning,
Admin/User Portal, or extension/plugin-boundary PRs.

## Current Git State Checked

- Local checkout: `D:\Projects\proxy-gateway-minimal`
- Branch: `master`
- Final cleanup baseline snapshot: `53eb5a10 chore(routes): clarify local proxy control surface`
- Local status: clean
- GitHub open PR count at closeout: `0`
- GitHub open issue count at closeout: `0`
- Remote heads: `master` only
- Active worktrees: main checkout only

This is a dated closeout snapshot, not an evergreen branch claim. Re-run the
Git and GitHub inventory before starting subsequent work.

The cleanup evidence is archived locally at:

```text
D:\Projects\proxy-gateway-minimal-artifacts\git-expiry-cleanup-20260709
```

## Focused PRs Merged After The July 8 Queue

| PR | Status | Scope |
| --- | --- | --- |
| #413 | Merged | Reveal active portal subscription links. |
| #414 | Merged | Preserve production portal static source baseline. |
| #415 | Merged | Observe subscription artifact binding without blocking refresh. |
| #416 | Merged | Expose redacted traffic collector startup status. |
| #417 | Merged | Auto-suspend over-quota traffic supply. |
| #418 | Merged | Reissue delivery generation on refresh. |
| #419 | Merged | Keep subscription URL stable on refresh. |
| #420 | Merged | Preserve traffic metering runtime endpoints. |
| #421 | Merged | Treat empty Xray stats as observable idle. |
| #422 | Merged | Record Xray idle observable deployment note. |
| #423 | Merged | Close out traffic metering debt status. |
| #424 | Merged | Record July 9 production deployments. |
| #425 | Merged | Protect subscription refresh and credential fetches. |
| #426 | Merged | Tighten GCC WebOS company-site mobile copy/layout. |
| #432 | Merged | Isolate the Portal preview fixture client from the real Portal route. |
| #433 | Merged | Retire Aliyun gate APIs from active Admin/server ownership. |
| #434 | Merged | Retire Aliyun runtime defaults and archive historical templates. |
| #435 | Merged | Clarify and gate the local proxy-control compatibility surface. |

## Archived Or Removed Git Residue

- Closed carrier PRs remain historical only:
  - #364 `codex/admin-figma-mirror-visual-qa`
  - #381 `codex/traffic-usage-closeout-master-20260708`
- Deleted remote merged residue:
  - `codex/portal-reveal-subscription-hotfix-20260708`
  - `codex/xray-empty-stats-observable`
- Deleted local stale backup branches after confirming content was represented
  on `master`:
  - `backup/stable-subscription-url-refresh-pre-rebase`
  - `backup/traffic-usage-admin-status-20260708-pre-rebase`
- Removed clean detached historical worktrees after confirming they were not
  dirty and could be reconstructed by commit:
  - portal static baseline worktrees
  - PR377 check worktree

## Current Follow-Up Queue

Start all follow-up work from latest `master`; do not reopen or merge stale
carrier branches. The Git/archive cleanup phase is complete through PR #435;
the items below are next-phase product lanes, not unresolved closeout blockers.

1. **Admin UI shell and visual QA**
   - Risk: B
   - Scope: focused Admin navigation, rendered shell, visual QA, and tests.
   - Exclude: payment, production auth exposure, runtime mutation, docs archive
     deletion.
2. **User Portal UX**
   - Risk: B
   - Scope: customer-facing portal flow improvements built on the current
     source baseline.
   - Exclude: production static replacement, DNS, Nginx, credentials, tokens,
     subscription material.
3. **Payment/Niuniu adapter**
   - Risk: B for repo-only source/tests; A for live provider activation.
4. **Admin protected auth**
   - Risk: B for local source/tests; A for any public/prod auth boundary.
5. **Docs/archive reconciliation**
   - Risk: C
   - Scope: keep current entrypoints compact and index historical material.
   - Exclude: bulk deletion of production execution records or claims that
     archived records describe current live state.

## Validation

For this C-tier docs closeout:

```powershell
git diff --check origin/master...HEAD
npm run project-state:check
```

No production validation or live endpoint checks are required for this record.
