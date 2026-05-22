# Admin Connection Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a frontend-only Admin UI connection health check that distinguishes backend reachability, missing or invalid console token, source-IP blocking, public gateway blocking, and browser network/CORS failures.

**Architecture:** Add a focused diagnostic helper that calls public `/api/health` without auth and protected `/api/admin/overview` with Bearer auth. Extract the existing connection panel into a small testable component, then render diagnostic state in the panel without persisting results or exposing token values.

**Tech Stack:** Vite React, TypeScript, Vitest, Testing Library, browser `fetch`, existing CSS utilities.

---

## File Structure

- Create: `admin/src/features/subscriptions/connection-health.ts`
  - Owns frontend-only connection diagnostics.
  - Does not import the authenticated admin API client because `/api/health` is public.
  - Normalizes base URL the same way as `api-client.ts`.

- Create: `admin/src/features/subscriptions/connection-panel.tsx`
  - Extracts the current connection form from `admin/src/App.tsx`.
  - Owns `checking` and transient `connectionHealth` UI state.
  - Saves only `baseUrl` and `consoleToken` through existing session helpers.

- Modify: `admin/src/App.tsx`
  - Import `ConnectionPanel`.
  - Remove inline `ConnectionPanel` implementation and unused imports.

- Modify: `admin/src/styles.css`
  - Add compact connection action/result styles.
  - Keep layout responsive with the existing `connection-grid` media query.

- Create: `admin/src/test/connection-health.test.ts`
  - Covers deterministic status mapping and request sequencing.

- Create: `admin/src/test/connection-panel.test.tsx`
  - Covers successful panel rendering and check-button behavior.

- No changes:
  - `server/`
  - `ops/`
  - `docs/DEPLOYMENT_FLOW.md`
  - AWS, production, Nginx, auth middleware, or backend routes.

---

### Task 1: Add Connection Health Helper Tests

**Files:**
- Create: `admin/src/test/connection-health.test.ts`
- Future create: `admin/src/features/subscriptions/connection-health.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `admin/src/test/connection-health.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { checkAdminConnectionHealth } from "../features/subscriptions/connection-health";

function response(status: number) {
  return new Response("ok", { status });
}

describe("connection health diagnostics", () => {
  test("empty token returns token-required without calling fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const result = await checkAdminConnectionHealth({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: " ",
      fetcher: fetchMock
    });

    expect(result.status).toBe("token-required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("health fetch failure maps to network-error", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });

    const result = await checkAdminConnectionHealth({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("network-error");
    expect(result.message).toMatch(/wrong API base URL|SSH tunnel|CORS/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("health non-2xx maps to backend-health-unreachable", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(503));

    const result = await checkAdminConnectionHealth({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("backend-health-unreachable");
    expect(result.healthStatus).toBe(503);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3456/api/health", { method: "GET" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("health 2xx plus overview 2xx maps to connected", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));

    const result = await checkAdminConnectionHealth({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("connected");
    expect(result.healthStatus).toBe(200);
    expect(result.adminStatus).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/health", { method: "GET" });
    const secondCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(secondCall[0]).toBe("/api/admin/overview");
    expect((secondCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
  });

  test("overview 401 maps to token-invalid", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(401));

    const result = await checkAdminConnectionHealth({
      baseUrl: "",
      consoleToken: "bad-token",
      fetcher: fetchMock
    });

    expect(result.status).toBe("token-invalid");
    expect(result.adminStatus).toBe(401);
  });

  test("overview 403 maps to source-blocked", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(403));

    const result = await checkAdminConnectionHealth({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("source-blocked");
    expect(result.adminStatus).toBe(403);
  });

  test("overview 404 maps to public-gateway-blocked", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(404));

    const result = await checkAdminConnectionHealth({
      baseUrl: "https://gateway.example",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("public-gateway-blocked");
    expect(result.message).toMatch(/public gateway|SSH tunnel/i);
    expect(result.adminStatus).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npm run admin:test -- src/test/connection-health.test.ts
```

Expected: FAIL because `admin/src/features/subscriptions/connection-health.ts` does not exist.

- [ ] **Step 3: Commit only if a checkpoint is desired**

Do not commit the failing test alone unless intentionally preserving the red phase. The normal path is to continue to Task 2 and commit tests plus implementation together.

---

### Task 2: Implement Connection Health Helper

**Files:**
- Create: `admin/src/features/subscriptions/connection-health.ts`
- Test: `admin/src/test/connection-health.test.ts`

- [ ] **Step 1: Add helper implementation**

Create `admin/src/features/subscriptions/connection-health.ts`:

```ts
type Fetcher = typeof fetch;

export type ConnectionHealthStatus =
  | "connected"
  | "token-required"
  | "token-invalid"
  | "source-blocked"
  | "public-gateway-blocked"
  | "backend-health-unreachable"
  | "network-error";

export type ConnectionHealthResult = {
  status: ConnectionHealthStatus;
  title: string;
  message: string;
  healthStatus?: number;
  adminStatus?: number;
};

export type ConnectionHealthInput = {
  baseUrl: string;
  consoleToken: string;
  fetcher?: Fetcher;
};

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed || trimmed === "/") return "";
  return trimmed.replace(/\/+$/, "");
}

function apiUrl(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function result(
  status: ConnectionHealthStatus,
  title: string,
  message: string,
  details: Pick<ConnectionHealthResult, "healthStatus" | "adminStatus"> = {}
): ConnectionHealthResult {
  return { status, title, message, ...details };
}

function networkErrorResult(): ConnectionHealthResult {
  return result(
    "network-error",
    "Connection check failed",
    "The browser could not reach the backend. Check the API base URL, whether the backend is running, whether the SSH tunnel is open, and whether browser CORS is blocking the request."
  );
}

export async function checkAdminConnectionHealth({
  baseUrl,
  consoleToken,
  fetcher = fetch
}: ConnectionHealthInput): Promise<ConnectionHealthResult> {
  const token = consoleToken.trim();
  if (!token) {
    return result(
      "token-required",
      "Console token required",
      "Enter the console token before checking protected admin API access."
    );
  }

  let healthResponse: Response;
  try {
    healthResponse = await fetcher(apiUrl(baseUrl, "/api/health"), { method: "GET" });
  } catch {
    return networkErrorResult();
  }

  if (!healthResponse.ok) {
    return result(
      "backend-health-unreachable",
      "Backend health check failed",
      `The backend health endpoint returned HTTP ${healthResponse.status}. Check the API base URL and backend process.`,
      { healthStatus: healthResponse.status }
    );
  }

  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);

  let adminResponse: Response;
  try {
    adminResponse = await fetcher(apiUrl(baseUrl, "/api/admin/overview"), {
      method: "GET",
      headers
    });
  } catch {
    return networkErrorResult();
  }

  if (adminResponse.ok) {
    return result(
      "connected",
      "Admin API connected",
      "Backend health is reachable and the admin API accepted the console token.",
      { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
    );
  }

  if (adminResponse.status === 401) {
    return result(
      "token-invalid",
      "Console token invalid",
      "The backend is reachable, but the admin API rejected the console token.",
      { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
    );
  }

  if (adminResponse.status === 403) {
    return result(
      "source-blocked",
      "Source IP blocked",
      "The backend is reachable, but this browser source is not allowed to use admin APIs. Use local access or the intended SSH tunnel.",
      { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
    );
  }

  if (adminResponse.status === 404) {
    return result(
      "public-gateway-blocked",
      "Admin API not exposed here",
      "Health is reachable, but admin APIs returned 404. You may be pointing at the public gateway instead of local backend access or an SSH tunnel.",
      { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
    );
  }

  return result(
    "backend-health-unreachable",
    "Admin API check failed",
    `The admin overview endpoint returned HTTP ${adminResponse.status}. Check the backend process and API base URL.`,
    { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
  );
}
```

- [ ] **Step 2: Run helper tests**

Run:

```powershell
npm run admin:test -- src/test/connection-health.test.ts
```

Expected: PASS for all connection health diagnostics tests.

- [ ] **Step 3: Commit helper boundary**

Run:

```powershell
git add admin/src/features/subscriptions/connection-health.ts admin/src/test/connection-health.test.ts
git commit -m "feat: add admin connection health diagnostics"
```

Expected: commit created with helper and mapping tests only.

---

### Task 3: Extract And Enhance Connection Panel

**Files:**
- Create: `admin/src/features/subscriptions/connection-panel.tsx`
- Modify: `admin/src/App.tsx`
- Future modify: `admin/src/styles.css`

- [ ] **Step 1: Create extracted panel component**

Create `admin/src/features/subscriptions/connection-panel.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import {
  checkAdminConnectionHealth,
  type ConnectionHealthResult
} from "./connection-health";
import {
  saveAdminSession,
  type AdminSession
} from "./admin-session";

type ConnectionPanelProps = {
  session: AdminSession;
  onSave: (session: AdminSession) => void;
  checkConnection?: typeof checkAdminConnectionHealth;
};

function healthClassName(result: ConnectionHealthResult) {
  return result.status === "connected"
    ? "connection-health connection-health-ok"
    : "connection-health connection-health-warning";
}

export function ConnectionPanel({
  session,
  onSave,
  checkConnection = checkAdminConnectionHealth
}: ConnectionPanelProps) {
  const [baseUrl, setBaseUrl] = useState(session.baseUrl);
  const [consoleToken, setConsoleToken] = useState(session.consoleToken);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealthResult | null>(null);

  function updateBaseUrl(value: string) {
    setBaseUrl(value);
    setConnectionHealth(null);
  }

  function updateConsoleToken(value: string) {
    setConsoleToken(value);
    setConnectionHealth(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { baseUrl: baseUrl.trim(), consoleToken: consoleToken.trim() };
    saveAdminSession(next);
    onSave(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  async function checkConnectionStatus() {
    setSaved(false);
    setChecking(true);
    try {
      const result = await checkConnection({
        baseUrl,
        consoleToken
      });
      setConnectionHealth(result);
    } finally {
      setChecking(false);
    }
  }

  return (
    <form className="connection-panel" onSubmit={submit}>
      <div>
        <strong>Admin API connection</strong>
        <p className="muted">Use the same-origin proxy or an SSH tunnel. Public Nginx blocks admin APIs.</p>
      </div>
      <div className="connection-stack">
        <div className="connection-grid">
          <label>
            <span>API base URL</span>
            <input
              value={baseUrl}
              onChange={(event) => updateBaseUrl(event.target.value)}
              placeholder="Same origin"
            />
          </label>
          <label>
            <span>Console token</span>
            <input
              value={consoleToken}
              onChange={(event) => updateConsoleToken(event.target.value)}
              type="password"
              autoComplete="off"
            />
          </label>
          <div className="connection-actions">
            <button className="primary-button" type="submit">
              {saved ? "Saved" : "Save"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={checkConnectionStatus}
              disabled={checking}
            >
              {checking ? "Checking" : "Check connection"}
            </button>
          </div>
        </div>
        {connectionHealth ? (
          <div className={healthClassName(connectionHealth)} role="status">
            <strong>{connectionHealth.title}</strong>
            <span>{connectionHealth.message}</span>
          </div>
        ) : null}
      </div>
    </form>
  );
}
```

Key requirements implemented in this component:

- `Check connection` uses `type="button"` so it cannot submit the save form.
- Changing either input clears the old diagnostic result.
- Diagnostic results stay in component state only.
- Raw token is never rendered outside the password input.

- [ ] **Step 2: Wire App to extracted panel**

Modify `admin/src/App.tsx`.

Replace the import block:

```tsx
import { useMemo, useState } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import { createAdminApiClient, type AdminApiClient } from "./features/subscriptions/api-client";
import {
  loadAdminSession,
  type AdminSession
} from "./features/subscriptions/admin-session";
import { ConnectionPanel } from "./features/subscriptions/connection-panel";
```

Remove the inline `ConnectionPanel` function at the bottom of `App.tsx`.

Keep this render call unchanged:

```tsx
<ConnectionPanel session={adminSession} onSave={setAdminSession} />
```

- [ ] **Step 3: Run build to catch extraction mistakes**

Run:

```powershell
npm run admin:build
```

Expected: PASS. If TypeScript reports unused imports in `App.tsx`, remove the unused imports and rerun.

---

### Task 4: Add Panel Tests

**Files:**
- Create: `admin/src/test/connection-panel.test.tsx`
- Test dependency: `admin/src/features/subscriptions/connection-panel.tsx`

- [ ] **Step 1: Write panel rendering tests**

Create `admin/src/test/connection-panel.test.tsx`:

```tsx
import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConnectionPanel } from "../features/subscriptions/connection-panel";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("connection panel", () => {
  test("check button renders a successful diagnostic without saving the session", async () => {
    const onSave = vi.fn();
    const checkConnection = vi.fn(async () => ({
      status: "connected" as const,
      title: "Admin API connected",
      message: "Backend health is reachable and the admin API accepted the console token.",
      healthStatus: 200,
      adminStatus: 200
    }));

    render(createElement(ConnectionPanel, {
      session: { baseUrl: "", consoleToken: "console-secret" },
      onSave,
      checkConnection
    }));

    fireEvent.click(screen.getByRole("button", { name: /check connection/i }));

    expect(await screen.findByText("Admin API connected")).not.toBeNull();
    expect(screen.getByText(/accepted the console token/i)).not.toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(checkConnection).toHaveBeenCalledWith({
      baseUrl: "",
      consoleToken: "console-secret"
    });
  });

  test("changing settings clears the previous diagnostic result", async () => {
    const checkConnection = vi.fn(async () => ({
      status: "connected" as const,
      title: "Admin API connected",
      message: "Backend health is reachable and the admin API accepted the console token.",
      healthStatus: 200,
      adminStatus: 200
    }));

    render(createElement(ConnectionPanel, {
      session: { baseUrl: "", consoleToken: "console-secret" },
      onSave: vi.fn(),
      checkConnection
    }));

    fireEvent.click(screen.getByRole("button", { name: /check connection/i }));
    expect(await screen.findByText("Admin API connected")).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/api base url/i), {
      target: { value: "http://127.0.0.1:3456" }
    });

    await waitFor(() => {
      expect(screen.queryByText("Admin API connected")).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run panel tests**

Run:

```powershell
npm run admin:test -- src/test/connection-panel.test.tsx
```

Expected: PASS for both panel tests.

- [ ] **Step 3: Commit panel component and tests**

Run:

```powershell
git add admin/src/App.tsx admin/src/features/subscriptions/connection-panel.tsx admin/src/test/connection-panel.test.tsx
git commit -m "feat: add admin connection panel diagnostics"
```

Expected: commit created with extracted component, App wiring, and panel tests.

---

### Task 5: Add Connection Panel Styles

**Files:**
- Modify: `admin/src/styles.css`
- Test: `admin/src/test/connection-panel.test.tsx`

- [ ] **Step 1: Add layout and status styles**

Modify `admin/src/styles.css` near the existing `.connection-grid` rules:

```css
.connection-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(860px, 100%);
  min-width: 0;
}

.connection-actions {
  display: flex;
  align-items: end;
  gap: 8px;
}

.connection-actions .primary-button,
.connection-actions .ghost-button {
  white-space: nowrap;
}

.connection-health {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.connection-health-ok {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.connection-health-warning {
  border-color: #fed7aa;
  background: #fff7ed;
  color: #9a3412;
}
```

Modify the existing mobile section:

```css
  .connection-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .connection-actions .primary-button,
  .connection-actions .ghost-button {
    width: 100%;
  }
```

Keep the existing rule:

```css
  .connection-grid {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 2: Run frontend tests**

Run:

```powershell
npm run admin:test
```

Expected: PASS, including the new helper and panel tests.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
npm run admin:build
```

Expected: PASS.

- [ ] **Step 4: Commit styles**

Run:

```powershell
git add admin/src/styles.css
git commit -m "style: show admin connection health state"
```

Expected: commit created with CSS only.

---

### Task 6: Final Verification And PR Preparation

**Files:**
- Verify all modified files.
- Optionally update PR description after pushing.

- [ ] **Step 1: Verify intended diff only**

Run:

```powershell
git status --short --branch
git diff --stat origin/master...HEAD
git diff --name-only origin/master...HEAD
```

Expected changed files:

```text
admin/src/App.tsx
admin/src/features/subscriptions/connection-health.ts
admin/src/features/subscriptions/connection-panel.tsx
admin/src/styles.css
admin/src/test/connection-health.test.ts
admin/src/test/connection-panel.test.tsx
docs/superpowers/plans/2026-05-23-admin-connection-health.md
docs/superpowers/specs/2026-05-23-admin-connection-health-design.md
```

The spec file is already committed on this branch. If the implementation PR should avoid including the spec commit in the final diff, rebase only after confirming with the operator. Do not drop the spec commit silently.

- [ ] **Step 2: Run whitespace check**

Run:

```powershell
git diff --check origin/master...HEAD
```

Expected: no whitespace errors. Windows CRLF conversion warnings from Git are acceptable only if the command exits with code `0`.

- [ ] **Step 3: Run frontend validation**

Run:

```powershell
npm run admin:test
npm run admin:build
```

Expected:

```text
admin:test passes
admin:build passes
```

- [ ] **Step 4: Run backend regression suite**

Run:

```powershell
npm test
```

Expected:

```text
server tests pass
```

This feature should not modify backend code, but this command is required for the project release-gate habit.

- [ ] **Step 5: Push branch**

Run:

```powershell
git push
```

Expected: `origin/feat/admin-connection-health` is updated.

- [ ] **Step 6: Create or update Draft PR**

If no PR exists:

```powershell
gh pr create --repo gaoyi1020-web/proxy-gateway-minimal --base master --head feat/admin-connection-health --title "[feat] add admin connection health check" --draft
```

Use this PR summary:

```markdown
## Summary
- Add frontend-only Admin UI connection health diagnostics.
- Check public `/api/health` without auth before checking protected `/api/admin/overview` with Bearer auth.
- Render operator-readable connection status in the existing connection panel.
- Keep diagnostic results transient and avoid exposing tokens.

## Validation
- `git diff --check`
- `npm run admin:test`
- `npm run admin:build`
- `npm test`

## Boundaries
- Frontend-only.
- No backend endpoint changes.
- No auth model changes.
- No AWS, production, Nginx, or deployment changes.
- Admin UI remains local / SSH tunnel only.
```

Expected: Draft PR opens against `master`.

---

## Self-Review Checklist

- Spec coverage:
  - Empty token is covered by helper tests and `token-required`.
  - `/api/health` without auth is covered by helper implementation and tests.
  - `/api/admin/overview` with Bearer auth is covered by helper implementation and tests.
  - `401`, `403`, `404`, health non-2xx, and thrown fetch errors are covered.
  - `Check connection` uses `type="button"` and is covered by panel test proving it does not call `onSave`.
  - Old diagnostic state clears on input changes.
  - Diagnostic results stay out of `sessionStorage`.

- Scope:
  - No backend endpoint changes.
  - No auth model changes.
  - No AWS, production, Nginx, or deployment changes.
  - Admin UI remains local / SSH tunnel only.

- Security:
  - Console token is sent only in the Bearer header for `/api/admin/overview`.
  - Console token is not put in URLs.
  - Console token is not rendered outside the existing password input.
  - Tests use fake values only.

- Verification:
  - `git diff --check`
  - `npm run admin:test`
  - `npm run admin:build`
  - `npm test`
