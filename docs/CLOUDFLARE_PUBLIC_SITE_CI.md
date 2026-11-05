# Cloudflare Public Site CI

Last updated: 2026-11-04, America/Los_Angeles.

\`\`\`yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: cloudflare_public_site_ci
  superseded_by: null
  last_verified_at: 2026-11-04
  production_authority: false
\`\`\`

This document defines only the repository-owned CI boundary for the public static
site built for Cloudflare. It does not define or validate the separate
Cloudflare Workers control-plane API / D1 lane approved in
\`docs/CLOUDFLARE_D1_DATABASE_EVALUATION.md\`.

The owner approved the target direction on 2026-11-04 for Cloudflare Workers to
host the control-plane API and one D1 database to become the authoritative
business-control store after gated implementation and migration. That decision
does not change the scope of this static-site CI lane, create a Worker or D1
resource, add a binding, or authorize deployment.

## Scope

The Cloudflare public-site lane remains limited to static assets from
\`admin/dist-site\`, produced by the Admin app site build.

Allowed in this lane:

- Build the public static site.
- Verify that the public static bundle does not contain Admin, portal API, or
  subscription API routes.
- Run a Wrangler dry-run against the root \`wrangler.jsonc\`.

Not covered or authorized by this lane:

- The separate control-plane Worker entrypoint, API routes, D1 database,
  bindings, migrations, or repository adapters.
- Production database inventory, data movement, schema migration, or cutover.
- Cloudflare account changes, Worker routes, DNS, custom domains, secrets,
  payment/provider activation, or production runtime changes.
- Protocol-node, BWH, Nginx, systemd, firewall, or provider changes.
- Publishing secrets, tokens, subscription URLs, account credentials, customer
  data, raw SQLite rows, or runtime credential material.

These items are not prohibited as a target architecture; they are governed by
the separate architecture decision and their own implementation and Risk A
approval gates.

## Commands

Run these from the repository root:

\`\`\`powershell
npm run cloudflare:site:build
npm run cloudflare:site:verify
npm run cloudflare:site:dry-run
\`\`\`

For the full local CI-equivalent public-site check:

\`\`\`powershell
npm run cloudflare:site:validate
\`\`\`

The dry-run script pins Wrangler through \`npx --yes wrangler@4.99.0\` instead of
adding Wrangler as a root dev dependency. This keeps the backend package's Node
engine boundary intact while still making the Cloudflare validation
reproducible.

The repository keeps \`wrangler.public-site.jsonc\` as an explicit local
preview configuration. The root \`wrangler.jsonc\` remains the static-site
configuration at this source cutoff; it has no control-plane Worker entrypoint
or D1 binding.

## GitHub CI

The main CI workflow runs the same public-site checks after the Admin build:

1. \`npm run validation:environment:source\`
2. \`npm ci\` and \`npm ci --prefix admin\`
3. \`npm run cloudflare:site:build\`
4. \`npm run cloudflare:site:verify\`
5. \`npm run cloudflare:site:dry-run\`

The separately scheduled deploy job repeats the Source preflight and build
instead of inheriting a dependency tree from the validation runner. This proves
the repository-owned static-site runner boundary only; it does not validate the
Cloudflare account, token, routes, DNS, Worker API, D1, or production network.

These checks are safe for pull requests because they do not require Cloudflare
credentials and do not deploy.

## Cloudflare Integration Boundary

Keep the two delivery lanes separate:

### Public static site

- Repository root: project root.
- Build command: \`npm run validation:environment:source && npm ci && npm ci --prefix admin && npm run cloudflare:site:build && npm run cloudflare:site:verify\`
- Deploy command: \`npx wrangler deploy\` or \`npx --yes wrangler@4.99.0 deploy --config wrangler.jsonc\`
- Static output source: \`admin/dist-site\`.

### Control-plane Worker and D1 — separate future lane

The approved target should use a dedicated Worker configuration (proposed:
\`wrangler.control-plane.jsonc\`), Worker entrypoint, D1 binding, migrations
directory, validation commands, and deployment gate. Do not add its secrets or
remote migration commands to the public static-site build.

The Worker lane must validate local D1 migrations and synthetic API/domain
contracts without production credentials. Remote staging resource creation,
Worker routes, D1 bindings, secrets, DNS/custom domains, and deployment each
require their own explicit approval. Production migration and cutover remain
Risk A.

## Validation Criteria

The static-site lane is ready only when:

- The public static site build passes.
- The public static boundary verifier passes.
- Wrangler dry-run passes.
- No backend route, Admin API route, portal API route, subscription API route,
  token, secret, subscription URL, account credential, SQLite row, or runtime
  material is included in the static bundle.

Passing this lane is not evidence that the Worker API, D1 schema, D1 migration,
control-plane authentication, BWH agent, or production cutover is ready.
