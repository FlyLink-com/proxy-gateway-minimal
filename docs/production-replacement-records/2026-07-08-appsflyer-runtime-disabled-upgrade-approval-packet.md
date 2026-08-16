# AppsFlyer Runtime Disabled Upgrade Approval Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: appsflyer_runtime_disabled_upgrade_approval_packet
  superseded_by: null
  last_verified_at: 2026-07-08
  production_authority: false
```


Date: 2026-07-08, Asia/Shanghai.

## Status

- Type: production runtime upgrade approval packet
- Related Linear lane: GCC-154
- Source baseline: `80a5b321d0a962f01a48854f2425e4e671ea1665`
- Risk: A for execution
- Production impact from this document: none

This packet prepares a production runtime upgrade on the Vultr Japan control
plane so the runtime contains the merged AppsFlyer disabled/dry-run adapter,
pilot package preview helper, guardrails, and read-only activation records.

It is not approval by itself. It does not authorize AppsFlyer credential
installation, `APPSFLYER_ATTRIBUTION_MODE=live`, Web SDK activation, Web-S2S
dispatch, OneLink or branded-domain creation, provider postback configuration,
campaign launch, settlement/payout activation, production schema migration,
payment or entitlement mutation, DNS, Nginx, firewall, SGP runtime mutation, or
secret/customer/subscription/runtime-material output.

Short confirmations such as `开始`, `同意`, or `继续` do not authorize this
gate. The operator must provide the exact approval text below before execution.

## Reason

The read-only production activation inventory recorded in
`docs/production-replacement-records/2026-07-08-appsflyer-production-activation-readonly-inventory.md`
blocked live activation for three reasons:

1. Production runtime does not contain
   `server/services/platform/appsflyer-attribution-adapter.mjs`.
2. Production runtime does not contain
   `server/services/platform/partner-attribution-pilot-package-preview.mjs`.
3. Production EnvironmentFiles do not contain any `APPSFLYER_*` variable names.

The next safe step is a runtime upgrade that deploys current source while
keeping AppsFlyer disabled and leaving all real provider credentials absent.

## Source Candidate

- Release:
  `appsflyer-runtime-disabled-20260708-001`
- Source baseline:
  `80a5b321d0a962f01a48854f2425e4e671ea1665`
- Artifact:
  `D:\Projects\proxy-gateway-minimal-artifacts\appsflyer-runtime-disabled-20260708-001\proxy-gateway-appsflyer-runtime-disabled-20260708-001.zip`
- SHA256:
  `7360C15AA8072C7D7F297FB2911AF1F2EA55C9664B11EFD2DD2DAE57929688FA`
- Artifact creation command:

```powershell
git archive --format=zip --output D:\Projects\proxy-gateway-minimal-artifacts\appsflyer-runtime-disabled-20260708-001\proxy-gateway-appsflyer-runtime-disabled-20260708-001.zip HEAD
```

Artifact boundary inspection:

- Production artifact boundary report over committed source paths:
  - total paths: 927
  - blockers: 0
  - review-required paths:
    - `config/proxy-servers.json`
- Zip inspection:
  - total entries: 1007
  - `.git` entries: 0
  - `node_modules` entries: 0
  - exact `.env`: absent
  - `.codex-artifacts` entries: 0
  - forbidden file-pattern matches: none

Required runtime files observed in the zip:

- `server/services/platform/appsflyer-attribution-adapter.mjs`
- `server/services/platform/partner-attribution-pilot-package-preview.mjs`
- `server/services/platform/partner-attribution-pilot-fixtures.mjs`
- `server/services/platform/partner-attribution-guardrails.mjs`
- `server/routes/admin-platform.mjs`
- `server/app.mjs`
- `package.json`
- `package-lock.json`
- `.env.example`

`config/proxy-servers.json` is source-tracked but protected at runtime. During
execution, the production protected proxy config and protected EnvironmentFiles
must be backed up and preserved; the artifact must not be allowed to overwrite
production-only protected material without an explicit separate review.

## Current Production Anchor

The read-only inventory observed:

- Target: Vultr Japan control plane `45.76.222.52`
- SSH alias: `vultr-japan-control`
- Hostname: `gccgw-vultr-candidate`
- Service: `proxy-gateway-candidate.service`
- Current release path:
  `/opt/proxy-gateway-minimal-candidate/releases/japan-sgp-vless-host-unify-20260622-001`
- Service state: active/running
- Node.js version: `v22.22.3`
- Production `APPSFLYER_*` variable-name presence: absent across checked
  EnvironmentFiles

Treat `japan-sgp-vless-host-unify-20260622-001` as the rollback release unless
fresh read-only inventory immediately before execution proves a different
current release.

## Scope Allowed After Exact Approval

Vultr Japan control-plane actions only:

1. Run fresh read-only inventory to re-confirm current release, service state,
   public boundary, EnvironmentFile paths, and `APPSFLYER_*` absence.
2. Back up current symlink, current release pointer, protected EnvironmentFiles,
   protected proxy config, control DB, subscription DB, and service metadata.
3. Upload only the verified artifact named in this packet.
4. Verify artifact SHA256 on host before unpacking.
5. Unpack to:
   `/opt/proxy-gateway-minimal-candidate/releases/appsflyer-runtime-disabled-20260708-001`
6. Run `npm ci` in the new release directory.
7. Preserve production protected config and EnvironmentFiles; do not install
   real AppsFlyer credentials.
8. Keep AppsFlyer in disabled/default mode:
   - `APPSFLYER_ATTRIBUTION_MODE` must remain absent or `disabled`;
   - `APPSFLYER_DEV_KEY` must remain absent;
   - `APPSFLYER_WEB_DEV_KEY` must remain absent;
   - `APPSFLYER_APP_ID` may remain absent.
9. Switch only the Japan `current` symlink to the approved release.
10. Restart only `proxy-gateway-candidate.service`.
11. Repeat read-only AppsFlyer activation inventory after restart.

No SGP data-plane mutation is included. SGP checks, if any, are read-only only.

## Forbidden Actions

- DNS mutation;
- Nginx config mutation or reload;
- provider firewall mutation;
- SGP runtime config mutation;
- SGP service restart;
- Xray, Hysteria2, TUIC, Mihomo, or SGP edge-agent restart;
- AppsFlyer credential installation;
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
- copying protected runtime config or secrets into Git, docs, Linear, or logs.

## Validation

The runtime-disabled upgrade validation must prove:

- fresh read-only inventory matches the expected target;
- artifact SHA256 matches this packet;
- `npm ci` succeeds in the new release directory;
- `proxy-gateway-candidate.service` is active after restart;
- Japan health endpoint returns HTTP 200;
- `https://admin.gccwebos.com/portal/` returns HTTP 200;
- `https://admin.gccwebos.com/portal/register` returns HTTP 200;
- protected Admin attribution report remains unauthenticated-blocked;
- public Admin remains blocked;
- `https://sub.gccwebos.com/` root remains non-token/non-customer material;
- new runtime contains the AppsFlyer adapter and pilot package preview files;
- production `APPSFLYER_*` variable-name presence remains absent or disabled
  only;
- dry-run package preview can be produced locally from the approved source;
- live dispatch remains rejected without a separate production gate;
- no AppsFlyer provider events are emitted;
- no live orders, payments, entitlements, payouts, schema migrations, or
  provider assets are created.

Validation may record only safe refs, booleans, counts, HTTP statuses, hashes,
paths, and service status labels. It must not print protected values or dump DB
rows.

## Rollback

If validation fails:

1. Restore the previous Japan `current` symlink to
   `japan-sgp-vless-host-unify-20260622-001` unless fresh inventory identified
   a different rollback release.
2. Restore protected EnvironmentFiles, protected proxy config, control DB,
   subscription DB, and service metadata backups as needed.
3. Restart only `proxy-gateway-candidate.service`.
4. Revalidate service active, health, Portal public routes, Admin blocked,
   subscription root boundary, and `APPSFLYER_*` absence.
5. Do not mutate SGP runtime or provider settings as part of rollback.

## Exact Approval Template

```text
批准执行 AppsFlyer runtime disabled production upgrade：
release=appsflyer-runtime-disabled-20260708-001；
source_baseline=80a5b321d0a962f01a48854f2425e4e671ea1665；
artifact=D:\Projects\proxy-gateway-minimal-artifacts\appsflyer-runtime-disabled-20260708-001\proxy-gateway-appsflyer-runtime-disabled-20260708-001.zip；
archive_sha256=7360C15AA8072C7D7F297FB2911AF1F2EA55C9664B11EFD2DD2DAE57929688FA；
target=Vultr Japan control plane 45.76.222.52 only；
current_release=japan-sgp-vless-host-unify-20260622-001；
scope=read-only inventory; backup current symlink/current release pointer/protected EnvironmentFiles/protected proxy config/control DB/subscription DB/service metadata; upload verified artifact; verify SHA256 on host; unpack to /opt/proxy-gateway-minimal-candidate/releases/appsflyer-runtime-disabled-20260708-001; run npm ci; preserve production protected config and EnvironmentFiles; keep APPSFLYER_ATTRIBUTION_MODE absent or disabled and APPSFLYER_DEV_KEY/APPSFLYER_WEB_DEV_KEY/APPSFLYER_APP_ID absent; switch current symlink only after preflight; restart proxy-gateway-candidate.service only; repeat read-only AppsFlyer activation inventory; no AppsFlyer credentials, no live SDK/S2S, no provider assets, no live order；
validation=artifact hash ok, npm ci ok, service active, health 200, portal /portal/ 200, portal /portal/register 200, protected Admin attribution report unauthenticated blocked, public Admin blocked, sub root non-token boundary, AppsFlyer adapter and pilot package preview files present in runtime, APPSFLYER_* absent or disabled only, dry-run package preview safe, live dispatch still rejected without separate gate, no provider events, no live order/payment/entitlement/payout/schema/provider asset mutation；
rollback=restore current symlink to japan-sgp-vless-host-unify-20260622-001 plus protected EnvironmentFiles/proxy config/control DB/subscription DB/service metadata backups as needed, restart proxy-gateway-candidate.service only, revalidate public/private boundaries and APPSFLYER_* absence；
forbidden=DNS,Nginx config/reload,provider firewall,SGP runtime config mutation/restart,Xray/Hy2/TUIC/Mihomo/SGP agent restart,AppsFlyer credential installation,APPSFLYER_ATTRIBUTION_MODE=live,Web SDK live tracking,Web-S2S live dispatch,OneLink/branded-domain creation,postback configuration,broad campaign launch,payment mutation,entitlement mutation,account/password generation,live order creation,production schema migration/backfill,settlement payable approval,payout,subscription URL/token/password/private-key/credential output,raw provider payload output,raw env/log/config output,SQLite row dump,customer-private data output,copying protected material into Git/docs/Linear。
```

## Next Gate After Success

If this runtime-disabled upgrade succeeds and the repeated read-only inventory
confirms the runtime contains the AppsFlyer code while live dispatch remains
blocked, the next separate gate may approve
`install_credentials_disabled_mode_only` for an approved secret-store ref.

That follow-up must still not enable live Web SDK, Web-S2S, OneLink,
postbacks, broad campaigns, payable settlement, or payouts unless a later exact
gate selects a single controlled test click.
