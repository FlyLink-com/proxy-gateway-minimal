# AppsFlyer Runtime Disabled Upgrade Execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: appsflyer_runtime_disabled_upgrade_execution
  superseded_by: null
  last_verified_at: 2026-07-08
  production_authority: false
```


Date: 2026-07-08, UTC.

## Status

- Type: production runtime upgrade execution record
- Related Linear lane: GCC-154
- Risk: A
- Target: Vultr Japan control plane `45.76.222.52` only
- Service: `proxy-gateway-candidate.service`
- Approval packet:
  `docs/production-replacement-records/2026-07-08-appsflyer-runtime-disabled-upgrade-approval-packet.md`
- Execution result: completed with residual public Admin static-shell boundary
  note

The operator provided the exact approval text for the
`appsflyer-runtime-disabled-20260708-001` runtime-disabled upgrade. This
execution upgraded only the Vultr Japan control-plane runtime so the current
release contains the merged AppsFlyer disabled/dry-run adapter and pilot package
preview helper. AppsFlyer remained disabled and no real provider credentials
were installed.

This record intentionally contains only safe refs, paths, hashes, counts, HTTP
statuses, and service state labels. It does not contain environment values,
runtime config contents, subscription material, database rows, customer data,
provider payloads, tokens, keys, or credentials.

## Approved Source

- Release: `appsflyer-runtime-disabled-20260708-001`
- Source baseline:
  `80a5b321d0a962f01a48854f2425e4e671ea1665`
- Local artifact:
  `D:\Projects\proxy-gateway-minimal-artifacts\appsflyer-runtime-disabled-20260708-001\proxy-gateway-appsflyer-runtime-disabled-20260708-001.zip`
- Approved SHA256:
  `7360C15AA8072C7D7F297FB2911AF1F2EA55C9664B11EFD2DD2DAE57929688FA`
- Remote artifact SHA256:
  `7360C15AA8072C7D7F297FB2911AF1F2EA55C9664B11EFD2DD2DAE57929688FA`
- Remote artifact size: `3628219`

## Preflight

Read-only inventory immediately before mutation observed:

- Hostname: `gccgw-vultr-candidate`
- Service state: `active/running`
- Previous current release:
  `/opt/proxy-gateway-minimal-candidate/releases/japan-sgp-vless-host-unify-20260622-001`
- Node.js: `v22.22.3`
- Loopback health: `/api/health` returned `200`
- AppsFlyer variable-name presence across checked EnvironmentFiles: absent
- Runtime AppsFlyer adapter file: absent
- Runtime pilot package preview file: absent
- Protected Admin attribution report: `401`
- Portal `/portal/`: `200`
- Portal `/portal/register`: `200`
- Subscription root `https://sub.gccwebos.com/`: `404`

The `/health` path returned `401`; source inspection confirmed the public health
route for this runtime is `/api/health`.

## Backup

The execution created a production backup before the release switch:

- Backup directory:
  `/opt/proxy-gateway-minimal-candidate/backups/appsflyer-runtime-disabled-20260708-001-20260708T071147Z`
- Backup file count: `16`

The backup covered the current symlink target, current release pointer,
service metadata, checked EnvironmentFiles, current proxy config, protected
proxy config, shared control DB, shared subscription DB, and current local
control DB. SQLite backups used `sqlite3 .backup`.

## Execution

Allowed Japan control-plane actions performed:

1. Created the incoming artifact directory.
2. Uploaded only the approved zip artifact.
3. Verified the remote SHA256 against the approved hash.
4. Unpacked the artifact to:
   `/opt/proxy-gateway-minimal-candidate/releases/appsflyer-runtime-disabled-20260708-001`
5. Verified required runtime files were present:
   - `server/services/platform/appsflyer-attribution-adapter.mjs`
   - `server/services/platform/partner-attribution-pilot-package-preview.mjs`
   - `server/services/platform/partner-attribution-pilot-fixtures.mjs`
   - `server/services/platform/partner-attribution-guardrails.mjs`
   - `server/routes/admin-platform.mjs`
   - `server/app.mjs`
   - `package.json`
   - `package-lock.json`
   - `.env.example`
6. Preserved production current `.env`, current `config/proxy-servers.json`,
   and current local control sqlite into the new release before switching.
7. Confirmed new release `.env` AppsFlyer variable-name presence remained
   absent.
8. Ran `npm ci` in the new release directory.
9. Switched `current` from
   `/opt/proxy-gateway-minimal-candidate/releases/japan-sgp-vless-host-unify-20260622-001`
   to
   `/opt/proxy-gateway-minimal-candidate/releases/appsflyer-runtime-disabled-20260708-001`.
10. Restarted only `proxy-gateway-candidate.service`.

`npm ci` completed successfully:

- Added packages: `117`
- Audited packages: `118`
- Vulnerabilities: `0`

## Validation

Post-restart production validation observed:

- Current release:
  `/opt/proxy-gateway-minimal-candidate/releases/appsflyer-runtime-disabled-20260708-001`
- Service state: `active/running`
- Loopback `/api/health`: `200`
- `https://admin.gccwebos.com/portal/`: `200`
- `https://admin.gccwebos.com/portal/register`: `200`
- `https://admin.gccwebos.com/api/admin/platform/partner-attribution-report`:
  `401`
- `https://admin.gccwebos.com/api/admin/overview`: `401`
- `https://sub.gccwebos.com/`: `404`
- Production EnvironmentFiles AppsFlyer variable-name presence: absent
- Runtime AppsFlyer adapter file: present
- Runtime pilot package preview file: present
- Runtime Admin platform route file: present
- Local approved-source guardrail tests: `31` passed, `0` failed
- Production runtime adapter default mode: `disabled`
- Production runtime live-mode check: rejected with
  `production_gate_required`

The checked EnvironmentFiles were:

- `/opt/proxy-gateway-minimal-candidate/.env`
- `/opt/proxy-gateway-minimal-candidate/current/.env`
- `/opt/proxy-gateway-minimal-candidate/protected/admin-auth/admin-auth.env`
- `/opt/proxy-gateway-minimal-candidate/protected/user-portal-email/user-portal-email.env`
- `/opt/proxy-gateway-minimal-candidate/protected/niuniu-pay/niuniu-pay.env`

All checked EnvironmentFiles remained mode `600`, owned by `root:root`, and had
AppsFlyer variable names absent.

## Boundary Note

During validation, the static Admin shell paths returned `200`:

- `https://admin.gccwebos.com/admin`: `200`
- `https://admin.gccwebos.com/admin/`: `200`
- `https://admin.gccwebos.com/admin/index.html`: `200`

The response is a static `GlobalCircle AI - Operator Console` shell. Admin API
routes checked above still reject unauthenticated requests with `401`.

This was not changed by this execution: no Nginx mutation or reload was
performed, and both the previous and new release contain an `admin` static tree.
The previous and new `admin/index.html` hashes matched. Treat this as a
residual public static-shell boundary note, not as proof that public Admin is
fully blocked at the static route layer. If product policy requires `/admin`
to return `404` or another blocking response, that needs a separate exact
Nginx/Admin exposure hardening gate.

## Not Performed

The execution did not perform:

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
- campaign launch;
- payment, entitlement, account, password, live-order, schema, settlement, or
  payout mutation;
- subscription URL, token, password, private key, credential value, raw
  environment, raw config, raw log, SQLite row, raw provider payload, payout
  account, or customer-private output;
- copying protected runtime config or secrets into Git, docs, Linear, or logs.

## Follow-Up Gate

The next AppsFlyer step is not live activation. If this runtime-disabled state
is accepted, the next separate gate may approve
`install_credentials_disabled_mode_only` for reviewed secret-store refs. That
follow-up must still keep provider dispatch disabled unless a later exact gate
selects one controlled test click.
