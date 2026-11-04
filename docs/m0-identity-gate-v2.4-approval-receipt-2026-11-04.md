# JP-01 M0 · Identity Gate v2.4 approval receipt

- Date: 2026-11-04 (PST)
- Repository: `FlyLink-com/proxy-gateway-minimal`
- Documentation branch: `feat/m0-identity-gate-v2-4-audit-remediation-20261103`
- R8 helper/test candidate commit: `9b4bff888e6eb7b4c4545b1f005a32e24855ab9e`
- Documentation HEAD immediately before this receipt: `acea5ffc9758755057b6e89a780c275310f4cbef`

## 1. Immutable document anchors

The following values are SHA-256 of the exact UTF-8 file contents fetched back from GitHub after the signature and status updates:

| Artifact | SHA-256 |
| --- | --- |
| v2.4 execution package | `2bac9fd2d196802218f1b9bf09be3dd21a59bbf75ace1970abf39176d4b31610` |
| Y-3 / Y-4 decision addendum | `6d2c71ea35da6faebb960a55688abbf18982dcccb2768f13ff5d2d0b6bf610a0` |
| R8 frozen 18-item tarball | `6de61f665174106fc6a22fa45e011b14b084094380a8445239c1cbba10873a22` |

The R6 historical freeze remains separate and unchanged.

## 2. First-layer execution-package signature

- Signer: Yi
- Date: 2026-11-04 (PST)
- Decision: **SIGNED**
- Effect: confirms the v2.4 execution contract, the selected R8 line, and the frozen scope only.
- Limitation: this first-layer signature does not by itself authorize BWH connection, file transfer, production-path reads, production snapshots, or formal Identity Gate execution.

The signature is recorded in §10.1 of the v2.4 execution package. The package and addendum were updated on the existing Draft branch only. No Helper/Checker source was changed.

## 3. Second-layer one-time formal Gate authorization

- Decision-maker: Yi
- Consent: **EXPLICITLY GIVEN on 2026-11-04**
- Execution status: **NOT YET EFFECTIVE — exact authorization time window is still required**
- Execution package SHA-256 binding: `2bac9fd2d196802218f1b9bf09be3dd21a59bbf75ace1970abf39176d4b31610`
- Target host: `elegant-box-1.localdomain` (any mismatch means stop)
- Sole permitted work directory: `/opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2`
- Permitted transport: Tailscale `ssh bwh` / `scp bwh:` only, for bundle transfer and retrieval of sanitized outputs.
- Permitted operation scope, once the time window is completed:
  - root identity and SSH alias/identity-file verification;
  - create and use only the exact `$WORK` directory above;
  - §6 read-only environment/input preflight and synthetic helper fixture;
  - §7 snapshot A/B, live/snapshot census, the three-surface file-state Gate, four timestamp captures, 30-minute monitoring, and final cleanup;
  - only the transient SQLite SHM coordination side effect expressly permitted by §9.4.
- Maximum executions: **one**. Execution or stop exhausts this authorization; any rerun requires a new authorization.
- Executor: Muse.
- Authorization validity window: **PENDING — Yi must specify exact start and end in PST.**
- Formal authorization record: **consented, but not executable until the validity window is filled here and independently checked against the package SHA-256 above.**

No BWH connection, production DB read, production snapshot, or formal Gate command may begin before the time window is recorded. Missing or mismatched fields, host drift, package hash drift, expiry, or scope expansion require an immediate stop.

## 4. Explicit exclusions

This approval does not authorize:
- production DB/WAL writes or changes to configuration;
- service, Timer, Collector, projection-writer, or retention operations;
- JP-01 instance creation or real traffic;
- Helper/Checker changes, CI/workflow execution, PR Ready transition, merge, or deployment;
- any network path other than the specified Tailscale SSH/SCP transport.

## 5. Current outcome

- R8 offline evidence and runner-harness supplement: PASS.
- First-layer v2.4 signature: SIGNED.
- Second-layer authorization: user consent recorded; effective window pending.
- Formal Identity Gate: NOT EXECUTED.
- M0 Production Identity Gate: **BLOCKED**.
- Production release: **NOT AUTHORIZED**.

The R8 original r2 stage remains retained as an audit artifact; the separate r3 supplement run demonstrated cleanup of its own workdir and stage. The two are not conflated.

This receipt does not assert that any BWH or production operation has occurred.
