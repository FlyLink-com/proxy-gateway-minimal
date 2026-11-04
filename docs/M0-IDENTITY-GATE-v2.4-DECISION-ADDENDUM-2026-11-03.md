# M0 Identity Gate v2.4 — Y-3 / Y-4 Decision Addendum

- Date: 2026-11-03 (PST)
- Status: Draft / FIRST_LAYER_SIGNED / SECOND_LAYER_AUTH_ACTIVE / FORMAL_GATE_NOT_EXECUTED
- Branch: `feat/m0-identity-gate-v2-4-audit-remediation-20261103`
- Base helper head before this ruling implementation: `9a90c22f4d3db2a10683b0682f2797d117eafbd5`
- This addendum records the formal Y-3 and Y-4 rulings. The first-layer signature is limited to contract confirmation; the separate one-time second-layer authorization is active only for 2026-11-04T01:11:56-08:00 through 2026-11-05T01:11:56-08:00 (PST), bound to the final v2.4 execution-package SHA-256 in the external approval receipt and the fixed host/path/scope below.

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

### R8 runner harness evidence supplement — 2026-11-04

- Supplement receipt: [R8 runner harness evidence supplement](https://drive.google.com/file/d/1MLBuc8G-0PZ0ydNeBLcMdBTYCvWbhbFz/view?usp=drivesdk). It records the original R8 runner realpath as `/home/hatch/m0-gate-fixture-stage-vm-r2/fixtures/wal-fixture-rerun.mjs` and SHA-256 `096ca7e2d7a143e3b454f6153b0e22d1641d65de4e5217fb17a17d83bbf4e112`. The separately available runner and the copy in the R8 frozen tarball are byte-identical (10,355 bytes); the supplementary run log records the same hash.
- Original R8 VM stage `m0-gate-fixture-stage-vm-r2` was retained as an audit artifact. Its as-left runner workdir realpath is `/home/hatch/m0-gate-fixture-stage-vm-r2/fixtures/wal-rerun-work`; it was not deleted after the original R8 run. This is recorded as retained state, not misrepresented as a successful cleanup.
- On 2026-11-04, the same runner hash was run in a new pristine stage `m0-gate-fixture-stage-vm-r3`. The raw log records the pre-run fixtures listing and absent workdir, runner exit 0 / `ok=true` / `failures=[]`, runtime Node v22.23.1 / better-sqlite3 12.10.0 / SQLite 3.53.1, post-run workdir inventory, deletion of the workdir and its absence check, followed by deletion and absence check of the supplement stage.
- Raw log: [r8-runner-harness-evidence-log-2026-11-04.txt](https://drive.google.com/file/d/16-KzUPW44p6ANtExXj8iKECKm0A3GnKs/view?usp=drivesdk), SHA-256 `d1db5ee725461c027eefd14c41e6facc6ed2e2f9b469cd7e5ac69a3f70deefe1`. Raw runner output: [r8-runner-supplement-output-2026-11-04.txt](https://drive.google.com/file/d/1IPD7TT8m2v7_E4GYmgx8A6J9oarvdS00/view?usp=drivesdk), SHA-256 `2b07d1dfc8ab1acc5d2537dca0f3e7c141ecbec18b4e3fdd7af9ccc35c9df373`. Both raw contents were re-fetched and their hashes independently recomputed; both match the receipt.
- The log discloses a separate version probe run from `$HOME` that failed with MODULE_NOT_FOUND because `better-sqlite3` was not resolvable there. This was not the runner execution; runtime versions are taken from the runner's own output and the prior fixed-stack verification. Preserve this disclosure.
- The supplement does not modify or rebuild the R8 18-item manifest/tarball and does not replace the original R8 outputs. The r3 cleanup demonstration is separate supplementary evidence; it is not the cleanup history of the retained r2 stage.

### R5–R8 execution and BWH access disclosure

- R5: BWH fixed stack, isolated synthetic $WORK only; WAL runner and direct census PASS; helper fixture failed because the cookie probe opened the snapshot itself and left a sidecar. No production DB read or formal Gate.
- R6: BWH fixed stack, isolated synthetic $WORK only; helper fixture, WAL runner and census all PASS; R6 archive frozen. No production DB read or formal Gate.
- R7: isolated VM helper fixture failed because snapshot census created an absent→0-byte WAL while the main DB fingerprint stayed unchanged. During root-cause reproduction, one synthetic fixture was also run in a dedicated BWH fixture directory; this BWH access was disclosed in the R7 receipt, and the directory was deleted and verified absent. No production DB read or formal Gate.
- R8: isolated VM only; no BWH connection. The first stage copy contained residue from a prior runner work directory and exited 2 before running the tests; after cleaning to a pristine stage, the full run passed. This corrected first attempt is disclosed, not hidden.

### R8 Snapshot sidecar contract clarification

R8 proved that a Backup API snapshot has no -wal/-shm sidecars immediately after creation, but a subsequent normal read-only snapshot census may create an absent→0-byte regular WAL and a transient regular SHM while leaving the snapshot main DB bytes/mtime/SHA-256 unchanged. The execution package must therefore scope the “no sidecar” check to the instant after Backup API completion and before the first census. After census, only an absent or 0-byte regular WAL and an absent or regular non-symlink SHM are allowed. This local $WORK snapshot exception does not apply to the production Source DB/WAL: production main DB/WAL presence and fingerprints remain unchanged, and the production exception is limited to transient regular SHM coordination.

## Post-signature status and remaining authorization fields

1. Snapshot census 后 sidecar 合同已在 v2.4 执行包 §6.4.2 / §7 / §9.4 与本附录之间完成对齐；Helper/Checker 未修改。
2. 2026-11-04 完整文档静态复核已完成：执行包 15 个 Bash fenced blocks `bash -n` 15/15 PASS；58 个 exit 使用点为 58 个唯一值；§6.4 已显式初始化 DB 路径，并澄清 SHA-256 计算读取字节但不输出/持久化原始内容。两份文档的当前 SHA-256 由 Notion/审批回执外部锚定，不在任一文件内互相嵌入，以避免自引用/互引用循环。
3. Preserve the R8 18-item manifest/tarball and its three separately hashed raw outputs unchanged. Preserve the R6 18-item manifest/tarball as historical evidence.
4. The R8 runner evidence supplement is now available and independently hash-verified: runner identity/hash and original r2 realpaths/as-left state are recorded; the same runner was instrumented in a pristine r3 stage with pre-run listing, successful output, post-run inventory, workdir cleanup/absence, and supplement-stage cleanup/absence. Preserve the distinction that r2 remains retained and was not cleaned; r3 is a separate controlled supplement run. Do not infer r2 cleanup from r3.
5. Yi completed the first-layer v2.4 execution-package signature on 2026-11-04. The signature confirms the execution contract only and does not authorize BWH access or the formal Gate. Yi separately authorized the one-time second-layer formal Gate execution for 2026-11-04T01:11:56-08:00 through 2026-11-05T01:11:56-08:00 (PST); the exact final package SHA-256 is bound in the external approval receipt. The formal Gate has not yet been executed.


## Authorization boundary

- R8 was dynamically tested only in an isolated VM. R5/R6 used the BWH fixed stack only for isolated synthetic fixtures; R7 included one disclosed BWH synthetic-fixture reproduction. No round performed a production DB read, production snapshot, or formal Identity Gate.
- 2026-11-04 approval update: Yi has completed the first-layer v2.4 execution-package signature and activated a separate one-time second-layer formal Gate authorization for 2026-11-04T01:11:56-08:00 through 2026-11-05T01:11:56-08:00 (PST), bound to the final package SHA-256 in the external approval receipt.
- Authorized only during the stated 24-hour window and only within the exact package scope: BWH connection, production DB read-only access, production snapshot, and one formal Identity Gate run. Still not authorized: Helper/Checker changes, CI/workflows, production DB/WAL writes, merge, Ready transition, deployment, service/configuration/Timer/Collector/retention changes, JP-01 instance creation/traffic, or any rerun.
- The 2026-11-04 review and corrections were document-only; no CI workflow was triggered. The branch remains Draft.
- M0 remains BLOCKED; first-layer signature completed 2026-11-04; second-layer one-time authorization is active for the stated 24-hour window; formal Gate has not yet been executed.


