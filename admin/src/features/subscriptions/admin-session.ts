export type AdminSession = {
  baseUrl: string;
  consoleToken: string;
};

const KEY = "proxy-gateway-admin-session";

const LOCAL_DEV_ADMIN_API_BASE_URL = "http://127.0.0.1:3456";

type AdminSessionEnv = {
  DEV?: boolean;
  MODE?: string;
  VITE_ADMIN_API_BASE_URL?: string;
  VITE_ADMIN_CONSOLE_TOKEN?: string;
};

const viteEnv = (import.meta as ImportMeta & { env?: AdminSessionEnv }).env || {};

function cleanEnvText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isLocalDevelopmentEnv(env: AdminSessionEnv = {}) {
  return env.MODE !== "test"
    && env.MODE !== "production"
    && cleanEnvText(env.VITE_ADMIN_CONSOLE_TOKEN).length > 0;
}

export function createDefaultAdminSession(env: AdminSessionEnv = viteEnv): AdminSession {
  const localDevelopment = isLocalDevelopmentEnv(env);

  return {
    baseUrl: cleanEnvText(env.VITE_ADMIN_API_BASE_URL) || (localDevelopment ? LOCAL_DEV_ADMIN_API_BASE_URL : ""),
    consoleToken: localDevelopment ? cleanEnvText(env.VITE_ADMIN_CONSOLE_TOKEN) : ""
  };
}

export const DEFAULT_ADMIN_SESSION: AdminSession = createDefaultAdminSession();

export function loadAdminSession(): AdminSession {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return DEFAULT_ADMIN_SESSION;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : DEFAULT_ADMIN_SESSION.baseUrl,
      consoleToken: parsed.consoleToken || ""
    };
  } catch {
    return DEFAULT_ADMIN_SESSION;
  }
}

export function saveAdminSession(session: AdminSession) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}
