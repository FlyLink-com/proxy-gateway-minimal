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
  tenant: SubscriptionTenant;
  subscriptionUrl: string;
};

export type CreateSubscriptionResult = {
  tenant: SubscriptionTenant;
  subscriptionUrl: string;
};

export type TempLinkResult = {
  tenantId: string;
  tokenPrefix: string;
  expiresAt: string;
  subscriptionUrl: string;
};

export type SubscriptionNode = {
  id: string;
  name: string;
  status: string;
};

export type SubscriptionOverview = {
  ok: boolean;
  total: number;
  active: number;
  expiring: number;
  expired: number;
  disabled: number;
  nodes: SubscriptionNode[];
};
