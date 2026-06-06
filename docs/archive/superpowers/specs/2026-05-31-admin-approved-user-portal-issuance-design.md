# Admin-Approved User Portal Issuance Design

Date: 2026-05-31, Asia/Shanghai.

## Context

The current user portal is a customer-facing adapter, not an entitlement
authority. It can present a safe local portal surface and submit request-like
state, but production account creation, entitlement creation, subscription
issuance, artifact delivery, revocation, renewal, and override decisions must
remain administrator-controlled.

This design adds a 7-day trial product option and defines the end-to-end
request-to-admin-approval flow for trial, monthly, and yearly access. It does
not authorize production deployment, public portal routing, DNS, Nginx,
payment activation, automatic entitlement issuance, schema migration, or
customer traffic changes.

## Role Model

| Role | Owns | Must not own |
| --- | --- | --- |
| Public visitor | Company-site lead/contact submission. | Portal entry, entitlement, subscription URL, payment authority. |
| Portal user | Requesting access, viewing request status, updating contact facts, using approved resources. | Approving requests, creating entitlements, issuing artifacts, changing nodes, revoking access. |
| Administrator | Reviewing all business requests, approving or rejecting access, creating entitlement and issuance facts, delivering visible-once material, revoking and auditing. | Public unauthenticated access to Admin APIs. |
| Operator CLI / ops adapter | Controlled execution, emergency override, handoff files, audit evidence. | User-facing workflow or public self-service endpoint. |

Hard rule: every business-changing flow terminates in administrator approval.
"Self-service" means the user can submit and track a request; it does not mean
automatic account, entitlement, or subscription issuance.

## Product Options

The portal exposes exactly three access options:

| Plan | Duration | User action | Administrator action |
| --- | --- | --- | --- |
| 7-day trial | 7 days | Submit trial request. | Approve or reject; if approved, issue the trial entitlement and access material. |
| Monthly | 30 days | Submit monthly request. | Approve or reject; if approved, issue monthly entitlement and access material. |
| Yearly | 365 days | Submit yearly request. | Approve or reject; if approved, issue yearly entitlement and access material. |

Trial policy:

- default user-facing policy is one active or completed trial request per
  account;
- repeat trials are blocked in the portal by default;
- administrators may override in the Admin panel if there is a documented
  reason;
- a trial request never returns a subscription URL until the administrator
  approves and completes issuance.

## State Model

Portal requests should use explicit request states:

```text
draft
  -> pending_admin_review
  -> approved_pending_delivery
  -> delivered
  -> rejected
  -> cancelled
  -> expired
  -> revoked
```

State meanings:

- `draft`: local form state only.
- `pending_admin_review`: submitted by the portal user and visible in the
  administrator queue.
- `approved_pending_delivery`: administrator approved the business request but
  has not completed entitlement and access delivery.
- `delivered`: entitlement and subscription access material were issued.
- `rejected`: administrator rejected the request with a safe reason code.
- `cancelled`: user or administrator cancelled before delivery.
- `expired`: granted entitlement expired.
- `revoked`: administrator revoked active access.

Only administrator-controlled services may move a request into
`approved_pending_delivery`, `delivered`, `rejected`, or `revoked`.

## User Portal Experience

The portal should stay simple and action-focused:

1. The user authenticates through the existing portal boundary when available.
2. The user chooses 7-day trial, monthly, or yearly.
3. The user provides required contact facts and optional request notes.
4. The portal submits an access request and shows `pending_admin_review`.
5. The status page explains that administrator review is required.
6. After approval and delivery, the portal shows only the safe approved access
   state and the user-allowed subscription copy action.
7. Rejected or revoked requests show safe reason text and support guidance.

The portal must not show Admin controls, approval controls, raw database refs,
raw customer data from other users, raw handoff files, private node details,
operator approval phrases, or production secrets.

## Administrator Experience

The Admin panel should add an administrator-controlled request queue. The first
implementation can live near the existing Provisioning surface, but the queue
must be conceptually separate from the customer portal.

Queue rows should show safe metadata:

- request ref;
- account/user safe ref;
- plan: trial, monthly, or yearly;
- requested duration;
- request status;
- submitted time;
- contact completeness indicator;
- prior trial indicator;
- administrator next action.

Administrator actions:

- review request details;
- reject with a safe reason code;
- approve and generate a safe issuance/provisioning preview;
- create or select an account;
- create the matching entitlement duration;
- issue dynamic portal entry or subscription access material through existing
  operator-controlled mechanisms;
- mark delivery complete;
- revoke or expire access through existing revoke/audit paths.

The Admin panel may prepare safe previews and request records. Any operation
that mutates production control/runtime data remains Risk A when executed
against production.

## Service Boundaries

The implementation should prefer small services over UI-owned business logic:

- `portal request service`: normalizes user-submitted plan requests and
  creates safe request summaries.
- `admin review service`: lists requests, validates administrator actions,
  changes request states, and prepares provisioning inputs.
- existing account/entitlement services: create account and entitlement facts
  after administrator approval.
- existing issuance services: issue runtime tenant/artifact only from
  administrator-approved inputs.
- existing portal auth/session services: authenticate a user and scope what
  they can view.

The user portal client should call user-scoped request/status endpoints only.
It must not call protected Admin APIs directly and must not shell out to CLI
commands.

## Data Posture

Repository implementation should avoid production schema changes in the first
pass unless an explicit A-tier migration gate is approved. The first pass can
use repository/local services and existing safe summaries to validate the
contract.

If persistence is added later, stored request records should avoid raw
subscription URLs, tokens, credentials, private keys, handoff material, raw
YAML, or cross-user data. Customer contact facts must be minimized and returned
only to administrator surfaces that already require protected access.

Suggested request shape:

```text
portal_access_request
  requestRef
  accountRef or portalUserRef
  plan
  durationDays
  status
  contactSummary
  priorTrialState
  submittedAt
  reviewedAt
  reviewedByRef
  safeReasonCode
  entitlementRef
  accessGrantRef
```

## API Shape

User-scoped endpoints:

```text
POST /api/portal/access-requests
GET  /api/portal/access-requests/current
GET  /api/portal/access-requests/:requestRef
```

Protected administrator endpoints:

```text
GET  /api/admin/platform/portal-access-requests
POST /api/admin/platform/portal-access-requests/:requestRef/reject
POST /api/admin/platform/portal-access-requests/:requestRef/approve-preview
POST /api/admin/platform/portal-access-requests/:requestRef/mark-delivered
```

These route names define product boundaries only. Production exposure,
authentication cookies, CSRF policy, persistence, and deployment require
separate implementation review.

## Error Handling

Fail closed:

- invalid plan -> validation error;
- repeat trial without administrator override -> blocked before submission or
  marked review-required, depending on current account evidence;
- missing contact facts -> validation error;
- unauthenticated portal session -> unauthorized;
- cross-account request access -> not found or forbidden without revealing
  whether the target exists;
- administrator approval without entitlement facts -> blocked;
- issuance failure after runtime mutation -> use existing compensation and
  audit behavior.

User-visible errors should be short and actionable. Administrator errors may
include safe blocker codes but must not echo secrets or raw payloads.

## Testing Strategy

Repository implementation should use TDD.

Server tests:

- portal request service accepts trial/monthly/yearly and records
  `pending_admin_review`;
- trial request duration is exactly 7 days;
- duplicate trial is blocked or forced into administrator-review override
  posture;
- user endpoints cannot approve, deliver, revoke, or issue;
- Admin routes can reject and preview approval safely;
- Admin approval preview does not expose subscription URLs or raw handoff
  material;
- issuance remains administrator-controlled.

Admin/UI tests:

- portal shows trial, monthly, and yearly options;
- selecting trial submits a review request, not an active subscription;
- portal pending state points to administrator review;
- Admin request queue renders trial requests and review actions;
- approve preview shows safe output only;
- no Admin controls appear in the portal.

Validation commands for implementation:

```powershell
npm run admin:test -- user-portal
npm run admin:test
npm run admin:build
npm test
npm run project-state:check
git diff --check
```

## Non-Goals

- Public automatic signup-to-subscription.
- Payment-triggered automatic entitlement.
- Public Admin exposure.
- Public portal route activation on Aliyun.
- DNS, Nginx, firewall, systemd, or production runtime mutation.
- Production SQLite migration or schema change without a separate A-tier gate.
- Direct user access to operator CLI commands.
- Returning raw subscription URLs before administrator delivery.
- Retiring legacy query-token access.

## Implementation Slice Recommendation

Recommended first implementation slice:

1. Add the 7-day trial option to the portal UI and local client contract.
2. Introduce a repository-only portal access request service with in-memory
   test storage.
3. Add default-off local user-scoped request/status routes.
4. Add a protected Admin review queue surface and safe approval preview.
5. Keep real production issuance as a later, explicit A-tier execution gate.

This slice validates the product workflow and role boundary without production
mutation.
