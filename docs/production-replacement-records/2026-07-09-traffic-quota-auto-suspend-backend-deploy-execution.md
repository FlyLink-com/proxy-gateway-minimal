# Traffic Quota Auto-Suspend Backend Deploy Execution - 2026-07-09 UTC


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_quota_auto_suspend_backend_deploy_execution
  superseded_by: null
  last_verified_at: 2026-07-09
  production_authority: false
```


Risk: A

## Scope

Target: Vultr Japan control plane only, `gccgw-vultr-candidate`.

Approved release:

- Release: `traffic-quota-auto-suspend-20260709-001`
- Source commit: `4be714488e6ebabb40e25d31f99a61fa076382e4`
- Artifact SHA-256:
  `5ABB0A554C9D9D04CD8F253303804F57724FC43DA0EF3F55715CA43A4D1C6AD0`
- Previous release:
  `subscription-artifact-binding-observe-20260708-001`

No DNS, Nginx config/reload, firewall, SGP runtime, Xray, Hysteria2, TUIC,
Mihomo, SGP agent, schema migration, credential material, token, subscription
URL, raw environment, raw log, raw config, SQLite row, customer-private data, or
AppsFlyer live setting was output or mutated.

## Precheck

- Local artifact existed and matched the approved SHA-256.
- Production current release matched
  `subscription-artifact-binding-observe-20260708-001`.
- `proxy-gateway-candidate.service`: active.
- `gccgw-traffic-usage-collect.timer`: active.
- Xray and Mihomo runtime services were active.
- Public/private boundary precheck:
  - `/api/health`: `200`
  - portal root: `200`
  - `/portal/register/`: `200`
  - unauthenticated Admin API: `404`
  - no-token subscription boundary: `401`

## Backup

Backup root:

```text
/opt/proxy-gateway-minimal-candidate/backups/traffic-quota-auto-suspend-20260709-001-20260709T054042Z
```

Backed up:

- current symlink pointer and rollback release pointer
- protected EnvironmentFiles
- protected proxy/config paths discovered from the service environment
- control/subscription SQLite files and sidecar files
- `proxy-gateway-candidate.service`
- `gccgw-traffic-usage-collect.service`
- `gccgw-traffic-usage-collect.timer`

Backup summary:

```text
backup_file_count=23
env_file_backup_count=5
protected_path_backup_count=5
sqlite_sidecar_backup_count=4
```

## Deploy

- Uploaded the reviewed artifact to the Japan host.
- Verified host-side artifact SHA-256.
- Unpacked to:
  `/opt/proxy-gateway-minimal-candidate/releases/traffic-quota-auto-suspend-20260709-001`
- Preserved the existing protected current `.env` into the new release because
  the production service uses the current-release environment file pattern.
- Ran `npm ci` in the new release: exit `0`.
- Verified quota auto-suspend markers in the deployed release.
- Switched `/opt/proxy-gateway-minimal-candidate/current` from
  `subscription-artifact-binding-observe-20260708-001` to
  `traffic-quota-auto-suspend-20260709-001`.
- Restarted only `proxy-gateway-candidate.service`.

## Validation

Service and release:

```text
current_release=traffic-quota-auto-suspend-20260709-001
proxy-gateway-candidate.service=active
gccgw-traffic-usage-collect.timer=active
xray-vless-reality.service=active
mihomo-tuic.service=active
quota_marker_active=true
```

Public/private boundary:

```text
/api/health=200
portal_root=200
/portal/register/=200
admin_unauthenticated=404
subscription_no_token=401
```

Runtime source boundaries:

```text
xray_10085_loopback_listeners=1
xray_10085_non_loopback_listeners=0
mihomo_19090_loopback_listeners=1
mihomo_19090_non_loopback_listeners=0
```

Traffic collector validation:

```text
gccgw-traffic-usage-collect.service=success
collectorCount=5
observationCount=25
recordedCount=24
insertedCount=24
unresolvedCount=1
quotaDisableRequiredCount=0
nextAction=continue_usage_monitoring_review_unresolved_mapping
redacted=true
```

Collector channel summary:

```text
channel-vultr-a-hy2=collected unresolvedCount=1
channel-sgp-a-hy2=collected unresolvedCount=0
channel-vultr-a-tuic=collected unresolvedCount=0
channel-vultr-a-vless-reality-tcp=collected unresolvedCount=0
channel-sgp-a-vless-reality-tcp=collected unresolvedCount=0
```

## Residual Follow-Up

- The remaining `unresolvedCount=1` is the pre-existing
  `channel-vultr-a-hy2` mapping residue and should be handled as a separate HY2
  mapping cleanup.
- This deployment activates the backend path that can automatically suspend
  traffic supply at quota limit. It does not disable user accounts, delete
  records, refund payments, or expose operator override controls.

## PR Deploy Note

PR #417 was updated with a Deploy Note after validation:

```text
https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/417#issuecomment-4921939795
```

## Rollback

Rollback remains symlink based:

1. Restore `/opt/proxy-gateway-minimal-candidate/current` to
   `subscription-artifact-binding-observe-20260708-001`.
2. Restore protected backups from the backup root only if needed.
3. Restart only `proxy-gateway-candidate.service`.
4. Revalidate service health, public/private boundaries, runtime loopback
   boundaries, and one redacted traffic collector run.
