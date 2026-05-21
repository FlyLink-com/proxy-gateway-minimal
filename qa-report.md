# QA Test Report - Proxy Gateway Console

**Project:** proxy-gateway-minimal v0.1.0
**Date:** 2026-05-21
**Environment:** Windows, Node.js v24.15.0, Express 5.2.1, sslocal
**Server:** 47.251.178.125 (Aliyun Shadowsocks, AES-256-GCM)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Test Items | 76 |
| PASS | 76 |
| FAIL | 0 |
| **Pass Rate** | **100%** |
| Health Score | **100/100** |

**Critical Issues:** 0 | **High Issues:** 0 | **Medium Issues:** 0 | **Low Issues:** 0

---

## A. Unit Tests (76/76)

### Auth Middleware (4 tests)
- ✅ public paths bypass auth (`/api/health`, `/proxy.pac`)
- ✅ protected paths require token
- ✅ blocks without token (401)
- ✅ accepts Bearer token and query token

### Command Runner (4 tests)
- ✅ captures stdout and exit code
- ✅ reports timeout correctly
- ✅ blocks unknown commands
- ✅ runs known command specs

### Config Service (6 tests)
- ✅ SS_PASSWORD substitution in memory only
- ✅ preserves JSON-significant password characters
- ✅ leaves placeholders outside password fields
- ✅ publicProxyConfig redacts server passwords
- ✅ publicProxyConfig redacts nested password keys
- ✅ allowedDiagnosticHosts deduplicates configured hosts

### Daemon Launcher (2 tests)
- ✅ provides visible token when env has none
- ✅ reuses persisted generated token across starts

### HTTP Proxy Service (3 tests)
- ✅ listens once
- ✅ rejects occupied port
- ✅ stop is idempotent

### Ports Service (2 tests)
- ✅ returns true for listening TCP port
- ✅ returns false for closed TCP port

### SS-Local Service (5 tests)
- ✅ spawns one child and reports running
- ✅ concurrent start protected by mutex
- ✅ rejects occupied SOCKS port
- ✅ generated config preserves JSON-significant password characters
- ✅ stop is idempotent

### State Factory (6 tests)
- ✅ exposes expected ports and services
- ✅ reuses generated console token across restarts
- ✅ wires subscription runtime services and default public URL
- ✅ respects public subscription URL override
- ✅ closes only owned subscription repositories
- ✅ supports injected subscription services

### Clash Subscription (4 tests)
- ✅ emits Clash Shadowsocks YAML
- ✅ subscriptionSummary returns metadata without passwords
- ✅ routes are authenticated
- ✅ route hides subscription service failures

### Package Entry (3 tests)
- ✅ root package exports stable module APIs
- ✅ startProxyGateway starts and stops an embedded app
- ✅ startProxyGateway closes runtime state on startup failure

### Routes & Integration (6 tests)
- ✅ static console loads without token (200)
- ✅ legacy proxy routes keep existing paths
- ✅ /api/status returns aggregate state
- ✅ ping route blocks unauthorized hosts (403)
- ✅ system proxy preserves legacy output field
- ✅ env proxy status returns enabled flag and vars

### Network Doctor & Scripts (5 tests)
- ✅ parses Windows doctor JSON
- ✅ repair route returns repair actions
- ✅ script covers expected proxy layers
- ✅ does not recreate Internet Settings key during repair
- ✅ proxy.ps1 notifies Windows proxy subscribers

### Subscription Admin Core (26 tests)
- ✅ SQLite repository tests passing
- ✅ token hash, token prefix, and status validation tests passing
- ✅ subscription service create/renew/disable/enable/reset and overview tests passing
- ✅ admin subscription route tests passing
- ✅ tenant-token subscription fetch tests passing
- ✅ console-token subscription compatibility preserved

---

## B. Integration / Live Checks

| Check | Result | Details |
|-------|--------|---------|
| Console (3456) | ✅ | `/api/health`: `{"ok":true}` |
| SOCKS5 (1080) | ✅ | ss-local running, PID active |
| HTTP Proxy (18180) | ✅ | Listening, accepting connections |
| Remote SS (18388) | ✅ | TCP reachable |
| Remote SS (8388) | ✅ | TCP reachable |
| Nginx ports (5) | ✅ | All 5 ports reachable |
| Proxy exit via SOCKS5 | ✅ | 47.251.178.125 (Singapore) |
| Proxy exit via HTTP | ✅ | 47.251.178.125 (Singapore) |
| Clash subscription | ✅ | YAML generated with 2 nodes |
| Token persistence | ✅ | `.proxy-gateway/console-token` |
| npm module entry | ✅ | `index.mjs` exports app/runtime APIs and Clash subscription helpers |
| npm package dry run | ✅ | 38 files, excludes tests/secrets/generated state |

---

## C. Resolved Issues

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| BUG-001 | 🔴 Critical | Port 4077 in Windows excluded range (4002-4101) → EACCES | Changed to 3456 + CONSOLE_PORT env |
| BUG-002 | 🔴 Critical | Express 5.2.1 silent bind failure (callback fires before port bound) | Added reusable start lifecycle with `listening` event bind check |
| BUG-003 | 🟠 High | /api/proxy/status 404 (route not implemented) | Added route in diagnostics.mjs |
| BUG-004 | 🟠 High | isPortListening ECONNRESET crash on remote probing | Added settled guard + close event |
| BUG-005 | 🟠 High | spawnFn not passed to ss-local service | Added child_process.spawn import |
| BUG-006 | 🟡 Medium | Frontend hardcoded port 4077 | Dynamic port from API response |
| BUG-007 | 🟡 Medium | VSCode http.proxy pointed to 18180 (not Clash 7897) | Changed to 7897 |
| BUG-008 | 🟡 Medium | Clash subscription URL using old port 4077 | User to update in Clash Verge to 3456 |

---

## D. Recommendations

1. **Private Git install**: Use GitHub credentials when installing this package from the private repo
2. **sslocal.exe distribution**: Keep the Windows binary outside the npm package and install/provide it per target machine
3. **Port monitoring**: Consider adding health check retry for remote SS servers
