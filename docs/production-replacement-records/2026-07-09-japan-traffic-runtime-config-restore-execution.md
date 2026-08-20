# Japan Traffic Runtime Config Restore Execution - 2026-07-09 UTC


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: japan_traffic_runtime_config_restore_execution
  superseded_by: null
  last_verified_at: 2026-07-09
  production_authority: false
```


Risk: A

## Scope

Target: Vultr Japan control plane only, `gccgw-vultr-candidate`.

The approved work restored the local Japan traffic metering runtime sources:

- Xray stats/API on loopback `127.0.0.1:10085`.
- Mihomo external controller on loopback `127.0.0.1:19090`.
- Protected Mihomo controller secret reuse from the existing collector
  environment.
- Config validation, restart of only `xray-vless-reality.service` and
  `mihomo-tuic.service`, and one redacted traffic collector validation run.

No DNS, Nginx, firewall, backend release symlink, schema, SGP runtime,
AppsFlyer live setting, credential material, token, subscription URL, raw
runtime config, raw environment, raw journal, controller payload, SQLite rows,
or customer-private data was output or recorded.

PR #417 / quota auto-suspend code was not deployed in this step.

## Root Cause

The traffic collector was healthy enough to construct the configured collectors,
but Japan's local runtime metering sources were absent:

- Xray had no `stats` / `api` / `policy` source and no loopback stats listener.
- Mihomo had no loopback external controller and no runtime controller secret in
  the active runtime config.

The collector therefore failed the Japan VLESS/Xray and Japan TUIC/Mihomo
collector paths while other collector paths could still produce partial
redacted summaries.

## Backup

Backup root:

```text
/opt/proxy-gateway-minimal-candidate/backups/japan-traffic-runtime-config-restore-20260709T052249Z
```

The backup covers:

- `/etc/xray/config.json`
- `/etc/mihomo/config.yaml`
- `xray-vless-reality.service`
- `mihomo-tuic.service`
- traffic usage service/timer metadata
- proxy candidate service metadata

## Change

- Added loopback-only Xray stats/API/policy support while preserving existing
  runtime listener, clients, Reality settings, and service ownership/mode.
- Added loopback-only Mihomo `external-controller` and protected `secret` while
  preserving existing TUIC listener, users, TLS material, and service
  ownership/mode.
- Reused the existing protected Mihomo usage-controller secret from the traffic
  collector environment without printing the value.
- Ran config validation before restart.
- Restarted only:
  - `xray-vless-reality.service`
  - `mihomo-tuic.service`
- Triggered only `gccgw-traffic-usage-collect.service` once for validation.

## Validation

Config validation:

```text
xray_config_test_exit=0
mihomo_config_test_exit=0
```

Runtime services and boundaries:

```text
xray-vless-reality.service=active
mihomo-tuic.service=active
proxy-gateway-candidate.service=active
xray_10085_loopback_listeners=1
xray_10085_non_loopback_listeners=0
mihomo_19090_loopback_listeners=1
mihomo_19090_non_loopback_listeners=0
xray_statsquery_exit=0
mihomo_no_secret_http_code=401
```

Traffic collector validation:

```text
gccgw-traffic-usage-collect.service=success
gccgw-traffic-usage-collect.timer=active
collectorCount=5
observationCount=19
recordedCount=18
insertedCount=18
unresolvedCount=1
quotaDisableRequiredCount=0
nextAction=continue_usage_monitoring_review_unresolved_mapping
redacted=true
```

Collector channel summary:

```text
channel-vultr-a-tuic=collected unresolvedCount=0
channel-vultr-a-vless-reality-tcp=collected unresolvedCount=0
channel-sgp-a-vless-reality-tcp=collected unresolvedCount=0
channel-sgp-a-hy2=collected unresolvedCount=0
channel-vultr-a-hy2=collected unresolvedCount=1
```

Public/private boundary validation:

```text
/api/health=200
portal_root=200
/portal/register/=200
admin_unauthenticated=404
subscription_no_token=401
```

## Residual Follow-Up

- The remaining `unresolvedCount=1` belongs to `channel-vultr-a-hy2` and was
  already present before this runtime-source restore. It should be handled as a
  separate HY2 mapping cleanup, not as an Xray/Mihomo runtime-source failure.
- PR #417 is merged to `origin/master` but production still needs a separate
  Risk A deployment gate before quota auto-suspend can enforce traffic supply
  cutoff.

## Rollback

Rollback should be exact and backup based:

1. Restore `/etc/xray/config.json` and `/etc/mihomo/config.yaml` from the backup
   root above.
2. Restore affected service metadata only if it drifted after this execution.
3. Restart only `xray-vless-reality.service` and `mihomo-tuic.service`.
4. Re-run config validation, loopback listener checks, no-secret controller
   protection check, and one redacted traffic collector validation run.
