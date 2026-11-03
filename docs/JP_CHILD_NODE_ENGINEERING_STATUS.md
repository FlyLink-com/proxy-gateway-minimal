# JP-01 日本子节点工程状态台账

Last updated: 2026-11-02 UTC.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: jp_child_node_engineering_status
  superseded_by: null
  last_verified_at: 2026-11-02
  production_authority: false
```

> **本文件是 JP-01 当前工程状态的唯一汇总入口。**
>
> - 源码事实以本文件记录的精确 master commit 和 GitHub PR/CI 证据为准。
> - 生产事实只能由对应 M 阶段的实时证据确认；源码合并、测试通过或设计批准均不能代替生产验收。
> - 操作步骤以 `docs/runbooks/FLINKVPN_JP_CHILD_NODE_BUILD.md` 为准；本台账不授权生产操作。
> - 本文件不授权 SSH、Provider API、Vultr 资源创建、WireGuard、Agent、密钥、数据库、配置、订阅、流量或部署变更。

## 1. 固定目标与节点身份

目标架构已经固定，不再作为待确认事项：

- BWH：唯一订阅/控制面，拥有账号、订单、凭据生命周期、Desired State、Handoff、Receipt、订阅渲染和用量账本。
- Vultr Japan：独立数据面候选节点，只承载协议运行时、节点级 Agent apply 和脱敏运行/用量证据。
- Vultr Singapore：同一 BWH 控制面下的数据面容量。
- JP 节点初始身份：`node-vultr-jp-01`。
- JP 三个逻辑通道：
  - `channel-vultr-jp-01-vless-reality-tcp`
  - `channel-vultr-jp-01-hy2`
  - `channel-vultr-jp-01-tuic`
- 初始池与生命周期：`pool=private`、`lifecycle=private-validation`。不得因源码映射存在、主机在线或 Receipt 单项通过而进入普通用户订阅。

## 2. 源码基线：E1 步骤 5–8 已合并

<badge>源码已合并</badge>

- PR：[#822](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/822)
- 最终功能头：`8ee26c6727c1e1dd3f1569c211fad8f4423dc41d`
- Merge commit：`eb83197e47155943087655ff7d4aad7a6c954849`
- 当前源码基线：`master @ eb83197e`
- 最终头独立审批：`gccltdco-cmd`，2026-11-02 11:55:04 UTC，状态 `APPROVED`。
- 最终头 GitHub Actions：CI Run [#2310](https://github.com/FlyLink-com/proxy-gateway-minimal/actions/runs/41438678649)，结论 `success`。同一轮较早的 Run #2309 为 `skipped`，不作为通过证据。
- 合并时间：2026-11-02 11:56:08 UTC。

### 2.1 已交付的源码能力

| 提交 | 已实现内容 | 当前边界 |
| --- | --- | --- |
| C1 `97b78ea2` | 首启包 WireGuard 字段与 planRef 校验；摄入门；注册执行器；绑定回执；原子 insert-if-absent | 执行门 default-off；没有生产调用方；CLI 仍为 dry-run |
| C2 `e0e402e5` | Identity Gate 支持 `--node-ref`；增加 JP-01 三面映射；计量注册表追加三条 JP 通道 | 只扩展只读检查路径，不代表生产身份数据已注册或计量已启用 |
| C3 `8ee26c67` | WireGuard readiness blockers；范围化 PR 证据；Admin 输入/输出类型与测试同步 | 是源码就绪条件，不是隧道或运行时就绪证明 |

JP-01 Identity Gate 映射：

| Runtime | Surface | Channel |
| --- | --- | --- |
| Xray | `jp01-vless` | `channel-vultr-jp-01-vless-reality-tcp` |
| Hysteria2 | `jp01-hy2` | `channel-vultr-jp-01-hy2` |
| Mihomo/TUIC | `jp01-tuic` | `channel-vultr-jp-01-tuic` |

### 2.2 测试与 CI 证据

- Windows / Node v24.16.0：受影响测试 100/100；全量 `npm run test:server` 6943 项，6874 通过、0 失败、69 跳过。
- Linux / Node v24.22.1：全量 6932 项，6926 通过、0 失败、6 跳过。
- GitHub Actions 最终头 CI Run #2310：success。
- 独立审批落在最终功能头 `8ee26c67`，随后合并为 `eb83197e`。

### 2.3 源码完成不等于生产完成

PR #822 明确不包含：

- CLI 注册命令接线；注册命令仍为 dry-run。
- 生产环境变量值、BWH 对齐、部署或镜像构建。
- 任何生产数据库迁移或 DDL。
- WireGuard 实际密钥生成、Peer 交换或隧道接通。
- JP 实例创建、Agent 启用、节点注册、Desired State apply、Receipt、计量、订阅渲染或客户端流量。

`EDGE_NODE_REGISTRATION_EXECUTION_ENABLED` 必须精确等于字符串 `"true"` 才能通过执行门；该开关本身不是授权。JP-01 经普通摄入入口直接注册仍被拒绝，必须走受控执行路径。当前仓库没有生产调用方，不能把“执行器存在”写成“注册已完成”。

## 3. 文档权威与漂移收口

### 3.1 当前权威文件

| 文件 / 记录 | 权威范围 |
| --- | --- |
| 本文件 `docs/JP_CHILD_NODE_ENGINEERING_STATUS.md` | 当前总状态、源码基线、阶段状态与下一步 |
| `docs/runbooks/FLINKVPN_JP_CHILD_NODE_BUILD.md` | M0–M8 操作顺序、检查项、Gate、回滚和验收 |
| `docs/PROJECT_TOPOLOGY.md` | 固定目标拓扑；不证明实时生产状态 |
| `docs/VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md` | Japan/SGP 目标方向与历史事实边界 |
| PR #822 | E1 源码交付、最终头审查与合并证据 |
| PR #808 | JP 建设 Runbook 的文档交付与 M0 阻塞记录 |

### 3.2 已合并的文档 PR #808

- PR [#808](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/808) 已合并。
- Merge commit：`0699e40a2578b3adf36ee7f7935f5a2d8ba70cdf`。
- 原 PR 描述中“Keep this PR Draft”等文字属于合并前状态，已由合并后的说明取代。
- PR #808 的 M0 状态仍为 BLOCKED；PR 合并只代表文档进入 master，不代表生产 Gate 通过。

### 3.3 旧 E1 审查包的处置

`e1-source-review-package-2026-11-02*.md` 与对应完整 Diff 是审查过程的历史快照：

- 早期包以 master `0ed925e1` 为基线，曾记载工作区未提交、等待第二至第六轮审查。
- 最后一轮包仍记载“等待最终审查”；该状态已被 PR #822 的最终头审批、CI 和合并事实取代。
- 旧包保留审计价值，但不再是当前分支、提交、CI 或工程状态的权威来源。
- 当前代码事实以 `8ee26c67` / merge `eb83197e` 为准。不得继续从旧包复制“未提交”“未合并”“等待审查”等状态。

### 3.4 E1-A v1.1 与 E4-A v0.12：仍是设计草案

以下两个工作稿已完成相应轮次修订，但不是已冻结合同，也不是已实现代码：

**E1-A 注册绑定合同修订单 v1.1**

- 当前工作稿：`e1a-registration-binding-amendment-order-draft-2026-11-02 (10).md`。
- B31–B36 与配套测试 55–62 已写入草案，包括第三锚 `agentSigningPublicKeyFingerprint`、V2 绑定、PoP、自举入口、genesis 接受证据和 T_first 候选数组。
- 状态：待项目负责人对 v1.1 单独确认；确认前不得开始该修订单的源码实施。
- 当前已合并 E1 源码仍是 v1 的 11 字段绑定与两枚锚点；第三锚、PoP 和 v2 注册绑定尚未实现。
- E1-A v1.1 的确认与 E4-A v0.12 的确认彼此独立，不得互相代替。

**E4-A Release Identity V2 Schema 与信任合同 v0.12**

- 当前工作稿：`e4a-schema-draft-2026-11-02 (11).md`。
- A24–A26 已写入草案。
- 状态：有条件通过，尚未进入 E4-A-4 正式冻结，更未进入 E4-B。
- 正式冻结的四项剩余条件：①负责人确认 v0.12；②真实镜像产物出现后完成六项 As-Run 规模实测并冻结文件数/maxBytes；③E1-A v1.1 单独确认；④补齐正式错误码表并落实 P6/P10/P11/P12/P13 测试向量及 P7 三项测试。
- 当前没有可复现的 JP 镜像构建产物，因此六项 As-Run 规模实测尚未完成。
- 当前 GitHub 仓库检索未找到可作为权威引用的 JP-01 BOM 文件路径；候选构建 Gate 必须补齐已批准 BOM 的确切文件引用和 SHA-256，不能只写“BOM 已锁定”。

## 4. 生产与候选节点阶段的真实状态

### 4.1 M0

<badge color="danger">BLOCKED</badge>

当前只剩两项 M0 阻塞：

1. **Agent allowlist 的运行时有效值未验证。** 显式 `EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS` 缺失；源码存在 loopback 默认回退，但生产进程实际解析值尚无运行时证据。
2. **Identity Gate 没有当前正式执行结果。** 历史 aggregate `degraded` 不等于同一稳定读取边界下的正式 before/after 通过证据；PR #812 的只读诊断不执行 Identity Gate。

M0 两项未闭合前，不得开始生产主机、私有网络、BWH Agent 接入或节点启用操作。

### 4.2 M1–M8

| 阶段 | 当前状态 | 真实说明 |
| --- | --- | --- |
| M1 私有互联 | NOT RUN | 未建立或验收 JP↔BWH WireGuard 隧道 |
| M2 无密钥镜像 | NOT RUN | BOM 有锁定记录，但无可复现镜像产物 |
| M3 Vultr JP 实例 | NOT RUN | 未创建本轮候选实例；不得把已销毁的旧 JP 实例当作可复用主机 |
| M4 BWH 注册 | SOURCE READY / PROD NOT RUN | 源码映射和受控执行器已合并；BWH 注册表没有本轮 JP-01 生产注册证据 |
| M5 Agent / Desired State / Receipt | NOT RUN | 无 JP 实际 Agent apply 与 applied receipt |
| M6 Identity / Metering | NOT RUN | 无 JP 生产 before/after Identity Gate 或真实计量验收 |
| M7 客户端 Canary | NOT RUN | 未开始 3–7 天受控客户端观察 |
| M8 正式交接 | NOT RUN | 未批准 stable/active 晋升或普通订阅输出 |

特别区分：PR #822 的“源码步骤 5–8”已完成；Runbook 的“生产阶段 M5–M8”没有执行。这两个编号体系不是同一件事。

## 5. 候选安装、启用与接入阶段

<badge color="warning">阶段已开启：仅候选准备</badge>

本轮开始进入 Candidate Install / Enable / Integration 阶段，但当前仅开放候选准备和 Gate 编制，不把任何生产操作视为已授权或已执行。

| 子阶段 | 工作内容 | 进入条件 | 当前状态 |
| --- | --- | --- | --- |
| C0 候选镜像准备 | 固定 BOM 文件及 SHA；定义隔离构建；产出无密钥镜像、manifest、As-Run 文件清单；完成 E4-A 六项规模实测 | 候选构建的精确 Gate；不连接 BWH/Vultr、不使用生产密钥 | PREP 未完成，镜像未构建 |
| C1 候选安装 | 在全新 JP 候选实例安装镜像；核对主机身份、补丁、磁盘、时间和公网边界 | M0 通过 + 精确 Vultr Provider Risk A Gate | BLOCKED |
| C2 WireGuard 启用 | 生成节点专用密钥、交换公钥、配置最小路由、验证隧道恢复 | M0 通过 + M1 精确网络 Gate | BLOCKED |
| C3 Agent 接入 | 私有路径接入 BWH Agent；校验 allowlist、节点身份和最小权限 | C2 通过 + Agent 接入 Risk A Gate | BLOCKED |
| C4 受控注册 | 首启包、授权、三锚、PoP、注册记录与回执绑定 | E1-A v1.1 单独确认、源码实施和验收；相应 E4 合同/发布证据满足要求；另有注册 Risk A Gate | BLOCKED |
| C5 运行接入 | Desired State、材料 digest、dry-run、config-test、定向 apply、Receipt、Identity Gate | C4 通过 + 精确运行时 Gate | BLOCKED |
| C6 客户端 Canary | 受控测试账号、订阅 Receipt Gate、连接与计量核对，观察 3–7 天 | C5 全部通过 + Canary Gate | NOT STARTED |

### 候选阶段的硬边界

- 候选节点始终使用 `pool=private`、`lifecycle=private-validation`。
- 不进入普通用户订阅，不进行全量流量切换。
- 不复用已销毁的旧 JP 实例身份、密钥或节点记录。
- 生产私钥、Agent Token、协议凭据只在受保护环境生成和保存，不进入 Git、PR、聊天、构建日志或镜像。
- 每个生产动作必须有独立、精确的 Risk A Gate，写明目标、动作、凭据来源、备份、验证、停止条件和回滚。
- 本阶段开启不等于 M0 通过，不等于允许创建 Vultr 实例、启用生产 WireGuard、打开注册执行门或修改订阅。

## 6. 下一步唯一执行顺序

1. 完成文档收口 PR 的精确头验证与独立审查。
2. 建立 C0 候选镜像构建 Gate：先定位并固定批准 BOM 原件及 SHA-256、构建环境、镜像目标和无秘密扫描边界。
3. 在单独批准后完成本地隔离候选镜像构建；生成真实 manifest 和 As-Run 清单，完成 E4-A 六项实测。
4. 并行收口 M0 两项阻塞，但不得用候选镜像构建结果代替 M0 生产证据。
5. E1-A v1.1 与 E4-A v0.12 分别取得独立确认；按其冻结条件实施并验收。
6. M0 通过后，按 C1→C6 顺序逐阶段申请并执行精确 Risk A Gate。
7. Canary 达标后，再单独评估 M8 正式交接和订阅输出晋升。

## 7. 当前结论

- E1 源码步骤 5–8：**已完成、已审批、CI 成功、已合并**。
- E1-A v1.1：**设计草案，待单独确认，未实施**。
- E4-A v0.12：**有条件通过，待冻结，未实施**。
- JP-01 镜像、隧道、候选实例、生产注册、Agent、Receipt、计量和 Canary：**均未完成**。
- 当前阶段：**候选安装/启用/接入准备已开启；首先处理 C0 精确构建 Gate，不越过 M0 和各项 Risk A 边界**。
