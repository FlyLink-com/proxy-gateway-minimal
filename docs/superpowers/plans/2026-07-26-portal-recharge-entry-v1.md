# Portal Recharge Entry V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible direct plan-purchase journey with a six-tier,
non-mutating Coins recharge dialog while preserving the complete wallet,
Marketplace navigation, existing order history, and server-owned traffic
status.

**Architecture:** `UserPortalPage` remains the only Portal shell and owns the
dialog state and acquisition routing. `portal-commerce-panels.tsx` owns a
shared denomination list with explicit selectable-dialog and disabled-wallet
modes. Legacy plan and cashier source remains present but has no normal Portal
entry point; existing order records remain reachable independently of the old
new-order dialog.

**Tech Stack:** React 19, TypeScript, Lucide React, Vitest, Testing Library,
Vite, existing `ModalFrame`, and the verified Portal static CSS boundary.

## Execution Status

- Tasks 1-5 are locally implemented and task-reviewed at
  `af37d2c3d813d99e317938c2adb1bfdb0355cd21`.
- Task-scoped local commits were separately authorized.
- Push, PR, Ready, merge, artifact publication, deployment, production, and
  Stage 2 remain unauthorized.
- Final whole-branch review is pending.

## Global Constraints

- Work only in
  `D:\Projects\proxy-gateway-minimal\.worktrees\master-portal-commerce-merge`.
- Implementation starts from local candidate
  `bde4e3349c87a6394cc4d4d18f50a7bcaa4dc1c5` on
  `codex/portal-commerce-work-validation`.
- The verified production baseline remains
  `cb69e18071c108de13e6cdc63037f2d251873298`; the local candidate is
  `source_only_not_deployed`.
- Use only `admin/portal/index.html`, `admin/src/portal-main.tsx`,
  `admin/src/features/user-portal/user-portal-page.tsx`,
  `admin/src/portal-static-preserve.css`, and `admin/dist-portal` as the Portal
  build chain.
- Do not use `admin/index.html`, `admin/src/main.tsx`, `admin/src/App.tsx`,
  `PortalPreviewRoute`, local/mock clients, fixtures, demo accounts,
  `admin/src/styles.css`, `admin/dist`, `admin/dist-site`, or PR #526's shell
  as production inputs.
- The top-bar label is exactly `充值 Coins` / `Recharge Coins`.
- The dialog contains exactly `10 / 30 / 50 / 100 / 200 / 300 Coins`.
- The Coins balance entry continues to open the complete wallet view.
- Dialog selection is presentation-only and never calls
  `createPaymentCheckout`, `applyForSubscription`, quote, ledger, wallet,
  fulfillment, or entitlement mutation methods.
- The dialog displays no RMB price, USD price, exchange rate, provider fee,
  discount, reward, or fabricated balance.
- All other new-acquisition controls navigate to Marketplace.
- No ordinary authenticated Portal control can reach the legacy plan-selection
  or cashier dialogs.
- Existing order records remain reachable without adding a top-level Orders
  navigation item.
- Recharge selection does not change setup access, order rows, entitlements,
  quota, or traffic summaries.
- Do not add Marketplace offers, Coins checkout, PayPal sandbox behavior,
  provider callbacks, wallet posting, or fulfillment logic.
- Do not modify schema, server APIs, Admin, GitHub, artifacts, deployment, or
  production.
- Task-scoped local commits are authorized for Stage 1. Do not push, create a
  PR, mark Ready, merge, publish an artifact, deploy, or change production
  without separate user authorization.
- Every behavior change uses a red-green TDD cycle.

## File Structure

### Files To Modify

- `admin/src/features/user-portal/portal-commerce-panels.tsx`
  - Owns the six approved denominations.
  - Exports the shared denomination list and compact recharge dialog.
  - Keeps wallet controls disabled and dialog denomination controls selectable.
- `admin/src/features/user-portal/user-portal-page.tsx`
  - Owns dialog-open and selected-denomination state.
  - Routes acquisition controls to recharge or Marketplace.
  - Decouples order-history visibility from `orderFormOpen`.
- `admin/src/test/user-portal.test.tsx`
  - Locks shell integration, legacy-entry removal, order-history reachability,
    and negative client-call behavior.
- `admin/src/styles/portal-static-preserve/user-portal-commerce.css`
  - Styles the dialog and denomination grid using existing Portal theme
    variables and breakpoints.
- `scripts/verify-portal-build.mjs`
  - Requires the recharge dialog marker in Portal JavaScript and CSS output.
- `server/tests/portal-static-build-verifier.test.mjs`
  - Covers the new required artifact marker.

### File To Create

- `admin/src/test/portal-recharge-dialog.test.tsx`
  - Focused presentational tests for the two denomination-list modes and
    compact dialog.

---

### Task 1: Build The Shared Recharge Presentation Component

**Files:**

- Modify:
  `admin/src/features/user-portal/portal-commerce-panels.tsx`
- Create:
  `admin/src/test/portal-recharge-dialog.test.tsx`

**Interfaces:**

- Consumes:

```ts
export type PortalCommerceLocale = "zh" | "en";
```

- Produces:

```ts
export const RECHARGE_DENOMINATIONS = [10, 30, 50, 100, 200, 300] as const;

export type RechargeDenomination =
  (typeof RECHARGE_DENOMINATIONS)[number];

export type RechargeDenominationListProps = {
  locale: PortalCommerceLocale;
  mode: "dialog-selectable" | "wallet-disabled";
  selectedAmount?: RechargeDenomination | null;
  onSelect?: (amount: RechargeDenomination) => void;
};

export function RechargeDenominationList(
  props: RechargeDenominationListProps
): JSX.Element;

export function RechargeDialog(props: {
  locale: PortalCommerceLocale;
  selectedAmount: RechargeDenomination | null;
  onSelect: (amount: RechargeDenomination) => void;
  onClose: () => void;
}): JSX.Element;
```

- [ ] **Step 1: Write failing component tests**

Create `admin/src/test/portal-recharge-dialog.test.tsx` with these contracts:

```tsx
import { createElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  RechargeDenominationList,
  RechargeDialog
} from "../features/user-portal/portal-commerce-panels";

describe("Portal recharge presentation", () => {
  test("offers exactly six selectable denominations in the compact dialog", () => {
    const onSelect = vi.fn();
    render(createElement(RechargeDialog, {
      locale: "zh",
      selectedAmount: null,
      onSelect,
      onClose: vi.fn()
    }));

    const dialog = screen.getByRole("dialog", { name: "充值 Coins" });
    const choices = within(dialog).getAllByRole("button", {
      name: /选择 \d+ Coins/
    });

    expect(choices.map((choice) => choice.textContent?.trim())).toEqual([
      "10 Coins",
      "30 Coins",
      "50 Coins",
      "100 Coins",
      "200 Coins",
      "300 Coins"
    ]);

    fireEvent.click(within(dialog).getByRole("button", {
      name: "选择 100 Coins"
    }));
    expect(onSelect).toHaveBeenCalledWith(100);
    expect(within(dialog).getByRole("button", {
      name: "支付通道将在下一阶段接入"
    })).toBeDisabled();
    expect(within(dialog).queryByText(/RMB|CNY|USD|汇率|手续费|优惠/)).toBeNull();
  });

  test("keeps the complete wallet denomination list disabled", () => {
    render(createElement(RechargeDenominationList, {
      locale: "zh",
      mode: "wallet-disabled"
    }));

    const buttons = screen.getAllByRole("button", {
      name: /充值 \d+ Coins 暂未开放/
    });
    expect(buttons).toHaveLength(6);
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
      expect(button).not.toHaveAttribute("aria-pressed");
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/portal-recharge-dialog.test.tsx
} finally {
  Pop-Location
}
```

Expected: FAIL because `RechargeDenominationList` and `RechargeDialog` are not
exported.

- [ ] **Step 3: Implement the denomination list**

In `portal-commerce-panels.tsx`, export the constant and types shown in the
Interfaces block, then add:

```tsx
export function RechargeDenominationList({
  locale,
  mode,
  selectedAmount = null,
  onSelect
}: RechargeDenominationListProps) {
  const zh = isChinese(locale);
  const selectable = mode === "dialog-selectable";

  return (
    <ul
      className={`portal-recharge-denominations portal-recharge-denominations--${mode}`}
      aria-label={zh ? "Coins 充值档位" : "Coins recharge denominations"}
    >
      {RECHARGE_DENOMINATIONS.map((amount) => (
        <li key={amount}>
          <button
            type="button"
            disabled={!selectable}
            aria-pressed={selectable ? selectedAmount === amount : undefined}
            aria-label={
              selectable
                ? zh
                  ? `选择 ${amount} Coins`
                  : `Select ${amount} Coins`
                : zh
                  ? `充值 ${amount} Coins 暂未开放`
                  : `Recharge ${amount} Coins — not available yet`
            }
            onClick={selectable ? () => onSelect?.(amount) : undefined}
          >
            {amount} Coins
          </button>
        </li>
      ))}
    </ul>
  );
}
```

Replace the wallet's inline denomination mapping with:

```tsx
<RechargeDenominationList locale={locale} mode="wallet-disabled" />
```

The wallet must not pass `selectedAmount` or `onSelect`.

- [ ] **Step 4: Implement the compact dialog**

Import the existing modal:

```tsx
import { ModalFrame } from "../../components/modal-frame";
```

Add:

```tsx
export function RechargeDialog({
  locale,
  selectedAmount,
  onSelect,
  onClose
}: {
  locale: PortalCommerceLocale;
  selectedAmount: RechargeDenomination | null;
  onSelect: (amount: RechargeDenomination) => void;
  onClose: () => void;
}) {
  const zh = isChinese(locale);

  return (
    <ModalFrame
      closeLabel={zh ? "关闭" : "Close"}
      onClose={onClose}
      panelClassName="portal-recharge-dialog"
      title={zh ? "充值 Coins" : "Recharge Coins"}
      titleId="portal-recharge-dialog-title"
      footer={(
        <button
          className="portal-primary-button compact"
          type="button"
          disabled
        >
          {zh
            ? "支付通道将在下一阶段接入"
            : "Payment channel will be connected in the next stage"}
        </button>
      )}
    >
      <div className="portal-recharge-dialog__body">
        <p>
          {zh
            ? "选择 Coins 档位。本阶段不会创建订单或发起支付。"
            : "Choose a Coins denomination. This stage does not create an order or start payment."}
        </p>
        <RechargeDenominationList
          locale={locale}
          mode="dialog-selectable"
          selectedAmount={selectedAmount}
          onSelect={onSelect}
        />
      </div>
    </ModalFrame>
  );
}
```

- [ ] **Step 5: Run the focused component test and verify GREEN**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/portal-recharge-dialog.test.tsx
} finally {
  Pop-Location
}
```

Expected: both tests PASS.

- [ ] **Step 6: Record the local checkpoint without Git mutation**

Run:

```powershell
git status --short
git diff --check
```

Expected: only the approved plan/spec and Task 1 files are changed; no
whitespace errors. Do not stage or commit.

---

### Task 2: Connect The Top-Bar Recharge Dialog And Preserve Wallet Routing

**Files:**

- Modify:
  `admin/src/features/user-portal/user-portal-page.tsx`
- Modify:
  `admin/src/test/user-portal.test.tsx`
- Test:
  `admin/src/test/portal-recharge-dialog.test.tsx`

**Interfaces:**

- Consumes:

```ts
RechargeDialog
RechargeDenomination
```

- Produces these local shell actions:

```ts
function openRechargeDialog(): void;
function closeRechargeDialog(): void;
```

- [ ] **Step 1: Write a failing top-bar integration test**

Add to `admin/src/test/user-portal.test.tsx`:

```tsx
test("opens a six-tier recharge dialog without starting payment or changing the wallet route", async () => {
  const client = portalClient();
  render(createElement(UserPortalPage, { portalClient: client }));

  await enterPortal();
  const topbar = document.querySelector(".portal-use-topbar");
  expect(topbar).not.toBeNull();

  const recharge = within(topbar as HTMLElement).getByRole("button", {
    name: "充值 Coins"
  });
  fireEvent.click(recharge);

  const dialog = screen.getByRole("dialog", { name: "充值 Coins" });
  const choice = within(dialog).getByRole("button", {
    name: "选择 100 Coins"
  });
  fireEvent.click(choice);
  expect(choice).toHaveAttribute("aria-pressed", "true");
  expect(client.createPaymentCheckout).not.toHaveBeenCalled();
  expect(client.applyForSubscription).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
  expect(screen.queryByRole("dialog", { name: "充值 Coins" })).toBeNull();

  fireEvent.click(recharge);
  expect(within(screen.getByRole("dialog", { name: "充值 Coins" }))
    .getByRole("button", { name: "选择 100 Coins" }))
    .toHaveAttribute("aria-pressed", "false");
  fireEvent.click(within(screen.getByRole("dialog", { name: "充值 Coins" }))
    .getByRole("button", { name: "关闭" }));

  fireEvent.click(within(topbar as HTMLElement).getByRole("button", {
    name: "打开 Coins 钱包，余额尚未接入"
  }));
  expect(await screen.findByRole("heading", { name: "余额与充值" }))
    .not.toBeNull();
  expect(screen.queryByRole("dialog", { name: "充值 Coins" })).toBeNull();
});

test("clears recharge selection when the Portal session ends", async () => {
  render(createElement(UserPortalPage, { portalClient: portalClient() }));

  await enterPortal();
  fireEvent.click(screen.getByRole("button", { name: "充值 Coins" }));
  fireEvent.click(within(screen.getByRole("dialog", {
    name: "充值 Coins"
  })).getByRole("button", { name: "选择 30 Coins" }));

  fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
  expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();

  await enterPortal();
  fireEvent.click(screen.getByRole("button", { name: "充值 Coins" }));
  expect(within(screen.getByRole("dialog", { name: "充值 Coins" }))
    .getByRole("button", { name: "选择 30 Coins" }))
    .toHaveAttribute("aria-pressed", "false");
});
```

- [ ] **Step 2: Run the integration test and verify RED**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/user-portal.test.tsx -t "opens a six-tier recharge dialog"
} finally {
  Pop-Location
}
```

Expected: FAIL because the top bar still renders `购买套餐`.

- [ ] **Step 3: Add shell-owned recharge state**

Extend the commerce import:

```ts
import {
  MarketplacePanel,
  RechargeDialog,
  ReferralRewardsPanel,
  WalletPanel,
  type RechargeDenomination
} from "./portal-commerce-panels";
```

Add state beside the current view and order state:

```ts
const [rechargeDialogOpen, setRechargeDialogOpen] = useState(false);
const [selectedRechargeAmount, setSelectedRechargeAmount] =
  useState<RechargeDenomination | null>(null);
```

Add actions:

```ts
function openRechargeDialog() {
  setSelectedRechargeAmount(null);
  setRechargeDialogOpen(true);
}

function closeRechargeDialog() {
  setSelectedRechargeAmount(null);
  setRechargeDialogOpen(false);
}
```

Reset presentation state when the authenticated session changes:

```ts
useEffect(() => {
  setRechargeDialogOpen(false);
  setSelectedRechargeAmount(null);
}, [portalSession]);
```

- [ ] **Step 4: Replace only the top-bar primary action**

Replace its click handler and label with:

```tsx
<button
  className="portal-primary-button compact"
  type="button"
  onClick={openRechargeDialog}
>
  <Plus aria-hidden="true" />
  {uiText(locale, "充值 Coins", "Recharge Coins")}
</button>
```

Do not change the separate `portal-coins-wallet-entry` handler.

Render the dialog inside the authenticated Portal shell:

```tsx
{rechargeDialogOpen ? (
  <RechargeDialog
    locale={locale}
    selectedAmount={selectedRechargeAmount}
    onSelect={setSelectedRechargeAmount}
    onClose={closeRechargeDialog}
  />
) : null}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Update `translates the signed-in portal shell when switching to English` so its
top-bar assertion is:

```tsx
expect(screen.getByRole("button", { name: "Recharge Coins" })).not.toBeNull();
expect(screen.queryByRole("button", { name: "Buy plan" })).toBeNull();
```

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/portal-recharge-dialog.test.tsx
  npm test -- src/test/user-portal.test.tsx -t "recharge dialog|recharge selection|disabled Coins wallet|switching to English"
} finally {
  Pop-Location
}
```

Expected: all selected tests PASS. The dialog selection resets after close,
wallet controls remain disabled, and no client mutation method is called.

- [ ] **Step 6: Record the local checkpoint without Git mutation**

Run:

```powershell
git status --short
git diff --check
```

Do not stage or commit.

---

### Task 3: Decouple Existing Order History From New-Purchase State

**Files:**

- Modify:
  `admin/src/features/user-portal/user-portal-page.tsx`
- Modify:
  `admin/src/test/user-portal.test.tsx`

**Interfaces:**

- Consumes existing `SubscriptionManager`, `paymentOrders`, and `orderRows`.
- Produces an order-history surface reachable from the existing
  `profile` view without setting `orderFormOpen`.

- [ ] **Step 1: Add a payment-order fixture helper**

Add beside the existing test factories:

```ts
function paymentOrder(
  overrides: Partial<PortalPaymentOrder> = {}
): PortalPaymentOrder {
  return {
    orderRef: "pay_existing_monthly",
    planId: "monthly_basic",
    planLabel: "基础月付",
    amountMinor: 2000,
    channel: "alipay",
    currency: "CNY",
    status: "pending_payment",
    checkoutUrl: "https://pay.example.test/existing",
    createdAt: "2026-05-31T00:00:00.000Z",
    paymentExpiresAt: "2099-01-01T00:00:00.000Z",
    safety: {
      noRawMerchantKey: true,
      noRawProviderPayload: true
    },
    ...overrides
  };
}

function portalClientWithPaymentOrders(
  paymentOrders: PortalPaymentOrder[]
): UserPortalClient {
  return portalClient({
    fetchCurrentState: vi.fn(async (input: {
      userRef: string;
    }): Promise<PortalUserState> => ({
      userRef: input.userRef,
      subscriptionRequest: null,
      paymentOrders,
      historySummary: [],
      security: {
        authenticatorBound: false,
        initialAccount: false,
        passkeyEnabled: false,
        passkeyExported: false,
        setupRequired: false
      },
      updatedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    }))
  });
}
```

- [ ] **Step 2: Write the failing order-history test**

Add:

```tsx
test("keeps existing order history reachable without opening legacy purchase dialogs", async () => {
  const client = portalClientWithPaymentOrders([paymentOrder()]);
  render(createElement(UserPortalPage, { portalClient: client }));

  await enterPortal();
  openPortalProfile();

  expect(await screen.findByRole("table", { name: "订单列表" })).not.toBeNull();
  expect(screen.getByText("P-existing_monthly")).not.toBeNull();
  expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
  expect(screen.queryByRole("dialog", { name: "选择支付方式" })).toBeNull();
  expect(client.createPaymentCheckout).not.toHaveBeenCalled();
  expect(client.applyForSubscription).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the order-history test and verify RED**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/user-portal.test.tsx -t "keeps existing order history reachable"
} finally {
  Pop-Location
}
```

Expected: FAIL because `SubscriptionManager` is currently gated by
`paymentFlowActive || orderFormOpen`.

- [ ] **Step 4: Decouple the order list from `orderFormOpen`**

Within the `activeView === "profile"` branch:

- keep `ProfilePanel` hidden only while an existing payment-order detail is
  active;
- render `SubscriptionManager` for every profile view;
- keep `orderFormOpen` only as the legacy dialog sub-state passed into
  `SubscriptionManager`;
- do not set `orderFormOpen` while entering profile or rendering the table.

The resulting structure is:

```tsx
{activeView === "profile" ? (
  <>
    {!paymentFlowActive ? (
      <ProfilePanel
        created={created}
        currentEntitlement={currentEntitlement}
        currentPlan={currentPlan}
        lifecycle={lifecycle}
        registrationDate={registrationDate}
        authMode={portalSession.authMode}
        authenticatorBound={authenticatorBound}
        authenticatorPending={authenticatorPending}
        passkeyExported={passkeyExported}
        passkeyError={passkeyError}
        passkeyPending={passkeyPending}
        exportPasskey={exportPasskey}
        startAuthenticatorEnrollment={startAuthenticatorEnrollment}
        userRef={portalSession.userRef}
        locale={locale}
      />
    ) : null}
    <SubscriptionManager
      activePaymentOrder={activePaymentOrder}
      actionError={actionError}
      orderClientFilter={orderClientFilter}
      orderFormOpen={orderFormOpen}
      orderRows={filteredOrderRows}
      paymentOrders={paymentOrders}
      lastPaymentOrderRef={lastPaymentOrderRef}
      orderSearch={orderSearch}
      orderSort={orderSort}
      orderStatusFilter={orderStatusFilter}
      paymentChannel={paymentChannel}
      selectedOrderRef={selectedOrderRef}
      selectedPlanId={selectedPlanId}
      pending={pending}
      setOrderClientFilter={setOrderClientFilter}
      setOrderSearch={setOrderSearch}
      setOrderSort={setOrderSort}
      setOrderStatusFilter={setOrderStatusFilter}
      setPaymentChannel={setPaymentChannel}
      setSelectedPlanId={setSelectedPlanId}
      closePaymentOrder={() => setActivePaymentOrderRef(null)}
      openPaymentOrder={openPaymentOrder}
      refreshPaymentOrders={refreshPaymentOrders}
      submitSubscription={submitSubscription}
      startNewOrder={startNewOrder}
      closeOrderForm={closeOrderForm}
      viewOrder={viewOrder}
      locale={locale}
    />
  </>
) : null}
```

Task 4 renames and redirects `startNewOrder`; this task changes only
order-history reachability.

- [ ] **Step 5: Update the existing profile-language regression**

In `uses user-facing wording instead of internal entitlement language`, replace
the assertions that order history is absent with:

```tsx
expect(screen.getByRole("region", { name: "订单记录" })).not.toBeNull();
expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
expect(screen.queryByRole("dialog", { name: "选择支付方式" })).toBeNull();
```

Continue asserting that internal entitlement and Admin wording is absent.

Update the other profile/order visibility regressions to the new approved
ownership:

```text
hydrates existing active subscription state after authentication
  -> expect the existing service/order row in 订单列表

hydrates backend orders into usage and setup surfaces after authentication
  -> expect both server-returned order rows in 订单列表

does not invent profile history from current subscription state
  -> rename to keeps current service state free of fabricated completion history
     and continue rejecting fabricated completed-history copy while allowing
     the server-returned current service row in 订单列表
```

For tests whose fixture has no `subscriptionRequest`, no
`subscriptionRequests`, and no `paymentOrders`, keep asserting that no order
table is rendered and that the existing empty-state is shown.

- [ ] **Step 6: Run focused profile and order tests and verify GREEN**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/user-portal.test.tsx -t "keeps existing order history reachable|uses user-facing wording"
} finally {
  Pop-Location
}
```

Expected: both tests PASS, with no new checkout creation.

- [ ] **Step 7: Record the local checkpoint without Git mutation**

Run:

```powershell
git status --short
git diff --check
```

Do not stage or commit.

---

### Task 4: Retire Every Visible Legacy New-Purchase Entry

**Files:**

- Modify:
  `admin/src/features/user-portal/user-portal-page.tsx`
- Modify:
  `admin/src/features/user-portal/portal-commerce-panels.tsx`
- Modify:
  `admin/src/test/user-portal.test.tsx`

**Interfaces:**

- Produces one acquisition router:

```ts
function openMarketplace(): void;
```

- Removes `startNewOrder` from all ordinary Portal component props and event
  handlers.

- [ ] **Step 1: Write failing routing and negative-action tests**

Add one shared assertion helper:

```tsx
function expectMarketplaceWithoutLegacyCheckout(client: UserPortalClient) {
  expect(screen.getByRole("heading", { name: "平台服务商城" })).not.toBeNull();
  expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
  expect(screen.queryByRole("dialog", { name: "选择支付方式" })).toBeNull();
  expect(client.createPaymentCheckout).not.toHaveBeenCalled();
  expect(client.applyForSubscription).not.toHaveBeenCalled();
}
```

Add tests with fresh renders for each state:

```tsx
test("routes every new-acquisition entry to Marketplace", async () => {
  const client = portalClient();
  render(createElement(UserPortalPage, { portalClient: client }));
  const portalNav = await enterPortal();

  expect(screen.queryByRole("button", { name: "购买套餐" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Buy plan" })).toBeNull();

  fireEvent.click(within(portalNav).getByRole("button", { name: "用量" }));
  fireEvent.click(screen.getByRole("button", { name: "前往商城" }));
  expectMarketplaceWithoutLegacyCheckout(client);
});

test("routes users without delivered traffic entitlement to Marketplace", async () => {
  const client = portalClient();
  render(createElement(UserPortalPage, { portalClient: client }));

  await enterPortal();
  openPortalStartGuide();
  fireEvent.click(screen.getByRole("button", { name: "开始配置" }));

  expectMarketplaceWithoutLegacyCheckout(client);
  expect(screen.queryByRole("heading", {
    name: "你要在哪台设备上使用？"
  })).toBeNull();
});

test("routes order creation controls to Marketplace", async () => {
  const client = portalClient();
  render(createElement(UserPortalPage, { portalClient: client }));

  await enterPortal();
  openPortalProfile();

  const orders = screen.getByRole("region", { name: "订单记录" });
  const acquisitionButtons = within(orders).getAllByRole("button", {
    name: "前往商城"
  });
  expect(acquisitionButtons).toHaveLength(2);
  fireEvent.click(acquisitionButtons[0]);

  expectMarketplaceWithoutLegacyCheckout(client);
});

test("routes failed legacy payment replacement to Marketplace", async () => {
  const client = portalClientWithPaymentOrders([
    paymentOrder({ status: "payment_failed" })
  ]);
  render(createElement(UserPortalPage, { portalClient: client }));

  await enterPortal();
  openPortalProfile();
  fireEvent.click(screen.getByRole("button", { name: "去付款" }));
  fireEvent.click(screen.getByRole("button", { name: "前往商城" }));

  expectMarketplaceWithoutLegacyCheckout(client);
});
```

The order test covers both the toolbar and empty-state controls. The failed
payment test covers the replacement action in `PortalPaymentFlow`. The
no-entitlement test covers both `开始配置` and the Start/setup gate because
both use the same acquisition callback.

- [ ] **Step 2: Run the new routing tests and verify RED**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/user-portal.test.tsx -t "routes every new-acquisition entry|routes users without delivered traffic entitlement"
} finally {
  Pop-Location
}
```

Expected: FAIL because ordinary controls still call `startNewOrder`.

- [ ] **Step 3: Add the single Marketplace acquisition router**

Replace `startNewOrder` with:

```ts
function openMarketplace() {
  setActionError("");
  setOrderFormOpen(false);
  setActivePaymentOrderRef(null);
  setActiveView("marketplace");
}
```

Rename every component prop and local reference from `startNewOrder` to
`openMarketplace` in:

```text
DashboardPanel
UsagePanel
SubscriptionManager
PortalPaymentFlow
PortalStartGuide
```

The top-bar recharge button continues to call `openRechargeDialog`, not
`openMarketplace`.

- [ ] **Step 4: Replace acquisition labels and explanatory copy**

Apply these exact Chinese/English replacements:

```text
购买套餐 / Buy plan
  -> 前往商城 / Go to Marketplace

重新购买 / Buy again
  -> 前往商城 / Go to Marketplace

购买套餐后开始计时 / Time starts after buying a plan
  -> 商城订单交付后开始计时 / Time starts after a Marketplace order is fulfilled

购买套餐后显示流量额度 / Traffic quota appears after buying a plan
  -> 流量权益交付后显示额度 / Traffic quota appears after entitlement delivery

购买套餐后会显示付款和续费记录。
  -> 商城订单和续费记录会在这里显示。

Payment and renewal records appear after you buy a plan.
  -> Marketplace orders and renewal records appear here.

没有可用流量套餐？先选择套餐
  -> 需要流量权益？前往商城

No traffic plan? Choose a plan first
  -> Need traffic entitlement? Go to Marketplace

搜索套餐、用量、客户端
  -> 搜索商品、用量、客户端

Search plans, usage, clients
  -> Search products, usage, clients
```

Change the order-history description to:

```tsx
{uiText(
  locale,
  "订单、履约和权益状态在这里分别显示；流量仅在权益生效后可用。",
  "Order, fulfillment, and entitlement states are shown separately. Traffic is available only after entitlement activation."
)}
```

Change Marketplace's conflicting sentence to:

```tsx
{zh
  ? "月卡、年卡和流量包统一在商城提供；购买暂未开放。"
  : "Monthly plans, annual plans, and data packs are provided through Marketplace; purchasing is not available yet."}
```

- [ ] **Step 5: Replace obsolete direct-checkout component tests**

Delete the test-only helpers:

```ts
openNewOrderForm
continueFromCashier
```

Remove component tests whose only subject is creating a new legacy checkout:

```text
keeps the new order form collapsed until the user starts a new order
creates yearly payment checkout through the user-scoped client
uses the mobile default wallet before external checkout
purchase form does not expose the registration-only 7 day trial
does not collect contact details before package application
default local portal client is safe by default and exposes no subscription link
```

Do not remove the HTTP-client contract test
`http portal client creates a session-scoped payment checkout for paid plans`.
It remains coverage for the legacy client contract while the source is retained.

Refactor these existing-order presentation tests to use
`portalClientWithPaymentOrders()` and `paymentOrder()` from Task 3 instead of
creating a new checkout:

```text
does not render a fake WeChat QR code from a hosted checkout URL
redirects mobile payment checkout to the provider for wallet handoff
falls back to the in-panel payment status when checkout URL is unavailable
keeps package payment records in the order table
keeps pending payment records separate from subscription setup
```

For each refactored test:

```tsx
await enterPortal();
openPortalProfile();
fireEvent.click(screen.getByRole("button", { name: "去付款" }));
```

Then retain its existing QR, redirect, status, or separation assertions. Assert
`createPaymentCheckout` and `applyForSubscription` were not called.

- [ ] **Step 6: Rewrite the no-entitlement setup test**

Replace `requires a purchased plan before starting the setup guide` with:

```tsx
test("requires delivered entitlement before setup and sends acquisition to Marketplace", async () => {
  const client = portalClient();
  render(createElement(UserPortalPage, { portalClient: client }));

  await enterPortal();
  openPortalStartGuide();
  fireEvent.click(screen.getByRole("button", { name: "开始配置" }));

  expect(screen.getByRole("heading", { name: "平台服务商城" })).not.toBeNull();
  expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
  expect(screen.queryByRole("heading", {
    name: "你要在哪台设备上使用？"
  })).toBeNull();
  expect(client.createPaymentCheckout).not.toHaveBeenCalled();
  expect(client.applyForSubscription).not.toHaveBeenCalled();
});
```

Keep the active trial and Admin-granted entitlement setup tests unchanged;
they prove that service-owned state, not recharge selection, grants setup
access.

- [ ] **Step 7: Add the recharge-state negative regression**

Using `portalClientWithActiveSubscription()`, assert the visible service status
and quota before and after dialog selection:

```tsx
test("does not grant traffic or alter entitlement state when a recharge denomination is selected", async () => {
  const client = portalClientWithActiveSubscription();
  render(createElement(UserPortalPage, { portalClient: client }));

  await enterPortal();
  openPortalProfile();
  const orderRowsBefore = within(screen.getByRole("table", {
    name: "订单列表"
  })).getAllByRole("row").length;
  openPortalDashboard();
  const statusBefore = screen.getByText("当前套餐可用").textContent;
  const quotaBefore = screen.getAllByText(/GB/).map((node) => node.textContent);

  fireEvent.click(screen.getByRole("button", { name: "充值 Coins" }));
  fireEvent.click(within(screen.getByRole("dialog", {
    name: "充值 Coins"
  })).getByRole("button", { name: "选择 300 Coins" }));
  fireEvent.click(within(screen.getByRole("dialog", {
    name: "充值 Coins"
  })).getByRole("button", { name: "关闭" }));

  expect(screen.getByText("当前套餐可用").textContent).toBe(statusBefore);
  expect(screen.getAllByText(/GB/).map((node) => node.textContent))
    .toEqual(quotaBefore);
  openPortalProfile();
  expect(within(screen.getByRole("table", {
    name: "订单列表"
  })).getAllByRole("row")).toHaveLength(orderRowsBefore);
  expect(client.createPaymentCheckout).not.toHaveBeenCalled();
  expect(client.applyForSubscription).not.toHaveBeenCalled();
});
```

If the current active fixture renders formatted traffic without `GB`, target
the existing service-status and quota elements by their current labels rather
than loosening the assertion.

- [ ] **Step 8: Run the focused Portal suite and verify GREEN**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/user-portal.test.tsx -t "Marketplace|recharge|order history|existing payment|delivered entitlement"
} finally {
  Pop-Location
}
```

Expected: selected tests PASS.

Run the negative source scan:

```powershell
rg -n "startNewOrder|购买套餐|Buy plan|现有套餐购买路径仍可单独使用" `
  admin/src/features/user-portal/user-portal-page.tsx `
  admin/src/features/user-portal/portal-commerce-panels.tsx
```

Expected: no matches. Historical plan definitions may still contain plan names
and prices, but no ordinary Portal entry or copy advertises direct purchase.

- [ ] **Step 9: Record the local checkpoint without Git mutation**

Run:

```powershell
git status --short
git diff --check
```

Do not stage or commit.

---

### Task 5: Add Theme, Responsive, And Artifact Verification

**Files:**

- Modify:
  `admin/src/styles/portal-static-preserve/user-portal-commerce.css`
- Modify:
  `scripts/verify-portal-build.mjs`
- Modify:
  `server/tests/portal-static-build-verifier.test.mjs`
- Test:
  `admin/src/test/portal-recharge-dialog.test.tsx`
- Test:
  `admin/src/test/user-portal.test.tsx`

**Interfaces:**

- Produces required artifact marker:

```text
portal-recharge-dialog
```

- [ ] **Step 1: Add the verifier marker test first**

In `server/tests/portal-static-build-verifier.test.mjs`:

- add `portal-recharge-dialog` to both JavaScript and CSS content in the valid
  fixture;
- add a failing fixture where `portal-recharge-dialog` is absent from
  JavaScript;
- assert:

```js
await assert.rejects(
  () => verifyPortalBuildDirectory(tempDir),
  /portal commerce layout marker missing: portal-recharge-dialog/
);
```

- [ ] **Step 2: Run the verifier test and verify RED**

Run:

```powershell
node --test server/tests/portal-static-build-verifier.test.mjs
```

Expected: FAIL because `verify-portal-build.mjs` does not yet require the new
marker.

- [ ] **Step 3: Require the artifact marker**

Update:

```js
const REQUIRED_COMMERCE_LAYOUT_MARKERS = [
  "portal-commerce-layout",
  "portal-coins-wallet-entry",
  "portal-recharge-dialog"
];
```

- [ ] **Step 4: Add Portal-boundary dialog styling**

Append styles scoped under `.portal-v2-shell`:

```css
.portal-v2-shell .portal-recharge-dialog {
  width: min(680px, calc(100vw - 32px));
}

.portal-v2-shell .portal-recharge-dialog__body {
  display: grid;
  gap: 16px;
}

.portal-v2-shell .portal-recharge-dialog__body > p {
  margin: 0;
  color: #8b949e;
  font-size: 13px;
  line-height: 1.55;
}

.portal-v2-shell .portal-recharge-denominations {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.portal-v2-shell .portal-recharge-denominations li {
  min-width: 0;
}

.portal-v2-shell .portal-recharge-denominations button {
  width: 100%;
  min-height: 48px;
  border: 1px solid #30363d;
  border-radius: 10px;
  background: #161b22;
  color: #c9d1d9;
  padding: 10px 12px;
  font: inherit;
  font-weight: 700;
}

.portal-v2-shell
  .portal-recharge-denominations--dialog-selectable
  button[aria-pressed="true"] {
  border-color: rgba(32, 213, 232, 0.8);
  background: rgba(32, 213, 232, 0.12);
  color: #f0f6fc;
}

.portal-v2-shell .portal-recharge-denominations button:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px rgba(32, 213, 232, 0.2);
}

.portal-v2-shell .portal-recharge-denominations button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.portal-v2-shell[data-portal-theme="light"]
  .portal-recharge-dialog__body > p {
  color: #57606a;
}

.portal-v2-shell[data-portal-theme="light"]
  .portal-recharge-denominations button {
  border-color: #d0d7de;
  background: #ffffff;
  color: #1f2937;
}

.portal-v2-shell[data-portal-theme="light"]
  .portal-recharge-denominations--dialog-selectable
  button[aria-pressed="true"] {
  border-color: #13a9be;
  background: #e8fbfd;
  color: #1f2937;
}
```

Extend the existing `max-width: 720px` block:

```css
.portal-v2-shell .portal-recharge-denominations {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
```

Do not modify `admin/src/styles.css` or the shared `ModalFrame`.

- [ ] **Step 5: Run verifier and focused UI tests**

Run:

```powershell
node --test server/tests/portal-static-build-verifier.test.mjs

Push-Location admin
try {
  npm test -- src/test/portal-recharge-dialog.test.tsx
  npm test -- src/test/user-portal.test.tsx -t "recharge|Marketplace|order history"
} finally {
  Pop-Location
}
```

Expected: all commands PASS.

- [ ] **Step 6: Run the complete B-tier validation**

Run in this order:

```powershell
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
npm test
npm run docs:authority:check
git diff --check
git diff --check origin/master...HEAD
```

Expected:

- all Admin tests pass;
- the real Portal build succeeds;
- the Portal verifier recognizes `portal-recharge-dialog`;
- root tests pass;
- document authority passes;
- both diff checks report no whitespace errors.

- [ ] **Step 7: Perform the final forbidden-input and mutation scan**

Run:

```powershell
rg -n "createHttpUserPortalClient|createLocalUserPortalClient|fetch\\(|createPaymentCheckout|applyForSubscription" `
  admin/src/features/user-portal/portal-commerce-panels.tsx

rg -n "admin/src/main.tsx|admin/src/App.tsx|PortalPreviewRoute|admin/dist-site|admin/dist-portal-preview" `
  docs/superpowers/specs/2026-07-26-portal-recharge-entry-v1.md `
  docs/superpowers/plans/2026-07-26-portal-recharge-entry-v1.md
```

Expected:

- no client, fetch, payment, subscription, or mutation dependency in the
  recharge presentation module;
- forbidden paths appear only in the explicit `forbidden_inputs` or constraints
  lists, never as implementation inputs.

- [ ] **Step 8: Stop at the source handoff gate**

Report:

```text
confirmed production baseline
local candidate exact HEAD and dirty files
focused and full validation results
no payment/order/ledger/fulfillment mutation added
task-scoped local commits only; no push, PR, artifact, deployment, or
production action performed
Stage 2 remains unauthorized
```

Stop after task-scoped local commits. Do not push, open a PR, mark Ready,
merge, publish an artifact, deploy, change production, or begin Marketplace
offers.
