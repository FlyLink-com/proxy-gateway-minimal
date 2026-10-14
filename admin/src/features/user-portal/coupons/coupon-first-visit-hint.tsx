import { useState } from "react";
import { COUPON_COPY } from "./coupon-copy";

type Locale = "zh" | "en";
const tx = (locale: Locale, pair: readonly [string, string]) => (locale === "zh" ? pair[0] : pair[1]);
const KEY_PREFIX = "flinkvpn.portal.coupon-hint.v1:";

function storageKey(accountKey: string | null | undefined) {
  return `${KEY_PREFIX}${accountKey || "anonymous"}`;
}
function readDismissed(accountKey: string | null | undefined) {
  try { return window.localStorage.getItem(storageKey(accountKey)) === "dismissed"; } catch { return false; }
}

// Shown once per account (per browser) across 我的优惠券 and 兑换码兑换.
export function CouponFirstVisitHint({ locale, accountKey }: { locale: Locale; accountKey?: string | null }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(accountKey));
  if (dismissed) return null;
  const dismiss = () => {
    try { window.localStorage.setItem(storageKey(accountKey), "dismissed"); } catch { /* storage unavailable: hide for this view */ }
    setDismissed(true);
  };
  const h = COUPON_COPY.hint;
  return (
    <aside className="pc-hint" aria-labelledby="pc-hint-title">
      <h3 id="pc-hint-title">{tx(locale, h.title)}</h3>
      <p>{tx(locale, h.intro)}</p>
      <ol>{h.steps.map((pair) => <li key={pair[1]}>{tx(locale, pair)}</li>)}</ol>
      <ul>{h.rules.map((pair) => <li key={pair[1]}>{tx(locale, pair)}</li>)}</ul>
      <button type="button" className="pc-copy" onClick={dismiss}>{tx(locale, h.dismiss)}</button>
    </aside>
  );
}
