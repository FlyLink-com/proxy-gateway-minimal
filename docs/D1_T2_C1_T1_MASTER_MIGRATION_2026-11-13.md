# C1 T1 Master-based migration for PR #843

> Status: Draft integration work only. This record does not authorize Ready, merge, production cutover, Auth0 tenant changes, or any real-account operation.

## Baseline and provenance

- Exact target baseline: `master@ea47d78e824322575ae65765500046f7d1cf4207`.
- Original PR: [#843](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/843), original HEAD `4be493a06a55d245bd2d89a1019f62922ab251bb`, stacked on review-only PR #842.
- Master-based migration branch: `fix/t1-master-ea47d78e-migration-20261113`.
- Initial source/test migration commit: `9a79036292af6cad9033c19445631de0adf7fa66`.
- The old #843 source review and its docs-only follow-up approval are bound to the old PR history/HEAD. They do not approve this new branch or its complete source diff.

## T1 disposition contract

Owner decision T1 (2026-11-08) is the governing decision for legacy Portal/Admin TOTP:

1. Legacy `enc:<base32>`, unprefixed Base32, and structurally valid legacy `v2:aes-256-gcm` values are retired at cutover and require a fresh Auth0-managed MFA enrollment.
2. The migration path must never read a legacy key, decrypt, import, transfer, or re-encrypt legacy factor material.
3. Structurally malformed or unknown values are quarantined for manual review; they are not silently accepted as re-enrollment candidates.
4. No legacy TOTP secret is included in the Auth0 bulk-import record. Auth0 owns new factor enrollment. Provider new-enrollment lifecycle proof remains OPEN.

## Master-based source changes

- `d1-t2-security-primitives.mjs`: the legacy-named compatibility export is now a disposition classifier only. It validates canonical v2 envelope structure and Base32 syntax before returning `re_enroll_required`; malformed values return `quarantine`.
- The v3 protector no longer accepts the historical `enc:` prefix as new secret input. Correct whitespace/hyphen normalization is retained with a single `\\s` regex escape.
- `portal-identity-import-rehearsal.mjs`: synthetic TOTP classification is strict about input types, Base32 padding/pad bits, envelope structure and input bounds. Valid legacy formats require re-enrollment; malformed values quarantine. The synthetic import record continues to omit TOTP factor material.
- The redacted synthetic receipt now reports the valid legacy v2 disposition as `RE_ENROLL_REQUIRED`; it does not claim that provider lifecycle proof has run.
- Regression coverage was added for valid `enc:`, raw Base32, valid v2 envelopes, malformed values, oversized values, non-string values, whitespace/hyphen normalization and rejection of `enc:` by the new v3 protector.

## Master protections deliberately preserved

This branch starts from the exact Master commit rather than inheriting the #842 stacked branch. It preserves:

- `assertDistinctD1KeyRingSet` per-index `Object.hasOwn` checks, including sparse-array rejection.
- The current PII digest-only lookup/verification helper APIs.
- Current Identity Boundary checks for sparse factor arrays, duplicate factors and required factors.
- The corresponding Master regression tests.

The #843 branch version had drifted from these Master protections. Those inherited changes were not copied.

## Scope and documentation treatment

The original #843 PR contains 14 documentation files in addition to its source/tests. They were not copied wholesale because the PR is stacked on an old review branch and the current Master already contains later decision history. This migration updates the current Draft Source Hardening note and records the T1 behavior here. The older identity-custody/provider/closeout drafts remain historical inputs and should be reconciled separately against the current T1 decision rather than blindly overwritten.

## Verification status

- Branch ancestry and diff were checked against the exact Master baseline: one source/test migration commit, six files changed, zero commits behind.
- Static content checks confirmed that Master sparse-array and PII helper code remains present and that the old Identity Boundary source/test files were not changed.
- The Node tests have **not** been executed for this new HEAD.
- No Hosted CI or CodeQL workflow was dispatched. The old #843 focused-test evidence is not inherited.
- Before Ready or merge, run the focused T1 tests, the full repository CI, all four required CodeQL analyzers, and obtain a fresh full-source review bound to the final exact HEAD. Treat every conditional SKIPPED as not PASS.

## Production and operational boundary

No BWH access, real user/credential import, Auth0 tenant/API operation, remote D1 mutation, Cloudflare production mutation, deployment, DNS/traffic change, key rotation, or legacy secret handling occurred. BWH remains the only production control-data writer. C2 remains OPEN; T2 remains BLOCKED / NOT READY.
