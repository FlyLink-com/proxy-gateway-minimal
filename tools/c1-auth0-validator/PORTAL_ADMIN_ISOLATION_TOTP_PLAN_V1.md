# 第 5 步方案 V1：Portal/Admin 隔离与 TOTP 兼容

状态：历史设计稿 + 本地合成契约验证；最终执行口径以第六节 T1 裁定为准。
依据 Yi 2026-11-08 裁定：C1-D01 选定 Auth0 路线；配套原则第 4 条——Portal 与 Admin 必须隔离，
不能互相复用身份和认证因子（C1-D03 由此确认）。本文件不授权创建租户、
不授权迁移任何真实身份或因子。

## 一、隔离架构：双租户

Portal 与 Admin 使用**两个独立的 Auth0 租户**，而不是同一租户内的两个
连接/应用。理由：只有租户级隔离才能同时切断用户库、因子注册、签名密钥、
会话与撤销域四个平面；同租户多连接在 Auth0 的 MFA 注册与会话语义上仍有
共享面，不满足“不能互相复用身份和认证因子”的裁定强度。

| 平面 | Portal 租户 | Admin 租户 | 隔离机制 |
|---|---|---|---|
| 用户库 | 终端用户 | 管理员（极少数） | 独立租户用户库，无同步、无联合 |
| issuer | `flylink-portal-auth0`（合成示意） | `flylink-admin-auth0`（合成示意） | 控制面按面配置**单一** issuer 白名单 |
| 签名密钥 | 租户独立 | 租户独立 | Auth0 租户级密钥，天然不共享 |
| 密码凭证 | 第 1–4 步的导入/重置流程 | 管理员单独入驻（不批量导入普通用户流程） | 流程与人群完全分开 |
| TOTP 因子 | 在 Portal 租户/族内注册 | 在 Admin 租户/族内**单独**注册 | 注册不跨租户存在；见第三节 |
| 会话/撤销 | 本租户会话域 | 本租户会话域 | 撤销按 (issuer, session) 定域，互不影响 |
| 客户端应用 | Portal 应用 | Admin 应用 | client 凭证分属不同租户，泄露不横向 |

控制面侧的强制点（已由 `d1-t2-identity-boundary.mjs` 提供原语，本步以
合成契约钉住用法）：

- 每个面调用 `parseTrustedIdentityActorContext` 时，`allowedIssuers`
  只含本面 issuer——对方 issuer 的上下文在本地校验即被拒绝
  （`identity_issuer_not_allowed`），因子的有无不能越过 issuer 边界。
- Admin 面强制 `requiredFactors: ["totp"]`；Portal 面不强制。
- 身份绑定（identity binding）以 (issuer, subject) 为键解析：同一
  subject 引用在 Portal issuer 下的绑定对 Admin issuer 不可见，
  Admin 侧必须有独立绑定记录才可解析，杜绝“一处绑定、两面通用”。

## 二、隔离的失效模式（设计要防住的）

- Portal 用户库泄露/撞库名单 → 对 Admin 无用（不同库、不同因子注册、
  不同 issuer，控制面直接拒绝跨 issuer 上下文）。
- Portal 租户的应用凭证泄露 → 不能铸造 Admin 上下文（issuer 不同 +
  Admin 还要求 TOTP 因子）。
- 某一面全量会话撤销（安全事件）→ 只影响该面，另一面不中断。
- 管理员同时是 Portal 用户 → 两边是**两个独立身份**，各自注册因子；
  Portal 侧的 TOTP 注册对 Admin 侧的因子要求毫无帮助（按裁定即应如此）。

## 三、TOTP 兼容

### 现状（已核验）

- legacy `enc:` 秘密等同明文存放（R3 BLOCKER）——这类秘密**没有资格被
  “迁移”**：把明文等价物搬进任何新系统都是延续已暴露的凭证材料。
- legacy `v2:` 秘密是 AES-256-GCM 信封（旧密钥、无 AAD 绑定）。解密后
  重保护曾是 T3 方案的一部分，但已被最终 T1 裁定取代；当前迁移路径
  不读取旧密钥、不解密、不重保护。结构可识别的 `enc:` 与 `v2:` 均
  退役并要求重新注册；结构异常的 `v2:` 进入 `quarantine`。
- C2 已建 v3 族隔离信封（`portal-totp-aes` / `admin-totp-aes` 两族，
  AAD 绑定 keyId+scope+credentialRef，并检测跨族复用），保留为托管资产，
  但退出 TOTP 迁移关键路径。
- 既定口径不变：TOTP 密钥 EXTERNALIZE、永不进入 D1；密钥托管/轮换
  按 C2 ADR（IMPLEMENTATION DRAFT，托管方与责任人仍未批准）。

### 三个选项

**T1 全部重新注册（Auth0 MFA，最终采用）**：旧 `enc:` / `v2:` 因子
整体作废，不导入、不解密、不重保护。原已绑定用户收到重新绑定邀请；
Portal 端在设置中自愿绑定，Admin 面强制绑定；从未绑定的 Portal 用户不受影响。
+ 安全姿态最干净，`enc:` 明文等价物彻底退役；与超长密码定向重置可
  合并为同一次“安全更新”通知。
− 摩擦最大；未及时重新注册的用户在过渡期没有第二因子（需明确过渡
  政策）；因子托管转移到 Auth0，与 EXTERNALIZE 的自有托管口径需要
  Yi 重新确认是否适用于 Auth0 托管路线。

**T2 秘密导入 Auth0（mfa_factors）**：Auth0 导入 Schema 形式上支持
`mfa_factors[].totp.secret`。
− 与 R3 结论正面冲突：`enc:` 秘密是明文等价物，不应被导入任何系统；
  对 `v2:` 秘密做解密再导入，等于把自有托管的密钥材料交给供应商，
  与 EXTERNALIZE + C2 族隔离托管的设计方向相反。**本方案不推荐，
  且 `enc:` 部分应明确禁止。**

**T3 自有托管 + 控制面 step-up（历史备选；已被最终 T1 裁定取代）**：密码身份在 Auth0；TOTP 验证
保留在控制面侧——用户在 Portal/Admin 登录后，控制面用既有
`portal-totp-verifier` + v3 族信封做 step-up 挑战，通过后在 actor
context 的 factors 中投影 `totp`（Admin 面由 `requiredFactors` 强制）。
`enc:` 账户强制重新注册（在自有托管内换发新秘密并以 v3 信封保护）；
`v2:` 账户经 `reencryptLegacyD1TotpV2` 重保护为 v3，无需用户动作。
+ 完整保留 EXTERNALIZE、C2 族隔离与轮换 ADR 的既有投入；Portal/Admin
  的 TOTP 秘密分属两族，跨面不可解封（本步合成测试已验证）；
  `enc:` 退役与 `v2:` 重保护都有现成代码路径。
− 认证流分两层（Auth0 一因子 + 控制面 step-up），会话与撤销设计必须
  覆盖两层（撤销注册表按 issuer 定域，本步已给出合成契约）；用户体验
  比单一 Auth0 MFA 多一步挑战（与现状一致，用户无感知变化）。

### 原建议（已被最终裁定取代）

本节早期曾建议采用 T3，并提出将 `v2:` 重保护为 v3；该建议已被
2026-11-08 的最终 T1 裁定取代，不再是当前执行口径。当前不导入、不解密、
不重保护任何 legacy TOTP 秘密；所有旧因子退役，按 Portal 自愿 / Admin
强制的规则在 Auth0 MFA 重新绑定。真实因子操作仍须遵守单独授权边界。

## 四、与前序步骤的衔接

- 密码轨（第 1–4 步）与 TOTP 轨相互独立：证明窗口只管密码长度分类，
  不测量、不记录任何因子信息。
- 通知合并：`over_72` 定向重置、`edgeWhitespace` 的 R1 通知、以及
  legacy TOTP 重新注册（`enc:` 与 `v2:` 账户）可在同一波“账户安全更新”中触达，
  减少用户被打扰次数；文案属生产门禁包内容，本步不拟。
- Admin 入驻顺序：Admin 租户与管理员身份应在 Portal 批量迁移之前
  就绪（管理面先行），但这只是顺序建议，租户创建本身属第 6 步的
  单独申请范围。

## 五、本轮交付物（本地合成）

- `tenant-isolation.mjs`：分面策略封装（单 issuer 白名单 + 分面
  requiredFactors）、按 issuer 定域的会话撤销注册表。
- `tenant-isolation.test.mjs`：跨面 issuer 拒绝、Admin 因子强制、
  绑定隔离、撤销隔离、TOTP 族隔离与 legacy 秘密处置（enc/v2→重新注册并退役、
  结构异常 v2→隔离）的合成验证；直接复用已批准 HEAD 中的
  identity-boundary 与 security-primitives 两个模块作为被测原语。

## 六、裁定记录（2026-11-08，Yi）

**Yi 裁定采用 T1**（动态码整体搬到 Auth0 MFA、全员重新绑定），未采用
本文推荐的 T3。裁定生效后的口径：

- 所有用户在 Auth0 侧重新注册验证器；Portal 与 Admin 分别注册，
  一面的注册不满足另一面的因子要求（隔离原则不变）。
- legacy 秘密（`enc:` 与 `v2:`）一律退役：不导入（T2 仍禁止）、
  也不再为迁移目的做 v2 重保护；C2 的 v3 族隔离原语保留为托管资产，
  但退出 TOTP 迁移关键路径。
- 过渡规则（Yi 2026-11-08 澄清）：**不强制绑定**。Portal 用户在
  设置中自愿绑定（与现行产品一致）；旧绑定作废者收到通知、邀请
  重新绑定，但登录不因未绑定受阻；从未绑定的用户不受影响。
  先前“首次登录强制注册才发放会话”的建议已撤回。Admin 面保留
  强制 TOTP（Yi 2026-11-08 确认）：未绑定动态码不能进入管理端。
- actor context 合同不变：Admin 仍强制 `totp` 因子，只是其来源由
  自有 step-up 改为 Auth0 MFA 的断言。
