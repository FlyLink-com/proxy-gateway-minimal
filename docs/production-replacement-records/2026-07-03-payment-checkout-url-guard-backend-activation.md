# Payment Checkout URL Guard Backend Activation - 2026-07-03

## Scope

- Risk: A
- Target: `vul1/gccgw-vultr-candidate`
- Backend artifact:
  `payment-checkout-url-guard-candidate-20260703-001-backend.zip`
- Backend SHA-256:
  `C41CE33BA620275CB6E244A76EE79F2F57B011C33B763D66DF6C6B5A56739B12`

This activation verified the staged backend archive, backed up the current
release files that were overwritten, applied the staged backend overlay into
`/opt/proxy-gateway-minimal-candidate/current`, ran `systemctl daemon-reload`,
and restarted `proxy-gateway-candidate.service`.

It did not run a DB migration, change Nginx configuration, change DNS, change
firewall rules, change environment or payment keys, initiate live checkout,
activate or simulate webhooks, output tokens, or dump customer data.

## Backup

- Backup directory:
  `/opt/proxy-gateway-minimal-candidate/backups/payment-checkout-url-guard-backend-overlay-20260703T155933Z`
- Backed-up file count: 4

## Validation

- Staged backend archive SHA-256 matched the approved hash.
- Current release overlay files were updated.
- `proxy-gateway-candidate.service` was active after restart.
- `nginx` was active.
- `nginx -t` passed.
- Local `/api/admin-auth/session` returned a safe unauthenticated response.
- No-session `/api/admin/platform/payments` returned `401`.
- Public `/api/admin` remained closed:
  - `portal.gccwebos.com/api/admin` returned `404`
  - `gccwebos.com/api/admin` returned `404`

## Rollback

To roll back this backend activation, restore files from:

`/opt/proxy-gateway-minimal-candidate/backups/payment-checkout-url-guard-backend-overlay-20260703T155933Z`

Then run:

1. `systemctl daemon-reload`
2. `systemctl restart proxy-gateway-candidate.service`
3. `nginx -t`

Keep the staged candidate artifacts unless a separate cleanup approval removes
them.
