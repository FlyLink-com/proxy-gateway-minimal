# Payment Checkout URL Guard Portal Activation - 2026-07-03

## Scope

- Risk: A
- Target: `vul1/gccgw-vultr-candidate`
- Host: `portal.gccwebos.com`
- Portal artifact:
  `payment-checkout-url-guard-candidate-20260703-001-portal.zip`
- Portal SHA-256:
  `A4A645B175F4C7FF54BAC345713EE454A45C2043A2F3452E9F94537BD9CE9257`

This activation verified the staged portal archive, backed up the current
`/var/www/globalcircle-portal` static directory, and replaced the static
contents from the staged `portal-dist` only.

It did not apply backend overlays, change Nginx configuration, change DNS,
change firewall rules, change environment or payment keys, change systemd,
restart services, initiate live checkout, activate or simulate webhooks, output
tokens, or dump customer data.

## Backup

- Backup directory:
  `/opt/proxy-gateway-minimal-candidate/backups/payment-checkout-url-guard-portal-20260703T160348Z-var-www-globalcircle-portal`
- Backed-up file count: 5

## Validation

- Staged portal archive SHA-256 matched the approved hash.
- Backup directory was created.
- `portal.gccwebos.com` served the new portal bundle:
  - `assets/index-CKvxVwxL.js`
  - `assets/index--D01cje8.css`
- Static assets returned `200`:
  - `/assets/index-CKvxVwxL.js`
  - `/assets/browser-BT3HJb8c.js`
  - `/assets/index--D01cje8.css`
  - `/favicon.svg`
- The portal bundle contained the payment-channel unavailable user-facing
  message marker.
- `/api/portal/human-challenges` remained proxied and returned `201` for POST.
- Public `/api/admin` remained closed:
  - `portal.gccwebos.com/api/admin` returned `404`
  - `gccwebos.com/api/admin` returned `404`
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.

## Rollback

To roll back this portal frontend activation, restore
`/var/www/globalcircle-portal` from:

`/opt/proxy-gateway-minimal-candidate/backups/payment-checkout-url-guard-portal-20260703T160348Z-var-www-globalcircle-portal`

Then run `nginx -t`. Keep the staged candidate artifacts unless a separate
cleanup approval removes them.
