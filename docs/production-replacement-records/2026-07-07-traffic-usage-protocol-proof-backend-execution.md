# Traffic Usage Protocol Proof Backend Execution - 2026-07-07

## Approval

- Approval ref: `traffic-usage-protocol-proof-backend-20260707`
- Target: `vul1/gccgw-vultr-candidate`
- Risk tier: A
- Operator-approved scope:
  - Upload and verify reviewed backend overlay.
  - Back up candidate current release, env files, collector systemd unit/timer,
    and control databases.
  - Cover only backend/proof files.
  - Run redacted proof and collector checks.

## Deployed Files

- `server/state.mjs`
- `server/services/edge/xray-stats-cli-usage-reader.mjs`
- `server/services/edge/xray-vless-usage-collector.mjs`
- `scripts/vless-xray-stats-usage-proof.mjs`
- `scripts/tuic-per-credential-usage-proof.mjs`

## Explicit Non-Goals

- Did not enable `EDGE_XRAY_STATS_SERVER`.
- Did not enable Mihomo/TUIC controller env.
- Did not modify `/etc/xray/config.json`.
- Did not restart `xray-vless-reality.service`.
- Did not modify DNS, Nginx, firewall, env files, or SQLite schema.
- Did not print subscription links, tokens, passwords, private keys, raw env,
  raw configs, or SQLite rows.

## Local Validation

- Targeted tests passed:
  - `server/tests/edge-xray-stats-cli-usage-reader.test.mjs`
  - `server/tests/edge-xray-vless-usage-collector.test.mjs`
  - `server/tests/vless-xray-stats-usage-proof-script.test.mjs`
  - `server/tests/tuic-per-credential-usage-proof-script.test.mjs`
- Result: 8 tests passed.
- `git diff --check -- <approved files>` exited 0 with only the existing
  LF-to-CRLF warning on `server/state.mjs`.

## Remote Inventory

- `proxy-gateway-candidate.service`: active/enabled.
- `gccgw-traffic-usage-collect.timer`: active/enabled.
- `gccgw-traffic-usage-collect.service`: inactive/static.
- `xray-vless-reality.service`: active/enabled.
- `mihomo-tuic.service`: active/enabled.
- `hysteria2.service`: active/enabled.
- Xray and Mihomo usage collector env remained absent before deployment.
- Xray config had no `stats`, no `api`, no `policy`, and no API-tagged inbound.

## Backup

- Backup root:
  `/opt/proxy-gateway-minimal-candidate/backups/traffic-usage-protocol-proof-backend-20260707-20260707T084452Z`
- Verified backup artifacts:
  - current release directory
  - app env file
  - current env file
  - `gccgw-traffic-usage-collect.service`
  - `gccgw-traffic-usage-collect.timer`
  - control database copy
  - subscription database copy

## Deployment Validation

- Staged overlay hashes matched the local reviewed files before deploy.
- Deployed file hashes matched the reviewed overlay after deploy.
- Xray config SHA-256 matched the pre-deploy hash after deploy.
- Xray and Mihomo usage collector env remained absent after deploy.
- Service states remained unchanged after deploy.
- Redacted collector check:
  - `ok: true`
  - `collectorCount: 2`
  - channels: `channel-vultr-a-hy2`, `channel-sgp-a-hy2`
- Redacted VLESS proof:
  - fail-closed
  - `readyToEnableCollector: false`
  - blocker: `xray_user_stats_required`
- Redacted TUIC proof:
  - fail-closed
  - `readyToEnableCollector: false`
  - no usage ledger write

## Rollback

Rollback uses the verified backup root above. Restore the backed-up current
release and env/unit artifacts, then run the same redacted checks. No rollback
was needed for this execution.
