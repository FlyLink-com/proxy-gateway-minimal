# Portal 独立演进：源码基线

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_independent_source_baseline
  superseded_by: null
  last_verified_at: 2026-09-20
  production_authority: false
```

## 目的与边界

本文是 Portal 独立演进的源码、构建和发布 seam inventory。它只记录本次
指定 worktree 的源码快照，以及已明确标注为历史 map 或既有 Deploy Note 的
资料；不代表 artifact 仍被保留、不代表 CDN/provider 正在服务该版本，也不
代表生产功能已启用。

跟踪引用为 Issue #527（source-boundary work）。Issue、PR 和部署状态仍以
原生记录为准；本文不修改或宣布关闭 Issue。

主要源码基线：`origin/master@41ea7b4389724812ba938f8df5480c638ab5b546`。
本次 source readback 使用的本地工作区是 `3bc238eb9262c8a08d93471b653b6e27cd9e528a`
（分支 `docs/portal-independent-plan-20260919`，该 merge commit 合入上述
master）；本地值仅作对照，不属于生产身份。

Risk: C。Process: docs-only source inventory；Expected PR count: 1；
Validation: 路径/链接核查、`git diff --check`；Production/AWS impact: none。

## 事实来源与分类

- `admin/README.md` 定义 `admin/` 为 Admin、桌面 Portal 和 company-site 的
  共同 React/Vite source workspace，三者仍是不同 release/deployment unit；
  本仓库的桌面 Portal 仍不是独立 package 或 repository。移动端另属
  `gccwebos-mobile` 独立仓库，见下文。
- `scripts/check-frontend-source-boundaries.mjs` 是当前 source graph、entry
  import、CSS import、Vite config、public inputs 和已知跨面边界的 contract；
  其返回值固定 `productionAuthority: false`。
- `docs/ACTIVE_FRONTEND_MAP.md` 的 2026-08-28 cutoff 是历史 map：它把
  Portal source/build cohort 记作 `ACTIVE_SOURCE_UNBOUND`，把 serving/deployment
  记作 `RUNTIME_ONLY_UNKNOWN`。本文引用它作为历史分类，不把它改写成新的
  provider/runtime 观察。
- 两条已存在的 Deploy Note 仅记录既有部署事实：[proxy-gateway-minimal
  PR #740 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/740#issuecomment-5753247117)
  和 [gccwebos-mobile PR #8 Deploy Note](https://github.com/gccltd/gccwebos-mobile/pull/8#issuecomment-5753247325)。
  本轮没有读取生产，也不从它们推导当前 serving identity。

## Portal source/build/release seam

```text
admin/portal/index.html       ─┐
admin/portal-web/index.html   ├─> admin/src/portal-main.tsx
                               └─> Portal Vite configs
                                   ├─> admin/dist-portal       (/portal)
                                   └─> admin/dist-portal-web   (/web/)
```

- `admin/portal/index.html` 和 `admin/portal-web/index.html` 都指向
  `../src/portal-main.tsx`。前者是 legacy `/portal` entry；后者由
  `vite.portal-web.config.ts` 复用 Portal config、设置 `base: "/web/"`，
  形成独立的 `/web/` 静态命名空间。
- `admin/src/portal-main.tsx` 当前有五个仓库内直接 imports（按 boundary contract，不含 React 等外部包）：
  `user-portal-client`、`user-portal-page`、`user-registration-page`、
  `portal-entry` 和 `portal-static-preserve.css`。它只挂载 Portal 注册页或
  用户中心页，不挂载 Admin shell。
- `admin/vite.portal.config.ts` 的 root 是 `admin/portal`、publicDir 是
  `admin/public`、输出是 `admin/dist-portal`，并生成非敏感的
  `portal-recharge-config.json` build asset；它读取
  `VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON`，本文不记录其值。
- `admin/vite.portal-web.config.ts` 通过 `mergeConfig` 复用上述 Portal policy /
  plugin，改用 `admin/portal-web` root、`/web/` base、`admin/dist-portal-web`
  output 和独立 preview port。两个 output 都仍需各自 artifact verifier；
  这对应已合入的 Portal desktop/build 与静态发布工作（PR #739/#740）。
- `admin/package.json` 提供 `build:portal`、`build:portal:web`、
  `verify:portal-build` 和 `verify:portal:web`；root `package.json` 暴露对应
  `admin:portal:*` scripts。双构建是 source/build seam，不是 production
  promotion 证据。

### Entry path 与静态资源命名空间

`admin/src/features/user-portal/portal-entry.ts` 是共享的入口路径/资源 seam：

- `isPortalWebPath()` 识别 `/web` 和 `/web/*`；`isPortalRegistrationPath()`
  同时识别 `/portal/register` 与 `/web/register`。
- `portalRoutePath()` 按当前路径选择 `/portal/` 或 `/web/` 的 login/register
  route；`portalAssetPath()` 按当前路径选择 `/asset` 或 `/web/asset`，避免
  desktop public images 脱离 `/web/` 静态 namespace。
- `portalDisplayPreferenceHref()` 仍支持显式的 mobile/auto preference link；
  这属于 URL routing seam，不等于页面内一定显示切换控件。
- API source seam 仍是同源 `/api/portal/*`。Portal client、browser-session、
  commerce、recharge、wallet 和 referral clients 位于各自
  `admin/src/features/user-portal/` 子目录。

### Build/verify boundary

- `vite.portal.local-api-validation.config.ts` 只为 loopback local validation
  提供 server，并把 `/api` proxy 到 loopback backend；它不是公网或生产入口。
- `scripts/verify-portal-build.mjs` 检查 `index.html`、JS/CSS assets、充值
  config identity、Portal markers，并拒绝 Admin shell、旧 identity 和敏感
  marker 出现在 `dist-portal` 或 `dist-portal-web` output 中。
- boundary contract 当前记录 Portal entry 的 5 个仓库内直接 imports、Portal
  preserve stylesheet 的 11 个 CSS imports、Admin stylesheet 的 9 个 imports，
  以及四个 build outputs：`admin/dist`、`admin/dist-portal`、
  `admin/dist-portal-web`、`admin/dist-site`。
- 本文不把未生成的 output、过期 artifact、local preview 或 verifier 结果当作
  serving proof；release promotion 仍需独立 production inventory 与授权。

## 页面 ID、模块与测试位置

`PortalView` 在 [user-portal-page.tsx](../admin/src/features/user-portal/user-portal-page.tsx)
中定义十个 ID；导航实际输出 `data-portal-view`。下表保留当前源码中的页面、
模块和代表性测试；它不把未来页面或生产启用状态写成当前事实。

| feature domain | page ID / route | source modules | representative tests |
| --- | --- | --- | --- |
| 登录与注册 | `/portal/register` 或 `/web/register`；登录/认证为 shell entry state | [portal-main.tsx](../admin/src/portal-main.tsx)、[user-registration-page.tsx](../admin/src/features/user-portal/user-registration-page.tsx)、[user-portal-page.tsx](../admin/src/features/user-portal/user-portal-page.tsx)、[user-portal-http.ts](../admin/src/features/user-portal/user-portal-http.ts) | [user-portal.test.tsx](../admin/src/test/user-portal.test.tsx)、[portal-browser-session.test.ts](../admin/src/test/portal-browser-session.test.ts)、[app-portal-boundary.test.tsx](../admin/src/test/app-portal-boundary.test.tsx) |
| 服务入口与套餐用量 | `start`, `dashboard`, `usage` | `user-portal-page.tsx` 中的 `UseGuide`、`DashboardPanel`、`UsagePanel`；[user-portal-types.ts](../admin/src/features/user-portal/user-portal-types.ts) | [user-portal.test.tsx](../admin/src/test/user-portal.test.tsx)、[portal-current-resource-client.test.ts](../admin/src/test/portal-current-resource-client.test.ts) |
| 商城与商品目录 | `marketplace` | [portal-commerce-panels.tsx](../admin/src/features/user-portal/portal-commerce-panels.tsx)、[marketplace-offer-card.tsx](../admin/src/features/user-portal/marketplace-offer-card.tsx)、[commerce/](../admin/src/features/user-portal/commerce/index.ts)、[wallet-first-marketplace-panel.tsx](../admin/src/features/user-portal/wallet-first-marketplace-panel.tsx) | [portal-marketplace-offer-card.test.tsx](../admin/src/test/portal-marketplace-offer-card.test.tsx)、[portal-coins-marketplace.test.tsx](../admin/src/test/portal-coins-marketplace.test.tsx)、[portal-wallet-first-marketplace.test.tsx](../admin/src/test/portal-wallet-first-marketplace.test.tsx) |
| 订单与支付 | `orders` | [portal-orders-panel.tsx](../admin/src/features/user-portal/orders/portal-orders-panel.tsx)、[portal-order-center-model.ts](../admin/src/features/user-portal/orders/portal-order-center-model.ts)、[recharge/](../admin/src/features/user-portal/recharge/index.ts)、`user-portal-page.tsx` 内 legacy payment flow | [portal-orders-panel.test.tsx](../admin/src/test/portal-orders-panel.test.tsx)、[portal-recharge.test.tsx](../admin/src/test/portal-recharge.test.tsx)、[portal-recharge-payment-handoff.test.ts](../admin/src/test/portal-recharge-payment-handoff.test.ts)、[portal-coins-purchase-flow.test.tsx](../admin/src/test/portal-coins-purchase-flow.test.tsx) |
| Coins 钱包 | `wallet` | [wallet/](../admin/src/features/user-portal/wallet/index.ts)、`PortalWalletPanel`、`use-portal-wallet-read-model.ts` | [portal-wallet-panel.test.tsx](../admin/src/test/portal-wallet-panel.test.tsx)、[portal-wallet-client.test.ts](../admin/src/test/portal-wallet-client.test.ts)、[portal-wallet-auto-refresh.test.tsx](../admin/src/test/portal-wallet-auto-refresh.test.tsx) |
| 推荐奖励 | `referrals` | [referrals/](../admin/src/features/user-portal/referrals/referral-client.ts)、`ReferralRewardsPanel` | [portal-referral-panel.test.tsx](../admin/src/test/portal-referral-panel.test.tsx)、[portal-referral-client.test.ts](../admin/src/test/portal-referral-client.test.ts) |
| 个人中心与安全 | `profile` | [profile/](../admin/src/features/user-portal/profile/portal-personal-center-panel.tsx)、`portal-profile-panel.tsx`、`portal-security-panel.tsx`、[totp-preview.ts](../admin/src/features/user-portal/totp-preview.ts)（仅本地 preview/fixture，不是 formal production dependency） | [user-portal.test.tsx](../admin/src/test/user-portal.test.tsx)、[portal-browser-session-page.test.tsx](../admin/src/test/portal-browser-session-page.test.tsx) |
| 显示偏好 | `settings` | `user-portal-page.tsx` 的 settings section、[public-locale-switch.tsx](../admin/src/features/user-portal/public-locale-switch.tsx)、[shared/public-locale.ts](../admin/src/shared/public/public-locale.ts) | [public-locale-switch.test.tsx](../admin/src/test/public-locale-switch.test.tsx)、[user-portal.test.tsx](../admin/src/test/user-portal.test.tsx) |
| 支持请求 | `support` | `user-portal-page.tsx` 内 `SupportPanel`、[user-portal-http.ts](../admin/src/features/user-portal/user-portal-http.ts) 的 support request client | [user-portal.test.tsx](../admin/src/test/user-portal.test.tsx) |

## 共享模块、preview 分离与 Admin 反向依赖

当前 boundary contract 允许 Portal 使用以下五个 `admin/src/shared/public/`
共享文件（PR #736 的当前 source 形态）：

1. `admin/src/shared/public/public-locale.ts`
2. `admin/src/shared/public/modal-frame.tsx`
3. `admin/src/shared/public/clipboard.ts`
4. `admin/src/shared/public/errors.ts`
5. `admin/src/shared/public/utils.ts`

Portal consumers 直接从 `shared/public` 使用这些 helper；旧的
`admin/src/app/public-locale.ts`、`admin/src/components/modal-frame.tsx` 和
`admin/src/lib/{clipboard,errors,utils}.ts` 保留为 compatibility re-export，
不是第二套实现。共享文件不能反向导入 surface-specific code。

Preview 与正式 Portal client/data 已分开：正式入口使用
`user-portal-client.ts`，本地 synthetic preview 使用
`user-portal-preview-client.ts`、`user-portal-local.ts` 和
`user-portal-preview-data.ts`，fixture/preview data 不进入正式 Portal build
graph。测试和 Admin dev preview 仍可触达这些 preview seams，不能将其 source
存在解释为 production evidence。

Admin 仍存在实际反向依赖，且由 boundary contract 以常量明确记录：

- `admin/src/App.tsx -> user-portal-preview-client.ts`
  （preview/fixture）、`user-portal-page.tsx` 和动态
  `user-portal-route.tsx`：3 条 Admin -> Portal edges；
- `admin/src/App.tsx -> company-site-page.tsx`：1 条 Admin -> site edge；
- fixture edges 仍包括 `admin-fixture-preview`、
  `admin-production-baseline-preview`、`admin-ui-projection`、
  `panel-frame`，以及 Portal local preview 对 preview-data / `totp-preview`
  的触达。

这些是已知 boundary debt 和 dev/test seam，不是可以按文件名直接删除的
“旧代码”。因此当前源码不能概括成“Portal 已全部独立”；Admin package、
toolchain、部分 source graph 与 CSS 仍耦合。

## 页面、CSS 和移动端边界

Portal page IDs 仍由 `user-portal-page.tsx` 的 `PortalView` 定义，现有页面和
代表性 tests 继续以该文件及 `admin/src/test/portal-*`、`user-portal.test.tsx`
为准；上方清单保留页面与测试映射。本次不改变 API 或页面行为。

`admin/src/portal-static-preserve.css` 当前仍静态 import 11 个 preserve CSS
文件；其中包含 tokens/base/responsive、Portal desktop/commerce，以及名称带
Admin、public-site、legacy 的输入。`admin/src/styles.css` 当前仍 import 9 个
文件，并由 Admin 与 company-site entry 使用。CSS 与 Admin source/toolchain
耦合仍存在；拆分、重命名、移除或改变输出属于后续 Risk B source-boundary
change，不是本 C 档 inventory。

移动端是独立仓库 [gccwebos-mobile](https://github.com/gccltd/gccwebos-mobile)，
本次只读 checkout 为 `D:/Projects/gccwebos-mobile/.worktrees/hide-device-switch`
的 `835b79c32550a38c53f9e662d9055a5f93627972`（PR #8 的最终受审 head；其
tree 与该 PR 合并提交 `fb917521a45500b415bc5aeb1dbcdfcbf8783247` 相符）。其 README/package/src
表明移动端拥有独立 Vite/React source、`src/main.jsx`、移动导航和
`/api/portal/*` clients；它不是本仓库 Portal source 的子目录。该 checkout
的 `835b79c` 在界面源码中的变更仅从 `src/components/AppFrame.jsx` 移除
`DisplayModeSwitch` import/mount，保留 `display-mode.mjs` 的自动/显式 URL
路由和存储偏好；因此“隐藏切换按钮”不等于删除 device routing，也不代表
生产已启用或完成物理设备验收。

## Source、历史 map、部署记录与生产的分离结论

已知（本次源码快照）：共同 `admin/` workspace、五个 `shared/public` helper、
正式/preview client-data 分离、3+1 条 Admin 反向边、Portal entry 的 5 个
仓库内 imports、11/9 个 CSS imports、`dist-portal` 与 `dist-portal-web` 双 output、
`portal-entry.ts` 的 `/portal`/`/web` route 与 asset namespace，以及移动端
隐藏可见切换控件后的独立 routing source。

已知（历史资料）：`ACTIVE_FRONTEND_MAP.md` 的 source/runtime 分类，以及上面
链接的两条既有 Deploy Note。Deploy Note 证明各自记录时已经有对应的
source/artifact/deployment 事实；本轮没有重新读取 provider、CDN、host 或
runtime，不能据此断言此后仍在服务，也不授予 production authority。

未知：本轮没有 provider、CDN、host、Nginx、runtime 或 production serving
readback，也没有重新核对其后是否变化。不能把本轮未读现场解释为当前
serving identity；没有从 `.env`、私钥、token、数据库或客户数据取证。

因此，本 baseline 只可作为 Portal source ownership/build-boundary 输入，不
构成 release approval、production inventory、deployment identity、rollback
依据，也不声明 Portal、Admin、company-site 或 mobile feature 已在生产启用。
