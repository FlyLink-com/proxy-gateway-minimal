# FlinkVPN JP 子节点建设任务清单

Last updated: 2026-10-30 UTC.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: flinkvpn_jp_child_node_build
  superseded_by: null
  last_verified_at: 2026-10-30
  production_authority: false
```

> 状态与权限
> - 目标：BWH 控制面 + Vultr Japan 独立数据面。
> - 执行风险：Risk A（生产节点、网络、凭据、运行时和流量身份）。
> - 本文档 PR：Risk C，仅新增任务清单和验收约束。
> - 本文档不授权 SSH、Provider API、Vultr 资源创建、WireGuard 配置、生产读取、服务重启、配置下发、订阅解锁或流量切换。
> - 初始节点状态：pool=private，lifecycle=private-validation。
> - 建议节点标识 node-vultr-jp-01 仅为示例；必须先检查唯一性，不得直接假定已登记或已预留。

## 1. 目标与架构核对

目标拓扑：

- BWH 继续承担唯一控制面，拥有账号、订单、订阅、凭据生命周期、Desired State、Handoff、Receipt 和用量账本。
- Vultr Japan 新建独立数据面，只承载协议运行时和本地用量采集，不复制控制面，不承载用户、订单或 SQLite 业务数据。
- BWH 与 JP 通过独立私有通信通道交互；Agent 只访问获准的内部接口。
- 新节点初始只用于 private-validation，不进入普通用户订阅。

**必须先解决的架构差异：** 当前仓库的 docs/PROJECT_TOPOLOGY.md 仍记录 Vultr Japan 为订阅控制面，并将日本、新加坡列为数据面。该文档是带日期的架构记录，不是实时主机证明。本任务指定 BWH 为控制面，属于需要 M0 现场核实并由项目负责人确认的目标拓扑；不得在 M0 之前静默覆盖旧架构文档，也不得据此直接创建隧道或实例。

若 M0 发现实际控制面并非 BWH、目标主机不唯一、控制面身份无法验证，或项目负责人尚未确认拓扑，立即停止后续 M1–M8。

## 2. 执行分工

| 工作 | 负责人 | 交付 |
| --- | --- | --- |
| 本地工具与仓库预检 | 用户 / 本地操作员 | 本地预检摘要，不含凭据 |
| BWH、Vultr 只读盘点 | 用户 / 获准操作员 | M0 脱敏盘点报告 |
| 生产 Gate、命令边界和停止条件审查 | ChatGPT | 审查结论、缺口清单 |
| 每阶段证据核对 | ChatGPT | 按验收项给出 PASS / BLOCKED / NOT RUN |
| 主机、网络、Provider 和运行时操作 | 用户 / 获准操作员 | 仅在独立 Risk A Gate 批准后执行 |
| GitHub PR 与文档收口 | ChatGPT | 更新任务证据、复核 PR 精确 head |

用户不需要把 SSH 私钥、Provider API Key、Agent Token、协议密码、UUID、私钥、订阅链接、原始环境变量、原始配置、客户数据或数据库内容发到聊天或 GitHub。

## 3. M0：生产环境只读盘点（P0）

**本阶段只读，不修改任何生产状态。** 生产读取本身也必须先完成精确目标、只读命令、输出字段、时窗、凭据来源、清理方式和一次性审批的 Risk A Gate。没有该 Gate 时，只允许执行第 10 节的本地无凭据预检。

### BWH 控制面

- [ ] 核对实际运行应用版本、release identity、source commit 和目标主机角色。
- [ ] 核对 BWH 控制面健康状态；区分公开 health 与受保护 status。
- [ ] 核对 EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED 的状态，不输出原始环境值。
- [ ] 核对 EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS 的配置来源和边界；报告 loopback / private tunnel / public / unknown 分类，不粘贴原始 CIDR。
- [ ] 核对 EDGE_DATA_PLANE_AGENT_NODES_JSON 的登记数量和安全 nodeRef 摘要，不输出 token 或原始材料。
- [ ] 核对节点注册表、受保护材料存储及其 key/digest 引用是否就绪。
- [ ] 核对 Desired State、Handoff、Receipt 的状态、数量和 freshness。
- [ ] 核对 BWH 当前协议服务和用量采集状态。
- [ ] 核对现有订阅渲染是否仍包含已停止的 BWH 节点；只报告脱敏 node/channel refs，不输出订阅 URL、Token、YAML 或凭据。
- [ ] 核对 Identity Gate 和计量检查点状态；只输出 aggregate counts 和状态枚举。

### Vultr 侧

- [ ] 由操作员确认 Vultr 账号可用、JP 区域可创建目标规格；不在报告中记录账号 ID 或 API Key。
- [ ] 核对是否存在可复用的旧 JP 实例；核对旧节点与新节点的物理身份隔离。
- [ ] 核对现有 DNS、证书、Firewall 的归属和依赖；只记录安全引用，不粘贴私钥、原始规则或不必要的公网地址。
- [ ] 确认新实例月预算、流量上限、超额计费边界和销毁成本。
- [ ] 确认目标主机、网络边界、服务职责和回退对象可唯一识别。

**M0 交付物：** BWH/Vultr 脱敏只读盘点报告。

**M0 通过条件：** 控制面真实身份、目标主机、架构归属、Agent 边界、注册与材料能力、用量/Identity 状态、预算和回退条件均有可核验依据。任何一项 unknown 不得按通过处理。

## 4. M1：建立 BWH ↔ Vultr 私有通信通道（P0）

- [ ] 选用独立 WireGuard 站点到站点隧道，或经审查批准的等效私有网络。
- [ ] 设计不与现有网络冲突的私有地址段，BWH 与 JP 使用独立隧道地址。
- [ ] 生成本任务专用密钥；不得复用历史 canary、旧节点或其他环境密钥。
- [ ] 配置最小路由，只允许 JP 访问指定 BWH Agent 内部接口。
- [ ] 验证隧道建立、断开、恢复和路由收敛。
- [ ] 单独审批是否启用 BWH Data Plane Agent API。
- [ ] 将 JP 隧道来源加入 Agent allowlist；不得扩大为公网或宽泛网段。
- [ ] 为 JP 生成独立 Agent 身份；BWH 只保存 Token 安全摘要，JP 原始 Token 只存于受保护文件。
- [ ] 验证合法身份成功、错误身份/未授权来源被拒绝。
- [ ] 验证公网不能访问内部 Agent 路由。

**交付物：** 私有网络验收记录、Agent 身份绑定记录。

**通过条件：** JP 只能经私有路径访问获准接口；公网绕过、越权来源和身份复用均被拒绝。

## 5. M2：制作 JP 无密钥基础镜像（P1）

- [ ] 选择受支持的 Ubuntu LTS，并记录镜像与补丁基线。
- [ ] 安装并固定 Node.js 版本。
- [ ] 安装并固定 Xray、Hysteria2、Mihomo/TUIC 运行时版本及来源校验值。
- [ ] 安装生产 Edge Agent 和必要的 systemd 服务模板。
- [ ] 安装配置测试、健康检查、敏感材料扫描工具。
- [ ] 建立最小运行目录、用户、组和文件权限。
- [ ] 完成时间同步、SSH 基础加固和系统更新策略。
- [ ] 镜像不包含生产 .env、BWH SQLite、账号/订单数据、节点密码、UUID、私钥、Agent Token、订阅链接、客户材料。
- [ ] 执行镜像敏感材料扫描；记录扫描范围、结果和例外。
- [ ] 生成镜像清单、构建来源、运行时版本、镜像标识和 SHA-256。

**交付物：** JP 无密钥镜像及校验清单。

**通过条件：** 镜像可重复创建节点，且不携带任何生产秘密或控制面业务数据。

## 6. M3：Vultr JP 实例创建（P1）

- [ ] 根据预估并发、带宽和月流量选择规格，并与 M0 预算上限一致。
- [ ] 在独立 Risk A Provider Gate 批准后创建 JP 实例并绑定固定公网 IP。
- [ ] 绑定经过审核的 Vultr Firewall 和主机系统防火墙。
- [ ] SSH 仅允许授权管理来源，使用 SSH Key；核验 Host Key。
- [ ] 接入 M1 私有隧道并验证路由。
- [ ] 验证系统资源、网络、时间同步和磁盘状态。
- [ ] 保留实例销毁、重建和费用停止方案。

安全边界：

- 不开放 Admin UI。
- 不向公网开放 3456、18180、1080。
- 不向公网开放内部 Agent API、运行时统计接口或管理接口。
- 只开放经过批准的用户连接端口和必要的管理通道。
- 不在本 PR、聊天或截图中记录真实公网 IP、私钥、原始防火墙规则或凭据。

**交付物：** Vultr JP 主机基础验收记录。

**通过条件：** 主机身份、系统、私有网络和公网边界均通过核验。

## 7. M4：接入 BWH 节点注册体系（P1）

### 节点身份

- [ ] 确认 nodeRef 和 physicalNodeRef 全局唯一；与仓库现有注册 schema 映射后再写入。
- [ ] provider=Vultr，region=jp，role=data-plane。
- [ ] 初始 pool=private，lifecycle=private-validation。
- [ ] 生成独立首次启动安全注册包；不包含生产秘密。
- [ ] 通过现有 BWH 节点注册入口登记并核验记录。
- [ ] 不复制旧节点身份、业务数据库、订单或用户数据。

### 逻辑通道

首期规划三条通道：

- [ ] JP VLESS Reality。
- [ ] JP Hysteria2。
- [ ] JP TUIC。

每条通道分别绑定 channelRef、runtimeAdapter、endpointRef、portRef、edgeCredentialRef、material digest 和 receipt requirement。三条通道可以共用物理主机，但不得共用运行身份、凭据或计量身份。

**交付物：** 节点注册记录、逻辑通道清单。

**通过条件：** BWH 能识别节点和通道；节点仍处于 private-validation/private，不进入普通用户订阅。

## 8. M5：Agent、运行配置和回执验证（P1）

- [ ] JP Agent 只使用 BWH 私有地址和独立身份。
- [ ] Agent 完成节点身份认证并拉取节点级 Desired State。
- [ ] 通过受保护材料引用获取匹配材料，核对 digest；不把材料值写入日志或回执。
- [ ] 先执行 dry-run，确认无越权、无非目标变更。
- [ ] 生成本地运行配置并执行对应协议 config-test。
- [ ] 仅对通过验证的目标服务执行获准重启；禁止无关服务重启。
- [ ] 验证监听端口、服务状态和统计接口边界。
- [ ] Agent 提交 redacted applied receipt。
- [ ] BWH 核对 nodeRef、channelRef、generation、desiredStateRef、材料 digest 和回执 freshness。
- [ ] 验证过期、撤销、禁用、材料不匹配或身份不匹配时 fail-closed。

建议先完成一条逻辑通道的端到端验证，再逐步增加另外两条。

**通过条件：** 节点身份、期望配置、实际运行状态和回执相互一致。

## 9. M6–M8：计量、客户端 Canary 与正式交接

### M6：流量统计与用户归属（P1）

- [ ] 安装 JP 协议用量采集适配器。
- [ ] 为各通道建立独立 runtime identity。
- [ ] 核对 edgeCredentialRef → channelRef → orderRef → accountRef 归属链。
- [ ] 核对采集样本与汇总一致性、重启后的连续性。
- [ ] 检查身份缺失、重复、变化和 stale 项。
- [ ] 形成 Identity Gate before/after 聚合结果；不输出 UUID、凭据引用、用户或订单明细。
- [ ] missing、stale、changed、missing_material 任一非零时停止晋升，不得声明 identity healthy。

**通过条件：** 用户流量归属正确，无新旧节点身份混淆、重复计量或无归属流量。

### M7：客户端 Canary 验收（P1）

- [ ] 选择受控测试账号或获准测试订单，不使用未授权真实用户。
- [ ] 生成对应节点 Desired State，确认当前 generation 已应用且 applied receipt 有效。
- [ ] 验证只有 receipt 通过的 JP 节点进入受控测试订阅。
- [ ] 测试 Clash/Mihomo 导入和节点连接。
- [ ] 测试连接中断、恢复、订阅刷新、到期和撤销。
- [ ] 测试不同运营商网络和晚高峰表现。
- [ ] 观察 CPU、内存、带宽、流量和错误率。
- [ ] 初始观察 3–7 天；若样本不足或异常未解释，延长观察，不自动晋升。

**通过条件：** 客户端、运行时、订阅、计量四个层面均有可核验结果。

### M8：正式供给与运维交接（P2）

- [ ] 单独审批 lifecycle 从 private-validation 向 stable/active 的晋升。
- [ ] 单独批准对应用户套餐的通道分配；不得因节点在线自动加入全量订阅。
- [ ] 验证正式订阅输出和 receipt gate。
- [ ] 建立节点可用性、流量/带宽、CPU、内存、磁盘和 Agent 失联告警。
- [ ] 建立证书到期提醒。
- [ ] 完成节点维护、暂停、下线和回退 Runbook。
- [ ] 完成生产 Deploy Note，记录 release、target、backup、validation 和 Identity Gate before/after。

**通过条件：** JP 节点进入受控生产供给，且可观测、可暂停、可回退。

## 10. 用户本地配合清单

### 现在可以做：无凭据本地预检

在 Windows PowerShell 打开当前仓库：

~~~powershell
Set-Location D:\Projects\proxy-gateway-minimal
git status --short --branch
git rev-parse HEAD
git fetch origin master
git rev-parse origin/master
node --version
npm --version
ssh -V
~~~

- [ ] 确认当前仓库路径正确。
- [ ] 记录当前分支、HEAD 和 origin/master SHA。
- [ ] 若工作树有未提交修改，只报告文件路径和是否有改动，不要清理、覆盖或回滚。
- [ ] 记录 Node.js、npm、SSH 客户端版本。
- [ ] 确认 WireGuard / Vultr CLI 是否已安装即可；本阶段不要登录 Provider、导入 Token 或创建资源。
- [ ] 按第 11 节模板提交脱敏预检结果。

### M0 现场只读盘点

- [ ] 等待 ChatGPT 审核本地预检，并形成精确 Risk A 只读 Gate。
- [ ] 由操作员在自己的 BWH/Vultr 控制台或批准的只读执行环境完成盘点。
- [ ] 只提交第 11 节规定的状态枚举、数量、时间、版本和安全引用。
- [ ] 不上传原始日志、环境变量、配置、数据库、订阅 YAML、Token、私钥或客户数据。

### 后续本地配合

- [ ] 每个阶段开始前先取得对应 Gate 和明确批准。
- [ ] 按 PR 中的精确命令执行；保留命令、环境、时间、退出码和脱敏结果。
- [ ] 将结果回传给 ChatGPT 做逐项验收；未通过不进入下一阶段。
- [ ] 不自行扩大端口、CIDR、Provider 权限、服务重启范围或订阅用户范围。

## 11. 脱敏证据模板

只填写安全摘要；未知必须写 unknown，不得用猜测补齐。

~~~yaml
task: flinkvpn-jp-child-node
observed_at_utc:
local_environment:
  repository_path_confirmed:
  branch:
  head_sha:
  origin_master_sha:
  node_version:
  npm_version:
  ssh_client_version:
architecture:
  requested_control_plane: BWH
  observed_control_plane_provider:
  observed_control_plane_role:
  source_release_identity:
  topology_decision: confirmed | conflict | unknown
bwh:
  health: healthy | degraded | unavailable | unknown
  agent_routes: enabled | disabled | unknown
  agent_allowlist_boundary: loopback | private_tunnel | public | unknown
  registered_node_count:
  protected_material_store: ready | not_ready | unknown
  desired_state_summary:
  handoff_summary:
  receipt_summary:
  metering_state: healthy | degraded | failed | unknown
  identity_gate: verified | degraded | blocked | pending | unknown
vultr:
  jp_region_available: yes | no | unknown
  existing_jp_instance: yes | no | unknown
  firewall_and_dns_ownership: confirmed | conflict | unknown
  monthly_budget_limit:
  traffic_limit:
result: pass | blocked | not_run
blockers: []
evidence_refs: []
sensitive_values_excluded: true
~~~

不要填写真实 IP、CIDR、域名、账号 ID、Token、密码、私钥、UUID、订阅链接或客户身份。若后续精确 Gate 需要真实目标，放在获准的受保护执行输入中，不放进 GitHub 文档。

## 12. 回退方案

出现异常时：

1. 将 JP 通道设为 maintenance，阻止新订阅继续下发该节点。
2. 验证 BWH 不再向新订阅渲染该节点。
3. 等待客户端刷新及必要的连接排空。
4. 只停止本次批准范围内的 JP 协议服务和 Agent。
5. 撤销或轮换该节点 Agent 身份。
6. 保留数据库历史、计量、回执和审计记录。
7. 验收后再决定是否销毁 Vultr 实例。

禁止通过删除用户订单、清空历史用量、重置账本、复制旧节点数据库或清除审计记录完成回退。

## 13. 最终交付物

- [ ] BWH/Vultr 只读盘点报告。
- [ ] 私有隧道验收记录。
- [ ] JP 无密钥镜像及 SHA-256。
- [ ] Vultr JP 主机基础验收记录。
- [ ] BWH 节点注册记录和逻辑通道清单。
- [ ] 三协议配置测试结果。
- [ ] Agent dry-run / applied receipt 脱敏记录。
- [ ] Identity Gate before/after 结果。
- [ ] 用量统计归属验收结果。
- [ ] Clash/Mihomo 客户端 Canary 验收记录。
- [ ] 生产 Deploy Note。
- [ ] 节点回退及维护 Runbook。

## 14. 依赖与权威文档

- docs/NODE_ONBOARDING_RUNBOOK.md
- docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md
- docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md
- docs/CONTROL_DATA_PLANE_INTERCONNECT_CONTRACT.md
- docs/SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md
- docs/PROJECT_TOPOLOGY.md
- docs/IDENTITY_LIFECYCLE.md
- docs/INFRASTRUCTURE_ACCESS_RULE.md
- docs/VALIDATION_BASELINE.md
- docs/CURRENT_RELEASE_STATE.md
- RELEASE_MANIFEST.md

本任务只建立 JP 新节点的专项任务与证据边界。任何代码实现、Provider 操作、生产主机访问、网络/防火墙变更、凭据发放、运行时 Apply、计量切换、订阅解锁、晋升或回退，都必须走对应的独立 Gate 和明确审批。
