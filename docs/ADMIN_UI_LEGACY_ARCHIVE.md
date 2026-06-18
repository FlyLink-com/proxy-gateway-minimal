# Admin UI Legacy Archive

Last updated: 2026-06-15, America/Los_Angeles.

This document archives the existing `admin/` application as a legacy local
protected reference surface. The original 2026-06-08 archive decision did not
move, delete, deploy, expose, or replace any code.

2026-06-15 follow-up: GCC-42 New Admin Console cleanup removed the inactive
legacy Admin UI source files that were no longer routed by the current
React/Vite shell: the old subscription creation/mutation page, its create,
renew, reset-token, temporary-link, and disable dialogs, and the old overview,
nodes, and provisioning pages. The cleanup keeps the current `运营总览`,
`账号与资源`, and `流量与通道` routes, the Admin API client/contracts, safe
summary tests, connection/session code, and the User Portal modal frame. This
follow-up is repo-only and does not change backend routes, production runtime,
schema, auth, DNS, Nginx, tokens, credentials, or subscription output.

2026-06-08 clarification: this archive decision applies to the old public or
product Admin direction. It does not authorize public Admin exposure, and it
does not remove the current private / protected Admin shell from local testing
or operator-only workflows. Current UI and portal work should still follow
`docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`, active service contracts, and
live validation evidence.

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

- The original 2026-06-08 archive decision did not move or delete `admin/`
  files. The later 2026-06-15 GCC-42 cleanup did delete inactive legacy UI
  files as documented above.
- No route, API, build, test, Nginx, DNS, Aliyun, AWS, tenant, artifact, or
  subscription behavior changed.
- No public Admin enabled.
- No customer data, secrets, tokens, subscription URLs, or raw handoff material
  recorded.
