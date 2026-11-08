# Risk A — Pre-Migration Password Attestation Gate Package (Draft)

Status: **DRAFT / NOT APPROVED FOR PRODUCTION**. This package defines a proposed production change and its gate conditions. It is not an implementation authorization.

## 1. Objective and exact scope

Add a narrowly scoped attestation hook to the existing BWH legacy password-verification path so the migration can classify password verifiers that cannot be classified from stored Scrypt hashes alone.

Target hook, subject to exact-head source review: `portal-password-credentials.mjs`, immediately after `verifyEncodedPassword` succeeds and before the login transaction completes.

The hook must run only after a successful password verification. It must not run on failed login attempts, password reset forms, registration, background jobs, or data exports.

## 2. Allowed record and forbidden data

The only allowed per-account record is:

| Field | Allowed value |
|---|---|
| `accountRef` | Existing opaque account reference |
| `bucket` | `within_72` or `over_72`, based on the legacy effective password after trim |
| `edgeWhitespace` | Boolean indicating whether the presented value differs from the legacy trim result |
| `attestedAtMs` | Timestamp of the latest successful attestation |

Never persist, log, export, trace, or emit as a metric:
- Password plaintext or fragments.
- Password hashes, derived keys, or reversible transformations.
- Exact UTF-8 byte length.
- Request bodies or authentication headers.
- A sequence/history of prior password lengths.

The exact byte count may exist only in request-local memory for the immediate bucket calculation.

## 3. Write and login semantics

- Attestation is attempted only after the legacy verifier returns success.
- The record is an upsert: at most one latest record per account; no history.
- A record-write failure must not fail or delay the user's successful login.
- A failed write leaves the account unclassified; migration eligibility remains `hold_no_attestation`.
- A malformed record is rejected from the migration set; it does not change login outcome.
- The account reference in the record must match the target account reference at import time.
- `over_72` maps to targeted reset.
- Missing proof maps to hold / reset-invitation policy.
- `edgeWhitespace=true` maps to `r1_decision_hold` until the owner approves the R1 policy. It must not be imported under a notice-only default.

## 4. Storage proposal — decision required

Candidate recommendation: a dedicated, service-only migration-attestation table rather than adding fields to a credential row. This makes the temporary data independently access-controlled and purgeable.

This is only a proposal. The final storage location cannot be selected until a separately authorized read-only schema/writer-path inventory confirms the actual production schema and the correct transaction boundary. No DDL or table name is approved by this draft.

Minimum controls:
- Unique key on opaque `accountRef`; one row per account.
- Service-only read/write; no client-facing API.
- No application logs, request traces, analytics, or exports.
- Latest-record overwrite; no append-only length history.
- Explicit expiry/purge job with a dry-run report and an independently reviewed deletion manifest.
- No raw credential material in Cloudflare D1, Worker payloads, or Agent receipts.

## 5. Window duration and coverage — owner decision required

The window starts only after the Risk A change is separately approved and deployed.

Candidate durations for owner selection:
- 14 calendar days: smaller exposure window, lower account coverage.
- 30 calendar days: recommended planning default, subject to activity distribution.
- 45 calendar days: higher coverage, longer retention/exposure.

No duration is accepted yet. Before choosing, use only approved aggregate login activity information; do not inspect or export password values.

Accounts with no successful login during the window remain unknown. Unknown does not mean safe to import.

## 6. User treatment and R1 dependency

- `over_72`: user-informed targeted password reset; do not import the old verifier.
- No attestation: hold the credential; use an approved reset-invitation flow.
- `within_72` with no edge whitespace: eligible for the normal import gate, subject to all other C1 gates.
- `edgeWhitespace=true`: hold as `r1_decision_hold` until the owner chooses the R1 treatment in `R1_PASSWORD_NORMALIZATION_DECISION_2026-11-08.md`.

Notification copy, delivery channel, reset timing, abuse controls, and support handling require separate review. This package does not send messages or start a reset campaign.

## 7. Retention and destruction — owner decision required

The record's purpose ends after migration classification and reconciliation.

Recommendation:
1. Keep records only until the migration cohort has a final disposition and reconciliation is signed.
2. Purge per-account attestation rows after the agreed post-cutover verification period.
3. Retain only non-identifying aggregate counts and the purge receipt/hash.
4. Prove purge with a dry-run manifest, exact row count, deletion receipt, and post-delete count.

The post-cutover verification period and exact deletion deadline are not selected. No record may be retained indefinitely by default.

## 8. Rollback

- Rollback is removal of the post-verification hook and its invocation.
- Rollback must not alter the existing password verification result or login availability.
- The temporary attestation table is not automatically dropped during code rollback; its eventual purge follows the separately approved retention procedure.
- No credential or password material is copied back to a legacy path.

## 9. Required tests before production review

Synthetic tests must prove:
- Successful login writes exactly one allowed record.
- Failed login writes no record.
- Record-write failure does not fail login and leaves migration eligibility unknown.
- Exact byte counts and password material never enter the record, logs, or receipts.
- Latest successful proof overwrites the prior record.
- Account binding is enforced on import.
- `over_72`, missing proof, and unresolved R1 records fail closed.
- Rollback removes the hook without changing login behavior.
- Concurrency and transaction behavior do not create duplicate or stale records.

Production review additionally requires a read-only preflight, exact source Head, schema/writer-path evidence, retention plan, notification/reset runbook, rollback runbook, and a separate approval.

## 10. Explicitly not authorized

This draft does not authorize:
- Connecting to BWH or reading production credential rows.
- Adding a production table/column or modifying the login service.
- Capturing, storing, or transmitting real passwords or TOTP secrets.
- Sending user notifications or reset emails.
- Creating Auth0 tenants or importing real users.
- Deploying, dual-writing, loading data into D1, or changing production write authority.

BWH remains the production control-data authority until every migration gate and the eventual cutover are separately approved.
