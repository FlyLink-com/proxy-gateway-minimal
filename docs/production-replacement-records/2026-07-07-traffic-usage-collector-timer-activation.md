# Traffic Usage Collector Timer Activation


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: traffic_usage_collector_timer_activation
  superseded_by: null
  last_verified_at: 2026-07-07
  production_authority: false
```


Date: 2026-07-06 America/Los_Angeles / 2026-07-07 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Release: `traffic-usage-collector-timer-20260706-231616`

## Approval

The operator approved:

- upload and verify `scripts/traffic-usage-collect-once.mjs`;
- back up an existing script at the same path if present;
- back up related systemd service/timer units if present;
- install `gccgw-traffic-usage-collect.service` and
  `gccgw-traffic-usage-collect.timer`;
- run `--collect` every 5 minutes through the timer;
- enable and start the timer;
- no DNS, Nginx, firewall, environment, SQLite schema, or
  `proxy-gateway-candidate.service` restart;
- no automatic runtime disable or quota auto-cutoff;
- rollback by restoring the recorded backups.

## Scope

Executed:

- Uploaded the reviewed usage collector oneshot script.
- Verified the remote script SHA-256 before installation.
- Backed up existing target script/unit files where present.
- Installed:
  - `/opt/proxy-gateway-minimal-candidate/current/scripts/traffic-usage-collect-once.mjs`
  - `/etc/systemd/system/gccgw-traffic-usage-collect.service`
  - `/etc/systemd/system/gccgw-traffic-usage-collect.timer`
- Ran `systemctl daemon-reload`.
- Enabled and started `gccgw-traffic-usage-collect.timer`.

Not executed:

- No DNS change.
- No Nginx config change or reload.
- No firewall change.
- No environment file edit.
- No SQLite schema migration.
- No `proxy-gateway-candidate.service` restart.
- No subscription material, token, credential, raw runtime payload, raw usage
  row, or customer data output.
- No automatic quota disable or runtime cutoff.

## Artifacts

Final installed script SHA-256:

`17F7B5A7EBDD73AFBAE7E7C0AA8DF61D3715BF1CA3A226D45058BB4C7078BED8`

The initially uploaded script used a symlink-sensitive ESM entrypoint check.
The timer service exited successfully but did not run the collector logic. The
script was corrected to compare real paths, revalidated locally, and reinstalled
under the same approved scope before the validated timer run.

## Backups

Initial activation backup:

`/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-collector-timer-20260706-231616-20260707T061828Z`

Script fix backup:

`/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-collector-timer-20260706-231616-script-fix-20260707T062224Z`

## Validation

Local validation before activation:

- `node --test server/tests/traffic-usage-collect-once.test.mjs` passed.
- `git diff --check -- scripts/traffic-usage-collect-once.mjs server/tests/traffic-usage-collect-once.test.mjs`
  passed.
- After the symlink entrypoint fix,
  `node --test server/tests/traffic-usage-collect-once.test.mjs` passed with
  three tests.

Production read-only/pre-write validation:

- `proxy-gateway-candidate.service` was active.
- Current production environment could construct two Hysteria2 collectors:
  `channel-vultr-a-hy2` and `channel-sgp-a-hy2`.
- The `--check` path returned a redacted collector summary and did not collect
  or write usage.

Post-activation validation:

- `gccgw-traffic-usage-collect.timer` is enabled and active.
- The timer fired automatically without a manual service start.
- The oneshot service completed with `Result=success` and exit status `0`.
- Redacted collector summary from the first real timer run:
  - `collectorCount=2`;
  - `observationCount=1`;
  - `recordedCount=1`;
  - `insertedCount=1`;
  - `unresolvedCount=0`;
  - `quotaDisableRequiredCount=0`;
  - no raw runtime payload or secret material returned.
- Usage ledger counts increased from `1/1` to:
  - `usage_samples_count=2`;
  - `usage_rollups_count=2`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.

## Rollback

If rollback is required:

1. Disable and stop the timer:
   `systemctl disable --now gccgw-traffic-usage-collect.timer`.
2. Restore backed-up systemd units if present from the backup directories.
3. Restore the backed-up target script if present, or remove
   `/opt/proxy-gateway-minimal-candidate/current/scripts/traffic-usage-collect-once.mjs`
   if no previous script existed.
4. Run `systemctl daemon-reload`.
5. Recheck:
   - `gccgw-traffic-usage-collect.timer` inactive/disabled or restored;
   - `proxy-gateway-candidate.service` active;
   - `nginx` active.

Rollback does not require Nginx reload, DNS change, firewall change,
environment edit, SQLite schema change, or proxy-gateway restart unless a later
operator-approved change adds those actions.
