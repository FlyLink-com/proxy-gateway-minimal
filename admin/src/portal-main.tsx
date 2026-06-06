import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { UserPortalPage } from "./features/user-portal/user-portal-page";
import { createHttpUserPortalClient } from "./features/user-portal/user-portal-client";
import "./styles.css";

function PortalOnlyApp() {
  const portalClient = useMemo(() => createHttpUserPortalClient(), []);
  return <UserPortalPage portalClient={portalClient} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PortalOnlyApp />
  </StrictMode>
);
