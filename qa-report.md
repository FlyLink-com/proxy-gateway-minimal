# QA Test Report - Proxy Gateway Console

**Project:** proxy-gateway-minimal v0.1.0
**Date:** 2026-05-21
**Environment:** Windows, Node.js v24.15.0, Express 5.2.1, sslocal
**Server:** 47.251.178.125 (Aliyun Shadowsocks, AES-256-GCM)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Test Items | 42 |
| PASS | 42 |
| FAIL | 0 |
| **Pass Rate** | **100%** |
| Health Score | **100/100** |

**Critical Issues:** 0 | **High Issues:** 0 | **Medium Issues:** 0 | **Low Issues:** 0

---

## A. Unit Tests (42/42)

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

### Config Service (5 tests)
- ✅ SS_PASSWORD substitution in memory only
- ✅ preserves JSON-significant password characters
- ✅ leaves placeholders outside password fields
- ✅ publicProxyConfig redacts server passwords
- ✅ publicProxyConfig redacts nested password keys

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

### SS-Local Service (4 tests)
- ✅ spawns one child and reports running
- ✅ concurrent start protected by mutex
- ✅ rejects occupied SOCKS port
- ✅ stop is idempotent

### State Factory (2 tests)
- ✅ exposes expected ports and services
- ✅ reuses generated console token across restarts

### Clash Subscription (3 tests)
- ✅ emits Clash Shadowsocks YAML
- ✅ subscriptionSummary returns metadata without passwords
- ✅ routes are authenticated

### Routes & Integration (7 tests)
- ✅ static console loads without token (200)
- ✅ legacy proxy routes keep existing paths
- ✅ /api/status returns aggregate state
- ✅ ping route blocks unauthorized hosts (403)
- ✅ system proxy preserves legacy output field
- ✅ env proxy status returns enabled flag and vars

### Network Doctor (4 tests)
- ✅ parses Windows doctor JSON
- ✅ repair route returns repair actions
- ✅ script covers expected proxy layers
- ✅ does not recreate Internet Settings key during repair

### Script Validation (2 tests)
- ✅ network-doctor.ps1 covers proxy layers
- ✅ proxy.ps1 notifies Windows proxy subscribers

---

## B. Integration / Live Checks

| Check | Result | Details |
|-------|--------|---------|
| Console (3456) | ✅ | Health: `{"ok":true}` |
| SOCKS5 (1080) | ✅ | ss-local running, PID active |
| HTTP Proxy (18180) | ✅ | Listening, accepting connections |
| Remote SS (18388) | ✅ | TCP reachable |
| Remote SS (8388) | ✅ | TCP reachable |
| Nginx ports (5) | ✅ | All 5 ports reachable |
| Proxy exit via SOCKS5 | ✅ | 47.251.178.125 (Singapore) |
| Proxy exit via HTTP | ✅ | 47.251.178.125 (Singapore) |
| Clash subscription | ✅ | YAML generated with 2 nodes |
| Token persistence | ✅ | `.proxy-gateway/console-token` |

---

## C. Resolved Issues

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| BUG-001 | 🔴 Critical | Port 4077 in Windows excluded range (4002-4101) → EACCES | Changed to 3456 + CONSOLE_PORT env |
| BUG-002 | 🔴 Critical | Express 5.2.1 silent bind failure (callback fires before port bound) | Added `server.address()` null check in index.mjs |
| BUG-003 | 🟠 High | /api/proxy/status 404 (route not implemented) | Added route in diagnostics.mjs |
| BUG-004 | 🟠 High | isPortListening ECONNRESET crash on remote probing | Added settled guard + close event |
| BUG-005 | 🟠 High | spawnFn not passed to ss-local service | Added child_process.spawn import |
| BUG-006 | 🟡 Medium | Frontend hardcoded port 4077 | Dynamic port from API response |
| BUG-007 | 🟡 Medium | VSCode http.proxy pointed to 18180 (not Clash 7897) | Changed to 7897 |
| BUG-008 | 🟡 Medium | Clash subscription URL using old port 4077 | User to update in Clash Verge to 3456 |

---

## D. Recommendations

1. **Clash subscription URL**: Update in Clash Verge from `4077` to `3456`
2. **PAC rules**: Current PAC is global proxy; consider adding domain-based rules in Clash config
3. **Port monitoring**: Consider adding health check retry for remote SS servers
