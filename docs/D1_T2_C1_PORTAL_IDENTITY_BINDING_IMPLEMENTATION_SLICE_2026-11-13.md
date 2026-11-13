# C1 Portal identity binding and opaque session slice

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: source_only_c1_portal_identity_binding_implementation
  superseded_by: null
  last_verified_at: 2026-11-13
  production_authority: false
```

- Status: source-only implementation candidate; not a C1 or T2 closure.
- Work baseline: `55bd6435916ccce34171675a8add69d838e56cc3`.
- Working branch: `t2-c1-portal-identity-binding-20261113`.
- Scope: local synthetic Worker/D1/DO implementation only.

## Approved decisions reconciled

This implementation uses the decisions already approved by Yi; it does not reopen them:

1. Auth0 is the selected identity authority with separate Portal and Admin tenants. Issuer and client allowlists remain surface-specific.
2. Portal MFA is optional; Admin MFA is mandatory and remains enforced by the Admin BFF.
3. Password login remains supported. Passwords over 72 UTF-8 bytes use targeted user notification and reset; they are never truncated.
4. All legacy TOTP factors are retired and users re-enroll with Auth0 MFA. The legacy factor is not decrypted, transferred, re-protected or silently reused. The T1 classifier is a classification gate, not proof that the BWH verifier path has been replaced.

## Implemented source slice

- Adds local-only `platform_identity_bindings` with a fixed logical tenant alias (`portal` or `admin`), `subject_ref`, opaque `account_id`, status and lifecycle timestamps. The actual Auth0 issuer URL is validated by the surface-specific OIDC verifier and is not stored in this table. It contains no email, display name, password, TOTP material or low-entropy email digest.
- Adds a repository that resolves exactly one active issuer/subject binding, rejects ambiguous/missing/revoked bindings, plans collisions, and supports explicit revocation. No public route creates or rebinds an identity.
- Adds Portal Access Token exchange: the Auth0 JWT is verified against the Portal issuer, audience, client allowlist and JWKS; the subject must resolve to one active account; a random opaque session is issued.
- Stores only the minimal actor references, opaque binding-generation reference and expiry in a local-only Portal Durable Object. The provider JWT and raw session token are not persisted. Rebinding the same subject to the same account invalidates sessions issued under the prior binding generation.
- Adds an internal `resolvePortalSession()` function that validates the opaque session, re-checks that the bound account remains active, and returns a strict trusted actor context for a future private business-side caller.
- Adds explicit Portal logout/revocation.

## Worker package boundary and synchronization rule

- `workers/control-plane/src/identity-boundary.mjs` is a self-contained Worker-local mirror of the four identity-boundary exports used by this slice. It mirrors `server/services/platform/d1-t2-identity-boundary.mjs`; the Worker must not import that server path or any other file outside `workers/control-plane`.
- The server module is the reference contract. Any change to actor-context validation, identity-binding record validation, binding resolution or collision planning must update the Worker mirror and both corresponding test files in the same commit.
- `workers/control-plane/test/identity-boundary.test.mjs` mirrors the server contract tests but imports only the Worker-local module. Do not add cross-package server imports to Worker source or Worker tests.

## Portal token timestamp semantics

- `issuedAtMs` is the verified Access Token `iat` (token issuance time), expressed in milliseconds. It records when this token was issued; a silent refresh can update it without a new user authentication event.
- `authTimeMs` is the verified OIDC `auth_time` claim, expressed in milliseconds. Portal Access Tokens may omit this claim; when it is absent or not a safe integer, the actor context and Portal DO record store `null`. The implementation must never substitute `iat` for `auth_time`.
- When a valid `auth_time` is present, its non-negative timestamp and future-skew bounds are checked before storing it. Negative or too-far-future values are rejected.
- Consumers must never interpret `issuedAtMs` as an authentication time. Any future step-up, recent-authentication or max-age authorization check must require `authTimeMs !== null` and apply its explicit policy to that verified authentication time; a null value is absence of authentication-time evidence, not permission to infer it from token issuance.

## Important boundaries

- `0004_identity_bindings_slice.sql` is a local synthetic fixture, **not target D1 DDL**. No remote D1 migration or namespace was created.
- The internal resolver is not exposed as a public route. A private Service Binding and the actual business authorization endpoint are still open; no public business route was added.
- The session token is returned once in JSON only for local synthetic/native-client tests. Browser storage, HttpOnly-cookie, same-origin and login rate-limit policies remain unapproved/open; this source slice must not be deployed.
- This slice does not provision Auth0 tenants, configure Actions, create Worker Secrets, import real identities, or create real identity bindings.
- Admin BFF still authenticates an external Admin identity but does not yet map it to an internal operator/principal or business permissions. No role is inferred from an Auth0 subject or MFA claim.
- Existing BWH registration, email-based lookup, display and password/TOTP verifier paths are unchanged. Their presence is not evidence that PII was written to target D1; BWH remains the production authority until separately approved migration/cutover.
- The Portal Access Token carries no verified factor evidence in this source slice. The actor context therefore uses an empty factor list; it does not infer password or TOTP from a signed identity token. Context-specific required factors remain enforceable by the shared parser.
- No CI, Hosted tests, PR creation, Ready transition, merge, deployment, production data access or production operation was performed.

## Verification required before review

Run the Worker local Miniflare suite and the focused identity-boundary tests on the exact candidate SHA. Record the actual HEAD, command, runtime/dependency versions, test totals, skipped/failing cases and log/artifact hashes. Then obtain independent review. Old Master/PR evidence is not inherited.

## Still open

- Real identity-binding provisioning and historical-account linking/ambiguity handling.
- Private Service Binding from the identity gateway to the business worker and the actual account-scoped business authorization path.
- Admin subject → operator/principal mapping and role/capability authorization.
- Display/search policy, password import/JIT/reset implementation details, TOTP re-enrollment lifecycle proof, deletion/recovery/failure behavior and named owners.
- Auth0 exact-template callback/browser E2E gates, including N2a; M2 owns current-baseline Worker/provider evidence.

C1 remains OPEN / BLOCKED. This slice is a first implementation step, not a security-work-package closure.
