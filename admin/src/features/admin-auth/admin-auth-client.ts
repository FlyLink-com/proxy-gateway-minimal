export type AdminProtectedSession = {
  authMethod?: "totp";
  expiresAt?: string;
  issuedAt?: string;
  operatorRef: string;
  sessionRef: string;
  status?: "active" | "expired" | "revoked";
};

export type AdminProtectedSessionStatus =
  | {
      authenticated: false;
      mode?: "portalAccount";
      operatorRef?: string;
      setupRequired?: boolean;
    }
  | { authenticated: true; session: AdminProtectedSession };

export type AdminTotpEnrollment = {
  enrollmentRef: string;
  expiresAt: string;
  issuedAt: string;
  issuer: string;
  manualKey: string;
  operatorRef: string;
  otpauthUri: string;
};

export type AdminTotpChallenge = {
  challengeRef: string;
  expiresAt: string;
  issuedAt: string;
  methods: string[];
  operatorRef: string;
};

export type AdminProtectedAuthClient = ReturnType<typeof createAdminProtectedAuthClient>;

type Fetcher = typeof fetch;

type ClientOptions = {
  baseUrl?: string;
  fetcher?: Fetcher;
};

class AdminProtectedAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminProtectedAuthError";
    this.status = status;
  }
}

function normalizeBaseUrl(value = "") {
  return value.trim().replace(/\/+$/, "");
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
    throw new AdminProtectedAuthError("Admin auth returned invalid JSON.", response.status);
  }
}

function authMessage(status: number) {
  if (status === 401) return "Admin identity or authenticator code was rejected.";
  if (status === 403) return "This source is not allowed to access Admin.";
  if (status === 409) return "Admin operator is already configured.";
  return `Admin protected auth request failed with HTTP ${status}.`;
}

export function createAdminProtectedAuthClient(options: ClientOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.delete("authorization");
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetcher(apiUrl(baseUrl, path), {
      ...init,
      credentials: "same-origin",
      headers
    });
    const body = await parseJson(response);
    if (!response.ok) {
      throw new AdminProtectedAuthError(authMessage(response.status), response.status);
    }
    return body as T;
  }

  return {
    session: async () => request<AdminProtectedSessionStatus>("/api/admin-auth/session"),
    startBootstrap: async ({ bootstrapToken }: { bootstrapToken: string }) => {
      const body = await request<{ enrollment: AdminTotpEnrollment }>("/api/admin-auth/bootstrap/start", {
        method: "POST",
        body: JSON.stringify({ bootstrapToken })
      });
      return body.enrollment;
    },
    confirmEnrollment: async ({ enrollmentRef, code }: { enrollmentRef: string; code: string }) => {
      const body = await request<{ session: AdminProtectedSession }>("/api/admin-auth/totp/enrollment/confirm", {
        method: "POST",
        body: JSON.stringify({ enrollmentRef, code })
      });
      return body.session;
    },
    login: async ({ operatorRef, bootstrapToken }: { operatorRef: string; bootstrapToken: string }) => {
      const body = await request<{ challenge: AdminTotpChallenge }>("/api/admin-auth/login", {
        method: "POST",
        body: JSON.stringify({ operatorRef, bootstrapToken })
      });
      return body.challenge;
    },
    verifyTotp: async ({ challengeRef, code }: { challengeRef: string; code: string }) => {
      const body = await request<{ session: AdminProtectedSession }>("/api/admin-auth/totp/verify", {
        method: "POST",
        body: JSON.stringify({ challengeRef, code })
      });
      return body.session;
    },
    logout: async () => request<{ loggedOut: true }>("/api/admin-auth/logout", { method: "POST" })
  };
}
