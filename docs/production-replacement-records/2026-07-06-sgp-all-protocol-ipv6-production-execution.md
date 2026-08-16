# 2026-07-06 SGP All-Protocol IPv6 Production Execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: sgp_all_protocol_ipv6_production_execution
  superseded_by: null
  last_verified_at: 2026-07-06
  production_authority: false
```


## Scope

- Risk: A
- Target: Vultr SGP `45.76.158.201` / `2001:19f0:4401:ae6:5400:6ff:fe3b:30ea`
- Domain: `sgp.gccwebos.com`
- Approved action:
  - Back up SGP read-only state summary and current Vercel DNS records.
  - Add only the `sgp.gccwebos.com` AAAA record pointing to the SGP IPv6 address.
- Explicit non-goals:
  - No A record changes.
  - No JP or SGP runtime service restarts.
  - No portal, sub, jp, or admin DNS changes.
  - No app, schema, payment, account, order, subscription token, credential, or customer-data changes.
  - No raw config, env, log, token, subscription URL, private key, SQLite row, or customer data output.

## Backup

- SGP read-only state backup: `/root/gccgw-runtime-backups/sgp-all-protocol-ipv6-20260706-001`
- Local Vercel DNS backup: `C:\Users\g\AppData\Local\Temp\gccgw-production-backups\sgp-all-protocol-ipv6-20260706-001\vercel-dns-before.txt`
- Backed up:
  - SGP service active/enabled state summary.
  - SGP IPv6 address and protocol listener summary.
  - SGP `sgp.gccwebos.com` certificate coverage summary.
  - Pre-change Vercel DNS listing.

## Change

- Added Vercel DNS record:
  - `sgp.gccwebos.com` `AAAA` `2001:19f0:4401:ae6:5400:6ff:fe3b:30ea`
  - Record id: `rec_2489aeda13db93f1b86d8299`

No runtime services were restarted.

## Validation

- `sgp.gccwebos.com` DNS:
  - Authoritative A: `45.76.158.201`
  - Authoritative AAAA: `2001:19f0:4401:ae6:5400:6ff:fe3b:30ea`
  - Recursive A via `1.1.1.1` and `8.8.8.8`: `45.76.158.201`
  - Recursive AAAA via `1.1.1.1` and `8.8.8.8`: `2001:19f0:4401:ae6:5400:6ff:fe3b:30ea`
- SGP services:
  - `xray-vless-reality`: active
  - `hysteria2`: active
  - `mihomo-tuic`: active
- SGP IPv6 listeners:
  - TCP `8443`: present
  - UDP `10443`: present
  - UDP `443`: present
- SGP certificate:
  - `sgp.gccwebos.com` certificate exists.
  - Certificate covers `sgp.gccwebos.com`.
- Production subscription config summary:
  - `channel-sgp-a-vless-reality-tcp` present, host `sgp.gccwebos.com`, protocol `vless`, port `8443`, eligible, online.
  - `channel-sgp-a-hy2` present, host `sgp.gccwebos.com`, SNI `sgp.gccwebos.com`, protocol `hysteria2`, port `10443`, eligible, online.
  - `channel-sgp-a-tuic` present, host `sgp.gccwebos.com`, SNI `sgp.gccwebos.com`, protocol `tuic`, port `443`, eligible, online.
- Public portal/sub health:
  - `portal.gccwebos.com` IPv4 `/api/health`: 200
  - `portal.gccwebos.com` IPv6 `/api/health`: 200
  - `sub.gccwebos.com` IPv4 `/api/health`: 200
  - `sub.gccwebos.com` IPv6 `/api/health`: 200
- SGP public internal high ports:
  - TCP `3456`: closed on IPv4 and IPv6
  - TCP `18080`: closed on IPv4 and IPv6

## DNS Propagation Note

- During final sampling, Vercel authoritative DNS, Google DNS, and Quad9 DNS
  consistently returned the new AAAA record.
- Cloudflare `1.1.1.1` returned one transient empty AAAA response during the
  propagation window, then returned the expected AAAA record again on later
  probes.
- A local `Resolve-DnsName` check against `ns1.vercel-dns.com`, `1.1.1.1`, and
  `8.8.8.8` returned the expected AAAA record after the transient sample.

## Rollback

If rollback is required:

1. Delete the `sgp.gccwebos.com` AAAA record `rec_2489aeda13db93f1b86d8299`.
2. Confirm `sgp.gccwebos.com` A remains `45.76.158.201`.
3. Confirm SGP IPv4 listeners remain present.
4. Re-run portal/sub health checks.
