# D1 T2 Independent Review Packet v1.1 — Draft

> **Status:** C1/C2 source-slice review APPROVED; full T2 independent review NOT COMPLETE. This remains a Draft full-scope packet and does not self-approve T2.
> **Source anchor:** `master@be261abc60f28bb2733764fa5364ab44b3e76844`.
> **Draft branch:** `docs/d1-target-schema-g6-rehearsal-plan-20261107`.
> **C1/C2 source-slice reviewer:** `gccltdco-cmd` — APPROVED on exact HEAD `bc3f8c9a` (Review ID `5817529933`). **Full T2 reviewer:** full-scope review not complete; independence evidence remains outstanding.
> **C1/C2 source-slice target:** `bc3f8c9a713de05715f42f733b8fa72ba53d4477` via PR #842, baseline `bf200c474173d58d855fab66050a9c2b6b1ac4d4`; this slice is APPROVED. **Full T2 target:** pin a new exact final commit and all artifact hashes only after C1–C6 evidence is complete; never review a moving branch head.
> **Production authority:** BWH remains the only production writer.

## 1. Review scope

Review the full T2 closeout contract, not only the original lease/idempotency proposal. The review must cover identity custody, PII pseudonyms, key custody/rotation, the wallet-first legacy digest exception, all 26 JSON fields and every writer path, opaque-reference/generation grammar, payment-action capability custody, retention, and G2 compatibility residuals.

## 2. Artifacts to review

1. `docs/D1_T2_CORE_SECURITY_CONTRACTS_V1.md`
2. `docs/D1_T2_SOURCE_WRITE_PATH_AUDIT_V1.md`
3. `docs/D1_T2_PII_PSEUDONYMIZATION_AND_HMAC_COMPATIBILITY_V1.md`
4. `docs/D1_T2_PAYMENT_ACTION_CUSTODY_DESIGN_V1.md`
5. `docs/D1_T2_RETENTION_DECISION_RECORDS_V1.md`
6. `docs/D1_T2_CLOSEOUT_EXECUTION_MATRIX_V1.md`
7. `docs/D1_T2_INDEPENDENT_REVIEW_PACKET_V1.md`
8. `docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json` and `docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json`
9. `server/tests/d1-t2-security-vectors.test.mjs`
10. `docs/D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md`
11. `docs/D1_T2_C1_IDENTITY_AUTH_CUSTODY_DECISION_V1.md` (DRAFT proposal; partially owner-approved, with T1 and provider direction selected)
12. `docs/D1_T2_C1_IDENTITY_PROVIDER_EVALUATION_V1.md` (DRAFT assessment; Auth0 Essentials + Bulk User Import owner-selected, tenant/proof pending)
13. server/services/platform/portal-identity-import-rehearsal.mjs (local synthetic-only converter; no provider I/O)
14. server/tests/platform-portal-identity-import-rehearsal.test.mjs and scripts/platform-identity-import-rehearsal.mjs (focused tests and redacted receipt command)
15. `docs/D1_TARGET_SCHEMA_AND_G6_OFFLINE_REHEARSAL_PLAN.md`

## 3. Required independent checks

### Identity and PII

- Reconcile raw `loginRef`, `displayRef`, `displayName` and all related low-entropy digests with current source callers.
- Verify `resolvePortalLoginAccount()` semantics: exact account-ID resolution, active-account scan by `loginRef`/`displayRef`, unique-match requirement, and ambiguity behavior.
- Verify the identity source of truth, authorized lookup path, outage behavior, retention and deletion contract.
- Reconcile the 11-column `platform_portal_password_credentials` DEFER disposition with the conditionally wired current password-login path; DEFER must not silently disable a supported feature.
- Reconcile `platform_portal_totp_credentials.encrypted_totp_secret` EXTERNALIZE with the remaining TOTP state fields; prove real password hashes and TOTP secrets never enter D1, Worker payloads, logs, traces or evidence; only clearly synthetic, non-production fixtures may appear in tests.
- Review the current BWH AES-256-GCM TOTP envelope and shared User Portal/Admin protector as source facts. Apply T1 to the target: Auth0-managed MFA, no first-party target TOTP AES keys, no legacy `enc:`/raw Base32/v2 import or transfer, and mandatory re-enrollment at cutover (Portal optional enrollment; Admin mandatory).
- Verify fixed PII domains, normalization, HMAC input bytes, key ID and rotation behavior.

### HMAC, lease and replay

- Verify all six lease-token issuer formats: five 64-lowercase-hex tokens and one prefixed UUIDv4 reservation token.
- Verify six raw idempotency fields, uniqueness/replay scopes, and separate provider-event and PII key/domain families.
- Verify the HMAC versioned envelope, key-ID grammar, byte-exact four-byte big-endian length prefix and NUL domain separator.
- Separately review the generic v3 AES-GCM primitive for correct AAD/key-family behavior if it remains in the source slice, but record that it is not the selected Auth0/T1 production path. Verify the T1 classifier returns re-enrollment for structurally valid legacy formats and quarantine for malformed values; do not decrypt or re-encrypt legacy v2.
- Verify unknown/missing key ID, malformed envelope and wrong domain fail closed without plaintext or bare-SHA fallback.
- Independently review `platform_wallet_first_setup_delivery_handoffs.idempotency_key_hash` and `session_binding_hash`; do not silently classify them as one of the six raw fields.

### JSON, references and generation

- Reconcile all 26 JSON columns against the T1 inventory.
- Verify each writer and caller; challenge missing INSERT/UPDATE paths and direct SQL bypasses.
- Verify the Draft generation validator accepts only `gen_[0-9a-f]{24}` / `gen_scoped_[0-9a-f]{32}` and the second-factor persistence writer accepts only non-empty unique `totp` / `passkey`; review focused test evidence and rerun the full store test file at the pinned commit.
- Verify exact closed schemas and persistence-boundary enforcement, including direct Audit SQL writer and transaction atomicity.
- Verify aggregate allocation and per-lot allocation remain distinct contracts.
- Verify opaque-reference grammar and historical conformance, including `safeControlRef` enforcement for edge notification ID/node/channel/desired-state references.
- Verify generation grammar against both source builders and the persistence writer; check the low-confidence field remains CONDITIONAL until justified.

### Payment and retention

- Review payment capability storage, encryption-key custody, resolver authorization, repeatable active resolution, saga ordering, terminal purge, alarm retries, outage and restore reconciliation.
- Verify no raw payment URL/QR or bearer capability is written to D1, logs, traces or evidence.
- Verify retention periods are owner-approved and not inferred from active expiry/lease fields.
- Verify financial/audit immutable facts, replay windows, legal hold and redacted tombstone rules.

### G2 compatibility and production boundary

- Review all accepted G2 residual limitations and their G6 probe or named risk-acceptance mapping.
- Confirm no BWH, production data, real key, remote D1, deployment, CI or production cutover was used in this Draft-only work.

## 4. Test evidence and freshness

The earlier isolated Node built-in run recorded 9/9 passing contract tests. The PII vector additions expanded the current test file to **14 declared test cases**. The historical 9/9 result must not be represented as a pass of the expanded 13-case file.

A focused Node 22 formula check was run after correcting a domain-separator discrepancy. It verified:
- the PII digest domain prefix is one NUL byte, not the two-byte literal backslash-plus-zero;
- the old-key and active-key email pseudonym known-answer outputs match the documented vectors;
- the NUL-prefixed and literal-backslash-prefixed byte strings differ.

The focused check passed. Before the latest normalization-test addition, the 13-case file was run from a byte-identical copy of GitHub blob `c61b5d6d54416524317f0c43bc4b4158583cf954` using Node v22.16.0: `node --test /tmp/d1-t2-security-vectors.test.mjs` — **13/13 PASS** (raw SHA-256 `ddbf91af45ea721192563e8fa4b5b14261bee3badab8000f95c44392d6545243`). The added 14th test covers source `normalizeEmail()` trim/lowercase behavior; that case was run separately under Node v22.16.0 — **1/1 PASS** (isolated script SHA-256 `f7a4375fea03ee48433afe0d96e28c22896fc8de8a2caa83df58e8fdbbffd08f`). Current full test file Git blob is `a20a49c77255d3b10a1c8ebff742f9aca4804765`; **the complete 14-case PII vector file has not yet been run as one suite under Node v22.23.1**. Separately, the full repository `npm test` was run at Node v22.23.1 on C1/C2 candidate HEAD `bc3f8c9a` and baseline `bf200c47`; see the 2026-11-08 review record below. The comparative result is zero new failures, not an all-green suite. PR #842 has no hosted CI run and no CI PASS is claimed. The full-scope reviewer must still run the current 14-case PII vector file from a pinned commit and record the exact command, Node version, output and file hash.

### Corrected discrepancy

The PII rotation helper previously encoded `\\0` (literal backslash plus zero) while the first PII known-answer vector encoded `\0` (NUL byte). The helper and the PII contract notation have been aligned to the NUL-byte separator. Relevant Draft commits:
- `8ff614a3a74637b7ad7300e971df0d4858051486` — test helper correction.
- `944660925625349e8ad20e1da256a0c0405169ca` — PII contract notation correction.

Reviewer must verify the final file bytes rather than relying on this note.

### Draft implementation evidence — 2026-11-07

- `subscription-control-db.mjs` now validates desired-state generation grammar and second-factor allowed-factor enums at the persistence boundary.
- Focused Node 22.16.0 validator harness: 5/5 PASS (SHA-256 `05d124b9461b10966f715b165f64ab5946249aa574c94dcf73b8a9cb5a1e9ab5`); includes generation grammar, opaque refs, and second-factor allowlist.
- Integration assertions were added to `server/tests/platform-subscription-control-db.test.mjs` (current blob `3645d6e619ff74fa7d0c3664bde120531ded315a`).
- The complete store test file has not yet been run; full repository tests and CI remain unrun.
- Historical production generation values are NOT OBSERVED. This does not close the migration compatibility requirement.

### Draft writer hardening evidence — 2026-11-07

- Issuance metadata union is enforced at create and wallet-first insert/update writers; edge-node metadata is enforced at the shared store writer.
- Source commits: `a1b55bcc33e745b7094c93141d4a05530812c216`, `559156cbf8c4f841a80b20b68289811fb89efbba`.
- Regression tests added: `0943ffe6b2f98841edb1ec58b866c4034bc3bbc4`, `4c0e3c7c32227dfbb581582f6e3123a495d366de`; preflight fixture alignment: `87e0147a8154b99339a8090f19e4793fc121196f`.
- Source-mirroring pure harnesses: 10/10 per contract. Repository Node test files, full suite and CI have NOT RUN.
- Remaining C3 review scope: account metadata/PII and independent review of all 26 fields. Audit/Portal event and commerce notice writer contracts have been implemented on Draft and must now be independently challenged for caller coverage, false positives/negatives, atomicity and historical compatibility.

### Commerce notice JSON writer evidence — 2026-11-07

- Per locale: 1–8 unique notices; each notice is trimmed, single-line plain text and at most 512 UTF-8 bytes.
- Deterministic screening rejects URL/markup, email, phone, IPv4 and common secret-like patterns; final offer INSERT re-runs full offer normalization.
- Source commits: `e0f568b91e58e74189fe65ace4de5c5623f7ffbe`, `06e5c0dc7a04d3bafb87925982d5d52eefcbc145`, regex correction `60a3a8c200b7caf3bd09c47c19738d1da7fc8228`; regression tests added `d8a055ec8b723c5f50a7402f478c466a4b452d70`.
- Source-mirroring pure synthetic harness: 14/14 PASS. Actual Node test file, full repository suite and CI remain NOT RUN.
- This deterministic filter is not comprehensive PII detection; independent review must challenge coverage and false-positive/negative behavior.

### Audit and Portal event JSON writer evidence — 2026-11-07
- Audit inputs are snapshotted as plain enumerable data before recursive unsafe-field checks; invalid wallet-first audit parser results fail closed as `validation_error`. Source commits: `fddc836b806af21d116e4f2a8355b8dea94170a5`, `28a6f381bba182876a49410a2bad74c8bbeeb371`, `a724b762f56f4d3f0afb459eb0574c4d56bfb60f`.


- Shared validator module: `server/services/platform/control-json-contracts.mjs`.
- Audit entity/action union: 8 exact variants covering issuance, entitlement traffic limit, wallet-first prepared/runtime/receipt, Coin Commerce subscription fulfillment and data-pack fulfillment.
- Direct initial-confirmation INSERT uses the same 17-key fulfillment serializer and preserves the existing SQLite transaction boundary.
- All current Portal event writers use the shared discriminated event union; legacy `old_link_invalidated` is read-only.
- Regression tests: `control-json-contracts.test.mjs` commit `243d5084f939c62743f9cb7adc486267d39fbe3a`; store integration assertions commit `1c2e5b32292e836deb5b2173b2554407258aefb9`. Malformed historical rows in tests are now inserted via raw SQL intentionally.
- Pure source-mirroring event/fulfillment harness: 30/30 PASS; separate issuance/compensation/traffic-limit audit metadata harness: 11/11 PASS. These are not repository Node test runs. Actual Node test files, full suite and CI remain NOT RUN.

## 5. Blocking findings

T2 remains BLOCKED until all are resolved with evidence:

1. Identity/authentication custody owner and technical boundary; raw email/displayName externalization; current password login and TOTP behavior preserved without password hashes or TOTP secrets entering D1.
2. HMAC and AES-256-GCM key custody, rotation/retirement and historical compatibility approval; wallet-first pre-hashed digest exception; TOTP key ID, shared User Portal/Admin key scope and legacy `enc:` raw-secret handling.
3. Closed JSON schemas enforced at every writer; opaque-ref and generation grammar; independently verify the shared Audit SQL serializer and preserved atomicity.
4. Payment action custody owner, encryption-key boundary, TTL, terminal purge, tombstone and outage/restore behavior.
5. Named domain owners and approved retention rules; G2 residual probes or explicit risk acceptance.
6. Full T2 reviewer signature on the exact final all-package commit. The C1/C2 source-slice review is now APPROVED at `bc3f8c9a`; this does not complete the full-scope C6 review or establish distinct natural-person independence.

The closeout execution matrix tracks acceptance criteria for each work package.

## 6. Reviewer outcome

Reviewer must record one of:
- **APPROVE:** all mandatory T2 gates are evidenced and no blocking findings remain.
- **APPROVE WITH EXPLICIT RESIDUALS:** every remaining limitation has a named accountable owner, bounded impact, mitigation and explicit acceptance; no mandatory security/identity/payment blocker remains.
- **REQUEST_CHANGES:** list exact source path, field, contract and required evidence.
- **BLOCKED:** required owner decision or evidence is unavailable.

The review record must identify the reviewer, reviewed commit SHA, artifact hashes, commands, environment, results, findings, dispositions and approval scope.

No approval, PR Ready transition, merge, deployment, production read, remote resource mutation or migration is authorized by this packet.


## 7. Completed C1/C2 source-slice review — 2026-11-08

This section records the bounded source-slice review. It does not replace the full T2 review specified above.

### Exact GitHub binding

- PR: [#842](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/842), still OPEN / DRAFT.
- Baseline: `bf200c474173d58d855fab66050a9c2b6b1ac4d4`.
- Source HEAD: `bc3f8c9a713de05715f42f733b8fa72ba53d4477`.
- Review ID: `5817529933`; reviewer account: `gccltdco-cmd`; state: `APPROVED`; submitted at `2026-11-08T10:28:54Z`.
- The GitHub REST `commit_id` equals the PR head byte-for-byte. No review-dismissed event was found.
- Scope: 10 commits / 10 files / +1,836 −14. The review was limited to this C1/C2 source slice.

### Reviewed conclusions

The approval body records review of identity-versus-password evidence separation; the then-current legacy TOTP fail-closed behavior; key-family isolation and cross-family reuse detection; generic TOTP v3 AES-256-GCM AAD binding to key ID, scope and credential reference; canonical Base32 padding/pad-bit validation; required-factor policy; explicit non-implementation of OIDC/JWT signature verification; and honest OPEN/PENDING status. That approval is pinned to bc3f8c9a and does not review the later T1 re-enrollment-only changes or make the generic v3 TOTP primitive a selected production path.

### Test evidence

- At exact HEAD, Node v22.23.1: four related repository test files passed **48/48**.
- Full-suite baseline/candidate comparative results are recorded in the closeout matrix: zero new failure names; 28 added tests pass; 156 baseline failures remain; one timing-flake name was isolated 5/5 on each HEAD.
- No hosted CI run exists for this Draft PR. This approval does not claim CI PASS.
- The separate 14-case PII vector file remains outstanding as a one-suite Node v22.23.1 run.

### What this approval does not close

- C1 formal acceptance and C2 formal acceptance remain OPEN.
- T2-C6 full review remains OPEN; PR #842 did not review all six T2 packages, the full 820-field disposition, all 26 JSON writer paths, payment custody, retention and G2 residuals.
- A separate GitHub account is evidenced; distinct natural-person independence is not established by account separation alone.
- No merge, Ready transition, deployment, BWH access, production key creation, production D1 operation, migration or writer-authority switch is authorized.

See the closeout matrix and the companion remaining-owner-decisions and migration-readiness documents.
