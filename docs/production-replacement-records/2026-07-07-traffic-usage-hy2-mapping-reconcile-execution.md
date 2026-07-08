# Traffic Usage Hysteria2 Mapping Reconcile Execution

Date: 2026-07-07 UTC

Risk: A

Release: `traffic-usage-hy2-mapping-reconcile-20260707`

Target: `vul1` / `gccgw-vultr-candidate`

## Approval

The operator approved:

- backing up current runtime, root/current env files, Hysteria2 config, related
  systemd units, and the control database;
- fixing Hysteria2 usage mapping drift or explicitly defining unresolved
  observation handling;
- restarting `gccgw-traffic-usage-collect.timer/service`;
- restarting `hysteria2.service` only if config-test passed and restart was
  necessary;
- no Mihomo/TUIC controller enablement;
- no Xray/VLESS stats changes;
- no DNS, Nginx, firewall, or SQLite schema changes;
- no output of subscription URLs, tokens, passwords, private keys, raw env,
  raw config, or SQLite rows.

## Change

Only the traffic usage oneshot script was replaced:

- `/opt/proxy-gateway-minimal-candidate/current/scripts/traffic-usage-collect-once.mjs`

The script now treats `unresolved_binding` observations as tolerated mapping
residue for timer health when all collectors succeeded and the only failed
records are unresolved bindings. It still records resolved observations, keeps
the unresolved count visible in the redacted JSON summary, and returns a
successful process exit so the systemd timer is not marked failed by orphan
runtime observations.

This does not attribute unknown runtime credentials to users and does not solve
the underlying Hysteria2 runtime/control-plane credential drift. That drift
remains a follow-up reconciliation task.

## Backups

Backup root:

`/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-hy2-mapping-reconcile-20260707-20260707T070734Z`

Backed up:

- current runtime directory;
- root env file;
- current env file;
- Hysteria2 runtime config;
- `gccgw-traffic-usage-collect.service`;
- `gccgw-traffic-usage-collect.timer`;
- `hysteria2.service`;
- control database via SQLite online backup;
- previous traffic usage script SHA-256.

## Validation

Local validation before upload:

- `node --test server/tests/traffic-usage-collect-once.test.mjs`: 5 passed.
- `git diff --check -- scripts/traffic-usage-collect-once.mjs server/tests/traffic-usage-collect-once.test.mjs docs/production-replacement-records/2026-07-07-traffic-usage-other-protocols-readonly-inventory.md`: passed.
- `npm test`: 913 passed.

Production validation after upload:

- Deployed script SHA-256:
  `079bb82aa0626dc89af594ff55720666a8a5ca8da0850d97a46d09cd7798441a`.
- `gccgw-traffic-usage-collect.timer`: active.
- `gccgw-traffic-usage-collect.service`: latest run result `success`, exit
  status `0`.
- `proxy-gateway-candidate.service`: active.
- `nginx`: active.
- `hysteria2.service`: active.
- `mihomo-tuic.service`: active.
- `xray-vless-reality.service`: active.
- Latest redacted collector run showed:
  - `ok=true`;
  - `rawReportOk=false`;
  - `unresolvedBindingTolerated=true`;
  - `mappingReviewRequired=true`;
  - no raw runtime payload or secret material returned.

## Production Actions Not Performed

- No `hysteria2.service` restart was performed.
- No Mihomo/TUIC controller was enabled.
- No Xray/VLESS stats, API, or policy config was changed.
- No DNS, Nginx, firewall, or SQLite schema was changed.
- No account, order, entitlement, payment, subscription material, or runtime
  credential was mutated.

## Rollback

To roll back this execution:

1. Restore the backed-up script from the backup root to
   `/opt/proxy-gateway-minimal-candidate/current/scripts/traffic-usage-collect-once.mjs`.
2. Restore ownership and mode from the backup copy.
3. Run `systemctl reset-failed gccgw-traffic-usage-collect.service`.
4. Start or wait for `gccgw-traffic-usage-collect.timer`.
5. Verify the previous script SHA from `current-script.sha256` in the backup
   root and check service state.

Use the backed-up Hysteria2 config, env files, systemd units, and control
database only if a later action mutates those files.
