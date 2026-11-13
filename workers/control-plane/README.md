# FlyLink Control-Plane Worker — G3 Local Vertical Slice

The runnable G3/G4 control-plane source slices for the approved Workers + D1 target architecture (`docs/CLOUDFLARE_D1_DATABASE_EVALUATION.md`). G3 proves a protected account API and one bounded idempotent write. G4 adds the BWH Agent's outbound HTTPS control channel: signed desired-state manifests, scoped request authentication, replay protection and redacted idempotent receipts. All Worker/D1 execution remains local Miniflare with synthetic data only.

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
- **No production schema migration.** `0001` is the two-table G3 source slice, `0002` is its slice-local idempotency store, and `0003` adds only local G4 Agent protocol fixtures/ledgers. None is a migration of the 70-table control schema or an approved production DDL change.

## Layout

| Path | Purpose |
| --- | --- |
| `wrangler.control-plane.jsonc` | Separate control-plane Wrangler config (binding `CONTROL_DB`, database name `flylink-control-dev`, `migrations/`) |
| `migrations/0001_accounts_slice.sql` | DDL copied verbatim from the G2 stage-1 DDL set (`ddl-set.json`, baseline `master@63082bae`) |
| `migrations/0002_write_idempotency.sql` | G3 slice-local bounded-write idempotency store (not production DDL) |
| `migrations/0003_agent_protocol_slice.sql` | G4 local-only node/channel, desired-state refs/digests, 120-second manifest claim/lease ledger, hashed Agent credentials, replay nonces, receipt ledger, credential events, and a partial unique index enforcing one active rotation candidate per current key |
| `src/agent-protocol.mjs` | G4 signed desired-state and redacted receipt HTTP handlers; WebCrypto only |
| `src/repositories/agent-repository.mjs` | G4 Agent credential, nonce, receipt and bounded key-rotation persistence |
| `src/index.mjs` | Worker entrypoint and routing |
| `src/auth.mjs` | Fail-closed Bearer-token checks (constant-time, digest-based); separate read and write tokens |
| `src/cursor.mjs` | Strict keyset cursor codec (base64url JSON `{createdAt, id}`) |
| `src/digests.mjs` | SHA-256 hex + random token helpers (WebCrypto) |
| `src/repositories/account-repository.mjs` | Async D1 repository: `findById`, `listDirectory` |
| `src/repositories/challenge-repository.mjs` | Async D1 repository for the write flow: idempotency lookup + atomic challenge issuance |
| `seed/synthetic-seed.sql` | Obviously synthetic seed data (`acct-synth-*`) with same-timestamp groups |
| `test/` | Node test runner + Miniflare suites (migration, repository, pagination, API, Agent protocol) plus the root G4 Agent contract tests |

### Why the second table is second-factor challenges, not portal sessions

`platform_portal_sessions` was the first session-direction candidate,
but its `entry_id` foreign key references `platform_portal_entries(id)`,
so it is not DDL-self-contained.
`platform_portal_second_factor_challenges` references only
`platform_accounts(id)`, carries no triggers, and sits squarely in the
account-security direction, so the slice stays self-contained with two
tables.

## C1 Auth0 identity proof and Admin BFF (development-only source)

This source-only C1 slice adds isolated Portal/Admin identity proof and an Admin Backend-for-Frontend (BFF). It is not an internal account/operator authorization grant, production enablement, or a Cloudflare deployment.

| Route | Trust boundary |
| --- | --- |
| `GET /v1/auth/portal/identity` | Verifies a Portal RS256 Access Token against the Portal issuer/JWKS and returns a minimal external actor projection; it does not resolve internal account permissions. |
| `/v1/auth/admin/login` and `/v1/auth/admin/callback` | Auth0 Universal Login with Authorization Code + PKCE S256; one-time state, nonce, issuer/audience/client/subject and completed-MFA proof are checked. |
| `GET /v1/auth/admin/identity` | Reads the short-lived opaque Admin BFF session; it does not accept a raw provider token as the session cookie. |
| `/v1/auth/admin/logout` | Revokes the opaque session. |

Admin provider tokens are verified in memory and discarded. The BFF uses a host-only Secure/HttpOnly/SameSite=Strict cookie, a 15-minute absolute session, and short-lived transaction state in the dedicated `AdminAuthState` Durable Object. The PKCE verifier is encrypted with transaction-bound AAD. No refresh token is retained; an unexpected Refresh Token is revoked and login fails closed. The two Post-Login Actions are ordered Challenge → Assertion; enrollment alone does not issue MFA proof, and a fresh completed OTP login is required.

### Non-production evidence and remaining gates

- Admin DEVELOPMENT C1-B retest: exact repository Challenge/Assertion templates were read back byte-identically; Action order and MFA customization were verified; T1–T5 passed against the synthetic user.
- Auth0-issued callback E2E round 2: **10/11 PASS**. N2a browser-form callback replay is not separately proven; N2b protocol-level consume-once behavior is covered.
- Still open before shared enablement: callback query-string redaction in edge/access logs; login rate limiting and abuse protection; verified same-origin hosting and cookie boundaries; the N2a browser replay proof; and final C1 owner acceptance.
- This repository config binds the Durable Object for local testing only. No remote DO namespace, Worker Secret, binding, route, or Worker deployment is created by this branch.

### Local/synthetic configuration names

Required names (no real values are committed): `AUTH0_PORTAL_ISSUER`, `AUTH0_PORTAL_AUDIENCE`, `AUTH0_PORTAL_ALLOWED_CLIENT_IDS`, `AUTH0_ADMIN_ISSUER`, `AUTH0_ADMIN_AUDIENCE`, `AUTH0_ADMIN_ALLOWED_CLIENT_IDS`, `AUTH0_ADMIN_MFA_CLAIM`, `AUTH0_ADMIN_CLIENT_ID`, `AUTH0_ADMIN_CLIENT_SECRET`, `AUTH0_ADMIN_REDIRECT_URI`, `ADMIN_APP_ORIGIN`, and `AUTH0_ADMIN_TX_ENCRYPTION_KEY`. Optional: `AUTH0_MAX_TOKEN_LIFETIME_SECONDS`. The transaction key is a local/synthetic 32-byte Base64URL value; no real key or tenant secret belongs in source, CI logs, fixtures, or evidence.

Implementation: `src/oidc-gateway.mjs`, `src/admin-auth.mjs`, `src/admin-auth-state.mjs`, and `auth0-actions/`. The focused test files cover OIDC/JWKS validation, BFF state/session behavior, Auth0 Action decisions, and workerd redirect handling. C1 remains OPEN until the remaining gates and a fresh exact-HEAD review are complete.

## API

| Route | Auth | Behavior |
| --- | --- | --- |
| `GET /healthz` | open | `{ "ok": true, "service": "flylink-control-plane" }` |
| `GET /v1/accounts/:accountId` | Bearer (read) | One account, safe projection only |
| `GET /v1/accounts?status=&limit=&cursor=` | Bearer (read) | Keyset-paginated directory |
| `POST /v1/accounts/:accountId/second-factor-challenges` | Bearer (write) | Issue one second-factor challenge; requires `Idempotency-Key` |
| `GET /v1/agent/desired-state?nodeRef=&channelRefs=` | Scoped Agent Bearer + key ID + timestamp + nonce + `Idempotency-Key` | Claim a signed refs/digests-only manifest for the exact node/channel scope; 120-second lease; same key replays the same claim |
| `POST /v1/agent/receipts` | Scoped Agent Bearer + key ID + timestamp + nonce | Validate the node/channel/generation/digest binding and record one redacted idempotent receipt per channel |

- Read routes expect the `CONTROL_PLANE_READ_TOKEN` secret/var; the
  write route expects the separate `CONTROL_PLANE_WRITE_TOKEN`.
  **When the relevant token is not configured, every such request
  returns 401** (fail-closed), and neither token works for the other
  privilege level.
- Agent credentials are stored as SHA-256 token digests, never plaintext. Each Agent request binds `x-agent-key-id`, `x-agent-node-ref`, an ISO timestamp (±5 minutes) and a single-use nonce. Desired-state claims also require an `Idempotency-Key`; the Worker persists the exact signed envelope and a 120-second lease, returning the same envelope for the same key and scope. The Agent persists that key with a canonical node/channel-scope fingerprint and replaces it when scope changes. Receipt idempotency keys are versioned SHA-256 hashes of canonical tuple encoding, not delimiter concatenations. Per-channel material count is bounded to 32 so the deterministic receipt remains under the 16 KiB request limit. The credential's node and channel set must authorize the request; missing configuration fails closed. Rotation candidates use the same Bearer token contract as authentication (24–512 non-whitespace characters), so an unusable candidate cannot reserve the overlap slot. The 15-minute maximum overlap is enforced in the local credential repository, and a new key's first successful authentication is recorded before the old key can be revoked.
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
- Migration `0002` adds `platform_write_idempotency_keys`; migration `0003` adds local-only G4 protocol fixtures and ledgers. These are slice-local designs, **not** copied production DDL. D1 contains only opaque refs, SHA-256 digests, generation/status, hashed Agent API tokens, replay nonces, signed refs-only claim envelopes and receipt metadata. Manifest signing private keys are Worker secret bindings, never D1 rows. Raw credential material is resolved only on BWH and never enters Worker requests, responses, D1 or logs.
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
- **write-flow** — issuance projection, idempotent replay/conflict, privilege separation, fail-closed behavior and atomic rollback.
- **agent-protocol** — Ed25519 manifest verification with the existing Agent verifier, refs/digests-only payloads, node/channel scope, timestamp and nonce replay checks, 120-second idempotent claim leases, redacted receipt binding and replay/conflict behavior, credential overlap/expiry/leak revocation, and a full Agent-client ↔ Worker ↔ local D1 cycle including lost claim/receipt response recovery without a second apply, narrowed-scope receipt deferral/recovery, and rejection of invalid rotation tokens before key reservation.
- **Agent contract** — the existing `server/tests/agent-g4-contract.test.mjs` suite also runs in this targeted Worker workflow, including the persisted claim-key and pending-receipt retry semantics.

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
- G1-30: the formally approved Agent HTTPS, scoped authentication, signed-manifest, local material-resolution and redacted receipt contract. The Worker implementation is still a local synthetic slice; it is not connected to BWH and is not deployed.


## C2 Crypto Worker Service Binding proof

The test suite includes crypto-service-binding.test.mjs. It uses a synthetic caller Worker fixture and a separate Miniflare Crypto Worker joined by a private Service Binding. This proves only the internal binding and caller-token mechanics; it does not add a Service Binding or crypto route to this G3 Worker. The G3 slice currently has no end-user/domain authorization context, so actual integration is deferred until the C1 identity path supplies that authorization boundary. Do not add a generic public crypto relay route.
