# Traffic Usage Xray Idle Observable Backend Deploy


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_xray_idle_observable_backend_deploy_execution
  superseded_by: null
  last_verified_at: 2026-07-09
  production_authority: false
```


Date: 2026-07-09 America/Los_Angeles

Risk: A

Target: Vultr Japan control plane `45.76.222.52` only

Release context:

- Release: `traffic-usage-xray-idle-observable-20260709-001`
- Current release before deploy: `traffic-metering-runtime-preserve-20260709-001`
- Source commit: `9a6c2dc5b8182006caa3c9358cb2e2bb12cd2590`
- Related PR: #421
- Release unit: `control-plane-app`

## Purpose

The previous traffic metering deployment restored Japan runtime metering
endpoints but still reported a collector failure when an Xray stats API was
reachable and healthy while no per-user counters had yet been observed.

This deployment promoted the backend behavior that treats that state as an
observable idle condition instead of a hard collector failure. The summary
remains redacted and only exposes safe boolean observability fields.

## Approved Scope

- Read-only precheck.
- Back up the current symlink pointer, protected environment files, protected
  proxy config, control DB, subscription DB, and service metadata.
- Upload the reviewed artifact and verify its SHA-256 on host.
- Unpack to
  `/opt/proxy-gateway-minimal-candidate/releases/traffic-usage-xray-idle-observable-20260709-001`.
- Run `npm ci`.
- Preserve production protected config and environment files.
- Switch `/opt/proxy-gateway-minimal-candidate/current` only after preflight.
- Restart `proxy-gateway-candidate.service` only.
- Reset and start `gccgw-traffic-usage-collect.service` once for validation.
- Keep `gccgw-traffic-usage-collect.timer` active.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-xray-idle-observable-20260709-001-20260709T105836Z`

The backup location was confirmed by read-only inventory after deployment.
This record does not include raw environment files, configs, database rows,
tokens, credentials, subscription URLs, or customer-private data.

## Change Applied

The control-plane app current release pointer was switched to
`traffic-usage-xray-idle-observable-20260709-001`.

The deployment did not mutate DNS, Nginx config, firewall rules, SGP runtime,
Xray, Hysteria2, TUIC, Mihomo, provider settings, schema, credentials, tokens,
or subscription material.

## Validation

Read-only confirmation after deployment:

- current release pointer:
  `traffic-usage-xray-idle-observable-20260709-001`
- `proxy-gateway-candidate.service`: active
- `gccgw-traffic-usage-collect.timer`: active
- last `gccgw-traffic-usage-collect.service` result: success
- public `/api/health`: HTTP 200
- public portal root: HTTP 200
- public portal route: HTTP 200

The validation output was kept to status codes and redacted service states. No
raw logs, environment values, config payloads, SQLite rows, credentials, tokens,
subscription URLs, runtime payloads, or customer-private data were recorded.

## Rollback

Approved rollback shape:

1. Restore the current symlink to
   `traffic-metering-runtime-preserve-20260709-001`.
2. Restore protected backups only if needed.
3. Restart `proxy-gateway-candidate.service` only.
4. Revalidate public/private boundaries and the traffic usage service.

Rollback was not executed because post-deploy read-only validation confirmed
the expected release pointer, service health, timer state, collector result,
and public health routes.
