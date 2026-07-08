# Traffic Usage TUIC Per-Credential Source Execution

- Date: 2026-07-07
- Target: `vul1/gccgw-vultr-candidate`
- Risk: A
- Scope: source-only TUIC usage source/proof deployment
- Production impact: `proxy-gateway-candidate.service` backend restart only
- Sensitive output: suppressed

## Approval

The operator approved:

```text
traffic-usage-tuic-per-credential-source-20260707
```

Allowed scope:

- Upload and verify:
  - `server/services/edge/mihomo-external-controller-usage-reader.mjs`
  - `server/state.mjs`
  - `scripts/tuic-per-credential-usage-proof.mjs`
- Back up current runtime tree, env files, traffic usage collector systemd unit
  and timer, and the control database.
- Cover only the reviewed backend/proof files.
- Restart only `proxy-gateway-candidate.service`.
- Run redacted service/proof checks.

Explicit non-goals:

- Do not set `EDGE_MIHOMO_USAGE_CONTROLLER_URL`.
- Do not set `EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH`.
- Do not set `EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_JSON`.
- Do not enable the Mihomo/TUIC usage collector.
- Do not change `/etc/mihomo/config.yaml`.
- Do not restart `mihomo-tuic.service`.
- Do not change DNS, Nginx, firewall, or SQLite schema.
- Do not output subscription links, tokens, passwords, private keys, raw env,
  raw config, or SQLite rows.

## Local Validation

Before deployment:

```text
node --test server/tests/edge-mihomo-external-controller-usage-reader.test.mjs server/tests/edge-mihomo-tuic-usage-collector.test.mjs server/tests/tuic-per-credential-usage-proof-script.test.mjs server/tests/state.test.mjs
```

Result:

```text
51 passed
```

Reviewed source hashes:

```text
server/services/edge/mihomo-external-controller-usage-reader.mjs 9d4a0bf746c30622b176509c77a995045f0b242243cddea6c92cbfa5fa35c32b
server/state.mjs ce962ea99491f30445bf14e452bff5a22d6f852be561fa2ee300e91f909a67f9
scripts/tuic-per-credential-usage-proof.mjs 81a9dbec93419d538e8e0d14b1e8608cfc69065b2cd0bbcb80850c72766e2e53
```

## Remote Read-Only Precheck

Observed before mutation:

```text
proxy-gateway-candidate.service: active
gccgw-traffic-usage-collect.timer: active
EDGE_MIHOMO_USAGE_CONTROLLER_URL: absent
EDGE_MIHOMO_USAGE_METRICS_PATH: absent
EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH: absent
EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_JSON: absent
```

## Execution

Uploaded files to an isolated staging directory and verified SHA-256 before
copying.

Backup directory:

```text
/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-tuic-per-credential-source-20260707-20260707132634
```

Backups completed:

- current runtime tree
- base env file, when present
- current env file, when present
- `gccgw-traffic-usage-collect.service`
- `gccgw-traffic-usage-collect.timer`
- control database files

Deployed file hashes after copy:

```text
server/services/edge/mihomo-external-controller-usage-reader.mjs 9d4a0bf746c30622b176509c77a995045f0b242243cddea6c92cbfa5fa35c32b
server/state.mjs ce962ea99491f30445bf14e452bff5a22d6f852be561fa2ee300e91f909a67f9
scripts/tuic-per-credential-usage-proof.mjs 81a9dbec93419d538e8e0d14b1e8608cfc69065b2cd0bbcb80850c72766e2e53
```

Restarted:

```text
proxy-gateway-candidate.service
```

Not restarted:

```text
mihomo-tuic.service
```

## Postcheck

Service state:

```text
proxy-gateway-candidate.service: active
gccgw-traffic-usage-collect.timer: active
mihomo-tuic.service: active
```

TUIC usage proof check:

```text
readyToEnableCollector: false
sensitiveOutputSuppressed: true
```

This is expected because the deployment was source-only and did not configure a
Mihomo usage controller or credential map.

Systemd collector validation:

```text
collectorCount: 3
observationCount: 14
recordedCount: 14
insertedCount: 14
unresolvedCount: 0
nextAction: continue_usage_monitoring
```

Collector channels remained:

```text
channel-vultr-a-hy2
channel-sgp-a-hy2
channel-vultr-a-vless-reality-tcp
```

No TUIC collector was enabled.

Recent `proxy-gateway-candidate.service` journal scan returned no matching
error, exception, failed, or unhandled lines after restart.

## Rollback

Rollback source:

```text
/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-tuic-per-credential-source-20260707-20260707132634
```

Rollback shape:

1. Restore the three covered files from the backup tree.
2. Restore env/unit/control-db backups only if the rollback scope explicitly
   requires them.
3. Restart `proxy-gateway-candidate.service`.
4. Re-run the redacted service and collector checks.

Rollback still requires a separate exact approval before execution.
