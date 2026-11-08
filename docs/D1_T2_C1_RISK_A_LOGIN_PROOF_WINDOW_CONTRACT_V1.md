# D1 T2-C1 Risk A Login Proof-Window Contract v1

> **Status:** SYNTHETIC CONTRACT DRAFT ONLY. This is not owner approval, production login instrumentation, a persistence design, or authorization to change the BWH authentication path.
> **Base:** T1 branch `4be249a38c0347337cf51d92cf1fe81b60c2f659`.
> **Production authority:** BWH remains the only production control-data writer and the existing legacy verifier remains authoritative until a separately approved cutover.

## 1. Purpose and boundary

Risk A addresses the password-length compatibility problem before any Auth0 import or first provider login. The existing project Scrypt hash is one-way and does not reveal the original password length. The affected cohort must not be inferred from a hash, guessed from account metadata, or identified by reading/exporting plaintext.

This contract defines a data-minimized observation that may be produced only after a successful authentication by the existing legacy password verifier. It is deliberately not connected to a login route, database, log sink, Worker, Auth0 tenant, or production service.

## 2. Source compatibility rule

The current Portal password credential service normalizes the submitted password with `String(value ?? "").trim()` before Scrypt verification. The identity-import rehearsal uses the same trim-only normalization before calculating UTF-8 byte length.

For valid string password inputs, this contract preserves that exact behavior:

- Trim leading and trailing whitespace only.
- Do not lowercase, normalize Unicode (NFC/NFD), fold internal spaces, truncate, or otherwise rewrite the password.
- Calculate UTF-8 bytes from the normalized in-memory value.
- The threshold is 72 UTF-8 bytes, not 72 Unicode code points or visible characters.

## 3. Minimal observation shape

A successful legacy password verification may produce exactly this synthetic contract shape:

```json
{
  "accountRef": "acct_synthetic_001",
  "bucket": "le_72",
  "edgeWhitespace": false,
  "observedAtMs": 1798000000000
}
```

Allowed fields:

| Field | Meaning | Rule |
|---|---|---|
| `accountRef` | Existing opaque account reference | Must not be an email or display label |
| `bucket` | Coarse password-size bucket | Only `le_72` or `gt_72` |
| `edgeWhitespace` | Whether trim removed leading/trailing whitespace | Boolean only |
| `observedAtMs` | Observation time | Non-negative safe integer milliseconds |

The observation must never contain the password, exact byte length, password hash, salt, email, display name, source IP, request body, session token, TOTP code, recovery value, or any unrecognized field. Failed legacy authentication creates no observation.

The helper returns an in-memory frozen object only. It performs no persistence, queueing, logging, telemetry, export, or network call. Any future persistence adapter requires separate owner approval for location, encryption, access control, retention and purge.

## 4. Classification and downstream meaning

- `le_72`: a candidate for the remaining Scrypt import and first-login compatibility proof. This is not an automatic import approval.
- `gt_72`: targeted, user-notified password reset is required before importing that credential or allowing its first Auth0 login. Never truncate or silently accept bcrypt's 72-byte behavior.
- No successful legacy observation: the account remains unclassified. It must remain on the legacy authority or enter a separately approved reset cohort. Never infer its bucket from a one-way hash.

This helper only records the coarse classification. It does not notify users, schedule resets, mutate credentials, select an import batch, or authorize a cutover.

## 5. Synthetic acceptance coverage

The companion test file covers:

1. No observation after failed legacy verification.
2. ASCII 72-byte / 73-byte boundary.
3. Multibyte UTF-8 72-byte / 75-byte boundary.
4. Trim-only behavior and the boolean edge-whitespace marker.
5. No Unicode normalization or internal-whitespace folding.
6. Exact four-field output and absence of password, exact byte count, hash, and email.
7. Fail-closed input shape, including extra PII/credential fields.
8. Rejection of email-shaped account references.
9. Empty and non-string password rejection.
10. Timestamp bounds and exact observation validation.

All fixtures are synthetic. The helper is intentionally not imported by the existing Portal authentication service.

## 6. Decisions still OPEN — owner approval required

No value is guessed for any of the following:

- Proof-window start, duration and end condition.
- Whether observations may be persisted; if so, the storage boundary, encryption, access roles and audit policy.
- Retention duration, purge trigger, purge cadence and deletion evidence.
- User notification copy, channel, delivery retries and support escalation.
- Reset-link expiry, retry/lockout behavior and the treatment of accounts that never complete reset.
- Exact cutover handling for accounts that were never observed or remain unclassified.
- Named Identity/Privacy and Security owners and approval responsibility.

Until those decisions are approved, this artifact remains a local synthetic contract only. It must not be connected to a production login path or persisted in BWH, D1, KV, R2, DO, logs or analytics.

## 7. Explicit non-claims

- Does not prove real Auth0 import or first-login rehash behavior.
- Does not prove the vendor's 72-byte enforcement behavior.
- Does not identify any real account or estimate the affected cohort.
- Does not alter the existing BWH verifier, credential records, user notifications or login response.
- Does not authorize Auth0 tenant creation, user import, real key creation, BWH access, D1 mutation, Worker/DO deployment, merge, cutover, or writer-authority change.

**Current gate:** C1-A04 remains OPEN until owner decisions and privacy/security review are complete. C1/C2 remain OPEN; T2 remains BLOCKED.


## 8. Fixed Node 22 synthetic verification — 2026-11-08

- Exact source branch HEAD tested: `0fdd8b9b28320676c6ba1486928d7f815abfac77`.
- Runtime: Node v22.23.1 in an isolated Vercel non-production sandbox (Linux x86_64, 2 vCPU / 4 GiB RAM). Network allowlist was limited to npm registry for runtime installation; no Auth0, Cloudflare, BWH or production endpoint was accessed.
- The 12-case contract test passed twice: 12/12 PASS, 0 fail, 0 skipped.
- Run 1: duration 101.261 ms; TAP SHA-256 `96cfe2e0ac4e366cff98df25e9c871b66f087b8d74c178e4368e7677547c40dc`.
- Run 2: duration 91.447 ms; TAP SHA-256 `69869ae0236d39385540b2cbedfec97ccbae0a21c84e30c5d1d31b1afbb2abe0`.
- `node --check` passed for the contract module and test file (2/2).
- Source SHA-256: helper `fe1d1511c6a902eaa1b59c0f3f562172d04b4fed04d0cca7989d368483f8724c`; test `3967a425013f453799f5f104d4896e57d38b7ac1cda0b7e94845066d5963518d`.

The contract remains synthetic-only and unconnected. The test result does not approve proof-window duration, persistence, retention, notifications, reset workflow or production login instrumentation. C1-A04 remains OPEN; C1/C2 remain OPEN; T2 remains BLOCKED.

## 9. Owner decision proposal — 2026-11-08

A bounded default decision package is available in `docs/D1_T2_C1_RISK_A_OWNER_DECISION_PROPOSAL_V1.md`. It proposes a 30-day one-time window, a four-field-only record, conditional persistence in the existing BWH authoritative control store, a 37-day maximum cleanup horizon, reuse of the existing reset workflow, and no import of unresolved accounts. These are recommendations only; none is treated as approved.

The proposal also defines a no-persistence fallback: accounts without an already-approved non-secret length marker remain unclassified and follow the reset-safe path. The synthetic helper and its 12/12 twice evidence remain unchanged and unconnected.

C1-A04 remains OPEN until the project owner accepts or amends the grouped defaults. No production login instrumentation or persistence is authorized.
