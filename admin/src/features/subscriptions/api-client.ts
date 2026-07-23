import type {
  ChannelLabTargetDecision,
  ChannelLabTargetDecisionInput,
  ChannelRuntimeEvidenceBridge,
  ChannelRuntimeEvidenceBridgeInput,
  ChannelRuntimeExecutionHandoff,
  ChannelRuntimeGateWorkbench,
  ChannelSubscriptionActivationFlow,
  ChannelSubscriptionActivationFlowInput,
  ChannelSubscriptionActivationHandoff,
  ChannelSubscriptionActivationHandoffInput,
  ChannelSubscriptionActivationPackage,
  ChannelSubscriptionActivationPackageInput,
  ChannelSubscriptionActivationRecordTemplate,
  ChannelSubscriptionActivationRecordTemplateInput,
  ChannelSubscriptionActivationReadiness,
  ChannelSubscriptionActivationReadinessInput,
  ChannelSubscriptionOutputDraft,
  ChannelSubscriptionOutputDraftInput,
  ChannelSystemDecisionFlow,
  ChannelSystemReviewInput,
  CleanEdgeReadinessInput,
  CleanEdgeReadinessSummary,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  PartnerAttributionAdminReport,
  PortalAccessApprovalPreview,
  PortalAccessApprovalPreviewInput,
  PortalAccessRequestSummary,
  PortalAccessTrafficLimitUpdate,
  PortalAccessTrafficLimitUpdateInput,
  ProvisioningFormInput,
  ProvisioningFormPreview,
  RenewSubscriptionInput,
  ResetTokenResult,
  SubscriptionNode,
  SubscriptionOverview,
  SubscriptionUsageMonitor,
  SubscriptionUsageMonitorFilters,
  SubscriptionTenant,
  TempLinkResult
} from "./types";
import { adminAuthOriginPolicy, normalizeBaseUrl } from "./api-origin-policy";
import { parsePaymentLogsEnvelope, type PaymentLogStatus } from "../payment-logs/payment-logs-model";

type Fetcher = typeof fetch;

export type AdminApiClientOptions = {
  baseUrl: string;
  consoleToken: string;
  fetcher?: Fetcher;
};

export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

function apiUrl(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function queryString(filters: SubscriptionUsageMonitorFilters) {
  const params = new URLSearchParams();
  const entries = Object.entries(filters) as Array<
    [keyof SubscriptionUsageMonitorFilters, string | undefined]
  >;
  for (const [key, value] of entries) {
    const normalized = value?.trim() ?? "";
    if (normalized) {
      params.set(key, normalized);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdminApiError("Backend returned invalid JSON", response.status);
  }
}

function messageForStatus(status: number) {
  if (status === 401) return "Console token is missing or invalid.";
  if (status === 403) return "This source is not allowed to use admin APIs.";
  if (status === 404) return "Admin API is not reachable here. Use local backend access or an SSH tunnel.";
  return `Admin API request failed with HTTP ${status}.`;
}

export function createAdminApiClient(options: AdminApiClientOptions) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!options.consoleToken.trim()) {
      throw new AdminApiError("Console token is required.", 0);
    }
    const authPolicy = adminAuthOriginPolicy(baseUrl);
    if (!authPolicy.trusted) {
      throw new AdminApiError(authPolicy.reason || "Admin API base URL is not trusted for console token use.", 0);
    }

    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${options.consoleToken}`);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    let response: Response;
    try {
      response = await fetcher(apiUrl(baseUrl, path), { ...init, headers });
    } catch (error) {
      throw new AdminApiError(error instanceof Error ? error.message : "Admin API request failed.", 0);
    }

    const body = await parseJson(response);
    if (!response.ok) {
      throw new AdminApiError(messageForStatus(response.status), response.status);
    }
    return body as T;
  }

  return {
    listPaymentLogs: async (filters: { status?: PaymentLogStatus; limit?: number; cursor?: number; signal?: AbortSignal } = {}) => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.limit) params.set("limit", String(filters.limit));
      if (filters.cursor) params.set("cursor", String(filters.cursor));
      const query = params.toString();
      const response = await request<unknown>(`/api/admin/platform/payment-logs${query ? `?${query}` : ""}`, { signal: filters.signal });
      return parsePaymentLogsEnvelope(response);
    },
    listTenants: async () => (await request<{ items: SubscriptionTenant[] }>("/api/admin/subscriptions")).items,
    createTenant: async (input: CreateSubscriptionInput) =>
      request<CreateSubscriptionResult>("/api/admin/subscriptions", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    renewTenant: async (input: RenewSubscriptionInput) =>
      (
        await request<{ tenant: SubscriptionTenant }>(
          `/api/admin/subscriptions/${encodeURIComponent(input.id)}/renew`,
          {
            method: "POST",
            body: JSON.stringify({ expiresAt: input.expiresAt })
          }
        )
      ).tenant,
    disableTenant: async (id: string) =>
      (
        await request<{ tenant: SubscriptionTenant }>(
          `/api/admin/subscriptions/${encodeURIComponent(id)}/disable`,
          { method: "POST" }
        )
      ).tenant,
    enableTenant: async (id: string) =>
      (
        await request<{ tenant: SubscriptionTenant }>(
          `/api/admin/subscriptions/${encodeURIComponent(id)}/enable`,
          { method: "POST" }
        )
      ).tenant,
    resetToken: async (id: string) =>
      request<ResetTokenResult>(`/api/admin/subscriptions/${encodeURIComponent(id)}/reset-token`, {
        method: "POST"
      }),
    createTempLink: async (id: string) =>
      request<TempLinkResult>(`/api/admin/subscriptions/${encodeURIComponent(id)}/temp-link`, {
        method: "POST"
      }),
    listNodes: async () => (await request<{ items: SubscriptionNode[] }>("/api/admin/nodes")).items,
    overview: async () => request<SubscriptionOverview>("/api/admin/overview"),
    previewProvisioningForm: async (input: ProvisioningFormInput) =>
      (
        await request<{ provisioningForm: ProvisioningFormPreview }>(
          "/api/admin/platform/provisioning-form/preview",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).provisioningForm,
    listPortalAccessRequests: async (status?: string) => {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      return (
        await request<{ items: PortalAccessRequestSummary[] }>(
          `/api/admin/platform/portal-access-requests${query}`
        )
      ).items;
    },
    listSubscriptionUsageMonitor: async (filters: SubscriptionUsageMonitorFilters = {}) =>
      (
        await request<{ monitor: SubscriptionUsageMonitor }>(
          `/api/admin/platform/subscription-usage-monitor${queryString(filters)}`
        )
      ).monitor,
    getPartnerAttributionReport: async () =>
      (
        await request<{ report: PartnerAttributionAdminReport }>(
          "/api/admin/platform/partner-attribution-report"
        )
      ).report,
    previewPortalAccessRequestApproval: async (
      requestRef: string,
      input: PortalAccessApprovalPreviewInput
    ) =>
      (
        await request<{ preview: PortalAccessApprovalPreview }>(
          `/api/admin/platform/portal-access-requests/${encodeURIComponent(requestRef)}/approve-preview`,
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).preview,
    updatePortalAccessRequestTrafficLimit: async (
      requestRef: string,
      input: PortalAccessTrafficLimitUpdateInput
    ) =>
      (
        await request<{ quotaUpdate: PortalAccessTrafficLimitUpdate }>(
          `/api/admin/platform/portal-access-requests/${encodeURIComponent(requestRef)}/traffic-limit`,
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).quotaUpdate,
    reviewChannelSystem: async (input: ChannelSystemReviewInput) =>
      (
        await request<{ channelSystem: ChannelSystemDecisionFlow }>(
          "/api/admin/platform/channel-system-decision-flow",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelSystem,
    reviewChannelRuntimeEvidence: async (input: ChannelRuntimeEvidenceBridgeInput) =>
      (
        await request<{ channelRuntimeEvidence: ChannelRuntimeEvidenceBridge }>(
          "/api/admin/platform/channel-runtime-evidence-bridge",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelRuntimeEvidence,
    reviewChannelRuntimeGate: async (input: ChannelRuntimeEvidenceBridgeInput) =>
      (
        await request<{ channelRuntimeGateWorkbench: ChannelRuntimeGateWorkbench }>(
          "/api/admin/platform/channel-runtime-gate-workbench",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelRuntimeGateWorkbench,
    reviewChannelRuntimeExecutionHandoff: async (input: ChannelRuntimeEvidenceBridgeInput) =>
      (
        await request<{ channelRuntimeExecutionHandoff: ChannelRuntimeExecutionHandoff }>(
          "/api/admin/platform/channel-runtime-execution-handoff",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelRuntimeExecutionHandoff,
    reviewChannelSubscriptionOutputDraft: async (input: ChannelSubscriptionOutputDraftInput) =>
      (
        await request<{ channelSubscriptionOutputDraft: ChannelSubscriptionOutputDraft }>(
          "/api/admin/platform/channel-subscription-output-draft",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelSubscriptionOutputDraft,
    reviewChannelSubscriptionActivationReadiness: async (input: ChannelSubscriptionActivationReadinessInput) =>
      (
        await request<{ channelSubscriptionActivationReadiness: ChannelSubscriptionActivationReadiness }>(
          "/api/admin/platform/channel-subscription-activation-readiness",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelSubscriptionActivationReadiness,
    reviewChannelSubscriptionActivationHandoff: async (input: ChannelSubscriptionActivationHandoffInput) =>
      (
        await request<{ channelSubscriptionActivationHandoff: ChannelSubscriptionActivationHandoff }>(
          "/api/admin/platform/channel-subscription-activation-handoff",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelSubscriptionActivationHandoff,
    reviewChannelSubscriptionActivationFlow: async (input: ChannelSubscriptionActivationFlowInput) =>
      (
        await request<{ channelSubscriptionActivationFlow: ChannelSubscriptionActivationFlow }>(
          "/api/admin/platform/channel-subscription-activation-flow",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelSubscriptionActivationFlow,
    reviewChannelSubscriptionActivationRecordTemplate: async (
      input: ChannelSubscriptionActivationRecordTemplateInput
    ) =>
      (
        await request<{ channelSubscriptionActivationRecordTemplate: ChannelSubscriptionActivationRecordTemplate }>(
          "/api/admin/platform/channel-subscription-activation-record-template",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelSubscriptionActivationRecordTemplate,
    reviewChannelSubscriptionActivationPackage: async (input: ChannelSubscriptionActivationPackageInput) =>
      (
        await request<{ channelSubscriptionActivationPackage: ChannelSubscriptionActivationPackage }>(
          "/api/admin/platform/channel-subscription-activation-package",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelSubscriptionActivationPackage,
    reviewChannelLabTargetDecision: async (input: ChannelLabTargetDecisionInput) =>
      (
        await request<{ channelLabTargetDecision: ChannelLabTargetDecision }>(
          "/api/admin/platform/channel-lab-target-decision",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).channelLabTargetDecision,
    reviewCleanEdgeReadiness: async (input: CleanEdgeReadinessInput) =>
      (
        await request<{ cleanEdgeReadiness: CleanEdgeReadinessSummary }>(
          "/api/admin/platform/clean-edge-readiness-summary",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).cleanEdgeReadiness
  };
}

export type AdminApiClient = ReturnType<typeof createAdminApiClient>;
