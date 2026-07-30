# Operations Overview Read Envelope Design

Date: 2026-07-31  
Issue: #559  
Parent: #557  
Dependency: #558 Admin authorization v1  
Risk: B for source-only implementation  
Production impact: none

## Status

This design defines the first executable source slice for the Operations Read Model abstraction. It does not authorize production configuration, deployment, data migration, provider access, or any business or runtime mutation.

The design was prepared against `master@7a5ef1762173ed49870366186d221cb886bc5606`.

## Context

The repository already contains:

- the legacy `GET /api/admin/overview` response owned by the Subscription Domain;
- Admin session authentication and Principal construction;
- capability decisions and reusable `requireAdminCapability()` middleware;
- an opt-in `ADMIN_AUTHORIZATION_ENABLED` runtime flag;
- frontend Safe Read Projection and Operations Overview owner models;
- a documented future common Admin response envelope.

The legacy Overview returns subscription counts plus node and distribution fields. The first Operations Read Envelope must reuse proven source facts without leaking node data, changing the legacy API, or treating frontend fixtures as backend truth.

## Goals

The slice will:

1. add `GET /api/admin/operations/overview`;
2. expose the endpoint only when `ADMIN_AUTHORIZATION_ENABLED=true`;
3. require `operations.read`;
4. return a versioned Operations Read Envelope;
5. project only four allowlisted counts from the existing Subscription Owner response;
6. provide reusable Envelope construction for later User, Wallet, Commerce, Payment, and Runtime read models;
7. preserve all existing Admin authentication and legacy Overview behavior.

## Non-goals

The slice will not:

- modify `GET /api/admin/overview`;
- connect the Admin frontend to the new endpoint;
- add a database, materialized view, cache, queue, event store, or analytics system;
- return nodes, distribution, Wallet, Commerce, Payment, Provider, or Runtime data;
- introduce mutation capabilities or Admin Audit storage;
- activate the authorization flag in any production environment;
- deploy or promote any artifact;
- claim production availability or runtime health.

## Endpoint Availability And Authorization

### Flag disabled

When `ADMIN_AUTHORIZATION_ENABLED` is false or absent:

- `GET /api/admin/operations/overview` is not registered;
- requests receive the existing application 404 response;
- the legacy `GET /api/admin/overview` remains unchanged.

### Flag enabled

When `ADMIN_AUTHORIZATION_ENABLED=true`:

- the new endpoint is registered;
- `requireAdminCapability("operations.read")` runs before the handler;
- a missing Principal receives the existing 401 response:

```json
{
  "error": "admin_authentication_required"
}
```

- a Principal without `operations.read` receives the existing 403 response:

```json
{
  "error": "admin_capability_required",
  "capability": "operations.read"
}
```

Only an allowed decision reaches the read model and receives an Envelope. Unauthorized responses do not include `data`, warnings, source metadata, or privileged facts.

## Success Contract

The authorized response is:

```json
{
  "schemaVersion": "operations-overview-read-envelope/v1",
  "generatedAt": "2026-07-31T00:00:00.000Z",
  "freshness": "fresh",
  "sourceState": "implemented_source",
  "data": {
    "total": 12,
    "active": 8,
    "expiring": 2,
    "disabledOrExpired": 2
  },
  "warnings": [],
  "access": {
    "allowed": true,
    "capability": "operations.read",
    "reasonCode": "allowed"
  }
}
```

### Field semantics

- `schemaVersion` identifies this endpoint-specific v1 contract.
- `generatedAt` is an ISO-8601 server generation timestamp.
- `freshness: "fresh"` means the response was generated from a direct current query of the Subscription Owner Store. It does not claim that production deployment, nodes, Providers, collectors, or external systems are healthy or recently observed.
- `sourceState: "implemented_source"` identifies implemented source ownership. It is not production deployment evidence.
- `warnings` is an empty array in this slice. No warning is fabricated without an owned warning source.
- `access` contains only the safe allowed authorization decision.

## Allowlisted Data Model

The Operations Overview Projector accepts the legacy Overview result but constructs a new object containing exactly:

- `total`;
- `active`;
- `expiring`;
- `disabledOrExpired`.

Each field must be a non-negative integer.

The Projector must not use object spread or return the original object. Fields such as `nodes`, `distribution`, `ok`, credentials, tokens, secrets, URLs, raw rows, or future legacy additions cannot cross the projection boundary automatically.

Invalid or missing count fields fail closed rather than being coerced to zero. Zero is a valid measured count and must remain distinct from missing or invalid data.

## Components

### `server/services/platform/operations-read-envelope.mjs`

A pure reusable Envelope Builder.

Responsibilities:

- require an explicit schema version;
- require a valid ISO generation time;
- accept only supported freshness and source-state values;
- accept a safe data object, warnings array, and allowed access decision;
- construct a new response object;
- reject malformed inputs with a safe validation error;
- allow a deterministic time source in unit tests.

The Builder does not read databases, inspect runtime state, authorize requests, or know endpoint routing.

### `server/services/platform/operations-overview-read-model.mjs`

A pure endpoint-specific Projector.

Responsibilities:

- consume the existing legacy Overview result;
- validate the four required count fields;
- return a new allowlisted count object;
- reject malformed inputs;
- never include node or distribution fields.

The Projector owns no database and does not duplicate the Subscription Domain calculation.

### `server/routes/admin-subscriptions.mjs`

HTTP composition only.

Responsibilities:

- conditionally register the new endpoint when the authorization flag is enabled;
- apply `requireAdminCapability("operations.read")`;
- call `core.overview()`;
- pass its result through the allowlist Projector;
- build the Envelope with the allowed access decision;
- return the safe response;
- map unexpected failures to the existing safe internal error behavior.

The existing legacy route remains unchanged.

## Data Flow

```text
Admin Session Gateway
  -> requireAdminCapability("operations.read")
  -> GET /api/admin/operations/overview
  -> Subscription core.overview()
  -> projectOperationsOverviewReadModel()
  -> createOperationsReadEnvelope()
  -> 200 JSON
```

Authorization occurs before data acquisition and projection.

## Error Handling

- Disabled endpoint: existing 404.
- Missing Principal: existing safe 401.
- Missing capability: existing safe 403.
- Invalid Projector input: fail closed through a safe internal response.
- Invalid Envelope input: fail closed through a safe internal response.
- No raw exception message, object dump, path, SQL value, node detail, token, secret, credential, URL, or Store row is returned.

## Testing Strategy

Implementation will use red-green TDD.

### Envelope Builder tests

- produces the exact v1 Envelope with deterministic time;
- rejects invalid time, schema, freshness, source state, warnings, data, or access input;
- creates a new result rather than returning caller-owned mutable objects.

### Overview Projector tests

- returns exactly the four allowlisted counts;
- accepts zero;
- rejects negative, fractional, missing, string, null, array, and malformed values;
- drops `nodes`, `distribution`, and synthetic secret-bearing extra fields.

### Route tests

- flag disabled returns 404 for the new endpoint;
- legacy Overview response is unchanged;
- flag enabled without Principal returns 401;
- Principal without `operations.read` returns 403;
- allowed Principal receives the exact Envelope and four-field data object;
- extra legacy Overview fields do not appear in serialized output;
- internal validation failures return only the safe error response.

### Repository validation

The final source head must pass:

- governance evidence;
- diff check;
- document authority check;
- full Server Tests;
- Admin Tests;
- Admin Build;
- public-site build and boundary verification;
- Cloudflare public-site dry run.

## File Budget

Expected implementation scope is five files:

1. add `server/services/platform/operations-read-envelope.mjs`;
2. add `server/services/platform/operations-overview-read-model.mjs`;
3. modify `server/routes/admin-subscriptions.mjs`;
4. add one focused Envelope/Projector test file;
5. modify the Admin Subscription route tests.

The design document is committed separately and is not counted in the implementation file budget.

## Rollout Boundary

A merged source PR establishes only the backend contract in repository source. Production activation requires a separate exact decision to configure `ADMIN_AUTHORIZATION_ENABLED=true`, followed by deployment and runtime evidence. No source test or merge is production evidence.

## Follow-up Sequence

After this slice:

1. decide whether the Admin frontend should consume the new endpoint;
2. add separate domain-owned read models for Accounts, Wallet, Commerce, Payment, and Runtime;
3. add node and Provider summaries only after their own safe Owner Model is defined;
4. begin #560 Admin Audit before enabling any Operations mutation capability.
