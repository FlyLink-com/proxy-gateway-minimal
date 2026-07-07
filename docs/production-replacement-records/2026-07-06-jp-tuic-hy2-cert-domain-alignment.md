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

## Approval Evidence

Approval evidence ID:

```text
operator-codex-thread-20260706-jp-tuic-hy2-cert-align
```

Non-secret approval marker: the project operator approved the scoped plan in
the Codex thread with a short confirmation after being presented with the exact
sequence: back up the current JP TUIC/Hysteria2 configs, repoint only those two
runtime services to the existing `jp.gccwebos.com` certificate/key material,
restart only `mihomo-tuic` and `hysteria2`, then validate service state, UDP
listeners, certificate SAN/key pairing, logs, and client behavior.

The approval did not include, and this record does not store, subscription
URLs, tokens, private keys, passwords, raw runtime config, raw environment
files, SQLite rows, or customer data. The approval did not authorize DNS,
Nginx, firewall, provider, payment, live-order, control-plane service, or Admin
surface changes.

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

## Rollback

Rollback source:

```text
/var/backups/gccgw-edge/jp-tuic-hy2-cert-align-20260706T172045Z
```

Rollback steps, if the `jp.gccwebos.com` certificate alignment breaks TUIC or
Hysteria2:

1. Stop before any unrelated DNS, Nginx, firewall, provider, payment, order,
   control-plane, tenant, artifact, or Admin mutation.
2. On the JP host, confirm the backup directory above still contains the
   backed-up `/etc/mihomo/config.yaml` and `/etc/hysteria/config.yaml`
   snapshots without printing their contents.
3. Record current owner, group, and mode for `/etc/mihomo/config.yaml` and
   `/etc/hysteria/config.yaml`; restore the two config files from the backup
   using those ownership and permission values.
4. Restart only `mihomo-tuic` and `hysteria2`.
5. Validate `systemctl is-active mihomo-tuic hysteria2`, UDP/443 for TUIC,
   UDP/10443 for Hysteria2, recent redacted service logs, and client-side
   certificate behavior.
6. If rollback is successful, record the restored backup directory, service
   states, listener checks, and redacted client result in a follow-up execution
   record before any further runtime attempt.

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
