# #902 冲突 / Rebase 分析（Card 14，2026-11-21）

> 本文档只做分析与方案，不执行 rebase，不动 PR #902 本身。
> 核实基线：master `b1e46fef4e98bbfdace900a4e8b2d36a4284e176`（2026-11-21 `git ls-remote` + clone 后 `rev-parse` 一致）。

## 1. PR #902 现状（已核实）

| 项 | 值 |
|---|---|
| 状态 | OPEN / Draft |
| head | `6735f99425bb58a70493d39a83ee0de1d0463a25`（分支 `integration/stage2-dual-side-acceptance-20261120`） |
| 声明 base | `0aa46b35aba00eb134ab1cff4ffcc61ba4609e80`（分支 `feat/d1-stage2-offline-import-reconcile-20261120`，即 #899 分支头） |
| mergeable | `CONFLICTING`，mergeStateStatus `DIRTY` |
| 实际分叉点 | `11dd1cfb208b78a85ce77b8c8aef2b6763f9000a`（`fix(g2): override vulnerable transitive deps in probe lockfiles (#886)`）——`git merge-base master <902-head>` 的结果，**不是**声明的 base `0aa46b35` |

## 2. 为什么冲突：栈已合并，但 SHA 不同

#902 的 head 包含一整条栈（Stage 1B → Stage 2 source → #899 target → #900 → 两次验收提交）。
这条栈的内容已经通过 **squash 合并**进了 master，提交号全部变了：

| 原 PR | master 中的 squash 提交 |
|---|---|
| #899（合成离线导入 + delta replay） | `707d0cde` |
| #896（BWH writer authority + agent epoch） | `5f04020c` |
| #900（BWH source export + delta 证据） | `0947a4a9` |
| #898（Stage 2A 离线 checkpointed 迁移落点） | `b1e46fef`（当前 master head） |

同一内容以两套 SHA 存在，naive merge（`git merge-tree master <902-head>`）因此在
**27 个文件**上冲突：**6 个 content 冲突 + 21 个 add/add 冲突**。

content 冲突（6）：

- `agent/g4/agent-client.mjs`
- `server/services/platform/coin-commerce-store.mjs`
- `server/services/platform/subscription-control-db.mjs`
- `workers/control-plane/src/agent-protocol.mjs`
- `workers/control-plane/test/helpers.mjs`
- `workers/control-plane/test/migration.test.mjs`

add/add 冲突（21）：

- `docs/D1_STAGE1A_SINGLE_WRITER_EPOCH_CONTRACT_V1.md`
- `docs/D1_STAGE1B_AGENT_EPOCH_MUSE_HANDOFF_V1.md`
- `docs/D1_STAGE1B_BWH_WRITE_INVENTORY_V1.md`
- `docs/D1_STAGE2A_B_SYNTHETIC_REHEARSAL_RECEIPT_20261120.md`
- `docs/D1_STAGE2A_E4_SCHEMA_DIFF_20261120.md`
- `docs/D1_STAGE2_BWH_EXPORT_MUSE_HANDOFF_V1.md`
- `server/services/platform/single-writer-authority.mjs`
- `server/services/platform/source-delta.mjs`
- `server/services/platform/writer-freeze-receipt.mjs`
- `server/tests/d1-stage1b-agent-epoch-transport.test.mjs`
- `server/tests/d1-stage1b-bwh-authority.test.mjs`
- `server/tests/d1-stage1b-bwh-wiring.test.mjs`
- `server/tests/d1-stage2-bwh-credential-freeze.test.mjs`
- `server/tests/d1-stage2-bwh-export.test.mjs`
- `tools/d1-stage2/offline-delta-replay.mjs`
- `workers/control-plane/staging-sql/README.md`
- `workers/control-plane/staging-sql/authority-guard-v1.sql`
- `workers/control-plane/test/epoch-fenced-agent.test.mjs`
- `workers/control-plane/test/stage2-offline-delta.test.mjs`
- `workers/control-plane/test/staging-authority-ddl.test.mjs`
- `workers/control-plane/test/writer-authority.test.mjs`

结论：这 27 处没有一条是“两边各改了同一行、需要人工取舍”的真实语义冲突，
全部是“同一内容以不同 SHA 重复出现”。逐个解冲突是错误做法——正确做法是丢掉整条栈。

## 3. 差异分解：#902 真正的新内容只有 101 行

- `902-head = 77e82a52 + 6735f994`。
- `77e82a52` 是 merge 提交（“assemble reviewed PR #899 target + PR #900 BWH source into isolated acceptance branch”），
  它装配的内容已全部在 master（见 §2 的 squash 对应表）。
- `6735f994`（“identify exact BWH→D1 metadata, plan, status and credential mapping blockers”）
  是唯一净新增：新增 `workers/control-plane/test/stage2-bwh-d1-wire-acceptance.test.mjs` 一个文件，101 行。
- `git diff --stat 77e82a52 master`：41 个文件，`+2143 / -364`。
  `+2143` 是 master 独有的 #898 内容与评审增量；`-364` 是 #902 分支上的旧版内容，
  rebase 时**绝不能恢复**（那是 #898 评审前版本）。
- `git diff --stat master 902-head`：42 个文件，`+465 / -2143`。`+465 = 101 行新测试 + 364 行旧版内容`。

## 4. 最小 rebase 方案（只写方案，本卡不执行）

1. 新分支从当前 master 起：`git checkout -b <rebase-902> b1e46fef4e98bbfdace900a4e8b2d36a4284e176`。
2. **不 replay 栈提交**：从分叉点 `11dd1cfb` 到 `77e82a52` 的全部提交都已通过 squash 合并进 master，
   一个也不许 cherry-pick / rebase 回来。
3. **不 cherry-pick `77e82a52`**：它是 merge 提交，内容已在 master。
4. 只接 `6735f994` 一个提交的内容（即新增的验收测试文件）。已只读验证：
   `git show 6735f994 | git apply --check` 在 master 上**干净通过**（未改任何分支状态）。
5. **接过来的测试必须用 Card 14 改写版**，不能用 `6735f994` 原文：
   原文的 S2-WIRE-1/S2-WIRE-2 断言的是旧 loader 合同（loader 要求 `metadata_json`、
   手动补 `"{}"` 能通过）；Card 14 已改 loader 合同（不再要求该列、带该列即拒绝），
   原文在这两个断言上会在新 loader 下失败。改写版在本分支：
   `workers/control-plane/test/stage2-bwh-d1-wire-acceptance.test.mjs`。
6. 最终 base 建议：**当前 master `b1e46fef4e98bbfdace900a4e8b2d36a4284e176`**。
   不要以 `0aa46b35` 为 base（那是已被 squash 合并的旧分支头，不是 master 上的点）。

## 5. 粗暴 rebase 会丢的东西（红线）

以下文件只在 master 有、#902 head 没有（c2-worker-config-policy 行除外，见该行备注）；任何把 #902 head 内容整体搬过来的做法都会删掉它们（c2 行则会回退 master 新增的 101 行）：

| 文件 | 行数 | 来源 |
|---|---|---|
| `workers/control-plane/test/support/stage2-offline-migration.mjs` | 200 | #898 |
| `workers/control-plane/test/stage2-offline-migration.test.mjs` | 320 | #898 |
| `workers/control-plane/test/support/stage2-synthetic-source.mjs` | 71 | #898 |
| `workers/control-plane/test/fixtures/stage2-offline-inbox.sql` | 90 | #898 |
| `workers/control-plane/wrangler.staging.jsonc` | 21 | #893（dfcd0d21） |
| `docs/D1_STAGE2_BWH_EXPORT_D1_RECONCILIATION_HANDOFF_V1.md` | 142 | #898 评审增量 |
| `docs/D1_STAGE2_E4_SCHEMA_DIFF_20261120.md` | 155 | #898 评审增量 |
| `server/tests/d1-stage1b-source-delta-keys.test.mjs` | 65 | #896（5f04020c） |
| `tools/c2-worker-config-policy/`（check.mjs + check.test.mjs + policy.json） | 910（master 合计 313+466+131；902-head 已有旧版 301/412/100，master 新版相对新增 101 行、删除 4 行） | #893（dfcd0d21） |
| `workers/control-plane/STAGING_RELEASE.md` | 77 | #893（dfcd0d21） |

另：不要动 PR #902 本身（不改它的分支、不 rebase 它、不推它）。本卡的 rebase 工作到此为止，
只输出方案；实际 rebase 与 #902 的后续由协调员 / Yi 定夺。

## 6. Card 14 修复与本方案的关系

本分支（`feat/d1-902-wire-failclosed-20261121`）只做四项 wire 不兼容的 fail-closed 修复，
不替 #902 执行 rebase。修复落点与证据见实现报告
`CARD14_902_WIRE_FAILCLOSED_IMPLEMENTATION_2026-11-21.md`。
上述第 5 步提到的改写版验收测试即本分支新增的同名测试文件。
