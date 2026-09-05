# 主流量计量恢复：准备、首次入账与生产门禁

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: traffic_metering_recovery
  superseded_by: null
  last_verified_at: 2026-09-05
  production_authority: false
```

- Risk: A；本次授权仅覆盖本地补丁、隔离验证和恢复方案准备。
- Process: 只读证据 -> 最小补丁与 TDD -> 隔离验证 -> 精确生产审批包 -> 经批准执行 -> 自然周期验证与收尾。
- Expected PR count: 1，包含意图、实现、测试和本 runbook；生产门禁另行审批，不拆空的 spec PR。
- Validation: targeted tests、`npm test`、diff check，以及下述恢复边界的隔离证据。
- Production/AWS impact: 当前为 none；尚未批准部署、服务操作、采集、计数清零、游标改写、数据库恢复或客户扣量。
- release_unit: `control-plane-app`；2026-09-05 第一阶段启动隔离补丁的 `identity_impact: false` 为历史记录。本轮包含严格 Xray 身份解析、定向 baseline 与 collector scope 准入，声明 `identity_impact: true`；执行前后必须满足 aggregate-only Identity Gate，不以“未修改凭证材料”豁免该门禁。

## 故障依据和本次范围

2026-09-05 的只读检查记录主采集入口因
`coin_commerce_prerequisite_missing` 初始化失败，最后成功时间为
2026-08-01 15:38 UTC，主链路覆盖日本 Hy2/TUIC/VLESS 和 SGP Hy2/VLESS。
SGP TUIC 独立 sidecar 仍有成功入账，并与主应用、主采集器共享数据库。
这些是故障调查的带日期事实，执行前必须重新核验。

故障调查提供的生产 release 是
`control-plane-d692633a107b-ingress-e77b4050`；不能用它替代执行当天的
current pointer、unit、process CWD、文件哈希和数据源 readback。
较旧的 release 状态文档也不能覆盖新的现场证据。

本补丁用采集器专用 env 副本关闭八个不相关的初始化开关，隔离
commerce/payment/welcome 等依赖，不修改传入 env 或 Web 主入口。
正常 `--collect` 保留现有采集、记账和额度生命周期语义。
新增的 `--recovery-preflight` 只提供恢复审查证据，不控制正常采集是否准入，
不新增 continuity checkpoint、force 开关或自动恢复策略。

本轮进一步实现独立 VLESS baseline 命令和显式 `--recovery-scope-file` 临时
采集入口。该入口只构造批准的日本/SGP VLESS collectors，使用严格、非清零
Xray 快照，先验证受保护计划与执行 receipt，随后限定记账范围。没有 scope
参数的原 `--collect` 语义保持不变；不能仅部署补丁就放开原主定时器。
临时 scope 的 `record-only` 模式同时推迟 suspend 与 rollover，必须获得明确的
短期额度执行政策审批，不能把它作为永久关闭额度生命周期的方式。

**部署前必须先按精确审批停止主定时器，并确认主采集器没有运行。**
否则修复初始化后，下一次定时运行就可能按原有语义补记历史累计差额并触发额度动作。
在逐通道首次入账政策、备份和精确执行命令获得审批前，不得把补丁放到
可自动执行的位置，不得执行 `--collect`。源代码验证通过不代表生产恢复完成。

代码事实要求以下边界：

- `scripts/traffic-usage-collect-once.mjs` 的 `--collect` 调用 `collectAndRecord`；普通检查模式仍会构建 runtime，不能未经审计就当作生产只读命令。
- `server/services/edge/hysteria2-usage-collector.mjs` 调用统计 reader 时使用 `clear: true`；“读取 Hy2 计数”可能清掉远端计数，因此是有副作用动作。
- `server/services/edge/runtime-usage-atomic-calculator.mjs` 对累计计数使用旧游标计算差额；计数下降或游标缺失有特殊分支，不能靠删除游标恢复计量。
- `server/services/platform/usage-billing-cycle.mjs` 按样本 `observedAt` 选择账期；现有入口未提供把长断档累计差额可靠拆回历史账期的机制。
- `server/services/platform/runtime-usage-accounting.mjs` 入账后可能调用 traffic-supply suspend，并执行账期 rollover sweep；关闭一个额度开关不等于整个调用链只读。

## 阶段 1：隔离环境与补丁验收

验证环境使用本次精确 worktree/candidate 文件，临时目录、合成 SQLite 数据、
本地 fake readers 和 fake lifecycle gate。不得复制生产 `.env`、数据库、
账号、token、usage map 或 controller payload；不得连真实统计端点。
固定候选 source/hash、依赖安装来源与版本、Node 版本、测试命令和退出码。
隔离 fixture 只证明源代码契约；没有验证 Linux/systemd 或真实 runtime 的部分明确标成未执行。

TDD 证据必须覆盖：

| 场景 | 验收要求 |
| --- | --- |
| 原故障配置的合成复现 | 补丁前失败，补丁后采集器可初始化；原始 env 对象没有被改写 |
| 不相关商业功能已开启 | 采集器无须 commerce/payment/welcome 依赖；Web composition 行为不变 |
| 只读恢复预检 | 在 runtime 构造前分支并返回；runtime factory、collector reader、记账、游标更新、suspend 和 rollover 调用次数均为零 |
| 状态缺失、损坏或过期 | 脱敏报告信息缺口/待审查原因，不初始化状态或数据库，不修正成功时间 |
| 最近有效状态与长断档状态 | 预检始终为待审查证据，`productionCollectionAuthorized=false`；新鲜状态也不授权采集 |
| 数据库聚合 | 仅读取既有 samples、rollups、counter cursors 三表的聚合数据；合成 DB 内容和状态文件保持不变 |
| 正常采集回归 | 原有 `--collect` 仍走原采集/记账/额度链路；不得把预检添加成自动 gating 或重设正常语义 |
| reader 会清零 | 预检模式的 Hy2 reader 调用次数为零 |
| 输出安全 | 故障摘要不含 raw env、凭证、订阅 URL、客户标识或数据库行 |
| VLESS 定向基线 | 35 天旧量只保留证据；只更新完整且已绑定的目标 cursor；原样本/rollup 和非选通道不变，下一真实记账只计 T0 后新量 |
| 原子性与重放 | 后项约束失败回滚全部 cursor；DB/binding/schema/目标账本/游标漂移阻断；精确 before 可 CAS，精确 after 可 no-op，其余状态只读核对 |
| scope 隔离 | 非选 Hy2/TUIC reader 调用为零；Xray 缺失/重复/不完整计数拒绝；读取完成后、入账前再次核验 packet 与准入 |
| 批次完整性 | beforeRecordGuard 将原计划、当前 durable binding/cursor 与全部 observations 的完整 keyset 逐项对应；缺整个用户、额外用户、重复、计数下降、时间回退/未来均整批零记账 |
| 临时生命周期 | suspend 与 rollover 两条路径均 deferred；主全量状态文件不被临时 VLESS 状态覆盖 |
| 有效窗口 | baseline 计划最多 300 秒；scope 最多准备后 24 小时；cursor 超过 900 秒、未来时间或任一 entitlement 实际账期变化均阻断 |

本地可执行验证基线：

```powershell
node --test server/tests/traffic-usage-collect-once.test.mjs
node --test server/tests/traffic-usage-recovery-preflight.test.mjs
node --test server/tests/traffic-recovery-online-backup.test.mjs
node --test server/tests/traffic-vless-recovery-baseline.test.mjs server/tests/traffic-vless-recovery-command.test.mjs server/tests/traffic-vless-recovery-integration.test.mjs server/tests/traffic-vless-recovery-scope-command.test.mjs server/tests/traffic-collector-scope.test.mjs
node --test server/tests/runtime-usage-accounting.test.mjs server/tests/edge-runtime-usage-atomic-calculator.test.mjs server/tests/platform-usage-billing-cycle.test.mjs server/tests/platform-usage-quota-lifecycle-gate.test.mjs
npm test
git diff --check
git diff --check origin/master...HEAD
```

上面是命令清单，不是通过记录。最终测试文件、实际 red/green、pass/fail/skip
数和完整套件限制由候选验证记录填写；不得把 unrelated baseline failure 隐去。

## 只读恢复预检接口

```text
node scripts/traffic-usage-collect-once.mjs --recovery-preflight
```

需要 `SUBSCRIPTION_CONTROL_DB_PATH` 与 `EDGE_USAGE_COLLECTOR_STATUS_PATH`。
在生产使用时只能从主机既有受保护配置将这两个值带入当前进程，不输出原文，
不复制 `.env`，不把路径/凭证写进 shell 历史、命令回执或本地 fixture。
具体主机、Node、candidate、读取方式和命令仍须绑定到本次只读 inventory 范围。

该模式在构造 runtime 前返回，仅读取已有 status 文件和
`platform_usage_samples`、`platform_usage_rollups`、
`platform_usage_counter_cursors` 三表的聚合事实，不创建数据库/表、不写状态、
不访问远端 stats reader。报告返回 `requires_review` 和
`productionCollectionAuthorized=false`，用于后续逐通道审查。
CLI 始终以退出码 `2` 返回，表示仍需审查；报告中的 `ok` 只表示读取是否完成。
与 `--collect`、`--check` 或其他参数组合时直接拒绝，不构造 runtime。
“数据库只读”指不修改业务数据或 schema；SQLite 仍可能维护读锁与 WAL/SHM
文件。不得使用 `immutable` 绕过活跃 WAL；隔离测试另行验证已有 writer 和
WAL 的读取不会修改主库/WAL 内容，且原 writer 能继续提交。
任何时间戳、健康标签、计数或预检退出码都不能代替入账审批；status 不是
accounting authority，不能证明历史累计量属于哪个账期。

## 阶段 2：首次入账策略

默认政策：无法证明身份、计数连续性和账期归属的历史差额，不自动扣入当前账期。
不清空旧游标，不改写历史样本来制造连续记录，不按天均摊推算真实客户用量。
应保留受保护的旧计数/游标证据并把不可追回部分列为待核对缺口；对外仅输出
通道级计数、总字节数、时间范围和原因分类。

每条主链路分别填写下表；SGP TUIC sidecar 不并入主链路恢复游标或差额：

| 检查项 | 必须具备的证据 |
| --- | --- |
| 计数语义 | cumulative、read-and-clear 或 connection delta；是否存在非清零读取 |
| 旧边界 | 最后可信采集时刻、受保护游标快照身份、当前账期边界汇总 |
| 连续性 | runtime 重启/reset/版本或计数模式变更历史；无法证明则标 unknown |
| 身份 | 依据 `docs/IDENTITY_LIFECYCLE.md` 的 aggregate-only Identity Gate；有 missing/stale/changed/missing_material 不得称 healthy |
| 差额 | 可验证累计量、可分账量、不可可靠追回量分别汇总；不猜缺失流量 |
| 处置 | 历史差额保留待处理；首个新计量边界的准确定义、数据动作、最大影响 |

### 五通道首次入账策略候选

下表是当前源码约束下的具体策略，不是已执行 baseline。待审批政策为：
不能可靠分账的历史差额保留为缺口证据，批准时刻 T0 之后的新量才进入新计量边界。

| 主通道 | 已核实源码语义 | 首次边界策略与必要审批 |
| --- | --- | --- |
| 日本 Hy2 | read-and-clear delta；collector 固定 `clear:true`，无累计 cursor | 先核实统计源和 identity scope。若确为共享源，按统计源一次切换，将清零返回的历史量保存为受保护证据，不进入当前扣量；receipt 完成后计新量。精确审批包含不可逆清零及证据写入，不能每通道各 clear 一次。 |
| SGP Hy2 | 与日本 Hy2 复用同一个 reader 和配置 URL；默认 reader 不读取 `channelRef` | 当前保持 NO-GO。先证明共享源确实包含 SGP 的流量及 binding；若不包含，必须准备独立来源接线，启动修复不能恢复该通道。不得把后一次调用返回空值当作 SGP idle。 |
| 日本 TUIC | 主 reader 默认 cumulative；`connections` 载荷先按 credential 汇总当前连接，再作累计差分 | 核实实际 source/path 后保存 T0 快照，定向更新批准的 `(source, channel, credential)` cursor，保留旧值和 epoch 证据，不生成历史 sample/rollup 或生命周期动作。若来源为活动连接合计，关闭连接可导致计数下降；一次新基线不能解决这种持续精度限制。 |
| 日本 VLESS | Xray statsquery cumulative，命令不带 reset | 从日本来源非清零读取 T0，保存证据并定向建立新 cursor 边界，旧 epoch 不归零；之后仅计 T0 后差额。读数至提交间发生 reset/身份变化/并发 cursor 写入时停止重核，不重启 runtime 来归零。 |
| SGP VLESS | 同类 Xray reader，实际 binary/server/channel scope 按各 source 配置 | 独立核实 SGP 来源，再取该源 T0 快照和定向 cursor 边界；不能复用日本返回值，也不能按相同 sourceRef 合并通道。本地转发可达不证明来源正确。 |

上述 Hy2 来源共享是 `server/state.mjs` 中 `createHysteria2TrafficStatsReader`
及 Hy2 collector composition 的代码事实；已有现场证据未证明日本/SGP 来源
独立，清零准入保持 NO-GO。远端清零后响应丢失或本地证据持久化失败，无法由
SQLite 事务恢复远端计数，不能盲目重试后把零值当作成功 receipt。

日本 TUIC 主入口使用 `mihomo-external-controller-usage-reader.mjs`，不是
SGP sidecar 的 `mihomo-connection-delta-usage-reader.mjs`。本次没有改动这两种
reader 或它们的精度边界；必须在验收中记录真实来源是否提供稳定累计总量。
Xray 来源使用 `xray-stats-cli-usage-reader.mjs`；长断档中 reset 后计数再次超过
旧值的情形，当前数值比较不能识别，因此不能由差额推断历史用量完整。

SGP TUIC sidecar 的 connection state 和持续入账不属于上述 baseline 范围。
保持其正常运行和状态文件；不得用清空 sidecar state 作为主链路恢复步骤。
本轮已增加 `scripts/lib/traffic-vless-recovery-baseline.mjs` 与
`scripts/traffic-vless-recovery.mjs`，只对 VLESS 提供上述独立定向基线；通用
累计记账服务没有新增自动历史补量政策。Hy2/TUIC 仍需各自独立方案与审批，
不能通过普通 `--collect`、删除游标或手写 SQL 临时代替。

VLESS baseline 只接受所选 channel 的完整 durable binding 与已有 cursor
集合，验证 active account/link/entitlement、issued request、有效期与材料
指纹。不支持 legacy fallback、新建缺失 cursor、忽略 orphan/inactive 项或
部分 snapshot；任何此类情况都保持 NO-GO，先完成独立 identity/retention 审查。
计划保留旧/新 cursor（包括 epoch）和 binding、目标账本、schema、数据库对象
身份指纹；数据库身份不使用会随 sidecar 写入变化的 mtime 或整库文件摘要。
`BEGIN IMMEDIATE` 内全部比较、更新及回读，既有样本/rollup 不变；计数不会
远端清零。CLI 不暴露 `counterResetConfirmed`：当前计数下降时直接 NO-GO，
不能把 helper 内部受约束的 reset 分支视为操作员通用 override。

计划与 receipt 的存在只证明本次受约束数据动作，仍需精确 operator approval。
任何源、范围、哈希、材料或时间变化都重新审查。手写 fresh 状态、删除状态/
游标、直接运行无 scope 的 `--collect` 不能替代门禁。

Hy2 如不能非清零读取：只读 inventory 到此停止；首次 `clear: true` 必须进入
独立的 exact approval。远端已清零但本地证据/入账失败时无法靠代码回退恢复计数，
因此 baseline 设计必须先处理这个失败窗口，不能在生产上试运行后再补方案。

## 已实现的 VLESS 命令与受保护文件契约

以下 JSON 是结构示例，`<...>` 必须由现场只读 inventory 或本次精确制品记录
填入；不得把示例作为可直接执行的生产包。文件仅保留在生产主机受保护目录，
父目录 `0700`、文件 `0600`，校验 ownership 和 symlink/reparse 边界；不下载
request、private plan、原始 stats、数据库或凭证映射。stdout 只保留固定状态、
摘要、计数及布尔值。

`request.json`：

```json
{
  "schemaVersion": 1,
  "dbPath": "<现场确认的共享 SQLite 绝对路径>",
  "channelRefs": ["channel-vultr-a-vless-reality-tcp", "channel-sgp-a-vless-reality-tcp"],
  "sources": [
    {"channelRef": "channel-vultr-a-vless-reality-tcp", "xrayBinary": "<日本 reader 对应的无 symlink 绝对 binary 路径>", "binarySha256": "<现场 binary SHA256>", "statsServer": "127.0.0.1:<日本统计转发端口>"},
    {"channelRef": "channel-sgp-a-vless-reality-tcp", "xrayBinary": "<SGP reader 对应的无 symlink 绝对 binary 路径>", "binarySha256": "<现场 binary SHA256>", "statsServer": "[::1]:<SGP统计转发端口>"}
  ],
  "validForSeconds": 300
}
```

可选择上述固定 VLESS channel 的精确非空子集，`sources` 必须一一对应；未知/
重复/空 channel 拒绝。stats server 仅接受 `127.0.0.1:port` 或 `[::1]:port`，
loopback 地址本身不证明远端来源正确，必须另有隧道/服务/source readback。
binary 路径与 SHA-256 来自现场固定执行对象；不能替换成未核验的 PATH 查找。
`validForSeconds` 为 1..300，实际到期时间还受最早 observation 的 300 秒窗口
限制。prepare 从现有库检查 scope，读取非清零 Xray snapshot，再校验绑定与
游标指纹；uplink/downlink 必须完整成对，缺失用户不能补零。T0 是各条真实
snapshot 的观察时间，不是稍后的 apply 时间。

```bash
"<已核验 Node 绝对路径>" "<candidate>/scripts/traffic-vless-recovery.mjs" prepare --request "<protected>/request.json" --plan "<protected>/plan.json"
"<已核验 Node 绝对路径>" "<candidate>/scripts/traffic-vless-recovery.mjs" apply --plan "<protected>/plan.json" --expect-sha256 "<prepare 返回的 planFileSha256>"
"<已核验 Node 绝对路径>" "<candidate>/scripts/traffic-vless-recovery.mjs" verify --plan "<protected>/plan.json" --expect-sha256 "<同一 planFileSha256>"
"<已核验 Node 绝对路径>" "<candidate>/scripts/traffic-vless-recovery.mjs" reconcile --plan "<protected>/plan.json" --expect-sha256 "<同一 planFileSha256>"
```

这些是不同审批阶段的命令模板，不能连续粘贴执行。prepare 写入新受保护 plan
文件，内含 request 与 privatePlan；`--expect-sha256` 绑定整个文件字节摘要，
不等同于内部 `planDigest`。apply 先独占持久化 `plan.json.intent.json`，再调用
数据库原子 baseline，成功回读后写入 `plan.json.receipt.json`。同一精确计划
在有效窗口内可对 all-before 状态 CAS 重试，或对 all-after 状态 no-op；混合、
已推进或账本/binding 漂移不自动修复。intent/receipt 不得删除后重试。

prepare 返回 `plan_prepared` 只表示准备成功。verify 仅读数据库，明确区分
`baseline_not_applied`、`baseline_verified` 和 drift/blocked；不写 receipt。
若 DB 已提交但 receipt 持久化失败，保留同一 plan/intent，使用 reconcile 只读
核验数据库并补持久化 receipt。过期计划仍可 verify/reconcile，数据库保持只读；
不能重新读取 snapshot、重设 T0 或藉此执行过期 apply。计划、源和审批的短窗口
必须预先协调；未完成审批即到期时停止，重新 prepare 必须作为新的审查动作。

临时 `scope.json`：

```json
{
  "schemaVersion": 1,
  "collectionScope": {"channelRefs": ["channel-vultr-a-vless-reality-tcp", "channel-sgp-a-vless-reality-tcp"], "protocol": "vless", "lifecycleMode": "record-only"},
  "planFile": "<protected>/plan.json",
  "planFileSha256": "<已审查 plan 文件 SHA256>",
  "validUntil": "<批准的 UTC 到期时间，至多 privatePlan.preparedAt 后 24 小时>",
  "statusFile": "<独立受保护状态目录>/vless-recovery-status.json"
}
```

```bash
"<已核验 Node 绝对路径>" "<candidate>/scripts/traffic-usage-collect-once.mjs" --check --recovery-scope-file "<protected>/scope.json"
"<已核验 Node 绝对路径>" "<candidate>/scripts/traffic-usage-collect-once.mjs" --collect --recovery-scope-file "<protected>/scope.json"
```

scope check 会构造已隔离的 runtime，不能作为无审批生产只读 inventory 的替代。
入口检查 applied receipt、计划文件摘要、DB 对象身份、精确 channel、现有 env
source mapping 和 binary 摘要；只构造所选 VLESS collectors。所有 reader 完成
后、首次入账前再检查 packet digest 和准入，阻断读取过程中发生的 scope/身份/
账期变化。scoped reader 固定 20 秒 timeout、4 MiB 响应上限；超时或超限拒绝。
`beforeRecordGuard` 按原计划和当前 durable binding/cursor 校验整个 observation
批次的完整 keyset。缺失整个用户不能当作 idle；额外用户、重复用户、计数下降、
观察时间回退或未来时间均在首次 record 前整批拒绝，记账调用为零。该前置检查
不把后续多个用户的普通记账调用变成一个新的跨用户数据库事务。
当前 cursor 必须不早于 T0、同 epoch 不回退，且不未来、不陈旧超过
900 秒；T0/current cursor/当前时间必须属于同一个实际 entitlement 账期。
任一用户不满足即整批拒绝，不能用新的 receipt 长期容忍停采后补记历史量。

`record-only` 允许新流量样本/汇总更新，返回 suspend 与 rollover deferred
证据；不表示额度执行已恢复。临时状态写入独立文件，basename 必须为
`vless-recovery-status.json`，不得复用主 `EDGE_USAGE_COLLECTOR_STATUS_PATH`。
独立 VLESS 状态成功不能覆盖、粉饰或替代五通道主链路的故障状态。

## 阶段 3：精确生产审批包

所有占位项必须在审批前替换为已验证值；审批文本与命令清单绑定同一哈希和
有效窗口。任何目标、参数、文件哈希、数据源或运行状态变化都重新审查。

```yaml
operation_id: pending
approval_expires_at: pending
operator_approval: pending
source_commit: pending
candidate_files_and_sha256: pending
release_unit: control-plane-app
identity_impact: true
expected_live_release: pending_fresh_readback
target_identity: pending_private_packet
main_collector_unit_and_timer: pending_fresh_readback
sidecar_unit_and_shared_db_writer_inventory: pending_fresh_readback
protected_data_and_evidence_paths: pending_private_packet
backup_method_and_verified_receipt: pending
first_accounting_policy: quarantine_unattributable_history
baseline_operation_and_command_hash: pending
single_collection_command_hash: pending
temporary_vless_timer_and_stop_deadline_command_hash: pending
temporary_record_only_policy_and_deferred_quota_owner: pending
scope_file_sha256_and_valid_until: pending
allowed_commands_and_expected_results: pending
rollback_commands_and_limits: pending
maximum_mutation_scope_and_window: pending
no_go_conditions: as_below
```

审批分三个决策点，不能把“批准准备”扩展成后续执行：

1. **部署准备门禁：** 先获得主定时器停止和隔离的精确审批，确认主采集器未运行且没有并行手动入口；审查在线备份方法和最终完整源码清单。首次入账政策、备份和执行命令未批准前，不部署到可自动执行位置。此阶段只运行审查过的预检/备份/部署命令，不启动无 scope 采集。
2. **首次基线与受控入账门禁：** 批准 VLESS 非清零 prepare 的精确来源与受保护文件写入，审查生成计划的文件摘要、时间窗口、旧/新边界及历史缺口政策；另有 apply 与单次 scoped collect 的明确审批后，执行 baseline、验证 receipt，再采一次 T0 后新量。此次不执行任何 Hy2 清零或 TUIC 基线。
3. **临时定时采集门禁：** 单次结果和 Identity Gate 可接受后，批准独立 VLESS-only 临时单元及至少两个自然周期观察。`record-only`、deferred quota 的业务影响及处置责任、至多 24 小时的截止时间与停止命令必须写入审批。原主 timer/service 继续隔离；恢复全量协议和正常 quota 生命周期需要后续门禁。

### 可审查的激活清单

每个步骤都有独立的 readback，失败后保留计划、intent、receipt 和现场，不自动
跳过或扩大范围。命令中的值必须来自同一份审批包；服务用户、环境文件加载
方法和执行 CWD 使用现场已核验配置，不在终端展开 raw env。

| 顺序 | 具体动作与成功证据 | 占位值来源 |
| --- | --- | --- |
| 1 | 只读核验 current、主 unit/timer、全部 writer、SGP sidecar、两处 Xray 来源与 aggregate Identity Gate；确认精确源文件与依赖兼容 | 执行当天的 SSH/systemd、文件摘要、source mapping 和 identity inventory |
| 2 | 经批准停止并隔离原主 timer/service；readback timer 不运行、service 不 active、无并行 collect 进程 | 主机实际 unit 名称、进程 CWD/命令身份；不是旧文档推测 |
| 3 | 经批准使用在线一致性备份 helper，在新受保护目录生成 verified receipt；保留源码/单元/状态旧证据，sidecar 保持原状态 | 新目的路径、权限/ownership readback、当前 DB 身份和备份命令摘要 |
| 4 | 按最终 candidate manifest 精确部署整个恢复依赖集合，再逐文件 readback；保留回退文件，不移动无关应用版本 | 最终已验证 commit、逐文件 Git blob SHA-256、package/依赖兼容记录和安装命令白名单 |
| 5 | 批准精确 prepare，运行上节命令并保存新私有 plan；审查输出的 planFileSha256、内部 planDigest、scope/数量/过期时间与缺口政策 | 受保护 request 来源核验、prepare 脱敏输出及主机内私有审查 |
| 6 | 在同一有效窗口内批准并执行 apply；verify 为 baseline_verified，有匹配 receipt；退出码不为零则先 verify/reconcile | 已批准 plan 文件摘要、操作员与审批时间、apply/verify 命令摘要 |
| 7 | 写入已批准 scope 文件，运行 scoped check，再批准单次 scoped collect；检查独立状态、账本/游标、身份和两个 deferred 生命周期结果 | receipt、scope 文件摘要、到期 UTC、独立状态目录、现有 reader env 与 source hash |
| 8 | 启用已批准的临时 VLESS-only timer，至少两个自然周期；到期停止临时单元并 readback，原主定时器继续隔离 | 临时 unit/timer 完整内容与 SHA-256、interval、stop deadline、record-only 政策及处置责任 |
| 9 | 记录仅选定 VLESS 临时计量结果与剩余缺口；审核全量恢复和 quota 动作的后续方案 | 两个自然周期、sidecar/Web 复核、deferred 额度清单的脱敏汇总和新审批 |

步骤 2 的服务操作模板，仅在精确批准后执行：

```bash
systemctl stop "<fresh inventory 确认的主 timer>"
systemctl mask --runtime "<同一主 timer>" "<fresh inventory 确认的主 collector service>"
systemctl show "<同一主 timer>" "<同一主 collector service>" --property=Id,LoadState,ActiveState,SubState,MainPID,ExecMainStatus
```

如果 service 仍在执行，停止在此处；不能未经已批准的在途采集处置就强杀它或
替换源码。部署命令必须由 manifest 展开为精确源/目标文件对、owner/mode、
备份位置及 readback，禁止通配符、只替换入口或顺带升级整个 master release。

步骤 8 的临时单元必须以步骤 7 的同一 scope 文件和已核验服务身份执行
`--collect --recovery-scope-file`，不添加 normal fallback，不能复用原主单元的
无 scope ExecStart。下列操作仍以已批准的临时单元制品为前提：

```bash
systemctl start "<已审查的临时 VLESS timer>"
systemctl show "<同一临时 timer>" "<同一临时 collector service>" --property=Id,ActiveState,SubState,ExecMainStatus
systemctl stop "<同一临时 timer>"
```

start 与 stop 属于不同时间点，不能连续粘贴执行。确切 interval、停止 deadline
和在途 service 的处置需绑定临时单元及审批；scope 到期会拒绝新采集，不等同于
systemd timer 已自动停止。任一 cursor 停顿超过 15 分钟或跨 entitlement 账期，
即使仍在 24 小时窗口也停止临时采集并重新审查，不能放宽阈值继续补量。

## 备份与回退边界

部署前在生产主机的受保护位置保留当前采集代码/单元、状态与主通道游标证据，
记录对象身份、权限、摘要和时间；不得下载生产数据库或敏感证据到本地 fixture。
备份本身是生产写操作，必须纳入命令白名单和审批范围。

共享 SQLite 备份遵循
[`CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md`](../CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md)。
现有 snapshot gate 需要主应用 inactive、有效 runtime condition start guard，
并排除其他数据库 writer/holder，且会执行 WAL checkpoint/quiesce。
SGP TUIC sidecar 仍写同库时，不能仅停主采集器就调用这个 gate，不能 `cp` 活库，
也不能把 WAL/SHM 副本当作已验证独立备份。

默认保留 SGP TUIC sidecar 运行。若最终选择现有停写快照方案，审批包必须扩大
为明确的全部 writer 暂停窗口，记录 sidecar 状态保留、恢复顺序和停采风险，并
获得新的 exact approval。若要求 sidecar 全程运行，必须先准备经隔离验证的在线
一致性备份方案及相应审批；没有 SGP 暂停授权时不能改用要求停掉全部 writer
的合同。本 runbook 没有声称现有 snapshot gate 支持在线备份。

本次源代码候选增加 import-only helper：
`scripts/lib/traffic-recovery-online-backup.mjs`，接口为
`await createTrafficRecoveryOnlineBackup({ sourcePath, destinationPath })`。
它使用 `new Database(sourcePath, { readonly: true, fileMustExist: true })`
和 `query_only`，通过 SQLite backup API 读取在线源；不复制活库文件、不执行
源 checkpoint、不切换源 journal mode，不暂停 sidecar。

两条路径必须为绝对规范路径，源必须是已存在的普通文件。目标必须位于一个
尚不存在的专用父目录，该父目录的上级是已存在、调用用户拥有的受保护目录。
helper 独占创建父目录并保留新目标文件，拒绝已有目录/文件及 symlink/junction。
POSIX 下验证目录 `0700`、目标 `0600` 和当前用户 ownership，拒绝不安全的
可写祖先，并在传输/校验期间重新核对对象身份。每次调用必须使用新目的目录，
不能把失败后的同一路径直接重用。

只在独立目标执行 journal mode `DELETE` 归一化、`integrity_check`、
`foreign_key_check` 和三表聚合检查；关闭目标后确认无 WAL/SHM/journal companion，
同步目标文件及 POSIX 目录，再计算 SHA-256/大小。同步调用本身不构成存储设备
或断电恢复保证。receipt 只输出固定状态、计数、摘要、大小与布尔值；
`byteSumsEqual` 是样本/汇总核对证据，游标累计量不被当作样本总量。
失败返回 `verified=false`，并以 `partialState` 区分 `none`、
`directory_only`、`unverified_file`。本次新建的受保护 partial 保留待单独审批，
不自动删除，不自动恢复生产数据库，也不返回路径或原始错误。

2026-09-05 的 Windows Node 24.16.0 合成验证为 7 pass / 0 fail / 0 skip：
真实 WAL 数据库在 backup transfer 期间由另一个连接提交 usage 事务，目标
samples/rollups/cursors 保持同一事务边界，备份后源继续写入；同时覆盖拒绝
重复目的地、非法路径/junction、损坏数据库、缺表和传输失败。
Windows 仅验证 SQLite、exclusive create 和 reparse 拒绝语义，不验证 POSIX
ownership/mode 或 Windows ACL；receipt 明确
`posixProtectionVerified=false`、`windowsAclVerified=false`。
该 helper 的同一组测试已在托管 Ubuntu 24.04 / Node 22.23.2 通过，包含
POSIX ownership/mode、目录同步及并发 WAL 备份路径；见下方精确提交 CI 记录。
这不验证生产文件系统、硬件断电恢复或 systemd。该 helper 已完成独立源代码
审查，仍需准确输入、生产路径/权限核验和备份审批；它不授权采集或 restore。

回退优先恢复本次修改的主采集代码/单元并保持主定时器隔离；复核 Web 和
sidecar 的服务与持续入账状态。**禁止用整库 restore 作为这次采集修复的自动回退**，
否则会覆盖 sidecar 及 Web 在备份后的正常写入。发生误入账/游标或远端计数变化时，
保留现场和增量证据，另开有业务影响分析的修复/补偿审批，不直接删样本、回拨
游标或整库覆盖。独立数据库灾难恢复仍执行上述 restore contract 的新审批。

## 恢复验收、过期判据与 NO-GO

按 fresh timer interval `T` 和允许时钟偏差 `S` 设定观察窗口；本次建议
状态 freshness 阈值为 `2 * T + S`，确切值在审批包固定。该阈值是操作验收
规则，不能在未实现时声称现有 Admin UI 已自动应用。状态文件缺失、无效、
未来时间超出 `S`、超过阈值，或最新 unit 执行失败，即使旧内容为 healthy，
也按 failed/stale 处理。不能用文件 mtime 代替成功时间或采集证据。

临时 VLESS 恢复至少观察两个自然采集周期，逐周期保存以下脱敏证据：

- 临时 service 结果成功，独立 VLESS 状态 observation time 前进，首次入账严格落在批准的政策和执行边界内；原主全量状态保持其真实覆盖范围。
- scope 内每条 VLESS 通道均有成功采集或可验证的 idle 状态；idle 允许样本不增长，但必须有完整非清零统计与有效身份对应。未选 Hy2/TUIC 保持未恢复，不能称五通道健康。
- 有新流量时 scope 内 samples、rollups、游标与批准的新边界一致；重跑不重复入账，非选通道未被定向 baseline 修改。
- `rawReportOk`、每通道 unresolved/mapping 分类和 Identity Gate 均审查通过；只容忍 unresolved 的汇总 `ok` 不足以称恢复。
- 无未批准历史差额扣量、suspend、rollover 或客户状态改变；明确记录 record-only 下 suspend/rollover 均 deferred，SGP sidecar 独立样本保持正常。
- 至少一次只读复核 Web 健康和 runtime/release 身份；不为验证生成真实公网付费流量。

以下任一项为 NO-GO：证据/哈希/目标漂移；测试失败未解释；候选与现场布局不兼容；
未知写入者；备份不可验证；审批缺失或过期；预检构造了 runtime 或触发 reader；
主定时器未隔离或主采集器仍运行时拟替换入口；把 fresh status 当作采集授权；
baseline/receipt 不匹配、VLESS 计数下降或拟执行未经批准的清零；历史差额归属
不确定却拟当前账期扣量；identity 异常未处置；所选 VLESS 通道或任一绑定用户
缺失；非选 reader 被调用；独立 status 已过期；scope/计划/实际账期过期或 cursor
陈旧超过 900 秒；sidecar 受非批准影响；未批准 record-only 政策或单次采集出现
非 deferred 生命周期动作。停止在当前安全边界，保留证据，不自动扩大操作。

五条主通道与正常 quota 生命周期全部恢复，必须另有五通道覆盖证据和审批。
本轮临时 VLESS 验收不能作为全量恢复结论。

生产动作完成后才追加简短 Deploy Note：`deployed_at`、`release_unit`、
`source_commit`、`artifact_or_release`、`target`、`backup`、`validation`；
如涉及 identity，再记录 aggregate-only gate before/after、retention state 和
最终状态。首次历史基线决策与实际未追回缺口应有单独可追溯 receipt。

## 源代码验证记录与待绑定事项

### 2026-09-05 第一阶段历史记录：启动隔离、只读预检和备份

2026-09-05 Windows Node 24.16.0 / npm 11.13.0，基线
`356d0f9997cae757edfe79bb549f0b6370331686` 的隔离工作树验证：

- TDD：启动隔离用例补丁前 1 pass / 4 fail，补丁后 5 pass / 0 fail；CLI 预检新增用例补丁前 0 pass / 5 fail，补丁后通过；独立预检模块缺失的 red 已记录。
- 五个相关测试文件最终合跑：57 pass / 0 fail / 0 skip；另有 accounting、billing-cycle、quota 相关契约回归 40 pass / 0 fail / 0 skip。两个计数包含重叠测试，不能相加当作用例总数。
- 最终完整 `npm test`：4315 tests / 4241 pass / 18 fail / 56 skip，退出 1。
- 未修改基线同环境完整 `npm test`：4284 tests / 4210 pass / 18 fail / 56 skip，退出 1。逐项比较 18 个失败名称完全一致；本次净增加 31 个通过用例，不能据此声称完整套件全绿。
- 首次候选完整测试另有两个文档 metadata 失败；修正 lifecycle 为 active 后，上述最终完整测试与 strict document authority 均确认这两项已通过。
- 独立复审：P0=0、P1=0、Source Review GO；复审包含在线备份父目录 fsync、live WAL 预检、无自动采集准入及输出脱敏边界。
- HP SSH 两次在连接层被关闭；本机 WSL 报告未启用虚拟化，未更改环境配置。转用托管 Ubuntu 24.04 / Node 22.23.2，代码提交 `d822886f20944d4407cbe319db17be14dd1e6a9d` 的 [CI 33959022517](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/33959022517) 完整通过：server 4324 tests / 4318 pass / 0 fail / 6 skip；Admin tests/build、Portal/site build 与边界校验均通过。production systemd 和真实流量未测试。

上述 Source Review GO 与 CI 是第一阶段精确候选的历史证据，不覆盖本轮新增
baseline/CLI/scope/parser/accounting 变更。Production Gate 仍为 NO-GO；精确
来源、首次入账政策、record-only 窗口、备份与执行命令尚需本次审批。

### 2026-09-05 本轮实现：VLESS baseline、命令与通道隔离

以下为最终提交前的实际验证；精确提交及托管检查由 PR #714 的最终 head 回执绑定：

| 验证项 | 本轮最终候选证据 |
| --- | --- |
| 最终 commit / PR head | 由 PR #714 最终 head 和私有 source manifest 绑定，本文不自引用其所属提交 |
| targeted baseline/command/scope/integration tests | 5 文件合跑：93 pass / 0 fail / 0 skip，exit 0 |
| 原有 collector/accounting/reader 回归 | 最终完整 npm test 同时覆盖；中间广泛回归 220 pass / 0 fail / 0 skip 不替代最终完整结果 |
| 完整 Windows npm test 与既有失败比较 | 4408 tests / 4341 pass / 11 fail / 56 skip，exit 1；11 个失败名称全部属于上一阶段已有 18 个失败，无新增失败名称。7 个旧失败本次未复现，不能声称 Windows 全绿 |
| 托管 Linux Node 22 完整 CI | 提交后核验 PR #714 精确 head 的 CI；最终 run URL 和实际计数记录在 PR 验证回执，不复用第一阶段 CI |
| 独立 P0/P1 审查 | P0=0、P1=0、Source Review GO；最后 material 快照漂移 RED 1 fail → integration 16 pass，最终 93 项合跑包含此修复 |
| docs authority / diff check | strict authority 391 blocks 通过；git diff --check 通过 |
| production systemd、真实统计源、首次入账和自然周期 | 未执行；需要精确生产审批 |

### 2026-09-05 13:10 UTC 生产只读前提检查

只通过标准输入执行 inspect 和 aggregate-only SELECT；未安装候选文件、读取
Xray 统计端点、写 plan/intent/receipt、更新游标或操作服务。

| 通道 | 新工具 inspect | durable 记录 | 现有游标 | legacy issued 缺 durable | 已过期 | 账号非 active | Portal 非 delivered/issued |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 日本 VLESS | baseline_legacy_binding_unsupported | 107 | 30 | 13 | 77 | 4 | 17 |
| SGP VLESS | baseline_binding_invalid | 114 | 24 | 0 | 82 | 4 | 13 |

分类重叠，不能相加作为客户数；这些聚合不是 Identity Gate healthy 证明。
新工具当前只支持完整、唯一、active durable binding 与既有 cursor 对齐的范围，
不会把历史记录自动当作可删除垃圾，也不支持静默跳过它们后写基线。该现场尚不
符合激活前提，必须先有独立的 legacy/retention/identity 只读分类及后续精确处置
审批；不得为了让工具通过而删除历史样本、批量激活账号或改写订单状态。
完成分类后若需支持受审查的保留集合，仍需显式契约和实现验证，不能靠手工修改
privatePlan 摘要绕过。本轮 Production Gate 因上述实际数据前提继续 NO-GO。

本轮源码部署范围已超出第一阶段三个 scripts，最终 manifest 至少应逐项审查
下列运行时依赖集合，并按真实 import/call chain 补齐已有依赖的兼容性证据：

- `scripts/traffic-usage-collect-once.mjs`、`scripts/traffic-vless-recovery.mjs`。
- `scripts/lib/traffic-usage-recovery-preflight.mjs`、`scripts/lib/traffic-recovery-online-backup.mjs`、`scripts/lib/traffic-recovery-protected-files.mjs`、`scripts/lib/traffic-vless-recovery-baseline.mjs`、`scripts/lib/traffic-vless-recovery-scope.mjs`。
- `server/state.mjs`、`server/services/platform/runtime-usage-accounting.mjs`。
- `server/services/edge/xray-stats-cli-usage-reader.mjs`、`server/services/edge/xray-recovery-counter-parser.mjs`。

该列表说明审查范围，不是可直接部署的 manifest。最终 source_commit、逐文件
Git blob SHA-256、现网 before hash、安装 owner/mode、已有纯函数/数据库依赖
版本和回退文件必须绑定到同一候选。测试文件和 runbook 保留在源码制品记录，
不靠部署测试代码弥补运行依赖。不能只部署入口/新增 scripts，不能顺带升级
无关 master 应用 release，也不能把旧三文件清单继续当作本轮执行授权。

待绑定：本轮最终 PR head 的 CI 与独立审查 readback、完整精确 manifest 与部署
方式、fresh 只读 inventory、两处 Xray 来源/身份、可接受的在线备份路径、
plan/scope/临时单元的文件摘要、三个生产决策点的精确命令和操作员审批。
上述未绑定事项不能标为已通过、已执行或生产已恢复。
