# D1 T2 Independent Review Packet v1.1 — Draft

> **Status:** AWAITING A SEPARATE REVIEWER. This packet is not an independent review and does not self-approve T2.
> **Source anchor:** `master@be261abc60f28bb2733764fa5364ab44b3e76844`.
> **Draft branch:** `docs/d1-target-schema-g6-rehearsal-plan-20261107`.
> **Reviewer:** NOT ASSIGNED.
> **Review target:** Pin the exact commit and artifact hashes when the T2 evidence bundle is ready; do not review a moving branch head.
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
11. `docs/D1_TARGET_SCHEMA_AND_G6_OFFLINE_REHEARSAL_PLAN.md`

## 3. Required independent checks

### Identity and PII

- Reconcile raw `loginRef`, `displayRef`, `displayName` and all related low-entropy digests with current source callers.
- Verify `resolvePortalLoginAccount()` semantics: exact account-ID resolution, active-account scan by `loginRef`/`displayRef`, unique-match requirement, and ambiguity behavior.
- Verify the identity source of truth, authorized lookup path, outage behavior, retention and deletion contract.
- Reconcile the 11-column `platform_portal_password_credentials` DEFER disposition with the conditionally wired current password-login path; DEFER must not silently disable a supported feature.
- Reconcile `platform_portal_totp_credentials.encrypted_totp_secret` EXTERNALIZE with the remaining TOTP state fields; prove password hashes and TOTP secrets never enter D1, Worker payloads, logs, traces, fixtures or evidence.
- Review the current AES-256-GCM TOTP envelope: no key ID, `USER_PORTAL_TOTP_SECRET_KEY`, shared User Portal/Admin protector, and legacy `enc:` / unprefixed Base32 behavior. Require key separation or explicit risk acceptance, key ID/rotation/re-encryption, and rejection/quarantine of legacy raw secret values.
- Verify fixed PII domains, normalization, HMAC input bytes, key ID and rotation behavior.

### HMAC, lease and replay

- Verify all six lease-token issuer formats: five 64-lowercase-hex tokens and one prefixed UUIDv4 reservation token.
- Verify six raw idempotency fields, uniqueness/replay scopes, and separate provider-event and PII key/domain families.
- Verify the HMAC versioned envelope, key-ID grammar, byte-exact four-byte big-endian length prefix and NUL domain separator.
- Separately verify AES-256-GCM TOTP envelope key IDs, key separation, old-key decrypt/new-key re-encrypt, tag/ciphertext tampering, unknown key and legacy `enc:` rejection/quarantine.
- Verify unknown/missing key ID, malformed envelope and wrong domain fail closed without plaintext or bare-SHA fallback.
- Independently review `platform_wallet_first_setup_delivery_handoffs.idempotency_key_hash` and `session_binding_hash`; do not silently classify them as one of the six raw fields.

### JSON, references and generation

- Reconcile all 26 JSON columns against the T1 inventory.
- Verify each writer and caller; challenge missing INSERT/UPDATE paths and direct SQL bypasses.
- Verify exact closed schemas and persistence-boundary enforcement, including direct Audit SQL writer and transaction atomicity.
- Verify aggregate allocation and per-lot allocation remain distinct contracts.
- Verify opaque-reference grammar and historical conformance.
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

The focused check passed. Before the latest normalization-test addition, the 13-case file was run from a byte-identical copy of GitHub blob `c61b5d6d54416524317f0c43bc4b4158583cf954` using Node v22.16.0: `node --test /tmp/d1-t2-security-vectors.test.mjs` — **13/13 PASS** (raw SHA-256 `ddbf91af45ea721192563e8fa4b5b14261bee3badab8000f95c44392d6545243`). The added 14th test covers source `normalizeEmail()` trim/lowercase behavior; that case was run separately under Node v22.16.0 — **1/1 PASS** (isolated script SHA-256 `f7a4375fea03ee48433afe0d96e28c22896fc8de8a2caa83df58e8fdbbffd08f`). Current full test file Git blob is `a20a49c77255d3b10a1c8ebff742f9aca4804765`; **the complete 14-case file has not yet been run as one suite**. The full repository test suite and CI have not been run. The independent reviewer must run the current 14-case file from the pinned review commit and record the exact command, Node version, output and file hash.

### Corrected discrepancy

The PII rotation helper previously encoded `\\0` (literal backslash plus zero) while the first PII known-answer vector encoded `\0` (NUL byte). The helper and the PII contract notation have been aligned to the NUL-byte separator. Relevant Draft commits:
- `8ff614a3a74637b7ad7300e971df0d4858051486` — test helper correction.
- `944660925625349e8ad20e1da256a0c0405169ca` — PII contract notation correction.

Reviewer must verify the final file bytes rather than relying on this note.

## 5. Blocking findings

T2 remains BLOCKED until all are resolved with evidence:

1. Identity/authentication custody owner and technical boundary; raw email/displayName externalization; current password login and TOTP behavior preserved without password hashes or TOTP secrets entering D1.
2. HMAC and AES-256-GCM key custody, rotation/retirement and historical compatibility approval; wallet-first pre-hashed digest exception; TOTP key ID, shared User Portal/Admin key scope and legacy `enc:` raw-secret handling.
3. Closed JSON schemas enforced at every writer; opaque-ref and generation grammar; direct Audit SQL bypass and atomicity.
4. Payment action custody owner, encryption-key boundary, TTL, terminal purge, tombstone and outage/restore behavior.
5. Named domain owners and approved retention rules; G2 residual probes or explicit risk acceptance.
6. Separate reviewer signature on the exact final commit.

The closeout execution matrix tracks acceptance criteria for each work package.

## 6. Reviewer outcome

Reviewer must record one of:
- **APPROVE:** all mandatory T2 gates are evidenced and no blocking findings remain.
- **APPROVE WITH EXPLICIT RESIDUALS:** every remaining limitation has a named accountable owner, bounded impact, mitigation and explicit acceptance; no mandatory security/identity/payment blocker remains.
- **REQUEST_CHANGES:** list exact source path, field, contract and required evidence.
- **BLOCKED:** required owner decision or evidence is unavailable.

The review record must identify the reviewer, reviewed commit SHA, artifact hashes, commands, environment, results, findings, dispositions and approval scope.

No approval, PR Ready transition, merge, deployment, production read, remote resource mutation or migration is authorized by this packet.
