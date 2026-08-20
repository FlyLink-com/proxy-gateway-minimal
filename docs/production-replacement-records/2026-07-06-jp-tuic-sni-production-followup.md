# 2026-07-06 JP TUIC SNI Production Follow-Up


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: jp_tuic_sni_production_followup
  superseded_by: null
  last_verified_at: 2026-07-06
  production_authority: false
```


## Scope

- Risk: A
- Target: Vultr Japan control plane only
- Purpose: make the rendered JP TUIC host and SNI match `jp.gccwebos.com` after the JP TUIC IPv6 gate.
- Explicit non-goals:
  - No account, order, payment, schema, subscription token, credential, or customer-data changes.
  - No portal/sub DNS changes.
  - No Hysteria2, Xray, Nginx, or data-plane service changes.
  - No raw env, token, subscription URL, credential, private key, SQLite row, or customer data output.

## Backup

- Backup directory: `/root/gccgw-runtime-backups/jp-tuic-sni-20260706-001`
- Backed up:
  - Current production `.env`
  - `proxy-gateway-candidate.service` pre-change state summary
  - Pre-change `.env` checksum

## Change

- Updated exactly one production environment key:
  - `VULTR_TUIC_SNI` now resolves to `jp.gccwebos.com`
- Restarted only `proxy-gateway-candidate.service`.

## Validation

- `proxy-gateway-candidate.service`: active
- Local health endpoint: 200
- Production process environment summary:
  - `VULTR_TUIC_HOST` resolves to `jp.gccwebos.com`
  - `VULTR_TUIC_SNI` resolves to `jp.gccwebos.com`
  - rendered edge channel refs include `channel-vultr-a-tuic`
  - auto issuance refs include `channel-vultr-a-tuic`
- Resolved subscription config summary:
  - `channel-vultr-a-tuic` present
  - host is `jp.gccwebos.com`
  - SNI is `jp.gccwebos.com`
  - protocol is `tuic`
  - port is `443`
  - subscription eligible
- `mihomo-tuic`: active
- `jp.gccwebos.com` AAAA resolves to Japan IPv6
- `portal.gccwebos.com` and `sub.gccwebos.com` IPv4/IPv6 `/api/health`: 200
- Public TCP `3456` and `18080`: closed on IPv4 and IPv6

## Rollback

If rollback is required:

1. Restore the production `.env` from `/root/gccgw-runtime-backups/jp-tuic-sni-20260706-001/current/.env`.
2. Restart only `proxy-gateway-candidate.service`.
3. Verify local health 200, portal/sub health 200, and public high ports remain closed.
