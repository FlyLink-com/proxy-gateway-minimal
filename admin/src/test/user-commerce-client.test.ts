import { describe, expect, it, vi } from "vitest";
import { createUserCommerceClient, UserCommerceError } from "../features/user-commerce/user-commerce-client";

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

const settlement = { ratePercent: 20, effectiveAt: "2026-10-23", availableRewardCoins: "80" };

describe("user commerce client", () => {
  it("reads orders for one account and date range", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL) => json({ orders: [{
      orderRef: "R-1001", accountId: "acct_sample", kind: "recharge", status: "已入账", amountLabel: "20 CNY", createdAt: "2026-10-02T00:00:00Z"
    }] }));
    const client = createUserCommerceClient({ fetcher });
    await expect(client.readOrders({ accountId: "acct_sample", from: "2026-10-01", to: "2026-10-22" })).resolves.toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/user-commerce/orders?accountId=acct_sample&from=2026-10-01&to=2026-10-22");
  });

  it("maps a missing admin route to unavailable", async () => {
    const client = createUserCommerceClient({ fetcher: vi.fn(() => json({ error: "not_found" }, 404)) });
    await expect(client.readLedger({ accountId: "acct_sample", from: "2026-10-01", to: "2026-10-22" })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("submits a future settlement rate and a reward clawback", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return json({ clawbackRef: "claw-1", settlement: { ...settlement, availableRewardCoins: "60" } });
      const body = JSON.parse(String(init?.body)) as { ratePercent: number; effectiveAt: string };
      return json({ ...settlement, ratePercent: body.ratePercent, effectiveAt: body.effectiveAt });
    });
    const client = createUserCommerceClient({ fetcher });
    await expect(client.updateRate({ ratePercent: 15.5, effectiveAt: "2026-10-23" })).resolves.toMatchObject({ ratePercent: 15.5, effectiveAt: "2026-10-23" });
    await expect(client.clawback({ accountId: "acct_sample", coins: "20", reason: "重复发放" })).resolves.toMatchObject({ clawbackRef: "claw-1" });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["PUT", "POST"]);
  });

  it("rejects an inverted date range before calling the network", async () => {
    const fetcher = vi.fn();
    const client = createUserCommerceClient({ fetcher });
    await expect(client.readShareUsers({ accountId: "acct_sample", from: "2026-10-22", to: "2026-10-01" })).rejects.toBeInstanceOf(UserCommerceError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
