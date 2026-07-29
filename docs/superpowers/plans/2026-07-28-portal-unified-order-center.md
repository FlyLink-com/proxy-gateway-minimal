# Portal Unified Order Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nested Coins Orders shell and legacy order manager with one Portal order center that presents Coins consumption, legacy payment, and service records through one filter, list, and detail surface.

**Architecture:** Keep every server DTO, read path, payment flow, and fulfillment state machine separate. Add a frontend-only discriminated union for presentation, let `PortalOrdersPanel` retain the existing guarded Coins pagination/detail reads, and pass the existing legacy payment/service records into the same view. Coins recharge remains absent until a real Portal recharge-order read API exists.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, existing Portal static-preserve CSS.

## Global Constraints

- Risk B: one compact frontend change set with intent, code, and tests; no schema, migration, payment callback, wallet mutation, fulfillment, deployment, or production change.
- Use only `admin/portal/index.html -> admin/src/portal-main.tsx -> UserPortalPage -> admin/src/portal-static-preserve.css -> admin/dist-portal`.
- Do not use preview fixtures, `App.tsx`, `admin/src/main.tsx`, `admin/src/styles.css`, generated dist files, or a second Portal shell.
- Keep old direct-payment records and their existing follow-up flow; do not create new orders through the legacy checkout.
- Hide Coins recharge order navigation and placeholder copy until a real session-scoped recharge-order data source exists.
- Do not commit, push, open a PR, merge, or deploy without a separate explicit user instruction.
- Preserve the current uncommitted Wallet refresh changes in the worktree.

---

### Task 1: Lock the unified information architecture with RED tests

**Files:**
- Modify: `admin/src/test/user-portal.test.tsx`
- Modify: `admin/src/test/portal-orders-panel.test.tsx`

**Interfaces:**
- Consumes: the current `UserPortalPage` and `PortalOrdersPanel` behavior.
- Produces: failing behavioral tests for one heading layer, one type-filter group, one list, hidden recharge placeholders, and mixed-source rows.

- [ ] **Step 1: Write the failing Portal integration test**

Add a test that enters the real `UserPortalPage`, opens Orders with one legacy payment, one service request, and one `PortalCoinOrder`, then asserts:

```ts
expect(screen.getAllByRole("heading", { name: "订单" })).toHaveLength(1);
expect(screen.getByRole("group", { name: "订单类型" })).toBeInTheDocument();
expect(screen.getAllByRole("table", { name: "订单列表" })).toHaveLength(1);
expect(screen.queryByText("订单记录")).toBeNull();
expect(screen.queryByText("历史订单")).toBeNull();
expect(screen.queryByText("充值订单数据源尚未接入")).toBeNull();
```

The production break caught is reintroducing a nested page shell or exposing an unavailable recharge domain.

- [ ] **Step 2: Write the failing mixed-source list test**

Render the Orders page with complete DTO fixtures and assert that the one table contains:

```ts
expect(within(orderTable).getByText("商城消费")).toBeInTheDocument();
expect(within(orderTable).getByText("旧套餐付款")).toBeInTheDocument();
expect(within(orderTable).getByText("服务记录")).toBeInTheDocument();
```

The production break caught is rendering one source outside the shared list.

- [ ] **Step 3: Replace tests that lock in the stitched layout**

Replace the assertions in `portal-orders-panel.test.tsx` that require three `<h3>` domain sections, four tabs, and duplicate recharge placeholder copy. Assert a button group with these visible filters only:

```ts
["全部", "商城消费", "套餐与服务"]
```

Use `aria-pressed` rather than `role="tab"` because the controls filter one list instead of selecting separate tab panels.

- [ ] **Step 4: Run RED**

Run:

```powershell
npm run admin:test -- --run src/test/portal-orders-panel.test.tsx src/test/user-portal.test.tsx
```

Expected: FAIL because the current component renders nested headings/sections, uses tabs, and exposes the recharge placeholder.

- [ ] **Step 5: Record the failure without committing**

Capture only the failing test names and expected mismatch in the working notes. Do not stage or commit.

---

### Task 2: Add the frontend-only order-center model

**Files:**
- Create: `admin/src/features/user-portal/orders/portal-order-center-model.ts`
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Test: `admin/src/test/portal-orders-panel.test.tsx`

**Interfaces:**
- Consumes: `PortalCoinOrder`, `PortalPaymentOrder`, and the existing service-order fields currently held by `PortalOrderRow`.
- Produces:

```ts
export type PortalOrderCenterKind =
  | "coins_consumption"
  | "legacy_payment"
  | "service_access";

export type PortalOrderCenterStatus =
  | "in_progress"
  | "successful"
  | "attention"
  | "closed";

export type PortalServiceOrder = {
  requestRef: string;
  request: PortalSubscriptionRequest;
  createdAt: string;
  planId: PortalPlanId;
  durationDays: number;
  quantity: number;
  clientTarget: PortalClientId;
  status: "pending" | "active" | "expired" | "disabled";
  expiresAt: string;
  subscriptionUrl?: string;
};

export type PortalOrderCenterItem =
  | { kind: "coins_consumption"; key: string; createdAt: string; status: PortalOrderCenterStatus; source: PortalCoinOrder }
  | { kind: "legacy_payment"; key: string; createdAt: string; status: PortalOrderCenterStatus; source: PortalPaymentOrder }
  | { kind: "service_access"; key: string; createdAt: string; status: PortalOrderCenterStatus; source: PortalServiceOrder };
```

- [ ] **Step 1: Write failing literal mapping tests**

Add table-driven tests with hand-derived expected values:

```ts
expect(orderCenterStatusForCoin(capturedDeliveredOrder)).toBe("successful");
expect(orderCenterStatusForCoin(heldOrder)).toBe("in_progress");
expect(orderCenterStatusForPayment(failedPayment)).toBe("attention");
expect(orderCenterStatusForService(activeService)).toBe("successful");
expect(orderCenterStatusForService(expiredService)).toBe("closed");
```

The production breaks caught are misclassifying payment, fulfillment, or service lifecycle states.

- [ ] **Step 2: Run RED**

Run:

```powershell
npm run admin:test -- --run src/test/portal-orders-panel.test.tsx
```

Expected: FAIL because the model exports do not exist.

- [ ] **Step 3: Implement the smallest model**

Implement exact status mapping and:

```ts
export function buildPortalOrderCenterItems(input: {
  coinOrders: PortalCoinOrder[];
  legacyPaymentOrders: PortalPaymentOrder[];
  serviceOrders: PortalServiceOrder[];
}): PortalOrderCenterItem[] {
  return [
    ...input.coinOrders.map(/* coins_consumption */),
    ...input.legacyPaymentOrders.map(/* legacy_payment */),
    ...input.serviceOrders.map(/* service_access */)
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
```

Use domain-prefixed keys. Do not collapse payment and service records because not every record has a proven one-to-one relation.

- [ ] **Step 4: Move the UI service-order type**

Replace the private `PortalOrderRow` declaration with the exported `PortalServiceOrder` type and use a local alias if needed to keep unrelated functions unchanged:

```ts
type PortalOrderRow = PortalServiceOrder;
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
npm run admin:test -- --run src/test/portal-orders-panel.test.tsx src/test/user-portal.test.tsx
```

Expected: model tests pass; the information-architecture tests may remain RED until Task 3.

---

### Task 3: Render one filter, toolbar, list, and detail surface

**Files:**
- Modify: `admin/src/features/user-portal/orders/portal-orders-panel.tsx`
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Modify: `admin/src/styles/portal-static-preserve/user-portal-commerce.css`
- Modify: `admin/src/styles/portal-static-preserve/user-portal-desktop.css` only if the existing table selectors cannot express the approved desktop layout.
- Test: `admin/src/test/portal-orders-panel.test.tsx`
- Test: `admin/src/test/user-portal.test.tsx`

**Interfaces:**
- `PortalOrdersPanel` additionally consumes:

```ts
legacyPaymentOrders: PortalPaymentOrder[];
serviceOrders: PortalServiceOrder[];
selectedServiceOrderRef: string | null;
selectedLegacyPaymentOrderRef: string | null;
orderSearch: string;
onOrderSearchChange(value: string): void;
onOpenLegacyPaymentOrder(order: PortalPaymentOrder): void;
onOpenServiceOrder(order: PortalServiceOrder): void;
onOpenMarketplace(): void;
```

- It no longer consumes `renderHistoricalOrders`.
- It preserves the existing `commerceClient/sessionRef/sessionGeneration/onSessionInvalid` guarded read contract.

- [ ] **Step 1: Make the approved shell tests GREEN**

Remove the inner `<h2>`, all domain `<h3>` sections, `role="tablist"`, and `renderHistoricalOrders()`. Render:

```tsx
<section className="portal-orders-panel" aria-label={copy(locale, "订单记录", "Order records")}>
  <div role="group" aria-label={copy(locale, "订单类型", "Order type")}>
    {/* 全部 / 商城消费 / 套餐与服务 */}
  </div>
  <div className="portal-order-toolbar">{/* search, status, sort, one Marketplace CTA */}</div>
  <table className="portal-order-table" aria-label={copy(locale, "订单列表", "Orders")}>
    {/* all visible PortalOrderCenterItem rows */}
  </table>
</section>
```

Do not render any Coins recharge control or unavailable placeholder.

- [ ] **Step 2: Normalize row language**

Use the common columns:

```text
订单 | 类型 | 商品或服务 | 金额 | 状态 | 创建时间 | 操作
```

Render:

- Coins amount as `<amountUnits> Coins`.
- Legacy payment amount using its DTO `currency` plus `amountMinor`; do not hard-code CNY.
- Service amount as `—`.
- User-facing localized payment and fulfillment labels; never raw `captured` or `delivered`.

- [ ] **Step 3: Preserve domain-specific actions**

- Coins “查看” calls the existing guarded `openDetail(orderRef)`.
- Legacy payment “去付款/查看” calls `onOpenLegacyPaymentOrder`.
- Service “查看” calls `onOpenServiceOrder`.
- The toolbar and empty state together render at most one “前往商城” action.

- [ ] **Step 4: Preserve pagination and partial failure**

Keep the existing paired cursor, duplicate-order rejection, request-id, session-generation, and retry behavior. A Coins read failure must leave legacy rows visible and add one compact message:

```text
部分商城订单暂不可用
```

Do not replace the entire list with an error state.

- [ ] **Step 5: Preserve one detail surface**

Use one expanded/detail container whose body switches by item kind:

- Coins: Coins amount, payment label, fulfillment label, allocation.
- Legacy payment: amount, payment status, created/paid time, existing payment action.
- Service: plan, client, quota/usage, lifecycle, expiry.

Do not merge the underlying DTOs or actions.

- [ ] **Step 6: Run GREEN**

Run:

```powershell
npm run admin:test -- --run src/test/portal-orders-panel.test.tsx src/test/user-portal.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 7: Refactor after GREEN**

Remove unused `renderHistoricalOrders` wiring and duplicated `portal-orders-section` styles only after the tests pass. Keep `PortalPaymentFlow` and legacy checkout follow-up behavior intact.

---

### Task 4: Negative regressions and full B-tier validation

**Files:**
- Modify only tests required to cover observed gaps.

**Interfaces:**
- Consumes: the completed unified order center.
- Produces: evidence that UI consolidation did not alter business behavior or production state.

- [ ] **Step 1: Add and run negative tests**

Cover:

```text
pending legacy payment does not grant traffic
Coins source failure does not hide service/payment rows
stale Coins list/detail response cannot replace current-session data
recharge category and placeholder are absent
only one Marketplace CTA is visible in an empty order center
```

- [ ] **Step 2: Run focused tests**

```powershell
npm run admin:test -- --run src/test/portal-orders-panel.test.tsx src/test/user-portal.test.tsx src/test/portal-coins-marketplace.test.tsx
```

- [ ] **Step 3: Run full Admin validation**

```powershell
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
npm run admin:build
```

- [ ] **Step 4: Run repository validation**

Stop or relocate only the owned disposable preview API if its fixed test port blocks the root suite, then run:

```powershell
npm test
git diff --check
```

Restart the user-requested local preview only if it was stopped and revalidate its disposable SQLite marker before use.

- [ ] **Step 5: Perform local desktop visual verification**

Verify the real Portal candidate route in the existing local harness:

```text
one page title
one order-type group
one toolbar
one mixed-source list
one detail surface
no recharge placeholder
no second shell or Admin navigation
light and dark theme remain readable
```

- [ ] **Step 6: Final safety review**

Confirm:

```text
no backend/schema/provider/payment callback/fulfillment changes
no generated dist staged
no production identity claim
no commit/push/PR/deploy
existing Wallet refresh changes preserved
```
