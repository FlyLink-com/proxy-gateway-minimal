# Proxy Gateway Console

[English](README_EN.md) | [文档索引](docs/README.md)

轻量级代理网关控制台 — 为本地代理转发、订阅用户运营、受控发放和历史 Clash/Mihomo 兼容提供轻量管理能力。

> **当前网络事实**: Windows 本地系统代理流量、历史 Clash/Mihomo 兼容订阅流量和当前受控发放流程是不同路径。详细网络边界以 `docs/NETWORK_FORWARDING.md` 为准。

## 架构概览

```
Windows local forwarding:

Windows app / WinINet / PAC / HTTP_PROXY / HTTPS_PROXY
        ↓
127.0.0.1:18180 Node HTTP-to-SOCKS bridge
        ↓
127.0.0.1:1080 ss-local SOCKS5
        ↓
Remote Shadowsocks server

ALL_PROXY-aware local apps:

Application
        ↓
127.0.0.1:1080 ss-local SOCKS5
        ↓
Remote Shadowsocks server

Legacy Clash/Mihomo compatibility path:

Clash / Mihomo
        ↓
GET /sub/clash.yaml?token=<legacy-or-visible-once-token>
        ↓
Receives compatibility Shadowsocks YAML
        ↓
Connects directly to configured remote nodes
```

| 端口  | 服务         | 说明                              |
|-------|-------------|-----------------------------------|
| 3456  | Console API | Web 管理界面 + REST API + 历史订阅兼容 |
| 1080  | SOCKS5      | ss-local 本地 SOCKS5 代理          |
| 18180 | HTTP Proxy  | HTTP-to-SOCKS5 转发代理            |

> 端口从 4077 改为 3456 的原因：Windows Hyper-V/Docker 保留了 4002-4101 端口范围，4077 被排除导致 EACCES。

## 快速启动

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

`.env` 是本项目运行时收口入口。先复制模板，再只在本机或目标服务器上填值：

```bash
cp .env.example .env
```

至少确认 `.env` 里的这些项。真实 token、密码、节点凭据、订阅材料和客户数据
只能留在目标机 `.env`、受保护文件或 handoff 里，不进 Git、README、PR 或聊天。

```text
NODE_ENV=production
CONSOLE_PORT=3456
CONSOLE_TOKEN=__SET_ON_HOST__
SS_PASSWORD=__SET_ON_HOST__
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite
SUBSCRIPTION_CONTROL_DB_PATH=/opt/proxy-gateway-minimal/.proxy-gateway/subscription-control.sqlite
HANDOFF_DIR=/opt/proxy-gateway-minimal/handoff
PUBLIC_SUBSCRIPTION_BASE_URL=https://control.example.invalid
ADMIN_ALLOWED_CIDRS=127.0.0.1/32,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
TRUSTED_PROXY_CIDRS=
SUB_RATE_LIMIT_WINDOW_MS=60000
SUB_RATE_LIMIT_MAX=30
SUBSCRIPTION_TEMP_LINK_TTL_MINUTES=1440
```

端口策略：`CONSOLE_PORT` 只影响 Node runtime。Windows 代理脚本当前固定使用本地默认端口 `3456` / `1080` / `18180`；修改 `CONSOLE_PORT` 不会自动重配置 `scripts/proxy.ps1`、`scripts/network-doctor.ps1` 或 PAC URL。

### 3. 启动服务

```bash
# 守护进程启动（推荐，脱离终端）
npm run daemon

# 或直接启动
npm run server

# 或使用包内 CLI
npm run cli
```

访问 http://127.0.0.1:3456/ 进入管理控制台。

首次启动时会在 `.proxy-gateway/console-token` 持久化 Token，后续重启复用。

用户门户路由默认不挂载。只有在应用状态中显式设置
`state.platform.userPortalRoutesEnabled === true`，并注入
`userPortalAuth` 或 `portalAccessRequests` 服务时，用户侧
`/api/portal/entry/enroll`、`/api/portal/session`、
`/api/portal/access-requests` 和 `/api/portal/access-requests/current` 才会进入
公共白名单。门户流程和安全边界见 `docs/USER_PORTAL_FLOW.md` 和
`docs/USER_PORTAL_AUTH_BOUNDARY.md`。

## 作为模块使用

项目现在提供 npm 模块入口和 CLI：

```bash
npm install
npm run cli
```

在其他 Node.js 项目中可以导入稳定入口：

```js
import {
  createApp,
  createRuntimeState,
  startProxyGateway
} from "proxy-gateway-minimal";

const handle = await startProxyGateway({
  runtimeOptions: { autoStartHttpProxy: false }
});

// handle.app, handle.state, handle.server, handle.stop()
```

可执行命令名为 `proxy-gateway`。通过 GitHub 私有仓库安装时，需要本机 GitHub 凭据有仓库访问权限。

## Admin Console Shell

The subscription admin shell lives in `admin/`. It is a Vite React app for the operator workflow on top of the real subscription admin APIs.

```bash
npm install --prefix admin
npm run admin:dev
npm run admin:build
npm run admin:test
```

The shell calls `/api/admin/subscriptions`, `/api/admin/nodes`, and `/api/admin/overview`. In Vite dev mode, leave the API base URL blank and open a local backend or SSH tunnel on `127.0.0.1:3456`; the dev server proxies same-origin `/api` requests to that backend. Set `VITE_ADMIN_API_BASE_URL` or the in-app API base URL only when the target explicitly supports browser CORS.

The current admin shell includes connection health diagnostics and confirmation dialogs for sensitive subscription actions. Connection health checks `/api/health` without auth, then checks `/api/admin/overview` with Bearer auth. Disable actions require confirmation, while reset-token and temporary-link workflows keep generated subscription URLs visible-once only.

Do not expose this admin shell through the public Nginx gateway. Public production access should continue to allow only health checks and subscription fetches.

完整文档入口见 `docs/README.md`。生产拓扑、部署、staging、DR、DNS/domain、网络转发和历史 specs/plans 的 source-of-truth 关系以该索引为准。

### 历史节点变更索引

历史节点、槽位和供应商角色的变更不要只凭记忆追溯。统一从
`docs/README.md` 的 `Historical Node Change Index` 查起，再进入对应执行记录。

该索引集中标注了：

- legacy blue AWS host 的备份、停机和保留状态。
- green / `prod-edge-b` 早期候选记录。
- `prod-edge-a` 候选、激活、HTTPS 和 opaque artifact canary 记录。
- Singapore `prod-edge-a` / `prod-edge-b` stop-only 记录。
- Aliyun subscription control / distribution host 的准备、推广和观测记录。
- future clean edge / `prod-edge-c` 重建入口。
- `channel-lab-a` Hysteria2 / TUIC canary 记录。
- server edge mesh / WireGuard preflight 入口。

这些记录只是审计索引，不是实时 inventory，也不授权 start、stop、rollback、termination、DNS、firewall、subscription-output 或 traffic 变更。生产或节点动作仍必须读取对应 Risk A runbook 并取得明确 operator approval。

## 项目编排模型

本项目采用轻量级人工门禁编排，而不是 Kubernetes、Docker Compose、Terraform 或自动 CD。

- Windows 本地 checkout 负责开发、测试、operator CLI、local/private console
  review 和 SSH tunnel 操作。
- GitHub `master` 是稳定集成基线，功能和运维变更通过 `codex/*`、`feat/*`、`ops/*` 或 docs 分支进入 PR。
- GitHub Actions CI 负责仓库级验证：`npm test`、`npm run admin:test` 和 `npm run admin:build`。当 GitHub-hosted runner 受 billing/spending-limit blocker 影响时，目标是使用本地 Linux 手动 CI；历史 Aliyun 手动 CI 记录保留，但生产订阅控制面候选不应继续承担常规 CI。
- 注册、授权、订阅访问发放和通道激活准备优先采用 CLI-first 资源包模型。`npm run platform:resource-package -- <input.json>` 会生成 operator-safe 交付摘要。平台不把公网 Admin 作为产品面，公共边界只暴露明确批准的站点、健康检查、线索和订阅刷新接口；管理员能力收敛到 operator CLI、local/private console review、0600/当前用户可读 handoff 文件和执行记录。Admin UI 只保留 review/evidence 面，不承担复杂执行按钮。边界见 `docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md`。
- Staging 不自动创建。任何 AWS staging mutation 前必须先执行 `docs/STAGING_PROVISIONING.md` 的 dry-run checklist，并获得明确 operator approval。
- Production 不自动部署。生产变更必须保留 `.env`、SQLite、node config 和 Nginx public admin blocking，并按 `docs/DEPLOYMENT_FLOW.md` 验证。
- 生产输入数据包先用 `deployments/production-template/` 描述非敏感拓扑、节点槽位、公共边界、套餐和 env 必填项；运行时填参统一收口到目标机 `.env`。需要“记事本式”收口时，先读 `deployments/production-template/OPERATOR_NOTEPAD.md`，再把非敏感结构事实同步到 JSON，把真实运行值填进目标机 `.env`。真实密钥、SQLite、客户数据和订阅材料仍只允许进入受保护 runtime/handoff，不进 Git。
- 项目包边界按 `docs/PACKAGE_BOUNDARY.md` 收敛为两条线：完整项目包负责订阅控制/发放/审计/gccgw，节点包负责 edge host bootstrap/systemd/Nginx/protocol runtime。
- 当前生产仍以已记录的线上事实为准；目标重建方向是 Aliyun 承担订阅控制面，本地 Linux 承担手动 CI，干净服务器承担转发 edge/data-plane。实际迁移必须走 A 档 runbook。

详细流程入口以 `docs/README.md` 为准；该索引会指向当前状态文档、活跃 runbook、执行记录和历史设计文档。

## gccgw 安装流程

`gccgw` 是本项目的安装、检查和门禁执行壳。README 里的安装流程只覆盖
本地或目标机上的 read-only / dry-run 检查；不会复制 `.env`、恢复 SQLite、
写入 Nginx/systemd、防火墙、DNS、云资源，也不会发放真实订阅。

### 1. 本地或目标机准备

```bash
git clone <repo-url> /opt/proxy-gateway-minimal
cd /opt/proxy-gateway-minimal
npm ci
npm link
gccgw self check
```

Windows 本地 checkout 可用于预览和 dry-run；真实 Linux 目标机仍需要单独
验证。不要把 Windows 上的 `gccgw install preflight` 当成生产主机通过。

### 2. 先跑只读计划和 preflight

```bash
gccgw install plan
gccgw install preflight --json
```

`install plan` 只打印安装顺序和门禁边界。`install preflight` 不改主机；
在 Windows 本地运行时，`linuxHost` 通常会是 `false`，这是预期的本地
限制。真正准备 Linux 目标机时，必须在目标机重新跑 preflight。

### 3. 生成安装配置 dry-run

```bash
gccgw install configure --dry-run \
  --domain https://sub.example.com \
  --install-dir /opt/gccgw \
  --management-source 203.0.113.10/32 \
  --json > reviewed-install-configure-plan.json
```

这个命令只生成脱敏计划。计划里可以包含安装目录、public base URL、
管理源 CIDR、派生 SQLite 路径、handoff 目录和 `.env` skeleton；真实
`CONSOLE_TOKEN`、`SS_PASSWORD`、节点凭据、客户数据和订阅材料不应写入
Git、README、PR、聊天或 dry-run 输出。

### 4. 检查生产输入包

如果要把配置按“记事本”方式交给项目，先编辑或复核：

```text
deployments/production-template/OPERATOR_NOTEPAD.md
.env.example
```

Markdown 文件只是人工填写清单，不是机器导入格式。`gccgw package inspect/import`
真正读取的仍是同目录下的 JSON 文件；目标机运行时值统一落到 `.env`。

```bash
gccgw package inspect deployments/production-template --json
gccgw package import deployments/production-template --dry-run --json > reviewed-package-import-plan.json
```

`package inspect` 是 C 档只读检查，验证模板文件、schema 和禁用字段。
`package import --dry-run` 是 B 档计划生成，输出套餐、节点槽位、公共边界
和环境变量需求摘要；它不写 host、不读取真实环境值、不复制 SQLite、不启动
服务、不发放订阅。

### 5. 重复 dry-run 核验

改动安装包、节点槽位、public boundary 或管理源后，至少重新跑一遍上述
read-only / dry-run 流程。需要压测 README 流程时，可以在本地重复执行：

```powershell
1..3 | ForEach-Object {
  node bin/gccgw.mjs install plan > $null
  node bin/gccgw.mjs install preflight --json > $null
  node bin/gccgw.mjs install configure --dry-run --domain https://sub.example.com --install-dir /opt/gccgw --management-source 203.0.113.10/32 --json > $null
  node bin/gccgw.mjs package inspect deployments/production-template --json > $null
  node bin/gccgw.mjs package import deployments/production-template --dry-run --json > $null
}
```

这段循环只验证命令可重复执行，不代表生产主机 ready。Windows 上 preflight
仍可能因为不是 Linux host 而返回 `ok: false`。

### 6. A 档门禁

以下命令只在 Risk A runbook、dry-run 证据、operator 明确批准、rollback
计划和目标环境验证都齐全后执行：

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

它们不属于 README 快速启动流程。执行前必须读取对应 runbook，并再次确认
不会把生产 `.env`、SQLite、私钥、token、订阅 URL、客户数据或 runtime
日志写入 Git、PR、README 或聊天。

## 用户门户 / 套餐申请

用户门户是套餐申请和订阅状态查看的用户侧适配器，不是公网 Admin，也不是自动发放 authority。当前本地实现可以提交试用、月付和年付申请摘要；所有业务变更仍进入管理员审核路径，由受保护的“订阅申请运营台”做状态复核和安全发放预览。生产启用用户门户路由、接入真实 `userPortalAuth`、创建权益或发放订阅材料都属于单独门禁，不由 README 或本地预览授权。

## 历史 Clash/Mihomo 兼容订阅

历史上直接生成 Clash/Mihomo 可导入的节点材料、再把 query-token URL
交给用户的方式，已归档为历史兼容路径，不再作为当前产品主线、安装流程或
新用户交付方式。

当前主线是套餐申请、运营审核、资源包、opaque artifact 和受保护 handoff；
订阅材料由 operator CLI / Admin review 路径受控发放。`/sub/clash.yaml`
仍保留，是为了兼容历史租户、测试覆盖和仍依赖 Clash/Mihomo YAML 的客户端；
它不是新的 onboarding 入口。

兼容入口的形态只应写成占位符，不要在 README、PR 或聊天中粘贴真实 token、
订阅 URL、客户数据或节点凭据：

```
GET /sub/clash.yaml?token=<legacy-or-visible-once-token>
```

兼容模式下，proxy-gateway 负责生成 YAML 和执行访问控制；客户端获取 YAML
后会直接连接配置中的远端节点，不经过本地 `127.0.0.1:18180` HTTP bridge
或 `127.0.0.1:1080` ss-local。

### 与 Windows 本地转发的区别

```
Windows local forwarding:
应用 -> 127.0.0.1:18180 HTTP bridge -> 127.0.0.1:1080 ss-local -> remote SS

Legacy Clash/Mihomo compatibility:
Clash/Mihomo -> /sub/clash.yaml -> configured remote nodes
```

## Subscription Admin Core

Subscription Admin Core 提供 SQLite 持久化的运营侧订阅用户管理。它历史上可以给不同租户生成独立的 Clash/Mihomo 兼容订阅 URL；当前 README 把这些 URL 视为受控发放材料或历史兼容输出，不再把它们描述成产品主线入口。默认数据库路径是：

```
.proxy-gateway/subscriptions.sqlite
```

可用环境变量：

| 变量 | 说明 |
|------|------|
| `SUBSCRIPTION_DB_PATH` | 自定义 SQLite 数据库路径 |
| `PUBLIC_SUBSCRIPTION_BASE_URL` | 对外展示的订阅 URL 基础地址，默认 `http://127.0.0.1:3456` |
| `SUBSCRIPTION_EXPIRING_DAYS` | 即将过期统计窗口，默认 7 天 |
| `SUBSCRIPTION_TEMP_LINK_TTL_MINUTES` | Temporary subscription link lifetime in minutes, defaults to `1440` |
| `SUB_RATE_LIMIT_WINDOW_MS` | `/sub` rate-limit window in milliseconds, defaults to `60000` |
| `SUB_RATE_LIMIT_MAX` | `/sub` requests allowed per client IP per window, defaults to `30` |
| `ADMIN_ALLOWED_CIDRS` | Comma-separated admin source allowlist, defaults to loopback and RFC1918 private ranges |

管理端 API 使用 `Authorization: Bearer <console-token>` 认证。租户订阅材料使用 `create`、`reset-token` 或 `temp-link` 生成的订阅 Token；Token 只在生成/重置/临时链接创建时明文返回，数据库中保存哈希和可识别前缀。`/sub/clash.yaml` 保留 query-token 兼容，同时支持租户 Token 拉取限定节点的兼容 YAML。

Temporary links use `pgtmp_` tokens and resolve through the same legacy-compatible `/sub/clash.yaml` endpoint as primary `pgsub_` tokens. Admin APIs remain Bearer console-token protected and are additionally source-IP allowlisted in the app.

Subscription expiry is enforced when a token is resolved: expired tenants receive `403` on the compatibility endpoint even if their stored status remains `active`. The stored `disabled` status is reserved for operator-driven disable actions.

The subscription implementation is structured as a modular monolith:

- `SubscriptionCore` owns subscription business rules.
- `SubscriptionStore` is the persistence contract.
- The current SQLite adapter keeps the existing table structure.
- HTTP routes and future platform/payment integrations call the core instead of reading or writing subscription storage directly.
- Existing subscription refreshes do not depend on future platform or payment availability.

## 代理模式

| 模式  | 命令                    | 说明                                        |
|-------|------------------------|---------------------------------------------|
| 全局  | `npm run proxy:on`     | 所有流量通过 HTTP 代理 (127.0.0.1:18180)     |
| PAC   | `npm run proxy:pac`    | PAC 规则自动分流（CN 直连，其余代理）        |
| 关闭  | `npm run proxy:off`    | 关闭系统代理                                |
| 状态  | `npm run proxy:status` | 查看当前系统代理设置                        |

## Windows 网络诊断

```powershell
npm run network:status     # 只读诊断
npm run network:repair     # 修复代理链
npm run network:reset      # 清空本项目写入的代理设置
```

`network-doctor.ps1` 当前只从进程环境变量 `CONSOLE_TOKEN` 或 `.proxy-gateway/console-token` 读取控制台 Token；默认不读取 `.env`。

## API 端点

下表列出主要 HTTP API 入口；测试数量以当前 `npm test` 输出为准。

### Shadowsocks 管理

| 方法  | 路径              | 说明               |
|-------|-------------------|--------------------|
| POST  | `/api/ss/start`   | 启动 ss-local      |
| POST  | `/api/ss/stop`    | 停止 ss-local      |

### 代理管理

| 方法  | 路径                    | 说明                           |
|-------|-------------------------|--------------------------------|
| POST  | `/api/proxy/start`      | 启动完整代理链                 |
| POST  | `/api/proxy/stop`       | 停止所有代理                   |
| GET   | `/api/proxy/overview`   | 代理状态总览                   |
| GET   | `/api/proxy/status`     | 远端 SS 服务器 TCP 连通性检测  |
| GET   | `/api/proxy/test`       | 代理出口测试 (httpbin.org)     |
| GET   | `/api/proxy/servers`    | 代理服务器列表（密码已脱敏）   |

### HTTP 代理

| 方法  | 路径                     | 说明             |
|-------|--------------------------|------------------|
| POST  | `/api/http-proxy/start`  | 启动 HTTP 代理   |
| POST  | `/api/http-proxy/stop`   | 停止 HTTP 代理   |

### 系统代理

| 方法  | 路径                         | 说明                              |
|-------|------------------------------|-----------------------------------|
| POST  | `/api/system-proxy/:action`  | 系统代理控制 (`on`/`off`/`pac`)    |
| POST  | `/api/env-proxy/on`          | 设置用户环境变量代理              |
| POST  | `/api/env-proxy/off`         | 清除用户环境变量代理              |
| GET   | `/api/env-proxy/status`      | 查看环境变量代理状态              |
| POST  | `/api/autostart/on`          | 启用开机自启                      |
| POST  | `/api/autostart/off`         | 禁用开机自启                      |
| GET   | `/api/autostart/status`      | 查看自启状态                      |

### Windows 网络修复

| 方法  | 路径                  | 说明                              |
|-------|-----------------------|-----------------------------------|
| GET   | `/api/network/status` | Windows 代理栈完整诊断            |
| POST  | `/api/network/repair` | 启动代理链并接管 WinINet/环境变量 |
| POST  | `/api/network/reset`  | 清空本项目写入的代理设置          |

### 历史兼容订阅

| 方法  | 路径                       | 说明                         |
|-------|----------------------------|------------------------------|
| GET   | `/sub/clash.yaml`          | Clash/Mihomo 兼容 YAML（非当前主线交付入口） |
| GET   | `/api/subscription/status` | 兼容订阅状态和节点数量       |

### Admin Subscription API

| 方法  | 路径                                      | 说明                         |
|-------|-------------------------------------------|------------------------------|
| GET   | `/api/admin/subscriptions`                | 列出租户订阅用户             |
| POST  | `/api/admin/subscriptions`                | 创建租户并返回一次性兼容材料 |
| GET   | `/api/admin/subscriptions/:id`            | 查看单个租户                 |
| PATCH | `/api/admin/subscriptions/:id`            | 更新租户到期时间             |
| POST  | `/api/admin/subscriptions/:id/renew`      | 续期租户                     |
| POST  | `/api/admin/subscriptions/:id/disable`    | 禁用租户订阅                 |
| POST  | `/api/admin/subscriptions/:id/enable`     | 启用租户订阅                 |
| POST  | `/api/admin/subscriptions/:id/reset-token`| 重置租户 Token 并返回新 URL  |
| POST  | `/api/admin/subscriptions/:id/temp-link`  | 生成临时兼容材料             |
| POST  | `/api/admin/subscriptions/:id/node`       | 将租户重新分配到已配置节点   |
| GET   | `/api/admin/nodes`                        | 查看可分配订阅节点           |
| GET   | `/api/admin/overview`                     | 订阅用户统计和节点总览       |

租户节点分配是 operator 用于节点维护和灰度验证的控制能力，不改变租户 token 或订阅材料标识。创建租户时可传入 `nodeId`，省略时继续使用第一个已配置的命名节点；默认主节点租户后续会收到 V2 多节点兼容输出。`POST /api/admin/subscriptions/:id/node` 接受节点 `id` 或 `name`，可将该租户之后生成的 `/sub/clash.yaml` 收敛到显式选择的非默认节点，用于 canary。把第二生产节点写入 `config/proxy-servers.json`、迁移生产租户节点、或让生产兼容输出真正包含新节点，仍属于 A 档 production node-config 变更，需要单独门禁。

### 诊断

| 方法  | 路径               | 说明                    |
|-------|--------------------|-------------------------|
| GET   | `/api/health`      | 服务健康检查（免认证）  |
| GET   | `/api/status`      | 聚合状态（Phase 2 UI）  |
| GET   | `/api/nginx/status`| Nginx 端口连通性检测    |
| GET   | `/api/ping/:host`  | Ping 指定主机           |

## 模块架构

```
.
├── .github/
│   └── workflows/ci.yml  # GitHub Actions repo-level validation
├── admin/                # Vite React Admin Console Shell
├── docs/                 # topology, deployment, staging, specs, plans
├── index.mjs              # npm 模块导出入口
├── bin/
│   └── proxy-gateway.mjs  # CLI 入口
├── server/
│   ├── index.mjs          # 服务启动入口
│   ├── start.mjs          # 可复用启动/停止生命周期
│   ├── app.mjs            # Express 应用工厂
│   ├── state.mjs          # 运行时状态组装
│   ├── middleware/
│   │   ├── admin-allowlist.mjs # Admin API source-IP allowlist
│   │   ├── auth.mjs       # Bearer Token 认证
│   │   └── rate-limit.mjs # /sub rate limiting
│   ├── services/
│   │   ├── ports.mjs      # TCP 端口探测
│   │   ├── config.mjs     # 配置加载 + 密码脱敏
│   │   ├── command.mjs    # 白名单命令执行器
│   │   ├── ss-local.mjs   # ss-local 进程管理（互斥锁）
│   │   ├── http-proxy.mjs # HTTP-to-SOCKS5 桥接
│   │   ├── console-token.mjs # Token 持久化
│   │   ├── daemon-launcher.mjs # 守护进程启动器
│   │   ├── clash-subscription.mjs # 历史 Clash 兼容 YAML 生成
│   │   └── subscriptions/ # SQLite 订阅用户仓储、状态、Token、服务逻辑
│   ├── routes/
│   │   ├── legacy-proxy.mjs # /api/ss/*, /api/proxy/*
│   │   ├── status.mjs     # /api/status
│   │   ├── diagnostics.mjs # /api/proxy/servers, /api/nginx/status, /api/ping/:host
│   │   ├── system-proxy.mjs # /api/system-proxy/*, /api/env-proxy/*, /api/autostart/*
│   │   ├── network.mjs    # /api/network/*
│   │   ├── admin-subscriptions.mjs # /api/admin/subscriptions/*, /api/admin/nodes, /api/admin/overview
│   │   └── subscription.mjs # /sub/clash.yaml 兼容入口, /api/subscription/status
│   └── tests/             # 服务端测试；数量以 npm test 输出为准
├── ops/                  # systemd, Nginx, recovery, operator docs
├── scripts/              # Windows helpers, backup/restore, diagnostics
└── config/               # ss-local and proxy server templates
```

## 配置文件

| 文件                           | 说明                                        |
|--------------------------------|---------------------------------------------|
| `.env`                         | SS 密码（已 gitignore）                     |
| `.env.example`                 | 环境变量模板                                |
| `.proxy-gateway/console-token` | 自动生成的本地 Token（已 gitignore）        |
| `config/ss-local.json`         | ss-local 配置模板（密码占位符）             |
| `config/proxy-servers.json`    | 代理服务器列表（密码占位符）                |
| `public/proxy.pac`             | PAC 自动分流规则                            |
| `public/index.html`            | 控制台前端                                  |
| `scripts/proxy.ps1`            | Windows 系统代理脚本                        |
| `scripts/network-doctor.ps1`   | Windows 网络诊断/修复脚本                   |
| `bin/sslocal.exe`              | Shadowsocks 客户端                          |

## 技术栈

- **Runtime**: Node.js 20.x / 22.x / 23.x / 24.x / 25.x / 26.x (ESM)
- **Framework**: Express 5
- **Proxy**: socks-proxy-agent + socks (HTTP-to-SOCKS5)
- **Process**: child_process (ss-local 管理 + 守护进程)
- **Config**: dotenv

## 已知限制

- WorkBuddy 沙箱内无法绑定端口，需使用 `dangerouslyDisableSandbox` 或 `daemon.mjs` 启动
- Windows Hyper-V/Docker 保留端口范围 4002-4101，不可用于 Console
