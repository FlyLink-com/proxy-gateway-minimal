# D1 T2-C1 Owner Decision Reconciliation (2026-11-10)

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_t2_c1_owner_decision_reconciliation
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```

> **Status:** C1-D01 and C1-D02 are owner-approved. C1 core architecture and non-production evidence were accepted with documented limitations on 2026-11-09. PR integration, shared enablement, production identity migration, and T2 closeout remain separate gates.
> **Decision date:** 2026-11-08.
> **Acceptance record date:** 2026-11-09.
> **Repository:** `FlyLink-com/proxy-gateway-minimal`.
> **G6 preparation baseline:** `3490de6046a4fe48346984b22b0bba4a31546df4`.
> **Current Master observed during reconciliation:** `84b81ab0024a64607c9ca4ca2f05dd5c4529b5a0`.
> **Production authority:** BWH remains the only production writer.

## 1. Approved owner decisions

### C1-D01 — Identity provider and architecture

**APPROVED:** Auth0 Essentials + Bulk User Import is the selected managed identity-provider direction.

- Portal and Admin use separate Auth0 tenants.
- Keep their clients, issuer references, factor policies, and administrative credentials isolated.
- The business control-plane Worker receives only a short-lived opaque actor context after the identity gateway validates the provider assertion.
- Raw email, display name, password, TOTP code/seed, recovery code, access token, refresh token, and authorization code must not enter the business Worker or D1.
- Keycloak with a custom password-hash provider remains an unselected fallback, not the current provider decision.

This is an architecture/provider decision only. It does not authorize purchasing or creating production tenants, creating production credentials, importing production users, or enabling production authentication.

### C1-D02 — Passwords above 72 UTF-8 bytes

**APPROVED:** A password exceeding 72 UTF-8 bytes requires a targeted, user-notified password reset before migration/login through the selected Auth0 path.

- Never truncate the password.
- Never silently rewrite or normalize it into a different credential.
- Preserve existing passwords in the import-compatible range through the approved migration path.
- The number of affected production users remains **UNKNOWN** because no production identity rows were read.

This policy is not a blanket reset of all users. Production cohort identification and any real-user notification/reset operation require a separately approved production plan.

## 2. C1 acceptance boundary

The 2026-11-09 C1 acceptance record states **ACCEPTED WITH DOCUMENTED LIMITATIONS** for the C1 core architecture, source evidence, and non-production Auth0/Worker verification (A1–A11).

That acceptance closes the C1 core-evidence layer only. It is not:
- approval to mark associated PRs Ready or merge them;
- approval to create or modify production Auth0 tenants;
- approval to import, reset, or otherwise mutate production user credentials;
- approval to transfer production TOTP secrets;
- approval to create or modify Cloudflare production Workers, bindings, secrets, or routes;
- approval to connect to BWH, read/write production data, create remote D1, migrate data, dual-write, or cut over production.

### PR #849 evidence and limitation

The accepted record binds the C1 Auth0 Gateway source review to exact HEAD `51145b237e4f89b4ee8a1bf4d28dbc1d81919610` (review `5828391220`, APPROVED). The recorded Worker slice run passed 117/117 tests and the Governance Trusted Advisory passed. The general full-repository CI was **SKIPPED**, not passed.

At reconciliation time, PR #849 remains OPEN / DRAFT and unmerged. Its recorded base anchor is `be261abc60f28bb2733764fa5364ab44b3e76844`, while the current Master ref observed here is `84b81ab0024a64607c9ca4ca2f05dd5c4529b5a0`. Refresh/rebase and exact-HEAD validation are required before any Master-targeted integration decision.

## 3. Separate follow-up gates — not reopened owner decisions

### R1 password normalization

The owner decision for trim-only normalization is separate from C1-D02 and remains in force. It does not mean the implementation is complete.

- The unified R1 specification and Admin-side implementation/integration evidence remain open.
- PR #848 remains OPEN / DRAFT / CONFLICTING and has no current approval.
- The `edgeWhitespace=true` cohort remains fail-closed.
- Do not enable shared or production authentication for the affected cohort until the spec, conflict resolution, exact-HEAD review, and required validation are complete.

### Other recorded C1 limitations

- The old signing-key revocation path returned 404 twice through the attempted Management API DELETE route; the correct provider revocation path and grace behavior must be confirmed before production.
- OBS-1 remains a shared-enable/production gate: callback-query redaction in edge/access logs, login rate limiting, and same-origin hosted-flow verification.
- Email verification policy, visible account label, Coins canary policy, and accountable identity lifecycle owner remain separate unresolved product/ownership decisions.
- Existing TOTP disposition is governed by the separate T1 re-enroll-only decision. This addendum does not authorize transfer of production TOTP seeds.

## 4. Source-document reconciliation

The following earlier files remain historical proposal snapshots; their original PENDING / DRAFT wording records the state at drafting time and must not be read as the current C1-D01/C1-D02 status:

- `docs/D1_T2_C1_OWNER_DECISION_SHEET_V1.md`
- `docs/D1_T2_C1_IDENTITY_AUTH_CUSTODY_DECISION_V1.md`

This addendum is the current repository-side reconciliation for C1-D01 and C1-D02. It does not replace their source audit, compatibility analysis, or the separate C1 acceptance record.

## 5. Reconciliation execution boundary

This documentation reconciliation does not change application code, PR state, CI state, Auth0 resources, Cloudflare resources, secrets, credentials, BWH, production databases, or production traffic. BWH remains the only production writer.
