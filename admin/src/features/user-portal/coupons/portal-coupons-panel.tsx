import { useEffect, useMemo, useState } from "react";
import {
  PortalCouponClientError,
  type PortalCoupon,
  type PortalCouponClient,
  type PortalCouponStatus,
} from "./coupon-client";
import { COUPON_COPY } from "./coupon-copy";
import { CouponFirstVisitHint } from "./coupon-first-visit-hint";
import "./portal-coupons.styles.css";

type Props = {
  locale: "zh" | "en";
  couponClient?: PortalCouponClient | null;
  sessionRef?: string | null;
  sessionGeneration?: number;
  onSessionInvalid?: () => void;
  accountKey?: string | null;
};

const t = (locale: Props["locale"], zh: string, en: string) => (locale === "zh" ? zh : en);
const tx = (locale: Props["locale"], pair: readonly [string, string]) => t(locale, pair[0], pair[1]);


function formatDate(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function benefit(locale: Props["locale"], coupon: PortalCoupon) {
  if (coupon.kind === "percent") {
    const pct = coupon.value / 100;
    const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/u, "");
    return t(locale, `立减 ${text}%`, `${text}% off`);
  }
  return t(locale, `立减 ${coupon.value} Coins`, `${coupon.value} Coins off`);
}

function validity(locale: Props["locale"], coupon: PortalCoupon) {
  return t(locale, `可用至 ${formatDate(coupon.usableUntil)}`, `Usable until ${formatDate(coupon.usableUntil)}`);
}

// The redeem code is never shown after redemption; the card shows the coupon
// ref and value only, and checkout applies coupons automatically.
function CouponCard({ locale, coupon }: { locale: Props["locale"]; coupon: PortalCoupon }) {
  return (
    <article className="pc-card" data-status={coupon.status} aria-label={coupon.ref}>
      <div className="pc-card-head">
        <strong className="pc-benefit">{benefit(locale, coupon)}</strong>
        {coupon.status !== "available" ? <span className="pc-badge">{tx(locale, COUPON_COPY.tabs[coupon.status])}</span> : null}
      </div>
      <div className="pc-code-row">
        <span className="pc-label">{t(locale, "券号", "Coupon")}</span>
        <code className="pc-code">{coupon.ref}</code>
      </div>
      <dl className="pc-meta">
        <div><dt>{t(locale, "适用流量包", "Applies to")}</dt>
          <dd className="pc-skus">
            {coupon.allSkus ? <span className="pc-chip">{t(locale, "全部住宅流量包", "All residential packs")}</span> : null}
            {!coupon.allSkus ? coupon.skus.map(sku => <span key={sku.skuId} className="pc-chip">{sku.sizeCode}</span>) : null}
          </dd></div>
        <div><dt>{t(locale, "有效期", "Valid")}</dt><dd>{validity(locale, coupon)}</dd></div>
        {coupon.status === "used" ? <>
          <div><dt>{t(locale, "订单", "Order")}</dt><dd className="pc-mono">{coupon.consumedOrderRef}</dd></div>
          <div><dt>{t(locale, "抵扣", "Saved")}</dt><dd>{coupon.consumedAmount} Coins</dd></div>
        </> : null}
      </dl>
    </article>
  );
}

export function PortalCouponsPanel({ locale, couponClient, sessionRef, sessionGeneration, onSessionInvalid, accountKey }: Props) {
  const [tab, setTab] = useState<PortalCouponStatus>("available");
  const [items, setItems] = useState<PortalCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!couponClient || !sessionRef) { setItems([]); return; }
    const controller = new AbortController();
    setItems(null); setError(null);
    couponClient.listCoupons({ sessionRef, signal: controller.signal })
      .then(list => { if (!controller.signal.aborted) setItems(list.items); })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (reason instanceof PortalCouponClientError && reason.code === "invalid_session") { onSessionInvalid?.(); return; }
        if (reason instanceof PortalCouponClientError && reason.code === "not_found") { setItems([]); return; }
        setError(t(locale, "优惠券暂时无法加载，请稍后重试。", "Coupons couldn't load. Try again later."));
      });
    return () => controller.abort();
  }, [couponClient, sessionRef, sessionGeneration, locale, onSessionInvalid]);

  const groups = useMemo(() => {
    const out: Record<PortalCouponStatus, PortalCoupon[]> = { available: [], used: [], expired: [] };
    for (const item of items ?? []) out[item.status].push(item);
    return out;
  }, [items]);
  const tabs: PortalCouponStatus[] = ["available", "used", "expired"];
  const shown = groups[tab];

  return (
    <section className="pc-root" aria-labelledby="pc-title">
      <div className="pc-sky" aria-hidden="true"><div className="pc-stars" /><div className="pc-glow" /></div>
      <div className="pc-inner">
        <header className="pc-header">
          <h2 id="pc-title" className="pc-visually-hidden">{tx(locale, COUPON_COPY.couponsTitle)}</h2>
        </header>
        <CouponFirstVisitHint locale={locale} accountKey={accountKey} />
        <div className="pc-tabs" role="tablist" aria-label={tx(locale, COUPON_COPY.couponsTitle)}>
          {tabs.map(id => (
            <button key={id} type="button" role="tab" id={`pc-tab-${id}`} aria-selected={tab === id}
              aria-controls="pc-tabpanel" className="pc-tab" onClick={() => setTab(id)}>
              {tx(locale, COUPON_COPY.tabs[id])}
              <span className="pc-count">{items ? groups[id].length : "–"}</span>
            </button>
          ))}
        </div>
        <div id="pc-tabpanel" role="tabpanel" aria-labelledby={`pc-tab-${tab}`} className="pc-list">
          {error ? <p className="pc-empty" role="alert">{error}</p>
            : items === null ? <p className="pc-empty">{t(locale, "加载中…", "Loading…")}</p>
              : shown.length === 0 ? <p className="pc-empty">{tx(locale, COUPON_COPY.empty[tab])}</p>
                : shown.map(coupon => <CouponCard key={coupon.id} locale={locale} coupon={coupon} />)}
        </div>
      </div>
    </section>
  );
}
