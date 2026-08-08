# proxy-gateway-minimal / gccgw

[English](README_EN.md) | [文档索引](docs/README.md)

`proxy-gateway-minimal` 是一个订阅控制与交付项目。现在的主线不是
“再写一个代理面板”，而是把订阅生产、发放、审计、撤回、安装配置和节点包
收口到一个可验证的工程骨架里。

## 权威阅读顺序

第一次进入仓库或恢复工作时，按以下顺序建立当前事实：

1. [`docs/CURRENT_RELEASE_STATE.md`](docs/CURRENT_RELEASE_STATE.md)：当前已记录的发布与生产对账状态。
2. [`RELEASE_MANIFEST.md`](RELEASE_MANIFEST.md)：源码、制品、发布、部署和运行状态之间的身份边界。
3. [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md)：项目定位、当前阶段、工作队列和风险边界。
4. `git status --short --branch`：当前 checkout 的路径、分支和工作树状态。
5. [`docs/README.md`](docs/README.md)：完整文档索引、权威范围和生命周期导航。
6. 当前任务涉及的 subsystem README：进入具体模块后再读取其职责与验证边界。

`AGENTS.md` 定义仓库任务规则并始终适用，但不替代上述当前状态读取顺序。

当前控制面是 `gccgw`：

```bash
node bin/gccgw.mjs capabilities
node bin/gccgw.mjs commands
node bin/gccgw.mjs docs list
node bin/gccgw.mjs project check
```

它把项目能力分成这些工作流：

```text
project / install / node / package / subscription / channel / config / site-admin / operations
```

## 当前项目状态

项目当前处于 **Phase 2 Operational Reliability**，是在受控平台基础上继续完成
运行可靠性和发布对账，而不是已经结束演进的“收尾项目”。

```yaml
project_status:
  phase: Phase 2 Operational Reliability
  maturity: controlled platform foundation
  source_model: release-managed monorepo
  production: partially operational; reconciliation incomplete
```

当前边界：

- 核心架构是单体 Node/Express 服务 + SQLite 业务状态 + `gccgw` operator CLI。
- 当前生产设计是一个订阅控制面管理账号、订单、订阅 artifact、凭据生命周期和
  用量账本；Vultr Japan 与 Singapore 等节点只作为可替换数据面通道容量接入。
- `.env` 是目标主机运行时配置的收口入口。
- `deployments/production-template/` 是非敏感生产输入包模板。
- `deployments/production-template/OPERATOR_NOTEPAD.md` 是人工记事本式检查面，不是机器导入文件。
- Admin/Web 只作为受保护 review / local operator surface，不是公网 Admin 产品。
- 用户门户、支付、节点扩容、生产部署、DNS/Nginx/systemd 仍按门禁执行。
- 历史 Shadowsocks 本地代理路径保留为兼容路径；当前新用户交付主线是
  Clash/Mihomo 订阅文件中的 VLESS Reality、Hysteria2、TUIC 多通道策略。

不要把一次本地测试或 HP 手工 CI 通过理解成 production ready。生产、云、节点、
Nginx、systemd、DNS、SQLite、真实用户或订阅材料变更仍属于 Risk A，必须走
runbook、dry-run、明确 approval、验证和 rollback。

## 当前工程治理能力

README 只提供导航；协议细节和状态结论以链接文档为准。

| 能力 | 权威入口 | 当前边界 |
| --- | --- | --- |
| Execution Contract v1 | [`docs/EXECUTION_CONTRACT_V1.md`](docs/EXECUTION_CONTRACT_V1.md) | 源码级执行契约；不接入生产执行器或真实 Gate。 |
| Authority Metadata Validation | [`docs/README.md`](docs/README.md#document-metadata-contract) | 校验已声明的 canonical authority 和生命周期元数据。 |
| Documentation Lane Governance | [`docs/PROJECT_OPERATING_MODEL.md`](docs/PROJECT_OPERATING_MODEL.md) | 非阻塞文档治理轨道；不创建新的审批状态机。 |
| Release Artifact Identity | [`RELEASE_MANIFEST.md`](RELEASE_MANIFEST.md#artifact-manifest-v1) | 建立源码与不可变制品身份；不等于部署或生产状态。 |
| Runtime Evidence Collection | [`docs/CURRENT_RELEASE_STATE.md`](docs/CURRENT_RELEASE_STATE.md) 与 [`docs/RUNTIME_LANE_AUTHORITY.md`](docs/RUNTIME_LANE_AUTHORITY.md) | 记录受控运行证据；生产判断仍需 Release Flow 实时证据。 |

## 当前源码与归档边界

当前本地源码入口固定为：

```text
D:\Projects\proxy-gateway-minimal
```

完成顶部权威阅读顺序后，涉及旧 checkout、归档或生成物时再补读
[`docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`](docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md)。

不要把以下位置当作当前项目：

- `C:\Users\g\OneDrive\文档\订阅管理`
- `C:\Users\g\Projects\订阅管理\proxy-gateway-minimal`
- `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal`
- `.worktrees/` 下的旧临时工作树
- `docs/archive/` 下的历史资料
- `.codex-runtime/`、`.codex-artifacts/`、`.playwright-cli/`、`.tmp-node/`、
  `test-results/`、`admin/dist*` 等本地生成物

旧 checkout、历史工作树、归档文档和生成输出只能用于对比和考古。要重新采用其中
的代码或模板，必须先和当前源码 diff，再跑对应验证；涉及生产、节点、账号、订阅、
支付、DNS、Nginx、systemd、SQLite 或云资源时重新按 Risk A 门禁处理。

## 运行环境要求

| 项目 | 要求 |
| --- | --- |
| Node.js | 以 `package.json` 的 `engines.node` 为准；当前支持 `20.x`、`22.x` 至 `26.x` 中列明的版本。 |
| 包管理器 | 使用 `npm` 和仓库 `package-lock.json`；干净安装优先执行 `npm ci`。 |
| Admin 依赖 | Admin workspace 独立安装，执行 `npm ci --prefix admin`。 |
| 操作系统 | Windows 用于本地开发、预览和诊断；真实 Linux 目标必须重新执行目标机 preflight。 |

## 快速验证

```bash
npm ci
npm ci --prefix admin

node bin/gccgw.mjs self check
node bin/gccgw.mjs project check
npm test
npm run admin:test
npm run admin:build
```

常用脚本：

```bash
npm run cli              # gccgw
npm run server           # 本地服务
npm run daemon           # 本地守护启动
npm run project-state:check
npm run project:verify -- --with-admin
```

## 配置收口

运行时配置统一从目标主机 `.env` 收口。先复制模板：

```bash
cp .env.example .env
```

核心键：

```text
NODE_ENV
CONSOLE_PORT
CONSOLE_TOKEN
SS_PASSWORD
SUBSCRIPTION_DB_PATH
SUBSCRIPTION_CONTROL_DB_PATH
HANDOFF_DIR
PUBLIC_SUBSCRIPTION_BASE_URL
ADMIN_ALLOWED_CIDRS
TRUSTED_PROXY_CIDRS
EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS
USER_PORTAL_TOTP_SECRET_KEY
SUB_RATE_LIMIT_WINDOW_MS
SUB_RATE_LIMIT_MAX
SUBSCRIPTION_TEMP_LINK_TTL_MINUTES
```

规则：

- `.env.example` 只放占位符和安全默认形状。
- 管理面与 data-plane agent 的 allowlist 默认只包含 loopback；生产私网或固定
  operator 来源必须在目标机显式写入对应 CIDR。
- `TRUSTED_PROXY_CIDRS` 默认为空；仅来自显式信任代理的
  `X-Forwarded-For` 才参与客户端地址解析，IPv4-mapped IPv6 地址会先规范化；
  转发链中任一地址格式无效时，客户端地址解析会以不可匹配结果关闭，避免将
  受信代理自身的直连地址误判为原始客户端地址。
- `USER_PORTAL_TOTP_SECRET_KEY` 只在目标机配置，必须是 32-byte key 的
  hex/base64/base64url 表示；用于新 TOTP credential 的 at-rest 保护。
- 真实 token、密码、节点凭据、订阅 URL、SQLite、客户数据只允许留在目标机
  `.env`、受保护 runtime 文件或 operator-only handoff 中。
- 不要把真实 `.env`、订阅链接、客户资料、私钥、云 AK/SK、SQLite 内容写入
  Git、README、PR、聊天或日志。
- JSON 包只描述非敏感结构和必填 env 名称，不承载真实运行值。

## 数据库和存储边界

当前项目数据库是 SQLite 文件，不是 SQL Server、RDS 或其他可直接远程连接的
云数据库服务。

默认本地路径：

```text
.proxy-gateway/subscriptions.sqlite
.proxy-gateway/control.sqlite
```

目标服务器上通常由 `.env` 指定：

```text
SUBSCRIPTION_DB_PATH
SUBSCRIPTION_CONTROL_DB_PATH
```

规则：

- SQLite 文件由项目进程或 `gccgw` 访问；SSMS 这类 SQL Server 工具不能直接连接。
- EBS、云盘或服务器数据盘只是存储层，可以承载 SQLite 文件，但它们不是数据库服务。
- 生产 SQLite 不进 Git、不写 README、不复制到聊天、不作为普通桌面文件传递。
- 如需升级到 PostgreSQL、SQL Server、RDS 等云数据库，属于 Risk A 架构变更，
  必须先做 schema mapping、adapter、migration、backup、staging validation 和 rollback。

## gccgw 控制面

常用入口：

```bash
node bin/gccgw.mjs capabilities
node bin/gccgw.mjs commands
node bin/gccgw.mjs architecture
node bin/gccgw.mjs docs command "platform issue-subscription"
node bin/gccgw.mjs docs domain package
```

配置 profile：

```bash
node bin/gccgw.mjs config list
node bin/gccgw.mjs config show local
node bin/gccgw.mjs config validate --profile vultr-japan-prod
```

项目验证：

```bash
node bin/gccgw.mjs env check
node bin/gccgw.mjs self check
node bin/gccgw.mjs project check
node bin/gccgw.mjs project verify --with-admin
```

## 安装和新服务器流程

README 里的安装流程只覆盖 read-only / dry-run / gated 形状。它不授权生产。

### 1. 放置项目并安装 CLI

```bash
git clone <repo-url> /opt/proxy-gateway-minimal
cd /opt/proxy-gateway-minimal
npm ci
npm link
gccgw self check
```

Windows 本地 checkout 可做预览和 dry-run；真实 Linux 目标机必须在目标机上重新
跑 preflight。

### 2. 只读安装计划

```bash
gccgw install plan
gccgw install preflight --json
```

`install plan` 不安装、不部署、不复制 `.env`、不恢复 SQLite、不启动服务、不改
Nginx/DNS/防火墙、不发放订阅。

### 3. 生成安装配置计划

```bash
gccgw install configure --dry-run \
  --domain https://control.example.invalid \
  --install-dir /opt/proxy-gateway-minimal \
  --management-source 203.0.113.10/32 \
  --json > reviewed-install-configure-plan.json
```

输出必须是脱敏计划。真实 `CONSOLE_TOKEN`、`SS_PASSWORD`、节点凭据和客户数据不
进入计划文件。

### 4. 检查生产输入包

人工记事本：

```text
deployments/production-template/OPERATOR_NOTEPAD.md
```

机器导入文件：

```text
deployments/production-template/package-manifest.json
deployments/production-template/topology.json
deployments/production-template/public-boundary.json
deployments/production-template/plans.json
deployments/production-template/nodes.json
deployments/production-template/env.required.json
deployments/production-template/runbook.md
```

检查和 dry-run：

```bash
gccgw package inspect deployments/production-template --json
gccgw package import deployments/production-template --dry-run --json \
  > reviewed-package-import-plan.json
```

### 5. A 档执行门禁

只有在 runbook、dry-run 证据、目标机 preflight、明确 operator approval 和
rollback 计划齐全后，才允许执行：

```bash
gccgw install bootstrap \
  --config-plan reviewed-install-configure-plan.json \
  --execute-production-mutation \
  --apply

gccgw package apply deployments/production-template \
  --import-plan reviewed-package-import-plan.json \
  --config-plan reviewed-install-configure-plan.json \
  --execute-production-mutation \
  --apply
```

这些命令不是快速启动命令。

## 节点包

节点侧材料在：

```text
ops/edge-node/
```

它提供 provider-neutral edge host bootstrap / systemd / Nginx / template
材料。它不包含真实密钥、SQLite、客户数据、订阅材料或生产授权。

常用检查：

```bash
gccgw node inspect --json
gccgw node validate --package deployments/production-template --json
gccgw node register --dry-run safe-node-facts.json --json
gccgw node disable --dry-run prod-edge-a --reason maintenance --json
```

真实节点创建、bootstrap、systemd/Nginx、DNS、firewall、流量切换、订阅输出改变
都属于 Risk A。

## 订阅工厂

当前主线是受控发放：

```text
operator input
-> provisioning form
-> resource package / dry-run
-> explicit approval
-> issue subscription or portal entry
-> operator-only handoff
-> audit / revoke
```

常用命令：

```bash
gccgw platform provisioning-form <input.json>
gccgw platform resource-package <input.json>
gccgw platform issue-subscription --dry-run <input.json>
gccgw platform issue-portal-entry --dry-run <input.json>
gccgw platform revoke-access <tenant-ref> --dry-run
```

无 `--dry-run` 的真实发放、入口签发、撤回或 handoff 写入都要按对应门禁执行，
不得在 README、PR 或聊天里输出原始订阅材料。

## Admin、用户门户和 public site

Admin app 在 `admin/`，用于受保护 operator review、本地验证和 public site
构建，不是公网 Admin。

```bash
npm ci --prefix admin
npm run admin:dev
npm run admin:test
npm run admin:build
npm run admin:site:build
npm run admin:site:verify
```

Admin fixture preview 用于前端实现和 Vercel 预览，不连接生产 Admin API，也不启用
订单、receipt apply、collector activation、DNS/Nginx/provider firewall 或任何真实
runtime mutation。默认 Admin 入口仍要求本地连接配置；本地只读预览可运行：

```bash
npm run admin:dev
```

然后打开 `http://127.0.0.1:5173/#/fixture-preview`。根目录 `vercel.json`
将 Vercel Preview 构建到 `admin/dist`，并在构建时设置
`VITE_ADMIN_FIXTURE_PREVIEW=true`，因此 Vercel 预览页可直接显示安全 fixture
Admin shell。该预览只能用于 UI 验收和实现交接，不代表公网 Admin 产品化。

用户门户路由默认不挂载。只有运行状态显式启用
`state.platform.userPortalRoutesEnabled === true`，并注入对应 auth / service
能力时，用户侧 API 才进入公共白名单。生产启用门户、支付、自动权益、真实订阅
发放仍是单独门禁。

当前仓库已有默认关闭的用户侧 7 天自助订阅服务：
`state.platform.portalSelfServiceSubscriptions` 注入后，已登录 durable 账号可用
`trial` 策略自动开通 7 天、刷新 visible-once 订阅材料、禁用当前订阅；用户门户不提供
删除订单/订阅记录的能力。月卡 / 年卡仍是申请路径，支付、生产公网门户和生产自动发放
仍未启用。

## 历史 Clash/Mihomo 兼容

`/sub/clash.yaml` 保留为历史兼容和测试覆盖入口：

```text
GET /sub/clash.yaml?token=<legacy-or-visible-once-token>
```

它不是当前新用户 onboarding 主线。当前主线是套餐申请、运营审核、opaque
artifact、operator CLI 和受保护 handoff。

不要在 README、PR、日志或聊天中粘贴真实 token、订阅 URL、YAML、节点密码或客户
信息。

## Windows 本地代理能力

旧的 Windows 本地代理链仍保留，用于本地适配和诊断：

```text
Windows app
-> 127.0.0.1:18180 HTTP bridge
-> 127.0.0.1:1080 ss-local
-> remote Shadowsocks server
```

脚本：

```powershell
npm run proxy:on
npm run proxy:pac
npm run proxy:off
npm run proxy:status
npm run network:status
npm run network:repair
npm run network:reset
```

`CONSOLE_PORT` 只影响 Node runtime。Windows 代理脚本默认仍围绕本地
`3456 / 1080 / 18180` 工作；改 `.env` 不会自动改 PAC 或 Windows 代理脚本。

## 文档入口

恢复项目上下文时必须使用顶部的权威阅读顺序；下表只提供进一步导航。

重要当前文档：

| 文档 | 用途 |
| --- | --- |
| `docs/CURRENT_RELEASE_STATE.md` | 当前已记录的发布与生产对账状态 |
| `RELEASE_MANIFEST.md` | 源码、制品、发布、部署和运行状态身份模型 |
| `docs/PROJECT_CONTEXT.md` | 项目定位、阶段、队列和继续工作入口 |
| `docs/VALIDATION_BASELINE.md` | 验证命令矩阵 |
| `docs/CONFIGURATION_OWNERSHIP_MATRIX.md` | 配置归属 |
| `docs/PRODUCTION_INPUT_PACKAGE_FORMAT.md` | 生产输入包格式 |
| `deployments/production-template/README.md` | 生产包模板 |
| `docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md` | CLI-first 操作边界 |
| `docs/NETWORK_FORWARDING.md` | 网络路径边界 |
| `docs/CI_MANUAL_VALIDATION.md` | HP / local Linux 手工 CI 边界 |
| `docs/HP_PORTAL_VALIDATION_RUNBOOK.md` | HP 私有验证边界 |

## 代码结构

```text
.
├── bin/
│   ├── gccgw.mjs              # 当前 operator CLI
│   └── proxy-gateway.mjs      # 兼容 CLI
├── server/                    # Express app, routes, services, tests
├── admin/                     # Vite React Admin / portal / public site surfaces
├── agent/                     # local edge / data-plane agent surfaces
├── schemas/                   # portable versioned data contracts
├── config/                    # redacted local config templates
├── deployments/
│   └── production-template/   # non-secret production input package template
├── docs/                      # current docs, runbooks, records, archive index
├── ops/
│   └── edge-node/             # provider-neutral edge-node package materials
├── scripts/                   # Windows helpers, backup/restore, diagnostics
├── public/                    # local console/static assets
├── project-state/             # machine-checkable project state
├── .env.example               # runtime env template
└── .gitattributes             # keeps shell scripts LF for Linux archive runs
```

## 风险分级

| Risk | 适用范围 | 默认验证 |
| --- | --- | --- |
| C | docs、README、索引、只读检查 | `git diff --check` |
| B | 本地代码、测试、Admin UI、dry-run CLI | focused tests + `npm test` / Admin checks |
| A | production、云、节点、Nginx、systemd、DNS、auth、schema、deploy、rollback、真实订阅 | inventory + dry-run + approval + validation + rollback |

README 不授予生产权限。任何 A 档动作必须读取对应 runbook，并取得明确 operator
approval。
