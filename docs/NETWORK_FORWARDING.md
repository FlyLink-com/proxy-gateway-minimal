# Network Forwarding Architecture

Last updated: 2026-05-24, Asia/Shanghai.

This document describes how traffic moves through `proxy-gateway-minimal`.
It is an architecture and operations reference only. It does not authorize AWS,
production, Nginx, systemd, security group, or secret changes.

## Scope

The project has several network paths that look related but are not the same
data path:

- Windows local system proxy forwarding.
- PAC-based local forwarding.
- Clash/Mihomo subscription forwarding.
- Admin UI operation through local access or an SSH tunnel.
- Production public gateway and Shadowsocks runtime.

The most important rule is:

```text
Local system proxy mode uses the local HTTP-to-SOCKS bridge or local SOCKS5.
Clash/Mihomo subscription mode does not use local ss-local after it has the YAML.
```

## Mode A: Windows Local Forwarding

This mode is used when the Windows system proxy, user proxy environment
variables, or the local PAC route traffic into this project. There are two
local sub-paths, depending on which Windows or application proxy setting is
used.

```text
Windows application
  -> WinINet, PAC, HTTP_PROXY, or HTTPS_PROXY
  -> 127.0.0.1:18180 Node HTTP-to-SOCKS bridge
  -> 127.0.0.1:1080 ss-local SOCKS5
  -> ss-sg.globalcirclecat.com:18388 current production Shadowsocks node

ALL_PROXY-aware application
  -> 127.0.0.1:1080 ss-local SOCKS5
  -> ss-sg.globalcirclecat.com:18388 current production Shadowsocks node
```

Implementation notes:

- `server/state.mjs` creates the HTTP bridge with `SocksProxyAgent` for normal
  HTTP requests and `SocksClient.createConnection()` for HTTPS `CONNECT`.
- `server/services/http-proxy.mjs` binds that bridge to `127.0.0.1:18180`.
- `server/services/ss-local.mjs` starts `bin/sslocal.exe` from
  `config/ss-local.json`.
- `config/ss-local.json` currently points at the production primary
  Shadowsocks DNS name, `ss-sg.globalcirclecat.com:18388`, and binds local
  SOCKS5 on `127.0.0.1:1080`.

Security boundary:

- `18180` is unauthenticated by design because it is a local system-proxy
  component.
- `18180` must stay loopback-only.
- Do not expose `18180` on LAN, through Nginx, or through any public firewall
  rule.

## Mode B: PAC Forwarding

`public/proxy.pac` is served by the local console and routes selected browser
traffic into the local HTTP bridge.

```text
Application
  -> PAC decision
  -> DIRECT or 127.0.0.1:18180
  -> Node HTTP-to-SOCKS bridge
  -> ss-local
  -> AWS Shadowsocks server
```

PAC behavior:

- Localhost and private networks go `DIRECT`.
- CN domain suffixes and selected CN service domains go `DIRECT`.
- Other HTTP/HTTPS traffic goes to `PROXY 127.0.0.1:18180`.
- The PAC file intentionally avoids `dnsResolve()` calls to reduce DNS leakage
  through the local ISP resolver.

## Mode C: Clash/Mihomo Subscription Forwarding

This mode is used when Clash or Mihomo imports the subscription YAML.

### Direct Token Path (Legacy/Direct)

```text
Clash or Mihomo
  -> GET /sub/clash.yaml?token=...
  -> receives direct node YAML
  -> connects directly to the emitted nodes
```

### Opaque Artifact Direct Path

```text
Clash or Mihomo
  -> GET /sub/a/<artifact>
  -> receives direct node YAML
  -> connects directly to the emitted nodes
```

### Opaque Artifact Provider-Mode Path

```text
Clash or Mihomo
  -> GET /sub/a/<artifact>/profile.yaml
  -> receives outer profile with proxy-provider reference
  -> fetches GET /sub/a/<artifact>/provider.yaml (background/periodic)
  -> receives node pool YAML
  -> connects directly to the emitted nodes
```

In this mode `proxy-gateway-minimal` is a subscription generator and access
controller. It is not the data forwarding component after the client has the
YAML.

Implementation notes:

- `server/routes/subscription.mjs` handles `/sub/clash.yaml` and the `/sub/a/*` artifact routes.
- `/sub/clash.yaml` accepts the console token or tenant/temporary tokens.
- Opaque artifact routes (`/sub/a/:artifact`) use a hashed secret boundary.
- `server/services/clash-subscription.mjs` emits Clash YAML with direct
  nodes (Shadowsocks, TUIC, Hysteria2, VLESS) from `config/proxy-servers.json`.
- The provider-mode renderer (`generateClashProviderSubscription`) separates the outer profile from the active credentials (`provider.yaml`).
- The generated YAML contains the remote server host, port, cipher, and
  password. It does not point Clash/Mihomo at `127.0.0.1:1080` or
  `127.0.0.1:18180`.

Do not document or assume this path as:

```text
Clash/Mihomo -> local HTTP proxy -> local ss-local -> remote SS
```

That is the Windows local forwarding path, not the subscription-client path.

## Mode D: Admin UI Operation

The Admin UI is an operator console, not a public application.

Expected paths:

```text
Local Vite admin UI
  -> same-origin /api through Vite dev proxy
  -> SSH tunnel 127.0.0.1:3456
  -> production loopback Admin API
```

or, for a local backend:

```text
Local Admin UI
  -> local 127.0.0.1:3456 Admin API
```

Boundaries:

- Admin API calls use `Authorization: Bearer <console-token>`.
- Admin API calls must not use console tokens in query strings.
- The public Nginx gateway must not expose the static Admin UI or
  `/api/admin/*`.
- Generated subscription URLs may include subscription tokens only as
  backend-returned visible-once results after create, reset, or temporary-link
  generation.

## Production Runtime Roles

The current production primary node is provider-neutral `prod-edge-a`. The
subscription gateway and primary Shadowsocks node DNS names currently resolve
to the `prod-edge-a` production target:

```text
sub.globalcirclecat.com   -> production subscription gateway
ss-sg.globalcirclecat.com -> primary Shadowsocks node
```

Legacy blue `47.129.247.102` is not the current production target. It remains
under retirement review only.

On production, the server has two separate runtime roles:

```text
Express Console/API
  -> 127.0.0.1:3456
  -> systemd proxy-gateway-console.service

Shadowsocks server
  -> 0.0.0.0:18388 TCP/UDP
  -> systemd proxy-gateway-ss.service
```

The Shadowsocks service template starts:

```text
/usr/bin/ss-server -s 0.0.0.0 -p 18388 -m aes-256-gcm -k ${SS_PASSWORD} -u
```

Public access is controlled by Nginx:

```text
/api/health      -> proxied to 127.0.0.1:3456
/sub/clash.yaml  -> proxied to 127.0.0.1:3456
/api/admin/*     -> 404
/                -> 404
```

Production is not a staging target. Production should be read-only for
architecture research and must not be used for network-forwarding experiments.

## Windows Scripts

`scripts/proxy.ps1` manages Windows proxy ownership:

- `on`: sets WinINet proxy to `127.0.0.1:18180`.
- `off`: clears the WinINet proxy.
- `pac`: sets the PAC URL to `http://127.0.0.1:3456/proxy.pac`.
- `env`: sets user-level `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY`.
- `env-off`: clears user-level proxy environment variables.
- `status`: prints the current WinINet proxy state.

`HTTP_PROXY` and `HTTPS_PROXY` point at the local HTTP bridge
`127.0.0.1:18180`, while `ALL_PROXY` points directly at the local SOCKS5
listener `127.0.0.1:1080`.

`scripts/network-doctor.ps1` performs broader diagnostics and repair:

- Console port, SOCKS5 port, and HTTP proxy port checks.
- WinINet, user environment, and optional WinHTTP proxy checks.
- Clash/Mihomo process, common port, and config conflict detection.
- Daemon startup and proxy-stack startup through `/api/proxy/start`, which is a
  local proxy control compatibility route and can be disabled with
  `LOCAL_PROXY_CONTROL_ROUTES_ENABLED=false`.

Current limitations to keep explicit:

- Windows proxy scripts currently assume the default local ports: Console
  `3456`, SOCKS5 `1080`, HTTP proxy `18180`, and PAC URL
  `http://127.0.0.1:3456/proxy.pac`.
- `createRuntimeState()` supports `CONSOLE_PORT`, and changing it affects the
  Node runtime. It does not automatically reconfigure `scripts/proxy.ps1`,
  `scripts/network-doctor.ps1`, or the PAC URL.
- Keep this fixed-port policy until there is a concrete operator need for
  local multi-port runtimes, side-by-side gateway instances, or explicit
  non-default Windows proxy workflows.
- `network-doctor.ps1` currently reads `CONSOLE_TOKEN` only from the process
  environment or `.proxy-gateway/console-token`. It does not read `.env`,
  production `.env`, or other secret sources by default.

## Secret And Temporary File Boundary

`server/services/ss-local.mjs` replaces `${SS_PASSWORD}` in the
`config/ss-local.json` template, writes a temporary JSON config, starts
`sslocal.exe -c <temp-config> -U`, and then cleans the file on process exit or
after a short timeout.

Operational implication:

- The temporary config can briefly contain `SS_PASSWORD`.
- Do not log or commit generated temp configs.
- This is acceptable for the current single-user Windows workstation model.
- If the local forwarding stack is moved to a multi-user host, add a separate
  hardening task for temporary-file permissions or a safer secret handoff.

## HTTP Bridge Robustness Baseline

The HTTP-to-SOCKS bridge is implemented in
`server/services/http-bridge.mjs`. `server/state.mjs` wires the production
runtime with the default `node-fetch`, `SocksProxyAgent`, and `SocksClient`
dependencies. Tests can inject `fetchFn`, `SocksProxyAgentClass`,
`socksClient`, and `timeoutMs`.

Current tested behavior:

- malformed or relative proxy request targets return `400`;
- injected fetch/SOCKS failures return `502` without hanging;
- failed `CONNECT` attempts return `502` and close the client socket;
- upstream body stream errors do not become process-level failures;
- peer/client socket errors after `CONNECT` destroy both sides;
- `createHttpProxyService` binds the bridge to loopback and releases the
  listener port on stop.

The boundary suite lives in `server/tests/http-bridge.test.mjs` and uses only
mocked dependencies plus local loopback sockets. It must not call public
internet endpoints, AWS, production services, or legacy node IPs.

## Staging Requirement For Node Changes

Any change that affects these surfaces must be tested on a clean staging server
or an explicitly assigned staging node before production:

- `ss-server` command, method, port, UDP behavior, or service unit.
- `ss-local` config, local port, remote node target, or secret substitution.
- `config/proxy-servers.json` host, port, method, password, or node list.
- `/sub/clash.yaml` YAML generation.
- Nginx public exposure.
- Security group rules or public ports.
- Clash/Mihomo client connection behavior.
- Windows local proxy, PAC, WinINet, WinHTTP, or environment proxy behavior.

Rules:

- Production is read-only during network-forwarding research.
- The stopped historical node is not staging unless it is explicitly reassigned,
  retagged, rebuilt, and verified.
- A clean staging instance must use staging-only `.env`, `CONSOLE_TOKEN`,
  `SS_PASSWORD`, SQLite data, and node config.
- Do not copy production subscription data, subscription URLs, tenant tokens, or
  Shadowsocks secrets into staging.
- Follow `docs/STAGING_PROVISIONING.md` dry-run and approval gates before any
  mutating AWS command.

## Staging Test Matrix For Node Changes

Use this matrix after a clean staging target exists and only after operator
approval for staging mutation.

### 1. Server Runtime

```bash
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
ss -lntup
curl -i http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/api/admin/subscriptions
```

Expected:

```text
Console/API listens on 127.0.0.1:3456 only.
Shadowsocks listens on the staging port.
Nginx is active.
Admin API without Bearer token returns 401 on loopback.
```

### 2. Public Gateway

```powershell
curl.exe -i http://<staging-public-ip>/api/health
curl.exe -i http://<staging-public-ip>/api/admin/subscriptions
curl.exe -i http://<staging-public-ip>/sub/clash.yaml
curl.exe -i http://<staging-public-ip>/
curl.exe -i http://<staging-public-ip>/index.html
```

Expected:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
/ -> 404
/index.html -> 404
```

### 3. Subscription YAML

```powershell
curl.exe -i "http://<staging-public-ip>/sub/clash.yaml?token=<staging-token>"
```

Check:

```text
server is the staging public IP or staging node host.
port is the staging Shadowsocks port.
cipher is the expected staging cipher.
password is a staging-only secret.
no production IP, production password, or production subscription token appears.
```

### 4. Clash/Mihomo Client

Validate from a client that is safe for staging testing:

```text
Subscription import succeeds.
The staging node connects.
External egress works as expected.
DNS behavior is acceptable for the client profile.
Stopping or deleting staging does not affect production users.
```

### 5. Windows Local Forwarding

If the change affects local `ss-local`, HTTP proxy, PAC, or Windows proxy
ownership, validate on Windows:

```text
127.0.0.1:1080 ss-local
127.0.0.1:18180 HTTP-to-SOCKS bridge
proxy:on / proxy:off / proxy:pac
network:status / network:repair / network:reset
```

Keep the two paths separate during validation:

```text
Clash/Mihomo subscription mode:
Clash/Mihomo -> staging ss-server

Windows local forwarding mode:
Application -> 18180 HTTP bridge -> 1080 ss-local -> staging ss-server
```

## Follow-Up Work

Recommended order:

1. P2 tests: consider explicit coverage for client-normal-close cleanup on the
   HTTP bridge upstream socket.
2. P2 tests: consider response-body edge cases such as `HEAD` or `204` where
   `proxyRes.body` may be null.
3. P2 docs/tests: keep Clash/Mihomo subscription mode separated from Windows
   local forwarding mode in future diagrams and tests.

## Forbidden During Architecture Research

Do not:

- Change production `ss-server`, `.env`, SQLite, Nginx, security group,
  production DNS, or `config/proxy-servers.json`.
- Copy production `SS_PASSWORD`, `CONSOLE_TOKEN`, tenant tokens, subscription
  URLs, or SQLite data into docs, PR comments, chat, or staging.
- Treat the stopped historical instance as staging without explicit reassignment.
- Publicly expose Admin UI, `/api/admin/*`, `3456/tcp`, `18180/tcp`, or
  `1080/tcp`.
- Use production as the place to test node changes.

## Research Record Template

Use this template for future network-forwarding research or staging validation:

```text
Date:
Branch:
Candidate SHA:
Mode under test: local forwarding / PAC / Clash subscription / Admin tunnel
Environment: local Windows / clean staging / production read-only
Commands run:
Expected results:
Actual results:
Secrets used: none recorded
Production touched: no
Abort conditions hit:
Follow-up tasks:
```
