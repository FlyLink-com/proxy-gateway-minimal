import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  test("presents portal access requests as user resource supervision", async () => {
    const listPortalAccessRequests = vi.fn(async () => [
      portalRequestFixture({
        id: "order_safe_001",
        portalUserRef: "portal_user_001",
        status: "delivered",
        nextAction: "monitor_resource",
        accessGrantRef: "artifactref_should_not_render",
        trafficLimitBytes: 20 * 1024 * 1024 * 1024,
        usage: {
          uploadBytes: 6 * 1024 * 1024 * 1024,
          downloadBytes: 9 * 1024 * 1024 * 1024,
          usedBytes: 15 * 1024 * 1024 * 1024,
          totalBytes: 20 * 1024 * 1024 * 1024,
          usageRatio: 0.75,
          status: "within_limit",
          collectionStatus: "measured",
          channelCount: 3,
          measuredChannelCount: 2,
          updatedAt: "2026-06-05T09:00:00.000Z"
        }
      }),
      portalRequestFixture({
        id: "order_safe_002",
        portalUserRef: "portal_user_001",
        status: "approved_pending_delivery",
        nextAction: "delivery_required",
        entitlementRef: "entitlement_safe_002"
      })
    ]);
    const previewPortalAccessRequestApproval = vi.fn(async () => approvalPreviewFixture());

    render(<PortalRequestsPage apiClient={adminClient({
      listPortalAccessRequests,
      previewPortalAccessRequestApproval
    })} />);

    expect(await screen.findByRole("heading", { name: "用户资源监管" })).not.toBeNull();
    expect(screen.getByText("按用户账号监管访问资源、用量和异常处置，不作为独立订阅创建入口。")).not.toBeNull();
    expect(screen.getByLabelText("监管概览")).not.toBeNull();
    expect(screen.getByLabelText("用户账号监管")).not.toBeNull();
    expect(screen.getByLabelText("用户资源列表")).not.toBeNull();
    expect(screen.getByLabelText("用户资源详情")).not.toBeNull();
    expect(screen.getByLabelText("流量额度")).not.toBeNull();
    expect(screen.getByLabelText("受控发放预览")).not.toBeNull();
    expect(screen.getByLabelText("账号与资源监管案件")).not.toBeNull();
    expect(screen.getAllByText("订单等待受控发放").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("监管案件详情")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "订单等待受控发放" })).not.toBeNull();
    expect(screen.getByText("账号与资源")).not.toBeNull();
    const caseDetail = screen.getByLabelText("监管案件详情");
    expect(within(caseDetail).getByLabelText("关联对象")).not.toBeNull();
    expect(within(caseDetail).getByLabelText("对象时间线")).not.toBeNull();
    expect(within(caseDetail).getByText("portal_user_001")).not.toBeNull();
    expect(within(caseDetail).getAllByText("order_safe_002").length).toBeGreaterThanOrEqual(1);
    expect(within(caseDetail).getAllByText("账号与资源").length).toBeGreaterThanOrEqual(1);
    expect(within(caseDetail).getAllByText(/待发放|等待受控发放/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("阶段一只读展示候选和证据；关闭、误报、归档和备注写入等待后端 Case 契约。")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /禁用|归档|创建订阅|删除/i })).toBeNull();
    expect(screen.getAllByText("资源/订单编号").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("用户账号").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("订阅产物").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("已有记录").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("账号生命周期").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("待接入账号状态").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("资源/订单生命周期").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("已发放").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("资源订单").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2 个资源").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("额度来源").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("订单覆盖")).not.toBeNull();
    expect(screen.getAllByText("已用/总量").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("15 GB / 20 GB").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("采集覆盖").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("已计量 2/3 通道").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("资源通道")).not.toBeNull();
    expect(screen.getByText("默认资源通道")).not.toBeNull();

    const visibleText = document.body.textContent ?? "";
    expect(visibleText).not.toMatch(/artifactref_should_not_render/i);
    expect(visibleText).not.toMatch(/operator_safe_001/i);
    expect(visibleText).not.toMatch(/subscriptionUrl|token|credential|password|raw config|sqlite|customer-private/i);

    fireEvent.change(screen.getByLabelText("审批编号"), { target: { value: "approval_safe_001" } });
    fireEvent.change(screen.getByLabelText("操作员"), { target: { value: "operator_safe_001" } });
    fireEvent.click(screen.getByRole("button", { name: "生成发放预览" }));

    await waitFor(() => {
      expect(previewPortalAccessRequestApproval).toHaveBeenCalledWith("order_safe_001", {
        approvalRef: "approval_safe_001",
        reviewedByRef: "operator_safe_001",
        nodeId: "stable-node-a"
      });
    });

    expect(await screen.findByLabelText("受控发放预览结果")).not.toBeNull();
    expect(screen.getByText("预览完成。真实资源发放仍需要通过受控执行路径完成。")).not.toBeNull();
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
