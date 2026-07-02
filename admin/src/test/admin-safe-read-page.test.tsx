import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  NodeBandwidthSummary,
  PortalAccessRequestSummary,
  SubscriptionUsageMonitor
} from "../features/subscriptions/types";
import { AdminSafeReadPage } from "../pages/admin-safe-read-page";

afterEach(() => {
  cleanup();
});

describe("admin safe-read route pages", () => {
  test("renders User Management with Figma user table, filters, gated actions, and redacted details", () => {
    render(<AdminSafeReadPage page="userManagement" />);

    const breadcrumb = screen.getByLabelText("User Management breadcrumb");
    expect(within(breadcrumb).getByText("Home")).not.toBeNull();
    expect(within(breadcrumb).getByText("User Management")).not.toBeNull();
    expect(screen.getByPlaceholderText("Search User ID, name, email...")).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Status All" }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Risk All" }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Plan All" }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Created Time Last 24h" }).disabled).toBe(true);
    expect(within(screen.getByLabelText("User Management gated actions")).getByRole<HTMLButtonElement>("button", { name: "Create User · Gated" }).disabled).toBe(true);
    expect(screen.getByRole("table", { name: "User Management redacted table" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "USER ID" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "DISPLAY NAME" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "EMAIL" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "PLAN" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "STATUS" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "RISK" })).not.toBeNull();
    expect(screen.getByText("Showing 1-8 of 8")).not.toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();
    expect(document.querySelectorAll(".admin-user-management-table .new-console-row-placeholder")).toHaveLength(12);
    expect(document.querySelectorAll(".ops-metric-card")).toHaveLength(0);
    expect(document.querySelector("[data-figma-component='UserManagementTableCard']")).not.toBeNull();
    expect(document.querySelector("[data-figma-component='DetailPanel']")).not.toBeNull();

    const initialDetail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(initialDetail).getByText("User Details")).not.toBeNull();
    expect(within(initialDetail).getAllByText("user_001")).toHaveLength(1);
    expect(within(initialDetail).getAllByText("User Alpha")).toHaveLength(1);
    expect(within(initialDetail).getAllByText("[REDACTED_EMAIL]").length).toBeGreaterThanOrEqual(1);
    expect(within(initialDetail).getByText("2026-01-18 13:42")).not.toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "User Access Logs" })).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "User Operation Logs" })).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "Revoke Access · Gated" })).toBeNull();
    const accountActions = within(initialDetail).getByLabelText("Selected user account dry-run actions");
    expect(within(accountActions).getByText("Account Actions")).not.toBeNull();
    expect(within(accountActions).queryByText("Read User Detail")).toBeNull();
    expect(within(accountActions).queryByText("Safe read available for the selected account row.")).toBeNull();
    expect(within(accountActions).queryByRole("button", { name: "Create User · Gated" })).toBeNull();
    expect(within(accountActions).getByRole<HTMLButtonElement>("button", { name: "Edit" }).disabled).toBe(false);
    expect(within(accountActions).queryByRole("button", { name: "Disable" })).toBeNull();
    expect(within(accountActions).getByRole<HTMLButtonElement>("button", { name: "Delete" }).disabled).toBe(false);
    expect(within(accountActions).queryByText("Risk A")).toBeNull();
    expect(within(accountActions).queryByText(/Requires create-user|Hard delete remains unavailable|permission contract/i)).toBeNull();

    const targetRow = screen.getByRole("row", { name: /user_management_008 user_008 User Theta Pending Medium/ });
    expect(within(targetRow).getByText("Team")).not.toBeNull();
    expect(within(targetRow).getByText("Pending")).not.toBeNull();

    fireEvent.click(targetRow);

    const updatedDetail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(updatedDetail).getAllByText("user_008")).toHaveLength(1);
    expect(within(updatedDetail).getByText("User Theta")).not.toBeNull();
    expect(within(updatedDetail).getByText("Team")).not.toBeNull();
    expect(within(updatedDetail).getByText("Pending")).not.toBeNull();
    expect(within(updatedDetail).getByText("Medium")).not.toBeNull();
    expect(within(updatedDetail).getByText("2026-01-18 10:31")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  test("keeps Edit and Delete dry-run shells inside the selected detail card", () => {
    render(<AdminSafeReadPage page="userManagement" />);

    const detail = screen.getByLabelText("User Management redacted detail panel");
    const accountActions = within(detail).getByLabelText("Selected user account dry-run actions");

    fireEvent.click(within(accountActions).getByRole("button", { name: "Edit" }));
    expect(within(detail).queryByLabelText("User Management dry-run panel")).toBeNull();
    const editForm = within(detail).getByLabelText("User Management inline edit form");
    expect(within(editForm).getByLabelText("Display Name")).not.toBeNull();
    expect(within(editForm).getByLabelText("Status")).not.toBeNull();
    expect(within(editForm).getByRole("button", { name: "Preview edit" })).not.toBeNull();

    fireEvent.click(within(editForm).getByRole("button", { name: "Close" }));
    expect(within(accountActions).queryByRole("button", { name: "Disable" })).toBeNull();
    expect(within(detail).queryByLabelText("User Management dry-run panel")).toBeNull();

    fireEvent.click(within(accountActions).getByRole("button", { name: "Delete" }));
    const deleteState = within(detail).getByLabelText("User Management inline action state");
    expect(within(deleteState).getByText("Delete preview")).not.toBeNull();
    expect(within(deleteState).getByText("user_001")).not.toBeNull();
    expect(within(detail).queryByLabelText("User Management dry-run panel")).toBeNull();

    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|[A-Z0-9._%+-]+@[A-Z]{2,}/i);
  });

  test("submits the local User Management lifecycle through provided handlers", async () => {
    const lifecycle = {
      create: vi.fn(async () => ({
        account: {
          createdAt: "2026-05-26T10:30:00.000Z",
          displayName: "Beta Ops",
          email: "[REDACTED_EMAIL]",
          entitlementCount: 0,
          id: "acct_beta_001",
          organization: "Beta Account",
          status: "active",
          type: "platform_account_summary",
          updatedAt: "2026-05-26T10:30:00.000Z",
          usableEntitlementCount: 0
        },
        initialCredential: {
          accountId: "acct_beta_001",
          delivery: "operator_handoff_only",
          initialPassword: "gcctemp-20260701-001",
          mustRotate: true,
          safety: {
            auditLogMaterial: "redacted",
            returnedInListApis: false,
            storedAsHash: true
          },
          type: "portal_initial_password_handoff",
          visibleOnce: true
        },
        mutation: {
          accountId: "acct_beta_001",
          action: "account_created",
          auditRequired: true
        }
      })),
      disable: vi.fn(async () => undefined),
      previewDelete: vi.fn(async () => ({
        accountId: "acct_001",
        hardDeleteAvailable: false,
        nextAction: "retain_auditable_account_or_disable_only",
        state: "blocked",
        safety: {
          accountDeleted: false,
          entitlementsDeleted: false,
          runtimeMutation: false
        }
      })),
      update: vi.fn(async () => undefined)
    };

    render(
      <AdminSafeReadPage
        page="userManagement"
        userManagementAccounts={[
          {
            createdAt: "2026-05-26T10:00:00.000Z",
            displayName: "Acme Ops",
            email: "ops@example.com",
            entitlementCount: 1,
            id: "acct_001",
            organization: "Acme Research",
            status: "active",
            type: "platform_account_summary",
            updatedAt: "2026-05-26T10:15:00.000Z",
            usableEntitlementCount: 1
          }
        ]}
        userManagementLifecycle={lifecycle}
      />
    );

    fireEvent.click(within(screen.getByLabelText("User Management gated actions")).getByRole("button", { name: "Create User" }));
    const createPanel = screen.getByLabelText("User Management lifecycle panel");
    const createDetail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(createDetail).getByRole("heading", { level: 2, name: "Create user" })).not.toBeNull();
    expect(within(createDetail).queryByText("Acme Ops")).toBeNull();
    expect(within(createDetail).queryByLabelText("Selected user account dry-run actions")).toBeNull();
    fireEvent.change(within(createPanel).getByLabelText("Organization"), { target: { value: "Beta Account" } });
    fireEvent.change(within(createPanel).getByLabelText("Email"), { target: { value: "beta@example.com" } });
    fireEvent.change(within(createPanel).getByLabelText("Display Name"), { target: { value: "Beta Ops" } });
    fireEvent.click(within(createPanel).getByRole("button", { name: "Submit create" }));
    const initialCredential = await within(createPanel).findByLabelText("User Management initial credential handoff");
    expect(within(initialCredential).getByText("Initial password")).not.toBeNull();
    expect(within(createPanel).getByText("gcctemp-20260701-001")).not.toBeNull();
    expect(within(createPanel).getByText("Visible once for this local admin-created test user.")).not.toBeNull();
    expect(
      initialCredential.compareDocumentPosition(within(createPanel).getByLabelText("Organization")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(lifecycle.create).toHaveBeenCalledWith({
      approvalRef: "approval_local_user_lifecycle",
      displayName: "Beta Ops",
      email: "beta@example.com",
      operatorRef: "operator_local_admin",
      organization: "Beta Account",
      reason: "local_admin_user_lifecycle",
      status: "active"
    });
    fireEvent.click(within(createPanel).getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText("User Management lifecycle panel")).toBeNull();

    const detail = screen.getByLabelText("User Management redacted detail panel");
    const accountActions = within(detail).getByLabelText("Selected user account dry-run actions");
    fireEvent.click(within(accountActions).getByRole("button", { name: "Edit" }));
    expect(screen.queryByLabelText("User Management lifecycle panel")).toBeNull();
    const editForm = screen.getByLabelText("User Management inline edit form");
    expect(within(detail).getByText("acct_001")).not.toBeNull();
    expect(within(editForm).queryByLabelText("Operator Ref")).toBeNull();
    expect(within(editForm).queryByLabelText("Approval Ref")).toBeNull();
    expect(within(editForm).queryByLabelText("Reason")).toBeNull();
    fireEvent.change(within(editForm).getByLabelText("Display Name"), { target: { value: "Acme Review" } });
    fireEvent.change(within(editForm).getByLabelText("Status"), { target: { value: "suspended" } });
    fireEvent.click(within(editForm).getByRole("button", { name: "Submit edit" }));
    expect(lifecycle.update).toHaveBeenCalledWith("acct_001", {
      approvalRef: "approval_local_user_lifecycle",
      displayName: "Acme Review",
      operatorRef: "operator_local_admin",
      reason: "local_admin_user_lifecycle",
      status: "suspended"
    });

    expect(within(accountActions).queryByRole("button", { name: "Disable" })).toBeNull();
    expect(lifecycle.disable).not.toHaveBeenCalled();

    fireEvent.click(within(accountActions).getByRole("button", { name: "Delete" }));
    const deletePanel = screen.getByLabelText("User Management lifecycle panel");
    fireEvent.click(within(deletePanel).getByRole("button", { name: "Preview delete" }));
    expect(lifecycle.previewDelete).toHaveBeenCalledWith("acct_001", {
      approvalRef: "approval_local_user_lifecycle",
      operatorRef: "operator_local_admin",
      reason: "local_admin_user_lifecycle"
    });
    expect(await within(deletePanel).findByText("Physical delete blocked")).not.toBeNull();
    expect(within(deletePanel).getByText("retain_auditable_account_or_disable_only")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/ops@example\.com|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite/i);
  });

  test("filters User Management rows through safe search and status controls", () => {
    render(
      <AdminSafeReadPage
        page="userManagement"
        userManagementAccounts={[
          {
            createdAt: "2026-05-26T10:00:00.000Z",
            displayName: "Acme Ops",
            email: "ops@example.com",
            entitlementCount: 1,
            id: "acct_001",
            organization: "Acme Research",
            status: "active",
            type: "platform_account_summary",
            updatedAt: "2026-05-26T10:15:00.000Z",
            usableEntitlementCount: 1
          },
          {
            createdAt: "2026-05-27T10:00:00.000Z",
            displayName: "Beta Review",
            email: "beta@example.com",
            entitlementCount: 0,
            id: "acct_002",
            organization: "Beta Research",
            status: "pending_review",
            type: "platform_account_summary",
            updatedAt: "2026-05-27T10:15:00.000Z",
            usableEntitlementCount: 0
          }
        ]}
      />
    );

    expect(document.querySelectorAll(".admin-user-management-table .new-console-row-placeholder")).toHaveLength(18);

    fireEvent.click(screen.getByRole("button", { name: "Status All" }));
    expect(screen.getByRole("button", { name: "Status Active" })).not.toBeNull();
    expect(screen.getByRole("row", { name: /user_management_acct_001 acct_001 Acme Ops Active Low/ })).not.toBeNull();
    expect(screen.queryByRole("row", { name: /user_management_acct_002 acct_002 Beta Review Pending Medium/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Status Active" }));
    expect(screen.getByRole("button", { name: "Status Pending" })).not.toBeNull();
    expect(screen.getByRole("row", { name: /user_management_acct_002 acct_002 Beta Review Pending Medium/ })).not.toBeNull();
    expect(screen.queryByRole("row", { name: /user_management_acct_001 acct_001 Acme Ops Active Low/ })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search User ID, name, email..."), {
      target: { value: "Acme" }
    });
    expect(screen.getByText("No user accounts available")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/ops@example\.com|beta@example\.com|token=|secret|password|sqlite/i);
  });

  test("renders User Management from platform account summaries without exposing account email", () => {
    render(
      <AdminSafeReadPage
        page="userManagement"
        userManagementAccounts={[
          {
            createdAt: "2026-05-26T10:00:00.000Z",
            displayName: "Acme Ops",
            email: "ops@example.com",
            entitlementCount: 2,
            id: "acct_001",
            leadId: "lead_001",
            organization: "Acme Research",
            status: "active",
            type: "platform_account_summary",
            updatedAt: "2026-05-26T10:15:00.000Z",
            usableEntitlementCount: 1
          }
        ]}
        userManagementEntitlements={[
          {
            accountId: "acct_001",
            id: "ent_001",
            plan: "Pilot",
            status: "active",
            type: "platform_entitlement_summary",
            usable: true
          }
        ]}
      />
    );

    expect(screen.getByRole("row", { name: /user_management_acct_001 acct_001 Acme Ops Active Low/ })).not.toBeNull();
    expect(screen.getByText("Showing 1-1 of 1")).not.toBeNull();
    expect(screen.getAllByText("[REDACTED_EMAIL]").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pilot").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2 total / 1 usable")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/ops@example\.com|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite/i);
  });

  test("renders User Management empty platform account summaries without a stale detail row", () => {
    render(<AdminSafeReadPage page="userManagement" userManagementAccounts={[]} />);

    expect(screen.getByRole("table", { name: "User Management redacted table" })).not.toBeNull();
    expect(screen.getByText("No user accounts available")).not.toBeNull();
    const detail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(detail).getByText("No user selected")).not.toBeNull();
    expect(within(detail).getByText("No safe account summary is available for this page state.")).not.toBeNull();
    expect(screen.queryByText("user_001")).toBeNull();
  });

  test("renders Order Management with Figma order table, filters, gated actions, and safe details", () => {
    render(<AdminSafeReadPage page="orderManagement" />);

    const breadcrumb = screen.getByLabelText("Order Management breadcrumb");
    expect(within(breadcrumb).getByText("Home")).not.toBeNull();
    expect(within(breadcrumb).getByText("Order Management")).not.toBeNull();
    expect(screen.getByDisplayValue("Search ID, account ref, or lifecycle…")).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Status" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Plan" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Lifecycle" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Delivery" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create Order · Gated" }).disabled).toBe(true);
    expect(screen.getByRole("table", { name: "Order Management redacted table" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "ORDER ID" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "ACCOUNT REF" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "PLAN" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "STATUS" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "LIFECYCLE" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "DELIVERY" })).not.toBeNull();
    expect(screen.getByText("Showing 1-4 of 4")).not.toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();
    expect(document.querySelectorAll(".admin-order-management-table .new-console-row-placeholder")).toHaveLength(16);
    expect(document.querySelector(".top-bar")).toBeNull();
    expect(document.querySelectorAll(".ops-metric-card")).toHaveLength(0);
    expect(document.querySelector("[data-figma-component='OrderManagementTableCard']")).not.toBeNull();
    expect(document.querySelector("[data-figma-component='DetailPanel']")).not.toBeNull();

    const initialDetail = screen.getByLabelText("Order Management redacted detail panel");
    expect(within(initialDetail).getByText("Order Details")).not.toBeNull();
    expect(within(initialDetail).getByText("ORD-4029")).not.toBeNull();
    expect(within(initialDetail).getByText("enterprise_alpha_01")).not.toBeNull();
    expect(within(initialDetail).getByText("Tier 3 / Pro")).not.toBeNull();
    expect(within(initialDetail).getByText("120 / 1d")).not.toBeNull();
    const initialUsageEvidence = within(initialDetail).getByLabelText("Order Management usage evidence");
    expect(initialUsageEvidence).not.toBeNull();
    expect(within(initialUsageEvidence).getByText("Usage & Billing Evidence")).not.toBeNull();
    expect(within(initialUsageEvidence).getByText("Not observed / 120 / 1d")).not.toBeNull();
    expect(within(initialUsageEvidence).getByText("Order management fixture")).not.toBeNull();
    expect(within(initialDetail).getByRole<HTMLButtonElement>("button", { name: "View Quota Architecture" }).disabled).toBe(true);
    expect(within(initialDetail).queryByRole("button", { name: "View Usage Evidence" })).toBeNull();

    const targetRow = screen.getByRole("row", { name: /order_management_4031 ORD-4031 enterprise_alpha_01 Disabled Suspended Blocked/ });
    expect(within(targetRow).getByText("Disabled")).not.toBeNull();
    expect(within(targetRow).getByText("Suspended")).not.toBeNull();
    expect(within(targetRow).getByText("Blocked")).not.toBeNull();

    fireEvent.click(targetRow);

    const updatedDetail = screen.getByLabelText("Order Management redacted detail panel");
    expect(within(updatedDetail).getByText("ORD-4031")).not.toBeNull();
    expect(within(updatedDetail).getByText("enterprise_alpha_01")).not.toBeNull();
    expect(within(updatedDetail).getByText("Tier 3 / Pro")).not.toBeNull();
    expect(within(updatedDetail).getByText("120 / 1d")).not.toBeNull();
    expect(within(updatedDetail).getByText("Suspended")).not.toBeNull();
    expect(within(updatedDetail).getByText("Blocked")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  test("renders Order Management from portal access request summaries without protected material", () => {
    const requests: PortalAccessRequestSummary[] = [
      {
        accessGrantRef: null,
        durationDays: 30,
        entitlementRef: null,
        id: "pareq_live_001",
        nextAction: "admin_review_required",
        plan: "monthly",
        planLabel: "Monthly",
        portalUserRef: "acct_live_001",
        priorTrialState: "not_used",
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        safety: {
          noEntitlementCreated: true,
          noProductionMutation: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noSubscriptionUrl: true
        },
        status: "pending_admin_review",
        submittedAt: "2026-06-30T08:30:00.000Z",
        trafficLimitBytes: 21474836480,
        type: "portal_access_request_summary",
        updatedAt: "2026-06-30T08:30:00.000Z"
      },
      {
        accessGrantRef: "grant_safe_ref_002",
        durationDays: 365,
        entitlementRef: "ent_safe_ref_002",
        id: "pareq_live_002",
        nextAction: "user_can_use_access",
        plan: "yearly",
        planLabel: "Yearly",
        portalUserRef: "acct_live_002",
        priorTrialState: "consumed",
        reviewedAt: "2026-06-30T09:00:00.000Z",
        reviewedByRef: "operator_safe_ref",
        safeReasonCode: "approved_safe_ref",
        safety: {
          noEntitlementCreated: false,
          noProductionMutation: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noSubscriptionUrl: true
        },
        status: "delivered",
        submittedAt: "2026-06-30T08:45:00.000Z",
        type: "portal_access_request_summary",
        updatedAt: "2026-06-30T09:05:00.000Z",
        usage: {
          channelCount: 2,
          collectionStatus: "measured",
          downloadBytes: 2048,
          measuredChannelCount: 2,
          status: "within_limit",
          totalBytes: 107374182400,
          uploadBytes: 1024,
          usageRatio: 0.03,
          usedBytes: 3072
        }
      }
    ];

    render(<AdminSafeReadPage page="orderManagement" orderManagementRequests={requests} />);

    expect(screen.getByRole("row", { name: /pareq_live_001 pareq_live_001 acct_live_001 Pending Admin Review Not Delivered/ })).not.toBeNull();
    expect(screen.getByRole("row", { name: /pareq_live_002 pareq_live_002 acct_live_002 Delivered Active Delivered/ })).not.toBeNull();
    expect(screen.getByText("Showing 1-2 of 2")).not.toBeNull();
    expect(document.querySelectorAll(".admin-order-management-table .new-console-row-placeholder")).toHaveLength(18);

    const initialDetail = screen.getByLabelText("Order Management redacted detail panel");
    expect(within(initialDetail).getByText("pareq_live_001")).not.toBeNull();
    expect(within(initialDetail).getByText("acct_live_001")).not.toBeNull();
    expect(within(initialDetail).getByText("Monthly")).not.toBeNull();
    expect(within(initialDetail).getByText("20 GB")).not.toBeNull();
    expect(within(initialDetail).getByText("Admin Review")).not.toBeNull();
    expect(within(initialDetail).getByText("Not Delivered")).not.toBeNull();

    fireEvent.click(screen.getByRole("row", { name: /pareq_live_002/ }));

    const updatedDetail = screen.getByLabelText("Order Management redacted detail panel");
    expect(within(updatedDetail).getByText("pareq_live_002")).not.toBeNull();
    expect(within(updatedDetail).getByText("acct_live_002")).not.toBeNull();
    expect(within(updatedDetail).getByText("Yearly")).not.toBeNull();
    expect(within(updatedDetail).getByText("100 GB")).not.toBeNull();
    expect(within(updatedDetail).getByText("Active")).not.toBeNull();
    expect(within(updatedDetail).getByText("Delivered")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|rawArtifact|handoffMaterial/i);
  });

  test("merges usage monitor evidence into Order Management for billing reconciliation", () => {
    const requests: PortalAccessRequestSummary[] = [
      {
        accessGrantRef: "grant_safe_ref_002",
        durationDays: 365,
        entitlementRef: "ent_safe_ref_002",
        id: "pareq_live_002",
        nextAction: "user_can_use_access",
        plan: "yearly",
        planLabel: "Yearly",
        portalUserRef: "acct_live_002",
        priorTrialState: "consumed",
        reviewedAt: "2026-06-30T09:00:00.000Z",
        reviewedByRef: "operator_safe_ref",
        safeReasonCode: "approved_safe_ref",
        safety: {
          noEntitlementCreated: false,
          noProductionMutation: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noSubscriptionUrl: true
        },
        status: "delivered",
        submittedAt: "2026-06-30T08:45:00.000Z",
        trafficLimitBytes: 107374182400,
        type: "portal_access_request_summary",
        updatedAt: "2026-06-30T09:05:00.000Z"
      }
    ];
    const usageMonitor: SubscriptionUsageMonitor = {
      aggregates: {
        activeRecently: 1,
        blocked: 0,
        byNode: {},
        byPlan: { yearly: 1 },
        highRefresh: 0,
        inactive: 0,
        neverSeen: 0,
        seen: 1,
        total: 1,
        usage: {
          byUsageChannel: {},
          measuredOrders: 1,
          nearLimitOrders: 0,
          overLimitOrders: 0,
          totalDownloadBytes: 4294967296,
          totalUploadBytes: 1073741824,
          totalUsedBytes: 5368709120,
          unmeasuredOrders: 0,
          zeroUsageOrders: 0
        },
        warnings: {},
        withWarnings: 0
      },
      filters: {
        accountId: "",
        bucket: "hour",
        from: "",
        nodeId: "",
        plan: "",
        status: "",
        to: "",
        warning: ""
      },
      generatedAt: "2026-07-02T08:00:00.000Z",
      items: [
        {
          accountId: "acct_live_002",
          activityLevel: "active_recently",
          artifactFirstSeenAt: null,
          artifactLastSeenAt: null,
          artifactRef: "artifact_safe_ref",
          artifactStatus: "active",
          channelUsages: [],
          collectionStatus: "measured",
          downloadBytes: 4294967296,
          edgeCredentialBindings: [],
          entitlementId: "ent_safe_ref_002",
          issuedChannels: ["channel_safe_ref"],
          issuanceRequestId: "pareq_live_002",
          lastRefreshAt: null,
          lastUsageObservedAt: "2026-07-02T07:55:00.000Z",
          linkStatus: "active",
          nodeId: "node_safe_ref",
          plan: "yearly",
          portalUserRef: "acct_live_002",
          quantity: 1,
          refreshCount: 1,
          tenantExpiresAt: null,
          tenantRef: "tenant_safe_ref",
          tenantStatus: "active",
          trafficLimitBytes: 107374182400,
          uploadBytes: 1073741824,
          usageMeasured: true,
          usageStatus: "measured",
          usedBytes: 5368709120,
          validUntil: null,
          warnings: []
        }
      ],
      safety: {
        channelUsageBreakdownIncluded: true,
        mutationAllowed: false,
        orderLevelRows: true,
        rawCustomerNetworkDataReturned: false,
        rawEdgeCredentialReturned: false,
        rawSecretReturned: false,
        rawSubscriptionUrlReturned: false,
        realByteUsageMeasured: true,
        summaryOnly: true,
        usageCollectorConfigured: true,
        userAggregatedRows: true
      },
      series: {
        aggregates: {
          byAccount: {},
          byChannel: {},
          byOrder: {},
          pointCount: 0,
          seriesCount: 0,
          totalDownloadBytes: 4294967296,
          totalUploadBytes: 1073741824,
          totalUsedBytes: 5368709120
        },
        points: [],
        range: {
          bucket: "hour",
          from: null,
          to: null
        },
        safety: {
          channelBreakdownIncluded: true,
          mutationAllowed: false,
          orderScoped: true,
          rawEdgeCredentialReturned: false,
          rawSecretReturned: false,
          rawSubscriptionUrlReturned: false,
          summaryOnly: true
        },
        type: "subscription_usage_timeseries"
      },
      type: "subscription_usage_monitor",
      userAggregates: [
        {
          accountId: "acct_live_002",
          channelUsages: [],
          collectionStatus: "measured",
          downloadBytes: 6442450944,
          issuedChannels: ["channel_safe_ref"],
          lastUsageObservedAt: "2026-07-02T07:55:00.000Z",
          measuredOrders: 1,
          orderCount: 2,
          plans: ["yearly"],
          portalUserRef: "acct_live_002",
          trafficLimitBytes: 214748364800,
          unmeasuredOrders: 1,
          uploadBytes: 1073741824,
          usageMeasured: true,
          usedBytes: 7516192768,
          warnings: [],
          zeroUsageOrders: 0
        }
      ]
    };

    render(
      <AdminSafeReadPage
        page="orderManagement"
        orderManagementRequests={requests}
        orderManagementUsageMonitor={usageMonitor}
      />
    );

    const detail = screen.getByLabelText("Order Management redacted detail panel");
    const usageEvidence = within(detail).getByLabelText("Order Management usage evidence");
    expect(within(usageEvidence).getByText("Usage & Billing Evidence")).not.toBeNull();
    expect(within(usageEvidence).getByText("5 GB / 100 GB")).not.toBeNull();
    expect(within(usageEvidence).getByText("1 GB up / 4 GB down")).not.toBeNull();
    expect(within(usageEvidence).getByText("5% of limit")).not.toBeNull();
    expect(within(usageEvidence).getByText("7 GB user total")).not.toBeNull();
    expect(within(usageEvidence).getByText("2 orders · 1 measured")).not.toBeNull();
    expect(within(usageEvidence).getByText("Usage monitor order row")).not.toBeNull();
    expect(within(usageEvidence).getByText("1/1 measured · 5 GB")).not.toBeNull();
    expect(within(usageEvidence).getByText("1 aggregates · Billing orders + user usage aggregates")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|rawArtifact|handoffMaterial/i);
  });

  test("submits Order Management dry-run operations from the selected detail panel", async () => {
    const previewApproval = vi.fn(async () => ({
      approvalRef: "approval_local_order_lifecycle",
      issuanceInput: {},
      mode: "portal-access-request-approval-preview" as const,
      ok: true,
      request: { id: "pareq_live_001", status: "approved_pending_delivery" as const },
      safety: {
        noProductionMutation: true,
        noRawHandoffMaterial: true,
        noRuntimeMutation: true,
        noSubscriptionUrl: true,
        previewOnly: true,
        requiresSeparateIssuanceExecution: true
      },
      status: "approved_pending_delivery" as const
    }));
    const updateTrafficLimit = vi.fn(async () => ({
      audit: {
        action: "traffic_limit_updated",
        recordedAt: "2026-06-30T10:00:00.000Z"
      },
      ok: true,
      quota: {
        previousTrafficLimitBytes: 107374182400,
        trafficLimitBytes: 32212254720,
        updatedAt: "2026-06-30T10:00:00.000Z"
      },
      request: { id: "pareq_live_002" },
      safety: {
        noProductionMutation: true,
        noRawCustomerData: true,
        noRawHandoffMaterial: true,
        noRuntimeMutation: true,
        noSubscriptionUrl: true
      },
      type: "portal_access_request_traffic_limit_update" as const
    }));
    const requests: PortalAccessRequestSummary[] = [
      {
        accessGrantRef: null,
        durationDays: 30,
        entitlementRef: null,
        id: "pareq_live_001",
        nextAction: "admin_review_required",
        plan: "monthly",
        planLabel: "Monthly",
        portalUserRef: "acct_live_001",
        priorTrialState: "not_used",
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        safety: {
          noEntitlementCreated: true,
          noProductionMutation: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noSubscriptionUrl: true
        },
        status: "pending_admin_review",
        submittedAt: "2026-06-30T08:30:00.000Z",
        trafficLimitBytes: 21474836480,
        type: "portal_access_request_summary",
        updatedAt: "2026-06-30T08:30:00.000Z"
      },
      {
        accessGrantRef: "grant_safe_ref_002",
        durationDays: 365,
        entitlementRef: "ent_safe_ref_002",
        id: "pareq_live_002",
        nextAction: "user_can_use_access",
        plan: "yearly",
        planLabel: "Yearly",
        portalUserRef: "acct_live_002",
        priorTrialState: "consumed",
        reviewedAt: "2026-06-30T09:00:00.000Z",
        reviewedByRef: "operator_safe_ref",
        safeReasonCode: "approved_safe_ref",
        safety: {
          noEntitlementCreated: false,
          noProductionMutation: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noSubscriptionUrl: true
        },
        status: "delivered",
        submittedAt: "2026-06-30T08:45:00.000Z",
        trafficLimitBytes: 107374182400,
        type: "portal_access_request_summary",
        updatedAt: "2026-06-30T09:05:00.000Z"
      }
    ];

    render(
      <AdminSafeReadPage
        page="orderManagement"
        orderManagementLifecycle={{ previewApproval, updateTrafficLimit }}
        orderManagementRequests={requests}
      />
    );

    const initialDetail = screen.getByLabelText("Order Management redacted detail panel");
    expect(within(initialDetail).getByRole<HTMLButtonElement>("button", { name: "Delivery Handoff · Gated" }).disabled).toBe(true);
    fireEvent.click(within(initialDetail).getByRole("button", { name: "Approve Preview" }));
    const approvalPanel = screen.getByLabelText("Order Management operation panel");
    fireEvent.click(within(approvalPanel).getByRole("button", { name: "Run approval preview" }));

    await waitFor(() => {
      expect(previewApproval).toHaveBeenCalledWith("pareq_live_001", {
        approvalRef: "approval_local_order_lifecycle",
        nodeId: "channel-lab-b-tuic",
        reviewedByRef: "operator_local_admin"
      });
    });
    expect(screen.getByText("Approval preview ready.")).not.toBeNull();

    fireEvent.click(screen.getByRole("row", { name: /pareq_live_002 pareq_live_002 acct_live_002 Delivered Active Delivered/ }));
    const updatedDetail = screen.getByLabelText("Order Management redacted detail panel");
    fireEvent.click(within(updatedDetail).getByRole("button", { name: "Set Traffic Limit" }));
    const limitPanel = screen.getByLabelText("Order Management operation panel");
    fireEvent.change(within(limitPanel).getByLabelText("Traffic Limit GB"), { target: { value: "30" } });
    fireEvent.click(within(limitPanel).getByRole("button", { name: "Submit traffic limit" }));

    await waitFor(() => {
      expect(updateTrafficLimit).toHaveBeenCalledWith("pareq_live_002", {
        reasonCode: "local_order_quota_review",
        reviewedByRef: "operator_local_admin",
        trafficLimitBytes: 32212254720
      });
    });
    expect(screen.getByText("Traffic limit submitted.")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|rawArtifact|handoffMaterial/i);
  });

  test("renders User Access Logs as a redacted table and detail split", () => {
    render(<AdminSafeReadPage page="userAccessLogs" />);

    const breadcrumb = screen.getByLabelText("User Access Logs breadcrumb");
    expect(within(breadcrumb).getByText("Home")).not.toBeNull();
    expect(within(breadcrumb).getByText("User Access Logs")).not.toBeNull();
    expect(screen.getByRole("table", { name: "User Access Logs redacted table" })).not.toBeNull();
    expect(screen.getByLabelText("User Access Logs table and detail split")).not.toBeNull();
    expect(screen.getByLabelText("User Access Logs redacted detail panel")).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "TIMESTAMP" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "USER REF" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "EVENT TYPE" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "RESULT" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "RISK LEVEL" })).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Operator Console" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export CSV" }).disabled).toBe(true);
    expect(screen.getByDisplayValue("Search user ID, session, activity...")).not.toBeNull();
    expect(screen.getByRole("button", { name: "All Results" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Last 24 Hours" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "All Methods" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "All Risk" })).not.toBeNull();
    expect(screen.getByText("Showing 1-8 of 8")).not.toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();
    expect(screen.getByRole("button", { name: "Previous" })).not.toBeNull();
    expect(document.querySelectorAll(".admin-audit-table-access .new-console-row-placeholder")).toHaveLength(12);
    expect(document.querySelectorAll(".ops-metric-card")).toHaveLength(0);
    expect(document.querySelector("[data-figma-component='AuditTableCard']")).not.toBeNull();
    expect(document.querySelector("[data-figma-component='DetailPanel']")).not.toBeNull();
    expect(document.querySelector("[data-figma-component='DataCardPagination']")).not.toBeNull();
    expect(screen.getByText("Select a row to view details")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer/i);
  });

  test("updates the User Access Logs detail panel from the selected row", () => {
    render(<AdminSafeReadPage page="userAccessLogs" />);

    fireEvent.click(screen.getByRole("row", { name: /evt_access_004 usr_2847 Delete Blocked/ }));

    const detailPanel = screen.getByLabelText("User Access Logs redacted detail panel");
    expect(within(detailPanel).getByText("Event Detail")).not.toBeNull();
    expect(within(detailPanel).getByText("Blocked event selected")).not.toBeNull();
    expect(within(detailPanel).getByText("usr_2847")).not.toBeNull();
    expect(within(detailPanel).getByText("delete_ref_31")).not.toBeNull();
    expect(within(detailPanel).getByText("Blocked before mutation")).not.toBeNull();
    expect(within(detailPanel).queryByText("Privileged detail gated")).toBeNull();
  });

  test("resets audit-log detail selection when switching from access logs to operation logs", () => {
    const { rerender } = render(<AdminSafeReadPage page="userAccessLogs" />);

    expect(screen.getByText("Select a row to view details")).not.toBeNull();

    rerender(<AdminSafeReadPage page="userOperationLogs" />);

    const detailPanel = screen.getByLabelText("User Operation Logs redacted detail panel");
    expect(within(detailPanel).getByText("Log Details")).not.toBeNull();
    expect(within(detailPanel).getByText("op_001")).not.toBeNull();
    expect(within(detailPanel).getByText("acct_001")).not.toBeNull();
  });

  test("renders User Operation Logs with operation-specific columns and Figma detail split", () => {
    render(<AdminSafeReadPage page="userOperationLogs" />);

    const breadcrumb = screen.getByLabelText("User Operation Logs breadcrumb");
    expect(within(breadcrumb).getByText("Home")).not.toBeNull();
    expect(within(breadcrumb).getByText("User Operation Logs")).not.toBeNull();
    expect(screen.queryByDisplayValue("Search operator, object ID, or action...")).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Operators" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Any ID" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Actions" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Results" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Last 24 Hours" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Reset" }).disabled).toBe(true);
    expect(screen.getByRole("table", { name: "User Operation Logs redacted table" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "ACTOR REF" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "TARGET REF" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "ACTION" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "RESULT" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "NOTES" })).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Operator Console" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export CSV" }).disabled).toBe(true);
    expect(screen.getByText("Showing 1-8 of 8")).not.toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();
    expect(document.querySelectorAll(".admin-audit-table-operation .new-console-row-placeholder")).toHaveLength(12);

    const initialDetail = screen.getByLabelText("User Operation Logs redacted detail panel");
    expect(within(initialDetail).getByText("Log Details")).not.toBeNull();
    expect(within(initialDetail).getByText("op_001")).not.toBeNull();
    expect(within(initialDetail).getByText("acct_001")).not.toBeNull();
    expect(within(initialDetail).getByText("POST /v1/accounts/[REDACTED] - body masked")).not.toBeNull();
    expect(within(initialDetail).getByText("Quota limit updated successfully. No source errors detected.")).not.toBeNull();

    const targetRow = screen.getByRole("row", { name: /op_evt_004 op_004 Suspend Pending/ });
    expect(within(targetRow).getByText("Suspend")).not.toBeNull();
    expect(within(targetRow).getByText("Pending")).not.toBeNull();

    fireEvent.click(targetRow);

    const detailPanel = screen.getByLabelText("User Operation Logs redacted detail panel");
    expect(within(detailPanel).getByText("Log Details")).not.toBeNull();
    expect(within(detailPanel).getByText("op_004")).not.toBeNull();
    expect(within(detailPanel).getByText("sub_8192")).not.toBeNull();
    expect(within(detailPanel).getByText("POST /v1/subscriptions/[REDACTED] - body masked")).not.toBeNull();
    expect(within(detailPanel).getByText("Expiry review required before backend lifecycle gate.")).not.toBeNull();
    expect(within(detailPanel).queryByText("Selected event")).toBeNull();
    expect(within(detailPanel).queryByText("Protected Trace")).toBeNull();
    expect(within(detailPanel).queryByText("Privileged detail gated")).toBeNull();
    expect(within(detailPanel).queryByText("Mutation remains unavailable")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer/i);
  });

  test("renders Node Health with Figma table, filters, and redacted details", () => {
    render(<AdminSafeReadPage page="nodeHealth" />);

    const breadcrumb = screen.getByLabelText("Node Health breadcrumb");
    expect(within(breadcrumb).getByText("Home")).not.toBeNull();
    expect(within(breadcrumb).getByText("Node Health")).not.toBeNull();
    expect(screen.getByDisplayValue("Search node ID or region...")).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Regions" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Status" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Types" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Apply Filters" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Node Console" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export CSV" }).disabled).toBe(true);
    expect(screen.getByRole("table", { name: "Node Health redacted table" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "NODE ID" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "REGION" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "TYPE" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "STATUS" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "UPTIME" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "LAST PING" })).not.toBeNull();
    expect(screen.getByText("Showing 1-8 of 8")).not.toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();
    expect(document.querySelectorAll(".admin-node-health-table .new-console-row-placeholder")).toHaveLength(12);
    expect(document.querySelectorAll(".ops-metric-card")).toHaveLength(0);
    expect(document.querySelector("[data-figma-component='HealthTableCard']")).not.toBeNull();
    expect(document.querySelector("[data-figma-component='DetailPanel']")).not.toBeNull();

    const initialDetail = screen.getByLabelText("Node Health redacted detail panel");
    expect(within(initialDetail).getByText("Node Details")).not.toBeNull();
    expect(within(initialDetail).getByText("node_gw_01")).not.toBeNull();
    expect(within(initialDetail).getByText("us-east-1")).not.toBeNull();
    expect(within(initialDetail).getByText("[REDACTED_IP]")).not.toBeNull();
    expect(within(initialDetail).getByText("Performance")).not.toBeNull();
    expect(within(initialDetail).getByText("Actions")).not.toBeNull();
    expect(within(initialDetail).getByRole<HTMLButtonElement>("button", { name: "View Node Logs" }).disabled).toBe(true);
    expect(within(initialDetail).getByRole<HTMLButtonElement>("button", { name: "Diagnostics · Gated" }).disabled).toBe(true);

    const targetRow = screen.getByRole("row", { name: /node_health_003 node_ed_03 ap-south-1 Offline/ });
    expect(within(targetRow).getByText("Offline")).not.toBeNull();

    fireEvent.click(targetRow);

    const updatedDetail = screen.getByLabelText("Node Health redacted detail panel");
    expect(within(updatedDetail).getByText("node_ed_03")).not.toBeNull();
    expect(within(updatedDetail).getByText("ap-south-1")).not.toBeNull();
    expect(within(updatedDetail).getByText("0.00%")).not.toBeNull();
    expect(within(updatedDetail).getByText("0 Mbps")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite/i);
  });

  test("renders Node Logs with Figma filters, fixed row rhythm, and redacted details", () => {
    render(<AdminSafeReadPage page="nodeLogs" />);

    const breadcrumb = screen.getByLabelText("Node Logs breadcrumb");
    expect(within(breadcrumb).getByText("Home")).not.toBeNull();
    expect(within(breadcrumb).getByText("Node Logs")).not.toBeNull();
    expect(screen.getByDisplayValue("Search node ID, event type...")).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Nodes" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Last 24 Hours" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Events" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Status" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Apply Filters" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Node Console" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export CSV" }).disabled).toBe(true);
    expect(screen.getByRole("table", { name: "Node Logs redacted table" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "TIMESTAMP" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "NODE ID" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "EVENT TYPE" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "STATUS" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "SEVERITY" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "MESSAGE" })).not.toBeNull();
    expect(screen.getByText("Showing 1-8 of 8")).not.toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();
    expect(document.querySelectorAll(".admin-node-logs-table .new-console-row-placeholder")).toHaveLength(12);
    expect(document.querySelectorAll(".ops-metric-card")).toHaveLength(0);
    expect(document.querySelector("[data-figma-component='LogTableCard']")).not.toBeNull();
    expect(document.querySelector("[data-figma-component='DetailPanel']")).not.toBeNull();

    const initialDetail = screen.getByLabelText("Node Logs redacted detail panel");
    expect(within(initialDetail).getByText("Log Details")).not.toBeNull();
    expect(within(initialDetail).getByText("node_gw_01")).not.toBeNull();
    expect(within(initialDetail).getByText("Protected Change")).not.toBeNull();
    expect(within(initialDetail).getByText("Online")).not.toBeNull();
    expect(within(initialDetail).getByText("INFO")).not.toBeNull();
    expect(within(initialDetail).getByText("[REDACTED_IP]")).not.toBeNull();
    expect(within(initialDetail).getByText("Protected update completed. Source errors not detected.")).not.toBeNull();

    const targetRow = screen.getByRole("row", { name: /node_log_003 node_gw_03 Error Offline ERROR/ });
    expect(within(targetRow).getByText("Database connection timeout")).not.toBeNull();

    fireEvent.click(targetRow);

    const updatedDetail = screen.getByLabelText("Node Logs redacted detail panel");
    expect(within(updatedDetail).getByText("node_gw_03")).not.toBeNull();
    expect(within(updatedDetail).getByText("ap-south-1")).not.toBeNull();
    expect(within(updatedDetail).getByText("Database connection timeout was recorded with protected material redacted.")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite/i);
  });

  test("renders Node Bandwidth with Figma filters, table, utilization detail, and safe summaries", () => {
    render(<AdminSafeReadPage page="nodeBandwidth" />);

    const breadcrumb = screen.getByLabelText("Node Bandwidth breadcrumb");
    expect(within(breadcrumb).getByText("Home")).not.toBeNull();
    expect(within(breadcrumb).getByText("Node Bandwidth")).not.toBeNull();
    expect(screen.getByDisplayValue("Search node ID or region...")).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Nodes" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Last 1h" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Regions" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "All Types" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Apply" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Node Console" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export CSV" }).disabled).toBe(true);
    expect(screen.getByRole("table", { name: "Node Bandwidth redacted table" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "NODE ID" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "REGION" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "INBOUND" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "OUTBOUND" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "PEAK BPS" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "UTILIZATION" })).not.toBeNull();
    expect(screen.getByText("Showing 1-8 of 8")).not.toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();
    expect(document.querySelectorAll(".admin-node-bandwidth-table .new-console-row-placeholder")).toHaveLength(12);
    expect(document.querySelectorAll(".ops-metric-card")).toHaveLength(0);
    expect(document.querySelector("[data-figma-component='BandwidthTableCard']")).not.toBeNull();
    expect(document.querySelector("[data-figma-component='DetailPanel']")).not.toBeNull();

    const initialDetail = screen.getByLabelText("Node Bandwidth redacted detail panel");
    expect(within(initialDetail).getByText("Bandwidth Detail")).not.toBeNull();
    expect(within(initialDetail).getAllByText("node_gw_01")).toHaveLength(2);
    expect(within(initialDetail).getAllByText("us-east-1")).toHaveLength(1);
    expect(within(initialDetail).getByText("Gateway")).not.toBeNull();
    expect(within(initialDetail).getAllByText("1.2 Gbps").length).toBeGreaterThanOrEqual(2);
    expect(within(initialDetail).getByText("Utilization")).not.toBeNull();
    expect(within(initialDetail).getByText("Traffic Window")).not.toBeNull();
    expect(document.querySelector(".admin-node-bandwidth-util-fill")?.getAttribute("style")).toContain("34%");

    const targetRow = screen.getByRole("row", { name: /node_bandwidth_007 node_edge_07 us-east-1 91%/ });
    expect(within(targetRow).getByText("7.2 Gbps")).not.toBeNull();
    expect(within(targetRow).getByText("91%")).not.toBeNull();

    fireEvent.click(targetRow);

    const updatedDetail = screen.getByLabelText("Node Bandwidth redacted detail panel");
    expect(within(updatedDetail).getAllByText("node_edge_07")).toHaveLength(2);
    expect(within(updatedDetail).getAllByText("4.2 Gbps").length).toBeGreaterThanOrEqual(2);
    expect(within(updatedDetail).getAllByText("3.1 Gbps").length).toBeGreaterThanOrEqual(2);
    expect(within(updatedDetail).getByText("38ms")).not.toBeNull();
    expect(within(updatedDetail).getByText("0.08%")).not.toBeNull();
    expect(document.querySelector(".admin-node-bandwidth-util-fill")?.getAttribute("style")).toContain("91%");
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|\\[REDACTED_IP\\]/i);
  });

  test("renders Node Bandwidth from live protected summary rows without exposing protected payloads", () => {
    render(<AdminSafeReadPage page="nodeBandwidth" nodeBandwidthSummary={nodeBandwidthSummaryFixture()} />);

    expect(screen.getByRole("table", { name: "Node Bandwidth redacted table" })).not.toBeNull();
    expect(screen.getByText("Showing 1-1 of 1")).not.toBeNull();
    expect(document.querySelectorAll(".admin-node-bandwidth-table .new-console-row-placeholder")).toHaveLength(19);
    expect(screen.getAllByText("channel-sgp-a").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Singapore").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2.5 Gbps").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1.2 Gbps").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("3.6 Gbps").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("73%").length).toBeGreaterThanOrEqual(1);

    const detail = screen.getByLabelText("Node Bandwidth redacted detail panel");
    expect(within(detail).getByText("Hysteria2")).not.toBeNull();
    expect(within(detail).getByText("Measured")).not.toBeNull();
    expect(within(detail).getByText("2026-06-30 10:05")).not.toBeNull();
    expect(within(detail).getByText("1 GB")).not.toBeNull();
    expect(within(detail).getByText("2 GB")).not.toBeNull();
    expect(within(detail).getByText("3 GB")).not.toBeNull();
    expect(within(detail).getByText("Utilization High")).not.toBeNull();
    expect(document.querySelector(".admin-node-bandwidth-util-fill")?.getAttribute("style")).toContain("73%");
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|runtimePayload/i);
  });
});

function nodeBandwidthSummaryFixture(): NodeBandwidthSummary {
  return {
    type: "node_bandwidth_summary",
    generatedAt: "2026-06-30T10:06:00.000Z",
    filters: {
      nodeId: "",
      from: "",
      to: "",
      bucket: "minute"
    },
    aggregates: {
      totalNodes: 1,
      measuredNodes: 1,
      unmeasuredNodes: 0,
      warningNodes: 1,
      totalBytes: 3221225472,
      uploadBytes: 1073741824,
      downloadBytes: 2147483648,
      peakTotalBps: 3600000000,
      byNode: {
        "channel-sgp-a": 3221225472
      },
      byPhysicalNode: {
        "node-sgp-a": 3221225472
      }
    },
    items: [
      {
        nodeId: "channel-sgp-a",
        channelRef: "channel-sgp-a",
        physicalNodeRef: "node-sgp-a",
        providerRef: "vultr",
        region: "Singapore",
        protocol: "hysteria2",
        runtimeAdapter: "remote-data-plane-handoff",
        lifecycle: "active",
        status: "configured",
        subscriptionEligible: true,
        configured: true,
        capacityBps: 5000000000,
        utilizationPercent: 73,
        utilizationState: "warning",
        activeOrderCount: 4,
        measuredOrderCount: 4,
        sampleCount: 6,
        uploadBytes: 1073741824,
        downloadBytes: 2147483648,
        totalBytes: 3221225472,
        currentUploadBps: 1200000000,
        currentDownloadBps: 2500000000,
        currentTotalBps: 3700000000,
        peakUploadBps: 1300000000,
        peakDownloadBps: 2300000000,
        peakTotalBps: 3600000000,
        lastObservedAt: "2026-06-30T10:05:10.000Z",
        collectionStatus: "measured",
        warnings: ["utilization_high"]
      }
    ],
    series: {
      type: "node_bandwidth_timeseries",
      range: {
        from: null,
        to: null,
        bucket: "minute"
      },
      points: [
        {
          bucketStart: "2026-06-30T10:05:00.000Z",
          nodeId: "channel-sgp-a",
          channelRef: "channel-sgp-a",
          uploadBytes: 1073741824,
          downloadBytes: 2147483648,
          totalBytes: 3221225472,
          peakTotalBps: 3600000000,
          sampleCount: 6
        }
      ],
      safety: {
        summaryOnly: true,
        rawEdgeCredentialReturned: false,
        rawRuntimePayloadReturned: false,
        rawSecretReturned: false,
        mutationAllowed: false
      }
    },
    safety: {
      summaryOnly: true,
      adminOnly: true,
      nodeLevelRows: true,
      rawEdgeCredentialReturned: false,
      rawRuntimePayloadReturned: false,
      rawSecretReturned: false,
      rawSubscriptionUrlReturned: false,
      mutationAllowed: false,
      usageCollectorConfigured: true
    }
  };
}
