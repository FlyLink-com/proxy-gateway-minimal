# Portal 独立演进：源码基线

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_independent_source_baseline
  superseded_by: null
  last_verified_at: 2026-09-19
  production_authority: false
```

## 目的与边界

本文是 Portal 独立演进的源码、构建和发布 seam inventory。它只描述
当前指定 Git worktree 中可读到的 source/build 事实，不代表 artifact
仍被保留、不代表 CDN/provider 正在服务该版本，也不代表生产功能已启用。

跟踪引用为 Issue #527（source-boundary work）。Issue 的状态、alignment
日期和后续关闭决定以原生 Issue 为准；本文不修改或宣布关闭该 Issue。

源码观察基线：`3937c0ff909a21aaee901fdcffb25bf81336a122`，分支
`docs/portal-independent-plan-20260919`。这两个值是本次 source readback 的
工作区身份，不属于文档 metadata，也不构成生产身份。

Risk: C。Process: docs-only source inventory；Expected PR count: 1；
Validation: 路径链接检查、`git diff --check`；Production/AWS impact: none。

## 事实来源与分类

- [admin/README.md](../admin/README.md) 把 `admin/` 定义为 Admin、Portal
  和 company-site 的共同 React/Vite source workspace，并明确三者是不同的
  release/deployment unit。
- [ACTIVE_FRONTEND_MAP.md](ACTIVE_FRONTEND_MAP.md) 在其 2026-08-28 cutoff
  将 Portal source/build cohort（入口、页面、client、stylesheet、
  `dist-portal`）分类为 `ACTIVE_SOURCE_UNBOUND`，并将 Portal
  serving/deployment state 分类为 `RUNTIME_ONLY_UNKNOWN`；本文不把这个旧
  cutoff 当作 2026-09-19 的 provider/runtime 新现场观察。
- 本文对 2026-09-19 exact HEAD 的 source readback 仍能定位同一 Portal
  entry/build seam 与相关 source cohort，因此可说明当前源码与该 map 的
  source 分类相符；生产 serving 分类仍沿用“未知”，没有在本轮重新分类。
- [scripts/check-frontend-source-boundaries.mjs](../scripts/check-frontend-source-boundaries.mjs)
  是当前 source graph、entry import、CSS import、Vite config 和已知跨面
  边界的 contract 定义；其 `productionAuthority` 固定为 `false`。
- 本文 source 结论绑定上方正文中的 exact HEAD。较早文档中的观察 commit
  仅作历史参考，不覆盖本次 source readback。

## Portal source/build/release seam

```text
admin/portal/index.html
  -> admin/src/portal-main.tsx
  -> admin/vite.portal.config.ts
  -> admin/dist-portal
```

- [admin/portal/index.html](../admin/portal/index.html) 的 module script 指向
  `../src/portal-main.tsx`，并使用 Portal favicon、title 和 description。
- [admin/src/portal-main.tsx](../admin/src/portal-main.tsx) 装配
  `UserRegistrationPage`、`UserPortalPage`、HTTP client 和
  `portal-static-preserve.css`；`/portal/register` 选择注册页，其余路径
  进入用户中心页。
- [admin/vite.portal.config.ts](../admin/vite.portal.config.ts) 以
  `admin/portal` 为 root、`admin/public` 为 publicDir，将输出写入
  `admin/dist-portal`，并生成非敏感的 `portal-recharge-config.json` build
  asset。它读取 `VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON`，但本
  文不记录其值。
- [admin/package.json](../admin/package.json) 的 `build:portal` 先运行
  TypeScript no-emit，再使用 Portal Vite config；root
  [package.json](../package.json) 暴露 `admin:portal:build` 和
  `admin:portal:verify`。
- source API seam 是 `/api/portal/*`：
  [user-portal-http.ts](../admin/src/features/user-portal/user-portal-http.ts)
  负责 session、registration、access request、payment、security、resource
  和 support 请求；[portal-browser-session.ts](../admin/src/features/user-portal/portal-browser-session.ts)
  将 browser-session transport 限制在同源 `/api/portal/`；commerce、recharge、
  wallet、referral clients 位于各自 feature 子目录。

### Build/verify boundary

- [vite.portal.local-api-validation.config.ts](../admin/vite.portal.local-api-validation.config.ts)
  复用 Portal build config，只在 loopback `127.0.0.1:5175` 提供本地验证
  server，并把 `/api` proxy 到 `127.0.0.1:3457`；这是 local validation
  seam，不是公网或生产入口。
- [scripts/verify-portal-build.mjs](../scripts/verify-portal-build.mjs) 对
  `admin/dist-portal` 检查 `index.html`、JavaScript/CSS asset、充值 config
  identity、Portal runtime markers，并拒绝 Admin shell、旧身份和敏感 marker
  出现在 build 输出中。该检查验证 artifact 形状，不授予 production authority。
- source boundary contract 还记录 Portal entry 的四个直接 imports、Portal
  preserve stylesheet 的 11 个 CSS imports，以及 `admin/dist-portal` 作为
  Portal build output；这些数量以当前脚本常量为准。
- 本文不把未生成的 `dist-portal`、过期 artifact 或本地 preview 当作 serving
  proof；任何 release promotion 仍须独立的 production inventory 与授权。

## 页面 ID、模块与测试位置

`PortalView` 在 [user-portal-page.tsx](../admin/src/features/user-portal/user-portal-page.tsx)
中定义十个 ID；导航实际输出 `data-portal-view`。下面的模块和测试均为
当前源码中的实际路径，不把未来页面或生产启用状态写成当前事实。

| feature domain | page ID / route | source modules | representative tests |
| --- | --- | --- | --- |
| 登录与注册 | `/portal/register`；登录/认证为 shell entry state | [portal-main.tsx](../admin/src/portal-main.tsx)、[user-registration-page.tsx](../admin/src/features/user-portal/user-registration-page.tsx)、[user-portal-page.tsx](../admin/src/features/user-portal/user-portal-page.tsx)、[user-portal-http.ts](../admin/src/features/user-portal/user-portal-http.ts) | [user-portal.test.tsx](../admin/src/test/user-portal.test.tsx)、[portal-browser-session.test.ts](../admin/src/test/portal-browser-session.test.ts)、[app-portal-boundary.test.tsx](../admin/src/test/app-portal-boundary.test.tsx) |
| 服务入口与套餐用量 | `start`, `dashboard`, `usage` | `user-portal-page.tsx` 中的 `UseGuide`、`DashboardPanel`、`UsagePanel`；[user-portal-types.ts](../admin/src/features/user-portal/user-portal-types.ts) | [user-portal.test.tsx](../admin/src/test/user-portal.test.tsx)、[portal-current-resource-client.test.ts](../admin/src/test/portal-current-resource-client.test.ts) |
| 商城与商品目录 | `marketplace` | [portal-commerce-panels.tsx](../admin/src/features/user-portal/portal-commerce-panels.tsx)、[marketplace-offer-card.tsx](../admin/src/features/user-portal/marketplace-offer-card.tsx)、[commerce/](../admin/src/features/user-portal/commerce/index.ts)、[wallet-first-marketplace-panel.tsx](../admin/src/features/user-portal/wallet-first-marketplace-panel.tsx) | [portal-marketplace-offer-card.test.tsx](../admin/src/test/portal-marketplace-offer-card.test.tsx)、[portal-coins-marketplace.test.tsx](../admin/src/test/portal-coins-marketplace.test.tsx)、[portal-wallet-first-marketplace.test.tsx](../admin/src/test/portal-wallet-first-marketplace.test.tsx) |
| 订单与支付 | `orders` | [portal-orders-panel.tsx](../admin/src/features/user-portal/orders/portal-orders-panel.tsx)、[portal-order-center-model.ts](../admin/src/features/user-portal/orders/portal-order-center-model.ts)、[recharge/](../admin/src/features/user-portal/recharge/index.ts)、`user-portal-page.tsx` 内 legacy payment flow | [portal-orders-panel.test.tsx](../admin/src/test/portal-orders-panel.test.tsx)、[portal-recharge.test.tsx](../admin/src/test/portal-recharge.test.tsx)、[portal-recharge-payment-handoff.test.ts](../admin/src/test/portal-recharge-payment-handoff.test.ts)、[portal-coins-purchase-flow.test.tsx](../admin/src/test/portal-coins-purchase-flow.test.tsx) |
| Coins 钱包 | `wallet` | [wallet/](../admin/src/features/user-portal/wallet/index.ts)、`PortalWalletPanel`、`use-portal-wallet-read-model.ts` | [portal-wallet-panel.test.tsx](../admin/src/test/portal-wallet-panel.test.tsx)、[portal-wallet-client.test.ts](../admin/src/test/portal-wallet-client.test.ts)、[portal-wallet-auto-refresh.test.tsx](../admin/src/test/portal-wallet-auto-refresh.test.tsx) |
| 推荐奖励 | `referrals` | [referrals/](../admin/src/features/user-portal/referrals/referral-client.ts)、`ReferralRewardsPanel` | [portal-referral-panel.test.tsx](../admin/src/test/portal-referral-panel.test.tsx)、[portal-referral-client.test.ts](../admin/src/test/portal-referral-client.test.ts) |
| 个人中心与安全 | `profile` | [profile/](../admin/src/features/user-portal/profile/portal-personal-center-panel.tsx)、`portal-profile-panel.tsx`、`portal-security-panel.tsx`、[totp-preview.ts](../admin/src/features/user-portal/totp-preview.ts) | [user-portal.test.tsx](../admin/src/test/user-portal.test.tsx)、[portal-browser-session-page.test.tsx](../admin/src/test/portal-browser-session-page.test.tsx) |
| 显示偏好 | `settings` | `user-portal-page.tsx` 的 settings section、[public-locale-switch.tsx](../admin/src/features/user-portal/public-locale-switch.tsx)、[public-locale.ts](../admin/src/app/public-locale.ts) | [public-locale-switch.test.tsx](../admin/src/test/public-locale-switch.test.tsx)、[user-portal.test.tsx](../admin/src/test/user-portal.test.tsx) |
| 支持请求 | `support` | `user-portal-page.tsx` 内 `SupportPanel`、[user-portal-http.ts](../admin/src/features/user-portal/user-portal-http.ts) 的 support request client | [user-portal.test.tsx](../admin/src/test/user-portal.test.tsx) |

## 允许的共享模块与 Admin 反向导入

Issue #527 的当前源码 boundary contract 允许 Portal 使用以下五个 shared
modules；它们不是 Portal 独有模块，也不是生产发布证明：

1. [admin/src/app/public-locale.ts](../admin/src/app/public-locale.ts)
2. [admin/src/components/modal-frame.tsx](../admin/src/components/modal-frame.tsx)
3. [admin/src/lib/clipboard.ts](../admin/src/lib/clipboard.ts)
4. [admin/src/lib/errors.ts](../admin/src/lib/errors.ts)
5. [admin/src/lib/utils.ts](../admin/src/lib/utils.ts)

当前 Admin 仍反向触达 Portal/company-site/fixture seam：

- [admin/src/App.tsx](../admin/src/App.tsx) 静态导入 `UserPortalPage`、
  `user-portal-client`、`CompanySitePage` 和 Admin fixture/auth/shell；它还
  动态导入 `user-portal-route` 与 Admin production-baseline preview。
- source-boundary script 将这些已知边记录为 Admin -> Portal 三条边、Admin ->
  site 一条边，以及 fixture edges；这些是已知 boundary debt，不应被解释
  为可直接删除的“旧代码”。
- [admin/src/components/primitives/panel-frame.tsx](../admin/src/components/primitives/panel-frame.tsx)
  和 [admin/src/app/admin-ui-projection.ts](../admin/src/app/admin-ui-projection.ts)
  仍引用 `admin-fixture-preview`；Portal local preview 仍通过
  `user-portal-local.ts` 触达 `totp-preview.ts`。fixture/test support 的
  source presence 不能作为 production evidence。

## CSS debt 与当前保留边界

- [admin/src/portal-static-preserve.css](../admin/src/portal-static-preserve.css)
  当前静态 import 11 个 CSS 文件，包含 tokens、base、responsive、Portal
  desktop/commerce，以及名称带 Admin、public-site、legacy 的文件。
- [admin/src/styles.css](../admin/src/styles.css) 当前静态 import 9 个 CSS
  文件，且仍被 Admin 与 company-site entry 使用；不能因文件名判断它们
  已退出 active source。
- `admin/src/styles/portal-static-preserve/` 的 11 个输入都在当前 Portal
  build chain 中；[ACTIVE_FRONTEND_MAP.md](ACTIVE_FRONTEND_MAP.md) 记录其
  中对应 ordinary/preserve 文件并非都可按名称去重。拆分、重命名、移除或
  改变输出属于后续 Risk B source-boundary change，不是本 C 档 inventory。

## Source、artifact、production 的分离结论

已知：当前 exact HEAD 有 Portal entry、React source、Vite config、明确的
`admin/dist-portal` 输出 seam，以及 `/api/portal/*` source clients。

未知：本记录没有 provider、CDN、host、runtime 或 production serving readback；
不能确认 `dist-portal` 是否已构建、保留、上传、正在服务或与任何生产版本
一致。旧 deployment/release 记录不会改变这一结论。

因此，本 baseline 只可作为 Portal source ownership/build-boundary 输入，
不构成 release approval、production inventory、deployment identity、rollback
依据，也不声明任何 Portal feature 已在生产启用。
