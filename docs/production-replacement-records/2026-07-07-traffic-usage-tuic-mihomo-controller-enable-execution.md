# Traffic Usage TUIC Mihomo Controller Enable Execution

- Date: 2026-07-07
- Target: `vul1/gccgw-vultr-candidate`
- Risk: A
- Scope: enable Mihomo loopback controller and protected TUIC credential map,
  then verify whether TUIC usage collector can be enabled
- Sensitive output: suppressed

## Approval

The operator approved `traffic-usage-tuic-mihomo-controller-enable-20260707`.

Allowed scope:

- Back up `/etc/mihomo/config.yaml`, `mihomo-tuic.service`, current runtime,
  env files, traffic usage collector units, and the control database.
- Add loopback-only Mihomo `external-controller` on `127.0.0.1:19090` with a
  protected random secret.
- Preserve existing TUIC listener, users, and TLS material.
- Generate a protected runtime-user to `edgeCredentialRef` credential map.
- Run Mihomo config-test, restart `mihomo-tuic.service`, and verify loopback
  binding and TUIC UDP listener health.
- Run redacted TUIC per-credential proof.
- Enable backend TUIC usage env only if proof returns per-credential rows and
  the collector can be safely scoped.

Explicit non-goals:

- Do not change Xray, Hysteria2, DNS, Nginx, firewall, or SQLite schema.
- Do not output subscription links, tokens, passwords, private keys, raw env,
  raw config, credential map content, controller payloads, or SQLite rows.

## Execution

Backup directory:

```text
/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-tuic-mihomo-controller-enable-20260707-20260707135954
```

Backed up:

- active Mihomo config
- Mihomo systemd service view
- traffic usage collector service and timer views
- base and current env files when present
- current runtime archive
- control database files

Mihomo controller and map:

```text
runtime_user_count=84
tuic_material_record_count=103
credential_map_count=84
credential_map_mode=600
candidate_config_test=ok
mihomo_restart=ok
controller_loopback=ok
controller_non_loopback=absent
tuic_udp443=ok
```

Post-change Mihomo config hash:

```text
96b63f50dbbcd035335dd1854aeb15cbdff5cd712c452cc3ad2674739d804ef9
```

## Proof Result

The redacted TUIC proof returned per-credential rows:

```text
proof_exit=0
proof_ready=yes
proof_observation_count=2
proof_aggregate_only_blocked=no
proof_sensitive_suppressed=yes
```

The backend collector env was not enabled because production currently has two
configured TUIC channels while the backend source lacks a Mihomo-specific
channel scope env. Enabling the env now could apply the Japan Mihomo controller
snapshot to both Japan and Singapore TUIC collectors.

```text
configured_tuic_channel_count=2
requested_edge_channel_count=13
mihomo_scope_safe_for_env=no
tuic_collector_env=skipped_channel_scope_blocker
```

The current env remains unset:

```text
EDGE_MIHOMO_USAGE_CONTROLLER_URL=absent
EDGE_MIHOMO_USAGE_METRICS_PATH=absent
EDGE_MIHOMO_USAGE_CONTROLLER_SECRET=absent
EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH=absent
```

## Collector Check

The existing collector was triggered after the fail-closed decision. Current
non-TUIC collectors remain healthy:

```text
collector_trigger_exit=0
collector_count=3
collector_observation_count=14
collector_recorded_count=14
collector_unresolved_count=0
collector_next_action=continue_usage_monitoring
```

Service state:

```text
mihomo-tuic.service=active
proxy-gateway-candidate.service=active
gccgw-traffic-usage-collect.timer=active
```

## Follow-Up Gate

Before enabling TUIC usage env, add and deploy a Mihomo-specific scope control
such as `EDGE_MIHOMO_USAGE_CHANNEL_REFS=channel-vultr-a-tuic`, then rerun the
same proof and collector check. This should be a separate backend change and
production approval.

## Rollback

Rollback requires a separate exact approval. Shape:

1. Restore `/etc/mihomo/config.yaml` from the backup directory.
2. Restore or remove the protected TUIC credential map and controller secret as
   required by the rollback scope.
3. Restart `mihomo-tuic.service`.
4. Re-run loopback, UDP 443, service, and collector checks.

Backend env was not changed during this execution, so no TUIC usage env rollback
is required.
