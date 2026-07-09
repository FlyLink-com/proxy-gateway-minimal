# Japan TUIC Usage Credential Map Rebuild

Date: 2026-07-08 America/Los_Angeles

Risk: A

Target: Vultr Japan control plane `45.76.222.52` only

Release context:

- Current release: `subscription-artifact-binding-observe-20260708-001`
- Related PR: #416
- Release unit: `japan-runtime-config`

## Purpose

After the traffic collector Admin auth environment sync, the remaining stable
collector blocker was Japan TUIC usage accounting:

- `channel-vultr-a-tuic` reported `collector_not_supported`.
- The blocker was `node_aggregate_only`.
- Read-only investigation showed current Mihomo connections had runtime users
  and byte fields.
- The protected usage credential map was present but did not include the active
  runtime user.

This record captures the approved protected map rebuild from the current
Mihomo config UUID set and protected edge credential material records.

## Approved Scope

- Read-only precheck.
- Back up the current protected Japan TUIC usage credential map and metadata.
- Rebuild a candidate map from `/etc/mihomo/config.yaml` UUIDs and protected
  `EDGE_CREDENTIAL_MATERIAL_PATH` records.
- Do not print UUIDs, credential refs, map content, raw configs, raw env, raw
  logs, controller payloads, SQLite rows, or customer-private data.
- Validate candidate counts before write:
  - `add=1`
  - `remove=6`
  - `missingMaterial=0`
- Replace only the protected usage credential map file.
- Preserve owner and mode `600`.
- Do not restart proxy gateway, Mihomo, Xray, Hysteria2, TUIC, Nginx, DNS, or
  firewall services.
- Run `systemctl reset-failed` and start
  `gccgw-traffic-usage-collect.service` once for validation.
- Keep `gccgw-traffic-usage-collect.timer` active.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/japan-tuic-usage-credential-map-rebuild-20260709-20260709T035050Z`

Backed up items:

- protected Japan TUIC usage credential map file
- safe metadata with owner, mode, size, and hash

The backup has two files. The original map content was not printed or recorded
in this repository.

## Change Applied

The protected Japan TUIC usage credential map was rebuilt and replaced
atomically.

Redacted write summary:

- previous map count: `84`
- rebuilt map count: `79`
- add count: `1`
- remove count: `6`
- missing material count: `0`
- final mode: `600`
- owner preserved: yes

## Validation

Pre-write dry-run:

- Candidate map produced `channel-vultr-a-tuic` dry collect status
  `collected`.
- Candidate observation count was `1`.
- Candidate blockers were empty.
- Safety flags remained redacted.

First one-shot collector validation after write:

- `channel-vultr-a-tuic` became `collected`.
- JP TUIC recorded `1` observation.
- The service still exited non-zero because `channel-sgp-a-vless-reality-tcp`
  had a transient `xray_user_stats_required` empty-counter window.

Read-only follow-up showed SGP VLESS immediately collected again through the
same adapter.

Second one-shot collector validation:

- `gccgw-traffic-usage-collect.service` exit status: `0`
- `collectorCount=5`
- `observationCount=28`
- `recordedCount=28`
- `insertedCount=28`
- `unresolvedCount=0`
- `nextAction=continue_usage_monitoring`
- `channel-vultr-a-tuic`: `collected`, `observationCount=1`,
  `recordedCount=1`
- all five active collectors reported `collected`
- `gccgw-traffic-usage-collect.timer`: active
- `proxy-gateway-candidate.service`: active

Final boundary checks:

- current release remained `subscription-artifact-binding-observe-20260708-001`
- Xray and Mihomo loopback listeners remained present
- Japan Xray stats query succeeded
- SGP Xray tunnel stats query succeeded
- Japan Mihomo controller authenticated status was healthy
- SGP Mihomo tunnel controller authenticated status was healthy

## Remaining Engineering Work

The production fix restored the current map, but the underlying design should
not rely on a one-time protected map snapshot. Follow-up source work should add
one or both of:

- a protected verify/rebuild helper for Mihomo TUIC usage maps;
- a migration path for Japan TUIC accounting to a connection-delta sidecar
  similar to the SGP TUIC sidecar.

## Rollback

Approved rollback shape:

1. Restore the backed-up protected usage credential map only.
2. Run `systemctl reset-failed gccgw-traffic-usage-collect.service`.
3. Start collector validation only if needed.
4. Keep the timer state as before.

Rollback was not executed because validation passed after the map rebuild.

## Safety

No DNS, Nginx, firewall, SGP runtime, Xray, Hy2, TUIC, Mihomo runtime, schema,
credential, token, subscription URL, raw env, raw log, raw config, SQLite row,
controller payload, map content, UUID, or customer-private data was printed or
recorded.
