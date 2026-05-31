import { adminAuthOriginPolicy, normalizeBaseUrl } from "./api-origin-policy";

type Fetcher = typeof fetch;

export type ConnectionHealthStatus =
  | "connected"
  | "token-required"
  | "token-invalid"
  | "source-blocked"
  | "public-gateway-blocked"
  | "backend-health-unreachable"
  | "auth-origin-blocked"
  | "network-error";

export type ConnectionHealthResult = {
  status: ConnectionHealthStatus;
  title: string;
  message: string;
  healthStatus?: number;
  adminStatus?: number;
};

export type ConnectionHealthInput = {
  baseUrl: string;
  consoleToken: string;
  fetcher?: Fetcher;
};

function apiUrl(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function result(
  status: ConnectionHealthStatus,
  title: string,
  message: string,
  details: Pick<ConnectionHealthResult, "healthStatus" | "adminStatus"> = {}
): ConnectionHealthResult {
  return { status, title, message, ...details };
}

function networkErrorResult(): ConnectionHealthResult {
  return result(
    "network-error",
    "Connection check failed",
    "The browser could not reach the backend. Check the API base URL, backend process, SSH tunnel, and browser CORS settings."
  );
}

export async function checkAdminConnectionHealth({
  baseUrl,
  consoleToken,
  fetcher = fetch
}: ConnectionHealthInput): Promise<ConnectionHealthResult> {
  const token = consoleToken.trim();
  if (!token) {
    return result(
      "token-required",
      "Console token required",
      "Enter the console token before checking protected admin API access."
    );
  }

  let healthResponse: Response;
  try {
    healthResponse = await fetcher(apiUrl(baseUrl, "/api/health"), { method: "GET" });
  } catch {
    return networkErrorResult();
  }

  if (!healthResponse.ok) {
    return result(
      "backend-health-unreachable",
      "Backend health check failed",
      `The backend health endpoint returned HTTP ${healthResponse.status}. Check the API base URL and backend process.`,
      { healthStatus: healthResponse.status }
    );
  }

  const authPolicy = adminAuthOriginPolicy(baseUrl);
  if (!authPolicy.trusted) {
    return result(
      "auth-origin-blocked",
      "Console token not sent",
      authPolicy.reason || "Console token is not sent to this API base URL.",
      { healthStatus: healthResponse.status }
    );
  }

  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);

  let adminResponse: Response;
  try {
    adminResponse = await fetcher(apiUrl(baseUrl, "/api/admin/overview"), {
      method: "GET",
      headers
    });
  } catch {
    return networkErrorResult();
  }

  if (adminResponse.ok) {
    return result(
      "connected",
      "Admin API connected",
      "Backend health is reachable and the admin API accepted the console token.",
      { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
    );
  }

  if (adminResponse.status === 401) {
    return result(
      "token-invalid",
      "Console token invalid",
      "The backend is reachable, but the admin API rejected the console token.",
      { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
    );
  }

  if (adminResponse.status === 403) {
    return result(
      "source-blocked",
      "Source IP blocked",
      "The backend is reachable, but this browser source is not allowed to use admin APIs. Use local access or the intended SSH tunnel.",
      { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
    );
  }

  if (adminResponse.status === 404) {
    return result(
      "public-gateway-blocked",
      "Admin API not exposed here",
      "Health is reachable, but admin APIs returned 404. You may be pointing at the public gateway instead of local backend access or an SSH tunnel.",
      { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
    );
  }

  return result(
    "backend-health-unreachable",
    "Admin API check failed",
    `The admin overview endpoint returned HTTP ${adminResponse.status}. Check the backend process and API base URL.`,
    { healthStatus: healthResponse.status, adminStatus: adminResponse.status }
  );
}
