# Admin Console Real API Integration Design

## Goal

Connect the existing `admin/` Vite React shell to the real subscription-management backend without redesigning the UI shell or exposing the admin UI publicly.

## Current State

- `master` now includes subscription hardening from PR #6.
- The live AWS Singapore gateway exposes only `/api/health` and `/sub/clash.yaml`; public `/`, `/index.html`, and `/api/admin/*` return `404`.
- `feat/admin-console-shell` contains a separate `admin/` Vite React app with mock subscription data and workflow tests.
- PR #3 is still open as a Draft and should remain Draft while the UI is being wired to real APIs.

## Scope

The integration should be narrow:

- Keep the existing admin layout, navigation, pages, and dialogs.
- Replace the mock client boundary with a real HTTP client.
- Keep mock data only where it is useful for tests or explicit offline fixtures.
- Keep the UI local-only. It should be run with `npm run admin:dev` on `127.0.0.1` or through an SSH tunnel to the backend. It must not be added to the public Nginx gateway.
- Preserve the legacy `public/index.html` console behavior in the package, but do not expose it through public Nginx.

## Backend API Contract

The UI should call these existing endpoints:

| UI Action | Method | Path |
|---|---|---|
| List tenants | `GET` | `/api/admin/subscriptions` |
| Create tenant | `POST` | `/api/admin/subscriptions` |
| Renew tenant | `POST` | `/api/admin/subscriptions/:id/renew` |
| Disable tenant | `POST` | `/api/admin/subscriptions/:id/disable` |
| Enable tenant | `POST` | `/api/admin/subscriptions/:id/enable` |
| Reset primary token | `POST` | `/api/admin/subscriptions/:id/reset-token` |
| Create temporary link | `POST` | `/api/admin/subscriptions/:id/temp-link` |
| List nodes | `GET` | `/api/admin/nodes` |
| Overview | `GET` | `/api/admin/overview` |

Requests must include the console token using an `Authorization: Bearer <token>` header. The client should not put the console token in the query string.

## Admin Client Boundary

Create a focused client module under `admin/src/features/subscriptions/` that owns:

- request URL construction from an admin API base URL;
- bearer token attachment;
- JSON parsing and normalized error messages;
- typed methods for each subscription action.

Configuration should be simple and explicit:

- `VITE_ADMIN_API_BASE_URL` defaults to `http://127.0.0.1:3456`.
- The console token is entered in the UI and kept in component state or `sessionStorage`.
- Do not hardcode production tokens, subscription URLs, or AWS secrets into the frontend.

## UI Behavior

The shell should keep the current page structure:

- Overview loads `/api/admin/overview`.
- Subscription users load `/api/admin/subscriptions`.
- Nodes load `/api/admin/nodes`.
- Create, renew, disable, enable, reset token, and temporary link actions call the backend, then refresh the affected page data.

Token handling:

- Primary subscription URLs and temporary subscription URLs are visible only in the result dialog or toast after create/reset/temp-link.
- The table should show only `tokenPrefix`.
- Copy actions should copy only the visible-once URL returned by the operation. For existing rows, the UI must not fabricate a full URL from `tokenPrefix`.

Error handling:

- If the console token is missing, show a local auth/configuration prompt instead of calling the API.
- If the backend returns `401` or `403`, show a concise authentication/access error.
- If public Nginx returns `404` for admin APIs, show guidance that the UI must be used from local backend access or an SSH tunnel.
- Keep the page usable after an action failure; do not drop existing table data.

## Access Model

The admin UI is an operator tool, not a public product page.

- Development access: run Vite locally on `127.0.0.1`.
- Remote operations access: use an SSH tunnel to the server app port, then point `VITE_ADMIN_API_BASE_URL` to the local tunnel endpoint.
- Public Nginx must continue returning `404` for the static console UI and `/api/admin/*`.

## Testing

Frontend tests should cover the client boundary and the main workflows:

- list tenants maps backend rows into the UI type;
- create tenant returns the visible-once subscription URL;
- reset token returns the visible-once subscription URL;
- temporary link returns a visible-once temporary URL;
- existing-row copy does not fabricate a URL when none was returned by the backend;
- authentication errors surface as operator-readable messages.

Run these checks before updating PR #3:

```powershell
npm test
npm run admin:test
npm run admin:build
```

Use browser verification for the Vite app after the client is wired:

- desktop viewport: subscription table loads real backend data;
- mobile viewport: navigation and dialogs remain usable;
- no public AWS URL is required for admin UI verification.

## Out Of Scope

- Public deployment of the admin UI.
- Domain HTTPS exposure for admin pages.
- New authentication system beyond the existing console token.
- Billing, usage metering, or traffic analytics.
- Redesigning the admin shell visual language.
