import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PortalCoinCommerceClient } from "./api-contract";

type Identity = {
  commerceClient: PortalCoinCommerceClient | null;
  sessionRef: string | null;
  sessionGeneration: number;
};
const RotationContext = createContext<(Identity & { pending: Map<string, string> }) | null>(null);

// Only in-memory idempotency references, never subscription URLs. The authenticated
// Portal owns this scope so closing a dialog or changing tabs cannot lose an
// uncertain reset. Replacing the client/session/generation discards the old map.
export function DataPackRotationProvider({ commerceClient, sessionRef, sessionGeneration, children }:
  Identity & { children: ReactNode }) {
  const value = useMemo(() => ({ commerceClient, sessionRef, sessionGeneration, pending: new Map<string, string>() }),
    [commerceClient, sessionRef, sessionGeneration]);
  return <RotationContext.Provider value={value}>{children}</RotationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- provider and its scoped hook share a private context
export function useDataPackPendingRotations({ commerceClient, sessionRef, sessionGeneration }: Identity) {
  const context = useContext(RotationContext);
  const local = useMemo(() => ({ commerceClient, sessionRef, sessionGeneration, pending: new Map<string, string>() }),
    [commerceClient, sessionRef, sessionGeneration]);
  return context?.commerceClient === commerceClient && context.sessionRef === sessionRef
    && context.sessionGeneration === sessionGeneration ? context.pending : local.pending;
}
