# JP-01 日本子节点工程状态台账

Last updated: 2026-11-03 UTC.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: jp_child_node_engineering_status
  superseded_by: null
  last_verified_at: 2026-11-03
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

**源码已合并**

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
| `docs/runbooks/JP_CHILD_CANDIDATE_INSTALL_ENABLE_INTEGRATION_GATE.md` | JP-01 候选镜像、安装、WireGuard、Agent、E1-A V2 注册、Receipt、Canary 的精确 Gate 包 |
| `docs/drafts/E1-A_REGISTRATION_BINDING_AMENDMENT_v1.1_2026-11-02.md` | E1-A v1.1 注册绑定合同修订单草案；待单独确认，未实现 |
| `docs/drafts/E4-A_RELEASE_IDENTITY_V2_SCHEMA_v0.12_2026-11-02.md` | E4-A v0.12 发布身份 V2 与信任合同草案；有条件通过，未冻结 |
| `docs/PROJECT_TOPOLOGY.md` | 固定目标拓扑；不证明实时生产状态 |
| `docs/VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md` | Japan/SGP 目标方向与历史事实边界 |
| PR #822 | E1 源码交付、最终头审查与合并证据 |
| PR #824 | R2 镜像只读校验与 JP-01 provisioning dry-run；Draft，未执行托管 R2 验证 |
| PR #825 | Vultr API preflight 与 T2/T3/M0/C1–C6 流水线定义；Draft，未执行 Vultr API 预检 |
| PR #826 | D1 双端集成合同、五份 Schema、23 项 Gate 与身份交换设计；Draft，等待最终 Head 独立复审 |
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

### 3.4 E1-A / E4-A 合同基线与实测状态（2026-11-03）

PR #823 内的两个草案文件是当时的归档副本，不再单独代表最新工作基线：

- docs/drafts/E1-A_REGISTRATION_BINDING_AMENDMENT_v1.1_2026-11-02.md：v1.1 历史工作稿。
- docs/drafts/E4-A_RELEASE_IDENTITY_V2_SCHEMA_v0.12_2026-11-02.md：v0.12 历史工作稿。
- PR #826 的 D1 身份交换合同明确记录当前工作基线为 **E1-A v1.2 / E4-A v0.13**。该记录用于 D1 接口对齐，不代表两个合同已完成独立确认、E4-A 已冻结或生产实现已完成。
- E1-A v1.2 的单独确认与源码实施仍是生产注册前置条件；E4-A v0.13 仍未完成 E4-A-4 正式冻结。不得把 D1 Draft 中的基线声明当成合同批准或生产授权。

**C0 已补齐 E4-A 所需的真实镜像规模测量（不等于阈值冻结）：**

| 测量项 | C0 实测结果 |
| --- | --- |
| 镜像安装域常规文件数 | 40,603 |
| 安装域全部条目 | 52,500 |
| 最长路径 | 185 字符 / 185 字节 |
| 规范化 As-Run JSON 样本 | 1,910 字节 |
| 完整文件清单 | 52,500 条目，SHA-256 已记录 |
| 候选压缩镜像 | 2,269,994,633 字节；SHA-256 693d9f5afdfbc440870ecb7ec84bee8cc2af644574496f564f2c92ab59946442 |

C0 报告确认上述六项 As-Run 测量来自真实候选镜像；构建 #2 的文件集合与 installedFiles 计数一致，内容级差异已定位，但整盘镜像不是逐字节完全复现。镜像本体秘密扫描通过，QEMU BIOS 启动到达 systemd targets；Vultr 金属机首启仍属于 C1 验证。

**E4-A-4 当前剩余事项：**

1. 负责人对 E4-A v0.13 的独立确认。
2. 将 C0 实测值写入正式冻结稿并确定 installedFiles / maxBytes 阈值；C0 的测量完成本身不冻结阈值。
3. E1-A v1.2 单独确认。
4. 补齐正式错误码表，并落实 P6、P10、P11、P12（TV-K）、P13（TV-T）测试向量及 P7 累计撤销 / 指纹级撤销 / 授权第三锚回溯测试。

四项未全部闭合前，E4-A 保持未冻结，不进入 E4-B。

## 4. 生产与候选节点阶段的真实状态

### 4.1 M0

<badge color="danger">BLOCKED</badge>

截至 2026-11-03，M0 仍只有两项生产证据阻塞；C0 镜像构建和镜像通用性审计不能替代它们：

1. **Agent allowlist 的运行时有效值未验证。** 显式环境配置 EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS 缺失；源码存在 loopback 默认回退，但 BWH 生产进程的实际解析值和生效边界没有当期运行时证据。必须在精确目标、只读命令和脱敏输出范围绑定的 Risk A Gate 下核验，不能从源码推断生产值。
2. **缺少当期正式 Identity Gate 结果。** 历史 aggregate degraded 不构成通过；需要在同一稳定读取边界下取得正式 before/after 结果。PR #812 仍为 Draft，当前 head 56f2bb8d3cb16c8c488fed05b39c4297771a888a 的精确头校验和新独立审批尚未完成；其只读诊断本身也不执行 Identity Gate，不能代替正式结果。

M0 未通过前，不得开始生产主机、私有网络、BWH Agent 接入或节点启用操作。任何 BWH 生产读取都必须先有单独、精确的 Risk A 只读 Gate；本次同意不扩大该授权。

### 4.2 M1–M8

| 阶段 | 当前状态 | 真实说明 |
| --- | --- | --- |
| M1 私有互联 | NOT RUN | 未建立或验收 JP↔BWH WireGuard 隧道 |
| M2 无密钥镜像 / 运行包 | NOT RUN | C0 通用基础候选镜像已交付，但镜像不含 Agent 和生产 systemd 服务单元；M2 完整运行包与生产节点安装尚未验收 |
| M3 Vultr JP 实例 | NOT RUN | 本轮未创建 JP-01 候选/生产实例；C0 临时构建机已销毁 |
| M4 BWH 注册 | SOURCE READY / PROD NOT RUN | 注册执行器、JP 映射已合并；无本轮 JP-01 生产注册证据，执行门 default-off |
| M5 Agent / Desired State / Receipt | NOT RUN | 无 JP 实际 Agent apply 与 applied receipt |
| M6 Identity / Metering | NOT RUN | 无 JP 生产 before/after Identity Gate 或真实计量验收 |
| M7 客户端 Canary | NOT RUN | 未开始 3–7 天受控客户端观察 |
| M8 正式交接 | NOT RUN | 未批准 stable/active 晋升或普通订阅输出 |

特别区分：PR #822 的“源码步骤 5–8”已完成；Runbook 的“生产阶段 M5–M8”没有执行。这两个编号体系不是同一件事。

## 5. 候选安装、启用与接入阶段

**阶段已开启：仅候选准备**

本轮开始进入 Candidate Install / Enable / Integration 阶段，但当前仅开放候选准备和 Gate 编制，不把任何生产操作视为已授权或已执行。

| 子阶段 | 工作内容 | 进入条件 | 当前状态 |
| --- | --- | --- | --- |
| C0 候选镜像准备 | 锁定 BOM；隔离构建无密钥基础镜像；生成 manifest、As-Run 清单；完成六项规模测量与秘密扫描 | 独立候选构建 Gate；不连接 BWH/生产网络、不使用生产密钥 | **PASS** — Candidate #1 已交付；压缩镜像 SHA-256 693d9f5afdfbc440870ecb7ec84bee8cc2af644574496f564f2c92ab59946442；六项测量完成 |
| C1 候选安装 | 在全新 JP 候选实例安装镜像；核对主机身份、补丁、磁盘、时间和公网边界 | M0 通过 + 精确 Vultr Provider Risk A Gate；T2/T3 镜像可用性与完整 SHA 验证 | **BLOCKED** — M0 未通过；R2 托管只读校验和全量下载校验尚未执行；Vultr preflight 尚未执行 |
| C2 WireGuard 启用 | 生成节点专用密钥、交换公钥、配置最小路由、验证隧道恢复 | C1 通过 + M1 精确网络 Risk A Gate | BLOCKED |
| C3 Agent 接入 | 私有路径接入 BWH Agent；校验 allowlist、节点身份和最小权限 | C2 通过 + Agent 接入 Risk A Gate；M0 运行时 allowlist 证据通过 | BLOCKED |
| C4 受控注册 | 首启包、授权、三锚、PoP、注册记录与回执绑定 | E1-A v1.2 单独确认与源码实施/验收；E4-A v0.13 合同条件满足；独立注册 Risk A Gate | BLOCKED |
| C5 运行接入 | Desired State、材料 digest、dry-run、config-test、定向 apply、Receipt、Identity Gate | C4 通过 + 精确运行时 Risk A Gate | BLOCKED |
| C6 客户端 Canary | 受控测试账号、订阅 Receipt Gate、连接与计量核对，观察 3–7 天 | C5 全部通过 + 单独 Canary Gate | NOT STARTED |

### 候选阶段的硬边界

- 候选节点始终使用 `pool=private`、`lifecycle=private-validation`。
- 不进入普通用户订阅，不进行全量流量切换。
- 不复用已销毁的旧 JP 实例身份、密钥或节点记录。
- 生产私钥、Agent Token、协议凭据只在受保护环境生成和保存，不进入 Git、PR、聊天、构建日志或镜像。
- 每个生产动作必须有独立、精确的 Risk A Gate，写明目标、动作、凭据来源、备份、验证、停止条件和回滚。
- 本阶段开启不等于 M0 通过，不等于允许创建 Vultr 实例、启用生产 WireGuard、打开注册执行门或修改订阅。

## 6. 双端集成 D1–D4

### D1 — 接口合同与身份交换

- PR：[#826](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/826)，Draft，当前 Head 32d8cdf03e0bdc326234e8aca3034f11d4999a54（短 SHA 32d8cdf0）。
- 已交付：BWH Integration Plan、Node Runtime Plan、Dual-Side Gate、Agent Apply Receipt、Post-Install Summary Receipt 五份 Schema；身份交换设计；23 项双端一致性检查。
- 当前验证：专用合同测试 19/19 本地通过；全量测试相对 master 基线新增 19 项且无新增失败，但环境中存在 380 项既有失败；托管 CI 被 change classifier 跳过，不能记为 hosted CI pass。
- 当前审查：GitHub review 列表为空，尚无独立复审。PR #826 明确要求最终 Head 重新审查后才启动 D2；因此 **D2 当前为 WAITING FOR INDEPENDENT REVIEW**，不得以本地测试代替。
- D1 已记录的 D2 强制条件：BWH Renderer 只读读取现有 BWH WireGuard 公钥，不生成、不替换 BWH 密钥；双端 Gate 必须检查与既有身份连续一致，并包含两份计划同时漂移到新 BWH 公钥仍被拒绝的反例。

### D2 — 双端 Renderer（待 D1 最终 Head 独立复审）

- 目标：实现 BWH Renderer、Node Renderer、规范化摘要计算，以及真实 23 项双端 Gate 的执行与测试。
- 必须保持 production_authority=false；只生成离线计划/报告，不读取或修改生产配置，不 apply WireGuard，不创建密钥，不启用服务。
- 两端必须使用同一 Node Profile、generation、E1-A candidate binding；按 D1 规则计算 canonical JSON digest。
- BWH 现有 WireGuard 公钥只读取得并核对连续性；Node 私钥仅在节点本机生成，不能进入 GitHub、制品或日志。
- 节点计划中的服务启用字段必须保持 false；统计监听地址仅允许 loopback；AllowedIPs 维持批准的精确 /32 白名单。
- D2 单独 Draft PR，独立复审和精确 Head 验证后再考虑 D3；不得把 D2 完成等同于生产渲染或服务启用。

### D3 / D4

- D3：WireGuard / Agent 私有接入与注册执行。启动前必须先解决 D1 §9 的 SSH bootstrap 与 C1 SSH-disabled 规则冲突，以及 §7 GitHub egress（固定出口 Runner 或 BWH 受限 Relay）选择；另需 M0、E1-A、E4-A 生产前置条件和独立 Risk A Gate。
- D4：Desired State、材料引用、dry-run、config-test、定向 apply、Agent Receipt 与三通道汇总 Receipt；生产 apply、计量、Canary 均需各自精确 Gate。
- PR #826 的 D1 设计不创建 workflow、不连接 BWH、不生成生产密钥、不执行注册、不启动服务。

## 7. 下一步执行顺序（2026-11-03 更新）

1. **M0 证据收口准备**：先把两项阻塞拆成精确、脱敏、只读的证据任务；Agent allowlist 只核对运行时有效值及边界，Identity Gate 只取得同一稳定读取边界下的正式 before/after 结果。任何生产读取前必须单独取得精确 Risk A Gate；不通过聊天授权或源码推断绕过。
2. **PR #812 精确头收口**：先在隔离工作区对 head 56f2bb8d 完成其自身要求的 SHA256、语法、自测和 21 项测试，并取得新的独立 APPROVED；旧 Head 的评论/审批不迁移到当前 Head。即使完成，也只代表诊断包准备好，不代表 Identity Gate 已执行。
3. **D1 最终复审**：对 PR #826 精确 Head 32d8cdf0 完成独立复审。当前 GitHub review 为空；本账号是 gccltd，不得以作者账号给自己的 PR 提交独立批准。
4. **D2 Renderer**：仅在 #826 最终 Head 获得独立复审后启动单独 Draft PR；离线实现 BWH/Node Renderer 与 23 项 Gate，不接触生产环境，不启用服务。
5. **E1-A / E4-A 合同**：单独确认 E1-A v1.2；将 C0 实测值写入 E4-A v0.13 并完成剩余错误码/测试向量，正式冻结前不进入 E4-B。
6. **C1–C6**：M0 通过、D2/D3/D4 对应源码和合同 Gate 具备、且每阶段独立 Risk A 批准后，严格按 C1→C6 顺序执行；不因候选镜像已交付而提前创建 JP 实例。

本次授权仅覆盖源码、测试、文档和 Draft PR 准备；不覆盖 BWH 生产读取、Provider API、Vultr 资源变更、SSH、WireGuard、Agent、密钥、数据库、订阅、流量或部署。

## 8. 当前结论

- E1 源码步骤 5–8：**已完成、已审批、CI 成功、已合并**（master eb83197e）。
- JP-01 C0 候选基础镜像：**PASS**；镜像秘密扫描、六项 As-Run 实测、QEMU BIOS 启动及内容级复现核对完成。
- 通用镜像可移植性 Phase 1 / Phase 2：**CLOSED**；Candidate #1 可作为 JP/US/SG 共用基础镜像，节点差异通过 Node Profile 和首启身份注入。
- M0：**BLOCKED**，仅余运行时有效 Agent allowlist 证据与当期正式 Identity Gate before/after 结果两项。
- M1–M8：**未执行**；M2 完整 Agent/服务运行包也未验收，不能把 C0 基础镜像等同于可上线节点。
- C1–C6：C0 已 PASS；C1 仍因 M0 与独立 Provider Gate 阻塞，后续阶段均未启动。
- E1-A v1.2：D1 当前工作基线，**待单独确认和实施**；E4-A v0.13：**未冻结**，C0 实测已完成但阈值及合同测试条件仍待正式收口。
- 双端集成：D1 PR #826 **Draft / 等待最终 Head 独立复审**；D2 Renderer 尚未启动；D3/D4 保持后续分阶段 Gate。
- 当前唯一允许推进范围：M0 证据任务的离线准备、D1 复审准备、D2 源码开发的前置准备与文档/测试工作；**不构成任何生产操作授权**。
