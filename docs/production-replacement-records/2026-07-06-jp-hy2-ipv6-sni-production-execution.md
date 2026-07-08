# 2026-07-06 JP Hy2 IPv6/SNI Production Execution

## Scope

- Risk: A
- Target: Vultr Japan `45.76.222.52` / `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
- Domain: `jp.gccwebos.com`
- Approved action:
  - Back up JP `/etc/hysteria/config.yaml`, `hysteria2` systemd state, TLS state, and production environment file.
  - Switch JP Hy2 server certificate material to the `jp.gccwebos.com` certificate copy.
  - Normalize production-rendered `VULTR_HY2_SNI` to `jp.gccwebos.com`.
  - Restart only `hysteria2` and `proxy-gateway-candidate.service` after config precheck.
- Explicit non-goals:
  - No VLESS, TUIC, DNS, Nginx, app, schema, payment, account, order, subscription token, or credential changes.
  - No `globalcirclecat` production entry activation.
  - No raw config, env, log, token, subscription URL, credential, private key, SQLite row, or customer data output.

## Backup

- Backup directory: `/root/gccgw-runtime-backups/jp-hy2-ipv6-sni-20260706-001`
- Backed up:
  - `/etc/hysteria/config.yaml`
  - JP Hy2 TLS files under `/etc/hysteria`
  - `hysteria2` systemd state summary
  - Production `.env`
  - `jp.gccwebos.com` certificate metadata

## Changes Applied

- Copied the live `jp.gccwebos.com` certificate material into the Hy2 TLS directory with `proxy-gateway:proxy-gateway` ownership.
- Updated Hy2 `tls.cert` and `tls.key` to the `jp.gccwebos.com` certificate copy.
- Updated exactly one production environment key:
  - `VULTR_HY2_SNI` now resolves to `jp.gccwebos.com`.
- Restarted only:
  - `hysteria2`
  - `proxy-gateway-candidate.service`

## Precheck

- Hysteria has no separate config-check subcommand in the installed binary.
- A temporary smoke config was generated with:
  - the new `jp.gccwebos.com` certificate paths,
  - loopback-only temporary Hy2 listen port,
  - loopback-only temporary traffic-stats port.
- The temporary Hysteria process successfully started and stayed running until the timeout, which validated config parsing and certificate readability before replacing the active config.

## Validation

- `hysteria2`: active
- `proxy-gateway-candidate.service`: active
- Local control-plane health: 200
- JP Hy2 UDP `10443`:
  - active socket: `*:10443`
  - IPv6 listener count: 1
  - `bindv6only=0`, so the socket is dual-stack
  - SGP-to-JP UDP `10443` IPv4 probe reached JP
  - SGP-to-JP UDP `10443` IPv6 probe reached JP
- Hy2 config summary:
  - listen: `:10443`
  - certificate domain: `jp.gccwebos.com`
  - certificate covers `jp.gccwebos.com`
- Production subscription config summary:
  - `channel-vultr-a-hy2` present
  - host is `jp.gccwebos.com`
  - SNI is `jp.gccwebos.com`
  - protocol is `hysteria2`
  - port is `10443`
  - subscription eligible and online
- Public portal/sub health:
  - `portal.gccwebos.com` IPv4 `/api/health`: 200
  - `portal.gccwebos.com` IPv6 `/api/health`: 200
  - `sub.gccwebos.com` IPv4 `/api/health`: 200
  - `sub.gccwebos.com` IPv6 `/api/health`: 200
- Public high ports on JP:
  - TCP `3456`: closed on IPv4 and IPv6
  - TCP `18080`: closed on IPv4 and IPv6

## Rollback

If rollback is required:

1. Restore `/etc/hysteria/config.yaml` and Hy2 TLS files from `/root/gccgw-runtime-backups/jp-hy2-ipv6-sni-20260706-001`.
2. Restore the production `.env` from `/root/gccgw-runtime-backups/jp-hy2-ipv6-sni-20260706-001/current/.env`.
3. Restart only `hysteria2` and `proxy-gateway-candidate.service`.
4. Re-run the validation set above.
