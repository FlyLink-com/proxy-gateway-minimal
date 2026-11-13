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
| `migrations/0004_identity_bindings_slice.sql` | C1 local-synthetic-only issuer/subject → opaque account binding table; not target D1 DDL |
| `src/repositories/identity-binding-repository.mjs` | C1 strict active-binding resolution, collision planning and explicit revocation; no public binding-creation route |
| `src/agent-protocol.mjs` | G4 signed desired-state and redacted receipt HTTP handlers; WebCrypto only |
| `src/repositories/agent-repository.mjs` | G4 Agent credential, nonce, receipt and bounded key-rotation persistence |
| `src/index.mjs` | Worker entrypoint and routing |
| `src/auth.mjs` | Fail-closed Bearer-token checks (constant-time, digest-based); separate read and write tokens |
| `src/cursor.mjs` | Strict keyset cursor codec (base64url JSON `{createdAt, id}`) |
| `src/digests.mjs` | SHA-256 hex + random token helpers (WebCrypto) |
| `src/repositories/account-repository.mjs` | Async D1 repository: `findById`, `listDirectory` |
| `src/portal-auth.mjs` | C1 Portal Access Token exchange, internal trusted-session resolver and logout; business-side resolver is not a public route |
| `src/identity-boundary.mjs` | Worker-local mirror of the server identity-boundary contract; self-contained so the workerd module graph stays inside this package |
| `src/portal-auth-state.mjs` | C1 local-only Durable Object state for revocable opaque Portal sessions |
| `src/repositories/challenge-repository.mjs` | Async D1 repository for the write flow: idempotency lookup + atomic challenge issuance |
| `seed/synthetic-seed.sql` | Obviously synthetic seed data (`acct-synth-*`) with same-timestamp groups |
| `test/` | Node test runner + Miniflare suites (migration, repository, pagination, API, Agent protocol) plus the root G4 Agent contract tests |

### Why the initial account slice uses second-factor challenges, not portal sessions

The initial `0001` account slice chose the second-factor challenge table; C1 later adds a separate local-only identity-binding table in migration `0004`. `platform_portal_sessions` was the first session-direction candidate,
but its `entry_id` foreign key references `platform_portal_entries(id)`,
so it is not DDL-self-contained.
`platform_portal_second_factor_challenges` references only
`platform_accounts(id)`, carries no triggers, and sits squarely in the
account-security direction, so the slice stays self-contained with two
tables.

## Worker module boundary and identity-contract synchronization

The Worker module graph must remain entirely inside `workers/control-plane`. In particular, Worker source must never import from `../../../server` or any path that escapes this package root; workerd rejects such imports when Miniflare starts the Worker.

`src/identity-boundary.mjs` is a self-contained mirror of the four identity-boundary exports in `server/services/platform/d1-t2-identity-boundary.mjs`. The server module is the reference contract. When changing actor-context validation, binding record validation, binding resolution or collision planning, update both modules and both suites (`server/tests/d1-t2-identity-boundary.test.mjs` and `test/identity-boundary.test.mjs`) in the same commit. The Worker suite intentionally imports only its local mirror; do not reintroduce cross-package imports in Worker source or tests.

## C1 Auth0 identity proof and Portal session (development only)

Two isolated identity proof routes plus a Portal opaque-session exchange are present in this source branch:

| Route | Required credential | Required scope | Additional policy |
| --- | --- | --- | --- |
| `GET /v1/auth/portal/identity` | Portal JWT Access Token, signed RS256 and validated against Portal JWKS | `read:portal_identity` | Identity proof only; no mandatory MFA |
| `GET /v1/auth/admin/identity` | Same-origin Admin BFF opaque HttpOnly session cookie | N/A | 15-minute absolute session; recent completed-OTP claim required at issuance |
| `POST /v1/auth/portal/session` | Portal JWT Access Token, signed RS256 and validated against Portal JWKS | `read:portal_identity` | Resolves one active Portal issuer/subject binding to an active opaque account and issues a revocable session |
| `POST /v1/auth/portal/logout` | Opaque Portal session bearer | N/A | Revokes the corresponding Portal Durable Object session |

The `GET /v1/auth/portal/identity` route remains a proof-only endpoint and never reads/writes D1. `POST /v1/auth/portal/session` exchanges a verified Portal Access Token for a random opaque session only after an exact active `issuer_ref + subject_ref` binding resolves to an active account. The local D1 binding stores only the logical tenant alias (`portal` or `admin`), provider subject reference, opaque account reference and lifecycle timestamps; the Portal Durable Object stores only the minimal actor projection, opaque binding-generation reference and expiry. The actual Auth0 issuer URL is validated by the surface-specific OIDC verifier and is not stored in this table. Provider tokens, email, display names, password credentials, TOTP material and email digests are not stored. The Portal token does not provide verified factor evidence in this slice, so the actor context asserts an empty factor list rather than inventing an MFA claim. The opaque session token is returned once in JSON only for this local synthetic slice; no browser storage or HttpOnly-cookie policy is claimed. `resolvePortalSession()` is an internal business-side resolver and is deliberately not exposed as a public route; the private service-binding integration, actual business route, same-origin/cookie boundary and login rate-limit gates remain open. Admin uses a same-origin Backend-for-Frontend flow: `/v1/auth/admin/login` redirects to Auth0 Universal Login (Authorization Code + PKCE S256); `/v1/auth/admin/callback` validates one-time state, PKCE, ID Token nonce/subject and the verified Access Token MFA claim; `/v1/auth/admin/identity` reads a 15-minute opaque HttpOnly session; `/v1/auth/admin/logout` revokes it. No password/OTP grant or `offline_access` is used. Access/ID tokens are discarded after verification; session and short-lived transaction state live in the dedicated `AdminAuthState` Durable Object, never D1. The two Auth0 Post-Login Actions are separately ordered. `auth0-actions/admin-mfa-challenge.js` requires `event.user.enrolledFactors` to be an array; the tenant setting “Customize MFA Factors using Actions” must be enabled and the Post-Login trigger must be v3 or newer. An unavailable enrollment field fails closed as `admin_mfa_enrollment_state_unavailable` and is never treated as an empty enrollment. If OTP is already enrolled, the Action challenges OTP. If not, it challenges any existing supported non-email factor first (when present), then calls `enrollWith({type:'otp'})`. Enrollment and authentication are distinct operations: an enrollment-only transaction receives no MFA proof; the Assertion Action denies it with `admin_mfa_enrollment_completed_reauthenticate`, and the user must start a fresh login and complete an OTP challenge before a claim is issued. Transaction metadata is ephemeral and used only to distinguish this onboarding denial. The Admin DEVELOPMENT tenant has two Actions deployed and bound in Challenge → Assertion order, but its current Challenge copy is a diagnostic gate-bypass; the repository template has not yet been re-deployed verbatim. Exact-template retest remains open. The local Wrangler config binds both DO classes for local testing only. The new `0004` identity-binding migration and Portal DO are synthetic source fixtures; no target D1 DDL, remote Cloudflare namespace, Worker Secret, Service Binding, route or Worker deployment has been created. Other G3 read/write and G4 Agent routes keep their original separate bearer checks. Missing configuration or unsuccessful verification fails closed. Identity/session endpoints never echo tokens or PII.

Required environment bindings (not provisioned in this branch): `AUTH0_PORTAL_ISSUER`, `AUTH0_PORTAL_AUDIENCE`, `AUTH0_PORTAL_ALLOWED_CLIENT_IDS`, `AUTH0_ADMIN_ISSUER`, `AUTH0_ADMIN_AUDIENCE`, `AUTH0_ADMIN_ALLOWED_CLIENT_IDS`, `AUTH0_ADMIN_MFA_CLAIM`. Optional: `AUTH0_MAX_TOKEN_LIFETIME_SECONDS` (60–86400, default 7200). The client allowlists use comma-separated IDs. `AUTH0_ADMIN_MFA_CLAIM` is required and used by the Admin BFF to validate the namespaced OTP proof emitted by the Assertion Action. This claim proves only recent OTP completion for the configured Admin client; it does not grant internal operator or business permissions. The two scopes above are **provisional API-permission identifiers**, not approved or provisioned Auth0 resource configuration.

The implementation is in `src/oidc-gateway.mjs` and `test/oidc-gateway.test.mjs`. Its synthetic RSA/JWKS test groups exercise expiry, issuer/audience/client separation, rejected ID/opaque tokens, signature/key errors, key refresh, single-flight caching, Admin MFA and safe HTTP responses. The Admin DEVELOPMENT tenant has now completed a real Universal Login + Authorization Code + PKCE + OTP hosted-flow test with an Access Token MFA claim and refresh-token denial. That run used a diagnostic Challenge copy with the enrollment gate removed; it does not prove the exact repository Challenge template. The exact-template redeployment/retest and Worker callback end-to-end test remain open. No Cloudflare deployment or production identity mapping is claimed. See `docs/D1_T2_C1_AUTH0_GATEWAY_ACCESS_TOKEN_CONTRACT_V1.md`.

## API

| Route | Auth | Behavior |
| --- | --- | --- |
| `GET /healthz` | open | `{ "ok": true, "service": "flylink-control-plane" }` |
| `POST /v1/auth/portal/session` | Portal JWT Access Token | Verified Portal subject → one active opaque account binding → revocable opaque session; no PII in response |
| `POST /v1/auth/portal/logout` | Opaque Portal session bearer | Revoke the Portal session; idempotent for an already absent session |
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
  constraints are enforced; account deletion cascades to challenges; C1 identity-binding indexes and lifecycle checks are present.
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
- **identity-binding-repository / portal-auth / portal-auth-state** — opaque binding uniqueness and revocation, concurrent bind collision handling, account-delete restriction while a binding exists, Auth0 issuer/subject separation, active-account enforcement, opaque session creation/validation/revocation/expiry, and negative checks for unknown subjects, inactive accounts, cross-tenant tokens and PII/token persistence.
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


### Admin Auth0 BFF — source-only implementation

Required local/synthetic environment names (real values are not committed):
- `AUTH0_ADMIN_ISSUER`
- `AUTH0_ADMIN_AUDIENCE`
- `AUTH0_ADMIN_CLIENT_ID`
- `AUTH0_ADMIN_CLIENT_SECRET` (Worker Secret only; never D1)
- `AUTH0_ADMIN_ALLOWED_CLIENT_IDS`
- `AUTH0_ADMIN_REDIRECT_URI` (must be the fixed same-origin `/v1/auth/admin/callback`)
- `ADMIN_APP_ORIGIN` (must equal the callback origin)
- `AUTH0_ADMIN_MFA_CLAIM` (the exact HTTPS namespace configured in the second Action)
- `AUTH0_ADMIN_TX_ENCRYPTION_KEY` (32 random bytes, Base64URL; encrypts PKCE verifier at rest in the short-lived transaction DO)

The initial session is absolute 15 minutes, no sliding renewal, no refresh token, and a fresh interactive login + OTP is required at expiry. The transaction is single-use and expires after 5 minutes. The local Durable Object binding is defined only in `wrangler.control-plane.jsonc`; this is not a remote namespace creation or deployment authorization.

The browser must call the Admin BFF on the same origin as the Admin application. Do not add arbitrary redirect targets or CORS wildcard support. Mutating routes require exact Origin validation. Admin domain/business authorization remains a separate server-side C1/C3 mapping and is not granted by the session itself.


## C2 Crypto Worker Service Binding proof

The test suite includes crypto-service-binding.test.mjs. It uses a synthetic caller Worker fixture and a separate Miniflare Crypto Worker joined by a private Service Binding. This proves only the internal binding and caller-token mechanics; it does not add a Service Binding or crypto route to this G3 Worker. The G3 slice currently has no end-user/domain authorization context, so actual integration is deferred until the C1 identity path supplies that authorization boundary. Do not add a generic public crypto relay route.
