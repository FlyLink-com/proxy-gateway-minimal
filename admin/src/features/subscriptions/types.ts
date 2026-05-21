export type SubscriptionStatus = "active" | "expiring" | "expired" | "disabled";

export type NodeCredentialMode = "shared-node" | "per-user-password" | "per-user-port";

export type SubscriptionTenant = {
  id: string;
  displayName: string;
  status: SubscriptionStatus;
  expiresAt: string;
  note: string;
  nodeName: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  credentialMode: NodeCredentialMode;
};

export type CreateSubscriptionInput = {
  displayName: string;
  expiresAt: string;
  note: string;
};

export type RenewSubscriptionInput = {
  id: string;
  expiresAt: string;
};

export type ResetTokenResult = {
  tenantId: string;
  subscriptionUrl: string;
  tokenPrefix: string;
};
