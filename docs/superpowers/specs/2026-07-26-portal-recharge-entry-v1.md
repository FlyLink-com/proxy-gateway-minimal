# Portal Recharge Entry V1 Design

## Status

- Risk: B
- Frontend surface: `portal`
- Release unit: `portal-static`
- Production impact: none
- Deployment authority: none
- Design state: approved
- Implementation state: Stage 1 locally implemented and task-reviewed at
  `af37d2c3d813d99e317938c2adb1bfdb0355cd21`;
  `source_only_not_deployed`, pending final whole-branch review

This specification defines the first interaction stage after
`2026-07-26-portal-commerce-layout-v1.md`. It supersedes only that document's
decision to keep the visible direct `购买套餐` journey. The earlier layout,
production-surface identity, and no-business-action constraints remain in
force.

## Production Surface Identity Record

```yaml
frontend_surface: portal
identity_state: verified
deployment_or_artifact:
  serving_tree:
    observed_at: 2026-07-26
    comparison: 9_of_9_path_and_sha256_match
  github:
    workflow: Release Artifact
    run_id: 30192261447
    artifact_id: 8628968166
    artifact_name: portal-static-cb69e18071c1
    artifact_digest: sha256:ef3554b6244af8f45fc1d6ee0a5c2478bea3c32c1168c3ce8e21165da50366a4
source_commit: cb69e18071c108de13e6cdc63037f2d251873298
entry: admin/portal/index.html
bootstrap: admin/src/portal-main.tsx
shell: admin/src/features/user-portal/user-portal-page.tsx
stylesheet: admin/src/portal-static-preserve.css
output: admin/dist-portal
forbidden_inputs:
  - admin/index.html
  - admin/src/main.tsx
  - admin/src/App.tsx
  - PortalPreviewRoute
  - local or mock Portal client
  - fixture or demo account
  - admin/src/styles.css
  - admin/dist
  - admin/dist-site
  - PR 526 CommerceWorkspace or parallel navigation
```

The production baseline above is distinct from the current local candidate:

```yaml
local_candidate:
  branch: codex/portal-commerce-work-validation
  head: af37d2c3d813d99e317938c2adb1bfdb0355cd21
  state: source_only_not_deployed
```

Admin remains outside this stage.

## Business Decision

The Portal no longer presents a direct plan-purchase journey.

- The top-bar `购买套餐` action becomes `充值 Coins`.
- The top-bar Coins balance entry continues to open the complete wallet view.
- Monthly plans, annual plans, and traffic packs belong to the Marketplace.
- Coins payment belongs inside a future Marketplace checkout flow, not global
  navigation.
- Existing order records remain visible. Hiding the old purchase entry does
  not delete historical fiat orders, renewal records, or their detail views.
- Old direct-checkout source may remain temporarily for rollback and later
  removal, but no ordinary Portal control may open it after this stage.

## Stage 1: Recharge Entry Without Business Mutation

This is the only implementation scope authorized by this specification.

### Top-Bar Action

The existing primary top-bar action is relabelled:

```text
购买套餐 -> 充值 Coins
Buy plan -> Recharge Coins
```

Clicking it opens a recharge dialog in the existing Portal shell. It does not
navigate to the wallet and does not open the old plan-selection or cashier
dialogs.

### Recharge Dialog

The dialog uses the existing `ModalFrame` component and displays exactly six
denominations:

```text
10 / 30 / 50 / 100 / 200 / 300 Coins
```

The user may select one denomination so the layout, focus states, theme, and
responsive behavior can be verified. Selection is local presentation state
only.

The dialog must not:

- display an invented RMB or USD price;
- calculate exchange rates or provider fees;
- request a server quote;
- create a recharge order;
- launch PayPal or another provider;
- mutate a wallet or ledger;
- imply that Coins have been credited.

The primary completion control remains disabled and states that the payment
channel will be connected in a later stage. Closing the dialog, signing out,
or changing Portal session clears the selected denomination. Reopening starts
with no denomination selected, and the selection is never written to browser
storage.

### Wallet Entry

The existing Coins balance entry remains independent:

```text
Coins · -- -> complete wallet view
```

It must not open the compact recharge dialog. The wallet continues to own
balance, recharge, activity, and rewards information. Its six recharge rows
remain non-mutating in this stage.

The shared denomination presentation has two explicit modes:

- `dialog-selectable`: a denomination may be selected locally with
  `aria-pressed`;
- `wallet-disabled`: every recharge control remains disabled.

Reusing the list must not make wallet recharge controls selectable.

### Removal Of The Visible Direct-Purchase Journey

After authenticated Portal entry, no ordinary user-facing control may be named
`购买套餐` or `Buy plan`.

Controls that previously began direct plan checkout are handled as follows:

- the top-bar control becomes `充值 Coins`;
- the Usage empty state becomes `前往商城` / `Go to Marketplace`;
- the order toolbar and order empty-state create controls become
  `前往商城` / `Go to Marketplace`;
- failed-payment `重新购买` / `Buy again` becomes `前往商城` /
  `Go to Marketplace`;
- the Start/setup no-entitlement branch and its `没有可用流量套餐？先选择套餐`
  prompt become Marketplace navigation;
- instructional empty-state copy uses Marketplace, product-order, fulfillment,
  or entitlement language instead of telling the user to buy a plan directly;
- controls that already represent an existing order, payment record, or
  entitlement remain unchanged when they are not new-purchase entry points.

Only the top-bar `充值 Coins` control opens the compact recharge dialog. Every
other new-acquisition control listed above navigates to Marketplace.

The old plan-selection and cashier dialogs may remain in source during this
stage, but the normal authenticated Portal journey must not reach them. Their
deletion is a separate cleanup decision after the Marketplace and recharge
flows have replacement coverage.

### Order-History Decoupling

Order history must not disappear when the old purchase-dialog trigger becomes
unreachable.

The `SubscriptionManager` order list is made visible from the existing
`个人与安全` / `Profile and security` journey independently of
`orderFormOpen`. Opening or rendering the order list must not set
`orderFormOpen`, select a new plan, or start checkout.

Its existing order-detail behavior remains available. Controls for creating a
new purchase navigate to Marketplace, while actions belonging to an already
created legacy order remain under the existing order record. This stage does
not add a top-level Orders navigation item.

### Marketplace Copy

The current Marketplace sentence that says the existing plan-purchase path
remains available is removed. Until Stage 2, the replacement states that
monthly plans, annual plans, and traffic packs are owned by Marketplace and
that purchasing is not yet available.

## Future Stages

These stages are explicitly not authorized by this specification.

### Stage 2: Marketplace Offers

- Render monthly, annual, and traffic-pack offer cards.
- Receive price, availability, accepted Coins, discount, and sale-state data
  from a reviewed catalog contract.
- Keep checkout disabled until the offer and order contracts pass their own
  gate.

### Stage 3: Coins Marketplace Checkout

- Request a server-issued quote.
- Create a product order and hold the accepted Coins atomically.
- Confirm or release the hold from server-owned order state.
- Keep Coins payment inside the Marketplace checkout dialog or drawer.

### Stage 4: Recharge Provider Sandbox

- Bind one selected denomination to a server-issued fiat quote.
- Create a recharge order and start the approved PayPal sandbox adapter.
- Credit `paid_coins` only from verified provider callback and ledger
  processing.

### Stage 5: Fulfillment And Entitlement

Payment, wallet capture, order confirmation, fulfillment, and entitlement are
separate state domains. The frontend must never grant traffic from a payment
result alone.

The eventual display sequence is:

```text
payment confirmed
  -> Coins ledger captured
  -> product order confirmed
  -> fulfillment pending
  -> entitlement active
  -> traffic available
```

Only service-owned fulfillment and entitlement states may make monthly quota
or permanent traffic available. Failed, pending, held, released, or reversed
states must not be displayed as delivered traffic.

## Component Boundary

The implementation should stay within the verified Portal surface:

```text
admin/src/features/user-portal/user-portal-page.tsx
admin/src/features/user-portal/portal-commerce-panels.tsx
admin/src/components/modal-frame.tsx
admin/src/styles/portal-static-preserve/user-portal-commerce.css
admin/src/test/user-portal.test.tsx
```

Preferred structure:

- extract one reusable locale-aware recharge denomination selector from the
  existing wallet markup;
- render it in the wallet and compact dialog without giving it a client,
  fetch, quote, order, payment, or ledger dependency;
- keep dialog-open and selected-denomination state in `UserPortalPage`;
- continue importing commerce CSS only through
  `admin/src/portal-static-preserve.css`.

`ModalFrame` should be reused, not forked or copied.

## Accessibility, Locale, Theme, And Responsive Behavior

- The top-bar button and dialog have Chinese and English accessible names.
- The dialog has an associated title and uses the existing `ModalFrame` close
  button.
- Adding Escape handling or a focus trap to the shared `ModalFrame` is outside
  this stage.
- Denominations expose selection through native button semantics and
  `aria-pressed`.
- The unavailable completion action uses a real `disabled` attribute.
- Light and dark themes use existing Portal variables.
- The denomination grid collapses without horizontal overflow on the current
  Portal mobile breakpoint.
- Focus remains visible for the top-bar action, denominations, and close
  control.

## Acceptance Criteria

1. The top bar shows `充值 Coins` / `Recharge Coins` and no longer shows
   `购买套餐` / `Buy plan`.
2. Clicking the top-bar action opens one dialog containing each approved
   denomination exactly once.
3. A denomination can be selected locally, but no payment, quote, order,
   ledger, balance, or fulfillment method is called.
4. The dialog's completion action is disabled and accurately describes the
   later-stage boundary.
5. The Coins balance entry still opens the complete wallet view.
6. Usage, order-create/empty, failed-payment retry, and Start/setup
   no-entitlement controls navigate to Marketplace instead of opening the
   legacy plan or cashier dialogs.
7. Existing order history remains reachable without opening a new-order
   dialog; existing order and entitlement detail actions continue to work.
8. No ordinary authenticated Portal view exposes a visible `购买套餐` or
   `Buy plan` control, or instructional copy that presents direct plan purchase
   as the current acquisition path.
9. No Marketplace offer, price, discount, traffic grant, PayPal action, or
   production switch is added in this stage.
10. Recharge selection does not change setup access, order rows, account
    entitlements, quota, or traffic summaries.
11. Tests prove that the new controls do not call
    `createPaymentCheckout` or `applyForSubscription`, and that the legacy
    plan-selection and cashier dialogs are unreachable from the normal Portal
    journey.
12. Focused Portal tests, full Admin tests, Portal build and verifier, root
    tests, and diff checks pass before implementation handoff.

## Validation Contract

Implementation must use a red-green TDD sequence and finish with:

```powershell
Push-Location admin
try {
  npm test -- src/test/user-portal.test.tsx
} finally {
  Pop-Location
}

npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
npm test
git diff --check origin/master...HEAD
```

Task-scoped local commits were separately authorized for Stage 1. Push, PR,
Ready, merge, artifact publication, deployment, and production switch remain
unauthorized.
