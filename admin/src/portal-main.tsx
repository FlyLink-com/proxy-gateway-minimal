import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { UserRegistrationPage } from "./features/user-portal/user-registration-page";
import { UserPortalPage } from "./features/user-portal/user-portal-page";
import { createHttpUserPortalClient } from "./features/user-portal/user-portal-client";
import "./portal-static-preserve.css";

function PortalOnlyApp() {
  const portalClient = useMemo(() => createHttpUserPortalClient(), []);
  if (window.location.pathname.startsWith("/portal/register")) {
    return <UserRegistrationPage portalClient={portalClient} />;
  }
  return <UserPortalPage portalClient={portalClient} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PortalOnlyApp />
  </StrictMode>
);
