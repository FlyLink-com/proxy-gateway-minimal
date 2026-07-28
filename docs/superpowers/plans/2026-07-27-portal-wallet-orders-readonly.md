# Portal Wallet, Orders, And Profile Read-Only Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative Wallet reads, account-owned Coins consumption-order
history, a first-level Orders view, and separated Profile/Security subviews to
the existing production Portal shell without enabling any financial mutation.

**Architecture:** Preserve `UserPortalPage` as the single shell and navigation
owner. Add independent Wallet and Commerce-order GET adapters whose server
ownership comes only from the Portal session, whose TypeScript clients parse
responses fail-closed, and whose panels keep loading/empty/unavailable/error
states separate. Reuse the legacy order manager inside Orders; do not create a
second shell or infer a Coins recharge-order source.

**Tech Stack:** React 19, TypeScript 5.8, Vite 8, Vitest 4, Node test, Express
5, better-sqlite3 12, CSS under the Portal static-preserve boundary.

## Global Constraints

- Risk: B.
- Process: two stacked source-only PRs after base reconciliation; every code
  task follows watched RED, minimal GREEN, focused verification, local commit,
  and independent task review.
- Expected PR count: 2.
- PR 1 release unit: `control-plane-app`; contains only Tasks 4 and 7.
- PR 2 release unit: `portal-static`; frontend surface `portal`; stacked on
  PR 1 and contains Tasks 1, 2, 3, 5, 6, 8, 9, and 10.
- Identity impact: false.
- Production/AWS impact: none.
- Implementation worktree:
  `D:\Projects\proxy-gateway-minimal\.worktrees\portal-wallet-orders-ui`.
- Implementation branch: `codex/portal-wallet-orders-ui`.
- Implementation base:
  `c3d92ed3c4691f2512e80da3dffcab17e027b928`.
- Verified production identity record: dated 2026-07-26 artifact
  `portal-static-cb69e18071c1`, source
  `cb69e18071c108de13e6cdc63037f2d251873298`,
  `admin/portal/index.html -> admin/src/portal-main.tsx ->
  admin/src/features/user-portal/user-portal-page.tsx ->
  admin/src/portal-static-preserve.css -> admin/dist-portal`.
- The dated identity is sufficient for this source-only integration. It is not
  a current-live re-verification and grants no publish, deploy, or activation
  authority.
- Never use `admin/index.html`, `admin/src/main.tsx`, `admin/src/App.tsx`,
  `PortalPreviewRoute`, local/mock/fixture/demo data, `admin/src/styles.css`,
  `admin/dist`, `admin/dist-site`, PR #526 `CommerceWorkspace`, or a parallel
  navigation as a production source.
- Do not add a table, column, index, migration, Payment Store, recharge order,
  callback, reconciliation mutation, Wallet credit, refund/chargeback
  mutation, provider request, fulfillment mutation, Admin change, production
  change, or deployment.
- Mobile navigation, mobile-only DOM, breakpoints, responsive CSS, and mobile
  QA are out of scope. Adding Orders to the existing shared nav source is
  allowed, and new base component styles are shared by all viewports. Mobile
  behavior is therefore affected but intentionally unverified; do not claim
  mobile completion or production readiness.
- Do not expose wallet, lot, actor, source, idempotency, request-digest,
  provider, account, or customer internals.
- All SQLite tests use only an owned disposable fixture.
- A successful empty server response is `empty`; missing capability is
  `unavailable`; request/parser failure is `error`; none may be converted to a
  synthetic zero.
- `credit` ledger records do not persist their original available/pending
  bucket. For `credit`, the three bucket deltas are `null` and only
  `totalDeltaUnits = amountUnits` is authoritative. All other reviewed
  transitions have numeric bucket deltas.
- No task may push, open a PR, publish an artifact, deploy, or activate a
  feature.

## Required Execution And Branch-Split Order

Execute task briefs in this order, not numeric order:

```text
Task 4  Wallet server reads
Task 7  Coins order server reads
        record the exact control-plane-app split commit
Task 1  Windows CSS test portability
Task 2  Orders IA
Task 3  Personal Center separation
Task 5  Wallet TypeScript client
Task 6  Wallet UI
Task 8  Coins order TypeScript client
Task 9  Orders UI
Task 10 docs and full verification
```

This order keeps every `control-plane-app` commit below every `portal-static`
commit. After the existing 42-commit source stack is reconciled, materialize
the two PR branches at the recorded split commit rather than mixing release
units in one PR. The Portal PR is intentionally stacked on the read-contract
PR; neither PR is a deployment or activation.

---

### Task 1: Make The Existing Portal CSS Test Cross-Platform

**Files:**

- Modify: `admin/src/test/portal-coins-marketplace.test.tsx`

- [ ] **Step 1: Reproduce the existing Windows-only RED**

Run:

```powershell
npm --prefix admin run test -- src/test/portal-coins-marketplace.test.tsx
```

Expected RED on Windows: exactly one existing assertion fails because the CSS
file contains CRLF while its multiline expected string contains LF. Record the
test name and failure count in the implementer report. If the test is already
green, stop and report baseline drift rather than changing product code.

- [ ] **Step 2: Normalize only the test fixture read**

Add one helper near the existing CSS reads:

```ts
function readCommerceCss(): string {
  return readFileSync(commerceCssPath, "utf8").replace(/\r\n?/g, "\n");
}
```

Use that helper everywhere this test file reads the Commerce CSS. Do not edit
the CSS, selectors, mobile rules, or assertions.

- [ ] **Step 3: Run the focused GREEN**

Run the same command. Expected: the file passes with no product-source change.

- [ ] **Step 4: Commit**

```powershell
git add admin/src/test/portal-coins-marketplace.test.tsx
git commit -m "test(portal): normalize commerce CSS fixture line endings"
```

---

### Task 2: Add Orders To The Existing Portal IA

**Files:**

- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Modify: `admin/src/test/user-portal.test.tsx`

- [ ] **Step 1: Add the focused navigation and payment-return RED**

Add `openPortalOrders()` next to `openPortalProfile()` and add a test that
proves:

```ts
expect(
  within(navigation)
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"))
).toEqual([
  "开始使用",
  "概览",
  "用量",
  "商城",
  "订单",
  "推荐奖励",
  "个人中心",
  "支持"
]);
```

The same test must open an existing legacy payment detail from Orders and
assert that its return control is `返回订单`, after which `订单列表` is visible.

Run:

```powershell
npm --prefix admin run test -- src/test/user-portal.test.tsx -t "places Orders in navigation and returns legacy payment detail to Orders"
```

Expected RED: no `订单` navigation control and the legacy payment flow is still
bound to Profile.

- [ ] **Step 2: Implement the minimal shell-state change**

Make these exact semantic changes:

```ts
type PortalView =
  | "start"
  | "dashboard"
  | "usage"
  | "marketplace"
  | "orders"
  | "wallet"
  | "referrals"
  | "profile"
  | "support";
```

- Insert Orders after Marketplace and before Referrals in the existing
  `navItems`; use the already imported `ReceiptText`.
- Rename the Profile nav label to `个人中心 / Personal center`.
- Add localized heading/description copy for Orders and update Profile copy.
- Bind `paymentFlowActive`, `submitSubscription`, and `openPaymentOrder` to
  `orders`, not `profile`.
- Render the existing `SubscriptionManager` under
  `activeView === "orders"`.
- Keep the existing `SubscriptionManager` behavior intact; this task only
  changes its owner view.
- Change legacy payment-detail return labels to
  `返回订单 / Back to Orders`.
- Do not add Wallet to the left navigation and do not edit mobile CSS.

- [ ] **Step 3: Migrate only order-related tests**

Replace `openPortalProfile()` with `openPortalOrders()` only in tests whose
subject is legacy order history, payment status, payment detail, or payment
return. Keep authenticator/passkey tests on Personal Center.

Run:

```powershell
npm --prefix admin run test -- src/test/user-portal.test.tsx
```

Expected GREEN: the test file passes; exact nav order is asserted; Wallet is
still absent from the left nav.

- [ ] **Step 4: Commit**

```powershell
git add admin/src/features/user-portal/user-portal-page.tsx admin/src/test/user-portal.test.tsx
git commit -m "feat(portal): move order history into Orders navigation"
```

---

### Task 3: Separate Profile And Security Inside Personal Center

**Files:**

- Create:
  `admin/src/features/user-portal/profile/portal-personal-center-panel.tsx`
- Create: `admin/src/features/user-portal/profile/portal-profile-panel.tsx`
- Create: `admin/src/features/user-portal/profile/portal-security-panel.tsx`
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Modify: `admin/src/test/user-portal.test.tsx`
- Modify:
  `admin/src/styles/portal-static-preserve/user-portal-commerce.css`

- [ ] **Step 1: Add the separation RED**

Add a test named
`defaults Personal Center to profile and isolates security controls`:

```ts
fireEvent.click(screen.getByRole("button", { name: "个人中心" }));
expect(screen.getByRole("tab", { name: "资料" }))
  .toHaveAttribute("aria-selected", "true");
expect(screen.getByText("登录邮箱")).not.toBeNull();
expect(screen.queryByText("安全设置")).toBeNull();

fireEvent.click(screen.getByRole("tab", { name: "安全" }));
expect(screen.getByText("安全设置")).not.toBeNull();
expect(screen.queryByText("登录邮箱")).toBeNull();
```

Run:

```powershell
npm --prefix admin run test -- src/test/user-portal.test.tsx -t "defaults Personal Center to profile and isolates security controls"
```

Expected RED: the current combined `ProfilePanel` renders profile and security
content together and has no tabs.

- [ ] **Step 2: Add exact component contracts**

Use these public props:

```ts
export type PortalProfileSummary = {
  authModeLabel: string;
  userRef: string;
  registeredAtLabel: string;
  currentPlanLabel: string;
  expiryLabel: string;
};

export type PortalProfilePanelProps = {
  locale: "zh" | "en";
  summary: PortalProfileSummary;
};

export type PortalSecurityPanelProps = {
  locale: "zh" | "en";
  authenticatorBound: boolean;
  authenticatorPending: boolean;
  passkeyExported: boolean;
  passkeyPending: boolean;
  passkeyError: string;
  onStartAuthenticatorEnrollment: () => Promise<void>;
  onExportPasskey: () => Promise<void>;
};

export type PortalPersonalCenterPanelProps = {
  locale: "zh" | "en";
  activeSubview: "profile" | "security";
  onSubviewChange: (view: "profile" | "security") => void;
  profile: PortalProfileSummary;
  security: Omit<PortalSecurityPanelProps, "locale">;
};
```

`PortalPersonalCenterPanel` owns only the internal tablist and conditional
composition. `UserPortalPage` owns the active subview and derives profile
display strings from its existing authenticated state.

Entering Personal Center from first-level navigation and logging out both reset
the internal subview to `profile`; switching tabs while the view remains open
does not change shell navigation.

- [ ] **Step 3: Preserve the security gate**

Keep `securitySetupRequired`, `SecuritySetupDialog`, authenticator enrollment,
passkey export, and session controls at their existing shell level. Only the
optional Security settings panel moves into the new module.

Add narrowly scoped `.portal-v2-shell` styles for the internal tablist to
`user-portal-commerce.css`. Do not add an `@media` rule or edit responsive
files.

- [ ] **Step 4: Verify behavior**

Run:

```powershell
npm --prefix admin run test -- src/test/user-portal.test.tsx -t "Personal Center"
npm --prefix admin run test -- src/test/user-portal.test.tsx -t "security"
npm --prefix admin run test -- src/test/user-portal.test.tsx
```

Expected GREEN: Profile is the default, only one internal subview renders, and
the forced setup regression remains green.

- [ ] **Step 5: Commit**

```powershell
git add admin/src/features/user-portal/profile admin/src/features/user-portal/user-portal-page.tsx admin/src/styles/portal-static-preserve/user-portal-commerce.css admin/src/test/user-portal.test.tsx
git commit -m "refactor(portal): separate profile and security subviews"
```

---

### Task 4: Add Session-Owned Wallet Summary And Ledger GET Routes

**Files:**

- Create: `server/routes/portal-coin-wallet.mjs`
- Create: `server/tests/portal-coin-wallet-routes.test.mjs`
- Modify: `server/app.mjs`
- Modify: `server/services/platform/coin-wallet-store.mjs`
- Modify: `server/tests/auth.test.mjs`
- Modify: `server/tests/platform-coin-wallet-store.test.mjs`

- [ ] **Step 1: Add Store RED tests**

Extend the Wallet Store test with an owned disposable SQLite fixture that
proves:

- `listLedgerEntries` returns `coinType` from one bounded query;
- stable `occurredAt DESC, entryRef DESC` cursor pagination still works;
- malformed coin type fails closed;
- no schema object or financial row changes during the read.

Run:

```powershell
node --test server/tests/platform-coin-wallet-store.test.mjs
```

Expected RED: returned ledger entries do not yet contain `coinType`.

- [ ] **Step 2: Join coin type without a migration**

Change the existing ledger SELECT to:

```sql
select ledger.*, lot.coin_type as coin_type
  from platform_coin_ledger_entries as ledger
  left join platform_coin_lots as lot
    on lot.lot_ref = ledger.lot_ref
   and lot.wallet_ref = ledger.wallet_ref
 where ledger.wallet_ref = ?
   and (
     ? is null
     or ledger.occurred_at < ?
     or (ledger.occurred_at = ? and ledger.entry_ref < ?)
   )
 order by ledger.occurred_at desc, ledger.entry_ref desc
 limit ?
```

In `mapLedgerEntry`, normalize `row.coin_type` with the existing
`normalizeCoinType`. Convert a `LEFT JOIN` null, an unknown value, or any
normalization failure to the Store's safe `wallet_infrastructure_error`;
never return the raw value. Add `coinType` only after that validation. Test an
owned orphan/null fixture and an invalid joined value in addition to a valid
row. Do not add an index, table, column, or per-row lot lookup.

- [ ] **Step 3: Add route RED tests**

Create route tests that prove:

- routes mount only when both `userPortalRoutesEnabled` and
  `coinsWalletEnabled` are true;
- Store surface requires exactly callable `getWalletProjection` and
  `listLedgerEntries`, and auth requires `requireSession`;
- missing, duplicate, or invalid `X-Portal-Session` is rejected;
- `accountId` is taken only from the resolved session;
- `GET /api/portal/coins/wallet` returns a safe summary;
- `GET /api/portal/coins/wallet/ledger` validates limit and paired cursor;
- a server-confirmed missing wallet returns `not_created` plus authoritative
  zeros and an empty ledger page without creating a Wallet;
- no internal ref/actor/source/receipt field appears;
- unknown state, operation, coin type, unsafe integer, or malformed timestamp
  fails safely;
- all seven category formulas are asserted exactly; `credit` has three null
  bucket deltas and `total=amount`, while each transition has three numeric
  deltas with the specified signs and total;
- every non-2xx response is exactly
  `{ error: { code, retryable } }`, with `retryable=true` only for
  `wallet_unavailable`;
- disabled, unknown, and encoded `/api/portal/coins/` paths remain behind the
  console-auth fallback in `auth.test.mjs`;
- GET requests do not call any Wallet mutation.

Run:

```powershell
node --test server/tests/portal-coin-wallet-routes.test.mjs
```

Expected RED: the route module does not exist.

- [ ] **Step 4: Implement the safe route projection**

Export a named `createPortalCoinWalletRouter({ store, auth })` factory whose
return value is the selected-route Express dispatcher.

Expose only:

```text
GET /api/portal/coins/wallet
GET /api/portal/coins/wallet/ledger
```

Summary JSON:

```ts
{
  wallet: {
    status: "not_created" | "active" | "frozen" | "closed";
    version: number;
    balances: {
      paidCoins: number;
      bonusCoins: number;
      rewardCoins: number;
    };
    spendableUnits: number;
    heldUnits: number;
    pendingUnits: number;
  };
}
```

Ledger JSON:

```ts
{
  entries: Array<{
    entryRef: string;
    category:
      | "credit"
      | "pending_to_available"
      | "available_to_held"
      | "held_to_available"
      | "held_to_consumed"
      | "held_to_expired"
      | "available_to_expired";
    coinType: "paid_coins" | "bonus_coins" | "reward_coins";
    amountUnits: number;
    availableDeltaUnits: number | null;
    pendingDeltaUnits: number | null;
    heldDeltaUnits: number | null;
    totalDeltaUnits: number;
    relatedOrderRef: string | null;
    occurredAt: string;
  }>;
  nextCursor: {
    afterOccurredAt: string;
    afterEntryRef: string;
  } | null;
}
```

The ledger query requires exactly one `limit` value in the range 1–100.
`afterOccurredAt` and `afterEntryRef` are either both absent or both present
exactly once. Reject every unknown or repeated query key.

Projection rules:

```text
credit:
  available=null, pending=null, held=null, total=+amount
pending_to_available:
  available=+amount, pending=-amount, held=0, total=0
available_to_held:
  available=-amount, pending=0, held=+amount, total=0
held_to_available:
  available=+amount, pending=0, held=-amount, total=0
held_to_consumed:
  available=0, pending=0, held=-amount, total=-amount
held_to_expired:
  available=0, pending=0, held=-amount, total=-amount
available_to_expired:
  available=-amount, pending=0, held=0, total=-amount
```

Resolve the wallet by session-derived account before listing its ledger.
Request `limit + 1` from the Store with a Portal page limit of 1–100, return at
most `limit`, and derive the next cursor from the last returned entry.

Use this exact safe error allowlist and status mapping:

```text
wallet_request_invalid  -> 400, retryable=false
wallet_session_invalid  -> 401, retryable=false
wallet_unavailable      -> 503, retryable=true
```

Missing, duplicate, or malformed session headers and a session rejected by
`requireSession` map to `wallet_session_invalid`. Query/cursor violations map
to `wallet_request_invalid`. Store/projection/infrastructure failures map to
`wallet_unavailable`. No raw error message is returned.

- [ ] **Step 5: Mount behind an independent Wallet gate**

In `server/app.mjs`, add `/api/portal/coins/wallet` and its descendants to the
same fail-closed protected-Portal namespace matcher used for Commerce. Mount
the Wallet dispatcher before that namespace's console-auth fallback, mirroring
the existing selected Portal Commerce route handling. A selected Wallet route
uses Portal session auth; an unselected/disabled or malformed Wallet namespace
request falls through to console auth rather than becoming public. The mount
must depend on:

```text
platform.userPortalRoutesEnabled === true
platform.coinsWalletEnabled === true
platform.coinsWalletStore.getWalletProjection
platform.coinsWalletStore.listLedgerEntries
platform.userPortalAuth.requireSession
```

Do not require `coinsCommerceEnabled` or the Commerce coordinator.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --test server/tests/platform-coin-wallet-store.test.mjs
node --test server/tests/portal-coin-wallet-routes.test.mjs
node --test server/tests/auth.test.mjs
```

Then commit:

```powershell
git add server/app.mjs server/routes/portal-coin-wallet.mjs server/services/platform/coin-wallet-store.mjs server/tests/auth.test.mjs server/tests/platform-coin-wallet-store.test.mjs server/tests/portal-coin-wallet-routes.test.mjs
git commit -m "feat(control-plane): add Portal Coins wallet read routes"
```

---

### Task 5: Add The Strict Wallet TypeScript Client

**Files:**

- Create: `admin/src/features/user-portal/wallet/api-contract.ts`
- Create: `admin/src/features/user-portal/wallet/wallet-client.ts`
- Create: `admin/src/features/user-portal/wallet/index.ts`
- Create: `admin/src/test/portal-wallet-client.test.ts`
- Modify: `admin/src/features/user-portal/user-portal-client.ts`

- [ ] **Step 1: Add the client RED**

Tests must cover:

- HTTP `UserPortalClient` exposes `wallet`; local client does not;
- exact relative GET paths;
- only `X-Portal-Session` is carried;
- parent `baseUrl` is never used for Wallet and cannot leak session to another
  origin;
- exact 401 console-auth fallback `{ "error": "Unauthorized" }` maps to
  `wallet_unavailable`, while any variation remains fail-closed;
- exact summary and ledger success parsing;
- paired cursor construction;
- ledger rows must be `occurredAt DESC, entryRef DESC`; a non-null next cursor
  must equal the last row and is invalid on an empty page;
- strict rejection of extra keys, prototype objects, unsafe integers,
  non-UTC timestamps, unknown status/category/coin type, malformed error
  bodies, and non-2xx responses;
- one valid and one wrong-formula case for every one of the seven ledger
  categories, including exact nullability, sign, amount, and total;
- a server-confirmed `not_created` zero summary succeeds;
- a network/parser error never returns a zero summary.

Run:

```powershell
npm --prefix admin run test -- src/test/portal-wallet-client.test.ts
```

Expected RED: Wallet modules and subclient do not exist.

- [ ] **Step 2: Define exact contracts**

Export:

```ts
export type PortalWalletStatus =
  | "not_created"
  | "active"
  | "frozen"
  | "closed";

export type PortalWalletSummary = {
  status: PortalWalletStatus;
  version: number;
  balances: {
    paidCoins: number;
    bonusCoins: number;
    rewardCoins: number;
  };
  spendableUnits: number;
  heldUnits: number;
  pendingUnits: number;
};

export type PortalWalletLedgerCategory =
  | "credit"
  | "pending_to_available"
  | "available_to_held"
  | "held_to_available"
  | "held_to_consumed"
  | "held_to_expired"
  | "available_to_expired";

type PortalWalletLedgerCommon = {
  entryRef: string;
  coinType: "paid_coins" | "bonus_coins" | "reward_coins";
  amountUnits: number;
  relatedOrderRef: string | null;
  occurredAt: string;
};

type PortalWalletBucketTransitionCategory =
  Exclude<PortalWalletLedgerCategory, "credit">;

export type PortalWalletLedgerEntry =
  | (PortalWalletLedgerCommon & {
      category: "credit";
      availableDeltaUnits: null;
      pendingDeltaUnits: null;
      heldDeltaUnits: null;
      totalDeltaUnits: number;
    })
  | (PortalWalletLedgerCommon & {
      category: PortalWalletBucketTransitionCategory;
      availableDeltaUnits: number;
      pendingDeltaUnits: number;
      heldDeltaUnits: number;
      totalDeltaUnits: number;
    });

export type PortalWalletClient = {
  getSummary(input: { sessionRef: string }): Promise<PortalWalletSummary>;
  listLedger(input: {
    sessionRef: string;
    limit: number;
    afterOccurredAt?: string;
    afterEntryRef?: string;
  }): Promise<{
    entries: PortalWalletLedgerEntry[];
    nextCursor: {
      afterOccurredAt: string;
      afterEntryRef: string;
    } | null;
  }>;
};

export type PortalWalletErrorCode =
  | "wallet_request_invalid"
  | "wallet_session_invalid"
  | "wallet_unavailable";

export type PortalWalletClientErrorCode =
  | PortalWalletErrorCode
  | "wallet_request_failed";
```

- [ ] **Step 3: Implement fail-closed relative requests**

Export:

```ts
export class PortalWalletClientError extends Error {
  readonly code: PortalWalletClientErrorCode;
  readonly retryable: boolean;
}

export function createPortalWalletClient(
  options: { fetchFn?: typeof fetch } = {}
): PortalWalletClient;
```

Always call `/api/portal/coins/wallet` or its ledger path. Do not accept
`baseUrl`. Implement exact-object and exact-array parsers; do not cast
untrusted JSON to the DTO. Parse the server error wrapper exactly and enforce
the same retryability table as the server. Network, JSON, schema, status/body
mismatch, and unknown error code become
`PortalWalletClientError("wallet_request_failed", true)`.

The one compatibility bridge is the exact legacy console-auth fallback:

```text
HTTP 401 + exact plain object {"error":"Unauthorized"}
  -> PortalWalletClientError("wallet_unavailable", true)
```

This occurs when the HTTP Portal client exists but the independent Wallet
route is disabled and falls through its protected namespace. Do not accept a
different status, key, value, prototype, or extra field. When the Wallet route
is mounted, invalid Portal sessions use the structured
`wallet_session_invalid` error and therefore still return to login.

Add `wallet?: PortalWalletClient` to `UserPortalClient`. Change the concrete
HTTP return type to:

```ts
UserPortalClient & {
  commerce: PortalCoinCommerceClient;
  wallet: PortalWalletClient;
}
```

Local clients remain without Wallet.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm --prefix admin run test -- src/test/portal-wallet-client.test.ts
npm --prefix admin run test -- src/test/portal-coins-commerce-client.test.ts
```

Then commit:

```powershell
git add admin/src/features/user-portal/wallet admin/src/features/user-portal/user-portal-client.ts admin/src/test/portal-wallet-client.test.ts
git commit -m "feat(portal): add strict Coins wallet client"
```

---

### Task 6: Render Authoritative Wallet Summary And Ledger

**Files:**

- Create:
  `admin/src/features/user-portal/wallet/use-portal-wallet-read-model.ts`
- Create:
  `admin/src/features/user-portal/wallet/portal-wallet-panel.tsx`
- Create: `admin/src/test/portal-wallet-panel.test.tsx`
- Modify:
  `admin/src/features/user-portal/portal-commerce-panels.tsx`
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Modify: `admin/src/test/user-portal.test.tsx`
- Modify:
  `admin/src/styles/portal-static-preserve/user-portal-commerce.css`

- [ ] **Step 1: Add panel and stale-session RED tests**

Tests must prove:

- summary states: loading, ready, not-created, unavailable, error, retry;
- ledger states: loading, ready, empty, unavailable, error, retry;
- real paid/bonus/reward values and aggregate held/pending values render;
- a credit row displays an overall credit without inventing a bucket delta;
- six Wallet recharge denominations stay disabled;
- delayed results from an old session/generation cannot update the panel or
  topbar;
- topbar uses authoritative `spendableUnits`;
- unavailable/error leaves topbar `Coins · --`;
- Wallet remains the single topbar entry and is absent from the left nav.

Run:

```powershell
npm --prefix admin run test -- src/test/portal-wallet-panel.test.tsx
npm --prefix admin run test -- src/test/user-portal.test.tsx -t "Wallet"
```

Expected RED: the Wallet panel is still a placeholder and no read model exists.

- [ ] **Step 2: Implement independent shell-owned read state**

Use:

```ts
type ReadState<T> =
  | { phase: "loading" }
  | { phase: "ready"; value: T }
  | { phase: "empty"; value: T }
  | { phase: "unavailable"; retryable: boolean }
  | { phase: "error"; retryable: boolean };
```

The hook takes:

```ts
{
  client: PortalWalletClient | null;
  sessionRef: string | null;
  sessionGeneration: number;
  loadLedger: boolean;
  onSessionInvalid: () => void;
}
```

It returns:

```ts
type PortalWalletReadModel = {
  summary: ReadState<PortalWalletSummary>;
  ledger: ReadState<PortalWalletLedgerEntry[]>;
  nextLedgerCursor: {
    afterOccurredAt: string;
    afterEntryRef: string;
  } | null;
  retrySummary: () => void;
  retryLedger: () => void;
  loadMoreLedger: () => void;
};
```

`UserPortalPage` invokes the hook for every authenticated session so the
topbar summary loads without requiring the user to open Wallet.
`loadLedger` is true only when `activeView === "wallet"`, so activity is not
fetched for unrelated views. Summary and ledger are separate state machines.
Use a first-page size of 25. Capture session and generation before each GET;
ignore every resolution/rejection whose generation no longer matches. Retry
repeats only the corresponding GET, and load-more appends only a cursor-matched
page.

State mapping is exact:

```text
missing client                       -> unavailable, retryable=false
PortalWalletClientError:
  wallet_unavailable                 -> unavailable, retryable=true
  wallet_session_invalid             -> call onSessionInvalid (existing logout)
  wallet_request_invalid             -> error, not retryable
  wallet_request_failed              -> error, retryable
other thrown value                   -> error, retryable
```

Check generation before invoking `onSessionInvalid`, so an old request cannot
log out a newer session.

- [ ] **Step 3: Wire the single shell**

`PortalWalletPanel` is a pure renderer with these props:

```ts
type PortalWalletPanelProps = {
  locale: "zh" | "en";
  model: PortalWalletReadModel;
};
```

In `UserPortalPage`, increment the session generation on hydrate start, session
replacement, and logout. Reset topbar balance to unavailable on generation
change. Derive topbar text directly from a ready/not-created summary; render
`Coins · --` for loading, unavailable, or error. Mount the pure panel only for
the existing `wallet` view.

Remove the exported placeholder `WalletPanel` from
`portal-commerce-panels.tsx`; keep `RechargeDenominationList` reusable and
disabled in Wallet. The top-level Recharge Coins dialog remains a non-mutating
denomination browser; this task does not enable its buttons.

- [ ] **Step 4: Add desktop-scoped styles and verify**

Add only `.portal-v2-shell`-scoped Wallet state/table/retry styles in
`user-portal-commerce.css`. Do not edit media rules or responsive files.

Run:

```powershell
npm --prefix admin run test -- src/test/portal-wallet-client.test.ts
npm --prefix admin run test -- src/test/portal-wallet-panel.test.tsx
npm --prefix admin run test -- src/test/user-portal.test.tsx
npm --prefix admin run build:portal
```

- [ ] **Step 5: Commit**

```powershell
git add admin/src/features/user-portal/wallet admin/src/features/user-portal/portal-commerce-panels.tsx admin/src/features/user-portal/user-portal-page.tsx admin/src/styles/portal-static-preserve/user-portal-commerce.css admin/src/test/portal-wallet-panel.test.tsx admin/src/test/user-portal.test.tsx
git commit -m "feat(portal): render read-only Coins wallet data"
```

---

### Task 7: Add Account-Owned Coins Consumption-Order List Reads

**Files:**

- Modify: `server/services/platform/coin-commerce-store.mjs`
- Modify: `server/state.mjs`
- Modify: `server/routes/portal-coin-commerce.mjs`
- Modify: `server/app.mjs`
- Modify: `server/tests/auth.test.mjs`
- Modify: `server/tests/platform-coin-commerce-store.test.mjs`
- Modify: `server/tests/portal-coin-commerce-routes.test.mjs`
- Modify: `server/tests/state.test.mjs`

- [ ] **Step 1: Add Store RED tests**

Test:

- account isolation;
- `createdAt DESC, orderRef DESC` tie-break ordering;
- `limit + 1` pagination and exact cursor continuation;
- limit 1 and 100 accepted, 0 and 101 rejected;
- cursor fields are both present or both absent;
- invalid timestamp/ref/unknown input key rejected;
- no fulfillment N+1 query;
- read leaves tables unchanged.

Run:

```powershell
node --test server/tests/platform-coin-commerce-store.test.mjs
```

Expected RED: Store has no `listOrders`.

- [ ] **Step 2: Implement bounded Store list**

Add:

```js
listOrders({
  accountId,
  limit,
  afterCreatedAt,
  afterOrderRef
})
```

returns:

```js
{
  orders,
  nextCursor: hasMore
    ? {
        afterCreatedAt: orders.at(-1).createdAt,
        afterOrderRef: orders.at(-1).orderRef
      }
    : null
}
```

Use:

```sql
where orders.account_id = ?
  and (
    ? is null
    or orders.created_at < ?
    or (orders.created_at = ? and orders.order_ref < ?)
  )
order by orders.created_at desc, orders.order_ref desc
limit ?
```

Bind `limit + 1`, retain at most `limit`, and derive `nextCursor` from the last
retained row only when an additional row exists.

Select the fulfillment command field needed by the existing order projection
in the same query, or extract a pure row projector, so list projection performs
no query per row. Add `listOrders` to the strict public Store surface and to
`COIN_COMMERCE_STORE_FIELDS`. Do not add an index or migration.

Update every exact fake Store surface in `state.test.mjs` and the Commerce
namespace boundary fixture in `auth.test.mjs` with a non-mutating `listOrders`
method. Keep the exact-surface assertions strict rather than weakening the
gate.

- [ ] **Step 3: Add route RED tests**

Test:

- exact `GET /api/portal/commerce/orders`;
- account only from session;
- bounded paired cursor and rejection of unknown/repeated query keys;
- account isolation and stable response cursor;
- exact safe `PortalCoinOrder` projection;
- disabled/malformed Store surface does not mount;
- existing POST create and owned detail behavior remains unchanged;
- GET invokes no quote/order/coordinator/wallet mutation.

Run:

```powershell
node --test server/tests/portal-coin-commerce-routes.test.mjs
```

Expected RED: collection GET is not selected.

- [ ] **Step 4: Implement collection GET**

Add collection GET before the existing POST on the same path:

```text
GET /api/portal/commerce/orders
  ?limit=1..100
  [&afterCreatedAt=<UTC ISO>]
  [&afterOrderRef=<safe ref>]
```

Return:

```ts
{
  orders: PortalCoinOrder[];
  nextCursor: {
    afterCreatedAt: string;
    afterOrderRef: string;
  } | null;
}
```

Update `isSelectedCommerceRoute` and the app Store callable gate. Reuse the
existing session middleware and order projector. Do not alter POST semantics.
`limit` is required exactly once; each cursor field is single-valued and
paired; unknown or repeated keys are rejected.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --test server/tests/platform-coin-commerce-store.test.mjs
node --test server/tests/portal-coin-commerce-routes.test.mjs
node --test server/tests/state.test.mjs
node --test server/tests/auth.test.mjs
```

Then commit:

```powershell
git add server/services/platform/coin-commerce-store.mjs server/state.mjs server/routes/portal-coin-commerce.mjs server/app.mjs server/tests/platform-coin-commerce-store.test.mjs server/tests/portal-coin-commerce-routes.test.mjs server/tests/state.test.mjs server/tests/auth.test.mjs
git commit -m "feat(control-plane): list Portal Coins consumption orders"
```

Record the resulting exact SHA in the SDD progress ledger as:

```text
control_plane_split_head=<exact SHA>
```

Tasks 1, 2, 3, 5, 6, 8, 9, and 10 must be committed strictly after this SHA.

- [ ] **Step 6: Close the local control-plane release unit at its exact head**

While the current checkout is still exactly the Task 7 commit, record:

```text
control_plane_base=c3d92ed3c4691f2512e80da3dffcab17e027b928
control_plane_head=<git rev-parse HEAD>
release_unit=control-plane-app
state=source-only
deployment=not_deployed
```

Run at that exact head:

```powershell
node --test server/tests/platform-coin-wallet-store.test.mjs
node --test server/tests/portal-coin-wallet-routes.test.mjs
node --test server/tests/platform-coin-commerce-store.test.mjs
node --test server/tests/portal-coin-commerce-routes.test.mjs
node --test server/tests/state.test.mjs
node --test server/tests/auth.test.mjs
npm test
npm run docs:authority:check
git diff --check c3d92ed3c4691f2512e80da3dffcab17e027b928...HEAD
git diff --name-only c3d92ed3c4691f2512e80da3dffcab17e027b928...HEAD
```

The name-only output may contain the approved design/plan docs and
`server/**`; it must not contain `admin/**`, migrations, provider code,
deployment files, or generated artifacts. Save command results and the exact
head in the SDD ledger before starting Task 1.

---

### Task 8: Add The Strict Coins Consumption-Order List Client

**Files:**

- Modify:
  `admin/src/features/user-portal/commerce/api-contract.ts`
- Modify:
  `admin/src/features/user-portal/commerce/commerce-client.ts`
- Modify:
  `admin/src/test/portal-coins-commerce-client.test.ts`

- [ ] **Step 1: Add client RED tests**

Test exact GET URL/header, no account parameter, paired cursor, deterministic
response order preservation, null cursor, and fail-closed rejection of extra
keys, malformed cursor, unknown order/payment/fulfillment state, unsafe
integer, bad timestamp, or non-2xx response. For this collection GET only,
assert exact `401 + {"error":"Unauthorized"}` maps to the existing typed
`commerce_unavailable`; any variation is `commerce_request_failed`. A
structured `commerce_session_invalid` must remain distinguishable.

Run:

```powershell
npm --prefix admin run test -- src/test/portal-coins-commerce-client.test.ts
```

Expected RED: client has no `listOrders`.

- [ ] **Step 2: Extend the exact client contract**

Add:

```ts
export type PortalCoinOrderPage = {
  orders: PortalCoinOrder[];
  nextCursor: {
    afterCreatedAt: string;
    afterOrderRef: string;
  } | null;
};

listOrders(input: {
  sessionRef: string;
  limit: number;
  afterCreatedAt?: string;
  afterOrderRef?: string;
}): Promise<PortalCoinOrderPage>;
```

Validate caller input before constructing the URL. Reuse the existing strict
single-order projector for each row, then strictly parse the page object and
cursor. Reject a non-null cursor on an empty page, a cursor that does not match
the final returned row, or rows that violate
`createdAt DESC, orderRef DESC`. Use the existing relative GET/session header
helper.

The collection GET may receive the console-auth fallback when Commerce is
disabled even though the HTTP client object exists. Add a request option used
only by `listOrders` that maps exactly:

```text
HTTP 401 + exact plain object {"error":"Unauthorized"}
  -> PortalCoinCommerceClientError("commerce_unavailable", true)
```

Do not change fallback handling for catalog, detail, checkout, create, or
cancel requests. The mounted route's structured
`commerce_session_invalid` continues to drive Portal logout.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm --prefix admin run test -- src/test/portal-coins-commerce-client.test.ts
npm --prefix admin run test -- src/test/portal-coins-purchase-flow.test.tsx
```

Then commit:

```powershell
git add admin/src/features/user-portal/commerce/api-contract.ts admin/src/features/user-portal/commerce/commerce-client.ts admin/src/test/portal-coins-commerce-client.test.ts
git commit -m "feat(portal): add strict Coins order list client"
```

---

### Task 9: Compose The Domain-Separated Orders View

**Files:**

- Create:
  `admin/src/features/user-portal/orders/portal-orders-panel.tsx`
- Create: `admin/src/test/portal-orders-panel.test.tsx`
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Modify: `admin/src/test/user-portal.test.tsx`
- Modify:
  `admin/src/styles/portal-static-preserve/user-portal-commerce.css`

- [ ] **Step 1: Add domain-separation RED tests**

Tests must prove:

- four controls: All, Coins Consumption Orders, Coins Recharge Orders,
  Historical Orders, in Chinese and English;
- All renders three labeled domain sections rather than a fake global sort;
- Coins consumption loads real account-owned rows and can open existing safe
  detail;
- ready-empty is distinct from unavailable/error and supports retry;
- stale old-session list/detail results are ignored;
- current-generation `commerce_session_invalid` returns through the existing
  logout/auth journey; an old request cannot log out a newer session;
- `commerce_unavailable` renders unavailable, while typed retryability controls
  whether an error shows Retry;
- Coins recharge section says `充值订单数据源尚未接入`, contains no fake row or
  zero count, and makes no recharge/payment/global fetch request;
- Historical Orders reuses the existing `SubscriptionManager` behavior;
- opening a legacy payment detail removes the Orders filter/Coins sections
  until the user returns, preserving the current full-detail presentation;
- Personal Center contains no order table or payment detail.

Run:

```powershell
npm --prefix admin run test -- src/test/portal-orders-panel.test.tsx
npm --prefix admin run test -- src/test/user-portal.test.tsx -t "Orders"
```

Expected RED: there is no domain-separated Orders panel.

- [ ] **Step 2: Implement exact panel contract**

Use:

```ts
type PortalOrdersFilter =
  | "all"
  | "coins_consumption"
  | "coins_recharge"
  | "historical";

type PortalOrdersPanelProps = {
  locale: "zh" | "en";
  commerceClient: PortalCoinCommerceClient | null;
  sessionRef: string | null;
  sessionGeneration: number;
  onSessionInvalid: () => void;
  renderHistoricalOrders: () => ReactNode;
};
```

The panel owns Coins list/detail read state and filter selection. Fetch at most
25 rows initially and use explicit `Load more` pagination. Capture generation
for list and detail reads. Do not reuse `sessionStorage` purchase recovery as
history.

Map read failures exactly:

```text
missing commerce client              -> unavailable, retryable=false
PortalCoinCommerceClientError:
  commerce_unavailable               -> unavailable, retryable=true
  commerce_session_invalid           -> call onSessionInvalid
  any other typed code               -> error using error.retryable
other thrown value                   -> error, retryable=true
```

Check generation before calling `onSessionInvalid` or committing list/detail
state.

`all` renders the sections in this order while no legacy payment detail is
active:

```text
Coins 消费订单
Coins 充值订单
历史订单
```

The recharge section is a static unavailable state and calls no client.

- [ ] **Step 3: Wire legacy history without changing semantics**

In `UserPortalPage`, keep the active legacy payment-detail branch above the
new panel. When `activeView === "orders" && paymentFlowActive`, render the
existing `SubscriptionManager` directly with its current props. Otherwise,
render `PortalOrdersPanel` and supply that same manager through
`renderHistoricalOrders`.

When the nested historical manager calls the existing `openPaymentOrder`,
`activePaymentOrderRef` makes `paymentFlowActive` true and the shell
short-circuits away the Orders filters and Coins sections. Returning clears the
active reference and restores the panel. Keep legacy filters, detail, payment
polling, and return behavior unchanged.

Add only `.portal-v2-shell`-scoped desktop styles. Do not edit mobile media
rules.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm --prefix admin run test -- src/test/portal-orders-panel.test.tsx
npm --prefix admin run test -- src/test/user-portal.test.tsx
npm --prefix admin run test -- src/test/portal-coins-commerce-client.test.ts
npm --prefix admin run build:portal
```

Then commit:

```powershell
git add admin/src/features/user-portal/orders admin/src/features/user-portal/user-portal-page.tsx admin/src/styles/portal-static-preserve/user-portal-commerce.css admin/src/test/portal-orders-panel.test.tsx admin/src/test/user-portal.test.tsx
git commit -m "feat(portal): compose read-only Orders workspace"
```

---

### Task 10: Align Authority Docs And Run Full Verification

**Files:**

- Modify:
  `docs/superpowers/specs/2026-07-27-portal-wallet-orders-readonly-design.md`
- Modify: `docs/USER_PORTAL_FLOW.md`
- Modify only if its facts are directly changed:
  `docs/PROJECT_CONTEXT.md`
- Inspect: `docs/CURRENT_RELEASE_STATE.md`
- Inspect: `RELEASE_MANIFEST.md`
- Inspect: `docs/PROJECT_CONTEXT.md`

- [ ] **Step 1: Update source-only documentation facts**

Set the design implementation state to `implemented / source-only /
not_deployed` only after Tasks 1–9 are green. Update `USER_PORTAL_FLOW.md` with:

- exact desktop nav order;
- topbar-only Wallet entry;
- independent Wallet summary/ledger reads;
- domain-separated Orders filters;
- recharge orders explicitly unavailable;
- Personal Center Profile/Security separation;
- mobile deferred;
- no production activation claim.

Do not edit canonical release state to imply deployment or feature enablement.
Only modify `PROJECT_CONTEXT.md` if the completed source boundary changes a
long-term project fact; otherwise leave it unchanged.

- [ ] **Step 2: Commit the completed source-only documentation**

Run:

```powershell
npm run docs:authority:check
git diff --check
```

Then commit:

```powershell
git add docs/superpowers/specs/2026-07-27-portal-wallet-orders-readonly-design.md docs/USER_PORTAL_FLOW.md
git commit -m "docs(portal): record wallet and Orders source integration"
```

If `PROJECT_CONTEXT.md` was correctly changed in Step 1, include it in the
same commit; otherwise do not stage it. The implementation plan was committed
before SDD execution and must already be tracked.

- [ ] **Step 3: Run focused server verification**

```powershell
node --test server/tests/platform-coin-wallet-store.test.mjs
node --test server/tests/portal-coin-wallet-routes.test.mjs
node --test server/tests/platform-coin-commerce-store.test.mjs
node --test server/tests/portal-coin-commerce-routes.test.mjs
```

- [ ] **Step 4: Run focused Portal verification**

```powershell
npm --prefix admin run test -- src/test/portal-wallet-client.test.ts
npm --prefix admin run test -- src/test/portal-wallet-panel.test.tsx
npm --prefix admin run test -- src/test/portal-coins-commerce-client.test.ts
npm --prefix admin run test -- src/test/portal-orders-panel.test.tsx
npm --prefix admin run test -- src/test/user-portal.test.tsx
```

- [ ] **Step 5: Run the complete Portal-stack matrix at its exact head**

Before `npm test`, check port 3457 without stopping an unknown process:

```powershell
$validationListener = Get-NetTCPConnection -State Listen -LocalPort 3457 -ErrorAction SilentlyContinue
if ($validationListener) {
  $validationPid = $validationListener.OwningProcess
  $validationProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $validationPid"
  $expectedScript = 'start-local-coin-commerce-validation.mjs'
  $expectedWorktree = 'D:\Projects\proxy-gateway-minimal\.worktrees\portal-wallet-orders-ui'
  if (
    $validationProcess.CommandLine -notlike "*$expectedScript*"
    -or $validationProcess.CommandLine -notlike "*$expectedWorktree*"
  ) {
    throw "Port 3457 is owned by an unapproved process; stop and report."
  }
  Stop-Process -Id $validationPid
}
if (Get-NetTCPConnection -State Listen -LocalPort 3457 -ErrorAction SilentlyContinue) {
  throw "Owned validation listener did not stop."
}
```

In the current run the previously identified listener has already been
stopped, so the expected path is a read-only no-listener result. The identity
guard remains mandatory if it reappears.

Read `control_plane_split_head` from the SDD ledger and verify it is an
ancestor of `HEAD`. The following deterministic readback must equal the ledger
value:

```powershell
$controlPlaneSplitHead = (
  git log --format=%H --fixed-strings --grep="feat(control-plane): list Portal Coins consumption orders" -n 1
).Trim()
if (-not $controlPlaneSplitHead) {
  throw "Control-plane split commit is missing."
}
git merge-base --is-ancestor $controlPlaneSplitHead HEAD
if ($LASTEXITCODE -ne 0) {
  throw "Control-plane split is not an ancestor of the Portal head."
}
```

Record the exact resolved value:

```text
portal_base=<resolved controlPlaneSplitHead>
portal_head=<git rev-parse HEAD>
release_unit=portal-static
frontend_surface=portal
state=source-only
deployment=not_deployed
```

After the port-ownership and split readbacks, run:

```powershell
npm run admin:test
npm run admin:build
npm run admin:portal:build
npm run admin:portal:verify
npm test
npm run docs:authority:check
git merge-base --is-ancestor $controlPlaneSplitHead HEAD
git diff --check "$controlPlaneSplitHead...HEAD"
git diff --name-only "$controlPlaneSplitHead...HEAD"
```

Expected:

- all test/build/verify commands exit 0;
- `admin:portal:verify` validates the real Portal artifact boundary;
- no production, provider, or schema command runs;
- no generated `admin/dist*` output is staged.

- [ ] **Step 6: Inspect scope and secrets**

Run:

```powershell
git status --short --branch
git diff --stat c3d92ed3c4691f2512e80da3dffcab17e027b928...HEAD
git diff --name-only c3d92ed3c4691f2512e80da3dffcab17e027b928...HEAD
git log --oneline c3d92ed3c4691f2512e80da3dffcab17e027b928..HEAD
```

Confirm no mobile/responsive file, migration, schema, provider, Admin,
deployment, generated artifact, credential, token, subscription URL, account
data, or user data entered the diff.

Record that the shared navigation DOM and base `.portal-v2-shell` component
styles changed, so mobile behavior is affected but was not validated. This is
an explicit deferred risk, not evidence of mobile compatibility.

Also inspect the Portal release-unit-only range:

```powershell
git diff --stat "$controlPlaneSplitHead...HEAD"
git diff --name-only "$controlPlaneSplitHead...HEAD"
```

That range may contain `admin/**` and approved docs only; it must not contain
`server/**`, migrations, provider code, deployment files, or generated
artifacts.

- [ ] **Step 7: Stop before external delivery**

Record:

```text
PR 1:
  release_unit: control-plane-app
  state: source-only
  deployment: not_deployed

PR 2:
  release_unit: portal-static
  frontend_surface: portal
  state: source-only
  deployment: not_deployed
  mobile: deferred
```

Do not push or open either PR. First reconcile the 42-commit local stack with
the intended GitHub base, split at the recorded control-plane commit, and
rerun Task 7 Step 6's control-plane matrix on the reconciled PR1 exact head and
Task 10 Steps 3–6's Portal matrix on the reconciled PR2 exact head. Record each reconciled
base SHA, head SHA, command, exit code, and diff range before either PR can be
Ready.
