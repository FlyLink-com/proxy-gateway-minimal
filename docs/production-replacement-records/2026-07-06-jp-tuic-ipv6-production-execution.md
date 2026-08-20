# 2026-07-06 JP TUIC IPv6 Production Execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: jp_tuic_ipv6_production_execution
  superseded_by: null
  last_verified_at: 2026-07-06
  production_authority: false
```


## Scope

- Risk: A
- Target: Vultr Japan `45.76.222.52` / `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
- Domain: `jp.gccwebos.com`
- Approved action:
  - Back up Japan Mihomo config, `mihomo-tuic` systemd state, and TLS state.
  - Switch the Japan TUIC listener certificate material to the `jp.gccwebos.com` certificate copy.
  - Add only the `jp.gccwebos.com` AAAA record pointing to the Japan IPv6 address.
  - Start and enable `mihomo-tuic`.
- Explicit non-goals:
  - No portal/sub A or AAAA changes.
  - No Hysteria2, Xray, Nginx, app, schema, payment, account, order, subscription token, or credential changes.
  - No `globalcirclecat` production entry activation.
  - No raw config, secret, token, subscription URL, credential, private key, SQLite row, or customer data output.

## Backup

- Japan backup directory: `/root/gccgw-runtime-backups/jp-tuic-ipv6-20260706-001`
- Backed up:
  - `/etc/mihomo/config.yaml`
  - `/etc/mihomo/tls`
  - `/etc/systemd/system/mihomo-tuic.service`
  - Redacted systemd state summaries
  - TLS file state summaries and `jp.gccwebos.com` certificate metadata

## Changes Applied

- Copied the live `jp.gccwebos.com` certificate material into the Mihomo TLS directory with `proxy-gateway:proxy-gateway` ownership.
- Updated the single TUIC listener, `channel-vultr-a-tuic`, to use the `jp.gccwebos.com` certificate path.
- Verified Mihomo config before replacing the active config.
- Added Vercel DNS record:
  - `jp.gccwebos.com` `AAAA` `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
  - Record id: `rec_8a475b5b2d9166e27f83651e`
- Ran `systemctl enable --now mihomo-tuic`.

## Validation

- `mihomo -t -d /etc/mihomo -f /etc/mihomo/config.yaml`: ok
- `mihomo-tuic`: active and enabled
- TUIC UDP 443:
  - Mihomo owns one UDP `*:443` socket.
  - `net.ipv6.bindv6only=0`, so the socket is dual-stack.
- `jp.gccwebos.com` DNS:
  - Authoritative and recursive A: `45.76.222.52`
  - Authoritative and recursive AAAA: `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
- `portal.gccwebos.com`:
  - A unchanged: `45.76.222.52`
  - AAAA unchanged: `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
  - IPv4 `/api/health`: 200
  - IPv6 `/api/health`: 200
- `sub.gccwebos.com`:
  - A unchanged: `45.76.222.52`
  - AAAA unchanged: `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
  - IPv4 `/api/health`: 200
  - IPv6 `/api/health`: 200
- Public high ports:
  - TCP `3456`: closed on IPv4 and IPv6
  - TCP `18080`: closed on IPv4 and IPv6

## Guardrail Notes

- `sub.gccwebos.com` admin paths and admin API probes returned blocked statuses.
- `portal.gccwebos.com/admin` returned 200 during validation, while `portal.gccwebos.com/api/admin` and `portal.gccwebos.com/api/admin/health` returned 404.
- The `portal.gccwebos.com/admin` result was not introduced by this TUIC gate because this execution did not change app, Nginx, portal/sub DNS, or admin bridge ports. Treat it as a separate Admin exposure review item if the intended policy is that no static admin shell should be served under the portal host.

## Rollback

If rollback is required:

1. Delete the `jp.gccwebos.com` AAAA record `rec_8a475b5b2d9166e27f83651e`.
2. Stop and disable `mihomo-tuic`.
3. Restore `/etc/mihomo/config.yaml` and `/etc/mihomo/tls` from `/root/gccgw-runtime-backups/jp-tuic-ipv6-20260706-001`.
4. Run `mihomo -t`.
5. Restart only affected services if config validation passes.
6. Re-run the validation set above.
