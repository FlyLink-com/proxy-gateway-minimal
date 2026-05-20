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
```

### 3. 启动服务

```bash
npm run server
```

访问 http://127.0.0.1:4077/ 进入管理控制台。

## 代理模式

| 模式   | 命令              | 说明                                      |
|--------|-------------------|-------------------------------------------|
| 全局   | `npm run proxy:on`  | 所有流量通过 HTTP 代理 (127.0.0.1:18180) |
| PAC    | `npm run proxy:pac` | 根据 PAC 规则自动分流（CN 直连，其余代理）|
| 关闭   | `npm run proxy:off` | 关闭系统代理，恢复直连                    |
| 状态   | `npm run proxy:status` | 查看当前系统代理设置                   |

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
| `config/ss-local.json`      | ss-local 配置模板（密码为占位符，运行时替换）|
| `config/proxy-servers.json` | 代理服务器列表（密码为占位符，运行时替换）  |
| `public/proxy.pac`          | PAC 自动分流规则文件                      |
| `scripts/proxy.ps1`         | Windows 系统代理设置脚本                  |
| `bin/sslocal.exe`           | Shadowsocks 客户端可执行文件              |

## 技术栈

- **Runtime**: Node.js (ESM)
- **Framework**: Express 5
- **Proxy**: socks-proxy-agent + socks (HTTP-to-SOCKS5)
- **Process**: child_process (ss-local 管理)
- **Config**: dotenv (环境变量管理)
