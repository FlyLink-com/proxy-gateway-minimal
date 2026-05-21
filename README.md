# Proxy Gateway Console

轻量级代理网关控制台 — 一体化 Node.js 网络代理管理工具，集成 Shadowsocks 客户端管理、HTTP-to-SOCKS5 代理转换和系统代理控制。

## 架构概览

```
┌─────────────────────────────────────────────────┐
│              Proxy Gateway Console              │
│               (Express 5, :4077)                │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐ │
│  │ Console   │   │ HTTP Proxy│   │ SOCKS5    │ │
│  │ :4077     │   │ :18180    │   │ :1080     │ │
│  │ (Web UI)  │──▶│ (Forward) │──▶│ (ss-local)│ │
│  └───────────┘   └───────────┘   └───────────┘ │
│       │                                │        │
│       ▼                                ▼        │
│  System Proxy Settings          Remote SS Server│
│  (PAC / Global / Off)           (Aliyun HK)    │
└─────────────────────────────────────────────────┘
```

| 端口   | 服务          | 说明                              |
|--------|--------------|-----------------------------------|
| 4077   | Console API  | Web 管理界面 + REST API           |
| 1080   | SOCKS5       | ss-local 本地 SOCKS5 代理         |
| 18180  | HTTP Proxy   | HTTP-to-SOCKS5 转发代理           |

## 快速启动

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制并编辑 `.env` 文件：

```bash
cp .env.example .env
# 编辑 .env，填入 SS 密码
```

`.env` 文件内容：

```
SS_PASSWORD=your_shadowsocks_password_here
# 可选：固定控制台 token；不配置时会首次启动自动生成
# CONSOLE_TOKEN=your_console_token_here
```

### 3. 启动服务

```bash
npm run server
```

访问 http://127.0.0.1:4077/ 进入管理控制台。

首次启动时如果没有配置 `CONSOLE_TOKEN`，服务会生成本地控制台 token，并保存到 `.proxy-gateway/console-token`。后续重启会复用同一个 token，避免控制台因重启失效；`.proxy-gateway/` 已加入 gitignore。

## 代理模式

| 模式   | 命令              | 说明                                      |
|--------|-------------------|-------------------------------------------|
| 全局   | `npm run proxy:on`  | 所有流量通过 HTTP 代理 (127.0.0.1:18180) |
| PAC    | `npm run proxy:pac` | 根据 PAC 规则自动分流（CN 直连，其余代理）|
| 关闭   | `npm run proxy:off` | 关闭系统代理，恢复直连                    |
| 状态   | `npm run proxy:status` | 查看当前系统代理设置                   |

## Windows 网络修复

当 Windows 侧网络代理异常时，先跑只读诊断，再执行修复：

```powershell
npm run network:status
npm run network:repair
```

`network:status` 会检查 Console `4077`、SOCKS5 `1080`、HTTP `18180`、WinINet 系统代理、用户环境变量、WinHTTP、Task Scheduler 和 Clash/Mihomo 常见端口。`network:repair` 会启动本项目守护进程和代理链，并把 WinINet 与用户环境变量指向 `127.0.0.1:18180` / `127.0.0.1:1080`。它只提示 Clash/Mihomo 冲突，不会卸载或强杀其他代理。

需要清空本项目写入的系统代理和用户环境变量时：

```powershell
npm run network:reset
```

WinHTTP 默认只诊断不改写；确实需要服务级代理时，可直接运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\network-doctor.ps1 repair -IncludeWinHttp
```

## API 端点

### Shadowsocks 管理

| 方法   | 路径                | 说明               |
|--------|---------------------|--------------------|
| POST   | `/api/ss/start`     | 启动 ss-local 进程 |
| POST   | `/api/ss/stop`      | 停止 ss-local 进程 |

### 代理管理

| 方法   | 路径                     | 说明                           |
|--------|--------------------------|--------------------------------|
| POST   | `/api/proxy/start`       | 启动完整代理链 (SOCKS5 + HTTP) |
| POST   | `/api/proxy/stop`        | 停止所有代理服务               |
| GET    | `/api/proxy/overview`    | 代理服务状态总览               |
| GET    | `/api/proxy/status`      | 远端服务器 TCP 连通性检测      |
| GET    | `/api/proxy/test`        | 通过代理访问 httpbin.org 测试  |
| GET    | `/api/proxy/servers`     | 获取代理服务器列表             |

### HTTP 代理控制

| 方法   | 路径                      | 说明             |
|--------|---------------------------|------------------|
| POST   | `/api/http-proxy/start`   | 启动 HTTP 代理   |
| POST   | `/api/http-proxy/stop`    | 停止 HTTP 代理   |

### 系统代理

| 方法   | 路径                          | 说明                              |
|--------|-------------------------------|-----------------------------------|
| POST   | `/api/system-proxy/:action`   | 设置系统代理 (`on`/`off`/`pac`)  |

### Windows 网络修复

| 方法   | 路径                  | 说明                       |
|--------|-----------------------|----------------------------|
| GET    | `/api/network/status` | Windows 代理栈完整诊断     |
| POST   | `/api/network/repair` | 启动代理链并接管 WinINet/环境变量 |
| POST   | `/api/network/reset`  | 清空本项目写入的代理设置   |

### Clash 本地订阅

| 方法   | 路径                       | 说明                         |
|--------|----------------------------|------------------------------|
| GET    | `/sub/clash.yaml`          | Clash/Mihomo 本地订阅 YAML   |
| GET    | `/api/subscription/status` | 本地订阅 URL 和节点数量      |

订阅内容包含 Shadowsocks 凭据，必须带 Console Token 访问：

```
http://127.0.0.1:4077/sub/clash.yaml?token=your_console_token
```

### 诊断

| 方法   | 路径               | 说明                    |
|--------|--------------------|-------------------------|
| GET    | `/api/health`      | 服务健康检查            |
| GET    | `/api/nginx/status`| Nginx 端口连通性检测    |
| GET    | `/api/ping/:host`  | Ping 指定主机           |

## 配置文件

| 文件                        | 说明                                      |
|-----------------------------|-------------------------------------------|
| `.env`                      | 环境变量（SS 密码等敏感信息，已 gitignore）|
| `.proxy-gateway/console-token` | 自动生成的本地控制台 token（已 gitignore）|
| `config/ss-local.json`      | ss-local 配置模板（密码为占位符，运行时替换）|
| `config/proxy-servers.json` | 代理服务器列表（密码为占位符，运行时替换）  |
| `public/proxy.pac`          | PAC 自动分流规则文件                      |
| `scripts/proxy.ps1`         | Windows 系统代理设置脚本                  |
| `scripts/network-doctor.ps1`| Windows 代理诊断、修复和冲突检测脚本      |
| `bin/sslocal.exe`           | Shadowsocks 客户端可执行文件              |

## 技术栈

- **Runtime**: Node.js (ESM)
- **Framework**: Express 5
- **Proxy**: socks-proxy-agent + socks (HTTP-to-SOCKS5)
- **Process**: child_process (ss-local 管理)
- **Config**: dotenv (环境变量管理)
