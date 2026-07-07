# User Portal Simplified Registration Production Candidate Staging

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Backend artifact: `admin-backend-candidate-20260702-007`

Backend SHA-256: `79E475CE02FF7764EE2C13DF9BA98EEB8776838F9C892F0358CAB142AF668307`

Portal frontend artifact: `user-portal-preview-20260702-002`

Portal frontend SHA-256: `E8AF16B6925495F962F82E6DDD140F27F1221CB8D67327F26FC5EF60C4708DB6`

## Scope

Approved and executed upload/extract only to:

`/opt/proxy-gateway-minimal-candidate/backend-candidates/releases/admin-backend-candidate-20260702-007`

and:

`/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-preview-20260702-002`

No `current` symlink change, `/var/www/globalcircle-portal` replacement,
backend overlay activation, Nginx config change, systemd change, DNS change,
firewall change, env change, service restart, public Admin exposure, token
output, or customer data dump was performed.

## Purpose

Candidate `user-portal-preview-20260702-002` stages the User Portal static
bundle for the simplified self-registration flow:

- email is the login account;
- email verification code is required before registration;
- user sets a password during registration;
- registration opens a 7-day trial and then enters the user panel;
- purchase and renewal remain inside the user panel plan/order area;
- no legacy registration fields for plan intent, device count, primary region,
  use case, visible-once entry token, or human-challenge form copy are shown on
  the registration page.

Candidate `admin-backend-candidate-20260702-007` stages the matching backend
overlay for the simplified registration flow:

- email-login account creation;
- password session creation after registration;
- duplicate-email trial blocking;
- source-based registration abuse throttling;
- email-verification send throttling by source and submitted email;
- single-subscription account policy for self-registered users.

## Validation

- Local backend archive SHA-256 matched the approved value before upload.
- Local portal archive SHA-256 matched the approved value before upload.
- Remote uploaded backend archive SHA-256 matched the approved value.
- Remote uploaded portal archive SHA-256 matched the approved value.
- Remote backend manifest was present after extraction.
- Remote portal manifest was present after extraction.
- Remote backend overlay contained:
  - `backend-overlay/server/routes/user-portal.mjs`
  - `backend-overlay/server/services/platform/portal-registration.mjs`
  - `backend-overlay/server/services/platform/portal-registration-email-verification.mjs`
- Remote portal static bundle contained:
  - `portal-dist/index.html`
  - `portal-dist/assets`
- Remote portal bundle contained the simplified registration copy:
  - `验证邮箱并设置密码`
  - `套餐购买和续费在用户面板内完成`
  - `确认密码`
- Remote portal bundle did not contain the superseded registration copy:
  - `提交基础信息后生成账户 ID 和一次性入口令牌`
  - `姓名或团队`
  - `计划意向`
- Existing `/var/www/globalcircle-portal/index.html` remained unchanged and
  still referenced the current live bundle assets:
  - `assets/index-C9Ge3Xmb.js`
  - `assets/index-D5cpl1tK.css`
- `admin-preview/current` remained unchanged at
  `releases/admin-preview-20260702-016`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- `https://portal.gccwebos.com/api/admin` returned `404`.
- `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`.
- `https://gccwebos.com/api/admin` returned `404`.
- `https://gccwebos.com/api/admin/platform/accounts` returned `404`.
- `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`
  without a session.

## Rollback

If staging needs to be reverted before activation, remove only:

`/opt/proxy-gateway-minimal-candidate/backend-candidates/releases/admin-backend-candidate-20260702-007`

and:

`/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-preview-20260702-002`
