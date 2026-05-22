import { initialSubscriptions } from "./mock-data";
import type {
  CreateSubscriptionInput,
  RenewSubscriptionInput,
  ResetTokenResult,
  SubscriptionTenant
} from "./types";

export function createMockSubscriptionStore(seed = initialSubscriptions) {
  let rows = seed.map((row) => ({ ...row }));
  let sequence = 0;

  function nextId(prefix: string) {
    sequence += 1;
    return `${prefix}_${String(sequence).padStart(4, "0")}`;
  }

  function tokenPrefix() {
    sequence += 1;
    return `sub_${String(sequence).padStart(4, "0")}`;
  }

  function list() {
    return rows.map((row) => ({ ...row }));
  }

  function create(input: CreateSubscriptionInput) {
    const prefix = tokenPrefix();
    const tenant: SubscriptionTenant = {
      id: nextId("tenant"),
      displayName: input.displayName,
      status: "active",
      expiresAt: input.expiresAt,
      note: input.note,
      nodeName: "aws-singapore",
      tokenPrefix: prefix,
      lastUsedAt: null,
      credentialMode: "shared-node"
    };
    rows = [tenant, ...rows];
    return {
      tenant,
      subscriptionUrl: `https://52.221.198.76.sslip.io/sub/clash.yaml?token=${prefix}_visible_once`
    };
  }

  function renew(input: RenewSubscriptionInput) {
    rows = rows.map((row) =>
      row.id === input.id
        ? { ...row, expiresAt: input.expiresAt, status: "active" }
        : row
    );
    return rows.find((row) => row.id === input.id) ?? null;
  }

  function disable(id: string) {
    rows = rows.map((row) =>
      row.id === id ? { ...row, status: "disabled" } : row
    );
    return rows.find((row) => row.id === id) ?? null;
  }

  function enable(id: string) {
    rows = rows.map((row) =>
      row.id === id ? { ...row, status: "active" } : row
    );
    return rows.find((row) => row.id === id) ?? null;
  }

  function resetToken(id: string): ResetTokenResult | null {
    const prefix = tokenPrefix();
    let found = false;
    rows = rows.map((row) => {
      if (row.id !== id) return row;
      found = true;
      return { ...row, tokenPrefix: prefix };
    });
    if (!found) return null;
    const tenant = rows.find((row) => row.id === id);
    return tenant
      ? {
          tenant,
          subscriptionUrl: `https://52.221.198.76.sslip.io/sub/clash.yaml?token=${prefix}_visible_once`
        }
      : null;
  }

  return { list, create, renew, disable, enable, resetToken };
}
