# gccwebos.com Vercel Master Site Entry Fix Execution - 2026-07-07


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: gccwebos_vercel_master_site_entry_fix_execution
  superseded_by: null
  last_verified_at: 2026-07-07
  production_authority: false
```


## Scope

- Change ID: `gccwebos-vercel-master-site-entry-fix-20260707`
- Target: GitHub/Vercel `gccltd/proxy-gateway-minimal`
- Goal: make `master` build and deploy the GCC WebOS public site instead of the Admin Operator Console fixture.

## Approval

Operator approved:

- Push local hotfix branch `codex/gccwebos-vercel-site-entry-fix-20260707` at commit `5bc5f52`.
- Merge it into `master` so Vercel production auto-deploys.
- Keep `gccwebos.com` and `www.gccwebos.com` domain bindings unchanged.
- Do not change DNS, Vultr, Nginx, backend, systemd, Xray, or SQLite schema.
- Validate both public domains return the GCC WebOS public site title and do not contain `Operator Console` or `GlobalCircle AI`.
- If validation fails, roll back by promoting previous production deployment `dpl_CD4Fzh5xWWbKoPwonizdwKz82ZJ3`.

## Root Cause

`master` contained a Vercel config introduced by `05cd065e` that built the Admin fixture preview:

- Build command: `VITE_ADMIN_FIXTURE_PREVIEW=true npm run admin:build`
- Output directory: `admin/dist`

That made later `master` and preview deployments publish the Operator Console bundle to the public Vercel aliases.

## Local Validation Before Merge

Hotfix worktree:

- `D:\Projects\proxy-gateway-minimal-worktrees\gccwebos-vercel-site-entry-fix-20260707`

Validation:

- `npm run admin:site:build`: passed.
- `npm run admin:site:verify`: passed.
- Built title: `GCC WebOS - VPN 安全接入与登录开通`.
- Built public site assets did not contain `Operator Console` or `GlobalCircle AI`.
- `npm run admin:test -- company-site.test.tsx`: 9 passed.
- `npm run admin:test`: 26 files / 240 tests passed.
- `npm run admin:build`: passed.
- `git diff --check`: passed with LF/CRLF warnings only.

## GitHub Execution

- Branch pushed: `codex/gccwebos-vercel-site-entry-fix-20260707`
- Commit pushed: `5bc5f5298cd6c0deb7898adebceba9c507a4a667`
- PR: `https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/374`
- PR checks before merge:
  - GitHub `Validate`: passed.
  - Vercel: passed.
  - Vercel Preview Comments: passed.
  - Cloudflare Workers Builds: passed.
- Merge commit on `master`: `c9c0e7b75e16f25c965c18a5e0224c0faf1f5f0b`

## Vercel Production Result

- New production deployment ID: `dpl_BqYnnCf5spJ6BXv9kSUm65A9qo3G`
- New deployment URL: `https://proxy-gateway-minimal-2h0srfsnw-gccltd.vercel.app`
- Vercel production config after merge:
  - Install command: `npm ci --prefix admin`
  - Build command: `npm run admin:site:build && npm run admin:site:verify`
  - Output directory: `admin/dist-site`

## Public Validation

Validation used cache-busted public requests with no-cache request headers.

| URL | Status | Title | Contains `GCC WebOS` | Contains `Operator Console` | Contains `GlobalCircle AI` |
| --- | ---: | --- | --- | --- | --- |
| `https://gccwebos.com/` | 200 | `GCC WebOS - VPN 安全接入与登录开通` | yes | no | no |
| `https://www.gccwebos.com/` | 200 | `GCC WebOS - VPN 安全接入与登录开通` | yes | no | no |

## Non-goals Confirmed

- DNS was not changed.
- Vultr and Nginx were not changed.
- Backend, systemd, Xray, and SQLite schema were not changed.
- Existing `gccwebos.com` and `www.gccwebos.com` Vercel aliases were kept.
- No subscription links, tokens, credentials, raw env files, raw configs, SQLite rows, or customer data were printed or recorded.

## Rollback

If a rollback is required, promote previous production deployment `dpl_CD4Fzh5xWWbKoPwonizdwKz82ZJ3`, then repeat public validation for `gccwebos.com` and `www.gccwebos.com`.
