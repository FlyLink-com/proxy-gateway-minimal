# HTTP Bridge Boundary Tests And Robustness

## Status

Approved for implementation.

## Target Component

HTTP-to-SOCKS5 bridge:

- Current location: `server/state.mjs` `createBridgeServer()`
- Intended extraction target: `server/services/http-bridge.mjs`
- Lifecycle wrapper: `server/services/http-proxy.mjs`

## Context And Motivation

The proxy gateway currently keeps the HTTP bridge core inside
`server/state.mjs`. The bridge uses `node-fetch` plus `socks-proxy-agent` for
normal HTTP proxy requests and `socks` `SocksClient.createConnection()` for
HTTPS `CONNECT` tunnels. `server/services/http-proxy.mjs` only owns outer port
binding and lifecycle state.

`docs/NETWORK_FORWARDING.md` already records the remaining technical debt:
explicit tests for HTTP absolute URL proxying, HTTPS `CONNECT`, malformed URLs,
SOCKS-down `502`, and loopback binding.

This work should make the bridge testable with dependency injection, then add
focused boundary tests that simulate network failures without touching real
public internet endpoints, AWS nodes, production services, Nginx, systemd, or
Windows proxy scripts.

## Goals

### Dependency Injection

`createBridgeServer()` must support optional dependency injection for tests
while preserving production defaults:

```js
createBridgeServer({
  socksPort,
  fetchFn = nodeFetch,
  SocksProxyAgentClass = SocksProxyAgent,
  socksClient = SocksClient,
  timeoutMs = 15000
})
```

The production runtime should keep using the real `node-fetch`,
`SocksProxyAgent`, and `SocksClient` dependencies by default.

### URL Validation

The bridge must reject malformed proxy request targets before attempting to
proxy them.

Required baseline:

- `GET /relative-path` returns `400`.

Optional hardening if implemented in the same small change:

- absolute-looking but invalid request targets such as `httpjunk` return `400`
  instead of reaching the internal proxy path and becoming `502`.
- Use `new URL()` or equivalent structured validation instead of relying only
  on `startsWith("http")`.

### HTTP Failure Handling

When the SOCKS path is unavailable or the injected `fetchFn` fails, the HTTP
client should receive a `502` response and the request should finish without
hanging. Tests should not require a specific reason phrase such as
`Bad Gateway`.

### CONNECT Failure Handling

When the SOCKS path is unavailable or the injected `socksClient` fails during a
`CONNECT` request, the client socket should receive a `502` response and then be
closed or destroyed cleanly.

### Crash Prevention

The bridge must not allow simulated upstream errors to become process-level
failures.

Tests should cover:

- `fetchFn` returns a response whose body stream later emits an error.
- A peer socket created after a successful `CONNECT` later emits an error.

Neither case should trigger `unhandledRejection` or `uncaughtException`.

### Loopback Binding And Release

`createHttpProxyService.start()` must keep the listener bound to `127.0.0.1`.

`createHttpProxyService.stop()` must close the listener cleanly so the port can
be reused.

## Non-Goals

- Do not call public internet services such as `httpbin`.
- Do not call the production AWS node `47.129.247.102`.
- Do not mutate AWS, production, Nginx, systemd, security groups, or deploy
  state.
- Do not change `ss-local`, `ss-server`, Admin UI, or Windows PowerShell
  scripts.
- Do not introduce Redis, Node cluster, high-concurrency tuning, or a larger
  proxy architecture.

## Test Matrix

| Scenario | Expected Behavior |
| --- | --- |
| `GET /relative-path` | HTTP status `400`; body contains an error message. |
| `GET http://example.test` with SOCKS unavailable or injected fetch failure | HTTP status `502`; request ends without hanging. |
| `CONNECT example.com:443` with SOCKS unavailable or injected connect failure | client socket receives `502` and then closes or is destroyed. |
| `fetchFn` body stream emits an error | no `unhandledRejection` or `uncaughtException`; response socket closes. |
| peer socket emits `error` after successful `CONNECT` | peer/client sockets are closed or destroyed; process does not crash. |
| `createHttpProxyService.start()` | server address reports host `127.0.0.1`. |
| `createHttpProxyService.stop()` | listener closes cleanly and the port can be reused. |
| invalid absolute-looking URL such as `httpjunk` | if strict URL validation is introduced, returns `400` rather than proxying and returning `502`. |

## Implementation Path

### Step 1: Specification

Add this specification to the repository as a docs-only PR. This establishes
the acceptance contract before refactoring or adding tests.

### Step 2: Lossless Refactor And Dependency Injection

Create `server/services/http-bridge.mjs`.

Move `createBridgeServer()` from `server/state.mjs` into the new module and add
the dependency-injection options listed above.

`server/state.mjs` should import the extracted function and continue creating
the bridge with default production dependencies. Existing production behavior
should remain unchanged.

Run existing tests after the refactor.

### Step 3: Boundary Tests And Minimal Fixes

Add `server/tests/http-bridge.test.mjs`.

Implement the test matrix using injected dependencies and local test sockets
only. Do not perform real internet, AWS, or production calls.

Apply only targeted fixes exposed by tests, such as:

- structured URL validation;
- abort/timeout handling if needed;
- handling `proxyRes.body` stream errors;
- closing/destroying sockets on `CONNECT` failure or peer socket errors.

## Acceptance Criteria

- `createBridgeServer()` is exported from `server/services/http-bridge.mjs`.
- Production `createRuntimeState()` still creates the bridge with default
  dependencies and default ports.
- HTTP malformed targets return `400`.
- HTTP upstream/SOCKS failure returns `502` and does not hang.
- CONNECT upstream/SOCKS failure sends `502` and closes the client socket.
- Simulated body stream and peer socket errors do not produce process-level
  `unhandledRejection` or `uncaughtException`.
- `createHttpProxyService` loopback binding and stop/release behavior are
  covered.
- No AWS, production, Nginx, systemd, Admin UI, Windows PowerShell, `ss-local`,
  or `ss-server` changes are included.
- No secrets, tokens, generated subscription URLs, or customer data are added.

## Validation For Implementation PRs

Code implementation PRs should run at minimum:

```powershell
git diff --check origin/master...HEAD
npm test
```

If Admin UI files are not touched, `npm run admin:test` and
`npm run admin:build` are optional but may be run for the normal repository
closeout standard.
