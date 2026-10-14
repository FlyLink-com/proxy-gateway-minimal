import { useState, type FormEvent } from "react";
import { PortalCouponClientError, type PortalCoupon, type PortalCouponClient } from "./coupon-client";
import { COUPON_COPY } from "./coupon-copy";
import { CouponFirstVisitHint } from "./coupon-first-visit-hint";
import "./portal-coupons.styles.css";

type Props = {
  locale: "zh" | "en";
  couponClient?: PortalCouponClient | null;
  sessionRef?: string | null;
  onSessionInvalid?: () => void;
  onOpenCoupons?: () => void;
  accountKey?: string | null;
};

const tx = (locale: Props["locale"], pair: readonly [string, string]) => (locale === "zh" ? pair[0] : pair[1]);

// Formats as XXXX-XXXX-XXXX while typing; the server ignores case, spaces and hyphens.
function formatInput(raw: string) {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return compact.replace(/(.{4})(?=.)/g, "$1-");
}

export function PortalRedeemPanel({ locale, couponClient, sessionRef, onSessionInvalid, onOpenCoupons, accountKey }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; coupon: PortalCoupon } | { ok: false; message: string } | null>(null);
  const r = COUPON_COPY.redeem;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!couponClient || !sessionRef || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const coupon = await couponClient.redeemCoupon({ sessionRef, code });
      setResult({ ok: true, coupon });
      setCode("");
    } catch (error) {
      if (error instanceof PortalCouponClientError && error.code === "invalid_session") { onSessionInvalid?.(); return; }
      const message = error instanceof PortalCouponClientError && error.code === "redeem_failed" ? tx(locale, r.invalid)
        : error instanceof PortalCouponClientError && error.code === "redeem_rate_limited" ? tx(locale, r.limited)
          : tx(locale, r.failed);
      setResult({ ok: false, message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pc-root" aria-labelledby="pc-redeem-title">
      <div className="pc-sky" aria-hidden="true"><div className="pc-stars" /><div className="pc-glow" /></div>
      <div className="pc-inner">
        <h2 id="pc-redeem-title" className="pc-visually-hidden">{tx(locale, COUPON_COPY.redeemTitle)}</h2>
        <CouponFirstVisitHint locale={locale} accountKey={accountKey} />
        <form className="pc-redeem" onSubmit={submit} noValidate>
          <label htmlFor="pc-redeem-code" className="pc-label">{tx(locale, r.label)}</label>
          <div className="pc-redeem-row">
            <input id="pc-redeem-code" className="pc-redeem-input" value={code} autoComplete="off" spellCheck={false}
              autoCapitalize="characters" inputMode="text" maxLength={14} placeholder="XXXX-XXXX-XXXX"
              aria-invalid={result?.ok === false} aria-describedby="pc-redeem-result"
              onChange={(e) => setCode(formatInput(e.target.value))} disabled={busy} />
            <button type="submit" className="pc-copy pc-redeem-submit" disabled={busy || code.replace(/-/g, "").length !== 12}>
              {tx(locale, r.submit)}
            </button>
          </div>
          <div id="pc-redeem-result" aria-live="polite">
            {result?.ok === false ? <p className="pc-redeem-error" role="alert">{result.message}</p> : null}
            {result?.ok ? (
              <div className="pc-redeem-success">
                <p>{tx(locale, r.success)} <code className="pc-code">{result.coupon.code}</code></p>
                {onOpenCoupons ? <button type="button" className="pc-tab" onClick={onOpenCoupons}>{tx(locale, r.view)}</button> : null}
              </div>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
