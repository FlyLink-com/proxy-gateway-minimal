import { useEffect, useState } from "react";
import {
  PortalCouponClientError,
  type PortalCheckoutQuote,
  type PortalCheckoutSelection,
  type PortalCouponClient,
  type PortalResiSku,
} from "./coupon-client";
import { COUPON_COPY } from "./coupon-copy";
import "./portal-coupons.styles.css";

type Props = {
  locale: "zh" | "en";
  couponClient?: PortalCouponClient | null;
  sessionRef?: string | null;
  onSessionInvalid?: () => void;
};

const t = (locale: Props["locale"], zh: string, en: string) => (locale === "zh" ? zh : en);
const tx = (locale: Props["locale"], pair: readonly [string, string]) => (locale === "zh" ? pair[0] : pair[1]);

function valueText(locale: Props["locale"], kind: "percent" | "fixed", value: number) {
  if (kind === "percent") {
    const pct = value / 100;
    const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/u, "");
    return t(locale, `立减 ${text}%`, `${text}% off`);
  }
  return t(locale, `立减 ${value} Coins`, `${value} Coins off`);
}

// Minimal residential pack checkout: the server auto-applies the buyer's best
// coupon; the buyer may switch or opt out. Redeem codes never appear here.
export function PortalCheckoutPanel({ locale, couponClient, sessionRef, onSessionInvalid }: Props) {
  const [skus, setSkus] = useState<PortalResiSku[] | null>(null);
  const [skuId, setSkuId] = useState<string | null>(null);
  const [selection, setSelection] = useState<PortalCheckoutSelection>(undefined);
  const [quote, setQuote] = useState<PortalCheckoutQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const c = COUPON_COPY.checkout;

  const handle = (reason: unknown) => {
    if (reason instanceof PortalCouponClientError && reason.code === "invalid_session") { onSessionInvalid?.(); return; }
    if (reason instanceof PortalCouponClientError && reason.code === "coupon_inactive") { setSelection(undefined); return; }
    setError(tx(locale, c.failed));
  };

  useEffect(() => {
    if (!couponClient?.listSkus || !sessionRef) { setSkus([]); return; }
    const controller = new AbortController();
    couponClient.listSkus({ sessionRef, signal: controller.signal })
      .then(list => { if (!controller.signal.aborted) { setSkus(list); setSkuId(current => current ?? list[0]?.id ?? null); } })
      .catch(reason => { if (!controller.signal.aborted) handle(reason); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on client/session only
  }, [couponClient, sessionRef]);

  useEffect(() => {
    if (!couponClient?.checkoutQuote || !sessionRef || !skuId) return;
    const controller = new AbortController();
    setError(null);
    couponClient.checkoutQuote({ sessionRef, skuId, couponId: selection, signal: controller.signal })
      .then(next => { if (!controller.signal.aborted) setQuote(next); })
      .catch(reason => { if (!controller.signal.aborted) handle(reason); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requote on selection only
  }, [couponClient, sessionRef, skuId, selection]);

  const chosenId = quote?.coupon?.id ?? null;
  return (
    <section className="pc-root" aria-labelledby="pc-checkout-title">
      <div className="pc-sky" aria-hidden="true"><div className="pc-stars" /><div className="pc-glow" /></div>
      <div className="pc-inner">
        <h2 id="pc-checkout-title" className="pc-visually-hidden">{tx(locale, c.title)}</h2>
        {skus === null ? <p className="pc-empty">{t(locale, "加载中…", "Loading…")}</p>
          : skus.length === 0 ? <p className="pc-empty">{tx(locale, c.noSkus)}</p> : (
            <div className="pc-sku-row" role="radiogroup" aria-label={tx(locale, c.pack)}>
              {skus.map(sku => (
                <button key={sku.id} type="button" role="radio" aria-checked={sku.id === skuId} className="pc-sku"
                  onClick={() => { setSkuId(sku.id); setSelection(undefined); }}>
                  <strong>{sku.sizeCode}</strong>
                  <span>{t(locale, `${sku.durationDays} 天`, `${sku.durationDays} days`)} · {sku.listPrice} Coins</span>
                </button>
              ))}
            </div>
          )}
        {error ? <p className="pc-redeem-error" role="alert">{error}</p> : null}
        {quote && quote.skuId === skuId ? (
          <div className="pc-checkout">
            <dl className="pc-price" aria-label={tx(locale, c.summary)}>
              <div><dt>{tx(locale, c.list)}</dt><dd>{quote.listPrice} Coins</dd></div>
              <div><dt>{tx(locale, c.deduction)}{quote.coupon ? <small> · {quote.coupon.ref}</small> : null}</dt>
                <dd>{quote.deduction > 0 ? `−${quote.deduction}` : "0"} Coins</dd></div>
              <div className="pc-price-total"><dt>{tx(locale, c.final)}</dt><dd>{quote.finalPrice} Coins</dd></div>
            </dl>
            <fieldset className="pc-options">
              <legend>{tx(locale, c.coupon)}</legend>
              {quote.options.map(option => (
                <label key={option.id} className="pc-option" data-checked={option.id === chosenId}>
                  <input type="radio" name="pc-coupon" checked={option.id === chosenId} onChange={() => setSelection(option.id)} />
                  <span className="pc-option-main"><strong>{valueText(locale, option.kind, option.value)}</strong>
                    <small>{option.ref}{option.best ? ` · ${tx(locale, c.best)}` : ""}</small></span>
                  <span className="pc-option-save">−{option.deduction}</span>
                </label>
              ))}
              <label className="pc-option" data-checked={chosenId === null}>
                <input type="radio" name="pc-coupon" checked={chosenId === null} onChange={() => setSelection(null)} />
                <span className="pc-option-main"><strong>{tx(locale, c.none)}</strong>
                  {quote.options.length === 0 ? <small>{tx(locale, c.noCoupons)}</small> : null}</span>
              </label>
            </fieldset>
            <button type="button" className="pc-copy pc-redeem-submit" disabled>{tx(locale, c.pay)}</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
