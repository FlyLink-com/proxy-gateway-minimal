# FlyLink Control-Plane Worker — G3 Local Vertical Slice

The first runnable slice of the approved Workers + D1 control-plane
target architecture (`docs/CLOUDFLARE_D1_DATABASE_EVALUATION.md`, gate
**G3 — Worker API vertical slice**). It proves, entirely locally and
with synthetic data only, that a Cloudflare Worker can serve a
protected, read-only account API backed by an asynchronous D1
repository using the repository's real control-database DDL.

## Status and non-goals

- **Local only.** Nothing here is deployed. The Wrangler configuration
  (`wrangler.control-plane.jsonc`) deliberately carries no `account_id`
  and no remote `database_id`; only `--local` workflows are supported.
- **BWH remains the authority.** The existing Node/Express + SQLite
  control plane is unchanged and remains the single writer. This slice
  does not dual-write, sync, or read any production data.
- **No remote Cloudflare resources.** Creating a remote D1 database,
  deploying this Worker, or adding routes/secrets requires the
  separate G5+ gates in the architecture decision.
- **Scope is two tables.** The migration covers `platform_accounts`
  plus `platform_portal_second_factor_challenges`. It is not a
  migration of the 70-table control schema.

## Layout

| Path | Purpose |
| --- | --- |
| `wrangler.control-plane.jsonc` | Separate control-plane Wrangler config (binding `CONTROL_DB`, database name `flylink-control-dev`, `migrations/`) |
| `migrations/0001_accounts_slice.sql` | DDL copied verbatim from the G2 stage-1 DDL set (`ddl-set.json`, baseline `master@63082bae`) |
| `src/index.mjs` | Worker entrypoint and routing |
| `src/auth.mjs` | Fail-closed Bearer-token check (constant-time, digest-based) |
| `src/cursor.mjs` | Strict keyset cursor codec (base64url JSON `{createdAt, id}`) |
| `src/repositories/account-repository.mjs` | Async D1 repository: `findById`, `listDirectory` |
| `seed/synthetic-seed.sql` | Obviously synthetic seed data (`acct-synth-*`) with same-timestamp groups |
| `test/` | Node test runner + Miniflare suites (migration, repository, pagination, API) |

### Why the second table is second-factor challenges, not portal sessions

`platform_portal_sessions` was the first session-direction candidate,
but its `entry_id` foreign key references `platform_portal_entries(id)`,
so it is not DDL-self-contained.
`platform_portal_second_factor_challenges` references only
`platform_accounts(id)`, carries no triggers, and sits squarely in the
account-security direction, so the slice stays self-contained with two
tables.

## API

| Route | Auth | Behavior |
| --- | --- | --- |
| `GET /healthz` | open | `{ "ok": true, "service": "flylink-control-plane" }` |
| `GET /v1/accounts/:accountId` | Bearer | One account, safe projection only |
| `GET /v1/accounts?status=&limit=&cursor=` | Bearer | Keyset-paginated directory |

- The expected token is the `CONTROL_PLANE_READ_TOKEN` secret/var.
  **When it is not configured, every protected request returns 401**
  (fail-closed).
- The safe projection is exactly `id`, `status`, `createdAt`,
  `updatedAt`. `owner_ref` and `metadata_json` are never selected by
  the repository and cannot appear in a response.
- Errors are JSON: `{ "error": { "code": "...", "message": "..." } }`
  with `401 unauthorized`, `400 invalid_query`,
  `404 account_not_found` / `not_found`, `405 method_not_allowed`.
- Pagination mirrors the verified monitor contract
  (`listUserMonitorAccountDirectory` + `readAccounts`): rows are
  ordered `created_at DESC, id DESC`, the keyset predicate is
  `created_at < ? OR (created_at = ? AND id < ?)`, the repository
  fetches `limit + 1` rows, and `nextCursor` is the last page row's
  key tuple or `null` — including when the final page is exactly full.
  `limit` defaults to 20 and is capped at 100. Cursors are strictly
  validated (canonical base64url, exact key set, canonical ISO
  timestamp, id reference pattern); malformed cursors return 400.

## Run it locally

Requires Node.js 22+.

```bash
cd workers/control-plane
npm ci

# Apply the migration to the local D1 database and load synthetic data
npm run migrate:local
npm run seed

# Start the Worker locally (token passed as a local var for the demo)
npx wrangler dev --local --config wrangler.control-plane.jsonc \
  --port 8787 --var CONTROL_PLANE_READ_TOKEN:synth-read-token

curl -s http://127.0.0.1:8787/healthz
curl -s http://127.0.0.1:8787/v1/accounts/acct-synth-101 \
  -H "Authorization: Bearer synth-read-token"
curl -s "http://127.0.0.1:8787/v1/accounts?limit=5" \
  -H "Authorization: Bearer synth-read-token"
```

For real use, provide the token through `.dev.vars` (git-ignored) or
`wrangler secret` in an approved environment — never commit a token.

## Tests

```bash
npm test
```

The suites run the real Worker entrypoint under Miniflare against a
fresh local D1 database with the real migration applied:

- **migration** — the slice schema is created; CHECK and foreign-key
  constraints are enforced; account deletion cascades to challenges.
- **repository** — `findById` projection and null-on-missing;
  `listDirectory` contract order and status filtering.
- **pagination** — the five verified properties: same-timestamp stable
  order, continuous paging without duplicates or gaps, empty next
  cursor on the last page (including the exactly-full boundary),
  invalid-cursor rejection, and limit boundaries at 1 / N / beyond N.
- **api** — auth matrix (missing / malformed / wrong / correct token),
  fail-closed behavior when no token is configured, safe-projection
  key set, and JSON error shapes for 400 / 401 / 404 / 405.

CI (`.github/workflows/control-plane-worker.yml`) runs the same
`npm ci` + `npm test` for pull requests that touch
`workers/control-plane/**`. It uses no Cloudflare credentials and
never deploys.

## Evidence basis

- Architecture: `docs/CLOUDFLARE_D1_DATABASE_EVALUATION.md`
  (owner-approved target, 2026-11-04) and `docs/PROJECT_TOPOLOGY.md`
  (current vs future phase addendum).
- Schema: G1 source inventory / G2 stage-1 DDL set for
  `platform_accounts` and `platform_portal_second_factor_challenges`.
- Pagination behavior: G2 stage-7 pagination receipt (dual-engine
  keyset-pagination verification, Issue #830 item 3).
- Transaction/binding model: D1 prepared statements and `batch()`
  semantics as validated in the G2 local compatibility spike.
