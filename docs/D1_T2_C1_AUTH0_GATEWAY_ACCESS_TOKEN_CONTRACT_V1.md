# C1 Auth0 Gateway Access-Token Contract v1

Date: 2026-11-09
Status: Draft design contract; this document itself grants no resource-change authorization. A separate recorded approval covers only the Admin DEVELOPMENT Actions and synthetic-user hosted-flow validation; Production, Portal changes, Cloudflare remote resources, BWH and D1 remain excluded.

## 1. Purpose

Define the non-production implementation contract for authenticating Portal and Admin requests at the Cloudflare Control-Plane Worker boundary using Auth0-issued JWT Access Tokens and tenant-specific JWKS.

This is a separate work item from the local synthetic C1 validator package. It does not authorize production tenant creation, real-user import, BWH access, remote D1 writes, Worker deployment, dual-write, or cutover.

## 2. Critical correction from Step 6

The Step 6 real-tenant verification proved that each tenant's **ID Token** verifies with its own JWKS and that the tested ID tokens are rejected by the other tenant's JWKS.

That is useful evidence for OIDC identity-token/JWKS behavior, but it does not prove the API bearer-token contract.

The Control-Plane API must accept a JWT **Access Token** issued for the API's own audience. It must not accept an ID Token as an API bearer credential. Auth0's Access Token documentation distinguishes API authorization from ID-token authentication and explains that requesting an API audience is what produces a JWT access token for a custom API. See:
- https://support.auth0.com/center/s/article/Access-token-vs-ID-token
- https://support.auth0.com/center/s/article/opaque-versus-jwt-access-token
- https://support.auth0.com/center/s/article/value-of-the-audience-attribute-in-access-token-requests-and-its-significance

Therefore, the real Step 6 JWKS result is recorded as **ID-token verification PASS**, while the Access-Token-to-Worker integration remains NOT RUN.

## 3. Surface separation and trusted configuration

Portal and Admin must have independent trusted configuration. No issuer, audience, client ID, or JWKS URL may be selected from request parameters, unverified JWT claims, or user-controlled headers.

Required environment configuration (names are contract placeholders; values are not yet provisioned):
- `AUTH0_PORTAL_ISSUER`
- `AUTH0_PORTAL_AUDIENCE`
- `AUTH0_PORTAL_ALLOWED_CLIENT_IDS`
- `AUTH0_ADMIN_ISSUER`
- `AUTH0_ADMIN_AUDIENCE`
- `AUTH0_ADMIN_ALLOWED_CLIENT_IDS`
- `AUTH0_ADMIN_MFA_CLAIM`
- `AUTH0_ADMIN_CLIENT_ID`
- `AUTH0_ADMIN_CLIENT_SECRET` (Worker Secret; never D1)
- `AUTH0_ADMIN_REDIRECT_URI` (fixed same-origin callback)
- `ADMIN_APP_ORIGIN` (must equal callback origin; no wildcard CORS)
- `AUTH0_ADMIN_TX_ENCRYPTION_KEY` (32 random bytes, Base64URL; encrypts the PKCE verifier in short-lived DO transaction state)
- `ADMIN_AUTH_STATE` Durable Object binding (local-only config in this PR; remote namespace creation remains separately gated)

Configuration is fail-closed: missing, malformed, non-HTTPS, or internally inconsistent values disable the corresponding surface. Portal and Admin audiences should be distinct API identifiers. The exact identifiers and client allowlists must be created/approved in the non-production Auth0 tenants before real Access Token integration testing; this document does not create them.

The configured issuer must be an exact canonical HTTPS issuer string, including its trailing slash as published by discovery. The JWKS endpoint is derived only from this trusted issuer (Auth0 convention: `{issuer}.well-known/jwks.json`) or from a separately pinned, trusted discovery result. Never follow `jku`, `x5u`, or any URL supplied by the JWT.

## 4. Token acceptance contract

Only compact JWT Access Tokens are accepted. The verifier must reject:
- ID Tokens whose audience is the SPA/application client rather than the configured API audience.
- Opaque access tokens.
- Missing or malformed bearer credentials.
- Any signing algorithm other than RS256.
- Missing `kid`, unknown `kid` after one forced JWKS refresh, duplicate matching key IDs, invalid JWK material, or invalid signature.
- Issuer mismatch, audience mismatch, unapproved `azp`, missing required scope, or cross-surface token use.
- Expired tokens, tokens not yet valid, future-issued tokens outside clock skew, malformed time claims, or tokens exceeding the configured maximum lifetime.
- Oversized tokens, malformed Base64URL/JSON, duplicate or unsupported critical header parameters, and JWT headers containing remote key URLs.

### Required JWT header

- `alg` must equal `RS256`.
- `kid` must be a non-empty string.
- `typ`, if present, must equal `JWT`.
- `jku`, `x5u`, and `crit` are rejected.
- The implementation must not infer the algorithm from the JWK or accept an algorithm chosen by the token.

### Required claims

- `iss`: exact configured issuer.
- `aud`: must contain the exact configured API audience.
- `azp`: must be in the configured allowlist of first-party client IDs. This contract assumes the default Auth0 access-token profile; changing to the RFC 9068 profile or using `client_id` instead requires an explicit contract update and real-token test.
- `sub`: non-empty opaque subject; never treat it as an internal account ID without the C1/C3 identity mapping.
- `iat`, `exp`: valid NumericDate values; `nbf`, if present, must also be valid.
- `scope`: space-delimited scopes; each route declares the minimum required scope.

The Worker returns a minimal authenticated actor context only: surface, issuer, subject, client ID, approved scopes, authentication-method evidence, issued-at, and expiry. It does not return email, name, user metadata, or raw profile data.

## 5. JWKS and key rotation

- Use Cloudflare Workers Web Crypto only; import the selected public JWK as `RSASSA-PKCS1-v1_5` with SHA-256 and verify the exact compact-JWS signing input.
- Accept only public RSA signing keys with `kty=RSA`, `use=sig`, `alg=RS256`, valid `n`/`e`, and verify-compatible `key_ops` when present. Reject JWKs containing private RSA members.
- Bound JWKS response size and key count; reject malformed documents and duplicate `kid` values.
- Cache per issuer for a short bounded period (initial proposal: 5 minutes). Use single-flight refresh to avoid concurrent fetch stampedes.
- If a token's `kid` is not in a still-fresh cache, perform one forced refresh to support key rotation; reject if it remains absent.
- Network failure, invalid JSON, invalid JWK, and signature failure all fail closed. Do not fall back to a cached unknown key or a different tenant's key.
- Do not log bearer tokens, JWT segments, or user credentials.

Cloudflare Workers Web Crypto supports RSASSA-PKCS1-v1_5 and JWK import/verification; use the runtime API rather than Node-only crypto. See https://developers.cloudflare.com/workers/runtime-apis/web-crypto/.

## 6. Authorization and Admin MFA — Universal Login BFF contract

Authentication is not business authorization. A valid Portal or Admin Access Token establishes only a verified external principal and token scopes. Domain authorization (account ownership, operator privileges, tenant/business boundaries, and action-specific permissions) must be derived from trusted server-side records and the C1/C3 identity mapping.

Portal:
- MFA remains voluntary per T1.
- Portal identity proof does not require an MFA claim; its existing bearer-token proof route remains independent.

Admin:
- **Do not use Resource Owner Password Credentials (ROPG/ROPC) or password-realm grants in the gateway.** RFC 9700 §2.4 says this grant MUST NOT be used: it exposes the resource-owner password to the client and is not designed for multi-step MFA. The previously tested password-realm + `mfa-otp` chain remains provider evidence only, not the implementation architecture.
- Use Auth0 Universal Login with OpenID Connect Authorization Code + PKCE (S256), confidential BFF token exchange, exact registered redirect URI, `state`, `nonce`, and `prompt=login` / `max_age=0`. The browser is redirected to Auth0; the gateway never receives the user's password or OTP.
- The Admin tenant Post-Login Action sequence must use the newer `api.authentication.challengeWith({ type: 'otp' })` API in an earlier Action, then a separate subsequent Action must inspect `event.authentication.methods` for a completed `mfa` method with `type: 'otp'`. Auth0 documents that `challengeWith` pauses the login flow so subsequent Actions can observe the MFA result; the older `api.multifactor.enable()` runs MFA after the Action and can omit MFA from the first-login event.
- The assertion Action may set a namespaced custom Access Token claim containing only `{ method: 'otp', completed_at: '<ISO-8601>' }` after it observes the completed MFA method. The Worker trusts this claim only after validating the Auth0 Access Token signature, issuer, audience, client, scope, and claim timestamp. A caller-supplied claim, ID Token alone, or ROPG token is not proof.
- The Challenge Action must be bound to the approved Admin client only and requires the tenant setting “Customize MFA Factors using Actions” to be enabled, with a Post-Login trigger version of v3 or newer. `event.user.enrolledFactors` must be an array; if it is unavailable, deny with a configuration-state error rather than interpreting it as an empty enrollment. If OTP is enrolled, challenge OTP. If OTP is absent, challenge any existing supported non-email factor before calling `enrollWith({ type: 'otp' })`; email-only enrollment does not require a prior email challenge. Unsupported existing factor types fail closed. Enrollment is not authentication: the Assertion Action must not issue an MFA claim for an enrollment-only transaction. It denies with an explicit reauthentication reason, and the user must start a fresh Universal Login and complete an OTP challenge. Lost-factor recovery remains a separate owner-controlled procedure.
- The gateway must verify both the API Access Token and the OIDC ID Token. The Access Token must have the Admin API audience and required scope; the ID Token must have the exact Admin client audience, transaction nonce, issuer, expiry, and matching subject. The MFA custom claim must be on the verified Access Token and have a fresh timestamp.
- After successful callback validation, the Worker discards Access Token and ID Token and issues a random opaque, HttpOnly, Secure, SameSite=Strict session cookie. The session record contains only minimal actor context, MFA completion time, authentication time, creation time, and expiry. It contains no provider token.
- **Initial session policy:** absolute TTL 15 minutes, no sliding extension, no Refresh Token request or custody, and re-authentication through Universal Login + OTP when expired. Sensitive actions may require MFA completion within the preceding 5 minutes (step-up policy to be enforced by each sensitive route).
- Authorization Code transaction state (state hash, nonce, encrypted PKCE verifier, fixed redirect URI, created/expiry times) is held in a single-use Durable Object transaction record with a 5-minute TTL. The PKCE verifier is encrypted with a dedicated Worker secret using AES-GCM and transaction-bound AAD. Callback consumes the transaction atomically before code exchange; replay or expiry fails closed.
- Admin session state is stored in a separate Durable Object namespace/keyspace, not D1. It is keyed by a hash of the random opaque cookie value; only the cookie value is sent to the browser. Logout explicitly revokes/deletes the state. A Durable Object alarm removes expired transaction/session records.
- Cookies are host-only (`__Host-` prefix, Secure, HttpOnly, Path=/, no Domain). OAuth state cookie uses SameSite=Lax for the top-level Auth0 callback; authenticated session cookie uses SameSite=Strict. Mutating Admin routes must additionally validate exact Origin and reject cross-site requests.
- Do not request `offline_access`; do not persist Refresh Tokens, Access Tokens, ID Tokens, authorization codes, passwords, OTP values, or Auth0 `mfa_token` in D1, Durable Object storage, logs, or browser storage. The gateway only transiently handles the authorization code and token response in memory, then discards provider tokens after verification.
- The Admin DEVELOPMENT hosted flow has been exercised with Universal Login + PKCE + OTP and a signed Access Token MFA claim, but the deployed Challenge copy used a diagnostic enrollment-gate bypass. The exact repository Challenge template has not yet passed a tenant retest. The Worker callback end-to-end test also remains outstanding; do not claim C1 completion until both gates pass.
- Universal Login first-factor/OTP enrollment bootstrap and lost-factor recovery remain separate procedures and cannot bypass Admin MFA.

Refresh-token policy:
- No Refresh Token is requested or retained in the initial BFF design. This avoids relying on the observed non-rotating refresh behavior, where reuse succeeds and MFA is not re-evaluated. Session expiry requires a fresh interactive login and MFA.
- If a future requirement proposes refresh, it needs a separate threat model, rotation/reuse detection evidence, server-side custody and revocation design, and explicit approval; it must not silently extend MFA assurance.

JWKS rotation:
- Auth0 previous/current/next key grace and propagation behavior remains as recorded above. The Worker must retain bounded JWKS caching, single-flight refresh, and throttled unknown-kid refresh; test previous-key grace and propagation delays. Management API deletion of previous key returned 404 twice; do not expand scopes or retry speculatively.

Security basis:
- RFC 9700 §2.4 prohibits ROPC.
- Auth0 Support (updated 2026-01-13) documents that legacy `api.multifactor.enable()` may run MFA after the current Post-Login Action, while `api.authentication.challengeWith()` triggers MFA at that action boundary so subsequent Actions can observe `event.authentication.methods`.
## 6A. Admin BFF threat model and residual-risk register

| Threat / failure mode | Required control | Current status |
| --- | --- | --- |
| Password/OTP theft at the application gateway | Universal Login; gateway never receives credentials; ROPC prohibited | Source design implemented; hosted flow not yet provider-tested |
| Login CSRF / OAuth response injection | Random state cookie + query state equality, transaction-bound state hash, exact issuer, fixed same-origin callback, Fetch Metadata rejection of cross-site initiation | Source and synthetic tests |
| Authorization-code interception / verifier substitution | PKCE S256; verifier encrypted with AES-GCM and transaction-specific AAD; exact redirect URI; callback query string redacted from edge/access logs | Source implemented; log redaction is a deployment gate |
| Callback replay / parallel callback race | Durable Object transaction consumed atomically before code exchange; 5-minute expiry | Source and synthetic concurrency test |
| ID Token substituted for API bearer token | Verify ID Token separately for client audience + nonce; verify API Access Token for API audience + scope | Source and synthetic signed-token tests |
| Cross-tenant / cross-client token substitution | Trusted issuer, audience, azp allowlist, subject equality across ID/Access Tokens | Existing OIDC verifier plus BFF binding tests |
| Forged or stale MFA assertion | Separate Auth0 Actions; enrollment-state configuration guard; OTP enrollment only when absent; challengeWith OTP when enrolled; Action 2 emits signed claim only after observed mfa/otp; Worker checks timestamp and binds it after auth_time | Admin DEVELOPMENT hosted flow passed with diagnostic Challenge copy; exact repository template retest pending |
| Session fixation / cookie theft | Fresh 256-bit opaque cookie; hash-only DO key; Secure, HttpOnly, host-only, SameSite=Strict; no token in browser storage | Source and synthetic session tests |
| CSRF against Admin mutations | Same-origin deployment, SameSite=Strict, exact Origin on logout and every future mutating route | Current logout tested; future Admin mutation routes must use the same guard |
| Session replay after logout / expiry | DO-backed state lookup, explicit deletion, 15-minute absolute expiry, alarm cleanup | Source and synthetic tests |
| Provider refresh silently extending MFA | No offline_access requested; Refresh Token rejected/revoked if unexpectedly returned; no refresh endpoint | Source; provider integration test outstanding |
| DO state compromise | Store only encrypted PKCE verifier/nonce transaction and minimal actor/session metadata; no provider tokens; dedicated Worker encryption secret | Source design; remote secret custody not provisioned |
| Auth0 Action bypass / factor not enrolled | Action denies non-approved client and refresh grant; missing enrollment state is a configuration failure; absent OTP invokes Auth0 enrollment only after challenging any existing supported factor; no MFA claim without a later completed OTP challenge | Admin DEVELOPMENT Actions deployed/bound; diagnostic Challenge copy differs from repository source; exact-template retest pending |
| Auth0 outage / JWKS propagation | Bounded JWKS cache, single-flight refresh, unknown-kid cooldown; fail closed | Existing synthetic tests; hosted provider integration pending |
| Login initiation / transaction allocation abuse | Auth0 bot protection plus edge rate limit for the fixed Admin login path; 5-minute transaction TTL and DO alarm cleanup | Edge rate-limit rule not configured; must be verified before shared enablement |

Residual risks that block Admin enablement:
1. The Admin DEVELOPMENT tenant has proved Universal Login Authorization Code + PKCE, two-Action ordering, OTP completion, Access Token custom claim emission, and Refresh Token refresh denial using a diagnostic Challenge copy. The exact repository Challenge template must be deployed verbatim and retested after the enrollment-state configuration is confirmed.
2. The Action templates and their exact deployed versions must be independently reviewed and read back. The current tenant Challenge copy is a diagnostic gate-bypass and is not an acceptable final state.
3. Configure the Admin API Access Token lifetime at or below 3600 seconds and set the verifier maximum consistently; the BFF rejects token responses with a longer expires_in. The local Durable Object binding and AES-GCM transaction envelope must pass exact-HEAD local Miniflare tests. Remote DO namespace and Worker Secret provisioning are a separate Cloudflare resource gate.
4. Configure and verify Auth0 bot protection plus a Cloudflare edge rate-limit rule for Admin login initiation; redact callback query strings from edge/access logs so authorization codes are not retained. The Admin application must be served on the same origin as the BFF callback. If the deployment cannot satisfy same-origin hosting, stop and design a separate credentialed-CORS + CSRF contract; do not weaken cookie policy.
5. No Admin business route may infer account/operator permission from the session. C1/C3 identity mapping and domain authorization remain separate.

## 7. Worker route boundary

The existing G3 service Bearer tokens (`CONTROL_PLANE_READ_TOKEN` / `CONTROL_PLANE_WRITE_TOKEN`) are service credentials, not user identities. They must remain separate from Auth0 user tokens.

The first integration slice should expose only minimal non-PII identity-proof routes:
- Portal identity route: Auth0 Portal Access Token, Portal audience/issuer/client allowlist, required Portal scope.
- Admin login/callback/session routes: Universal Login Authorization Code + PKCE, verified Admin API Access Token + ID Token nonce/subject binding, MFA claim emitted only by the post-challenge Action, then a short-lived opaque BFF session.

These routes return only the minimal actor context and do not read or write D1. Existing service/Agent routes keep their current auth contract until a separate route-by-route authorization migration is reviewed. Do not globally replace all service Bearer checks with user JWT validation.

## 8. Required synthetic test matrix

- Correct Portal Access Token accepted on Portal only.
- Admin Access Token alone never proves MFA; Admin route remains fail-closed until a gateway-owned, bound, revocable MFA session proof is implemented and independently reviewed.
- ID Token rejected for API use, even if its signature is valid.
- Opaque token rejected.
- Wrong issuer, wrong audience, wrong client ID/azp, wrong surface, wrong scope rejected.
- HS256, none, missing kid, unknown kid, malformed header, remote key URL, and unsupported critical header rejected.
- Signature tampering, expired token, future iat, future nbf, malformed NumericDate, and oversized token rejected.
- JWKS unavailable, malformed JWKS, duplicate kid, private key member, wrong kty/use/alg/key_ops rejected.
- Unknown kid causes one refresh; rotated key succeeds after refresh; unknown kid still fails after refresh.
- Concurrent requests share one JWKS refresh.
- Admin missing/stale/invalid MFA claim rejected; Portal without MFA claim accepted.
- Admin Authorization Code callback rejects wrong/missing state, nonce, PKCE, issuer, audience, client, subject, or replayed transaction.
- Admin session rejects missing, expired, revoked, malformed, or cross-site cookies; logout revokes the session.
- No Refresh Token is requested, stored, or accepted as proof of fresh MFA.
- No token or PII is present in error bodies or logs.

## 9. Non-production provider proof still required

The earlier Step 6 record proved ID Token verification only. The later Admin DEVELOPMENT hosted-flow run additionally proved a JWT Access Token for the Admin API audience and the MFA claim, but used a diagnostic Challenge copy. Before claiming real Gateway integration:
1. Configure a custom API resource and distinct audience for each non-production surface, plus the approved first-party client allowlist.
2. Obtain real JWT Access Tokens for each API audience (not ID Tokens and not opaque tokens).
3. Verify the exact Access Token issuer, audience, azp/client profile, scopes, RS256 header, kid, signature, expiry, and tenant separation.
4. For Admin, repeat Universal Login Authorization Code + PKCE with the exact repository Challenge template and Assertion Action, including first-time OTP enrollment, the required fresh-login OTP challenge, enrolled-factor challenge, exact Access Token MFA claim, and refresh-token grant denial. The diagnostic gate-bypass run is provider evidence only, not exact-template acceptance. No Refresh Token is requested by the BFF.
5. Test unknown-kid refresh/key rotation and failure behavior.
6. Integrate the Worker verifier in local/isolated Miniflare first; only after source review and synthetic tests should the non-production Auth0 ↔ Worker connection be separately authorized.

This document does not authorize changes to the existing Auth0 DEVELOPMENT tenants, creation of API resources or Actions, or any Auth0 ↔ Cloudflare/D1 integration. Those are separate provider operations and require explicit authorization.

## 10. Production and migration boundary

- No production Auth0 tenant or custom API has been created.
- No production user, password, TOTP secret, or identity data has been read or imported.
- No Cloudflare remote Worker, Secret, Service Binding, D1 database, route, or Durable Object has been created or changed.
- No BWH connection, production data read, D1 write, dual-write, migration, deployment, or cutover is performed by this design.
- C1 remains OPEN; T2 remains BLOCKED / NOT READY. BWH remains the sole production control-data write authority.


## 10. 2026-11-08 non-production provider evidence and implementation disposition

Historical snapshot: this section predates the later hosted-flow run recorded in §11; its statement that the hosted flow was not completed is superseded by that later evidence.

Yi supplied the C1 Step 6 continuation record for the two DEVELOPMENT tenants `gccltd-co` (Portal) and `dev-xtk5cthsct5ccxth` (Admin), using synthetic users only. Separate API audiences were created; Portal JWT Access Token verified against Portal JWKS and was rejected by Admin JWKS; cross-tenant Audience request failed with `invalid audience specified`. Admin MFA challenge and OTP completion were observed before token issuance. Refresh Token non-rotation/reuse and lack of MFA re-evaluation were observed. Previous/current/next key rotation and previous-key JWKS grace were observed; Management API deletion of previous key returned 404 twice. The hosted Universal Login flow was not completed. No production resources were touched.

The current Worker branch was updated to remove the false premise that an Admin Access Token claim can prove MFA in this tested flow. Admin identity proof now remains deliberately unavailable (503) until gateway-owned MFA orchestration and session proof are implemented. Portal remains independently verifiable. This is a safe interim boundary, not C1 completion.

Non-production verification facility identifiers and detailed sanitized results are recorded in the user's supplied session note; no credentials, token values, OTP secrets, or client secrets are stored here. The Default App client secrets were rotated after the test and local session credential material was destroyed.

C1 remains OPEN. The outstanding implementation work is gateway-owned MFA transaction orchestration and a secure session lifecycle, followed by exact-HEAD tests and independent security review of PR #849. Production Auth0 tenants, real-user migration, BWH, remote D1, deployment, dual-write, and cutover remain outside this authorization.


## 11. 2026-11-08 Admin DEVELOPMENT hosted-flow verification and enrollment disposition

Yi supplied the real hosted-flow verification record for Admin DEVELOPMENT tenant `dev-xtk5cthsct5ccxth`, using synthetic user `adm-user02` only. The execution channel was Muse through the dedicated lucky Chrome CDP session and Auth0 Management API. Portal, Production, Cloudflare remote resources, BWH and D1 were excluded.

### Action deployment and tenant state

- Challenge Action `admin-mfa-challenge` and Assertion Action `admin-mfa-assert` were created and deployed. Action ID prefixes: `2b61059e-` and `11d77aab-`.
- Post-Login binding readback order: `[challenge, assert]`. The previous verification Action `flylink-mfa-claim-verification` was removed from the binding but remains in the tenant unbound.
- Challenge secret name: `ADMIN_CLIENT_ID`. Assertion secret names: `ADMIN_CLIENT_ID`, `ADMIN_MFA_CLAIM_URI`. The Admin Default App client ID is `mc0vcE2GOAjidR3JETN6ytFIBnrNpShT`; claim URI is `https://flylink.example/mfa`. No secret values are recorded.
- The tenant setting “Customize MFA Factors using Actions” (`customize_mfa_in_postlogin_action`) was initially off, caused `challengeWith` to return “MFA customized via PostLogin action but feature is not enabled”, then was enabled, saved and read back as enabled.
- The diagnostic Challenge copy deployed in the tenant removed only the `event.user.enrolledFactors` enrollment gate. Its sanitized source is `actions-src/admin-mfa-challenge.DIAG-GATE-BYPASS.js`. Assertion matched the repository template exactly. The repository Challenge template itself was not changed by that diagnostic run and was not validated verbatim.

### Enrollment-state finding

- In the diagnostic runs, `event.user.enrolledFactors` was `undefined`, although the synthetic user had a confirmed TOTP authenticator through an owner-issued Guardian enrollment ticket.
- Auth0 Support documents that this field is undefined when “Customize MFA Factors using Actions” is disabled; enabling that tenant setting is the prescribed fix. The field observation must therefore be repeated with the setting enabled before treating it as a repository-template defect. See https://support.auth0.com/center/s/article/event-user-enrolledFactors-is-not-set-undefined-when-accessed-in-Actions (Auth0 Support, updated 2025-09-10).
- With the original gate active, an unenrolled user was denied before Auth0 could start an enrollment transaction. This prevented a self-service first bind. The owner-issued Guardian enrollment ticket was the only first-bind path demonstrated in that diagnostic run.
- The repository template remediation must distinguish unavailable enrollment state (configuration failure) from an empty factor list (user needs enrollment). For an empty list or email-only state, call `enrollWith({type:"otp"})`; if another supported factor exists, challenge it first, then enroll OTP. Enrollment is not proof of authentication: the Assertion Action must not issue an MFA claim until a fresh login completes an OTP challenge. Unsupported factor types fail closed.

### Hosted-flow positive and negative evidence

- Authorization Code + PKCE S256 + `prompt=login` completed the Universal Login password step, OTP challenge, first consent, callback code/state match and token exchange (HTTP 200).
- Admin Access Token included `https://flylink.example/mfa = {method:"otp", completed_at:"2026-11-09T08:12:33.127Z"}`; the claim was about 10 seconds old at exchange and the audience included the Admin API.
- ID Token nonce binding matched and `amr:["mfa"]` was present. A diagnostic observation showed the later Post-Login Action event contained `{name:"mfa", type:"otp", timestamp}`.
- Refresh Token refresh was rejected with `access_denied / admin_reauthentication_required` and no Access Token was issued.
- ROPG password login remained `403 mfa_required` with no token; its Action event contained only `pwd`, not MFA proof.

### Cleanup and remaining gates

- The synthetic user's OTP enrollment remains in place. The two Actions remain bound in `[challenge, assert]` order; the MFA Actions customization setting remains enabled.
- The Default App `client_secret` was rotated after the test; local `.session3/` credential material was destroyed. Only sanitized result files remain.
- The positive hosted-flow result proves the provider-side sequence only with the diagnostic Challenge copy. It does not prove the repository Challenge template, first-time self-service enrollment, or the Worker callback end-to-end path.
- Remaining: update the repository Challenge template and synthetic tests; deploy the exact repaired source to Admin DEVELOPMENT under the existing scope; verify the setting is enabled and enrollment state is populated; test first-time enrollment followed by a fresh OTP login; retest enrolled OTP and all negative paths; then complete Worker callback end-to-end tests and exact-HEAD independent security review.
- No Production Auth0 tenant, Portal tenant configuration, Cloudflare remote resource, Worker deployment, BWH connection, D1 read/write, database migration, dual-write or cutover was performed.

