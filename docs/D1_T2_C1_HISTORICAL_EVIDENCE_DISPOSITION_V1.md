# D1 T2 C1 历史证据逐项处置清单 v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_t2_c1_historical_evidence_disposition
  superseded_by: null
  last_verified_at: 2026-11-13
  production_authority: false
```

> **Status:** M1 合同 G-09 的附件（Yi 2026-11-13 裁决，ACCEPTED）。本清单只给历史证据逐项定归属，不批准任何代码、迁移、部署或生产动作；不是正式验收。
> **核验基线：** master `f7480630`（PR #868 合并后，2026-11-14T04:17:39Z）。
> **生产权限：** BWH 仍是唯一生产写方。

## 规则

分类只取以下三者（v0.4 §2 C-09）：

| 分类 | 含义 |
| --- | --- |
| 已核实属于固定 SHA | 已在固定 SHA 锚点核实，可作为该锚点的证据引用 |
| 历史材料、待重核 | 历史件，尚未在当前基线逐项重核；不得作为当前基线证据引用 |
| 已有明确处置决定 | 已有决定（修复、关闭或本清单内的修正），写明决定与落点 |

没有归属的历史结论不得进入正式验收。归属冲突时挂起，不得自动继承。候选 HEAD 的结果不得当成 Master 的测试结果。

## 清单

| Evidence ID | Source | SHA | Classification | Decision | Reviewer | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| H-01 | `server/services/platform/portal-registration.mjs`（审计行 210–237、285–333：email 归一化、SHA-256 查找 digest、loginRef/displayRef 写原始 email） | 审计锚点 `df3a67dc61f94f4d4c14043b3fbf49418d419b39`；`f7480630` 下同一 blob，验证一致 | 已核实属于固定 SHA | 保留为锚点历史证据；注册路径未被 B2 批次改动，描述仍成立 | D1 T2 source audit 2026-11-10；本批次复核 Muse（`f7480630`） | `D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md` §2、§3.1；本批次 `git hash-object` 比对 |
| H-02 | `server/services/platform/subscription-control-db.mjs`（审计行 466–477、2083–2124、8585–8624、8625–8670：登录元数据字段、精确 ID/唯一 email 解析、TOTP 状态查找、密码凭据持久化） | 审计锚点 `bc6694a93f452f97393ff6f1a8099e854c0b19ac`；`f7480630` 下为 `0fb32348ebe2b211c22a5e7c62d8441cdd8a2495`，已变化 | 历史材料、待重核 | 文件自锚点后已变（B2-2 在 `44cc65ae` 加入 `platform_identity_bindings` 表与 `identityBindingRepository` 访问器）；引用行号须在 `f7480630` 下重读后方可继续引用。B2-2 未改登录本身（范围 S），但这不是对引用行号的重核 | 待指定（重核责任人）；本批次记录 Muse | `D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md` §2、§3.2、§4；PR #867 |
| H-03 | `server/services/platform/user-portal-auth.mjs`（审计行 349–361、419–437、645–690：公开会话身份、登录解析、密码验证与第二因子挑战） | 审计锚点 `f9e4e7036b079a63092898a15948424b074a067a`；`f7480630` 下同一 blob，验证一致 | 已核实属于固定 SHA | 保留为锚点历史证据 | D1 T2 source audit 2026-11-10；本批次复核 Muse（`f7480630`） | `D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md` §2、§3.3；本批次 `git hash-object` 比对 |
| H-04 | `server/services/platform/portal-password-credentials.mjs`（审计行 118–205：密码 hash 创建、验证、失败计数与锁定） | 审计锚点 `ca9a5f201487f89202aff60e01f504c1622b4c28`；`f7480630` 下同一 blob，验证一致 | 已核实属于固定 SHA | 保留为锚点历史证据 | D1 T2 source audit 2026-11-10；本批次复核 Muse（`f7480630`） | `D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md` §2、§4；本批次 `git hash-object` 比对 |
| H-05 | `server/services/platform/portal-totp-verifier.mjs`（审计行 7–10、61–110、112–128、171–193：AES-256-GCM protector、无 key ID 信封、`enc:` 旧值处理、TOTP 验证） | 审计锚点 `f093ed7693e829bb40d93e15f0dce09ca689ce60`；`f7480630` 下同一 blob，验证一致 | 已核实属于固定 SHA | 保留为锚点历史证据 | D1 T2 source audit 2026-11-10；本批次复核 Muse（`f7480630`） | `D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md` §2、§5；本批次 `git hash-object` 比对 |
| H-06 | `server/state.mjs`（审计行 695–707、2446–2464、2479–2505：环境 key 绑定、Portal/Admin 共用 TOTP protector、条件密码服务接线） | 审计锚点 `da3ddbe459d44d75e80cb196b2454ebbd6f3212c`；`f7480630` 下为 `fd52ede2554c5a2d73cc528965bdcf61ddbdaa4c`，已变化 | 历史材料、待重核 | 文件自锚点后已变；引用行号须重读。其中一个子结论已单独再确认：Portal/Admin 共用 protector（同一 `USER_PORTAL_TOTP_SECRET_KEY` 实例传给两个 verifier，`state.mjs:2454`）在 `44cc65ae` 的 B2-3-S 代码盘点中再次确认；该确认只覆盖这一个子结论，不覆盖整行 | 待指定（重核责任人）；本批次记录 Muse | `D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md` §2、§5.1；B2-3-S 代码盘点 |
| H-07 | `server/routes/admin-platform.mjs`（审计行 84–106、302–326：Admin email 搜索 digest 与显示字段投影） | 审计锚点 `0189b8b5b9bd06f66121caef65b2ec397d49d491`；`f7480630` 下同一 blob，验证一致 | 已核实属于固定 SHA | 保留为锚点历史证据 | D1 T2 source audit 2026-11-10；本批次复核 Muse（`f7480630`） | `D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md` §2、§3.3；本批次 `git hash-object` 比对 |
| H-08 | Issue #841 评论 2026-11-08「Progress update」（PR #845：组合聚焦回归 86/86 两次、`node --check` 15/15；C1-A04 owner 提案；Wallet-first 域分离 SHA-256 v1 digest 审计；Portal setup `Math.random()` 回退移除；Wallet-first 边界强制 UUIDv4；C1-A04 与 C2 Wallet-first 保留仍 OPEN） | 无 blob（Issue 评论）；PR #845 head `00c5d5e8`，仍为 Draft | 历史材料、待重核 | 分支证据，非 master 证据。本批次在 `f7480630` 下核实：C1-A04 全仓零命中；#845 仍为 open Draft；UUID 生成式 ref 工厂在 master 中存在（`coin-wallet-store.mjs`、`wallet-first-deferred-checkout-adapter.mjs`），但“边界强制”未核实；`server/services/platform/*.mjs` 中无 `Math.random` 命中。逐项声明重核后方可作为当前证据引用 | 待指定；本批次记录 Muse | Issue #841 评论；PR #845 |
| H-09 | Issue #841 评论 2026-11-08「C3 / G6 offline progress」（PR #846：元数据写边界、`projectAccountMetadataForD1()`、SQLite 控制库 45/45 两次、JSON+支付托管+密钥托管+清单 48/48 两次、JS 语法 9/9、清单验证器 PASS：70 表、820 列、126 FK、88 索引、91 触发器、19 迁移） | 无 blob（Issue 评论）；PR #846 已合入 G6 分支，后经 #859 进入 master | 历史材料、待重核 | 部分核实：`projectAccountMetadataForD1()` 在 `f7480630` 下存在（`server/services/platform/control-json-contracts.mjs:130`，有对应测试）；运行数字（45/45、48/48、9/9）是 #846 分支证据，本批次未重跑 | 待指定；本批次记录 Muse | Issue #841 评论；PR #846 |
| H-10 | Issue #841 评论 2026-11-08「26-field JSON review completed」（PR #847：24 个活跃 JSON 字段已映射、2 个 passkey 凭据字段明确 DEFERRED、五组套件每遍 290 例、580 次执行、0 跳过） | 无 blob（Issue 评论）；PR #847 为文档/证据子项 | 历史材料、待重核 | 成果物在 master 中存在：`docs/D1_T2_C3_ACCOUNT_METADATA_26_FIELD_DISPOSITION_AUDIT_V1.md` 与 `docs/D1_T2_C3_JSON_26_FIELD_WRITER_REVIEW_V1.md` 均在 `f7480630` 下在位；套件数字是 #847 分支证据，本批次未重跑 | 待指定；本批次记录 Muse | Issue #841 评论；PR #847 |
| H-11 | Issue #841 评论 2026-11-08「Continued progress — follow-up」（PR #846：G6 离线清单验证器 CLI PASS、10/10 两次；C3 26 字段 allowlist；8 个无键 SHA-256 digest 已识别；逐字段处置审计） | 无 blob（Issue 评论）；PR #846 已合入 G6 分支，后经 #859 进入 master | 历史材料、待重核 | 验证器血缘在 master 中存在：`server/tests/d1-control-schema-inventory-contract.test.mjs` 钉住同一组计数（70 表、820 列、126 FK、88 索引、91 触发器、19 迁移）；“10/10 两次”是 #846 分支运行数字，本批次未重跑；8 个 digest 的识别记在处置审计文档中，本批次未独立重数 | 待指定；本批次记录 Muse | Issue #841 评论；PR #846 |
| H-12 | PR #844 审查结论 C1-01（`importLegacyAccounts` 跨调用唯一性缺口） | 审查记录；修复落点 `tools/c1-auth0-validator/mock-auth0.mjs:101`（`importRecords`）、`:209`（`import_duplicate_email`） | 已有明确处置决定 | B2-1（PR #865）修复：导入记录指纹 + `import_duplicate_email` / `import_record_conflict`；squash 合并 `94d4fe1e`；在 `f7480630` 下在位 | gccltdco-cmd 独立审查 #865（APPROVED `5901181362`） | PR #865；v0.4 §7.1 |
| H-13 | PR #844 审查结论 C1-02（TOTP Mock ±30 秒窗口重放） | 审查记录；修复落点 `tools/c1-auth0-validator/mock-auth0.mjs:104`（`consumedTotpCounters`） | 已有明确处置决定 | B2-1（PR #865）修复：按 accountRef 记录已消费 counter，重放抛 `totp_code_reused`；squash 合并 `94d4fe1e`；在 `f7480630` 下在位 | gccltdco-cmd 独立审查 #865（APPROVED `5901181362`） | PR #865；v0.4 §7.1 |
| H-14 | PR #844 审查结论 C1-03（README 计数/合成声明不一致） | 审查记录；修正落点 `tools/c1-auth0-validator/README.md` | 已有明确处置决定 | 本批次修正：README 预期计数由 44/44 改为 53/53（导入校验 12 + 登录证明 9 + 租户隔离 9 + 第 6 步端到端 14 + Mock 导入/TOTP 重放 9）；合成声明文案复核无误（“全部内容为合成数据与本地契约验证”与实际一致） | 本批次 Muse；随 B2-4 PR 独立审查 | PR #844 审查记录；本 PR |

## 核验方法（本批次）

- 审计行 H-01～H-07：`git hash-object` 逐文件比对审计文档记录的 blob SHA-1 与 `f7480630` 下同一文件的 blob。5 个一致（H-01、H-03、H-04、H-05、H-07），2 个已变（H-02、H-06）。
- #841 评论 H-08～H-11：全文重读四条 2026-11-08 评论；在 `f7480630` 下逐项 grep/定位成果物（C1-A04、 `projectAccountMetadataForD1`、26 字段文档、清单验证器计数、`Math.random`）；运行数字一律不继承为当前基线结果。
- #844 结论 H-12～H-14：在 `f7480630` 下 grep 确认修复代码在位（H-12、H-13）；README 计数现场核实后修正（H-14）。

## 限制

- 本清单是附件，不是验收：T2 仍 BLOCKED；C1 正式验收仍为 ACCEPTED WITH DOCUMENTED LIMITATIONS；C2 正式验收仍 OPEN。
- “已核实属于固定 SHA”只锚定所列 SHA，不自动延展到当前基线；文件变化后须重核（H-02、H-06）。
- B2-4c（删除证明与恢复，G-10A）不在本清单处理范围，仍 BLOCKED，待 Yi、合规及业务负责人提供删除证明格式与恢复政策。
- D-08～D-10（字段处置）仍待域负责人审查；本清单不改变其状态。
