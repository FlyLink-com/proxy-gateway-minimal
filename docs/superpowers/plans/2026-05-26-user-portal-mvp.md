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

### Task 3: Static Company Site And Dynamic Entry Boundary

**Files:**
- Create: `admin/src/features/company-site/company-site-page.tsx`
- Test: `admin/src/test/company-site.test.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/styles.css`
- Modify: `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
- Modify: `docs/PROJECT_CONTEXT.md`
- Modify: `docs/units/SUBSCRIPTION_ACCESS_UNIT.md`

- [x] **Step 1: Write the failing public-site isolation test**

```tsx
window.location.hash = "#/site";
render(<App />);
expect(screen.getByRole("heading", { name: "GlobalCircle Access" })).toBeTruthy();
expect(container.querySelectorAll('a[href*="portal"]').length).toBe(0);
```

- [x] **Step 2: Verify RED**

Run: `npm run test --prefix admin -- src/test/company-site.test.tsx`

Expected: FAIL until `#/site` exists.

- [x] **Step 3: Implement the static company site**

Add a `#/site` route for repository preview. The page is a brand/business
website only: it can show service capabilities and a contact/opening CTA, but
must not link to `#/portal`, `/use`, subscription artifacts, Admin APIs, or
login-after-entry URLs.

- [x] **Step 4: Document dynamic portal entrance boundary**

Record the future operator-issued dynamic portal entry shape. It may later be
backed by server-side YAML or another controlled config source, but this PR does
not implement runtime YAML, DNS, Nginx, Aliyun deployment, auth, or public
traffic changes.

- [x] **Step 5: Run verification**

Run:

```powershell
npm run test --prefix admin -- src/test/company-site.test.tsx
npm run admin:test
npm run admin:build
npm test
npm run project-state:check
git diff --check origin/master...HEAD
```

Expected: all pass.

### Task 5: Product Effect And Scenario Motion Pass

**Files:**
- Modify: `admin/src/features/company-site/company-site-page.tsx`
- Test: `admin/src/test/company-site.test.tsx`
- Modify: `admin/src/styles.css`

- [x] **Step 1: Write the failing scenario/product-effect test**

```tsx
window.location.hash = "#/site";
render(<App />);
expect(screen.getByRole("heading", { name: "覆盖更多常见订阅接入场景" })).toBeTruthy();
expect(screen.getByText("个人多端")).toBeTruthy();
expect(screen.getByText("一处开通，多端导入")).toBeTruthy();
```

- [x] **Step 2: Verify RED**

Run: `npm run test --prefix admin -- src/test/company-site.test.tsx`

Expected: FAIL until the company site presents customer scenarios and product
outcomes.

- [x] **Step 3: Implement visible product scenarios and CSS motion**

Add a public scenarios section for personal multi-device use, small teams,
mobile work, and long-term maintenance. Add restrained CSS-only motion to the
hero visual, outcome flow, buttons, and cards, with `prefers-reduced-motion`
fallback. Keep the public site free of internal architecture terms and portal
links.

- [x] **Step 4: Run verification**

Run:

```powershell
npm run test --prefix admin -- src/test/company-site.test.tsx
npm run admin:test
npm run admin:build
npm test
npm run project-state:check
git diff --check origin/master...HEAD
```

Expected: all pass.

### Task 4: Public Contact Collection

**Files:**
- Modify: `admin/src/features/company-site/company-site-page.tsx`
- Test: `admin/src/test/company-site.test.tsx`
- Modify: `admin/src/styles.css`

- [x] **Step 1: Write the failing public contact test**

```tsx
window.location.hash = "#/site";
render(<App />);
expect(screen.getByRole("link", { name: "gccltd.co@outlook.com" })).toBeTruthy();
expect(screen.getByLabelText("称呼")).toBeTruthy();
expect(screen.getByLabelText("联系方式")).toBeTruthy();
expect(screen.getByLabelText("需求说明")).toBeTruthy();
```

- [x] **Step 2: Verify RED**

Run: `npm run test --prefix admin -- src/test/company-site.test.tsx`

Expected: FAIL until the public site exposes a contact email and contact form.

- [x] **Step 3: Implement frontend-only collection**

Add a public contact block with the company mailbox and a `mailto:` form. The
form calls the user's local mail client and does not add backend persistence,
public auth, portal entry links, runtime deployment, DNS, Nginx, or production
traffic changes.

- [x] **Step 4: Run verification**

Run:

```powershell
npm run test --prefix admin -- src/test/company-site.test.tsx
npm run admin:test
npm run admin:build
npm test
npm run project-state:check
git diff --check origin/master...HEAD
```

Expected: all pass.

### Task 6: Geek AI Company Site And Domain-Pool Planning

**Files:**
- Modify: `admin/src/features/company-site/company-site-page.tsx`
- Test: `admin/src/test/company-site.test.tsx`
- Modify: `admin/src/styles.css`
- Modify: `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
- Modify: `docs/units/SUBSCRIPTION_ACCESS_UNIT.md`

- [x] **Step 1: Write the failing AI/geek-positioning test**

```tsx
window.location.hash = "#/site";
render(<App />);
expect(screen.getByRole("heading", { name: "GlobalCircle AI" })).toBeTruthy();
expect(screen.getByText(/AI Agent 研发与运营自动化实验室/)).toBeTruthy();
expect(screen.getByText("主流媒体广告投放")).toBeTruthy();
expect(screen.getByText("前沿产品研究")).toBeTruthy();
```

- [x] **Step 2: Verify RED**

Run: `npm run test --prefix admin -- src/test/company-site.test.tsx`

Observed: FAIL against the previous subscription-access site copy.

- [x] **Step 3: Implement AI / operations-growth company site**

Reposition the public site as a modern geek-style AI and automation research
company surface. Replace the old subscription-service story with Agent Studio,
API Sandbox, private knowledge access, operations automation, mainstream-media
advertising cooperation, frontier product research, multi-domain landing-page
planning, and qualified business lead collection.

- [x] **Step 4: Record domain-pool planning boundary**

Use Aliyun DNS CLI read-only inventory to record the eight observed planning
domains. The record is for public site / campaign landing-page design only; it
does not authorize DNS changes, Aliyun deployment, portal exposure, production
traffic, or customer-specific access material on the public site.

- [x] **Step 5: Run verification**

Run:

```powershell
npm run test --prefix admin -- src/test/company-site.test.tsx
npm run admin:test
npm run admin:build
npm test
npm run project-state:check
git diff --check origin/master...HEAD
```

Expected: all pass.
