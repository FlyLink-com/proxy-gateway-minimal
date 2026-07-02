export type AdminSession = {
  authMode?: "protectedSession";
  baseUrl: string;
  localInspectionBlocked?: boolean;
};

const KEY = "proxy-gateway-admin-session";

type AdminSessionEnv = {
  DEV?: boolean;
  MODE?: string;
  VITE_ADMIN_API_BASE_URL?: string;
  VITE_ADMIN_LOCAL_INSPECTION?: boolean | string;
};

type AdminSessionLocation = {
  hostname: string;
  protocol?: string;
};

const viteEnv = (import.meta as ImportMeta & { env?: AdminSessionEnv }).env || {};

function cleanEnvText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function envMode(env: AdminSessionEnv) {
  return cleanEnvText(env.MODE).toLowerCase();
}

function readConfiguredApiBaseUrl(env: AdminSessionEnv) {
  if (envMode(env) === "production") {
    return "";
  }
  return cleanEnvText(env.VITE_ADMIN_API_BASE_URL);
}

function localInspectionDisabled(value: AdminSessionEnv["VITE_ADMIN_LOCAL_INSPECTION"]) {
  if (typeof value === "boolean") {
    return value === false;
  }
  if (typeof value !== "string") {
    return false;
  }
  return ["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function isLoopbackHostname(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase();
  return normalizedHostname === "localhost"
    || normalizedHostname === "127.0.0.1"
    || normalizedHostname === "::1"
    || normalizedHostname === "[::1]";
}

function isLoopbackApiBaseUrl(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    return isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function readStoredBaseUrl(value: unknown, defaultSession: AdminSession, env: AdminSessionEnv) {
  const storedBaseUrl = typeof value === "string" ? value : defaultSession.baseUrl;
  const productionPublicHost = envMode(env) === "production"
    && defaultSession.authMode !== "protectedSession"
    && defaultSession.baseUrl === "";
  if (productionPublicHost && isLoopbackApiBaseUrl(storedBaseUrl)) {
    return "";
  }
  return storedBaseUrl;
}

function readCurrentLocation(): AdminSessionLocation | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.location;
}

export function isLocalAdminInspectionSessionEnabled(
  env: AdminSessionEnv = viteEnv,
  location: AdminSessionLocation | null = readCurrentLocation()
) {
  if (!location || envMode(env) === "test" || localInspectionDisabled(env.VITE_ADMIN_LOCAL_INSPECTION)) {
    return false;
  }

  const protocol = location.protocol || "http:";
  return (protocol === "http:" || protocol === "https:")
    && isLoopbackHostname(location.hostname);
}

export function createDefaultAdminSession(
  env: AdminSessionEnv = viteEnv,
  location: AdminSessionLocation | null = readCurrentLocation()
): AdminSession {
  const localInspectionEnabled = isLocalAdminInspectionSessionEnabled(env, location);
  return {
    ...(localInspectionEnabled ? { authMode: "protectedSession" as const } : {}),
    baseUrl: localInspectionEnabled ? "" : readConfiguredApiBaseUrl(env)
  };
}

export const DEFAULT_ADMIN_SESSION: AdminSession = createDefaultAdminSession();

export function loadAdminSession(
  env: AdminSessionEnv = viteEnv,
  location: AdminSessionLocation | null = readCurrentLocation()
): AdminSession {
  try {
    const defaultSession = createDefaultAdminSession(env, location);
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return defaultSession;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    const localInspectionBlocked = parsed.localInspectionBlocked === true;
    return {
      ...(parsed.authMode === "protectedSession" || (!localInspectionBlocked && defaultSession.authMode === "protectedSession")
        ? { authMode: "protectedSession" as const }
        : {}),
      baseUrl: readStoredBaseUrl(parsed.baseUrl, defaultSession, env),
      ...(localInspectionBlocked ? { localInspectionBlocked } : {})
    };
  } catch {
    return createDefaultAdminSession(env, location);
  }
}

export function saveAdminSession(session: AdminSession) {
  sessionStorage.setItem(KEY, JSON.stringify({
    ...(session.authMode === "protectedSession" ? { authMode: "protectedSession" as const } : {}),
    baseUrl: session.baseUrl,
    ...(session.localInspectionBlocked === true ? { localInspectionBlocked: true } : {})
  }));
}

export function clearAdminSession(options: { blockLocalInspection?: boolean } = {}): AdminSession {
  sessionStorage.removeItem(KEY);
  const defaultSession = createDefaultAdminSession();
  if (options.blockLocalInspection && defaultSession.authMode === "protectedSession") {
    const blockedSession = {
      baseUrl: defaultSession.baseUrl,
      localInspectionBlocked: true
    };
    saveAdminSession(blockedSession);
    return blockedSession;
  }
  return defaultSession;
}
