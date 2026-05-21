# Module Package Design

## Goal

Turn `proxy-gateway-minimal` into a reusable local module while keeping the existing Windows console behavior and HTTP API stable.

## Shape

- Keep `server/index.mjs` as the backwards-compatible service entrypoint.
- Add root `index.mjs` for package consumers.
- Add `server/start.mjs` for reusable start/stop lifecycle control.
- Add `bin/proxy-gateway.mjs` as the package CLI.
- Add package metadata: `main`, `exports`, `bin`, `files`, `engines`.
- Add `.env.example` so installs do not require copying a secret-bearing `.env`.

## Public Module API

- App/runtime: `createApp`, `createRuntimeState`, `startProxyGateway`, `installProcessHandlers`.
- Config/subscription: `loadProxyConfig`, `publicProxyConfig`, `generateClashSubscription`, `subscriptionSummary`.
- Lower-level factories remain exportable for internal reuse: command runner, HTTP proxy service, ss-local service, token resolver, daemon launcher, port helpers.

## Packaging Rules

- Include runtime code, config templates, scripts, public UI, README, and API compatibility docs.
- Exclude `.env`, `.proxy-gateway`, logs, generated worktrees, tests, and AWS secret material from npm package output.

## Verification

- Existing API test suite must still pass.
- New package-entry tests must verify root exports and embedded start/stop.
- `npm pack --dry-run --json` must show the expected package files and must not include secrets or test files.
