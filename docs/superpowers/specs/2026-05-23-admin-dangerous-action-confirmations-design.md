# Admin Dangerous Action Confirmations Design

## Goal

Improve the Admin UI operator workflow by adding clear confirmation and result feedback around high-risk subscription actions.

This phase should reduce accidental operator mistakes without changing the backend, auth model, AWS runtime, production deployment, Nginx public boundary, or Admin UI exposure model.

## Current State

- `admin/src/features/subscriptions/subscriptions-page.tsx` renders per-tenant action buttons in the subscription table.
- `createTempLink(row)` currently calls `apiClient.createTempLink(row.id)` directly and then shows the generated visible-once URL.
- `toggleStatus(row)` currently calls `apiClient.disableTenant(row.id)` directly for non-disabled tenants and `apiClient.enableTenant(row.id)` directly for disabled tenants.
- `ResetTokenDialog` already exists, but the destructive reset path should make the consequence and confirm action more explicit.
- Existing visible-once behavior is correct: full subscription URLs are only shown immediately after create, reset, or temporary-link generation.

## Scope

In scope:

- Frontend-first Admin UI changes under `admin/src/`.
- Add a reusable normal confirmation dialog for dangerous or sensitive subscription actions.
- Require confirmation before disabling an active subscription.
- Strengthen the existing reset-token dialog itself rather than nesting another modal.
- Require a lighter confirmation before creating a temporary subscription link.
- Add or update frontend tests for cancel and confirm paths.

Out of scope:

- Backend endpoint changes.
- Auth model changes.
- Permission roles, audit logs, or approval workflows.
- AWS, production, systemd, Nginx, or deployment changes.
- Public exposure of the Admin UI.
- Showing historical full subscription URLs.
- Persisting generated subscription URLs, temporary links, or confirmation results in `sessionStorage`.

## Confirmation Model

Use normal confirmation dialogs for high-risk admin actions.

The dialog must show:

- target tenant `displayName`;
- action name;
- concrete consequence;
- `Cancel` button;
- explicit confirm action button.

Do not require typing tenant names in this phase. That is a stronger workflow better suited to a future multi-operator UI with audit logs and stricter role boundaries.

Do not use two-step inline table buttons for reset or disable. They are lightweight, but they cannot carry enough consequence text for actions that affect subscriber access or subscription URL validity.

## Action Design

### Disable Subscription

Any table action that would call `disableTenant(id)` must no longer execute directly from the table button.

Flow:

1. Operator clicks the disable action for a tenant whose current table path would call `disableTenant(id)`.
2. UI opens a danger confirmation dialog.
3. Dialog states that the selected user will no longer be able to fetch a valid subscription until re-enabled.
4. Cancel closes the dialog and does not call the API.
5. Confirm calls the existing `apiClient.disableTenant(id)`.
6. On success, the table refreshes and the UI shows non-sensitive success feedback.

Enable subscription is not part of the danger confirmation requirement. It restores access rather than revoking it, so it may continue using the existing direct path or receive only ordinary success feedback.

### Reset Token

The existing `ResetTokenDialog` should be strengthened directly. Do not open a second nested confirmation modal from inside it.

Flow:

1. Operator opens the reset token dialog for a tenant.
2. Dialog explains that resetting the token invalidates the previous subscription URL.
3. Dialog explains that the new subscription URL is visible once after confirmation.
4. Cancel closes the dialog and does not call the API.
5. Confirm button uses a danger style and explicit copy such as `Confirm reset token`.
6. Confirm calls the existing `apiClient.resetToken(id)`.
7. The new URL remains visible-once only in the current result area.

The reset result must not be persisted to `sessionStorage`, logs, docs, or any hidden browser storage.

### Temporary Link

Temporary link creation is sensitive but not destructive. It should use the same confirmation-dialog pattern with lower-risk tone and non-danger button copy.

Flow:

1. Operator clicks the temporary-link action for a tenant.
2. UI opens a normal confirmation dialog.
3. Dialog explains that this creates a temporary visible-once link and does not replace the primary token.
4. Cancel closes the dialog and does not call the API.
5. Confirm calls the existing `apiClient.createTempLink(id)`.
6. The generated URL remains visible-once in the existing result area.

The dialog should not imply that a temporary link is a primary subscription URL.

## Component Design

### ConfirmActionDialog

Add a focused reusable dialog component, likely under:

```text
admin/src/features/subscriptions/confirm-action-dialog.tsx
```

Suggested props:

```ts
type ConfirmActionTone = "danger" | "default";

type ConfirmActionDialogProps = {
  open: boolean;
  title: string;
  tenantName: string;
  consequence: string;
  confirmLabel: string;
  tone?: ConfirmActionTone;
  pending?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};
```

The component should reuse the existing `modal-backdrop`, `modal-panel`, `modal-header`, `modal-copy`, `modal-actions`, `ghost-button`, `primary-button`, and `danger-button` styles where practical.

It should not know about API clients, tenant IDs, tokens, or generated URLs. It only renders the confirmation UI and delegates actions through callbacks.

### SubscriptionsPage

`SubscriptionsPage` should own the selected action state for table-driven confirmations:

- pending disable target;
- pending temporary-link target;
- per-action pending state;
- per-action error or reuse existing `actionError` where it stays clear.

Disable and temporary-link table buttons should open confirmation state instead of calling the API directly.

Confirm callbacks should call the same existing API methods:

- `apiClient.disableTenant(id)`
- `apiClient.createTempLink(id)`

After successful confirm:

- close the confirmation dialog;
- refresh rows when needed;
- show a non-sensitive status message or visible-once result.

### ResetTokenDialog

`ResetTokenDialog` should keep its existing modal shape. The implementation should improve the copy and confirm button semantics in place:

- consequence copy explicitly names old URL invalidation;
- visible-once copy explicitly states the new URL is shown only this time;
- confirm button uses danger styling and wording such as `Confirm reset token`;
- cancel does not call `onReset`.

Do not introduce a nested `ConfirmActionDialog` inside `ResetTokenDialog`.

## Data Flow

The feature should not add new backend data, frontend persistence, or API contracts.

All confirmed actions continue using existing admin API client methods:

- `disableTenant(id)`
- `enableTenant(id)`
- `resetToken(id)`
- `createTempLink(id)`

Generated subscription URLs remain transient visible-once values in component state.

## Error Handling

- API failures should use the existing operator-readable error mapping from `api-client.ts`.
- Cancel paths must clear only confirmation UI state, not loaded table data.
- Confirm failures should keep the dialog open or show an error where the operator can see the failed action.
- Pending confirm buttons should be disabled while the request is in flight.
- A failed disable or temp-link confirmation should not clear an existing visible-once result unless a new result is successfully generated.

## Security And Privacy

- Do not render historical full subscription URLs.
- Do not store generated URLs in `sessionStorage`.
- Do not add raw tokens, subscription URLs, or production values to tests or docs.
- Do not put console tokens into query strings for Admin API calls.
- Generated subscription URLs may be rendered only as backend-returned visible-once results after create, reset, or temporary-link generation.
- Do not change backend auth boundaries.
- Keep Admin UI local-only or SSH-tunnel-only.

## Testing

Add or update frontend tests under `admin/src/test/`.

Required coverage:

- Any table action that would call `disableTenant()` opens confirmation before API call.
- Cancel disable does not call `disableTenant()`.
- Confirm disable calls existing `disableTenant()` and refreshes rows.
- Enable subscription is documented as non-danger and remains unchanged or covered by an explicit direct-path test.
- Reset token dialog clearly renders old URL invalidation and visible-once new URL consequence text.
- Cancel reset does not call `resetToken()`.
- Confirm reset calls existing `resetToken()`.
- Temporary link opens confirmation before API call.
- Cancel temporary link does not call `createTempLink()`.
- Confirm temporary link calls existing `createTempLink()`.
- Reset and temporary-link visible-once result behavior remains unchanged.

Stage close-out commands:

```powershell
git diff --check origin/master...HEAD
npm run admin:test
npm run admin:build
npm test
```

`npm test` is included even though this phase should be frontend-only, because the project keeps backend tests in the release-gate habit.

## Acceptance Criteria

- Any table action that would call `disableTenant()` no longer executes directly from the table button.
- Confirm disable calls the existing `disableTenant()` API client method.
- Cancel disable does not call the API.
- Enable subscription remains unchanged or is explicitly documented as non-danger.
- Reset token dialog clearly states old URL invalidation and visible-once new URL behavior.
- Confirm reset calls the existing `resetToken()` API client method.
- Cancel reset does not call the API.
- Temporary link generation opens confirmation before calling `createTempLink()`.
- Confirm temporary link calls the existing `createTempLink()` API client method.
- Cancel temporary link does not call the API.
- Reset and temporary-link generated URL behavior remains visible-once.
- No backend endpoint changes.
- No auth model changes.
- No AWS, production, Nginx, or deployment changes.
- No historical full subscription URL is shown.
- No generated URL is persisted to `sessionStorage`.
