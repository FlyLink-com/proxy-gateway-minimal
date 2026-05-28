# Resource Package CLI

Last updated: 2026-05-28, Asia/Shanghai.

This document defines the repository-local resource package CLI. A resource
package is an operator-safe delivery summary for one customer/account access
grant plus optional channel activation evidence. It is the preferred CLI-first
unit for manual registration, subscription access delivery, and audit review.

This document does not authorize production, DNS, Nginx, systemd, cloud,
firewall, provider, node, runtime, SQLite, tenant, artifact, subscription URL,
or customer-data mutation.

## Command

```powershell
npm run platform:resource-package -- <resource-package-input.json>
```

Direct script form:

```powershell
node scripts/platform-resource-package.mjs <resource-package-input.json>
```

The command prints JSON to stdout. It is summary-only and does not write files,
submit approvals, generate subscription YAML, contact edge nodes, deploy
runtimes, mutate subscription output, or move traffic.

## Input Shape

The input is operator-provided JSON with account, entitlement, access grant, and
optional channel activation package summaries. Raw private references may be
present in input because the operator owns the source material, but they are not
returned in output.

## Output Boundary

The output intentionally returns only safe metadata:

- package id and hashed account, customer, operator, entitlement, and access references
- entitlement status, plan, quota, validity, and usability
- access status and whether a dynamic entry or artifact exists
- optional channel activation status, protocol counts, and approval readiness
- blockers and required next action
- safety flags

The output must not include:

- organization names
- customer emails
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

- entitlement belongs to the account
- entitlement is active and within its validity window
- access grant belongs to the entitlement
- access grant is issued
- access grant has a dynamic entry or artifact reference
- optional activation package is ready if supplied

`blocked_before_operator_delivery` means the package is not suitable for
delivery. Check `blockers` for reason codes such as:

- `entitlement_not_usable`
- `access_not_issued`
- `access_reference_missing`
- `access_grant_mismatch`
- `activation_package_not_ready`

## Risk Boundary

This is B-tier repository tooling. It can support operator review and manual
delivery preparation, but it is not an A-tier execution gate. A separate
approved runbook is still required for:

- production subscription-output activation
- broader opaque artifact issuance
- legacy query-token retirement
- public Admin exposure
- DNS promotion
- edge rebuild or traffic activation
- runtime deployment
- firewall, provider, Nginx, systemd, or cloud mutation

## Natural-Language / Agent Use

The intended operating model is:

```text
operator natural-language intent
  -> agent prepares safe JSON input
  -> platform:resource-package prints safe resource-package summary
  -> operator reviews blockers / required next action
  -> separate A-tier gate if runtime or production mutation is needed
```

The CLI is the deterministic execution surface. Natural language should only
select intent and prepare safe input; it must not bypass validation, runbooks,
or exact approval gates.
