# C1 Auth0 本地验证器包

飞连云端控制面身份迁移（C1 / Auth0 路线）的本地合成验证包。全部内容为
合成数据与本地契约验证：不连接真实 Auth0 租户、不触碰生产账户与密钥、
不构成生产迁移授权。方向与裁定见 `C1_AUTH0_PROGRESS_2026-11-08.md`。

## 内容

| 文件 | 作用 |
|---|---|
| `auth0-scrypt-import-validator.mjs` | 仓库 scrypt 信封 → Auth0 `custom_password_hash` 转换、导入门（已证明超长拦截/无证明暂缓）、首次登录验证与 bcrypt 转存的本地建模 |
| `bcrypt-stage.mjs` | 经 Python pyca/bcrypt 5.0.0 执行真实 bcrypt 阶段（见下方依赖） |
| `login-attestation.mjs` | 迁移前登录证明窗口（方案 A）：只落桶位事实；edgeWhitespace cohort 在 Browser/Android/Admin 的 pre-Auth0 trim-only 证明完成前 fail-closed 暂缓（兼容性证明门，不是待选政策） |
| `tenant-isolation.mjs` | Portal/Admin 双租户隔离契约测试层（直接复用 `server/services/platform/` 的已批准原语） |
| `mock-auth0.mjs` | Auth0 形状的本地模拟租户（导入/登录/转存/Ed25519 令牌/TOTP/撤销） |
| `STEP6_REAL_TENANT_VERIFICATION_2026-11-08.md` | Auth0 非生产真实租户的供应商行为证据；不含凭据，不代表生产准入 |
| `*.test.mjs` | 对应测试；`step6-verification.test.mjs` 为第 6 步端到端场景 S0–S9 |
| `ATTESTATION_WINDOW_DESIGN_V1.md` | 证明窗口设计与失败语义 |
| `R1_PASSWORD_NORMALIZATION_DECISION_2026-11-08.md` | R1 已批准 trim-only 政策与客户端兼容验收门 |
| `RISK_A_PASSWORD_ATTESTATION_GATE_DRAFT_2026-11-08.md` | 生产证明窗口 Risk A 门禁包草案（未获批准） |
| 其他验证记录 | 本地合成测试证据 |

## 运行

固定环境 Node v22.23.1。bcrypt 阶段需要 pyca/bcrypt（平台相关二进制
不入仓）：

```bash
pip3 install --target tools/c1-auth0-validator/vendor "bcrypt==5.0.0"
node --test tools/c1-auth0-validator/*.test.mjs
```

预期：40/40 PASS（导入校验 12 + 登录证明 9 + 租户隔离 8 + 第 6 步
端到端 11）。`vendor/` 已被本目录 `.gitignore` 排除。
