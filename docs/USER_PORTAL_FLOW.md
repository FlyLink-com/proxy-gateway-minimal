# User Portal Flow

Last updated: 2026-07-09.

This document is the review baseline for the customer-facing portal flow. It
exists to keep product outline, page copy, component behavior, tests, and future
backend/API work aligned before additional UI changes are made.

It does not authorize production deployment, public portal routing, payment
activation, database migration, production subscription issuance, DNS, Nginx,
Aliyun, AWS, or edge-traffic changes.

## Boundary

The user portal is a customer-facing package subscription surface. It is a thin
client: the frontend sends user intent and renders server-provided facts. It is
not the operator CLI, not the protected Admin console, and not a production
issuance authority by itself.

Current implementation is repository-safe and entry-gated:

- No public Admin exposure.
- No payment provider activation.
- No production database mutation.
- No production subscription issuance. The portal request path creates
  subscription order/request records only; it does not auto-create runtime
  tenants, entitlements, issued links, or visible-once subscription material.
- No public email/password self-service account creation.
- The local portal UI exposes one normal visible login method: account ID,
  password, and a generated local anti-bot math challenge. That challenge is
  not an email code or TOTP dynamic credential. The page does not show entry
  Token, standalone authenticator, password-login, or email-code login tabs.
- `#/portal-preview` includes a small repository-only batch of issued preview
  accounts. Unknown accounts and wrong passwords are rejected locally. Initial
  preview accounts that still require setup show an account-security
  initialization dialog immediately after login and must bind an authenticator
  and export a passkey preview package before the dialog can be completed.
- Authenticator binding and passkey export also live under Personal Center
  security settings after login. In `#/portal-preview`, authenticator setup uses
  a local TOTP enrollment preview with an `otpauth://` binding URI, scannable QR
  code, manual key, and 6-digit code confirmation. Passkey export writes a local
  preview JSON backup package and marks the account factor enabled/exported; it
  is not a WebAuthn private key export. The local preview client stores enabled
  authenticator/passkey factors per account in memory; the next password login
  returns a second-factor challenge and does not create a portal session until
  an enabled factor verifies. For passkey preview, the second-factor page must
  receive the exported JSON backup package and match its account/passkey refs;
  clicking a button without package content is not verification. These are
  account security factors, not parallel first-screen login choices.
- After login, the left sidebar exposes `退出登录`; it clears the local portal
  session and returns the user to the account-login form.
- Operator-issued entry Token activation remains an admin-controlled first-bind
  boundary. The HTTP client still models the default-off entry/session seam for
  repository validation, but the normal login page does not expose it.
- Email-code login and real mail issuance are no longer part of the product
  direction. Existing email-code client stubs stay hidden and fail-closed only
  for compatibility while that path is retired. The HTTP password path remains
  default-off and usable only when the backend explicitly injects reviewed
  credential services.
- The default frontend client calls same-origin `/api/portal/*` endpoints, which
  remain default-off unless the backend explicitly enables and injects the portal
  services.
- The local Admin shell keeps `#/portal` as the real HTTP portal route and uses
  `#/portal-preview` only for repository-local browser validation through the
  safe preview client.
- No raw subscription URL from order submission. Visible-once material can
  appear only on an already-issued order returned by a reviewed delivery path.
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
| Subscription Management | Manage subscription orders for 7-day, monthly, or yearly durations. | Choose duration, quantity, and client preference; submit an order; view, edit display fields, copy issued material when available, refresh or disable issued orders; keep delete disabled. | Payment capture, direct subscription generation from the request step, production issuance without a separate gate, delete order/subscription records, node/operator controls. |
| Use Guide | Explain client import and refresh behavior. | Read client instructions and navigate back to Subscription Management. | Admin diagnostics, traffic dashboards, node internals. |
| Support | Provide customer support handoff. | Read support options and prepare account/subscription issue context. | Bot automation execution, payment provider operation, Admin mutation. |
| Profile | Show account facts, history records, and account security settings. | View account facts, view current package result, view history summary, bind a local-preview TOTP authenticator through QR/manual key plus 6-digit confirmation, and export the local-preview passkey backup package. | Package application, subscription refresh, personal contact collection, production credential/key registration mutation, backend secret persistence, or real WebAuthn registration as primary actions. |

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
  -> disabled
  -> expired
```

| State | User-facing label | Primary button | Expiry display | Notes |
| --- | --- | --- | --- | --- |
| `none` | Not opened / 未开通 | Apply / 申请开通 | None / 无 | User chooses trial/monthly/yearly package and client target only. |
| `pending` | Waiting for authorization / 等待授权 | Waiting / 等待授权中 | Pending authorization / 待授权 | Order requests wait for reviewed delivery or later order-management handling. No fixed expiry or subscription material should be shown before issuance. |
| `active` | Service active / 服务生效中 | Order row actions / 订单行操作 | Concrete expiry date | Active means the order has already been issued by a reviewed delivery path. Refresh reissues the current delivery generation, invalidates the previous artifact/configuration, and does not change the package period. |
| `disabled` | Disabled / 已禁用 | Re-apply / 重新申请 | Disabled / 已禁用 | User-disabled records remain auditable and are not physically deleted. |
| `expired` | Expired / 已过期 | Re-apply / 重新申请开通 | Expired date | User returns to package application flow. |

Old-link invalidation is an event, not a lifecycle state. It should appear as an
inline event note after refresh, not as a permanent navigation/status item.

## State Transitions

All state transitions are owned by the backend/control plane. The frontend only
requests user actions and refreshes its view from returned state.

| Event | From | To | Owner | Frontend reaction |
| --- | --- | --- | --- | --- |
| Login/session restore | Any persisted state | Returned current state | Backend | Call `fetchCurrentState` and render the returned lifecycle, package, expiry, and history. |
| Initial account security setup | Logged-in initial preview account | Local security factors enabled/exported | Preview client | Show `账户安全初始化` until authenticator binding and passkey export are both complete. |
| Logout | Any logged-in UI state | No local session | Frontend | Clear local session/form state and return to account login. |
| Subscription order submitted | `none`, `expired`, or `disabled` | `pending` | Backend order/request service | Create an order/request summary without subscription URL or entitlement material. |
| Duplicate package application | `pending` | `pending` | Backend | Show existing pending state instead of creating another request. |
| Operator approval | `pending` | `active` | Operator/backend | Start the package period server-side and return concrete expiry on next state read. |
| Subscription reissue | `active` | `active` plus old-link-invalidated event | Backend order lifecycle service | Show newly returned visible-once material, use the returned delivery-generation summary, and show an inline previous-configuration invalidation note. |
| Subscription disabled by user | `active` | `disabled` | Backend order lifecycle service | Remove visible material, keep the order/request record, and keep physical delete disabled. |
| Package expiry | `active` | `expired` | Backend | Show expired package and allow re-application. |
| Unsupported portal action | Any | No state change | Backend | Render the returned error without guessing fallback state. |

## Package Model

The portal uses package subscription logic, not recharge/balance/debit logic.

Current package set:

- 7-day order: 7 days after reviewed issuance.
- Monthly order: 30 days after reviewed issuance.
- Yearly order: 365 days after reviewed issuance.

Rules:

- Before activation, the user may choose 7-day, monthly, or yearly duration.
- The frontend sends only the chosen package id (`trial`, `monthly`, or
  `yearly`), not `durationDays`.
- All package choices use the order/request path. The request step does not
  generate subscription material.
- During `pending`, package selection is locked and duplicate application is
  blocked.
- During `active`, package selection is locked; the main actions are refresh
  and disable.
- During `disabled`, the record remains visible/auditable and the user may
  re-apply. There is no delete action in the user portal.
- Changing package is deferred until expiration/disable or a future explicitly
  approved business rule.

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
| `requestEmailCode` | Retired compatibility stub. | None for the active product flow. | No email challenge in the current repository build. | Local preview and HTTP paths fail-closed. | Real email delivery, raw code return, account enumeration, public route activation, or subscription authority. |
| `authenticate` | Establish a portal session or start a second-factor challenge from the approved entry/login mechanism. | Visible normal login: account ID + password + generated local anti-bot math challenge. Default-off entry seam: entry token + encrypted TOTP secret + TOTP code + local human check. | Session reference and safe account identity, or `second_factor_required` for local-preview accounts with enabled factors. | Local preview account login only; entry enrollment/session/password routes only when default-off portal services are injected; email-code paths fail-closed. | Login-page method tabs, public email/password signup, production email challenge storage, subscription issuance, Admin token use, raw subscription URL return. |
| `completeSecondFactor` | Complete a local-preview account second-factor challenge. | Challenge ref plus either a bound TOTP code or the exported local passkey preview JSON package. | Session reference and safe account identity. | Local preview only; HTTP path fail-closed until reviewed backend factor storage, WebAuthn, rate limits, and session issuance are approved. | Fixed proof strings, click-only passkey success, raw TOTP secret return, real WebAuthn registration, public route activation, password reset, subscription authority, or Admin token use. |
| `exportPasskey` | Export the local-preview passkey backup package and enable the account factor for second-factor preview. | Session/user reference. | Preview JSON package plus safe export metadata. | Local preview only; HTTP path fail-closed. | WebAuthn private key export, production credential mutation, public route activation, subscription authority, or Admin token use. |
| `fetchCurrentState` | Hydrate the portal after login or page refresh. | Session/user reference. | Order lifecycle, package, expiry, history summary, and issued material only if an order was already delivered. | No subscription mutation. | Client-side state reconstruction or lifecycle guessing. |
| `applyForSubscription` | Create a 7-day/monthly/yearly order request. | Session/user reference, package id, quantity, and client target. | Request summary and pending lifecycle. | Creates an order/access-request fact only. | Client-provided expiry, price, quota, node id, artifact secret, contact profile, delete action, or direct subscription generation. |
| `refreshSubscription` | Reissue the current delivery generation for an already-issued order. | Session/user reference, request reference, and client target. | New visible-once material summary, safe delivery-generation metadata, and old-link invalidation event. | Backend-controlled reissue only when active and issued. | New package application, duration extension, payment capture, direct request-step issuance, account disable, usage reset, or operator override. |
| `disableSubscription` | Legacy API name for stopping an already-issued order/resource without deleting the account or order/request record. | Session/user reference and request reference. | Disabled lifecycle summary. | Backend-controlled order/resource stop only when active and issued. | Account disable, physical delete, payment refund logic, operator override, or hidden record removal. |
| `suspendTrafficSupply` | Suspend traffic supply for an already-issued order/resource when a controlled lifecycle decision such as quota exhaustion fires. | Session/user reference and request reference. | Traffic-supply suspended summary and safe event metadata. | Backend-controlled traffic-supply suspension only when active and issued; quota exhaustion is executed automatically by the usage collector once the gate is enabled. | Account disable, physical delete, payment refund logic, operator override, or hidden record removal. |
| `fetchSubscriptionHistory` | Read account history for Profile. | Session/user reference. | Application, approval, refresh, expiry, and support summary rows. | None. | Raw secrets, full database rows, or operator audit dumps. |
| `requestSupport` | Prepare a support handoff. | Session/user reference, issue category, safe message/context. | Support handoff reference or guidance. | Support record only if implemented. | Bot execution, payment operation, Admin mutation, or subscription issuance. |

## View Responsibilities

### Subscription Management

This is the only primary action surface for:

- Applying for a package.
- Refreshing an active subscription.
- Disabling an active subscription without physical delete.
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
- Stop current active subscription/order through the legacy portal action:
  `disableSubscription`.
- Suspend traffic supply for an active order/resource when usage reaches the
  configured limit: `suspendTrafficSupply` through the automatic collector gate.

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

- Login entry method.
- Account ID / user reference.
- Registration date.
- Current package and lifecycle label.
- Expiry result.
- History summary.
- Account security settings for local-preview authenticator binding and passkey
  export.

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
  expiry, refresh/disable actions, and visible-once material only when returned.
- `disabled`: show disabled state, hide visible material, keep the record, and
  allow re-application.
- `expired`: allow package selection and re-application.
- Refresh success: show an event note that the previous delivery generation or
  imported configuration has been invalidated; do not create a separate
  lifecycle state for it.

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
| 2 | Order/request path for 7-day, monthly, and yearly durations. | B repo-only; A for runtime/control mutation | User submission creates pending order/request facts only; direct subscription generation is not part of this path. |
| 3 | Operator approval to active issuance. | A for production execution | Uses protected operator/CLI/Admin path, not customer direct authority. |
| 4 | Active subscription refresh/disable. | A for production mutation | Must revoke/expire old material, keep audit rows, never physically delete from user portal, and return only safe visible-once output when applicable. |
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
  - `disableSubscription`
- `admin/src/test/user-portal.test.tsx`
  - page outline checks
  - authentication mode rendering, local anti-bot checks, and login state hydration
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
