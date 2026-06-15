# Legacy Query Token Retirement Gate

Last updated: 2026-06-15, America/Los_Angeles.

> Risk: B for this repository inventory, guard test, and runbook update.
> Production retirement remains Risk A and requires a separate exact approval.
> Production impact: none. This document does not authorize runtime, database,
> DNS, Nginx, systemd, firewall, tenant, artifact, order, or token mutation.

## Purpose

GCC-32 tracks the retirement path for historical query-token subscription
access. The current preferred user-facing access model is opaque subscription
artifacts under `/sub/a/*`, while `/sub/clash.yaml?token=...` remains a
compatibility path until an explicit Risk A migration gate drains or disables
it.

The goal is to make the boundary inspectable before production work:

- current artifact routes must not depend on query tokens;
- legacy tokens must not bypass tenant, expiry, disable, node, or receipt-gated
  render checks;
- any production retirement must be staged with inventory, dry-run, validation,
  and rollback evidence.

## Current Access Inventory

| Surface | Current role | Keep/deprecate decision | Required behavior |
| --- | --- | --- | --- |
| `/sub/a/:artifact` | Preferred opaque artifact subscription route. | Keep. | Resolves only by artifact hash, then applies tenant status, expiry, channel, and receipt gates. Query tokens are ignored. |
| `/sub/a/:artifact/profile.yaml` and `/sub/a/:artifact/provider.yaml` | Provider-mode artifact routes. | Keep. | Same artifact-only authority as `/sub/a/:artifact`; no query-token fallback. |
| `/sub/clash.yaml?token=pgsub_*` | Historical tenant token route. | Deprecated compatibility path. | Must pass the same tenant access checks as artifact routes. Production disable requires Risk A approval. |
| `/sub/clash.yaml?token=pgtmp_*` | Historical temporary link route. | Deprecated short-lived operator path. | Must expire and fail closed. Production disable or rotation requires Risk A approval. |
| `/sub/clash.yaml?token=<console token>` or `Authorization: Bearer <console token>` | Legacy operator/global compatibility route. | Highest-risk compatibility path. | Must never be treated as user-panel normal issuance. Production disable requires separate inventory and rollback. |
| Admin create/reset/temp-link responses | Historical visible-once query-token URL issuance. | Deprecated for new access model. | Prefer artifact issuance for new user-facing subscription delivery; do not output raw URLs in logs, docs, or chat. |

## Migration Plan

1. **Repo-only boundary guard:** keep tests that prove opaque artifact routes do
   not fall back to query-token resolution, including when a valid legacy token
   is present in the query string.
2. **Inventory:** run a read-only production inventory that reports counts and
   route classes only. Do not dump SQLite rows, raw tokens, subscription URLs,
   customer identities, or credential material.
3. **Dry-run drain:** classify legacy usage into primary tenant token,
   temporary link, and operator/global compatibility buckets. Missing or
   mismatched artifacts must fail closed.
4. **Promotion gate:** only after opaque artifacts are confirmed for the
   approved tenant/order scope, request exact Risk A approval for any legacy
   token rejection, rotation, or route mode change.
5. **Rollback:** keep the previous runtime, protected env, subscription DB, and
   control DB backups until post-change validation proves public portal/sub
   health, Admin blocking, no-session rejection, and receipt-gated render
   behavior.

## Production Approval Boundary

The first production gate must not remove `/sub/clash.yaml`. Safer production
steps are ordered from least to most disruptive:

1. record read-only usage inventory;
2. stop issuing new query-token URLs where artifact issuance is already
   available;
3. reject only temporary links after their approved drain window;
4. reject primary tenant query tokens after artifact replacement is confirmed;
5. reject console-token global subscription access only after operator workflows
   have a replacement.

Each step requires explicit approval naming the target, scope, backup,
validation, rollback, and forbidden actions.

## Validation

Repository validation for this gate:

```powershell
node --test server/tests/admin-subscriptions.test.mjs server/tests/subscription-route-resolver.test.mjs server/tests/redaction.test.mjs server/tests/admin-allowlist.test.mjs
npm test
npm run project-state:check
git diff --check origin/master...HEAD
```

Production validation, when separately approved, must be redacted and must not
output subscription URLs, tokens, private keys, credential material, raw config,
raw logs, or SQLite rows.

## Rollback

Repo-only rollback is a normal git revert.

Production rollback, if later approved, must restore the previous runtime
release/symlink, protected env, subscription DB, control DB, and any route-mode
configuration, then restart only the explicitly approved service after health
and boundary validation.
