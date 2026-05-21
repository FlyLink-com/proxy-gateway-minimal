# Proxy Gateway Console

轻量级代理网关控制台 — 为 Clash/Mihomo 提供本地 Shadowsocks 节点的管理面板。

> **当前架构**: Clash Verge (7897) 接管流量 → proxy-gateway SOCKS5 (1080) → ss-local → 远程 SS 服务器 (47.251.178.125)

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Clash Verge (:7897)                   │
│                  (主力代理，接管系统流量)                  │
│                         │ 订阅                           │
│                         ▼                               │
│              Proxy Gateway Console                      │
│               (Express 5, :3456)                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐         │
│  │ Console   │   │ HTTP Proxy│   │ SOCKS5    │         │
│  │ :3456     │   │ :18180    │   │ :1080     │         │
│  │ (Web UI)  │   │ (Forward) │──▶│ (ss-local)│         │
│  └───────────┘   └───────────┘   └───────────┘         │
│       │                                │                │
│       ▼                                ▼                │
│  Clash 订阅 + 管理面板          Remote SS Server        │
│  /sub/clash.yaml               (47.251.178.125)        │
└─────────────────────────────────────────────────────────┘
```

| 端口  | 服务         | 说明                              |
|-------|-------------|-----------------------------------|
| 3456  | Console API | Web 管理界面 + REST API + Clash 订阅 |
| 1080  | SOCKS5      | ss-local 本地 SOCKS5 代理          |
| 18180 | HTTP Proxy  | HTTP-to-SOCKS5 转发代理            |

> 端口从 4077 改为 3456 的原因：Windows Hyper-V/Docker 保留了 4002-4101 端口范围，4077 被排除导致 EACCES。

## 快速启动

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

编辑 `.env` 文件：

```bash
cp .env.example .env
```

```
SS_PASSWORD=your_shadowsocks_password_here
# 可选：
# CONSOLE_PORT=3456  （自定义控制台端口，默认 3456）
# CONSOLE_TOKEN=xxx   （固定 Token，不配则自动生成）
```

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
  generateClashSubscription,
  startProxyGateway
} from "proxy-gateway-minimal";

const handle = await startProxyGateway({
  runtimeOptions: { autoStartHttpProxy: false }
});

// handle.app, handle.state, handle.server, handle.stop()
```

可执行命令名为 `proxy-gateway`。通过 GitHub 私有仓库安装时，需要本机 GitHub 凭据有仓库访问权限。

## Clash 订阅

proxy-gateway 为 Clash Verge / Mihomo 提供本地 Shadowsocks 订阅：

```
http://127.0.0.1:3456/sub/clash.yaml?token=你的Token
```

在 Clash Verge 中添加此 URL 即可导入 SS 节点。订阅内容包含 `miyao` (18388) 和 `miyao-legacy` (8388) 两个节点。

### 完整代理链路

```
应用 → Clash (7897) → SOCKS5 (1080) → ss-local → SS Server (47.251.178.125)
```

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

## API 端点

当前文档列出 26 个 HTTP API 入口；44 是 `server/tests/` 中的测试用例数量。

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

### Clash 订阅

| 方法  | 路径                       | 说明                         |
|-------|----------------------------|------------------------------|
| GET   | `/sub/clash.yaml`          | Clash/Mihomo 本地订阅 YAML   |
| GET   | `/api/subscription/status` | 订阅 URL 和节点数量          |

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
├── index.mjs              # npm 模块导出入口
├── bin/
│   └── proxy-gateway.mjs  # CLI 入口
├── server/
│   ├── index.mjs          # 服务启动入口
│   ├── start.mjs          # 可复用启动/停止生命周期
│   ├── app.mjs            # Express 应用工厂
│   ├── state.mjs          # 运行时状态组装
│   ├── middleware/
│   │   └── auth.mjs       # Bearer Token 认证
│   ├── services/
│   │   ├── ports.mjs      # TCP 端口探测
│   │   ├── config.mjs     # 配置加载 + 密码脱敏
│   │   ├── command.mjs    # 白名单命令执行器
│   │   ├── ss-local.mjs   # ss-local 进程管理（互斥锁）
│   │   ├── http-proxy.mjs # HTTP-to-SOCKS5 桥接
│   │   ├── console-token.mjs # Token 持久化
│   │   ├── daemon-launcher.mjs # 守护进程启动器
│   │   └── clash-subscription.mjs # Clash YAML 生成
│   ├── routes/
│   │   ├── legacy-proxy.mjs # /api/ss/*, /api/proxy/*
│   │   ├── status.mjs     # /api/status
│   │   ├── diagnostics.mjs # /api/proxy/servers, /api/nginx/status, /api/ping/:host
│   │   ├── system-proxy.mjs # /api/system-proxy/*, /api/env-proxy/*, /api/autostart/*
│   │   ├── network.mjs    # /api/network/*
│   │   └── subscription.mjs # /sub/clash.yaml, /api/subscription/status
│   └── tests/             # 44 个测试用例，100% 通过
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

- **Runtime**: Node.js v24 (ESM)
- **Framework**: Express 5
- **Proxy**: socks-proxy-agent + socks (HTTP-to-SOCKS5)
- **Process**: child_process (ss-local 管理 + 守护进程)
- **Config**: dotenv

## 已知限制

- WorkBuddy 沙箱内无法绑定端口，需使用 `dangerouslyDisableSandbox` 或 `daemon.mjs` 启动
- Windows Hyper-V/Docker 保留端口范围 4002-4101，不可用于 Console
