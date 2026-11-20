# D1 Stage 2 — BWH 源端导出与增量同步清单 V1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_stage2_bwh_export_inventory
  superseded_by: null
  last_verified_at: 2026-11-20
  production_authority: false
```

> 任务书：`docs/D1_STAGE2_BWH_EXPORT_MUSE_HANDOFF_V1.md`（对方 PR #899 分支）。
> 基线：PR #896 exact head `015fae70c47bb29534bc1c9b5fae15d5d2ea020b`
> （1B 单写权威 + 冻结收据 + 源增量）。本轮在该基线上继续，不重做 1B。
> 本文档只记录源端离线实现；联合验收（冻结、Epoch 失效、事务竞争、
> Staging/E4 联调）是下一轮，不在本轮做。

## 1. 范围与边界

- 只做离线分支 + Draft PR；只用合成 fixture（`s2s-` 前缀）；绝不动生产 BWH、
  绝不碰 E4、绝不激活 D1_ACTIVE、不标 Ready、不合并。
- 不把对方的 Miniflare 数字当作自己的证据。本轮在 PR #899 exact head
  `019c3d0d` 上本地独立跑出：Worker slice 测试 **178/178 通过、0 失败**，
  C2 policy 测试 **30/30 通过、0 失败**（`C2_POLICY_CHECK: PASS`）。
  这是本轮自己跑出的数字，不是转述对方回执的 178/178（回执的 run #177
  在 head `ce60478d`，文档提交之前）。
- T2 字段去向仍是提案、未获批准：本文档和代码中的一切字段映射都以
  “待 owner 批准的候选”口径呈现，不写成已批准。

## 2. 交付物

| 文件 | 任务 | 内容 |
|---|---|---|
| `server/services/platform/d1-stage2-source-manifest.mjs` | 1 | 合成 WAL 快照构建与核验（snapshot hash 即身份） |
| `server/services/platform/d1-stage2-source-export.mjs` | 2、3、4 | 安全导出批次（keyset 分页）+ 增量清单（HWM + tombstone） |
| `server/services/platform/d1-stage2-credential-reconciliation.mjs` | 5 | U-F18 凭据-only 对账（触发器维护的不透明版本） |
| `server/services/platform/d1-stage2-freeze-drain.mjs` | 6 | 冻结执行与排空（四份独立 positive receipt + 覆盖报告） |
| `server/tests/d1-stage2-bwh-export.test.mjs` | 1–4、7 | 23 个测试 |
| `server/tests/d1-stage2-bwh-credential-freeze.test.mjs` | 5–7 | 16 个测试 |
| 本文档 | — | 清单与诚实口径 |

1B 模块复用（不重写）：`single-writer-authority.mjs`（权威记录）、
`writer-freeze-receipt.mjs`（写锁收据）、`source-delta.mjs`
（checkpoint 指纹 diff）。本分支的前两个提交是 PR #896 的 1B 提交原样
cherry-pick（`403cc669` + `763fb979`，树与 `015fae70` 一致）；阶段 2
自己的工作在之后的提交里。

## 3. 任务 1 — 清单与源身份

`buildSyntheticSourceSnapshot({ dbPath, snapshotId, now })` 产出：

- **sourceSnapshotId**（`s2s-` 格式校验）、**sourceCommit**
  `be261abc60f28bb2733764fa5364ab44b3e76844`（取自
  `docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json`，即 pinned commit）、
  **schema digest**（`sqlite_master` 全部对象 SQL 的 SHA-256）、
  **migration ledger digest**（19 个迁移 ID/checksum 逐项对
  `SOURCE_MIGRATION_REGISTRY` 核验，`validateD1SourceMigrationChecksums`
  必须 valid）、**mapping version** `stage2-candidate-v1`、
  **snapshot hash**（上述全部 + authority/epoch + 表行 digest 的规范 JSON
  SHA-256）、**authority + epoch**（BWH_ACTIVE / 1，从权威记录读回）、
  **expected table list**（70 张，来自 inventory JSON）。
- `verifySyntheticSourceSnapshot(db, metadata)` 逐项重算比对；快照内容
  被改后核验失败（行 digest、账本 digest、schema digest、权威记录、
  表 disposition 各有独立错误码）。Snapshot hash 是身份，不是装饰。
- **诚实口径**：快照只物化演练子集 4 张表（`platform_accounts` 3 行、
  `platform_entitlements` 4 行、`platform_portal_edge_credentials` 3 行、
  `platform_schema_migrations` 19 行）+ 权威表 + 凭据版本表；70 张
  expected 表中有 **66 张未物化**，元数据如实记录为 missing，不把
  演练快照说成全源快照。历史 70/820 是 pinned commit 的候选数，
  不是实际生产观测数。
- 凭据表 DDL 省略了到 `platform_portal_access_requests` 的 REFERENCES
  子句（父表未在演练子集里物化）；列、类型、PK、CHECK 与
  `subscription-control-db.mjs` 逐字一致。`edge_material_digest`
  的 fixture 值是合成 ref 的确定性 `sha256:` 摘要，不是真实材料。
- 两次独立构建的快照 digest 完全相同（测试 S2S-MAN-5）。

## 4. 任务 2 — 安全导出批次

- 只选 disposition 为 KEEP 的列；CONDITIONAL 列在合同存在之前不导出
  （`metadata_json` 是 CONDITIONAL，待 M1-02 allowlist，当前不导出）；
  DEFER 列永不选；未列入映射的列默认 DEFER。SQL 本身只选批准列，
  另有值扫描作纵深防御（密钥形字符串、`sha256:` 摘要一律拒绝）。
- 分页是 keyset（`PK > 上一页末 PK`，复合 PK 用行值比较），不用 naive
  OFFSET。每页身份：表、完整 PK 元组、起止 PK、行数、批准列清单、
  字节长度、规范内容 hash、continuation token（可从断点精确续跑）。
- 批次上限 20 行（Stage 2A 演练的 D1 批次界限，是演练常量，不是
  实测 D1 上限）。
- 演练子集的候选映射（待 owner 批准）：accounts 6 列中 5 KEEP +
  `metadata_json` CONDITIONAL；entitlements 11 列全 KEEP；
  credentials 5 列中 3 KEEP + `edge_credential_ref` /
  `edge_material_digest` DEFER；migrations 3 列全 KEEP。

## 5. 任务 3 — 敏感字段排除

- 导出物里绝不含原始 email/PII、密码或 TOTP 密钥、原始 edge 凭据材料、
  支付 checkout URL/QR 能力、第三方订阅数据、留存凭据 blob。
  演练子集中只有凭据列属于此类，均已 DEFER。
- 低熵 PII 的 plain SHA-256 不算匿名化：本轮不把任何 PII 值哈希后
  塞进 payload 来代替排除。
- 仓库、fixture、日志、payload 回执里一律没有真实 HMAC/加密密钥材料。

## 6. 任务 4 — 删除 / 增量清单

- 自 durable、有序的 high-water mark（`{ seq, snapshotId }`）起发
  insert/update/delete；删除带 tombstone（checkpoint 指纹）。
  Manifest 序列由清单自身签发（`seq = 上一 seq + 1`）；缺口即错误
  （`export_manifest_gap`），不静默跳过。
- 单 PK 表的 diff 来自 1B checkpoint 指纹；凭据表由版本清单 diff
  覆盖（见 §7）。指纹-only diff 没有保证的源事务顺序——两次更新
  在 checkpoint 之间只剩一次 delta（测试 S2S-INC-3 证明了这一点），
  本轮绝不把它说成 live CDC。
- 应用顺序：insert/update 按 FK 父先子后（accounts → entitlements →
  migrations → credentials），delete 反向。未列入顺序表的表 fail
  closed，不猜顺序。

## 7. 任务 5 — U-F18 凭据-only 对账（cutover blocker）

问题：`platform_portal_edge_credentials` 无 `updated_at`，1B 指纹
刻意排除凭据列；同行数凭据轮换不产生 delta、不产生冻结收据信号。

实现（`d1-stage2-credential-reconciliation.mjs`）：

- 触发器维护的不透明版本：`platform_credential_versions` 表
  （`credential_pk` = `request_id|edge_channel_ref`，`version`、
  `deleted`、origin `tracked`/`backfilled`、`updated_at`）+ 三个
  AFTER 触发器（INSERT/UPDATE/DELETE 各 bump 一次；删除留
  tombstone；重插续版本不重置）。
- 版本清单只含（pk, version, deleted, origin）+ SHA-256 digest；
  不含凭据值字节、不含 `edge_material_digest`、不含 updated_at。
  两个凭据值不同但 PK/版本相同的库，digest 完全相同
  （测试 S2S-CRED-7）。
- `edge_material_digest` 为什么不用作信号：它是密钥材料的 `sha256:`
  摘要；没有一条轮换路径被证明每次都会更新它（不能当检测器），
  而且把它导出等于让持有者可以对低熵材料验猜（不能当出口）。
  因此它在一切导出指纹和 digest 里都被排除，和凭据列一样。
- 追踪前已存在的行 backfill 为 version 1、origin `backfilled`，
  清单报告 `backfilledCount`——追踪前的轮换不可见，清单把这个
  弱基线标出来，不藏起来。
- Fail closed：活行无版本条目（`credential_version_untracked`）、
  版本条目无活行且未 tombstone（`credential_version_orphaned`）、
  digest/hash/计数任一不符（`credential_manifest_invalid`）都报错。
- **状态：仍是 cutover blocker。** 本轮只实现了源端检测器，未经
  独立复审；不声称源/目标对等。触发器装到生产库是另外的、有门禁的
  schema 变更，本轮没做。

## 8. 任务 6 — 冻结执行与排空

一次 BEGIN IMMEDIATE 读只证明该读期间无并发写锁。本轮建四份
**独立的** positive receipt，缺一不可，合成一个 bundle；bundle
明确 `phaseTransition: "none"`——它永不切换 phase，FROZEN 切换是
另外的协调员决策：

1. **write-lock**：复用 1B `buildFreezeReceipt`（BEGIN IMMEDIATE 内读
   权威行 + high-water mark；并发写锁持有时拒绝，测试 S2S-FRZ-1）。
   它不证明下面三项，收据上写明了。
2. **scheduler-quiescence**：1B 清单 §7 的全部 11 项（W-111…W-120 +
   metering）逐项要 positive 证据；缺一项或一项为 false 即失败。
   本收据不独立观测生产 scheduler。
3. **callback-drain**：全部 outstanding 回调 settled；按 id 去重；
   同一 id 状态冲突即错误。
4. **hwm-completeness**：durable HWM 的 seq 必须等于最新增量清单
   的 seq，行数必须记录；不符即 gap。
- 覆盖报告：1B 清单 §15.2/§12 的基线共 **28 项**（U-F1…U-F18 +
  U-01…U-10），当前 **28 项全 open**（fenced 0）。U-F18 的备注指向
  本轮的检测器，但状态仍是 open（待独立复审）。

## 9. 任务 7 — 崩溃与完整性测试

新增测试 43 个，全部通过（见 §10）。覆盖的情形：

- 跨连接 WAL 读写（未提交写对读者不可见、提交后可见、
  `wal_checkpoint(TRUNCATE)` 正常）。
- 页间崩溃导出：只凭 continuation token 续跑，无丢失、无重复。
- checkpoint 后同一 PK 被改：导出反映新状态，checkpoint 指纹过期
  （显式断言两者不一致）。
- 缺表/删表：导出与增量清单都 fail closed。
- 静默凭据-only 变更：指纹看不见、版本清单看得见（§7）。
- 重复/重排回调：按 id 去重，顺序无关；冲突状态报错。
- 受 D1 限制的大批次：上限 20，每页有界。
- FK 父先子后与反向删除顺序：源端 DDL 是 ON DELETE CASCADE
  （删父自动删子，测试证实）；清单的 delete 顺序仍是子先父后，
  供 D1 端 RESTRICT 外键使用。
- 带未批准列的恶意 manifest：带未批准列的页被拒（CONDITIONAL
  的 `metadata_json` 与 DEFER 的 `edge_credential_ref` 各一例，
  均为 hash 自洽的走私页；excludedColumns 与映射不符也被拒）；
  未映射表拒绝导出；篡改过的页 hash 不符；篡改过的 checkpoint
  导致相关行被报为 update（强制复查，不静默接受）；幻影 PK
  被报为 delete。

## 10. 测试证据（本轮实际跑出的数字）

- 新增测试：**43/43 通过、0 失败**
  （`d1-stage2-bwh-export.test.mjs` 27 个 +
  `d1-stage2-bwh-credential-freeze.test.mjs` 16 个，
  Node v22.23.1，`node --test`）。
- 全量 `npm test`（本轮分支，Node v22.23.1）：主套件 **7491 个测试、
  7485 通过、0 失败、6 跳过**；C2 policy **30/30 通过**，
  `C2_POLICY_CHECK: PASS`。第一轮 7480 通过 / 1 失败（新文档缺
  `document_metadata`，已修），修后重跑 0 失败。
- 复审第二轮（CHANGES REQUESTED）修复后重跑：新增 4 个测试
  （S2S-EXP-7/8/9 走私列与 excludedColumns、S2S-MAN-8 行数
  重算），全量 0 失败；新测试文件 43/43 通过。
- PR #899 exact head `019c3d0d` 本地独立复核：Worker slice
  **178/178、0 失败**；C2 policy **30/30、0 失败**。

## 11. 仍 open 的项（原样保留，不写成已关闭）

- U-F1…U-F18、U-01…U-10：28 项全 open（§8 覆盖报告）；U-F18
  的检测器已实现但未经独立复审，仍是 cutover blocker。
- T2 字段去向（C-2/C-3 相关）：候选映射待 owner 批准；M1-02
  `metadata_json` allowlist 待定；全量 70 表的 T2 映射不在本轮。
- 上游待定项原样保留：T2/C-2/C-3/N-1/N-2/22/23、G-9、S-1～S-4
  阶梯切换、回滚演练窗口与验收标准、装载批准。
- 联合验收是下一轮：冻结、Epoch 失效、事务竞争、Staging/E4
  联调、真实业务写入联调——本轮不做、不声称。
- 演练快照只覆盖 4/70 张表；全源快照需要 T2 批准的表清单与
  生产 DDL，离线没有。
- 凭据版本触发器装到生产库是 schema 变更，需另外的门禁与批准。
