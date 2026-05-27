import type {
  AccessMigrationEvidenceInput,
  AliyunGateDecisionPacket,
  AliyunGateEvidenceSummary,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  ProviderFirewallEvidenceInput,
  RenewSubscriptionInput,
  ResetTokenResult,
  SubscriptionNode,
  SubscriptionOverview,
  SubscriptionTenant,
  TempLinkResult
} from "./types";

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

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed || trimmed === "/") return "";
  return trimmed.replace(/\/+$/, "");
}

function apiUrl(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
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
      const backendMessage =
        body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : "";
      throw new AdminApiError(backendMessage || messageForStatus(response.status), response.status);
    }
    return body as T;
  }

  return {
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
    getAliyunGates: async () =>
      (await request<{ aliyunGates: AliyunGateDecisionPacket }>("/api/admin/platform/aliyun-gates")).aliyunGates,
    getAliyunGateEvidence: async () =>
      (await request<{ evidence: AliyunGateEvidenceSummary | null }>("/api/admin/platform/aliyun-gate-evidence"))
        .evidence,
    recordProviderFirewallEvidence: async (input: ProviderFirewallEvidenceInput) =>
      (
        await request<{ evidence: AliyunGateEvidenceSummary }>(
          "/api/admin/platform/aliyun-gate-evidence/provider-firewall",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).evidence,
    recordAccessMigrationEvidence: async (input: AccessMigrationEvidenceInput) =>
      (
        await request<{ evidence: AliyunGateEvidenceSummary }>(
          "/api/admin/platform/aliyun-gate-evidence/access-migration",
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).evidence
  };
}

export type AdminApiClient = ReturnType<typeof createAdminApiClient>;
