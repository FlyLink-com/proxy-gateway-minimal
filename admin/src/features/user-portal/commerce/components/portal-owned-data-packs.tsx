import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PortalCoinCommerceClient, PortalCoinOrderPage } from "../api-contract";
import { PortalCoinCommerceClientError } from "../commerce-client";
import { CoinsDialogFrame } from "./product-detail-dialog";
import { PortalDataPackSubscription } from "./portal-data-pack-subscription";

type Props = {
  commerceClient: PortalCoinCommerceClient;
  sessionRef: string;
  sessionGeneration: number;
  refreshRevision: number;
  locale: "zh" | "en";
  theme: "light" | "dark";
  onSessionInvalid?: () => void;
};
type Cursor = PortalCoinOrderPage["nextCursor"];
type OwnedPack = { orderRef: string; title: { zh: string; en: string }; trafficGb: number | null };

// Owner-scoped history is the authority, not the transient last checkout. Keep
// only safe summaries here; credentials are read only while a delivery is open.
export function PortalOwnedDataPacks({
  commerceClient, sessionRef, sessionGeneration, refreshRevision, locale, theme, onSessionInvalid
}: Props) {
  const zh = locale === "zh";
  const scope = useMemo(() => ({ commerceClient, sessionRef, sessionGeneration, refreshRevision }),
    [commerceClient, sessionRef, sessionGeneration, refreshRevision]);
  const activeScope = useRef<typeof scope | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const cursors = useRef(new Set<string>());
  const onSessionInvalidRef = useRef(onSessionInvalid);
  const focusRef = useRef<HTMLButtonElement | null>(null);
  const [result, setResult] = useState<{
    scope: typeof scope; packs: OwnedPack[]; cursor: Cursor; busy: boolean; error: boolean;
  } | null>(null);
  const [selection, setSelection] = useState<{ scope: typeof scope; orderRef: string } | null>(null);
  const current = result?.scope === scope ? result : null;
  const selectedOrderRef = selection?.scope === scope ? selection.orderRef : null;

  useLayoutEffect(() => { onSessionInvalidRef.current = onSessionInvalid; });
  useLayoutEffect(() => {
    generation.current += 1;
    activeScope.current = scope;
    inFlight.current = false;
    cursors.current = new Set();
    setSelection(null);
    return () => { activeScope.current = null; generation.current += 1; };
  }, [scope]);

  const read = useCallback(async (cursor: Cursor) => {
    if (activeScope.current !== scope || inFlight.current) return;
    const requestGeneration = generation.current;
    const isCurrent = () => activeScope.current === scope && requestGeneration === generation.current;
    inFlight.current = true;
    setResult((previous) => ({ scope, packs: cursor && previous?.scope === scope ? previous.packs : [],
      cursor, busy: true, error: false }));
    try {
      // One bounded page per user action: do not scan all account history on mount.
      const page = await commerceClient.listOrders(cursor ? { sessionRef, limit: 25, ...cursor }
        : { sessionRef, limit: 25 });
      if (!isCurrent()) return;
      const nextKey = page.nextCursor ? JSON.stringify(page.nextCursor) : null;
      if (nextKey && cursors.current.has(nextKey)) throw new Error("order_cursor_did_not_advance");
      if (nextKey) cursors.current.add(nextKey);
      const packs = page.orders.filter((order) => order.offer.category === "data_pack"
        && order.paymentStatus === "captured" && order.fulfillment.status === "delivered")
        .map((order) => ({ orderRef: order.orderRef,
          title: { zh: order.offer.title.zh, en: order.offer.title.en }, trafficGb: order.offer.delivery.trafficGb }));
      setResult((previous) => {
        const merged = new Map((cursor && previous?.scope === scope ? previous.packs : [])
          .map((pack) => [pack.orderRef, pack]));
        for (const pack of packs) merged.set(pack.orderRef, pack);
        return { scope, packs: [...merged.values()], cursor: page.nextCursor, busy: false, error: false };
      });
    } catch (error) {
      if (!isCurrent()) return;
      setResult((previous) => ({ scope, packs: previous?.scope === scope ? previous.packs : [],
        cursor, busy: false, error: true }));
      if (error instanceof PortalCoinCommerceClientError && error.code === "commerce_session_invalid") {
        onSessionInvalidRef.current?.();
      }
    } finally {
      if (isCurrent()) inFlight.current = false;
    }
  }, [scope, commerceClient, sessionRef]);
  useEffect(() => { void read(null); }, [read]);

  return <section className="portal-marketplace-group portal-owned-data-packs"
    aria-label={zh ? "已拥有的流量包" : "Owned data packs"}>
    <h2>{zh ? "已拥有的流量包" : "Owned data packs"}</h2>
    {current?.packs.length ? <ul className="portal-owned-data-packs__list">
      {current.packs.map((pack) => <li key={pack.orderRef}>
        <div><strong>{pack.title[locale]}</strong>
          <span>{pack.trafficGb} GB · {zh ? "用完即止 · 不过期" : "Until exhausted · No expiry"}</span></div>
        <button type="button" aria-label={`${zh ? "查看流量包" : "View data pack"}: ${pack.title[locale]}`}
          onClick={(event) => { focusRef.current = event.currentTarget; setSelection({ scope, orderRef: pack.orderRef }); }}>
          {zh ? "查看" : "View"}
        </button>
      </li>)}
    </ul> : null}
    {!current || current.busy ? <p role="status">{zh ? "正在读取已拥有的流量包…" : "Loading owned data packs…"}</p> : null}
    {current && !current.busy && !current.error && current.packs.length === 0 && !current.cursor
      ? <p>{zh ? "暂无已拥有的流量包。" : "No owned data packs yet."}</p> : null}
    {current?.cursor ? <p role="status">{zh ? "还有订单未加载，可继续查找更早的流量包。" : "More orders remain. Load more to find earlier data packs."}</p> : null}
    {current?.error ? <p role="alert">{zh ? "流量包列表读取失败，请重试。" : "Could not read owned packs. Please retry."}</p> : null}
    {current && (current.error || current.cursor) ? <button type="button" disabled={current.busy}
      onClick={() => void read(current.cursor)}>
      {current.error ? (zh ? "重试读取列表" : "Retry reading orders") : (zh ? "加载更多订单" : "Load more orders")}
    </button> : null}
    {selectedOrderRef ? <div className="portal-coins-dialog-theme" data-portal-theme={theme}>
      <CoinsDialogFrame panelClassName="portal-owned-data-packs__dialog"
        title={zh ? "订阅交付" : "Subscription delivery"} closeLabel={zh ? "关闭" : "Close"}
        escapeCloseEnabled onRequestClose={() => setSelection(null)}
        onRestoreFocus={() => focusRef.current?.focus()}>
        <PortalDataPackSubscription key={selectedOrderRef} commerceClient={commerceClient}
          sessionRef={sessionRef} sessionGeneration={sessionGeneration} orderRef={selectedOrderRef}
          locale={locale} theme={theme} autoLoad
          onSessionInvalid={() => { setSelection(null); onSessionInvalidRef.current?.(); }} />
      </CoinsDialogFrame>
    </div> : null}
  </section>;
}
