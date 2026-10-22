import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CommerceQuery, SettlementSnapshot, UserCommerceClient } from "./features/user-commerce/user-commerce-client";
import { UserCommerceWorkspace } from "./features/user-commerce/user-commerce-workspace";

const orders = [
  { orderRef: "R-1001", accountId: "acct_sample", kind: "recharge" as const, status: "已入账", amountLabel: "20 CNY", createdAt: "2026-10-02T00:00:00Z" },
  { orderRef: "S-2001", accountId: "acct_invited", kind: "subscription" as const, status: "已完成", amountLabel: "基础月度", createdAt: "2026-10-04T00:00:00Z" }
];
const entries = [
  { entryRef: "led-1", accountId: "acct_sample", occurredAt: "2026-10-02T00:00:00Z", direction: "credit" as const, title: "首充", coins: "200" },
  { entryRef: "led-2", accountId: "acct_sample", occurredAt: "2026-10-05T00:00:00Z", direction: "debit" as const, title: "奖励划扣", coins: "20" }
];
const users = [
  { accountId: "acct_invited", registeredAt: "2026-10-03T00:00:00Z", linkLabel: "样例链接", firstRecharge: true }
];

function matches(query: CommerceQuery, accountId: string, day: string) {
  return accountId === query.accountId && day.slice(0, 10) >= query.from && day.slice(0, 10) <= query.to;
}

function Preview() {
  const [settlement, setSettlement] = useState<SettlementSnapshot>({ ratePercent: 20, effectiveAt: "2026-09-08", availableRewardCoins: "80" });
  const client = useMemo<UserCommerceClient>(() => ({
    async readOrders(query) { return orders.filter((row) => matches(query, row.accountId, row.createdAt)); },
    async readLedger(query) { return entries.filter((row) => matches(query, row.accountId, row.occurredAt)); },
    async readShareUsers(query) { return users.filter((row) => matches(query, "acct_sample", row.registeredAt)); },
    async readSettlement() { return settlement; },
    async updateRate(input) {
      const next = { ...settlement, ratePercent: input.ratePercent, effectiveAt: input.effectiveAt };
      setSettlement(next);
      return next;
    },
    async clawback(input) {
      const remaining = String(Math.max(0, Number(settlement.availableRewardCoins) - Number(input.coins)));
      const next = { ...settlement, availableRewardCoins: remaining };
      setSettlement(next);
      return { clawbackRef: "claw-sample", settlement: next };
    }
  }), [settlement]);
  return (
    <main style={{ maxWidth: 1080, margin: "24px auto", fontFamily: "Segoe UI, sans-serif" }}>
      <p style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 12, padding: 12 }}>
        本地样例。保存只留在这个预览进程里，不会写入服务器或生产账本。
      </p>
      <h1>用户商业</h1>
      <UserCommerceWorkspace client={client} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Preview /></StrictMode>);
