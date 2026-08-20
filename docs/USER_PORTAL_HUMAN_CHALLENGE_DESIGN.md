# User Portal Human Challenge Design

Last updated: 2026-06-03, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: user_portal_human_challenge_design
  superseded_by: null
  last_verified_at: 2026-06-03
  production_authority: false
```


This document defines the backend human-verification design for the customer
portal. It is a design contract only. It does not expose a public portal, enable
production password login, activate email-code login, add a CAPTCHA provider
secret, run a SQLite migration, change DNS/Nginx/systemd, or authorize
subscription issuance.

## Current Facts

The current local portal preview has a generated math prompt in the frontend.
That prompt is useful for local UX validation, but it is not a security
boundary. A caller can bypass the browser and send requests directly.

The current guarded HTTP portal routes are:

- `POST /api/portal/entry/enroll`
- `POST /api/portal/session`
- `POST /api/portal/access-requests`
- `GET /api/portal/access-requests/current`

The `entry/enroll` and `session` routes currently ignore
`humanVerification`. Real backend protection needs server-issued challenges,
server-side verification, expiry, one-time use, and rate limits before any
auth-sensitive operation.

## Goals

- Move human challenge authority from the browser to the backend.
- Keep the math challenge as a repository-local, zero-provider fallback.
- Make production CAPTCHA providers a later pluggable gate, not a frontend
secret.
- Fail closed before TOTP enrollment, TOTP session creation, email-code
challenge issuance, or future password session creation.
- Avoid customer data, raw credentials, CAPTCHA secrets, or raw subscription
material in docs, logs, or test fixtures.

## Non-Goals

- No production public portal route.
- No real password credential store.
- No real email delivery or email-code challenge table.
- No payment, entitlement, or subscription issuance authority.
- No provider CAPTCHA integration in the first repository-only implementation.
- No production SQLite migration without a separate Risk A gate.

## Recommended Architecture

Add a small domain service, tentatively
`server/services/platform/portal-human-challenge.mjs`, with this contract:

```js
issueChallenge({
  scope,
  requestContext
})

verifyChallenge({
  challengeRef,
  answer,
  scope,
  requestContext
})

purgeExpired(now)
```

The service owns the challenge answer. The frontend receives only a
`challengeRef`, display prompt, type, and expiry.

The default repository implementation can use an in-memory store. A future
production implementation can use the subscription-control SQLite database or a
provider verifier such as Cloudflare Turnstile behind the same interface.

## API Contract

Add:

```text
POST /api/portal/human-challenges
```

Request:

```json
{
  "scope": "portal_login"
}
```

Response:

```json
{
  "challenge": {
    "challengeRef": "phc_example",
    "type": "math",
    "prompt": "4 + 7 = ?",
    "expiresInSeconds": 180
  }
}
```

The response must never include the answer, answer hash, provider secret,
customer identifier, raw IP address, raw user agent, token, or subscription URL.

Auth-sensitive portal requests then include:

```json
{
  "humanVerification": {
    "challengeRef": "phc_example",
    "answer": "11"
  }
}
```

## Protected Operations

The backend must verify the challenge before these operations call their
underlying auth or business service:

- `POST /api/portal/entry/enroll`
- `POST /api/portal/session`
- future `POST /api/portal/email-code-challenges`
- future password-login session route

`POST /api/portal/access-requests` already requires an authenticated portal
user reference in the product model. It should not rely on a public anti-bot
challenge as authorization. If it remains callable without a real session in a
local preview seam, it may use the same challenge as an abuse guard, but that
does not make it a login authority.

## Store Model

For repository-only implementation, an in-memory record is enough:

```text
challengeRef
scope
answerHash
expiresAt
attemptCount
usedAt
issuedAt
requestKeyHash
```

`requestKeyHash` may derive from a normalized source IP and user-agent string,
but raw values should not be stored or returned.

For a future durable implementation, add the same fields to the business
control database only through a separate schema/migration gate.

## Verification Rules

- Challenge expires after 180 seconds by default.
- Challenge is scoped; a `portal_login` challenge must not satisfy an unrelated
  scope.
- Challenge is single-use; successful verification sets `usedAt`.
- Wrong answers increment `attemptCount`.
- After 3 failed attempts, the challenge is locked and a new challenge is
  required.
- Verification errors are enumeration-safe:
  `human_verification_failed`.
- Expired, missing, used, locked, wrong-scope, and wrong-answer cases share the
  same external error shape.
- Internal logs may include safe refs and reason codes, but never answers,
  answer hashes, raw IPs, credentials, tokens, or subscription material.

## Rate Limits

Repository-only implementation should expose injectable limit hooks so tests can
prove the boundary without adding Redis or a queue.

Minimum policy:

- issue limit by request key, for example 20 challenges per 10 minutes;
- verify limit by request key, for example 30 failed verifications per 10
  minutes;
- optional account-ref limit once password/email login exists.

Production can replace the in-memory limiter with provider, Nginx, or durable
application limits under a separate gate.

## Frontend Flow

The portal page should stop generating authoritative math answers locally for
the real HTTP client path.

Expected flow:

1. Page loads and calls `requestHumanChallenge({ scope: "portal_login" })`.
2. Backend returns `challengeRef`, prompt, type, and expiry.
3. User submits account/login fields plus `challengeRef` and answer.
4. HTTP client sends the verification packet to the auth-sensitive backend
   route.
5. Backend verifies and consumes the challenge before auth work.
6. On failure, frontend clears the answer and requests a fresh challenge.

The local preview client may keep a deterministic in-memory challenge helper for
browser demos, but it must be clearly documented as preview-only.

## Provider Upgrade Path

Cloudflare Turnstile, hCaptcha, or reCAPTCHA can be added later by implementing
the same verifier interface:

```js
verifyChallenge({
  provider: "turnstile",
  token,
  scope,
  requestContext
})
```

Provider secrets live only in protected runtime configuration. The frontend
receives a public site key only when that provider is approved. The backend is
the only component allowed to call the provider verification API with the
secret.

## Risk Gates

| Work item | Risk | Boundary |
| --- | --- | --- |
| This design document | C | Documentation only; no execution authority. |
| Repository-only in-memory challenge service and tests | B | Default-off/local portal seam only; no provider secret, no DB migration, no public route activation. |
| Wiring challenge verification into default-off `/api/portal/*` routes | B | Local/repository validation only; no production deployment or public portal exposure. |
| Durable challenge table or production SQLite migration | A | Migration runbook, backup, rollback, and validation required. |
| Cloudflare Turnstile/hCaptcha/reCAPTCHA provider integration | A | Provider secret handling, protected runtime config, rate-limit policy, deployment gate, validation, and rollback required. |
| Public portal exposure with challenge enforcement | A | DNS/Nginx/TLS/session/CSRF/rate-limit/runbook approval required. |

## Tests

Focused tests should cover:

- issue returns prompt and challengeRef but no answer;
- verify accepts the right answer once;
- verify rejects reused challenges;
- verify rejects expired challenges;
- verify rejects wrong scope;
- verify locks after failed attempts;
- route tests prove `entry/enroll` and `session` fail before auth service calls
  when verification fails;
- HTTP client tests prove it requests a backend challenge and refreshes it after
  failure;
- serialization tests prove answers, answer hashes, credentials, tokens, and
  subscription URLs are absent from responses.

## Open Implementation Notes

- Use dependency injection for `now`, `randomBytes`, hashing, and limiter hooks.
- Prefer SHA-256/HMAC hashing for challenge answers and request keys; do not use
  reversible encoding.
- Keep failure responses deliberately small and uniform.
- Keep the initial repository implementation minimal; do not add Redis, queues,
  or microservices for this boundary.
