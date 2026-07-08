import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createAdminApiClient, type AdminApiClient } from "../features/subscriptions/api-client";
import { loadAdminSession, saveAdminSession } from "../features/subscriptions/admin-session";
import type {
  AliyunGateDecisionPacket,
  AliyunGateEvidenceSummary,
  ChannelRuntimeEvidenceBridge,
  ChannelRuntimeEvidenceBridgeInput,
  ChannelRuntimeExecutionHandoff,
  ChannelRuntimeGateWorkbench,
  ChannelSubscriptionActivationFlow,
  ChannelSubscriptionActivationFlowInput,
  ChannelSubscriptionActivationHandoff,
  ChannelSubscriptionActivationHandoffInput,
  ChannelSubscriptionActivationPackage,
  ChannelSubscriptionActivationRecordTemplate,
  ChannelSubscriptionActivationRecordTemplateInput,
  ChannelSubscriptionActivationReadiness,
  ChannelSubscriptionActivationReadinessInput,
  ChannelSubscriptionOutputDraft,
  ChannelSubscriptionOutputDraftInput,
  ChannelLabTargetDecision,
  CleanEdgeReadinessInput,
  CleanEdgeReadinessSummary,
  ChannelSystemDecisionFlow,
  ChannelSystemReviewInput,
  PartnerAttributionAdminReport,
  SubscriptionUsageMonitor,
  SubscriptionTenant
} from "../features/subscriptions/types";
import { PortalRequestsPage } from "../pages/portal-requests-page";

afterEach(() => {
  cleanup();
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
}

describe("admin API client", () => {
  test("lists tenants with bearer auth and normalized base URL", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: "tenant_1",
            displayName: "karing-blue-sg",
            status: "active",
            expiresAt: "2026-12-31T00:00:00.000Z",
            note: "primary",
            nodeName: "aws-singapore-blue",
            tokenPrefix: "pgsub_abcdefg",
            lastUsedAt: null,
            credentialMode: "shared-node"
          }
        ]
      })
    );
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const tenants = await client.listTenants();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3456/api/admin/subscriptions",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const init = firstCall[1];
    expect((init.headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(tenants).toHaveLength(1);
    expect(tenants[0].nodeName).toBe("aws-singapore-blue");
  });

  test("uses same-origin API paths when base URL is blank", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    await client.listTenants();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/subscriptions",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });

  test("does not send bearer token to untrusted cross-origin API base URLs", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    const client = createAdminApiClient({
      baseUrl: "https://evil.example",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    await expect(client.listTenants()).rejects.toThrow(/not sent|not trusted/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("allows bearer token for loopback development API base URLs", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    await client.listTenants();

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[0]).toBe("http://127.0.0.1:3456/api/admin/subscriptions");
    expect((firstCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
  });

  test("does not surface sensitive backend error messages", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          error: "internal_error",
          message: "failed for https://gateway.example.com/sub/clash.yaml?token=pgsub_sensitive_token password=secret"
        },
        { status: 500 }
      )
    );
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    let thrown: unknown;
    try {
      await client.listTenants();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Admin API request failed with HTTP 500.");
    expect((thrown as Error).message).not.toMatch(/pgsub_sensitive_token|password=secret|gateway\.example/);
  });

  test("previews operator provisioning forms through the protected platform route", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        provisioningForm: {
          status: "ready_for_cli_dry_run",
          issuanceInput: { nodeId: "channel-lab-b-tuic" },
          execution: { dbMutationAuthorized: false },
          safety: { noProductionMutation: true }
        }
      })
    );
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });
    const input = {
      approvalRef: "PR-265",
      customerLabel: "Customer Alpha",
      customerEmail: "owner@sensitive.example",
      customerChannel: "manual-intake",
      subscriptionLabel: "customer-alpha-preproduction",
      expiresAt: "2026-06-04",
      nodeId: "channel-lab-b-tuic"
    };

    const preview = await client.previewProvisioningForm(input);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/provisioning-form/preview",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
        headers: expect.any(Headers)
      })
    );
    expect(preview.status).toBe("ready_for_cli_dry_run");
    expect(preview.execution.dbMutationAuthorized).toBe(false);
    expect(preview.safety.noProductionMutation).toBe(true);
  });

  test("lists portal access requests through the protected Admin route", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      items: [{
        id: "pareq_1",
        type: "portal_access_request_summary",
        portalUserRef: "user_safe_ref",
        plan: "trial",
        planLabel: "30-day initial trial",
        durationDays: 7,
        status: "pending_admin_review",
        nextAction: "admin_review_required",
        submittedAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        priorTrialState: "none",
        entitlementRef: null,
        accessGrantRef: null,
        safety: {
          noSubscriptionUrl: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noEntitlementCreated: true,
          noRuntimeMutation: true,
          noProductionMutation: true
        }
      }]
    }));
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "secret",
      fetcher
    });

    const items = await client.listPortalAccessRequests();

    expect(items[0].plan).toBe("trial");
    const firstCall = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[0]).toBe("http://127.0.0.1:3456/api/admin/platform/portal-access-requests");
  });

  test("loads partner attribution reporting through the protected platform route", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ report: partnerAttributionReport() }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher
    });

    const loaded = await client.getPartnerAttributionReport();

    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/platform/partner-attribution-report",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    const firstCall = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect((firstCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(loaded).toMatchObject({
      type: "partner_attribution_admin_report",
      status: "ready",
      summary: { partnerCount: 1, settlementCandidateCount: 1 },
      safety: {
        summaryOnly: true,
        rawProviderPayloadReturned: false,
        rawSubscriptionUrlReturned: false,
        rawTokenReturned: false,
        rawCredentialReturned: false,
        mutationAllowed: false
      }
    });
  });

  test("previews portal access request approval without returning subscription material", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      preview: {
        ok: true,
        mode: "portal-access-request-approval-preview",
        status: "approved_pending_delivery",
        request: { id: "pareq_1", plan: "trial", durationDays: 7, status: "approved_pending_delivery" },
        issuanceInput: {
          displayName: "customer",
          expiresInDays: 7,
          plan: "trial",
          nodeId: "channel-lab-b-tuic",
          note: "portal-access-request:pareq_1",
          artifact: { create: true },
          control: {
            accountId: "user_safe_ref",
            ownerRef: "user_safe_ref",
            entitlementId: "ent_pareq_1",
            requestId: "pareq_1",
            requestedByRef: "operator_safe_ref",
            purpose: "portal_access_request",
            plan: "trial"
          }
        },
        approvalRef: "approval_trial_1",
        safety: {
          previewOnly: true,
          noSubscriptionUrl: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noProductionMutation: true,
          requiresSeparateIssuanceExecution: true
        }
      }
    }));
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "secret",
      fetcher
    });

    const preview = await client.previewPortalAccessRequestApproval("pareq_1", {
      reviewedByRef: "operator_safe_ref",
      approvalRef: "approval_trial_1",
      nodeId: "channel-lab-b-tuic"
    });

    expect(preview.status).toBe("approved_pending_delivery");
    const firstCall = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.stringify(firstCall[1]?.body)).not.toMatch(/subscriptionUrl|token=/i);
  });

  test("updates portal access request traffic limits through the protected Admin route", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      quotaUpdate: {
        ok: true,
        type: "portal_access_request_traffic_limit_update",
        request: {
          id: "pareq_1",
          type: "portal_access_request_summary",
          usage: {
            usedBytes: 700,
            totalBytes: 2048,
            status: "within_limit"
          }
        },
        quota: {
          previousTrafficLimitBytes: 1000,
          trafficLimitBytes: 2048,
          updatedAt: "2026-06-15T00:01:00.000Z"
        },
        audit: {
          action: "traffic_limit_updated",
          recordedAt: "2026-06-15T00:01:00.000Z"
        },
        safety: {
          noSubscriptionUrl: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noProductionMutation: true
        }
      }
    }));
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "secret",
      fetcher
    });

    const update = await client.updatePortalAccessRequestTrafficLimit("pareq_1", {
      trafficLimitBytes: 2048,
      reviewedByRef: "operator_safe_ref",
      reasonCode: "plan_change"
    });

    expect(update.quota.trafficLimitBytes).toBe(2048);
    const firstCall = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[0]).toBe("http://127.0.0.1:3456/api/admin/platform/portal-access-requests/pareq_1/traffic-limit");
    expect(firstCall[1]).toEqual(expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        trafficLimitBytes: 2048,
        reviewedByRef: "operator_safe_ref",
        reasonCode: "plan_change"
      })
    }));
  });

  test("loads and records Aliyun gate review data without raw firewall details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ aliyunGates: aliyunGatePacket() }))
      .mockResolvedValueOnce(jsonResponse({ evidence: aliyunGateEvidence() }))
      .mockResolvedValueOnce(jsonResponse({ evidence: aliyunGateEvidence("ready_for_gate_packet") }))
      .mockResolvedValueOnce(jsonResponse({ evidence: aliyunGateEvidence("ready_for_gate_packet", "ready_for_artifact_issuance_gate") }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect((await client.getAliyunGates()).gates).toHaveLength(2);
    expect((await client.getAliyunGateEvidence())?.providerFirewall?.status).toBe("incomplete");
    await client.recordProviderFirewallEvidence({
      hasRollbackSnapshot: true,
      hasManagementSourceDecision: true,
      hasWgHomeDecision: false
    });

    const recordCall = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(recordCall[0]).toBe("/api/admin/platform/aliyun-gate-evidence/provider-firewall");
    expect(recordCall[1].method).toBe("POST");
    expect(JSON.parse(String(recordCall[1].body))).toEqual({
      hasRollbackSnapshot: true,
      hasManagementSourceDecision: true,
      hasWgHomeDecision: false
    });
    expect(JSON.stringify(recordCall[1].body)).not.toMatch(/rawRules|note|token|operator-home|secret-label/i);

    await client.recordAccessMigrationEvidence({
      hasLiveAccessModelInventory: true,
      hasApprovedArtifactScope: true,
      artifactIssuanceCompleted: false,
      artifactRefreshObservationRecorded: false,
      hasApprovedLegacyRetirementScope: false
    });
    const accessMigrationCall = fetchMock.mock.calls[3] as unknown as [string, RequestInit];
    expect(accessMigrationCall[0]).toBe("/api/admin/platform/aliyun-gate-evidence/access-migration");
    expect(accessMigrationCall[1].method).toBe("POST");
    expect(JSON.parse(String(accessMigrationCall[1].body))).toEqual({
      hasLiveAccessModelInventory: true,
      hasApprovedArtifactScope: true,
      artifactIssuanceCompleted: false,
      artifactRefreshObservationRecorded: false,
      hasApprovedLegacyRetirementScope: false
    });
    expect(JSON.stringify(accessMigrationCall[1].body)).not.toMatch(/subscriptionUrl|artifactUrl|rawTokens|token|secret/i);
  });

  test("reviews channel system readiness through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ channelSystem: channelSystemDecisionFlow() }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const channelSystem = await client.reviewChannelSystem(channelSystemReviewInput());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/channel-system-decision-flow",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(channelSystemReviewInput());
    expect(JSON.stringify(reviewCall[1].body)).not.toMatch(/secret\.example|token=|subscriptionUrl|credential/i);
    expect(channelSystem.flowStatus).toBe("approval_ready");
    expect(channelSystem.systemReadiness.canaryReadyCount).toBe(1);
  });

  test("bridges runtime evidence through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ channelRuntimeEvidence: channelRuntimeEvidenceBridge() }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const bridge = await client.reviewChannelRuntimeEvidence(channelRuntimeEvidenceBridgeInput());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/channel-runtime-evidence-bridge",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(channelRuntimeEvidenceBridgeInput());
    expect(JSON.stringify(reviewCall[1].body)).not.toMatch(/secret\.example|token=|subscriptionUrl|credential|\"host\"|\"port\"/i);
    expect(bridge.mode).toBe("channel-runtime-evidence-bridge");
    expect(bridge.channelSystem.flowStatus).toBe("approval_ready");
  });

  test("reviews channel lab target decisions through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ channelLabTargetDecision: channelLabTargetDecision() }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const decision = await client.reviewChannelLabTargetDecision(channelLabTargetInventoryInput());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/channel-lab-target-decision",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(channelLabTargetInventoryInput());
    expect(JSON.stringify(reviewCall[1].body)).not.toMatch(/secret\.example|token=|subscriptionUrl|credential|\"host\"|\"port\"/i);
    expect(decision.mode).toBe("channel-lab-target-decision");
    expect(decision.status).toBe("fresh_target_recommended");
  });

  test("reviews clean edge readiness through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ cleanEdgeReadiness: cleanEdgeReadinessSummary() }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const summary = await client.reviewCleanEdgeReadiness(cleanEdgeReadinessInput());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/clean-edge-readiness-summary",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(cleanEdgeReadinessInput());
    expect(JSON.stringify(reviewCall[1].body)).not.toMatch(/secret\.example|token=|subscriptionUrl|credential|\"host\"|\"port\"/i);
    expect(summary.mode).toBe("clean-edge-readiness-summary");
    expect(summary.readiness.preconditionsReady).toBe(true);
    expect(summary.readiness.executionAllowed).toBe(false);
  });

  test("reviews channel subscription output drafts through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      channelSubscriptionOutputDraft: channelSubscriptionOutputDraft()
    }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const draft = await client.reviewChannelSubscriptionOutputDraft(channelSubscriptionOutputDraftInput());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/channel-subscription-output-draft",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(channelSubscriptionOutputDraftInput());
    expect(JSON.stringify(reviewCall[1].body)).not.toMatch(/secret\.example|token=|subscriptionUrl|credential|\"host\"|\"port\"/i);
    expect(draft.mode).toBe("channel-subscription-output-draft");
    expect(draft.subscriptionOutputDraft.yamlGenerated).toBe(false);
    expect(draft.subscriptionOutputDraft.realSubscriptionOutputChanged).toBe(false);
  });

  test("reviews channel subscription activation readiness through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      channelSubscriptionActivationReadiness: channelSubscriptionActivationReadiness()
    }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const readiness = await client.reviewChannelSubscriptionActivationReadiness(
      channelSubscriptionActivationReadinessInput()
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/channel-subscription-activation-readiness",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(channelSubscriptionActivationReadinessInput());
    expect(JSON.stringify(reviewCall[1].body)).not.toMatch(/secret\.example|token=|subscriptionUrl|credential|\"host\"|\"port\"/i);
    expect(readiness.mode).toBe("channel-subscription-activation-readiness");
    expect(readiness.activationGate.executionAuthority).toBe("not_granted");
    expect(readiness.subscriptionOutputDraft.realSubscriptionOutputChanged).toBe(false);
  });

  test("reviews channel subscription activation handoffs through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      channelSubscriptionActivationHandoff: channelSubscriptionActivationHandoff()
    }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const handoff = await client.reviewChannelSubscriptionActivationHandoff(
      channelSubscriptionActivationHandoffInput()
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/channel-subscription-activation-handoff",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(channelSubscriptionActivationHandoffInput());
    expect(JSON.stringify(reviewCall[1].body)).not.toMatch(/secret\.example|token=|subscriptionUrl|credential|\"host\"|\"port\"/i);
    expect(handoff.mode).toBe("channel-subscription-activation-handoff-packet");
    expect(handoff.handoff.executionAuthority).toBe("not_granted");
    expect(handoff.handoff.nextGate.subscriptionOutputExecutionRoute).toBeNull();
    expect(handoff.safety.noSubscriptionOutputMutation).toBe(true);
  });

  test("reviews channel subscription activation flows through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      channelSubscriptionActivationFlow: channelSubscriptionActivationFlow()
    }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const flow = await client.reviewChannelSubscriptionActivationFlow(
      channelSubscriptionActivationFlowInput()
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/channel-subscription-activation-flow",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(channelSubscriptionActivationFlowInput());
    expect(JSON.stringify(reviewCall[1].body)).not.toMatch(/secret\.example|token=|subscriptionUrl|credential|\"host\"|\"port\"/i);
    expect(flow.mode).toBe("channel-subscription-activation-flow");
    expect(flow.flowStatus).toBe("ready_for_a_tier_subscription_output_activation_request");
    expect(flow.gate.executionAuthority).toBe("not_granted");
    expect(flow.gate.subscriptionOutputExecutionRoute).toBeNull();
    expect(flow.safety.noSubscriptionOutputMutation).toBe(true);
  });

  test("reviews channel subscription activation record templates through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      channelSubscriptionActivationRecordTemplate: channelSubscriptionActivationRecordTemplate()
    }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const template = await client.reviewChannelSubscriptionActivationRecordTemplate(
      channelSubscriptionActivationRecordTemplateInput()
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/channel-subscription-activation-record-template",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(channelSubscriptionActivationRecordTemplateInput());
    expect(String(reviewCall[1].body)).not.toMatch(/secret\.example|token=|https?:\/\/|\"host\"|\"port\"/i);
    expect(template.mode).toBe("channel-subscription-activation-record-template");
    expect(template.record.suggestedPath).toMatch(/channel-subscription-output-activation/);
    expect(template.readiness.executionAuthority).toBe("not_granted");
    expect(template.safety.templateOnly).toBe(true);
    expect(template.safety.noSubscriptionOutputMutation).toBe(true);
  });

  test("reviews channel subscription activation packages through the protected platform endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      channelSubscriptionActivationPackage: channelSubscriptionActivationPackage()
    }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const activationPackage = await client.reviewChannelSubscriptionActivationPackage(
      channelSubscriptionActivationPackageInput()
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/platform/channel-subscription-activation-package",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    const reviewCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((reviewCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(JSON.parse(String(reviewCall[1].body))).toEqual(channelSubscriptionActivationPackageInput());
    expect(String(reviewCall[1].body)).not.toMatch(/secret\.example|token=|https?:\/\/|\"host\"|\"port\"/i);
    expect(activationPackage.mode).toBe("channel-subscription-activation-package");
    expect(activationPackage.package.approvalRequestReady).toBe(true);
    expect(activationPackage.renderProof.yamlReturned).toBe(false);
    expect(activationPackage.recordTemplate.markdownReturned).toBe(false);
    expect(activationPackage.gate.executesGate).toBe(false);
  });
});

describe("portal access request admin page", () => {
  test("keeps the page layer as a design draft instead of the finished management panel", () => {
    render(createElement(PortalRequestsPage));

    expect(screen.getByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.getByText("User Operations / Accounts & Resources")).not.toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources status dashboard")).toBeNull();
    expect(screen.getByLabelText("Accounts & Resources module layout")).not.toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Account Directory hide module" })).not.toBeNull();
    expect(screen.queryByText(/not the finished management panel/)).toBeNull();
    expect(screen.queryByText("Page design notes")).toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Quota & Usage" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Lifecycle" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "History & Events" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Quota & Lifecycle subpage" }));
    expect(screen.getByRole("heading", { name: "Quota & Usage" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open History & Events subpage" }));
    expect(screen.getByRole("heading", { name: "History & Events" })).not.toBeNull();
    expect(screen.queryByText("User resource supervision")).toBeNull();
    expect(screen.queryByText("Controlled delivery preview")).toBeNull();
    expect(screen.queryByText("Traffic quota")).toBeNull();
    expect(screen.queryByRole("button", { name: /Generate delivery preview|Save quota/i })).toBeNull();
  });
});

describe("admin session", () => {
  test("persists local API base URL and console token in session storage", () => {
    sessionStorage.clear();

    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "secret"
    });

    expect(loadAdminSession()).toEqual({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "secret"
    });
  });

  test("preserves blank API base URL for same-origin proxy use", () => {
    sessionStorage.clear();

    saveAdminSession({
      baseUrl: "",
      consoleToken: "secret"
    });

    expect(loadAdminSession()).toEqual({
      baseUrl: "",
      consoleToken: "secret"
    });
  });
});

function tenant(overrides: Partial<SubscriptionTenant> = {}): SubscriptionTenant {
  return {
    id: "tenant_1",
    displayName: "real-user",
    status: "active",
    expiresAt: "2026-12-31T00:00:00.000Z",
    note: "real backend row",
    nodeName: "aws-singapore-blue",
    tokenPrefix: "pgsub_realpre",
    lastUsedAt: null,
    credentialMode: "shared-node",
    ...overrides
  };
}

function subscriptionUsageMonitor(): SubscriptionUsageMonitor {
  return {
    type: "subscription_usage_monitor",
    generatedAt: "2026-06-04T12:00:00.000Z",
    filters: {
      accountId: "",
      plan: "",
      nodeId: "",
      status: "",
      warning: "",
      from: "",
      to: "",
      bucket: "hour"
    },
    aggregates: {
      total: 0,
      activeRecently: 0,
      neverSeen: 0,
      highRefresh: 0,
      blocked: 0,
      inactive: 0,
      seen: 0,
      withWarnings: 0,
      byPlan: {},
      byNode: {},
      warnings: {},
      usage: {
        totalUsedBytes: 0,
        totalUploadBytes: 0,
        totalDownloadBytes: 0,
        measuredOrders: 0,
        unmeasuredOrders: 0,
        zeroUsageOrders: 0,
        overLimitOrders: 0,
        nearLimitOrders: 0,
        byUsageChannel: {}
      }
    },
    items: [],
    series: usageSeriesFixture(),
    safety: {
      summaryOnly: true,
      realByteUsageMeasured: false,
      orderLevelRows: true,
      channelUsageBreakdownIncluded: true,
      rawSubscriptionUrlReturned: false,
      rawSecretReturned: false,
      rawCustomerNetworkDataReturned: false,
      mutationAllowed: false
    }
  };
}

function partnerAttributionReport(): PartnerAttributionAdminReport {
  return {
    type: "partner_attribution_admin_report",
    status: "ready",
    generatedAt: "2026-07-07T02:00:00.000Z",
    sourceLabels: ["AppsFlyer evidence", "Backend settlement facts"],
    summary: {
      partnerCount: 1,
      campaignCount: 1,
      touchCount: 3,
      eventCount: 6,
      settlementCandidateCount: 1,
      payableReviewCount: 0,
      reversedCount: 0
    },
    funnel: {
      visit: 1,
      registrationSuccess: 1,
      checkoutStarted: 1,
      paymentSuccess: 1,
      entitlementDelivered: 1,
      refund: 0,
      chargeback: 0,
      riskRejected: 0,
      settlementCandidateCreated: 1,
      settlementReversed: 0
    },
    partners: [{
      partnerRef: "partner_alpha",
      safeDisplayName: "Alpha Partner",
      status: "active",
      riskTier: "standard",
      campaignCount: 1,
      touchCount: 3,
      eventCount: 6,
      settlementCandidateCount: 1,
      payableReviewCount: 0,
      reversedCount: 0,
      totalAmountCents: 2500,
      currency: "USD"
    }],
      campaigns: [{
        campaignRef: "campaign_alpha_jp",
        partnerRef: "partner_alpha",
        status: "active",
      provider: "appsflyer",
      touchCount: 3,
      eventCount: 6,
      settlementCandidateCount: 1,
      payableReviewCount: 0,
      reversedCount: 0,
      totalAmountCents: 2500,
      currency: "USD",
      funnel: {
        visit: 1,
        registrationSuccess: 1,
        checkoutStarted: 1,
        paymentSuccess: 1,
        entitlementDelivered: 1,
          settlementCandidateCreated: 1
        }
      }],
      guardrails: {
        summaryOnly: true,
        privacyBoundaryOk: true,
        rawValuesReturned: false,
        reconciliation: {
          payableReviewAllowedCount: 1,
          manualReviewRequiredCount: 0,
          blockedCount: 0
        }
      },
      candidates: [{
        candidateRef: "settlement_candidate_1",
      status: "frozen",
      partnerRef: "partner_alpha",
      campaignRef: "campaign_alpha_jp",
      accountRef: "account_safe_1",
      orderRef: "order_safe_1",
      paymentRef: "payment_safe_1",
      entitlementRef: "entitlement_safe_1",
      policyRef: "policy_first_payment_cpa",
      model: "first_payment_cpa",
      currency: "USD",
      basisAmountCents: 12000,
      amountCents: 2500,
      freezeUntil: "2026-07-14T01:20:00.000Z",
      payableAt: null,
      reversedAt: null,
        reasonCode: null,
        sourceEventRefs: ["event_payment_1", "event_entitlement_1"],
        reversalEventRef: null,
        sourceLabels: ["Backend settlement facts"],
        reconciliationStatus: "payable_review_allowed",
        manualReviewRequired: false,
        reconciliationBlockers: [],
        matchedEvidence: [
          "backend_entitlement_delivered",
          "backend_payment_success",
          "provider_attribution_evidence"
        ]
      }],
    warnings: [],
    safety: {
      summaryOnly: true,
      rawProviderPayloadReturned: false,
      rawSubscriptionUrlReturned: false,
      rawTokenReturned: false,
      rawCredentialReturned: false,
      rawRuntimeConfigReturned: false,
      rawSqliteRowsReturned: false,
      mutationAllowed: false
    }
  };
}

function usageSeriesFixture(overrides: Partial<SubscriptionUsageMonitor["series"]> = {}): SubscriptionUsageMonitor["series"] {
  return {
    type: "subscription_usage_timeseries",
    range: {
      from: null,
      to: null,
      bucket: "hour"
    },
    points: [],
    aggregates: {
      totalUsedBytes: 0,
      totalUploadBytes: 0,
      totalDownloadBytes: 0,
      pointCount: 0,
      seriesCount: 0,
      byOrder: {},
      byAccount: {},
      byChannel: {}
    },
    safety: {
      summaryOnly: true,
      orderScoped: true,
      channelBreakdownIncluded: true,
      rawEdgeCredentialReturned: false,
      rawSubscriptionUrlReturned: false,
      rawSecretReturned: false,
      mutationAllowed: false
    },
    ...overrides
  };
}

function adminClient(overrides: Partial<AdminApiClient> = {}): AdminApiClient {
  return {
    listTenants: async () => [],
    createTenant: async (input) => ({ tenant: tenant({ displayName: input.displayName }), subscriptionUrl: "visible-once" }),
    renewTenant: async (input) => tenant({ id: input.id, expiresAt: input.expiresAt }),
    disableTenant: async (id) => tenant({ id, status: "disabled" }),
    enableTenant: async (id) => tenant({ id, status: "active" }),
    resetToken: async (id) => ({ tenant: tenant({ id, tokenPrefix: "pgsub_newpre" }), subscriptionUrl: "reset-url" }),
    createTempLink: async (id) => ({
      tenantId: id,
      tokenPrefix: "pgtmp_prefix",
      expiresAt: "2026-05-23T00:00:00.000Z",
      subscriptionUrl: "temp-url"
    }),
    listNodes: async () => [],
    overview: async () => ({
      ok: true,
      total: 0,
      active: 0,
      expiring: 0,
      expired: 0,
      disabled: 0,
      nodes: [],
      distribution: {
        mode: "subscription-v2",
        ready: false,
        eligibleNodes: 0,
        blockedNodes: 0,
        blockers: ["no_subscription_eligible_nodes"]
      }
    }),
    getAliyunGates: async () => aliyunGatePacket(),
    getAliyunGateEvidence: async () => aliyunGateEvidence(),
    recordProviderFirewallEvidence: async () => aliyunGateEvidence("ready_for_gate_packet"),
    recordAccessMigrationEvidence: async () =>
      aliyunGateEvidence("incomplete", "ready_for_artifact_issuance_gate"),
    reviewChannelSystem: async () => channelSystemDecisionFlow(),
    reviewChannelRuntimeEvidence: async () => channelRuntimeEvidenceBridge(),
    reviewChannelRuntimeGate: async () => channelRuntimeGateWorkbench(),
    reviewChannelRuntimeExecutionHandoff: async () => channelRuntimeExecutionHandoff(),
    reviewChannelSubscriptionActivationFlow: async () => channelSubscriptionActivationFlow(),
    reviewChannelSubscriptionActivationPackage: async () => channelSubscriptionActivationPackage(),
    reviewChannelSubscriptionActivationRecordTemplate: async () => channelSubscriptionActivationRecordTemplate(),
    reviewChannelSubscriptionActivationHandoff: async () => channelSubscriptionActivationHandoff(),
    reviewChannelSubscriptionActivationReadiness: async () => channelSubscriptionActivationReadiness(),
    reviewChannelSubscriptionOutputDraft: async () => channelSubscriptionOutputDraft(),
    reviewChannelLabTargetDecision: async () => channelLabTargetDecision(),
    reviewCleanEdgeReadiness: async () => cleanEdgeReadinessSummary(),
    previewProvisioningForm: async () => provisioningFormPreview(),
    listPortalAccessRequests: async () => [],
    listSubscriptionUsageMonitor: async () => subscriptionUsageMonitor(),
    getPartnerAttributionReport: async () => partnerAttributionReport(),
    previewPortalAccessRequestApproval: async () => ({
      ok: true,
      mode: "portal-access-request-approval-preview" as const,
      status: "approved_pending_delivery",
      request: {},
      issuanceInput: {},
      approvalRef: "approval_preview",
      safety: {
        previewOnly: true,
        noSubscriptionUrl: true,
        noRawHandoffMaterial: true,
        noRuntimeMutation: true,
        noProductionMutation: true,
        requiresSeparateIssuanceExecution: true
      }
    }),
    updatePortalAccessRequestTrafficLimit: async () => ({
      ok: true,
      type: "portal_access_request_traffic_limit_update" as const,
      request: {},
      quota: {
        previousTrafficLimitBytes: 0,
        trafficLimitBytes: 0,
        updatedAt: "2026-06-15T00:00:00.000Z"
      },
      audit: {
        action: "traffic_limit_updated",
        recordedAt: "2026-06-15T00:00:00.000Z"
      },
      safety: {
        noSubscriptionUrl: true,
        noRawCustomerData: true,
        noRawHandoffMaterial: true,
        noRuntimeMutation: true,
        noProductionMutation: true
      }
    }),
    ...overrides
  };
}

function provisioningFormPreview() {
  return {
    ok: true,
    mode: "platform-provisioning-form" as const,
    status: "ready_for_cli_dry_run",
    blockers: [],
    approvalRef: "PR-265",
    customerRef: "cust_safehash",
    form: {
      source: "operator_provisioning_form",
      operatorRef: "operator_safehash",
      plan: "pilot",
      handoffDelivery: "operator_visible_once",
      rawCustomerDataReturned: false
    },
    issuanceInput: {
      displayName: "customer-alpha-preproduction",
      expiresAt: "2026-06-04T00:00:00.000Z",
      nodeId: "channel-lab-b-tuic",
      note: "preproduction-canary",
      artifact: {
        create: true as const
      }
    },
    execution: {
      command: "platform:issue-subscription",
      nextAction: "run_cli_dry_run_then_request_risk_a_approval",
      requiresRiskAApproval: true,
      dbMutationAuthorized: false,
      publicAdminRequired: false
    },
    audit: {
      recordType: "operator_provisioning_form_summary",
      approvalRef: "PR-265",
      customerRef: "cust_safehash",
      evidenceKinds: ["operator_form_facts", "issuance_input_preview", "risk_a_execution_required"]
    },
    safety: {
      summaryOnly: true,
      formAdapterOnly: true,
      noSubscriptionUrl: true,
      noRawCustomerData: true,
      noSecrets: true,
      noDbMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      requiresSeparateRiskAApprovalForIssuance: true,
      omittedFields: ["customer.email", "subscriptionUrl", "tokens"]
    }
  };
}

function channelSystemReviewInput(): ChannelSystemReviewInput {
  return {
    dryRunSummary: {
      ok: true,
      servers: [
        { name: "ss-baseline", protocol: "ss", qualityClass: "stable" },
        { name: "tuic-lab", protocol: "tuic", qualityClass: "weak-network" }
      ]
    },
    measurementScore: {
      ok: true,
      mode: "channel-measurement-score",
      generatedAt: "2026-05-27T20:00:00.000Z",
      candidates: [
        {
          name: "ss-baseline",
          protocol: "ss",
          qualityClass: "stable",
          channelScore: 99,
          qualityTier: "healthy",
          recommendedPool: "stable",
          reasonCodes: ["stable_baseline_healthy"]
        },
        {
          name: "tuic-lab",
          protocol: "tuic",
          qualityClass: "weak-network",
          channelScore: 94,
          qualityTier: "healthy",
          recommendedPool: "canary",
          reasonCodes: ["candidate_requires_canary"]
        }
      ]
    },
    runtimeInventoryInput: {
      generatedAt: "2026-05-27T20:01:00.000Z",
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-b",
          lifecycleStatus: "inventory_ready",
          deploymentReady: true,
          blockers: [],
          nextGate: "runtime_deployment_approval"
        }
      ]
    }
  };
}

function channelSystemDecisionFlow(): ChannelSystemDecisionFlow {
  return {
    ok: true,
    mode: "channel-system-decision-flow",
    generatedAt: "2026-05-27T20:02:00.000Z",
    flowStatus: "approval_ready",
    requiredNextAction: "request_risk_a_runtime_canary_approval",
    systemReadiness: {
      runtimeGateStatus: "approval_ready",
      selectedBaselineReady: true,
      canaryReadyCount: 1,
      runtimeBlockedCount: 0,
      missingRuntimeInventoryCount: 0
    },
    outputs: {},
    safety: {
      advisoryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}

function channelRuntimeEvidenceBridgeInput(): ChannelRuntimeEvidenceBridgeInput {
  return {
    dryRunSummary: channelSystemReviewInput().dryRunSummary,
    measurementScore: channelSystemReviewInput().measurementScore,
    runtimeEvidenceInput: {
      generatedAt: "2026-05-27T20:01:00.000Z",
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-b",
          observedAt: "2026-05-27T20:01:30.000Z",
          checks: {
            cloudIdentityVerified: true,
            networkPostureVerified: true,
            hostInventoryCompleted: true,
            runtimeSlotAvailable: true,
            runtimeInstalled: false,
            serviceActive: false,
            operatorImportValidated: false,
            cleanupRequired: false
          },
          blockerCodes: [],
          nextGate: "runtime_deployment_approval"
        }
      ]
    }
  };
}

function channelRuntimeEvidenceBridge(): ChannelRuntimeEvidenceBridge {
  return {
    ok: true,
    mode: "channel-runtime-evidence-bridge",
    generatedAt: "2026-05-27T20:02:00.000Z",
    sourceGeneratedAt: "2026-05-27T20:01:00.000Z",
    runtimeInventoryInput: {
      generatedAt: "2026-05-27T20:01:00.000Z",
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-b",
          lifecycleStatus: "inventory_ready",
          deploymentReady: true,
          blockers: [],
          nextGate: "runtime_deployment_approval"
        }
      ]
    },
    channelSystem: channelSystemDecisionFlow(),
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}

function channelRuntimeGateWorkbenchInput(): ChannelRuntimeEvidenceBridgeInput {
  return channelRuntimeEvidenceBridgeInput();
}

function channelRuntimeGateWorkbench(): ChannelRuntimeGateWorkbench {
  return {
    ok: true,
    mode: "channel-runtime-gate-workbench",
    generatedAt: "2026-05-27T20:03:00.000Z",
    sourceGeneratedAt: "2026-05-27T20:02:00.000Z",
    gate: {
      status: "approval_ready",
      requiredNextAction: "request_risk_a_runtime_canary_approval",
      approvalRequestReady: true,
      counts: {
        canaryReady: 1,
        runtimeBlocked: 0,
        missingRuntimeInventory: 0
      },
      approvalPolicy: {
        risk: "A",
        approvalRequired: true,
        exactPhraseRequired: true,
        approvalPhraseEchoed: false,
        approvalSubmissionRoute: null,
        executesGate: false
      }
    },
    candidates: {
      approvalReady: [
        {
          name: "tuic-lab",
          protocol: "tuic",
          qualityTier: "healthy",
          channelScore: 94,
          approvalGate: "risk_a_channel_runtime_canary",
          approvalRequired: true
        }
      ],
      blocked: [],
      missingInventory: []
    },
    source: {
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      gatePacketMode: "channel-runtime-gate-packet"
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      approvalPhraseEchoed: false,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}

function channelRuntimeExecutionHandoff(): ChannelRuntimeExecutionHandoff {
  return {
    ok: true,
    mode: "channel-runtime-execution-handoff-packet",
    generatedAt: "2026-05-27T23:03:00.000Z",
    sourceGeneratedAt: "2026-05-27T23:02:00.000Z",
    handoff: {
      status: "ready_for_operator_approval_request",
      requiredNextAction: "request_risk_a_runtime_canary_approval",
      executionAuthority: "not_granted",
      counts: {
        canaryReady: 1,
        runtimeBlocked: 0,
        missingRuntimeInventory: 0
      },
      nextGate: {
        risk: "A",
        gate: "risk_a_channel_runtime_canary",
        approvalRequestReady: true,
        exactApprovalRequired: true,
        approvalTextIncluded: false,
        approvalSubmissionRoute: null,
        runtimeExecutionRoute: null,
        executesGate: false,
        runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
      }
    },
    checklists: {
      preflight: ["confirm_channel_runtime_canary_runbook"],
      validation: ["record_operator_device_canary_metrics"],
      rollback: ["document_runtime_cleanup_or_retain_decision"]
    },
    candidates: {
      approvalReady: [
        {
          name: "tuic-lab",
          protocol: "tuic",
          qualityTier: "healthy",
          channelScore: 94,
          approvalGate: "risk_a_channel_runtime_canary",
          approvalRequired: true
        }
      ],
      blocked: [],
      missingInventory: []
    },
    source: {
      workbenchMode: "channel-runtime-gate-workbench",
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      gatePacketMode: "channel-runtime-gate-packet"
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      approvalTextIncluded: false,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}

function channelSubscriptionOutputDraftInput(): ChannelSubscriptionOutputDraftInput {
  return channelRuntimeEvidenceBridgeInput();
}

function channelSubscriptionOutputDraft(): ChannelSubscriptionOutputDraft {
  return {
    ok: true,
    mode: "channel-subscription-output-draft",
    generatedAt: "2026-05-28T09:02:00.000Z",
    sourceGeneratedAt: "2026-05-28T09:02:00.000Z",
    status: "draft_ready_for_runtime_gate_review",
    subscriptionOutputDraft: {
      yamlGenerated: false,
      realSubscriptionOutputChanged: false,
      activationAllowed: false,
      baselinePool: [
        {
          name: "ss-baseline",
          protocol: "ss",
          qualityClass: "stable",
          qualityTier: "healthy",
          channelScore: 99,
          reasonCodes: ["stable_baseline_healthy"]
        }
      ],
      canaryPool: [
        {
          name: "tuic-lab",
          protocol: "tuic",
          qualityClass: "weak-network",
          qualityTier: "healthy",
          channelScore: 94,
          targetLabel: "channel-lab-b",
          lifecycleStatus: "inventory_ready",
          nextGate: "runtime_deployment_approval",
          reasonCodes: ["candidate_requires_canary"]
        }
      ],
      privatePool: [],
      blockedPool: []
    },
    nextGate: {
      risk: "A",
      gate: "risk_a_channel_runtime_canary",
      requiredNextAction: "request_risk_a_runtime_canary_approval",
      approvalRequired: true,
      exactApprovalRequired: true,
      subscriptionOutputActivationApproved: false,
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      executionRoute: null,
      runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
    },
    source: {
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      runtimeRegistryMode: "channel-runtime-registry",
      runtimeGatePacketMode: "channel-runtime-gate-packet"
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      noSubscriptionOutputMutation: true,
      yamlNotGenerated: true,
      requiresSeparateRiskAApproval: true,
      approvalTextIncluded: false,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml"]
    }
  };
}

function channelSubscriptionActivationReadinessInput(): ChannelSubscriptionActivationReadinessInput {
  return channelRuntimeEvidenceBridgeInput();
}

function channelSubscriptionActivationHandoffInput(): ChannelSubscriptionActivationHandoffInput {
  return channelRuntimeEvidenceBridgeInput();
}

function channelSubscriptionActivationFlowInput(): ChannelSubscriptionActivationFlowInput {
  return channelRuntimeEvidenceBridgeInput();
}

function channelSubscriptionActivationRecordTemplateInput(): ChannelSubscriptionActivationRecordTemplateInput {
  return {
    activationFlowFixture: {
      schemaVersion: "channel-subscription-activation-flow-fixture/v1",
      generatedAt: "2026-05-28T10:05:00.000Z",
      activationFlow: channelSubscriptionActivationFlow()
    }
  };
}

function channelSubscriptionActivationPackageInput(): ChannelSubscriptionActivationRecordTemplateInput {
  return channelSubscriptionActivationRecordTemplateInput();
}

function channelSubscriptionActivationReadiness(): ChannelSubscriptionActivationReadiness {
  return {
    ok: true,
    mode: "channel-subscription-activation-readiness",
    generatedAt: "2026-05-28T10:02:00.000Z",
    sourceGeneratedAt: "2026-05-28T10:02:00.000Z",
    status: "ready_for_subscription_output_activation_request",
    readiness: {
      baselineReady: true,
      canaryOutputCandidateCount: 1,
      blockedCandidateCount: 0,
      runtimeCanaryCompleted: true,
      blockers: []
    },
    subscriptionOutputDraft: {
      yamlGenerated: false,
      realSubscriptionOutputChanged: false,
      activationAllowed: false,
      baselinePool: channelSubscriptionOutputDraft().subscriptionOutputDraft.baselinePool,
      canaryPool: [
        {
          name: "tuic-lab",
          protocol: "tuic",
          qualityClass: "weak-network",
          qualityTier: "healthy",
          channelScore: 94,
          targetLabel: "channel-lab-b",
          lifecycleStatus: "runtime_deployed",
          nextGate: "subscription_output_activation_approval",
          reasonCodes: ["candidate_requires_canary"]
        }
      ],
      privatePool: [],
      blockedPool: []
    },
    activationGate: {
      risk: "A",
      gate: "risk_a_subscription_output_activation",
      requiredNextAction: "request_risk_a_subscription_output_activation_approval",
      approvalRequestReady: true,
      exactApprovalRequired: true,
      executionAuthority: "not_granted",
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      executionRoute: null,
      runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
    },
    source: {
      draftMode: "channel-subscription-output-draft",
      draftStatus: "draft_ready_for_runtime_gate_review",
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      runtimeRegistryMode: "channel-runtime-registry",
      runtimeGatePacketMode: "channel-runtime-gate-packet"
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      noSubscriptionOutputMutation: true,
      yamlNotGenerated: true,
      requiresSeparateRiskAApproval: true,
      approvalTextIncluded: false,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml"]
    }
  };
}

function channelSubscriptionActivationHandoff(): ChannelSubscriptionActivationHandoff {
  return {
    ok: true,
    mode: "channel-subscription-activation-handoff-packet",
    generatedAt: "2026-05-28T10:03:00.000Z",
    sourceGeneratedAt: "2026-05-28T10:02:00.000Z",
    handoff: {
      status: "ready_for_operator_approval_request",
      requiredNextAction: "request_risk_a_subscription_output_activation_approval",
      executionAuthority: "not_granted",
      blockers: [],
      counts: {
        baselinePool: 1,
        canaryPool: 1,
        privatePool: 0,
        blockedPool: 0
      },
      nextGate: {
        risk: "A",
        gate: "risk_a_subscription_output_activation",
        approvalRequestReady: true,
        exactApprovalRequired: true,
        approvalTextIncluded: false,
        approvalSubmissionRoute: null,
        subscriptionOutputExecutionRoute: null,
        executesGate: false,
        runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
      }
    },
    checklists: {
      preflight: ["confirm_channel_subscription_activation_readiness"],
      validation: ["record_subscription_output_activation_validation"],
      rollback: ["prepare_subscription_output_revert_plan"]
    },
    candidates: {
      baseline: channelSubscriptionOutputDraft().subscriptionOutputDraft.baselinePool,
      canary: channelSubscriptionActivationReadiness().subscriptionOutputDraft.canaryPool,
      private: [],
      blocked: []
    },
    source: {
      readinessMode: "channel-subscription-activation-readiness",
      readinessStatus: "ready_for_subscription_output_activation_request",
      draftMode: "channel-subscription-output-draft",
      bridgeMode: "channel-runtime-evidence-bridge",
      systemMode: "channel-system-decision-flow",
      runtimeRegistryMode: "channel-runtime-registry",
      runtimeGatePacketMode: "channel-runtime-gate-packet"
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      noSubscriptionOutputMutation: true,
      yamlNotGenerated: true,
      requiresSeparateRiskAApproval: true,
      approvalTextIncluded: false,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml"]
    }
  };
}

function channelSubscriptionActivationFlow(): ChannelSubscriptionActivationFlow {
  return {
    ok: true,
    mode: "channel-subscription-activation-flow",
    generatedAt: "2026-05-28T10:04:00.000Z",
    sourceGeneratedAt: "2026-05-28T10:03:00.000Z",
    flowStatus: "ready_for_a_tier_subscription_output_activation_request",
    requiredNextAction: "request_risk_a_subscription_output_activation_approval",
    blockers: [],
    stages: {
      runtimeEvidenceBridge: {
        mode: "channel-runtime-evidence-bridge",
        status: "reviewed"
      },
      subscriptionOutputDraft: {
        mode: "channel-subscription-output-draft",
        status: "draft_ready_for_activation_review"
      },
      activationReadiness: {
        mode: "channel-subscription-activation-readiness",
        status: "ready_for_subscription_output_activation_request"
      },
      activationHandoff: {
        mode: "channel-subscription-activation-handoff-packet",
        status: "ready_for_operator_approval_request"
      }
    },
    gate: {
      risk: "A",
      gate: "risk_a_subscription_output_activation",
      approvalRequestReady: true,
      exactApprovalRequired: true,
      executionAuthority: "not_granted",
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      subscriptionOutputExecutionRoute: null,
      executesGate: false,
      runbook: "docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"
    },
    outputs: {
      activationHandoff: channelSubscriptionActivationHandoff()
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      noSubscriptionOutputMutation: true,
      yamlNotGenerated: true,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml"]
    }
  };
}

function channelSubscriptionActivationRecordTemplate(): ChannelSubscriptionActivationRecordTemplate {
  return {
    ok: true,
    mode: "channel-subscription-activation-record-template",
    generatedAt: "2026-05-28T10:06:00.000Z",
    source: {
      fixtureSchemaVersion: "channel-subscription-activation-flow-fixture/v1",
      fixtureGeneratedAt: "2026-05-28T10:05:00.000Z",
      sourceGeneratedAt: "2026-05-28T10:04:00.000Z",
      flowStatus: "ready_for_a_tier_subscription_output_activation_request",
      requiredNextAction: "request_risk_a_subscription_output_activation_approval"
    },
    readiness: {
      approvalRequestReady: true,
      executionAuthority: "not_granted",
      blockers: []
    },
    record: {
      title: "Channel Subscription Output Activation Execution Record",
      suggestedPath: "docs/production-replacement-records/2026-05-28-channel-subscription-output-activation.md",
      markdown: [
        "# Channel Subscription Output Activation Execution Record",
        "",
        "## Approval Evidence",
        "",
        "## Validation Evidence"
      ].join("\n")
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      templateOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      noSubscriptionOutputMutation: true,
      yamlNotGenerated: true,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml"]
    }
  };
}

function channelSubscriptionActivationPackage(): ChannelSubscriptionActivationPackage {
  return {
    ok: true,
    mode: "channel-subscription-activation-package",
    generatedAt: "2026-05-28T10:07:00.000Z",
    status: "ready_for_risk_a_subscription_output_activation_request",
    blockers: [],
    package: {
      renderProofReady: true,
      recordTemplateReady: true,
      approvalRequestReady: true,
      executionAuthority: "not_granted",
      requiredNextAction: "request_risk_a_subscription_output_activation_approval"
    },
    renderProof: {
      status: "render_proof_ready_for_subscription_output_activation_request",
      internalYamlRenderCompleted: true,
      yamlReturned: false,
      renderedProxyCount: 2,
      generatedYamlBytes: 512,
      protocolCounts: { ss: 1, tuic: 1 },
      baseline: [{ name: "ss-baseline", protocol: "ss" }],
      canary: [{ name: "tuic-lab", protocol: "tuic" }]
    },
    recordTemplate: {
      mode: "channel-subscription-activation-record-template",
      title: "Channel Subscription Output Activation Execution Record",
      suggestedPath: "docs/production-replacement-records/2026-05-28-channel-subscription-output-activation.md",
      markdownReturned: false,
      approvalRequestReady: true,
      executionAuthority: "not_granted",
      blockers: []
    },
    gate: {
      risk: "A",
      gate: "risk_a_subscription_output_activation",
      approvalRequestReady: true,
      exactApprovalRequired: true,
      executionAuthority: "not_granted",
      approvalSubmissionRoute: null,
      subscriptionOutputExecutionRoute: null,
      executesGate: false
    },
    source: {
      fixtureGeneratedAt: "2026-05-28T10:05:00.000Z",
      sourceGeneratedAt: "2026-05-28T10:04:00.000Z",
      fixtureSchemaVersion: "channel-subscription-activation-flow-fixture/v1"
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      packageOnly: true,
      renderProofRequired: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      noSubscriptionOutputMutation: true,
      yamlReturned: false,
      yamlNotReturned: true,
      recordMarkdownReturned: false,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml", "recordMarkdown"]
    }
  };
}

function channelLabTargetInventoryInput() {
  return {
    inventory: {
      targetLabel: "channel-lab-a",
      protocol: "tuic",
      lifecycleStatus: "running",
      checks: {
        cloudIdentityVerified: true,
        networkPostureVerified: true,
        sshBannerReachable: false,
        ssmRegistered: false,
        hostInventoryCompleted: false,
        incumbentRuntimePresent: true,
        incumbentRuntimeProtocol: "hysteria2",
        candidatePortPlanRecorded: false,
        cleanupDecisionRecorded: false
      },
      blockerCodes: ["ssh_banner_timeout", "ssm_unavailable"],
      nextGate: "channel_lab_b_selection_gate"
    }
  };
}

function channelLabTargetDecision(): ChannelLabTargetDecision {
  return {
    ok: true,
    mode: "channel-lab-target-decision",
    generatedAt: "2026-05-27T23:15:00.000Z",
    status: "fresh_target_recommended",
    requiredNextAction: "request_channel_lab_b_selection_gate",
    executionAuthority: "not_granted",
    target: {
      targetLabel: "channel-lab-a",
      protocol: "tuic",
      lifecycleStatus: "running",
      reuseRecommendation: "not_recommended"
    },
    blockers: ["ssh_banner_timeout", "ssm_unavailable", "host_inventory_incomplete"],
    nextGate: {
      risk: "A",
      gate: "risk_a_channel_lab_b_selection",
      approvalRequired: true,
      approvalTextIncluded: false,
      approvalSubmissionRoute: null,
      runtimeExecutionRoute: null,
      runbook: "docs/CHANNEL_CANARY_SERVER_SELECTION.md"
    },
    alternatives: {
      channelLabAAccessCleanupGate: true,
      freshChannelLabBSelection: true
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  };
}

function cleanEdgeReadinessInput(): CleanEdgeReadinessInput {
  return {
    generatedAt: "2026-05-27T21:40:00.000Z",
    repoState: {
      branchSynced: true,
      noOpenPrs: true,
      projectStateCheckPassed: true
    },
    subscriptionBoundary: {
      subOnAliyun: true,
      healthOk: true,
      adminBlocked: true,
      rootBlocked: true,
      noTokenRejected: true
    },
    edgeDns: {
      ssSgUnchangedOnOldAws: true
    },
    stoppedNodes: {
      prodEdgeAStopped: true,
      prodEdgeANoPublicIp: true,
      prodEdgeBStopped: true,
      prodEdgeBNoPublicIp: true
    },
    cleanTarget: {
      noTargetSelected: true,
      noTargetProvisioned: true
    },
    approval: {
      exactApprovalReceived: false
    },
    notes: ["summary only"]
  };
}

function cleanEdgeReadinessSummary(): CleanEdgeReadinessSummary {
  return {
    ok: true,
    mode: "clean-edge-readiness-summary",
    generatedAt: "2026-05-27T21:40:00.000Z",
    readiness: {
      preconditionsReady: true,
      approvalRequired: true,
      executionAllowed: false,
      blockers: []
    },
    repoState: {
      branchSynced: true,
      noOpenPrs: true,
      projectStateCheckPassed: true
    },
    subscriptionBoundary: {
      subOnAliyun: true,
      healthOk: true,
      adminBlocked: true,
      rootBlocked: true,
      noTokenRejected: true
    },
    edgeDns: {
      ssSgUnchangedOnOldAws: true
    },
    stoppedNodes: {
      prodEdgeAStopped: true,
      prodEdgeANoPublicIp: true,
      prodEdgeBStopped: true,
      prodEdgeBNoPublicIp: true
    },
    cleanTarget: {
      noTargetSelected: true,
      noTargetProvisioned: true
    },
    approval: {
      exactApprovalReceived: false
    },
    notes: ["summary only"],
    safety: {
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noCloudMutation: true,
      noDnsMutation: true,
      noSubscriptionOutputMutation: true,
      noSecretHandling: true,
      omittedFields: [
        "rawHosts",
        "rawIps",
        "rawPorts",
        "rawSecrets",
        "tokens",
        "subscriptionUrls",
        "credentials",
        "customerData"
      ]
    }
  };
}

function aliyunGatePacket(status = "blocked"): AliyunGateDecisionPacket {
  return {
    type: "aliyun_gate_decision_packet",
    status,
    generatedAt: "2026-05-27T16:00:00.000Z",
    redacted: true,
    sourceDocs: [
      "docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md"
    ],
    notAuthorized: [
      "Aliyun runtime mutation",
      "DNS change",
      "provider firewall mutation",
      "public listener exposure",
      "user traffic",
      "edge traffic"
    ],
    gates: [
      {
        id: "aliyun_clean_start_private_validation",
        label: "Aliyun clean-start private validation",
        risk: "A",
        status: "ready_for_operator_approval",
        approvalRequired: true,
        approvalPolicy: {
          mode: "exact_phrase_for_named_gate",
          phraseBoundToGate: true,
          acceptsShortConfirmation: false,
          approvalSubmissionRoute: null,
          executesGate: false
        },
        requiredApprovalPhrase: "Approve Aliyun clean-start private validation. No DNS change.",
        sourceDoc: "docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md",
        blockers: [],
        preflightSummary: {
          status: "ready_for_private_validation",
          privateRenderingDryRun: {
            status: "ready",
            nodeCount: 1,
            protocols: ["ss"],
            generatedYamlBytes: 512,
            redacted: true
          },
          blockerCount: 0
        }
      },
      {
        id: "aliyun_provider_firewall_hardening",
        label: "Aliyun provider-firewall hardening",
        risk: "A",
        status: "blocked",
        approvalRequired: true,
        approvalPolicy: {
          mode: "exact_phrase_for_named_gate",
          phraseBoundToGate: true,
          acceptsShortConfirmation: false,
          approvalSubmissionRoute: null,
          executesGate: false
        },
        requiredApprovalPhrase: "Approve Aliyun provider firewall hardening. No DNS change.",
        sourceDoc: "docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md",
        blockers: ["missing provider firewall rollback snapshot"],
        preflightSummary: {
          hasRollbackSnapshot: false,
          hasManagementSourceDecision: false,
          hasWgHomeDecision: false,
          wgHomeDecisionEchoed: false,
          rawRulesEchoed: false
        }
      }
    ]
  };
}

function aliyunGateEvidence(status = "incomplete", accessMigrationStatus = "incomplete"): AliyunGateEvidenceSummary {
  return {
    type: "aliyun_gate_evidence_summary",
    providerFirewall: {
      type: "provider_firewall_evidence_summary",
      status,
      hasRollbackSnapshot: status === "ready_for_gate_packet",
      hasManagementSourceDecision: status === "ready_for_gate_packet",
      hasWgHomeDecision: false,
      rawRulesProvided: false,
      rawRulesEchoed: false,
      noteProvided: false,
      recordedAt: "2026-05-27T16:00:00.000Z",
      updatedAt: "2026-05-27T16:00:00.000Z"
    },
    accessMigration: {
      type: "access_migration_evidence_summary",
      status: accessMigrationStatus,
      hasLiveAccessModelInventory: accessMigrationStatus !== "incomplete",
      hasApprovedArtifactScope: accessMigrationStatus !== "incomplete",
      artifactIssuanceCompleted: false,
      artifactRefreshObservationRecorded: false,
      hasApprovedLegacyRetirementScope: false,
      rawUrlsProvided: false,
      rawUrlsEchoed: false,
      rawTokensProvided: false,
      rawTokensEchoed: false,
      rawArtifactsProvided: false,
      rawArtifactsEchoed: false,
      noteProvided: false,
      recordedAt: "2026-05-27T16:00:00.000Z",
      updatedAt: "2026-05-27T16:00:00.000Z"
    }
  };
}
