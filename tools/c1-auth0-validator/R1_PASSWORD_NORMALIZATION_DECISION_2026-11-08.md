# R1 Password Normalization Contract — Owner-Approved Policy (2026-11-08)

Status: **POLICY APPROVED; CROSS-CLIENT IMPLEMENTATION AND COMPATIBILITY PROOF OPEN.**
This record clarifies the already-approved R1 policy. It is not production authorization.

Decision provenance: owner direction recorded on 2026-11-08 and in the [Cloudflare control-plane migration decision record](https://app.notion.com/p/3793917c118c4434b91041d0f934a3f5).

## 1. Approved normalization policy

The legacy-compatible rule is exactly:

`String(value ?? "").trim()`

Apply the same rule before password hashing and verification. Registration, login, and password reset must share this behavior.

- Remove leading and trailing ECMAScript whitespace only.
- Preserve internal whitespace exactly.
- Do not lowercase or otherwise change case.
- Do not add Unicode NFC/NFD/NFKC normalization.
- Never truncate a password.
- Do not silently change the user's effective password by applying a different normalization rule.

## 2. First-party client requirement

Every supported first-party entry point must apply the same trim-only rule before the password leaves the client / reaches Auth0:

- Portal Web / browser login and registration.
- Android login and registration.
- Admin login and registration.
- Password reset flows used by those surfaces.

The same test vectors must produce the same effective password in every client. This is a cross-client implementation and evidence requirement, not a new policy decision.

## 3. Auth0 boundary and hosted-login fallback

Auth0 Bulk Import's `password.encoding` describes character encoding; it does not apply the legacy trim rule. An imported Scrypt verifier represents the legacy trimmed password, while Auth0 verifies the password value it receives.

Therefore:

- Do not assume Universal Login, a direct hosted flow, or a provider-side JIT path automatically preserves the legacy trim behavior.
- A first-party path may use the imported Scrypt credential only after its pre-Auth0 trim-only behavior is demonstrated by source review and contract tests.
- If a hosted or alternate login path cannot prove that normalization occurs before Auth0 receives the password, do not send that path through the imported-hash route. Keep the affected cohort out of that route and use a **notified user-initiated password reset** through the existing approved reset flow.
- Notice-only behavior change and silent import are not accepted substitutes.

## 4. Meaning of the edge-whitespace attestation

The four-field attestation record remains limited to `accountRef`, `bucket`, `edgeWhitespace`, and `attestedAtMs`. It must never contain a password, password hash, exact byte length, or password fragment.

`edgeWhitespace=true` is a compatibility marker; it does **not** by itself mean that the account must be reset. The account may use the imported verifier only through a first-party path whose trim-only behavior has been proven. Until that proof is complete, the synthetic validator returns `r1_implementation_proof_hold` with advisory `edge_whitespace_client_compatibility_proof_required`. This is an **implementation-proof hold**, not a pending owner policy decision. An unproven hosted path follows the notified-reset fallback above.

## 5. Separate >72 UTF-8-byte rule

The separately approved >72 UTF-8-byte rule remains unchanged:

- Measure UTF-8 bytes, not characters.
- Notify the affected user and require a user-initiated targeted reset.
- Never truncate or silently alter the password.
- Do not infer password length from a one-way Scrypt hash.

## 6. Acceptance evidence still required

- Portal Web, Android, and Admin implement the same trim-only rule at every supported registration, login, and reset entry point.
- Cross-client tests cover leading/trailing whitespace, internal whitespace, case, and composed/decomposed Unicode; only leading/trailing trim is applied.
- The exact normalized value is what reaches the Auth0 imported-Scrypt verifier and subsequent rehash.
- Hosted/direct paths are either independently proven to apply the same rule before Auth0 receives the password or excluded from imported-hash login and handled through notified reset.
- The >72-byte reset gate remains separate and never truncates.

## 7. Security and production boundary

This policy clarification changes no production login path, no Auth0 tenant, no user record, and no password. It does not authorize reading or exporting production credential rows, production login instrumentation, notification sends, reset campaigns, tenant creation, real-user import, Worker deployment, BWH access, D1 writes, dual-write, or cutover. Each such operation remains subject to its separate approved gate.
