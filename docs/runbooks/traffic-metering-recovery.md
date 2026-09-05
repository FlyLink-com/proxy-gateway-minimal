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
- release_unit: `control-plane-app`；本次源代码补丁 `identity_impact: false`。后续 baseline 若改变 collector identity resolution，必须另行声明 `identity_impact: true` 并满足 Identity Gate。

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

本地可执行验证基线：

```powershell
node --test server/tests/traffic-usage-collect-once.test.mjs
node --test server/tests/traffic-usage-recovery-preflight.test.mjs
node --test server/tests/traffic-recovery-online-backup.test.mjs
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
现有累计记账服务没有显式恢复 baseline 接口，上表策略不能通过普通
`--collect` 或手写 SQL 临时代替，需有独立的受审查实现和失败证据。

若采用“从批准时刻建立新基线，历史缺口另行处理”，必须先实现并验证独立、
有边界的 baseline 操作。它需要保护旧证据、不生成历史扣量样本、不触发
suspend/rollover、只修改批准的主采集通道状态，并可证明重试不重复消费
read-and-clear 数据。执行 receipt 要把基线身份、执行时间、涉及通道、
历史差额处置、旧证据保留与后续采集起点绑定。

**本 runbook 不提供 baseline 清零实现、force 开关或状态驱动的自动准入。**
具体 baseline 实现、命令和验证尚未绑定时，启动修复可以接受源代码审查，
首次入账和自动采集必须保持 NO-GO。手写新鲜状态时间、删除状态文件/游标、
直接运行 `--collect` 都不能替代这个门禁。

Hy2 如不能非清零读取：只读 inventory 到此停止；首次 `clear: true` 必须进入
独立的 exact approval。远端已清零但本地证据/入账失败时无法靠代码回退恢复计数，
因此 baseline 设计必须先处理这个失败窗口，不能在生产上试运行后再补方案。

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
identity_impact: pending_review
expected_live_release: pending_fresh_readback
target_identity: pending_private_packet
main_collector_unit_and_timer: pending_fresh_readback
sidecar_unit_and_shared_db_writer_inventory: pending_fresh_readback
protected_data_and_evidence_paths: pending_private_packet
backup_method_and_verified_receipt: pending
first_accounting_policy: quarantine_unattributable_history
baseline_operation_and_command_hash: pending
single_collection_command_hash: pending
timer_reenable_command_hash: pending
allowed_commands_and_expected_results: pending
rollback_commands_and_limits: pending
maximum_mutation_scope_and_window: pending
no_go_conditions: as_below
```

审批分三个决策点，不能把“批准准备”扩展成后续执行：

1. **部署准备门禁：** 先获得主定时器停止和隔离的精确审批，确认主采集器未运行且没有并行手动入口；审查备份方法和精确候选部署。首次入账政策、备份和执行命令未批准前，不部署到可自动执行位置。此阶段只可运行单独审查的 `--recovery-preflight`，不得用普通检查模式替代只读预检，不启动采集。
2. **首次基线与受控入账门禁：** 明确历史差额政策，审查 baseline 的不可逆清零窗口、数据范围、单次运行和失败处置；有合格 receipt 后才允许新基线之后的单次采集。
3. **恢复定时器门禁：** 单次采集结果和 Identity Gate 可接受后，批准恢复主采集自动运行及至少两个自然周期观察。不能用服务 exit 0 替代通道和账本验证。

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

至少观察两个自然采集周期，逐周期保存以下脱敏证据：

- 主服务结果成功，状态 observation time 前进，首次入账严格落在批准的政策和执行边界内。
- 五条主通道均有成功采集或可验证的 idle 状态；idle 允许样本不增长，但统计端点必须可观测。
- 有新流量时主通道 samples、rollups、游标与批准的新边界一致；重跑不重复入账。
- `rawReportOk`、每通道 unresolved/mapping 分类和 Identity Gate 均审查通过；只容忍 unresolved 的汇总 `ok` 不足以称恢复。
- 无未批准历史差额扣量、suspend、rollover 或客户状态改变；SGP sidecar 独立样本保持正常。
- 至少一次只读复核 Web 健康和 runtime/release 身份；不为验证生成真实公网付费流量。

以下任一项为 NO-GO：证据/哈希/目标漂移；测试失败未解释；候选与现场布局不兼容；
未知写入者；备份不可验证；审批缺失或过期；预检构造了 runtime 或触发 reader；
主定时器未隔离或主采集器仍运行时拟替换入口；把 fresh status 当作采集授权；
baseline 不存在或不能保存清零失败证据；历史差额归属不确定却拟当前账期扣量；
identity 异常未处置；任一主通道缺失；status 已过期；sidecar 受非批准影响；
单次采集出现未批准生命周期动作。停止在当前安全边界，保留证据，不自动扩大操作。

生产动作完成后才追加简短 Deploy Note：`deployed_at`、`release_unit`、
`source_commit`、`artifact_or_release`、`target`、`backup`、`validation`；
如涉及 identity，再记录 aggregate-only gate before/after、retention state 和
最终状态。首次历史基线决策与实际未追回缺口应有单独可追溯 receipt。

## 源代码验证记录与待绑定事项

2026-09-05 Windows Node 24.16.0 / npm 11.13.0，基线
`356d0f9997cae757edfe79bb549f0b6370331686` 的隔离工作树验证：

- TDD：启动隔离用例补丁前 1 pass / 4 fail，补丁后 5 pass / 0 fail；CLI 预检新增用例补丁前 0 pass / 5 fail，补丁后通过；独立预检模块缺失的 red 已记录。
- 五个相关测试文件最终合跑：57 pass / 0 fail / 0 skip；另有 accounting、billing-cycle、quota 相关契约回归 40 pass / 0 fail / 0 skip。两个计数包含重叠测试，不能相加当作用例总数。
- 最终完整 `npm test`：4315 tests / 4241 pass / 18 fail / 56 skip，退出 1。
- 未修改基线同环境完整 `npm test`：4284 tests / 4210 pass / 18 fail / 56 skip，退出 1。逐项比较 18 个失败名称完全一致；本次净增加 31 个通过用例，不能据此声称完整套件全绿。
- 首次候选完整测试另有两个文档 metadata 失败；修正 lifecycle 为 active 后，上述最终完整测试与 strict document authority 均确认这两项已通过。
- 独立复审：P0=0、P1=0、Source Review GO；复审包含在线备份父目录 fsync、live WAL 预检、无自动采集准入及输出脱敏边界。
- HP SSH 两次在连接层被关闭；本机 WSL 报告未启用虚拟化，未更改环境配置。转用托管 Ubuntu 24.04 / Node 22.23.2，代码提交 `d822886f20944d4407cbe319db17be14dd1e6a9d` 的 [CI 33959022517](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/runs/33959022517) 完整通过：server 4324 tests / 4318 pass / 0 fail / 6 skip；Admin tests/build、Portal/site build 与边界校验均通过。production systemd 和真实流量未测试。

Source Review: GO，仅为 P0/P1 源代码审查结论；完整验证仍以上述限制为准。
Production Gate: NO-GO；首次逐通道政策、备份和精确操作尚未审批。

生产候选范围限于 `scripts/traffic-usage-collect-once.mjs`、
`scripts/lib/traffic-usage-recovery-preflight.mjs` 和
`scripts/lib/traffic-recovery-online-backup.mjs`；只部署入口需要的 preflight helper，在线备份 helper 由独立命令
调用，不能把整个 master 应用 release 一并升级。最终清单和 Git blob 摘要在
批准前必须精确展开并绑定，不能用通配符作为执行命令。

待绑定：最终 PR head 的 CI readback、生产精确文件清单和部署方式、fresh 只读 inventory、可接受的备份路径、
baseline 实现及清零失败恢复证据、三个生产决策点的精确命令和审批。
上述未绑定事项不能标为已通过、已执行或生产已恢复。
