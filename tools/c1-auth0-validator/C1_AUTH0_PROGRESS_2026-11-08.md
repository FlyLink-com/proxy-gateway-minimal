# C1 身份迁移（Auth0 路线）进展与测试结果

日期：2026-11-08（America/Los_Angeles）
范围：Cloudflare T2 子线 C1（身份与认证托管）+ C2 相关原语。全部工作为
源码/本地合成层；未触碰生产，未创建真实供应商租户，未合并、未部署。

## 一、今日裁定汇总（均为 Yi 裁定）

1. **C1-D01**：选定 Auth0 Essentials + Bulk User Import 为云端控制面
   身份托管路线。此为架构选型授权，不含创建租户、不含迁移生产用户。
2. **超长密码（>72 UTF-8 字节）**：定向通知 + 用户重置；绝不截断、
   绝不静默修改密码。
3. **识别机制**：方案 A——迁移前登录证明窗口（用户在旧系统成功登录
   的瞬间瞬时测长，只落桶位事实，永不落密码或确切长度）。
4. **TOTP**：T1——迁 Auth0 MFA，原已绑定者重新绑定；旧 TOTP 密钥
   （`enc:` 与 `v2:` 两类）切换时全部作废、不迁移。**用户端自愿**
   （设置内绑定，不绑不拦登录）；**Admin 强制**（未绑不得进入）。
5. **隔离**：Portal 与 Admin 双租户隔离，身份与因子互不复用。
6. **第 6 步**：在当前 VM 内以本地模拟方式执行（Yi 指示）；真实
   租户仍待另行申请。

## 二、六步执行状态

| 步骤 | 内容 | 状态 | 证据 |
|---|---|---|---|
| 1 | 本地构建 Auth0 Scrypt 合成导入验证器 | 完成 | 转换逐字保真 + Node/Python 已知答案交叉核对 |
| 2 | 71/72/73 UTF-8 字节边界 | 完成 | 71/72 全周期通过；73 在 scrypt 阶段即被区分；导入门拦截已证明超长账户 |
| 3 | 空格处理、中文密码、首次登录重哈希 | 完成 | R1 trim-only 政策已批准（注册/登录一致、仅去首尾空白）；Auth0 本身不自动 trim，edgeWhitespace=true 在 Browser/Android/Admin 的 pre-Auth0 归一化证明完成前暂缓导入；无法证明的托管登录路径采用通知式重置；中文按字节判定（24 字=72B 可导入、25 字=75B 转重置）；危险演示：绕过导入门时重哈希后同前缀异密码被接受 |
| 4 | 超长账户安全识别 + 定向重置机制 | 完成 | 设计文档 + 本地实现：只落 {账户引用, 桶位, 边缘空白标记, 时间}，形状门拒绝夹带字段 |
| 5 | Portal/Admin 隔离 + TOTP 兼容方案 | 完成 | 方案文档（含 T1 裁定附记）+ 隔离测试直接复用已批准原语 |
| 6 | 非生产环境验证 | **VM 内完成**；真实租户部分未执行 | 端到端场景 S0–S9 全过；真实租户五项供应商行为待验（见第 6 步记录） |

## 三、测试结果总表

| 对象 | 环境 | 结果 |
|---|---|---|
| 本地验证器包（`tools/c1-auth0-validator/`，PR #844 独立 Draft 分支） | Node v22.23.1；bcrypt 阶段为真实 pyca/bcrypt 5.0.0 | **40/40 PASS**（导入校验 12 + 登录证明 9 + 租户隔离 8 + 第 6 步端到端 11），0 失败 0 跳过；Node 22.23.1 固定环境独立复跑两次 |
| 仓库 C1/C2 修复分支（PR #842，head `bc3f8c9a`） | Node v22.23.1 本地精确 head | 相关 4 文件 **48/48 PASS**；全量回归与基线 `bf200c47` 逐名比对**零新增失败**（基线 156 项失败两边一致；1 项为全量时序抖动，隔离重跑 5/5） |
| 演练分支（head `bf200c47`） | Node v22.23.1 | 20/20 PASS（先前轮次固定环境回归） |

PR #842 状态：已获 gccltdco-cmd **APPROVED**（review `5817529933`，
绑定 head `bc3f8c9a` 回读核验，未被撤销）；仍为 Draft、未合并。
注：该 PR 无托管 CI 运行（Draft + base 分支触发条件），批准依据为
本地精确 head 执行，不声称 CI 通过。

### 3.1 2026-11-08 独立复测与验证器硬化补记

本轮在隔离 Vercel 非生产 Sandbox 内重新取得验证证据，未连接 Auth0、Cloudflare、BWH 或任何生产端点：

- Runtime：Node v22.23.1；Python 3.9.25；pyca/bcrypt 5.0.0。
- 原始 PR #844 验证器基线：37/37 PASS，两次独立运行。
- 发现并修复三项验证器缺陷：
  1. legacy Scrypt envelope 的 Base64URL 解码过于宽松；现要求规范、无填充 Base64URL，16-byte salt 与 64-byte hash。
  2. Auth0 custom_password_hash shape gate 未完整要求 salt/password 子对象；现对外层与嵌套键集、UTF-8 password encoding、hash 长度和材料编码执行严格校验。
  3. 模拟导入管线未核对 attestation.accountRef 与目标 accountRef；现先对整批记录执行账户绑定预检，错配整批 fail-closed，避免部分导入。
- 新增 3 项回归，测试总数从 37 增至 **40**。
- 修复后连续两次：**40/40 PASS**，0 failed / 0 skipped。
- `node --check`：9/9 PASS。
- TAP SHA-256：Run 1 `24132d4730f8d3f23c90186c2c369d5f99fc191fec20e769a51cb14acb8f26cf`；Run 2 `71dd212be7fadf66a067be1565ff5a816e7a0bd681a2b4992dc9251f0fc8bf96`。
- 保留 `edgeWhitespace=true` cohort 的 fail-closed 暂缓：原因是 Browser/Android/Admin 在 Auth0 前执行同一 trim-only 的路径证据尚未齐全，而非等待重新选择 R1 政策；未证明的托管登录路径须走通知式重置。S3 直接验证 Auth0-shaped 本地模型，不依赖该 cohort 被导入。
- 本次仅修复本地合成验证器，不改变生产认证代码，不代表 Auth0 真实租户行为已经验证。

## 四、当前状态口径（不合并三种状态）

- **C1**：方向已批准；本地技术验证完成；**正式验收 OPEN**。
- **C2**：密钥原语与隔离已验证；**正式验收 OPEN**；真实密钥托管
  方案与责任人未批准（ADR 仍为实现草案）。
- **T2 总体验收**：BLOCKED，不变。
- **生产**：未触碰。生产仍为 pr799，BWH 仍是唯一生产控制权威；
  本轮无合并、无部署、无 BWH 连接。

## 五、未完成清单（不冒充关闭）

1. 真实 Auth0 租户验证：批量导入任务的真实接受行为、Auth0 内部
   重哈希的确切行为、真实 JWKS 端点验签、MFA 自助绑定的真实
   API/UX、租户开通与套餐事项——待 Yi 单独批准创建非生产租户。
2. 证明窗口的生产接入（Risk A）：已形成门禁包草案；窗口时长、存储位置、通知文案/重置流和销毁时机仍待批准。
3. R1 政策已批准 trim-only；剩余工作是补齐 Browser / Android / Admin 全路径在密码离开客户端前执行同一规范的代码与测试证据。无法证明的托管登录路径采用通知式重置；证明完成前对应 cohort 保持暂缓。
4. Wallet-first 两个历史 SHA-256 字段的兼容迁移归属裁定。
5. 真实密钥托管与独立备份/恢复演练。
6. 历史 TOTP 账户归属证明。
7. C1/C2 正式独立（人工）审查签署——本轮参与方均参与过实现，
   不能自任独立审查人。
8. 验证器包已独立放在 PR #844 Draft 分支；不得挂到 #842 分支，避免改变 #842 已批准的绑定 Head。PR #844 仍需精确 Head 审查。

## 六、下一步

- 继续在独立 Draft PR #844 内收口验证器代码、回归与证据文档；不得修改 #842 已批准的源码 Head。
- 对 PR #844 当前精确 Head 发起源码审查；保持 Draft，不自动合并或部署。
- PR #844 的 R1 文档已按既有 trim-only 政策校正；客户端兼容证明仍待完成。生产登录 hook 与证明窗口持久化仍须单独 Risk A 决策/授权。
- 真实非生产 Auth0 租户创建、真实用户导入与供应商行为确认仍需 Yi 单独批准；本次“继续”不等于该项授权。


## 2026-11-08｜Step 6 真实 Auth0 非生产租户验证补记

本节补充真实供应商行为证据；上文第 6 步“真实租户未执行”是本地验证器最初完成时的历史状态，现已由本节更新。完整、脱敏且不含凭据的证据记录见 `STEP6_REAL_TENANT_VERIFICATION_2026-11-08.md`。

- **真实批量导入：PASS，但发现导入校验浅。** Portal 合成主任务 `job_2Mk5zCWax9LmgUE2` 插入 5/5；故意截断至 32-byte hash、却声明 keylen 64 的坏记录也被 Auth0 接受（1/1），登录时才返回 403 `Password change required.`。导入前 canonical envelope、salt/hash/keylen、算法参数、accountRef 绑定、attestation 与批次完整性校验仍是唯一可靠防线。
- **Scrypt → bcrypt lazy rehash：PASS，72-byte hazard 坐实。** 80-byte 合成密码首次 Scrypt 登录成功后，仅前 72 bytes 也能登录。C1-D01 >72 UTF-8-byte 用户定向通知重置、禁止截断、重置前不得导入，得到真实供应商证据支持。
- **R1 trim-only：PASS。** 带首尾空白的原始输入失败，trim 后形式成功；Auth0 不自动执行旧系统 trim。已批准的 trim-only 必须在每个支持的客户端/路径进入 Auth0 前完成。
- **真实 JWKS / 双租户隔离：PASS。** Portal/Admin 的真实 RS256 id_token 各自通过本租户 JWKS 验签，跨租户双向拒绝；Portal 合成用户在 Admin 用户库查询为 0。
- **Admin MFA：PASS。** all-applications 策略下未绑定用户被 `mfa_required` 拦截；`/mfa/associate` + `mfa-otp` 自助绑定与登录流程通过。错码及同窗口重放被拒，新窗口码成功；重放防护为本次时序观察支持的结论。Portal 仍保持 T1 自愿 MFA。
- 租户均为 DEVELOPMENT 非生产租户，使用 `example.test` 合成用户；未升级付费套餐。Default App client_secret 已轮换，短期 Management API token 与本地会话秘密已按记录清理；仓库不保存凭据。

### 状态修正

- C1 不再以“真实 Auth0 Provider 行为未验证”作为阻塞项；Step 6 的真实非生产供应商行为验证通过。
- C1 整体仍 OPEN：Admin R1 修复仍在 Draft child PR #848；Cloudflare Gateway OIDC/JWKS adapter 与业务域授权集成、生产证明窗口、真实用户迁移/批次对账、生产租户决策、Hosted Login UX/邮件配置尚未完成。
- Browser / Android 已有 trim-only 源码与测试证据；Admin 修复位于 PR #848，尚未精确 Head review / 集成。故 `edgeWhitespace=true` cohort 继续 fail-closed。
- T2 仍 BLOCKED / NOT READY；不启动 T3 target DDL 或 G6 migration rehearsal。BWH 仍是唯一生产控制数据写入权威。
