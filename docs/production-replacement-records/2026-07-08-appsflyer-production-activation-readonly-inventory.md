# AppsFlyer Production Activation Read-Only Inventory


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: appsflyer_production_activation_readonly_inventory
  superseded_by: null
  last_verified_at: 2026-07-08
  production_authority: false
```


Date: 2026-07-08, Asia/Shanghai.

## Status

- Type: production activation read-only inventory
- Related Linear lane: GCC-154
- Gate package:
  `docs/production-replacement-records/2026-07-08-appsflyer-production-activation-gate.md`
- Source baseline: `28de09bc5d847c57ad0cc5402e259b2a9bca54a8`
- Risk: A for any follow-up credential, provider, runtime, data, settlement,
  or campaign execution
- Production impact from this inventory: none

This inventory started the AppsFlyer production activation gate in
`read_only_inventory_only` mode. It did not install credentials, enable Web SDK
tracking, send Web-S2S events, create OneLink or branded-domain assets,
configure AppsFlyer postbacks, deploy code, restart services, mutate schema,
mutate payment or entitlement state, launch campaigns, approve payouts, change
DNS/Nginx/systemd/firewall, or output sensitive material.

## Gate Baseline

- PR #382 was marked ready and merged after checks passed.
- Merge commit: `28de09bc5d847c57ad0cc5402e259b2a9bca54a8`.
- GitHub checks before merge:
  - `Validate`: success
  - Vercel: success
  - Vercel Preview Comments: success
  - Cloudflare Workers Builds: success
- Inventory worktree:
  `D:\Projects\proxy-gateway-minimal\.worktrees\gcc-154-production-readonly-inventory`
- Inventory worktree status after baseline checkout: clean against
  `origin/master`.

## Local Source Inventory

The merged source baseline contains the AppsFlyer gate package and repo-only
disabled/dry-run implementation:

- `.env.example` contains placeholder names only:
  - `APPSFLYER_ATTRIBUTION_MODE=disabled`
  - `APPSFLYER_DEV_KEY=`
  - `APPSFLYER_WEB_DEV_KEY=`
  - `APPSFLYER_APP_ID=`
- `server/services/platform/appsflyer-attribution-adapter.mjs` exists in source.
- `server/services/platform/partner-attribution-pilot-package-preview.mjs`
  exists in source.
- The adapter still rejects `live` mode unless a separate production gate
  explicitly passes the live-dispatch allowance.

Local process environment inventory:

| Variable | Local process status |
| --- | --- |
| `APPSFLYER_ATTRIBUTION_MODE` | absent |
| `APPSFLYER_DEV_KEY` | absent |
| `APPSFLYER_WEB_DEV_KEY` | absent |
| `APPSFLYER_APP_ID` | absent |

## Local Dry-Run Validation

Command:

```powershell
node --test server\tests\platform-appsflyer-attribution-adapter.test.mjs server\tests\platform-partner-attribution-pilot-package-preview.test.mjs server\tests\platform-partner-attribution-pilot-fixtures.test.mjs server\tests\platform-partner-attribution-guardrails.test.mjs
```

Result:

- 31 tests passed.
- 0 tests failed.

Dry-run pilot package preview used only synthetic safe refs and placeholder
environment values. Summary:

- `type`: `partner_attribution_pilot_package_preview`
- `provider`: `appsflyer`
- `mode`: `dry_run`
- `dryRun`: `true`
- `dispatchBlocked`: `true`
- `productionGateRequired`: `true`
- `landingRoute`: `/portal/register`
- `linkCount`: `1`
- `webSdkEventCount`: `2`
- `serverEventCount`: `2`
- `strippedParamNames`: none
- `strippedEventValueKeys`: none
- `liveDispatchAllowed`: `false`
- `rawValuesReturned`: `false`
- `mutationAllowed`: `false`
- required reviews:
  - `partner_approved`
  - `campaign_approved`
  - `privacy_boundary_reviewed`
  - `production_gate_required`

Live-mode guardrail check:

- `liveRejected`: `true`
- `code`: `production_gate_required`

## AppsFlyer Dashboard Read-Only Inventory

Chrome was used only to read the already-open logged-in AppsFlyer dashboard.
No dashboard settings were changed.

Observed safe facts:

- Host: `hq1.appsflyer.com`
- Page title: `AppsFlyer`
- URL hash app ref: `appIds=website-gccwebos.com`
- Visible product line hint: `gccvpn`
- Login prompt observed: `false`
- Dashboard-like page observed: `true`

The dashboard inventory confirms only that an AppsFlyer app/dashboard surface
for `website-gccwebos.com` is visible in the logged-in browser session. It does
not prove credentials, Web SDK, S2S event delivery, OneLink configuration,
postbacks, partner billing, or settlement readiness.

## Production Control-Plane Read-Only Inventory

Target:

- SSH alias: `vultr-japan-control`
- Host identity: Vultr Japan control plane, `45.76.222.52`

Observed safe facts:

- Hostname: `gccgw-vultr-candidate`
- Service: `proxy-gateway-candidate.service`
- Service state: active/running
- Fragment path: `/etc/systemd/system/proxy-gateway-candidate.service`
- Current release path:
  `/opt/proxy-gateway-minimal-candidate/releases/japan-sgp-vless-host-unify-20260622-001`
- Node.js version: `v22.22.3`

EnvironmentFile paths reported by systemd:

- `/opt/proxy-gateway-minimal-candidate/.env`
- `/opt/proxy-gateway-minimal-candidate/current/.env`
- `/opt/proxy-gateway-minimal-candidate/protected/admin-auth/admin-auth.env`
- `/opt/proxy-gateway-minimal-candidate/protected/user-portal-email/user-portal-email.env`
- `/opt/proxy-gateway-minimal-candidate/protected/niuniu-pay/niuniu-pay.env`

All checked environment files were mode `600` and owned by `root:root`.

AppsFlyer variable-name presence across the checked production EnvironmentFiles:

| Variable | Production EnvironmentFiles status |
| --- | --- |
| `APPSFLYER_ATTRIBUTION_MODE` | absent |
| `APPSFLYER_DEV_KEY` | absent |
| `APPSFLYER_WEB_DEV_KEY` | absent |
| `APPSFLYER_APP_ID` | absent |

Production runtime source-file presence under
`/opt/proxy-gateway-minimal-candidate/current`:

| File | Production runtime status |
| --- | --- |
| `appsflyer-attribution-adapter.mjs` | absent |
| `partner-attribution-pilot-package-preview.mjs` | absent |
| `admin-platform.mjs` | present |

The production runtime path is not a Git checkout, so a runtime git SHA was not
available from the host.

## Public Boundary Read-Only Inventory

HTTP status checks:

| URL | Status |
| --- | --- |
| `https://admin.gccwebos.com/portal/` | 200 |
| `https://admin.gccwebos.com/portal` | 200 |
| `https://admin.gccwebos.com/portal/register` | 200 |
| `https://admin.gccwebos.com/api/admin/platform/partner-attribution-report` | 401 |
| `https://sub.gccwebos.com/` | 404 |

These checks did not submit forms, use subscription tokens, fetch customer
material, or access private Admin data.

## Blocker

Production activation is blocked.

Reasons:

1. The production control-plane runtime does not contain the current source
   baseline with the AppsFlyer adapter and pilot package preview files.
2. The production EnvironmentFiles do not contain any `APPSFLYER_*` variable
   names.
3. The current production release cannot be tied to the merged AppsFlyer gate
   source SHA from the host because the runtime path is not a Git checkout.

Because of these blockers, the next step must not be live AppsFlyer dispatch,
credential installation into an unreviewed location, OneLink creation,
postback configuration, campaign launch, or settlement/payout activation.

## Required Next Gate

Before production AppsFlyer activation can continue, create or execute a
separate exact A-tier gate for a production runtime upgrade or controlled
artifact promotion that:

- names the source SHA or release artifact containing commit
  `28de09bc5d847c57ad0cc5402e259b2a9bca54a8` or a reviewed successor;
- backs up current runtime, protected EnvironmentFiles, proxy config, control
  DB, and subscription DB if the runtime is touched;
- verifies the artifact hash before switching;
- keeps `APPSFLYER_ATTRIBUTION_MODE=disabled` unless the exact approval
  explicitly selects `activate_one_controlled_test_click`;
- installs any AppsFlyer secrets only by approved secret-store refs;
- restarts or deploys only the approved service after config validation;
- repeats this read-only inventory after promotion;
- leaves settlement candidates in manual review.

Exact approval is still required for any follow-up mutation. Short
confirmations are not sufficient.
