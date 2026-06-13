# Admin Connection Health Design

## Goal

Add a narrow Admin UI connection health check so an operator can tell whether the configured API base URL and console token can actually reach the local or SSH-tunneled admin backend.

The feature should improve local operator workflow without changing the backend auth model, public Nginx exposure, AWS runtime, or production deployment process.

## Current State

- `admin/src/App.tsx` owns the `ConnectionPanel`.
- The panel currently saves only `baseUrl` and `consoleToken`.
- `admin/src/features/subscriptions/api-client.ts` already normalizes admin API errors for protected `/api/admin/*` calls.
- `/api/health` is public and should not require a console token.
- `/api/admin/overview` is protected by Bearer console token auth and the admin source-IP allowlist.
- Public Nginx intentionally returns `404` for `/api/admin/*`; the Admin UI remains local or SSH tunnel only.

## Scope

In scope:

- Pure frontend implementation under `admin/src/`.
- Add a connection-health helper that checks `/api/health` without requiring a console token.
- Use `/api/admin/overview` to validate Bearer token and admin API access.
- Add UI state to the existing connection panel for checking, success, and actionable failure messages.
- Add frontend tests for the helper and the connection panel behavior.

Out of scope:

- Backend endpoint changes.
- Auth model changes.
- AWS, production, systemd, Nginx, or deployment changes.
- Public exposure of the Admin UI.
- Persisting diagnostic results.
- Displaying or logging raw console tokens.

## User Flow

1. Operator enters or edits the API base URL and console token.
2. Operator saves the connection settings.
3. Operator clicks a connection check action in the connection panel.
4. The UI first checks whether the console token is present.
5. The UI calls `/api/health` against the configured base URL.
6. If health passes, the UI calls `/api/admin/overview` with `Authorization: Bearer <console-token>`.
7. The panel shows a concise result that distinguishes reachability, token, allowlist, public gateway, and network/CORS failures.

The check action should not run automatically on every keystroke. It should be explicit so it does not spam the backend or create confusing transient states while the operator is still editing settings.

## Component Design

### ConnectionPanel

Keep `ConnectionPanel` in `admin/src/App.tsx` for this PR unless implementation pressure shows it needs extraction. The component can own local state for:

- `baseUrl`
- `consoleToken`
- `saved`
- `checking`
- `connectionHealth`

The panel should render:

- current API base URL input;
- console token password input;
- existing save button;
- a new check button;
- one compact status area below the form.

The check button should be disabled while a check is already running. The status area should fit the existing utilitarian admin style and should not expose raw token values.

### Connection Health Helper

Create:

```text
admin/src/features/subscriptions/connection-health.ts
```

This helper should not depend on the normal authenticated `request()` function because `/api/health` is intentionally public. It should own:

- base URL normalization for diagnostics, aligned with `api-client.ts`;
- `GET /api/health` without auth;
- `GET /api/admin/overview` with Bearer auth only after token presence and health success;
- conversion of fetch responses and thrown fetch errors into stable UI states.

The helper can export:

```ts
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

export async function checkAdminConnectionHealth(input: {
  baseUrl: string;
  consoleToken: string;
  fetcher?: typeof fetch;
}): Promise<ConnectionHealthResult>;
```

## Status Mapping

The status mapping should be deterministic:

| Condition | Result |
| --- | --- |
| Empty console token | `token-required` |
| `/api/health` fetch throws | `network-error` |
| `/api/health` returns non-2xx | `backend-health-unreachable` |
| `/api/health` returns 2xx and `/api/admin/overview` returns 2xx | `connected` |
| `/api/admin/overview` returns `401` | `token-invalid` |
| `/api/admin/overview` returns `403` | `source-blocked` |
| `/api/admin/overview` returns `404` | `public-gateway-blocked` |
| `/api/admin/overview` fetch throws | `network-error` |
| Other `/api/admin/overview` non-2xx | `backend-health-unreachable` |

The `404` mapping should explain that the operator is likely pointing at the public gateway or a path where admin APIs are not exposed. It should not tell the operator to expose admin APIs publicly.

## Data Flow

The diagnostic helper should only return derived status and message data. It should not write to `sessionStorage`, mutate global app state, or cache tokens.

`saveAdminSession()` remains the only persistence path for `baseUrl` and `consoleToken`.

## Error Handling

The UI should distinguish:

- missing token before any admin call;
- backend/base URL unreachable at the public health endpoint;
- invalid token from `401`;
- source IP or allowlist denial from `403`;
- public gateway or wrong path from `404`;
- browser/network/CORS failure from thrown `fetch`.

The UI should keep the existing saved settings visible after a failure. A failed diagnostic should not clear form fields, drop loaded subscription data, or navigate away.

## Security And Privacy

- Do not put console tokens in URLs.
- Do not log console tokens.
- Do not render the console token outside the password input.
- Do not store health results in `sessionStorage`.
- Do not add production hostnames, real subscription URLs, or real tokens to tests or docs.
- Keep Admin UI usage local-only or SSH-tunnel-only.

## Testing

Add frontend tests in `admin/src/test/subscriptions.test.ts` or a focused new test file under `admin/src/test/`.

Required test coverage:

- Empty token returns `token-required` and does not call `/api/admin/overview`.
- `/api/health` fetch failure maps to `network-error`.
- `/api/health` non-2xx maps to `backend-health-unreachable`.
- Health 2xx plus overview 2xx maps to `connected`.
- Overview `401` maps to `token-invalid`.
- Overview `403` maps to `source-blocked`.
- Overview `404` maps to `public-gateway-blocked`.
- The connection panel can render a successful diagnostic result.

Stage close-out commands:

```powershell
git diff --check
npm run admin:test
npm run admin:build
npm test
```

`npm test` is included even though the backend should not change, to keep the project release-gate habit consistent.

## Acceptance Criteria

- The implementation is frontend-only.
- No backend endpoint is added.
- No AWS, production, Nginx, or deployment files are changed.
- `/api/health` check works without a token.
- `/api/admin/overview` check uses only Bearer auth.
- The operator can identify connected, token invalid, source blocked, public gateway blocked, backend health unreachable, and network/CORS failure states.
- Diagnostic results are not persisted.
- Tests cover the status mapping and at least one panel rendering path.
