# User Portal Flow

Last updated: 2026-05-31.

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
| Profile | Show account facts and contact records. | View account facts, view current package result, edit authorization contact info, view history summary. | Package application or subscription refresh as primary actions. |

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
| `none` | Not opened / 未开通 | Apply / 申请开通 | None / 无 | User must choose monthly/yearly package and provide authorization contact info. |
| `pending` | Waiting for authorization / 等待授权 | Waiting / 等待授权中 | Pending authorization / 待授权 | No fixed expiry should be shown before operator approval. User should be guided to Support. |
| `active` | Service active / 服务生效中 | Refresh current subscription / 刷新当前订阅 | Concrete expiry date | Refresh replaces the current link and invalidates the previous link without changing the package period. |
| `expired` | Expired / 已过期 | Re-apply / 重新申请开通 | Expired date | User returns to package application flow. |

Old-link invalidation is an event, not a lifecycle state. It should appear as an
inline event note after refresh, not as a permanent navigation/status item.

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

## Authorization Contact Info

Before a non-active user can apply for a package, the portal must collect:

- Contact email.
- Phone number.
- Telegram account.

The form is a modal because the subscription page has limited space and should
stay focused on package selection and subscription state.

Contact info is used for authorization review, support handoff, and future table
records. It should be editable from Profile through a user-scoped
`updateContactInfo` call, not held only in browser memory, and reused by the
next application or support interaction.

## View Responsibilities

### Subscription Management

This is the only primary action surface for:

- Applying for a package.
- Refreshing an active subscription.
- Copying the currently visible subscription material when the client returns it.

It must show:

- Package choice when not locked.
- Current package when locked.
- Contact-info completion summary before application.
- Current lifecycle state.
- Next support action when pending.
- Current subscription link only when available.

It must keep intent calls separate:

- Read current portal state after login: `fetchCurrentState`.
- Apply/open package: `applyForSubscription`.
- Refresh current active subscription: `refreshSubscription`.
- Persist authorization contact updates: `updateContactInfo`.

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
- Authorization contact info.
- History summary.

It must not carry the primary apply/refresh action copy. Action guidance belongs
in Subscription Management or Support.

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
  - `ContactInfoModal`
- `admin/src/features/user-portal/user-portal-client.ts`
  - `UserPortalClient`
  - `createLocalUserPortalClient`
  - safe local preview contract
  - `fetchCurrentState`
  - `updateContactInfo`
  - `applyForSubscription`
  - `refreshSubscription`
- `admin/src/test/user-portal.test.tsx`
  - page outline checks
  - login state hydration
  - contact-info modal gating
  - contact-info persistence
  - package application and refresh behavior
  - profile state consistency
  - safe default local client behavior

Any future change to portal copy, navigation, state labels, package behavior,
contact info, or visible-once subscription handling should update this document
and the matching tests in the same PR.

## Review Checklist

Before changing the user portal:

1. Identify which top-level view is affected.
2. Confirm whether the change modifies lifecycle state, package model, contact
   info, support handoff, or copy only.
3. Check the affected code anchor against this document.
4. Update `admin/src/test/user-portal.test.tsx` for behavior/copy that defines a
   user-visible contract.
5. Keep Admin/operator CLI behavior separate unless the task explicitly changes a
   shared domain service.
6. Do not introduce payment, public auth activation, production DB mutation, real
   issuance, public Admin, DNS, Nginx, Aliyun, AWS, or edge-traffic behavior
   without the appropriate higher-risk gate.
