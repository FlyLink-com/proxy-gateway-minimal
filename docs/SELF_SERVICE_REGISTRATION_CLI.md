# Self-Service Registration CLI

Last updated: 2026-05-28, Asia/Shanghai.

This document defines the repository-local self-service registration CLI. It is
the first safe contract for future customer-side registration, payment status
review, and automatic subscription resource-package preparation.

This document does not authorize public user portal exposure, payment provider
activation, production persistence, DNS, Nginx, systemd, cloud, firewall,
provider, node, runtime, SQLite schema, tenant, artifact, subscription URL, or
customer-data mutation.

## Command

```powershell
npm run platform:self-service-registration -- <self-service-registration-input.json>
```

Direct script form:

```powershell
node scripts/platform-self-service-registration.mjs <self-service-registration-input.json>
```

The command prints JSON to stdout. It is summary-only and does not write files,
call payment providers, create production accounts, generate subscription YAML,
contact edge nodes, deploy runtimes, mutate subscription output, or move
traffic.

## Input Shape

The input is operator-provided or future public-intake JSON with:

- `registration`: organization, email, direction, stage, message, and requested plan
- `payment`: provider, status, and optional external reference
- `policy`: auto-provision and payment-verification requirements
- `entitlement`: validity and quota hints
- `accessGrant`: dynamic entry and/or artifact references when operator-controlled access is ready
- `activationPackage`: optional channel activation evidence summary

Raw private references may be present in input because the operator owns the
source material, but they are not returned in output.

## Output Boundary

The output intentionally returns only safe metadata:

- hashed registration, customer, payment, package, entitlement, and access references
- payment status and whether payment is verified
- whether auto-provisioning was attempted
- whether access was issued by the controlled-open flow
- portal posture showing that public login is not enabled
- blockers and required next action
- safety flags

The output must not include:

- organization names
- customer emails
- raw payment references
- raw portal URLs
- raw artifact references
- subscription URLs
- tokens
- credentials
- node hosts
- raw ports
- generated YAML
- approval phrases

## Status Model

`ready_for_operator_delivery` means:

- payment status is verified when required
- auto-provisioning is allowed by policy
- access grant has a dynamic entry or artifact reference
- the controlled-open resource package is ready for operator delivery

`pending_payment_verification` means payment is not verified. No account,
entitlement, or access grant should be treated as production-authoritative from
this CLI output.

`pending_operator_review` means payment is not the blocker, but operator review
or access-reference preparation is still required before delivery.

## Risk Boundary

This is B-tier repository tooling. It can support future user registration and
operator-assisted subscription delivery, but it is not an A-tier execution gate.
A separate approved runbook is still required for:

- public user portal exposure
- real payment-provider integration
- production persistence / SQLite schema migration
- automatic production subscription artifact issuance
- traffic accounting, quota enforcement, or device abuse controls
- DNS promotion
- Nginx public route activation
- edge rebuild or traffic activation
- runtime deployment
- firewall, provider, systemd, or cloud mutation
