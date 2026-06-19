# Frontend Architecture

Last updated: 2026-06-19, Asia/Shanghai.

> Status:
> - Type: Active frontend architecture map
> - Risk: C
> - Execution authority: Does not authorize production, DNS, Nginx, systemd,
>   firewall, SQLite, tenant, artifact, subscription URL, credential, payment,
>   deploy, rollback, or customer-data actions
> - Production impact: None
> - Source of truth for: Repository frontend surfaces, entrypoints, adapter
>   boundaries, build outputs, and validation ownership

## Purpose

This document keeps the `admin/` React/Vite frontend understandable before more
Admin, User Portal, or public-site work is added. It maps the current source
shape and the rules future PRs should follow.

Use this document together with:

- `docs/USER_PORTAL_FLOW.md` for customer portal product and lifecycle rules.
- `docs/ADMIN_UI_LEGACY_ARCHIVE.md` for the legacy/private Admin boundary.
- `docs/CLOUDFLARE_PUBLIC_SITE_CI.md` for public static-site CI boundaries.
- `docs/VALIDATION_BASELINE.md` for validation command selection.

Do not use this document as proof that a Draft PR stack has merged. Re-check
GitHub and local `git status` before claiming which frontend shell is current.

## Frontend Surfaces

The repository currently has one frontend package with three user-facing
surfaces and one local operator helper surface.

| Surface | Audience | Entry | Main source | Backend boundary |
| --- | --- | --- | --- | --- |
| Protected Admin shell | Operator / internal admin | `admin/src/main.tsx` -> `admin/src/App.tsx` | `admin/src/components/layout/*`, `admin/src/pages/*`, `admin/src/features/subscriptions/*` | Protected `/api/admin/*` and `/api/admin/platform/*` through `AdminApiClient`; never public. |
| User Portal | Customer | `admin/src/portal-main.tsx`, also `#/portal` in the local Admin shell | `admin/src/features/user-portal/*` | Same-origin `/api/portal/*`; no Admin API and no operator authority. |
| Public Site | Public visitor / lead intake | `admin/src/site-main.tsx`, also `#/site` in the local Admin shell | `admin/src/features/company-site/*` | Public `/api/public/leads` only; no portal, Admin, subscription, or runtime APIs. |
| Install config helper | Local operator | `admin/src/install-config-main.tsx` | `admin/src/features/install-config/*` | Local helper text and dry-run command guidance only. |

## Runtime Shape

```text
admin package
  -> React entrypoints
  -> shell routing / standalone roots
  -> layout and shared components
  -> surface-specific pages
  -> typed clients
  -> same-origin or trusted loopback HTTP APIs
```

The frontend is an adapter layer. It renders server-owned facts and sends user
intent to reviewed backend APIs. It must not own entitlement, issuance, quota,
expiry, approval, runtime, or data-plane decisions.

## Entry And Build Outputs

The root `package.json` exposes frontend validation through repository-level
scripts:

```text
npm run admin:test
npm run admin:build
npm run admin:portal:build
npm run admin:portal:verify
npm run admin:site:build
npm run admin:site:verify
npm run cloudflare:site:validate
```

Inside `admin/package.json`:

| Command | Output | Purpose |
| --- | --- | --- |
| `npm run dev` | Vite dev server on loopback | Local Admin shell with `/api` proxy to `127.0.0.1:3456`. |
| `npm run build` | `admin/dist` | Main protected Admin bundle. |
| `npm run build:portal` | `admin/dist-portal` | Standalone User Portal bundle. |
| `npm run build:site` | `admin/dist-site` | Standalone public static site bundle. |
| `npm run verify:portal-build` | verifier only | Checks the portal bundle boundary. |
| `npm run verify:site-build` | verifier only | Checks the public-site bundle boundary. |

`admin/vite.config.ts` is the local Admin development config. It proxies `/api`
to the local backend. `admin/vite.portal.config.ts` and
`admin/vite.site.config.ts` build the standalone portal and site roots. The
Cloudflare lane may use only the static `dist-site` output and must not absorb
the Express/SQLite control plane.

## Shell Routing

`admin/src/App.tsx` owns local shell routing:

```text
default route -> Protected Admin shell
#/portal     -> User Portal with HTTP client
#/portal-preview -> User Portal with local preview client
#/site       -> Public Site
```

The hash routes are local shell conveniences. They do not make Admin public and
do not grant production route authority.

Admin page routing is intentionally small in the current source:

```text
dashboard
portalRequests
usageMonitor
```

The navigation source is `admin/src/app/navigation.ts`. If a future Admin OS or
app-manifest branch changes the navigation model, it should keep this rule:
visible navigation must point either to live protected data adapters or to
clearly labeled preview/design routes. Active operational routes must not
silently degrade into static blueprint pages.

## Client Boundaries

### Admin API Client

`admin/src/features/subscriptions/api-client.ts` is the protected Admin client.
It:

- sends the console token only after `adminAuthOriginPolicy(...)` accepts the
  target as same-origin or trusted loopback;
- normalizes filter query strings before sending requests;
- maps backend status failures into operator-readable errors;
- centralizes all Admin and Admin Platform API calls for Admin pages.

Admin pages should depend on `AdminApiClient`, not call `fetch` directly. This
keeps token policy, base URL trust, and backend error handling in one place.

Allowed Admin client targets:

- `/api/admin/subscriptions`
- `/api/admin/nodes`
- `/api/admin/overview`
- `/api/admin/platform/*`

Not allowed:

- sending console tokens to arbitrary cross-origin URLs;
- calling production endpoints from the browser without same-origin or tunnel
  control;
- embedding subscription material, tokens, credentials, raw logs, or customer
  data in page state beyond explicit visible-once UI flows.

### User Portal Client

`admin/src/features/user-portal/user-portal-client.ts` owns the customer portal
client contract.

There are two implementations:

- `createHttpUserPortalClient(...)` for same-origin `/api/portal/*` routes.
- `createLocalUserPortalClient(...)` for repository-local preview and browser
  validation.

The portal client must preserve the `noAdminApi` boundary. It renders
server-owned lifecycle, package, usage, security, and support facts. It must not
call Admin APIs, infer subscription authority from browser state, or create
runtime subscription material by itself.

### Public Site Client

`admin/src/features/company-site/company-site-page.tsx` may submit public lead
intake to `/api/public/leads`. It must remain a static public surface:

- no Admin API calls;
- no portal session calls;
- no subscription refresh or artifact routes;
- no token, credential, customer-private, or runtime material.

## Component And Page Ownership

Use this ownership rule for new frontend code:

| Layer | Owns | Should not own |
| --- | --- | --- |
| Entry files | React root selection and standalone bundle setup | Business decisions or API details. |
| Shell / layout | Navigation, chrome, search inputs, route switching | Entitlement, issuance, expiry, or quota decisions. |
| Page components | View state, loading/error/empty states, local filters, safe summaries | Direct storage/runtime mutation or ad hoc API clients. |
| Feature clients | Typed API calls and response mapping | UI layout or business rule ownership. |
| Domain types | Shared TypeScript contracts for frontend rendering | Runtime authority or secret material. |
| Tests | UI contract, safety boundary, loading/error states, copy and no-secret assertions | Live production validation. |

If two pages need the same non-visual rule, move it to a feature helper or
backend service contract instead of duplicating it in page state.

## Safety Rules

Frontend PRs must preserve these boundaries:

- Public Admin is not a product surface.
- User Portal must not call Admin APIs.
- Public Site must not call Portal, Admin, subscription, or runtime APIs.
- Browser code must not store or log raw tokens, credentials, subscription
  URLs, raw handoff material, SQLite rows, or customer-private data.
- Visible-once subscription material may be shown only in explicit reviewed
  delivery/refresh flows, and should not be persisted in docs, logs, tests, or
  local durable storage.
- Preview-only panels must label themselves as preview/review surfaces and must
  not expose execution buttons or approval submission controls.
- A-tier runtime actions, production deploys, schema migrations, DNS/Nginx
  changes, payment activation, and data-plane mutations require separate gates.

## Validation Matrix

Use the smallest command set that covers the touched surface.

| Touched surface | Minimum validation |
| --- | --- |
| Docs only | `git diff --check origin/master...HEAD` |
| Admin shell/pages/client | `npm run admin:test`, `npm run admin:build`, `npm test`, diff check |
| User Portal bundle | `npm run admin:test`, `npm run admin:portal:build`, `npm run admin:portal:verify`, `npm test`, diff check |
| Public Site bundle | `npm run admin:test`, `npm run admin:site:build`, `npm run admin:site:verify`, diff check |
| Cloudflare static-site lane | `npm run cloudflare:site:validate` plus docs/PR evidence |

When a PR touches both frontend and backend contracts, include focused backend
tests for the corresponding `/api/admin/*`, `/api/portal/*`, or
`/api/public/*` routes.

## Current Collaboration Notes

Frontend work is safe to parallelize only when file ownership is separated.

Safer parallel lanes:

- public site copy/style with site verifier;
- User Portal client/page behavior with portal tests;
- Admin API client/types with targeted page tests;
- docs-only architecture or IA updates.

High-conflict lanes:

- `admin/src/App.tsx`;
- `admin/src/app/navigation.ts`;
- `admin/src/styles.css`;
- shared Admin layout components;
- shared large tests such as `admin/src/test/subscriptions.test.ts`.

For Draft PR stacks, merge or rebase base UI foundation branches before adding
new page behavior on top. If a base Admin shell branch changes page/frame
contracts, downstream live-data PRs must be revalidated on the new base before
they can leave Draft.
