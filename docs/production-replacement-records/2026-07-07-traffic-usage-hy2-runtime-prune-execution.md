# Traffic Usage Hysteria2 Runtime Prune Execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_hy2_runtime_prune_execution
  superseded_by: null
  last_verified_at: 2026-07-07
  production_authority: false
```


Date: 2026-07-07 UTC

Risk: A

Release: `traffic-usage-hy2-runtime-prune-20260707`

Target: `vul1` / `gccgw-vultr-candidate`

## Approval

The operator approved:

- backing up the current runtime, root/current env files, Hysteria2 active
  config, Hysteria2 service unit, traffic usage collector service/timer units,
  and the control database;
- generating a `channel-vultr-a-hy2` Hysteria2 `userpass` candidate from the
  current control database and material store;
- keeping only delivered/issued, unexpired desired credentials;
- preserving 74 active desired credentials and pruning 10 runtime-only
  credentials;
- replacing `/etc/hysteria/config.yaml` only after config validation;
- restarting `hysteria2.service`;
- restarting/triggering `gccgw-traffic-usage-collect.service/timer`;
- no TUIC/Mihomo controller enablement;
- no Xray/VLESS stats changes;
- no DNS, Nginx, firewall, or SQLite schema changes;
- no output of subscription URLs, tokens, passwords, private keys, raw env,
  raw config, or SQLite rows.

## Execution

The first execution attempt stopped before mutation because the installed
Hysteria2 binary does not support `hysteria server -c <file> --check`.

No active config replacement or service restart occurred during that failed
attempt. It produced a redacted backup and candidate file only.

The second execution used an equivalent config validation path:

- generated the approved active candidate;
- generated a separate validation candidate with only `listen` and
  `trafficStats.listen` moved to loopback high ports;
- started Hysteria2 against the validation candidate with a 2-second process
  timeout;
- treated timeout as success because the process stayed alive long enough to
  prove the config parsed and started;
- replaced the active Hysteria2 config with the approved candidate;
- restarted `hysteria2.service`;
- restarted the traffic usage collector timer;
- triggered one collector run.

## Backups

Successful execution backup root:

`/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-hy2-runtime-prune-20260707-20260707T073840304Z`

Pre-mutation blocked attempt backup root:

`/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-hy2-runtime-prune-20260707-20260707T073448320Z`

Backed up in the successful execution:

- `/opt/proxy-gateway-minimal-candidate/current`;
- `/opt/proxy-gateway-minimal-candidate/.env`;
- `/opt/proxy-gateway-minimal-candidate/current/.env`;
- Hysteria2 active config;
- `hysteria2.service`;
- `gccgw-traffic-usage-collect.service`;
- `gccgw-traffic-usage-collect.timer`;
- control database via SQLite online backup.

## Validation

Pre-mutation gate:

- DB Hy2 rows: 91.
- Portal status counts: `delivered=77`, `disabled=14`.
- Desired active Hy2 credentials: 74.
- Current runtime credentials before prune: 84.
- Add count: 0.
- Prune count: 10.
- Unchanged count: 74.
- Material missing count: 0.
- Material digest mismatch count: 0.

Config validation:

- Native `--check` support: false.
- Fallback method: loopback validation candidate plus 2-second start timeout.
- Fallback validation result: passed.

Post-mutation validation:

- Active Hysteria2 config changed: yes.
- `hysteria2.service`: restarted and active.
- Hysteria2 UDP listener: present on the configured port.
- `gccgw-traffic-usage-collect.timer`: restart exit code 0 and active.
- Triggered collector run:
  - `ok=true`;
  - `rawReportOk=true`;
  - `observationCount=0`;
  - `recordedCount=0`;
  - `unresolvedCount=0`;
  - `mappingReviewRequired=false`;
  - both `channel-vultr-a-hy2` and `channel-sgp-a-hy2` collectors returned
    successfully.
- Post-restart Hysteria2 stats membership:
  - `statsEntryCount=0`;
  - runtime-only positive memberships: 0;
  - unknown positive memberships: 0.
- `proxy-gateway-candidate.service`: active.
- `hysteria2.service`: active.
- `gccgw-traffic-usage-collect.timer`: active.

## Production Actions Not Performed

- No DNS change.
- No Nginx change or reload.
- No firewall change.
- No SQLite schema change.
- No TUIC/Mihomo controller enablement.
- No Xray/VLESS stats, API, or policy config change.
- No subscription URL, token, password, private key, raw env, raw config, or
  SQLite row was output.

## Rollback

If rollback is required:

1. Restore the Hysteria2 active config from the successful execution backup
   root to the configured active config path.
2. Restore ownership and mode from the backup copy.
3. Restart `hysteria2.service`.
4. Run `systemctl reset-failed gccgw-traffic-usage-collect.service`.
5. Restart or wait for `gccgw-traffic-usage-collect.timer`.
6. Trigger one collector run and verify service/timer health.
7. Restore env files, systemd units, control database, or the runtime directory
   from backup only if a later approved change mutates those files.
