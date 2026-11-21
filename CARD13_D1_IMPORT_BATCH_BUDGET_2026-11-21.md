# 卡 13 · Cloudflare 套餐与 D1 导入批次预算核查报告（2026-11-21）

## 绑定信息

| 项目 | 值 |
|---|---|
| 任务 | D1 迁移工程卡 13：核实 Cloudflare 套餐与 D1 导入批次预算（只读核对 + 计算 + 报告/算子；合成数据与本地测试） |
| Notion 卡 | `41edbee1-8783-81a2-82c2-f56bef29c491`，标题“Muse｜核实 Cloudflare 套餐与 D1 导入批次预算”，并发工作组 C，状态：进行中 |
| 基线 master | `b1e46fef4e98bbfdace900a4e8b2d36a4284e176`（开工前 `git ls-remote` 核对一致） |
| 分支 | `feat/d1-import-batch-budget-20261121`（全新克隆 `~/workspace/d1-card13-budget/`，不复用旧 clone） |
| 定稿提交 | `ba0901ce30430f9b43429393fb898b486e16bcad`（代码 + 测试 + 本报告定稿提交；见 §9） |
| Draft PR | [#907](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/907)（只开 Draft，绝不 Ready、绝不合并；见 §9） |
| 生产 | 仍 pr799（未动）；E4 未动；未读不写生产 |
| 核对日期 | 2026-11-21（官方文档页抓取时间 2026-11-21 13:00 UTC） |

## 1 · 结论先行

1. **套餐已核实，不用升级。** Workers Paid（$5/月，下一次续订 2026-12-03）是 Yi 于 2026-11-19 在 Cloudflare Dashboard 亲自核实的状态；$2.17 账单与账户记录相符。本卡只做只读核对现有套餐与官方限制资料，未改账单、未创建任何付费资源、未创建 D1/Token。GPT-6 连接对 Billing/Subscription 返回 403（缺 Billing Read）仅表示该连接无法读取账单，**不代表账户状态 UNKNOWN**，不写成“套餐未知”。
2. **官方限制逐项核实完毕，卡面那处“未核实”已关闭。** “单条 SQL 语句 100,000 bytes”现已在官方 limits 页原文核实（见 §3 全表）。其余基线数字（单行 2 MB、100 绑定参数、30 秒、50 MB 结果、Paid 25B 读/50M 写/5 GB 存储、单库 10 GB）也全部逐项核实，无一凭记忆。
3. **分批预算（首批 6,848 行快照口径，见 §4）：默认 100 行/批、103 批、共 1,412 条语句。** 最坏 rows_written **22,012**（表行 6,848 + 索引维护 15,164，乘数 3.214×），占 Paid 月含 50M 写入额度的 **0.0440%**；即使每批都重试两次（F-1 上限），最坏 **66,036**，占 **0.1321%**。读侧规划上界 **21,193** 行，占月含 25B 读额度的 **0.000085%**。**额度不构成约束。真正的约束是每批 30 秒、每语句 100 绑定参数、每语句 100 KB、每行 2 MB。**
4. **6,848 行只是规划基数，不是预算。** 索引维护、触发器、checkpoint、重试与对账都会影响实际 rows_written：索引把写入乘到 3.214×；触发器经逐条解析确认为 0 额外写入（55 个全是守卫型 RAISE(ABORT)，无一写其他表）；checkpoint 是本地 JSONL，0 行 D1 写入；重试最坏再乘 3；对账读侧另计。**不按历史数据库逻辑大小推算 E4 实际占用**——E4 实际占用字节数在执行快照实测文件大小出来之前是未知数（见 §5、§7）。
5. **时间数字全部是模型估算，未实测，不得作为执行承诺。** 卡 6 的 3.4–17.2 分钟纯写入 + 10–30 分钟对账、60 分钟窗口 / 120 分钟硬复核点沿用为预算口径；首次试跑须先跑 1 批（100 行）测速，再以实测速度重算（实测计划见 §6，须另行授权，不在本卡内执行）。

## 2 · 套餐核对

| 核对项 | 结论 | 依据 |
|---|---|---|
| 账户套餐 | **Workers Paid，$5/月** | Yi 2026-11-19 在 Cloudflare Dashboard 核实（既有事实，本卡复述，不再登录核查） |
| 下一次续订 | **2026-12-03** | 同上，Yi 核实 |
| $2.17 账单 | 与账户记录相符 | 同上，Yi 核实；本卡未调账单接口、未改账单 |
| D1 月含额度（Paid） | 25B 行读 / 50M 行写 / 5 GB 存储 | 官方 pricing 页核实（§3），与任务书一致 |
| 单库上限（Paid） | 10 GB，不可再提高 | 官方 limits 页核实（§3） |
| Time Travel（Paid） | 30 天 | 官方 limits 页核实（§3）；与 Yi 2026-11-20 的 Workers Paid 购买决定一致 |
| GPT-6 Billing 403 | 仅表示该连接缺 Billing Read 读不到账单 | 连接权限事实；**不是“套餐未知”**，不得如此表述 |
| 本卡的账单操作 | **无** | 未升级套餐、未修改账单、未创建付费资源、未创建 D1/Token、未部署、未真实导入 |

注意：D1 pricing 页本身不写“$5/月”（那是 Workers 计划价）；$5/月与 2026-12-03 续订日来自 Yi 的 Dashboard 核实，不是本卡从公开文档读到的。本卡不据此推断未来资源成本已获批准：超月含额度的超额费率（读 $0.001/百万行、写 $1.00/百万行、存储 $0.75/GB-月）见 §3，但本次预算远低于月含额度，不产生超额费用；未来用量变化须另行核对。

## 3 · 官方限制逐项核对（来源 + 核对日期）

核对方式：`browser.open` 直读官方文档原文（limits 页 Markdown 源 `.../d1/platform/limits/index.md`，抓取 2026-11-21 13:00 UTC，页内 `dateModified: 2026-11-20`；pricing 页 `.../d1/platform/pricing/`，页内 `Updated: 2026-10-30`）。下表每一行都是当日原文值，不是记忆。

| # | 限制项 | Workers Paid 值（已核实） | 来源 |
|---|---|---|---|
| L-1 | 单条 SQL 语句最大长度 | **100,000 bytes（100 KB）** | limits 页表行 “Maximum SQL statement length \| 100,000 bytes (100 KB)”——**卡面“未核实”状态就此关闭** |
| L-2 | 单行 / 字符串 / BLOB 最大 | **2,000,000 bytes（2 MB）** | limits 页 “Maximum string, `BLOB` or table row size \| 2,000,000 bytes (2 MB)” |
| L-3 | 每查询绑定参数上限 | **100** | limits 页 “Maximum bound parameters per query \| 100” |
| L-4 | 单查询最长耗时 | **30 秒** | limits 页 “Maximum SQL query duration \| 30 seconds”；脚注 3：API 请求须在 30 秒内完成，**该限制同样适用于整个 batch 调用** |
| L-5 | 单查询结果上限 | **50 MB** | limits 页 “Maximum query result size \| 50 MB”；脚注 5：**2026-11-04 起生效**，超限查询失败；REST 导入/导出除外 |
| L-6 | 单库最大容量 | **10 GB**（Paid）/ 500 MB（Free） | limits 页 “Maximum database size”；FAQ 明确“10 GB 上限**不可再提高**” |
| L-7 | 账户总存储上限 | **1 TB**（Paid，可申请提高）/ 5 GB（Free） | limits 页 “Maximum storage per account” |
| L-8 | 每 Worker 调用查询数 | **1,000**（Paid）/ 50（Free） | limits 页 “Queries per Worker invocation”；batch 节：一次 `db.batch()` 只计 **1 次**，不按语句数计；但批内每条语句仍各自受 L-1～L-5 限制 |
| L-9 | 每表最大列数 / 结果最大列数 | **100 / 100** | limits 页两行；DDL v1.1 最宽表 28 列，远低于上限 |
| L-10 | 每表最大行数 | **无上限**（只受单库存储限制） | limits 页 “Maximum number of rows per table \| Unlimited” |
| L-11 | 账户数据库数 | **1,000,000**（Paid，前 100,000 个含在内，超出 $0.10/库/月）/ 10（Free） | limits 页 “Databases per account”；pricing 页“Databases”行一致 |
| L-12 | Time Travel 时长 | **30 天**（Paid）/ 7 天（Free） | limits 页；另每库每 10 分钟最多 10 次恢复操作 |
| L-13 | `d1 execute` 文件导入上限 | **5 GB**（文件经 R2 上传） | limits 页 “Maximum file import (`d1 execute`) size \| 5 GB” |
| L-14 | 月含行读 | **25B 行/月**，超额 $0.001/百万行 | pricing 页 “Rows read \| First 25 billion / month included + $0.001 / million rows” |
| L-15 | 月含行写 | **50M 行/月**，超额 $1.00/百万行 | pricing 页 “Rows written \| First 50 million / month included + $1.00 / million rows” |
| L-16 | 月含存储 | **前 5 GB 含在内**，超额 $0.75/GB-月 | pricing 页 “Storage (per GB stored) \| First 5 GB included + $0.75 / GB-mo” |
| L-17 | 复合语句 SELECT 项数 | **5**（UNION / UNION ALL / INTERSECT / EXCEPT） | limits 页；与本次 INSERT 预算无关，列入备查 |
| L-18 | 每 SQL 函数参数 / LIKE 或 GLOB 模式 | **32 / 50 bytes** | limits 页；与本次预算无关，列入备查 |
| L-19 | 单库单线程 | **每库一次只处理一个查询** | limits 页 FAQ “Concurrency and throughput”；批次须串行，不得并行写同一库 |
| L-20 | 索引的写入计量 | **每写一个被索引列，另加 1 行写入**（表行 1 + 索引 1） | pricing 页定义 6（原文例：INSERT 10 行计 10 行写入；带索引列的写入“表本身 1 行 + 索引 1 行”）——§4 乘数的唯一依据 |
| L-21 | DDL 的计量 | CREATE / ALTER / DROP **可能同时产生读行与写行** | pricing 页定义 3；DDL 安装的 rows_written 另计，不在本次装载预算内（§7 缺口） |
| L-22 | 行大小与列数不影响行计数 | 1 KB 行与 100 KB 行**都只计 1 行** | pricing 页定义 4；行计数只看行数，不看字节 |
| L-23 | 存储计量 | 表 + 索引**都计入**存储；空库约 12 KB | pricing 页定义 7 与 FAQ；E4 字节占用须以实测为准（§5） |

**仍未核实项（本卡诚实列出）：** 无——任务书所列的官方限制基线（L-1～L-6、L-14～L-16）已全部在当日官方文档原文核实。未核实的是**执行侧实测值**，不在文档里：真实每批耗时、真实 rows_written（须读每次调用返回的 `meta`）、部分索引的实际命中占比、回滚批次是否计费（见 §7）。

## 4 · 分批预算

### 4.1 每批上限（硬上限与运行上限）

| 维度 | 硬上限（官方） | 运行上限（本预算采用） | 说明 |
|---|---|---|---|
| 每批行数 | —（官方示例 1,000 行） | **100 行/批** | 卡 6 默认；不跨表打包，每批属于一张表 |
| 每语句行数（绑定模式） | 100 绑定参数/语句 | **⌊100 / 列数⌋ 行/语句** | 最宽表 28 列 → 3 行/语句；回执 21 列 → 4 行/语句；算子 `rowsPerStatementByBinds` |
| 每语句字节（字面模式） | 100,000 bytes | **80,000 bytes**（运行 cap，取官方 80%） | 仅对内联 VALUES 文本的导入器生效；绑定模式下语句文本很小，绑定数先顶满 |
| 单行大小 | 2,000,000 bytes | 同左 | 超限整行延后（F-5），不截断、不拆行 |
| 每批耗时 | 30 秒（整个 `batch()` 调用） | **20 秒软 cap**，≥20 秒即拆批 | 超时拆批重跑小批，**绝不原批重试**（卡 6 §4.2） |
| 每批语句数 | 1,000 查询/调用（batch 计 1 次） | 不设额外上限 | 语句数受 30 秒约束，不受调用数约束 |
| 对账单次读结果 | 50 MB | **40 MB 软 cap** | 超限按表拆读；最大表 1,513 行估算 0.75–3 MB，全库 6,848 行估算 3–14 MB（卡 6 估算，未实测） |

### 4.2 首批全量预算（快照口径 6,848 行 / 50 表）

快照：`phase8a-20261118T134920Z`（SHA `4424371d…`），卡 6 §1.2/§1.3 逐表行数；列数取 DDL v1.1 解析（51 表 / 570 列）；索引取 DDL v1.1 解析（70 个索引，其中 9 个部分索引；50 张首批表上 67 个、部分索引 9 个；其余 3 个在 FK 前置空表 `platform_portal_entries` 上，0 行，装载写入 0）；FK 取 DDL 解析（70 处引用，首批表上 68 处）。

| 项目 | 数值 | 算法 |
|---|---|---|
| 规划行数 | **6,848 行** | 卡 6 快照逐表求和（6,573 + 275） |
| 批次数 | **103 批** | 100 行/批、逐表向上取整；跨表打包理论下限 69 批（不用） |
| 语句总数（绑定模式） | **1,412 条** | 每表 ⌈100 / ⌊100/列数⌋⌉ × 批数求和；算子 `planLoad` |
| 表行写入 | 6,848 | 行数本身 |
| 索引维护写入（最坏） | 15,164 | 每行 × 该表索引数；部分索引按全部命中算 |
| **rows_written（最坏）** | **22,012** | 6,848 + 15,164；**乘数 3.214×** |
| rows_written（下限） | 20,336 | 部分索引按全部不命中算；真实值介于 20,336 与 22,012 之间 |
| 月含写入额度占比（最坏） | **0.0440%** | 22,012 / 50,000,000 |
| FK 父表查找读行（上界） | 7,497 | 每行 × 该表 FK 引用数（索引查找按每引用 1 行读算） |
| E4 侧对账读行 | 13,696 | COUNT + 全行 hash 读，2 × 6,848（源侧读走 BWH SQLite，不计 D1） |
| **rows_read 规划上界** | **21,193** | 7,497 + 13,696；占月含 25B 的 **0.000085%** |
| checkpoint 的 D1 写入 | **0 行** | checkpoint 是装载器本地 JSONL（卡 6 §5.1），不写入 E4 |
| 触发器额外写入 | **0 行** | 55 个触发器逐条解析：34 BEFORE UPDATE、17 BEFORE DELETE、4 BEFORE INSERT，触发体全是守卫型 RAISE(ABORT)，无一 INSERT/UPDATE/DELETE 其他表 |

**单表之最：** `platform_edge_apply_receipts`（1,513 行、21 列、4 索引）独占 16 批、400 条语句、最坏 7,565 行写入，占全量最坏写入的 34%。其余大头：sessions 12 批 / 3,588 行写入；edge_credentials 8 批 / 2,142 行写入；notifications 4 批 / 1,384 行写入；audit_events 3 批 / 402 行写入。

**备选批大小（同一模型，默认仍为 100 行/批）：** 250 行/批 → 63 批；500 行/批 → 56 批；1,000 行/批 → 52 批（官方示例上限，不推荐首选：最宽行 + 触发器下 30 秒风险未实测）。批大小只改变批次数，**不改变 rows_written**（22,012 不变）。

### 4.3 逐表预算表（100 行/批，绑定模式）

每表：行数（快照）→ 批数 → 每批语句数 → 最坏 rows_written。完整数据同时以机器可读形式存在于算子 `FIRST_BATCH_PLAN_INPUT_6848`，`planFirstBatch6848()` 复算本表全部合计值（测试断言）。

| 表 | 行数 | 批数 | 语句/批 | 最坏写入 | 表 | 行数 | 批数 | 语句/批 | 最坏写入 |
|---|---|---|---|---|---|---|---|---|---|
| platform_edge_apply_receipts | 1,513 | 16 | 25 | 7,565 | platform_coin_hold_allocations | 44 | 1 | 7 | 88 |
| platform_portal_sessions | 1,196 | 12 | 10 | 3,588 | platform_coin_commerce_fulfillment_commands | 34 | 1 | 13 | 68 |
| platform_portal_edge_credentials | 714 | 8 | 5 | 2,142 | platform_coin_commerce_fulfillment_receipts | 34 | 1 | 7 | 68 |
| platform_edge_desired_state_notifications | 346 | 4 | 10 | 1,384 | platform_coin_commerce_operation_receipts | 34 | 1 | 12 | 68 |
| platform_audit_events | 201 | 3 | 8 | 402 | platform_coin_commerce_orders | 34 | 1 | 13 | 102 |
| platform_coin_commerce_quotes | 197 | 2 | 17 | 394 | platform_coin_holds | 34 | 1 | 10 | 68 |
| platform_usage_rollups | 186 | 2 | 10 | 558 | platform_coin_wallets | 33 | 1 | 7 | 66 |
| platform_entitlements | 184 | 2 | 12 | 552 | platform_payment_orders_legacy_archive_20260803 | 33 | 1 | 34 | 132 |
| platform_coin_ledger_entries | 155 | 2 | 17 | 620 | platform_portal_registration_welcome_coin_grants | 29 | 1 | 25 | 58 |
| platform_issuance_requests | 144 | 2 | 13 | 576 | platform_referral_bindings | 27 | 1 | 4 | 54 |
| platform_issued_subscription_links | 144 | 2 | 8 | 432 | platform_referral_events | 14 | 1 | 5 | 14 |
| platform_portal_access_requests | 144 | 2 | 34 | 576 | platform_referral_accruals | 12 | 1 | 10 | 12 |
| platform_quota_counters | 144 | 2 | 7 | 144 | platform_referral_origins | 12 | 1 | 9 | 24 |
| platform_coin_commerce_order_events | 138 | 2 | 8 | 276 | platform_schema_migrations | 12 | 1 | 4 | 12 |
| platform_coin_operation_receipts | 135 | 2 | 15 | 270 | platform_referral_profiles | 10 | 1 | 4 | 10 |
| platform_payment_receipts | 129 | 2 | 25 | 258 | platform_portal_subscription_link_resets | 6 | 1 | 10 | 18 |
| platform_payment_orders | 123 | 2 | 25 | 246 | platform_coin_commerce_offer_versions | 3 | 1 | 25 | 9 |
| platform_referral_touches | 110 | 2 | 4 | 110 | platform_edge_agent_leases | 3 | 1 | 10 | 12 |
| platform_coin_commerce_plan_switch_quotes | 107 | 2 | 17 | 107 | platform_scheduled_plan_switches | 3 | 1 | 12 | 6 |
| platform_portal_second_factor_challenges | 105 | 2 | 10 | 315 | platform_edge_desired_states | 3 | 1 | 15 | 9 |
| platform_accounts | 77 | 1 | 5 | 154 | platform_edge_desired_state_channels | 3 | 1 | 2 | 6 |
| platform_portal_password_credentials | 75 | 1 | 12 | 225 | platform_coin_commerce_initial_confirmations | 1 | 1 | 20 | 1 |
| platform_usage_counter_cursors | 68 | 1 | 9 | 68 | platform_edge_registered_nodes | 1 | 1 | 15 | 3 |
| platform_coin_credit_origins | 46 | 1 | 10 | 46 | platform_portal_totp_credentials | 1 | 1 | 10 | 3 |
| platform_coin_lots | 46 | 1 | 20 | 92 | platform_referral_policies | 1 | 1 | 5 | 1 |
| **合计** | **6,848** | **103** | — | **22,012** | | | | | |

### 4.4 失败重试策略与暂停阈值（卡 6 §7 失败分类 F-1～F-7 的预算版）

| 情形 | 策略 | 预算影响 |
|---|---|---|
| F-1 单行失败 | `batch()` 是原子事务：任一语句失败即回滚整个序列，同批其余行不继续；失败行记入失败清单（含主键、错误原文），拆批后单独重跑；**重试最多 2 次，间隔 60 秒**；仍失败即留失败清单等 Yi 决定，**不得自行转延后清单**（转延后须 Yi 另批并补编 D 代码）；不阻塞后续批次 | 每批最多 3 次尝试；全量重试两次的最坏 rows_written **66,036**（0.1321% 月含），仅重试一次为 **44,024**（0.0880%） |
| F-2 批次失败 | 同表连续 **2 批** F-2 即停止该表；全库累计 **3 批** F-2 即停止本次运行 | 停止即停，不再产生写入 |
| F-3 源数据问题行 | 先记失败清单，Yi 另批后才可进延后清单；未获批前计 `failed_count` 不计 `deferred_count`；运行结束时失败行须清零，否则收据 status=FAIL | 不计入已装载行 |
| F-4 目标库写入冲突（唯一键等） | 按 F-1 拆批重跑路径处理 | 同 F-1 |
| F-5 单行超 2 MB | 整行延后，不入批，不截断 | 该行 0 写入 |
| F-6 中断 | 按 checkpoint 断点续跑：先读最新 checkpoint；状态不明的批次按 `row_range` 主键查 E4 有无残留，有残留先人工清残留再重跑，**不得直接重插**；中断后 **30 分钟内未恢复即本次运行暂停**，改期前须 Yi 确认 | 续跑只处理 PENDING 与 FAILED 批次；LOADED 的批次永不重插 |
| F-7 目标库状态异常 | 停止装载；先做 DDL 安装对账（E4 现 85 表与 DDL v1.1 51 表未对账，卡 6 G-8），结构一致后再开始 | 对账未通过前 0 批次 |
| 超时（≥30 秒） | **拆批重跑小批，不重试原批** | 小批的写入按实际行数重算 |
| 60 分钟 / 120 分钟 | 60 分钟为窗口预算（写入 + 复核 + 收据）；**120 分钟为硬复核点**：超时未完成即停下复盘，不继续赶工 | 时间预算见 §4.5 |

### 4.5 耗时预算（模型估算，未实测）

| 阶段 | 预算 | 依据与状态 |
|---|---|---|
| 纯写入 | 103 批 × 2–10 秒 ≈ **3.4–17.2 分钟** | 卡 6 §4.3 模型估算，**未实测**；含串行等待与触发器开销 |
| 逐表 hash 复核 | **10–30 分钟** | 卡 6 §4.3 模型估算，**未实测**；全量读 6,848 行 ×2 侧并算 hash |
| 总窗口预算 / 硬复核点 | **60 分钟 / 120 分钟** | 卡 6 §4.3；120 分钟未完成即停下复盘 |
| 首次试跑 | 先跑 **1 批（100 行）**测速，再以实测速度重算剩余时间 | 卡 6 §4.3 要求；实测计划见 §6 |

## 5 · 计算依据与实测计划的数据来源

### 5.1 用了什么（只读来源）

- **卡 6 验收包** `CARD6_6848_FIRST_BATCH_ACCEPTANCE_PACKAGE_2026-11-21.md`：快照 50 表 / 6,848 行逐表行数、100 行/批、103 批、checkpoint 字段、count/hash 口径、失败分类 F-1～F-7、60/120 分钟窗口。本卡的批次、重试、暂停阈值全部按此包实现，数字逐项复算（§4.3 合计 103 批、22,012 行写入由算子复算，测试断言）。
- **卡 7 导入器报告** `CARD7_70_TABLE_IMPORTER_IMPLEMENTATION_2026-11-21.md`（Draft PR #904，分支 `feat/d1-70-table-importer-20261121`，head `9154f0ccce90100b1830dbb693b3997a63317def`）：合成干跑数字——152 源行 → 89 装载 / 57 延后 / 4 拒绝（门开），checkpoint 合计 89 / 13 / 4 / 106，42 LOADED / 61 PENDING；`hash_match` 任一缺失即 null。**这些是合成夹具的轮次数字，不是装载量**：任一 checkpoint 的 loaded_count ≤ 2，快照规模行数（回执 1,513 等）绝不作为装载行数出现。本卡引用干跑只为证明 checkpoint 记账口径，不把 89/152 当成生产比例外推。
- **DDL v1.1** `E4_DDL_V11_2026-11-21.sql`（2,653 行，SHA-256 `88c2a685…`）：本卡只读解析——51 表 / 570 列（与 `evidence/candidate-51-parsed.json` 逐表核对一致）、70 个 CREATE INDEX（6 UNIQUE、9 部分索引）、55 个 CREATE TRIGGER（56 行含 1 行注释）、70 处 FK 引用（66 处列内 REFERENCES + 4 处表级 FOREIGN KEY；首批 50 表上 68 处）。
- **官方文档**（§3 表）：limits 页（`dateModified: 2026-11-20`）与 pricing 页（`Updated: 2026-10-30`），2026-11-21 当日直读原文。

### 5.2 关键推导（每一步都可复算）

- **索引乘数：** pricing 定义 6“每写一个被索引列另加 1 行写入”。INSERT 写全部列，所以每张表的每行写入 = 1（表行）+ 该表索引数（部分索引按谓词命中才加 1）。50 表求和：6,848 + 15,164 = **22,012**（最坏，9 个部分索引全命中）；下限 20,336（9 个部分索引全不命中）。真实值在两者之间，须由执行快照的部分索引谓词命中占比确定（§7 缺口 G-2）。
- **触发器 0 写入：** 55 个触发器全部分类：34 BEFORE UPDATE、17 BEFORE DELETE、4 BEFORE INSERT；触发体逐一grep：0 个含 INSERT INTO / UPDATE…SET / DELETE FROM（除 RAISE(ABORT) 外）。INSERT 装载只触发 4 个 BEFORE INSERT 守卫（谓词不满足即 RAISE 中止整行，不写其他表）。若 DDL 变更引入写触发器，乘数须重算——算子把 `TRIGGER_WRITES_PER_INSERT = 0` 写成显式常量，改 DDL 先改它。
- **FK 读行上界：** 68 处引用 × 逐表行数 = 7,497 行读（每引用按 1 次索引父表查找算）。这是上界假设：D1 是否强制 FK、查找是否每次恰好读 1 行，均以 rehearsal 的 `meta.rows_read` 为准（§6）。
- **对账读行：** E4 侧 COUNT 一次 + 全行 hash 读一次 = 2 × 6,848 = 13,696。源侧读走 BWH SQLite，不计 D1 账。
- **不按逻辑大小推算占用：** 历史库的逻辑大小（文件字节）≠ E4 占用。E4 占用 = 行字节 + 索引字节 + 页开销 + Time Travel 保留，须以执行快照实测文件大小与 rehearsal 的 `meta.size_after` 为准。本卡不给出 E4 字节数预测，只给 10 GB 单库硬上限与 5 GB 月含存储的对照（§3 L-6/L-16、L-23）。
- **快照已过期：** 卡 6 快照 6,848 行，2026-11-20 live 对照已是 7,029 行（+181，集中在 sessions +122、quotes +32、plan_switch_quotes +19）。装载执行时必须以执行时刻的新快照重新核对逐表行数并重跑算子；本包行数只用于批次预算编制，不得直接作为装载输入。算子 `snapshotDrift` 对此设防：快照 ≠ live 即要求重算。

### 5.3 算子（与本报告一起进 Draft PR）

`server/services/platform/d1-card13-import-batch-budget.mjs`（纯函数，无 I/O、无网络、无凭据、无 D1 调用）+ `server/tests/d1-card13-import-batch-budget.test.mjs`（23 个测试，合成数据断言边界，见 §9）。算子导出：官方限制常量（附来源链接与核对日期）、运行安全边际（语句 80,000 字节、每批 20 秒软 cap、对账读 40 MB 软 cap）、`rowsPerStatementByBinds / ByBytes`、`classifyRow`（2 MB 边界）、`planTable / planLoad / planFirstBatch6848`（含 `FIRST_BATCH_PLAN_INPUT_6848` 逐表输入）、`retryBudget / retryDelaySeconds`、`checkBatchDuration / checkResultSize / checkStorage`、`evaluatePause`（F-2/F-6/60/120 分钟阈值）、`snapshotDrift`。

## 6 · 实测计划（合成/隔离测试，不在本卡内执行）

以下实测须另行授权与隔离环境（合成数据、隔离库、只读 `meta` 回读），本卡只列计划、不执行、不写 E4：

1. **1 批试跑测速：** 先跑 1 批（100 行，回执表，21 列、4 索引）计时，校准 2–10 秒/批的模型假设；若 ≥20 秒即拆批（50 行/批）重测，直至单批稳定 <20 秒。
2. **meta 回读：** 每次 `batch()` 后读返回的 `meta.rows_read / rows_written / size_after / duration`，与 §4.2 的预算逐项比对：回执批最坏 500 行写入/批（100 行 × 5）是否属实；FK 查找与触发器守卫各读多少行；部分索引实际命中几行。
3. **回滚批次计量：** 故意让一批在 D1 侧失败回滚，读其 `meta.rows_written`，确认 Cloudflare 是否计量回滚写入——文档未写，预算暂按“计入”保守算（§7 缺口 G-1）。
4. **边界复核：** 单行 2,000,000 字节可装、2,000,001 字节延后；21 列语句 4 行可发、5 行（105 绑定）被拒；字面 100 KB 语句切分点；50 MB 结果上限按表拆读。
5. **checkpoint 续跑：** 模拟中断后只重跑 PENDING/FAILED 批次，LOADED 批次永不重插；`hash_match` 任一缺失即 null（卡 7 C-1 已修口径）。

## 7 · 未闭合缺口

| # | 缺口 | 影响 | 下一步 |
|---|---|---|---|
| G-1 | 回滚批次是否计入 rows_written，官方文档未写 | 重试预算暂按“计入”保守算（最坏 66,036）；若实测不计入，预算可下调 | §6 第 3 项实测后修正算子注释与报告 |
| G-2 | 9 个部分索引的谓词实际命中占比未知（无真实数据分布） | rows_written 真实值在 20,336～22,012 之间，差 1,676 行 | 执行快照统计各谓词命中行数后重算 |
| G-3 | 真实每批耗时未实测（卡 6 的 2–10 秒/批是模型估算） | 60/120 分钟窗口是预算不是承诺；回执批（25 语句/批）最可能先碰 30 秒 | §6 第 1 项试跑测速后重算窗口 |
| G-4 | 快照已过期（live 7,029 vs 快照 6,848，+181 行） | 本包批次数与写入数在执行时必变 | 执行时刻新快照 + 重跑算子 |
| G-5 | E4 实际占用字节数未知（未按逻辑大小推算） | 无法断言 E4 占 10 GB 上限的比例；只知行数远低于上限 | 执行快照实测文件大小 + rehearsal `meta.size_after` |
| G-6 | DDL 安装本身的 rows_written 未计（pricing 定义 3：DDL 可能同时产生读写行） | 安装 51 表 / 70 索引 / 55 触发器的计量不在本次装载预算内 | DDL 安装方案另行预算 |
| G-7 | E4 现 85 表 / 951 列 / 0 行与 DDL v1.1 51 表 / 570 列未对账（卡 6 G-8，F-7） | 对账未通过前不得开始任何批次 | DDL 安装对账先行 |
| G-8 | `subscriptions.sqlite` 303 行是否纳入未决（item 25，待 Yi 裁决） | 纳入则另行授权快照并更新范围与批次 | Yi 裁决 |
| G-9 | 卡 6 §4.2 正文写 `platform_payment_receipts` 22 列，DDL 解析为 21 列（1 列差） | 该表每语句行数不受影响（⌊100/22⌋ = ⌊100/21⌋ = 4）；但列数口径须澄清，同类于卡 6 G-6 的 827 vs 828 之 1 列差 | DDL 负责模块澄清 21 vs 22 |
| G-10 | 卡 7 G-1：3 张 DDL-only 表不在 70 表源基线里（12 行，SOURCE-INVENTORY-GAP 延后） | 本预算已含其 3 批（desired_states / channels / link_resets 共 12 行）；确认前不得凭卡 7 装载 | 父代理或 DDL 负责模块确认基线差 |
| G-11 | FK 是否在 D1 侧强制执行、触发器守卫子查询的实际读行，均未实测 | rows_read 上界 21,193 是规划假设（每引用 1 行读） | §6 第 2 项 meta 回读核对 |

## 8 · 红线遵守自查

- 只做只读核对 + 计算 + 写报告/算子：是。官方文档只读、本地证据文件只读、合成数据测试；未调任何 Cloudflare 写接口。
- 未升级套餐、未修改账单、未创建付费资源、未创建 D1/Token、未部署、未真实导入：全部遵守。$5/月与 $2.17 账单、2026-12-03 续订均为 Yi 已核实的既有事实复述，未据此推断未来资源成本已获批准。
- 未读不写生产、未动 E4 DDL、未用真实密钥、未碰真实凭据：全部遵守。快照行数与 DDL 形状均取自就绪目录的本地证据文件与公开文档。
- 未改 Notion：是（协调员统一改）。
- 本 PR 绝不合并、绝不标 Ready：Draft PR，`isDraft=true`，未请求评审（见 §9）。

## 9 · 交付清单

| # | 交付物 | 位置 / 结果 |
|---|---|---|
| 1 | 本报告 | `CARD13_D1_IMPORT_BATCH_BUDGET_2026-11-21.md`（仓库根目录，随 PR 提交） |
| 2 | 分批预算算子 | `server/services/platform/d1-card13-import-batch-budget.mjs`（新文件，纯函数） |
| 3 | 算子测试 | `server/tests/d1-card13-import-batch-budget.test.mjs`（新文件，**23/23 通过**，见下） |
| 4 | Draft PR | [#907](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/907)，分支 `feat/d1-import-batch-budget-20261121`，分支 head 见下（定稿提交 `ba0901ce…`，本行补录提交见分支 head） |

测试证据（`node --test server/tests/d1-card13-import-batch-budget.test.mjs`，Node v24.22.1，`~/workspace/d1-card13-budget/`）：**23 测试、23 通过、0 失败**。覆盖：官方限制常量逐项断言；100 绑定边界（28 列→3 行、21 列→4 行、5 行回执 105 绑定越界）；100 KB 字面语句切分（2,000 字节行 40 行进 80,000 cap、单行超 100 KB 字面装不下）；2 MB 单行边界（2,000,000 可装 / 2,000,001 延后 F-5）；30 秒批耗时边界（20 秒软 cap、30 秒拆批不重试）；50 MB 结果边界（40 MB 软 cap、超 50 MB 失败）；10 GB 单库边界；回执表 16 批 / 25 语句每批 / 最坏 7,565 写入；首批全量 103 批 / 1,412 语句 / 22,012 最坏写入 / 20,336 下限 / 7,497 FK 查找 / 13,696 对账读；批大小 250→63 批、1,000→52 批且写入不变；重试预算（2 次、60 秒、66,036）；暂停阈值（同表连续 2 批停表、全库累计 3 批停跑、60 分钟复核点、120 分钟硬停、F-6 30 分钟未恢复暂停）；快照漂移（6,848 vs 7,029 须重算）；卡 7 干跑口径（checkpoint 行数是合成轮次行数，绝不冒充快照行数）。

`git diff --check origin/master...HEAD` 通过（exit 0）。全量 `npm run test:server` 尚未跑（新 clone 须 `npm ci`；定向测试已全过，全量留待复核轮）。
