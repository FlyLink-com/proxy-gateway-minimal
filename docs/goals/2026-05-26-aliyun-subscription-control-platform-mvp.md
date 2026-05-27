# Aliyun Subscription Control Platform MVP Goal Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans for
> implementation PRs that execute tasks from this goal. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Build a repo-only MVP path for Aliyun to become the user-management
and subscription-distribution control-plane candidate, while HP remains
`local-ci-a` / operator lab and edge forwarding capacity remains replaceable.

**Architecture:** Keep user, entitlement, subscription artifact, and delivery
state authoritative in the control plane. Keep edge nodes as replaceable
data-plane capacity. Prove repository contracts and validation first; defer
Aliyun deployment, DNS, user traffic, state-copy, and edge rebuild to separate
Risk A gates.

**Tech Stack:** Node.js ESM, Express routes, SQLite-backed repository contracts,
Admin/Vite React UI, project-state JSON, HP `ci-full` manual CI when clean-host
validation is required.

---

## Status

```text
Mode:
  goal-driven execution

Lead agent:
  Codex

Risk boundary:
  B/C repo-only until an explicit Risk A approval is given

Production authority:
  none

Aliyun authority:
  no deployment, DNS, public listener, state copy, user traffic, or production
  authority in this goal document

HP authority:
  manual CI / operator lab only
```

## Problem

The project has already separated several concerns:

```text
business / product promise
commercial entitlement
subscription access control
edge node capacity
local client path
validation / CI
operator lab
production operations
```

The next product goal is to stop treating the subscription platform as a
single-node proxy server. Aliyun should become the subscription control-plane
candidate: user records, plan/entitlement state, subscription artifact issuance,
and portal/admin distribution workflows. Clean edge nodes should carry traffic
later. HP should remain validation and operator-lab capacity.

## Non-Goals

This goal does not authorize:

```text
Aliyun deployment
Aliyun DNS changes
public Aliyun listener exposure
production traffic
production SQLite copy
tenant or artifact mutation in production
edge node creation, stop, termination, or security-group change
Nginx, systemd, HTTPS, UFW, WireGuard, or firewall mutation
payment collection
external CRM, Webhook, email automation, or customer data processing
```

## Target Product Slice

The MVP should prove this flow inside the repository before any production
promotion:

```text
public site lead
  -> platform lead record
  -> operator review
  -> customer account shell
  -> plan / entitlement shell
  -> subscription access artifact shell
  -> dynamic customer entry concept
  -> validation evidence
```

The MVP must preserve this separation:

```text
company site:
  public brand and cooperation surface
  no hard-link to customer dynamic entry

customer portal:
  login / register / subscription use journey
  repository-only until production auth and deployment are approved

admin / operator:
  internal review, account, entitlement, and subscription access operations
  not publicly exposed

edge data plane:
  replaceable forwarding capacity
  not the source of user/account/subscription authority
```

## Agent / Unit Routing

```text
Lead Agent:
  owns source-of-truth docs, integration, final verification, PR routing,
  and user-facing completion claims

Product Business Agent:
  owns user journey, portal language, cooperation workflow, and acceptance
  criteria

Commercial / Entitlement Agent:
  owns plan, validity, quota, renewal, and entitlement state semantics

Subscription Access Agent:
  owns subscription artifact model, visible-once link behavior, dynamic entry
  concept, and access-route safety

Code Agent:
  owns repository implementation, routes, UI, tests, and fail-closed behavior

Validation / CI Agent:
  owns local validation, HP ci-full evidence when needed, GitHub hosted-runner
  blocker notes, and PR validation summaries

Production Ops Agent:
  may only prepare Risk A runbooks and inventories until explicit approval is
  granted
```

## MVP Work Packages

### Package 1: Platform Domain Contract

**Risk:** C/B repo-only.

**Primary unit:** Subscription Access Control.

**Goal:** Define repository-level account, lead, entitlement, subscription
access, and dynamic-entry contracts without production mutation.

**Files likely touched:**

```text
docs/units/SUBSCRIPTION_ACCESS_UNIT.md
docs/units/COMMERCIAL_ENTITLEMENT_UNIT.md
docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md
server/**/*.mjs
server/tests/*.test.mjs
```

**Acceptance:**

```text
contracts documented
server tests define valid/invalid state transitions
no production secrets, URLs, or customer data
```

**Repository anchors after Package 1 implementation:**

```text
server/services/platform/control-plane-contract.mjs
server/tests/platform-control-plane-contract.test.mjs
server/routes/public-leads.mjs
server/tests/public-leads.test.mjs
```

The Package 1 contract is pure repository behavior. It defines normalized
platform lead, account, entitlement, and subscription-access grant shapes plus
operator-safe summaries. It does not add SQLite schema, production storage,
payment integration, Aliyun runtime mutation, DNS changes, state copy, or user
traffic.

### Package 2: Lead Intake To Platform Review Queue

**Risk:** B repo-only.

**Primary unit:** Product Business.

**Goal:** Move the current public lead intake from "accepted submission" toward
a repository-level platform lead queue that operators can review later.

**Files likely touched:**

```text
server/routes/public-leads.mjs
server/tests/public-leads.test.mjs
admin/src/features/company-site/company-site-page.tsx
admin/src/test/company-site.test.tsx
```

**Acceptance:**

```text
lead payload validated and redacted
operator-safe lead summary exists
no external Webhook / CRM / email automation configured
tests prove invalid data does not echo sensitive submitted fields
```

**Repository anchors after Package 2 implementation:**

```text
server/services/platform/lead-review-queue.mjs
server/routes/admin-platform.mjs
server/tests/platform-lead-review-queue.test.mjs
server/tests/platform-lead-routes.test.mjs
```

The Package 2 queue is a repository-only in-memory review queue. Public lead
intake can feed it, and protected Admin API routes can list safe summaries and
move leads through review statuses. It does not add SQLite persistence,
external CRM, Webhook, email automation, Aliyun deployment, DNS changes,
production storage, customer data copy, or user traffic.

### Package 3: Customer Account And Entitlement Shell

**Risk:** B repo-only.

**Primary unit:** Commercial / Entitlement.

**Goal:** Add the minimum account and entitlement model needed for the portal to
represent customer status without real payment collection.

**Files likely touched:**

```text
server/**/*.mjs
server/tests/*.test.mjs
admin/src/features/user-portal/user-portal-page.tsx
admin/src/test/user-portal.test.tsx
```

**Acceptance:**

```text
account shell and entitlement shell are explicit test fixtures
expired / disabled / pending states fail closed
no billing provider integration
```

**Repository anchors after Package 3 implementation:**

```text
server/services/platform/account-entitlement-shell.mjs
server/routes/admin-platform.mjs
server/tests/platform-account-entitlement-shell.test.mjs
server/tests/platform-account-routes.test.mjs
```

The Package 3 shell is repository-only in-memory behavior. Protected Admin API
routes can convert a reviewed lead into an operator-safe account summary and
create/list entitlement summaries for that account. Entitlement usability is
computed from active status plus validity windows. It does not add billing,
payment collection, SQLite persistence, CRM, external automation, Aliyun
deployment, DNS changes, production storage, customer data copy, or user
traffic.

### Package 4: Dynamic Customer Entry Concept

**Risk:** B repo-only; A later for production activation.

**Primary unit:** Subscription Access Control.

**Goal:** Represent operator-issued dynamic customer entry metadata without
hard-linking it from the public site.

**Files likely touched:**

```text
server/**/*.mjs
server/tests/*.test.mjs
admin/src/features/user-portal/user-portal-page.tsx
admin/src/test/user-portal.test.tsx
docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md
```

**Acceptance:**

```text
dynamic entry metadata is repository-only
public site does not expose the login-after-entry URL
subscription artifacts remain visible-once / redacted in summaries
```

**Repository anchors after Package 4 implementation:**

```text
server/services/platform/subscription-access-shell.mjs
server/routes/admin-platform.mjs
server/tests/platform-subscription-access-shell.test.mjs
server/tests/platform-access-routes.test.mjs
admin/src/test/company-site.test.tsx
```

The Package 4 shell is repository-only in-memory behavior. Protected Admin API
routes can issue and list subscription access grant summaries for an existing
account and usable entitlement. Responses expose only safe metadata such as
issued status, delivery type, visible-once posture, and dynamic-entry/artifact
presence booleans. They do not expose raw portal URLs, artifact references,
subscription URLs, public customer portal resolution, SQLite persistence,
Aliyun deployment, DNS changes, production storage, customer data copy, or user
traffic.

### Package 5: Aliyun Promotion Runbook

**Risk:** C runbook first; A for any execution.

**Primary unit:** Production Operations.

**Goal:** Prepare the later A-tier path for Aliyun promotion after repository
MVP evidence exists.

**Files likely touched:**

```text
docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md
docs/production-replacement-records/*.md
docs/PROJECT_CONTEXT.md
```

**Acceptance:**

```text
read-only inventory commands separated from mutation commands
state-copy prerequisites stated
rollback path stated
explicit approval phrase required
no deployment performed by the docs PR
```

**Repository anchors after Package 5 implementation:**

```text
docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md
docs/production-replacement-records/2026-05-27-aliyun-promotion-runbook-readiness.md
docs/PROJECT_CONTEXT.md
project-state/current.json
```

The Package 5 runbook is repository-only. It defines the later promotion ladder
as repo-only design, live read-only inventory, source access / source-state
decision, private state-copy validation, public-boundary dry run, DNS
promotion, observation, rollback, and cleanup. It does not execute Aliyun
deployment, DNS mutation, public listener exposure, state copy, edge traffic, or
production authority transfer.

### Package 6: Clean-Start Control Plane Package

**Risk:** B for repo-only code/tests; C for planning/docs; A for any Aliyun
runtime validation, firewall hardening, public-boundary dry run, DNS promotion,
or production authority transfer.

**Primary unit:** Subscription Control Platform.

**Goal:** Build the repository support for Aliyun clean-start authority without
depending on historical AWS SQLite, artifact, legacy query-token, or
subscription-output state.

**Files likely touched:**

```text
server/services/platform/*.mjs
server/routes/admin-platform.mjs
test/**/*.mjs
docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md
docs/production-replacement-records/*.md
docs/PROJECT_CONTEXT.md
project-state/current.json
```

**Acceptance:**

```text
clean-start initialization shapes are explicit
operator-safe summaries do not expose raw portal URLs, artifact references,
tokens, subscription URLs, credentials, SQLite rows, or customer data
private rendering dry-run support is fail-closed and redacted
tests cover clean-start account, entitlement, grant, and rendering boundaries
no Aliyun deployment or runtime mutation is performed by the repo PR
```

**Repository anchors after planning:**

```text
docs/production-replacement-records/2026-05-27-aliyun-clean-start-control-plane-plan.md
docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md
docs/PROJECT_CONTEXT.md
project-state/current.json
```

Package 6 should produce repository evidence first. Candidate-only
clean-start initialization and private rendering on Aliyun require a later
A-tier approval and execution record.

## Validation Policy

```text
C docs-only:
  git diff --check origin/master...HEAD
  npm run project-state:check when project-state changes

B server/shared:
  targeted server tests
  npm test
  git diff --check origin/master...HEAD

B Admin UI:
  targeted UI tests
  npm run admin:test
  npm run admin:build
  npm test
  git diff --check origin/master...HEAD

Clean-host merge evidence:
  use HP ci-full when GitHub-hosted Actions cannot start or when clean-host
  evidence is required

A future Aliyun or edge execution:
  separate runbook
  read-only inventory
  explicit operator approval
  validation
  rollback evidence
```

## PR Rules

Every PR under this goal must include:

```text
Agent / Task Routing
Risk
Execution
Validation
Remaining Gates
Production / Aliyun / DNS / traffic impact
```

Draft PRs are acceptable while design, execution, or validation is incomplete.
Ready PRs must contain the complete loop for their approved scope.

## First Recommended PR Sequence

```text
1. Complete: land this goal document and project-state orientation.
2. Complete: implement repository platform lead queue behind the existing
   public lead intake boundary.
3. Complete: add account / entitlement shell tests and fail-closed server
   contracts.
4. Complete: add subscription-access grant shell and operator-safe summaries.
5. Complete: prepare Aliyun promotion runbook and Gate A/B planning without
   executing production mutation.
6. Next: build the clean-start control-plane repo implementation package.
7. Later A-tier: request Aliyun clean-start private validation and provider
   firewall hardening as separate gates.
```

## Stop Conditions

Stop and request explicit approval before:

```text
copying production data
touching Aliyun systemd / Nginx / UFW / DNS / HTTPS / runtime config
opening a public port
changing subscription DNS
moving user traffic
creating or terminating edge nodes
writing secrets, tokens, subscription URLs, or customer data to docs, PRs, logs,
or project-state
```
