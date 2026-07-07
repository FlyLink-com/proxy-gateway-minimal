import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  AdminPaymentOrderSummary,
  CreatePlatformEntitlementInput,
  NodeBandwidthSummary,
  PlatformEntitlementSummary,
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
    expect(screen.getByPlaceholderText("Search login email, plan, status...")).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Status All" }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Risk All" }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Plan All" }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Created Time Last 24h" }).disabled).toBe(true);
    expect(within(screen.getByLabelText("User Management gated actions")).getByRole<HTMLButtonElement>("button", { name: "Create User · Gated" }).disabled).toBe(true);
    expect(screen.getByRole("table", { name: "User Management redacted table" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "LOGIN EMAIL" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "PLAN" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "STATUS" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "RISK" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "CREATED" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "LAST ACCESS" })).not.toBeNull();
    expect(screen.getByText("Showing 1-8 of 8")).not.toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();
    expect(document.querySelectorAll(".admin-user-management-table .new-console-row-placeholder")).toHaveLength(12);
    expect(document.querySelectorAll(".ops-metric-card")).toHaveLength(0);
    expect(document.querySelector("[data-figma-component='UserManagementTableCard']")).not.toBeNull();
    expect(document.querySelector("[data-figma-component='DetailPanel']")).not.toBeNull();

    const initialDetail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(initialDetail).getByText("账户详情")).not.toBeNull();
    expect(within(initialDetail).getAllByText("alpha@example.test")).toHaveLength(1);
    expect(within(initialDetail).queryByText("user_001")).toBeNull();
    expect(within(initialDetail).queryByText("User Alpha")).toBeNull();
    expect(within(initialDetail).queryByText("[REDACTED_EMAIL]")).toBeNull();
    expect(within(initialDetail).getByText("2026-01-18 13:42")).not.toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "User Access Logs" })).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "User Operation Logs" })).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "Revoke Access · Gated" })).toBeNull();
    expect(within(initialDetail).queryByLabelText("Selected user account dry-run actions")).toBeNull();
    expect(within(initialDetail).queryByLabelText("User Management inline edit form")).toBeNull();
    expect(within(initialDetail).queryByLabelText("User Management inline action state")).toBeNull();
    expect(within(initialDetail).queryByText("Account Actions")).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "Disable" })).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "Delete" })).toBeNull();

    const targetRow = screen.getByRole("row", { name: /theta@example\.test Team Pending Medium/ });
    expect(within(targetRow).getByText("Team")).not.toBeNull();
    expect(within(targetRow).getByText("Pending")).not.toBeNull();

    fireEvent.click(targetRow);

    const updatedDetail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(updatedDetail).getAllByText("theta@example.test")).toHaveLength(1);
    expect(within(updatedDetail).queryByText("user_008")).toBeNull();
    expect(within(updatedDetail).queryByText("User Theta")).toBeNull();
    expect(within(updatedDetail).getByText("Team")).not.toBeNull();
    expect(within(updatedDetail).getByText("Pending")).not.toBeNull();
    expect(within(updatedDetail).getByText("Medium")).not.toBeNull();
    expect(within(updatedDetail).getByText("2026-01-18 10:31")).not.toBeNull();
    expect(within(updatedDetail).queryByLabelText("Selected user account dry-run actions")).toBeNull();
    expect(within(updatedDetail).queryByLabelText("User Management inline edit form")).toBeNull();
    expect(within(updatedDetail).queryByLabelText("User Management inline action state")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite/i);
  });

  test("keeps the selected User Management detail card read-only and compact", () => {
    render(<AdminSafeReadPage page="userManagement" />);

    const detail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(detail).getByText("账户详情")).not.toBeNull();
    expect(within(detail).queryByLabelText("User Management dry-run panel")).toBeNull();
    expect(within(detail).queryByLabelText("Selected user account dry-run actions")).toBeNull();
    expect(within(detail).queryByLabelText("User Management inline edit form")).toBeNull();
    expect(within(detail).queryByLabelText("User Management inline action state")).toBeNull();
    expect(within(detail).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(detail).queryByRole("button", { name: "Delete" })).toBeNull();

    const targetRow = screen.getByRole("row", { name: /theta@example\.test Team Pending Medium/ });
    fireEvent.click(targetRow);

    const updatedDetail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(updatedDetail).getAllByText("theta@example.test")).toHaveLength(1);
    expect(within(updatedDetail).getByText("Team")).not.toBeNull();
    expect(within(updatedDetail).getByText("Pending")).not.toBeNull();
    expect(within(updatedDetail).queryByLabelText("Selected user account dry-run actions")).toBeNull();
    expect(within(updatedDetail).queryByLabelText("User Management inline edit form")).toBeNull();
    expect(within(updatedDetail).queryByLabelText("User Management inline action state")).toBeNull();

    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite/i);
  });

  test("submits the local User Management lifecycle through provided handlers", async () => {
    const lifecycle = {
      create: vi.fn(async () => ({
        account: {
          createdAt: "2026-05-26T10:30:00.000Z",
          displayName: "beta@example.com",
          email: "beta@example.com",
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
    expect(within(createDetail).getByRole("heading", { level: 2, name: "创建用户" })).not.toBeNull();
    expect(within(createDetail).queryByText("Acme Ops")).toBeNull();
    expect(within(createDetail).queryByLabelText("Selected user account dry-run actions")).toBeNull();
    fireEvent.change(within(createPanel).getByLabelText("Organization"), { target: { value: "Beta Account" } });
    fireEvent.change(within(createPanel).getByLabelText("Email"), { target: { value: "beta@example.com" } });
    expect(within(createPanel).queryByLabelText("Display Name")).toBeNull();
    fireEvent.click(within(createPanel).getByRole("button", { name: "Submit create" }));
    const initialCredential = await within(createPanel).findByLabelText("User Management initial credential handoff");
    expect(within(initialCredential).getByText("Login email")).not.toBeNull();
    expect(within(initialCredential).getByText("beta@example.com")).not.toBeNull();
    expect(within(initialCredential).getByText("Initial password")).not.toBeNull();
    expect(within(createPanel).getByText("gcctemp-20260701-001")).not.toBeNull();
    expect(within(createPanel).getByText("Visible once for this local admin-created test user.")).not.toBeNull();
    expect(
      initialCredential.compareDocumentPosition(within(createPanel).getByLabelText("Organization")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(lifecycle.create).toHaveBeenCalledWith({
      approvalRef: "approval_local_user_lifecycle",
      displayName: "beta@example.com",
      email: "beta@example.com",
      operatorRef: "operator_local_admin",
      organization: "Beta Account",
      reason: "local_admin_user_lifecycle",
      status: "active"
    });
    fireEvent.click(within(createPanel).getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText("User Management lifecycle panel")).toBeNull();

    const detail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(detail).getByText("账户详情")).not.toBeNull();
    expect(screen.queryByLabelText("User Management lifecycle panel")).toBeNull();
    expect(within(detail).getByText("ops@example.com")).not.toBeNull();
    expect(within(detail).queryByText("acct_001")).toBeNull();
    expect(within(detail).queryByLabelText("Selected user account dry-run actions")).toBeNull();
    expect(within(detail).queryByLabelText("User Management inline edit form")).toBeNull();
    expect(within(detail).queryByLabelText("User Management inline action state")).toBeNull();
    expect(within(detail).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(detail).queryByRole("button", { name: "Disable" })).toBeNull();
    expect(within(detail).queryByRole("button", { name: "Delete" })).toBeNull();

    expect(lifecycle.update).not.toHaveBeenCalled();
    expect(lifecycle.disable).not.toHaveBeenCalled();
    expect(lifecycle.previewDelete).not.toHaveBeenCalled();
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite/i);
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
    expect(screen.getByRole("row", { name: /ops@example\.com No Plan Active Low/ })).not.toBeNull();
    expect(screen.queryByRole("row", { name: /beta@example\.com No Plan Pending Medium/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Status Active" }));
    expect(screen.getByRole("button", { name: "Status Pending" })).not.toBeNull();
    expect(screen.getByRole("row", { name: /beta@example\.com No Plan Pending Medium/ })).not.toBeNull();
    expect(screen.queryByRole("row", { name: /ops@example\.com No Plan Active Low/ })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search login email, plan, status..."), {
      target: { value: "ops@example.com" }
    });
    expect(screen.getByText("No user accounts available")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/token=|secret|password|sqlite/i);
  });

  test("renders User Management from platform account summaries with email as the public account label", () => {
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
            createdAt: "2026-07-02T10:05:00.000Z",
            id: "ent_001",
            plan: "monthly_basic",
            quota: { trafficGb: 50 },
            status: "active",
            type: "platform_entitlement_summary",
            usable: true,
            validUntil: "2026-08-01T10:05:00.000Z"
          }
        ]}
      />
    );

    expect(screen.getByRole("row", { name: /ops@example\.com Basic Monthly Active Low/ })).not.toBeNull();
    expect(screen.getByText("Showing 1-1 of 1")).not.toBeNull();
    expect(screen.getAllByText("ops@example.com").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("acct_001")).toBeNull();
    expect(screen.getAllByText("Basic Monthly").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("账户权益")).not.toBeNull();
    expect(screen.getByText("可用时间")).not.toBeNull();
    expect(screen.getByText("共享月流量")).not.toBeNull();
    expect(screen.getByText("50 GB / 月")).not.toBeNull();
    expect(screen.getByText("2 records / 1 active")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite/i);
  });

  test("lets an operator adjust account entitlement days and shared monthly traffic", async () => {
    const createEntitlement = vi.fn(async (
      _accountId: string,
      _input: CreatePlatformEntitlementInput
    ): Promise<PlatformEntitlementSummary> => ({
      accountId: "acct_001",
      id: "ent_002",
      plan: "monthly_plus",
      quota: { trafficGb: 100 },
      status: "active",
      type: "platform_entitlement_summary",
      usable: true,
      validUntil: "2026-08-04T00:00:00.000Z"
    }));

    render(
      <AdminSafeReadPage
        page="userManagement"
        userManagementAccounts={[
          {
            createdAt: "2026-05-26T10:00:00.000Z",
            displayName: "Acme Ops",
            email: "ops@example.com",
            entitlementCount: 0,
            id: "acct_001",
            leadId: "lead_001",
            organization: "Acme Research",
            status: "active",
            type: "platform_account_summary",
            updatedAt: "2026-05-26T10:15:00.000Z",
            usableEntitlementCount: 0
          }
        ]}
        userManagementLifecycle={{
          create: vi.fn(),
          createEntitlement,
          disable: vi.fn(),
          previewDelete: vi.fn(),
          update: vi.fn()
        } as any}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "调整权益" }));
    const panel = screen.getByLabelText("账户权益调整");

    expect(within(panel).getByLabelText("套餐档位")).not.toBeNull();
    expect(within(panel).getByLabelText("可用天数")).not.toBeNull();
    expect(within(panel).getByLabelText("共享月流量 GB/月")).not.toBeNull();

    fireEvent.change(within(panel).getByLabelText("套餐档位"), {
      target: { value: "monthly_plus" }
    });

    expect(within(panel).getByDisplayValue("30")).not.toBeNull();
    expect(within(panel).getByDisplayValue("100")).not.toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "保存权益" }));

    await waitFor(() => expect(createEntitlement).toHaveBeenCalledTimes(1));
    expect(createEntitlement).toHaveBeenCalledWith(
      "acct_001",
      expect.objectContaining({
        plan: "monthly_plus",
        quota: { trafficGb: 100 },
        status: "active"
      })
    );
    const submittedInput = createEntitlement.mock.calls[0]?.[1];
    expect(typeof submittedInput?.validUntil).toBe("string");
    expect(within(panel).getByText("权益已保存")).not.toBeNull();
  });

  test("renders User Management empty platform account summaries without a stale detail row", () => {
    render(<AdminSafeReadPage page="userManagement" userManagementAccounts={[]} />);

    expect(screen.getByRole("table", { name: "User Management redacted table" })).not.toBeNull();
    expect(screen.getByText("No user accounts available")).not.toBeNull();
    const detail = screen.getByLabelText("User Management redacted detail panel");
    expect(within(detail).getByText("未选择账户")).not.toBeNull();
    expect(within(detail).getByText("No safe account summary is available for this page state.")).not.toBeNull();
    expect(screen.queryByText("user_001")).toBeNull();
  });

  test("renders Order Records with Figma order table, filters, gated actions, and safe details", () => {
    render(<AdminSafeReadPage page="orderManagement" />);

    const breadcrumb = screen.getByLabelText("订单记录面包屑");
    expect(within(breadcrumb).getByText("首页")).not.toBeNull();
    expect(within(breadcrumb).getByText("订单记录")).not.toBeNull();
    expect(screen.getByDisplayValue("搜索订单号、账户或状态…")).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "状态" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "套餐" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "周期" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "交付" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "导出记录" }).disabled).toBe(true);
    expect(screen.getByRole("table", { name: "订单记录列表" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "订单号" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "账户" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "套餐" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "状态" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "周期" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "交付" })).not.toBeNull();
    expect(screen.getByText("显示 1-4 / 4")).not.toBeNull();
    expect(screen.queryByText("Page 1 / 1")).toBeNull();
    expect(document.querySelectorAll(".admin-order-management-table .new-console-row-placeholder")).toHaveLength(16);
    expect(document.querySelector(".top-bar")).toBeNull();
    expect(document.querySelectorAll(".ops-metric-card")).toHaveLength(0);
    expect(document.querySelector("[data-figma-component='OrderManagementTableCard']")).not.toBeNull();
    expect(document.querySelector("[data-figma-component='DetailPanel']")).not.toBeNull();

    const initialDetail = screen.getByLabelText("订单记录详情");
    expect(within(initialDetail).getByText("记录详情")).not.toBeNull();
    expect(within(initialDetail).getByText("ORD-4029")).not.toBeNull();
    expect(within(initialDetail).getByText("enterprise_alpha_01")).not.toBeNull();
    expect(within(initialDetail).getByText("专业套餐")).not.toBeNull();
    expect(within(initialDetail).getByText("120 GB / 天")).not.toBeNull();
    expect(within(initialDetail).getByText("记录状态")).not.toBeNull();
    expect(within(initialDetail).getByText("处理状态")).not.toBeNull();
    expect(within(initialDetail).queryByLabelText("订单用量核对")).toBeNull();
    expect(within(initialDetail).queryByLabelText("订单记录操作")).toBeNull();
    expect(within(initialDetail).queryByRole("button")).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "View Usage Evidence" })).toBeNull();

    const targetRow = screen.getByRole("row", { name: /order_management_4031 ORD-4031 enterprise_alpha_01 专业套餐 已停用 已暂停 需处理/ });
    expect(within(targetRow).getByText("已停用")).not.toBeNull();
    expect(within(targetRow).getByText("已暂停")).not.toBeNull();
    expect(within(targetRow).getByText("需处理")).not.toBeNull();

    fireEvent.click(targetRow);

    const updatedDetail = screen.getByLabelText("订单记录详情");
    expect(within(updatedDetail).getByText("ORD-4031")).not.toBeNull();
    expect(within(updatedDetail).getByText("enterprise_alpha_01")).not.toBeNull();
    expect(within(updatedDetail).getByText("专业套餐")).not.toBeNull();
    expect(within(updatedDetail).getByText("120 GB / 天")).not.toBeNull();
    expect(within(updatedDetail).getByText("记录状态")).not.toBeNull();
    expect(within(updatedDetail).getByText("已停用")).not.toBeNull();
    expect(within(updatedDetail).getByText("处理状态")).not.toBeNull();
    expect(within(updatedDetail).getByText("需处理")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  test("wraps Order Records copy in operator-facing language instead of backend terms", () => {
    render(<AdminSafeReadPage page="orderManagement" />);

    expect(screen.getByRole("button", { name: "导出记录" })).not.toBeNull();
    expect(screen.getByDisplayValue("搜索订单号、账户或状态…")).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "账户" })).not.toBeNull();

    const detail = screen.getByLabelText("订单记录详情");
    expect(within(detail).getByText("记录详情")).not.toBeNull();
    expect(within(detail).getByText("账户")).not.toBeNull();
    expect(within(detail).getByText("记录状态")).not.toBeNull();
    expect(within(detail).getByText("处理状态")).not.toBeNull();
    expect(within(detail).queryByText("用量记录")).toBeNull();
    expect(within(detail).queryByText("交付由系统处理")).toBeNull();
    expect(within(detail).queryByLabelText("订单用量核对")).toBeNull();
    expect(within(detail).queryByLabelText("订单记录操作")).toBeNull();

    expect(document.body.textContent ?? "").not.toMatch(/Gated|Fixture|Usage Collection|User Aggregate|Evidence Source|backend|callback|provider mismatch|channel mismatch/i);
  });

  test("renders Order Records from portal access request summaries without protected material", () => {
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

    expect(screen.getByRole("row", { name: /pareq_live_001 pareq_live_001 acct_live_001 月付套餐 待审核 待审核 待审核/ })).not.toBeNull();
    expect(screen.getByRole("row", { name: /pareq_live_002 pareq_live_002 acct_live_002 年度套餐 已开通 使用中 已开通/ })).not.toBeNull();
    expect(screen.getByText("显示 1-2 / 2")).not.toBeNull();
    expect(document.querySelectorAll(".admin-order-management-table .new-console-row-placeholder")).toHaveLength(18);

    const initialDetail = screen.getByLabelText("订单记录详情");
    expect(within(initialDetail).getByText("pareq_live_001")).not.toBeNull();
    expect(within(initialDetail).getByText("acct_live_001")).not.toBeNull();
    expect(within(initialDetail).getByText("月付套餐")).not.toBeNull();
    expect(within(initialDetail).getByText("20 GB")).not.toBeNull();
    expect(within(initialDetail).getAllByText("待审核").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("row", { name: /pareq_live_002/ }));

    const updatedDetail = screen.getByLabelText("订单记录详情");
    expect(within(updatedDetail).getByText("pareq_live_002")).not.toBeNull();
    expect(within(updatedDetail).getByText("acct_live_002")).not.toBeNull();
    expect(within(updatedDetail).getByText("年度套餐")).not.toBeNull();
    expect(within(updatedDetail).getByText("100 GB")).not.toBeNull();
    expect(within(updatedDetail).getAllByText("已开通").length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|rawArtifact|handoffMaterial/i);
  });

  test("renders Order Records from payment orders with public login identity and delivery status", () => {
    const payments: AdminPaymentOrderSummary[] = [
      {
        accessRequestRef: "pareq_paid_001",
        accessRequestStatus: "pending_admin_review",
        amountMinor: 3000,
        createdAt: "2026-07-02T11:00:00.000Z",
        currency: "CNY",
        displayRef: "buyer@example.test",
        loginRef: "buyer@example.test",
        orderRef: "pay_order_public_ref",
        paidAt: "2026-07-02T11:05:00.000Z",
        plan: "monthly_plus",
        planLabel: "monthly plus",
        providerOrderRef: "provider_safe_ref",
        channel: "wxpay",
        status: "paid_delivery_blocked"
      }
    ];

    render(<AdminSafeReadPage page="orderManagement" orderManagementPayments={payments} />);

    const row = screen.getByRole("row", {
      name: /pay_order_public_ref pay_order_public_ref buyer@example\.test 月付 Plus 开通需处理 支付核对 开通需处理/
    });
    expect(row).not.toBeNull();
    expect(screen.getByText("显示 1-1 / 1")).not.toBeNull();

    const detail = screen.getByLabelText("订单记录详情");
    expect(within(detail).getAllByText("buyer@example.test").length).toBeGreaterThanOrEqual(1);
    expect(within(detail).getByText("月付 Plus")).not.toBeNull();
    expect(within(detail).getAllByText("¥30.00 CNY").length).toBeGreaterThanOrEqual(1);
    expect(within(detail).getByText("微信支付")).not.toBeNull();
    expect(within(detail).queryByText("申请状态")).toBeNull();
    expect(within(detail).getAllByText("2026-07-02 11:05").length).toBeGreaterThanOrEqual(1);
    expect(within(detail).getByText("provider_safe_ref")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/checkoutUrl|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|rawArtifact|handoffMaterial|merchantSecret|rawPayload/i);
  });

  test("renders payment callback mismatch states as explicit admin reconciliation warnings", () => {
    const payments: AdminPaymentOrderSummary[] = [
      {
        amountMinor: 2000,
        channel: "alipay",
        createdAt: "2026-07-02T11:00:00.000Z",
        currency: "CNY",
        orderRef: "pay_order_provider_mismatch",
        plan: "monthly_basic",
        planLabel: "monthly basic",
        providerOrderRef: "provider_safe_provider_mismatch",
        status: "payment_provider_order_mismatch"
      },
      {
        amountMinor: 3000,
        channel: "wxpay",
        createdAt: "2026-07-02T12:00:00.000Z",
        currency: "CNY",
        orderRef: "pay_order_channel_mismatch",
        plan: "monthly_plus",
        planLabel: "monthly plus",
        providerOrderRef: "provider_safe_channel_mismatch",
        status: "payment_channel_mismatch"
      }
    ];

    render(<AdminSafeReadPage page="orderManagement" orderManagementPayments={payments} />);

    expect(screen.getAllByText("支付记录需核对").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("支付方式需核对").length).toBeGreaterThanOrEqual(1);

    const detail = screen.getByLabelText("订单记录详情");
    expect(within(detail).getByText("支付宝")).not.toBeNull();
    expect(within(detail).getByText("provider_safe_provider_mismatch")).not.toBeNull();
    expect(within(detail).getAllByText("支付记录需核对").length).toBeGreaterThanOrEqual(1);
    expect(within(detail).getByText("支付记录与原订单不一致，请先完成账务核对后再处理退款。")).not.toBeNull();
    expect(within(detail).queryByRole("button", { name: "退款审批" })).toBeNull();
    expect(within(detail).queryByLabelText("订单记录操作")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/callback|provider mismatch|channel mismatch/i);
  });

  test("keeps refund actions out of the compact Order Records detail card", () => {
    const payments: AdminPaymentOrderSummary[] = [
      {
        accessRequestRef: "pareq_refund_001",
        accessRequestStatus: "delivered",
        amountMinor: 3000,
        createdAt: "2026-07-02T11:00:00.000Z",
        currency: "CNY",
        displayRef: "buyer@example.test",
        loginRef: "buyer@example.test",
        orderRef: "pay_order_refund_ref",
        paidAt: "2026-07-02T11:05:00.000Z",
        plan: "monthly_plus",
        planLabel: "monthly plus",
        status: "paid_access_delivered"
      }
    ];
    const quoteRefund = vi.fn();
    const approveRefund = vi.fn();
    const previewApproval = vi.fn();
    const updateTrafficLimit = vi.fn();

    render(
      <AdminSafeReadPage
        page="orderManagement"
        orderManagementLifecycle={{ approveRefund, previewApproval, quoteRefund, updateTrafficLimit }}
        orderManagementPayments={payments}
      />
    );

    const detail = screen.getByLabelText("订单记录详情");
    expect(within(detail).getByText("未申请")).not.toBeNull();
    expect(within(detail).queryByRole("button", { name: "退款审批" })).toBeNull();
    expect(screen.queryByLabelText("订单记录操作面板")).toBeNull();
    expect(quoteRefund).not.toHaveBeenCalled();
    expect(approveRefund).not.toHaveBeenCalled();
    expect(document.body.textContent ?? "").not.toMatch(/checkoutUrl|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|rawArtifact|handoffMaterial|merchantSecret|rawPayload/i);
  });

  test("merges usage monitor evidence into Order Records for billing reconciliation", () => {
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

    const detail = screen.getByLabelText("订单记录详情");
    expect(within(detail).getByText("pareq_live_002")).not.toBeNull();
    expect(within(detail).getByText("acct_live_002")).not.toBeNull();
    expect(within(detail).getByText("年度套餐")).not.toBeNull();
    expect(within(detail).queryByLabelText("订单用量核对")).toBeNull();
    expect(within(detail).queryByText("用量与账务核对")).toBeNull();
    expect(within(detail).queryByText("订单用量记录")).toBeNull();
    expect(within(detail).queryByText("订单与账户用量")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_|bearer|raw log|sqlite|rawArtifact|handoffMaterial/i);
  });

  test("does not expose lifecycle operations from the Order Records detail card", () => {
    const previewApproval = vi.fn();
    const updateTrafficLimit = vi.fn();
    const quoteRefund = vi.fn();
    const approveRefund = vi.fn();
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
        orderManagementLifecycle={{ approveRefund, previewApproval, quoteRefund, updateTrafficLimit }}
        orderManagementRequests={requests}
      />
    );

    const initialDetail = screen.getByLabelText("订单记录详情");
    expect(within(initialDetail).queryByLabelText("订单记录操作")).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "审核订单" })).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "调整流量" })).toBeNull();
    expect(within(initialDetail).queryByRole("button", { name: "退款审批" })).toBeNull();

    fireEvent.click(screen.getByRole("row", { name: /pareq_live_002 pareq_live_002 acct_live_002 年度套餐 已开通 使用中 已开通/ }));
    const updatedDetail = screen.getByLabelText("订单记录详情");
    expect(within(updatedDetail).queryByLabelText("订单记录操作")).toBeNull();
    expect(screen.queryByLabelText("订单记录操作面板")).toBeNull();
    expect(previewApproval).not.toHaveBeenCalled();
    expect(updateTrafficLimit).not.toHaveBeenCalled();
    expect(quoteRefund).not.toHaveBeenCalled();
    expect(approveRefund).not.toHaveBeenCalled();
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
