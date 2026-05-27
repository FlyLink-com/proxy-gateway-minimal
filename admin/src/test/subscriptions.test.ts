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
  ChannelSystemDecisionFlow,
  ChannelSystemReviewInput,
  SubscriptionTenant
} from "../features/subscriptions/types";
import { NodesPage } from "../pages/nodes-page";
import { OverviewPage } from "../pages/overview-page";

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
    ...overrides
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
});
