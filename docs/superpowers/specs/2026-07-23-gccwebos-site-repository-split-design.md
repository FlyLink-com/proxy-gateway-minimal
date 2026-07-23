# GCC WebOS 官网独立仓库迁移设计

日期：2026-07-23

状态：设计已确认；实施计划待评审

文档风险：C

后续执行风险：B（源码抽取）+ A（Vercel 仓库重连、候选部署与生产提升）

生产授权：无

## 1. 背景与问题

GCC WebOS 官网当前与 Portal、Admin 和后端共存于
`gccwebos-com/proxy-gateway-minimal` 私有组织仓库。官网源码已经完成第一轮品牌与商业化改造，
但当前 Vercel Git Integration 仍指向旧的个人仓库归属，合并后的准确 `master` 源码没有自动生成
新的 Vercel 候选部署。

用户已决定将官网拆分到个人私有仓库
`gaoyi1020-web/gccwebos-site`，并在迁移稳定上线前保留组织仓库内的官网源码作为只读回滚来源。
本设计解决仓库边界、源码抽取、验证和 Vercel 切换顺序，不改变官网产品定位或重新建设
Design System。

源基线固定为：

```yaml
source_repository: gccwebos-com/proxy-gateway-minimal
source_commit: 8115a81e750e05fb1ce7f5e30acd847c1f88ab97
source_tree: 60c8562e5a7d378a0b021eccc2e30f1bbffcf910
source_pr: 528
release_unit: company-site-static
frontend_surface: company-site
```

这组身份仅定义迁移输入，不代表该源码已经部署到生产。

## 2. 目标

1. 建立一个只承载 GCC WebOS 营销官网的个人私有仓库。
2. 保持当前已确认的品牌风格、双语文案、CTA、移动端交互和无障碍行为。
3. 保持现有公开线索接口和 Portal 注册、登录跳转协议不变。
4. 用独立构建、测试和验证脚本证明新仓库不依赖 Admin、Portal 或后端源码。
5. 在不移动自定义域名的前提下，让 Vercel 从新仓库生成可独立审查的候选部署。
6. 候选通过人工视觉与功能复核后，再通过单独的 Risk A Gate 决定是否提升到生产。

## 3. 非目标

- 不迁移 Portal、Admin、server、schemas、支付、Coins、订单、归因或结算。
- 不增加新产品能力，不把未交付的 Agent、API、Gateway 或 Workspace 写成已上线能力。
- 不重构为完整 Design System，不新增组件库、动画库、追踪脚本或真实支付协议。
- 不改变 `/api/public/leads` 协议、Portal 注册或登录 URL。
- 不转移、删除或重写原组织仓库。
- 不在本次迁移中清理原仓库的官网源码。
- 不修改 DNS、自定义域名、Vercel 项目身份或生产别名。
- 不因仓库重连自动提升候选部署。

## 4. 方案比较

### 方案 A：最小源码抽取（采用）

仅复制官网实际使用的 React、CSS、静态资产、测试和构建验证脚本。新仓库不包含 Admin
应用入口或 Portal 实现。

优点：

- 仓库职责与官网职责一致。
- 构建和测试边界明确。
- 后续官网开发不被单体仓库的后端与 Admin 依赖牵连。
- Vercel 配置简单，回滚仍有原仓库和现有生产部署两层来源。

代价：

- 需要明确记录上游来源，避免无证据地复制后形成双向同步。
- 未来如需共享视觉基础，应通过明确的小型迁移决定，而不是隐式复制全局样式。

### 方案 B：Git subtree

保留单体仓库为唯一上游，通过 subtree 发布官网目录。

不采用原因：同步和发布链路仍依赖组织仓库，无法直接解决当前个人 Hobby 项目连接私有组织仓库的边界。

### 方案 C：复制完整 `admin` 目录

把官网、Portal 和 Admin 一起迁到个人仓库。

不采用原因：扩大安全、依赖和维护范围，也违背“只做官网”的既定职责边界。

## 5. 目标仓库结构

```text
gaoyi1020-web/gccwebos-site
├─ .github/
│  └─ workflows/
│     └─ validate.yml
├─ public/
│  └─ favicon.svg
├─ scripts/
│  └─ verify-public-site-build.mjs
├─ src/
│  ├─ company-site-page.tsx
│  ├─ main.tsx
│  └─ styles/
│     ├─ base.css
│     ├─ public-site.css
│     └─ tokens.css
├─ tests/
│  └─ company-site.test.tsx
├─ index.html
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
├─ vercel.json
└─ README.md
```

文件名可在实现阶段按 Vite 测试约定做最小调整，但不得引入新的路由框架或恢复 Admin
目录层级。

## 6. 源码与依赖边界

### 6.1 允许迁移

- `company-site-page.tsx` 中官网所需组件和双语文案。
- `public-site.css` 中 `.company-site-shell` 范围内的官网视觉和响应式规则。
- 官网实际使用的少量 token 与基础重置规则。
- 官网 favicon 和必要静态资产。
- 官网 focused tests 与公开站构建验证逻辑。
- React、React DOM、Vite、TypeScript、Vitest、Testing Library 和当前已使用的轻量图标依赖。

### 6.2 禁止迁移

- `admin/src/main.tsx`、`admin/src/App.tsx` 和任何 Admin 功能。
- `admin/src/portal-main.tsx`、`admin/portal/**` 和 `admin/src/features/user-portal/**`。
- server、schemas、数据库、支付、Coins、订单、归因和结算代码。
- `dist-site`、`dist`、`dist-portal` 等构建产物。
- 与官网无关的全局 token、shared component 或测试辅助层。
- 仓库级 Provider 凭证、环境文件、CLI 登录状态或生产配置。

### 6.3 运行时协议

官网只保留两个外部边界：

1. 线索表单继续向同源 `/api/public/leads` 提交现有请求结构。
2. 注册和登录继续跳转到既有 Portal URL。

迁移实现必须从当前源码和测试提取准确值，不在设计文档中复制可能变化的完整 URL 或请求体。
任何协议变化均触发停止条件，需要返回原仓库另立任务处理。

## 7. 构建、测试与持续集成

新仓库提供三个稳定入口：

```text
npm test
npm run build
npm run verify
```

`verify` 必须验证输出目录和公开站标记，且不能依赖 Admin 或 Portal 构建产物。

从现有 focused test 迁移并适配的覆盖面至少包括：

- 中英文品牌文案和 CTA 一致。
- 注册、登录指向既有 Portal。
- 线索表单使用 `/api/public/leads`。
- 桌面与移动端 Brand Environment 的关键结构存在。
- 移动端无页面横向溢出。
- `prefers-reduced-motion` 有明确退化样式。
- 菜单、FAQ 和表单保留键盘及 ARIA 状态。
- 构建产物不含 Admin 或 Portal 应用标记。

GitHub Actions 在 pull request 和 `master` push 上运行上述三条命令。CI 成功只代表源码和构建验证，
不代表 Vercel 候选已审查或生产已改变。

## 8. Vercel 目标状态

复用现有 Vercel 项目，不新建项目。目标设置为：

```yaml
git_repository: gaoyi1020-web/gccwebos-site
production_branch: master
build_command: npm run build
output_directory: dist
auto_assign_custom_domains: false
```

仓库重连属于 Provider 变更，必须遵守 `docs/INFRASTRUCTURE_ACCESS_RULE.md`：

- 先完成无凭证的本地与 GitHub 仓库验证。
- 建立包含准确项目、命令、验证、回滚和停止条件的 Risk A Gate。
- 只使用该 Gate 允许的临时凭证或已批准交互方式。
- 不读取、复述、导出或依赖本机持久凭证。
- 重连后立即只读回查项目、仓库、生产分支、构建命令、输出目录和域名分配设置。

仓库重连阶段禁止修改 DNS、别名或生产部署。候选部署必须保留
`production_environment=false` 或等效的未提升状态。

## 9. 分阶段执行

### Phase 0：设计记录

- 提交并评审本设计。
- 不创建新仓库，不访问 Provider，不部署。

### Phase 1：创建个人私有仓库并抽取源码

- 创建 `gaoyi1020-web/gccwebos-site` 私有仓库。
- 从固定 source commit/tree 提取最小官网源码。
- README 记录上游仓库、source commit、source tree 和迁移边界。
- 首个实现 PR 只包含官网源码、最小 CSS、静态资产、测试、CI、Vercel 配置和 README。

创建 GitHub 仓库属于外部状态变更，但不影响生产；执行前必须核对目标不存在、账户归属和私有性。

### Phase 2：本地与 CI 验证

- 在新仓库执行 `npm test`、`npm run build`、`npm run verify` 和
  `git diff --check`。
- GitHub Actions 对准确 head commit 通过。
- 在此阶段不连接 Vercel。

### Phase 3：Vercel 仓库重连

- 通过独立 Risk A Gate 将现有 Vercel 项目的 Git Integration 重连到新仓库。
- 只修改仓库连接和构建所必需的设置。
- 回查生产部署和两个自定义域名仍指向原生产身份。

### Phase 4：候选部署与视觉 QA

- 由新仓库准确 commit 生成候选部署。
- 检查桌面、窄屏、浅色、深色和 reduced-motion。
- 检查品牌文案、CTA、线索表单、Portal 跳转、导航、FAQ 和移动端溢出。
- 确认候选不承载 Admin、Portal、订单、支付或结算页面。
- 本地预览和候选截图不得表述为生产变更。

### Phase 5：生产提升

- 只有候选身份和 QA 证据被用户批准后，才能建立新的生产提升 Risk A Gate。
- 提升只针对已验证的准确候选部署。
- 提升后验证 `gccwebos.com` 与 `www.gccwebos.com` 的 HTTP、内容和别名身份。
- 在原 PR #528 追加简短 Deploy Note，记录
  `company-site-static`、`frontend_surface: company-site`、source commit、部署身份、目标、备份和验证。

### Phase 6：后续清理

- 稳定上线后，通过独立 PR 决定是否移除原仓库的官网源码和旧构建链路。
- 在清理 PR 合并前，原仓库继续作为只读源码回滚来源。

## 10. 回滚

在生产提升前：

- 取消或删除未提升候选，不影响当前生产。
- Vercel Git Integration 可在新的 Risk A Gate 下重新连接原仓库。

在生产提升后：

- 第一回滚目标是提升前仍可识别的现有生产部署。
- 第二回滚来源是原组织仓库固定的 source commit/tree。
- 回滚不得顺带修改 DNS、Portal、Admin 或后端。
- 回滚后必须验证两个自定义域名、首页关键文案、Portal 跳转和线索入口。

## 11. 停止条件

遇到以下任一情况立即停止，不以扩大权限、跳过测试或修改协议绕过：

- 原仓库 source commit/tree 与设计记录不一致。
- 新仓库目标已存在但身份、所有者或可见性无法唯一确认。
- 官网测试、构建、验证或 CI 未通过。
- 抽取需要改变 `/api/public/leads` 或 Portal URL 协议。
- 新仓库产物依赖 Admin、Portal 或后端源码。
- Vercel 项目身份、Team、生产分支、构建设置或域名状态存在歧义。
- 仓库重连意外改变自定义域名、生产别名或触发自动生产提升。
- 候选部署不是准确 Git commit，或 QA 发现内容、布局、可访问性或溢出问题。
- 执行需要读取、导出或复用本机持久 Provider 凭证。

## 12. 验收标准

设计完成：

- 本文档在独立 docs 分支和 Draft PR 中可审查。
- `git diff --check origin/master...HEAD` 通过。
- PR 明确为 spec-only，无 Provider 或生产影响。

迁移实现完成：

- 私有仓库 `gaoyi1020-web/gccwebos-site` 存在且只包含官网边界。
- 来源身份、依赖和运行时协议可追溯。
- 本地与准确 head CI 全部通过。
- Vercel 候选来源于新仓库准确 commit，且未分配生产自定义域名。
- 桌面、移动端、深浅色、reduced-motion 和关键用户路径均完成 QA。

生产完成：

- 另行批准的准确候选已提升。
- 两个自定义域名通过提升后验证。
- PR #528 有完整 Deploy Note。
- 回滚目标仍可识别。

在生产验收前，不得将本设计、仓库创建、CI 通过或候选部署表述为官网已经上线。

## 13. 参考

- `docs/INFRASTRUCTURE_ACCESS_RULE.md`
- `docs/CURRENT_RELEASE_STATE.md`
- `RELEASE_MANIFEST.md`
- [Vercel Git integrations](https://vercel.com/docs/git)
- [Vercel limits](https://vercel.com/docs/limits)
- [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github)
