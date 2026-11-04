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

### R8 selected signing candidate — dynamic acceptance and frozen evidence

- Selected line: R8, explicitly confirmed by Yi on 2026-11-03 PST as the sole formal signing candidate. R6 remains a read-only historical freeze; it is not deleted, overwritten, or treated as the current candidate.
- Branch: feat/m0-identity-gate-v2-4-audit-remediation-20261103.
- R8 HEAD: 9b4bff888e6eb7b4c4545b1f005a32e24855ab9e; relative to 5ecee088c8a2d926ede05d24f860f20797f4dd48, ahead 1 / behind 0; the sole commit changes only server/tests/m0-gate-helper-fixture.test.mjs (+57 / -2). The two helpers are unchanged from R7.
- Helper/Test SHA-256:
  - Census: 3351443a84f7ff0b99ddde73bb8defc28a6fc3226935a1719ef216e4a5d7056c
  - Snapshot: fb3ea4a3bcb91f878e39b30a2c45be1ec78003c10aa710cef3270e8d8a5010f0
  - Fixture test: 12c8dd1722fe6ef129f7a6177a76d4e80a087ab1dd4f24ea302aab402f1f9e8c
- Fixed-stack R8 dynamic results: helper fixture PASS (exit 0, 1/1); original WAL runner PASS (ok=true, failures=[]); direct census PASS with no schemaVersion field and both equality flags true. Runtime stack: Node v22.23.1 / better-sqlite3 12.10.0 / SQLite 3.53.1.
- R8 raw output SHA-256: helper-test a4d910d8d69acaee1bcbd8cadea1decc9c1c286eaced6bf16e6163df4d240a16; WAL runner 938545287c4c52a15e782f2c148b15326a9936584b8f911669990b4129a70254; census ddaef37761f35af06b4f5a3dda84b5dd8b69521bdb53a403eb0b088293e27921. The census raw output includes the VM's Node UNDICI proxy warning; that warning is not part of the helper JSON.
- R8 18-item manifest/tarball: m0-identity-gate-v2-4r-bundle-20261103.tar.gz, 50,190 bytes, SHA-256 6de61f665174106fc6a22fa45e011b14b084094380a8445239c1cbba10873a22; sha256sum -c 18/18 and independent extraction review 18/18 PASS. The 18-item manifest contains the R3 historical raw outputs; the three R8 raw outputs above are separate supplementary evidence, not manifest payloads.
- R6 historical archive remains unchanged: 48,570 bytes, SHA-256 a5600dbab180167a8bd6f27474bf491637c37044014f36b0c806cc3e60ba6da7.

### R5–R8 execution and BWH access disclosure

- R5: BWH fixed stack, isolated synthetic $WORK only; WAL runner and direct census PASS; helper fixture failed because the cookie probe opened the snapshot itself and left a sidecar. No production DB read or formal Gate.
- R6: BWH fixed stack, isolated synthetic $WORK only; helper fixture, WAL runner and census all PASS; R6 archive frozen. No production DB read or formal Gate.
- R7: isolated VM helper fixture failed because snapshot census created an absent→0-byte WAL while the main DB fingerprint stayed unchanged. During root-cause reproduction, one synthetic fixture was also run in a dedicated BWH fixture directory; this BWH access was disclosed in the R7 receipt, and the directory was deleted and verified absent. No production DB read or formal Gate.
- R8: isolated VM only; no BWH connection. The first stage copy contained residue from a prior runner work directory and exited 2 before running the tests; after cleaning to a pristine stage, the full run passed. This corrected first attempt is disclosed, not hidden.

### R8 Snapshot sidecar contract clarification

R8 proved that a Backup API snapshot has no -wal/-shm sidecars immediately after creation, but a subsequent normal read-only snapshot census may create an absent→0-byte regular WAL and a transient regular SHM while leaving the snapshot main DB bytes/mtime/SHA-256 unchanged. The execution package must therefore scope the “no sidecar” check to the instant after Backup API completion and before the first census. After census, only an absent or 0-byte regular WAL and an absent or regular non-symlink SHM are allowed. This local $WORK snapshot exception does not apply to the production Source DB/WAL: production main DB/WAL presence and fingerprints remain unchanged, and the production exception is limited to transient regular SHM coordination.

## Required before first-layer review

1. Complete the v2.4 execution-package and this addendum's Snapshot sidecar contract alignment (§6.4.2 / §7 / §9.4); do not modify either helper or checker.
2. Re-read both revised documents and run document-only static checks; calculate and record their new SHA-256 values after the final byte-level content is fixed.
3. Preserve the R8 18-item manifest/tarball and its three separately hashed raw outputs unchanged. Preserve the R6 18-item manifest/tarball as historical evidence.
4. Keep the R8 runner harness version/hash and exact post-run realpath/cleanup record as an explicit open evidence item unless a source receipt supplies it; do not infer it from R6/R7 cleanup records.
5. Only after the above document checks are complete, return the fixed package and its external SHA-256 to Yi for the first-layer execution-package signature. First-layer signature does not authorize BWH access or the formal Gate.


## Authorization boundary

- R8 was dynamically tested only in an isolated VM. R5/R6 used the BWH fixed stack only for isolated synthetic fixtures; R7 included one disclosed BWH synthetic-fixture reproduction. No round performed a production DB read, production snapshot, or formal Identity Gate.
- Current user-confirmed scope: update only the v2.4 execution package and this decision addendum on the existing GitHub Draft branch to align the R8 Snapshot sidecar contract and signing-line evidence.
- Not authorized: Helper/Checker changes, CI/workflows, BWH connection or production DB access, production snapshot, formal Gate, merge, Ready transition, deployment, service/configuration/Timer/Collector/retention changes, or JP-01 instance creation/traffic.
- No CI workflow was triggered in this document-only update. The branch remains Draft.
- M0 remains BLOCKED; first-layer signature and the separate one-time second-layer Gate authorization remain ungranted.


