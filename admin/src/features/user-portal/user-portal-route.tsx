import { useMemo } from "react";
import { createHttpUserPortalClient } from "./user-portal-client";
import { UserPortalPage } from "./user-portal-page";
import { UserRegistrationPage } from "./user-registration-page";

type UserPortalRouteProps = {
  mode: "login" | "register";
};

export function UserPortalRoute({ mode }: UserPortalRouteProps) {
  const portalClient = useMemo(() => createHttpUserPortalClient(), []);

  if (mode === "register") {
    return <UserRegistrationPage portalClient={portalClient} />;
  }

  return <UserPortalPage portalClient={portalClient} />;
}
