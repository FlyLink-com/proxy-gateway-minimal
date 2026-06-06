# Proxy Gateway Minimal Compatibility Upgrade Design

Date: 2026-05-21

## Context

`proxy-gateway-minimal` is the currently usable Windows-focused proxy gateway project. It runs a single Express server from `server/index.mjs`, serves a static console from `public/index.html`, manages `sslocal.exe`, exposes a local HTTP-to-SOCKS5 proxy, and controls Windows proxy settings through `scripts/proxy.ps1`.

The reference project, `proxy-gateway-console`, is a fuller implementation with a React/Vite UI, Node API modules, Python runtime helpers, Tauri desktop packaging, tests, and safety documentation. The public GitHub snapshot also documents the open-source/private-deployment split.

This upgrade will move the minimal project toward the reference architecture without breaking the current working Windows proxy chain.

## Goals

- Keep the current operational entry points working.
- Introduce a modular backend structure that can be tested independently.
- Preserve existing API paths used by the current static UI and scripts.
- Add a React/Vite UI as an incremental frontend, not an immediate replacement.
- Add focused tests for lifecycle, port, auth, and diagnostics behavior.
- Bring over relevant safety and compatibility documentation.
- Import only lightweight Python agent capabilities that do not mutate system state.

## Non-Goals

- Do not migrate Tauri desktop packaging in this phase.
- Do not migrate Mac VPN, Linux proxy-stack, LAN gateway, nftables, or root-gated runtime flows.
- Do not replace Windows proxy behavior with a different platform model.
- Do not remove or rename the current legacy API paths.
- Do not commit real upstream credentials, local IP evidence, logs, or machine-specific runtime data.

## Compatibility Contract

These interfaces must continue to work:

- `npm run server`
- Console server: `127.0.0.1:4077`
- SOCKS5 local proxy: `127.0.0.1:1080`
- HTTP proxy bridge: `127.0.0.1:18180`
- Existing config files:
  - `.env`
  - `config/ss-local.json`
  - `config/proxy-servers.json`
  - `public/proxy.pac`
- Existing Windows script:
  - `scripts/proxy.ps1`
- Existing API families:
  - `/api/health`
  - `/api/proxy/*`
  - `/api/ss/*`
  - `/api/http-proxy/*`
  - `/api/system-proxy/*`
  - `/api/env-proxy/*`
  - `/api/autostart/*`
  - `/api/nginx/status`
  - `/api/ping/:host`

The old static UI remains available during the React migration. If a new frontend becomes the default, the legacy page must be preserved at a stable path such as `/legacy.html`.

## Target Structure

```text
proxy-gateway-minimal/
  server/
    index.mjs
    app.mjs
    middleware/
      auth.mjs
    routes/
      legacy-proxy.mjs
      system-proxy.mjs
      diagnostics.mjs
      status.mjs
    services/
      command.mjs
      config.mjs
      http-proxy.mjs
      ports.mjs
      ss-local.mjs
    tests/
      auth.test.mjs
      lifecycle.test.mjs
      status.test.mjs
  src/
    App.tsx
    main.tsx
    components/
    lib/
  public/
    legacy.html
    proxy.pac
  docs/
    SAFETY.md
    API_COMPATIBILITY.md
    MIGRATION.md
```

`server/index.mjs` remains the process entry point. It should become small: load environment, build the Express app, start the console listener, and start any configured default local proxy service.

## Backend Design

The backend should be split around runtime responsibilities:

- `services/ss-local.mjs` owns `sslocal.exe` lifecycle, temp config generation, process state, cleanup, and concurrent start protection.
- `services/http-proxy.mjs` owns the HTTP-to-SOCKS5 bridge and exposes idempotent start/stop/status operations.
- `services/ports.mjs` owns TCP port checks and status helpers.
- `services/config.mjs` loads proxy server config, substitutes environment secrets at runtime, and redacts sensitive values before returning API output.
- `services/command.mjs` wraps external command execution with fixed command allowlists, timeout handling, output limits, and no arbitrary shell execution.
- `middleware/auth.mjs` enforces local console token auth for control paths while keeping health and PAC endpoints public.
- `routes/legacy-proxy.mjs` exposes the existing `/api/proxy`, `/api/ss`, and `/api/http-proxy` endpoints by calling the services.
- `routes/system-proxy.mjs` exposes Windows proxy, environment proxy, and autostart routes through allowlisted commands.
- `routes/diagnostics.mjs` exposes remote server, nginx, ping, and proxy egress tests with host allowlists.
- `routes/status.mjs` exposes a new `/api/status` aggregate for the React UI.

The first implementation step should preserve behavior before expanding features. Tests should describe the intended current behavior, then changes can be made safely.

## Frontend Design

React/Vite will be added as a new UI surface. It should use a compact operations-console layout with:

- Current proxy chain status.
- Start and stop controls for full chain, SOCKS5, and HTTP bridge.
- System proxy mode controls: global, PAC, off.
- Environment proxy and autostart state.
- Remote server and diagnostics summaries.
- Last action result and recent local log messages.

The React UI should call `/api/status` for summary state and reuse existing control endpoints for actions. The old static page should remain available until the new UI covers all current controls.

## Data Flow

1. User opens the console on `127.0.0.1:4077`.
2. UI requests `/api/status`.
3. The status route calls backend services for process state, port checks, config summaries, and diagnostics readiness.
4. User triggers a control action.
5. The route validates auth and calls the relevant service.
6. The service mutates only the specific local state it owns.
7. Route returns normalized JSON with `ok`, `msg` or `error`, and relevant status fields.
8. UI refreshes `/api/status`.

This keeps UI state derived from backend services rather than from duplicated frontend assumptions.

## Error Handling

- Concurrent start requests must return an explicit "already starting" or equivalent conflict response.
- Starting `sslocal.exe` must verify that the process survived startup and that the SOCKS5 port is available.
- Port-occupied errors must distinguish "port is listening" from "our process is running" where possible.
- Stop operations should be idempotent and safe when already stopped.
- User-facing errors should be normalized instead of exposing raw Node stack traces or command internals.
- Command execution should capture bounded stdout/stderr and mark timeouts clearly.
- Diagnostics that depend on ICMP should not present ICMP failure as proof that TCP service is down.

## Security Boundary

- The API binds to loopback only.
- `/api/health` and `proxy.pac` can remain public.
- Control and system-mutating endpoints require the console token.
- Ping and TCP checks use configured host allowlists.
- External commands are fixed allowlisted calls, not arbitrary shell input.
- Config responses never expose Shadowsocks passwords or private tokens.
- Documentation must state that real credentials and machine evidence stay outside source control.

## Testing Strategy

Backend tests should use Node's built-in test runner:

- Auth middleware allows health/PAC and blocks control routes without token.
- Lifecycle start is mutex-protected under concurrent requests.
- Stop is idempotent.
- Port occupation is reported as a controlled failure.
- Config output redacts secrets.
- Status aggregation returns stable fields for the UI.
- Diagnostics host allowlist blocks unknown hosts.

Frontend checks should include TypeScript build and, once the Vite UI exists, a browser smoke check for a nonblank page and working action calls.

Python agent tests are limited to pure checks such as schema validation and local health helpers. They must not modify system proxy settings or privileged network routes.

## Implementation Phases

### Phase 1: Backend Core Stabilization

- Add baseline tests for existing lifecycle and API behavior.
- Split `server/index.mjs` into app, routes, services, and middleware.
- Keep all existing API paths compatible.
- Add `/api/status`.
- Normalize lifecycle errors and command execution output.

### Phase 2: React/Vite UI

- Add Vite, TypeScript, React, and UI source files.
- Build the new UI against `/api/status` and existing control endpoints.
- Preserve the legacy HTML page at a stable path.
- Add build and typecheck scripts.

### Phase 3: Documentation And Lightweight Agent

- Add safety, migration, and API compatibility docs.
- Import only non-mutating Python helper modules and tests.
- Keep desktop packaging and platform-specific runtime flows out of this phase.

## Acceptance Criteria

- `npm run server` starts the console on `127.0.0.1:4077`.
- Current Windows proxy chain ports remain `4077`, `1080`, and `18180`.
- Existing control APIs remain available.
- Legacy UI remains available.
- Backend lifecycle tests pass.
- React/Vite UI builds once introduced.
- No real credentials are exposed in docs, tests, or API responses.
- No Tauri, Mac VPN, Linux runtime, LAN gateway, or root-gated flows are introduced into the minimal project during this upgrade.

## Risks And Mitigations

- Risk: refactoring the single server file breaks the working proxy chain.
  - Mitigation: create baseline tests first and move code in small service slices.
- Risk: React migration creates two inconsistent UIs.
  - Mitigation: derive both old and new UI state from the same backend services and keep old API paths stable.
- Risk: full reference project contains platform-specific behavior that does not fit Windows minimal usage.
  - Mitigation: migrate architecture and tests first, not Mac/Linux runtime features.
- Risk: command execution endpoints become too broad.
  - Mitigation: keep command invocation fixed and allowlisted through `services/command.mjs`.

## User Approval

The user approved the compatibility-upgrade direction, the target directory/API structure, and the phased implementation strategy during the design discussion.
