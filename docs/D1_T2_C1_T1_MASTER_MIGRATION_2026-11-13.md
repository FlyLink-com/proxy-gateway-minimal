# C1 T1 Master-based migration for PR #843

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: c1_t1_master_based_migration
  superseded_by: null
  last_verified_at: 2026-11-12
  production_authority: false
```

> Status: Draft integration work only. This record does not authorize merge, production cutover, Auth0 tenant changes, or any real-account operation. The owner has separately authorized a documentation-only correction and a new full Hosted CI validation cycle; this does not authorize merge or deployment.

## Baseline and provenance

- Exact target baseline: `master@ea47d78e824322575ae65765500046f7d1cf4207`.
- Original PR: [#843](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/843), original HEAD `4be493a06a55d245bd2d89a1019f62922ab251bb`, stacked on review-only PR #842.
- Master-based migration branch: `fix/t1-master-ea47d78e-migration-20261113`.
- Initial source/test migration commit: `9a79036292af6cad9033c19445631de0adf7fa66`.
- At source/test HEAD `3f98d134ed7f6a8f18c144e0a47bb3396b1535e5`, the exact compare against the target baseline showed 4 commits ahead, 0 behind, and 7 changed files (2 documentation files and 5 source/test files). The documentation-only correction is separate from those source/test changes.
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

### Evidence on source/test HEAD `3f98d134ed7f6a8f18c144e0a47bb3396b1535e5`

- Exact compare against baseline `ea47d78e824322575ae65765500046f7d1cf4207`: 4 commits ahead, 0 behind, 7 changed files.
- The pull-request-triggered CI run `43367814327` completed with conclusion `skipped` while the PR was Draft. It is not a CI pass.
- CodeQL run `43367814248` completed successfully: Actions, C/C++, Python and JavaScript/TypeScript analyzers all succeeded (4/4).
- Full Hosted CI dispatch run `43371211728` did start, but did not complete the full validation path. Governance snapshot succeeded. Source checks failed at `npm run docs:authority:strict` because this file lacked the required `document_metadata` block. The server tests, admin tests, certificate hooks and downstream build/artifact jobs were skipped or blocked; prerequisite and final validation jobs consequently failed.
- Therefore no server/admin test pass count is claimed for this HEAD. The test commands were not reached in that failed run. The earlier #843 focused-test evidence and reviews are not inherited.

### Authorized correction and next validation

- The only permitted repository change in this correction is this Markdown file: add the required `document_metadata` block and accurately record the above verification state.
- No business source or test file may be changed as part of this correction.
- After verifying the documentation-only commit and exact new HEAD, transition the PR from Draft to Ready to trigger the standard pull-request Hosted CI workflow. The expected PR workflow has conditional skips for the workflow-dispatch-only Governance snapshot and the dedicated PR-domain-validation head ref; those are not applicable to this PR. Every applicable job must complete successfully, and every SKIPPED result must be recorded as SKIPPED rather than PASS.
- Verify all four CodeQL analyzers on the new exact HEAD. Obtain a fresh full-source review bound to that exact HEAD before any later formal approval decision.
- Any new CI failure must be diagnosed from its job logs; do not alter source or tests without separate authorization.

## Production and operational boundary

No BWH access, real user/credential import, Auth0 tenant/API operation, remote D1 mutation, Cloudflare production mutation, deployment, DNS/traffic change, key rotation, or legacy secret handling occurred. BWH remains the only production control-data writer. C2 remains OPEN; T2 remains BLOCKED / NOT READY.
