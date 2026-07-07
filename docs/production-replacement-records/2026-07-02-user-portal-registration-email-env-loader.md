# User Portal Registration Email Env Loader

- Date: 2026-07-02
- Risk: A
- Target: `vul1/gccgw-vultr-candidate`
- Scope: Add a protected User Portal registration email environment loader only.
- Runtime behavior change: None. No service restart was performed and no mail
  provider secret was written.

## Change

Created the protected environment file path:

- `/opt/proxy-gateway-minimal-candidate/protected/user-portal-email/user-portal-email.env`

Created the systemd drop-in:

- `/etc/systemd/system/proxy-gateway-candidate.service.d/97-user-portal-email.conf`

The drop-in references the protected env file with an optional
`EnvironmentFile=` entry. The env file contains comments only and does not
contain provider credentials.

## Validation

- Backup directory created:
  `/opt/proxy-gateway-minimal-candidate/backups/user-portal-email-env-loader-20260702T094104Z`
- Protected env file present with mode `600`, owner `root`, group `root`.
- Systemd drop-in present with mode `644`, owner `root`, group `root`.
- Drop-in references the protected email env file.
- `systemctl daemon-reload` completed.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

## Remaining Gate

Live registration email sending is still not enabled until an operator writes
all required values on the target host and restarts the service:

- `USER_PORTAL_REGISTRATION_EMAIL_PROVIDER=resend`
- `USER_PORTAL_REGISTRATION_EMAIL_FROM`
- `RESEND_API_KEY`

Optional:

- `USER_PORTAL_REGISTRATION_EMAIL_REPLY_TO`
- `USER_PORTAL_REGISTRATION_EMAIL_USER_AGENT`

Secrets must be written only on the target host or through an approved protected
secret channel. They must not be pasted into chat, docs, commits, logs, or
terminal output.
