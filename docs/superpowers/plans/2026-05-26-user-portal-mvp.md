# User Portal MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-only customer portal MVP for registration-style subscription creation and distribution preview.

**Correction note:** A follow-up UI alignment changed the reference from the
EqualDCDN marketing homepage to the actual EqualDCDN `/use/` user interface.
The repository portal should therefore behave like a small user dashboard:
centered login/register shell first, then dashboard navigation for package
status, subscription management, start-using instructions, app downloads, usage
steps, support, profile, and safety checklist. It must not be treated as a
public auth/payment implementation.

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
expect(await screen.findByRole("heading", { name: "Log in" })).toBeTruthy();
expect(screen.getByLabelText("邮箱")).toBeTruthy();
```

```tsx
render(<UserPortalPage apiClient={client} />);
fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "user@example.com" } });
fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password" } });
fireEvent.click(screen.getByRole("button", { name: "登录" }));
fireEvent.click(screen.getByRole("button", { name: "订阅管理" }));
fireEvent.click(screen.getByRole("button", { name: "生成订阅" }));
expect(await screen.findByText("订阅链接")).toBeTruthy();
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test --prefix admin -- src/test/user-portal.test.tsx`

Expected: FAIL until the portal uses the `/use/` auth/dashboard structure.

- [x] **Step 3: Implement minimal portal**

Create `UserPortalPage` with an EqualDCDN `/use/`-style auth card,
login/signup toggle, dashboard sidebar, package status, subscription manager,
subscription-link distribution cards, app downloads, usage steps, support
placeholder, profile panel, and safety checklist.

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
