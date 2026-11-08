# D1 T2-C1/C2 Draft Source Hardening — 2026-11-08

## Execution classification

- Risk: B — repository-only server helper and test changes; no production behavior is activated by this branch.
- Process: isolated Draft remediation branch based on the exact remote Draft head `f5030e014890f9bea42b73a59ab5b473d2015e9f`.
- Expected PR count: one, deferred; no PR is opened in this task.
- Validation: focused repository test files are updated; local full-suite execution is not available from this remote-only editing session. No CI is triggered.
- Production/AWS/Cloudflare impact: none. No BWH access, production database, customer row, credential, real key, remote D1, Worker, DNS, or traffic was accessed or changed.

## Changes in this branch

1. **C1 trusted actor context policy hook**
   - Adds caller-supplied `requiredFactors` validation.
   - Allows a caller to require `totp` for an Admin context while preserving the default provider-neutral parser behavior.
   - Explicitly documents that this parser validates an already trusted gateway projection; it does not verify OIDC/JWT signatures.
   - Adds regression cases for required, missing, unknown and duplicate factors.

2. **C1 import readback semantics**
   - Clarifies that the synthetic provider readback fingerprint covers identity fields only because ordinary provider readback does not expose imported password hashes.
   - Changes the already-imported action to `verify_existing_password_credential`, with explicit `identityReadback: verified` and `passwordCredential: unverified`.
   - Documents that an empty identity-create resume list is not proof of password credential acceptance.
   - Adds assertions that credential proof remains pending after identity readback matches.

3. **C2 key-family composition helper**
   - Adds `assertDistinctD1KeyRingSet()` to reject duplicate configured key families and pairwise key-byte reuse across a configured set.
   - This is a helper contract only; no production key rings are created or wired by this branch.

4. **C2 TOTP input hardening**
   - Validates Base32 length classes, canonical optional padding and zero pad bits before accepting a secret.
   - Bounds raw TOTP secret input to 4,096 characters and v2/v3 envelopes to 8,192 characters.
   - Adds regression cases for impossible Base32 lengths, non-canonical pad bits, oversized inputs and preserved valid synthetic input.

## Still open — no owner decision inferred

- Identity provider selection (Auth0 vs Keycloak), tenant/realm isolation and actual OIDC/JWKS signature verification.
- Production provider adapter, gateway integration, session revocation and Admin directory path.
- Historical revoked-subject rebind policy; no automatic rebind policy is invented here.
- Actual HMAC/AES key custody provider, accountable custodians, independent escrow, recovery, incident revocation and production rotation.
- Wallet-first `idempotency_key_hash` and `session_binding_hash` compatibility; existing unkeyed SHA-256 storage is unchanged pending caller/retention/schema inventory and owner decision.
- Legacy v2 TOTP source-to-target credential ownership proof; this branch only validates the helper's input envelope and target AAD behavior.
- Full C1/C2 provider integration and independent review.

## Validation and gate status

- Repository test files updated; they have **not** been executed in this branch.
- Fixed project Node v22.23.1 validation has **not** been performed.
- Full `npm test`, CI, PR, Ready transition, merge and deployment have **not** been performed.
- C1 and C2 remain OPEN. T2 remains BLOCKED. T3 target DDL and G6 offline migration rehearsal remain gated.
- BWH remains the only production writer.
