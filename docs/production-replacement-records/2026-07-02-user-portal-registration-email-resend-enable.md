# User Portal Registration Email Resend Enablement

- Date: 2026-07-02
- Risk: A
- Target: `vul1/gccgw-vultr-candidate`
- Scope: Enable User Portal registration email verification through the
  protected Resend adapter environment.
- Secret handling: The Resend API key was read from a local one-time handoff
  file, written only to the protected server env file, not printed, not written
  to docs, and the local source file was removed after successful activation.

## Change

Updated:

- `/opt/proxy-gateway-minimal-candidate/protected/user-portal-email/user-portal-email.env`

Runtime env now has:

- `USER_PORTAL_REGISTRATION_EMAIL_PROVIDER` set
- `USER_PORTAL_REGISTRATION_EMAIL_FROM` set
- `USER_PORTAL_REGISTRATION_EMAIL_USER_AGENT` set
- `RESEND_API_KEY` set

`USER_PORTAL_REGISTRATION_EMAIL_REPLY_TO` remains unset.

The configured sender follows the repository test convention:

- `GCC WebOS <verify@mail.gccwebos.com>`

If the Resend verified sender/domain differs, update only
`USER_PORTAL_REGISTRATION_EMAIL_FROM` in the protected env file and restart the
service.

## Validation

- Backup directory created:
  `/opt/proxy-gateway-minimal-candidate/backups/user-portal-email-env-enable-20260702T095816Z`
- Protected env file present with mode `600`, owner `root`, group `root`.
- `systemctl daemon-reload` completed.
- `proxy-gateway-candidate.service` restarted and active.
- Runtime env presence check reported the required email variables as set.
- `nginx` active.
- `nginx -t` passed.
- `https://portal.gccwebos.com/` returned `200`.
- `https://portal.gccwebos.com/portal/register/` returned `200`.
- Empty registration email verification probe returned business validation
  `400`.
- Public `/api/admin` remained `404` on `portal.gccwebos.com` and
  `gccwebos.com`.
- `git diff --check origin/master...HEAD` passed.

## Remaining Manual Smoke

An operator should use the registration page to request a verification email.
This is the first real external-send smoke test and will confirm both Resend key
validity and sender-domain approval.
