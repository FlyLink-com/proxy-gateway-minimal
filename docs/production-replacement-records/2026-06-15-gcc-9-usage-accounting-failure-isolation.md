# GCC-9 Usage Accounting Failure Isolation

Date: 2026-06-15, America/Los_Angeles.

## Status

- Type: repo-only implementation evidence
- Risk of this record: C, documentation/status only
- Related code risk: B, server usage-accounting orchestration and tests
- Production impact: none
- Related Linear lane: GCC-9, usage accounting and quota enforcement closeout

This record documents the repo-only GCC-9 improvement that makes runtime usage
accounting safer to operate before any production collector activation.

It does not enable live runtime collectors, quota auto-disable, subscription
render changes, DNS, Nginx, provider firewall, systemd, SQLite production data
mutation, live order creation, or production deployment.

## Completed Boundary

- Runtime collector failures are isolated per collector.
- Accounting write failures are isolated per observation.
- Later collectors and later observations continue processing after a redacted
  failure.
- Failure reports use stable redacted blocker codes instead of raw exception
  text.
- The accounting report now states the execution boundary:
  - `writerMode=sequential`
  - `retryMode=operator_replay_idempotent_samples`
  - `safeToRetry=true`
- Existing quota behavior remains controlled: quota exceedance only sets
  `subscriptionMutationRequired=true` in the report and does not directly
  mutate runtime state.

## Source Files

- `server/services/platform/runtime-usage-accounting.mjs`
- `server/tests/runtime-usage-accounting.test.mjs`

## Validation

The following validation was run locally after the repo-only change:

- targeted usage, collector, ledger, monitor, and quota tests: passed
- `npm test`: 800 passed
- `npm run admin:test`: 139 passed
- `npm run admin:build`: passed
- `npm run project-state:check`: passed
- `git diff --check`: passed with only existing LF/CRLF warning
- explicit trailing-whitespace scan on changed files: no findings

## Not Complete

- Live runtime usage collection is not enabled by this record.
- User Portal usage display is not completed by this record.
- Quota enforcement auto-disable is not enabled by this record.
- Production collector activation still requires a separate Risk A gate with
  read-only inventory, dry-run, explicit operator approval, validation, and
  rollback.

## Next Gate

The next GCC-9 gate should decide whether to:

1. keep this as a repo-only safety improvement and move to review; or
2. prepare a separate Risk A production collector activation packet for one
   controlled node/channel, keeping quota auto-disable disabled by default.
