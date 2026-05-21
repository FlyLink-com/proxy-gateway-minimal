# Admin Console Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first subscription-management admin shell with mock data, using `satnaing/shadcn-admin` as the visual/layout reference without replacing the existing backend.

**Architecture:** Add a separate `admin/` Vite React TypeScript app. Keep the existing Express/static console untouched for this branch except root package scripts and documentation. The admin shell owns navigation, mock subscription workflows, and a small mock API boundary that later backend branches can replace.

**Tech Stack:** Vite, React, TypeScript, Tailwind CSS, shadcn/ui, Radix UI components through shadcn, lucide-react, sonner, existing Node test suite.

---

## Branch Context

Implement this plan after `plan/subscription-admin` is merged to `master`.

Start from a clean mainline:

```powershell
cd C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal
git switch master
git pull --ff-only origin master
git switch -c feat/admin-console-shell
```

Expected:

```text
Switched to a new branch 'feat/admin-console-shell'
```

## Template Reference

This branch must use `satnaing/shadcn-admin` as the shell reference. Do not build the management UI as a continuation of the legacy `public/index.html` page.

Fetch the reference into a temporary directory before implementation:

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7897'
$env:HTTPS_PROXY='http://127.0.0.1:7897'
$env:ALL_PROXY='socks5://127.0.0.1:7897'
$ref = Join-Path $env:TEMP 'shadcn-admin-ref'
if (Test-Path $ref) { Remove-Item -LiteralPath $ref -Recurse -Force }
git clone --depth 1 https://github.com/satnaing/shadcn-admin.git $ref
```

Reference files to inspect and adapt:

```text
src/components/layout/app-sidebar.tsx
src/components/layout/authenticated-layout.tsx
src/components/layout/header.tsx
src/components/layout/main.tsx
src/components/layout/nav-group.tsx
src/components/layout/top-nav.tsx
src/components/layout/data/sidebar-data.ts
src/components/ui/
src/components/data-table/
src/components/command-menu.tsx
src/components/theme-switch.tsx
src/styles/
components.json
package.json
LICENSE
```

Copy/adapt only the dashboard shell, layout ideas, UI primitives, and data-table patterns needed by this project. Remove or avoid Clerk pages, demo chat/apps/tasks pages, auth flows, and unrelated branding. Include MIT attribution in `admin/NOTICE.md` if any source file is copied with more than trivial changes.

## File Structure

Create:

- `admin/package.json`: frontend app scripts and dependencies.
- `admin/index.html`: Vite entry document.
- `admin/vite.config.ts`: Vite configuration.
- `admin/tsconfig.json`: TypeScript configuration.
- `admin/src/main.tsx`: React root render.
- `admin/src/App.tsx`: route-less shell and page selection state.
- `admin/src/styles.css`: Tailwind/shadcn global CSS.
- `admin/src/lib/utils.ts`: `cn()` helper for shadcn components.
- `admin/src/lib/clipboard.ts`: copy helper.
- `admin/src/app/navigation.ts`: nav items and page identifiers.
- `admin/src/components/layout/admin-layout.tsx`: shell composition.
- `admin/src/components/layout/app-sidebar.tsx`: sidebar navigation.
- `admin/src/components/layout/top-bar.tsx`: page title, search, theme action.
- `admin/src/components/status-badge.tsx`: subscription status badge.
- `admin/src/features/subscriptions/types.ts`: subscription types.
- `admin/src/features/subscriptions/mock-data.ts`: deterministic mock subscriptions and nodes.
- `admin/src/features/subscriptions/mock-client.ts`: mock CRUD-like operations.
- `admin/src/features/subscriptions/subscriptions-page.tsx`: main tenant table and actions.
- `admin/src/features/subscriptions/create-subscription-dialog.tsx`: create flow.
- `admin/src/features/subscriptions/renew-subscription-dialog.tsx`: renew flow.
- `admin/src/features/subscriptions/reset-token-dialog.tsx`: reset-token flow.
- `admin/src/pages/overview-page.tsx`: dashboard summary.
- `admin/src/pages/nodes-page.tsx`: read-only node summary.
- `admin/src/pages/diagnostics-page.tsx`: placeholder for ops diagnostics.
- `admin/src/pages/api-playground-page.tsx`: developer tools placeholder.
- `admin/src/pages/settings-page.tsx`: admin settings placeholder.
- `admin/src/test/subscriptions.test.ts`: mock workflow tests.

Modify:

- `package.json`: add root scripts to run/build/test the admin app.
- `README.md`: add admin shell development notes.
- `docs/superpowers/specs/2026-05-21-subscription-admin-design.md`: append implementation note if the final shell path differs from the spec.

Do not modify:

- `server/` backend behavior.
- `public/index.html` legacy console behavior.
- AWS deployment files or `.proxy-gateway/`.

---

### Task 1: Scaffold The Vite Admin App

**Files:**
- Create: `admin/NOTICE.md`
- Create: `admin/package.json`
- Create: `admin/index.html`
- Create: `admin/vite.config.ts`
- Create: `admin/tsconfig.json`
- Create: `admin/src/main.tsx`
- Create: `admin/src/App.tsx`
- Create: `admin/src/styles.css`
- Create: `admin/src/lib/utils.ts`
- Modify: `package.json`

- [ ] **Step 1: Create directories**

Run:

```powershell
New-Item -ItemType Directory -Force admin\src\lib,admin\src\app,admin\src\components\layout,admin\src\features\subscriptions,admin\src\pages,admin\src\test | Out-Null
```

Expected: command exits with code `0`.

- [ ] **Step 2: Capture template attribution**

If implementation copies any non-trivial file or component from `satnaing/shadcn-admin`, create `admin/NOTICE.md`:

```markdown
# Admin Shell Attribution

This admin shell adapts selected layout and component patterns from:

- satnaing/shadcn-admin
- https://github.com/satnaing/shadcn-admin
- MIT License

The proxy gateway subscription workflow, data model, and API integration remain project-specific.
```

If the implementation only uses the repository as visual reference and does not copy source files, still create this notice so the origin of the shell decision is clear.

- [ ] **Step 3: Create `admin/package.json`**

Create:

```json
{
  "name": "proxy-gateway-admin",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0",
    "typescript": "^5.8.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.468.0",
    "sonner": "^1.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "class-variance-authority": "^0.7.1"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 4: Install frontend dependencies**

Run:

```powershell
npm install --prefix admin
```

Expected:

```text
added ...
found 0 vulnerabilities
```

If npm selects newer compatible package versions, keep the generated `admin/package-lock.json`.

- [ ] **Step 5: Create Vite config**

Create `admin/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  }
});
```

- [ ] **Step 6: Create TypeScript config**

Create `admin/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Create HTML entry**

Create `admin/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Proxy Gateway Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create initial CSS**

Create `admin/src/styles.css`:

```css
:root {
  color-scheme: light;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  background: #f8fafc;
  color: #0f172a;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

This branch starts with a small shell CSS baseline. Add Tailwind/shadcn in the implementation if the worker chooses to use the shadcn CLI in Task 2.

- [ ] **Step 9: Create `cn()` helper**

Create `admin/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 10: Create temporary app entry**

Create `admin/src/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>Proxy Gateway Admin</h1>
    </main>
  );
}
```

Create `admin/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 11: Add root package scripts**

Modify root `package.json` scripts:

```json
"admin:dev": "npm run dev --prefix admin",
"admin:build": "npm run build --prefix admin",
"admin:test": "npm run test --prefix admin"
```

Keep existing scripts unchanged.

- [ ] **Step 12: Verify scaffold**

Run:

```powershell
npm run admin:build
```

Expected: Vite build succeeds and creates `admin/dist`.

- [ ] **Step 13: Commit scaffold**

Run:

```powershell
git add package.json admin
git commit -m "feat: scaffold admin console app"
```

Expected: commit succeeds.

---

### Task 2: Add The Admin Shell Layout

**Files:**
- Create: `admin/src/app/navigation.ts`
- Create: `admin/src/components/layout/admin-layout.tsx`
- Create: `admin/src/components/layout/app-sidebar.tsx`
- Create: `admin/src/components/layout/top-bar.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/styles.css`

- [ ] **Step 1: Define navigation**

Create `admin/src/app/navigation.ts`:

```ts
import {
  Activity,
  Code2,
  Gauge,
  LifeBuoy,
  Network,
  Settings,
  Users
} from "lucide-react";

export type AdminPage =
  | "overview"
  | "subscriptions"
  | "nodes"
  | "diagnostics"
  | "api-playground"
  | "settings";

export const navItems = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "subscriptions", label: "Subscriptions", icon: Users },
  { id: "nodes", label: "Nodes", icon: Network },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "api-playground", label: "API Playground", icon: Code2 },
  { id: "settings", label: "Settings", icon: Settings }
] satisfies Array<{ id: AdminPage; label: string; icon: typeof LifeBuoy }>;

export const pageTitles: Record<AdminPage, string> = {
  overview: "Overview",
  subscriptions: "Subscriptions",
  nodes: "Nodes",
  diagnostics: "Diagnostics",
  "api-playground": "API Playground",
  settings: "Settings"
};
```

- [ ] **Step 2: Create sidebar**

Create `admin/src/components/layout/app-sidebar.tsx`:

```tsx
import { navItems, type AdminPage } from "../../app/navigation";
import { cn } from "../../lib/utils";

type AppSidebarProps = {
  activePage: AdminPage;
  onNavigate: (page: AdminPage) => void;
};

export function AppSidebar({ activePage, onNavigate }: AppSidebarProps) {
  return (
    <aside className="app-sidebar" aria-label="Admin navigation">
      <div className="brand">
        <div className="brand-mark">PG</div>
        <div>
          <div className="brand-name">Proxy Gateway</div>
          <div className="brand-subtitle">Subscription Admin</div>
        </div>
      </div>
      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === activePage;
          return (
            <button
              key={item.id}
              className={cn("nav-item", active && "nav-item-active")}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Create top bar**

Create `admin/src/components/layout/top-bar.tsx`:

```tsx
import { Search } from "lucide-react";
import { type AdminPage, pageTitles } from "../../app/navigation";

type TopBarProps = {
  activePage: AdminPage;
  search: string;
  onSearchChange: (value: string) => void;
};

export function TopBar({ activePage, search, onSearchChange }: TopBarProps) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Admin Console</p>
        <h1>{pageTitles[activePage]}</h1>
      </div>
      <label className="search-box">
        <Search aria-hidden="true" />
        <span className="sr-only">Search subscriptions</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search subscriptions..."
        />
      </label>
    </header>
  );
}
```

- [ ] **Step 4: Create layout**

Create `admin/src/components/layout/admin-layout.tsx`:

```tsx
import { type ReactNode } from "react";
import { type AdminPage } from "../../app/navigation";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

type AdminLayoutProps = {
  activePage: AdminPage;
  search: string;
  onSearchChange: (value: string) => void;
  onNavigate: (page: AdminPage) => void;
  children: ReactNode;
};

export function AdminLayout({
  activePage,
  search,
  onSearchChange,
  onNavigate,
  children
}: AdminLayoutProps) {
  return (
    <div className="admin-shell">
      <AppSidebar activePage={activePage} onNavigate={onNavigate} />
      <div className="admin-main">
        <TopBar
          activePage={activePage}
          search={search}
          onSearchChange={onSearchChange}
        />
        <section className="admin-content">{children}</section>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add shell CSS**

Append to `admin/src/styles.css`:

```css
.admin-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
}

.app-sidebar {
  background: #0f172a;
  color: #e2e8f0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #38bdf8;
  color: #082f49;
  display: grid;
  place-items: center;
  font-weight: 800;
}

.brand-name {
  font-weight: 700;
}

.brand-subtitle,
.eyebrow,
.muted {
  color: #64748b;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
}

.nav-item svg,
.search-box svg {
  width: 18px;
  height: 18px;
}

.nav-item:hover,
.nav-item-active {
  background: #1e293b;
  color: #f8fafc;
}

.admin-main {
  min-width: 0;
  background: #f8fafc;
}

.top-bar {
  min-height: 82px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.top-bar h1 {
  margin: 0;
  font-size: 24px;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.search-box {
  width: min(360px, 100%);
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 12px;
  background: #f8fafc;
}

.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
}

.admin-content {
  padding: 24px;
}

@media (max-width: 860px) {
  .admin-shell {
    grid-template-columns: 1fr;
  }

  .app-sidebar {
    position: static;
  }

  .top-bar {
    align-items: stretch;
    flex-direction: column;
  }
}
```

- [ ] **Step 6: Wire layout in `App.tsx`**

Replace `admin/src/App.tsx`:

```tsx
import { useState } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";

export function App() {
  const [activePage, setActivePage] = useState<AdminPage>("subscriptions");
  const [search, setSearch] = useState("");

  return (
    <AdminLayout
      activePage={activePage}
      search={search}
      onSearchChange={setSearch}
      onNavigate={setActivePage}
    >
      <div className="placeholder-panel">
        <h2>{activePage}</h2>
        <p className="muted">Admin shell ready.</p>
      </div>
    </AdminLayout>
  );
}
```

Append CSS:

```css
.placeholder-panel {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
  padding: 20px;
}

.placeholder-panel h2 {
  margin: 0 0 8px;
}
```

- [ ] **Step 7: Verify shell build**

Run:

```powershell
npm run admin:build
```

Expected: build passes.

- [ ] **Step 8: Commit shell layout**

Run:

```powershell
git add admin
git commit -m "feat: add admin shell layout"
```

---

### Task 3: Add Mock Subscription Data And Client

**Files:**
- Create: `admin/src/features/subscriptions/types.ts`
- Create: `admin/src/features/subscriptions/mock-data.ts`
- Create: `admin/src/features/subscriptions/mock-client.ts`
- Create: `admin/src/lib/clipboard.ts`
- Create: `admin/src/components/status-badge.tsx`
- Create: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Define types**

Create `admin/src/features/subscriptions/types.ts`:

```ts
export type SubscriptionStatus = "active" | "expiring" | "expired" | "disabled";

export type NodeCredentialMode = "shared-node" | "per-user-password" | "per-user-port";

export type SubscriptionTenant = {
  id: string;
  displayName: string;
  status: SubscriptionStatus;
  expiresAt: string;
  note: string;
  nodeName: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  credentialMode: NodeCredentialMode;
};

export type CreateSubscriptionInput = {
  displayName: string;
  expiresAt: string;
  note: string;
};

export type RenewSubscriptionInput = {
  id: string;
  expiresAt: string;
};

export type ResetTokenResult = {
  tenantId: string;
  subscriptionUrl: string;
  tokenPrefix: string;
};
```

- [ ] **Step 2: Add mock rows**

Create `admin/src/features/subscriptions/mock-data.ts`:

```ts
import type { SubscriptionTenant } from "./types";

export const defaultNode = {
  id: "node_aws_singapore",
  name: "aws-singapore",
  region: "Singapore",
  host: "52.221.198.76.sslip.io",
  port: 18388,
  method: "chacha20-ietf-poly1305",
  credentialMode: "shared-node" as const,
  status: "online"
};

export const initialSubscriptions: SubscriptionTenant[] = [
  {
    id: "tenant_alpha",
    displayName: "alpha-phone",
    status: "active",
    expiresAt: "2026-06-21T00:00:00.000Z",
    note: "iPhone Karing test user",
    nodeName: "aws-singapore",
    tokenPrefix: "sub_a8f2",
    lastUsedAt: "2026-05-21T18:30:00.000Z",
    credentialMode: "shared-node"
  },
  {
    id: "tenant_beta",
    displayName: "beta-android",
    status: "expiring",
    expiresAt: "2026-05-25T00:00:00.000Z",
    note: "Android Karing validation",
    nodeName: "aws-singapore",
    tokenPrefix: "sub_b91c",
    lastUsedAt: null,
    credentialMode: "shared-node"
  },
  {
    id: "tenant_disabled",
    displayName: "disabled-demo",
    status: "disabled",
    expiresAt: "2026-06-01T00:00:00.000Z",
    note: "Disabled state example",
    nodeName: "aws-singapore",
    tokenPrefix: "sub_d421",
    lastUsedAt: "2026-05-20T12:00:00.000Z",
    credentialMode: "shared-node"
  }
];
```

- [ ] **Step 3: Implement mock client**

Create `admin/src/features/subscriptions/mock-client.ts`:

```ts
import { initialSubscriptions } from "./mock-data";
import type {
  CreateSubscriptionInput,
  RenewSubscriptionInput,
  ResetTokenResult,
  SubscriptionTenant
} from "./types";

function nextId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function tokenPrefix() {
  return `sub_${Math.random().toString(36).slice(2, 6)}`;
}

export function createMockSubscriptionStore(seed = initialSubscriptions) {
  let rows = seed.map((row) => ({ ...row }));

  function list() {
    return rows.map((row) => ({ ...row }));
  }

  function create(input: CreateSubscriptionInput) {
    const prefix = tokenPrefix();
    const tenant: SubscriptionTenant = {
      id: nextId("tenant"),
      displayName: input.displayName,
      status: "active",
      expiresAt: input.expiresAt,
      note: input.note,
      nodeName: "aws-singapore",
      tokenPrefix: prefix,
      lastUsedAt: null,
      credentialMode: "shared-node"
    };
    rows = [tenant, ...rows];
    return {
      tenant,
      subscriptionUrl: `https://52.221.198.76.sslip.io/sub/clash.yaml?token=${prefix}_visible_once`
    };
  }

  function renew(input: RenewSubscriptionInput) {
    rows = rows.map((row) =>
      row.id === input.id
        ? { ...row, expiresAt: input.expiresAt, status: "active" }
        : row
    );
    return rows.find((row) => row.id === input.id) ?? null;
  }

  function disable(id: string) {
    rows = rows.map((row) =>
      row.id === id ? { ...row, status: "disabled" } : row
    );
    return rows.find((row) => row.id === id) ?? null;
  }

  function enable(id: string) {
    rows = rows.map((row) =>
      row.id === id ? { ...row, status: "active" } : row
    );
    return rows.find((row) => row.id === id) ?? null;
  }

  function resetToken(id: string): ResetTokenResult | null {
    const prefix = tokenPrefix();
    let found = false;
    rows = rows.map((row) => {
      if (row.id !== id) return row;
      found = true;
      return { ...row, tokenPrefix: prefix };
    });
    if (!found) return null;
    return {
      tenantId: id,
      tokenPrefix: prefix,
      subscriptionUrl: `https://52.221.198.76.sslip.io/sub/clash.yaml?token=${prefix}_visible_once`
    };
  }

  return { list, create, renew, disable, enable, resetToken };
}
```

- [ ] **Step 4: Add clipboard helper**

Create `admin/src/lib/clipboard.ts`:

```ts
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}
```

- [ ] **Step 5: Add status badge**

Create `admin/src/components/status-badge.tsx`:

```tsx
import type { SubscriptionStatus } from "../features/subscriptions/types";
import { cn } from "../lib/utils";

const labels: Record<SubscriptionStatus, string> = {
  active: "Active",
  expiring: "Expiring",
  expired: "Expired",
  disabled: "Disabled"
};

export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return <span className={cn("status-badge", `status-${status}`)}>{labels[status]}</span>;
}
```

Append CSS:

```css
.status-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}

.status-active {
  background: #dcfce7;
  color: #166534;
}

.status-expiring {
  background: #fef3c7;
  color: #92400e;
}

.status-expired,
.status-disabled {
  background: #fee2e2;
  color: #991b1b;
}
```

- [ ] **Step 6: Add mock tests**

Create `admin/src/test/subscriptions.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createMockSubscriptionStore } from "../features/subscriptions/mock-client";

describe("mock subscription store", () => {
  test("creates a subscription and returns a visible-once URL", () => {
    const store = createMockSubscriptionStore([]);
    const result = store.create({
      displayName: "test-user",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "manual"
    });

    expect(result.tenant.displayName).toBe("test-user");
    expect(result.subscriptionUrl).toContain("/sub/clash.yaml?token=");
    expect(store.list()).toHaveLength(1);
  });

  test("disables and re-enables a subscription", () => {
    const store = createMockSubscriptionStore([]);
    const result = store.create({
      displayName: "test-user",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "manual"
    });

    expect(store.disable(result.tenant.id)?.status).toBe("disabled");
    expect(store.enable(result.tenant.id)?.status).toBe("active");
  });

  test("reset token changes token prefix", () => {
    const store = createMockSubscriptionStore([]);
    const result = store.create({
      displayName: "test-user",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "manual"
    });
    const reset = store.resetToken(result.tenant.id);

    expect(reset).not.toBeNull();
    expect(reset?.tokenPrefix).not.toBe(result.tenant.tokenPrefix);
  });
});
```

- [ ] **Step 7: Run mock tests**

Run:

```powershell
npm run admin:test
```

Expected: all Vitest tests pass.

- [ ] **Step 8: Commit mock data layer**

Run:

```powershell
git add admin
git commit -m "feat: add mock subscription data layer"
```

---

### Task 4: Build The Subscriptions Management Page

**Files:**
- Create: `admin/src/features/subscriptions/subscriptions-page.tsx`
- Create: `admin/src/features/subscriptions/create-subscription-dialog.tsx`
- Create: `admin/src/features/subscriptions/renew-subscription-dialog.tsx`
- Create: `admin/src/features/subscriptions/reset-token-dialog.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/styles.css`

- [ ] **Step 1: Create subscriptions page component**

Create `admin/src/features/subscriptions/subscriptions-page.tsx` with these behaviors:

- Accept `search`.
- Own the mock store in component state.
- Render summary cards for active, expiring, disabled/expired, total.
- Render table columns: user, status, expiry, node, credential mode, token prefix, last used, actions.
- Provide actions: copy, renew, disable/enable, reset token.

Use this implementation:

```tsx
import { useMemo, useState } from "react";
import { Check, Copy, MoreHorizontal, RotateCcw, ShieldOff, ShieldCheck } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";
import { copyText } from "../../lib/clipboard";
import { createMockSubscriptionStore } from "./mock-client";
import type { SubscriptionTenant } from "./types";
import { CreateSubscriptionDialog } from "./create-subscription-dialog";
import { RenewSubscriptionDialog } from "./renew-subscription-dialog";
import { ResetTokenDialog } from "./reset-token-dialog";

const store = createMockSubscriptionStore();

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function formatLastUsed(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function SubscriptionsPage({ search }: { search: string }) {
  const [rows, setRows] = useState(() => store.list());
  const [renewTarget, setRenewTarget] = useState<SubscriptionTenant | null>(null);
  const [resetTarget, setResetTarget] = useState<SubscriptionTenant | null>(null);
  const [lastCopied, setLastCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.displayName, row.status, row.nodeName, row.note, row.tokenPrefix]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [rows, search]);

  const counts = {
    total: rows.length,
    active: rows.filter((row) => row.status === "active").length,
    expiring: rows.filter((row) => row.status === "expiring").length,
    blocked: rows.filter((row) => row.status === "disabled" || row.status === "expired").length
  };

  async function copyLink(row: SubscriptionTenant) {
    const url = `https://52.221.198.76.sslip.io/sub/clash.yaml?token=${row.tokenPrefix}_hidden`;
    await copyText(url);
    setLastCopied(row.id);
    window.setTimeout(() => setLastCopied(null), 1800);
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Subscription users</h2>
          <p className="muted">Manual subscription management for the AWS Singapore node.</p>
        </div>
        <CreateSubscriptionDialog
          onCreate={(input) => {
            const result = store.create(input);
            setRows(store.list());
            return result.subscriptionUrl;
          }}
        />
      </div>

      <div className="metric-grid">
        <Metric label="Total" value={counts.total} />
        <Metric label="Active" value={counts.active} />
        <Metric label="Expiring" value={counts.expiring} />
        <Metric label="Disabled / expired" value={counts.blocked} />
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Node</th>
              <th>Credential</th>
              <th>Token</th>
              <th>Last used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.displayName}</strong>
                  <span className="table-note">{row.note}</span>
                </td>
                <td><StatusBadge status={row.status} /></td>
                <td>{formatDate(row.expiresAt)}</td>
                <td>{row.nodeName}</td>
                <td>{row.credentialMode}</td>
                <td><code>{row.tokenPrefix}</code></td>
                <td>{formatLastUsed(row.lastUsedAt)}</td>
                <td>
                  <div className="action-row">
                    <button className="icon-button" type="button" onClick={() => copyLink(row)} title="Copy subscription URL">
                      {lastCopied === row.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    </button>
                    <button className="icon-button" type="button" onClick={() => setRenewTarget(row)} title="Renew subscription">
                      <RotateCcw aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => {
                        if (row.status === "disabled") store.enable(row.id);
                        else store.disable(row.id);
                        setRows(store.list());
                      }}
                      title={row.status === "disabled" ? "Enable subscription" : "Disable subscription"}
                    >
                      {row.status === "disabled" ? <ShieldCheck aria-hidden="true" /> : <ShieldOff aria-hidden="true" />}
                    </button>
                    <button className="icon-button" type="button" onClick={() => setResetTarget(row)} title="Reset token">
                      <MoreHorizontal aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RenewSubscriptionDialog
        tenant={renewTarget}
        onClose={() => setRenewTarget(null)}
        onRenew={(input) => {
          store.renew(input);
          setRows(store.list());
        }}
      />
      <ResetTokenDialog
        tenant={resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={(id) => store.resetToken(id)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
```

- [ ] **Step 2: Create dialog components**

Implement `create-subscription-dialog.tsx`, `renew-subscription-dialog.tsx`, and `reset-token-dialog.tsx` using native `<dialog>` or shadcn `Dialog` if shadcn components have been installed in Task 2.

Minimum required behavior:

- Create dialog fields: display name, expiry date, note.
- Renew dialog field: expiry date.
- Reset dialog displays the visible-once subscription URL returned by mock client.
- All dialogs must have keyboard-accessible close buttons and visible headings.

- [ ] **Step 3: Wire page into `App.tsx`**

Update `admin/src/App.tsx` so `"subscriptions"` renders `SubscriptionsPage`:

```tsx
import { useState } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import { SubscriptionsPage } from "./features/subscriptions/subscriptions-page";

export function App() {
  const [activePage, setActivePage] = useState<AdminPage>("subscriptions");
  const [search, setSearch] = useState("");

  return (
    <AdminLayout
      activePage={activePage}
      search={search}
      onSearchChange={setSearch}
      onNavigate={setActivePage}
    >
      {activePage === "subscriptions" ? (
        <SubscriptionsPage search={search} />
      ) : (
        <div className="placeholder-panel">
          <h2>{activePage}</h2>
          <p className="muted">Admin shell ready.</p>
        </div>
      )}
    </AdminLayout>
  );
}
```

- [ ] **Step 4: Add table and action CSS**

Append:

```css
.page-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-heading h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-card,
.table-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
}

.metric-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric-card strong {
  font-size: 28px;
}

.table-card {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th,
td {
  padding: 13px 16px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  vertical-align: top;
}

th {
  color: #64748b;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.table-note {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
}

.action-row {
  display: flex;
  gap: 6px;
}

.icon-button {
  width: 34px;
  height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  background: #ffffff;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.icon-button svg {
  width: 16px;
  height: 16px;
}

@media (max-width: 980px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 5: Verify build and tests**

Run:

```powershell
npm run admin:test
npm run admin:build
```

Expected: both pass.

- [ ] **Step 6: Commit subscription page**

Run:

```powershell
git add admin
git commit -m "feat: add mock subscription management page"
```

---

### Task 5: Add Remaining Admin Pages

**Files:**
- Create: `admin/src/pages/overview-page.tsx`
- Create: `admin/src/pages/nodes-page.tsx`
- Create: `admin/src/pages/diagnostics-page.tsx`
- Create: `admin/src/pages/api-playground-page.tsx`
- Create: `admin/src/pages/settings-page.tsx`
- Modify: `admin/src/App.tsx`

- [ ] **Step 1: Create overview page**

Create `admin/src/pages/overview-page.tsx`:

```tsx
export function OverviewPage() {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Service overview</h2>
          <p className="muted">Current production subscription service summary.</p>
        </div>
      </div>
      <div className="metric-grid">
        <div className="metric-card"><span>Production node</span><strong>1</strong></div>
        <div className="metric-card"><span>Admin mode</span><strong>Mock</strong></div>
        <div className="metric-card"><span>Client support</span><strong>Karing</strong></div>
        <div className="metric-card"><span>Region</span><strong>SG</strong></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create nodes page**

Create `admin/src/pages/nodes-page.tsx`:

```tsx
import { defaultNode } from "../features/subscriptions/mock-data";

export function NodesPage() {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Nodes</h2>
          <p className="muted">Read-only production node view for the admin shell MVP.</p>
        </div>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Region</th>
              <th>Host</th>
              <th>Port</th>
              <th>Method</th>
              <th>Credential mode</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{defaultNode.name}</td>
              <td>{defaultNode.region}</td>
              <td>{defaultNode.host}</td>
              <td>{defaultNode.port}</td>
              <td>{defaultNode.method}</td>
              <td>{defaultNode.credentialMode}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create placeholder pages**

Create `admin/src/pages/diagnostics-page.tsx`:

```tsx
export function DiagnosticsPage() {
  return (
    <div className="placeholder-panel">
      <h2>Diagnostics</h2>
      <p className="muted">Operational checks move here after the admin shell is validated.</p>
    </div>
  );
}
```

Create `admin/src/pages/api-playground-page.tsx`:

```tsx
export function ApiPlaygroundPage() {
  return (
    <div className="placeholder-panel">
      <h2>API Playground</h2>
      <p className="muted">Developer-only endpoint checks will be isolated from daily subscription management.</p>
    </div>
  );
}
```

Create `admin/src/pages/settings-page.tsx`:

```tsx
export function SettingsPage() {
  return (
    <div className="placeholder-panel">
      <h2>Settings</h2>
      <p className="muted">Default duration, subscription host, and credential mode settings will be wired later.</p>
    </div>
  );
}
```

- [ ] **Step 4: Wire pages into App**

Update `admin/src/App.tsx`:

```tsx
import { useState } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import { SubscriptionsPage } from "./features/subscriptions/subscriptions-page";
import { ApiPlaygroundPage } from "./pages/api-playground-page";
import { DiagnosticsPage } from "./pages/diagnostics-page";
import { NodesPage } from "./pages/nodes-page";
import { OverviewPage } from "./pages/overview-page";
import { SettingsPage } from "./pages/settings-page";

export function App() {
  const [activePage, setActivePage] = useState<AdminPage>("subscriptions");
  const [search, setSearch] = useState("");

  return (
    <AdminLayout
      activePage={activePage}
      search={search}
      onSearchChange={setSearch}
      onNavigate={setActivePage}
    >
      {renderPage(activePage, search)}
    </AdminLayout>
  );
}

function renderPage(activePage: AdminPage, search: string) {
  switch (activePage) {
    case "overview":
      return <OverviewPage />;
    case "subscriptions":
      return <SubscriptionsPage search={search} />;
    case "nodes":
      return <NodesPage />;
    case "diagnostics":
      return <DiagnosticsPage />;
    case "api-playground":
      return <ApiPlaygroundPage />;
    case "settings":
      return <SettingsPage />;
  }
}
```

- [ ] **Step 5: Verify all pages build**

Run:

```powershell
npm run admin:build
```

Expected: build passes.

- [ ] **Step 6: Commit pages**

Run:

```powershell
git add admin
git commit -m "feat: add admin console pages"
```

---

### Task 6: Document And Verify The Admin Shell

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-05-21-subscription-admin-design.md`

- [ ] **Step 1: Update README**

Add a section after “作为模块使用”:

````markdown
## Admin Console Shell

The subscription admin shell lives in `admin/`. It is a Vite React app used to prototype the operator workflow before the backend subscription database is added.

```bash
npm install --prefix admin
npm run admin:dev
npm run admin:build
npm run admin:test
```

The first admin shell uses mock data and does not change the existing local console in `public/index.html`.
````

- [ ] **Step 2: Update spec implementation note**

Append to `docs/superpowers/specs/2026-05-21-subscription-admin-design.md`:

```markdown
## Implementation Note

The first implementation branch creates a separate `admin/` Vite React app. The existing `public/index.html` remains the legacy operations/API console until the admin app is ready to replace or sit beside it in deployment.
```

- [ ] **Step 3: Run backend tests**

Run:

```powershell
npm test
```

Expected:

```text
tests 44
pass 44
fail 0
```

- [ ] **Step 4: Run frontend tests**

Run:

```powershell
npm run admin:test
```

Expected: all Vitest tests pass.

- [ ] **Step 5: Run frontend build**

Run:

```powershell
npm run admin:build
```

Expected: Vite build passes.

- [ ] **Step 6: Run browser verification**

Start dev server:

```powershell
npm run admin:dev
```

Open:

```text
http://127.0.0.1:5173
```

Verify:

- Desktop viewport shows sidebar and top search without overlap.
- Mobile viewport stacks layout without horizontal overflow.
- Subscriptions page opens first.
- Search filters rows.
- Create subscription adds a row and displays a visible-once URL.
- Copy button gives copied feedback.
- Renew updates expiry and status.
- Disable/enable toggles status.
- Reset token returns a new visible-once URL.

- [ ] **Step 7: Commit docs**

Run:

```powershell
git add README.md docs/superpowers/specs/2026-05-21-subscription-admin-design.md
git commit -m "docs: document admin shell workflow"
```

- [ ] **Step 8: Push and open PR**

Run:

```powershell
git push -u origin feat/admin-console-shell
gh pr create --draft --base master --head feat/admin-console-shell --title "Add admin console shell" --body "## Summary`n- adds Vite React admin shell`n- prototypes subscription management with mock data`n- keeps existing backend and legacy console unchanged`n`n## Verification`n- npm test`n- npm run admin:test`n- npm run admin:build`n- browser verification on desktop/mobile"
```

Expected: GitHub returns a PR URL.

---

## Self-Review Checklist

- The plan starts from `master` and creates `feat/admin-console-shell`.
- The branch is frontend-first and does not change backend behavior.
- The plan uses an admin shell pattern rather than extending `public/index.html`.
- The mock data layer is isolated behind `mock-client.ts`.
- Backend replacement can later target the same UI workflow.
- Existing `npm test` remains required.
- Frontend build and test are required.
- Browser verification is required before completion.
