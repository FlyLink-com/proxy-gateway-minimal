export type AdminSession = {
  baseUrl: string;
  consoleToken: string;
};

const KEY = "proxy-gateway-admin-session";

const viteEnv = import.meta as ImportMeta & {
  env?: {
    VITE_ADMIN_API_BASE_URL?: string;
  };
};

export const DEFAULT_ADMIN_SESSION: AdminSession = {
  baseUrl: viteEnv.env?.VITE_ADMIN_API_BASE_URL || "http://127.0.0.1:3456",
  consoleToken: ""
};

export function loadAdminSession(): AdminSession {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return DEFAULT_ADMIN_SESSION;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    return {
      baseUrl: parsed.baseUrl || DEFAULT_ADMIN_SESSION.baseUrl,
      consoleToken: parsed.consoleToken || ""
    };
  } catch {
    return DEFAULT_ADMIN_SESSION;
  }
}

export function saveAdminSession(session: AdminSession) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}
