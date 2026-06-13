# Admin Console Real API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing `admin/` Vite React shell to the real subscription-management API while keeping admin access local-only.

**Architecture:** Keep the current route-less React shell and replace the mock subscription store with a typed HTTP client. Store the operator API base URL and console token in browser session state, pass one client instance into pages, and refresh page data after mutations. Do not expose the admin UI through public Nginx.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, existing Express `/api/admin/*` backend.

---

## File Structure

- Create `admin/src/features/subscriptions/api-client.ts`: typed admin API client, error normalization, URL construction, bearer auth.
- Create `admin/src/features/subscriptions/admin-session.ts`: session storage helpers for `baseUrl` and `consoleToken`.
- Modify `admin/src/features/subscriptions/types.ts`: add API response, node, overview, and operation result types.
- Modify `admin/src/App.tsx`: own admin connection state, create the API client, pass it to pages, and render a connection panel.
- Modify `admin/src/features/subscriptions/subscriptions-page.tsx`: load real tenants, call real mutation methods, show loading and error states, stop fabricating URLs from token prefixes.
- Modify `admin/src/features/subscriptions/create-subscription-dialog.tsx`: support async create and visible-once URL results.
- Modify `admin/src/features/subscriptions/renew-subscription-dialog.tsx`: support async renew and pending state.
- Modify `admin/src/features/subscriptions/reset-token-dialog.tsx`: support async reset-token and temp-link creation.
- Modify `admin/src/pages/overview-page.tsx`: load real overview data.
- Modify `admin/src/pages/nodes-page.tsx`: load real node data.
- Modify `admin/src/pages/settings-page.tsx`: show local-only admin API configuration.
- Modify `admin/src/test/subscriptions.test.ts`: replace mock-store tests with client and workflow tests.
- Modify `admin/src/styles.css`: add connection, alert, loading, and result styles.
- Modify `docs/PROJECT_CONTEXT.md` and README only if the implementation changes operator commands.

## Task 1: Add Typed API Client

**Files:**
- Create: `admin/src/features/subscriptions/api-client.ts`
- Modify: `admin/src/features/subscriptions/types.ts`
- Test: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Replace the first mock-store test with a failing API client list test**

In `admin/src/test/subscriptions.test.ts`, replace the existing imports and first test with this client-focused test setup:

```ts
import { describe, expect, test, vi } from "vitest";
import { AdminApiError, createAdminApiClient } from "../features/subscriptions/api-client";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
}

describe("admin API client", () => {
  test("lists tenants with bearer auth and normalized base URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      items: [{
        id: "tenant_1",
        displayName: "karing-blue-sg",
        status: "active",
        expiresAt: "2026-12-31T00:00:00.000Z",
        note: "primary",
        nodeName: "aws-singapore-blue",
        tokenPrefix: "pgsub_abcdefg",
        lastUsedAt: null,
        credentialMode: "shared-node"
      }]
    }));
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const tenants = await client.listTenants();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3456/api/admin/subscriptions",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer console-secret" })
      })
    );
    expect(tenants).toHaveLength(1);
    expect(tenants[0].nodeName).toBe("aws-singapore-blue");
  });
});
```

- [ ] **Step 2: Run the admin test and verify RED**

Run:

```powershell
npm run admin:test -- --runInBand
```

Expected: fail because `../features/subscriptions/api-client` does not exist.

- [ ] **Step 3: Add API response types**

Extend `admin/src/features/subscriptions/types.ts` with:

```ts
export type SubscriptionNode = {
  id: string;
  name: string;
  status: string;
};

export type SubscriptionOverview = {
  ok: boolean;
  total: number;
  active: number;
  expiring: number;
  expired: number;
  disabled: number;
  nodes: SubscriptionNode[];
};

export type CreateSubscriptionResult = {
  tenant: SubscriptionTenant;
  subscriptionUrl: string;
};

export type TempLinkResult = {
  tenantId: string;
  tokenPrefix: string;
  expiresAt: string;
  subscriptionUrl: string;
};
```

Change `ResetTokenResult` to:

```ts
export type ResetTokenResult = {
  tenant: SubscriptionTenant;
  subscriptionUrl: string;
};
```

- [ ] **Step 4: Implement `api-client.ts`**

Create `admin/src/features/subscriptions/api-client.ts`:

```ts
import type {
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  RenewSubscriptionInput,
  ResetTokenResult,
  SubscriptionNode,
  SubscriptionOverview,
  SubscriptionTenant,
  TempLinkResult
} from "./types";

type Fetcher = typeof fetch;

export type AdminApiClientOptions = {
  baseUrl: string;
  consoleToken: string;
  fetcher?: Fetcher;
};

export class AdminApiError extends Error {
  readonly status: number;
  readonly guidance: string;

  constructor(message: string, status: number, guidance = "") {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.guidance = guidance;
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || "http://127.0.0.1:3456").replace(/\/+$/, "");
}

function url(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdminApiError("Backend returned invalid JSON", response.status);
  }
}

function messageForStatus(status: number) {
  if (status === 401) return "Console token is missing or invalid.";
  if (status === 403) return "This source is not allowed to use admin APIs.";
  if (status === 404) return "Admin API is not reachable here. Use local backend access or an SSH tunnel.";
  return `Admin API request failed with HTTP ${status}.`;
}

export function createAdminApiClient(options: AdminApiClientOptions) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!options.consoleToken.trim()) {
      throw new AdminApiError("Console token is required.", 0);
    }

    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${options.consoleToken}`);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    let response: Response;
    try {
      response = await fetcher(url(baseUrl, path), { ...init, headers });
    } catch (error) {
      throw new AdminApiError(error instanceof Error ? error.message : "Admin API request failed.", 0);
    }

    const body = await parseJson(response);
    if (!response.ok) {
      const backendMessage =
        body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : "";
      throw new AdminApiError(backendMessage || messageForStatus(response.status), response.status);
    }
    return body as T;
  }

  return {
    listTenants: async () => (await request<{ items: SubscriptionTenant[] }>("/api/admin/subscriptions")).items,
    createTenant: async (input: CreateSubscriptionInput) =>
      request<CreateSubscriptionResult>("/api/admin/subscriptions", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    renewTenant: async (input: RenewSubscriptionInput) =>
      (await request<{ tenant: SubscriptionTenant }>(`/api/admin/subscriptions/${encodeURIComponent(input.id)}/renew`, {
        method: "POST",
        body: JSON.stringify({ expiresAt: input.expiresAt })
      })).tenant,
    disableTenant: async (id: string) =>
      (await request<{ tenant: SubscriptionTenant }>(`/api/admin/subscriptions/${encodeURIComponent(id)}/disable`, {
        method: "POST"
      })).tenant,
    enableTenant: async (id: string) =>
      (await request<{ tenant: SubscriptionTenant }>(`/api/admin/subscriptions/${encodeURIComponent(id)}/enable`, {
        method: "POST"
      })).tenant,
    resetToken: async (id: string) =>
      request<ResetTokenResult>(`/api/admin/subscriptions/${encodeURIComponent(id)}/reset-token`, { method: "POST" }),
    createTempLink: async (id: string) =>
      request<TempLinkResult>(`/api/admin/subscriptions/${encodeURIComponent(id)}/temp-link`, { method: "POST" }),
    listNodes: async () => (await request<{ items: SubscriptionNode[] }>("/api/admin/nodes")).items,
    overview: async () => request<SubscriptionOverview>("/api/admin/overview")
  };
}
```

- [ ] **Step 5: Run admin tests and verify GREEN**

Run:

```powershell
npm run admin:test
```

Expected: pass for the client list test.

- [ ] **Step 6: Commit**

```powershell
git add admin/src/features/subscriptions/types.ts admin/src/features/subscriptions/api-client.ts admin/src/test/subscriptions.test.ts
git commit -m "feat: add admin api client"
```

## Task 2: Add Admin Session Configuration

**Files:**
- Create: `admin/src/features/subscriptions/admin-session.ts`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/pages/settings-page.tsx`
- Modify: `admin/src/styles.css`
- Test: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Add failing session storage test**

Append this test to `admin/src/test/subscriptions.test.ts`:

```ts
import { loadAdminSession, saveAdminSession } from "../features/subscriptions/admin-session";

describe("admin session", () => {
  test("persists local API base URL and console token in session storage", () => {
    sessionStorage.clear();

    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "secret"
    });

    expect(loadAdminSession()).toEqual({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "secret"
    });
  });
});
```

- [ ] **Step 2: Run admin tests and verify RED**

Run:

```powershell
npm run admin:test
```

Expected: fail because `admin-session.ts` does not exist.

- [ ] **Step 3: Implement session helpers**

Create `admin/src/features/subscriptions/admin-session.ts`:

```ts
export type AdminSession = {
  baseUrl: string;
  consoleToken: string;
};

const KEY = "proxy-gateway-admin-session";

export const DEFAULT_ADMIN_SESSION: AdminSession = {
  baseUrl: import.meta.env.VITE_ADMIN_API_BASE_URL || "http://127.0.0.1:3456",
  consoleToken: ""
};

export function loadAdminSession(): AdminSession {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return DEFAULT_ADMIN_SESSION;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    return {
      baseUrl: parsed.baseUrl || DEFAULT_ADMIN_SESSION.baseUrl,
      consoleToken: parsed.consoleToken || ""
    };
  } catch {
    return DEFAULT_ADMIN_SESSION;
  }
}

export function saveAdminSession(session: AdminSession) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}
```

- [ ] **Step 4: Wire App session state**

Modify `admin/src/App.tsx` so it imports `useMemo`, `loadAdminSession`, `saveAdminSession`, and `createAdminApiClient`, stores `adminSession`, memoizes `apiClient`, renders a connection panel above pages, and passes `apiClient` to `OverviewPage`, `SubscriptionsPage`, and `NodesPage`.

Use these props:

```ts
type AdminApiClient = ReturnType<typeof createAdminApiClient>;
type AdminSession = ReturnType<typeof loadAdminSession>;
```

The connection panel should include inputs for API base URL and console token, a Save button that calls `saveAdminSession`, and text saying admin APIs require local backend access or an SSH tunnel.

- [ ] **Step 5: Update Settings page**

Modify `admin/src/pages/settings-page.tsx` to say configuration is managed in the connection panel and that public Nginx intentionally returns `404` for admin UI and `/api/admin/*`.

- [ ] **Step 6: Add styles**

Add CSS classes to `admin/src/styles.css` for `.connection-panel`, `.connection-grid`, `.alert`, `.alert-error`, `.loading-row`, and `.result-actions`.

- [ ] **Step 7: Run admin tests**

Run:

```powershell
npm run admin:test
```

Expected: all admin tests pass.

- [ ] **Step 8: Commit**

```powershell
git add admin/src/features/subscriptions/admin-session.ts admin/src/App.tsx admin/src/pages/settings-page.tsx admin/src/styles.css admin/src/test/subscriptions.test.ts
git commit -m "feat: add admin api connection settings"
```

## Task 3: Wire Subscription Workflows To Real API

**Files:**
- Modify: `admin/src/features/subscriptions/subscriptions-page.tsx`
- Modify: `admin/src/features/subscriptions/create-subscription-dialog.tsx`
- Modify: `admin/src/features/subscriptions/renew-subscription-dialog.tsx`
- Modify: `admin/src/features/subscriptions/reset-token-dialog.tsx`
- Test: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Add failing tests for visible-once and no fabricated URL behavior**

Add tests that import `createAdminApiClient` and verify:

```ts
test("creates temp links through the backend endpoint", async () => {
  const fetchMock = vi.fn(async () => jsonResponse({
    tenantId: "tenant_1",
    tokenPrefix: "pgtmp_prefix",
    expiresAt: "2026-05-23T00:00:00.000Z",
    subscriptionUrl: "http://127.0.0.1:3456/sub/clash.yaml?token=pgtmp_visible_once"
  }));
  const client = createAdminApiClient({ baseUrl: "http://127.0.0.1:3456", consoleToken: "secret", fetcher: fetchMock });

  const result = await client.createTempLink("tenant_1");

  expect(fetchMock).toHaveBeenCalledWith(
    "http://127.0.0.1:3456/api/admin/subscriptions/tenant_1/temp-link",
    expect.objectContaining({ method: "POST" })
  );
  expect(result.subscriptionUrl).toContain("pgtmp_visible_once");
});
```

- [ ] **Step 2: Run admin tests and verify RED or missing implementation gap**

Run:

```powershell
npm run admin:test
```

Expected: fail until the client and UI type wiring are complete.

- [ ] **Step 3: Make dialogs async**

Update dialog props:

```ts
onCreate: (input: CreateSubscriptionInput) => Promise<string>;
onRenew: (input: RenewSubscriptionInput) => Promise<void>;
onReset: (id: string) => Promise<ResetTokenResult>;
onCreateTempLink: (id: string) => Promise<TempLinkResult>;
```

Each dialog should track `pending` and `error`. Disable submit buttons while pending. Keep visible-once URLs in dialog state only.

- [ ] **Step 4: Replace store usage in `SubscriptionsPage`**

Remove `createMockSubscriptionStore`. Add props:

```ts
type SubscriptionsPageProps = {
  search: string;
  apiClient: ReturnType<typeof createAdminApiClient>;
};
```

Use `useEffect` to call `apiClient.listTenants()`. On mutations, await the API call and refresh rows. Copy action for existing rows should show an error: "Full subscription URLs are only visible immediately after create, reset, or temporary-link generation."

- [ ] **Step 5: Add temporary link action**

Add a button with a link icon or text-accessible title `Create temporary link`. It should call `apiClient.createTempLink(row.id)`, then show the returned visible-once URL in the reset/result dialog area or a small modal.

- [ ] **Step 6: Run admin tests**

Run:

```powershell
npm run admin:test
```

Expected: all admin tests pass.

- [ ] **Step 7: Commit**

```powershell
git add admin/src/features/subscriptions admin/src/test/subscriptions.test.ts
git commit -m "feat: wire subscription page to admin api"
```

## Task 4: Wire Overview And Nodes

**Files:**
- Modify: `admin/src/pages/overview-page.tsx`
- Modify: `admin/src/pages/nodes-page.tsx`
- Test: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Add API client tests for overview and nodes**

Add tests:

```ts
test("loads overview and nodes from backend endpoints", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ ok: true, total: 1, active: 1, expiring: 0, expired: 0, disabled: 0, nodes: [] }))
    .mockResolvedValueOnce(jsonResponse({ items: [{ id: "node_sg", name: "aws-singapore-blue", status: "online" }] }));
  const client = createAdminApiClient({ baseUrl: "http://127.0.0.1:3456", consoleToken: "secret", fetcher: fetchMock });

  expect((await client.overview()).active).toBe(1);
  expect((await client.listNodes())[0].name).toBe("aws-singapore-blue");
});
```

- [ ] **Step 2: Run admin tests and verify RED or current missing UI wiring**

Run:

```powershell
npm run admin:test
```

Expected: fail until methods/types are complete.

- [ ] **Step 3: Update pages**

`OverviewPage` should accept `apiClient`, load `overview`, render total/active/expiring/disabled metrics, and show errors.

`NodesPage` should accept `apiClient`, load nodes, and render node id/name/status. Do not use `mock-data.ts`.

- [ ] **Step 4: Run admin tests**

Run:

```powershell
npm run admin:test
```

Expected: all admin tests pass.

- [ ] **Step 5: Commit**

```powershell
git add admin/src/pages admin/src/test/subscriptions.test.ts
git commit -m "feat: load overview and nodes from admin api"
```

## Task 5: Verify, Build, Browser Smoke, And Update PR Branch

**Files:**
- Modify: `README.md` if local admin commands need clarification.
- Modify: `docs/PROJECT_CONTEXT.md` if the branch state changes.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm test
npm run admin:test
npm run admin:build
```

Expected: all commands exit with code `0`.

- [ ] **Step 2: Browser smoke test**

Run the admin dev server on localhost:

```powershell
npm run admin:dev
```

Open `http://127.0.0.1:5173` in the browser tool. Verify:

- desktop viewport renders the subscription page without layout overlap;
- mobile viewport keeps sidebar, top bar, table, and modals usable;
- entering API base URL and console token enables backend requests;
- missing token shows a local configuration message instead of calling `/api/admin`.

- [ ] **Step 3: Confirm public AWS remains locked down**

Run:

```powershell
curl.exe --noproxy "*" -sS -o NUL -w "%{http_code}" http://47.129.247.102/
curl.exe --noproxy "*" -sS -o NUL -w "%{http_code}" http://47.129.247.102/api/admin/subscriptions
curl.exe --noproxy "*" -sS -o NUL -w "%{http_code}" http://47.129.247.102/api/health
```

Expected: `404`, `404`, `200`.

- [ ] **Step 4: Push rebased UI PR branch**

Run:

```powershell
git status --short --branch
git push --force-with-lease origin feat/admin-console-shell
```

Expected: PR #3 updates to the rebased branch.

- [ ] **Step 5: Commit docs if changed**

If README or project context changed:

```powershell
git add README.md docs/PROJECT_CONTEXT.md
git commit -m "docs: document local-only admin console api mode"
git push --force-with-lease origin feat/admin-console-shell
```

## Self-Review

- Spec coverage: the plan covers local-only access, bearer-token auth, visible-once URL handling, real backend endpoints, error states, tests, build, and public Nginx verification.
- Placeholder scan: no placeholder tasks remain.
- Type consistency: client methods use `SubscriptionTenant`, `CreateSubscriptionResult`, `ResetTokenResult`, `TempLinkResult`, `SubscriptionNode`, and `SubscriptionOverview` consistently across tasks.
