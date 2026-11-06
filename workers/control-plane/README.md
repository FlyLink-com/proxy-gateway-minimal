# FlyLink Control-Plane Worker — G3 Local Vertical Slice

The first runnable slice of the approved Workers + D1 control-plane
target architecture (`docs/CLOUDFLARE_D1_DATABASE_EVALUATION.md`, gate
**G3 — Worker API vertical slice**). It proves, entirely locally and
with synthetic data only, that a Cloudflare Worker can serve a
protected account API backed by an asynchronous D1 repository using
the repository's real control-database DDL: first a read-only account
API, and now one bounded, idempotent write flow (issuing a
second-factor challenge) that exercises D1 transaction atomicity and
failure recovery.

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
| `migrations/0002_write_idempotency.sql` | Slice-local idempotency store (new table, **not** production DDL — see below) |
| `src/index.mjs` | Worker entrypoint and routing |
| `src/auth.mjs` | Fail-closed Bearer-token checks (constant-time, digest-based); separate read and write tokens |
| `src/cursor.mjs` | Strict keyset cursor codec (base64url JSON `{createdAt, id}`) |
| `src/digests.mjs` | SHA-256 hex + random token helpers (WebCrypto) |
| `src/repositories/account-repository.mjs` | Async D1 repository: `findById`, `listDirectory` |
| `src/repositories/challenge-repository.mjs` | Async D1 repository for the write flow: idempotency lookup + atomic challenge issuance |
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
| `GET /v1/accounts/:accountId` | Bearer (read) | One account, safe projection only |
| `GET /v1/accounts?status=&limit=&cursor=` | Bearer (read) | Keyset-paginated directory |
| `POST /v1/accounts/:accountId/second-factor-challenges` | Bearer (write) | Issue one second-factor challenge; requires `Idempotency-Key` |

- Read routes expect the `CONTROL_PLANE_READ_TOKEN` secret/var; the
  write route expects the separate `CONTROL_PLANE_WRITE_TOKEN`.
  **When the relevant token is not configured, every such request
  returns 401** (fail-closed), and neither token works for the other
  privilege level.
- The safe projection is exactly `id`, `status`, `createdAt`,
  `updatedAt`. `owner_ref` and `metadata_json` are never selected by
  the repository and cannot appear in a response.
- Errors are JSON: `{ "error": { "code": "...", "message": "..." } }`
  with `401 unauthorized`, `400 invalid_query` / `invalid_body` /
  `invalid_idempotency_key`, `404 account_not_found` / `not_found`,
  `405 method_not_allowed`, `409 idempotency_key_conflict`.
- The write flow is bounded to exactly one operation: create one
  `active` second-factor challenge (10-minute expiry) for an existing
  account. The request body is exactly
  `{ "allowedFactors": [...] }` with 1–4 unique values from
  `email | sms | totp | webauthn`; factors are canonicalized (sorted)
  before storage and fingerprinting. There is no status gating in
  this slice.
- Idempotency: the `Idempotency-Key` header (16–128 visible ASCII)
  is required. The challenge row and the idempotency record are
  inserted in one atomic D1 `batch()`, so a failed write leaves no
  partial state. A retry with the same key and a canonically
  identical request replays the stored response with header
  `idempotency-replayed: true`; the same key with a different
  request is `409`. Keys are scoped per account + operation.
- The response projection is exactly `id`, `accountId`, `status`,
  `allowedFactors`, `expiresAt`, `createdAt`. The stored
  `challenge_hash` is the SHA-256 of a random one-time secret; the
  secret and the hash never appear in any response. Delivering the
  secret to a factor channel is a production concern outside this
  slice.
- Migration `0002` adds `platform_write_idempotency_keys`. Unlike
  migration `0001`, this table is **not** copied from the production
  schema: it is a new slice-local design following the G1-30
  contract's idempotency requirement, and it graduates to production
  only through the normal migration gates, if adopted.
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

# Bounded write: issue a second-factor challenge (idempotent —
# repeating the same command with the same key replays the original
# 201 response instead of creating a second challenge). Start the
# dev server with --var CONTROL_PLANE_WRITE_TOKEN:... as well.
curl -s -X POST \
  http://127.0.0.1:8787/v1/accounts/acct-synth-101/second-factor-challenges \
  -H "Authorization: Bearer synth-write-token" \
  -H "Idempotency-Key: demo-key-00000001" \
  -H "content-type: application/json" \
  -d '{"allowedFactors":["totp"]}'
```

For real use, provide the token through `.dev.vars` (git-ignored) or
`wrangler secret` in an approved environment — never commit a token.

## Tests

```bash
npm test
```

The suites run the real Worker entrypoint under Miniflare against a
fresh local D1 database with the real migrations applied:

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
- **write-flow** — issuance projection and stored-row shape, replay
  of canonically identical retries (`idempotency-replayed: true`,
  exactly one challenge), 409 on key reuse with a different request,
  per-account key scoping, `Idempotency-Key` and body validation
  (nothing written on any 400), 404 with no orphan idempotency
  record, read/write privilege separation, write fail-closed, 405,
  and a repository-level atomicity proof: when the idempotency
  insert fails, the challenge insert in the same batch is rolled
  back.

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
- Write idempotency: the G1-30 contract requirement that writes be
  idempotency-keyed (request fingerprint + stored-response replay);
  the storage table itself is a slice-local design (migration 0002).
