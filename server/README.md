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

## Subscription website metadata

Successful Clash YAML responses from `routes/subscription.mjs` include
`Profile-Web-Page-Url: https://www.gccwebos.com/` for compatible clients' website
entry. This fixed public URL is independent of the request host, subscription
source and lifecycle metadata. It does not change YAML, credentials, usage or
expiry; rejected subscription requests do not receive the header. The client
controls where the entry appears and must refresh the remote subscription to
receive updated metadata. This source contract does not establish deployment
or acceptance in every Clash client/version.

## Release identity

`CONTROL_PLANE_RELEASE_IDENTITY_PATH` is optional at the application boundary.
If absent, bearer-protected `/api/status` reports `releaseIdentity.state` as
`unavailable`; this does not verify the running release. If configured, the
service reads one canonical identity file once during startup and fails closed
if the path or file is invalid or linked, if it changes while being read, or,
on POSIX, if it is group- or other-writable. The identity is never added to the
public `/api/health` response.

## Xray CLI statistics format

The strict `xray api statsquery` reader has a CLI-protobuf-specific adapter:
an existing named statistics row that omits `value` means the protobuf scalar
default zero. The generic `parseStrictXrayUserCounters` contract is unchanged.
Missing rows, directions, identities or root `stat` are not invented; null,
invalid values, duplicate JSON keys/directions and unsafe sums still fail.
Empty statistics mean no observations, not zero usage for every configured user.

Both the recovery local-source reader and the `collectionScope` collector in
`state.mjs` consume this strict CLI boundary. Updating a recovery overlay does
not prove the sustained production collector uses the corrected source. The
Hy2/TUIC HTTP readers and legacy direct strict-parser recovery command are not
changed. Source tests are not production Xray-version or restoration evidence;
see [the dated source validation record](../docs/production-incident-records/2026-09-29-xray-cli-zero-compatibility-source.md).

## Boundary

The standalone full-metering collector retains its default five-source scope.
An explicitly approved `local-three-v1` activation can collect the original
three local channel references while reporting deferred SGP coverage as
paused/unknown. It requires a new journal and preserves existing identity and
history checks; it neither starts services nor changes billing rights. See
[the full metering runbook](../docs/FULL_METERING_RECOVERY_RUNBOOK.md#explicit-local-three-source-scope-source-only-2026-10-07)
for config, pending-recovery, validation and production boundaries.

This workspace does not own frontend builds, provider configuration, host
provisioning, or production deployment. The presence of runtime adapters or
mutation-capable services in source does not authorize their use; production,
auth-model, schema, and runtime changes retain their existing risk gates.
