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

    expect(await screen.findByRole("heading", { name: "User resource supervision" })).not.toBeNull();
    expect(screen.getByText("Supervises access resources, usage, and anomaly handling by user account; this is not an isolated subscription creation entry.")).not.toBeNull();
    expect(screen.getByLabelText("Supervision overview")).not.toBeNull();
    expect(screen.getByLabelText("User account supervision")).not.toBeNull();
    expect(screen.getByLabelText("User resource list")).not.toBeNull();
    expect(screen.getByLabelText("User resource detail")).not.toBeNull();
    expect(screen.getByLabelText("Traffic quota")).not.toBeNull();
    expect(screen.getByLabelText("Controlled delivery preview")).not.toBeNull();
    expect(screen.getByLabelText("Accounts & Resources supervision cases")).not.toBeNull();
    expect(screen.getAllByText("Order pending controlled delivery").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Case detail")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Order pending controlled delivery" })).not.toBeNull();
    expect(screen.getByText("Accounts & Resources")).not.toBeNull();
    const caseDetail = screen.getByLabelText("Case detail");
    expect(within(caseDetail).getByLabelText("Linked objects")).not.toBeNull();
    expect(within(caseDetail).getByLabelText("Object timeline")).not.toBeNull();
    expect(within(caseDetail).getByText("portal_user_001")).not.toBeNull();
    expect(within(caseDetail).getAllByText("order_safe_002").length).toBeGreaterThanOrEqual(1);
    expect(within(caseDetail).getAllByText("Accounts & Resources").length).toBeGreaterThanOrEqual(1);
    expect(within(caseDetail).getAllByText(/Pending delivery|Pending controlled delivery/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Phase one is read-only for candidates and evidence; close, false-positive, archive, and note writes wait for the backend Case contract.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /disable|archive|create subscription|delete/i })).toBeNull();
    expect(screen.getAllByText("Resource / order ID").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("User account").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Subscription artifact").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Record exists").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Account lifecycle").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Waiting for account-state backend").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Resource / order lifecycle").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Delivered").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Resource orders").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2 resources").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Quota source").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Order coverage")).not.toBeNull();
    expect(screen.getAllByText("Used / total").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("15 GB / 20 GB").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Collection coverage").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Measured 2/3 channels").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Resource channel")).not.toBeNull();
    expect(screen.getByText("Default resource channel")).not.toBeNull();

    const visibleText = document.body.textContent ?? "";
    expect(visibleText).not.toMatch(/artifactref_should_not_render/i);
    expect(visibleText).not.toMatch(/operator_safe_001/i);
    expect(visibleText).not.toMatch(/subscriptionUrl|token|credential|password|raw config|sqlite|customer-private/i);

    fireEvent.change(screen.getByLabelText("Approval ref"), { target: { value: "approval_safe_001" } });
    fireEvent.change(screen.getByLabelText("Operator"), { target: { value: "operator_safe_001" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate delivery preview" }));

    await waitFor(() => {
      expect(previewPortalAccessRequestApproval).toHaveBeenCalledWith("order_safe_001", {
        approvalRef: "approval_safe_001",
        reviewedByRef: "operator_safe_001",
        nodeId: "stable-node-a"
      });
    });

    expect(await screen.findByLabelText("Controlled delivery preview result")).not.toBeNull();
    expect(screen.getByText("Preview complete. Real resource delivery still requires the controlled execution path.")).not.toBeNull();
    expect((document.body.textContent ?? "")).not.toMatch(/artifactref_should_not_render|operator_safe_001|channel-lab|stable-node-a|tuic/i);
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
    planLabel: "7-day trial",
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
