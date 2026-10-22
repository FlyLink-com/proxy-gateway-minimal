import { useState } from "react";
import { createUserCommerceClient, UserCommerceError, type CommerceOrder, type LedgerEntry, type SettlementSnapshot, type ShareUser, type UserCommerceClient } from "./user-commerce-client";
import "./user-commerce-workspace.styles.css";

type Tab = "orders" | "ledger" | "shareUsers" | "settlement";
type Confirmation = { kind: "rate"; ratePercent: number; effectiveAt: string } | { kind: "clawback"; accountId: string; coins: string; reason: string } | null;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "orders", label: "订单查询" },
  { id: "ledger", label: "流水" },
  { id: "shareUsers", label: "分享用户" },
  { id: "settlement", label: "分享结算" }
];

const KIND_LABEL = { recharge: "充值", subscription: "订阅" } as const;
const DIRECTION_LABEL = { credit: "入账", debit: "出账" } as const;

function message(error: unknown) {
  if (error instanceof UserCommerceError && error.code === "unavailable") return "用户商业管理接口尚未启用。";
  if (error instanceof UserCommerceError && error.code === "conflict") return "结算正在处理，请稍后再试。";
  if (error instanceof UserCommerceError && error.code === "invalid") return "查询条件或提交内容无效。";
  return "暂时无法读取，请稍后再试。";
}

export function UserCommerceWorkspace({
  client,
  notice,
  onSessionExpired
}: {
  client?: UserCommerceClient;
  notice?: string;
  onSessionExpired?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("orders");
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("2026-10-01");
  const [to, setTo] = useState("2026-10-22");
  const [status, setStatus] = useState("输入用户编号和时间后查询。此页面不会改动生产数据，除非后续接入管理接口。");
  const [orders, setOrders] = useState<CommerceOrder[] | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [users, setUsers] = useState<ShareUser[] | null>(null);
  const [settlement, setSettlement] = useState<SettlementSnapshot | null>(null);
  const [ratePercent, setRatePercent] = useState("20");
  const [effectiveAt, setEffectiveAt] = useState("2026-10-23");
  const [clawAccount, setClawAccount] = useState("");
  const [clawCoins, setClawCoins] = useState("");
  const [clawReason, setClawReason] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busy, setBusy] = useState(false);
  const commerce = client ?? createUserCommerceClient({
    fetcher: async (input, init) => {
      const response = await fetch(input, init);
      if (response.status === 401 && !init?.signal?.aborted) onSessionExpired?.();
      return response;
    }
  });

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(false);
    }
  }

  function readFilters() {
    return { accountId: accountId.trim(), from, to };
  }

  return (
    <div className="user-commerce" data-testid="user-commerce-workspace">
      {notice ? <p className="user-commerce-note">{notice}</p> : null}
      <section className="user-commerce-card" aria-label="查询条件">
        <div className="user-commerce-filters">
          <label>用户编号<input value={accountId} onChange={(event) => setAccountId(event.target.value)} /></label>
          <label>开始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>结束日期<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button className="user-commerce-primary" type="button" disabled={busy} onClick={() => void run(async () => {
            const query = readFilters();
            if (tab === "orders") {
              const rows = await commerce.readOrders(query);
              setOrders(rows);
              setStatus(rows.length ? `已读取 ${rows.length} 笔订单。` : "这个时间范围内没有订单。");
            } else if (tab === "ledger") {
              const rows = await commerce.readLedger(query);
              setEntries(rows);
              setStatus(rows.length ? `已读取 ${rows.length} 条流水。` : "这个时间范围内没有流水。");
            } else if (tab === "shareUsers") {
              const rows = await commerce.readShareUsers(query);
              setUsers(rows);
              setStatus(rows.length ? `已读取 ${rows.length} 个通过分享链接注册的用户。` : "这个时间范围内没有分享注册用户。");
            } else {
              const next = await commerce.readSettlement();
              setSettlement(next);
              setRatePercent(String(next.ratePercent));
              setStatus("已读取当前分享结算。");
            }
          })}>查询</button>
        </div>
        <p className="user-commerce-note">{tab === "shareUsers" ? "这里的用户编号是分享人。结果是通过该分享链接注册的用户。" : tab === "settlement" ? "分享结算读取当前比例，不按用户编号过滤。" : "按用户编号和日期查询该用户的订单或流水。"}</p>
        <p className="user-commerce-status" role="status">{status}</p>
      </section>
      <div className="user-commerce-tabs" role="tablist" aria-label="用户商业">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>
      {tab === "orders" ? <OrderTable rows={orders} /> : null}
      {tab === "ledger" ? <LedgerTable rows={entries} /> : null}
      {tab === "shareUsers" ? <ShareTable rows={users} /> : null}
      {tab === "settlement" ? (
        <section className="user-commerce-card" aria-label="分享结算">
          <p>{settlement ? `当前比例 ${settlement.ratePercent}%，生效日期 ${settlement.effectiveAt}，可划扣奖励 ${settlement.availableRewardCoins} Coins。` : "尚未读取结算。"}</p>
          <p className="user-commerce-note">新比例只从生效日期起用于之后的分享奖励，不改已经入账的 Coins。</p>
          <div className="user-commerce-form">
            <label>结算比例（%）<input inputMode="decimal" value={ratePercent} onChange={(event) => setRatePercent(event.target.value)} /></label>
            <label>生效日期<input type="date" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} /></label>
            <button type="button" disabled={busy} onClick={() => {
              const rate = Number(ratePercent);
              if (!Number.isFinite(rate) || rate < 0 || rate > 100 || Math.round(rate * 10) !== rate * 10 || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveAt)) {
                setStatus("结算比例需为 0 到 100，最多一位小数。");
                return;
              }
              setConfirmation({ kind: "rate", ratePercent: rate, effectiveAt });
            }}>准备更新比例</button>
          </div>
          <h3>奖励 Coins 划扣</h3>
          <div className="user-commerce-form">
            <label>用户编号<input value={clawAccount} onChange={(event) => setClawAccount(event.target.value)} /></label>
            <label>划扣 Coins<input inputMode="numeric" value={clawCoins} onChange={(event) => setClawCoins(event.target.value)} /></label>
            <label>原因<input value={clawReason} onChange={(event) => setClawReason(event.target.value)} /></label>
            <button type="button" disabled={busy} onClick={() => {
              if (!clawAccount.trim() || !/^[1-9]\d{0,11}$/.test(clawCoins) || !clawReason.trim()) {
                setStatus("划扣需要用户编号、正整数 Coins 和原因。");
                return;
              }
              setConfirmation({ kind: "clawback", accountId: clawAccount.trim(), coins: clawCoins, reason: clawReason.trim() });
            }}>准备划扣</button>
          </div>
        </section>
      ) : null}
      {confirmation ? (
        <div className="user-commerce-dialog" role="dialog" aria-label="确认用户商业操作">
          <p>{confirmation.kind === "rate"
            ? `确认把之后的分享结算比例改为 ${confirmation.ratePercent}%，生效日期 ${confirmation.effectiveAt}。已经入账的奖励不变。`
            : `确认从 ${confirmation.accountId} 划扣 ${confirmation.coins} 奖励 Coins。原因：${confirmation.reason}。`}</p>
          <div className="user-commerce-form">
            <button type="button" onClick={() => setConfirmation(null)}>取消</button>
            <button className="user-commerce-primary" type="button" disabled={busy} onClick={() => void run(async () => {
              const pending = confirmation;
              setConfirmation(null);
              if (pending.kind === "rate") {
                const next = await commerce.updateRate({ ratePercent: pending.ratePercent, effectiveAt: pending.effectiveAt });
                setSettlement(next);
                setStatus("结算比例已提交。它会从生效日期起用于之后的分享奖励。");
              } else {
                const result = await commerce.clawback({ accountId: pending.accountId, coins: pending.coins, reason: pending.reason });
                setSettlement(result.settlement);
                setStatus("奖励 Coins 划扣已提交。");
              }
            })}>确认提交</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderTable({ rows }: { rows: CommerceOrder[] | null }) {
  if (!rows) return <p className="user-commerce-note">订单会在查询后显示。</p>;
  if (!rows.length) return <p>没有订单。</p>;
  return (
    <table aria-label="订单">
      <thead><tr><th>订单</th><th>用户</th><th>类型</th><th>状态</th><th>金额</th><th>时间</th></tr></thead>
      <tbody>
        {rows.map((row) => <tr key={row.orderRef}><td>{row.orderRef}</td><td>{row.accountId}</td><td>{KIND_LABEL[row.kind]}</td><td>{row.status}</td><td>{row.amountLabel}</td><td>{row.createdAt}</td></tr>)}
      </tbody>
    </table>
  );
}

function LedgerTable({ rows }: { rows: LedgerEntry[] | null }) {
  if (!rows) return <p className="user-commerce-note">流水会在查询后显示。</p>;
  if (!rows.length) return <p>没有流水。</p>;
  return (
    <table aria-label="流水">
      <thead><tr><th>时间</th><th>用户</th><th>方向</th><th>名目</th><th>Coins</th></tr></thead>
      <tbody>
        {rows.map((row) => <tr key={row.entryRef}><td>{row.occurredAt}</td><td>{row.accountId}</td><td>{DIRECTION_LABEL[row.direction]}</td><td>{row.title}</td><td>{row.coins}</td></tr>)}
      </tbody>
    </table>
  );
}

function ShareTable({ rows }: { rows: ShareUser[] | null }) {
  if (!rows) return <p className="user-commerce-note">分享注册用户会在查询后显示。</p>;
  if (!rows.length) return <p>没有分享注册用户。</p>;
  return (
    <table aria-label="分享用户">
      <thead><tr><th>用户</th><th>注册时间</th><th>分享链接</th><th>首充</th></tr></thead>
      <tbody>
        {rows.map((row) => <tr key={row.accountId}><td>{row.accountId}</td><td>{row.registeredAt}</td><td>{row.linkLabel}</td><td>{row.firstRecharge ? "已首充" : "未首充"}</td></tr>)}
      </tbody>
    </table>
  );
}
