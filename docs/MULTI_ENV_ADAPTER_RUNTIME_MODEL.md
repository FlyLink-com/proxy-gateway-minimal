# Multi-Environment Adapter Runtime Model

Last updated: 2026-06-01, Asia/Shanghai.

> Status:
> - Type: Active architecture boundary
> - Risk: C
> - Execution authority: Does not authorize code behavior changes, public route
>   exposure, production deploy, Nginx reload, systemd restart, DNS change,
>   firewall change, SQLite migration, tenant/artifact mutation, payment
>   activation, or secret copy
> - Source of truth for: How one codebase runs across multiple environments
>   through thin adapters over shared domain services

## Core Rule

The project is one modular monolith, not many separate products.

```text
one repository
  -> shared domain services
  -> thin adapters
  -> environment-specific runtime wiring
```

Do not solve environment differences by forking business logic. Solve them with
configuration, adapters, service boundaries, and gated runtime wiring.

## Runtime Layers

```text
public boundary
  Nginx, public health, public site, public subscription paths

HTTP adapters
  public lead intake, user portal, protected operator/admin preview routes

CLI adapters
  operator issuance, revoke planning, resource packages, portal-entry handoff

domain services
  account, entitlement, issuance, portal auth, artifacts, audit, routing

persistence adapters
  runtime SQLite, subscription-control SQLite, local/test stores

data-plane adapters
  SS, TUIC, future edge/channel candidates, local client adapter

environment wiring
  .env keys, systemd units, Nginx templates, release/current symlink, paths
```

Only the domain services should own business decisions. HTTP, CLI, Admin UI,
User Portal UI, and future bots should adapt inputs and display outputs; they
must not re-implement entitlement, issuance, expiry, refresh, quota, or audit
rules.

## Environment Roles

| Environment | Role | Uses same code? | Allowed default actions | Requires separate A gate |
| --- | --- | --- | --- | --- |
| Local checkout | Development and tests | Yes | edit, test, local UI, safe CLI previews | real issuance, production DB, public exposure |
| HP/local Linux | Private validation lab | Yes | isolated test deploy after approval, test SQLite, loopback smoke | persistent service, public listener, production state |
| Aliyun | Production subscription boundary | Yes | read-only observation by default | deploy, Nginx reload, systemd restart, DNS, firewall, state mutation |
| Future edge/channel lab | Data-plane candidate validation | Partial/runtime adapter | measured protocol canaries after approval | public rollout, subscription-output mutation, node promotion |
| Archive | Historical evidence | No active runtime | indexed reading only | treating archive as source of current truth |

## Adapter Ownership

### CLI Adapter

CLI is operator tooling.

It may prepare or execute controlled operator workflows only when the relevant
gate allows it. It is not a customer surface and should never be called by the
User Portal as a normal user workflow.

Owns:

- operator input validation;
- dry-run summaries;
- visible-once handoff file writing;
- explicit production mutation flags;
- local/operator audit references.

Does not own:

- user identity UX;
- customer-facing state labels;
- payment provider decisions;
- public route exposure.

### User Portal Adapter

User Portal is customer-facing.

It renders user-scoped state returned by backend services. It must not calculate
entitlement expiry, package duration, authorization state, or refresh authority
from local browser assumptions.

Owns:

- login/session UI;
- contact/profile forms;
- package application UI;
- current subscription display;
- refresh request UI;
- support handoff.

Does not own:

- operator approval;
- CLI invocation;
- raw subscription secret generation;
- payment capture;
- production issuance mutation without backend authorization.

### Operator/Admin Adapter

Operator/Admin surfaces are private review and control tools.

Owns:

- safe preview of provisioning requests;
- review queues;
- gate evidence summaries;
- request state transitions;
- operational visibility.

Does not own:

- public Admin exposure;
- direct unmanaged runtime mutation;
- customer-facing portal copy.

### Public Site Adapter

The public site is a brand/intake surface.

Owns:

- static company/cooperation page;
- public lead form;
- public-safe status and intake messages.

Does not own:

- user login;
- subscription management;
- raw artifact display;
- Admin review.

## Domain Service Direction

The target code shape should converge toward:

```text
server/services/platform/
  account-entitlement
  subscription-issuance
  portal-auth
  portal-state
  provisioning-form
  audit
  payment-provider-adapter-template

server/routes/
  public adapters
  user portal adapters
  protected operator/admin adapters

scripts/
  CLI adapters over the same services
```

The practical rule:

```text
if two adapters need the same business rule,
move the rule into a service and test the service directly.
```

## Release Shape

The live server does not need to be a Git checkout.

Accepted release shape:

```text
Git commit
  -> packaged release directory
  -> /opt/proxy-gateway-minimal-candidate/releases/<label>
  -> current symlink
  -> systemd WorkingDirectory=current
  -> Nginx routes to loopback service
```

The approved 2026-06-01 Aliyun read-only inventory confirmed this release shape
for the current production boundary. Server import work should use safe hashes
and redacted manifests, not raw runtime file copies.

## What This Prevents

This model prevents these recurring mistakes:

- treating CLI as the user workflow;
- treating User Portal as an Admin console;
- putting backend business decisions in React state;
- copying server runtime files into Git;
- treating local checkout, HP lab, and Aliyun production as interchangeable;
- using one UI page to represent unrelated roles;
- introducing Redis, queues, or microservices before the monolith boundary is
  exhausted.

## Next Refactor Sequence

Use this order:

1. Compare live release shape with local source using redacted hashes only.
2. Keep service/Nginx/systemd templates versioned in Git.
3. Move duplicated business decisions from adapters into domain services.
4. Add service-level tests first, then adapter tests.
5. Wire User Portal and operator surfaces to shared services without shelling
   out to CLI.
6. Keep every production deploy, route exposure, Nginx/systemd change, database
   migration, and real issuance behind separate A-tier approval.

## Non-Goals

This document does not authorize:

- deploying the current branch;
- copying production `.env`, SQLite, logs, handoff files, tokens, subscription
  URLs, or customer data;
- exposing public Admin;
- enabling payment;
- changing DNS, Nginx, firewall, systemd, or runtime config;
- creating or revoking production tenants/artifacts.
