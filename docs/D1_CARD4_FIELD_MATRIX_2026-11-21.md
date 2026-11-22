# #4 字段矩阵（草案）— 八张敏感字段表逐字段处置

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_card4_field_matrix
  superseded_by: null
  last_verified_at: 2026-11-21
  production_authority: false
```

> **状态：DRAFT / HOLD。不是最终字段合同，不是生产托管许可，不含“已批准”“可投产”类表述。**
> 最终字段合同仍 HOLD，批准权在 Yi，不在本卡。
> 基线：master `b1e46fef4e98bbfdace900a4e8b2d36a4284e176`；在 PR #903（Draft，分支
> `feat/d1-#4-key-families-20261121`，head `08dea77db60e90ac94929327e46b0895c5cae2d0`）基础上做。
> 本稿为逐列补齐后的完成版（见 §13 执行记录）：八张表 128 列全部逐列枚举（§14），分支与 Draft PR 已开，测试已跑。
> 证据源：`docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.md`（T2，70 表 / 820 字段）、
> `docs/D1_CONTROL_FIELD_DISPOSITION_T2_REVIEW.md`（独立结构复核）、
> `docs/D1_CONTROL_SCHEMA_INVENTORY_V1.md`（T1）、`docs/D1_T2_PII_PSEUDONYMIZATION_AND_HMAC_COMPATIBILITY_V1.md`（Q-1）、
> `docs/D1_T2_C3_ACCOUNT_METADATA_26_FIELD_DISPOSITION_AUDIT_V1.md`（Q-1/Q-3 账户元数据）、
> `docs/D1_T2_PAYMENT_ACTION_CUSTODY_DESIGN_V1.md`（Q-5）、
> `server/services/platform/d1-card4-key-families.mjs`（PR #903，Q-2/Q-4/Q-6/Q-7）、
> `server/services/platform/d1-t2-security-primitives.mjs`（摘要/HMAC/TOTP 信封算法）。
> 所有密钥材料均为合成值；未读生产、未写 BWH/E4、未动 E4 DDL、未用真实密钥。

## 0. 八张表清单（7 张已确认 + 1 张候选待确认）

| # | 表 | 敏感字段 | 状态 |
|---|---|---|---|
| 1 | `platform_leads` | `email`、`message` | 已确认（敏感字段 T2 EXTERNALIZE；其余 9 列 DEFER，见 §1） |
| 2 | `platform_portal_access_requests` | `subscription_url` | 已确认（T2 EXTERNALIZE） |
| 3 | `platform_portal_totp_credentials` | `encrypted_totp_secret`（E-04） | 已确认（T2 EXTERNALIZE；Q-4） |
| 4 | `platform_payment_receipts` | `next_action_url` | 已确认（T2 EXTERNALIZE；Q-5） |
| 5 | `platform_payment_orders_legacy_archive_20260803` | `checkout_url`、`checkout_qr_code`（E-06/E-07） | 已确认（T2 EXTERNALIZE；Q-6 HOLD） |
| 6 | `platform_portal_password_credentials` | 全表 11 列 | 已确认（KEEP：原样留，见 §6） |
| 7 | `platform_portal_passkey_credentials` | 全表 | 已确认（T2 DEFER） |
| 8 | `platform_accounts`（5 列；`metadata_json` 已排除，见 §8） | 见 §8 | **候选，待确认**：决策卡 D-6 原文（`E4_DECISION_CARDS.md` #4）不在仓库内，但本地就绪目录有该文件（逐项查验报告 §3.7 已核对）；D-6 原文所列 8 张表里没有 `platform_accounts`，第 8 张表是否为 `platform_accounts` 仍须 Yi 定。本稿不把候选写成定论。 |

逐列枚举已补齐：八张表共 128 列全部见 §14（从 `docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json` 提取，SHA `cdaf041b…`，单行 424 KB）。
T2 总量已核：KEEP 712 / TRANSFORM 19 / EXTERNALIZE 7 / DEFER 23 / CONDITIONAL 59，共 820 字段；
八张表 128 列 = KEEP 70 / CONDITIONAL 28 / EXTERNALIZE 7 / TRANSFORM 2 / DEFER 21。
跨表 TRANSFORM 族（租约、幂等、事件去重）见 §9；它们与八张表有交集但不单独占表位。

每字段四列含义：**处置方式**（KEEP / TRANSFORM / EXTERNALIZE / DEFER / CONDITIONAL，以 T2 为准，本轮三处修正见 §13）；
**摘要算法与输入规范**（精确到域分隔符与信封格式）；**空值语义**（NULL 与空串/缺失的区别）；
**访问与恢复测试**（谁能读、怎么恢复、对应测试 ID）。

## 1. `platform_leads`（Q-1 PII 独立托管；Q-2 邮箱掩码不持久化；Q-12 掩码不写入 D1）

| 字段 | 处置 | 摘要算法与输入规范 | 空值语义 | 访问与恢复测试 |
|---|---|---|---|---|
| `email` | EXTERNALIZE：原始值移出 D1，只留不透明联系引用（opaque contact reference） | 列表展示用现场掩码，不持久化：`local[0] + "***" + "@" + domain`，单字符 local 为 `"*"`；如 `alice@example.com` → `a***@example.com`。掩码是纯函数、无状态、不写 D1、不持久缓存。联系匹配如需保留，改走 Q-1 的 `pii-hmac` 信封（算法见合同证据 §1.3），不用掩码值匹配。 | NULL = 该行无联系邮箱；空串非法（`lead_email_invalid`）。列表行只含 `leadRef + maskedEmail`；任何含原始邮箱的行即泄漏（`lead_raw_email_leak`）。 | 访问：Leads 列表只返回掩码；原始邮箱只在已批准的联系托管侧解析。恢复：联系托管 90 天到期/清除合同适用；D1 侧无恢复路径——删了就是删了。测试：`T2-NO-LEAK-001`；PR #903 合成测试 `maskD1LeadEmail` / `projectD1LeadListRow` / `assertD1LeadListRowHasNoRawEmail`（PR 文述 14/14，本轮未复跑，见 §9）。 |
| `message` | EXTERNALIZE：原始自由文本移出 D1 | 无摘要。自由文本不做哈希留存（低熵/可识别内容不得以摘要形式变相留存）。 | NULL = 无留言；空串按缺失处理，不写空占位。 | 访问：仅联系托管侧。恢复：同 `email`，90 天到期/清除。测试：`T2-NO-LEAK-001`（否定 fixture 含自由文本/邮箱）。 |
| 其余列（9 列） | 见 §14.1 逐列枚举：9 列 DEFER（`id`、`status`、`organization`、`direction`、`stage`、`source`、`created_at`、`updated_at`、`expires_at`）。理由：已批 DDL 无此表建表语句，暂无法装载；待 DDL 补建表后再议。 | 暂不装载（T2 规则名 R-ENUM-KEEP / R-TIME-KEEP / R-OPAQUE-REF-KEEP / R-ORGANIZATION-CONDITIONAL 保留以便溯源，处置以本稿 DEFER 为准）。 | NULL 按源 NOT NULL 约束；时间戳 TEXT ISO-UTC 保留源形态。 | `T2-DEFER-001`（逐列见 §14.1）。 |

## 2. `platform_portal_access_requests`（Q-3 订阅能力独立托管）

| 字段 | 处置 | 摘要算法与输入规范 | 空值语义 | 访问与恢复测试 |
|---|---|---|---|---|
| `subscription_url` | EXTERNALIZE：原始订阅 URL 移出 D1，只留不透明材料引用（或复用 `artifact_id`，但须先证明其不透明且可解析，否则不许复用） | 无摘要。URL 含签名参数/不透明 bearer 路径的可能，不能只靠归一化（去凭证/去 fragment）证明无能力属性。订阅能力托管提案对应 Q-7 设计家族 `subscription-capability-aes`（提案 B，设计标识，未获生产使用批准）。 | NULL = 该请求无待下发订阅能力；空串非法。D1 侧只存引用，不存 URL 空占位。 | 访问：仅经已批准的订阅能力托管解析；D1 只存指针。恢复：托管侧按能力生命周期（发放/吊销/过期）处理；D1 指针失效即 fail-closed，不回退原始 URL。测试：`T2-NO-LEAK-001`、`T2-CUSTODY-001`（每个保留引用须解析到已批准托管方与生命周期状态）。 |
| 其余列（26 列） | 见 §14.2 逐列枚举：25 列 KEEP + 1 列 TRANSFORM（`event_json`，规范 JSON + 版本化递归 allowlist，见 §9）。本轮修正：原稿写 25 列/24 列 KEEP，少算 1 列，实际为 26 列/25 列 KEEP（§14.2 共 27 列，减 1 列 `subscription_url`）。 | 原样保留（T2 规则 R-ENUM-KEEP / R-INTEGER-KEEP / R-BOOL-KEEP / R-TIME-KEEP / R-OPAQUE-REF-KEEP / R-DIGEST-KEEP；`event_json` 按 R-METADATA-JSON 变换）。 | NULL 按源约束；boolean 存 INTEGER 0/1 + CHECK；时间戳 TEXT ISO-UTC。 | `T2-KEEP-001`、`T2-OPAQUE-REF-001`、`T2-TIME-SEMANTICS-001`、`T2-BOOLEAN-CHECK-001`、`T2-NUMERIC-RANGE-001`、`T2-DIGEST-001`、`T2-TRANSFORM-001`、`T2-JSON-ALLOWLIST-001`（逐列见 §14.2）。 |

## 3. `platform_portal_totp_credentials`（Q-4 TOTP 密钥外置）

| 字段 | 处置 | 摘要算法与输入规范 | 空值语义 | 访问与恢复测试 |
|---|---|---|---|---|
| `encrypted_totp_secret`（E-04） | EXTERNALIZE：不进 D1。托管在 Crypto Worker v3 信封操作 `totp.protect` / `totp.unprotect` / `totp.reencrypt`。D1 写 guard（`assertD1WriteHasNoTotpSecret`）拒收任何携带该列的 payload，null 值也拒。 | 信封 `v3:aes-256-gcm:<keyId>:<base64url IV 12B>:<base64url tag 16B>:<base64url ciphertext>`；AES-256-GCM，tag 128 位；AAD = `UTF8("flylink:d1:totp-secret:v3\0") \|\| LP(keyId) \|\| LP(scope) \|\| LP(credentialRef)`，LP = 4 字节大端长度 + UTF-8；scope `portal` → `portal-totp-aes`，`admin` → `admin-totp-aes`。密钥 ID 在信封内；无密钥 ID 的旧信封不接受。 | NULL = 未登记 TOTP（无凭据行或未绑定）；与“有行但空值”不同——空值进 D1 写路径即拒。历史值分类（只做处置分类，不读真实密钥）：`v2:` 形 → `re_enroll_required`；`enc:<base32>` / 裸 Base32 → `re_enroll_required`（`enc:` 不是真加密，不得当密文复制）；其余畸形/超长 → `quarantine`。T1 业主决定（2026-11-08）：切换时全部历史 BWH TOTP 因子失效。 | 访问：仅 Crypto Worker v3 经 `credentialRef` 绑定解封；D1 只保留凭据标识/状态/计数器（KEEP 候选）。恢复：重登记/重保护，无“从 D1 恢复密钥”路径；旧密钥不可逆。测试：`T2-TOTP-CUSTODY-001`；PR #903 合成测试 `resolveD1TotpExternalization` / `assertD1WriteHasNoTotpSecret`。 |
| 其余列（9 列） | 见 §14.3 逐列枚举：全部 KEEP（`id`、`account_id`、`status`、`failure_count`、`locked_until`、`enrolled_at`、`last_verified_at`、`revoked_at`、`updated_at`）。 | 不适用（非秘密字段；引用须满足不透明引用规则：非邮箱/用户名/URL/绝对路径/bearer/原始凭据）。 | NULL 按源 NOT NULL 约束；状态类字段不得用 NULL 表示“未知”，须显式状态值。 | 测试：`T2-KEEP-001`、`T2-OPAQUE-REF-001`、`T2-TIME-SEMANTICS-001`、`T2-NUMERIC-RANGE-001`、`T2-TOTP-CUSTODY-001`（逐列见 §14.3）。 |

## 4. `platform_payment_receipts`（Q-5 支付动作独立托管）

| 字段 | 处置 | 摘要算法与输入规范 | 空值语义 | 访问与恢复测试 |
|---|---|---|---|---|
| `next_action_url` | EXTERNALIZE：原始支付动作 URL/QR 移出 D1。D1 只存指针四件套：`next_action_ref`、`next_action_type`、`next_action_expires_at`、动作生命周期状态/脱敏回执引用。 | 托管侧加密：AES-256-GCM，密钥走 Worker secret 绑定；AAD 绑定 `order_ref`、`account_ref`、`action_ref`、`action_type`、过期时间与 schema 版本；信封族为 Q-7 设计家族 `payment-action-aes`（提案 D，设计标识，未获生产使用批准）。推荐托管体为 Durable Objects（每订单一实例，SQLite 存储，强一致 + 事务状态机）；KV 否决（最终一致）、R2 v1 不需要、D1 只存指针。 | NULL = 无待处理支付动作（订单非 pending/entry-ready，或动作已终结）。指针四件套与 URL 不得共存：有指针即无 URL，有 URL 即违规。 | 访问：`resolveAction` 须同时满足——会话账户拥有订单、D1 指针等于 `actionRef`、订单仍 pending/entry-ready、DO 侧绑定/状态 active/`expiresAt > now`；返回仅给已认证 Worker 响应，`Cache-Control: no-store`，不记日志。读取不消费，消费只在核实结算后。恢复：跨库 saga（见下表）；DO 恢复后须先对 D1 与供应商结算态再议可用，永不单信恢复出的 ACTIVE。测试：`T2-NO-LEAK-001`、`T2-CUSTODY-001`；原型合成测试 17/17（`payment-action-custody-contract.test.mjs`，PR 前已有证据，本轮未复跑）。 |
| 其余列（21 列） | 见 §14.4 逐列枚举：20 列 KEEP + 1 列 TRANSFORM（`event_dedupe_key`，HMAC-SHA-256，见 §9）。本轮修正：原稿写 20 列/19 列 KEEP，少算 1 列，实际为 21 列/20 列 KEEP（§14.4 共 22 列，减 1 列 `next_action_url`）。 | 原样保留（T2 规则 R-ENUM-KEEP / R-INTEGER-KEEP / R-TIME-KEEP / R-OPAQUE-REF-KEEP / R-DIGEST-KEEP；`event_dedupe_key` 按 R-PROVIDER-EVENT-HMAC 变换为 `event_dedupe_key_digest`）。 | NULL 按源约束；金额 INTEGER 安全整数界；时间戳 TEXT ISO-UTC。 | `T2-KEEP-001`、`T2-OPAQUE-REF-001`、`T2-DIGEST-001`、`T2-TIME-SEMANTICS-001`、`T2-NUMERIC-RANGE-001`、`T2-TRANSFORM-001`、`T2-IDEMPOTENCY-REPLAY-001`、`T2-FINANCIAL-INVARIANT-001`（逐列见 §14.4）。 |

Q-5 saga（D1 与 DO 无分布式事务，显式补偿）：供应商回 URL 但 DO put 失败 → 不写 D1、不返回 URL，标记 `reconciliation_required`；
DO put 成功但 D1 指针更新失败 → 孤儿对象（客户不可见），重试同幂等 put/指针更新，限期后清理；
D1 有指针但 DO 暂不可用 → fail-closed 可重试安全错，不回退原始 URL；
D1 有指针但 DO 对象缺失 → `action_unavailable` + 入队对账，不标记支付成功；
动作被替换 → 先建新 DO 动作、CAS 更新 D1 指针、再吊销旧动作，CAS 失败则清理新孤儿；
结算后 DO 吊销失败 → D1 支付态为准展示/拒绝解析，异步重试清理；
DO 恢复到早先时点 → 以 D1 现态与指针为准，先对账再恢复可用。
状态机：`ACTIVE -> CONSUMED`（核实结算）、`ACTIVE -> EXPIRED`（到期）、`ACTIVE -> REVOKED`（取消/替换/安全吊销）；终态不回 ACTIVE；替换发新 `action_ref`。
保留：原始动作密文不晚于供应商 `expiresAt` 清除；脱敏 tombstone 保留期 = 供应商重放/客服/对账窗口的最大值，具体时长待领域业主定。报警/过期/恢复演练：每订单最早过期设一个 DO alarm；定期对账扫孤儿与终态密文；演练须含 DO 宕机、D1 指针失败、过期恢复、重复供应商回调、孤儿清理。

## 5. `platform_payment_orders_legacy_archive_20260803`（Q-6 归档 HOLD / NO-GO）

| 字段 | 处置 | 摘要算法与输入规范 | 空值语义 | 访问与恢复测试 |
|---|---|---|---|---|
| `checkout_url`（E-06） | EXTERNALIZE，且当前 HOLD：不得进入 D1 写入路径。Guard（`assertD1ArchiveWriteAllowed`）拒收任何携带该列的写 payload，null/空值也拒——列不得出现在写里，不只是“为空”。提案 E 不加载、不预生成密钥，本表无密钥家族。 | 如归档存在被证明，才可考虑不透明引用/摘要；当前无此证明，不定义摘要算法。 | 列在 D1 写里出现即违规，与值无关；NULL 不是“已处置”。 | 访问：无。恢复：无——归档 URL/QR 当前不进入 D1。测试：`T2-GATE-001`（须先独立证明归档存在与精确指纹，再建最终归档形态；不重放 SQLite RENAME）；PR #903 合成测试 `assertD1ArchiveWriteAllowed` / `assertD1Card4WriteAllowed`。 |
| `checkout_qr_code`（E-07） | 同 `checkout_url`。 | 同上。 | 同上。 | 同上。 |
| 其余列（28 列） | 见 §14.5 逐列枚举：全部 CONDITIONAL（R-ARCHIVE-CONDITIONAL；归档本身为 CONDITIONAL，须精确历史指纹证明，门过才入）。 | 按 R-ARCHIVE-CONDITIONAL：门过才入 D1；门不过一行都不入。 | NULL 按源约束；时间戳 TEXT ISO-UTC；金额 INTEGER 安全整数界。 | `T2-GATE-001`、`T2-OPAQUE-REF-001`、`T2-TIME-SEMANTICS-001`、`T2-NUMERIC-RANGE-001`、`T2-FINANCIAL-INVARIANT-001`（逐列见 §14.5）。 |

## 6. `platform_portal_password_credentials`（KEEP）

| 字段 | 处置 | 摘要算法与输入规范 | 空值语义 | 访问与恢复测试 |
|---|---|---|---|---|
| 全表 11 列 | KEEP：原样留，不转换、不销毁、不过期。依据：Yi 2026-11-19 第 9 项原文“密码字段口径：DDL 定稿时明确目标类型与转换规则，Auth0 决策到达前不装载密码原文”，批准方案 (a)（口径暂定）；“原样保留”出自已批 DDL 的 #9 摘要（DDL 第 154 行与第 1382–1383 行）+ Yi 2026-11-22 23:26 范围裁决（只迁用户账号、密码、订阅）。11 列名见 §14.6：`id`、`account_id`、`password_hash`、`status`、`failure_count`、`locked_until`、`must_rotate`、`created_at`、`last_verified_at`、`revoked_at`、`updated_at`（全部 KEEP；T2 规则名 R-PASSWORD-DEFER 保留以便溯源）。 | 不适用。密码哈希不重哈希（DDL 第 1383 行）、不转换：只存 scrypt 哈希编码，不存明文（DDL 第 1390–1391 行）。 | 有行即有语义；空值按源 NOT NULL 约束。 | 访问：D1 访问路径待 #9 门控放行后定；BWH 现有路径（`portal-password-credentials.mjs`，scrypt 校验）不在本卡改动范围。恢复：源行原样保留；装载时机受 #9 门控（Auth0/算法兼容与 #4 托管证据通过前不得装载，DDL 第 1384 行）。注意：T2 称 DEFER 的理由“生产没有密码校验行”与 DDL 注释 2026-11-18 快照 75 行（DDL 第 1380 行）不一致，该矛盾已登记在逐项查验报告 §3.4/§4.3，本稿未强行调和。测试：`T2-KEEP-001`、`T2-DIGEST-001`、`T2-NUMERIC-RANGE-001`、`T2-BOOLEAN-CHECK-001`、`T2-TIME-SEMANTICS-001`、`T2-OPAQUE-REF-001`（逐列见 §14.6）。 |

## 7. `platform_portal_passkey_credentials`（DEFER）

| 字段 | 处置 | 摘要算法与输入规范 | 空值语义 | 访问与恢复测试 |
|---|---|---|---|---|
| 全表 12 列 | DEFER：不迁移凭据行。源审计未发现生产服务调用方；DEFER 是数据落点决定，不是“该能力未用/可静默停用”的证据。12 列名见 §14.7：`id`、`account_id`、`credential_id`、`credential_id_hash`、`public_key_jwk_json`、`sign_count`、`transports_json`、`status`、`created_at`、`last_verified_at`、`revoked_at`、`updated_at`（全部 DEFER，R-PASSKEY-DEFER）。 | 不适用。Passkey 迁移只允许公开 JWK，拒收含私有成员 `d` 的 JWK。 | 无行即无语义；不得用“空表已建”表示“已迁移”。 | 访问：无 D1 访问路径。恢复：非预期非空源行须 fail-closed，另行决策，不得静默省略。测试：`T2-DEFER-001`、`T2-FUTURE-AUTH-GATE-001`、`T2-DIGEST-001`、`T2-JSON-ALLOWLIST-001`、`T2-NUMERIC-RANGE-001`、`T2-TIME-SEMANTICS-001`、`T2-OPAQUE-REF-001`（逐列见 §14.7）。 |

## 8. `platform_accounts` · `metadata_json` 已排除（M1-02 方案 (a)；候选第 8 张表仍待确认）

本节原为 `metadata_json` 内 26 个子字段的处置表（原 §8），本轮已整节移除，不再是本合同矩阵的一部分。移除的是 `platform_accounts.metadata_json` 这一列（原 §14.8 第 6 行）及其 26 个子字段：`source`、`channel`、`synthetic`、`displayName`、`loginRef`、`displayRef`、`initialAccount`、`requireSecuritySetup`、`registrationSource`、`singleSubscriptionOnly`、`subscriptionLimit`、`contactDigest`、`loginDigest`、`displayDigest`、`useCaseDigest`、`intentPlan`、`requestedDeviceCount`、`primaryRegion`、`legalAgreementAccepted`、`legalAgreementAcceptedAt`、`termsVersion`、`privacyVersion`、`legalAgreementSourceIpDigest`、`legalAgreementRequestKeyDigest`、`registrationSourceIpDigest`、`registrationRequestKeyDigest`。

排除原因与依据：

- Yi 2026-11-19 裁决 M1-02 批准方案 (a)：`metadata_json`“维持暂不建列、不加载，待后续专项决策”，“不得在未裁决时默认加载”（`YI-RULINGS-2026-11-19.md` 第 13 项）。
- #19 已批 DDL（`E4_DDL_V11_2026-11-21.sql`）里 `platform_accounts` 只有 5 列（第 256–261 行：`id`、`owner_ref`、`status`、`created_at`、`updated_at`），没有 `metadata_json` 这一列；DDL 第 255 行注释写明“6 列生产列 → 5 列 DDL：`metadata_json`（T-01 TRANSFORM）不建列、不加载——#5 已裁决（2026-11-20）采纳方案 (a)……排除正式字段合同、allowlist、映射与数据装载”；DDL 第 152–153 行校正算式亦以 `metadata_json` 为唯一差异列。
- 原 §14.8 把该列写作 TRANSFORM“装载后转换”，与上述已批裁决、已批 DDL 两边都冲突，逐项查验报告判为唯一不通过（查验报告 §3.6、§2 `platform_accounts.metadata_json` 行）。

后果：§14.8 现为 5 个物理列；八张表总数由 129 列变为 128 列（见 §0/§13/§14 计数）。26 个子字段的处置意见（如原 §8 表格中的 KEEP/TRANSFORM/DROP）未被采纳为合同内容；如将来有专项决策要建列，须另行补入，本稿不预设。查验报告对这 26 个子字段的逐项判断（通过 7 / 存疑 19）仍保留在查验报告里，本稿不改写、不删除查验报告的结论。原 §8 的 PII 信封算法说明随本节移除；§9 PII 摘要行的算法出处改指合同证据 §1.3。

## 9. 跨表 TRANSFORM 族（摘要算法与输入规范总表）

| 族 | 算法 | 输入规范 | 信封/存储格式 | 密钥家族 | 测试 |
|---|---|---|---|---|---|
| 幂等键 | HMAC-SHA-256 | `UTF8("flylink:d1:idempotency:v1\0") \|\| LP(keyId) \|\| LP(domain) \|\| LP(actorScope) \|\| LP(operationType) \|\| LP(rawKey)`；域固定 6 个：`coin-wallet-operation-receipt/v1`、`coin-commerce-operation-receipt/v1`、`deferred-transition-operation-receipt/v1`、`payment-order-create/v1`、`wallet-first-deferred-checkout-reserve/v1`、`portal-registration-welcome-grant/v1`；域永不接受外部输入 | `hmac-sha256:v1:<keyId>:<64 小写 hex>`；源列改名 `*_digest`；原始键永不进 D1、不在本任务创建 | `idempotency-hmac`（已批准） | `T2-IDEMPOTENCY-REPLAY-001`：同 scope+同键+同请求摘要重放同结果；同 scope+同键+不同请求摘要按既有冲突签名失败；保留 `actor_scope`/`operation_type` 唯一性与跨域隔离；测轮换/版本行为 |
| 供应商事件去重 | HMAC-SHA-256 | `UTF8("flylink:d1:provider-event:v1\0") \|\| LP(keyId) \|\| LP(merchantScopeDigest) \|\| LP(rawEventKey)`；`merchantScopeDigest` 形如 `sha256:<64 小写 hex>` | 同上信封格式 | `provider-event-hmac`（已批准） | `T2-TRANSFORM-001`；供应商事件 `event_dedupe_key` 语义仍须供应商合同证据（T2 待决） |
| PII 摘要 | HMAC-SHA-256 | 算法见合同证据 §1.3（`pii-hmac`，已批准）；输入为 legacy SHA-256 hex（ASCII 小写原文，不解码成字节） | `hmac-sha256:v1:<keyId>:<64 小写 hex>` | `pii-hmac`（已批准） | `T2-TRANSFORM-001`；合成已知答案向量：邮箱/IP/请求上下文三域、域隔离、key ID 隔离、旧键查新键写、未知/退役键失败、拒绝历史裸 SHA-256 回退 |
| 租约 token | SHA-256（一元摘要，非 HMAC） | `SHA-256(UTF8("flylink:d1:lease-token:v1\0") \|\| LP(rawToken))` → 64 小写 hex；源列改名 `lease_token_hash` | 64 小写 hex | 无（无密钥摘要） | `T2-LEASE-FENCE-001`：只存版本化摘要；提交原始 token 后同样摘要比对；保留 `lease_generation`、`lease_until`、状态守卫与 CAS/fencing；过期 generation/token 失败；旧 token 不进 D1 或日志 |
| TOTP 秘密 | AES-256-GCM 信封 | 见 §3；明文先归一化 Base32（去空白/`-`、大写、padding 校验） | `v3:aes-256-gcm:<keyId>:<IV>:<tag>:<ciphertext>` | `portal-totp-aes` / `admin-totp-aes`（已批准；两 scope 密钥分离，轮换未决） | `T2-TOTP-CUSTODY-001` |
| JSON 字段（`event_json` / `payload_json` 等） | 规范 JSON + 精确版本化递归 allowlist | 每个 JSON 字段有精确版本化 schema 与规范序列化；递归拒收 PII、URL、token、密码、私钥、原始 UUID/密码材料、任意自由文本、未知键、超大/超深结构；`_json` 后缀不是安全证明；`assertNoUnsafeFields()` 不是整表保证 | TEXT（规范化后） | 不适用 | `T2-JSON-ALLOWLIST-001`；各 JSON 字段的精确 allowlist 仍待逐字段指定（T2 待决） |

租约字段精确清单（源自 `d1-t2-security-primitives.mjs`）：UUID 形——
`platform_deferred_resource_transition_reservations.lease_token`（形如 `deferred_reservation_lease_<UUIDv4>`）；
64 小写 hex 形——`platform_coin_commerce_fulfillment_commands.lease_token`、
`platform_deferred_resource_transitions.lease_token`、
`platform_deferred_resource_transition_rebases.lease_token`、
`platform_wallet_first_resource_effect_runtime_claims.lease_token`、
`platform_portal_registration_welcome_coin_grants.lease_token`。
空值语义：NULL = 未持有租约；过期/旧 generation 的 token 提交即失败，不以 NULL 补位。

## 10. 密钥家族（Q-7）

| 家族 | 种类 | 状态 | 备注 |
|---|---|---|---|
| `idempotency-hmac` | HMAC-SHA-256 | 已批准 | 幂等信封；密钥在 D1 外，须与已授权迁移/Worker 运行时共享 |
| `provider-event-hmac` | HMAC-SHA-256 | 已批准 | 供应商事件去重 |
| `pii-hmac` | HMAC-SHA-256 | 已批准 | PII 摘要；与幂等/事件键分离 |
| `portal-totp-aes` | AES-256-GCM | 已批准 | Portal TOTP；提案 C 复用本族 |
| `admin-totp-aes` | AES-256-GCM | 已批准 | Admin TOTP；与 Portal 密钥分离（轮换待决） |
| `lead-contact-aes` | AES-256-GCM | **设计标识，未获生产使用批准** | 提案 A（Q-1 联系托管）；生产使用门控拒收；任何真实加解密路径不接受；已配置其密钥材料时启动检查直接报错 |
| `subscription-capability-aes` | AES-256-GCM | **设计标识，未获生产使用批准** | 提案 B（Q-3）；同上 |
| `payment-action-aes` | AES-256-GCM | **设计标识，未获生产使用批准** | 提案 D（Q-5）；同上 |

轮换/退役（仅描述符，不含密钥材料）：`active` → `rotating`（新键写、旧键留读）→ `active`；
单键退役须对账证明 + 业主批准引用，缺一不可，active 键永不可退役；整族退役为终态。
启动 fail-closed 检查（`validateD1Card4StartupKeyConfig`）：必需密钥缺失/非法即拒绝启动，不回退弱默认；
返回摘要只含密钥 ID，不含密钥材料。**注意：该检查尚未接入 `server/state.mjs` 启动流程**，接入会改变生产
启动行为，须另行批准。

## 11. HOLD 与缺口（写明需要什么才能解除）

| 项 | 状态 | 缺什么才能解除 |
|---|---|---|
| 最终字段合同 | HOLD | Yi 裁决。GPT-6 的 PARTIAL TECHNICAL GO 只是技术意见，不是 Yi 的决定。本稿任何行都不是最终合同。 |
| Q-6 归档 | HOLD / NO-GO | 归档存在与精确指纹的独立证明 + Yi 裁决；当前归档 URL/QR 不进入 D1。 |
| Q-8 | HOLD | 本地决策文件无 Q-8 定义；PR #903 文述仅“Stage 0.2 不放行”。须 Yi/决策卡原文给出 Q-8 内容与放行条件。 |
| Q-9～Q-11 | HOLD（未定义） | 本地决策文件无定义；PR #903 已记为未覆盖。本稿不编造。须决策卡原文。 |
| Q-12 | 方向已采纳：不将掩码写入 D1 | 掩码方案见 §1；最终合同仍 HOLD，待 Yi 裁决。 |
| 第 8 张表确认 | 待确认 | 决策卡 D-6 原文（`E4_DECISION_CARDS.md` #4）或 Yi 确认。 |
| 各表其余列逐列枚举 | **已补齐** | 本轮从 `docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json`（SHA `cdaf041b…`）提取，见 §14（八张表 128 列）。 |
| 各 JSON 字段精确 allowlist | 待决（T2 待决） | 逐 JSON 字段的版本化 schema；通用扫描不足为凭。 |
| 保留期限表 | 待决（T2 待决） | 金融/审计/会话/挑战/用量/同意证据的精确保留期限；业务到期 ≠ 保留批准。 |
| 不透明引用语法与历史值一致性 | 待决（T2 待决） | 引用语法定义 + 对生产值的历史一致性测试；不得从 `_ref`/`_id` 后缀推断不透明。 |
| 幂等 HMAC 密钥托管/版本/轮换 | 待决（T2 待决） | 密钥托管、版本、轮换与历史重放兼容设计；密钥未配给、未记录。 |
| TOTP 密钥分离与轮换 | 待决 | Portal 与 Admin 是否用不同密钥、密钥 ID 与轮换/重加密行为的决定；历史 `enc:` 须重登记或隔离。 |
| 支付 tombstone 保留期 / DO 命名空间 / secret 绑定 / TTL | 待批 | DO 类/命名空间与账户归属、secret 绑定与轮换/退役程序、供应商 TTL、脱敏 tombstone 时长、已认证解析路由与 Portal UI 改动、报警/对账计划、支付领域业主与独立安全复核。 |
| 身份托管边界 | 待决 | Auth0 身份映射、画像库、同意证据库的业主与技术边界；否则删 `loginRef` 等字段是行为破坏性变更。 |

## 12. 测试对照（T2 合同 ID → 本稿覆盖）

`T2-SCHEMA-001` 字段/schema 对等（EXTERNALIZE/DEFER 字段不出 D1 v1；CONDITIONAL 字段门过才入；无源列被静默丢弃或改名）；
`T2-KEEP-001` KEEP 保留；`T2-TRANSFORM-001` 变换确定性（同版本同输入同输出；源值不出目标 dump/日志/快照）；
`T2-NO-LEAK-001` 无秘密/PII 泄漏；`T2-CUSTODY-001` 外部托管引用完整性；
`T2-DEFER-001` 延迟特性门；`T2-GATE-001` 条件纳入
门；`T2-OPAQUE-REF-001` 不透明引用校验；`T2-DIGEST-001` 既有摘要核验（算法/域/规范化/编码/源生成，名
称后缀不是安全证明）；`T2-LEASE-FENCE-001`；`T2-IDEMPOTENCY-REPLAY-001`；`T2-JSON-ALLOWLIST-001`；
`T2-TIME-SEMANTICS-001`（TEXT ISO-UTC 保留；Ads Consent epoch 毫秒 INTEGER；不用 `PRAGMA schema_version` 作身份指纹）；
`T2-BOOLEAN-CHECK-001`（boolean 存 INTEGER 0/1 + CHECK）；`T2-NUMERIC-RANGE-001`；
`T2-USAGE-RETENTION-001`（用量最小化与保留）；`T2-ADS-CONSENT-001`（Ads Consent 门与语义）；
`T2-TOTP-CUSTODY-001`；`T2-FUTURE-AUTH-GATE-001`（未来认证 schema 门）；
`T2-FINANCIAL-INVARIANT-001`（财务账本与 saga 不变量：coin lot 守恒、钱包版本化、不可变账本、Payment → Wallet → Payment → Referral 多段幂等结算，不虚构跨库 ACID）。
通用类型规则：TEXT  stay TEXT、INTEGER stay INTEGER，不 blanket 强制转换；boolean 仍 INTEGER 0/1；
时间戳 TEXT ISO-UTC 保留源形态；`schemaDigest` 为 schema 内容身份，不含 `PRAGMA schema_version`。

## 13. 执行记录（本轮：逐列补齐）

- 基线：master `b1e46fef4e98bbfdace900a4e8b2d36a4284e176`，与任务基线一致；PR #903 Draft，分支 `feat/d1-#4-key-families-20261121`，head `08dea77db60e90ac94929327e46b0895c5cae2d0`。
- 本轮分支：`feat/d1-card4-field-matrix-20261121`（自 `08dea77d`）；Draft PR #911（head `d5094128`），Draft，未标 Ready。
- T2 JSON 已核：`docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json`，SHA `cdaf041b…`，单行 424 KB，70 表 / 820 字段；五份副本 SHA 一致。本轮用仓库内副本提取，未改原文件。
- 八张表 128 列逐列枚举已补齐（§14）：计数 KEEP 70 / CONDITIONAL 28 / EXTERNALIZE 7 / TRANSFORM 2 / DEFER 21；与 T2 总量（KEEP 712 / TRANSFORM 19 / EXTERNALIZE 7 / DEFER 23 / CONDITIONAL 59）交叉核对——八张表含全部 7 个 EXTERNALIZE；DEFER 21 列 = passkey 表 12 列（T2 DEFER）+ 线索表 9 列（T2 为 KEEP/CONDITIONAL，本轮改为 DEFER）；密码表 11 列（T2 DEFER）本轮按 Yi 裁决改为 KEEP，不再计入 DEFER；TRANSFORM 19 个中八张表占 2 个，其余 17 个在八张表外；CONDITIONAL 59 个中八张表占 28 个，其余 31 个在八张表外。
- 第 8 张表（`platform_accounts`）仍为候选：决策卡 D-6 原文（`E4_DECISION_CARDS.md` #4）不在仓库内（本轮已查，无此文件），但本地就绪目录有该文件（逐项查验报告 §3.7 已核对）；D-6 原文所列 8 张表里没有 `platform_accounts`，是否为第 8 张表仍须 Yi 定，本稿不把候选写成定论。`metadata_json` 列及 26 个子字段已按 M1-02 方案 (a) 移除（见 §8）；§14.8 现为 5 个物理列。
- Q-8、Q-9～Q-11 仍无本地定义，记 HOLD，未编造。
- 上轮拦截：执行风险检查曾拦住 git / 测试操作（process.poll，call id `call_01a1fe7f42e877c89a95b2e867bcb092`，原文见协调日志）；Yi 2026-11-21 06:46 在主会话点选“同意，让它继续”，直接授权本轮继续，本轮据此建分支、提交、开 Draft PR、跑测试。
- 测试：新增 `server/tests/d1-card4-field-matrix.test.mjs`（矩阵与 T2 JSON 一致性验证，合成数据）；受影响模块 `server/tests/d1-card4-key-families.test.mjs`（PR #903，14/14）。实测数字见本轮回报，不抄 PR 文述。
- 最终字段合同仍 HOLD，批准权在 Yi，不在本卡。本稿任何行都不是最终合同。
- 本轮修正（2026-11-22，PR #911 修正提交）：依据逐项查验报告 `CARD4_ITEM_CHECK_2026-11-22.md`（SHA `298b78c6…`）与 Yi 2026-11-22 23:26 范围裁决。改动：(1) `metadata_json` 列及 26 个子字段按 M1-02 方案 (a) 移除，见 §8；(2) 密码表 11 列 DEFER 改为 KEEP（原样留），见 §6；(3) 线索表其余 9 列改为 DEFER，见 §1；(4) §2/§4 叙述小计各补 1 列；(5) §0/§13“本地只有 T2/C3”按事实订正。修正后八张表 128 列 = KEEP 70 / CONDITIONAL 28 / EXTERNALIZE 7 / TRANSFORM 2 / DEFER 21。代码模块 `server/services/platform/d1-card4-field-matrix.mjs` 与测试 `server/tests/d1-card4-field-matrix.test.mjs` 仍按 T2 旧口径（129 列），本轮只改矩阵文件一个文件，未同步代码，同步与否另行定。

## 14. 八张表逐列枚举（T2 JSON 提取）

> 本节原为 T2 JSON（`docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json`，SHA `cdaf041b…`，70 表 / 820 字段）的逐字提取：八张表共 129 列，全部按 ordinal 列出；本轮修正后为 128 列（见 §13 修正记录）。
> 每列的处置、规则、数据类、目标/纳入、保留、测试取自 JSON 原文；其中三处处置已按查验与裁决修正（线索表 9 列、密码表 11 列、`metadata_json` 移除），规则列与数据类保留 T2 原文以便溯源，处置列以本稿为准。敏感字段的详细处置（摘要算法、空值语义、访问与恢复）见 §1–§7；本节是逐列总表。
> 计数核对：八张表 128 列 = KEEP 70 / CONDITIONAL 28 / EXTERNALIZE 7 / TRANSFORM 2 / DEFER 21；
> T2 总量为 KEEP 712 / TRANSFORM 19 / EXTERNALIZE 7 / DEFER 23 / CONDITIONAL 59，共 820 字段（T2 自身口径，不变）——
> 八张表含全部 7 个 EXTERNALIZE；DEFER 21 列 = passkey 表 12 列（T2 DEFER）+ 线索表 9 列（T2 为 KEEP/CONDITIONAL，本稿因 DDL 无建表语句改为 DEFER）；密码表 11 列（T2 DEFER）本稿按 Yi 裁决改为 KEEP，不再计入 DEFER。TRANSFORM 19 个中八张表占 2 个（`event_json`、`event_dedupe_key`），其余 17 个在八张表外；
> CONDITIONAL 59 个中八张表占 28 个（归档表 28 个），其余 31 个在八张表外。

### 14.1 `platform_leads`（11 列；表处置 DEFER；源列 11；目标候选列 0）

| # | 字段 | 类型 | 处置 | 规则 | 数据类 | 目标/纳入 | 保留 | 测试 |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` (PK) | TEXT (NULL) | DEFER | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | id / deferred_until_ddl | RET-LEAD-90D | T2-SCHEMA-001,T2-DEFER-001,T2-OPAQUE-REF-001 |
| 2 | `status` | TEXT (NOT NULL) | DEFER | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | status / deferred_until_ddl | RET-LEAD-90D | T2-SCHEMA-001,T2-DEFER-001 |
| 3 | `organization` | TEXT (NOT NULL) | DEFER | R-ORGANIZATION-CONDITIONAL | POTENTIAL_FREE_TEXT_OR_IDENTIFIER | — / deferred_until_ddl | RET-LEAD-90D | T2-SCHEMA-001,T2-DEFER-001 |
| 4 | `email` | TEXT (NOT NULL) | EXTERNALIZE | R-EMAIL-EXT | DIRECT_PII | — / excluded_from_d1 | RET-LEAD-90D | T2-SCHEMA-001,T2-NO-LEAK-001,T2-CUSTODY-001 |
| 5 | `direction` | TEXT (NOT NULL) | DEFER | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | direction / deferred_until_ddl | RET-LEAD-90D | T2-SCHEMA-001,T2-DEFER-001 |
| 6 | `stage` | TEXT (NOT NULL) | DEFER | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | stage / deferred_until_ddl | RET-LEAD-90D | T2-SCHEMA-001,T2-DEFER-001 |
| 7 | `message` | TEXT (NOT NULL) | EXTERNALIZE | R-MESSAGE-EXT | DIRECT_PII | — / excluded_from_d1 | RET-LEAD-90D | T2-SCHEMA-001,T2-NO-LEAK-001,T2-CUSTODY-001 |
| 8 | `source` | TEXT (NOT NULL) | DEFER | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | source / deferred_until_ddl | RET-LEAD-90D | T2-SCHEMA-001,T2-DEFER-001 |
| 9 | `created_at` | TEXT (NOT NULL) | DEFER | R-TIME-KEEP | TIMESTAMP | created_at / deferred_until_ddl | RET-LEAD-90D | T2-SCHEMA-001,T2-DEFER-001,T2-TIME-SEMANTICS-001 |
| 10 | `updated_at` | TEXT (NOT NULL) | DEFER | R-TIME-KEEP | TIMESTAMP | updated_at / deferred_until_ddl | RET-LEAD-90D | T2-SCHEMA-001,T2-DEFER-001,T2-TIME-SEMANTICS-001 |
| 11 | `expires_at` | TEXT (NOT NULL) | DEFER | R-TIME-KEEP | TIMESTAMP | expires_at / deferred_until_ddl | RET-LEAD-90D | T2-SCHEMA-001,T2-DEFER-001,T2-TIME-SEMANTICS-001 |

### 14.2 `platform_portal_access_requests`（27 列；表处置 KEEP；源列 27；目标候选列 26）

| # | 字段 | 类型 | 处置 | 规则 | 数据类 | 目标/纳入 | 保留 | 测试 |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` (PK) | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | id / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 2 | `portal_user_ref` | TEXT (NOT NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | portal_user_ref / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 3 | `plan` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | plan / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001 |
| 4 | `client_target` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | client_target / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001 |
| 5 | `duration_days` | INTEGER (NOT NULL) | KEEP | R-INTEGER-KEEP | INTERNAL_CONTROL_DATA | duration_days / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-NUMERIC-RANGE-001 |
| 6 | `quantity` | INTEGER (NOT NULL) | KEEP | R-INTEGER-KEEP | INTERNAL_CONTROL_DATA | quantity / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-NUMERIC-RANGE-001 |
| 7 | `status` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | status / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001 |
| 8 | `next_action` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | next_action / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001 |
| 9 | `note_provided` | INTEGER (NOT NULL) | KEEP | R-BOOL-KEEP | BOOLEAN_FLAG | note_provided / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-BOOLEAN-CHECK-001,T2-NUMERIC-RANGE-001 |
| 10 | `prior_trial_state` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | prior_trial_state / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001 |
| 11 | `submitted_at` | TEXT (NOT NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | submitted_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001 |
| 12 | `updated_at` | TEXT (NOT NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | updated_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001 |
| 13 | `reviewed_at` | TEXT (NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | reviewed_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001 |
| 14 | `reviewed_by_ref` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | reviewed_by_ref / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 15 | `safe_reason_code` | TEXT (NULL) | KEEP | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | safe_reason_code / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001 |
| 16 | `expires_at` | TEXT (NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | expires_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001 |
| 17 | `valid_until` | TEXT (NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | valid_until / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001 |
| 18 | `entitlement_ref` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | entitlement_ref / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 19 | `access_grant_ref` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | access_grant_ref / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 20 | `tenant_id` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | tenant_id / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 21 | `artifact_id` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | artifact_id / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 22 | `subscription_url` | TEXT (NULL) | EXTERNALIZE | R-SUBSCRIPTION-URL-EXT | SECRET_OR_ACTION_CAPABILITY | — / excluded_from_d1 | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-NO-LEAK-001,T2-CUSTODY-001 |
| 23 | `edge_channel_ref` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | edge_channel_ref / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 24 | `edge_credential_ref` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | edge_credential_ref / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 25 | `edge_material_digest` | TEXT (NULL) | KEEP | R-DIGEST-KEEP | ONE_WAY_DIGEST | edge_material_digest / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-DIGEST-001 |
| 26 | `edge_lifecycle_mutation` | INTEGER (NOT NULL) | KEEP | R-BOOL-KEEP | BOOLEAN_FLAG | edge_lifecycle_mutation / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-BOOLEAN-CHECK-001,T2-NUMERIC-RANGE-001 |
| 27 | `event_json` | TEXT (NOT NULL) | TRANSFORM | R-METADATA-JSON | CONTROLLED_JSON | event_json / included_after_transform | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-TRANSFORM-001,T2-JSON-ALLOWLIST-001 |

### 14.3 `platform_portal_totp_credentials`（10 列；表处置 KEEP；源列 10；目标候选列 9）

| # | 字段 | 类型 | 处置 | 规则 | 数据类 | 目标/纳入 | 保留 | 测试 |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` (PK) | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | id / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-TOTP-CUSTODY-001 |
| 2 | `account_id` | TEXT (NOT NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | account_id / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-TOTP-CUSTODY-001 |
| 3 | `encrypted_totp_secret` | TEXT (NOT NULL) | EXTERNALIZE | R-TOTP-EXT | SECRET_OR_ACTION_CAPABILITY | — / excluded_from_d1 | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-NO-LEAK-001,T2-CUSTODY-001,T2-TOTP-CUSTODY-001 |
| 4 | `status` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | status / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TOTP-CUSTODY-001 |
| 5 | `failure_count` | INTEGER (NOT NULL) | KEEP | R-INTEGER-KEEP | INTERNAL_CONTROL_DATA | failure_count / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-NUMERIC-RANGE-001,T2-TOTP-CUSTODY-001 |
| 6 | `locked_until` | TEXT (NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | locked_until / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-TOTP-CUSTODY-001 |
| 7 | `enrolled_at` | TEXT (NOT NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | enrolled_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-TOTP-CUSTODY-001 |
| 8 | `last_verified_at` | TEXT (NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | last_verified_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-TOTP-CUSTODY-001 |
| 9 | `revoked_at` | TEXT (NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | revoked_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-TOTP-CUSTODY-001 |
| 10 | `updated_at` | TEXT (NOT NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | updated_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-TOTP-CUSTODY-001 |

### 14.4 `platform_payment_receipts`（22 列；表处置 KEEP；源列 22；目标候选列 21）

| # | 字段 | 类型 | 处置 | 规则 | 数据类 | 目标/纳入 | 保留 | 测试 |
|---|---|---|---|---|---|---|---|---|
| 1 | `receipt_ref` (PK) | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | receipt_ref / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 2 | `payment_order_ref` | TEXT (NOT NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | payment_order_ref / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 3 | `attempt_ref` | TEXT (NOT NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | attempt_ref / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 4 | `provider_request_ref` | TEXT (NOT NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | provider_request_ref / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 5 | `receipt_type` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | FINANCIAL_OR_REWARD_CONTROL_FACT | receipt_type / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-FINANCIAL-INVARIANT-001 |
| 6 | `canonical_state` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | FINANCIAL_OR_REWARD_CONTROL_FACT | canonical_state / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-FINANCIAL-INVARIANT-001 |
| 7 | `charge_certainty` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | FINANCIAL_OR_REWARD_CONTROL_FACT | charge_certainty / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-FINANCIAL-INVARIANT-001 |
| 8 | `provider_order_ref` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | provider_order_ref / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 9 | `provider_capture_ref` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | provider_capture_ref / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 10 | `provider_event_ref` | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | provider_event_ref / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 11 | `event_dedupe_key` | TEXT (NULL) | TRANSFORM | R-PROVIDER-EVENT-HMAC | PROVIDER_EVENT_DEDUPE | event_dedupe_key_digest / included_after_transform | RET-IDEMPOTENCY-TBD | T2-SCHEMA-001,T2-TRANSFORM-001,T2-IDEMPOTENCY-REPLAY-001,T2-FINANCIAL-INVARIANT-001 |
| 12 | `merchant_scope_digest` | TEXT (NULL) | KEEP | R-DIGEST-KEEP | ONE_WAY_DIGEST | merchant_scope_digest / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-DIGEST-001,T2-FINANCIAL-INVARIANT-001 |
| 13 | `payload_digest` | TEXT (NULL) | KEEP | R-DIGEST-KEEP | ONE_WAY_DIGEST | payload_digest / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-DIGEST-001,T2-FINANCIAL-INVARIANT-001 |
| 14 | `next_action_type` | TEXT (NULL) | KEEP | R-ENUM-KEEP | FINANCIAL_OR_REWARD_CONTROL_FACT | next_action_type / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-FINANCIAL-INVARIANT-001 |
| 15 | `next_action_url` | TEXT (NULL) | EXTERNALIZE | R-PAYMENT-ACTION-EXT | SECRET_OR_ACTION_CAPABILITY | — / excluded_from_d1 | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-NO-LEAK-001,T2-CUSTODY-001,T2-FINANCIAL-INVARIANT-001 |
| 16 | `next_action_expires_at` | TEXT (NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | next_action_expires_at / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-FINANCIAL-INVARIANT-001 |
| 17 | `verification_result` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | FINANCIAL_OR_REWARD_CONTROL_FACT | verification_result / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-FINANCIAL-INVARIANT-001 |
| 18 | `amount_minor` | INTEGER (NOT NULL) | KEEP | R-INTEGER-KEEP | FINANCIAL_OR_REWARD_CONTROL_FACT | amount_minor / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-NUMERIC-RANGE-001,T2-FINANCIAL-INVARIANT-001 |
| 19 | `currency` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | FINANCIAL_OR_REWARD_CONTROL_FACT | currency / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-FINANCIAL-INVARIANT-001 |
| 20 | `currency_exponent` | INTEGER (NOT NULL) | KEEP | R-INTEGER-KEEP | FINANCIAL_OR_REWARD_CONTROL_FACT | currency_exponent / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-NUMERIC-RANGE-001,T2-FINANCIAL-INVARIANT-001 |
| 21 | `expected_paid_coin_units` | INTEGER (NOT NULL) | KEEP | R-INTEGER-KEEP | FINANCIAL_OR_REWARD_CONTROL_FACT | expected_paid_coin_units / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-NUMERIC-RANGE-001,T2-FINANCIAL-INVARIANT-001 |
| 22 | `accepted_at` | TEXT (NOT NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | accepted_at / included | RET-FINANCIAL-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-FINANCIAL-INVARIANT-001 |

### 14.5 `platform_payment_orders_legacy_archive_20260803`（30 列；表处置 CONDITIONAL；源列 30；目标候选列 28）

| # | 字段 | 类型 | 处置 | 规则 | 数据类 | 目标/纳入 | 保留 | 测试 |
|---|---|---|---|---|---|---|---|---|
| 1 | `order_ref` (PK) | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | OPAQUE_REFERENCE | order_ref / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 2 | `portal_user_ref` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | OPAQUE_REFERENCE | portal_user_ref / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 3 | `plan` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | plan / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 4 | `plan_label` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | plan_label / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 5 | `amount_minor` | INTEGER (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | amount_minor / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-NUMERIC-RANGE-001,T2-FINANCIAL-INVARIANT-001 |
| 6 | `money` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | money / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 7 | `currency` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | currency / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 8 | `duration_days` | INTEGER (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | duration_days / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-NUMERIC-RANGE-001,T2-FINANCIAL-INVARIANT-001 |
| 9 | `client_target` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | client_target / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 10 | `channel` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | channel / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 11 | `status` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | status / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 12 | `provider` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | provider / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 13 | `provider_order_ref` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | OPAQUE_REFERENCE | provider_order_ref / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 14 | `checkout_url` | TEXT (NULL) | EXTERNALIZE | R-LEGACY-CHECKOUT-EXT | SECRET_OR_ACTION_CAPABILITY | — / excluded_from_d1 | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-NO-LEAK-001,T2-CUSTODY-001,T2-FINANCIAL-INVARIANT-001 |
| 15 | `access_request_ref` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | OPAQUE_REFERENCE | access_request_ref / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 16 | `access_request_status` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | access_request_status / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 17 | `paid_at` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | TIMESTAMP | paid_at / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-TIME-SEMANTICS-001,T2-FINANCIAL-INVARIANT-001 |
| 18 | `created_at` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | TIMESTAMP | created_at / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-TIME-SEMANTICS-001,T2-FINANCIAL-INVARIANT-001 |
| 19 | `updated_at` | TEXT (NOT NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | TIMESTAMP | updated_at / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-TIME-SEMANTICS-001,T2-FINANCIAL-INVARIANT-001 |
| 20 | `checkout_expires_at` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | TIMESTAMP | checkout_expires_at / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-TIME-SEMANTICS-001,T2-FINANCIAL-INVARIANT-001 |
| 21 | `checkout_url_scheme` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | checkout_url_scheme / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 22 | `checkout_qr_code` | TEXT (NULL) | EXTERNALIZE | R-LEGACY-QR-EXT | SECRET_OR_ACTION_CAPABILITY | — / excluded_from_d1 | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-NO-LEAK-001,T2-CUSTODY-001,T2-FINANCIAL-INVARIANT-001 |
| 23 | `refund_status` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | refund_status / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 24 | `refund_requested_at` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | TIMESTAMP | refund_requested_at / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-TIME-SEMANTICS-001,T2-FINANCIAL-INVARIANT-001 |
| 25 | `refund_approved_at` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | TIMESTAMP | refund_approved_at / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-TIME-SEMANTICS-001,T2-FINANCIAL-INVARIANT-001 |
| 26 | `refund_amount_minor` | INTEGER (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | refund_amount_minor / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-NUMERIC-RANGE-001,T2-FINANCIAL-INVARIANT-001 |
| 27 | `refund_remaining_days` | INTEGER (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | refund_remaining_days / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-NUMERIC-RANGE-001,T2-FINANCIAL-INVARIANT-001 |
| 28 | `refund_reason_code` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | refund_reason_code / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |
| 29 | `refund_provider_ref` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | OPAQUE_REFERENCE | refund_provider_ref / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-OPAQUE-REF-001,T2-FINANCIAL-INVARIANT-001 |
| 30 | `refund_failed_reason` | TEXT (NULL) | CONDITIONAL | R-ARCHIVE-CONDITIONAL | FINANCIAL_OR_REWARD_CONTROL_FACT | refund_failed_reason / conditional | RET-ARCHIVE-TBD | T2-SCHEMA-001,T2-GATE-001,T2-FINANCIAL-INVARIANT-001 |

### 14.6 `platform_portal_password_credentials`（11 列；表处置 KEEP；源列 11；目标候选列 11）

| # | 字段 | 类型 | 处置 | 规则 | 数据类 | 目标/纳入 | 保留 | 测试 |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` (PK) | TEXT (NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | id / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-FUTURE-AUTH-GATE-001 |
| 2 | `account_id` | TEXT (NOT NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | account_id / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001,T2-FUTURE-AUTH-GATE-001 |
| 3 | `password_hash` | TEXT (NOT NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | password_hash / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-DIGEST-001,T2-FUTURE-AUTH-GATE-001 |
| 4 | `status` | TEXT (NOT NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | status / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-FUTURE-AUTH-GATE-001 |
| 5 | `failure_count` | INTEGER (NOT NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | failure_count / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-NUMERIC-RANGE-001,T2-FUTURE-AUTH-GATE-001 |
| 6 | `locked_until` | TEXT (NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | locked_until / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-FUTURE-AUTH-GATE-001 |
| 7 | `must_rotate` | INTEGER (NOT NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | must_rotate / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-BOOLEAN-CHECK-001,T2-NUMERIC-RANGE-001,T2-FUTURE-AUTH-GATE-001 |
| 8 | `created_at` | TEXT (NOT NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | created_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-FUTURE-AUTH-GATE-001 |
| 9 | `last_verified_at` | TEXT (NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | last_verified_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-FUTURE-AUTH-GATE-001 |
| 10 | `revoked_at` | TEXT (NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | revoked_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-FUTURE-AUTH-GATE-001 |
| 11 | `updated_at` | TEXT (NOT NULL) | KEEP | R-PASSWORD-DEFER | FUTURE_AUTH_CREDENTIAL | updated_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001,T2-FUTURE-AUTH-GATE-001 |

### 14.7 `platform_portal_passkey_credentials`（12 列；表处置 DEFER；源列 12；目标候选列 0）

| # | 字段 | 类型 | 处置 | 规则 | 数据类 | 目标/纳入 | 保留 | 测试 |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` (PK) | TEXT (NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-OPAQUE-REF-001,T2-FUTURE-AUTH-GATE-001 |
| 2 | `account_id` | TEXT (NOT NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-OPAQUE-REF-001,T2-FUTURE-AUTH-GATE-001 |
| 3 | `credential_id` | TEXT (NOT NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-OPAQUE-REF-001,T2-FUTURE-AUTH-GATE-001 |
| 4 | `credential_id_hash` | TEXT (NOT NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-DIGEST-001,T2-FUTURE-AUTH-GATE-001 |
| 5 | `public_key_jwk_json` | TEXT (NOT NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-JSON-ALLOWLIST-001,T2-FUTURE-AUTH-GATE-001 |
| 6 | `sign_count` | INTEGER (NOT NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-NUMERIC-RANGE-001,T2-FUTURE-AUTH-GATE-001 |
| 7 | `transports_json` | TEXT (NOT NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-JSON-ALLOWLIST-001,T2-FUTURE-AUTH-GATE-001 |
| 8 | `status` | TEXT (NOT NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-FUTURE-AUTH-GATE-001 |
| 9 | `created_at` | TEXT (NOT NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-TIME-SEMANTICS-001,T2-FUTURE-AUTH-GATE-001 |
| 10 | `last_verified_at` | TEXT (NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-TIME-SEMANTICS-001,T2-FUTURE-AUTH-GATE-001 |
| 11 | `revoked_at` | TEXT (NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-TIME-SEMANTICS-001,T2-FUTURE-AUTH-GATE-001 |
| 12 | `updated_at` | TEXT (NOT NULL) | DEFER | R-PASSKEY-DEFER | FUTURE_AUTH_CREDENTIAL | — / deferred_until_feature_approval | RET-DEFERRED | T2-SCHEMA-001,T2-DEFER-001,T2-TIME-SEMANTICS-001,T2-FUTURE-AUTH-GATE-001 |

### 14.8 `platform_accounts`（5 列；表处置 KEEP；源列 5；目标候选列 5）

| # | 字段 | 类型 | 处置 | 规则 | 数据类 | 目标/纳入 | 保留 | 测试 |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` (PK) | TEXT (NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | id / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 2 | `owner_ref` | TEXT (NOT NULL) | KEEP | R-OPAQUE-REF-KEEP | OPAQUE_REFERENCE | owner_ref / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-OPAQUE-REF-001 |
| 3 | `status` | TEXT (NOT NULL) | KEEP | R-ENUM-KEEP | INTERNAL_CONTROL_DATA | status / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001 |
| 4 | `created_at` | TEXT (NOT NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | created_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001 |
| 5 | `updated_at` | TEXT (NOT NULL) | KEEP | R-TIME-KEEP | TIMESTAMP | updated_at / included | RET-DEFAULT-TBD | T2-SCHEMA-001,T2-KEEP-001,T2-TIME-SEMANTICS-001 |
