import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { UserRegistrationPage } from "./features/user-portal/user-registration-page";
import { UserPortalPage } from "./features/user-portal/user-portal-page";
import { createHttpUserPortalClient } from "./features/user-portal/user-portal-client";
import "./portal-static-preserve.css";

type PortalImportMeta = ImportMeta & {
  readonly env: {
    readonly VITE_PORTAL_RECHARGE_CONFIG_SHA256: string;
    readonly VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON?: string;
  };
};

const rechargeTrustedActionOriginsJson =
  (import.meta as PortalImportMeta).env.VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON;
const rechargeConfigSha256 =
  (import.meta as PortalImportMeta).env.VITE_PORTAL_RECHARGE_CONFIG_SHA256;

function PortalOnlyApp() {
  const portalClient = useMemo(() => createHttpUserPortalClient({
    rechargeTrustedActionOriginsJson,
  }), []);
  if (window.location.pathname.startsWith("/portal/register")) {
    return <UserRegistrationPage portalClient={portalClient} />;
  }
  return <UserPortalPage portalClient={portalClient} />;
}

const portalRoot = document.getElementById("root")!;
portalRoot.dataset.portalRechargeConfigSha256 = rechargeConfigSha256;

createRoot(portalRoot).render(
  <StrictMode>
    <PortalOnlyApp />
  </StrictMode>
);
