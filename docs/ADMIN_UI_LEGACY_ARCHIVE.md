# Admin UI Legacy Archive

Last updated: 2026-05-29, Asia/Shanghai.

This document archives the existing `admin/` application as a legacy local
protected reference surface. It does not move, delete, deploy, expose, or
replace any code.

## Status

```text
Risk: C / docs-only archive decision
Current code location: admin/
Archive meaning: legacy local protected reference surface
Runtime impact: none
Production authority: none
```

The existing Admin UI is no longer the product direction or design baseline for
future user, operator, or management surfaces. It may remain useful as a local
regression-tested reference while service contracts, CLI flows, and issuance
boundaries mature.

## Decision

The project direction is now:

```text
public company site / lead intake
  -> protected operator review
  -> operator CLI / resource package / handoff
  -> controlled subscription issuance and revocation
  -> future rebuilt user/operator surfaces
```

The old Admin UI must not be polished into the future product UI. Future UI work
should be rebuilt around current business boundaries instead of extending the
old Overview-heavy Admin information architecture.

## What Remains Active

- The `admin/` bundle may remain buildable and testable.
- Existing protected review panels can be used as implementation references for
  service contract behavior.
- Admin tests and builds can still serve as compatibility checks when code in
  `admin/` changes.
- The static public site build boundary remains separate from the normal
  Admin/Portal bundle.

## Stop Doing

Do not use the legacy Admin UI for:

- public Admin exposure
- production execution buttons
- aesthetic polishing as a product goal
- user portal self-service design
- operator CLI replacement
- Telegram registration or Mini App embedding
- raw subscription URL, token, credential, tenant, or customer-data display
- public route expansion
- approval submission or production mutation without a separate Risk A gate

## Rebuild Entry Conditions

Before starting a replacement UI, define the target surface explicitly:

```text
customer user portal
operator provisioning/review console
internal admin audit console
public company site
```

A replacement branch should also define:

- role and permission boundary
- allowed API adapters
- public/private route boundary
- CLI handoff relationship
- subscription URL and secret-handling policy
- validation commands
- migration or coexistence plan for old `admin/`

Until those are defined, prefer service contracts, CLI tooling, resource
packages, and protected preview APIs over more legacy Admin UI work.

## Not Performed

- No `admin/` files moved or deleted.
- No route, API, build, test, Nginx, DNS, Aliyun, AWS, tenant, artifact, or
  subscription behavior changed.
- No public Admin enabled.
- No customer data, secrets, tokens, subscription URLs, or raw handoff material
  recorded.
