# User Portal MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-only customer portal MVP for registration-style subscription creation and distribution preview.

**Architecture:** Keep the existing Admin dashboard as the operator surface. Add a separate `#/portal` route in the same Vite app that reuses the private Admin API client for controlled subscription creation, with no public auth model or production deployment change.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, existing `AdminApiClient`.

---

### Task 1: User Portal Route And Flow

**Files:**
- Create: `admin/src/features/user-portal/user-portal-page.tsx`
- Test: `admin/src/test/user-portal.test.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/styles.css`

- [x] **Step 1: Write the failing route and flow tests**

```tsx
render(<App />);
fireEvent.click(screen.getByRole("link", { name: /open user portal/i }));
expect(screen.getByRole("heading", { name: /create your subscription/i })).toBeTruthy();
```

```tsx
render(<UserPortalPage apiClient={client} />);
fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
fireEvent.click(screen.getByRole("button", { name: /generate subscription/i }));
expect(await screen.findByText("Subscription ready")).toBeTruthy();
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test --prefix admin -- src/test/user-portal.test.tsx`

Expected: FAIL because `UserPortalPage` and portal routing do not exist.

- [x] **Step 3: Implement minimal portal**

Create `UserPortalPage` with plan selection, email/display name fields, duration selection, client target selection, subscription generation, visible-once URL result, copy action, and distribution next-action cards.

- [x] **Step 4: Wire separate app route**

Use `window.location.hash === "#/portal"` to render the portal outside `AdminLayout`. Keep Admin navigation unchanged: Overview, Subscriptions, Nodes.

- [x] **Step 5: Run verification**

Run:

```powershell
npm run test --prefix admin -- src/test/user-portal.test.tsx
npm run admin:test
npm run admin:build
npm test
npm run project-state:check
git diff --check origin/master...HEAD
```

Expected: all pass.

### Task 2: Documentation Alignment

**Files:**
- Modify: `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`

- [x] **Step 1: Update repository implementation status**

Record that the repository now has a user portal MVP shell for controlled subscription onboarding, while public registration, public auth, Aliyun deployment, DNS, Nginx, production traffic, and runtime promotion remain unapproved.

- [x] **Step 2: Re-run diff check**

Run: `git diff --check origin/master...HEAD`

Expected: PASS.
