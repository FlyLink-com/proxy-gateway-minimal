# M0 Identity Gate v2.4 — Y-3 / Y-4 Decision Addendum

- Date: 2026-11-03 (PST)
- Status: Draft / REVIEW_PENDING / NOT SIGNABLE
- Branch: `feat/m0-identity-gate-v2-4-audit-remediation-20261103`
- Base helper head before this ruling implementation: `9a90c22f4d3db2a10683b0682f2797d117eafbd5`
- This addendum records the formal Y-3 and Y-4 rulings. It does not authorize BWH access, production reads, snapshots, or the formal Identity Gate.

## Formal decisions

### Y-3 — schema identity: option A

Remove `schemaVersion` from census JSON output, live/snapshot field comparison, and the identity-stability fingerprint. Use `schemaDigest` as the sole schema identity fingerprint.

Reason: the fourth-round fixture observed live `schemaVersion=2` and snapshot `schemaVersion=1`, while `schemaDigest` and every other census field were equal. SQLite `schema_version` is a DDL change counter, not schema-content identity. The fixture may inspect raw `PRAGMA schema_version` only to prove the cookie divergence; it must not emit that value in census JSON or identity fingerprints.

### Y-4 — sidecar/SHM contract: option A

Revise the execution contract to v2.4. The helpers must implement the path checks and source-integrity assertions below; the R6 helper version is historical evidence, not the final signable implementation:

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

### Audit remediation candidate (Draft; not dynamically revalidated)

- Branch: `feat/m0-identity-gate-v2-4-audit-remediation-20261103`
- Helper/test source commit: `e50401516bebd9093a9a3b4cf60b358e649887f9`
- Census Git blob SHA-1: `b42bd54674d456fa32df7146f376a983cc393e73`
- Snapshot Git blob SHA-1: `f96127476ce842310d394ab9c39a5d75ae5e5034`
- Fixture test Git blob SHA-1: `61f733f75163e01ec95bcb404d30f7b9be9f3b65`
- Changes: main DB path is lstat-checked before SQLite open, immediately after open, after census/Backup, and after close; fixture records DB/WAL size, mtimeNs and SHA-256 before/after each helper call; main DB symlink and non-regular path rejection cases are added.
- Candidate is Draft only. Three file SHA-256 values, fixed-stack dynamic test outputs, new manifest/tarball, and second independent review remain pending.

Full execution package: `docs/m0-approval-3-formal-identity-gate-package-v2.4-draft-2026-11-03.md`.

Files changed:
- `scripts/m0-gate-census.mjs`
- `scripts/m0-gate-snapshot.mjs`
- `server/tests/m0-gate-helper-fixture.test.mjs`

The new fixture asserts that live and snapshot SQLite schema cookies differ, that neither census output contains `schemaVersion`, and that `schemaDigest` and all remaining census fields match.

## Required before first-layer review

1. Review the current Draft helper source changes and the fixture assertions; verify main DB lstat checks around the SQLite lifecycle and DB/WAL size/mtimeNs/SHA-256 stability coverage.
2. Run `node --check` on all three files and the complete fixture suite on the fixed stack: Node `v22.23.1`, better-sqlite3 `12.10.0`, SQLite `3.53.1`. Current authorization does not permit BWH access, CI, or dependency installation, so this remains pending until a permitted fixed-stack environment is available.
3. Capture three new raw outputs from the current remediation commit; do not reuse R6 outputs as evidence for the changed source.
4. Preserve the R6 18-item manifest/tarball as historical. Recompute current helper/test SHA-256 and create a new 18-item manifest/tarball only after the current dynamic suite passes.
5. Complete independent review of the current source, package section references, runner harness binding/cleanup evidence, and new archive. Only then return to Yi for first-layer package signature.

## Authorization boundary

- Authorized for this round: edits to the two helpers, fixture test, and v2.4 Draft execution/decision documents on the GitHub Draft branch only.
- Not authorized: CI/workflows, BWH connection or production DB access, production snapshot, formal Gate, merge, Ready transition, deployment, or changes to services/configuration/Timer/Collector/retention.
- No BWH connection, file transfer, production DB read, production snapshot, or formal Gate was performed by the current remediation commits.
- No CI workflow was triggered. The branch remains Draft.
- M0 remains `BLOCKED`; first-layer signature and the separate one-time second-layer Gate authorization remain ungranted.
