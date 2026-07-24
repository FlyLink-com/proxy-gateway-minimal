# Subscription Control Database

Last updated: 2026-06-11, Asia/Shanghai.

This document defines the repository-local business-control database layer for
subscription operations. It is separate from the existing technical
subscription runtime store that holds tenant and opaque artifact state.

## Purpose

The control database is the required business ledger for:

- accounts and safe customer references;
- commercial entitlements and validity windows;
- operator-approved issuance requests;
- links from issuance requests to safe tenant/artifact references;
- quota counters and device bindings;
- revocation events;
- audit events.

The goal is to make subscription operations answerable by database state:

```text
who is entitled
what was approved
what was issued
which safe tenant/artifact refs belong to the request
what quota/device state is known
what was revoked
which audit events support the lifecycle
```

## Current Implementation

Repository service:

```text
server/services/platform/subscription-control-db.mjs
```

Test coverage:

```text
server/tests/platform-subscription-control-db.test.mjs
```

The implementation exposes `createSqliteSubscriptionControlStore({ dbPath })`
and initializes these SQLite tables:

| Table | Role |
| --- | --- |
| `platform_accounts` | Safe account/business identity record keyed by `owner_ref`. |
| `platform_entitlements` | Plan, validity, artifact/device limits, and traffic limit. |
| `platform_issuance_requests` | Operator-approved issuance request and approval reference. |
| `platform_issued_subscription_links` | Safe tenant/artifact refs created for an issuance request. |
| `platform_quota_counters` | Periodic account/entitlement usage counters. |
| `platform_device_bindings` | Device refs bound to safe artifact refs. |
| `platform_revocation_events` | Revocation facts for issued links. |
| `platform_audit_events` | Summary-only audit events for lifecycle evidence. |
| `platform_edge_apply_receipts` | Redacted data-plane apply receipts keyed by channel and desired-state ref. |
| `platform_edge_desired_state_notifications` | Safe pending/acknowledged/applied/failed coordination facts for remote data-plane desired-state delivery. |
| `platform_edge_agent_leases` | Loopback/internal agent lease facts for desired-state pulls. |

The startup DDL owned by `createSqliteSubscriptionControlStore({ dbPath })`
owns only the subscription-control objects documented above. It does not
create, alter, migrate, or verify Coins wallet objects.

Coins wallet schema ownership is separate: it uses a checksum-bound migration
module and the separately gated `platform_schema_migrations` ledger described
in `docs/COINS_WALLET_SCHEMA_GATE.md`. The presence of that source and CLI does
not prove that a production migration occurred and does not authorize startup
DDL to absorb Coins ownership.

Remote data-plane notification rows intentionally store only safe refs:

```text
nodeRef
channelRef
desiredStateRef
generation
reason
status
createdAt / updatedAt
```

They are not runtime config and they are not proof that a channel is active. The
subscription renderer still requires a matching applied receipt before exposing
remote data-plane channels to users.

Per-order runtime material is deliberately outside those notification rows.
The control DB stores desired-state refs and material fingerprints; the
protected edge credential material store supplies the actual runtime material.
Data-plane agents may pull that material only through the private authenticated
agent route, scoped to their own node, the current desired-state ref, requested
edge credential refs, and exact digest matches. Receipts written back to this DB
remain redacted and never carry raw runtime material.

## Safety Boundary

The control database intentionally stores safe references only. It rejects input
objects containing raw-field names such as email, URL, token, secret,
credential, password, raw payloads, or YAML.

Allowed examples:

```text
ownerRef: cust_...
tenantRef: tenantref_...
artifactRef: artifactref_...
deviceRef: device_...
actorRef: operator_...
```

Disallowed examples:

```text
customerEmail
subscriptionUrl
artifactSecret
token
rawYaml
credential
```

The summary API is also safe by default: it returns lifecycle state, references,
counts, and metadata, but not raw customer data, visible-once handoff material,
subscription URLs, or artifact secrets.

## Relationship To Existing Stores

The existing subscription runtime store remains responsible for serving and
refreshing concrete tenant/artifact state:

```text
server/services/subscriptions/repository.mjs
```

The control database is the business authority around that runtime store. The
two layers should remain distinct:

```text
business/account/entitlement/audit ledger
  -> safe issuance request
  -> real issuance CLI with separate A-tier approval
  -> runtime tenant/artifact rows
  -> safe tenantRef/artifactRef link back into the control database
```

## Current Non-Goals

This repository change does not:

- migrate the Aliyun production SQLite database;
- mutate production tenants or artifacts;
- write production control rows;
- expose a public Admin or user self-service execution API;
- activate payment, quota enforcement, or device enforcement;
- store raw subscription URLs or customer identifiers;
- retire the legacy query-token route.

Production adoption remains a separate A-tier migration/integration gate.

## CLI Integration

`scripts/platform-issue-subscription.mjs` now requires
`--control-db-path` for real execution. The input file must include a
`control` object with safe business references:

```json
{
  "control": {
    "accountId": "acct_operator_safe_example",
    "ownerRef": "cust_operator_safe_hashref",
    "entitlementId": "ent_operator_safe_example",
    "requestId": "iss_operator_safe_example_001",
    "requestedByRef": "operator_local_hashref",
    "purpose": "preproduction-canary"
  }
}
```

On successful real issuance, the CLI writes:

- account and entitlement records if they do not already exist;
- one planned issuance request;
- one safe tenant/artifact link after runtime artifact creation;
- one quota counter increment for `artifact_issuance`;
- one summary-only audit event;
- a safe stdout summary with `controlDbMutated: true`.

The CLI still writes raw visible-once handoff material only to the explicit
`--handoff-file` path.
