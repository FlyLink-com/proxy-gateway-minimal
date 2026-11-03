# JP-01 候选安装、启用与接入 Gate 包

Last updated: 2026-11-02 UTC.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: jp01_candidate_install_enable_integration
  superseded_by: null
  last_verified_at: 2026-11-02
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
| E1 源码步骤 5–8 | 已合并：PR #822 / `eb83197e` |
| JP-01 三面 Identity Gate 源码 | 已合并 |
| WireGuard 计划字段与 readiness gate | 已合并 |
| 可复现 JP 镜像 | 不存在 |
| JP 候选 Vultr 实例 | 未创建 |
| WireGuard 实际隧道 | 未建立/未验收 |
| Agent 私有接入 | 未执行 |
| BWH 生产注册 | 未执行 |
| Desired State / applied Receipt | 未执行 |
| Canary | 未开始 |

## 2. Gate 依赖顺序

```text
C0a  Approved BOM + isolated build inputs
  ↓
C0b  Local reproducible no-secret image + six As-Run measurements
  ↓
E4-A-4  Schema freeze (E1-A v1.1 separate confirmation included)
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

## 4. C0b — Local isolated no-secret image build and E4-A measurements

This is a local/offline candidate build for reproducibility and size measurement. It is not provider image promotion and not a production release.

### Allowed scope after a separate exact build approval

- Build only in a dedicated isolated builder.
- Use the exact approved BOM and protected-master source commit.
- Install the approved base OS packages, runtime binaries, WireGuard tools and edge-agent skeleton.
- Keep all service units disabled/inactive.
- Include only non-secret templates, health/config-test helpers, and no-secret manifests.
- Run image readiness and no-secret scans with synthetic safe inputs.
- Generate the actual installed-file inventory and canonical As-Run sample.
- Record redacted build logs, checksums, tool versions and measurements.

### Forbidden

- No BWH or Vultr connection.
- No provider API, instance creation, image upload/promotion, firewall, DNS or public network mutation.
- No production secrets, private keys, Agent tokens, protocol credentials, customer data, subscription URLs, SQLite databases or production env.
- No creation of production signing keys or PoP challenges.
- No enabling service units or opening customer-facing listeners.
- No hosted CI, PR, or release-signing action as part of this local measurement Gate.
- No copy of protected material into the image, source tree, build logs or artifact metadata.

### Image contents

The JP candidate image may contain only the approved OS hardening, pinned runtime binaries, disabled service units, edge-agent software, WireGuard tools, non-secret templates, config-test/health/receipt helpers and a manifest that records exact source/package versions and digests.

The manifest must explicitly record the WireGuard tool versions/pins required by the PR #822 readiness contract. Do not add Nginx/public Admin or other services merely because a generic image template lists them; any additional package requires a JP-specific BOM entry and review.

### E4-A v0.12 six required measurements

All six must be produced from the actual reproducible JP candidate image, not estimates or hand-written fixtures. The current contract is [E4-A v0.12](../drafts/E4-A_RELEASE_IDENTITY_V2_SCHEMA_v0.12_2026-11-02.md); it is still conditional and not frozen:

1. Generate the image file inventory from the actual image build contents.
2. Count all files in the installation domain.
3. Measure the longest path in characters and bytes.
4. Generate a canonical JSON As-Run sample from that exact inventory.
5. Measure the canonicalized sample's actual byte size.
6. Use measurements 2–5 to freeze `installedFiles` and `maxBytes` in E4-A-4.

Until these six results exist, the As-Run size limits remain **UNFROZEN**. Do not use the draft's rough 2 MiB estimate as a frozen value.

### C0b completion evidence

- exact BOM ref and SHA-256;
- exact source commit and builder/toolchain versions;
- reproducible build recipe and artifact digest;
- full installed-file count and longest path measurements;
- canonical As-Run JSON byte measurement;
- no-secret scan result;
- disabled-service proof;
- sanitized build log reference;
- discard/rollback evidence.

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

合同基线草案：[`docs/drafts/E1-A_REGISTRATION_BINDING_AMENDMENT_v1.1_2026-11-02.md`](../drafts/E1-A_REGISTRATION_BINDING_AMENDMENT_v1.1_2026-11-02.md)。该草案未获单独确认前不得实施。

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

