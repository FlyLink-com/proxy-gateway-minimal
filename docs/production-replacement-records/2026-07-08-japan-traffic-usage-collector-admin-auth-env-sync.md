# Japan Traffic Usage Collector Admin Auth Env Sync


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: japan_traffic_usage_collector_admin_auth_env_sync
  superseded_by: null
  last_verified_at: 2026-07-08
  production_authority: false
```


Date: 2026-07-08 America/Los_Angeles

Risk: A

Target: Vultr Japan control plane `45.76.222.52` only

Release context:

- Current release: `subscription-artifact-binding-observe-20260708-001`
- Related PR: #416
- Release unit: `japan-runtime-config`

## Purpose

The Japan traffic usage collector was failing during startup after Admin auth
routes were enabled. Read-only diagnosis showed that
`proxy-gateway-candidate.service` had an effective
`ADMIN_AUTH_PORTAL_ACCOUNT_ID`, while
`gccgw-traffic-usage-collect.service` did not.

This record captures the approved production environment synchronization that
copied the existing effective account-id reference into the traffic collector
service without printing or recording the value.

## Approved Scope

- Read-only precheck.
- Back up `gccgw-traffic-usage-collect.service`,
  `gccgw-traffic-usage-collect.timer`, and
  `proxy-gateway-candidate.service` metadata.
- Copy the existing `ADMIN_AUTH_PORTAL_ACCOUNT_ID` from
  `proxy-gateway-candidate.service` effective environment into a
  `gccgw-traffic-usage-collect.service` drop-in without printing the value.
- Run `systemctl daemon-reload`.
- Run `systemctl reset-failed gccgw-traffic-usage-collect.service`.
- Start `gccgw-traffic-usage-collect.service` once for validation.
- Keep `gccgw-traffic-usage-collect.timer` active.
- Do not restart `proxy-gateway-candidate.service`.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-admin-auth-env-sync-20260709-20260709T033110Z`

Backed up items included traffic collector service/timer unit material and
safe service metadata for the traffic collector and proxy gateway candidate
service.

## Change Applied

Created:

`/etc/systemd/system/gccgw-traffic-usage-collect.service.d/20-admin-auth-portal-account.conf`

The drop-in declares `ADMIN_AUTH_PORTAL_ACCOUNT_ID` for the collector service.
The value was copied from the proxy gateway candidate service effective
environment and was not printed, logged, or recorded in this repository.

## Validation

Precheck:

- Current release was `subscription-artifact-binding-observe-20260708-001`.
- `proxy-gateway-candidate.service` was active.
- `gccgw-traffic-usage-collect.timer` was active.
- `gccgw-traffic-usage-collect.service` was failed before the change.
- Proxy service effective environment had `ADMIN_AUTH_PORTAL_ACCOUNT_ID`
  present.
- Traffic collector service effective environment had
  `ADMIN_AUTH_PORTAL_ACCOUNT_ID` absent.
- Xray stats and Mihomo controller loopback boundaries were healthy.

Post-change validation:

- The collector service effective environment had
  `ADMIN_AUTH_PORTAL_ACCOUNT_ID` present.
- The collector reached runtime accounting instead of failing during Admin auth
  startup.
- Redacted one-shot summary:
  - `collectorCount=5`
  - `observationCount=33`
  - `recordedCount=32`
  - `unresolvedCount=1`
  - `safety.redacted=true`
- `proxy-gateway-candidate.service` remained active.
- `gccgw-traffic-usage-collect.timer` remained active.
- Xray stats and Mihomo controller loopback checks remained unchanged.

## Remaining Blocker

The one-shot service still exited non-zero after the Admin auth startup blocker
was removed.

Read-only follow-up narrowed the remaining failure to Japan TUIC usage mapping:

- `channel-vultr-a-tuic` reported `collector_not_supported` with
  `node_aggregate_only`.
- Japan Mihomo `/connections` had runtime users and byte fields.
- The protected runtime credential map was present.
- Runtime user to credential-map match count was zero.

Xray VLESS dry collection was healthy:

- Japan VLESS produced collector observations.
- SGP VLESS produced collector observations.

This means the env sync fixed the startup dependency, but the collector cannot
fully pass until Japan TUIC runtime-user to `edgeCredentialRef` mapping is
reconciled or Japan TUIC is moved to a delta sidecar model equivalent to the
SGP TUIC path.

## Rollback

Approved rollback remains:

1. Restore or remove the new traffic collector drop-in from backup.
2. Run `systemctl daemon-reload`.
3. Run `systemctl reset-failed gccgw-traffic-usage-collect.service`.
4. Start validation only if needed.
5. Keep the timer state as before.

Rollback was not executed because the drop-in removed the startup blocker and
allowed partial usage accounting records. Reverting it would restore the
previous Admin auth startup failure.

## Safety

No DNS, Nginx, firewall, SGP runtime, Xray, Hy2, TUIC, Mihomo, schema,
credential, token, subscription URL, raw env, raw log, raw config, SQLite row,
controller payload, or customer-private data was printed or recorded.
