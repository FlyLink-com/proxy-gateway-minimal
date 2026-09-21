import { useMemo } from "react";
import { createHttpUserPortalClient, type PortalSession } from "./user-portal-client";
import { createLocalUserPortalClient } from "./user-portal-preview-client";
import { UserPortalPage } from "./user-portal-page";
import { UserRegistrationPage } from "./user-registration-page";

type UserPortalRouteProps = {
  env?: PortalRouteEnv;
  location?: PortalRouteLocation | null;
  mode: "login" | "register";
};

type PortalRouteEnv = {
  MODE?: string;
  VITE_USER_PORTAL_LOCAL_SHELL_PREVIEW?: string | boolean;
};

type PortalRouteLocation = {
  hostname?: string;
};

const viteEnv = (import.meta as ImportMeta & { env?: PortalRouteEnv }).env || {};

const localPreviewSession: PortalSession = {
  status: "authenticated_preview",
  sessionRef: "local_portal_shell_preview",
  userRef: "user_account",
  displayName: "user_account",
  authMode: "password",
  registeredAt: "2026-07-02T00:00:00.000Z",
  safety: {
    noAdminApi: true,
    noPublicAuthActivated: true,
    noRawPasswordReturned: true
  }
};

function localPreviewFlagDisabled(value: PortalRouteEnv["VITE_USER_PORTAL_LOCAL_SHELL_PREVIEW"]) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no";
}

function isLoopbackHost(hostname = "") {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function readCurrentLocation(): PortalRouteLocation | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.location;
}

// eslint-disable-next-line react-refresh/only-export-components -- pure env + location predicate consumed by tests and the route component below
export function isLocalPortalShellPreviewEnabled(
  env: PortalRouteEnv = viteEnv,
  location: PortalRouteLocation | null = readCurrentLocation()
) {
  if (!location || localPreviewFlagDisabled(env.VITE_USER_PORTAL_LOCAL_SHELL_PREVIEW)) {
    return false;
  }
  return env.MODE === "development" && isLoopbackHost(location.hostname);
}

export function UserPortalRoute({
  env = viteEnv,
  location = readCurrentLocation(),
  mode
}: UserPortalRouteProps) {
  const localShellPreviewEnabled = mode === "login" && isLocalPortalShellPreviewEnabled(env, location);
  const portalClient = useMemo(
    () => localShellPreviewEnabled
      ? createLocalUserPortalClient()
      : createHttpUserPortalClient(),
    [localShellPreviewEnabled]
  );

  if (mode === "register") {
    return <UserRegistrationPage portalClient={portalClient} />;
  }

  return (
    <UserPortalPage
      initialSession={localShellPreviewEnabled ? localPreviewSession : undefined}
      portalClient={portalClient}
    />
  );
}
