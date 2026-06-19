import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  PortalAccessApprovalPreview,
  PortalAccessRequestSummary
} from "../features/subscriptions/types";
import { PortalRequestsPage } from "../pages/portal-requests-page";

afterEach(() => {
  cleanup();
});

describe("portal requests page", () => {
  test("presents portal access requests as product order management", async () => {
    const listPortalAccessRequests = vi.fn(async () => [
      portalRequestFixture({
        id: "order_safe_001",
        portalUserRef: "portal_user_001",
        accessGrantRef: "artifactref_should_not_render"
      })
    ]);
    const previewPortalAccessRequestApproval = vi.fn(async () => approvalPreviewFixture());

    render(<PortalRequestsPage apiClient={adminClient({
      listPortalAccessRequests,
      previewPortalAccessRequestApproval
    })} />);

    expect(await screen.findByRole("heading", { name: "订单运营" })).not.toBeNull();
    expect(screen.getByLabelText("订单概览")).not.toBeNull();
    expect(screen.getByText("安全边界")).not.toBeNull();
    expect(screen.getByText("本页只显示安全引用、状态和交付预览；不会展示订阅链接、原始交付材料、客户私密信息或运行配置。")).not.toBeNull();
    expect(screen.getByLabelText("状态说明")).not.toBeNull();
    expect(screen.getByText("审批已通过，但真实交付仍需受控执行。")).not.toBeNull();
    expect(screen.getByLabelText("订单列表")).not.toBeNull();
    expect(screen.getByLabelText("订单详情")).not.toBeNull();
    expect(screen.getByLabelText("交付预览")).not.toBeNull();
    expect(screen.getAllByText("订单编号").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("账号").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("交付记录").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("已有记录").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("交付通道")).not.toBeNull();
    expect(screen.getByText("默认交付通道")).not.toBeNull();

    const visibleText = document.body.textContent ?? "";
    expect(visibleText).not.toMatch(/artifact|node|channel-lab|stable-node-a|tuic/i);
    expect(visibleText).not.toMatch(/artifactref_should_not_render/i);
    expect(visibleText).not.toMatch(/operator_safe_001/i);

    fireEvent.change(screen.getByLabelText("审批编号"), { target: { value: "approval_safe_001" } });
    fireEvent.change(screen.getByLabelText("操作员"), { target: { value: "operator_safe_001" } });
    fireEvent.click(screen.getByRole("button", { name: "生成交付预览" }));

    await waitFor(() => {
      expect(previewPortalAccessRequestApproval).toHaveBeenCalledWith("order_safe_001", {
        approvalRef: "approval_safe_001",
        reviewedByRef: "operator_safe_001",
        nodeId: "stable-node-a"
      });
    });

    expect(await screen.findByLabelText("交付预览结果")).not.toBeNull();
    expect(screen.getByText("预览完成。真实交付仍需要通过受控执行路径完成。")).not.toBeNull();
    expect((document.body.textContent ?? "")).not.toMatch(/artifact|node|channel-lab|stable-node-a|tuic/i);
  });
});

function adminClient(overrides: Partial<AdminApiClient>): AdminApiClient {
  return overrides as AdminApiClient;
}

function portalRequestFixture(overrides: Partial<PortalAccessRequestSummary> = {}): PortalAccessRequestSummary {
  return {
    id: "order_safe_001",
    type: "portal_access_request_summary",
    portalUserRef: "portal_user_001",
    plan: "trial",
    planLabel: "7 天体验",
    durationDays: 7,
    status: "approved_pending_delivery",
    nextAction: "delivery_required",
    submittedAt: "2026-06-05T08:00:00.000Z",
    updatedAt: "2026-06-05T08:15:00.000Z",
    reviewedAt: "2026-06-05T08:10:00.000Z",
    reviewedByRef: "operator_safe_001",
    safeReasonCode: "approved",
    priorTrialState: "unused",
    entitlementRef: "entitlement_safe_001",
    accessGrantRef: null,
    safety: {
      noSubscriptionUrl: true,
      noRawCustomerData: true,
      noRawHandoffMaterial: true,
      noEntitlementCreated: false,
      noRuntimeMutation: true,
      noProductionMutation: true
    },
    ...overrides
  };
}

function approvalPreviewFixture(overrides: Partial<PortalAccessApprovalPreview> = {}): PortalAccessApprovalPreview {
  return {
    ok: true,
    mode: "portal-access-request-approval-preview",
    status: "approved_pending_delivery",
    request: portalRequestFixture(),
    approvalRef: "approval_safe_001",
    issuanceInput: {
      plan: "trial",
      nodeId: "stable-node-a"
    },
    safety: {
      previewOnly: true,
      noSubscriptionUrl: true,
      noRawHandoffMaterial: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      requiresSeparateIssuanceExecution: true
    },
    ...overrides
  };
}
