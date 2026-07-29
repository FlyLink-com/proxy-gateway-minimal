# Portal Commerce Layout V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Marketplace, Coins wallet, and referral-reward layout to the
verified production Portal shell without enabling any business action.

**Architecture:** `UserPortalPage` remains the only shell and navigation
router. A new locale-only presentational module owns the three layout panels,
and a Portal-boundary CSS module owns their theme and responsive styling. No
panel receives a Portal client or action callback.

**Tech Stack:** React 19, TypeScript, Lucide React, Vitest, Testing Library,
Vite, existing Portal CSS boundary.

## Global Constraints

- Base commit is exactly `cb69e18071c108de13e6cdc63037f2d251873298`.
- Use `admin/portal/index.html`, `admin/src/portal-main.tsx`,
  `admin/src/features/user-portal/user-portal-page.tsx`,
  `admin/src/portal-static-preserve.css`, and `admin/dist-portal`.
- Do not use preview, fixture, mock, demo, `App.tsx`, `styles.css`, `dist`, or
  `dist-site` as Portal inputs.
- Do not create a second shell, parallel navigation, commerce workspace, or
  top-level payment log.
- Do not add HTTP, wallet, payment, quote, order, referral, ledger, or
  fulfillment behavior.
- Keep the existing direct `购买套餐` flow unchanged.
- Use test-first red-green cycles.
- Do not commit, push, create a PR, deploy, or switch production without
  separate user authorization.

---

### Task 1: Lock The Portal Information Architecture In Failing Tests

**Files:**

- Modify: `admin/src/test/user-portal.test.tsx`

**Interfaces:**

- Consumes: existing `portalClient()`, `enterPortal()`, and rendered
  `UserPortalPage`.
- Produces: behavioral contracts for the shared navigation, wallet entry, six
  recharge denominations, and disabled referral/catalog actions.

- [ ] **Step 1: Add a failing shared-navigation test**

Add assertions equivalent to:

```tsx
const portalNav = await enterPortal();
expect(within(portalNav).getByRole("button", { name: "商城" })).not.toBeNull();
expect(within(portalNav).getByRole("button", { name: "推荐奖励" })).not.toBeNull();
expect(within(portalNav).queryByRole("button", { name: "Coins 支付" })).toBeNull();
expect(screen.getByRole("button", { name: "打开 Coins 钱包，余额尚未接入" })).not.toBeNull();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/user-portal.test.tsx -t "adds commerce entries to the existing Portal shell"
} finally {
  Pop-Location
}
```

Expected: fail because `商城`, `推荐奖励`, and the Coins wallet entry do not
exist.

- [ ] **Step 3: Add failing wallet and referral tests**

The wallet test clicks the top-bar entry and asserts all six values:

```tsx
for (const amount of [10, 30, 50, 100, 200, 300]) {
  expect(screen.getByText(`${amount} Coins`)).not.toBeNull();
}
screen.getAllByRole("button", { name: /充值暂未开放/ }).forEach((button) => {
  expect(button).toBeDisabled();
});
```

The referral test asserts one-link ownership, placeholder metrics, disabled
creation, and absence of withdrawal/transfer/Admin actions.

- [ ] **Step 4: Run both new tests and verify RED**

Run the two exact test names with Vitest `-t`. Expected: both fail because the
views do not exist.

### Task 2: Add Locale-Only Commerce Panels

**Files:**

- Create:
  `admin/src/features/user-portal/portal-commerce-panels.tsx`
- Test: `admin/src/test/user-portal.test.tsx`

**Interfaces:**

- Consumes:

```ts
export type PortalCommerceLocale = "zh" | "en";
```

- Produces:

```ts
export function MarketplacePanel(props: { locale: PortalCommerceLocale }): JSX.Element;
export function WalletPanel(props: { locale: PortalCommerceLocale }): JSX.Element;
export function ReferralRewardsPanel(props: { locale: PortalCommerceLocale }): JSX.Element;
```

The module must not import `UserPortalClient` or accept action callbacks.

- [ ] **Step 1: Implement the minimal presentational panels**

Use static category and denomination arrays. Render `--` for every balance or
metric. Render real disabled buttons for purchase, recharge, and referral-link
creation.

- [ ] **Step 2: Run the panel-related tests**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/user-portal.test.tsx -t "wallet|referral|commerce"
} finally {
  Pop-Location
}
```

Expected: the new view tests still fail because the shell does not route to the
panels; TypeScript compilation must not fail.

### Task 3: Extend The Existing Portal Shell

**Files:**

- Modify:
  `admin/src/features/user-portal/user-portal-page.tsx`
- Test: `admin/src/test/user-portal.test.tsx`

**Interfaces:**

- Extend the local view union:

```ts
type PortalView =
  | "dashboard"
  | "usage"
  | "start"
  | "profile"
  | "support"
  | "marketplace"
  | "wallet"
  | "referrals";
```

- [ ] **Step 1: Add `marketplace` and `referrals` to the existing nav list**

Use Lucide icons already available from `lucide-react`. Do not add a nav item
for wallet or Coins payment.

- [ ] **Step 2: Add localized view copy**

Add Chinese and English labels/descriptions for the three views to
`localizedPortalViewCopy`.

- [ ] **Step 3: Add the top-bar wallet entry**

Render a native button with accessible label:

```text
打开 Coins 钱包，余额尚未接入
```

Its visible value is `Coins · --`. Its only action is
`navigatePortalView("wallet")`.

- [ ] **Step 4: Render the three panels under the existing main section**

Add conditional rendering beside the current dashboard, usage, start, support,
and profile branches. Do not change `startNewOrder` or payment-flow logic.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run all new test names, then the full `user-portal.test.tsx` file. Expected: all
pass with no warnings.

### Task 4: Add Theme And Responsive Styling Through The Portal Boundary

**Files:**

- Create:
  `admin/src/styles/portal-static-preserve/user-portal-commerce.css`
- Modify: `admin/src/portal-static-preserve.css`
- Modify: `scripts/verify-portal-build.mjs`
- Test: `admin/src/test/user-portal.test.tsx`
- Test: `server/tests/portal-static-build-verifier.test.mjs`

**Interfaces:**

- The stylesheet owns only `.portal-commerce-*` and
  `.portal-coins-wallet-entry` selectors.
- `portal-static-preserve.css` imports it after
  `user-portal-desktop.css`.

- [ ] **Step 1: Add a failing generated-artifact contract test**

Add a Portal verifier test whose generated fixture contains the existing
runtime markers but omits `portal-commerce-layout` and
`portal-coins-wallet-entry`. Assert that verification rejects the fixture with
`portal commerce layout marker missing`. Run the focused Node test and verify
RED because the verifier does not enforce the new artifact contract.

- [ ] **Step 2: Implement dark-theme layout styles**

Style page headers, category tabs, catalog cards, wallet summary, denomination
grid, reward states, placeholder metrics, and disabled controls using the
existing Portal spacing and color grammar.

- [ ] **Step 3: Implement light-theme selectors**

Scope overrides beneath:

```css
.portal-v2-shell[data-portal-theme="light"] .portal-commerce-*
```

Preserve readable contrast and the current cyan accent.

- [ ] **Step 4: Add responsive rules**

At existing mobile breakpoints, collapse grids to one column and keep the
top-bar wallet entry reachable without adding another navigation component.

- [ ] **Step 5: Import through the Portal stylesheet boundary**

Add exactly:

```css
@import "./styles/portal-static-preserve/user-portal-commerce.css";
```

- [ ] **Step 6: Enforce commerce markers in the generated Portal artifact**

Extend `verifyPortalBuildDirectory` to require
`portal-commerce-layout` and `portal-coins-wallet-entry` across generated JS
and CSS content. Update the valid test fixture and returned safety summary with:

```js
hasCommerceLayoutContract: true
```

- [ ] **Step 7: Run the verifier and focused Portal tests**

Expected: GREEN.

### Task 5: Verify The Complete Source-Only Change

**Files:**

- Review all files changed from `origin/master`.

**Interfaces:**

- Produces verification evidence only; no deployment or Git publication.

- [ ] **Step 1: Review the diff for prohibited inputs and business calls**

Run:

```powershell
git diff --name-only origin/master...HEAD
git diff --check origin/master...HEAD
rg -n "fetch\\(|createHttpUserPortalClient|createLocalUserPortalClient|checkout|capture|fulfill" admin/src/features/user-portal/portal-commerce-panels.tsx
```

The new panel module must have no matches for business calls.

- [ ] **Step 2: Run focused and full frontend validation**

```powershell
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
```

- [ ] **Step 3: Run the repository validation required for a Portal UI PR**

```powershell
npm test
git diff --check origin/master...HEAD
```

- [ ] **Step 4: Perform rendered visual QA**

Run the real Portal build in a local validation environment with a non-
production session fixture only for rendering. Verify desktop and mobile,
Chinese and English, light and dark themes. The fixture is visual-test input
only and must not become a production source or artifact.

- [ ] **Step 5: Report without publishing**

Report changed files, red-green evidence, validation results, visual findings,
and remaining backend gates. Do not stage, commit, push, open a PR, deploy, or
switch production.
