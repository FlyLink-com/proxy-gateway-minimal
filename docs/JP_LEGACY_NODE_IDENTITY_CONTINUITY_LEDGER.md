# 日本旧节点历史身份与业务连续性台账

Last updated: 2026-10-30 UTC

> document_metadata:
> - doc_type: operational
> - lifecycle: active
> - authority_scope: jp_legacy_node_identity_and_business_continuity
> - superseded_by: null
> - last_verified_at: 2026-10-30
> - production_authority: false
> - execution_authority: none
> - evidence_cutoff: repository records and operator-reported observations available on 2026-10-30
> - status: BLOCKED — historical physical identity, current dependency and continuity gates remain incomplete

## 1. 目的与使用边界

本台账用于固定日本历史生产主机、后续 JP 子节点候选实例、BWH 接管主机三套身份的区别，以及它们之间已留证和未闭环的业务关系。它是历史审计基线，不是实时资产清单，也不是生产操作授权。

本台账采用追加式记录。新证据应追加日期、来源、观察范围和状态，不得静默改写历史回执。若新证据与旧记录冲突，应并列保留并说明观察边界，不得用较新的摘要覆盖旧的执行事实。

证据状态约定：

| 状态 | 含义 |
| --- | --- |
| production_receipt | 仓库中有明确的生产执行回执；只对回执写明的范围和时间有效 |
| provider_observed_absent | 指定时间的 Provider 读取显示资源不存在；不等于已取得删除事件或完整账单结清 |
| operator_reported | 操作员报告已执行；尚无独立 Provider 事件或完整执行回执 |
| repository_recorded | 仓库文档、PR、Issue 或代码记录；不自动等于实时生产状态 |
| unknown | 当前证据不足；不得按通过处理 |
| not_run | 明确未执行 |
| not_authorized | 未获独立授权；不得推定可以继续 |

本文件不授权 SSH、Provider API、服务器登录、生产读取、DNS 或证书变更、资源清理、服务启停、配置下发、订阅变更、计量写入、账务调整或新节点创建。

为遵守仓库运行手册，本文件不重复历史公网 IP、完整 DNS 主机名、CIDR、Token、私钥、协议凭据、订阅 URL、原始环境变量、客户或账务明细。需要核对这些值时，应回到已有受控执行记录，并在单独批准的受保护输入中处理。

## 2. 三套物理 / 逻辑身份登记

### A. 早期日本生产主机

| 字段 | 当前台账值 | 证据状态 |
| --- | --- | --- |
| Provider | Vultr | repository_recorded |
| 区域 | Tokyo / nrt | repository_recorded |
| 历史实例标签 | gccgw-vultr-candidate | production_receipt |
| 逻辑运行别名 | vultr-nrt-a 在仓库测试/运行元数据中出现 | repository_recorded；未证明等于 Provider 物理实例身份 |
| 已有逻辑通道 | channel-vultr-a-tuic；channel-vultr-a-hy2 | 对应生产记录存在 |
| Provider instance ID | 未在已核对的早期部署回执中绑定 | unknown |
| nodeRef / physicalNodeRef | 未找到可核验的历史绑定 | unknown |
| 当前实例状态 | 操作员此前报告已人工销毁；仓库可核验回执只证明 2026-10-08 持久冻结 / 停止及 2026-10-09 作为退役只读来源记录 | operator_reported；Provider deletion proof unknown |
| 删除时间 / Provider audit event | 未找到 | unknown |

重要区别：

1. 2026-06-06 的独立候选部署回执把 gccgw-vultr-candidate 记录为东京 Vultr 主机，并记录 TUIC 通道和 Portal/TUIC 生产路径。
2. 2026-07-06 的 TUIC 与 Hysteria2 生产执行记录继续把同一历史日本目标作为运行配置、SNI 和证书操作对象。
3. 2026-10-08 的迁移回执记录 JP 原有服务被持久冻结；10-09 的协议迁移回执将日本通道角色迁至 BWH。
4. 用户/操作员报告的“旧日本主机已销毁”尚未与该早期主机的 Provider instance ID、删除时间和 Provider 删除事件对应起来。

vultr-nrt-a 是仓库中出现的逻辑/运行别名。现有证据不足以把它、gccgw-vultr-candidate 与后续 prod-edge-c 的 Provider instance ID 视为同一物理身份。

### B. 后续 JP 子节点候选实例 prod-edge-c

| 字段 | 当前台账值 | 证据状态 |
| --- | --- | --- |
| Provider | Vultr | repository_recorded |
| Region | nrt | provider receipt |
| 历史标签 | prod-edge-c | provider receipt |
| Instance ID | 185107dd-2162-40e4-a1bf-cbb16a4d8791 | local creation receipt / Issue #809 |
| 创建规格 | vc2-2c-4gb | local creation receipt |
| 创建回执 | active；render_joined=false | repository_recorded |
| 注册包 | role=data-plane；pool=recovery；lifecycle=private-validation；subscriptionEligible=false | repository_recorded |
| nodeRef / physicalNodeRef / channelRefs | 均未包含在注册包中 | unknown |
| 创建时间 | 回执缺少 date_created | unknown |
| 销毁状态 | 操作员报告已销毁；2026-10-30 14:37:16 UTC Provider lookup 返回 404，JP instance list total 为 0 | operator_reported + provider_observed_absent |
| Provider deletion event / 精确删除时间 / 对应 Risk A approval | 未取得 | unknown |

依赖资源的 2026-10-30 有界盘点：

| 资源 | 观察结果 | 不能据此推断的事项 |
| --- | --- | --- |
| 创建回执关联的 Firewall group | 仍存在，规则数 0 | 不代表可以删除 |
| Block storage volumes | 0 | 仅限该次返回范围 |
| Snapshots | 0 | 仅限该次返回范围 |
| Reserved IP | 返回 1 个；返回内容未关联该 instance ID 或标签，归属未证明 | 不得认领或释放 |
| Billing history | 返回的 10 条记录中没有该 instance ID 或标签 | 不是完整账单结清 |
| DNS / certificates | 未读取 | unknown |
| Monitoring / backups / alerting | 未完成核对 | unknown |

prod-edge-c 是后续独立子节点候选实例。它的销毁或 Provider 不存在状态，不证明早期 gccgw-vultr-candidate 已经完成物理退役，也不证明任何旧 channelRef 或证书依赖已经清除。

### C. BWH 接管主机

| 字段 | 当前台账值 | 证据状态 |
| --- | --- | --- |
| 逻辑主机标签 | bwh-us | repository_recorded |
| Provider | BWH | 2026-10-30 M0 回执记录 |
| 历史职责 | 账号、订单、订阅、凭据生命周期、Desired State、Handoff、Receipt 和用量账本控制面 | 2026-10-08 / 10-09 生产回执 |
| Provider instance ID / physicalNodeRef | 本轮核对未取得 | unknown |
| 2026-10-08 控制面 | BWH 控制服务启动；操作员确认在当时冻结服务范围内为唯一 active control-plane authority；JP 原有应用/协议/计量服务进入持久冻结 | production_receipt；仅限当时观察窗口 |
| 2026-10-09 数据面 | 原日本协议角色在 BWH 启动；三类协议配置各加载 30 个 principal；当时未重新读取完整业务映射 | production_receipt with limits |
| 2026-10-20 协议服务 | BWH 自有 Xray、Hysteria2、Mihomo/TUIC 单元被停止；控制面保持 active | production_receipt |
| 2026-10-30 控制面 / M0 | BWH Provider；proxy-gateway-candidate 角色 active；health=degraded；source release identity=unknown；Agent routes=enabled；Agent allowlist boundary=unknown；registered nodes=1；protected material store=unknown；Desired State=3（3 channels，newest 2026-06-11）；Handoff=unknown；Applied Receipts=1513（newest 2026-10-29）；public health=not read | PR #808 M0 receipt；repository_recorded，不是新鲜主机登录证明 |
| 2026-10-30 计量 / 身份 | metering=degraded；Identity Gate=unknown；metering timer=inactive | PR #808 M0 receipt；repository_recorded |
| 当前完整供流 / 计量健康 | 未取得同一观察边界下的完整证明 | unknown / degraded |

按 2026-10-08 / 10-09 的迁移与控制面 Deploy Notes，BWH 是迁移后业务数据和账本的权威边界；10-08 回执记录当时唯一 active control-plane authority。该历史回执不替代 2026-10-30 对 live release identity、当前控制面角色和 writer 状态的新鲜验证。发生回退时，必须使用最新 BWH 权威数据；不得直接恢复过期的 JP 数据快照覆盖后续写入。

## 3. 关键时间线

| 日期 / UTC | 事件 | 已证明内容 | 仍未证明 |
| --- | --- | --- | --- |
| 2026-06-06 | Vultr 独立候选部署 | gccgw-vultr-candidate 在 Tokyo/nrt 部署；Portal 与 TUIC 路径通过当时验证；记录 channel-vultr-a-tuic | 早期实例的 Provider instance ID、后续销毁事件 |
| 2026-07-06 | JP TUIC IPv6 / DNS 执行 | TUIC 使用 JP 证书材料；创建 JP TUIC AAAA 记录；当时 A/AAAA 解析均指向 JP | 这些 DNS 记录在 2026-10-30 的现值 |
| 2026-07-06 | JP Hysteria2 SNI / 证书对齐 | Hy2 证书与 SNI 对齐；channel-vultr-a-hy2 存在；服务重启后验证通过 | 后续 BWH 是否接管对应证书续期职责 |
| 2026-07-08 | Japan TUIC usage credential map rebuild | 受保护映射从 84 项调整为 79 项；add=1、remove=6、missingMaterial=0；后续 collector 28/28 记录，timer active | 迁移后的完整历史映射连续性 |
| 2026-09-19 | JP / SGP 证书自动同步 | PR #734 记录两地 helper / deploy hook 安装验证；JP 与 SGP 定向 staging renewal 成功 | 之后每轮自动续期持续成功 |
| 2026-09-24 | JP Certbot 失败观察 | Issue #746 记录 certbot.service 最近 exit 1、timer 仍启用及 ACME validation failure 类别 | 具体失败 lineage、挑战路径、当前任务与实际服务证书状态 |
| 2026-10-08 18:12 左右 | JP 权威数据迁移至 BWH | 生产回执记录五类权威数据迁移，456 个 authority objects / 386,120,027 bytes；源与目标快照校验通过 | 当前所有备份副本的保留状态 |
| 2026-10-08 18:57 UTC | BWH 控制面激活、JP 持久冻结 | BWH control service active；JP 原八个应用/协议/计量单元停止并加载持久退役条件；JP Nginx maintenance 保持 | 当前实时主机和所有依赖是否仍与回执一致 |
| 2026-10-09 01:14–01:20 UTC | BWH 协议角色启动 | BWH 三协议 active；每类配置加载 30 个 principal；统计接口为 loopback | 启动后的业务身份映射没有在该步骤重新读取，Identity Gate 未通过 |
| 2026-10-09 03:13–03:18 UTC | BWH 限范围 Nginx ingress | Portal / Sub / Admin 入口在 BWH 启用；当时健康与边界测试通过 | 用户登录、实际客户端、正向用量和所有域名迁移 |
| 2026-10-09 04:04–04:11 UTC | Portal / Admin / Sub DNS cutover | 五条 Portal/Admin/Sub A/AAAA 记录切换到 BWH；回执明确未修改协议 SNI 名称 | JP 协议 SNI DNS 当前是否仍指向旧主机 |
| 2026-10-12 | BWH local-three 计量新激活 | 新 activation、新 journal、零样本基线；保留旧 journal；两次自然采集出现正向增量 | 后续持续运行健康与全局身份健康 |
| 2026-10-12 after-read | Identity Gate 聚合 | 每协议 32 runtime / 32 mapped；missing、changed、missing_material 为 0；stale 为 89 / 76 / 88；state=degraded，retention=pending | 迁移前 before counts 未采集，不能补算完整 before/after |
| 2026-10-19–20 | BWH 分发候选上线与回退 | #795 记录新 app/Admin 候选指针；分发 flag 曾短暂启用后恢复 unset；没有保存新 route | 不得将这段 flag 试验描述为完成分发或供流切换 |
| 2026-10-20 02:16 UTC | BWH 自有协议单元停止 | Xray、Hysteria2、Mihomo/TUIC inactive/dead、disabled、MainPID 0；控制面仍 active | 之后是否重新启用，须有更新的同范围回执 |
| 2026-10-30 14:13 UTC | JP child-node M0 回执 | 记录 BWH Provider / 控制面角色 active、health degraded、注册节点 1、Desired State 3、Applied Receipt 1513、metering degraded、Identity Gate unknown、timer inactive | 不是完整实时主机读取；source release、handoff、allowlist、DNS/firewall 等仍 unknown |
| 2026-10-30 14:37 UTC | prod-edge-c Provider read | instance lookup 404；JP instance list total 0；部分依赖资源状态被读取 | Provider 删除事件、精确删除时间、完整账单与依赖资源清理 |

时间线只表示每份记录自己的观察窗口，不构成连续监控。特别是 2026-10-09 协议启动、2026-10-20 协议停止和 2026-10-30 M0 摘要之间，不得推断没有记录的状态变化。

## 4. 通道、节点身份与映射连续性

### 4.1 历史通道

| 逻辑引用 | 历史证据 | 当前物理归属 |
| --- | --- | --- |
| channel-vultr-a-tuic | 2026-06-06 候选部署；2026-07-06 TUIC 运行与 DNS 执行；2026-07-08 TUIC 用量映射重建 | unknown |
| channel-vultr-a-hy2 | 2026-07-06 Hy2 SNI / 证书 / 运行配置执行 | unknown |
| JP VLESS / Reality 角色 | 2026-10-09 BWH 三协议迁移回执确认 VLESS/Reality 角色启动 | 历史旧 JP 的精确 channelRef 与 physicalNodeRef 绑定仍需核对 |

架构计划中出现的 channel 名称或测试夹具，不自动构成生产节点注册、当前订阅输出或实际用户流量的证明。应以同一时点的注册表、运行配置、受保护映射、Desired State、Handoff 和 applied receipt 共同确定真实绑定。

### 4.2 身份字段缺口

| 字段 | 早期 JP | prod-edge-c | BWH |
| --- | --- | --- | --- |
| Provider instance ID | unknown | 已知 | unknown |
| nodeRef | unknown | unknown | M0 仅记录注册节点数量，未给出安全引用 |
| physicalNodeRef | unknown | unknown | unknown |
| channelRef → physicalNodeRef | 部分历史 channelRef 已知，物理绑定未闭环 | 未提供 | 需与当前注册表和回执核对 |
| edgeCredentialRef / material digest | 原始值不在本台账；聚合连续性未闭环 | 未提供 | 历史映射存在，当前 gate unknown |

### 4.3 Identity Gate 与保留要求

- 2026-07-08 日本 TUIC 映射重建是一次特定映射修复，不证明后续迁移后的所有身份均已对齐。
- 2026-10-09 BWH 三协议加载 30 个 principal 是配置加载证明，不等于业务映射完整。
- 2026-10-12 after-read 的 stale 89 / 76 / 88 仍使 Identity Gate 保持 degraded；retention=pending。
- 2026-10-30 M0 将 Identity Gate 记录为 unknown。不得把 10-12 的历史 after-read 改写成 10-30 的当前健康状态。
- 删除 stale map、撤销材料或清理旧节点前，必须完成残余连接、延迟采集和历史账本保留审查。历史 usage、receipt、audit 记录不得随主机退役删除。

## 5. DNS 与公网入口依赖

| 逻辑面 | 已有历史证据 | 当前状态 |
| --- | --- | --- |
| JP QUIC protocol-SNI | 2026-07-06 TUIC 记录新增 AAAA；当时 A/AAAA 均解析到 JP；Hy2 / TUIC 的 host、SNI 与证书 SAN 完成对齐 | 2026-10-30 未做实时 DNS 读取，unknown |
| Portal / Admin / Sub | 2026-10-09 五条 A/AAAA 记录切换到 BWH；当时递归 DNS 与 TLS 检查通过 | 仅为当时 cutover 证据，不是 10-30 实时解析证明 |
| prod-edge-c DNS | 2026-10-30 Issue #809 明确未读取 | unknown |
| Reserved IP | prod-edge-c 有界盘点返回 1 个未能关联实例的 Reserved IP | owner / consumer unknown |

10-09 DNS cutover 回执明确限定为 Portal、Admin、Sub 五条记录，并未修改 JP 协议 SNI 名称。不得把网站入口切换当作协议域名已迁移的证明。

当前 DNS 核验应逐条绑定记录 ID、当前值、TTL、用途、消费者与回退对象；不能按历史主机 IP 或域名名称直接删除记录。

## 6. 证书与自动续期依赖

| 日期 | 证据 | 结论 |
| --- | --- | --- |
| 2026-07-06 | JP TUIC / Hysteria2 证书域名对齐记录 | 当时 runtime certificate SAN、key pair、host/SNI 与服务监听验证通过 |
| 2026-09-19 | PR #734 Deploy Note | JP 与 SGP 的 certificate sync helper / Certbot deploy hook 安装并验证；定向 staging renewal 成功；未强制生产证书重新签发 |
| 2026-09-24 | Issue #746 | JP certbot.service 最近 exit 1，timer 仍 enabled；有限 journal 显示 ACME validation failure 类别；所查公有证书文件到期日为 2026-12-18，但不代表所有 lineage 或实时服务链 |
| 2026-10-08 | PR #752 BWH 迁移准备记录 | 部分证书辅助文件被准备/安装；记录明确未完成 Certbot 安装、续期和 hook 实际运行验收 |
| 2026-10-30 | Issue #809 | DNS 与 certificates 未读取，状态 unknown |

因此，目前不能宣称 BWH 已完整接管 JP 证书续期，也不能宣称旧 JP 证书依赖已解除。继续核对时必须区分：

1. Certbot timer/service 状态；
2. 每条证书 lineage 的续期消费者和 deploy hook；
3. 证书文件有效期；
4. 实际 TUIC/Hy2 服务呈现的证书 SAN 与 key pair；
5. DNS/SNI 是否仍指向相应运行时；
6. 证书续期失败时的告警、人工处置与回退责任。

不得因为历史 staging renewal 成功，就忽略 2026-09-24 的 Certbot 失败观察。

## 7. 计量、账务与历史数据保留

### 7.1 已有计量证据

| 日期 | 范围 | 结果 |
| --- | --- | --- |
| 2026-07-08 | Japan TUIC | 受保护 usage credential map 重建；84 → 79，add 1、remove 6、missing material 0；后续 collector 28 observations / 28 recorded，timer active |
| 2026-10-09 | BWH 三协议 | 协议配置加载 30 principals / protocol；该步骤未重新读取完整业务映射 |
| 2026-10-12 | BWH local-three | 新 activation / 新 journal / zero-sample baseline；旧 journal 保持只读；两次自然 collection 有正向增量 |
| 2026-10-12 after-read | BWH local-three identity | 32 runtime / 32 mapped per protocol；stale 89 / 76 / 88；Identity Gate degraded；retention pending |
| 2026-10-30 | M0 摘要 | metering degraded；Identity Gate unknown；metering timer inactive |

10-20 BWH 协议停止回执当时说明 Nginx 与 metering timer 未在该次协议停止操作中改变。10-30 M0 摘要则记录 timer inactive。两条记录属于不同时间点；中间缺少可证明 timer 状态变化的完整回执，应保留为待核差异。

### 7.2 账务与历史数据原则

- 旧 JP journal、checkpoint、usage ledger、accepted SQLite usage、订单与 entitlement 历史必须保留。
- 2026-10-12 新 activation 的零样本基线用于避免对暂停区间追扣；不得恢复旧 journal 去追赶暂停区间。
- 不得推算、补造或历史 backcharge 未采集区间流量。
- 不得用旧 JP 数据库覆盖较新的 BWH 权威数据。
- 旧身份保留或退役必须先核对 residual connections、delayed observations、retention review 和历史账本关联。
- 任何账务完整性结论必须来自同一稳定观察边界的 accepted samples、rollups、identity map 和 collector checkpoint；单独的 timer active / service success 不足以证明计量正确。

## 8. 依赖资源与退役状态

| 依赖 | 早期 JP 生产主机 | prod-edge-c | BWH 接管主机 |
| --- | --- | --- | --- |
| Provider instance ID / deletion event | unknown | instance ID 已知；404/list=0；删除事件 unknown | physical ID unknown |
| Firewall / Security Group | unknown | group 仍存在、0 rules；未删除 | 当前边界 unknown |
| Reserved IP | unknown | 1 个未证明归属 | unknown |
| Volumes / snapshots | unknown | 0 / 0（有界盘点） | 历史备份存在记录；当前清单 unknown |
| DNS | 历史 JP SNI 记录存在；当前值 unknown | 未读取 | Portal/Admin/Sub 10-09 切换有回执 |
| Certificates / Certbot | 历史 JP consumer 与 hook 有记录；后续任务失败 | 未读取 | 完整续期接管未证明 |
| Monitoring / alerts | unknown | unknown | unknown |
| Billing closeout | unknown | 仅检查 10 条记录且无匹配，不是完整结清 | unknown |
| Historical usage / receipts | 必须保留 | 未证明有独立账务身份 | BWH 是迁移后权威数据边界 |

资源清理必须逐项、逐资源 ID、逐消费者审批。不得将“实例不存在”解释为 Firewall、Reserved IP、DNS、证书、备份、监控、账单或历史计量依赖均可删除。

## 9. M0 剩余闭环与验收标准

当前总状态：**BLOCKED**。PR #808 的 M0 回执与审查仍将 M0 标记为 blocked；M1–M8 未开始且未获授权。PR #808 的 exact-head review 明确要求保留拓扑冲突、旧节点销毁证据缺口和 live source identity 缺口；后续本地文档检查通过只关闭了文档校验项，没有改变生产状态。

| M0 维度 | 2026-10-30 已记录结果 | 状态 |
| --- | --- | --- |
| BWH Provider / service role | BWH；proxy-gateway-candidate active | repository_recorded；live identity 未复核 |
| BWH source release identity | unknown | BLOCKED |
| BWH public health | not read | UNKNOWN |
| Agent routes | enabled | repository_recorded |
| Agent allowlist boundary | unknown | BLOCKED |
| Registered node count | 1 | repository_recorded；nodeRef / physicalNodeRef 未核对 |
| Protected material store | unknown | BLOCKED |
| Desired State | 3；3 channels；newest 2026-06-11T08:41:30Z | BLOCKED freshness |
| Handoff | unknown | BLOCKED |
| Applied Receipts | 1513；newest 2026-10-29T05:15:45Z | repository_recorded；freshness / mapping 未核对 |
| Metering / Identity Gate | degraded / unknown | BLOCKED |
| Metering timer | inactive | BLOCKED |
| Existing JP instance | no（仅限 2026-10-30 M0 / Provider 观察范围） | repository_recorded |
| Firewall / DNS ownership | unknown | BLOCKED |
| Monthly budget / traffic cap | unknown | BLOCKED |
| Topology authority | `PROJECT_TOPOLOGY.md`（2026-07-15）、`PRODUCTION_EDGE_FLEET.md`（2026-07-07）和 `VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md`（2026-07-24）仍写 JP control plane；2026-10-08/09 BWH Deploy Notes 记录 BWH control activation / ingress / DNS cutover | dated-source conflict；须由 live read + operator decision 解决 |

下列项目全部通过前，不得宣布历史日本节点业务连续性闭环，也不得据此批准新 JP 节点正式供流。

### P0 — 身份与业务权威

- [ ] 为早期 gccgw-vultr-candidate 找到 Provider instance ID、region、创建/删除事件与精确时间；若历史证据无法恢复，形成明确的不可恢复说明和负责人签认。
- [ ] 将早期主机、逻辑别名 vultr-nrt-a、历史 channelRef 与 physicalNodeRef 的对应关系固定；无法证明的字段保持 unknown。
- [ ] 对 prod-edge-c 保留独立身份记录，不将其销毁事件映射到早期主机。
- [ ] 以新鲜、同一观察边界的证据确认 BWH 当前控制面主机、release identity、source commit、Provider 身份和唯一业务权威角色。
- [ ] 核对当前注册表中的 nodeRef / physicalNodeRef / channelRef、Desired State generation、Handoff、pending/applied Receipt 的数量、状态与 freshness。
- [ ] 核对当前订阅渲染不再输出已退役旧节点；同时核对旧节点是否仍被 active credential、runtime config、collector 或延迟 receipt 引用。

### P0 — DNS、证书与网络消费者

- [ ] 对 JP protocol-SNI 记录进行精确、只读的当前 DNS A/AAAA/CNAME 读取；绑定记录 ID、当前值和 TTL。
- [ ] 确认旧 JP 与 BWH 哪一方是当前证书 lineage、Certbot timer、deploy hook 和协议服务的实际消费者。
- [ ] 核对 Certbot 当前失败原因、lineage、challenge 和告警责任；不得直接执行 renew 或修改 DNS。
- [ ] 核对 prod-edge-c 关联 Reserved IP 与 Firewall group 的实际消费者和所有权。

### P0 — 计量与历史账务

- [ ] 在新鲜稳定边界重新计算每协议 runtime / mapped / missing / stale / changed / missing_material。
- [ ] 说明 2026-10-12 stale 89 / 76 / 88 的保留依据、关联范围和 retention decision。
- [ ] 核对 collector 当前 release、配置摘要、timer/service、journal/checkpoint、last successful natural collection 时间。
- [ ] 至少取得两个自然采集周期的连续正向证据，并确认 accepted usage / rollup 增量一致、无重复或无归属记录。
- [ ] 确认历史 usage、receipt、audit、backup 保留；不追扣暂停区间、不清空账本。

### P1 — 资源与财务结清

- [ ] 逐项确认 Firewall、Reserved IP、volume、snapshot、DNS、certificate、monitoring、backup 和 alerting 的 owner、consumer、保留要求。
- [ ] 获取覆盖完整计费周期的账单结清证据；10 条历史记录无匹配不能作为结清证明。
- [ ] 仅在资源消费者已证明不存在、备份与保留要求已满足、且每项有独立批准后，才可提出资源清理。

### 通过条件

1. 三套物理身份不再混淆，所有未知身份均有明确处置。
2. BWH 当前控制面权威与 release identity 有新鲜证据。
3. 旧 JP channelRef、运行身份、材料映射、Desired State、Handoff、Receipt 和订阅输出已对齐。
4. DNS / certificate / renewal 的实际消费者与责任人明确。
5. 计量连续性与历史账务保留有可核验证据。
6. Provider 依赖资源、监控、备份和账单逐项结清或有明确保留责任。
7. 所有生产读取或变更均有各自精确 Risk A gate 和一次性执行回执。

## 10. 明确禁止的推断与操作

- 不得将 prod-edge-c 的 404/list=0 作为早期 JP 生产主机已销毁的证明。
- 不得把历史逻辑别名、channelRef 或测试夹具直接当作 Provider 物理实例身份。
- 不得把 2026-10-09 BWH 协议启动记录当作 2026-10-30 当前协议健康证明。
- 不得把 2026-10-12 两次自然采集成功当作持续计量健康证明。
- 不得把 2026-10-09 Portal/Admin/Sub DNS cutover 当作 JP protocol-SNI 已切换证明。
- 不得把 2026-09-19 staging renewal 成功当作 2026-09-24 之后所有证书任务均健康的证明。
- 不得删除旧 journal、checkpoint、usage ledger、receipt、audit、备份或身份映射以“清理旧节点”。
- 不得自动释放 Reserved IP、删除 Firewall group、DNS 或证书 lineage。
- 不得为填补本台账而直接访问生产主机、Provider、DNS 或证书服务；每一项实时读取必须另行审批。

## 11. 主要证据索引

以下链接指向原始历史记录。本台账只提取其明确范围内的结论，不替代原始执行回执。

| 来源 | 用途 |
| --- | --- |
| [2026-06-06 Vultr independent candidate deployment](production-replacement-records/2026-06-06-vultr-independent-candidate-deployment.md) | 早期日本候选主机标签、TUIC 通道和 Portal/TUIC 生产路径 |
| [2026-07-06 JP TUIC IPv6 production execution](production-replacement-records/2026-07-06-jp-tuic-ipv6-production-execution.md) | JP TUIC 运行配置、DNS A/AAAA 历史状态 |
| [2026-07-06 JP Hysteria2 IPv6/SNI execution](production-replacement-records/2026-07-06-jp-hy2-ipv6-sni-production-execution.md) | JP Hy2 通道、SNI 与证书状态 |
| [2026-07-06 JP TUIC/Hy2 certificate alignment](production-replacement-records/2026-07-06-jp-tuic-hy2-cert-domain-alignment.md) | TLS SAN、证书路径与服务验证 |
| [2026-07-08 Japan TUIC usage credential map rebuild](production-replacement-records/2026-07-08-japan-tuic-usage-credential-map-rebuild.md) | 日本 TUIC 身份映射与历史采集 |
| [PR #734 failed attempt withdrawn](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/734#issuecomment-5740925414) | 2026-09-19 首次 Certbot staging rehearsal 超时并撤回；未安装自动同步 |
| [PR #734 successful synchronization Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/734#issuecomment-5740969069) | 后续单次执行在 JP/SGP 安装并验证 helper/deploy hook；定向 staging renewal 成功；未强制生产证书重签 |
| [Issue #746 Certbot diagnosis](https://github.com/FlyLink-com/proxy-gateway-minimal/issues/746) | 2026-09-24 日本 Certbot 失败观察 |
| [PR #752 data migration Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/752#issuecomment-6066232377) | 2026-10-08 JP → BWH 五类权威数据迁移；BWH 当时保持 inert，456 个 authority objects / 386,120,027 bytes |
| [PR #752 BWH control activation Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/752#issuecomment-6067109165) | 2026-10-08 BWH control active、JP 持久冻结；记录当时唯一 active control-plane authority 的操作员确认 |
| [PR #752 BWH protocol activation Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/752#issuecomment-6072373682) | 2026-10-09 原 JP 三协议角色在 BWH 启动；30 principals / protocol；Identity Gate 仍 pending |
| [PR #752 BWH ingress Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/752#issuecomment-6073584759) | 2026-10-09 BWH Portal/Sub/Admin ingress；明确当时不是 DNS cutover |
| [PR #752 BWH DNS cutover Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/752#issuecomment-6074115920) | 2026-10-09 五条 Portal/Admin/Sub DNS 记录切换；JP protocol-SNI 未修改 |
| [FULL_METERING_NEW_ACTIVATION_RECOVERY.md](FULL_METERING_NEW_ACTIVATION_RECOVERY.md) | 2026-10-12 新 activation、journal、自然采集与身份限制 |
| [PR #776 metering recovery Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/776) | 2026-10-12 BWH local-three 新 activation 与自然采集执行回执 |
| [PR #777 aggregate identity checker](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/777) | 2026-10-12 after-read 身份聚合与 stale 统计来源 |
| [IDENTITY_LIFECYCLE.md](IDENTITY_LIFECYCLE.md) | Identity Gate 计数语义、retention 与禁止事项 |
| [Issue #795 BWH distribution / supply follow-up](https://github.com/FlyLink-com/proxy-gateway-minimal/issues/795) | 2026-10-19–20 BWH 指针、分发开关与协议停止记录 |
| [Issue #809 exact-target JP retirement M0](https://github.com/FlyLink-com/proxy-gateway-minimal/issues/809) | prod-edge-c Provider 读取、资源依赖与销毁证据缺口 |
| [PR #808 JP child-node M0 runbook](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/808) | 2026-10-30 M0 汇总；当前为 Draft，回执不是实时主机证明 |
| [PR #808 exact-head review](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/808#pullrequestreview-5713679877) | 明确 M0 remains BLOCKED、M1–M8 not authorized，并指出销毁与只读回执边界、拓扑冲突及身份缺口 |
| [PR #808 documentation validation follow-up](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/808#issuecomment-6525639150) | exact-head docs authority / diff check passed；hosted CI skipped，不能当作 production acceptance |
| [PROJECT_TOPOLOGY.md](PROJECT_TOPOLOGY.md) | 2026-07-15 旧架构记录，仍把 JP 写为 subscription control plane |
| [PRODUCTION_EDGE_FLEET.md](PRODUCTION_EDGE_FLEET.md) | 2026-07-07 规划文档仍把 Vultr Japan 写为 control-plane authority；不是实时资产清单 |
| [VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md](VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md) | 2026-07-24 状态文档仍把 JP 写为 subscription control plane；PR #808 review 将其列为拓扑冲突来源 |

## 12. 台账变更记录

| 日期 | 变更 | 证据 |
| --- | --- | --- |
| 2026-10-30 | 初版建立并经 M0 证据复核；补充 BWH M0 状态、PR #808 exact-head review、BWH Deploy Note 的真实范围及当前阻塞项 | PR #752 Conversation Deploy Notes、#734、#776、#777；Issue #746、#795、#809；PR #808 M0 receipt / review / follow-up |

后续更新必须保留历史行，不得把 operator_reported 改写成 provider_verified，也不得把 unknown 改写成 pass，除非新增证据明确覆盖同一物理身份和同一依赖范围。
