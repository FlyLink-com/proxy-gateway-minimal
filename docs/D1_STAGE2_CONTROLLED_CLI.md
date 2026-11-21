# D1 Stage 2 controlled CLI

## Purpose

The manually triggered controlled CLI connects the four Stage 2 source modules:

- source-manifest
- source-export
- credential-reconciliation
- freeze-drain

It proves the caller-to-module wiring, argument allowlist, audit output, and fail-closed stop behavior. It is synthetic-only.

## Run

    npm run d1:stage2:controlled -- --mode synthetic --operator muse --json

The operator value is an audit alias, not a credential. The command emits a redacted JSON audit record to stdout. Retain the output in the normal task evidence log when durable retention is needed.

## Accepted arguments

- --mode synthetic
- --operator <3–64 character alias>
- --snapshot-id s2s-...
- --json
- --help

Unknown arguments fail closed. The CLI does not accept a database path, URL, token, secret, production mode, execute/write flag, cron, or scheduling option.

## Execution flow

1. Create a temporary SQLite database containing only s2s-prefixed synthetic fixture rows.
2. Build and verify the synthetic source manifest.
3. Export and verify one bounded synthetic page using the candidate field mapping.
4. Capture a checkpoint, simulate synthetic row changes and one synthetic credential rotation, then verify the credential-version and incremental manifests.
5. Build and verify the four synthetic freeze/drain receipts and readiness bundle.
6. Emit counts, hashes, verification results, stop conditions, and phaseTransition=none.
7. Close the local database and remove the temporary fixture directory.

## Hard boundaries

- No BWH connection or production row read.
- No Cloudflare/E4 connection, D1 write, or DDL.
- No production credential or secret read.
- No real scheduler observation, callback drain, production freeze, writer-authority transition, or cutover.
- No timer, cron, scheduled task, unattended coordinator, or deployment.
- The source snapshot materializes only the existing synthetic rehearsal subset; it is not a full 70-table production snapshot.
- The field mapping remains candidate-only and is not represented as an approved migration contract.
- CLI argument allowlisting is an application boundary, not platform-level single-database isolation.

The scheduler and callback evidence in the generated report are synthetic fixture inputs. A successful run proves the module interfaces are connected and their synthetic contracts verify. It is not production evidence, a real freeze receipt, or cutover authorization.

## Stop behavior

The CLI exits non-zero and emits a STOPPED audit record when an argument is outside the allowlist, the mode is not synthetic, an identifier is invalid, or any module verification fails. It never falls back to a real database or remote target. Stop records carry a fixed error code and fixed message only; an unrecognized argument value is never echoed into the JSON or terminal output, and an underlying runtime failure is reported with a fixed generic code and message instead of the raw exception text, so a mistyped path, URL, or credential cannot land in a retained log.
