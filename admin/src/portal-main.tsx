import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { UserRegistrationPage } from "./features/user-portal/user-registration-page";
import { UserPortalPage } from "./features/user-portal/user-portal-page";
import { consumePortalAdsClickHandoff } from "./features/ads-attribution";
import { isPortalRegistrationPath } from "./features/user-portal/portal-entry";
import { createHttpUserPortalClient } from "./features/user-portal/user-portal-client";
import "./portal-static-preserve.css";

// Consume the transient fragment before runtime config parsing or Portal reads hash-based navigation.
consumePortalAdsClickHandoff();

type PortalImportMeta = ImportMeta & {
  readonly env: {
    readonly VITE_PORTAL_RECHARGE_CONFIG_BINDING: string;
  };
};

function readRechargeRuntimeConfig(binding: string) {
  const match = /^portal-recharge-config-v1\.([0-9a-f]{64})\.([A-Za-z0-9+/]+={0,2})$/u.exec(binding);
  if (!match) throw new Error("Portal recharge runtime config is invalid");
  let canonical: string;
  try {
    canonical = window.atob(match[2]);
  } catch {
    throw new Error("Portal recharge runtime config is invalid");
  }
  if (window.btoa(canonical) !== match[2]) {
    throw new Error("Portal recharge runtime config is invalid");
  }
  return {
    rechargeConfigSha256: match[1],
    rechargeTrustedActionOriginsJson: canonical,
  };
}

const {
  rechargeConfigSha256,
  rechargeTrustedActionOriginsJson,
} = readRechargeRuntimeConfig(
  (import.meta as PortalImportMeta).env.VITE_PORTAL_RECHARGE_CONFIG_BINDING,
);


// eslint-disable-next-line react-refresh/only-export-components -- portal entry-point bootstrap; component is mounted once and not a Fast Refresh target
function PortalOnlyApp() {
  const portalClient = useMemo(() => createHttpUserPortalClient({
    rechargeTrustedActionOriginsJson,
  }), []);
  return (
    <>
      {isPortalRegistrationPath(window.location.pathname)
        ? <UserRegistrationPage portalClient={portalClient} />
        : <UserPortalPage portalClient={portalClient} />}
    </>
  );
}

const portalRoot = document.getElementById("root")!;
portalRoot.dataset.portalRechargeConfigSha256 = rechargeConfigSha256;

createRoot(portalRoot).render(
  <StrictMode>
    <PortalOnlyApp />
  </StrictMode>
);
