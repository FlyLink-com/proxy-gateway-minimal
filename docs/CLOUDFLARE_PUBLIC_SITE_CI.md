# Cloudflare Public Site CI

Last updated: 2026-06-09.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: cloudflare_public_site_ci
  superseded_by: null
  last_verified_at: 2026-06-09
  production_authority: false
```


This document defines the repository-only CI boundary for the public static
site that can be built for Cloudflare. It does not approve Cloudflare account,
DNS, production, Worker route, secret, API, subscription, payment, or runtime
changes.

## Scope

The Cloudflare public-site lane is limited to static assets from
`admin/dist-site`, produced by the Admin app site build.

Allowed in this lane:

- Build the public static site.
- Verify that the public static bundle does not contain Admin, portal API, or
  subscription API routes.
- Run a Wrangler dry-run against the root `wrangler.jsonc`.

Not allowed in this lane:

- Moving Express, SQLite, the control plane, Admin API, User Portal API,
  subscription API, protocol nodes, or runtime adapters to Cloudflare.
- Publishing secrets, tokens, subscription URLs, account credentials, or
  customer data.
- Mutating DNS, Cloudflare routes, Workers, production, Vultr, Aliyun, AWS,
  Nginx, systemd, firewall rules, or provider settings.

## Commands

Run these from the repository root:

```powershell
npm run cloudflare:site:build
npm run cloudflare:site:verify
npm run cloudflare:site:dry-run
```

For the full local CI-equivalent public-site check:

```powershell
npm run cloudflare:site:validate
```

The dry-run script pins Wrangler through `npx --yes wrangler@4.99.0` instead of
adding Wrangler as a root dev dependency. This keeps the backend package's Node
engine boundary intact while still making the Cloudflare validation
reproducible.

The repository also keeps `wrangler.public-site.jsonc` as an explicit local
preview configuration. Cloudflare Workers Builds should use the root
`wrangler.jsonc` so the default deploy command can discover the static assets
configuration without dashboard-only path overrides.

## GitHub CI

The main CI workflow runs the same public-site checks after the Admin build:

1. `npm run cloudflare:site:build`
2. `npm run cloudflare:site:verify`
3. `npm run cloudflare:site:dry-run`

These checks are safe for pull requests because they do not require Cloudflare
credentials and do not deploy.

## Cloudflare Integration Boundary

If Cloudflare Git integration or a future GitHub Actions deploy gate is enabled,
use this boundary:

- Repository root: project root.
- Build command: `npm ci && npm ci --prefix admin && npm run cloudflare:site:build && npm run cloudflare:site:verify`
- Deploy command: `npx wrangler deploy` or `npx --yes wrangler@4.99.0 deploy --config wrangler.jsonc`
- Static output source: `admin/dist-site`.

Deployment still requires a separate approval gate. Store Cloudflare tokens only
in the approved secret store for the chosen deployment surface; never commit
them to Git.

## Validation Criteria

The lane is ready only when:

- The public static site build passes.
- The public static boundary verifier passes.
- Wrangler dry-run passes.
- No backend route, Admin API route, portal API route, subscription API route,
  token, secret, subscription URL, account credential, SQLite row, or runtime
  material is included in the static bundle.
