# Admin Dangerous Action Confirmations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add frontend confirmation and clearer result feedback for dangerous or sensitive Admin subscription actions.

**Architecture:** Add a focused `ConfirmActionDialog` presentation component, then wire `SubscriptionsPage` so every table path that would call `disableTenant()` and every temporary-link creation first opens confirmation. Strengthen `ResetTokenDialog` in place without nesting a second modal.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, existing Admin API client.

---

## Pre-Implementation State

Spec is in:

```text
docs/superpowers/specs/2026-05-23-admin-dangerous-action-confirmations-design.md
```

The spec clarification commit `dccecf5 docs: clarify admin action confirmation boundaries` already fixed these review points:

- Admin API calls must not use query tokens.
- Backend-returned generated subscription URLs may still render only as visible-once results after create, reset, or temporary-link generation.
- Any table action that would call `disableTenant()` must go through confirmation, not just `active` rows.

Before implementation, confirm the branch and workspace:

```powershell
git status --short --branch
```

Expected:

```text
## feat/admin-dangerous-action-confirmations...origin/feat/admin-dangerous-action-confirmations
```

## Files

- Create: `admin/src/features/subscriptions/confirm-action-dialog.tsx`
  - Reusable confirmation modal for table-driven actions.
  - Knows only labels, tenant display name, consequence text, tone, pending/error state, and callbacks.
- Modify: `admin/src/features/subscriptions/subscriptions-page.tsx`
  - Replace direct disable and temporary-link table actions with confirmation state.
  - Keep disabled-row enable action direct.
  - Keep visible-once result handling for temporary links.
- Modify: `admin/src/features/subscriptions/reset-token-dialog.tsx`
  - Strengthen consequence copy and confirm button wording.
  - Keep the existing single modal and visible-once result area.
- Modify: `admin/src/test/subscriptions.test.ts`
  - Add confirmation tests for disable, temp-link, reset, and enable direct path.
- No backend, auth, AWS, production, systemd, Nginx, or deployment files should change.

## Task 1: Disable Confirmation

**Files:**
- Create: `admin/src/features/subscriptions/confirm-action-dialog.tsx`
- Modify: `admin/src/features/subscriptions/subscriptions-page.tsx`
- Modify: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Add failing tests for disable confirmation and direct enable**

In `admin/src/test/subscriptions.test.ts`, update the Testing Library import:

```ts
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

Inside `describe("subscription page", () => { ... })`, add these tests after the existing URL-copy test:

```ts
  test("asks for confirmation before disabling and cancel does not call the API", async () => {
    const disableTenant = vi.fn(async (id: string) => tenant({ id, status: "disabled" }));
    const listTenants = vi.fn(async () => [tenant({ status: "expiring" })]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, disableTenant })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Disable subscription"));

    const dialog = screen.getByRole("dialog", { name: /disable subscription/i });
    expect(within(dialog).getByText("real-user")).not.toBeNull();
    expect(within(dialog).getByText(/will not be able to fetch a valid subscription/i)).not.toBeNull();
    expect(disableTenant).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(disableTenant).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /disable subscription/i })).toBeNull();
  });

  test("confirms every table path that would disable a non-disabled subscription", async () => {
    const disableTenant = vi.fn(async (id: string) => tenant({ id, status: "disabled" }));
    const listTenants = vi
      .fn()
      .mockResolvedValueOnce([tenant({ status: "expired" })])
      .mockResolvedValueOnce([tenant({ status: "disabled" })]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, disableTenant })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Disable subscription"));
    const dialog = screen.getByRole("dialog", { name: /disable subscription/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^disable subscription$/i }));

    await waitFor(() => {
      expect(disableTenant).toHaveBeenCalledWith("tenant_1");
    });
    expect(await screen.findByText(/Disabled real-user/i)).not.toBeNull();
    expect(listTenants).toHaveBeenCalledTimes(2);
  });

  test("enables disabled subscriptions directly without danger confirmation", async () => {
    const enableTenant = vi.fn(async (id: string) => tenant({ id, status: "active" }));
    const listTenants = vi
      .fn()
      .mockResolvedValueOnce([tenant({ status: "disabled" })])
      .mockResolvedValueOnce([tenant({ status: "active" })]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, enableTenant })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Enable subscription"));

    await waitFor(() => {
      expect(enableTenant).toHaveBeenCalledWith("tenant_1");
    });
    expect(screen.queryByRole("dialog", { name: /disable subscription/i })).toBeNull();
    expect(await screen.findByText(/Enabled real-user/i)).not.toBeNull();
  });
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: at least the new disable confirmation tests fail because the current table button calls `disableTenant()` directly and no confirmation dialog exists.

- [ ] **Step 3: Create the reusable confirmation dialog**

Create `admin/src/features/subscriptions/confirm-action-dialog.tsx`:

```tsx
export type ConfirmActionTone = "danger" | "default";

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

export function ConfirmActionDialog({
  open,
  title,
  tenantName,
  consequence,
  confirmLabel,
  tone = "default",
  pending = false,
  error = "",
  onCancel,
  onConfirm
}: ConfirmActionDialogProps) {
  if (!open) return null;

  const confirmClassName = tone === "danger" ? "danger-button" : "primary-button";

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title">
        <div className="modal-header">
          <div>
            <h3 id="confirm-action-title">{title}</h3>
            <p className="muted">{tenantName}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel} disabled={pending}>
            Close
          </button>
        </div>

        <p className="modal-copy">{consequence}</p>
        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button className={confirmClassName} type="button" onClick={onConfirm} disabled={pending}>
            {pending ? "Working" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Wire disable confirmation in `SubscriptionsPage`**

In `admin/src/features/subscriptions/subscriptions-page.tsx`, add the import:

```ts
import { ConfirmActionDialog } from "./confirm-action-dialog";
```

Add state near the existing modal/action state:

```ts
  const [disableTarget, setDisableTarget] = useState<SubscriptionTenant | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
```

Replace the current `toggleStatus(row)` with:

```ts
  function requestStatusToggle(row: SubscriptionTenant) {
    setActionError("");
    setActionNotice("");
    setConfirmError("");
    if (row.status === "disabled") {
      void enableSubscription(row);
      return;
    }
    setDisableTarget(row);
  }

  async function enableSubscription(row: SubscriptionTenant) {
    setActionError("");
    setActionNotice("");
    try {
      await apiClient.enableTenant(row.id);
      setActionNotice(`Enabled ${row.displayName}.`);
      await refreshRows();
    } catch (requestError) {
      setActionError(errorMessage(requestError));
    }
  }

  async function confirmDisable() {
    if (!disableTarget) return;

    const target = disableTarget;
    setConfirmPending(true);
    setConfirmError("");
    try {
      await apiClient.disableTenant(target.id);
      setDisableTarget(null);
      setActionNotice(`Disabled ${target.displayName}.`);
      await refreshRows();
    } catch (requestError) {
      setConfirmError(errorMessage(requestError));
    } finally {
      setConfirmPending(false);
    }
  }

  function cancelDisable() {
    if (confirmPending) return;
    setDisableTarget(null);
    setConfirmError("");
  }
```

Render success feedback after the existing error alerts:

```tsx
      {actionNotice ? <div className="alert">{actionNotice}</div> : null}
```

Change the status button handler:

```tsx
                      onClick={() => requestStatusToggle(row)}
```

Render the dialog near the existing `RenewSubscriptionDialog` and `ResetTokenDialog`:

```tsx
      <ConfirmActionDialog
        open={Boolean(disableTarget)}
        title="Disable subscription"
        tenantName={disableTarget?.displayName ?? ""}
        consequence="This user will not be able to fetch a valid subscription until the subscription is enabled again."
        confirmLabel="Disable subscription"
        tone="danger"
        pending={confirmPending}
        error={disableTarget ? confirmError : ""}
        onCancel={cancelDisable}
        onConfirm={() => void confirmDisable()}
      />
```

- [ ] **Step 5: Run the targeted tests and verify they pass**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: subscription page tests pass, including disable cancel, disable confirm, and enable direct path.

- [ ] **Step 6: Commit the disable confirmation work**

Run:

```powershell
git add admin/src/features/subscriptions/confirm-action-dialog.tsx admin/src/features/subscriptions/subscriptions-page.tsx admin/src/test/subscriptions.test.ts
git commit -m "feat: confirm subscription disable actions"
```

## Task 2: Temporary Link Confirmation

**Files:**
- Modify: `admin/src/features/subscriptions/subscriptions-page.tsx`
- Modify: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Add failing tests for temporary-link cancel and confirm**

In `admin/src/test/subscriptions.test.ts`, inside `describe("subscription page", () => { ... })`, add:

```ts
  test("asks for confirmation before creating a temporary link and cancel does not call the API", async () => {
    const createTempLink = vi.fn(async (id: string) => ({
      tenantId: id,
      tokenPrefix: "pgtmp_prefix",
      expiresAt: "2026-05-23T00:00:00.000Z",
      subscriptionUrl: "temp-url"
    }));
    const listTenants = vi.fn(async () => [tenant()]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, createTempLink })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Create temporary link"));

    const dialog = screen.getByRole("dialog", { name: /create temporary link/i });
    expect(within(dialog).getByText(/temporary visible-once link/i)).not.toBeNull();
    expect(within(dialog).getByText(/does not replace the primary token/i)).not.toBeNull();
    expect(createTempLink).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(createTempLink).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /create temporary link/i })).toBeNull();
  });

  test("confirms temporary link generation and keeps visible-once result behavior", async () => {
    const createTempLink = vi.fn(async (id: string) => ({
      tenantId: id,
      tokenPrefix: "pgtmp_prefix",
      expiresAt: "2026-05-23T00:00:00.000Z",
      subscriptionUrl: "temp-url"
    }));
    const listTenants = vi
      .fn()
      .mockResolvedValueOnce([tenant()])
      .mockResolvedValueOnce([tenant()]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, createTempLink })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Create temporary link"));
    const dialog = screen.getByRole("dialog", { name: /create temporary link/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^create temporary link$/i }));

    await waitFor(() => {
      expect(createTempLink).toHaveBeenCalledWith("tenant_1");
    });
    expect(await screen.findByText("Temporary link for real-user")).not.toBeNull();
    expect(screen.getByText("temp-url")).not.toBeNull();
    expect(listTenants).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: the new temporary-link tests fail because the current table button calls `createTempLink()` directly.

- [ ] **Step 3: Wire temporary-link confirmation in `SubscriptionsPage`**

Add state near the disable confirmation state:

```ts
  const [tempLinkTarget, setTempLinkTarget] = useState<SubscriptionTenant | null>(null);
```

Replace the current `createTempLink(row)` function with:

```ts
  function requestTempLink(row: SubscriptionTenant) {
    setActionError("");
    setActionNotice("");
    setConfirmError("");
    setDisableTarget(null);
    setTempLinkTarget(row);
  }

  async function confirmTempLink() {
    if (!tempLinkTarget) return;

    const target = tempLinkTarget;
    setConfirmPending(true);
    setConfirmError("");
    try {
      const result = await apiClient.createTempLink(target.id);
      setTempLinkTarget(null);
      setVisibleOnce({ title: `Temporary link for ${target.displayName}`, url: result.subscriptionUrl });
      await refreshRows();
    } catch (requestError) {
      setConfirmError(errorMessage(requestError));
    } finally {
      setConfirmPending(false);
    }
  }

  function cancelTempLink() {
    if (confirmPending) return;
    setTempLinkTarget(null);
    setConfirmError("");
  }
```

Update `requestStatusToggle(row)` so opening disable confirmation closes any temporary-link confirmation:

```ts
  function requestStatusToggle(row: SubscriptionTenant) {
    setActionError("");
    setActionNotice("");
    setConfirmError("");
    setTempLinkTarget(null);
    if (row.status === "disabled") {
      void enableSubscription(row);
      return;
    }
    setDisableTarget(row);
  }
```

Change the temporary-link button handler:

```tsx
                    <button className="icon-button" type="button" onClick={() => requestTempLink(row)} title="Create temporary link">
                      <Link aria-hidden="true" />
                    </button>
```

Render the temporary-link dialog next to the disable dialog:

```tsx
      <ConfirmActionDialog
        open={Boolean(tempLinkTarget)}
        title="Create temporary link"
        tenantName={tempLinkTarget?.displayName ?? ""}
        consequence="This creates a temporary visible-once subscription link for this user. It does not replace the primary token."
        confirmLabel="Create temporary link"
        pending={confirmPending}
        error={tempLinkTarget ? confirmError : ""}
        onCancel={cancelTempLink}
        onConfirm={() => void confirmTempLink()}
      />
```

- [ ] **Step 4: Run the targeted tests and verify they pass**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: disable, enable, and temporary-link tests pass.

- [ ] **Step 5: Commit the temporary-link confirmation work**

Run:

```powershell
git add admin/src/features/subscriptions/subscriptions-page.tsx admin/src/test/subscriptions.test.ts
git commit -m "feat: confirm temporary subscription links"
```

## Task 3: Reset Token Dialog Copy And Confirmation Semantics

**Files:**
- Modify: `admin/src/features/subscriptions/reset-token-dialog.tsx`
- Modify: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Add failing tests for reset cancel and confirm**

In `admin/src/test/subscriptions.test.ts`, add this import:

```ts
import { ResetTokenDialog } from "../features/subscriptions/reset-token-dialog";
```

Add a new test group before `describe("overview and nodes pages", () => { ... })`:

```ts
describe("reset token dialog", () => {
  test("shows reset consequences and cancel does not call reset", () => {
    const onReset = vi.fn(async (id: string) => ({
      tenant: tenant({ id }),
      subscriptionUrl: "reset-url"
    }));
    const onClose = vi.fn();

    render(createElement(ResetTokenDialog, {
      tenant: tenant(),
      onClose,
      onReset
    }));

    expect(screen.getByText(/invalidates the previous subscription URL/i)).not.toBeNull();
    expect(screen.getByText(/visible once/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onReset).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("confirms reset and keeps visible-once result behavior", async () => {
    const onReset = vi.fn(async (id: string) => ({
      tenant: tenant({ id, tokenPrefix: "pgsub_newpre" }),
      subscriptionUrl: "reset-url"
    }));

    render(createElement(ResetTokenDialog, {
      tenant: tenant(),
      onClose: vi.fn(),
      onReset
    }));

    fireEvent.click(screen.getByRole("button", { name: /confirm reset token/i }));

    await waitFor(() => {
      expect(onReset).toHaveBeenCalledWith("tenant_1");
    });
    expect(await screen.findByText("reset-url")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: reset tests fail because the current copy and button still use the weaker wording.

- [ ] **Step 3: Strengthen `ResetTokenDialog` in place**

In `admin/src/features/subscriptions/reset-token-dialog.tsx`, replace the modal copy block with:

```tsx
        <p className="modal-copy">
          Resetting this token invalidates the previous subscription URL. A replacement URL is generated after confirmation and is visible once in this dialog.
        </p>
```

Replace the confirm button text block with:

```tsx
          <button className="danger-button" type="button" onClick={() => void resetToken()} disabled={pending}>
            {pending ? "Resetting" : "Confirm reset token"}
          </button>
```

Replace the visible-once result block with:

```tsx
        {result ? (
          <div className="visible-once">
            <strong>New visible-once URL</strong>
            <span>Copy this URL now. It will not be shown again after closing this dialog.</span>
            <code>{result.subscriptionUrl}</code>
          </div>
        ) : null}
```

- [ ] **Step 4: Run the targeted tests and verify they pass**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: all tests in `subscriptions.test.ts` pass.

- [ ] **Step 5: Commit reset dialog changes**

Run:

```powershell
git add admin/src/features/subscriptions/reset-token-dialog.tsx admin/src/test/subscriptions.test.ts
git commit -m "feat: clarify reset token confirmation"
```

## Task 4: Full Verification And Draft PR

**Files:**
- Verify all changed files.
- Create or update PR metadata.

- [ ] **Step 1: Review the cumulative diff**

Run:

```powershell
git diff origin/master...HEAD -- admin/src/features/subscriptions admin/src/test/subscriptions.test.ts docs/superpowers/specs/2026-05-23-admin-dangerous-action-confirmations-design.md
```

Check:

- No backend files changed.
- No AWS, production, Nginx, systemd, or deployment files changed.
- No real console tokens, subscription tokens, subscription URLs, production secrets, or customer data were added.
- Admin API calls still use existing client methods and Bearer auth.
- Generated subscription URLs only appear as intentionally fake test values such as `temp-url` and `reset-url`.

- [ ] **Step 2: Run whitespace validation**

Run:

```powershell
git diff --check origin/master...HEAD
```

Expected: no output and exit code `0`.

- [ ] **Step 3: Run Admin frontend tests**

Run:

```powershell
npm run admin:test
```

Expected: all Admin Vitest tests pass.

- [ ] **Step 4: Run Admin build**

Run:

```powershell
npm run admin:build
```

Expected: TypeScript and Vite production build pass.

- [ ] **Step 5: Run backend tests**

Run:

```powershell
npm test
```

Expected: backend test suite passes. Backend code should be unchanged, but this remains part of the project release gate.

- [ ] **Step 6: Push the implementation branch**

Run:

```powershell
git push origin feat/admin-dangerous-action-confirmations
```

- [ ] **Step 7: Create or update a Draft PR**

If no PR exists for this branch, create one:

```powershell
gh pr create --repo gaoyi1020-web/proxy-gateway-minimal --draft --base master --head feat/admin-dangerous-action-confirmations --title "[feat] add admin dangerous action confirmations" --body @"
## Summary
- Adds frontend confirmation for subscription disable actions.
- Adds frontend confirmation for temporary subscription links.
- Strengthens reset-token dialog copy and confirm button semantics.

## Scope
- Frontend-only Admin UI change.
- No backend endpoint changes.
- No auth model changes.
- No AWS, production, Nginx, systemd, or deployment changes.
- Generated URLs remain visible-once only.

## Test Plan
- git diff --check origin/master...HEAD
- npm run admin:test
- npm run admin:build
- npm test

## Notes
- GitHub-hosted Actions may still be blocked by the account billing / spending-limit issue. If that happens before job steps run, record the local validation as a temporary quota waiver.
"@
```

If a PR already exists, update it with the same summary and test-plan content.

- [ ] **Step 8: Inspect GitHub Actions status**

Run:

```powershell
gh run list --repo gaoyi1020-web/proxy-gateway-minimal --branch feat/admin-dangerous-action-confirmations --limit 3 --json databaseId,status,conclusion,name,headSha,createdAt,url
```

If the latest run fails before steps start, inspect:

```powershell
$latestRun = gh run list --repo gaoyi1020-web/proxy-gateway-minimal --branch feat/admin-dangerous-action-confirmations --limit 1 --json databaseId --jq '.[0].databaseId'
gh run view $latestRun --repo gaoyi1020-web/proxy-gateway-minimal --json conclusion,status,jobs
```

If `jobs[].steps` is empty and logs are unavailable, document it as the known GitHub Actions billing / spending-limit blocker. Do not treat that as a workflow or test failure.

## Final Acceptance Checklist

- [ ] Any table action that would call `disableTenant()` opens confirmation before API call.
- [ ] Cancel disable does not call `disableTenant()`.
- [ ] Confirm disable calls `disableTenant()` and refreshes rows.
- [ ] Enable subscription remains direct and documented as non-danger.
- [ ] Temporary link opens confirmation before `createTempLink()`.
- [ ] Cancel temporary link does not call `createTempLink()`.
- [ ] Confirm temporary link calls `createTempLink()` and shows the backend-returned visible-once URL.
- [ ] Reset token dialog states previous URL invalidation.
- [ ] Reset token dialog states new URL is visible once.
- [ ] Reset cancel does not call `resetToken()`.
- [ ] Reset confirm calls `resetToken()` and shows the backend-returned visible-once URL.
- [ ] Admin API calls do not use query-string console tokens.
- [ ] No generated URL is persisted to `sessionStorage`.
- [ ] No historical full subscription URL is displayed.
- [ ] No backend endpoint changes.
- [ ] No auth model changes.
- [ ] No AWS, production, Nginx, systemd, or deployment changes.
- [ ] `git diff --check origin/master...HEAD` passes.
- [ ] `npm run admin:test` passes.
- [ ] `npm run admin:build` passes.
- [ ] `npm test` passes.
