# Data-pack manual-equivalent verification

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: data_pack_manual_equivalent_verification
  superseded_by: null
  last_verified_at: 2026-10-10
  production_authority: false
```

Risk: B source validation only. This checklist replaces hosted CI while the
monthly GitHub Actions quota is exhausted (see `docs/CI_MANUAL_VALIDATION.md`).
It is not staging, not a Production Gate, and does not approve a merge, Ready
transition, deployment, migration, catalog publication, or any real-protocol
run. #753 and mobile #13 stay Draft.

## Local checks that stand in for CI (no authorization needed)

Run one build/test process at a time, in a clean worktree of the exact PR head,
with dependencies installed by `npm ci` under the Node release used for the run.

1. `git fetch origin`; confirm the worktree is clean and `git diff --check origin/master...HEAD` is empty.
2. `npm ci`, then `npm test`. Record total/pass/fail/skip. On Windows the same
   11 unrelated LF/CRLF, POSIX-path and PATH-casing failures also occur on
   `origin/master`; compare failing test names against a master worktree and
   treat only names that are absent from master as regressions.
3. `npm ci --prefix admin`, `npm run admin:test`, `npm run admin:build`.
4. `npm run docs:authority:check`, `npm run governance:check`, `npm run frontend:boundaries:check`.
5. Any commit pushed while the quota is exhausted carries `[skip ci]`. Do not
   record a skipped hosted check as a pass; record the local results above.
6. Re-run only the affected suites after a later change; a new head needs a new record.

## Still requires Ethan's explicit single-use authorization

None of these may be started, retried or reinterpreted from this document.

- Real Hysteria2, Xray and TUIC protocol acceptance, each protocol separately,
  per `docs/DATA_PACK_WSL_ACCEPTANCE.md` (fresh Risk A read-only inventory,
  then an exact execution gate bound to the PR head and binary digests).
- Upgrade and rollback drill with a verified backup of the control database
  and runtime state, including the stated rollback target.
- Collector update on any real host (full-metering collector, pack-reset
  continuation mode and its journal), and any production metering
  initialization or continuation approval.
- Production migration of the data-pack schema, catalog publication of the
  candidate offers, Nginx or other exposure changes, merge, Ready, deploy.