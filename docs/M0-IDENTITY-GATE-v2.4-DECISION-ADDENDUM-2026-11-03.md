# M0 Identity Gate v2.4 — Y-3 / Y-4 Decision Addendum

- Date: 2026-11-03 (PST)
- Status: Draft / REVIEW_PENDING / NOT SIGNABLE
- Branch: `feat/m0-identity-gate-v2-helpers-20261103`
- Base helper head before this ruling implementation: `9a90c22f4d3db2a10683b0682f2797d117eafbd5`
- This addendum records the formal Y-3 and Y-4 rulings. It does not authorize BWH access, production reads, snapshots, or the formal Identity Gate.

## Formal decisions

### Y-3 — schema identity: option A

Remove `schemaVersion` from census JSON output, live/snapshot field comparison, and the identity-stability fingerprint. Use `schemaDigest` as the sole schema identity fingerprint.

Reason: the fourth-round fixture observed live `schemaVersion=2` and snapshot `schemaVersion=1`, while `schemaDigest` and every other census field were equal. SQLite `schema_version` is a DDL change counter, not schema-content identity. The fixture may inspect raw `PRAGMA schema_version` only to prove the cookie divergence; it must not emit that value in census JSON or identity fingerprints.

### Y-4 — sidecar/SHM contract: option A

Revise the execution contract to v2.4 and ratify the current helper implementation:

1. Each existing `-wal` or `-shm` sidecar must independently be a regular file and not a symlink.
2. Do not require WAL and SHM to exist as a pair. One sidecar being absent is not, by itself, a fail-stop condition.
3. A missing SHM is allowed for a normal read-only/WAL-aware open. SQLite may create transient SHM coordination state; this is an explicitly disclosed and accepted temporary side effect, not a claim that no file can be created.
4. Any existing or newly appearing sidecar that is a symlink or non-regular file remains a fail-stop condition.
5. Main DB and WAL bytes, mtime, and SHA-256 must remain unchanged.
6. SHM inode, size, mtime, and hash do not have to remain equal before and after. They may be recorded as diagnostic observations, not hard pass conditions or identity-stability inputs.

This ruling does not authorize writes to the main DB/WAL, configuration, units, services, Timer, Collector, retention data, or paths outside the approved temporary work directory.

## Draft implementation commits

- Census identity change: `203cf2bb17110578ecd7d8855f1bf15037b9a55c`
- Snapshot helper version alignment: `38ea8e4c88cdc0b91081be6907525f662137e86c`
- Fixture regression test: `01097ffd1dbbd47869b8acf57e94392ce7772edb`

Files changed:
- `scripts/m0-gate-census.mjs`
- `scripts/m0-gate-snapshot.mjs`
- `server/tests/m0-gate-helper-fixture.test.mjs`

The new fixture asserts that live and snapshot SQLite schema cookies differ, that neither census output contains `schemaVersion`, and that `schemaDigest` and all remaining census fields match.

## Required before first-layer review

1. Run `node --check` on all three helper/test files.
2. Run the complete fixture suite on the fixed stack: Node `v22.23.1`, better-sqlite3 `12.10.0`, SQLite `3.53.1`.
3. Confirm activity-WAL live census, Backup API snapshot, missing-SHM behavior, symlink rejection, and non-regular-sidecar rejection.
4. Capture the three new raw outputs and compute SHA-256 values from the exact output bytes.
5. Recompute the three helper/test SHA-256 values and freeze the 18-item manifest and tarball only after all dynamic tests pass.
6. Complete the second independent technical review. Only then return to Yi for first-layer package signature.

## Authorization boundary

- No BWH connection, file transfer, production DB read, production snapshot, or formal Gate was performed by these commits.
- No CI workflow was triggered. The branch remains Draft.
- M0 remains `BLOCKED`; first-layer signature and the separate one-time second-layer Gate authorization remain ungranted.
