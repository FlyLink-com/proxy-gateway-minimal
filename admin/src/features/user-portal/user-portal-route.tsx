import { useMemo } from "react";
import {
  createHttpUserPortalClient,
  createLocalUserPortalClient,
  type PortalSession
} from "./user-portal-client";
import { UserPortalPage } from "./user-portal-page";
import { UserRegistrationPage } from "./user-registration-page";
import { createHttpCommerceClient, createLocalPreviewCommerceClient, type CommerceClient } from "./commerce/commerce-client";

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
  const commerceClient = useMemo<CommerceClient>(() => localShellPreviewEnabled
    ? createLocalPreviewCommerceClient(createLocalPreviewCommerceFixture())
    : createHttpCommerceClient(), [localShellPreviewEnabled]);

  if (mode === "register") {
    return <UserRegistrationPage portalClient={portalClient} />;
  }

  return (
    <UserPortalPage
      initialSession={localShellPreviewEnabled ? localPreviewSession : undefined}
      portalClient={portalClient}
      commerceClient={commerceClient}
    />
  );
}

function createLocalPreviewCommerceFixture() {
  const now = "2026-07-02T00:00:00.000Z";
  return {
    wallet: { summary: { accountRef: "preview", at: now, totalAvailableCoins: 0, totalFrozenCoins: 0, byOrigin: { bonus: { availableCoins: 0, frozenCoins: 0 }, paid: { availableCoins: 0, frozenCoins: 0 }, referral: { availableCoins: 0, frozenCoins: 0 } } }, transactions: [] },
    catalog: { catalog: { schemaVersion: "coins_commerce_catalog_v1" as const, publishedAt: now, productVersions: [], offerVersions: [], rechargeOffers: [] }, activeMemberships: [] },
    orders: [],
    referral: { cumulativeEarnedCoins: 0, availableCoins: 0, internallyConsumedCoins: 0, frozenCoins: 0, frozenForSettlementCoins: 0, externallySettledCoins: 0, reversedCoins: 0 }
  };
}
