# User Portal Self-Registration Frontend Activation

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `user-portal-preview-20260702-001`

SHA-256: `A44A7900F2EA74D78EACDB5815B7A3646ABD178FA53C556A8B2240824B6BB809`

## Scope

Approved and executed:

- Verified the staged artifact SHA-256.
- Backed up current `/var/www/globalcircle-portal`.
- Replaced `/var/www/globalcircle-portal` static contents from staged
  `portal-dist` only.

No backend overlay change, Nginx config change, DNS change, firewall change,
env change, systemd change, service restart, token output, or customer data
dump was performed.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260702-001-var-www-globalcircle-portal-20260702T073022Z`

## Purpose

This activation publishes the existing User Portal login panel with the
self-service registration entry wired to `/portal/register/`.

The deployed static bundle includes:

- existing account/password login panel;
- login-page link to `/portal/register/`;
- `/portal/register` portal-only registration route;
- two-step registration UI: email verification request first, then registration
  submission with a fresh human verification challenge;
- safe visible-once setup handoff UI after registration;
- no Admin shell.

## Validation

- Local artifact SHA-256 matched the approved value before activation.
- Remote staged archive SHA-256 matched the approved value before activation.
- Backup directory was created.
- `/var/www/globalcircle-portal` contained the new static contents after
  replacement:
  - target file count: 5;
  - target asset count: 3.
- `https://portal.gccwebos.com/` referenced the new bundle:
  - `assets/index-C9Ge3Xmb.js`;
  - `assets/index-D5cpl1tK.css`.
- `https://portal.gccwebos.com/portal/register/` referenced the same new
  bundle.
- Static assets returned `200`:
  - `assets/index-C9Ge3Xmb.js`;
  - `assets/index-D5cpl1tK.css`;
  - `assets/browser-Brp3tHUQ.js`.
- The served JavaScript bundle contained:
  - `/portal/register/`;
  - `注册领取 7 天试用`;
  - `发送邮箱验证码`;
  - `账号登录`.
- The served JavaScript bundle did not contain the previous bundle marker
  `index-BIzKjn5V`.
- `POST https://portal.gccwebos.com/api/portal/human-challenges` with
  `portal_registration` scope returned `201`.
- `https://portal.gccwebos.com/api/admin` returned `404`.
- `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`.
- `https://gccwebos.com/api/admin` returned `404`.
- `https://gccwebos.com/api/admin/platform/accounts` returned `404`.
- `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`
  without a session.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

During the activation command, the final non-mutating remote file-list display
step failed because a PowerShell CRLF was passed into a remote `sort` command.
The backup and static replacement had already completed before that display
step. Independent follow-up validation confirmed the backup, replacement,
service state, Nginx state, public host behavior, and Admin boundary.

## Rollback

If rollback is required, restore `/var/www/globalcircle-portal` from:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260702-001-var-www-globalcircle-portal-20260702T073022Z`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
