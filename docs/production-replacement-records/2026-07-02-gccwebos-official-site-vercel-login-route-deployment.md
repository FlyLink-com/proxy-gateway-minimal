# GCC WebOS Official Site Vercel Login Route Deployment

Date: 2026-07-02

Risk: A

## Approval

Approved scope:

- Deploy official website only through Vercel production for `gccwebos.com`.
- Use reviewed worktree and frozen artifact `gccwebos-site-20260702-001`.
- Do not replace `portal.gccwebos.com` static contents.
- Do not change Admin routes, backend overlay, Nginx, systemd, DNS, firewall,
  or environment variables.
- Do not output tokens, credentials, subscription material, or customer data.

Artifact:

- Label: `gccwebos-site-20260702-001`
- Archive: `.codex-artifacts/gccwebos-site-20260702-001/gccwebos-site-20260702-001.zip`
- SHA-256: `728CDB8E90CAFA3B9DFB8EA4C2F42F86D6B75A43BEA3C8E6473F40C01EB7D253`

## Deployment

Command:

```powershell
vercel deploy --prod --yes --scope gccltd
```

Result:

- Deployment id: `dpl_CMjLSKuqh2DdpMwpv7a7T6KoiDZp`
- Deployment URL: `https://proxy-gateway-minimal-p9805vv8j-gccltd.vercel.app`
- Target: production
- Ready state: `READY`
- Aliases included `https://gccwebos.com` and `https://www.gccwebos.com`.

## Validation

Local pre-deploy validation:

- `npm run admin:test -- src/test/company-site.test.tsx` passed, 9 tests.
- `npm run admin:site:build` passed.
- `npm run admin:site:verify` passed.
- `git diff --check origin/master...HEAD` passed.
- Artifact SHA-256 matched the approved value.

Post-deploy validation:

- `https://gccwebos.com/?deploy=gccwebos-site-20260702-001` served a new site
  bundle.
- Live site bundle contained `https://portal.gccwebos.com/`.
- Live site bundle no longer contained default relative `/portal/` or
  `/portal/register/` entry targets.
- Browser click on the official-site login link navigated to
  `https://portal.gccwebos.com/`.
- The destination page title was `GlobalCircle AI - 用户面板`.
- The destination page displayed the existing account login panel.
- Browser console check reported no warnings or errors for the tested flow.
- `https://portal.gccwebos.com/` still served the previous user panel bundle
  `index-BIzKjn5V.js`.
- The previously mistaken portal bundle `index-DpzsR7GC.js` was not referenced.
- Public `/api/admin` returned `404` on `gccwebos.com` and
  `portal.gccwebos.com`.

## Residual Notes

- Vercel build output reported `npm audit` findings: 1 low and 2 high. This was
  not changed by this route deployment and should be handled in a separate
  dependency-audit task.

## Rollback

Rollback path:

```powershell
vercel rollback --scope gccltd
```

Rollback target should be the previous production deployment for
`proxy-gateway-minimal` before `dpl_CMjLSKuqh2DdpMwpv7a7T6KoiDZp`.

Rollback validation:

- `https://gccwebos.com` serves the previous production deployment.
- `https://portal.gccwebos.com/` remains unchanged.
- Public `/api/admin` remains blocked or `404` on public hosts.
