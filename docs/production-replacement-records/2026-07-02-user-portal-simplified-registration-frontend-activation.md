# User Portal Simplified Registration Frontend Activation

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `user-portal-preview-20260702-002`

SHA-256: `E8AF16B6925495F962F82E6DDD140F27F1221CB8D67327F26FC5EF60C4708DB6`

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

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260702-002-var-www-globalcircle-portal-20260702T092658Z`

## Purpose

This activation publishes the simplified User Portal self-registration UI:

- email is the login account;
- password and confirm-password are set during registration;
- email verification code is required;
- registration opens a 7-day trial and then enters the user panel;
- purchase and renewal remain in the user panel;
- superseded registration fields for plan intent, device count, primary
  region, use case, and visible-once entry-token handoff are absent from the
  registration bundle.

## Validation

- Staged portal archive SHA-256 matched the approved value.
- Backup directory was created.
- `/var/www/globalcircle-portal` contained the new static contents after
  replacement:
  - target file count: 5;
  - target asset count: 3.
- `https://portal.gccwebos.com/` referenced the new bundle:
  - `assets/index-B-RjI6G7.js`;
  - `assets/index-D4zH1oAx.css`.
- `https://portal.gccwebos.com/portal/register/` referenced the same new
  bundle.
- Static assets returned `200`:
  - `assets/index-B-RjI6G7.js`;
  - `assets/index-D4zH1oAx.css`;
  - `assets/browser-Br55z5IQ.js`.
- The served JavaScript bundle contained:
  - `验证邮箱并设置密码`;
  - `套餐购买和续费在用户面板内完成`;
  - `确认密码`;
  - `邮箱验证码`;
  - `账号登录`.
- The served JavaScript bundle did not contain the superseded registration
  copy:
  - `提交基础信息后生成账户 ID 和一次性入口令牌`;
  - `姓名或团队`;
  - `计划意向`;
  - `主要区域`.
- User Portal API routes remained proxied:
  - `POST https://portal.gccwebos.com/api/portal/registration` returned
    business validation `400` for an empty request.
  - `POST https://portal.gccwebos.com/api/portal/registration/email-verification`
    returned business validation `400` for an empty request.
  - `POST https://portal.gccwebos.com/api/portal/password/session` returned
    business validation `400` for an empty request.
  - `POST https://portal.gccwebos.com/api/portal/human-challenges` returned
    `201`.
- Public Admin routes stayed blocked:
  - `https://portal.gccwebos.com/api/admin` returned `404`;
  - `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`;
  - `https://gccwebos.com/api/admin` returned `404`;
  - `https://gccwebos.com/api/admin/platform/accounts` returned `404`.
- Protected Admin route stayed session-gated:
  - `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`
    without a session.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

## Rollback

If rollback is required, restore `/var/www/globalcircle-portal` from:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260702-002-var-www-globalcircle-portal-20260702T092658Z`

Then run `nginx -t`. Reload Nginx only if required after the test passes. Keep
the staged artifact unless a separate cleanup approval removes it.
