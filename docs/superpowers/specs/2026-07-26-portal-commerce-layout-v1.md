# Portal Commerce Layout V1 Design

## Status

- Risk: B
- Frontend surface: `portal`
- Release unit: `portal-static`
- Production impact: none
- Deployment authority: none
- Implementation state: approved layout, no business actions

## Production Surface Identity Record

```yaml
frontend_surface: portal
identity_state: verified
deployment_or_artifact:
  serving_tree:
    observed_at: 2026-07-26
    target: current production Portal static root
    file_count: 9
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

Admin remains `legacy_unreconciled` and is not an implementation target for
this change.

## Goal

Extend the verified production Portal shell with a verifiable commerce
information architecture while keeping every Coins, recharge, checkout,
referral-link creation, ledger, and fulfillment action inactive until its
backend contract passes a separate gate.

## Chosen Layout

The existing Portal shell remains the only shell and navigation owner.

- Add `商城` as a first-level left-navigation item.
- Add `推荐奖励` as a first-level left-navigation item.
- Add a Coins wallet entry to the existing top bar. It displays an unavailable
  balance marker rather than a fabricated balance and opens the wallet view.
- Keep `Coins 支付` out of global navigation. It remains a future checkout
  step.
- Keep the existing direct `购买套餐` path unchanged. It is not removed in this
  layout change.
- Keep existing account, usage, order, setup, security, and support journeys
  unchanged.

Rejected structures:

- a second Portal shell or parallel navigation;
- a standalone commerce workspace;
- a top-level payment log;
- a fake wallet balance, fake quote, fixture-backed product, or demo order;
- an Admin or partner-console surface embedded in the user Portal.

## Views

### 商城

The page establishes four catalog categories:

1. 商品
2. 套餐
3. 流量包
4. 增值项

It explains what each category owns, but it does not create a product,
checkout, quote, payment order, or fulfillment request. Purchase controls are
disabled and clearly marked unavailable. The existing direct plan-purchase
entry remains in the top bar.

### Coins 钱包

The wallet is reached from the top bar, not the left navigation. It contains:

- a balance summary with `--` values, never a synthetic zero;
- separate paid, bonus, and reward Coins cards;
- the recharge denominations `10 / 30 / 50 / 100 / 200 / 300`;
- wallet areas for balance, recharge, ledger, and rewards;
- disabled recharge controls whose accessible name states that recharge is not
  yet available.

The page does not calculate exchange rates, PayPal fees, payment quotes, or
wallet balances. Those values must later come from server-issued contracts.

### 推荐奖励

> 2026-08-30 reconciliation: `attributed spend` in the original placeholder
> list below is retained only as layout history. It is not the current reward
> basis or metric authority. `docs/COINS_FIRST_COMMERCIAL_DECISION.md` replaces
> it with registrations, first-recharge conversions, credited first-recharge
> `paid_coins`, pending/available/reversed `reward_coins`, and conversion rate.
> Protected API and Portal source replacement belong to #523; this docs-only
> reconciliation does not change the current TSX or claim deployment.

The page reflects the approved all-user referral model:

- every normal Portal user may participate;
- there is one referral link per user;
- the referral profile is created on first link creation;
- performance areas cover attributed registration, attributed spend, pending
  reward, and available reward;
- reward Coins do not recursively generate referral rewards;
- reward state descriptions cover pending, available, held, and reversed.

All metrics use `--`, and link creation remains disabled. The page does not
grant Admin access, perform settlement, expose attribution evidence, or create
a link.

## Component Boundary

Create one focused presentational module:

```text
admin/src/features/user-portal/portal-commerce-panels.tsx
```

It receives only locale and has no `UserPortalClient`, fetch, wallet, payment,
order, or fulfillment dependency. `user-portal-page.tsx` remains the shell and
view router.

Commerce-specific CSS lives in:

```text
admin/src/styles/portal-static-preserve/user-portal-commerce.css
```

and is imported only through `admin/src/portal-static-preserve.css`.

## Accessibility, Locale, And Theme

- All navigation entries remain native buttons with visible focus behavior.
- Disabled actions use real `disabled` attributes.
- Page headings and region labels are available to assistive technology.
- Chinese and English copy are both supplied through the existing locale
  preference.
- The new surfaces support the existing light and dark Portal theme selectors.
- Mobile layouts collapse grids without adding another navigation structure.

## Acceptance Criteria

- Existing five Portal navigation items remain present.
- `商城` and `推荐奖励` are added to the same navigation.
- `Coins 支付` is absent from the global navigation.
- The top bar contains a Coins wallet entry with no fabricated numeric balance.
- Wallet layout lists all six approved recharge denominations.
- All recharge, referral-link, and catalog purchase controls are disabled.
- No new Portal client method, HTTP call, local client, fixture, or business
  mutation is introduced.
- Current direct checkout remains unchanged.
- Focused tests, full Admin tests, Portal build, Portal verifier, root tests,
  and diff checks pass before handoff.
- No commit, push, PR, deployment, or production switch is performed without
  separate user authorization.
