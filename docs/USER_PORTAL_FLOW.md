# User Portal Flow

Last updated: 2026-06-01.

This document is the review baseline for the customer-facing portal flow. It
exists to keep product outline, page copy, component behavior, tests, and future
backend/API work aligned before additional UI changes are made.

It does not authorize production deployment, public portal routing, payment
activation, database migration, subscription issuance, DNS, Nginx, Aliyun, AWS,
or edge-traffic changes.

## Boundary

The user portal is a customer-facing package subscription surface. It is a thin
client: the frontend sends user intent and renders server-provided facts. It is
not the operator CLI, not the protected Admin console, and not a production
issuance authority by itself.

Current implementation is local/frontend-safe:

- No public Admin exposure.
- No payment provider activation.
- No production database mutation.
- No real subscription issuance.
- No raw subscription URL unless an injected preview client explicitly provides
  demo visible-once material.
- No CLI shell-out for normal customer flows.
- No client-side lifecycle judgment from browser clock or local expiry math.
- No client-provided package duration; package duration belongs to the backend
  or injected portal client contract.

The user portal may reuse domain concepts and client contracts, but it must not
depend on operator CLI commands as its normal execution path.

## Page Outline

The customer portal has four top-level views:

| View | Purpose | Allowed user actions | Not allowed |
| --- | --- | --- | --- |
| Subscription Management | Apply for a monthly/yearly package and refresh the current active subscription. | Choose package before activation, choose client preference, submit application, refresh active subscription, copy visible-once link when available. | Payment capture, Admin action, direct production issuance, node/operator controls. |
| Use Guide | Explain client import and refresh behavior. | Read client instructions and navigate back to Subscription Management. | Admin diagnostics, traffic dashboards, node internals. |
| Support | Provide customer support handoff. | Read support options and prepare account/subscription issue context. | Bot automation execution, payment provider operation, Admin mutation. |
| Profile | Show account facts and history records. | View account facts, view current package result, view history summary. | Package application, subscription refresh, or personal contact collection as primary actions. |

## Data Ownership

The portal frontend must not become the source of truth for subscription state.
It renders facts returned by the user-scoped backend or injected preview client.

| Data | Source of truth | Frontend responsibility | Forbidden frontend behavior |
| --- | --- | --- | --- |
| User identity and session | Portal auth/session service | Hold the current session reference and send it with portal calls. | Invent user refs, reuse operator identity, or call Admin APIs. |
| Package id | Backend package catalog and current subscription record | Send the selected package id before activation. | Send `durationDays`, expiry time, price, quota, or entitlement authority. |
| Lifecycle state | Backend policy result | Render the returned state and matching copy. | Derive `expired`, `active`, or `pending` from browser time or local flags. |
| Expiry result | Backend subscription/control data | Display the returned expiry or pending/empty label. | Calculate expiry locally or show a fixed date before approval. |
| Subscription material | Backend visible-once response or injected demo client | Display and copy only when material is present. | Persist raw URLs in docs, logs, tests, local storage, or chat output. |
| History summary | Backend read model | Display immutable application/authorization/refresh events. | Treat in-memory UI events as durable history. |
| Page copy and navigation | Frontend | Render the agreed customer-facing views. | Mix operator diagnostics, node controls, or Admin workbenches into portal pages. |

## Protected Admin Review Surface

The protected Admin portal-request page is the operator-side review companion to
the user portal. It may show safe request summary metrics, local status filters,
selected-request detail, and approval preview output. It must not become the
production issuance authority by itself. The operator-facing UI should translate
backend request states into business labels and summarize approval preview facts
without making raw enums or raw JSON the primary operating surface.

Allowed:

- List portal access request summaries keyed by safe portal user references.
- Filter by safe request status.
- Show selected-request metadata such as plan, status, prior trial state,
  reviewed-by ref, reason code, entitlement ref, and access grant ref.
- Generate safe approval previews through the protected Admin API.
- Keep backend status enums, raw response payloads, and implementation details
  behind business-readable labels and summaries.

Not allowed:

- Display customer contact profiles, raw subscription URLs, tokens, artifact
  material, node credentials, or raw handoff material.
- Create entitlements, issue artifacts, mutate runtime subscriptions, expose
  public Admin, activate payment, or perform DNS/Nginx/systemd/firewall changes.

## Lifecycle State Machine

Portal copy and buttons must follow one lifecycle model. The lifecycle is
server-authoritative; the frontend must not infer `expired` from `Date.now()` or
the browser clock.

```text
none
  -> pending
  -> active
  -> expired
```

| State | User-facing label | Primary button | Expiry display | Notes |
| --- | --- | --- | --- | --- |
| `none` | Not opened / 未开通 | Apply / 申请开通 | None / 无 | User chooses trial/monthly/yearly package and client target only. |
| `pending` | Waiting for authorization / 等待授权 | Waiting / 等待授权中 | Pending authorization / 待授权 | No fixed expiry should be shown before operator approval. User should be guided to Support. |
| `active` | Service active / 服务生效中 | Refresh current subscription / 刷新当前订阅 | Concrete expiry date | Refresh replaces the current link and invalidates the previous link without changing the package period. |
| `expired` | Expired / 已过期 | Re-apply / 重新申请开通 | Expired date | User returns to package application flow. |

Old-link invalidation is an event, not a lifecycle state. It should appear as an
inline event note after refresh, not as a permanent navigation/status item.

## State Transitions

All state transitions are owned by the backend/control plane. The frontend only
requests user actions and refreshes its view from returned state.

| Event | From | To | Owner | Frontend reaction |
| --- | --- | --- | --- | --- |
| Login/session restore | Any persisted state | Returned current state | Backend | Call `fetchCurrentState` and render the returned lifecycle, package, expiry, and history. |
| Package application submitted | `none` or `expired` | `pending` | Backend | Lock selected package, hide apply as a repeat action, show support handoff. |
| Duplicate package application | `pending` | `pending` | Backend | Show existing pending state instead of creating another request. |
| Operator approval | `pending` | `active` | Operator/backend | Start the package period server-side and return concrete expiry on next state read. |
| Subscription refresh | `active` | `active` plus old-link-invalidated event | Backend | Show newly returned visible-once material and inline old-link invalidation note. |
| Package expiry | `active` | `expired` | Backend | Show expired package and allow re-application. |
| Unsupported portal action | Any | No state change | Backend | Render the returned error without guessing fallback state. |

## Package Model

The portal uses package subscription logic, not recharge/balance/debit logic.

Current package set:

- Monthly package: 30 days.
- Yearly package: 365 days.

Rules:

- Before activation, the user may choose monthly or yearly.
- The frontend sends only the chosen package id (`monthly` or `yearly`), not
  `durationDays`.
- During `pending`, package selection is locked and duplicate application is
  blocked.
- During `active`, package selection is locked; the main action becomes refresh.
- Changing package is deferred until expiration or a future explicitly approved
  business rule.

## No Personal Contact Collection

The portal no longer collects phone numbers, Telegram accounts, or separate
authorization contact profiles. Package requests are keyed by the safe portal
session/user reference plus the selected package and client target.

Support can still ask the operator or user for context out of band when needed,
but the portal request flow must not add profile/contact fields just to submit a
subscription request.

## API Contract Matrix

The frontend contract is intentionally small. These names describe the portal
client boundary; they do not require public production routes in the current
local preview implementation.

| Method | Intent | Required input | Returns | Mutation | Not allowed |
| --- | --- | --- | --- | --- | --- |
| `authenticate` | Establish a portal session from the approved entry/login mechanism. | Login or entry material defined by the auth boundary. | Session reference and safe account identity. | Session only. | Subscription issuance, Admin token use, raw subscription URL return. |
| `fetchCurrentState` | Hydrate the portal after login or page refresh. | Session/user reference. | Lifecycle, package, expiry, history summary, visible-once material if still available by policy. | No subscription mutation. | Client-side state reconstruction or lifecycle guessing. |
| `applyForSubscription` | Request a trial/monthly/yearly package. | Session/user reference, package id, and client target. | Request summary and new/current lifecycle. | Create or reuse a pending request. | Client-provided duration, expiry, price, quota, node id, artifact secret, contact profile, or direct issuance. |
| `refreshSubscription` | Replace the current active subscription material. | Session/user reference and client target. | New visible-once material summary and old-link invalidation event. | Backend-controlled refresh only when active. | New package application, duration extension, payment capture, or operator override. |
| `fetchSubscriptionHistory` | Read account history for Profile. | Session/user reference. | Application, approval, refresh, expiry, and support summary rows. | None. | Raw secrets, full database rows, or operator audit dumps. |
| `requestSupport` | Prepare a support handoff. | Session/user reference, issue category, safe message/context. | Support handoff reference or guidance. | Support record only if implemented. | Bot execution, payment operation, Admin mutation, or subscription issuance. |

## View Responsibilities

### Subscription Management

This is the only primary action surface for:

- Applying for a package.
- Refreshing an active subscription.
- Copying the currently visible subscription material when the client returns it.

It must show:

- Package choice when not locked.
- Current package when locked.
- Current lifecycle state.
- Next support action when pending.
- Current subscription link only when available.

It must keep intent calls separate:

- Read current portal state after login: `fetchCurrentState`.
- Apply/open package: `applyForSubscription`.
- Refresh current active subscription: `refreshSubscription`.

These actions must not share an overloaded request method, because opening a new
package and refreshing an existing subscription have different backend
authorization semantics.

### Use Guide

This is a static help surface for:

- Downloading/installing client.
- Copying the subscription.
- Importing configuration.
- Updating client subscription after refresh.

It must not display Admin diagnostics, node internals, traffic dashboards, or
operator-only evidence.

### Support

This is the handoff surface for:

- Authorization confirmation.
- Subscription import failures.
- Package/support questions.
- Future Telegram bot or human-support routing.

Current support wording may mention Telegram as a future support channel, but the
Telegram bot is not embedded into the portal flow.

### Profile

This is the read-mostly account surface for:

- Email.
- User reference.
- Registration date.
- Current package and lifecycle label.
- Expiry result.
- History summary.

It must not carry the primary apply/refresh action copy. Action guidance belongs
in Subscription Management or Support.

## Rendering Rules

The four views must render the same backend state consistently.

### Global account summary

- `none`: show no active package and no expiry.
- `pending`: show selected package and `Pending authorization`; do not show a
  concrete expiry date.
- `active`: show current package and backend-provided expiry.
- `expired`: show the expired package result and expired date when returned.

### Subscription Management

- `none`: show package selector, client target, and `Apply`.
- `pending`: lock package choice, disable duplicate application, and guide the
  user to Support.
- `active`: hide package selector as a primary choice, show current package,
  expiry, refresh action, and visible-once material only when returned.
- `expired`: allow package selection and re-application.
- Refresh success: show an event note that the previous link has been
  invalidated; do not create a separate lifecycle state for it.

### Use Guide

- Keep instructions static and customer-facing.
- Do not render node diagnostics, traffic dashboards, Admin evidence, or
  operator workbench copy.

### Support

- Show the support path for pending authorization and import failures.
- Telegram may appear only as a support contact direction, not as an embedded
  portal authority or bot automation flow.

### Profile

- Show account facts, lifecycle, package result, expiry result, registration
  date, and history summary.
- Do not show primary apply/refresh buttons here.
- Empty history must be explicit, for example `No completed package history
  yet`, instead of showing fake order rows.

## Visible-Once Subscription Material

Visible subscription material is a sensitive output, not ordinary profile data.

- It may appear only when the backend or injected preview client returns it for
  the current operation.
- It must not be logged, stored in documentation, copied into tests as a real
  URL, written to local storage, or printed to chat.
- Page refresh should rehydrate state through `fetchCurrentState`; if policy no
  longer allows material display, the UI must show a neutral message and offer
  the appropriate refresh/support action.
- Refreshing an active subscription invalidates the previous material by backend
  policy; the UI only reports the returned event.

## Backend Integration Milestones

The local preview UI should advance toward real backend support in small gates:

| Phase | Scope | Risk | Notes |
| --- | --- | --- | --- |
| 0 | Local preview client and page logic. | B | No production route, DB mutation, or real issuance. |
| 1 | User-scoped current-state read model. | B/A depending on schema and route exposure | Must preserve user authorization and return server-owned lifecycle. |
| 2 | Package application request in `pending`. | B/A depending on persistence target | Creates a reviewable request from user ref, package, and client target only. |
| 3 | Operator approval to active issuance. | A for production execution | Uses protected operator/CLI/Admin path, not customer direct authority. |
| 4 | Active subscription refresh. | A for production mutation | Must revoke/expire old material and return only safe visible-once output. |
| 5 | History and support read models. | B/A depending on data exposure | Must avoid raw secrets, contact profiles, and operator-only evidence. |

## Code Alignment Points

Current frontend anchors:

- `admin/src/features/user-portal/user-portal-page.tsx`
  - `PortalView`
  - `navItems`
  - `resolveLifecycle`
  - `lifecycleLabel`
  - `subscriptionCtaLabel`
  - `SubscriptionManager`
  - `UseGuide`
  - `SupportPanel`
  - `ProfilePanel`
- `admin/src/features/user-portal/user-portal-client.ts`
  - `UserPortalClient`
  - `createLocalUserPortalClient`
  - safe local preview contract
  - `fetchCurrentState`
  - `applyForSubscription`
  - `refreshSubscription`
- `admin/src/test/user-portal.test.tsx`
  - page outline checks
  - login state hydration
  - package application and refresh behavior
  - profile state consistency
  - safe default local client behavior

Any future change to portal copy, navigation, state labels, package behavior,
support handoff, or visible-once subscription handling should update this
document and the matching tests in the same PR.

## Review Checklist

Before changing the user portal:

1. Identify which top-level view is affected.
2. Confirm whether the change modifies lifecycle state, package model, support
   handoff, or copy only.
3. Check the affected code anchor against this document.
4. Update `admin/src/test/user-portal.test.tsx` for behavior/copy that defines a
   user-visible contract.
5. Keep Admin/operator CLI behavior separate unless the task explicitly changes a
   shared domain service.
6. Do not introduce payment, public auth activation, production DB mutation, real
   issuance, public Admin, DNS, Nginx, Aliyun, AWS, or edge-traffic behavior
   without the appropriate higher-risk gate.
