# Payment Checkout URL Guard Candidate Staging - 2026-07-03

## Scope

- Risk: A
- Target: `vul1/gccgw-vultr-candidate`
- Backend artifact:
  `payment-checkout-url-guard-candidate-20260703-001-backend.zip`
- Backend SHA-256:
  `C41CE33BA620275CB6E244A76EE79F2F57B011C33B763D66DF6C6B5A56739B12`
- Portal artifact:
  `payment-checkout-url-guard-candidate-20260703-001-portal.zip`
- Portal SHA-256:
  `A4A645B175F4C7FF54BAC345713EE454A45C2043A2F3452E9F94537BD9CE9257`

This staging uploaded and extracted the candidate artifacts only. It did not
change current symlinks, apply backend overlays, replace `/var/www`, alter
Nginx, alter DNS, alter firewall rules, change environment keys, restart
services, initiate live checkout, simulate webhooks, output tokens, or dump
customer data.

## Staged Locations

- Backend:
  `/opt/proxy-gateway-minimal-candidate/backend-candidates/releases/payment-checkout-url-guard-candidate-20260703-001-backend`
- Portal:
  `/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/payment-checkout-url-guard-candidate-20260703-001-portal`

## Validation

- Remote backend archive SHA-256 matched the approved hash.
- Remote portal archive SHA-256 matched the approved hash.
- Required manifests were present.
- Required backend overlay files were present:
  - `backend-overlay/server/services/platform/portal-payment-orders.mjs`
  - `backend-overlay/server/routes/user-portal.mjs`
- Required portal files were present:
  - `portal-dist/index.html`
  - `portal-dist/assets/*`
- `admin-preview/current` remained unchanged.
- Existing `/var/www/globalcircle-portal` static content was not replaced.
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.
- Public `/api/admin` remained closed:
  - `portal.gccwebos.com/api/admin` returned `404`
  - `gccwebos.com/api/admin` returned `404`

## Rollback

If this staged candidate is no longer needed, remove only these directories:

- `/opt/proxy-gateway-minimal-candidate/backend-candidates/releases/payment-checkout-url-guard-candidate-20260703-001-backend`
- `/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/payment-checkout-url-guard-candidate-20260703-001-portal`

No current symlink, active release, Nginx config, environment file, service
state, or portal static directory was changed by this staging step.
