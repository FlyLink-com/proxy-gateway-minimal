# Account Resource Delivery Lifecycle Backend Deploy Execution - 2026-07-09 UTC


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: account_resource_delivery_lifecycle_backend_deploy_execution
  superseded_by: null
  last_verified_at: 2026-07-09
  production_authority: false
```


Risk: A

## Scope

Target: Vultr Japan control plane only, `gccgw-vultr-candidate`.

Approved release:

- Release: `account-resource-delivery-lifecycle-20260709-001`
- Source commit: `a27b843f799915f17a2fffd799829154391e2e34`
- Artifact SHA-256:
  `F58F7464F8EA2F8FB60118AA206C9F234732B0989CE72494D6B9C7F9E513C638`
- Previous release: `traffic-quota-auto-suspend-20260709-001`

No DNS, Nginx config/reload, firewall, SGP runtime, Xray, Hysteria2, TUIC,
Mihomo, SGP agent, schema migration, credential material, token, subscription
URL, raw environment, raw log, raw config, SQLite row, customer-private data, or
AppsFlyer live setting was output or mutated.

## Precheck

- Local artifact existed and matched the approved SHA-256.
- Production current release matched `traffic-quota-auto-suspend-20260709-001`.
- `proxy-gateway-candidate.service`: active.
- `gccgw-traffic-usage-collect.timer`: active.
- `gccgw-traffic-usage-collect.service`: failed before release switch.
- Node.js `v22.22.3` and npm `10.9.8` were available.
- `unzip` was present.

## Backup

Backup root:

```text
/opt/proxy-gateway-minimal-candidate/backups/account-resource-delivery-lifecycle-20260709-001-20260709T092722Z
```

Backed up:

- current symlink pointer and rollback release pointer
- protected EnvironmentFiles
- protected proxy/config paths discovered from the service environment
- control/subscription SQLite files through online backup where available
- `proxy-gateway-candidate.service`
- `gccgw-traffic-usage-collect.service`
- `gccgw-traffic-usage-collect.timer`
- relevant systemd drop-ins

Backup summary:

```text
protected_and_service_copy_count=8
sqlite_backup_count=2
backup_ok=yes
```

## Deploy

- Uploaded the reviewed artifact to the Japan host.
- Verified host-side artifact SHA-256.
- Unpacked to:
  `/opt/proxy-gateway-minimal-candidate/releases/account-resource-delivery-lifecycle-20260709-001`
- Preserved the existing protected current `.env` into the new release because
  the production service uses the current-release environment file pattern.
- Ran `npm ci` in the new release: exit `0`.
- Verified account resource delivery lifecycle markers:
  - `account_resource_delivery_generation`
  - `forceRotateCredential`
- Switched `/opt/proxy-gateway-minimal-candidate/current` from
  `traffic-quota-auto-suspend-20260709-001` to
  `account-resource-delivery-lifecycle-20260709-001`.
- Restarted only `proxy-gateway-candidate.service`.

## Validation

Service and release:

```text
current_release=account-resource-delivery-lifecycle-20260709-001
proxy-gateway-candidate.service=active
gccgw-traffic-usage-collect.timer=active
```

Public/private boundary:

```text
/api/health=200
portal_root=200
/portal/register/=200
admin_unauthenticated=404
subscription_invalid_or_no_token_boundary=404
```

Runtime code marker:

```text
marker_delivery=yes
marker_force_rotate=yes
```

Traffic collector validation:

```text
gccgw-traffic-usage-collect.service=failed
collector_start_exit=1
collectorCount=5
observationCount=7
recordedCount=7
insertedCount=7
unresolvedCount=0
quotaDisableRequiredCount=0
redacted=true
```

Collector channel summary from the redacted service summary:

```text
channel-vultr-a-hy2=collected unresolvedCount=0
channel-sgp-a-hy2=collected unresolvedCount=0
channel-vultr-a-tuic=collector_error blocker=collector_exception
channel-vultr-a-vless-reality-tcp=collector_error blocker=collector_exception
channel-sgp-a-vless-reality-tcp=collected unresolvedCount=0
```

Read-only runtime listener follow-up:

```text
xray_10085_loopback=0
xray_10085_non_loopback=0
mihomo_19090_loopback=0
mihomo_19090_non_loopback=0
xray-vless-reality.service=active
mihomo-tuic.service=active
```

## Validation Result

The control-plane backend deploy completed and the public/private backend
boundary passed. The traffic collector validation did not pass. The collector
service was already failed during precheck, and the failed validation points to
Japan local usage runtime listener absence for `127.0.0.1:10085` and
`127.0.0.1:19090`, not to the PR #418 code diff.

Rollback was not executed because the deployed backend release remained active,
health checks passed, and rolling back to
`traffic-quota-auto-suspend-20260709-001` would not address the pre-existing
collector/runtime listener failure. The next action is a separate Japan usage
runtime repair gate.

## PR Deploy Note

PR #418 was updated with a Deploy Note after validation:

```text
https://github.com/gaoyi1020-web/proxy-gateway-minimal/pull/418#issuecomment-4923652873
```

## Rollback Reference

If a backend rollback becomes necessary:

1. Restore `/opt/proxy-gateway-minimal-candidate/current` to
   `traffic-quota-auto-suspend-20260709-001`.
2. Restore protected backups from the backup root only if needed.
3. Restart only `proxy-gateway-candidate.service`.
4. Revalidate service health, public/private boundaries, account delivery
   lifecycle behavior, and the separately tracked traffic usage collector state.
