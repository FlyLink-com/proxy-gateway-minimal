# R1 Password Normalization Decision — Draft (2026-11-08)

Status: **DRAFT / OWNER DECISION REQUIRED**. This document is a decision proposal, not an accepted policy and not production authorization.

## 1. Decision context

The legacy password service applies `String(password).trim()` before Scrypt. The Auth0-shaped imported-Scrypt verifier in the local synthetic harness checks the presented password as supplied; it does not apply the legacy trim operation.

The synthetic test demonstrates the compatibility difference:

- A legacy password entered with leading/trailing spaces is hashed after trimming.
- The same spaced form does not verify against the imported Scrypt hash when submitted unchanged.
- The trimmed form does verify in the local Auth0-shaped model.

This is a local simulation result, **not** proof of the real Auth0 tenant's behavior. Real-provider verification remains a separate, explicitly approved non-production task.

The migration attestation stores only `accountRef`, `bucket`, `edgeWhitespace`, and `attestedAtMs`. It never stores the password, a password hash, an exact byte length, or a password fragment.

## 2. Current safe gate

Until an owner decision is made:

- `bucket=over_72` → `targeted_reset`.
- No attestation → `hold_no_attestation`.
- `bucket=within_72` and `edgeWhitespace=false` → eligible for the normal import gate.
- `bucket=within_72` and `edgeWhitespace=true` → `r1_decision_hold`; do not import the credential yet.

The R1 hold is a temporary fail-closed migration classification. It does not block a user's current legacy login and does not itself force a reset.

## 3. Options

### A. Targeted reset for the edge-whitespace cohort — recommended

Do not import the old Scrypt verifier for accounts with `edgeWhitespace=true`. Notify the affected user and require a user-initiated password reset before or during the migration recovery flow.

Advantages:
- Preserves a clear, deterministic migration contract.
- Avoids silently changing password semantics.
- Does not introduce a password-normalizing proxy or a new credential-handling boundary.
- Uses the existing privacy-minimized boolean attestation; no password material is needed.

Costs:
- Affected users must complete a reset.
- Notification and reset UX must be prepared and tested.

### B. Normalize at every official client before sending to Auth0

Have Portal Web, Android, and Admin apply the same legacy-compatible trim operation before authentication requests.

This option is only viable if every supported official client uses a custom authentication flow that can perform the normalization before the password is sent to Auth0. Do not assume hosted Universal Login or a direct Auth0 flow can be normalized by an application-side action. The exact authentication flow must be inspected and tested first.

Advantages:
- Reduces forced resets for existing users.
- Preserves the legacy effective-password behavior in clients that implement the contract.

Risks:
- A missed client or alternate login path produces inconsistent behavior.
- Client-side normalization is not a server-side enforcement boundary.
- Requires cross-client contract tests and explicit UX disclosure.

### C. Import and show a notice only — not recommended

Import the Scrypt verifier and tell users to remove leading/trailing spaces if login fails.

This accepts a known login behavior change for the affected cohort and risks avoidable support load. Do not use this option without explicit owner acceptance.

### D. Custom Database Connection or password broker — not selected

A custom database connection or a broker that receives passwords would add a new authentication boundary and may require a different Auth0 plan. This conflicts with the currently selected Essentials + Bulk User Import route unless separately reviewed and approved.

## 4. Recommendation

Recommended migration treatment: **Option A** for legacy accounts with `edgeWhitespace=true`.

Recommended new-password rule: reject leading/trailing whitespace at password creation and reset in all official clients, with a clear inline validation message. Do not silently rewrite the user's input. Internal spaces remain permitted unless a separate policy says otherwise.

If the owner prefers Option B, keep the R1 cohort on hold until Portal Web, Android, and Admin all demonstrate the same pre-Auth0 normalization behavior against the exact selected login flow.

## 5. Required owner decisions

1. Legacy edge-whitespace cohort: A (targeted reset), B (all-client normalization), or C (notice-only behavior change).
2. New-password rule: reject leading/trailing whitespace, or explicitly approve a different shared rule.
3. Notification channel and copy for affected users.
4. Whether reset must happen before credential import or through a controlled post-cutover recovery flow.

No option is accepted by this draft. The local validator remains fail-closed for this cohort until a decision is recorded.

## 6. Acceptance tests after decision

- The chosen rule is identical across Portal Web, Android, and Admin.
- No client silently changes the password without the chosen UX contract.
- An unresolved `edgeWhitespace=true` record cannot enter the import set.
- If Option A is selected, the old verifier is not imported and the reset flow is idempotent.
- If Option B is selected, every official login path normalizes consistently before Auth0 receives the credential; hosted/direct flows are either excluded or independently proven.
- The real Auth0 behavior is tested only in a separately approved non-production tenant.

## 7. Security and production boundary

This proposal changes no production login path, no Auth0 tenant, no user record, and no password. It does not authorize reading or exporting production credential rows. Any production hook, client rollout, notification send, reset campaign, or tenant operation requires its own approved execution scope.
