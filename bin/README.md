# CLI Workspace

This file is a responsibility and navigation entrypoint. It does not establish
global, release, deployment, runtime, or production authority.

## Responsibility

`bin/` owns the `gccgw` command-line adapter used to navigate project
capabilities and invoke existing service or script boundaries through one
operator-facing entrypoint.

## Entry Points

- [gccgw.mjs](gccgw.mjs) is the primary CLI router.
- [proxy-gateway.mjs](proxy-gateway.mjs) is the compatibility entrypoint that
  delegates to `gccgw`.
- The root [package.json](../package.json) exposes supported CLI scripts.

## Development

Use `npm run cli -- <command>` from the repository root. Prefer read-only
navigation and inspection commands while developing, and keep command routing
thin by placing domain behavior in its existing owning module.

For a redacted Project #1 read, use `gccgw project export --json` with a
temporary `GH_TOKEN` (or `GITHUB_TOKEN`) that can read the organization
Project. Evaluate the saved result with
`gccgw project drift --input <project-export.json> --json`. Neither command is
part of offline `project verify`, and neither supports writeback.
Drift has no alternate-contract option: it byte-verifies the checked-in
Project contract, requires the saved export to carry the same canonical
contract digest, and fails missing, stale, or non-canonical bindings with exit
`2`.
Run drift only on a newly created export. Exit `0` means
`clean_in_evaluated_scope`, exit `1` means proven drift, and exit `2` means
`review_required`, `indeterminate`, or CLI failure. Machine consumers must
read `outcome`, `coverage`, and `reviewCount` together; a review finding is not
global clean and the saved export timestamp is not writeback authority.

## Validation

Run `node --test server/tests/cli-router.test.mjs` for CLI routing changes, then
`npm test` and `git diff --check origin/master...HEAD`.

## Boundary

A listed or routable command is not an approval. The CLI does not replace Risk
A gates for provider, production, deployment, runtime, or credential actions,
and its output must not expose secrets, subscription material, raw config, or
customer data.
