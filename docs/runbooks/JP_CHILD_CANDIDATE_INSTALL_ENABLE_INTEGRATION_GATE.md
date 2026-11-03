# JP-01 候选安装、启用与接入 Gate 包

Last updated: 2026-11-03 UTC.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: jp01_candidate_install_enable_integration
  superseded_by: null
  last_verified_at: 2026-11-03
  production_authority: false
```

## 1. 当前阶段

**阶段：Candidate Install / Enable / Integration — PREPARATION OPEN。**

本 Gate 包把候选镜像、候选安装、WireGuard、Agent、BWH 注册、Receipt 和 Canary 分开。阶段开启只允许准备材料和执行各自获批的 Gate，不代表已经创建实例、构建镜像、启用隧道或接入生产。

固定目标：

- Control plane：BWH。
- Data plane candidate：Vultr Japan。
- Node ref：`node-vultr-jp-01`。
- Channel refs：
  - `channel-vultr-jp-01-vless-reality-tcp`
  - `channel-vultr-jp-01-hy2`
  - `channel-vultr-jp-01-tuic`
- 初始池与生命周期：`pool=private`、`lifecycle=private-validation`。
- 普通用户订阅和全量流量切换：明确禁止，直到独立 M8 晋升审批。

当前状态：

| 项目 | 状态 |
| --- | --- |
| E1 源码步骤 5–8 | 已合并：PR #822 / eb83197e |
| JP-01 三面 Identity Gate 源码 | 已合并 |
| WireGuard 计划字段与 readiness gate | 已合并 |
| C0 候选无密钥基础镜像 | **PASS**：Candidate #1 已构建、扫描、测量并交付 |
| 通用镜像可移植性审计 | **CLOSED**：Phase 1 / Phase 2 均完成，可供 JP/US/SG 复用 |
| M0 BWH 生产前置条件 | **BLOCKED**：运行时 Agent allowlist 与正式 Identity Gate before/after 两项证据未闭合 |
| T2 R2 sidecar / object metadata 验证 | 未执行托管验证；PR #824 Draft |
| T3 全量镜像下载及 SHA-256 | 未执行托管验证；PR #824 Draft |
| Vultr API preflight | 未执行；PR #825 Draft |
| JP 候选 Vultr 实例 | 未创建 |
| WireGuard 实际隧道 | 未建立/未验收 |
| Agent 私有接入 | 未执行 |
| BWH 生产注册 | 未执行 |
| Desired State / applied Receipt | 未执行 |
| Canary | 未开始 |

## 2. Gate 依赖顺序

```text
C0a  Approved BOM + isolated build inputs [PASS]
  ↓
C0b  Candidate #1 no-secret base image + six As-Run measurements [PASS]
  ↓
E4-A-4  Contract freeze (E1-A v1.2 separate confirmation; E4-A v0.13 freeze still pending)
  ↓
M0    BWH live preconditions closed
  ↓
C1    Vultr JP candidate instance / image installation
  ↓
C2    WireGuard private tunnel
  ↓
C3    Agent private-path integration
  ↓
C4    E1-A V2 registration and binding
  ↓
C5    Desired State / apply / Receipt / Identity Gate / metering proof
  ↓
C6    3–7 day controlled client Canary
  ↓
M8    Separate production handoff and subscription promotion decision
```

Do not skip or reorder gates because a previous source-level helper exists.

## 3. C0a — BOM and isolated build input lock

**Current status: BLOCKED — approved BOM source reference and digest have not been located in the current repository or supplied working files.**

PR #822 and the E1-A/E4-A working drafts refer to an approved/locked BOM, but the candidate build gate must bind the exact BOM original, not merely repeat that statement.

Before build, record all of the following:

| Required input | Required evidence | Current state |
| --- | --- | --- |
| Approved BOM original | Exact file/reference and owner approval record | Not located in current repository search |
| BOM digest | SHA-256 of the exact original bytes | Not recorded in this Gate |
| Base OS image | Exact distro/version/image ref and source digest | Not pinned here |
| Architecture | Exact target platform; E4-A v0.12 specifies `linux/amd64` | Contract draft says linux/amd64 |
| Runtime versions | Exact pinned Node/runtime, Xray, Hysteria2, Mihomo/TUIC and WireGuard tools | Must be copied from approved BOM, not guessed |
| Package sources | Immutable source refs and checksum/signature verification policy | Not pinned here |
| Source | Exact protected-master commit used for the candidate release skeleton | Must be selected at build time |
| Build recipe | Reproducible steps, builder OS/tool versions, network policy | No JP-01 build automation/recipe currently surfaced |
| Output | Candidate artifact path/ref and SHA-256 | Not produced |
| Rollback | Discard candidate artifact and builder state; no production rollback needed | To be recorded in exact build Gate |

**Stop condition:** any missing BOM original/digest, unpinned runtime/tool version, mutable/unverifiable package source, or unreviewed build recipe means no build.

## 4. C0b — Local isolated no-secret base image build and E4-A measurements

<badge color="success">C0b PASS — 2026-11-02</badge>

Candidate #1 was built from the approved BOM in an isolated temporary builder, scanned, measured, boot-tested with QEMU, transferred to lucky, and the temporary builder resources were destroyed. This is a base-image delivery only: it does not install the JP production Agent, create a JP instance, connect BWH, or authorize C1–C6.

### Artifact identity

- Compressed artifact: jp01-candidate-1.img.zst
- Size: 2,269,994,633 bytes
- SHA-256: 693d9f5afdfbc440870ecb7ec84bee8cc2af644574496f564f2c92ab59946442
- Raw image SHA-256: 752f2e2358129d606f15467433fdf4aed1bd5fb18220136ea8e8e5de8ce2d883
- Source baseline: eb83197e47155943087655ff7d4aad7a6c954849
- BOM: approved original SHA-256 4bb1ef0f3cc993db77de2971ca512ff0b796d25fb7da18c88df758c75e45fde9; all five pinned payload hashes matched on the builder.
- Evidence archive on lucky: D:\JP-C0-20261102\evidence\

### Six As-Run measurements — completed

| Item | Actual result |
| --- | --- |
| Full installed-file inventory | 52,500 entries; manifest SHA-256 d7e9ad1387329fc47c619c9d0a5c00572b425efd2f35190e8fed2f5d9ea1f574 |
| Regular files in install domain | 40,603 |
| Longest path, characters | 185 |
| Longest path, bytes | 185 |
| Canonical As-Run JSON sample | 1,910 bytes; SHA-256 12dedc1ecb3c170beb4b0bdfbbeb7432e29f0ef53947675a448d447227a65d7a |
| Freeze basis | Use measured installedFiles=40,603 and longest path=185 to set final E4-A installedFiles / maxBytes bounds |

The six measurements are real image-derived evidence, not estimates. They do **not** freeze the E4-A thresholds by themselves; the values must be incorporated into the separately reviewed E4-A v0.13 freeze revision.

### Image validation and security

- No production private keys, SSH host keys, authorized_keys, real .env values, Agent token, WireGuard material, business database, or production protocol credentials were found in the image.
- SSH service and socket are disabled; no Xray/Hysteria2/Mihomo/Agent runtime units are installed or started in this base image.
- machine-id is empty and root password is locked; per-node identities must be generated at provisioning.
- QEMU TCG boot reached systemd targets. The 420-second emulation did not observe console login or cloud-init completion; that is not a C1 first-boot proof.
- Clean build #2 had the same 52,500-entry file set, 40,603 regular files and 185-character/byte longest path. Content matched byte-for-byte for 52,498/52,500 files; the two generated-file differences were identified. Whole-disk bit-for-bit reproducibility is not claimed.
- Universal image portability Phase 1 and Phase 2 audits are complete. Candidate #1 is accepted as the common FlyLink child-node base image; only /etc/hostname is rewritten per node. Filesystem label jp01root remains a shared label and must stay aligned with /etc/fstab if ever changed.

### E4-A v0.13 freeze remains open

PR #826 D1 records E1-A v1.2 / E4-A v0.13 as the current working baseline. E4-A v0.13 is not frozen. Remaining requirements:

1. Separate owner confirmation of E4-A v0.13.
2. Carry the actual C0 measurements above into the freeze draft and explicitly freeze installedFiles / maxBytes.
3. Separate confirmation of E1-A v1.2.
4. Complete the formal error-code table and the required P6, P10, P11, P12, P13 vectors plus P7 cumulative-revocation / fingerprint-revocation / authorization-third-anchor rollback tests.

## 5. M0 — BWH production precondition gate

M0 remains **BLOCKED** on exactly two recorded items:

1. The running Agent process's effective allowlist value and boundary have not been verified at runtime. The source fallback to loopback is not a substitute for runtime evidence.
2. A current formal Identity Gate result, with the required same-boundary before/after evidence, has not been produced. Historical `degraded` state and PR #812's read-only diagnostic are not a pass.

The as-run manifest and SHA-256 already bind the historical running tree under the 2026-11-01 ruling; source-commit identity is not claimed and is not a new blocker. Do not reopen the architecture decision or re-label this as an undecided topology.

C1–C5 production operations remain blocked until M0 is passed with current evidence and the exact Risk A scope is approved.

## 6. C1–C3 — Install, WireGuard, Agent

Each is a separate Risk A Gate. No single “candidate stage” approval implicitly authorizes all three.

### C1 — Vultr candidate installation

Required exact inputs:

- target provider account and Japan region;
- instance size/plan, image ref/digest, nodeRef, role and lifecycle;
- budget/cost cap and owner;
- firewall attachment and public-boundary plan;
- management access method and allowed source boundary;
- rollback/destroy plan;
- validation steps and evidence destination.

Allowed scope after exact approval: create one new candidate instance from the reviewed no-secret image, verify its identity and OS, and record redacted inventory. Do not reuse the retired prior JP instance.

### C2 — WireGuard enablement

Required exact inputs:

- reviewed WireGuard plan ref;
- BWH and JP peer identities;
- approved private address plan and route scope;
- public-key exchange procedure;
- allowed UDP ingress/source boundary;
- key-generation location and protected storage;
- handshake, route, restart and rollback tests.

Generate private keys on their intended hosts. Exchange public keys only. Do not store private keys in Git, chat, image artifacts, screenshots or logs.

### C3 — Agent private-path integration

Required exact inputs:

- exact BWH Agent release/runtime identity;
- verified effective `EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS` boundary;
- private endpoint/route reference;
- candidate node identity and Agent auth key/digest references;
- health, authentication, dry-run and failure tests;
- rollback/disable path.

Keep the Agent unavailable on public routes. The registration execution flag remains default-off until its own exact approval; setting the flag is not itself approval.

## 7. C4 — E1-A V2 registration gate

合同基线：PR #826 D1 当前记录 E1-A v1.2；PR #823 中的 v1.1 文件是旧工作稿快照。v1.2 必须单独确认并完成源码实施、审查与验收后，C4 才能进入生产 Gate。

C4 is blocked until all of the following are true:

1. E1-A v1.1 receives separate explicit owner confirmation.
2. The v1.1 source implementation is completed, reviewed, independently approved and tested.
3. The executor has a controlled, reviewed caller; the current CLI registration command remains dry-run-only and no production caller is present.
4. The first-boot packet, candidate identity and image manifest agree on node/provider/region/role/channel refs/release/image/WireGuard plan.
5. The third anchor and PoP evidence are generated and verified according to the accepted contract.
6. The exact registration Gate specifies one candidate node and the allowed write scope.

Do not use current E1 v1 two-anchor registration as a substitute for V2 As-Run identity. Do not directly register JP-01 through the ingestion path; the current source intentionally rejects that path.

## 8. C5–C6 — Receipt, identity, metering and Canary

C5 must prove, with redacted evidence:

- node-scoped Desired State was generated for the reviewed candidate;
- protected material was fetched only by approved key/digest refs;
- dry-run passed before apply;
- runtime config tests passed before service start/restart;
- applied Receipt matches node/channel/generation/material digest;
- formal Identity Gate passes for JP-01's three surfaces;
- metering reads the intended JP channels and does not cross-read SGP;
- renderer withholds the node unless all required fresh receipts and expiry/disable gates pass.

C6 is a 3–7 day controlled client Canary. It requires a separate exact approval, test-account scope, rollback trigger, monitoring/measurement plan and explicit end criteria. The candidate remains private-validation and is not added to ordinary subscriptions during the Canary unless the exact approval explicitly authorizes a receipt-gated test output.

M8 production handoff and ordinary subscription promotion are separate decisions after C6 evidence review.

## 9. Exact approval templates

### C0b — local isolated build only

```text
批准 JP-01 本地隔离候选镜像构建与离线测量：
bom_ref=<exact approved BOM original>;
bom_sha256=<sha256 of exact BOM bytes>;
base_os_image_ref=<exact base image and digest>;
source_commit=<exact protected-master commit>;
builder=<isolated builder identity and toolchain>;
target_platform=linux/amd64;
runtime_versions=<exact BOM-pinned versions>;
build_recipe=<reviewed recipe ref>;
scope=local isolated no-secret image build; disabled service units; safe readiness helpers; no-secret scan; generate actual installed-file inventory and canonical As-Run measurement only;
validation=artifact sha256; reproducible recipe; pinned package evidence; no-secret scan; WireGuard tools pinned in manifest; services disabled; six E4-A measurements recorded;
rollback=discard candidate image/artifact and isolated builder state; no production state touched;
forbidden=BWH,Vultr,provider API,production network,production keys,Agent tokens,protocol credentials,customer data,subscription URLs,SQLite,production env,CI,PR,release signing,service enablement,traffic.
```

This template is incomplete until every placeholder is filled. Approval must identify the exact artifact, source, BOM and scope; a generic “同意” is not enough.

### C1–C3 — candidate install/enablement

A separate exact Risk A approval must state the precise provider target, region, node, image digest, network plan, Agent boundary, credentials source, allowed mutations, validation, rollback and forbidden operations. C1, C2 and C3 must not be bundled by implication.

### C4–C6 — BWH integration and Canary

A separate exact Risk A approval must state the exact first-boot packet, registration mode, E1-A V2 implementation/contract version, protected material refs, channel refs, apply scope, Receipt proof, Identity Gate, metering checks, Canary account scope, duration, success criteria and rollback.

## 10. Current next action

**Do not create an instance or enable a tunnel yet.**

The next actionable item is to supply or locate the exact approved JP-01 BOM original and its SHA-256, then complete the C0b local-build Gate with the base OS and all pinned runtime/tool versions. Once those facts are attached, the build Gate can be reviewed for explicit approval.

