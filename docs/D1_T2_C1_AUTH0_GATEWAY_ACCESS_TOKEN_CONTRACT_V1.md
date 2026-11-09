# C1 Auth0 Gateway Access-Token Contract v1

Date: 2026-11-09
Status: Draft design contract; no tenant/API resource or Worker deployment changes are authorized by this document.

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

## 6. Authorization and Admin MFA — Step 6 provider finding

Authentication is not business authorization. A valid Portal or Admin Access Token establishes only a verified external principal and token scopes. Domain authorization (account ownership, operator privileges, tenant/business boundaries, and action-specific permissions) must be derived from trusted server-side records and the C1/C3 identity mapping.

Portal:
- MFA remains voluntary per T1.
- Portal identity proof does not require an MFA claim.

Admin:
- Admin login remains MFA-enforced at the Auth0 tenant.
- The 2026-11-08 non-production provider test conclusively found that the tested password-realm + `mfa-otp` flow first returns `mfa_required`, then issues Access/ID/Refresh Tokens after OTP completion, but the resulting tokens contain neither `amr` nor `acr`.
- The Post-Login Action ran before OTP completion; `event.authentication.methods` contained only `pwd`. The Action did not rerun with the MFA result after `mfa-otp`. A custom claim emitted by that Action therefore cannot attest MFA completion for this flow.
- Consequently, an Access Token (with or without a caller-controlled/custom `mfa` claim) proves identity only. The Worker must not treat such a claim as completed MFA evidence.
- **Fail-closed interim behavior:** `GET /v1/auth/admin/identity` validates the Admin JWT identity contract but returns `503 admin_mfa_orchestration_unavailable` and never returns an Admin actor until gateway-owned MFA orchestration and a bound, revocable session proof exist. This is intentional; do not remove this block merely to make Admin login appear functional.
- Required future design: the gateway must own the full primary-authentication → `mfa_required` → `mfa-otp` success exchange, correlate the OTP completion to the original authentication transaction, and issue a short-lived gateway session proof bound to the exact issuer, subject, client, token/session context, authentication time, and session identifier. Client input or a token claim alone is never proof.
- The gateway session design must include transaction expiry, single-use challenge/continuation semantics, replay resistance, brute-force/rate limits, secure secret handling, session TTL, refresh behavior, explicit revocation, and Admin re-authentication for sensitive actions. A design without enforceable revocation/session lifecycle is not ready for Admin authorization.
- The gateway must not persist plaintext passwords, OTP values, Auth0 `mfa_token`, Access Tokens, or Refresh Tokens in D1 or logs. Any transient handling must be bounded and narrowly scoped; token custody and refresh strategy require separate review.
- Universal Login hosted-flow Action timing remains unverified; the present provider conclusion is limited to the tested password-realm + `mfa-otp` API chain.

Refresh-token finding:
- The tested non-production applications currently use non-rotating Refresh Tokens. Repeated refresh with the same token succeeds, returns a new Access Token, and does not issue a replacement Refresh Token.
- Admin MFA is not re-evaluated on Refresh Token grant. Therefore, the gateway must not assume that refresh re-proves MFA. Refresh Token rotation/reuse detection, session expiry, revocation, and step-up policy must be explicitly designed and tested before Admin access is enabled.

JWKS rotation finding:
- Auth0 exposes previous/current/next signing keys. A rotation promotes next to current, demotes current to previous, and stages another next key.
- Previous remains published during the grace period, so signatures made by the previous key must remain verifiable while that key is present in the trusted JWKS.
- Newly staged keys may take time to propagate (Admin test observed approximately 75 seconds). The cache/unknown-kid refresh strategy must tolerate propagation without unbounded fetch amplification.
- Management API deletion of the previous key returned 404 twice in the test. Do not broaden token scopes or retry speculatively. The exact console revocation procedure and API permission/semantics remain a pre-production operational check.

## 7. Worker route boundary

The existing G3 service Bearer tokens (`CONTROL_PLANE_READ_TOKEN` / `CONTROL_PLANE_WRITE_TOKEN`) are service credentials, not user identities. They must remain separate from Auth0 user tokens.

The first integration slice should expose only minimal non-PII identity-proof routes:
- Portal identity route: Auth0 Portal Access Token, Portal audience/issuer/client allowlist, required Portal scope.
- Admin identity route: Auth0 Admin Access Token, Admin audience/issuer/client allowlist, required Admin scope and MFA claim.

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
- Admin missing MFA claim rejected; Portal without MFA claim accepted.
- No token or PII is present in error bodies or logs.

## 9. Non-production provider proof still required

The existing Step 6 record proves ID Token verification, not this Access Token contract. Before claiming real Gateway integration:
1. Configure a custom API resource and distinct audience for each non-production surface, plus the approved first-party client allowlist.
2. Obtain real JWT Access Tokens for each API audience (not ID Tokens and not opaque tokens).
3. Verify the exact Access Token issuer, audience, azp/client profile, scopes, RS256 header, kid, signature, expiry, and tenant separation.
4. For Admin, configure and test the namespaced MFA Access Token claim after a completed OTP challenge, including first login and refresh-token renewal behavior.
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

Yi supplied the C1 Step 6 continuation record for the two DEVELOPMENT tenants `gccltd-co` (Portal) and `dev-xtk5cthsct5ccxth` (Admin), using synthetic users only. Separate API audiences were created; Portal JWT Access Token verified against Portal JWKS and was rejected by Admin JWKS; cross-tenant Audience request failed with `invalid audience specified`. Admin MFA challenge and OTP completion were observed before token issuance. Refresh Token non-rotation/reuse and lack of MFA re-evaluation were observed. Previous/current/next key rotation and previous-key JWKS grace were observed; Management API deletion of previous key returned 404 twice. The hosted Universal Login flow was not completed. No production resources were touched.

The current Worker branch was updated to remove the false premise that an Admin Access Token claim can prove MFA in this tested flow. Admin identity proof now remains deliberately unavailable (503) until gateway-owned MFA orchestration and session proof are implemented. Portal remains independently verifiable. This is a safe interim boundary, not C1 completion.

Non-production verification facility identifiers and detailed sanitized results are recorded in the user's supplied session note; no credentials, token values, OTP secrets, or client secrets are stored here. The Default App client secrets were rotated after the test and local session credential material was destroyed.

C1 remains OPEN. The outstanding implementation work is gateway-owned MFA transaction orchestration and a secure session lifecycle, followed by exact-HEAD tests and independent security review of PR #849. Production Auth0 tenants, real-user migration, BWH, remote D1, deployment, dual-write, and cutover remain outside this authorization.
