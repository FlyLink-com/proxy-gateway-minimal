import type { SubscriptionTenant } from "./types";

export const defaultNode = {
  id: "node_aws_singapore",
  name: "aws-singapore",
  region: "Singapore",
  host: "52.221.198.76.sslip.io",
  port: 18388,
  method: "chacha20-ietf-poly1305",
  credentialMode: "shared-node" as const,
  status: "online"
};

export const initialSubscriptions: SubscriptionTenant[] = [
  {
    id: "tenant_alpha",
    displayName: "alpha-phone",
    status: "active",
    expiresAt: "2026-06-21T00:00:00.000Z",
    note: "iPhone Karing test user",
    nodeName: "aws-singapore",
    tokenPrefix: "sub_a8f2",
    lastUsedAt: "2026-05-21T18:30:00.000Z",
    credentialMode: "shared-node"
  },
  {
    id: "tenant_beta",
    displayName: "beta-android",
    status: "expiring",
    expiresAt: "2026-05-25T00:00:00.000Z",
    note: "Android Karing validation",
    nodeName: "aws-singapore",
    tokenPrefix: "sub_b91c",
    lastUsedAt: null,
    credentialMode: "shared-node"
  },
  {
    id: "tenant_disabled",
    displayName: "disabled-demo",
    status: "disabled",
    expiresAt: "2026-06-01T00:00:00.000Z",
    note: "Disabled state example",
    nodeName: "aws-singapore",
    tokenPrefix: "sub_d421",
    lastUsedAt: "2026-05-20T12:00:00.000Z",
    credentialMode: "shared-node"
  }
];
