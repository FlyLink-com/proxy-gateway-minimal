import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createAdminApiClient, type AdminApiClient } from "../features/subscriptions/api-client";
import { loadAdminSession, saveAdminSession } from "../features/subscriptions/admin-session";
import { ResetTokenDialog } from "../features/subscriptions/reset-token-dialog";
import { SubscriptionsPage } from "../features/subscriptions/subscriptions-page";
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
  SubscriptionTenant
} from "../features/subscriptions/types";
import { NodesPage } from "../pages/nodes-page";
import { OverviewPage } from "../pages/overview-page";
import { ProvisioningPage } from "../pages/provisioning-page";

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
        displayName: "customer",
        email: "customer@example.com",
        plan: "trial",
        planLabel: "7-day trial",
        durationDays: 7,
        status: "pending_admin_review",
        nextAction: "admin_review_required",
        submittedAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        contactComplete: true,
        priorTrialState: "none",
        entitlementRef: null,
        accessGrantRef: null,
        safety: {
          noSubscriptionUrl: true,
          noRawContactNote: true,
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
    expect(fetcher.mock.calls[0][0]).toBe("http://127.0.0.1:3456/api/admin/platform/portal-access-requests");
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
    expect(JSON.stringify(fetcher.mock.calls[0][1]?.body)).not.toMatch(/subscriptionUrl|token=/i);
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

describe("subscription page", () => {
  test("loads backend tenants and does not fabricate existing subscription URLs", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const listTenants = vi.fn(async () => [tenant()]);

    render(createElement(SubscriptionsPage, { search: "", apiClient: adminClient({ listTenants }) }));

    expect(await screen.findByText("real-user")).not.toBeNull();
    fireEvent.click(screen.getByTitle("Copy subscription URL"));

    expect(writeText).not.toHaveBeenCalled();
    expect(await screen.findByText(/Full subscription URLs are only visible immediately/i)).not.toBeNull();
  });

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
});

describe("provisioning page", () => {
  test("submits operator form facts for safe preview without execution controls", async () => {
    const previewProvisioningForm = vi.fn(async () => provisioningFormPreview());

    render(createElement(ProvisioningPage, {
      apiClient: adminClient({ previewProvisioningForm } as unknown as Partial<AdminApiClient>)
    }));

    fireEvent.change(screen.getByLabelText(/approval reference/i), { target: { value: "PR-265" } });
    fireEvent.change(screen.getByLabelText(/customer label/i), { target: { value: "Customer Alpha" } });
    fireEvent.change(screen.getByLabelText(/customer email/i), { target: { value: "owner@sensitive.example" } });
    fireEvent.change(screen.getByLabelText(/customer channel/i), { target: { value: "manual-intake" } });
    fireEvent.change(screen.getByLabelText(/subscription label/i), {
      target: { value: "customer-alpha-preproduction" }
    });
    fireEvent.change(screen.getByLabelText(/plan/i), { target: { value: "pilot" } });
    fireEvent.change(screen.getByLabelText(/expires at/i), { target: { value: "2026-06-04" } });
    fireEvent.change(screen.getByLabelText(/target node/i), { target: { value: "channel-lab-b-tuic" } });
    fireEvent.change(screen.getByLabelText(/operator note/i), { target: { value: "preproduction-canary" } });

    fireEvent.click(screen.getByRole("button", { name: /generate safe preview/i }));

    await waitFor(() => {
      expect(previewProvisioningForm).toHaveBeenCalledWith({
        approvalRef: "PR-265",
        customerLabel: "Customer Alpha",
        customerEmail: "owner@sensitive.example",
        customerChannel: "manual-intake",
        subscriptionLabel: "customer-alpha-preproduction",
        plan: "pilot",
        expiresAt: "2026-06-04",
        nodeId: "channel-lab-b-tuic",
        note: "preproduction-canary"
      });
    });

    const previewRegion = await screen.findByRole("region", { name: /safe issuance preview/i });
    expect(within(previewRegion).getByText("ready_for_cli_dry_run")).not.toBeNull();
    expect(within(previewRegion).getByText("run_cli_dry_run_then_request_risk_a_approval")).not.toBeNull();
    expect(within(previewRegion).getByText(/platform:issue-subscription/i)).not.toBeNull();
    expect(within(previewRegion).getByText(/No production mutation/i)).not.toBeNull();
    expect(within(previewRegion).getByText(/No database mutation/i)).not.toBeNull();
    expect(within(previewRegion).queryByText(/owner@sensitive\.example|manual-intake|Customer Alpha|token=/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^execute/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^issue/i })).toBeNull();
  });
});

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

  test("confirms reset, keeps visible-once result behavior, and removes repeat submit", async () => {
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
    expect(screen.queryByRole("button", { name: /confirm reset token/i })).toBeNull();
    expect(screen.getByRole("button", { name: /done/i })).not.toBeNull();
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("overview and nodes pages", () => {
  test("loads overview and nodes from backend endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        total: 1,
        active: 1,
        expiring: 0,
        expired: 0,
        disabled: 0,
        nodes: [],
        distribution: {
          mode: "subscription-v2",
          ready: true,
          eligibleNodes: 1,
          blockedNodes: 0,
          blockers: []
        }
      }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "node_sg", name: "aws-singapore-blue", status: "online" }] }));
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "secret",
      fetcher: fetchMock
    });

    expect((await client.overview()).active).toBe(1);
    expect((await client.listNodes())[0].name).toBe("aws-singapore-blue");
  });

  test("renders backend overview metrics and node rows", async () => {
    const client = adminClient({
      overview: async () => ({
        ok: true,
        total: 3,
        active: 2,
        expiring: 1,
        expired: 0,
        disabled: 0,
        nodes: [],
        distribution: {
          mode: "subscription-v2",
          ready: true,
          eligibleNodes: 2,
          blockedNodes: 1,
          blockers: []
        }
      }),
      listNodes: async () => [{ id: "node_sg", name: "aws-singapore-blue", status: "online" }]
    });

    const { unmount } = render(createElement(OverviewPage, { apiClient: client }));
    expect(await screen.findByText("Subscription distribution")).not.toBeNull();
    expect(await screen.findByText("Ready")).not.toBeNull();
    expect(await screen.findByText("3")).not.toBeNull();
    expect(within(screen.getByText("Eligible nodes").closest(".metric-card") as HTMLElement).getByText("2")).not.toBeNull();
    expect(within(screen.getByText("Blocked nodes").closest(".metric-card") as HTMLElement).getByText("1")).not.toBeNull();
    unmount();

    render(createElement(NodesPage, { apiClient: client }));
    expect(await screen.findByText("aws-singapore-blue")).not.toBeNull();
    expect(await screen.findByText("online")).not.toBeNull();
  });

  test("renders Aliyun gate review and records boolean provider-firewall evidence", async () => {
    const getAliyunGates = vi
      .fn()
      .mockResolvedValueOnce(aliyunGatePacket())
      .mockResolvedValueOnce(aliyunGatePacket("blocked"));
    const getAliyunGateEvidence = vi
      .fn()
      .mockResolvedValueOnce(aliyunGateEvidence())
      .mockResolvedValueOnce(aliyunGateEvidence("ready_for_gate_packet"));
    const recordProviderFirewallEvidence = vi.fn(async () => aliyunGateEvidence("ready_for_gate_packet"));

    render(createElement(OverviewPage, {
      apiClient: adminClient({
        getAliyunGates,
        getAliyunGateEvidence,
        recordProviderFirewallEvidence
      })
    }));

    expect(await screen.findByText("Aliyun promotion gates")).not.toBeNull();
    expect(await screen.findByText("Aliyun clean-start private validation")).not.toBeNull();
    expect(screen.getByText("missing provider firewall rollback snapshot")).not.toBeNull();
    expect(screen.getByText(/No A-tier execution buttons are exposed/i)).not.toBeNull();
    expect(screen.getAllByText(/Exact phrase required/i)).toHaveLength(2);
    expect(screen.getAllByText(/Gate-bound approval/i)).toHaveLength(2);
    expect(screen.getAllByText(/Short confirmations rejected/i)).toHaveLength(2);
    expect(screen.getAllByText(/No approval submission route/i)).toHaveLength(2);
    expect(screen.getAllByText(/No gate execution control/i)).toHaveLength(2);

    fireEvent.click(screen.getByLabelText(/rollback snapshot recorded/i));
    fireEvent.click(screen.getByLabelText(/management source decision recorded/i));
    fireEvent.click(screen.getByLabelText(/wg-home decision recorded/i));
    fireEvent.click(screen.getByRole("button", { name: /record provider-firewall evidence/i }));

    await waitFor(() => {
      expect(recordProviderFirewallEvidence).toHaveBeenCalledWith({
        hasRollbackSnapshot: true,
        hasManagementSourceDecision: true,
        hasWgHomeDecision: true
      });
    });
    expect(await screen.findByText(/Provider-firewall evidence recorded/i)).not.toBeNull();
  });

  test("renders Aliyun access-migration evidence and records boolean artifact gate readiness", async () => {
    const getAliyunGates = vi
      .fn()
      .mockResolvedValueOnce(aliyunGatePacket())
      .mockResolvedValueOnce(aliyunGatePacket("blocked"));
    const getAliyunGateEvidence = vi
      .fn()
      .mockResolvedValueOnce(aliyunGateEvidence())
      .mockResolvedValueOnce(aliyunGateEvidence("incomplete", "ready_for_artifact_issuance_gate"));
    const recordAccessMigrationEvidence = vi.fn(async () =>
      aliyunGateEvidence("incomplete", "ready_for_artifact_issuance_gate"));

    render(createElement(OverviewPage, {
      apiClient: adminClient({
        getAliyunGates,
        getAliyunGateEvidence,
        recordAccessMigrationEvidence
      })
    }));

    expect(await screen.findByText("Access migration evidence")).not.toBeNull();
    expect(screen.getByText(/Store only access-model, artifact-scope, and retirement readiness booleans/i)).not.toBeNull();
    expect(screen.getByText(/Raw URLs echoed/i)).not.toBeNull();
    expect(screen.getByText(/Raw tokens echoed/i)).not.toBeNull();
    expect(screen.getByText(/Raw artifacts echoed/i)).not.toBeNull();

    fireEvent.click(screen.getByLabelText(/live access-model inventory recorded/i));
    fireEvent.click(screen.getByLabelText(/approved artifact scope recorded/i));
    fireEvent.click(screen.getByRole("button", { name: /record access-migration evidence/i }));

    await waitFor(() => {
      expect(recordAccessMigrationEvidence).toHaveBeenCalledWith({
        hasLiveAccessModelInventory: true,
        hasApprovedArtifactScope: true,
        artifactIssuanceCompleted: false,
        artifactRefreshObservationRecorded: false,
        hasApprovedLegacyRetirementScope: false
      });
    });
    expect(await screen.findByText(/Access-migration evidence recorded/i)).not.toBeNull();
  });

  test("renders channel system review readiness from safe operator evidence without execution controls", async () => {
    const reviewChannelSystem = vi.fn(async () => channelSystemDecisionFlow());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSystem })
    }));

    expect(await screen.findByText("Channel system review")).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/safe channel evidence packet/i), {
      target: { value: JSON.stringify(channelSystemReviewInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review channel system/i }));

    await waitFor(() => {
      expect(reviewChannelSystem).toHaveBeenCalledWith(channelSystemReviewInput());
    });
    expect(await screen.findByText("approval_ready")).not.toBeNull();
    expect(screen.getByText("request_risk_a_runtime_canary_approval")).not.toBeNull();
    expect(screen.getByText(/No runtime execution controls are exposed/i)).not.toBeNull();
    expect(screen.queryByText(/secret\.example|token=|subscriptionUrl/i)).toBeNull();
  });

  test("blocks unsafe channel evidence before calling the protected review API", async () => {
    const reviewChannelSystem = vi.fn(async () => channelSystemDecisionFlow());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSystem })
    }));

    expect(await screen.findByText("Channel system review")).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/safe channel evidence packet/i), {
      target: {
        value: JSON.stringify({
          ...channelSystemReviewInput(),
          runtimeInventoryInput: {
            records: [
              {
                candidateName: "tuic-lab",
                host: "runtime-secret.example",
                port: 443,
                token: "token=runtime-secret"
              }
            ]
          }
        })
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /review channel system/i }));

    await waitFor(() => {
      expect(screen.getByText("Safe channel evidence packet contains forbidden runtime details.")).not.toBeNull();
    });
    expect(reviewChannelSystem).not.toHaveBeenCalled();
  });

  test("renders channel runtime evidence bridge readiness without execution controls", async () => {
    const reviewChannelRuntimeEvidence = vi.fn(async () => channelRuntimeEvidenceBridge());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelRuntimeEvidence })
    }));

    expect(await screen.findByText("Channel runtime evidence bridge")).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/safe runtime evidence bridge packet/i), {
      target: { value: JSON.stringify(channelRuntimeEvidenceBridgeInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review runtime evidence bridge/i }));

    await waitFor(() => {
      expect(reviewChannelRuntimeEvidence).toHaveBeenCalledWith(channelRuntimeEvidenceBridgeInput());
    });
    expect(await screen.findByText("channel-runtime-evidence-bridge")).not.toBeNull();
    expect(screen.getByText("approval_ready")).not.toBeNull();
    expect(screen.getByText(/No runtime execution controls are exposed/i)).not.toBeNull();
    expect(screen.queryByText(/secret\.example|token=|subscriptionUrl/i)).toBeNull();
  });

  test("blocks unsafe runtime evidence bridge packet before calling the protected review API", async () => {
    const reviewChannelRuntimeEvidence = vi.fn(async () => channelRuntimeEvidenceBridge());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelRuntimeEvidence })
    }));

    expect(await screen.findByText("Channel runtime evidence bridge")).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/safe runtime evidence bridge packet/i), {
      target: {
        value: JSON.stringify({
          ...channelRuntimeEvidenceBridgeInput(),
          runtimeEvidenceInput: {
            records: [
              {
                candidateName: "tuic-lab",
                host: "runtime-secret.example",
                port: 443,
                token: "token=runtime-secret"
              }
            ]
          }
        })
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /review runtime evidence bridge/i }));

    await waitFor(() => {
      expect(screen.getByText("Safe channel evidence packet contains forbidden runtime details.")).not.toBeNull();
    });
    expect(reviewChannelRuntimeEvidence).not.toHaveBeenCalled();
  });

  test("blocks unsafe runtime evidence bridge labels before calling the protected review API", async () => {
    const reviewChannelRuntimeEvidence = vi.fn(async () => channelRuntimeEvidenceBridge());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelRuntimeEvidence })
    }));

    expect(await screen.findByText("Channel runtime evidence bridge")).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/safe runtime evidence bridge packet/i), {
      target: {
        value: JSON.stringify({
          ...channelRuntimeEvidenceBridgeInput(),
          runtimeEvidenceInput: {
            records: [
              {
                candidateName: "203.0.113.10:443",
                protocol: "tuic",
                targetLabel: "198.51.100.7:443"
              }
            ]
          }
        })
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /review runtime evidence bridge/i }));

    await waitFor(() => {
      expect(screen.getByText("Safe channel evidence packet contains forbidden runtime details.")).not.toBeNull();
    });
    expect(reviewChannelRuntimeEvidence).not.toHaveBeenCalled();
  });

  test("renders channel runtime gate workbench without execution controls or approval phrase", async () => {
    const reviewChannelRuntimeGate = vi.fn(async () => channelRuntimeGateWorkbench());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelRuntimeGate })
    }));

    expect(await screen.findByText("Channel runtime gate workbench")).not.toBeNull();
    const workbenchRegion = screen.getByRole("region", { name: "Channel runtime gate workbench" });
    fireEvent.change(screen.getByLabelText(/safe runtime gate workbench packet/i), {
      target: { value: JSON.stringify(channelRuntimeGateWorkbenchInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review runtime gate/i }));

    await waitFor(() => {
      expect(reviewChannelRuntimeGate).toHaveBeenCalledWith(channelRuntimeGateWorkbenchInput());
    });
    expect(await screen.findByText("channel-runtime-gate-workbench")).not.toBeNull();
    expect(within(workbenchRegion).getByText("approval_ready")).not.toBeNull();
    expect(within(workbenchRegion).getByText("request_risk_a_runtime_canary_approval")).not.toBeNull();
    expect(within(workbenchRegion).getByText(/No approval submission route/i)).not.toBeNull();
    expect(within(workbenchRegion).getByText(/Approval phrase not echoed/i)).not.toBeNull();
    expect(within(workbenchRegion).queryByText(/secret\.example|token=|subscriptionUrl|approvalPhrase/i)).toBeNull();
  });

  test("renders channel runtime execution handoff without execution controls or approval text", async () => {
    const reviewChannelRuntimeExecutionHandoff = vi.fn(async () => channelRuntimeExecutionHandoff());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelRuntimeExecutionHandoff })
    }));

    expect(await screen.findByText("Channel runtime execution handoff")).not.toBeNull();
    const handoffRegion = screen.getByRole("region", { name: "Channel runtime execution handoff" });
    fireEvent.change(screen.getByLabelText(/safe runtime execution handoff packet/i), {
      target: { value: JSON.stringify(channelRuntimeGateWorkbenchInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review execution handoff/i }));

    await waitFor(() => {
      expect(reviewChannelRuntimeExecutionHandoff).toHaveBeenCalledWith(channelRuntimeGateWorkbenchInput());
    });
    expect(await screen.findByText("channel-runtime-execution-handoff-packet")).not.toBeNull();
    expect(within(handoffRegion).getByText("ready_for_operator_approval_request")).not.toBeNull();
    expect(within(handoffRegion).getByText("not_granted")).not.toBeNull();
    expect(within(handoffRegion).getByText("docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md")).not.toBeNull();
    expect(within(handoffRegion).getByText(/No approval submission route/i)).not.toBeNull();
    expect(within(handoffRegion).getByText(/No runtime execution route/i)).not.toBeNull();
    expect(within(handoffRegion).getByText(/Approval text not included/i)).not.toBeNull();
    expect(within(handoffRegion).queryByText(/secret\.example|token=|subscriptionUrl|approvalPhrase/i)).toBeNull();
  });

  test("renders channel subscription output draft without output mutation controls", async () => {
    const reviewChannelSubscriptionOutputDraft = vi.fn(async () => channelSubscriptionOutputDraft());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSubscriptionOutputDraft })
    }));

    expect(await screen.findByText("Channel subscription output draft")).not.toBeNull();
    const draftRegion = screen.getByRole("region", { name: "Channel subscription output draft" });
    fireEvent.change(screen.getByLabelText(/safe channel subscription draft packet/i), {
      target: { value: JSON.stringify(channelSubscriptionOutputDraftInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review subscription draft/i }));

    await waitFor(() => {
      expect(reviewChannelSubscriptionOutputDraft).toHaveBeenCalledWith(channelSubscriptionOutputDraftInput());
    });
    expect(await screen.findByText("channel-subscription-output-draft")).not.toBeNull();
    expect(within(draftRegion).getByText("draft_ready_for_runtime_gate_review")).not.toBeNull();
    expect(within(draftRegion).getByText("risk_a_channel_runtime_canary")).not.toBeNull();
    expect(within(draftRegion).getByText(/YAML not generated/i)).not.toBeNull();
    expect(within(draftRegion).getByText(/No subscription output mutation/i)).not.toBeNull();
    expect(within(draftRegion).getByText(/Activation not approved/i)).not.toBeNull();
    expect(within(draftRegion).queryByText(/secret\.example|token=|subscriptionUrl|approvalPhrase/i)).toBeNull();
  });

  test("blocks unsafe channel subscription output draft packets before calling the protected review API", async () => {
    const reviewChannelSubscriptionOutputDraft = vi.fn(async () => channelSubscriptionOutputDraft());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSubscriptionOutputDraft } as unknown as Partial<AdminApiClient>)
    }));

    expect(await screen.findByText("Channel subscription output draft")).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/safe channel subscription draft packet/i), {
      target: {
        value: JSON.stringify({
          ...channelSubscriptionOutputDraftInput(),
          rawSubscriptionUrl: "https://sub.example/sub/clash.yaml?token=secret"
        })
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /review subscription draft/i }));

    await waitFor(() => {
      expect(screen.getByText("Safe channel subscription draft packet contains forbidden runtime details.")).not.toBeNull();
    });
    expect(reviewChannelSubscriptionOutputDraft).not.toHaveBeenCalled();
  });

  test("renders channel subscription activation readiness without execution controls", async () => {
    const reviewChannelSubscriptionActivationReadiness = vi.fn(async () => channelSubscriptionActivationReadiness());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSubscriptionActivationReadiness })
    }));

    expect(await screen.findByText("Channel subscription activation readiness")).not.toBeNull();
    const readinessRegion = screen.getByRole("region", { name: "Channel subscription activation readiness" });
    fireEvent.change(screen.getByLabelText(/safe channel activation readiness packet/i), {
      target: { value: JSON.stringify(channelSubscriptionActivationReadinessInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review activation readiness/i }));

    await waitFor(() => {
      expect(reviewChannelSubscriptionActivationReadiness).toHaveBeenCalledWith(
        channelSubscriptionActivationReadinessInput()
      );
    });
    expect(await screen.findByText("channel-subscription-activation-readiness")).not.toBeNull();
    expect(within(readinessRegion).getByText("ready_for_subscription_output_activation_request")).not.toBeNull();
    expect(within(readinessRegion).getByText("risk_a_subscription_output_activation")).not.toBeNull();
    expect(within(readinessRegion).getByText("not_granted")).not.toBeNull();
    expect(within(readinessRegion).getByText(/No subscription output mutation/i)).not.toBeNull();
    expect(within(readinessRegion).getByText(/No approval submission route/i)).not.toBeNull();
    expect(within(readinessRegion).getByText(/No execution route/i)).not.toBeNull();
    expect(within(readinessRegion).queryByText(/secret\.example|token=|subscriptionUrl|approvalPhrase/i)).toBeNull();
  });

  test("renders channel subscription activation handoff without execution controls", async () => {
    const reviewChannelSubscriptionActivationHandoff = vi.fn(async () => channelSubscriptionActivationHandoff());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSubscriptionActivationHandoff })
    }));

    expect(await screen.findByText("Channel subscription activation handoff")).not.toBeNull();
    const handoffRegion = screen.getByRole("region", { name: "Channel subscription activation handoff" });
    fireEvent.change(screen.getByLabelText(/safe channel subscription activation handoff packet/i), {
      target: { value: JSON.stringify(channelSubscriptionActivationHandoffInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review activation handoff/i }));

    await waitFor(() => {
      expect(reviewChannelSubscriptionActivationHandoff).toHaveBeenCalledWith(
        channelSubscriptionActivationHandoffInput()
      );
    });
    expect(await screen.findByText("channel-subscription-activation-handoff-packet")).not.toBeNull();
    expect(within(handoffRegion).getByText("ready_for_operator_approval_request")).not.toBeNull();
    expect(within(handoffRegion).getByText("risk_a_subscription_output_activation")).not.toBeNull();
    expect(within(handoffRegion).getByText("not_granted")).not.toBeNull();
    expect(within(handoffRegion).getByText(/No subscription output mutation/i)).not.toBeNull();
    expect(within(handoffRegion).getByText(/No approval submission route/i)).not.toBeNull();
    expect(within(handoffRegion).getByText(/No subscription output execution route/i)).not.toBeNull();
    expect(within(handoffRegion).getByText(/Approval text not included/i)).not.toBeNull();
    expect(within(handoffRegion).queryByText(/secret\.example|token=|subscriptionUrl|approvalPhrase/i)).toBeNull();
  });

  test("renders channel subscription activation flow without execution controls", async () => {
    const reviewChannelSubscriptionActivationFlow = vi.fn(async () => channelSubscriptionActivationFlow());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSubscriptionActivationFlow })
    }));

    expect(await screen.findByText("Channel subscription activation flow")).not.toBeNull();
    const flowRegion = screen.getByRole("region", { name: "Channel subscription activation flow" });
    fireEvent.change(screen.getByLabelText(/safe channel subscription activation flow packet/i), {
      target: { value: JSON.stringify(channelSubscriptionActivationFlowInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review activation flow/i }));

    await waitFor(() => {
      expect(reviewChannelSubscriptionActivationFlow).toHaveBeenCalledWith(
        channelSubscriptionActivationFlowInput()
      );
    });
    expect(await screen.findByText("channel-subscription-activation-flow")).not.toBeNull();
    expect(within(flowRegion).getByText("ready_for_a_tier_subscription_output_activation_request")).not.toBeNull();
    expect(within(flowRegion).getByText("request_risk_a_subscription_output_activation_approval")).not.toBeNull();
    expect(within(flowRegion).getByText("risk_a_subscription_output_activation")).not.toBeNull();
    expect(within(flowRegion).getByText("not_granted")).not.toBeNull();
    expect(within(flowRegion).getByText(/No subscription output mutation/i)).not.toBeNull();
    expect(within(flowRegion).getByText(/No approval submission route/i)).not.toBeNull();
    expect(within(flowRegion).getByText(/No subscription output execution route/i)).not.toBeNull();
    expect(within(flowRegion).getByText(/YAML not generated/i)).not.toBeNull();
    expect(within(flowRegion).queryByText(/secret\.example|token=|subscriptionUrl|approvalPhrase/i)).toBeNull();
  });

  test("renders channel subscription activation record templates without execution controls", async () => {
    const reviewChannelSubscriptionActivationRecordTemplate = vi.fn(async () =>
      channelSubscriptionActivationRecordTemplate()
    );

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSubscriptionActivationRecordTemplate })
    }));

    expect(await screen.findByText("Channel subscription activation record template")).not.toBeNull();
    const templateRegion = screen.getByRole("region", {
      name: "Channel subscription activation record template"
    });
    fireEvent.change(screen.getByLabelText(/safe channel subscription activation flow fixture/i), {
      target: { value: JSON.stringify(channelSubscriptionActivationRecordTemplateInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review activation record template/i }));

    await waitFor(() => {
      expect(reviewChannelSubscriptionActivationRecordTemplate).toHaveBeenCalledWith(
        channelSubscriptionActivationRecordTemplateInput()
      );
    });
    expect(await screen.findByText("channel-subscription-activation-record-template")).not.toBeNull();
    expect(within(templateRegion).getByText("not_granted")).not.toBeNull();
    expect(
      within(templateRegion).getAllByText(/Channel Subscription Output Activation Execution Record/i).length
    ).toBeGreaterThan(0);
    expect(within(templateRegion).getByText(/Approval Evidence/i)).not.toBeNull();
    expect(within(templateRegion).getByText(/Validation Evidence/i)).not.toBeNull();
    expect(within(templateRegion).getAllByText(/Template only/i).length).toBeGreaterThan(0);
    expect(within(templateRegion).getByText(/No approval submission/i)).not.toBeNull();
    expect(within(templateRegion).getByText(/No subscription output mutation/i)).not.toBeNull();
    expect(within(templateRegion).getByText(/YAML not generated/i)).not.toBeNull();
    expect(within(templateRegion).queryByRole("button", { name: /^execute/i })).toBeNull();
    expect(within(templateRegion).queryByRole("button", { name: /^activate/i })).toBeNull();
    expect(within(templateRegion).queryByText(/secret\.example|token=|https?:\/\/|approvalPhrase/i)).toBeNull();
  });

  test("blocks unsafe channel subscription activation record template fixtures before calling the protected review API", async () => {
    const reviewChannelSubscriptionActivationRecordTemplate = vi.fn(async () =>
      channelSubscriptionActivationRecordTemplate()
    );

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSubscriptionActivationRecordTemplate })
    }));

    expect(await screen.findByText("Channel subscription activation record template")).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/safe channel subscription activation flow fixture/i), {
      target: {
        value: JSON.stringify({
          ...channelSubscriptionActivationRecordTemplateInput(),
          rawSubscriptionUrl: "https://sub.example/sub/clash.yaml?token=secret"
        })
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /review activation record template/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Safe channel subscription activation flow fixture contains forbidden runtime details.")
      ).not.toBeNull();
    });
    expect(reviewChannelSubscriptionActivationRecordTemplate).not.toHaveBeenCalled();
  });

  test("renders channel subscription activation packages without YAML, record Markdown, or execution controls", async () => {
    const reviewChannelSubscriptionActivationPackage = vi.fn(async () => channelSubscriptionActivationPackage());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelSubscriptionActivationPackage } as unknown as Partial<AdminApiClient>)
    }));

    expect(await screen.findByText("Channel subscription activation package")).not.toBeNull();
    const packageRegion = screen.getByRole("region", { name: "Channel subscription activation package" });
    fireEvent.change(screen.getByLabelText(/safe channel subscription activation package fixture/i), {
      target: { value: JSON.stringify(channelSubscriptionActivationPackageInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review activation package/i }));

    await waitFor(() => {
      expect(reviewChannelSubscriptionActivationPackage).toHaveBeenCalledWith(
        channelSubscriptionActivationPackageInput()
      );
    });
    expect(await screen.findByText("channel-subscription-activation-package")).not.toBeNull();
    expect(within(packageRegion).getByText("ready_for_risk_a_subscription_output_activation_request")).not.toBeNull();
    expect(within(packageRegion).getByText("request_risk_a_subscription_output_activation_approval")).not.toBeNull();
    expect(within(packageRegion).getByText("not_granted")).not.toBeNull();
    expect(within(packageRegion).getByText(/Render proof ready/i)).not.toBeNull();
    expect(within(packageRegion).getByText(/Record template ready/i)).not.toBeNull();
    expect(within(packageRegion).getByText(/YAML not returned/i)).not.toBeNull();
    expect(within(packageRegion).getByText(/Record Markdown not returned/i)).not.toBeNull();
    expect(within(packageRegion).getByText(/No approval submission route/i)).not.toBeNull();
    expect(within(packageRegion).getByText(/No subscription output execution route/i)).not.toBeNull();
    expect(within(packageRegion).queryByRole("button", { name: /^execute/i })).toBeNull();
    expect(within(packageRegion).queryByRole("button", { name: /^activate/i })).toBeNull();
    expect(within(packageRegion).queryByText(/secret\.example|token=|https?:\/\/|approvalPhrase|# Channel Subscription/i)).toBeNull();
  });

  test("renders channel lab target decision without execution controls or approval text", async () => {
    const reviewChannelLabTargetDecision = vi.fn(async () => channelLabTargetDecision());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewChannelLabTargetDecision })
    }));

    expect(await screen.findByText("Channel lab target decision")).not.toBeNull();
    const decisionRegion = screen.getByRole("region", { name: "Channel lab target decision" });
    fireEvent.change(screen.getByLabelText(/safe channel lab target inventory packet/i), {
      target: { value: JSON.stringify(channelLabTargetInventoryInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review target decision/i }));

    await waitFor(() => {
      expect(reviewChannelLabTargetDecision).toHaveBeenCalledWith(channelLabTargetInventoryInput());
    });
    expect(await screen.findByText("channel-lab-target-decision")).not.toBeNull();
    expect(within(decisionRegion).getByText("fresh_target_recommended")).not.toBeNull();
    expect(within(decisionRegion).getByText("request_channel_lab_b_selection_gate")).not.toBeNull();
    expect(within(decisionRegion).getByText("risk_a_channel_lab_b_selection")).not.toBeNull();
    expect(within(decisionRegion).getByText(/No approval submission route/i)).not.toBeNull();
    expect(within(decisionRegion).getByText(/No runtime execution route/i)).not.toBeNull();
    expect(within(decisionRegion).getByText(/Approval text not included/i)).not.toBeNull();
    expect(within(decisionRegion).queryByText(/secret\.example|token=|subscriptionUrl|approvalPhrase/i)).toBeNull();
  });

  test("renders clean edge readiness review without execution controls", async () => {
    const reviewCleanEdgeReadiness = vi.fn(async () => cleanEdgeReadinessSummary());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewCleanEdgeReadiness } as unknown as Partial<AdminApiClient>)
    }));

    expect(await screen.findByText("Clean edge readiness")).not.toBeNull();
    const readinessRegion = screen.getByRole("region", { name: "Clean edge readiness" });
    fireEvent.change(screen.getByLabelText(/safe clean edge readiness packet/i), {
      target: { value: JSON.stringify(cleanEdgeReadinessInput()) }
    });
    fireEvent.click(screen.getByRole("button", { name: /review clean edge readiness/i }));

    await waitFor(() => {
      expect(reviewCleanEdgeReadiness).toHaveBeenCalledWith(cleanEdgeReadinessInput());
    });
    expect(await screen.findByText("clean-edge-readiness-summary")).not.toBeNull();
    expect(within(readinessRegion).getByText("Preconditions ready")).not.toBeNull();
    expect(within(readinessRegion).getByText("Approval required")).not.toBeNull();
    expect(within(readinessRegion).getByText(/No cloud mutation/i)).not.toBeNull();
    expect(within(readinessRegion).getByText(/No DNS mutation/i)).not.toBeNull();
    expect(within(readinessRegion).getByText(/No subscription output mutation/i)).not.toBeNull();
    expect(within(readinessRegion).queryByText(/secret\.example|token=|subscriptionUrl|approvalPhrase/i)).toBeNull();
  });

  test("blocks unsafe clean edge readiness packet before calling the protected review API", async () => {
    const reviewCleanEdgeReadiness = vi.fn(async () => cleanEdgeReadinessSummary());

    render(createElement(OverviewPage, {
      apiClient: adminClient({ reviewCleanEdgeReadiness } as unknown as Partial<AdminApiClient>)
    }));

    expect(await screen.findByText("Clean edge readiness")).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/safe clean edge readiness packet/i), {
      target: {
        value: JSON.stringify({
          ...cleanEdgeReadinessInput(),
          rawHost: "edge-secret.example",
          rawSubscriptionUrl: "https://sub.example/sub/clash.yaml?token=secret"
        })
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /review clean edge readiness/i }));

    await waitFor(() => {
      expect(screen.getByText("Safe clean edge readiness packet contains forbidden runtime details.")).not.toBeNull();
    });
    expect(reviewCleanEdgeReadiness).not.toHaveBeenCalled();
  });
});
