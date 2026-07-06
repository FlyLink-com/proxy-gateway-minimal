# JP TUIC/Hysteria2 Certificate Domain Alignment

Date: 2026-07-06 UTC.

> Status:
> - Type: Risk A production execution record
> - Operator approval: explicit approval after the scoped fix was presented
> - Production impact: JP TUIC and Hysteria2 services restarted after config
>   backup and certificate-domain alignment
> - Sensitive material: no subscription URL, token, password, private key,
>   raw YAML, raw environment file, SQLite row, or customer data is recorded

## Trigger

JP TUIC/Hysteria2 clients failed while VLESS TCP remained reachable. The client
error showed TLS certificate verification failure for `jp.gccwebos.com`: the
runtime service presented a certificate whose SANs belonged to the retired
`globalcirclecat.cloud` production names.

Redacted subscription rendering checks showed the rendered TUIC/Hysteria2
client host and SNI were already `jp.gccwebos.com`. The drift was therefore in
the JP runtime certificate paths, not in subscription rendering.

## Scope

Allowed production actions after approval:

- Back up `/etc/mihomo/config.yaml` and `/etc/hysteria/config.yaml`.
- Update only JP TUIC and Hysteria2 runtime TLS certificate/key references to
  the existing `jp.gccwebos.com` certificate material.
- Restart only `mihomo-tuic` and `hysteria2`.
- Validate service state, UDP listeners, certificate SANs, certificate/key
  pairing, and post-restart TLS/certificate logs.

Non-goals:

- No DNS mutation.
- No Nginx mutation or reload.
- No control-plane service restart.
- No subscription token, URL, YAML, tenant, SQLite, or credential output.
- No firewall, provider, live-order, payment, or Admin exposure change.

## Execution Summary

Backups were created on the JP host under:

```text
/var/backups/gccgw-edge/jp-tuic-hy2-cert-align-20260706T172045Z
```

The runtime configs were updated so the JP TUIC and Hysteria2 services load the
existing `jp.gccwebos.com` certificate/key pair. The services were then
restarted:

- `mihomo-tuic`
- `hysteria2`

## Validation

Post-change checks confirmed:

- `mihomo-tuic` active and running after restart.
- `hysteria2` active and running after restart.
- UDP/443 listening for TUIC.
- UDP/10443 listening for Hysteria2.
- Both runtime certificate SANs include `DNS:jp.gccwebos.com`.
- The configured certificate/key pairs match.
- Post-restart logs showed no new TLS/x509/certificate verification errors.
- Operator device retest was reported normal after the fix.

## Prevention Notes

Future domain, SNI, or certificate changes for JP QUIC-based protocols must
verify all of these layers, not only subscription rendering:

- Rendered client `server` and `sni`.
- Runtime service certificate path.
- Runtime service private key path, checked by key-pair matching without
  printing the key.
- Certificate SAN for the rendered SNI.
- UDP listener state after restart.
- Recent service logs for TLS/x509/certificate failures.

Repository follow-up should keep active proxy configs and project-state on
`gccwebos.com` and add tests that reject retired
`sub.globalcirclecat.cloud` / `portal.globalcirclecat.cloud` public-boundary
residue in active Vultr configs.
