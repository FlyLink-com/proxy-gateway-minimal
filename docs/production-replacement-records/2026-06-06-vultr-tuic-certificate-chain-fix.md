# Vultr TUIC Certificate Chain Fix Record

Date: 2026-06-06

## Scope

This record captures the approved Vultr host-only TUIC certificate-chain fix
for `channel-vultr-a-tuic`.

This record intentionally excludes raw environment values, raw Mihomo
configuration, subscription URLs, tokens, passwords, private keys, SQLite rows,
and customer data.

## Root Cause

The Vultr user portal and subscription control plane were healthy, and the
client subscription imported the expected `channel-vultr-a-tuic` node. The
Vultr data-plane checks showed:

- Provider firewall allowed TCP 22, TCP 80, TCP 443, and UDP 443.
- Host firewall allowed UDP 443.
- `mihomo-tuic.service` was active.
- UDP 443 was owned by the Mihomo TUIC process.
- The client credential from the imported profile was present in the active
  server-side TUIC user map.

The failing host-local TUIC self-test showed the TLS verification error:

```text
x509: certificate signed by unknown authority
```

The active TUIC listener was using a single-certificate self-signed
`server.crt` style certificate, while Nginx HTTPS used a valid Let's Encrypt
chain. The HTTPS control plane was therefore healthy, but TUIC client
certificate verification failed.

## Change

Approved operation:

- Back up protected runtime environment files.
- Back up `/etc/mihomo/config.yaml`.
- Copy the existing Let's Encrypt fullchain and matching private key into a
  protected `/etc/mihomo` TLS material path readable by the Mihomo service user.
- Update the protected runtime environment to point TUIC certificate paths at
  the protected fullchain/key material.
- Update the active Mihomo TUIC config certificate paths.
- Run Mihomo config-test as the service user before restart.
- Restart only:
  - `proxy-gateway-candidate.service`
  - `mihomo-tuic.service`

No DNS, Nginx configuration, Nginx reload, firewall/provider firewall, account,
payment, subscription URL, token, password, or SQLite row mutation was made.

## Validation

Vultr host validation:

- Protected backup: created.
- Runtime env backup: created.
- Active Mihomo config backup: created.
- Let's Encrypt fullchain: 4 PEM certificate blocks.
- Let's Encrypt certificate covers `globalcirclecat.cloud`.
- Copied TLS material is readable by the Mihomo service user.
- Mihomo config-test as the service user: passed.
- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: active.
- `nginx`: active.
- UDP 443 listener: present.
- UDP 443 owned by Mihomo: yes.
- Active TUIC certificate chain covers `globalcirclecat.cloud`.
- Host-local TUIC self-test without `skip-cert-verify`: passed with HTTP 204.
- Current imported client credential is present in the active server-side TUIC
  user map.

Public boundary validation:

- `https://portal.globalcirclecat.cloud/`: HTTP 200.
- `https://sub.globalcirclecat.cloud/api/health`: HTTP 200.
- Public Admin API boundary: HTTP 404.
- No-session portal API boundary: HTTP 401.

Recent Mihomo journal after restart showed the TUIC listener started on UDP 443
and did not show certificate verification failures in the validation window.

## Rollback

Rollback is host-only:

1. Restore the protected runtime environment backup.
2. Restore the backed-up `/etc/mihomo/config.yaml`.
3. Restart `proxy-gateway-candidate.service`.
4. Restart `mihomo-tuic.service`.
5. Repeat config-test, service, UDP 443, and public-boundary validation.
