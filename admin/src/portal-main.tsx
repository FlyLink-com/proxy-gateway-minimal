import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UserPortalRoute } from "./features/user-portal/user-portal-route";
import "./styles.css";

function PortalOnlyApp() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const mode = normalizedPath === "/portal/register" ? "register" : "login";
  return <UserPortalRoute mode={mode} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PortalOnlyApp />
  </StrictMode>
);
