# 第四阶段 · 生产只读检查授权申请（v2.3，2026-11-16）

- **版本**：v2.3（修订版）。底本为 v2.2（`phase4-production-readonly-authorization-request-v2.2-2026-11-16.md`，888 行，SHA-256 `e6ff346a4946c96dff7a26cc07a811450afd202ce98d3dd8a548c3bebc877851`，仍 PENDING）；**v2.2 原文未改写**，本文件为独立新文件。v2.1（857 行，SHA-256 `6868607150ba7c0636e46dd4a76a21b1a07bffa8fba6aad775bb1fc84193983d`，仍 PENDING）与 v2（795 行，SHA-256 `786e4ce886d8cdd2a62e70520c714543ac38829e3d82e71d8f87a01d2494d906`，仍 PENDING）与 v1（170 行，SHA-256 `d47851aa400e17e34e7649ad543171710a6238430702c1f7aadc06778060e492`）仍为冻结快照。
- **修订依据**：v2.2 独立审查报告 `phase4-1-readonly-v2.2-independent-review-2026-11-16.md`（153 行，SHA-256 `075bb5356d399f583563291512571b634db9715df9e9aca4159469dbe78271ae`），结论**通过（可提交 Yi 书面批准）**，新发现 P3 1 项（V22-P3-1，§11 引言措辞，不阻塞提交）；以及 Phase 4.1 v2.3 任务书五项整改（S-03 编译选项、S-02 索引列定义、S-10 与 §3.3 白名单、S-06 LIMIT 10 关闭能力、S-15 明确列名）。逐项修订对照表见 §0。**本次只修订申请，不授权连接 BWH 或执行任何生产查询。**
- **修订内容**（详见 §0 修订说明对照表，每项绑定审查报告 SHA 与本地合成验证证据）：(a) V23-1：S-03 增加 `PRAGMA compile_options`，S-03 由 8 次改为 9 次；(b) V23-2：S-02 对每个实际索引增加 `PRAGMA index_xinfo` 检查（219 次，`index_info` 仅作兼容补充，不另计数），索引引用须经 `index_list` 实测结果驱动并加双引号转义；(c) V23-3：S-10 改为每表 1 条多聚合查询，禁读字段用 `SUM(CASE WHEN {列} IS NULL THEN 1 ELSE 0 END)` 形式，§3.3 与 §7 明确把该形式的适用范围扩展到 S-10；(d) V23-4：S-06 LIMIT 10 三档关闭能力写明确（0 组证无重复、≤10 组枚举须等于组总数、>10 组保持 NOT PROVEN）；(e) V23-5：S-15 改明确列名 `migration_id, ddl_checksum, applied_at`，按 `migration_id` 排序（v2.2 的 `ORDER BY version` 引用不存在的列，本地合成库实测执行失败）；(f) V22-P3-1：§11 引言“§4 全部查询模板”改为“§4 其余查询模板（除 C1、C2、D1～D6 所列外）”；(g) V23-7：附录 C 8 条 CHECK 表达式中的 58 处 D1 目标列名纠正为源列名（`lease_token_hash`→`lease_token` 48 处、`event_dedupe_key_digest`→`event_dedupe_key` 4 处、`reserve_idempotency_key_digest`→`reserve_idempotency_key` 6 处；v2.2 沿用至今的列名错误，本地验证首次执行 284 条否定式时发现）；(h) V23-8：附录 C S08-C192 补上遗漏的 `next_action_url`（v2.2 沿用至今的转录错误，首轮独立审查逐条比对源 CHECK 时发现，见 §0 V23-8）；P3-1～P3-4：UNIQUE 部分索引 13→12 个、文中断尾 v2.2→v2.3、S-11 标签 a～i→a～f、SHA 清单补 sha256sum 机核格式（见 §0）。S-11 九条 SQL 零改动；B 方案仍为**推荐方案，待 Yi 确认**；查询量由 900 + k 次改为 **1120 + k 次**（+1 S-03、+219 S-02；分项闭合见 §5）。
- **修订后状态**：申请中（PENDING）。修订后须经独立审查复核，再由 Yi 书面批准查询范围与执行窗口。未获批准前，不得连接 BWH 生产数据库，不得执行本申请中的任何查询。

- 任务：Phase 4.1 第五批 · 交付九续（v2.3 修订；**仅为申请材料，不执行生产访问**）
- 基线：Master `11dd1cfb208b78a85ce77b8c8aef2b6763f9000a`（FlyLink-com/proxy-gateway-minimal，2026-11-15，PR #886）
- 关联报告：Phase 4 可行性评估 `phase4-feasibility-assessment-2026-11-16.md`（本申请关闭其 NP-01～NP-22）；NP 对应关系与前置条件另见 Phase 4.1 M1/T2/C6 矩阵 `phase4-1-m1-t2-c6-acceptance-matrix-2026-11-16.md`（545 行，SHA-256 `618f1af415d5b81f5305ea5cc0545bc263489ed1850c03c645ec015fe5a235ce`）与 T3/G6 准备报告 `phase4-1-t3-g6-readiness-2026-11-16.md`（187 行，SHA-256 `3bc24f36d3bd1a808b64b81da20c6f798f451184fa12043c0d371629a7aa2a25`）
- 状态：**申请中（PENDING）。未获 Yi 批准前，不得连接 BWH 生产数据库，不得执行本申请中的任何查询。** 只读账号、只读 SQL、`query_only` 模式均不代表已授权。

## 0 · v2.3 修订说明（相对 v2.2 的逐项修订对照表）

- **底本**：v2.2 `phase4-production-readonly-authorization-request-v2.2-2026-11-16.md`（888 行，SHA-256 `e6ff346a4946c96dff7a26cc07a811450afd202ce98d3dd8a548c3bebc877851`），**原文未改写**；v2.1（857 行，SHA-256 `6868607150ba7c0636e46dd4a76a21b1a07bffa8fba6aad775bb1fc84193983d`）与 v2（795 行，SHA-256 `786e4ce886d8cdd2a62e70520c714543ac38829e3d82e71d8f87a01d2494d906`）亦未改写。
- **修订依据**：v2.2 独立审查报告 `phase4-1-readonly-v2.2-independent-review-2026-11-16.md`（153 行，SHA-256 `075bb5356d399f583563291512571b634db9715df9e9aca4159469dbe78271ae`），结论**通过（可提交 Yi 书面批准）**，新发现 P3 1 项（V22-P3-1，见下表）；以及 Phase 4.1 v2.3 任务书五项整改（V23-1～V23-5）。本章逐项列出 12 项修订（含 V22-P3-1 文字修正、V23-7 附录 C 列名纠正、V23-8 附录 C S08-C192 纠正与 P3-1～P3-4 措辞/格式修正）+ 2 项衍生说明；修订后交独立审查复核。
- **裁决状态不变**：当前正式裁决仍为 **NO-GO（生产迁移执行）**。本版不改变该状态，不关闭任何 NP 项，不授权连接 BWH、不授权执行任何生产查询。B 方案仍为**推荐方案，待 Yi 确认**，不构成业务决定。
- **S-11 九条 SQL**：零改动（验证见本章末小节）。
- **查询量**：固定数由 900 次 + k 次改为 **1120 次 + k 次**（+1 S-03、+219 S-02；分项闭合见 §5）。

| # | 审查发现 / 任务书整改 | v2.3 修订 |
|---|---|---|
| V23-1 | S-03 只有 8 条库级元数据查询，无编译选项查询；附录 B NP-01 关闭标准已写“版本与编译选项已记录”，但无对应查询，标准按字面不可执行 | §4 S-03 增加 `PRAGMA compile_options`（只返回编译选项元数据）；S-03 由 8 次改为 9 次；§3.2 Schema 元数据行、§5 分项表与重算注、执行计划对照同步更新；NP-01 关闭标准不变（本版补上对应的查询）。本地 SQLite 验证 compile_options 返回多行单列文本（见本章末验证小节） |
| V23-2 | S-02 只有 index_list 的索引名，无索引列定义检查；仅凭索引名不得声称已验证列定义；NP-06 标准“逐名逐列比对”无对应的列定义查询 | §4 S-02 对 index_list 返回的每个索引增加 `PRAGMA index_xinfo`（i = 219 次）；`index_info` 仅作不支持 xinfo 时的兼容补充，不计入 i；索引名须取自 index_list 实测结果，标识符加双引号并转义内嵌双引号；区分显式索引（origin 'c'）/ UNIQUE 自动索引（'u'）/ 主键自动索引（'pk'），记录键列顺序、排序方向、collation、部分索引谓词；key = 0 的 rowid 辅助列不计入键列。NP-06 关闭标准同步改写（见附录 B）。i 的对账：90（DDL 16b）+ 4（DEFER 表显式索引）= 94（源码显式索引）+ 125（自动索引）= 219 |
| V23-3 | S-10 逐列模板 `SELECT COUNT(*) FROM {表} WHERE {列} IS NULL` 与 §3.3 白名单冲突：白名单只允许禁区字段三种聚合形式，该形式不在其中；且 §4 逐列模板与 §5“每表 1 条多聚合查询（74 次）”不一致，逐列形式无法合并执行 | §4 S-10 改为每表 1 条多聚合查询模板（与 §5 一致）；禁读字段只用 `SUM(CASE WHEN {列} IS NULL THEN 1 ELSE 0 END)` 形式；§3.3 与 §7 规则 2 明确把该形式的适用范围扩展到 S-10（原仅限 S-08）；普通字段空值计数与 v2.2 逐列形式返回值逐列相等（本地合成验证 858 列一致，见本章末验证小节）；S-09 模板同步改写为合并形式（语义与计数不变）；NP-03 覆盖说明同步更新。查询量不变（S-10 仍为 74 次） |
| V23-4 | S-06 LIMIT 10 的关闭能力未写明确：组总数 > 10 时，旧文“值枚举列出至多 10 组供逐项裁决，超出部分以组总数为准”未写明 >10 组的列能否关闭，存在把前 10 组当全部异常的风险 | §4 S-06 注释、§7 规则 1c、附录 B NP-04 关闭标准同步改写为三档：组总数为 0 证无重复；组总数 1～10 时值枚举组数须等于组总数，否则记异常待裁决；组总数 > 10 时不得把前 10 组当全部异常，该列 NP-04 保持 NOT PROVEN，除非获得额外范围明确的授权并完成完整裁决。LIMIT 10 保留（有界输出）；凭据 2 列仍只计数；32 列例外声明与输出边界不变 |
| V23-5 | S-15 用 `SELECT *` 且 `ORDER BY version`：该表实际只有 3 列，无 version 列；SELECT * 亦不符合“仅返回迁移元数据”的明确列名要求 | §4 S-15 改为 `SELECT migration_id, ddl_checksum, applied_at FROM platform_schema_migrations ORDER BY migration_id`；SQL 注释与查询目的同步修正，仅返回迁移元数据。核对依据：canonical V2.2 处置 JSON 的 3 个字段行 + Master 源码 `coin-wallet-migrations.mjs` 的 CREATE TABLE。v2.2 的 S-15 在本地合成库上执行失败（no such column: version），v2.3 执行通过（见本章末验证小节）。查询量不变（仍为 1 次） |
| V22-P3-1 | §11 引言“§4 全部查询模板”措辞过宽（v2.2 审查新发现 P3，不阻塞提交） | §11 引言改为“§4 其余查询模板（除 C1、C2、D1～D6 所列外）”；D1～D6 变更清单单列于 §11，附录 B 的单列例外口径不变。文字精度修订，不改变任何查询、计数或关闭标准 |
| V23-N1 | §4 S-09 / S-10 模板与 §5 计数口径不一致（衍生说明，随 V23-3 一并修正） | §4 S-09 模板改写为每表 1 条多聚合查询的合并形式（每 TEXT 列 1 个 MAX(LENGTH()) 聚合项），单列形式保留为“单列抽查形式”；语义与计数不变（S-09 仍为 74 次）。S-10 见 V23-3 |
| V23-7 | 附录 C CHECK 表达式引用了源 SQLite Schema 不存在的列名（8 条；v2.2 沿用至今，本地验证首次执行 284 条否定式时发现：`no such column: ...`）：`lease_token_hash`（6 条：S08-C012、C127、C133、C140、C214、C270）、`event_dedupe_key_digest`（1 条：S08-C193）、`reserve_idempotency_key_digest`（1 条：S08-C258）；三者均为 canonical 处置 JSON 中的 D1 TRANSFORM 目标列名，Master 源码 DDL 的源列名分别为 `lease_token`（`coin-commerce-migrations.mjs` 第 330、338–339 行）、`event_dedupe_key`（`payment-store-migrations.mjs` 第 89、126、136 行）、`reserve_idempotency_key`（`wallet-first-deferred-checkout-migrations.mjs` 第 96、138、148、158 行） | 附录 C 8 条表达式中的 58 处目标列名一律纠正为源列名（`lease_token_hash` 48 处、`event_dedupe_key_digest` 4 处、`reserve_idempotency_key_digest` 6 处；CHECK 表达式与否定式 WHERE 各半）；S-08 合并 CHECK 查询模板不变（按表展开，仍为 141 次）；284 条否定式本地合成验证全部可执行（见本章末验证小节）。CHECK 表达式只作 IS NULL / LENGTH > 0 的存在性判定，合并查询只返回计数，不读相关列原文 |
| V23-OBS-1 | S-02 索引列定义核对的新发现（观察，不阻塞提交）：Master 建成的本地合成库实测 51 个 UNIQUE 约束自动索引中 17 个为复合多列约束，另有 12 个 UNIQUE 部分索引；二者的约束执行不在 S-06 的 34 列单列检查范围内 | 不扩大 S-06 范围（不悄悄增加查询）；附录 B NP-04 行增加注记，写明复合 UNIQUE 约束与 UNIQUE 部分索引的违反判定须另行申请补充查询；S-02 只验证其索引定义存在与列定义一致。NP-04 关闭标准仍限于 34 列单列检查 |

| V23-8 | 附录 C S08-C192（`platform_payment_receipts` 多列状态机）的 CHECK 表达式遗漏 `next_action_url`：v2.3 原文为两列版（仅 `next_action_type` 与 `next_action_expires_at` 同为 NULL 或同为 NOT NULL），源 CHECK 为三列版（首轮独立审查 P2-1，唯一阻塞项） | v2.2 沿用至今的转录错误；附录 C 否定式弱于真实 CHECK：仅 `next_action_url` 失同步的行（如 type 为 NULL、url 非 NULL、expires 为 NULL）会被旧否定式判为通过，只漏报、不误报，NP-07 对该约束的证据不完整 | 附录 C S08-C192（CHECK 表达式列与否定式 WHERE 列） | 附录 C S08-C192（CHECK 表达式与否定式 WHERE 同步补上 `next_action_url is null` / `is not null`，与源 CHECK 逐字一致；§0 本表新增 V23-8 条目）；独立修订对照表同步新增 V23-8 | 源 CHECK 核对依据：Master 源码 `server/services/platform/payment-store-migrations.mjs` 第 110–124 行（`platform_payment_receipts` 表级 CHECK，三列同为 NULL 或三列同为 NOT NULL）+ 本地合成库 `sqlite_master` 平衡括号抽取的源 CHECK（空白归一化后逐字一致）；验证器 item 4：284/284 否定式执行通过，空库违反计数全 0，4/4 种子违规被检出，其中 S08-C192 种子行（仅 `next_action_url` 非 NULL）新否定式检出 1 行、旧两列式为 0（证实旧式漏报） |
| V23-P3-1 | UNIQUE 部分索引数量“13 个”与实测不符，应为 12 个（首轮独立审查 P3-1） | 合成库实测：`PRAGMA index_list` unique=1 且 partial=1 共 12 行；`sqlite_master` 中 `CREATE UNIQUE INDEX … WHERE …` 共 12 条；两种方法一致；多计的 1 个为 74 表之外的 `portal_link_reset_pending_request_idx`，不在合成库内 | §0 V23-OBS-1；§4 S-02（2 处）；附录 B NP-04 注记；SQL 清单 §4 模板摘录（2 处）；修订对照表 V23-OBS-1 行；NP 矩阵 NP-04 行 | 8 处“13 个 UNIQUE 部分索引”全部改为 12 个；§0 本表新增 V23-P3-1 条目；独立修订对照表、SQL 清单、NP 矩阵同步修正 | 本修复组在合成库中重数：方法 (a) index_list unique=1 且 partial=1 共 12 行（逐名：account_resource_authorities 4 个、offer_versions_one_published、rotation_pending、credential_reset_pending、edge_active_request、transitions_one_active_account、identity_bindings 2 个、scheduled_one_scheduled）；方法 (b) sqlite_master 文本共 12 条；74 表之外的 portal_link_reset 索引在合成库中 0 命中；OBS-1 实质（复合/部分 UNIQUE 约束执行不在 S-06 的 34 列单列检查范围内）不受影响 |
| V23-P3-2 | 文中断尾（附录 B 之后）仍写“本申请 v2.2 状态”（首轮独立审查 P3-2） | 全文复制 v2.2 时未更新该行；文末已正确写 v2.3 | 附录 B 之后断尾行（原第 558 行） | 改为“本申请 v2.3 状态”；全文检索无其他残留“v2.2 状态”页脚表述 | 文字修正，不改变任何查询、计数或关闭标准；全文检索确认仅该 1 处 |
| V23-P3-3 | SQL 清单与重算报告把 S-11 九条写作“S-11a～i”，实际标签为 S-11a～f（首轮独立审查 P3-3） | 标签写法有误；计数 9 条无误（a 1、b 1、c 2、d 2、e 2、f 1） | SQL 清单分项表 S-11 行；重算报告分项表 S-11 行 | 两处均改为“S-11a～f”；全文检索两文件及其他交付物无同款笔误残留 | 文字修正，9 条计数不动；申请正文 §5 写法原本正确 |
| V23-P3-4 | SHA 清单为 Markdown 表格，无法用 `sha256sum -c` 机核（首轮独立审查 P3-4） | 清单内“校验命令”小节的 `sha256sum <文件…>` 只能输出哈希、不能自动比对；`sha256sum -c` 复现失败（no properly formatted checksum lines found） | SHA 清单“校验命令”小节 | 在 SHA 清单内保留人类可读表格的同时，追加一段 sha256sum 标准格式（`SHA-256 + 两空格 + 文件名`，每行一项）的纯文本代码块，覆盖除清单自身外的 8 项交付物（含验证脚本与配套合成库构造脚本）；清单自身 SHA 不自指，仍以直接 `sha256sum` 命令核对（见清单“本清单自身”小节）；实测 `sha256sum -c` 通过 | 清单重生成后逐项复核每个 SHA 与实测一致；机核命令与输出见验证日志与协调员回报 |
**v2.3 修订后验证（实测记录；未连接 BWH，未执行生产 SQL）**：

- S-11 九条 SQL：从 v2.3 与 v2.2 文档原文重新抽取（S-11a 至 S-12 区块，剥离整行注释后按 `;` 切分），逐字比对 9/9 一致；空库实跑 9/9 通过（S-11a 返回基数全 0；S-11b/c/d/e 违反计数全 0；S-11e(2) 返回 (orphan_receipts=0, unversioned_receipts=0)；S-11f 返回 0 行）；合成违规库实跑 9/9 通过（S-11a (1, 1, 2, 2, 0)；S-11b 1；S-11c 1 / 0；S-11d 1 / 1；S-11e 1 / (1, 1)；S-11f ('paid_coins', 1, 85, 0, 5)；与 v2.2 实测值一致）。
- §5 分项重算：453 + 74 + 50 + 334 + 148 + 52 + 9 = **1120**，合计 **1120 + k** 闭合；执行计划对照式 9 + 444 + (124 + k) + 543 = **1120 + k** 闭合。
- S-02 i = 219 对账：DDL 16b CREATE INDEX 90 个 + 2 张 DEFER 表的显式索引 4 个 = 源码显式索引 94 个（与 V2.1 清单一致）；94 + sqlite_autoindex 125 个（PRIMARY KEY 自动索引 74 个，每表 1 个；UNIQUE 约束自动索引 51 个，其中单列 34 个、复合多列 17 个）= 219。Master 源码建成的本地合成库实测：74 张表、858 列、639 列 NOT NULL、index_list 219 行、index_xinfo 219 次全部执行通过，总行数 543 行（键列 324 行 + rowid 辅助列 219 行，每索引 1 行）；键列 collation 全部 BINARY，314 ASC / 10 DESC；部分索引 22 个；表达式索引 0 个。
- S-03 compile_options：本地 SQLite 实测返回 58 行单列文本（示例：`COMPILER=gcc-13.3.0`、`ENABLE_JSON1` 等，见验证日志）；S-03 9 条全部执行通过。
- S-15：v2.2 的 S-15（`SELECT * ... ORDER BY version`）在 Master 建成的本地合成库上执行失败（`no such column: version`，复现 1 次）；v2.3 的 S-15（明确 3 列，按 `migration_id` 排序）执行通过，返回 3 列（migration_id / ddl_checksum / applied_at）。
- S-10 等价性：合并 CASE 形式与 v2.2 逐列 `COUNT(*) WHERE {列} IS NULL` 形式在合成库全部 858 列上逐项比对一致（858/858；空表上 SUM 返回 NULL，执行方按 0 计，与 v2.2 合并形式同口径）；禁读字段只走 CASE 形式，不返回原文、哈希、指纹或行级样本。
- 附录 C CHECK 否定式：284 条逐项可执行，空库上违反计数全 0；4 处种子违规（leads 状态枚举、coin_lots issued_units、ads_consent ad_personalization、platform_payment_receipts 仅 `next_action_url` 失同步 S08-C192）均被检出（S08-C192 新否定式检出 1 行，旧两列式为 0，证实旧式漏报）；其中 8 条原引用 v2.2 的 D1 目标列名（源 Schema 不存在该列），v2.3 已按 Master 源码 DDL 纠正为源列名（`lease_token_hash`→`lease_token` 6 条、`event_dedupe_key_digest`→`event_dedupe_key` 1 条、`reserve_idempotency_key_digest`→`reserve_idempotency_key` 1 条，见 V23-7）。
- S-06 LIMIT 10 三档：合成库 0 组、5 组、10 组、11 组、15 组重复列逐档验证，判定与预期一致（0 组证无重复；≤10 组枚举组数等于组总数；>10 组记 NOT PROVEN，不冒充全量）。
- 50/41/2 重算：附录 B NOT NULL 列集 74 张表、639 列：含 created_at 的表 50 张、含 status 的表 41 张、含 purpose 的表 2 张（platform_coin_holds、platform_issuance_requests），与 §5 / S-12 一致（核验边界见 §5 重算注；Master 建成的合成库实测亦为 50/41/2）。
- B 方案文字：v2.3 全文“推荐方案，待 Yi 确认”出现 9 处（≥8），全文无任何将 B 方案写成已批准/已确认/已决定的表述。
- 14 项本地验证：验证脚本 `phase4-1-validate-v23-from-doc.py` 从 v2.3 文档原文抽取 SQL 并执行，逐项结果见验证日志 `phase4-1-v23-validation.log`（14/14 PASS）。

## 1. 访问目标

- **目标系统**：BWH Shared Control DB（当前生产权威 BWH / pr799），即 `subscription-control.sqlite`（以生产实际文件名为准，执行前核对；若文件名或路径与此不符，停止并重新申请）。
- **目标主机**：BWH（经已建立的 Tailscale/SSH 只读通道执行，执行方与执行窗口由 Yi 指定）。
- **不访问的目标**：`subscriptions.sqlite`（另一生产库）、任何边缘节点、任何生产应用服务进程、Cloudflare 侧任何资源。本申请不建付费云资源，不做生产变更。

## 2. 目的（为什么必须读生产）

可行性评估的 Q1（能不能迁）与 Q2（迁多少）共 22 项 NOT PROVEN，全部卡在“仓库 Schema 是否等于生产库”与“生产数据长什么样”这两个问题上。合成验证（G6 v3 73/73、夹具 86/86、触发器 240/240）只能证明“仓库 Schema 能迁”，不能证明“生产库能迁”。不读生产，这 22 项永远无法关闭，生产迁移的 GO 永远无法给出。本申请只覆盖关闭这 22 项所需的最小范围，不多读一行。

## 3. 具体表与字段（74 表全覆盖，分三类）

### 3.1 全量覆盖的表（74 张，见附录 A）

74 张表全部在检查范围内，因为 Schema 一致性检查必须全量比对——少查一张，就可能漏掉一张漂移的表。74 张表清单与 V2.2 处置文件（`54dca795…`）的 `tables` 数组一致。

### 3.2 可读取的字段类别（只读聚合与元数据，见 §4 查询语句）

| 类别 | 字段 | 用途 |
|---|---|---|
| Schema 元数据 | `sqlite_master` 的全部行（表/索引/触发器/视图的定义 SQL）、`PRAGMA table_info / index_list / index_xinfo / foreign_key_list / user_version / compile_options / page_count / page_size / journal_mode / encoding / application_id / schema_version`（`index_xinfo` 按索引逐项执行，索引名取自 `index_list` 实测结果；`compile_options` 只返回编译选项元数据） | NP-01、NP-02、NP-06、NP-09、NP-12：漂移检查 |
| 计数与聚合 | 每表 `COUNT(*)`；每表 `MIN(created_at)`、`MAX(created_at)`（仅有 `created_at` 列的表）；按月分组计数（仅有 `created_at` 列的表） | NP-13、NP-15、NP-16：规模与增长 |
| 约束检查 | FK 孤儿行计数、UNIQUE 重复计数、CHECK 违反计数、NOT NULL 违反计数 | NP-04、NP-05、NP-07：脏数据检查 |
| 长度聚合 | 每 TEXT 列 `MAX(LENGTH(col))`（只读聚合，不返回原文） | NP-10：单行 2 MB 上限检查 |
| 空值分布 | 每列 `COUNT(*) WHERE col IS NULL`（只读聚合） | NP-03：NULL 分布 |
| 余额重算 | 逐账户钱包余额重算（只读聚合，与 `platform_coin_wallets` 比对，输出“一致/不一致 + 不一致账户数”，不输出账户明细） | NP-17：账本一致性 |
| 凭据类表的行数 | `platform_portal_password_credentials`、`platform_portal_passkey_credentials` 仅 `COUNT(*)` 与状态分布（`status` 枚举计数） | NP-13：规模；**不读任何凭据字段值** |
| 外置字段的非空计数 | 7 个 EXTERNALIZE 字段仅 `COUNT(*) WHERE col IS NOT NULL` | NP-19：外置数据规模；**不读原文** |
| 摘要列分布 | 13 个摘要列仅计数与空值分布 | M1-03 定稿输入 |

### 3.3 明确不读的字段（禁区，任何查询不得引用）

- `platform_portal_password_credentials.password_hash`（密码哈希）及该表除 `COUNT(*)`、状态分布外的任何字段值。
- `platform_portal_passkey_credentials.credential_id`、`credential_id_hash`、`public_key_jwk_json`、`transports_json`、`sign_count` 的字段值（仅允许 `COUNT(*)` 与状态分布）。
- `platform_portal_totp_credentials.encrypted_totp_secret`（加密的 TOTP 密钥）。
- `platform_leads.email`、`platform_leads.message`（邮箱原文与留言原文）。
- `platform_portal_access_requests.subscription_url`、`platform_payment_receipts.next_action_url`、`platform_payment_orders_legacy_archive_20260803.checkout_url`、`checkout_qr_code`（订阅链接、支付链接、二维码原文）。
- 任何用户的邮箱、手机号、真实姓名、支付账号、节点订阅链接、边缘凭据原文、API 密钥、令牌原文。
- 任何 `metadata_json` / `event_json` / `payload_json` 的原文（仅允许 `MAX(LENGTH())` 聚合）。

**S-10 说明（v2.3）**：S-10 每表 1 条多聚合查询中，禁读字段的空值计数只用第三种聚合形式 `SUM(CASE WHEN {列} IS NULL THEN 1 ELSE 0 END)`，不返回原文、哈希、指纹或行级样本；普通字段的空值计数与 v2.2 逐列形式 `SELECT COUNT(*) FROM {表} WHERE {列} IS NULL` 的返回值逐列相等（本地合成验证 858 列一致，见 §0）。S-10 的单列抽查形式仅限普通字段，禁读字段不得用此形式。

**S-06 修补（P2-2）**：`platform_portal_passkey_credentials.credential_id` 与 `credential_id_hash` 不得出于 S-06 的重复检查而返回原文：S-06 对这两列只执行 §4 所列的 4 条纯计数查询（总数、去重值数、重复组数），不返回任何值、不返回哈希/指纹；其余 32 个 UNIQUE 列的重复值可返回（均为非凭据列，见附录 D）。另：其余 32 列逐项增加一条重复组总数查询（见 §4 S-06），只返回组数，不返回任何值（R2-OBS-1）。

**脱敏原则**：本申请的查询只返回 Schema、计数、聚合值与枚举分布；除“不一致账户数”等聚合数字外，不返回任何可关联到具体用户的行级数据。如某项检查必须看行级样本（如坏行定位），样本须以指纹形式记录（12 位 hex 指纹 / 64 位 hex PK 哈希，与 G6 演练隔离机制一致），原文不得落盘，不得写入报告。**S-11 除外**：本次申请不输出不一致钱包的指纹清单（见 §4 S-11；R2-P2-1 B 方案，推荐方案，待 Yi 确认）。

**禁读清单汇总（v2.1）**：以下字段/数据的原文一律不得读取（§3.3 明细为准，本表仅为汇总，范围不扩大也不缩小）：(1) 凭据类：`platform_portal_password_credentials.password_hash`；`platform_portal_passkey_credentials.credential_id`、`credential_id_hash`、`public_key_jwk_json`、`transports_json`、`sign_count` 的字段值；`platform_portal_totp_credentials.encrypted_totp_secret`；(2) PII 与联系原文：`platform_leads.email`、`platform_leads.message`，以及任何用户的邮箱、手机号、真实姓名；(3) 链接与支付原文：`platform_portal_access_requests.subscription_url`、`platform_payment_receipts.next_action_url`、`platform_payment_orders_legacy_archive_20260803.checkout_url`、`checkout_qr_code`，以及任何支付账号、节点订阅链接；(4) 密钥与令牌：任何边缘凭据原文、API 密钥、令牌原文；(5) JSON 原文：任何 `metadata_json` / `event_json` / `payload_json` 的原文（仅允许 `MAX(LENGTH())` 聚合）。禁区字段在查询语句中只允许三种聚合形式：`COUNT(*) WHERE {列} IS NOT NULL`、`MAX(LENGTH({列}))`与 S-08 NOT NULL 合并查询及 S-10 每表多聚合空值查询所用的 `SUM(CASE WHEN {列} IS NULL THEN 1 ELSE 0 END)`（第三种形式仅作 IS NULL 判定、只返回计数，不返回值；其适用范围为 S-08 与 S-10，不得用于其他查询；v2.3 扩展，见 §4 S-10）；S-06 对 `credential_id` / `credential_id_hash` 只允许 §4 所列 4 条纯计数查询。

## 4. 查询语句（只读模板，执行前须逐条复核）

以下为模板，`{表}`、`{列}` 须按附录 A 的 74 表逐项展开；执行时须以只读连接执行，禁止任何 `INSERT / UPDATE / DELETE / DROP / ALTER / CREATE / VACUUM / ATTACH / PRAGMA journal_mode=...`（写模式 PRAGMA）。

```sql
-- S-01 Schema 全量（漂移检查 NP-01/02/06/09/12）
SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name;
-- S-02 每表列定义与索引列定义（与 V2.2 逐字段比对；v2.3 新增索引列定义检查）
PRAGMA table_info({表});            -- 逐表执行，共 74 次
PRAGMA index_list({表});            -- 逐表执行，共 74 次
PRAGMA foreign_key_list({表});      -- 逐表执行，共 74 次
PRAGMA index_xinfo("{索引名}");     -- 逐索引执行，共 i = 219 次（索引名须取自
                                     -- 本表 index_list 的实测返回，不得凭空拼接）
-- S-02 新增（v2.3）：索引列定义检查。index_list 只返回索引名、唯一性与来源
-- （origin：'c' = CREATE INDEX 显式索引、'u' = UNIQUE 约束自动索引、
-- 'pk' = PRIMARY KEY 自动索引），不返回索引键列；仅凭 index_list 的索引名
-- 不得声称已验证列定义。对 index_list 返回的每个索引追加一次 index_xinfo：
--   · key = 1 的行是索引键列（按 seqno 顺序）；key = 0 的行是 SQLite 辅助信息
--     （rowid 辅助列，cid = -1、name 为 NULL），不是索引键，不得计入键列；
--   · 键列中 cid >= 0 的行对应表列（name 为列名）；cid = -2 的行是表达式索引
--     的表达式列（name 为 NULL，表达式文本取自 sqlite_master 的索引定义 SQL）；
--     本 Schema 实测表达式索引 0 个，出现时按定义 SQL 逐项记录并裁决，
--     不得静默跳过；
--   · 每键列记录排序方向（desc：0 = ASC、1 = DESC）与 collation（coll 列）；
--     本 Schema 实测键列 324 个，全部 BINARY collation，314 ASC / 10 DESC；
--   · partial（index_list 的 partial = 1）须记录 WHERE 谓词（取自 sqlite_master
--     的索引定义 SQL）；本 Schema 实测部分索引 22 个，其中 12 个为 UNIQUE 部分索引；
--   · 索引名引用方式：标识符加双引号，内嵌双引号加倍转义（""）；索引名只取自
--     index_list 实测结果，不得拼接未经验证的名字；验证见 §0（注入中和实测）。
--   · 兼容补充：仅当执行环境的 SQLite 不支持 index_xinfo 时，改用
--     PRAGMA index_info("{索引名}")（返回 seqno / cid / name，不含 desc / coll /
--     key，不计入查询量 i；须在执行日志中注明降级与缺失字段，不得以 index_info
--     的结果冒充 index_xinfo 的列定义）。
-- i 的口径（v2.3，机械复现）：i = 74 张表 index_list 返回行数之和 = 219。
-- 对账：DDL 16b 的 CREATE INDEX 90 个 + 2 张 DEFER 表的显式索引 4 个
-- （password / passkey 各 2 个）= 源码显式索引 94 个（与 V2.1 清单一致）；
-- 94 + sqlite_autoindex 125 个（PRIMARY KEY 自动索引 74 个，每表 1 个；
-- UNIQUE 约束自动索引 51 个，其中单列 34 个、复合多列 17 个）= 219。
-- 219 的实测来源：Master 11dd1cfb 源码建成的本地合成库（见 §0），
-- index_xinfo 总行数 543 行（键列 324 行 + rowid 辅助列 219 行，每索引 1 行）。
-- 补充说明（V23-OBS-1）：17 个复合 UNIQUE 约束与 12 个 UNIQUE 部分索引的
-- 约束执行不在 S-06 的 34 列单列检查范围内（见附录 B NP-04 注记）；S-02 只
-- 验证其索引定义存在与列定义一致，不判定其约束是否被违反。
-- S-03 库级元数据（v2.3：新增 PRAGMA compile_options，共 9 次）
PRAGMA user_version;  PRAGMA schema_version;  PRAGMA application_id;
PRAGMA page_count;    PRAGMA page_size;        PRAGMA encoding;
PRAGMA journal_mode;  -- 只读查询当前模式，不得修改
PRAGMA compile_options;  -- 只返回编译选项元数据（每行一个选项，如 'COMPILER=...'、
                         -- 'ENABLE_JSON1' 等）；本地 SQLite 实测返回多行单列文本，
                         -- 不返回任何业务数据（见 §0）
SELECT sqlite_version();
-- S-04 每表行数（NP-13）
SELECT COUNT(*) FROM {表};          -- 逐表执行，共 74 次
-- S-05 每表时间跨度与增长（NP-15/16；仅有 created_at 列的表）
SELECT MIN(created_at), MAX(created_at), COUNT(*) FROM {表};
SELECT substr(created_at, 1, 7) AS month, COUNT(*) FROM {表}
  GROUP BY month ORDER BY month;    -- 仅对行数超过 1,000 的表执行
-- S-06 唯一约束重复检查（NP-04；V2.2 的 34 个 UNIQUE 列中 32 列可执行，见附录 D 的逐项清单）
-- 排除的 2 列（与 §3.3 冲突的修补）：platform_portal_passkey_credentials.credential_id 与
-- credential_id_hash 不得在任何查询中以 SELECT {列} 形式返回原文（也不得以哈希/指纹形式返回，
-- SQLite 无内置哈希函数，且凭据标识的哈希仍属可关联标识）。对这两列只执行以下两条纯计数查询：
-- (a) 总行数与去重值数之差即重复值总数（值本身不离开库引擎的聚合层）；
-- (b) 重复组数（内层 GROUP BY 只在引擎内分组，返回的仅为组数，不返回任何值）。
SELECT COUNT(*) AS total_rows, COUNT(DISTINCT credential_id) AS distinct_values
  FROM platform_portal_passkey_credentials;
SELECT COUNT(*) AS duplicate_groups
  FROM (SELECT credential_id FROM platform_portal_passkey_credentials
         GROUP BY credential_id HAVING COUNT(*) > 1);
SELECT COUNT(*) AS total_rows, COUNT(DISTINCT credential_id_hash) AS distinct_values
  FROM platform_portal_passkey_credentials;
SELECT COUNT(*) AS duplicate_groups
  FROM (SELECT credential_id_hash FROM platform_portal_passkey_credentials
         GROUP BY credential_id_hash HAVING COUNT(*) > 1);
-- 其余 32 列逐项执行（返回重复值与组内行数；这 32 列均为非凭据列，见附录 D）：
SELECT {列}, COUNT(*) AS c FROM {表} GROUP BY {列} HAVING c > 1 LIMIT 10;
-- 其余 32 列逐项另执行一条重复组总数查询（只返回组数，不返回任何值；与值枚举配合使用。
-- v2.3 三档关闭能力（LIMIT 10 保留，有界输出）：
--   (a) 组总数为 0：可据此证明该列无重复组；
--   (b) 组总数在 1～10 之间：核对值枚举的组数须等于组总数，不等即记为异常待裁决，
--       不得直接关闭；
--   (c) 组总数 > 10：不得把前 10 组当作全部异常，该列 NP-04 保持 NOT PROVEN，
--       除非获得额外范围明确的授权并完成完整裁决。超出 10 组的部分以组总数为准，
--       不再以“未枚举的组不存在”为前提）：
SELECT COUNT(*) AS duplicate_groups FROM (SELECT {列} FROM {表} GROUP BY {列} HAVING COUNT(*) > 1);
-- 32 列清单（表.列）：
--   platform_data_pack_resources.command_ref
--   platform_data_pack_resources.request_ref
--   platform_data_pack_resources.entitlement_ref
--   platform_data_pack_edge_credentials.edge_credential_ref
--   platform_usage_samples.sample_digest
--   platform_portal_entries.token_hash
--   platform_coin_wallets.account_id
--   platform_coin_lots.credit_origin_ref
--   platform_coin_credit_origins.lot_ref
--   platform_coin_commerce_orders.quote_ref
--   platform_coin_commerce_orders.hold_ref
--   platform_coin_commerce_fulfillment_commands.order_ref
--   platform_coin_commerce_initial_confirmations.command_ref
--   platform_coin_commerce_initial_confirmations.order_ref
--   platform_coin_commerce_initial_confirmations.effect_ref
--   platform_coin_commerce_initial_confirmations.approval_sha256
--   platform_coin_commerce_initial_confirmations.receipt_ref
--   platform_referral_policies.effective_at
--   platform_referral_profiles.code
--   platform_referral_origins.lot_ref
--   platform_referral_origins.payment_order_ref
--   platform_referral_accruals.reward_lot_ref
--   platform_deferred_resource_transitions.order_ref
--   platform_deferred_resource_transitions.reservation_ref
--   platform_deferred_resource_transition_rebases.effect_ref
--   platform_wallet_first_deferred_checkout_quotes.deferred_order_ref
--   platform_wallet_first_deferred_checkout_quotes.transition_ref
--   platform_wallet_first_resource_effect_runtime_claims.effect_ref
--   platform_wallet_first_setup_delivery_handoffs.effect_ref
--   platform_portal_registration_welcome_coin_grants.account_id
--   platform_portal_registration_welcome_coin_grants.source_ref
--   platform_identity_deletion_jobs.request_id
-- S-07 外键孤儿检查（NP-05；按 V2.2 的 125 个 FK 关系逐项，模板如下）
SELECT COUNT(*) FROM {子表} AS c LEFT JOIN {父表} AS p
  ON c.{外键列} = p.{主键列} WHERE p.{主键列} IS NULL AND c.{外键列} IS NOT NULL;
-- S-08 CHECK / NOT NULL 违反计数（NP-07）
-- 口径（P2-2 修补；两个数是不同口径，不得混用）：
-- (1) NOT NULL 列 639 列：V2.2 中 nullable=false 的全部列（858 列中 639 列），字段集见附录 B
--     （按表逐项列出 74 张表全部 639 列）。其中 61 列带有非空默认值（default 非 NULL），
--     578 列无默认值。61 列是 639 列的子集（61 列全部落在 NOT NULL 集内；nullable 列中
--     0 列带默认值）。v1 所称“约 60 项”即这 61 列默认值列，不是 NOT NULL 列数。
-- (2) CHECK 子句 284 条：目标 DDL 16b 中的 279 条（239 条列级 + 40 条多列状态机表级，
--     覆盖 65 张表；9 张表在 DDL 中无 CHECK 子句）+ 2 张 DEFER 凭据表在源码中的 5 条
--     （subscription-control-db.mjs:1727-1765，见附录 C 末尾 5 条）。V2.2 的“244 个 CHECK
--     字段”是按字段计数：239 条 DDL 列级 CHECK 对应 239 个字段，另 5 个字段在 DEFER 表
--     （password: status/failure_count/must_rotate；passkey: sign_count/status），
--     239 + 5 = 244；40 条表级 CHECK 不归属单字段，故不在 244 内。三数关系：244 字段、
--     279 DDL 子句、284 子句总数，口径各不相同，均已对账一致。
-- 违反判定（SQLite 语义）：CHECK 仅在表达式值为 0（false）时失败，值为 NULL 时通过；
-- 因此逐条违反判定统一为 WHERE (<CHECK 原文>) = 0（不用 NOT(<原文>)，语义相同但
-- = 0 更直观）。每条判定只返回计数，不返回行原文；坏行定位只记指纹（见 §6）。
-- 执行方式（按表合并）：每表 1 条 NOT NULL 合并查询（该表全部 NOT NULL 列各 1 个
-- CASE 计数）+ 每表 1 条 CHECK 合并查询（该表全部 CHECK 子句各 1 个 CASE 计数）；
-- 空表时 SUM(CASE...) 返回 NULL，执行 wrapper 须以 COALESCE(..., 0) 计 0，不得记为缺失。
-- 有 CHECK 子句的表 67 张（65 张 DDL 表 + 2 张 DEFER 表），故 S-08 共 74 + 67 = 141 次。
-- NOT NULL 合并查询模板（{表} 的全部 NOT NULL 列逐项展开，见附录 B）：
SELECT COUNT(*) AS rows_checked,
       SUM(CASE WHEN {列1} IS NULL THEN 1 ELSE 0 END) AS {列1}_nulls,
       SUM(CASE WHEN {列2} IS NULL THEN 1 ELSE 0 END) AS {列2}_nulls
       -- ……该表其余 NOT NULL 列同法
  FROM {表};
-- CHECK 合并查询模板（{表} 的全部 CHECK 子句逐项展开，子句原文与编号见附录 C）：
SELECT COUNT(*) AS rows_checked,
       SUM(CASE WHEN (<CHECK 子句 S08-Cxxx 原文>) = 0 THEN 1 ELSE 0 END) AS chk_S08_Cxxx,
       SUM(CASE WHEN (<CHECK 子句 S08-Cyyy 原文>) = 0 THEN 1 ELSE 0 END) AS chk_S08_Cyyy
       -- ……该表其余 CHECK 子句同法
  FROM {表};
-- 单条抽查形式（与合并查询等价，供复核时逐条执行）：
SELECT COUNT(*) FROM {表} WHERE (<CHECK 子句原文>) = 0;  -- 任一条 CHECK 子句
SELECT COUNT(*) FROM {表} WHERE {列} IS NULL;            -- 任一 NOT NULL 列
-- S-09 单列最大长度（NP-10；每表 1 条多聚合查询，只返回数字；v2.3：模板改写为
-- 与 §5 一致的合并形式，语义与计数不变——每 TEXT 列 1 个 MAX(LENGTH()) 聚合项）
SELECT MAX(LENGTH({列1})) AS {列1}_maxlen,
       MAX(LENGTH({列2})) AS {列2}_maxlen
       -- ……该表其余 TEXT 列同法
  FROM {表};
-- 单列抽查形式（与合并查询等价，供复核时逐项执行）：
SELECT MAX(LENGTH({列})) FROM {表};
-- S-10 空值分布（NP-03；每表 1 条多聚合查询；v2.3：模板改写为与 §5 一致的
-- 合并形式，并修补与 §3.3 白名单的冲突——见下文）
SELECT COUNT(*) AS rows_checked,
       SUM(CASE WHEN {列1} IS NULL THEN 1 ELSE 0 END) AS {列1}_nulls,
       SUM(CASE WHEN {列2} IS NULL THEN 1 ELSE 0 END) AS {列2}_nulls
       -- ……该表其余列同法
  FROM {表};
-- v2.3 说明：(a) 禁读字段（§3.3 清单列）只用第三种聚合形式
-- SUM(CASE WHEN {列} IS NULL THEN 1 ELSE 0 END)，只返回空值计数，不返回原文、
-- 哈希、指纹或行级样本；该形式的适用范围已在 §3.3 与 §7 规则 2 中明确扩展到
-- S-10（原仅限 S-08）；(b) 普通字段的空值计数与 v2.2 逐列形式
-- SELECT COUNT(*) FROM {表} WHERE {列} IS NULL 的返回值逐列相等（本地合成
-- 验证：全部 858 列逐项比对一致，见 §0），合并形式只是把逐列查询合并为每表
-- 1 条，不改变返回值与查询量（仍为 74 次）；(c) 单列抽查形式（与合并查询
-- 等价，供复核时逐项执行；仅限普通字段，禁读字段不得用此形式）：
-- SELECT COUNT(*) FROM {表} WHERE {列} IS NULL;
-- S-11 钱包余额重算（NP-17；只输出一致/不一致汇总与各子项违反计数）
-- 余额与账本的对应关系（核对依据：Master 11dd1cfb 源码逐行核对）：
-- (1) platform_coin_wallets 没有余额列（6 列：wallet_ref / account_id / status / version /
--     created_at / updated_at，见 V2.2）。“钱包余额”不是一张存储值，而是投影：
--     coin-wallet-domain.mjs:223 projectCoinWalletBalance() 对每钱包按 coin_type 汇总 lots：
--     totals[coin_type] = SUM(available_units)；spendable = Σ available；held = Σ held_units；
--     pending = Σ pending_units。聚合 SQL 的原型在 coin-wallet-store.mjs 约 2700 行
--     （按 wallet_ref + coin_type 分组求和）。
-- (2) 过期 bonus 规则：聚合时 coin_type='bonus_coins' 且 expires_at 非空且 expires_at <=
--     执行时刻的 lot 贡献 0（原型 SQL 的 CASE 分支；执行时刻以 ref_ts 记录在案，见 S-11a）。
-- (3) 账本：platform_coin_ledger_entries 每行记一次钱包操作（operation_ref / wallet_ref /
--     lot_ref / operation / amount_units > 0 / previous_wallet_version /
--     resulting_wallet_version > previous_wallet_version / resulting_wallet_status /
--     occurred_at）；platform_coin_operation_receipts 每行记一次操作的收据
--     （operation_ref / previous_wallet_version / resulting_wallet_version /
--     resulting_wallet_status）。钱包 version 随操作递增，与账本版本链对应。
-- (4) lot 不变量（coin-wallet-migrations.mjs:60，表级 CHECK）：
--     pending_units + available_units + held_units + consumed_units + reversed_units
--     + expired_units = issued_units。
-- (5) held 完整性（coin-wallet-store.mjs 约 2776 行 integrity 查询的原型）：每 lot 的
--     held_units 必须等于其全部活跃占用分配之和（holds status='active' 的
--     platform_coin_hold_allocations，加上 deferred reservations 在
--     reserved/processing/reconciliation_required 状态下的分配）；跨钱包占用必须为 0。
-- 结论：由于不存在存储余额可供比对，S-11 不做“存储值 vs 重算值”的比较，而是验证投影的
-- 输入满足全部五项不变量；任一钱包在任一项上违反即记为“不一致钱包”。输出仅为：钱包总数、
-- 一致钱包数、不一致钱包数、各子项违反计数。**本次申请不输出不一致钱包的指纹清单；需要
-- 定位具体钱包时，另外提交最小范围的补充只读申请。**（R2-P2-1 B 方案，推荐方案，待 Yi 确认。）
-- 本次申请不设执行 wrapper（不计算、不输出任何钱包 / lot 指纹）。
-- 不输出 account_id、钱包余额明细、任何行级原文。
-- S-11a 基数与执行时刻（1 次）：
WITH params AS (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS ref_ts)
SELECT (SELECT ref_ts FROM params) AS ref_ts,
       (SELECT COUNT(*) FROM platform_coin_wallets) AS wallet_count,
       (SELECT COUNT(*) FROM platform_coin_lots) AS lot_count,
       (SELECT COUNT(*) FROM platform_coin_ledger_entries) AS ledger_entry_count,
       (SELECT COUNT(*) FROM platform_coin_operation_receipts) AS receipt_count,
       (SELECT COUNT(*) FROM platform_coin_holds WHERE status = 'active') AS active_hold_count;
-- S-11b lot 不变量违反计数（1 次；违反的 lot 只记违反计数）：
SELECT COUNT(*) AS lot_invariant_violations
  FROM platform_coin_lots
 WHERE (pending_units + available_units + held_units + consumed_units
        + reversed_units + expired_units) <> issued_units;
-- S-11c held 完整性与跨钱包占用（2 次）：
SELECT COUNT(*) AS held_mismatch_lots
  FROM platform_coin_lots l
 WHERE l.held_units <> COALESCE((
         SELECT SUM(a.allocated_units)
           FROM platform_coin_hold_allocations a
           JOIN platform_coin_holds h ON h.hold_ref = a.hold_ref
          WHERE a.lot_ref = l.lot_ref AND h.status = 'active'), 0)
     + COALESCE((
         SELECT SUM(a.amount_units)
           FROM platform_deferred_resource_transition_reservation_allocations a
           JOIN platform_deferred_resource_transition_reservations r
             ON r.reservation_ref = a.reservation_ref
          WHERE a.lot_ref = l.lot_ref
            AND r.state IN ('reserved', 'processing', 'reconciliation_required')), 0);
SELECT COUNT(*) AS cross_wallet_allocations
  FROM platform_coin_hold_allocations a
  JOIN platform_coin_holds h ON h.hold_ref = a.hold_ref
  JOIN platform_coin_lots l ON l.lot_ref = a.lot_ref
 WHERE h.wallet_ref <> l.wallet_ref;
-- S-11d 账本版本链（2 次；previous 必须等于同一钱包上一条的 resulting，按
-- occurred_at, entry_ref 排序；钱包 version 必须等于其账本最大 resulting 版本，
-- 无账本行的钱包 version 须为 0）：
WITH ordered AS (
  SELECT wallet_ref, previous_wallet_version, resulting_wallet_version,
         LAG(resulting_wallet_version) OVER (
           PARTITION BY wallet_ref ORDER BY occurred_at, entry_ref) AS prev_resulting
    FROM platform_coin_ledger_entries
)
SELECT COUNT(*) AS version_chain_breaks
  FROM ordered WHERE prev_resulting IS NOT NULL AND previous_wallet_version <> prev_resulting;
SELECT COUNT(*) AS wallet_version_mismatch
  FROM platform_coin_wallets w
 WHERE w.version <> COALESCE((
         SELECT MAX(resulting_wallet_version)
           FROM platform_coin_ledger_entries e WHERE e.wallet_ref = w.wallet_ref), 0);
-- 说明：S-11d 的 version 比对以“每次版本递增都写一条账本行”为前提；若执行中发现某钱包
-- version 与账本最大 resulting 版本不一致，先记为异常并人工按源码复核版本递增路径，
-- 不直接认定为账本错误。
-- S-11e 收据与账本对账（2 次；收据的 previous/resulting 版本可为 NULL——收据表该两列
-- 为 nullable（源码 coin-wallet-migrations.mjs:119-127：previous/resulting 允许 NULL），
-- 故不得用等值 JOIN 比对（NULL = NULL 为 NULL，会把未定版收据误判为失配）；改用 NULL 安全
-- 的 IS 比较 + NOT EXISTS。未定版收据单独计数，不记为失配）：
SELECT COUNT(*) AS receipt_version_mismatch
  FROM platform_coin_operation_receipts r
 WHERE r.previous_wallet_version IS NOT NULL
   AND r.resulting_wallet_version IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM platform_coin_ledger_entries e
      WHERE e.operation_ref = r.operation_ref
        AND e.previous_wallet_version IS r.previous_wallet_version
        AND e.resulting_wallet_version IS r.resulting_wallet_version);
SELECT (SELECT COUNT(*) FROM platform_coin_operation_receipts r
         WHERE NOT EXISTS (
           SELECT 1 FROM platform_coin_ledger_entries e
            WHERE e.operation_ref = r.operation_ref)) AS orphan_receipts,
       (SELECT COUNT(*) FROM platform_coin_operation_receipts
         WHERE previous_wallet_version IS NULL
            OR resulting_wallet_version IS NULL) AS unversioned_receipts;
-- S-11f 投影汇总（1 次；全局聚合，不输出分钱包余额）：
WITH params AS (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS ref_ts)
SELECT coin_type,
       COUNT(*) AS lot_count,
       COALESCE(SUM(CASE WHEN coin_type = 'bonus_coins' AND expires_at IS NOT NULL
                          AND expires_at <= (SELECT ref_ts FROM params)
                         THEN 0 ELSE available_units END), 0) AS total_available_units,
       COALESCE(SUM(pending_units), 0) AS total_pending_units,
       COALESCE(SUM(held_units), 0) AS total_held_units
  FROM platform_coin_lots GROUP BY coin_type ORDER BY coin_type;
-- 异常识别规则汇总（任一命中即该钱包“不一致”）：S-11b lot 不变量违反；S-11c held 不等
-- 或跨钱包占用 > 0；S-11d 版本链断裂或钱包 version 失配；S-11e 收据版本失配或孤儿收据。
-- 不一致钱包的定位：**本次申请不定位**。任一子项违反计数非 0 时，NP-17 继续 NOT PROVEN；
-- 定位须另外提交最小范围的补充只读申请（查询范围、指纹计算方式与上限在补充申请中写清并
-- 单独批准）。**禁止执行未列入批准申请的查询。**
-- S-12 状态分布（仅枚举列，如 status / purpose；输出枚举值计数）
SELECT {状态列}, COUNT(*) FROM {表} GROUP BY {状态列};
-- S-13 凭据类表与外置字段（禁区字段仅计数，见 §3.3）
SELECT COUNT(*) FROM platform_portal_password_credentials;
SELECT COUNT(*) FROM platform_portal_passkey_credentials;
SELECT COUNT(*) FROM {表} WHERE {外置列} IS NOT NULL;  -- 7 个 EXTERNALIZE 字段逐项
-- S-14 触发器清单（NP-09；与仓库 91 个触发器比对）
SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ORDER BY name;
-- S-15 迁移链（NP-12；生产是否与 Master 迁移链一致；v2.3：改明确列名）
SELECT migration_id, ddl_checksum, applied_at FROM platform_schema_migrations
 ORDER BY migration_id;
-- 仅返回迁移元数据（迁移标识、DDL 校验和、应用时间），不读其他业务表或凭据字段，
-- 不含密钥。v2.2 的 SELECT * / ORDER BY version 是错误的：该表实际只有 3 列
-- （migration_id TEXT PRIMARY KEY、ddl_checksum TEXT NOT NULL、
-- applied_at TEXT NOT NULL），无 version 列；v2.2 的 S-15 在 Master 建成的
-- 本地合成库上执行失败（no such column: version），v2.3 的 S-15 执行通过
-- （见 §0）。核对依据：canonical V2.2 处置 JSON 的 3 个字段行 +
-- Master 源码 server/services/platform/coin-wallet-migrations.mjs 的
-- CREATE TABLE platform_schema_migrations。
```

**未列出的查询一律不得执行。** 执行中如发现需要补充查询（如某表 CHECK 表达式须逐条否定），须先补申请、获批后执行，不得现场自拟查询读生产。

## 5. 预计查询量

**执行方案：按表合并（本版唯一执行方案）。** 按列逐项执行方案（约 1,565 次，独立审查 P3-5 估算）不再作为执行方案，不执行、不保留为备选。按表合并的含义：同一表的同类聚合（NOT NULL 各列、CHECK 各子句、TEXT 各列长度、各列空值）合并为每表 1 条多聚合查询；仍须逐项返回的检查（UNIQUE 34→32 列、FK 125 关系、索引 219 个）保持逐项执行。总数“1120 次”量级只适用于按表合并模式，v1 分项行“逐列执行：858 列量级”与总数口径不一致的问题已修正。

| 类别 | 数量 | 依据（按表合并） |
|---|---|---|
| Schema 元数据（S-01～S-03、S-14、S-15） | 453 次 | S-01 1 次 + S-02 441 次（74×3 = 222 次 + index_xinfo i = 219 次）+ S-03 9 次 + S-14 1 次 + S-15 1 次 |
| 每表行数（S-04） | 74 次 | 每表 1 次 COUNT(*) |
| 时间跨度与增长（S-05） | 50 次 + k 次 | MIN/MAX/COUNT：仅 50 张有 created_at 列的表各 1 次；按月分组：仅行数 > 1,000 的表各 1 次，k 为该类表数（0 ≤ k ≤ 50，执行时按 S-04 结果确定） |
| 约束检查（S-06～S-08） | 68 + 125 + 141 = 334 次 | S-06：68 次 = 32 列值枚举 + 32 列重复组总数 + 4 条凭据列纯计数（2 列 ×（总数/去重值数、重复组数）各 1 条，见 §4；v2 的 864 次总数未计入该 4 条，本版纳入计数）；S-07：125 个 FK 关系逐项；S-08：NOT NULL 74 次（每表 1 条合并查询）+ CHECK 67 次（有 CHECK 子句的 67 张表各 1 条合并查询）= 141 次 |
| 长度与空值聚合（S-09、S-10） | 74 + 74 = 148 次 | 每表各 1 条多聚合查询（S-09：该表全部 TEXT 列的 MAX(LENGTH())；S-10：该表全部列的 NULL 计数） |
| 状态分布与余额重算（S-11、S-12） | 9 + 43 = 52 次 | S-11：9 条（S-11a 1、S-11b 1、S-11c 2、S-11d 2、S-11e 2、S-11f 1）；S-12：41 张 status 列表各 1 次 + 2 张 purpose 列表各 1 次 = 43 次 |
| 凭据与外置计数（S-13） | 9 次 | 凭据表 COUNT(*) 2 次 + 7 个 EXTERNALIZE 字段非空计数 7 次 |
| **合计** | **1120 次 + k 次** | 固定 1120 次（453 + 74 + 50 + 334 + 148 + 52 + 9）；k 为按月分组表数（0 ≤ k ≤ 50，见 S-05 行）。**1120 次量级。** 与 v2.2 的 900 次 + k 次相比增加 220 次，来源见下文重算注。以本表分项为准 |

**§5 重算注（v2.3 逐项重算，分项闭合；v2.2 的 900 次分项不再沿用）**：本表分项逐项相加：Schema 元数据 453（S-01 1 + S-02 441 + S-03 9 + S-14 1 + S-15 1；其中 S-02 441 = 74×3 = 222 + index_xinfo i = 219）+ 每表行数 74 + 时间跨度 50 + 约束检查 334（S-06 68 + S-07 125 + S-08 141）+ 长度与空值 148（74 + 74）+ 状态分布与余额重算 52（S-11 9 + S-12 43）+ 凭据与外置计数 9 = **1120 次**。即 453 + 74 = 527；527 + 50 = 577；577 + 334 = 911；911 + 148 = 1059；1059 + 52 = 1111；1111 + 9 = 1120。k 为按月分组表数（仅行数 > 1,000 的表各 1 次，0 ≤ k ≤ 50，执行时按 S-04 结果确定），不在 1120 次固定数内，执行后以实测 k 值结算。与 v2.2 的 900 次相比增加 220 次，全部来自 Schema 元数据：(+1) S-03 新增 `PRAGMA compile_options` 1 次（V23-1）；(+219) S-02 新增 `PRAGMA index_xinfo` i = 219 次（V23-2）。其余分项（74 / 50 / 334 / 148 / 52 / 9）与 v2.2 一致，未变。**i 的定义与口径（v2.3）**：i = 74 张表 `PRAGMA index_list` 返回行数之和，以 Master 11dd1cfb 源码建成的本地合成库实测为准，i = 219；对账：DDL 16b 的 CREATE INDEX 90 个 + 2 张 DEFER 表的显式索引 4 个 = 源码显式索引 94 个（与 V2.1 清单一致）；94 + sqlite_autoindex 125 个（PRIMARY KEY 自动索引 74 个 + UNIQUE 约束自动索引 51 个）= 219。执行时以生产库 `index_list` 实测行数为准：若生产库索引数与 219 不符，S-02 的 index_xinfo 执行次数按实测调整，并在 48 小时报告中如实记录实测 i 值与差异原因（漂移本身不是中止条件）；`index_info` 兼容补充不计入 i。**k 的定义不变**（0 ≤ k ≤ 50，按 S-04 结果确定）。**核验边界（v2.2，沿用）**：§5 分项数中 50（有 `created_at` 列的表）、41（有 `status` 列的表）、2（有 `purpose` 列的表）三数以附录 B 的 NOT NULL 列集重算一致；本申请未附可空列全集，DDL 16b 不在 D1 目标文件目录，无法排除某表存在可空 `created_at` / `status` / `purpose` 列致计数 +1 的可能；三数自 v2 未变，风险低，执行时以 S-04 / S-05 实测为准（k 机制已覆盖 S-05 的不确定性）。**执行计划对照（v2.3）**：执行计划 v2（`phase4-1-readonly-execution-plan-v2-2026-11-16.md`，128 行，SHA-256 `fe7cb181b60f35ae362e39655f6719553624c5e8dad078bd12de6e6102af2416`）原文未改写，其 P0/P1/P2/P3 数字须随本版修订，修订对照为：P0 由 8 次改为 **9 次**（S-03 增加 compile_options）；P1 由 225 次改为 **444 次**（S-01 1 + S-02 441 + S-14 1 + S-15 1）；P2 不变，124 次 + k 次；P3 不变，543 次；合计式由 8 + 225 + (124 + k) + 543 = 900 + k 改为 **9 + 444 + (124 + k) + 543 = 1120 + k**；Schema 453 = P0 9 + P1 444。执行计划 v2.3（如编制）须为独立新文件，不得改写计划 v2 原件；本申请获批执行前，执行者须按本对照核对执行计划。

**执行方式**：分批执行，每批执行后记录耗时与返回行数；**单条 SQL 查询超过 30 秒未返回即中止该查询并记录**，不得以更大超时反复重试（统一超时口径，见 §9；v2 §5 的“单表全表扫描超过 60 秒”表述予以废止——全表扫描本身就是一条 SQL 查询，30 秒单查询超时先触发，60 秒规则永无触发机会）。全部查询须在业务低峰窗口内执行（窗口由 Yi 指定，默认 UTC 夜间低峰）。

## 6. 采样数量

- **行级样本：0 行。** 本申请不采样任何行级原文数据。所有结论均以计数、聚合、枚举分布与 Schema 元数据得出。
- **坏行定位样本**：如约束检查发现坏行，仅记录坏行指纹（12 位 hex 指纹 / 64 位 hex PK 哈希）与所属表、批次 id，不记录原文；指纹样本上限 100 条/表，超出部分只记总数。**S-11 除外**：S-11 的九条 SQL 只返回聚合计数，本次申请不设执行 wrapper、不输出不一致钱包 / lot 的指纹清单；S-11 任一子项违反计数非 0 时只记总数，定位须另行提交最小范围补充申请（见 §4 S-11；R2-P2-1 B 方案，推荐方案，待 Yi 确认）。
- **时间分组采样**：按月分组计数不是行采样，是聚合输出，无行级数据。

## 7. 脱敏方式

1. 查询只返回聚合值（COUNT、MIN/MAX、LENGTH、枚举分布），不返回行级原文。

1a. 例外声明（R2-OBS-1）：规则 1“查询只返回聚合值，不返回行级原文”有一项已声明的例外——S-06 对附录 D 所列 32 个 UNIQUE 列执行重复值枚举模板 `SELECT {列}, COUNT(*) AS c FROM {表} GROUP BY {列} HAVING c > 1 LIMIT 10;` 时，返回重复值本身及其组内行数。例外理由：(a) 该 32 列均为非凭据列（见附录 D），返回值为不透明引用 / 哈希 / 业务编码 / 时间戳（`account_id`、`token_hash`、`sample_digest`、`approval_sha256` 等 ref/hash 类值，以及 `code`、`effective_at` 等），不是密码、密钥、令牌原文；(b) 判定某列是否存在重复唯一键、以及重复值是否影响 D1 UNIQUE 约束装载，需要看到重复值本身，仅凭计数无法逐项裁决；(c) 输出仍受 §6“行级样本 0 行”、本节规则 4“原文扫描”、规则 5 的约束，返回值不得扩散到报告正文以外的任何位置。

1b. 排除项不变：`platform_portal_passkey_credentials.credential_id` 与 `credential_id_hash` 两列仍只执行 §4 所列 4 条纯计数查询，不返回任何值、不返回哈希/指纹（§4 S-06、§3.3、规则 2 已有禁令，本次不改）。

1c. 新增聚合 COUNT 查询（NP-04 关闭所需）：S-06 对附录 D 32 列逐项增加一条重复组总数查询 `SELECT COUNT(*) AS duplicate_groups FROM (SELECT {列} FROM {表} GROUP BY {列} HAVING COUNT(*) > 1);`，只返回组数，不返回任何值。该查询与 `LIMIT 10` 的值枚举配合使用，三档判定（v2.3 写明确，`LIMIT 10` 保留，有界输出，避免一次倾倒全部重复值）：(a) 组总数为 0：可据此证明该列无重复组；(b) 组总数在 1～10 之间：核对值枚举的组数须等于组总数，不等即记为异常待裁决，不得直接关闭；(c) 组总数 > 10：不得把前 10 组当作全部异常，该列 NP-04 保持 NOT PROVEN，除非获得额外范围明确的授权并完成完整裁决；超出 10 组的部分以组总数为准，不再以“未枚举的组不存在”为前提。NP-04 关闭标准相应改为：34 列逐项按三档判定（组数为 0 证无重复，或重复项逐项列出（值枚举 + 组总数）并裁决；>10 组的列保持 NOT PROVEN）；2 个凭据列按修订后方式（仅计数）验证。
2. 禁区字段（§3.3）只计数，不读值；查询语句中不得出现禁区字段的 `SELECT {列}`（除 `COUNT(*) WHERE {列} IS NOT NULL`、`MAX(LENGTH({列}))`与 S-08 / S-10 的 `SUM(CASE WHEN {列} IS NULL THEN 1 ELSE 0 END)` 三种聚合形式外；第三种形式仅作 IS NULL 判定、不返回值，其适用范围为 S-08 与 S-10，不得用于其他查询）。S-06 对 `credential_id` / `credential_id_hash` 只允许 §4 所列的 4 条纯计数查询：`COUNT(*)`、`COUNT(DISTINCT …)` 与内层 GROUP BY 只返回组数的重复组数查询；不得以任何形式返回这两列的值、哈希或指纹。
3. 坏行定位只用指纹（12 位 hex 指纹 / 64 位 hex PK 哈希），原文不落盘。（S-11 除外：本次申请不输出不一致钱包 / lot 的指纹清单，见 §6。）
4. 输出文件在写入前须经“原文扫描”：检查是否含邮箱格式、URL、密钥样貌、长 JSON 原文；命中即删除并重新生成。
5. 报告中不得出现任何真实用户的邮箱、订阅链接、支付链接、凭据、令牌原文；不得出现可反推到具体用户的明细。

## 8. 数据保存位置

- **保存位置**：`~/workspace/goals/cloudflare-d1-migration-for-flylink-control-and-runtime-data/hidden_files/`（内部工作区，不向用户展示的目录）下的检查结果文件；汇总结论写入 `files/` 下的验证报告（仅含聚合数字与 Schema 比对结论）。
- **保存内容**：仅查询结果（计数、聚合、Schema 文本、指纹）。不保存任何行级原文数据。
- **保留期限**：检查结果保留 90 天，到期删除；汇总验证报告按项目档案长期保留（仅含聚合结论）。
- **访问控制**：结果文件仅限执行者与 Yi 访问；不得上传到任何第三方文件托管、不得贴到公开 Issue/PR、不得发到群聊。

## 9. 对生产性能的影响

| 影响面 | 评估 | 缓解 |
|---|---|---|
| CPU/IO | 全表扫描（COUNT、FK JOIN、LENGTH 聚合）会占用 BWH 磁盘 IO 与 CPU；生产行数未知，影响上限未知 | 业务低峰窗口执行；分批执行，每批间隔；单查询 30 秒超时即停 |
| 锁 | 只读查询在 SQLite 下不阻塞写操作（读不阻塞写，写不阻塞读，WAL 模式下；若生产为 rollback-journal 模式，读可能短暂阻塞写——**执行前须先以 S-03 确认 journal_mode**，若为非 WAL 模式，须缩短单批并避开写入高峰） | 先查 journal_mode 再定批次；避开充值/续费高峰时段 |
| 内存 | 聚合查询内存占用与单表行数相关；未知 | 单查询超时保护；大表查询拆分为按月分段 |
| 写入 | **零写入**。只读连接、只读 SQL；执行脚本须在连接层强制只读（如 `mode=ro`），并在执行前由第二人复核查询清单无写语句 | 连接层只读 + 查询清单复核 + 执行日志审计 |
| 业务中断 | 预期零中断；最坏情况为个别慢查询拖慢同期写入（仅在非 WAL 模式下） | 低峰窗口 + 超时即停 + 随时可中止（kill switch） |

**超时口径统一注记（R2-OBS-6）**：本申请统一阈值为**单条 SQL 查询超时 30 秒**（wall-clock，自查询发出起计），适用范围为 §4 全部查询（S-01～S-15），包括单表全表扫描（COUNT、FK JOIN、LENGTH 聚合、GROUP BY）与多表聚合（S-11c / S-11d / S-11e 等 JOIN / 窗口函数查询）。单表全表扫描没有独立的更宽松阈值。废止的两处 60 秒表述：(1) v2 §5“单表全表扫描超过 60 秒未返回即中止该查询并记录”（本版 §5 已改写）；(2) NP 台账 NP-13“单表扫描超 60 秒未返回即中止该查询并记录”（NP 台账 `~/workspace/phase4-remediation/np-ledger-2026-11-16.md`，319 行，SHA-256 `c34db241b6fff9a4a6f6b2b0bebfcd4fc7e732adcf552fa423fbce3644f99884`，冻结正文未动；改写以本申请为准，台账同步以附录 B 的注记为准）。v2 §9 风险表“单查询 30 秒超时即停”与 NP 台账 §0“单查询 30 秒超时即停”本身已一致，无须改动；本版注明 §5 / §9 / NP 台账 §0 三处为同一阈值。取 30 秒（而非 60 秒）为统一值：(a) 保守原则——两档中取较严者；(b) 与 D1 单查询 30 秒上限（NP-10 所引）一致，避免“生产侧允许 60 秒、目标侧只允许 30 秒”的口径分裂。超时动作与连续超时熔断不变：超时即中止该查询并记录（查询语句、已耗时、返回行数 0、超时标记），不得以更大超时反复重试；超时查询不计入“已执行”，须重新申请，不得自行补做；单查询超时连续 3 次，立即停止全部查询。如某类查询在低峰窗口内系统性超时，处理方式是拆分为按月分段（本节已有缓解措施），不是放宽阈值；放宽阈值须重新申请。执行手册（如编制）须与批准版申请取同一阈值，不得另立数值。

**中止条件**（任一命中即立即停止全部查询）：生产出现告警或错误率上升；单查询超时连续 3 次；执行窗口结束；Yi 随时叫停。停止后须记录已执行与未执行的查询清单，未执行部分须重新申请，不得自行补做。

## 10. 操作日志与审计方式

1. **执行前**：Yi 书面批准本申请（批准须具名、注明批准的查询范围与执行窗口）；执行者与复核者双人确认查询清单（§4）无写语句、无禁区字段。
2. **执行中**：逐条记录查询语句、执行时间、耗时、返回行数/聚合值、超时或错误；日志实时写入 `hidden_files/` 下的执行日志文件。
3. **执行后**：48 小时内提交验证报告（仅含聚合结论），附执行日志哈希；报告中逐项标注 NP-01～NP-22 的关闭情况（关闭 / 未关闭 / 发现漂移）。报告须含 §5 实际执行次数（含按月分组表数 k 的实测值）、超时记录（含超时查询清单与熔断触发情况），以及任何超出本申请范围的查询的如实披露（如有）。
4. **审计**：执行日志与查询清单保留 90 天，供 Yi 随时抽查；任何超出本申请范围的查询（多查一张表、多读一个字段）须在报告中如实披露并说明原因，不得隐瞒。
5. **权限**：本次申请为一次性授权，仅覆盖 §4 的查询清单与 §5 的执行窗口；授权过期（窗口结束）即失效，不得复用；后续任何生产读取须重新申请。

## 11. 版本说明（v2.3 相对 v2.2 的变更清单，D1～D6；v2.1 相对 v2 的变更清单 C1～C8 保留在下文）

本节逐项列出 v2.3 相对 v2.2 的全部变更（D1～D6），每项绑定来源与验证证据；v2.2 相对 v2.1 的修订见 §0 修订说明对照表，v2.1 相对 v2 的变更清单（C1～C8）保留在下文作历史记录，不在本节重复列出。除本节所列之外，其余内容按以下口径承接 v2.2：§4 其余查询模板（除 C1、C2、D1～D6 所列外，含 S-11 九条 SQL）、附录 A 74 表清单、附录 B 639 列 NOT NULL 字段集、附录 C 284 条 CHECK 否定式判定表、附录 D 32 列清单逐字承接 v2.2，未改动；附录 B 的 NP-01～NP-22 对应关系表为 v2.3 改写（见 D1～D6），不属于逐字承接。S-11 九条 SQL 零改动（v2.3 修订后从文档原文重新抽取，与 v2.2 逐字比对 9/9 一致，空库/合成库实跑 9/9 通过；只返回聚合计数，无钱包级指纹输出）。

| # | 变更 | 内容 | 来源与验证 |
|---|---|---|---|
| D1 | V23-1：S-03 补编译选项 | §4 S-03 增加 `PRAGMA compile_options`（只返回编译选项元数据），S-03 由 8 次改为 9 次；§3.2 Schema 元数据行、§5 分项表与重算注、执行计划对照同步更新；NP-01 关闭标准不变（原已写“版本与编译选项已记录”，本版补上对应的查询）。本地 SQLite 验证 compile_options 返回多行单列文本（见 §0）。 | 本文件 §0 V23-1；§4 S-03；§5 |
| D2 | V23-2：S-02 补索引列定义检查 | §4 S-02 对 index_list 返回的每个索引增加 `PRAGMA index_xinfo`（i = 219 次；`index_info` 仅作不支持 xinfo 时的兼容补充，不计入 i）；索引名须取自 index_list 实测结果，标识符加双引号并转义内嵌双引号；区分显式索引（origin 'c'）/ UNIQUE 自动索引（'u'）/ 主键自动索引（'pk'），记录键列顺序、排序方向、collation 与部分索引谓词；key = 0 的 rowid 辅助列不计入键列；NP-06 关闭标准同步改写。i 的对账：90（DDL 16b）+ 4（DEFER 表显式索引）= 94（源码显式索引）+ 125（自动索引）= 219。查询量 900 + k → 1120 + k 的主要增量（+219）；执行计划对照见 §5 重算注（P1 225→444 次）。 | 本文件 §0 V23-2；§4 S-02；§5；附录 B NP-06 |
| D3 | V23-3：S-10 与 §3.3 白名单冲突修补 | §4 S-10 改为每表 1 条多聚合查询模板（与 §5 一致），禁读字段只用 `SUM(CASE WHEN {列} IS NULL THEN 1 ELSE 0 END)` 形式；§3.3 与 §7 规则 2 明确把该形式的适用范围扩展到 S-10（原仅限 S-08）；普通字段空值计数与 v2.2 逐列形式返回值逐列相等（本地合成验证 858 列一致）；S-09 模板同步改写为合并形式（语义与计数不变）；NP-03 覆盖说明同步更新。查询量不变（S-10 仍为 74 次）。 | 本文件 §0 V23-3；§3.3；§4 S-09/S-10；§7 规则 2；附录 B NP-03 |
| D4 | V23-4：S-06 LIMIT 10 关闭能力写明确 | LIMIT 10 保留（有界输出）；三档判定写明确：组总数为 0 证无重复；1～10 组时枚举组数须等于组总数，否则记异常待裁决；>10 组时不得把前 10 组当全部异常，该列 NP-04 保持 NOT PROVEN，除非获得额外范围明确的授权并完成完整裁决。§4 S-06 注释、§7 规则 1c、附录 B NP-04 关闭标准同步改写。凭据 2 列仍只计数；32 列例外声明与输出边界不变。 | 本文件 §0 V23-4；§4 S-06；§7 规则 1c；附录 B NP-04 |
| D5 | V23-5：S-15 改明确列名 | §4 S-15 由 `SELECT * ... ORDER BY version` 改为 `SELECT migration_id, ddl_checksum, applied_at FROM platform_schema_migrations ORDER BY migration_id`；v2.2 的 `version` 列不存在（canonical 3 列 + Master 源码 CREATE TABLE 核实），v2.2 的 S-15 在本地合成库上执行失败，v2.3 执行通过；SQL 注释与查询目的同步修正，仅返回迁移元数据。查询量不变（仍为 1 次）。 | 本文件 §0 V23-5；§4 S-15 |
| D6 | V22-P3-1：§11 引言措辞收窄 | §11 引言“§4 全部查询模板”改为“§4 其余查询模板（除 C1、C2、D1～D6 所列外）”，与附录 B 的单列例外口径一致。文字精度修订，不改变任何查询、计数或关闭标准。 | v2.2 独立审查报告 `phase4-1-readonly-v2.2-independent-review-2026-11-16.md`（153 行，SHA-256 `075bb5356d399f583563291512571b634db9715df9e9aca4159469dbe78271ae`）V22-P3-1 |

**v2.1 相对 v2 的变更清单（C1～C8，历史记录，原文保留）**：

| # | 变更 | 内容 | 来源文件与 SHA |
|---|---|---|---|
| C1 | R2-P2-1：S-11 输出承诺降级（B 方案） | §4 S-11 输出清单删除“不一致钱包的指纹（上限 100 个/子项）”与 wrapper 指纹段落，改为“输出仅为钱包总数、一致钱包数、不一致钱包数、各子项违反计数；本次申请不输出不一致钱包的指纹清单；需要定位具体钱包时，另外提交最小范围的补充只读申请”；定位段落改为“本次申请不定位”，非 0 时 NP-17 继续 NOT PROVEN；§6 与 §7 规则 3 增加 S-11 除外注记；附录 B NP-17 关闭标准同步改为“七项违反计数全零（S-11b 1 项、S-11c 2 项、S-11d 2 项、S-11e 2 项；S-11a 基数、S-11f 汇总与未定版收据数不参与全零判定）方可进入关闭评估，非零异常时继续 NOT PROVEN，等待补充授权”；§4 S-11 标题与 S-11b 注释的指纹表述同步清除（见 §0 V21-P2-1）。**B 方案为推荐方案，待 Yi 确认，不构成业务决定。** | `phase4-1-r2-p2-1-decision-2026-11-16.md`（136 行，SHA-256 `89b16c53789638d8369e295e4bdb682a57eb0c0739bc0c91bd1a94faa60e021f`）§3 推荐、§5 落地草案 |
| C2 | R2-OBS-1：S-06 例外声明与组总数查询 | §7 新增规则 1a 例外声明（重复值返回属于例外；返回值为不透明 ref/hash；不返回凭据原文）、1b 排除项不变、1c 新增组总数 COUNT 查询；§4 S-06 增加 32 条重复组总数查询模板；§3.3 S-06 修补段增加组总数查询说明；§5 S-06 由 32 次改为 68 次（32 值枚举 + 32 组总数 + 4 凭据列计数）；附录 B NP-04 关闭标准同步改为“重复组数为 0，或重复项逐项列出（值枚举 + 组总数）并裁决”。`LIMIT 10` 保留。 | `phase4-1-obs-closure-evidence-2026-11-16.md`（305 行，SHA-256 `cd4ac1c290de92683a7a2b156c80adf9f4a7a92ac28ce65601a1b2cf2268d746`）§1 |
| C3 | R2-OBS-6：超时口径统一为单条 SQL 30 秒 | §5 执行方式“单表全表扫描超过 60 秒”改为“单条 SQL 查询超过 30 秒”；§9 新增超时口径统一注记（适用范围覆盖全部 S-01～S-15 含全表扫描；废止两处 60 秒表述；30 秒取保守值并与 D1 单查询上限一致；超时动作与连续 3 次熔断不变；系统性超时拆分为按月分段，不放宽阈值）。 | `phase4-1-obs-closure-evidence-2026-11-16.md`（305 行，SHA-256 `cd4ac1c290de92683a7a2b156c80adf9f4a7a92ac28ce65601a1b2cf2268d746`）§6 |
| C4 | NP-17 口径澄清 | 附录 B 新增 NP-17 口径澄清注记：NP 台账 NP-17 节“与存储余额逐账户比对”与 v2 §4 存在差异，以 v2 §4 为准（`platform_coin_wallets` 无余额列，S-11 验证五项不变量，不做“存储值 vs 重算值”的比较）；NP-04 口径同步注记一并列入。台账冻结正文不动。 | NP 台账 `~/workspace/phase4-remediation/np-ledger-2026-11-16.md`（319 行，SHA-256 `c34db241b6fff9a4a6f6b2b0bebfcd4fc7e732adcf552fa423fbce3644f99884`）NP-17 / NP-04 节；v2 §4 S-11 说明 |
| C5 | §5 查询量逐项重算 | 固定 864 次 + k 次 → **900 次 + k 次**（分项闭合见 §5 重算注：233 + 74 + 50 + 334 + 148 + 52 + 9 = 900；增加 36 次 = S-06 新增 32 条组总数查询 + v2 未计入总数的 4 条凭据列纯计数查询现纳入计数）。k 定义不变（0 ≤ k ≤ 50，按 S-04 结果确定）。 | 本文件 §5 重算注；`phase4-1-obs-closure-evidence-2026-11-16.md` §1 第 4 条（推算 900 次 + k 次，本版以 §5 分项表逐项重算为准） |

| C6 | 附录 B NP 对应关系全文改写（v2.1 相对 v2） | 附录 B NP-01～NP-22 对应关系全文改写为三档表格（可关闭 / 可推进 / 不覆盖）并补 22 项逐项关闭标准；NP-20 由 v2 的“不覆盖”改为“可推进”（v2 L367、L369；v2.1 附录 B 表格），关闭仍须另行申请测算与演练授权，实质未变。 | 本文件附录 B；`phase4-1-readonly-v2.1-independent-review-2026-11-16.md`（150 行，SHA-256 `809df1db5db6760de08f4e3401ed8f6109b61a12b5df578a2c6b0d946ddf877c`）V21-P2-3 |
| C7 | §10 执行后报告要求新增（v2.1 相对 v2） | §10 报告要求新增三项内容：报告须含 §5 实际执行次数、k 实测值、超时记录、超范围披露（v2.1 L372）。 | 本文件 §10；同上 V21-P2-3 |
| C8 | §3.3 禁读清单汇总新增（v2.1 相对 v2） | §3.3 新增“禁读清单汇总（v2.1）”段落（v2.1 L57），注明以 §3.3 明细为准、本表仅为汇总、范围不扩大也不缩小。 | 本文件 §3.3；同上 V21-P2-3 |

**未变事项**：S-11 九条 SQL、S-01～S-15 其余全部查询模板、74 表范围、639 列 NOT NULL 范围、284 条 CHECK 验证、32 列 UNIQUE 清单、禁读清单范围、双人复核均与 v2.2 一致；48 小时报告要求在 v2 基础上新增三项内容（见 C7）。v2 原文未改写；v2.1 原文未改写；v2.2 原文未改写。

**申请状态**：PENDING。下一步：独立审查复核本版 → Yi 书面批准查询范围与执行窗口（批准须具名、注明批准的查询范围与执行窗口）。未获批准前，不得连接 BWH 生产数据库，不得执行本申请中的任何查询。本申请不改变 NO-GO（生产迁移执行）裁决；NP-01～NP-22 全部仍为 NOT PROVEN。

## 附录 A · 74 张表清单（与 V2.2 处置一致）

**核心层（core）**：platform_leads、platform_accounts、platform_entitlements、platform_issuance_requests、platform_issued_subscription_links、platform_data_pack_resources、platform_data_pack_artifact_rotations、platform_data_pack_edge_credentials、platform_data_pack_credential_resets、platform_quota_counters、platform_usage_samples、platform_usage_rollups、platform_usage_counter_cursors、platform_device_bindings、platform_revocation_events、platform_audit_events、platform_edge_registered_nodes、platform_edge_apply_receipts、platform_edge_desired_state_notifications、platform_edge_agent_leases、platform_portal_access_requests、platform_portal_edge_credentials、platform_portal_entries、platform_portal_totp_credentials、platform_portal_password_credentials、platform_portal_passkey_credentials、platform_portal_second_factor_challenges、platform_portal_sessions、platform_schema_migrations、platform_coin_wallets、platform_coin_lots、platform_coin_holds、platform_coin_hold_allocations、platform_coin_operation_receipts、platform_coin_credit_origins、platform_coin_ledger_entries、platform_coin_commerce_offer_versions、platform_coin_commerce_quotes、platform_coin_commerce_orders、platform_coin_commerce_operation_receipts、platform_coin_commerce_order_events、platform_coin_commerce_fulfillment_commands、platform_coin_commerce_fulfillment_receipts、platform_coin_commerce_initial_confirmations、platform_account_resource_authorities、platform_commerce_authority_quote_bindings、platform_coin_commerce_plan_switch_quotes、platform_scheduled_plan_switches、platform_identity_bindings、platform_identity_deletion_jobs、platform_identity_deletion_proofs、platform_identity_deletion_tombstones。

**伴生层（companion）**：platform_payment_orders、platform_payment_receipts、platform_payment_orders_legacy_archive_20260803、platform_referral_policies、platform_referral_profiles、platform_referral_touches、platform_referral_bindings、platform_referral_origins、platform_referral_accruals、platform_referral_events、platform_deferred_resource_transition_reservations、platform_deferred_resource_transition_reservation_allocations、platform_deferred_resource_transitions、platform_deferred_resource_transition_operation_receipts、platform_deferred_resource_transition_events、platform_deferred_resource_transition_rebases、platform_wallet_first_deferred_checkout_quotes、platform_wallet_first_resource_effect_runtime_claims、platform_wallet_first_setup_delivery_handoffs、platform_portal_registration_welcome_coin_grants、platform_ads_consent_decisions、platform_ads_click_consent_claims。

## 附录 B · NP-01～NP-22 逐项对应关系（v2.1）

处置三档：**可关闭**——本申请执行并提交验证报告后可据结果关闭（关闭本身由验证报告与独立复核决定，不由本申请预先宣布）；**可推进**——本申请产出其关闭所需的输入数据，关闭本身须另行申请；**不覆盖**——本申请不产出其关闭所需的证据，须另行申请。

| NP | 内容 | 对应查询 | 本申请处置 | 关闭 / 推进标准 |
|---|---|---|---|---|
| NP-01 | SQLite 版本与编译选项 | S-03 | 可关闭 | 版本（`sqlite_version()`）与编译选项（`PRAGMA compile_options`，v2.3 新增查询）已记录，与仓库比对一致 |
| NP-02 | 仓库外类型 | S-01 / S-02 | 可关闭 | 生产 Schema 与仓库逐字段比对，无仓库外类型 |
| NP-03 | NULL 分布 | S-10 | 可关闭 | 每列空值计数已产出（每表 1 条多聚合查询；禁读字段只用 `SUM(CASE WHEN {列} IS NULL THEN 1 ELSE 0 END)` 形式，见 §4 S-10 与 §7 规则 2；普通字段空值计数与 v2.2 逐列形式返回值一致） |
| NP-04 | 重复唯一键 | S-06 | 可关闭 | 34 列逐项按三档判定：组总数为 0 证无重复；组总数 1～10 时值枚举组数须等于组总数，否则记异常待裁决；组总数 > 10 的列保持 NOT PROVEN，除非获得额外范围明确的授权并完成完整裁决（LIMIT 10 保留）；重复项逐项列出（值枚举 + 组总数）并裁决（是否影响 D1 UNIQUE 约束装载）；2 个凭据列按修订后方式（仅计数）验证（R2-OBS-1；见 §7 例外声明）。注（V23-OBS-1）：17 个复合 UNIQUE 约束与 12 个 UNIQUE 部分索引的约束执行不在本申请 S-06 的 34 列单列检查范围内；S-02 只验证其索引定义，不判定其约束是否被违反；复合/部分 UNIQUE 的违反判定须另行申请补充查询 |
| NP-05 | 孤儿行 | S-07 | 可关闭 | 125 项孤儿计数全部为 0，或非 0 项逐项列出并裁决；“关 FK 写入历史”记为“无直接证据，以孤儿计数 + S-15 为间接证据”，不得写成已证无 |
| NP-06 | 实际索引 | S-02 | 可关闭 | 生产索引全量（`index_list` 219 行：显式索引 94 个 + 自动索引 125 个）逐索引以 `index_xinfo` 比对键列定义一致：索引名、所属表、来源（显式 'c' / UNIQUE 自动索引 'u' / 主键自动索引 'pk'）、键列顺序、排序方向、collation、部分索引谓词；key = 0 的 rowid 辅助列不计入键列。DDL 16b 的 90 个索引为显式索引的子集（另 4 个为 2 张 DEFER 表的显式索引）；自动索引 125 个 = 主键自动索引 74 个 + UNIQUE 约束自动索引 51 个（含 17 个复合多列约束） |
| NP-07 | CHECK 违反 | S-08 | 可关闭 | 284 条 CHECK 否定式判定 + 639 列 NOT NULL 违反计数已产出；违反为 0 或逐项列出并裁决 |
| NP-08 | 写入并发与长事务 | — | **不覆盖** | 须另行申请性能观测；本申请不产出并发证据 |
| NP-09 | 仓库外触发器 | S-14 | 可关闭 | 生产触发器清单与仓库 91 个触发器比对一致 |
| NP-10 | D1 上限 | S-09 + S-04 | 可关闭 | 单行最大长度与每表行数已产出，对照 D1 上限判定（含 30 秒单查询上限口径） |
| NP-11 | 调用热点与慢查询 | — | **不覆盖** | 须另行申请应用层日志分析；本申请不读应用日志 |
| NP-12 | 逐字段一致性 | S-01 / S-02 / S-15 | 可关闭 | 74 表逐字段与迁移链比对一致 |
| NP-13 | 每表行数 | S-04 | 可关闭 | 74 表行数已产出 |
| NP-14 | 库大小 | S-03 | 可关闭 | page_count / page_size 已产出，库大小已算出 |
| NP-15 | 增长速度 | S-05 | 可关闭 | MIN/MAX 时间跨度与按月分组计数已产出 |
| NP-16 | 历史规模 | S-05 | 可关闭 | 同 NP-15 |
| NP-17 | 账本一致性 | S-11 | 可关闭 | **B 方案标准（推荐方案，待 Yi 确认）**：七项违反计数全零（S-11b `lot_invariant_violations` 1 项、S-11c `held_mismatch_lots` 与 `cross_wallet_allocations` 2 项、S-11d `version_chain_breaks` 与 `wallet_version_mismatch` 2 项、S-11e `receipt_version_mismatch` 与 `orphan_receipts` 2 项）方可进入关闭评估；S-11a 基数列、S-11f 分 coin_type 汇总与 S-11e(2) 的 `unversioned_receipts`（未定版收据单独计数，不记为失配）不参与全零判定；任一子项违反计数非 0 时继续 NOT PROVEN，定位须另外提交最小范围的补充只读申请。**不做“存储余额 vs 重算值”的比较**（见下文口径澄清） |
| NP-18 | 删除与 tombstone | S-04 / S-12 | 可关闭 | 三表行数 + 状态分布已记录；tombstone 策略仍为 `'pending-c5-decision'` 的现状须在报告中写明，不得写成已定 |
| NP-19 | 外置规模 | S-13 | 可关闭 | 7 项非空计数 + 凭据表规模已记录；作为 M1-04 托管容量设计的输入（托管目的地未定前，数字只记规模，不推导托管方案） |
| NP-20 | 切换窗口 | —（输入：NP-13 / 14 / 15） | **可推进** | 本申请产出窗口测算的输入数据（行数、大小、增速）；窗口时长区间与测算本身须另行申请测算与演练授权 |
| NP-21 | 回退 RPO/RTO | — | **不覆盖** | 须另行申请演练授权（反向同步设计 + 回退演练实测）；本申请不覆盖 |
| NP-22 | D1 实际排队延迟与成本 | — | **不覆盖** | 须另行申请生产规模压测；本申请不覆盖 |

**汇总：可关闭 17 项（NP-01～07、09、10、12～19）；可推进 1 项（NP-20）；不覆盖 4 项（NP-08、NP-11、NP-21、NP-22）。**

**v2.1 修订注**：NP-07 与 NP-17 在 v1 中的“附条件”（S-08 否定式 CHECK 待补、S-11 SQL 待补）已由 v2 补齐（S-08 见附录 B/C，S-11 见 §4）；两项的关闭仍须待本申请获批、执行并提交验证报告后才能记为已关闭，补 SQL 本身不关闭任何 NP 项。NP-17 另有 R2-P2-1 残留，本版按 B 方案处理（推荐方案，待 Yi 确认）。

**NP-17 口径澄清（v2.1）**：NP 台账 NP-17 节“所需证据”行写“与 `platform_coin_wallets` 存储余额逐账户比对”，与 v2 §4 存在差异。**以 v2 §4 为准**：`platform_coin_wallets` 无余额列（6 列：wallet_ref / account_id / status / version / created_at / updated_at），“钱包余额”不是一张存储值，而是投影（`coin-wallet-domain.mjs:223 projectCoinWalletBalance()` 按 coin_type 汇总 lots）；S-11 不做“存储值 vs 重算值”的比较，而是验证投影的输入满足全部五项不变量（S-11b lot 不变量、S-11c held 完整性与跨钱包占用、S-11d 账本版本链、S-11e 收据与账本对账、S-11f 投影汇总）。NP 台账该行表述以本注记为准修正，台账冻结正文不动（NP 台账 `~/workspace/phase4-remediation/np-ledger-2026-11-16.md`，319 行，SHA-256 `c34db241b6fff9a4a6f6b2b0bebfcd4fc7e732adcf552fa423fbce3644f99884`）。

**NP-04 口径同步（v2.1）**：NP 台账 NP-04“所需证据”行“仅计数与指纹，不返回重复值原文”与 v2 冻结文本不一致（v2 允许 32 列返回重复值，见 §7 例外声明）。以 v2.1 §7 例外声明为准：32 列值枚举为例外、凭据列仅计数、组总数查询已补。台账冻结正文不动。

**NP-13 超时同步（v2.2）**：NP 台账 NP-13 节 L150 的 60 秒表述（“单表扫描超 60 秒未返回即中止该查询并记录”）冻结正文不动；改写以本申请为准，台账同步以本注记为准——本申请统一阈值为单条 SQL 查询超时 30 秒（见 §9 注记）。

---
*本申请 v2.3 状态：PENDING / NOT APPROVED / NO PRODUCTION AUTHORITY。未获 Yi 批准前，不得连接 BWH 生产数据库，不得执行本申请中的任何查询。基线 Master `11dd1cfb208b78a85ce77b8c8aef2b6763f9000a`。*

## 附录 B · S-08 NOT NULL 字段集（639 列，按表列出）

来源：V2.2 canonical（SHA `54dca795…`）中 `nullable=false` 的全部列；共 74 张表、639 列。
其中 61 列带非空默认值（全部落在 NOT NULL 集内），578 列无默认值；nullable 列中 0 列带默认值。
执行：每表 1 条合并查询（见 §4 S-08 模板），每列 1 个 `CASE WHEN {列} IS NULL` 计数。

| 表 | NOT NULL 列数 | 列 |
|---|---|---|
| `platform_account_resource_authorities` | 10 | `account_id`, `resource_request_id`, `entitlement_id`, `issued_link_id`, `status`, `version`, `created_at`, `updated_at`, `created_by`, `reason` |
| `platform_accounts` | 5 | `owner_ref`, `status`, `created_at`, `updated_at`, `metadata_json` |
| `platform_ads_click_consent_claims` | 2 | `account_ref`, `created_at` |
| `platform_ads_consent_decisions` | 4 | `decision`, `ad_user_data`, `ad_personalization`, `updated_at` |
| `platform_audit_events` | 6 | `entity_type`, `entity_ref`, `action`, `actor_ref`, `created_at`, `metadata_json` |
| `platform_coin_commerce_fulfillment_commands` | 8 | `order_ref`, `account_id`, `payload_json`, `status`, `attempt_count`, `lease_generation`, `created_at`, `updated_at` |
| `platform_coin_commerce_fulfillment_receipts` | 4 | `command_ref`, `effect_ref`, `status`, `recorded_at` |
| `platform_coin_commerce_initial_confirmations` | 17 | `confirmation_ref`, `command_ref`, `order_ref`, `account_id`, `effect_ref`, `approval_sha256`, `inventory_sha256`, `effect_sha256`, `receipt_ref`, `operator_ref`, `resource_request_ref`, `entitlement_ref`, `issued_link_ref`, `failed_updated_at`, `attempt_count`, `lease_generation`, `confirmed_at` |
| `platform_coin_commerce_offer_versions` | 17 | `offer_ref`, `version`, `status`, `category`, `title_zh`, `title_en`, `summary_zh`, `summary_en`, `important_notices_zh_json`, `important_notices_en_json`, `base_coin_units`, `reference_currency`, `reference_amount_minor`, `accepted_coin_types_json`, `delivery_kind`, `never_expires`, `created_at` |
| `platform_coin_commerce_operation_receipts` | 7 | `account_id`, `actor_scope`, `operation_type`, `idempotency_key`, `request_digest`, `status`, `created_at` |
| `platform_coin_commerce_order_events` | 5 | `order_ref`, `event_type`, `actor_type`, `actor_ref`, `occurred_at` |
| `platform_coin_commerce_orders` | 11 | `account_id`, `quote_ref`, `offer_version_ref`, `hold_ref`, `amount_units`, `offer_snapshot_json`, `allocation_snapshot_json`, `payment_status`, `cancel_until`, `created_at`, `updated_at` |
| `platform_coin_commerce_plan_switch_quotes` | 12 | `account_id`, `entitlement_id`, `kind`, `from_offer_version_ref`, `to_offer_version_ref`, `snapshot_valid_from`, `snapshot_valid_until`, `list_price_units`, `credit_units`, `pending_credit_units`, `charge_units`, `created_at` |
| `platform_coin_commerce_quotes` | 13 | `account_id`, `offer_version_ref`, `wallet_version`, `amount_units`, `applied_discount_basis_points`, `purchase_availability`, `shortfall_units`, `allocation_json`, `before_balance_json`, `after_balance_json`, `status`, `created_at`, `expires_at` |
| `platform_coin_credit_origins` | 8 | `wallet_ref`, `coin_type`, `source_type`, `source_ref`, `source_digest`, `operation_ref`, `lot_ref`, `created_at` |
| `platform_coin_hold_allocations` | 5 | `hold_ref`, `lot_ref`, `allocation_sequence`, `allocated_units`, `created_at` |
| `platform_coin_holds` | 8 | `wallet_ref`, `purpose`, `purpose_ref`, `amount_units`, `status`, `expires_at`, `created_at`, `updated_at` |
| `platform_coin_ledger_entries` | 13 | `operation_ref`, `wallet_ref`, `lot_ref`, `operation`, `amount_units`, `source_type`, `source_ref`, `actor_type`, `actor_ref`, `previous_wallet_version`, `resulting_wallet_version`, `resulting_wallet_status`, `occurred_at` |
| `platform_coin_lots` | 14 | `wallet_ref`, `coin_type`, `credit_origin_ref`, `issued_units`, `pending_units`, `available_units`, `held_units`, `consumed_units`, `reversed_units`, `expired_units`, `source_type`, `source_ref`, `created_at`, `updated_at` |
| `platform_coin_operation_receipts` | 6 | `actor_scope`, `operation_type`, `idempotency_key`, `request_digest`, `status`, `created_at` |
| `platform_coin_wallets` | 5 | `account_id`, `status`, `version`, `created_at`, `updated_at` |
| `platform_commerce_authority_quote_bindings` | 7 | `authority_ref`, `account_id`, `authority_version`, `resource_request_id`, `entitlement_id`, `issued_link_id`, `created_at` |
| `platform_data_pack_artifact_rotations` | 8 | `order_ref`, `account_id`, `link_ref`, `old_artifact_ref`, `attempt`, `status`, `created_at`, `updated_at` |
| `platform_data_pack_credential_resets` | 10 | `order_ref`, `account_id`, `request_ref`, `entitlement_ref`, `edge_channel_ref`, `edge_credential_ref`, `old_edge_material_digest`, `status`, `created_at`, `updated_at` |
| `platform_data_pack_edge_credentials` | 8 | `request_ref`, `entitlement_ref`, `edge_channel_ref`, `edge_credential_ref`, `edge_material_digest`, `status`, `created_at`, `updated_at` |
| `platform_data_pack_resources` | 9 | `command_ref`, `account_id`, `request_ref`, `entitlement_ref`, `offer_version_ref`, `quota_bytes`, `commercial_never_expires`, `technical_valid_until`, `created_at` |
| `platform_deferred_resource_transition_events` | 5 | `transition_ref`, `event_type`, `actor_type`, `actor_ref`, `occurred_at` |
| `platform_deferred_resource_transition_operation_receipts` | 8 | `transition_ref`, `account_id`, `actor_scope`, `operation_type`, `idempotency_key`, `request_digest`, `status`, `created_at` |
| `platform_deferred_resource_transition_rebases` | 10 | `account_id`, `effect_ref`, `effect_entitlement_id`, `effect_request_id`, `effect_issued_link_id`, `effect_valid_until`, `state`, `lease_generation`, `created_at`, `updated_at` |
| `platform_deferred_resource_transition_reservation_allocations` | 6 | `reservation_ref`, `lot_ref`, `coin_type_snapshot`, `allocation_sequence`, `amount_units`, `created_at` |
| `platform_deferred_resource_transition_reservations` | 12 | `account_id`, `wallet_ref`, `source_type`, `source_ref`, `amount_units`, `activation_at`, `expires_at`, `rebase_generation`, `state`, `lease_generation`, `created_at`, `updated_at` |
| `platform_deferred_resource_transitions` | 17 | `account_id`, `order_ref`, `reservation_ref`, `offer_version_ref`, `commercial_model`, `flow_kind`, `plan_rank`, `amount_units`, `offer_snapshot_json`, `allocation_snapshot_json`, `reserved_at`, `scheduled_for`, `rebase_generation`, `state`, `lease_generation`, `created_at`, `updated_at` |
| `platform_device_bindings` | 6 | `account_id`, `artifact_ref`, `device_ref`, `status`, `first_seen_at`, `last_seen_at` |
| `platform_edge_agent_leases` | 7 | `agent_ref`, `node_ref`, `channel_ref`, `status`, `acquired_at`, `renewed_at`, `expires_at` |
| `platform_edge_apply_receipts` | 11 | `channel_ref`, `desired_state_ref`, `status`, `add_count`, `revoke_count`, `rotate_count`, `unchanged_count`, `config_test_ok`, `service_active`, `listener_udp443`, `created_at` |
| `platform_edge_desired_state_notifications` | 8 | `node_ref`, `channel_ref`, `desired_state_ref`, `generation`, `reason`, `status`, `created_at`, `updated_at` |
| `platform_edge_registered_nodes` | 12 | `provider_ref`, `region_ref`, `role_ref`, `channel_refs_json`, `image_manifest_ref`, `release_ref`, `lifecycle`, `status`, `first_boot_packet_ref`, `registered_at`, `updated_at`, `metadata_json` |
| `platform_entitlements` | 10 | `account_id`, `plan`, `status`, `valid_from`, `valid_until`, `max_artifacts`, `max_devices`, `traffic_limit_bytes`, `created_at`, `updated_at` |
| `platform_identity_bindings` | 6 | `account_id`, `issuer_ref`, `subject_ref`, `status`, `created_at_ms`, `updated_at_ms` |
| `platform_identity_deletion_jobs` | 12 | `request_id`, `account_id`, `authorization_basis`, `verification_mode`, `scope_json`, `status`, `current_step`, `steps_json`, `retry_count`, `actor_ref`, `created_at`, `updated_at` |
| `platform_identity_deletion_proofs` | 8 | `request_id`, `account_ref`, `verification_mode`, `scope_json`, `verification_json`, `deferred_scope_json`, `issued_at`, `created_at` |
| `platform_identity_deletion_tombstones` | 5 | `request_id`, `account_ref`, `retained_categories_json`, `retention_policy_ref`, `created_at` |
| `platform_issuance_requests` | 11 | `account_id`, `entitlement_id`, `approval_ref`, `status`, `quantity`, `node_id`, `purpose`, `requested_by_ref`, `created_at`, `updated_at`, `metadata_json` |
| `platform_issued_subscription_links` | 6 | `request_id`, `tenant_ref`, `artifact_ref`, `status`, `created_at`, `updated_at` |
| `platform_leads` | 10 | `status`, `organization`, `email`, `direction`, `stage`, `message`, `source`, `created_at`, `updated_at`, `expires_at` |
| `platform_payment_orders` | 17 | `account_id`, `offer_ref`, `create_idempotency_key`, `create_request_digest`, `quote_version`, `expected_paid_coin_units`, `amount_minor`, `currency`, `currency_exponent`, `quote_digest`, `adapter_key`, `payment_method`, `merchant_binding_ref`, `status`, `expires_at`, `created_at`, `updated_at` |
| `platform_payment_orders_legacy_archive_20260803` | 13 | `portal_user_ref`, `plan`, `plan_label`, `amount_minor`, `money`, `currency`, `duration_days`, `client_target`, `channel`, `status`, `provider`, `created_at`, `updated_at` |
| `platform_payment_receipts` | 12 | `payment_order_ref`, `attempt_ref`, `provider_request_ref`, `receipt_type`, `canonical_state`, `charge_certainty`, `verification_result`, `amount_minor`, `currency`, `currency_exponent`, `expected_paid_coin_units`, `accepted_at` |
| `platform_portal_access_requests` | 13 | `portal_user_ref`, `plan`, `client_target`, `duration_days`, `quantity`, `status`, `next_action`, `note_provided`, `prior_trial_state`, `submitted_at`, `updated_at`, `edge_lifecycle_mutation`, `event_json` |
| `platform_portal_edge_credentials` | 5 | `request_id`, `edge_channel_ref`, `edge_credential_ref`, `edge_material_digest`, `ordinal` |
| `platform_portal_entries` | 11 | `account_id`, `entitlement_id`, `token_hash`, `status`, `expires_at`, `max_uses`, `use_count`, `issued_by_ref`, `approval_ref`, `created_at`, `updated_at` |
| `platform_portal_passkey_credentials` | 9 | `account_id`, `credential_id`, `credential_id_hash`, `public_key_jwk_json`, `sign_count`, `transports_json`, `status`, `created_at`, `updated_at` |
| `platform_portal_password_credentials` | 7 | `account_id`, `password_hash`, `status`, `failure_count`, `must_rotate`, `created_at`, `updated_at` |
| `platform_portal_registration_welcome_coin_grants` | 15 | `account_id`, `coin_type`, `amount_units`, `source_type`, `source_ref`, `source_digest`, `actor_scope`, `idempotency_key`, `expires_at`, `status`, `next_attempt_at`, `attempt_count`, `lease_generation`, `created_at`, `updated_at` |
| `platform_portal_second_factor_challenges` | 8 | `account_id`, `challenge_hash`, `allowed_factors_json`, `status`, `failure_count`, `expires_at`, `created_at`, `updated_at` |
| `platform_portal_sessions` | 6 | `account_id`, `auth_method`, `status`, `issued_at`, `expires_at`, `updated_at` |
| `platform_portal_totp_credentials` | 6 | `account_id`, `encrypted_totp_secret`, `status`, `failure_count`, `enrolled_at`, `updated_at` |
| `platform_quota_counters` | 6 | `account_id`, `entitlement_id`, `metric`, `period`, `amount`, `updated_at` |
| `platform_referral_accruals` | 8 | `account_id`, `reward_units`, `confirmation_at`, `risk_approved`, `refunded_paid_units`, `reversed_units`, `status`, `updated_at` |
| `platform_referral_bindings` | 2 | `account_id`, `registered_at` |
| `platform_referral_events` | 5 | `event_ref`, `account_id`, `kind`, `digest`, `occurred_at` |
| `platform_referral_origins` | 6 | `account_id`, `lot_ref`, `payment_order_ref`, `paid_units`, `credited_at`, `created_at` |
| `platform_referral_policies` | 5 | `policy_ref`, `version`, `effective_at`, `policy_json`, `digest` |
| `platform_referral_profiles` | 4 | `account_id`, `code`, `status`, `created_at` |
| `platform_referral_touches` | 4 | `token_digest`, `referrer_id`, `observed_at`, `expires_at` |
| `platform_revocation_events` | 6 | `request_id`, `tenant_ref`, `artifact_ref`, `reason_code`, `revoked_by_ref`, `created_at` |
| `platform_scheduled_plan_switches` | 8 | `account_id`, `entitlement_id`, `from_offer_version_ref`, `to_offer_version_ref`, `effective_at`, `paid_units`, `status`, `created_at` |
| `platform_schema_migrations` | 2 | `ddl_checksum`, `applied_at` |
| `platform_usage_counter_cursors` | 8 | `source_ref`, `channel_ref`, `edge_credential_ref`, `upload_bytes`, `download_bytes`, `observed_at`, `epoch`, `updated_at` |
| `platform_usage_rollups` | 9 | `account_id`, `entitlement_id`, `request_id`, `channel_ref`, `upload_bytes`, `download_bytes`, `total_bytes`, `last_observed_at`, `updated_at` |
| `platform_usage_samples` | 14 | `source_ref`, `channel_ref`, `edge_credential_ref`, `account_id`, `entitlement_id`, `request_id`, `observed_at`, `interval_started_at`, `interval_ended_at`, `upload_bytes`, `download_bytes`, `total_bytes`, `sample_digest`, `created_at` |
| `platform_wallet_first_deferred_checkout_quotes` | 17 | `account_id`, `deferred_order_ref`, `offer_version_ref`, `offer_snapshot_json`, `wallet_version`, `amount_units`, `applied_discount_basis_points`, `purchase_availability`, `shortfall_units`, `allocation_json`, `before_balance_json`, `after_balance_json`, `flow_kind`, `scheduled_for`, `status`, `created_at`, `expires_at` |
| `platform_wallet_first_resource_effect_runtime_claims` | 11 | `effect_ref`, `flow_kind`, `entitlement_id`, `request_id`, `issued_link_id`, `valid_until`, `node_id`, `status`, `lease_generation`, `created_at`, `updated_at` |
| `platform_wallet_first_setup_delivery_handoffs` | 10 | `handoff_ref`, `account_id`, `initial_transition_ref`, `effect_ref`, `tenant_ref`, `artifact_ref`, `status`, `claim_generation`, `created_at`, `updated_at` |

## 附录 C · S-08 CHECK 否定式判定表（284 条）

来源：目标 DDL 16b（SHA `4fad7636…`，3,078 行）中的 279 条 + 2 张 DEFER 凭据表在源码中的 5 条
（`subscription-control-db.mjs:1727-1765`，Master `11dd1cfb`）。编号 S08-C001～S08-C284。
违反判定统一为 `WHERE (<CHECK 原文>) = 0`（SQLite 语义：CHECK 仅在表达式值为 0 时失败，
值为 NULL 时通过；故 `= 0` 与 `NOT(...)` 选中集相同，` = 0` 更直观）。只返回计数，不返回行原文。

| 编号 | 表 | 列 | CHECK 原文 | 违反判定 |
|---|---|---|---|---|
| S08-C001 | `platform_account_resource_authorities` | `—（多列状态机）` | `( ( status = 'active' and revoked_at is null and revoked_by is null and revocation_reason is null ) or ( status = 'revoked' and revoked_at is not null and length(trim(revoked_at)) > 0 and revoked_by is not null and length(trim(revoked_by)) > 0 and revocation_reason is not null and length(trim(revocation_reason)) > 0 ) )` | `WHERE (( ( status = 'active' and revoked_at is null and revoked_by is null and revocation_reason is null ) or ( status = 'revoked' and revoked_at is not null and length(trim(revoked_at)) > 0 and revoked_by is not null and length(trim(revoked_by)) > 0 and revocation_reason is not null and length(trim(revocation_reason)) > 0 ) )) = 0` |
| S08-C002 | `platform_account_resource_authorities` | `created_at` | `(length(trim(created_at)) > 0)` | `WHERE ((length(trim(created_at)) > 0)) = 0` |
| S08-C003 | `platform_account_resource_authorities` | `created_by` | `(length(trim(created_by)) > 0)` | `WHERE ((length(trim(created_by)) > 0)) = 0` |
| S08-C004 | `platform_account_resource_authorities` | `reason` | `(length(trim(reason)) > 0)` | `WHERE ((length(trim(reason)) > 0)) = 0` |
| S08-C005 | `platform_account_resource_authorities` | `status` | `(status in ('active', 'revoked'))` | `WHERE ((status in ('active', 'revoked'))) = 0` |
| S08-C006 | `platform_account_resource_authorities` | `updated_at` | `(length(trim(updated_at)) > 0)` | `WHERE ((length(trim(updated_at)) > 0)) = 0` |
| S08-C007 | `platform_account_resource_authorities` | `version` | `( typeof(version) = 'integer' and version >= 1 )` | `WHERE (( typeof(version) = 'integer' and version >= 1 )) = 0` |
| S08-C008 | `platform_accounts` | `status` | `(status in ('active', 'suspended', 'disabled'))` | `WHERE ((status in ('active', 'suspended', 'disabled'))) = 0` |
| S08-C009 | `platform_ads_consent_decisions` | `ad_personalization` | `(ad_personalization = 0)` | `WHERE ((ad_personalization = 0)) = 0` |
| S08-C010 | `platform_ads_consent_decisions` | `ad_user_data` | `(ad_user_data in (0, 1))` | `WHERE ((ad_user_data in (0, 1))) = 0` |
| S08-C011 | `platform_ads_consent_decisions` | `decision` | `(decision in ('granted', 'denied'))` | `WHERE ((decision in ('granted', 'denied'))) = 0` |
| S08-C012 | `platform_coin_commerce_fulfillment_commands` | `—（多列状态机）` | `( ( status = 'processing' and lease_token is not null and length(lease_token) > 0 and lease_until is not null ) or ( status <> 'processing' and lease_token is null and lease_until is null ) )` | `WHERE (( ( status = 'processing' and lease_token is not null and length(lease_token) > 0 and lease_until is not null ) or ( status <> 'processing' and lease_token is null and lease_until is null ) )) = 0` |
| S08-C013 | `platform_coin_commerce_fulfillment_commands` | `—（多列状态机）` | `( (status = 'failed' and safe_failure_code is not null) or (status <> 'failed' and safe_failure_code is null) )` | `WHERE (( (status = 'failed' and safe_failure_code is not null) or (status <> 'failed' and safe_failure_code is null) )) = 0` |
| S08-C014 | `platform_coin_commerce_fulfillment_commands` | `attempt_count` | `( typeof(attempt_count) = 'integer' and attempt_count between 0 and 2147483647 )` | `WHERE (( typeof(attempt_count) = 'integer' and attempt_count between 0 and 2147483647 )) = 0` |
| S08-C015 | `platform_coin_commerce_fulfillment_commands` | `lease_generation` | `( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )` | `WHERE (( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )) = 0` |
| S08-C016 | `platform_coin_commerce_fulfillment_commands` | `payload_json` | `( json_valid(payload_json) and json_type(payload_json) = 'object' )` | `WHERE (( json_valid(payload_json) and json_type(payload_json) = 'object' )) = 0` |
| S08-C017 | `platform_coin_commerce_fulfillment_commands` | `status` | `( status in ('pending', 'processing', 'delivered', 'failed') )` | `WHERE (( status in ('pending', 'processing', 'delivered', 'failed') )) = 0` |
| S08-C018 | `platform_coin_commerce_fulfillment_receipts` | `safe_code` | `(safe_code is null)` | `WHERE ((safe_code is null)) = 0` |
| S08-C019 | `platform_coin_commerce_fulfillment_receipts` | `status` | `(status = 'delivered')` | `WHERE ((status = 'delivered')) = 0` |
| S08-C020 | `platform_coin_commerce_initial_confirmations` | `approval_sha256` | `( length(approval_sha256) = 64 and approval_sha256 not glob '*[^0-9a-f]*' )` | `WHERE (( length(approval_sha256) = 64 and approval_sha256 not glob '*[^0-9a-f]*' )) = 0` |
| S08-C021 | `platform_coin_commerce_initial_confirmations` | `attempt_count` | `( typeof(attempt_count) = 'integer' and attempt_count between 1 and 2147483647 )` | `WHERE (( typeof(attempt_count) = 'integer' and attempt_count between 1 and 2147483647 )) = 0` |
| S08-C022 | `platform_coin_commerce_initial_confirmations` | `confirmation_ref` | `(length(trim(confirmation_ref)) > 0)` | `WHERE ((length(trim(confirmation_ref)) > 0)) = 0` |
| S08-C023 | `platform_coin_commerce_initial_confirmations` | `confirmed_at` | `( length(confirmed_at) = 24 and strftime('%Y-%m-%dT%H:%M:%fZ', confirmed_at) is not null and strftime('%Y-%m-%dT%H:%M:%fZ', confirmed_at) = confirmed_at and confirmed_at >= failed_updated_at )` | `WHERE (( length(confirmed_at) = 24 and strftime('%Y-%m-%dT%H:%M:%fZ', confirmed_at) is not null and strftime('%Y-%m-%dT%H:%M:%fZ', confirmed_at) = confirmed_at and confirmed_at >= failed_updated_at )) = 0` |
| S08-C024 | `platform_coin_commerce_initial_confirmations` | `effect_sha256` | `( length(effect_sha256) = 64 and effect_sha256 not glob '*[^0-9a-f]*' )` | `WHERE (( length(effect_sha256) = 64 and effect_sha256 not glob '*[^0-9a-f]*' )) = 0` |
| S08-C025 | `platform_coin_commerce_initial_confirmations` | `inventory_sha256` | `( length(inventory_sha256) = 64 and inventory_sha256 not glob '*[^0-9a-f]*' )` | `WHERE (( length(inventory_sha256) = 64 and inventory_sha256 not glob '*[^0-9a-f]*' )) = 0` |
| S08-C026 | `platform_coin_commerce_initial_confirmations` | `lease_generation` | `( typeof(lease_generation) = 'integer' and lease_generation between 1 and 2147483647 )` | `WHERE (( typeof(lease_generation) = 'integer' and lease_generation between 1 and 2147483647 )) = 0` |
| S08-C027 | `platform_coin_commerce_initial_confirmations` | `operator_ref` | `(length(trim(operator_ref)) > 0)` | `WHERE ((length(trim(operator_ref)) > 0)) = 0` |
| S08-C028 | `platform_coin_commerce_initial_confirmations` | `receipt_ref` | `(length(trim(receipt_ref)) > 0)` | `WHERE ((length(trim(receipt_ref)) > 0)) = 0` |
| S08-C029 | `platform_coin_commerce_offer_versions` | `—（多列状态机）` | `( ( category = 'plan' and delivery_kind = 'subscription_plan' and duration_days is not null and monthly_traffic_gb is not null and traffic_gb is null and never_expires = 0 and discount_basis_points is not null ) or ( category = 'data_pack' and delivery_kind = 'data_pack' and duration_days is null and monthly_traffic_gb is null and traffic_gb is not null and never_expires = 1 and discount_basis_points is null ) )` | `WHERE (( ( category = 'plan' and delivery_kind = 'subscription_plan' and duration_days is not null and monthly_traffic_gb is not null and traffic_gb is null and never_expires = 0 and discount_basis_points is not null ) or ( category = 'data_pack' and delivery_kind = 'data_pack' and duration_days is null and monthly_traffic_gb is null and traffic_gb is not null and never_expires = 1 and discount_basis_points is null ) )) = 0` |
| S08-C030 | `platform_coin_commerce_offer_versions` | `—（多列状态机）` | `( (status = 'draft' and published_at is null and retired_at is null) or (status = 'published' and published_at is not null and retired_at is null) or (status = 'retired' and published_at is not null and retired_at is not null) )` | `WHERE (( (status = 'draft' and published_at is null and retired_at is null) or (status = 'published' and published_at is not null and retired_at is null) or (status = 'retired' and published_at is not null and retired_at is not null) )) = 0` |
| S08-C031 | `platform_coin_commerce_offer_versions` | `accepted_coin_types_json` | `( json_valid(accepted_coin_types_json) and json_type(accepted_coin_types_json) = 'array' and json_array_length(accepted_coin_types_json) > 0 )` | `WHERE (( json_valid(accepted_coin_types_json) and json_type(accepted_coin_types_json) = 'array' and json_array_length(accepted_coin_types_json) > 0 )) = 0` |
| S08-C032 | `platform_coin_commerce_offer_versions` | `base_coin_units` | `( typeof(base_coin_units) = 'integer' and base_coin_units between 1 and 9007199254740991 )` | `WHERE (( typeof(base_coin_units) = 'integer' and base_coin_units between 1 and 9007199254740991 )) = 0` |
| S08-C033 | `platform_coin_commerce_offer_versions` | `category` | `(category in ('plan', 'data_pack'))` | `WHERE ((category in ('plan', 'data_pack'))) = 0` |
| S08-C034 | `platform_coin_commerce_offer_versions` | `delivery_kind` | `( delivery_kind in ('subscription_plan', 'data_pack') )` | `WHERE (( delivery_kind in ('subscription_plan', 'data_pack') )) = 0` |
| S08-C035 | `platform_coin_commerce_offer_versions` | `discount_basis_points` | `( discount_basis_points is null or ( typeof(discount_basis_points) = 'integer' and discount_basis_points between 0 and 10000 ) )` | `WHERE (( discount_basis_points is null or ( typeof(discount_basis_points) = 'integer' and discount_basis_points between 0 and 10000 ) )) = 0` |
| S08-C036 | `platform_coin_commerce_offer_versions` | `duration_days` | `( duration_days is null or ( typeof(duration_days) = 'integer' and duration_days between 1 and 9007199254740991 ) )` | `WHERE (( duration_days is null or ( typeof(duration_days) = 'integer' and duration_days between 1 and 9007199254740991 ) )) = 0` |
| S08-C037 | `platform_coin_commerce_offer_versions` | `important_notices_en_json` | `( json_valid(important_notices_en_json) and json_type(important_notices_en_json) = 'array' and json_array_length(important_notices_en_json) > 0 )` | `WHERE (( json_valid(important_notices_en_json) and json_type(important_notices_en_json) = 'array' and json_array_length(important_notices_en_json) > 0 )) = 0` |
| S08-C038 | `platform_coin_commerce_offer_versions` | `important_notices_zh_json` | `( json_valid(important_notices_zh_json) and json_type(important_notices_zh_json) = 'array' and json_array_length(important_notices_zh_json) > 0 )` | `WHERE (( json_valid(important_notices_zh_json) and json_type(important_notices_zh_json) = 'array' and json_array_length(important_notices_zh_json) > 0 )) = 0` |
| S08-C039 | `platform_coin_commerce_offer_versions` | `monthly_traffic_gb` | `( monthly_traffic_gb is null or ( typeof(monthly_traffic_gb) = 'integer' and monthly_traffic_gb between 1 and 9007199254740991 ) )` | `WHERE (( monthly_traffic_gb is null or ( typeof(monthly_traffic_gb) = 'integer' and monthly_traffic_gb between 1 and 9007199254740991 ) )) = 0` |
| S08-C040 | `platform_coin_commerce_offer_versions` | `never_expires` | `( typeof(never_expires) = 'integer' and never_expires in (0, 1) )` | `WHERE (( typeof(never_expires) = 'integer' and never_expires in (0, 1) )) = 0` |
| S08-C041 | `platform_coin_commerce_offer_versions` | `reference_amount_minor` | `( typeof(reference_amount_minor) = 'integer' and reference_amount_minor between 1 and 9007199254740991 )` | `WHERE (( typeof(reference_amount_minor) = 'integer' and reference_amount_minor between 1 and 9007199254740991 )) = 0` |
| S08-C042 | `platform_coin_commerce_offer_versions` | `reference_currency` | `(reference_currency = 'CNY')` | `WHERE ((reference_currency = 'CNY')) = 0` |
| S08-C043 | `platform_coin_commerce_offer_versions` | `status` | `(status in ('draft', 'published', 'retired'))` | `WHERE ((status in ('draft', 'published', 'retired'))) = 0` |
| S08-C044 | `platform_coin_commerce_offer_versions` | `summary_en` | `(length(summary_en) > 0)` | `WHERE ((length(summary_en) > 0)) = 0` |
| S08-C045 | `platform_coin_commerce_offer_versions` | `summary_zh` | `(length(summary_zh) > 0)` | `WHERE ((length(summary_zh) > 0)) = 0` |
| S08-C046 | `platform_coin_commerce_offer_versions` | `title_en` | `(length(title_en) > 0)` | `WHERE ((length(title_en) > 0)) = 0` |
| S08-C047 | `platform_coin_commerce_offer_versions` | `title_zh` | `(length(title_zh) > 0)` | `WHERE ((length(title_zh) > 0)) = 0` |
| S08-C048 | `platform_coin_commerce_offer_versions` | `traffic_gb` | `( traffic_gb is null or ( typeof(traffic_gb) = 'integer' and traffic_gb between 1 and 9007199254740991 ) )` | `WHERE (( traffic_gb is null or ( typeof(traffic_gb) = 'integer' and traffic_gb between 1 and 9007199254740991 ) )) = 0` |
| S08-C049 | `platform_coin_commerce_offer_versions` | `version` | `( typeof(version) = 'integer' and version between 1 and 9007199254740991 )` | `WHERE (( typeof(version) = 'integer' and version between 1 and 9007199254740991 )) = 0` |
| S08-C050 | `platform_coin_commerce_operation_receipts` | `—（多列状态机）` | `( ( status = 'started' and result_ref is null and safe_result_code is null and completed_at is null ) or ( status = 'succeeded' and result_ref is not null and safe_result_code is null and completed_at is not null ) or ( status = 'failed' and result_ref is null and safe_result_code is not null and completed_at is not null ) )` | `WHERE (( ( status = 'started' and result_ref is null and safe_result_code is null and completed_at is null ) or ( status = 'succeeded' and result_ref is not null and safe_result_code is null and completed_at is not null ) or ( status = 'failed' and result_ref is null and safe_result_code is not null and completed_at is not null ) )) = 0` |
| S08-C051 | `platform_coin_commerce_operation_receipts` | `operation_type` | `( operation_type in ( 'publish_offer', 'create_quote', 'confirm_order', 'cancel_order', 'claim_capture', 'capture_order', 'fulfillment_result' ) )` | `WHERE (( operation_type in ( 'publish_offer', 'create_quote', 'confirm_order', 'cancel_order', 'claim_capture', 'capture_order', 'fulfillment_result' ) )) = 0` |
| S08-C052 | `platform_coin_commerce_operation_receipts` | `status` | `(status in ('started', 'succeeded', 'failed'))` | `WHERE ((status in ('started', 'succeeded', 'failed'))) = 0` |
| S08-C053 | `platform_coin_commerce_order_events` | `—（多列状态机）` | `( ( event_type in ('fulfillment_failed', 'reconciliation_required') and safe_code is not null ) or ( event_type not in ('fulfillment_failed', 'reconciliation_required') and safe_code is null ) )` | `WHERE (( ( event_type in ('fulfillment_failed', 'reconciliation_required') and safe_code is not null ) or ( event_type not in ('fulfillment_failed', 'reconciliation_required') and safe_code is null ) )) = 0` |
| S08-C054 | `platform_coin_commerce_order_events` | `actor_type` | `( actor_type in ('portal_user', 'commerce_system') )` | `WHERE (( actor_type in ('portal_user', 'commerce_system') )) = 0` |
| S08-C055 | `platform_coin_commerce_order_events` | `event_type` | `( event_type in ( 'order_held', 'order_cancelled', 'capture_claimed', 'payment_captured', 'fulfillment_delivered', 'fulfillment_failed', 'reconciliation_required' ) )` | `WHERE (( event_type in ( 'order_held', 'order_cancelled', 'capture_claimed', 'payment_captured', 'fulfillment_delivered', 'fulfillment_failed', 'reconciliation_required' ) )) = 0` |
| S08-C056 | `platform_coin_commerce_orders` | `allocation_snapshot_json` | `( json_valid(allocation_snapshot_json) and json_type(allocation_snapshot_json) = 'array' )` | `WHERE (( json_valid(allocation_snapshot_json) and json_type(allocation_snapshot_json) = 'array' )) = 0` |
| S08-C057 | `platform_coin_commerce_orders` | `amount_units` | `( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )` | `WHERE (( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )) = 0` |
| S08-C058 | `platform_coin_commerce_orders` | `offer_snapshot_json` | `( json_valid(offer_snapshot_json) and json_type(offer_snapshot_json) = 'object' )` | `WHERE (( json_valid(offer_snapshot_json) and json_type(offer_snapshot_json) = 'object' )) = 0` |
| S08-C059 | `platform_coin_commerce_orders` | `payment_status` | `( payment_status in ( 'held', 'capture_pending', 'captured', 'cancelled', 'capture_failed', 'reconciliation_required' ) )` | `WHERE (( payment_status in ( 'held', 'capture_pending', 'captured', 'cancelled', 'capture_failed', 'reconciliation_required' ) )) = 0` |
| S08-C060 | `platform_coin_commerce_plan_switch_quotes` | `—（多列状态机）` | `(snapshot_valid_from < snapshot_valid_until)` | `WHERE ((snapshot_valid_from < snapshot_valid_until)) = 0` |
| S08-C061 | `platform_coin_commerce_plan_switch_quotes` | `—（多列状态机）` | `( ( kind = 'renewal' and from_offer_version_ref = to_offer_version_ref ) or ( kind <> 'renewal' and from_offer_version_ref <> to_offer_version_ref ) )` | `WHERE (( ( kind = 'renewal' and from_offer_version_ref = to_offer_version_ref ) or ( kind <> 'renewal' and from_offer_version_ref <> to_offer_version_ref ) )) = 0` |
| S08-C062 | `platform_coin_commerce_plan_switch_quotes` | `—（多列状态机）` | `( ( kind = 'downgrade_scheduled' and effective_at is not null and length(trim(effective_at)) > 0 ) or ( kind <> 'downgrade_scheduled' and effective_at is null ) )` | `WHERE (( ( kind = 'downgrade_scheduled' and effective_at is not null and length(trim(effective_at)) > 0 ) or ( kind <> 'downgrade_scheduled' and effective_at is null ) )) = 0` |
| S08-C063 | `platform_coin_commerce_plan_switch_quotes` | `charge_units` | `( typeof(charge_units) = 'integer' and charge_units between 1 and 9007199254740991 )` | `WHERE (( typeof(charge_units) = 'integer' and charge_units between 1 and 9007199254740991 )) = 0` |
| S08-C064 | `platform_coin_commerce_plan_switch_quotes` | `created_at` | `(length(trim(created_at)) > 0)` | `WHERE ((length(trim(created_at)) > 0)) = 0` |
| S08-C065 | `platform_coin_commerce_plan_switch_quotes` | `credit_units` | `( typeof(credit_units) = 'integer' and credit_units between 0 and 9007199254740991 )` | `WHERE (( typeof(credit_units) = 'integer' and credit_units between 0 and 9007199254740991 )) = 0` |
| S08-C066 | `platform_coin_commerce_plan_switch_quotes` | `entitlement_id` | `(length(trim(entitlement_id)) > 0)` | `WHERE ((length(trim(entitlement_id)) > 0)) = 0` |
| S08-C067 | `platform_coin_commerce_plan_switch_quotes` | `from_offer_version_ref` | `( length(trim(from_offer_version_ref)) > 0 )` | `WHERE (( length(trim(from_offer_version_ref)) > 0 )) = 0` |
| S08-C068 | `platform_coin_commerce_plan_switch_quotes` | `kind` | `(kind in ( 'renewal', 'upgrade_inplace', 'upgrade_restart', 'downgrade_scheduled' ))` | `WHERE ((kind in ( 'renewal', 'upgrade_inplace', 'upgrade_restart', 'downgrade_scheduled' ))) = 0` |
| S08-C069 | `platform_coin_commerce_plan_switch_quotes` | `list_price_units` | `( typeof(list_price_units) = 'integer' and list_price_units between 1 and 9007199254740991 )` | `WHERE (( typeof(list_price_units) = 'integer' and list_price_units between 1 and 9007199254740991 )) = 0` |
| S08-C070 | `platform_coin_commerce_plan_switch_quotes` | `pending_credit_units` | `( typeof(pending_credit_units) = 'integer' and pending_credit_units between 0 and 9007199254740991 )` | `WHERE (( typeof(pending_credit_units) = 'integer' and pending_credit_units between 0 and 9007199254740991 )) = 0` |
| S08-C071 | `platform_coin_commerce_plan_switch_quotes` | `snapshot_valid_from` | `( length(trim(snapshot_valid_from)) > 0 )` | `WHERE (( length(trim(snapshot_valid_from)) > 0 )) = 0` |
| S08-C072 | `platform_coin_commerce_plan_switch_quotes` | `snapshot_valid_until` | `( length(trim(snapshot_valid_until)) > 0 )` | `WHERE (( length(trim(snapshot_valid_until)) > 0 )) = 0` |
| S08-C073 | `platform_coin_commerce_plan_switch_quotes` | `to_offer_version_ref` | `( length(trim(to_offer_version_ref)) > 0 )` | `WHERE (( length(trim(to_offer_version_ref)) > 0 )) = 0` |
| S08-C074 | `platform_coin_commerce_quotes` | `—（多列状态机）` | `( ( purchase_availability = 'available' and shortfall_units = 0 ) or ( purchase_availability = 'insufficient_balance' and shortfall_units > 0 and json_array_length(allocation_json) = 0 and json(before_balance_json) = json(after_balance_json) ) )` | `WHERE (( ( purchase_availability = 'available' and shortfall_units = 0 ) or ( purchase_availability = 'insufficient_balance' and shortfall_units > 0 and json_array_length(allocation_json) = 0 and json(before_balance_json) = json(after_balance_json) ) )) = 0` |
| S08-C075 | `platform_coin_commerce_quotes` | `—（多列状态机）` | `( (status = 'consumed' and consumed_at is not null) or (status in ('active', 'expired') and consumed_at is null) )` | `WHERE (( (status = 'consumed' and consumed_at is not null) or (status in ('active', 'expired') and consumed_at is null) )) = 0` |
| S08-C076 | `platform_coin_commerce_quotes` | `after_balance_json` | `( json_valid(after_balance_json) and json_type(after_balance_json) = 'object' )` | `WHERE (( json_valid(after_balance_json) and json_type(after_balance_json) = 'object' )) = 0` |
| S08-C077 | `platform_coin_commerce_quotes` | `allocation_json` | `( json_valid(allocation_json) and json_type(allocation_json) = 'array' )` | `WHERE (( json_valid(allocation_json) and json_type(allocation_json) = 'array' )) = 0` |
| S08-C078 | `platform_coin_commerce_quotes` | `amount_units` | `( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )` | `WHERE (( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )) = 0` |
| S08-C079 | `platform_coin_commerce_quotes` | `applied_discount_basis_points` | `( typeof(applied_discount_basis_points) = 'integer' and applied_discount_basis_points between 0 and 10000 )` | `WHERE (( typeof(applied_discount_basis_points) = 'integer' and applied_discount_basis_points between 0 and 10000 )) = 0` |
| S08-C080 | `platform_coin_commerce_quotes` | `before_balance_json` | `( json_valid(before_balance_json) and json_type(before_balance_json) = 'object' )` | `WHERE (( json_valid(before_balance_json) and json_type(before_balance_json) = 'object' )) = 0` |
| S08-C081 | `platform_coin_commerce_quotes` | `purchase_availability` | `( purchase_availability in ('available', 'insufficient_balance') )` | `WHERE (( purchase_availability in ('available', 'insufficient_balance') )) = 0` |
| S08-C082 | `platform_coin_commerce_quotes` | `shortfall_units` | `( typeof(shortfall_units) = 'integer' and shortfall_units between 0 and 9007199254740991 )` | `WHERE (( typeof(shortfall_units) = 'integer' and shortfall_units between 0 and 9007199254740991 )) = 0` |
| S08-C083 | `platform_coin_commerce_quotes` | `status` | `(status in ('active', 'consumed', 'expired'))` | `WHERE ((status in ('active', 'consumed', 'expired'))) = 0` |
| S08-C084 | `platform_coin_commerce_quotes` | `wallet_version` | `( typeof(wallet_version) = 'integer' and wallet_version between 0 and 9007199254740991 )` | `WHERE (( typeof(wallet_version) = 'integer' and wallet_version between 0 and 9007199254740991 )) = 0` |
| S08-C085 | `platform_coin_credit_origins` | `coin_type` | `(coin_type in ('paid_coins', 'bonus_coins', 'reward_coins'))` | `WHERE ((coin_type in ('paid_coins', 'bonus_coins', 'reward_coins'))) = 0` |
| S08-C086 | `platform_coin_hold_allocations` | `allocated_units` | `(typeof(allocated_units) = 'integer' and allocated_units > 0)` | `WHERE ((typeof(allocated_units) = 'integer' and allocated_units > 0)) = 0` |
| S08-C087 | `platform_coin_hold_allocations` | `allocation_sequence` | `(typeof(allocation_sequence) = 'integer' and allocation_sequence > 0)` | `WHERE ((typeof(allocation_sequence) = 'integer' and allocation_sequence > 0)) = 0` |
| S08-C088 | `platform_coin_holds` | `amount_units` | `(typeof(amount_units) = 'integer' and amount_units > 0)` | `WHERE ((typeof(amount_units) = 'integer' and amount_units > 0)) = 0` |
| S08-C089 | `platform_coin_holds` | `purpose` | `(purpose in ('product_purchase', 'reward_adjustment'))` | `WHERE ((purpose in ('product_purchase', 'reward_adjustment'))) = 0` |
| S08-C090 | `platform_coin_holds` | `status` | `(status in ('active', 'captured', 'released', 'expired', 'invalidated'))` | `WHERE ((status in ('active', 'captured', 'released', 'expired', 'invalidated'))) = 0` |
| S08-C091 | `platform_coin_ledger_entries` | `amount_units` | `(typeof(amount_units) = 'integer' and amount_units > 0)` | `WHERE ((typeof(amount_units) = 'integer' and amount_units > 0)) = 0` |
| S08-C092 | `platform_coin_ledger_entries` | `previous_wallet_version` | `(typeof(previous_wallet_version) = 'integer' and previous_wallet_version >= 0)` | `WHERE ((typeof(previous_wallet_version) = 'integer' and previous_wallet_version >= 0)) = 0` |
| S08-C093 | `platform_coin_ledger_entries` | `resulting_wallet_status` | `(resulting_wallet_status in ('active', 'frozen', 'closed'))` | `WHERE ((resulting_wallet_status in ('active', 'frozen', 'closed'))) = 0` |
| S08-C094 | `platform_coin_ledger_entries` | `resulting_wallet_version` | `( typeof(resulting_wallet_version) = 'integer' and resulting_wallet_version > previous_wallet_version )` | `WHERE (( typeof(resulting_wallet_version) = 'integer' and resulting_wallet_version > previous_wallet_version )) = 0` |
| S08-C095 | `platform_coin_lots` | `—（多列状态机）` | `( pending_units + available_units + held_units + consumed_units + reversed_units + expired_units = issued_units )` | `WHERE (( pending_units + available_units + held_units + consumed_units + reversed_units + expired_units = issued_units )) = 0` |
| S08-C096 | `platform_coin_lots` | `—（多列状态机）` | `(coin_type = 'bonus_coins' or expires_at is null)` | `WHERE ((coin_type = 'bonus_coins' or expires_at is null)) = 0` |
| S08-C097 | `platform_coin_lots` | `—（多列状态机）` | `( ( coin_type = 'reward_coins' and policy_ref is not null and typeof(policy_version) = 'integer' and policy_version > 0 ) or ( coin_type in ('paid_coins', 'bonus_coins') and policy_ref is null and policy_version is null ) )` | `WHERE (( ( coin_type = 'reward_coins' and policy_ref is not null and typeof(policy_version) = 'integer' and policy_version > 0 ) or ( coin_type in ('paid_coins', 'bonus_coins') and policy_ref is null and policy_version is null ) )) = 0` |
| S08-C098 | `platform_coin_lots` | `available_units` | `(typeof(available_units) = 'integer' and available_units >= 0)` | `WHERE ((typeof(available_units) = 'integer' and available_units >= 0)) = 0` |
| S08-C099 | `platform_coin_lots` | `coin_type` | `(coin_type in ('paid_coins', 'bonus_coins', 'reward_coins'))` | `WHERE ((coin_type in ('paid_coins', 'bonus_coins', 'reward_coins'))) = 0` |
| S08-C100 | `platform_coin_lots` | `consumed_units` | `(typeof(consumed_units) = 'integer' and consumed_units >= 0)` | `WHERE ((typeof(consumed_units) = 'integer' and consumed_units >= 0)) = 0` |
| S08-C101 | `platform_coin_lots` | `expired_units` | `(typeof(expired_units) = 'integer' and expired_units >= 0)` | `WHERE ((typeof(expired_units) = 'integer' and expired_units >= 0)) = 0` |
| S08-C102 | `platform_coin_lots` | `held_units` | `(typeof(held_units) = 'integer' and held_units >= 0)` | `WHERE ((typeof(held_units) = 'integer' and held_units >= 0)) = 0` |
| S08-C103 | `platform_coin_lots` | `issued_units` | `(typeof(issued_units) = 'integer' and issued_units >= 0)` | `WHERE ((typeof(issued_units) = 'integer' and issued_units >= 0)) = 0` |
| S08-C104 | `platform_coin_lots` | `pending_units` | `(typeof(pending_units) = 'integer' and pending_units >= 0)` | `WHERE ((typeof(pending_units) = 'integer' and pending_units >= 0)) = 0` |
| S08-C105 | `platform_coin_lots` | `reversed_units` | `(typeof(reversed_units) = 'integer' and reversed_units >= 0)` | `WHERE ((typeof(reversed_units) = 'integer' and reversed_units >= 0)) = 0` |
| S08-C106 | `platform_coin_operation_receipts` | `—（多列状态机）` | `( ( status = 'started' and result_ref is null and safe_result_code is null and completed_at is null and previous_wallet_version is null and resulting_wallet_version is null and resulting_wallet_status is null ) or ( status = 'succeeded' and wallet_ref is not null and result_ref is not null and safe_result_code is not null and completed_at is not null and previous_wallet_version is not null and resulting_wallet_version is not null and resulting_wallet_status is not null and resulting_wallet_version >= previous_wallet_version ) or ( status = 'failed' and wallet_ref is not null and safe_result_code is not null and completed_at is not null and previous_wallet_version is not null and resulting_wallet_version is not null and resulting_wallet_status is not null and resulting_wallet_version = previous_wallet_version ) )` | `WHERE (( ( status = 'started' and result_ref is null and safe_result_code is null and completed_at is null and previous_wallet_version is null and resulting_wallet_version is null and resulting_wallet_status is null ) or ( status = 'succeeded' and wallet_ref is not null and result_ref is not null and safe_result_code is not null and completed_at is not null and previous_wallet_version is not null and resulting_wallet_version is not null and resulting_wallet_status is not null and resulting_wallet_version >= previous_wallet_version ) or ( status = 'failed' and wallet_ref is not null and safe_result_code is not null and completed_at is not null and previous_wallet_version is not null and resulting_wallet_version is not null and resulting_wallet_status is not null and resulting_wallet_version = previous_wallet_version ) )) = 0` |
| S08-C107 | `platform_coin_operation_receipts` | `previous_wallet_version` | `( previous_wallet_version is null or ( typeof(previous_wallet_version) = 'integer' and previous_wallet_version >= 0 ) )` | `WHERE (( previous_wallet_version is null or ( typeof(previous_wallet_version) = 'integer' and previous_wallet_version >= 0 ) )) = 0` |
| S08-C108 | `platform_coin_operation_receipts` | `resulting_wallet_status` | `( resulting_wallet_status is null or resulting_wallet_status in ('active', 'frozen', 'closed') )` | `WHERE (( resulting_wallet_status is null or resulting_wallet_status in ('active', 'frozen', 'closed') )) = 0` |
| S08-C109 | `platform_coin_operation_receipts` | `resulting_wallet_version` | `( resulting_wallet_version is null or ( typeof(resulting_wallet_version) = 'integer' and resulting_wallet_version >= 0 ) )` | `WHERE (( resulting_wallet_version is null or ( typeof(resulting_wallet_version) = 'integer' and resulting_wallet_version >= 0 ) )) = 0` |
| S08-C110 | `platform_coin_operation_receipts` | `status` | `(status in ('started', 'succeeded', 'failed'))` | `WHERE ((status in ('started', 'succeeded', 'failed'))) = 0` |
| S08-C111 | `platform_coin_wallets` | `status` | `(status in ('active', 'frozen', 'closed'))` | `WHERE ((status in ('active', 'frozen', 'closed'))) = 0` |
| S08-C112 | `platform_coin_wallets` | `version` | `(typeof(version) = 'integer' and version >= 0)` | `WHERE ((typeof(version) = 'integer' and version >= 0)) = 0` |
| S08-C113 | `platform_commerce_authority_quote_bindings` | `authority_version` | `( typeof(authority_version) = 'integer' and authority_version between 1 and 9007199254740991 )` | `WHERE (( typeof(authority_version) = 'integer' and authority_version between 1 and 9007199254740991 )) = 0` |
| S08-C114 | `platform_commerce_authority_quote_bindings` | `created_at` | `(length(trim(created_at)) > 0)` | `WHERE ((length(trim(created_at)) > 0)) = 0` |
| S08-C115 | `platform_data_pack_artifact_rotations` | `attempt` | `(attempt between 1 and 16)` | `WHERE ((attempt between 1 and 16)) = 0` |
| S08-C116 | `platform_data_pack_artifact_rotations` | `status` | `(status in ('prepared', 'escrowed', 'switched', 'complete'))` | `WHERE ((status in ('prepared', 'escrowed', 'switched', 'complete'))) = 0` |
| S08-C117 | `platform_data_pack_credential_resets` | `status` | `(status in ('prepared', 'staged', 'control_switched', 'material_committed', 'edge_applied', 'complete'))` | `WHERE ((status in ('prepared', 'staged', 'control_switched', 'material_committed', 'edge_applied', 'complete'))) = 0` |
| S08-C118 | `platform_data_pack_edge_credentials` | `status` | `(status in ('active', 'rotated', 'disabled'))` | `WHERE ((status in ('active', 'rotated', 'disabled'))) = 0` |
| S08-C119 | `platform_data_pack_resources` | `commercial_never_expires` | `(commercial_never_expires = 1)` | `WHERE ((commercial_never_expires = 1)) = 0` |
| S08-C120 | `platform_data_pack_resources` | `quota_bytes` | `(quota_bytes > 0)` | `WHERE ((quota_bytes > 0)) = 0` |
| S08-C121 | `platform_deferred_resource_transition_events` | `—（多列状态机）` | `( ( event_type in ( 'transition_requote_required', 'transition_reconciliation_required' ) and safe_code is not null ) or ( event_type not in ( 'transition_requote_required', 'transition_reconciliation_required' ) and safe_code is null ) )` | `WHERE (( ( event_type in ( 'transition_requote_required', 'transition_reconciliation_required' ) and safe_code is not null ) or ( event_type not in ( 'transition_requote_required', 'transition_reconciliation_required' ) and safe_code is null ) )) = 0` |
| S08-C122 | `platform_deferred_resource_transition_events` | `actor_type` | `( actor_type in ('portal_user', 'commerce_system') )` | `WHERE (( actor_type in ('portal_user', 'commerce_system') )) = 0` |
| S08-C123 | `platform_deferred_resource_transition_events` | `event_type` | `(event_type in ( 'transition_reserved', 'transition_claimed', 'resource_effect_applied', 'transition_settled', 'transition_rebased', 'transition_requote_required', 'transition_cancelled', 'transition_reconciliation_required' ))` | `WHERE ((event_type in ( 'transition_reserved', 'transition_claimed', 'resource_effect_applied', 'transition_settled', 'transition_rebased', 'transition_requote_required', 'transition_cancelled', 'transition_reconciliation_required' ))) = 0` |
| S08-C124 | `platform_deferred_resource_transition_operation_receipts` | `—（多列状态机）` | `( ( status = 'started' and result_ref is null and safe_result_code is null and completed_at is null ) or ( status = 'succeeded' and result_ref is not null and safe_result_code is null and completed_at is not null ) or ( status = 'failed' and result_ref is null and safe_result_code is not null and completed_at is not null ) )` | `WHERE (( ( status = 'started' and result_ref is null and safe_result_code is null and completed_at is null ) or ( status = 'succeeded' and result_ref is not null and safe_result_code is null and completed_at is not null ) or ( status = 'failed' and result_ref is null and safe_result_code is not null and completed_at is not null ) )) = 0` |
| S08-C125 | `platform_deferred_resource_transition_operation_receipts` | `operation_type` | `(operation_type in ( 'reserve_transition', 'claim_transition', 'record_effect', 'settle_transition', 'rebase_transition', 'cancel_transition', 'require_requote', 'reconcile_transition' ))` | `WHERE ((operation_type in ( 'reserve_transition', 'claim_transition', 'record_effect', 'settle_transition', 'rebase_transition', 'cancel_transition', 'require_requote', 'reconcile_transition' ))) = 0` |
| S08-C126 | `platform_deferred_resource_transition_operation_receipts` | `status` | `(status in ('started', 'succeeded', 'failed'))` | `WHERE ((status in ('started', 'succeeded', 'failed'))) = 0` |
| S08-C127 | `platform_deferred_resource_transition_rebases` | `—（多列状态机）` | `( ( state = 'pending' and lease_token is null and lease_until is null and safe_code is null and completed_at is null ) or ( state = 'processing' and lease_token is not null and lease_until is not null and safe_code is null and completed_at is null ) or ( state = 'completed' and lease_token is null and lease_until is null and safe_code is null and completed_at is not null ) or ( state = 'reconciliation_required' and lease_token is null and lease_until is null and safe_code is not null and completed_at is null ) )` | `WHERE (( ( state = 'pending' and lease_token is null and lease_until is null and safe_code is null and completed_at is null ) or ( state = 'processing' and lease_token is not null and lease_until is not null and safe_code is null and completed_at is null ) or ( state = 'completed' and lease_token is null and lease_until is null and safe_code is null and completed_at is not null ) or ( state = 'reconciliation_required' and lease_token is null and lease_until is null and safe_code is not null and completed_at is null ) )) = 0` |
| S08-C128 | `platform_deferred_resource_transition_rebases` | `lease_generation` | `( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )` | `WHERE (( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )) = 0` |
| S08-C129 | `platform_deferred_resource_transition_rebases` | `state` | `(state in ( 'pending', 'processing', 'completed', 'reconciliation_required' ))` | `WHERE ((state in ( 'pending', 'processing', 'completed', 'reconciliation_required' ))) = 0` |
| S08-C130 | `platform_deferred_resource_transition_reservation_allocations` | `allocation_sequence` | `( typeof(allocation_sequence) = 'integer' and allocation_sequence > 0 )` | `WHERE (( typeof(allocation_sequence) = 'integer' and allocation_sequence > 0 )) = 0` |
| S08-C131 | `platform_deferred_resource_transition_reservation_allocations` | `amount_units` | `( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )` | `WHERE (( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )) = 0` |
| S08-C132 | `platform_deferred_resource_transition_reservation_allocations` | `coin_type_snapshot` | `(coin_type_snapshot in ( 'paid_coins', 'bonus_coins', 'reward_coins' ))` | `WHERE ((coin_type_snapshot in ( 'paid_coins', 'bonus_coins', 'reward_coins' ))) = 0` |
| S08-C133 | `platform_deferred_resource_transition_reservations` | `—（多列状态机）` | `( ( state = 'reserved' and lease_token is null and lease_until is null ) or ( state = 'processing' and lease_token is not null and lease_until is not null ) or ( state in ('captured', 'released', 'reconciliation_required') and lease_token is null and lease_until is null ) )` | `WHERE (( ( state = 'reserved' and lease_token is null and lease_until is null ) or ( state = 'processing' and lease_token is not null and lease_until is not null ) or ( state in ('captured', 'released', 'reconciliation_required') and lease_token is null and lease_until is null ) )) = 0` |
| S08-C134 | `platform_deferred_resource_transition_reservations` | `amount_units` | `( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )` | `WHERE (( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )) = 0` |
| S08-C135 | `platform_deferred_resource_transition_reservations` | `expires_at` | `(expires_at > activation_at)` | `WHERE ((expires_at > activation_at)) = 0` |
| S08-C136 | `platform_deferred_resource_transition_reservations` | `lease_generation` | `( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )` | `WHERE (( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )) = 0` |
| S08-C137 | `platform_deferred_resource_transition_reservations` | `rebase_generation` | `( typeof(rebase_generation) = 'integer' and rebase_generation between 0 and 2147483647 )` | `WHERE (( typeof(rebase_generation) = 'integer' and rebase_generation between 0 and 2147483647 )) = 0` |
| S08-C138 | `platform_deferred_resource_transition_reservations` | `state` | `(state in ( 'reserved', 'processing', 'captured', 'released', 'reconciliation_required' ))` | `WHERE ((state in ( 'reserved', 'processing', 'captured', 'released', 'reconciliation_required' ))) = 0` |
| S08-C139 | `platform_deferred_resource_transitions` | `—（多列状态机）` | `( ( flow_kind = 'initial_activation' and expected_entitlement_id is null and expected_request_id is null and expected_issued_link_id is null and expected_valid_until is null ) or ( flow_kind = 'scheduled_switch' and expected_entitlement_id is not null and expected_request_id is not null and expected_issued_link_id is not null and expected_valid_until is not null ) )` | `WHERE (( ( flow_kind = 'initial_activation' and expected_entitlement_id is null and expected_request_id is null and expected_issued_link_id is null and expected_valid_until is null ) or ( flow_kind = 'scheduled_switch' and expected_entitlement_id is not null and expected_request_id is not null and expected_issued_link_id is not null and expected_valid_until is not null ) )) = 0` |
| S08-C140 | `platform_deferred_resource_transitions` | `—（多列状态机）` | `( ( state = 'reserved' and lease_token is null and lease_until is null and effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null and safe_code is null and settled_at is null ) or ( state = 'processing' and lease_token is not null and lease_until is not null and effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null and safe_code is null and settled_at is null ) or ( state = 'effect_applied' and lease_token is not null and lease_until is not null and effect_ref is not null and effect_entitlement_id is not null and effect_request_id is not null and effect_issued_link_id is not null and effect_valid_until is not null and safe_code is null and settled_at is null ) or ( state = 'settled' and lease_token is null and lease_until is null and effect_ref is not null and effect_entitlement_id is not null and effect_request_id is not null and effect_issued_link_id is not null and effect_valid_until is not null and safe_code is null and settled_at is not null ) or ( state = 'requote_required' and lease_token is null and lease_until is null and effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null and safe_code is not null and settled_at is null ) or ( state = 'cancelled' and lease_token is null and lease_until is null and effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null and safe_code is null and settled_at is null ) or ( state = 'reconciliation_required' and lease_token is null and lease_until is null and safe_code is not null and ( ( effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null ) or ( effect_ref is not null and effect_entitlement_id is not null and effect_request_id is not null and effect_issued_link_id is not null and effect_valid_until is not null ) ) ) )` | `WHERE (( ( state = 'reserved' and lease_token is null and lease_until is null and effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null and safe_code is null and settled_at is null ) or ( state = 'processing' and lease_token is not null and lease_until is not null and effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null and safe_code is null and settled_at is null ) or ( state = 'effect_applied' and lease_token is not null and lease_until is not null and effect_ref is not null and effect_entitlement_id is not null and effect_request_id is not null and effect_issued_link_id is not null and effect_valid_until is not null and safe_code is null and settled_at is null ) or ( state = 'settled' and lease_token is null and lease_until is null and effect_ref is not null and effect_entitlement_id is not null and effect_request_id is not null and effect_issued_link_id is not null and effect_valid_until is not null and safe_code is null and settled_at is not null ) or ( state = 'requote_required' and lease_token is null and lease_until is null and effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null and safe_code is not null and settled_at is null ) or ( state = 'cancelled' and lease_token is null and lease_until is null and effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null and safe_code is null and settled_at is null ) or ( state = 'reconciliation_required' and lease_token is null and lease_until is null and safe_code is not null and ( ( effect_ref is null and effect_entitlement_id is null and effect_request_id is null and effect_issued_link_id is null and effect_valid_until is null ) or ( effect_ref is not null and effect_entitlement_id is not null and effect_request_id is not null and effect_issued_link_id is not null and effect_valid_until is not null ) ) ) )) = 0` |
| S08-C141 | `platform_deferred_resource_transitions` | `allocation_snapshot_json` | `( json_valid(allocation_snapshot_json) and json_type(allocation_snapshot_json) = 'array' )` | `WHERE (( json_valid(allocation_snapshot_json) and json_type(allocation_snapshot_json) = 'array' )) = 0` |
| S08-C142 | `platform_deferred_resource_transitions` | `amount_units` | `( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )` | `WHERE (( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )) = 0` |
| S08-C143 | `platform_deferred_resource_transitions` | `commercial_model` | `(commercial_model = 'wallet_first_unique_v1')` | `WHERE ((commercial_model = 'wallet_first_unique_v1')) = 0` |
| S08-C144 | `platform_deferred_resource_transitions` | `flow_kind` | `(flow_kind in ('initial_activation', 'scheduled_switch'))` | `WHERE ((flow_kind in ('initial_activation', 'scheduled_switch'))) = 0` |
| S08-C145 | `platform_deferred_resource_transitions` | `lease_generation` | `( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )` | `WHERE (( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )) = 0` |
| S08-C146 | `platform_deferred_resource_transitions` | `offer_snapshot_json` | `( json_valid(offer_snapshot_json) and json_type(offer_snapshot_json) = 'object' )` | `WHERE (( json_valid(offer_snapshot_json) and json_type(offer_snapshot_json) = 'object' )) = 0` |
| S08-C147 | `platform_deferred_resource_transitions` | `plan_rank` | `( typeof(plan_rank) = 'integer' and plan_rank between 1 and 3 )` | `WHERE (( typeof(plan_rank) = 'integer' and plan_rank between 1 and 3 )) = 0` |
| S08-C148 | `platform_deferred_resource_transitions` | `rebase_generation` | `( typeof(rebase_generation) = 'integer' and rebase_generation between 0 and 2147483647 )` | `WHERE (( typeof(rebase_generation) = 'integer' and rebase_generation between 0 and 2147483647 )) = 0` |
| S08-C149 | `platform_deferred_resource_transitions` | `state` | `(state in ( 'reserved', 'processing', 'effect_applied', 'settled', 'requote_required', 'cancelled', 'reconciliation_required' ))` | `WHERE ((state in ( 'reserved', 'processing', 'effect_applied', 'settled', 'requote_required', 'cancelled', 'reconciliation_required' ))) = 0` |
| S08-C150 | `platform_device_bindings` | `status` | `(status in ('active', 'blocked', 'released'))` | `WHERE ((status in ('active', 'blocked', 'released'))) = 0` |
| S08-C151 | `platform_edge_agent_leases` | `status` | `(status in ('active', 'released', 'expired'))` | `WHERE ((status in ('active', 'released', 'expired'))) = 0` |
| S08-C152 | `platform_edge_apply_receipts` | `config_test_ok` | `(config_test_ok in (0, 1))` | `WHERE ((config_test_ok in (0, 1))) = 0` |
| S08-C153 | `platform_edge_apply_receipts` | `listener_udp443` | `(listener_udp443 in (0, 1))` | `WHERE ((listener_udp443 in (0, 1))) = 0` |
| S08-C154 | `platform_edge_apply_receipts` | `service_active` | `(service_active in (0, 1))` | `WHERE ((service_active in (0, 1))) = 0` |
| S08-C155 | `platform_edge_apply_receipts` | `status` | `(status in ('pending', 'applied', 'failed', 'rolled_back', 'drift_detected'))` | `WHERE ((status in ('pending', 'applied', 'failed', 'rolled_back', 'drift_detected'))) = 0` |
| S08-C156 | `platform_edge_desired_state_notifications` | `status` | `(status in ('pending', 'acknowledged', 'applied', 'failed'))` | `WHERE ((status in ('pending', 'acknowledged', 'applied', 'failed'))) = 0` |
| S08-C157 | `platform_edge_registered_nodes` | `status` | `(status in ('active', 'inactive', 'disabled', 'maintenance', 'retired'))` | `WHERE ((status in ('active', 'inactive', 'disabled', 'maintenance', 'retired'))) = 0` |
| S08-C158 | `platform_entitlements` | `status` | `(status in ('active', 'expired', 'revoked', 'suspended'))` | `WHERE ((status in ('active', 'expired', 'revoked', 'suspended'))) = 0` |
| S08-C159 | `platform_identity_bindings` | `—（多列状态机）` | `( (status = 'active' and revoked_at_ms is null) or (status = 'revoked' and revoked_at_ms is not null and revoked_at_ms >= created_at_ms and revoked_at_ms <= updated_at_ms) )` | `WHERE (( (status = 'active' and revoked_at_ms is null) or (status = 'revoked' and revoked_at_ms is not null and revoked_at_ms >= created_at_ms and revoked_at_ms <= updated_at_ms) )) = 0` |
| S08-C160 | `platform_identity_bindings` | `created_at_ms` | `(created_at_ms >= 0)` | `WHERE ((created_at_ms >= 0)) = 0` |
| S08-C161 | `platform_identity_bindings` | `issuer_ref` | `(issuer_ref in ('portal', 'admin'))` | `WHERE ((issuer_ref in ('portal', 'admin'))) = 0` |
| S08-C162 | `platform_identity_bindings` | `status` | `(status in ('active', 'revoked'))` | `WHERE ((status in ('active', 'revoked'))) = 0` |
| S08-C163 | `platform_identity_bindings` | `updated_at_ms` | `(updated_at_ms >= created_at_ms)` | `WHERE ((updated_at_ms >= created_at_ms)) = 0` |
| S08-C164 | `platform_identity_deletion_jobs` | `authorization_basis` | `(authorization_basis in ('owner_request', 'compliance_order'))` | `WHERE ((authorization_basis in ('owner_request', 'compliance_order'))) = 0` |
| S08-C165 | `platform_identity_deletion_jobs` | `current_step` | `(current_step >= 0 and current_step <= 8)` | `WHERE ((current_step >= 0 and current_step <= 8)) = 0` |
| S08-C166 | `platform_identity_deletion_jobs` | `retry_count` | `(retry_count >= 0)` | `WHERE ((retry_count >= 0)) = 0` |
| S08-C167 | `platform_identity_deletion_jobs` | `status` | `(status in ('pending', 'in_progress', 'completed', 'failed', 'abandoned'))` | `WHERE ((status in ('pending', 'in_progress', 'completed', 'failed', 'abandoned'))) = 0` |
| S08-C168 | `platform_identity_deletion_jobs` | `verification_mode` | `(verification_mode in ('physical', 'logical'))` | `WHERE ((verification_mode in ('physical', 'logical'))) = 0` |
| S08-C169 | `platform_identity_deletion_proofs` | `verification_mode` | `(verification_mode in ('physical', 'logical'))` | `WHERE ((verification_mode in ('physical', 'logical'))) = 0` |
| S08-C170 | `platform_issuance_requests` | `quantity` | `(quantity > 0)` | `WHERE ((quantity > 0)) = 0` |
| S08-C171 | `platform_issuance_requests` | `status` | `(status in ('planned', 'issued', 'failed', 'revoked', 'cancelled'))` | `WHERE ((status in ('planned', 'issued', 'failed', 'revoked', 'cancelled'))) = 0` |
| S08-C172 | `platform_issued_subscription_links` | `status` | `(status in ('active', 'revoked', 'rotated', 'disabled'))` | `WHERE ((status in ('active', 'revoked', 'rotated', 'disabled'))) = 0` |
| S08-C173 | `platform_leads` | `status` | `(status in ('new', 'reviewing', 'converted', 'rejected'))` | `WHERE ((status in ('new', 'reviewing', 'converted', 'rejected'))) = 0` |
| S08-C174 | `platform_payment_orders` | `—（多列状态机）` | `( status <> 'credited' or ( latest_receipt_ref is not null and wallet_operation_ref is not null and wallet_lot_ref is not null and provider_order_ref is not null ) )` | `WHERE (( status <> 'credited' or ( latest_receipt_ref is not null and wallet_operation_ref is not null and wallet_lot_ref is not null and provider_order_ref is not null ) )) = 0` |
| S08-C175 | `platform_payment_orders` | `amount_minor` | `(typeof(amount_minor) = 'integer' and amount_minor > 0)` | `WHERE ((typeof(amount_minor) = 'integer' and amount_minor > 0)) = 0` |
| S08-C176 | `platform_payment_orders` | `create_request_digest` | `(length(create_request_digest) = 64)` | `WHERE ((length(create_request_digest) = 64)) = 0` |
| S08-C177 | `platform_payment_orders` | `currency` | `(length(currency) = 3 and currency = upper(currency))` | `WHERE ((length(currency) = 3 and currency = upper(currency))) = 0` |
| S08-C178 | `platform_payment_orders` | `currency_exponent` | `(typeof(currency_exponent) = 'integer' and currency_exponent between 0 and 9)` | `WHERE ((typeof(currency_exponent) = 'integer' and currency_exponent between 0 and 9)) = 0` |
| S08-C179 | `platform_payment_orders` | `expected_paid_coin_units` | `(typeof(expected_paid_coin_units) = 'integer' and expected_paid_coin_units > 0)` | `WHERE ((typeof(expected_paid_coin_units) = 'integer' and expected_paid_coin_units > 0)) = 0` |
| S08-C180 | `platform_payment_orders` | `quote_digest` | `(length(quote_digest) = 64)` | `WHERE ((length(quote_digest) = 64)) = 0` |
| S08-C181 | `platform_payment_orders` | `quote_version` | `(typeof(quote_version) = 'integer' and quote_version > 0)` | `WHERE ((typeof(quote_version) = 'integer' and quote_version > 0)) = 0` |
| S08-C182 | `platform_payment_orders` | `status` | `( status in ( 'created', 'entry_ready', 'pending', 'payment_verified', 'credited', 'failed_no_charge', 'reconciliation_required', 'expired' ) )` | `WHERE (( status in ( 'created', 'entry_ready', 'pending', 'payment_verified', 'credited', 'failed_no_charge', 'reconciliation_required', 'expired' ) )) = 0` |
| S08-C183 | `platform_payment_orders_legacy_archive_20260803` | `amount_minor` | `(amount_minor > 0)` | `WHERE ((amount_minor > 0)) = 0` |
| S08-C184 | `platform_payment_orders_legacy_archive_20260803` | `channel` | `(channel in ('alipay', 'wxpay', 'qqpay', 'bank', 'jdpay'))` | `WHERE ((channel in ('alipay', 'wxpay', 'qqpay', 'bank', 'jdpay'))) = 0` |
| S08-C185 | `platform_payment_orders_legacy_archive_20260803` | `client_target` | `(client_target in ('clash', 'karing'))` | `WHERE ((client_target in ('clash', 'karing'))) = 0` |
| S08-C186 | `platform_payment_orders_legacy_archive_20260803` | `duration_days` | `(duration_days > 0)` | `WHERE ((duration_days > 0)) = 0` |
| S08-C187 | `platform_payment_orders_legacy_archive_20260803` | `plan` | `(plan in ('monthly_basic', 'monthly_plus', 'yearly'))` | `WHERE ((plan in ('monthly_basic', 'monthly_plus', 'yearly'))) = 0` |
| S08-C188 | `platform_payment_orders_legacy_archive_20260803` | `refund_amount_minor` | `(refund_amount_minor is null or refund_amount_minor >= 0)` | `WHERE ((refund_amount_minor is null or refund_amount_minor >= 0)) = 0` |
| S08-C189 | `platform_payment_orders_legacy_archive_20260803` | `refund_remaining_days` | `(refund_remaining_days is null or refund_remaining_days >= 0)` | `WHERE ((refund_remaining_days is null or refund_remaining_days >= 0)) = 0` |
| S08-C190 | `platform_payment_orders_legacy_archive_20260803` | `refund_status` | `(refund_status is null or refund_status in ('refund_requested', 'refund_approved', 'refund_pending_provider', 'refund_succeeded', 'refund_failed', 'refund_rejected'))` | `WHERE ((refund_status is null or refund_status in ('refund_requested', 'refund_approved', 'refund_pending_provider', 'refund_succeeded', 'refund_failed', 'refund_rejected'))) = 0` |
| S08-C191 | `platform_payment_orders_legacy_archive_20260803` | `status` | `(status in ( 'pending_payment', 'payment_amount_mismatch', 'payment_failed', 'paid_pending_admin_review', 'paid_access_delivered', 'paid_delivery_blocked' ))` | `WHERE ((status in ( 'pending_payment', 'payment_amount_mismatch', 'payment_failed', 'paid_pending_admin_review', 'paid_access_delivered', 'paid_delivery_blocked' ))) = 0` |
| S08-C192 | `platform_payment_receipts` | `—（多列状态机）` | `( ( next_action_type is null and next_action_url is null and next_action_expires_at is null ) or ( next_action_type is not null and next_action_url is not null and next_action_expires_at is not null ) )` | `WHERE (( ( next_action_type is null and next_action_url is null and next_action_expires_at is null ) or ( next_action_type is not null and next_action_url is not null and next_action_expires_at is not null ) )) = 0` |
| S08-C193 | `platform_payment_receipts` | `—（多列状态机）` | `( ( verification_result = 'not_applicable' and event_dedupe_key is null and merchant_scope_digest is null and payload_digest is null ) or ( verification_result = 'verified' and canonical_state = 'payment_succeeded' and provider_order_ref is not null and provider_capture_ref is not null and event_dedupe_key is not null and length(merchant_scope_digest) = 64 and length(payload_digest) = 64 ) )` | `WHERE (( ( verification_result = 'not_applicable' and event_dedupe_key is null and merchant_scope_digest is null and payload_digest is null ) or ( verification_result = 'verified' and canonical_state = 'payment_succeeded' and provider_order_ref is not null and provider_capture_ref is not null and event_dedupe_key is not null and length(merchant_scope_digest) = 64 and length(payload_digest) = 64 ) )) = 0` |
| S08-C194 | `platform_payment_receipts` | `amount_minor` | `(typeof(amount_minor) = 'integer' and amount_minor > 0)` | `WHERE ((typeof(amount_minor) = 'integer' and amount_minor > 0)) = 0` |
| S08-C195 | `platform_payment_receipts` | `canonical_state` | `( canonical_state in ( 'entry_ready', 'pending', 'payment_succeeded', 'failed_no_charge', 'reconciliation_required' ) )` | `WHERE (( canonical_state in ( 'entry_ready', 'pending', 'payment_succeeded', 'failed_no_charge', 'reconciliation_required' ) )) = 0` |
| S08-C196 | `platform_payment_receipts` | `charge_certainty` | `( charge_certainty in ( 'unknown', 'possibly_charged', 'confirmed_no_charge', 'confirmed_charged' ) )` | `WHERE (( charge_certainty in ( 'unknown', 'possibly_charged', 'confirmed_no_charge', 'confirmed_charged' ) )) = 0` |
| S08-C197 | `platform_payment_receipts` | `currency` | `(length(currency) = 3 and currency = upper(currency))` | `WHERE ((length(currency) = 3 and currency = upper(currency))) = 0` |
| S08-C198 | `platform_payment_receipts` | `currency_exponent` | `(typeof(currency_exponent) = 'integer' and currency_exponent between 0 and 9)` | `WHERE ((typeof(currency_exponent) = 'integer' and currency_exponent between 0 and 9)) = 0` |
| S08-C199 | `platform_payment_receipts` | `expected_paid_coin_units` | `(typeof(expected_paid_coin_units) = 'integer' and expected_paid_coin_units > 0)` | `WHERE ((typeof(expected_paid_coin_units) = 'integer' and expected_paid_coin_units > 0)) = 0` |
| S08-C200 | `platform_payment_receipts` | `next_action_type` | `( next_action_type is null or next_action_type in ('redirect', 'qr_code') )` | `WHERE (( next_action_type is null or next_action_type in ('redirect', 'qr_code') )) = 0` |
| S08-C201 | `platform_payment_receipts` | `receipt_type` | `(receipt_type in ('create', 'query', 'capture', 'callback'))` | `WHERE ((receipt_type in ('create', 'query', 'capture', 'callback'))) = 0` |
| S08-C202 | `platform_payment_receipts` | `verification_result` | `(verification_result in ('not_applicable', 'verified'))` | `WHERE ((verification_result in ('not_applicable', 'verified'))) = 0` |
| S08-C203 | `platform_portal_access_requests` | `client_target` | `(client_target in ('clash', 'karing'))` | `WHERE ((client_target in ('clash', 'karing'))) = 0` |
| S08-C204 | `platform_portal_access_requests` | `duration_days` | `(duration_days > 0)` | `WHERE ((duration_days > 0)) = 0` |
| S08-C205 | `platform_portal_access_requests` | `edge_lifecycle_mutation` | `(edge_lifecycle_mutation in (0, 1))` | `WHERE ((edge_lifecycle_mutation in (0, 1))) = 0` |
| S08-C206 | `platform_portal_access_requests` | `note_provided` | `(note_provided in (0, 1))` | `WHERE ((note_provided in (0, 1))) = 0` |
| S08-C207 | `platform_portal_access_requests` | `plan` | `(plan in ('trial', 'monthly', 'yearly'))` | `WHERE ((plan in ('trial', 'monthly', 'yearly'))) = 0` |
| S08-C208 | `platform_portal_access_requests` | `quantity` | `(quantity > 0)` | `WHERE ((quantity > 0)) = 0` |
| S08-C209 | `platform_portal_access_requests` | `status` | `(status in ( 'pending_admin_review', 'approved_pending_delivery', 'delivered', 'issued', 'rejected', 'disabled' ))` | `WHERE ((status in ( 'pending_admin_review', 'approved_pending_delivery', 'delivered', 'issued', 'rejected', 'disabled' ))) = 0` |
| S08-C210 | `platform_portal_edge_credentials` | `ordinal` | `(ordinal >= 0)` | `WHERE ((ordinal >= 0)) = 0` |
| S08-C211 | `platform_portal_entries` | `max_uses` | `(max_uses > 0)` | `WHERE ((max_uses > 0)) = 0` |
| S08-C212 | `platform_portal_entries` | `status` | `(status in ('active', 'used', 'revoked', 'expired'))` | `WHERE ((status in ('active', 'used', 'revoked', 'expired'))) = 0` |
| S08-C213 | `platform_portal_entries` | `use_count` | `(use_count >= 0)` | `WHERE ((use_count >= 0)) = 0` |
| S08-C214 | `platform_portal_registration_welcome_coin_grants` | `—（多列状态机）` | `( ( status = 'pending' and lease_token is null and lease_until is null and credited_lot_ref is null and credited_at is null ) or ( status = 'processing' and lease_token is not null and lease_until is not null and credited_lot_ref is null and credited_at is null ) or ( status = 'credited' and lease_token is null and lease_until is null and credited_lot_ref is not null and credited_at is not null ) or ( status in ('expired', 'reconciliation_required') and lease_token is null and lease_until is null and credited_lot_ref is null and credited_at is null ) )` | `WHERE (( ( status = 'pending' and lease_token is null and lease_until is null and credited_lot_ref is null and credited_at is null ) or ( status = 'processing' and lease_token is not null and lease_until is not null and credited_lot_ref is null and credited_at is null ) or ( status = 'credited' and lease_token is null and lease_until is null and credited_lot_ref is not null and credited_at is not null ) or ( status in ('expired', 'reconciliation_required') and lease_token is null and lease_until is null and credited_lot_ref is null and credited_at is null ) )) = 0` |
| S08-C215 | `platform_portal_registration_welcome_coin_grants` | `amount_units` | `(typeof(amount_units) = 'integer' and amount_units = 10)` | `WHERE ((typeof(amount_units) = 'integer' and amount_units = 10)) = 0` |
| S08-C216 | `platform_portal_registration_welcome_coin_grants` | `attempt_count` | `(typeof(attempt_count) = 'integer' and attempt_count >= 0)` | `WHERE ((typeof(attempt_count) = 'integer' and attempt_count >= 0)) = 0` |
| S08-C217 | `platform_portal_registration_welcome_coin_grants` | `coin_type` | `(coin_type = 'bonus_coins')` | `WHERE ((coin_type = 'bonus_coins')) = 0` |
| S08-C218 | `platform_portal_registration_welcome_coin_grants` | `expires_at` | `( typeof(expires_at) = 'text' and typeof(created_at) = 'text' and length(expires_at) = 24 and length(created_at) = 24 and expires_at glob '????-??-??T??:??:??.???Z' and created_at glob '????-??-??T??:??:??.???Z' and strftime('%Y-%m-%dT%H:%M:%fZ', expires_at) = expires_at and strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at and strftime( '%Y-%m-%dT%H:%M:%fZ', julianday(created_at) + 7 ) = expires_at )` | `WHERE (( typeof(expires_at) = 'text' and typeof(created_at) = 'text' and length(expires_at) = 24 and length(created_at) = 24 and expires_at glob '????-??-??T??:??:??.???Z' and created_at glob '????-??-??T??:??:??.???Z' and strftime('%Y-%m-%dT%H:%M:%fZ', expires_at) = expires_at and strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at and strftime( '%Y-%m-%dT%H:%M:%fZ', julianday(created_at) + 7 ) = expires_at )) = 0` |
| S08-C219 | `platform_portal_registration_welcome_coin_grants` | `lease_generation` | `(typeof(lease_generation) = 'integer' and lease_generation >= 0)` | `WHERE ((typeof(lease_generation) = 'integer' and lease_generation >= 0)) = 0` |
| S08-C220 | `platform_portal_registration_welcome_coin_grants` | `status` | `(status in ( 'pending', 'processing', 'credited', 'expired', 'reconciliation_required' ))` | `WHERE ((status in ( 'pending', 'processing', 'credited', 'expired', 'reconciliation_required' ))) = 0` |
| S08-C221 | `platform_portal_second_factor_challenges` | `failure_count` | `(failure_count >= 0)` | `WHERE ((failure_count >= 0)) = 0` |
| S08-C222 | `platform_portal_second_factor_challenges` | `status` | `(status in ('active', 'used', 'expired', 'locked'))` | `WHERE ((status in ('active', 'used', 'expired', 'locked'))) = 0` |
| S08-C223 | `platform_portal_sessions` | `status` | `(status in ('active', 'revoked', 'expired'))` | `WHERE ((status in ('active', 'revoked', 'expired'))) = 0` |
| S08-C224 | `platform_portal_totp_credentials` | `failure_count` | `(failure_count >= 0)` | `WHERE ((failure_count >= 0)) = 0` |
| S08-C225 | `platform_portal_totp_credentials` | `status` | `(status in ('active', 'revoked', 'locked'))` | `WHERE ((status in ('active', 'revoked', 'locked'))) = 0` |
| S08-C226 | `platform_referral_accruals` | `—（多列状态机）` | `(reversed_units <= reward_units)` | `WHERE ((reversed_units <= reward_units)) = 0` |
| S08-C227 | `platform_referral_accruals` | `refunded_paid_units` | `(typeof(refunded_paid_units)='integer' and refunded_paid_units >= 0)` | `WHERE ((typeof(refunded_paid_units)='integer' and refunded_paid_units >= 0)) = 0` |
| S08-C228 | `platform_referral_accruals` | `reversed_units` | `(typeof(reversed_units)='integer' and reversed_units >= 0)` | `WHERE ((typeof(reversed_units)='integer' and reversed_units >= 0)) = 0` |
| S08-C229 | `platform_referral_accruals` | `reward_units` | `(typeof(reward_units)='integer' and reward_units >= 0)` | `WHERE ((typeof(reward_units)='integer' and reward_units >= 0)) = 0` |
| S08-C230 | `platform_referral_accruals` | `risk_approved` | `(risk_approved in (0,1))` | `WHERE ((risk_approved in (0,1))) = 0` |
| S08-C231 | `platform_referral_accruals` | `status` | `(status in ('pending','available','reversed','reconciliation_required','policy_missing','excluded'))` | `WHERE ((status in ('pending','available','reversed','reconciliation_required','policy_missing','excluded'))) = 0` |
| S08-C232 | `platform_referral_bindings` | `—（多列状态机）` | `(referrer_id is null or referrer_id <> account_id)` | `WHERE ((referrer_id is null or referrer_id <> account_id)) = 0` |
| S08-C233 | `platform_referral_bindings` | `—（多列状态机）` | `((referrer_id is null) = (touch_digest is null))` | `WHERE (((referrer_id is null) = (touch_digest is null))) = 0` |
| S08-C234 | `platform_referral_origins` | `paid_units` | `(typeof(paid_units)='integer' and paid_units > 0)` | `WHERE ((typeof(paid_units)='integer' and paid_units > 0)) = 0` |
| S08-C235 | `platform_referral_policies` | `version` | `(version > 0)` | `WHERE ((version > 0)) = 0` |
| S08-C236 | `platform_referral_profiles` | `status` | `(status in ('active','disabled'))` | `WHERE ((status in ('active','disabled'))) = 0` |
| S08-C237 | `platform_referral_touches` | `expires_at` | `(expires_at > observed_at)` | `WHERE ((expires_at > observed_at)) = 0` |
| S08-C238 | `platform_scheduled_plan_switches` | `—（多列状态机）` | `(from_offer_version_ref <> to_offer_version_ref)` | `WHERE ((from_offer_version_ref <> to_offer_version_ref)) = 0` |
| S08-C239 | `platform_scheduled_plan_switches` | `—（多列状态机）` | `( ( status in ('scheduled', 'applying') and resolved_at is null and superseded_by_order_ref is null ) or ( status = 'applied' and resolved_at is not null and length(trim(resolved_at)) > 0 and superseded_by_order_ref is null ) or ( status = 'superseded' and resolved_at is not null and length(trim(resolved_at)) > 0 and superseded_by_order_ref is not null and length(trim(superseded_by_order_ref)) > 0 ) )` | `WHERE (( ( status in ('scheduled', 'applying') and resolved_at is null and superseded_by_order_ref is null ) or ( status = 'applied' and resolved_at is not null and length(trim(resolved_at)) > 0 and superseded_by_order_ref is null ) or ( status = 'superseded' and resolved_at is not null and length(trim(resolved_at)) > 0 and superseded_by_order_ref is not null and length(trim(superseded_by_order_ref)) > 0 ) )) = 0` |
| S08-C240 | `platform_scheduled_plan_switches` | `created_at` | `(length(trim(created_at)) > 0)` | `WHERE ((length(trim(created_at)) > 0)) = 0` |
| S08-C241 | `platform_scheduled_plan_switches` | `effective_at` | `(length(trim(effective_at)) > 0)` | `WHERE ((length(trim(effective_at)) > 0)) = 0` |
| S08-C242 | `platform_scheduled_plan_switches` | `entitlement_id` | `(length(trim(entitlement_id)) > 0)` | `WHERE ((length(trim(entitlement_id)) > 0)) = 0` |
| S08-C243 | `platform_scheduled_plan_switches` | `from_offer_version_ref` | `( length(trim(from_offer_version_ref)) > 0 )` | `WHERE (( length(trim(from_offer_version_ref)) > 0 )) = 0` |
| S08-C244 | `platform_scheduled_plan_switches` | `paid_units` | `( typeof(paid_units) = 'integer' and paid_units between 1 and 9007199254740991 )` | `WHERE (( typeof(paid_units) = 'integer' and paid_units between 1 and 9007199254740991 )) = 0` |
| S08-C245 | `platform_scheduled_plan_switches` | `status` | `( status in ('scheduled', 'applying', 'applied', 'superseded') )` | `WHERE (( status in ('scheduled', 'applying', 'applied', 'superseded') )) = 0` |
| S08-C246 | `platform_scheduled_plan_switches` | `to_offer_version_ref` | `( length(trim(to_offer_version_ref)) > 0 )` | `WHERE (( length(trim(to_offer_version_ref)) > 0 )) = 0` |
| S08-C247 | `platform_usage_counter_cursors` | `download_bytes` | `(download_bytes >= 0)` | `WHERE ((download_bytes >= 0)) = 0` |
| S08-C248 | `platform_usage_counter_cursors` | `epoch` | `(epoch >= 0)` | `WHERE ((epoch >= 0)) = 0` |
| S08-C249 | `platform_usage_counter_cursors` | `upload_bytes` | `(upload_bytes >= 0)` | `WHERE ((upload_bytes >= 0)) = 0` |
| S08-C250 | `platform_usage_rollups` | `download_bytes` | `(download_bytes >= 0)` | `WHERE ((download_bytes >= 0)) = 0` |
| S08-C251 | `platform_usage_rollups` | `total_bytes` | `(total_bytes >= 0)` | `WHERE ((total_bytes >= 0)) = 0` |
| S08-C252 | `platform_usage_rollups` | `upload_bytes` | `(upload_bytes >= 0)` | `WHERE ((upload_bytes >= 0)) = 0` |
| S08-C253 | `platform_usage_samples` | `download_bytes` | `(download_bytes >= 0)` | `WHERE ((download_bytes >= 0)) = 0` |
| S08-C254 | `platform_usage_samples` | `total_bytes` | `(total_bytes >= 0)` | `WHERE ((total_bytes >= 0)) = 0` |
| S08-C255 | `platform_usage_samples` | `upload_bytes` | `(upload_bytes >= 0)` | `WHERE ((upload_bytes >= 0)) = 0` |
| S08-C256 | `platform_wallet_first_deferred_checkout_quotes` | `—（多列状态机）` | `( ( flow_kind = 'initial_activation' and expected_entitlement_id is null and expected_request_id is null and expected_issued_link_id is null and expected_valid_until is null ) or ( flow_kind = 'scheduled_switch' and expected_entitlement_id is not null and expected_request_id is not null and expected_issued_link_id is not null and expected_valid_until is not null and scheduled_for = expected_valid_until ) )` | `WHERE (( ( flow_kind = 'initial_activation' and expected_entitlement_id is null and expected_request_id is null and expected_issued_link_id is null and expected_valid_until is null ) or ( flow_kind = 'scheduled_switch' and expected_entitlement_id is not null and expected_request_id is not null and expected_issued_link_id is not null and expected_valid_until is not null and scheduled_for = expected_valid_until ) )) = 0` |
| S08-C257 | `platform_wallet_first_deferred_checkout_quotes` | `—（多列状态机）` | `( ( purchase_availability = 'available' and shortfall_units = 0 ) or ( purchase_availability = 'insufficient_balance' and shortfall_units > 0 and json_array_length(allocation_json) = 0 and json(before_balance_json) = json(after_balance_json) ) )` | `WHERE (( ( purchase_availability = 'available' and shortfall_units = 0 ) or ( purchase_availability = 'insufficient_balance' and shortfall_units > 0 and json_array_length(allocation_json) = 0 and json(before_balance_json) = json(after_balance_json) ) )) = 0` |
| S08-C258 | `platform_wallet_first_deferred_checkout_quotes` | `—（多列状态机）` | `( ( status = 'active' and transition_ref is null and reserve_actor_scope is null and reserve_idempotency_key is null and reserve_actor_type is null and reserve_actor_ref is null and reserved_at is null ) or ( status = 'reserved' and transition_ref is not null and reserve_actor_scope is not null and reserve_idempotency_key is not null and reserve_actor_type is not null and reserve_actor_ref is not null and reserved_at is not null ) or ( status in ('expired', 'stale') and transition_ref is null and reserve_actor_scope is null and reserve_idempotency_key is null and reserve_actor_type is null and reserve_actor_ref is null and reserved_at is null ) )` | `WHERE (( ( status = 'active' and transition_ref is null and reserve_actor_scope is null and reserve_idempotency_key is null and reserve_actor_type is null and reserve_actor_ref is null and reserved_at is null ) or ( status = 'reserved' and transition_ref is not null and reserve_actor_scope is not null and reserve_idempotency_key is not null and reserve_actor_type is not null and reserve_actor_ref is not null and reserved_at is not null ) or ( status in ('expired', 'stale') and transition_ref is null and reserve_actor_scope is null and reserve_idempotency_key is null and reserve_actor_type is null and reserve_actor_ref is null and reserved_at is null ) )) = 0` |
| S08-C259 | `platform_wallet_first_deferred_checkout_quotes` | `after_balance_json` | `( json_valid(after_balance_json) and json_type(after_balance_json) = 'object' )` | `WHERE (( json_valid(after_balance_json) and json_type(after_balance_json) = 'object' )) = 0` |
| S08-C260 | `platform_wallet_first_deferred_checkout_quotes` | `allocation_json` | `( json_valid(allocation_json) and json_type(allocation_json) = 'array' )` | `WHERE (( json_valid(allocation_json) and json_type(allocation_json) = 'array' )) = 0` |
| S08-C261 | `platform_wallet_first_deferred_checkout_quotes` | `amount_units` | `( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )` | `WHERE (( typeof(amount_units) = 'integer' and amount_units between 1 and 9007199254740991 )) = 0` |
| S08-C262 | `platform_wallet_first_deferred_checkout_quotes` | `applied_discount_basis_points` | `( typeof(applied_discount_basis_points) = 'integer' and applied_discount_basis_points between 0 and 10000 )` | `WHERE (( typeof(applied_discount_basis_points) = 'integer' and applied_discount_basis_points between 0 and 10000 )) = 0` |
| S08-C263 | `platform_wallet_first_deferred_checkout_quotes` | `before_balance_json` | `( json_valid(before_balance_json) and json_type(before_balance_json) = 'object' )` | `WHERE (( json_valid(before_balance_json) and json_type(before_balance_json) = 'object' )) = 0` |
| S08-C264 | `platform_wallet_first_deferred_checkout_quotes` | `flow_kind` | `( flow_kind in ('initial_activation', 'scheduled_switch') )` | `WHERE (( flow_kind in ('initial_activation', 'scheduled_switch') )) = 0` |
| S08-C265 | `platform_wallet_first_deferred_checkout_quotes` | `offer_snapshot_json` | `( json_valid(offer_snapshot_json) and json_type(offer_snapshot_json) = 'object' )` | `WHERE (( json_valid(offer_snapshot_json) and json_type(offer_snapshot_json) = 'object' )) = 0` |
| S08-C266 | `platform_wallet_first_deferred_checkout_quotes` | `purchase_availability` | `( purchase_availability in ('available', 'insufficient_balance') )` | `WHERE (( purchase_availability in ('available', 'insufficient_balance') )) = 0` |
| S08-C267 | `platform_wallet_first_deferred_checkout_quotes` | `shortfall_units` | `( typeof(shortfall_units) = 'integer' and shortfall_units between 0 and 9007199254740991 )` | `WHERE (( typeof(shortfall_units) = 'integer' and shortfall_units between 0 and 9007199254740991 )) = 0` |
| S08-C268 | `platform_wallet_first_deferred_checkout_quotes` | `status` | `( status in ('active', 'reserved', 'expired', 'stale') )` | `WHERE (( status in ('active', 'reserved', 'expired', 'stale') )) = 0` |
| S08-C269 | `platform_wallet_first_deferred_checkout_quotes` | `wallet_version` | `( typeof(wallet_version) = 'integer' and wallet_version between 0 and 9007199254740991 )` | `WHERE (( typeof(wallet_version) = 'integer' and wallet_version between 0 and 9007199254740991 )) = 0` |
| S08-C270 | `platform_wallet_first_resource_effect_runtime_claims` | `—（多列状态机）` | `( ( status = 'claimed' and lease_generation > 0 and lease_token is not null and lease_until is not null and safe_code is null and recorded_at is null ) or ( status = 'recorded' and lease_token is null and lease_until is null and safe_code is null and recorded_at is not null ) or ( status = 'reconciliation_required' and lease_token is null and lease_until is null and safe_code is not null and recorded_at is null ) )` | `WHERE (( ( status = 'claimed' and lease_generation > 0 and lease_token is not null and lease_until is not null and safe_code is null and recorded_at is null ) or ( status = 'recorded' and lease_token is null and lease_until is null and safe_code is null and recorded_at is not null ) or ( status = 'reconciliation_required' and lease_token is null and lease_until is null and safe_code is not null and recorded_at is null ) )) = 0` |
| S08-C271 | `platform_wallet_first_resource_effect_runtime_claims` | `flow_kind` | `( flow_kind in ('initial_activation', 'scheduled_switch') )` | `WHERE (( flow_kind in ('initial_activation', 'scheduled_switch') )) = 0` |
| S08-C272 | `platform_wallet_first_resource_effect_runtime_claims` | `lease_generation` | `( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )` | `WHERE (( typeof(lease_generation) = 'integer' and lease_generation between 0 and 2147483647 )) = 0` |
| S08-C273 | `platform_wallet_first_resource_effect_runtime_claims` | `status` | `( status in ('claimed', 'recorded', 'reconciliation_required') )` | `WHERE (( status in ('claimed', 'recorded', 'reconciliation_required') )) = 0` |
| S08-C274 | `platform_wallet_first_setup_delivery_handoffs` | `—（多列状态机）` | `( length(handoff_ref) = 57 and handoff_ref glob 'wfxsetup_[0-9a-f]*' and handoff_ref not glob 'wfxsetup_*[^0-9a-f]*' )` | `WHERE (( length(handoff_ref) = 57 and handoff_ref glob 'wfxsetup_[0-9a-f]*' and handoff_ref not glob 'wfxsetup_*[^0-9a-f]*' )) = 0` |
| S08-C275 | `platform_wallet_first_setup_delivery_handoffs` | `—（多列状态机）` | `( idempotency_key_hash is null or ( length(idempotency_key_hash) = 64 and idempotency_key_hash not glob '*[^0-9a-f]*' ) )` | `WHERE (( idempotency_key_hash is null or ( length(idempotency_key_hash) = 64 and idempotency_key_hash not glob '*[^0-9a-f]*' ) )) = 0` |
| S08-C276 | `platform_wallet_first_setup_delivery_handoffs` | `—（多列状态机）` | `( session_binding_hash is null or ( length(session_binding_hash) = 64 and session_binding_hash not glob '*[^0-9a-f]*' ) )` | `WHERE (( session_binding_hash is null or ( length(session_binding_hash) = 64 and session_binding_hash not glob '*[^0-9a-f]*' ) )) = 0` |
| S08-C277 | `platform_wallet_first_setup_delivery_handoffs` | `—（多列状态机）` | `( ( status = 'pending' and claim_generation = 0 and idempotency_key_hash is null and session_binding_hash is null and lease_until is null and claimed_at is null and delivered_at is null and safe_code is null ) or ( status = 'claimed' and claim_generation > 0 and idempotency_key_hash is not null and session_binding_hash is not null and lease_until is not null and claimed_at is not null and delivered_at is null and safe_code is null ) or ( status = 'delivered' and claim_generation > 0 and idempotency_key_hash is not null and session_binding_hash is not null and lease_until is null and claimed_at is not null and delivered_at is not null and safe_code is null ) or ( status = 'reconciliation_required' and idempotency_key_hash is null and session_binding_hash is null and lease_until is null and claimed_at is null and delivered_at is null and safe_code is not null ) )` | `WHERE (( ( status = 'pending' and claim_generation = 0 and idempotency_key_hash is null and session_binding_hash is null and lease_until is null and claimed_at is null and delivered_at is null and safe_code is null ) or ( status = 'claimed' and claim_generation > 0 and idempotency_key_hash is not null and session_binding_hash is not null and lease_until is not null and claimed_at is not null and delivered_at is null and safe_code is null ) or ( status = 'delivered' and claim_generation > 0 and idempotency_key_hash is not null and session_binding_hash is not null and lease_until is null and claimed_at is not null and delivered_at is not null and safe_code is null ) or ( status = 'reconciliation_required' and idempotency_key_hash is null and session_binding_hash is null and lease_until is null and claimed_at is null and delivered_at is null and safe_code is not null ) )) = 0` |
| S08-C278 | `platform_wallet_first_setup_delivery_handoffs` | `claim_generation` | `( typeof(claim_generation) = 'integer' and claim_generation between 0 and 2147483647 )` | `WHERE (( typeof(claim_generation) = 'integer' and claim_generation between 0 and 2147483647 )) = 0` |
| S08-C279 | `platform_wallet_first_setup_delivery_handoffs` | `status` | `( status in ('pending', 'claimed', 'delivered', 'reconciliation_required') )` | `WHERE (( status in ('pending', 'claimed', 'delivered', 'reconciliation_required') )) = 0` |
| S08-C280 | `platform_portal_password_credentials` | `status` | `(status in ('active', 'revoked', 'locked'))` | `WHERE ((status in ('active', 'revoked', 'locked'))) = 0` |
| S08-C281 | `platform_portal_password_credentials` | `failure_count` | `(failure_count >= 0)` | `WHERE ((failure_count >= 0)) = 0` |
| S08-C282 | `platform_portal_password_credentials` | `must_rotate` | `(must_rotate in (0, 1))` | `WHERE ((must_rotate in (0, 1))) = 0` |
| S08-C283 | `platform_portal_passkey_credentials` | `sign_count` | `(sign_count >= 0)` | `WHERE ((sign_count >= 0)) = 0` |
| S08-C284 | `platform_portal_passkey_credentials` | `status` | `(status in ('active', 'revoked', 'locked'))` | `WHERE ((status in ('active', 'revoked', 'locked'))) = 0` |

## 附录 D · S-06 可执行 UNIQUE 列清单（32 列）

来源：V2.2 的 34 个 UNIQUE 列，排除 `platform_portal_passkey_credentials.credential_id` 与
`credential_id_hash`（只计数，见 §4 S-06）。其余 32 列逐项执行
`SELECT {列}, COUNT(*) AS c FROM {表} GROUP BY {列} HAVING c > 1 LIMIT 10;`。

- `platform_data_pack_resources`.`command_ref`
- `platform_data_pack_resources`.`request_ref`
- `platform_data_pack_resources`.`entitlement_ref`
- `platform_data_pack_edge_credentials`.`edge_credential_ref`
- `platform_usage_samples`.`sample_digest`
- `platform_portal_entries`.`token_hash`
- `platform_coin_wallets`.`account_id`
- `platform_coin_lots`.`credit_origin_ref`
- `platform_coin_credit_origins`.`lot_ref`
- `platform_coin_commerce_orders`.`quote_ref`
- `platform_coin_commerce_orders`.`hold_ref`
- `platform_coin_commerce_fulfillment_commands`.`order_ref`
- `platform_coin_commerce_initial_confirmations`.`command_ref`
- `platform_coin_commerce_initial_confirmations`.`order_ref`
- `platform_coin_commerce_initial_confirmations`.`effect_ref`
- `platform_coin_commerce_initial_confirmations`.`approval_sha256`
- `platform_coin_commerce_initial_confirmations`.`receipt_ref`
- `platform_referral_policies`.`effective_at`
- `platform_referral_profiles`.`code`
- `platform_referral_origins`.`lot_ref`
- `platform_referral_origins`.`payment_order_ref`
- `platform_referral_accruals`.`reward_lot_ref`
- `platform_deferred_resource_transitions`.`order_ref`
- `platform_deferred_resource_transitions`.`reservation_ref`
- `platform_deferred_resource_transition_rebases`.`effect_ref`
- `platform_wallet_first_deferred_checkout_quotes`.`deferred_order_ref`
- `platform_wallet_first_deferred_checkout_quotes`.`transition_ref`
- `platform_wallet_first_resource_effect_runtime_claims`.`effect_ref`
- `platform_wallet_first_setup_delivery_handoffs`.`effect_ref`
- `platform_portal_registration_welcome_coin_grants`.`account_id`
- `platform_portal_registration_welcome_coin_grants`.`source_ref`
- `platform_identity_deletion_jobs`.`request_id`

排除的 2 列只执行 §4 S-06 所列 4 条纯计数查询，不返回任何值、哈希或指纹。

---
*本申请 v2.3 状态：PENDING / NOT APPROVED / NO PRODUCTION AUTHORITY。未获 Yi 批准前，不得连接 BWH 生产数据库，不得执行本申请中的任何查询。基线 Master `11dd1cfb208b78a85ce77b8c8aef2b6763f9000a`。v2.2 原文件 SHA `e6ff346a4946c96dff7a26cc07a811450afd202ce98d3dd8a548c3bebc877851`，未改动；v2.1 原文件 SHA `6868607150ba7c0636e46dd4a76a21b1a07bffa8fba6aad775bb1fc84193983d`，未改动；v2 原文件 SHA `786e4ce886d8cdd2a62e70520c714543ac38829e3d82e71d8f87a01d2494d906`，未改动；v1 原文件 SHA `d47851aa400e17e34e7649ad543171710a6238430702c1f7aadc06778060e492`，未改动。*
