# Schema Workspace

This file is a responsibility and navigation entrypoint. It does not establish
global, release, deployment, runtime, or production authority.

## Responsibility

`schemas/` owns versioned, portable data-shape contracts that must be shared
independently of one runtime implementation. The current contract describes an
offline runtime-config identity observation artifact.

## Entry Points

- [runtime-config-identity-v1.schema.json](runtime-config-identity-v1.schema.json)
  defines Runtime Config Identity v1.
- The producer and contract tests are indexed by
  [RELEASE_MANIFEST.md](../RELEASE_MANIFEST.md) and
  [server/tests/runtime-config-identity.test.mjs](../server/tests/runtime-config-identity.test.mjs).

## Development

Change a schema together with its producer, consumer, fixtures, and contract
tests. Keep schemas portable: use logical names and bounded metadata instead of
local paths, raw configuration, environment values, credentials, or logs.

## Validation

Run `node --test server/tests/runtime-config-identity.test.mjs` for the current
schema, then `npm test` and `git diff --check origin/master...HEAD`.

## Boundary

A schema defines a data shape; it is not a production observation, artifact
promotion, deployment record, runtime-health claim, or permission to perform a
schema migration. Generated production identities and protected material do
not belong in this directory.
