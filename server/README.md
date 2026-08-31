# Server Workspace

This file is a responsibility and navigation entry point. It does not establish
global, release, deployment, runtime, or production authority.

## Responsibility

`server/` owns the Node.js control-plane application: HTTP middleware and
routes, domain services, persistence adapters, edge integration contracts, and
the runtime composition used by the application process.

## Entry Points

- [index.mjs](index.mjs) loads the environment and starts the process.
- [start.mjs](start.mjs) contains the shared startup lifecycle.
- [app.mjs](app.mjs) composes the Express application and routes.
- [state.mjs](state.mjs) composes the current runtime dependencies.
- [routes](routes) and [services](services) contain HTTP adapters and domain or
  integration services; [tests](tests) contains the Node test suite.

## Development

Run `npm run server` from the repository root for the local service. Keep new
behavior in the smallest owning route or service and use `state.mjs` only for
composition when possible.

## Validation

Run the focused `node --test server/tests/<name>.test.mjs` command for the
changed boundary, then `npm test` and
`git diff --check origin/master...HEAD`.

## Release identity

`CONTROL_PLANE_RELEASE_IDENTITY_PATH` is optional at the application boundary.
If absent, bearer-protected `/api/status` reports `releaseIdentity.state` as
`unavailable`; this does not verify the running release. If configured, the
service reads one canonical identity file once during startup and fails closed
if the path or file is invalid or linked, if it changes while being read, or,
on POSIX, if it is group- or other-writable. The identity is never added to the
public `/api/health` response.

## Boundary

This workspace does not own frontend builds, provider configuration, host
provisioning, or production deployment. The presence of runtime adapters or
mutation-capable services in source does not authorize their use; production,
auth-model, schema, and runtime changes retain their existing risk gates.
