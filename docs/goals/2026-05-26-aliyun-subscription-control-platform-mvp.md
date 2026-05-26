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
1. C: land this goal document and project-state orientation.
2. B: implement repository platform lead queue behind the existing public lead
   intake boundary.
3. B: add account / entitlement shell tests and fail-closed server contracts.
4. B: update portal UI to consume repository-safe account / entitlement /
   subscription-access summaries.
5. C/A-gated: prepare Aliyun promotion runbook update from the proven repo
   contracts, without executing production mutation.
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
