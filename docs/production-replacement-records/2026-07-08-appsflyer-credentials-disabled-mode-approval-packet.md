# AppsFlyer Credentials Disabled Mode Approval Packet

Date: 2026-07-08, UTC.

## Status

- Type: production credentials-disabled approval packet
- Related Linear lane: GCC-154
- Risk: A for execution
- Target: Vultr Japan control plane `45.76.222.52` only
- Service: `proxy-gateway-candidate.service`
- Production impact from this document: none
- Execution state: blocked until operator fills reviewed secret-store refs and
  provides exact approval text

This packet prepares the next AppsFlyer activation step after the completed
runtime-disabled upgrade. The intended change is to install reviewed AppsFlyer
credential refs while keeping AppsFlyer disabled. It must not enable live
provider dispatch, Web SDK tracking, Web-S2S event delivery, OneLink,
postbacks, campaigns, settlement payables, or payouts.

This packet is not approval by itself. Short confirmations such as `开始`,
`同意`, or `继续` do not authorize credential installation.

## Current Evidence

Source and execution records:

- Runtime-disabled approval packet:
  `docs/production-replacement-records/2026-07-08-appsflyer-runtime-disabled-upgrade-approval-packet.md`
- Runtime-disabled execution record:
  `docs/production-replacement-records/2026-07-08-appsflyer-runtime-disabled-upgrade-execution.md`
- Current source baseline for this packet:
  `8dcc6455e25b22391df795d425350e20e61a921f`

Read-only inventory for this packet observed:

- Hostname: `gccgw-vultr-candidate`
- Current release:
  `/opt/proxy-gateway-minimal-candidate/releases/appsflyer-runtime-disabled-20260708-001`
- Service state: `active/running`
- Loopback `/api/health`: `200`
- Runtime AppsFlyer adapter file: present
- Runtime AppsFlyer pilot package preview file: present
- Checked EnvironmentFiles AppsFlyer variable-name presence: absent
- `https://admin.gccwebos.com/portal/`: `200`
- `https://admin.gccwebos.com/portal/register`: `200`
- `https://admin.gccwebos.com/api/admin/platform/partner-attribution-report`:
  `401`
- `https://admin.gccwebos.com/api/admin/overview`: `401`
- `https://sub.gccwebos.com/`: `404`
- `https://admin.gccwebos.com/admin/`: `200`, residual static-shell boundary
  from the previous execution record

Local validation over the approved source passed:

```powershell
node --test server\tests\platform-appsflyer-attribution-adapter.test.mjs server\tests\platform-partner-attribution-pilot-package-preview.test.mjs server\tests\platform-partner-attribution-pilot-fixtures.test.mjs server\tests\platform-partner-attribution-guardrails.test.mjs
```

Result: `31` passed, `0` failed.

## Required Operator Inputs

Execution is blocked until the operator provides all required fields below as
refs or safe identifiers. Do not paste raw key values into chat, Git, docs,
Linear, PR comments, or logs.

Required:

- `credential_source_ref`: reviewed operator-controlled secret source that can
  provide `APPSFLYER_WEB_DEV_KEY` without printing the value.
- `appsflyer_app_id`: safe AppsFlyer app identifier. Default candidate:
  `website-gccwebos.com`.
- `credential_destination`: protected env file destination. Default candidate:
  `/opt/proxy-gateway-minimal-candidate/protected/appsflyer/appsflyer.env`.
- `service_dropin_path`: systemd drop-in path. Default candidate:
  `/etc/systemd/system/proxy-gateway-candidate.service.d/appsflyer-disabled.conf`.

Optional, only if the operator explicitly confirms a separate mobile/app need:

- `APPSFLYER_DEV_KEY` source ref.

For the current website attribution lane, the conservative default is web-only:

- `APPSFLYER_ATTRIBUTION_MODE=disabled`
- `APPSFLYER_WEB_DEV_KEY` present from `credential_source_ref`
- `APPSFLYER_APP_ID=website-gccwebos.com` unless the operator supplies a
  different safe app id
- `APPSFLYER_DEV_KEY` absent

## Allowed Scope After Exact Approval

Vultr Japan control-plane actions only:

1. Run fresh read-only inventory to re-confirm current release, service state,
   public boundaries, EnvironmentFile paths, runtime AppsFlyer files, and
   `APPSFLYER_*` current variable-name presence.
2. Back up current symlink pointer, checked EnvironmentFiles, service unit and
   drop-in metadata, protected AppsFlyer directory if present, protected proxy
   config, control DB, and subscription DB.
3. Create or update only the approved protected AppsFlyer env file at the
   approved `credential_destination`.
4. Write only approved variable names to that protected env file.
5. Set the protected env file owner/mode to match production protected
   EnvironmentFile standards.
6. Create or update only the approved `service_dropin_path` to add the protected
   AppsFlyer EnvironmentFile.
7. Run `systemctl daemon-reload`.
8. Restart only `proxy-gateway-candidate.service`.
9. Repeat read-only inventory after restart.
10. Prove the runtime sees AppsFlyer credential configured while mode remains
    disabled and live dispatch remains rejected.

Validation may record only variable-name presence, mode labels, booleans,
counts, hashes, file paths, HTTP statuses, and service status labels. It must
not print protected values or dump raw config, logs, provider payloads, or
SQLite rows.

## Forbidden Actions

- DNS mutation;
- Nginx config mutation or reload;
- provider firewall mutation;
- SGP runtime config mutation;
- SGP service restart;
- Xray, Hysteria2, TUIC, Mihomo, or SGP edge-agent restart;
- `APPSFLYER_ATTRIBUTION_MODE=live`;
- Web SDK live tracking;
- Web-S2S live dispatch;
- OneLink or branded-domain creation;
- provider postback configuration;
- broad campaign launch;
- payment mutation;
- entitlement mutation;
- account or password generation;
- live order creation;
- production schema migration or backfill;
- settlement payable approval or payout;
- subscription URL, token, password, private key, credential value, raw
  environment, raw config, raw log, SQLite row, raw provider payload, payout
  account, or customer-private output;
- copying protected runtime config, raw keys, or secrets into Git, docs, Linear,
  PR comments, or logs.

## Validation

Execution validation must prove:

- fresh read-only inventory matches the expected Japan target;
- backup directory exists and includes the expected safe metadata categories;
- protected AppsFlyer env file exists with approved owner/mode;
- systemd drop-in exists and references only the approved protected AppsFlyer
  env file;
- `systemctl daemon-reload` succeeds;
- `proxy-gateway-candidate.service` is active after restart;
- loopback `/api/health` returns `200`;
- Portal `/portal/` returns `200`;
- Portal `/portal/register` returns `200`;
- protected Admin attribution report remains unauthenticated-blocked with
  `401`;
- Admin overview API remains unauthenticated-blocked with `401`;
- subscription root remains non-token/non-customer material;
- runtime AppsFlyer adapter and pilot package preview files remain present;
- `APPSFLYER_ATTRIBUTION_MODE` is `disabled`;
- `APPSFLYER_WEB_DEV_KEY` variable-name presence is observed without printing
  value;
- `APPSFLYER_APP_ID` variable-name presence is observed without printing value;
- `APPSFLYER_DEV_KEY` remains absent unless the exact approval explicitly
  includes its secret source ref;
- runtime adapter summary reports credential configured, redacted, and dispatch
  blocked;
- live-mode construction still rejects without a separate production gate;
- no AppsFlyer provider events are emitted;
- no live orders, payments, entitlements, payouts, schema migrations, provider
  assets, OneLink assets, postbacks, campaigns, or settlements are created.

## Rollback

If validation fails:

1. Restore the previous service drop-in state from backup or remove the
   AppsFlyer drop-in if it did not exist before.
2. Restore or remove the protected AppsFlyer env file to its previous state from
   backup.
3. Run `systemctl daemon-reload`.
4. Restart only `proxy-gateway-candidate.service`.
5. Revalidate service active, loopback health `200`, Portal public routes,
   Admin APIs blocked, subscription root boundary, and AppsFlyer credential
   disabled/absent state.
6. Do not mutate SGP runtime, provider settings, DNS, Nginx, firewall, payment,
   entitlement, order, schema, settlement, or payout state as part of rollback.

## Exact Approval Template

This template is intentionally not executable until the operator replaces the
placeholder fields with reviewed safe refs. Raw key values must not be included.

```text
批准执行 AppsFlyer install_credentials_disabled_mode_only：
target=Vultr Japan control plane 45.76.222.52 only；
current_release=appsflyer-runtime-disabled-20260708-001；
source_baseline=8dcc6455e25b22391df795d425350e20e61a921f；
credential_source_ref=<REVIEWED_SECRET_STORE_REF_FOR_APPSFLYER_WEB_DEV_KEY>；
appsflyer_app_id=website-gccwebos.com；
credential_destination=/opt/proxy-gateway-minimal-candidate/protected/appsflyer/appsflyer.env；
service_dropin_path=/etc/systemd/system/proxy-gateway-candidate.service.d/appsflyer-disabled.conf；
scope=read-only inventory; backup current symlink pointer/protected EnvironmentFiles/service unit and drop-ins/protected AppsFlyer directory if present/protected proxy config/control DB/subscription DB; create or update only the approved protected AppsFlyer env file; write APPSFLYER_ATTRIBUTION_MODE=disabled, APPSFLYER_WEB_DEV_KEY from credential_source_ref, APPSFLYER_APP_ID=website-gccwebos.com, keep APPSFLYER_DEV_KEY absent unless separately named; set owner/mode to protected EnvironmentFile standard; create or update only the approved systemd drop-in to add that env file; systemctl daemon-reload; restart proxy-gateway-candidate.service only; repeat read-only AppsFlyer inventory; no live SDK/S2S, no provider assets, no live order；
validation=backup ok, protected env file owner/mode ok, drop-in path ok, service active, health 200, portal /portal/ 200, portal /portal/register 200, protected Admin attribution report 401, Admin overview API 401, sub root non-token boundary, AppsFlyer runtime files present, APPSFLYER_ATTRIBUTION_MODE disabled, APPSFLYER_WEB_DEV_KEY name present without value output, APPSFLYER_APP_ID name present without value output, APPSFLYER_DEV_KEY absent unless explicitly approved, adapter summary credentialConfigured true redacted true dispatchBlocked true, live dispatch still rejected without separate gate, no provider events, no live order/payment/entitlement/payout/schema/provider asset mutation；
rollback=restore previous service drop-in state and protected AppsFlyer env file state from backup or remove both if newly created, systemctl daemon-reload, restart proxy-gateway-candidate.service only, revalidate public/private boundaries and AppsFlyer disabled/absent posture；
forbidden=raw key value in chat/Git/docs/Linear/logs,DNS,Nginx config/reload,provider firewall,SGP runtime config mutation/restart,Xray/Hy2/TUIC/Mihomo/SGP agent restart,APPSFLYER_ATTRIBUTION_MODE=live,Web SDK live tracking,Web-S2S live dispatch,OneLink/branded-domain creation,postback configuration,broad campaign launch,payment mutation,entitlement mutation,account/password generation,live order creation,production schema migration/backfill,settlement payable approval,payout,subscription URL/token/password/private-key/credential output,raw provider payload output,raw env/log/config output,SQLite row dump,customer-private data output,copying protected material into Git/docs/Linear。
```

## Next Gate After Success

If this credentials-disabled gate succeeds, the next separate gate may prepare a
single controlled test-click plan. That later gate must name exactly one
partner/campaign/test route, define event suppression and rollback, and still
must not approve broad campaign launch, automatic payable settlement, or payout.
