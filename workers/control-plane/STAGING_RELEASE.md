# Control-plane Worker — Primary-account staging release

Status: exact master baseline now **active on isolated Staging**; **not a production business cutover**.

## Exact resource identity (read back on 2026-11-20)

| Resource | Allowed value |
| --- | --- |
| Cloudflare account | `gccltd.co2026@gmail.com` / `17d66c001f9d851fa0d5a88cd311c2c0` |
| Worker | `flylink-control-plane-staging` |
| Worker D1 binding | `CONTROL_DB` |
| Bound staging D1 | `flylink-control-plane-staging` / `1ec6458a-0ac0-4ab0-92f3-5ba58b775acc` |
| Migration rehearsal D1 (NOT bound) | `flylink-control-migration-e4` / `05732071-22a5-4e04-834c-f5dd4407a462` |
| Public-site Worker (NOT this deployment) | `proxy-gateway-minimal` |
| Primary source baseline | `master@11dd1cfb208b78a85ce77b8c8aef2b6763f9000a` |

On 2026-11-20 the exact 15-module Worker source from the above commit was
uploaded through the Cloudflare version API as staging version 3:
`289aef3b-e7f1-4e82-8ed4-c7c08d377565`. After the dedicated Worker CI
succeeded, the version was promoted to **100% of Staging traffic**, deployment
`8a36048f-0441-49fb-bb65-557ee79a47e9` (Cloudflare timestamp:
`2026-11-19T17:51:06Z`). A post-deployment Cloudflare API readback confirmed
the exact version and `CONTROL_DB` staging D1 ID, and showed the existing
`secret_text` and `plain_text` bindings intact. No secret values were
retrieved. The earlier active Worker version was
`6c1b8434-8a5d-4d9e-9085-e31852963263`, available as a known code rollback
reference; a rollback does not restore database state.

The remote HTTP `/healthz` probe has **not** been proven from this executor
(the external URL was not reachable through its web verification tool).
Cloudflare version upload and deployment API readback are confirmed, but HTTP
smoke / Auth0 / DO / customer business readiness is **not** claimed.

The repository's existing `wrangler.control-plane.jsonc` remains
**local-only** and must not be pointed at real resources. The separate
`wrangler.staging.jsonc` pins the exact live staging account and D1 identity.
The staging config declares **no remote Durable Object bindings or migrations**.
Newer Auth0/Portal/Admin session paths that need those bindings cannot be treated
as remotely ready by this baseline. Do not create DO namespaces implicitly.

## Version-first release flow (every PR)

1. Re-read `master` and use the exact reviewed/merged source SHA. Record the
   Cloudflare account, Worker name, staging D1 ID, currently active version,
   and bindings before each upload. Abort on any mismatch.
2. From `workers/control-plane`, run `npm ci` with the checked-in lockfile
   and run the existing Worker Miniflare tests. From the repository root run
   `node --test tools/c2-worker-config-policy/check.test.mjs` and
   `node tools/c2-worker-config-policy/check.mjs`.
3. Run a Wrangler dry run using `wrangler.staging.jsonc`, then upload a
   **non-active** version from that exact commit. Preserve the already
   provisioned manifest-signing secrets; never print or export secret values.
4. Verify the new Cloudflare version's source SHA annotation and binding
   names/types/IDs. The only D1 binding must be `CONTROL_DB` pointing to
   `1ec6458a-0ac0-4ab0-92f3-5ba58b775acc`. Any reference to the E4 D1,
   Domain A account, new DO binding, unexpected service binding, or missing
   existing secret is a stop condition.
5. Promote only the reviewed version to this **Staging** Worker, and compare
   its active deployment ID with the intended version. Run `/healthz` and
   authorized G3/G4 smoke checks. If a route's dependencies are not
   provisioned, record that route as unready rather than bypassing checks.
6. Keep BWH as the **sole production business writer**. No Cloudflare
   production-domain routes, customer data import, E4 DDL, Worker business
   traffic switch, D1 authority flip, or production SQLite changes belong in
   this staging release lane.

The fixture migrations in `migrations/` are **not** the E4 production
business schema and must not be applied remotely as part of this lane. The
staging Wrangler config intentionally points its migration directory to
`migrations-staging-explicit-only`, which is not supplied by this PR, to avoid
accidental use of the local-only fixtures.

Future PRs: single-writer/epoch fail-closed gate; isolated D1 source schema
alignment; delta runner; shadow-read instrumentation; and final separate
cutover/recovery implementation. Each PR advances only its own staging-ready
slice. Do not infer readiness for remaining routes from a successful Worker
bundle upload.
