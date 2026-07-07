# GCC WebOS Official Site Register Route Deployment

Date: 2026-07-02

Risk: A

## Approval

Approved scope:

- Deploy official website only through Vercel production for `gccwebos.com`.
- Use reviewed worktree and frozen artifact `gccwebos-site-20260702-002`.
- Update public Register and trial links to
  `https://portal.gccwebos.com/portal/register/`.
- Keep Login links at `https://portal.gccwebos.com/`.
- Do not replace `portal.gccwebos.com` static contents.
- Do not change Admin routes, backend overlay, Nginx, systemd, DNS, firewall,
  or environment variables.
- Do not output tokens, credentials, subscription material, or customer data.

Artifact:

- Label: `gccwebos-site-20260702-002`
- Archive:
  `.codex-artifacts/gccwebos-site-20260702-002/gccwebos-site-20260702-002.zip`
- SHA-256:
  `09C4C67D610B7108F6D5DC794E296B299F1E96EE35B290F24D4BDE415071A3B5`

## Deployment

Command:

```powershell
vercel deploy --prod --yes --scope gccltd
```

Result:

- Deployment id: `dpl_ARgiicaRyDrf9gU6c4EMj6MjEgFr`
- Deployment URL:
  `https://proxy-gateway-minimal-p5l3du8jp-gccltd.vercel.app`
- Target: production
- Ready state: `READY`
- Alias included `https://gccwebos.com`.

## Validation

Local pre-deploy validation:

- Artifact SHA-256 matched the approved value.
- `vercel.json` builds and publishes only `admin/dist-site`.
- `npm run admin:test -- src/test/company-site.test.tsx` passed, 9 tests.
- `npm run admin:site:build` passed.
- `npm run admin:site:verify` passed.
- `git diff --check origin/master...HEAD` passed.
- Local build bundle contained
  `https://portal.gccwebos.com/portal/register/`.

Post-deploy validation:

- `https://gccwebos.com/?deploy=gccwebos-site-20260702-002` served the new
  site bundle.
- Live bundle contained `https://portal.gccwebos.com/portal/register/`.
- Live bundle contained the login root `https://portal.gccwebos.com/`.
- Browser snapshot showed top Register and trial links target
  `https://portal.gccwebos.com/portal/register/`.
- Browser click on Register navigated to
  `https://portal.gccwebos.com/portal/register/`.
- Register destination title was `GCC WebOS - 用户注册`.
- Browser click on Login navigated to `https://portal.gccwebos.com/`.
- Login destination title was `GCC WebOS - 账号登录`.
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
`proxy-gateway-minimal` before `dpl_ARgiicaRyDrf9gU6c4EMj6MjEgFr`.

Rollback validation:

- `https://gccwebos.com` serves the previous production deployment.
- `https://portal.gccwebos.com/` remains unchanged.
- Public `/api/admin` remains blocked or `404` on public hosts.
