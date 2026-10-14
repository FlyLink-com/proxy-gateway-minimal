import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "../../../shared/public/clipboard";
import {
  PortalCouponClientError,
  type PortalCoupon,
  type PortalCouponClient,
  type PortalCouponStatus,
} from "./coupon-client";
import { COUPON_COPY } from "./coupon-copy";
import "./portal-coupons.styles.css";

type Props = {
  locale: "zh" | "en";
  couponClient?: PortalCouponClient | null;
  sessionRef?: string | null;
  sessionGeneration?: number;
  onSessionInvalid?: () => void;
  onOpenMarketplace?: () => void;
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
  if (coupon.startsAt && coupon.endsAt) return `${formatDate(coupon.startsAt)} – ${formatDate(coupon.endsAt)}`;
  if (coupon.endsAt) return t(locale, `至 ${formatDate(coupon.endsAt)}`, `Until ${formatDate(coupon.endsAt)}`);
  if (coupon.startsAt) return t(locale, `${formatDate(coupon.startsAt)} 起`, `From ${formatDate(coupon.startsAt)}`);
  return t(locale, "长期有效", "No end date");
}

function badge(locale: Props["locale"], coupon: PortalCoupon) {
  switch (coupon.reason) {
    case "upcoming": return t(locale, "未开始", "Not started");
    case "ended": return t(locale, "已结束", "Ended");
    case "paused": return t(locale, "已停用", "Paused");
    case "exhausted": return t(locale, "已领完", "Fully redeemed");
    default: return coupon.status === "used" ? t(locale, "已使用", "Used") : null;
  }
}

function CouponCard({ locale, coupon }: { locale: Props["locale"]; coupon: PortalCoupon }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = useCallback(async () => {
    let ok = false;
    try { ok = await copyText(coupon.code); } catch { ok = false; }
    setCopied(ok);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }, [coupon.code]);
  const tag = badge(locale, coupon);
  const inactive = coupon.status !== "available";
  return (
    <article className="pc-card" data-status={coupon.status} aria-label={coupon.code}>
      <div className="pc-card-head">
        <strong className="pc-benefit">{benefit(locale, coupon)}</strong>
        {tag ? <span className="pc-badge">{tag}</span> : null}
      </div>
      <div className="pc-code-row">
        <span className="pc-label">{t(locale, "券码", "Code")}</span>
        <code className="pc-code">{coupon.code}</code>
        {!inactive ? (
          <button type="button" className="pc-copy" onClick={copy} aria-live="polite">
            {copied ? t(locale, "已复制", "Copied") : t(locale, "复制券码", "Copy code")}
          </button>
        ) : null}
      </div>
      <dl className="pc-meta">
        <div><dt>{t(locale, "适用流量包", "Applies to")}</dt>
          <dd className="pc-skus">
            {coupon.allSkus ? <span className="pc-chip">{t(locale, "全部住宅流量包", "All residential packs")}</span> : null}
            {!coupon.allSkus ? coupon.skus.map(sku => <span key={sku.skuId} className="pc-chip">{sku.sizeCode}</span>) : null}
          </dd></div>
        <div><dt>{t(locale, "有效期", "Valid")}</dt><dd>{validity(locale, coupon)}</dd></div>
        <div><dt>{t(locale, "剩余次数", "Uses left")}</dt>
          <dd>{inactive ? "—" : coupon.remainingUses === null ? t(locale, "不限", "Unlimited") : t(locale, `${coupon.remainingUses} 次`, String(coupon.remainingUses))}</dd></div>
      </dl>
    </article>
  );
}

export function PortalCouponsPanel({ locale, couponClient, sessionRef, sessionGeneration, onSessionInvalid }: Props) {
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
          <h2 id="pc-title" className="pc-visually-hidden">{tx(locale, COUPON_COPY.title)}</h2>
          <p>{tx(locale, COUPON_COPY.lead)}</p>
        </header>
        <div className="pc-tabs" role="tablist" aria-label={tx(locale, COUPON_COPY.title)}>
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
                : shown.map(coupon => <CouponCard key={coupon.code} locale={locale} coupon={coupon} />)}
        </div>
        <div className="pc-notes">
          <section>
            <h3>{tx(locale, COUPON_COPY.howTo.title)}</h3>
            <ol>{COUPON_COPY.howTo.steps.map(([zh, en]) => <li key={en}>{t(locale, zh, en)}</li>)}</ol>
          </section>
          <section>
            <h3>{tx(locale, COUPON_COPY.rules.title)}</h3>
            <ul>{COUPON_COPY.rules.items.map(([zh, en]) => <li key={en}>{t(locale, zh, en)}</li>)}</ul>
          </section>
        </div>
      </div>
    </section>
  );
}
