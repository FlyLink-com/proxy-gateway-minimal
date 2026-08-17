# PR #624 Merge Record

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: pr_624_merge_record
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```

> Status:
> - Type: Historical merge record (single-shot evidence)
> - Risk: C
> - Execution authority: None
> - Production impact: None
> - Source of truth for: What merged into `master@bc62d1c` on 2026-08-16 and what CI ran

## What this document is

This file is a one-shot post-merge record. It is **not** part of the
canonical governance contract (that contract lives in
`docs/CONVENTIONS.md`). It exists to record facts about PR #624 that
are not appropriate to keep in `CONVENTIONS.md` long-term:

- The merge identity (commit, date, branch).
- The hosted CI result on the PR head and the merge commit.
- The local wider-suite behavior observed on the implementer's clone
  (baseline-equal, not introduced by #624).

Future governance contract changes do not belong here. This document
is `lifecycle: historical`; once PR #624 is no longer a recent
merge, this file is not deleted (auditable) but is not the source of
truth for any contract.

## Merged state

- PR: [#624](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/624)
- Merge commit: `bc62d1c95c753d579f62054e403c1891f78d9f9b`
- Merged into `master@bc62d1c` on 2026-08-16.
- Branch prior to merge: `docs/governance-sweep-2026-08-16`.
- 12 commits, 372 files, +4834 / -31.
- Risk classification per the project's own contract:
  `Risk B` (modifies an executable checker, a CI gate, and a test
  suite; not "docs only").

## Hosted CI on the merge commit

The PR head and the merge commit both passed hosted CI:

- `git diff --check origin/master...HEAD`
- `npm run docs:authority:check` (later replaced by `strict`)
- `node --test server/tests/document-authority-check.test.mjs`
- `npm test` (server tests)
- `npm run admin:test`
- `npm run admin:build`
- `npm run public-site:build`, `:verify`, `:dry-run`
- `npm run governance:check`

The Cloudflare deployment step was **not** executed. The
`deploy-cloudflare-site` job has its own gating that was not satisfied
for this PR. The `Deploy` job was skipped: build, verification, and
dry-run passed; no production deployment occurred.

## Local wider-suite behavior

The implementer's local clone reported 158 wider-test failures and 171
admin-test failures during the merge window. These were **baseline-equal**:
the same counts were observed on `master` without the PR's diff
applied. They are not regressions introduced by PR #624. PR #624 did
not establish the specific root cause of those local failures; the
implementer observed them in the local environment and did not
investigate further. They are environmental (the implementer did not
have all required toolchains available locally for the full server /
admin / public-site lanes).

Hosted CI on the PR head and merge commit passed the equivalent
gates in the GitHub-hosted runner environment, where the full toolchain
is available. The merge was performed on the basis of the hosted
result.
