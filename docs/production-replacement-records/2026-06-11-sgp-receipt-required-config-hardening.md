# SGP Receipt-Required Config Hardening


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: sgp_receipt_required_config_hardening
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-12 UTC.

Risk: A.

Target:

- Vultr Japan control plane `45.76.222.52` only.
- Vultr Singapore data plane `45.76.158.201` read-only validation only.

## Purpose

Singapore is a remote data-plane node. Its channels must be withheld from
subscription output until matching applied receipts prove that the SGP runtime
has applied the current desired-state. The runtime already gates remote channels
through `remote-data-plane-handoff`; this production hardening made that intent
explicit in Japan's protected proxy config with `requiresAppliedReceipt: true`
for the three SGP channels.

## Change

Only the protected Japan proxy config was changed. The three SGP channels were
updated:

- `channel-sgp-a-vless-reality-tcp`
- `channel-sgp-a-hy2`
- `channel-sgp-a-tuic`

No DNS, Nginx, provider firewall, SGP runtime config, payment, account,
subscription URL, token, private key, credential material, SQLite row, or raw
environment/log/config output was changed or recorded.

## Backup

Japan protected config and safe service state were backed up before mutation.

Backup directory:

```text
/var/backups/gccgw-edge/receipt-required-20260612T013243Z
```

The backup contains the prior protected proxy config and safe service-state
metadata only.

## Validation

Japan validation:

- `proxy-gateway-candidate.service`: active after restart.
- Japan local health: `200`.
- Portal public entry: `200`.
- Subscription public health: `200`.
- Public Admin route: `404`.
- No-session portal access request route: `401`.
- SGP channel count in Japan protected config: `3`.
- SGP remote adapter count: `3`.
- SGP `requiresAppliedReceipt=true` count: `3`.

SGP read-only validation:

- `gccgw-edge-agent.service`: active.
- `xray-vless-reality.service`: active.
- `hysteria2.service`: active.
- `mihomo-tuic.service`: active.
- TCP `8443` listener count: `1`.
- UDP `10443` listener count: `1`.
- UDP `443` listener count: `1`.
- Loopback stats listener `127.0.0.1:26080` count: `1`.
- SGP local health: `200`.

## Rollback

If rollback is required, restore the protected proxy config from the backup
directory above and restart only `proxy-gateway-candidate.service` on Japan.

SGP runtime was not mutated by this gate, so SGP runtime rollback is not
required for this specific change.
