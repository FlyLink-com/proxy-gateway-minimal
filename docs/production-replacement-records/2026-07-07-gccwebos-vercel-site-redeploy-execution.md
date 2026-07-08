# gccwebos.com Vercel Site Redeploy Execution - 2026-07-07

## Scope

- Change ID: `gccwebos-vercel-site-redeploy-20260707`
- Target: Vercel `gccltd/proxy-gateway-minimal`
- Goal: redeploy the public GCC WebOS site so `gccwebos.com` and `www.gccwebos.com` return the public site instead of the Operator Console fixture.

## Approval

Operator approved production redeploy with these limits:

- Run `npm run admin:site:build` and `npm run admin:site:verify` first.
- Confirm `admin/dist-site` is the GCC WebOS public site and does not contain `Operator Console`.
- Keep existing `gccwebos.com` and `www.gccwebos.com` domain bindings.
- Do not change DNS, Vultr, Nginx, backend, systemd, Xray, or SQLite schema.
- Roll back by promoting the previous Vercel production deployment if needed.

## Preflight

- `npm run admin:site:build`: passed.
- `npm run admin:site:verify`: passed.
- `admin/dist-site/index.html` title: `GCC WebOS - VPN 安全接入与登录开通`.
- `admin/dist-site/index.html` check: contains `GCC WebOS`; does not contain `Operator Console`.

Note: Vercel build output reported npm audit warnings during dependency install. This redeploy did not change dependency versions.

## Deployment

- Command: `vercel deploy --prod -y --scope gccltd`
- Result: deployment ready.
- Deployment ID: `dpl_B9WScGcAtBKv4mPobmBejhknhGfB`
- Production deployment URL: `https://proxy-gateway-minimal-g50ayjv7v-gccltd.vercel.app`
- Previous production rollback point observed before redeploy: `dpl_4P87WyCBnS8j6Bov58yJx15TTjcS`

## Post-deploy Validation

Validation used cache-busted requests with no-cache request headers.

| URL | Status | Title | Contains `GCC WebOS` | Contains `Operator Console` |
| --- | ---: | --- | --- | --- |
| `https://gccwebos.com/` | 200 | `GCC WebOS - VPN 安全接入与登录开通` | yes | no |
| `https://www.gccwebos.com/` | 200 | `GCC WebOS - VPN 安全接入与登录开通` | yes | no |

## Follow-up Observation

After the manual production deployment, Vercel created a newer production deployment from GitHub `master` commit `68d9712`:

- Overwriting deployment ID: `dpl_CD4Fzh5xWWbKoPwonizdwKz82ZJ3`
- Deployment URL: `https://proxy-gateway-minimal-n5tmij8mp-gccltd.vercel.app`
- Build source: GitHub `master`
- Build command observed in Vercel logs: `VITE_ADMIN_FIXTURE_PREVIEW=true npm run admin:build`
- Output directory observed in Vercel deployment config: `admin/dist`
- Public result after overwrite: `gccwebos.com` and `www.gccwebos.com` returned `GlobalCircle AI - Operator Console`.

The manual deployment `dpl_B9WScGcAtBKv4mPobmBejhknhGfB` built the intended public site with `npm run admin:site:build && npm run admin:site:verify` and `admin/dist-site`, but it is no longer the current production alias target.

## Non-goals Confirmed

- DNS was not changed.
- Vultr and Nginx were not changed as part of this Vercel redeploy.
- Backend, systemd, Xray, and SQLite schema were not changed.
- No subscription links, tokens, credentials, raw env files, raw configs, or customer data were printed or recorded.

## Rollback

If rollback is required, promote the previous Vercel production deployment `dpl_4P87WyCBnS8j6Bov58yJx15TTjcS` for `gccltd/proxy-gateway-minimal`, then repeat the same public title checks for both apex and `www`.
