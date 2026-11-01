import { useEffect, useState } from "react";
import {
  clearAdsClickData,
  isAdsClickBindingEnabled,
  readAdsUserDataConsent,
  setAdsUserDataConsent,
  type AdsUserDataConsent
} from "./ads-attribution";

type PanelLocale = "zh" | "en" | "auto";
type PanelSurface = "site" | "portal";

function detectLocale(): "zh" | "en" {
  const documentLanguage = typeof document === "undefined" ? "" : document.documentElement.lang;
  const browserLanguage = typeof navigator === "undefined" ? "" : navigator.language;
  return (documentLanguage || browserLanguage).toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function AdsConsentPreferencePanel({
  locale = "auto",
  surface = "site"
}: {
  locale?: PanelLocale;
  surface?: PanelSurface;
}) {
  const enabled = isAdsClickBindingEnabled();
  const [consent, setConsent] = useState<AdsUserDataConsent>(readAdsUserDataConsent);
  const [expanded, setExpanded] = useState(() => readAdsUserDataConsent() === "unknown");
  const [message, setMessage] = useState("");
  const [resolvedLocale, setResolvedLocale] = useState<"zh" | "en">(
    () => locale === "auto" ? detectLocale() : locale
  );

  useEffect(() => {
    if (locale !== "auto") {
      setResolvedLocale(locale);
      return undefined;
    }

    const syncLocale = () => setResolvedLocale(detectLocale());
    syncLocale();
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return undefined;
    const observer = new MutationObserver(syncLocale);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"]
    });
    return () => observer.disconnect();
  }, [locale]);

  useEffect(() => {
    const syncConsent = () => {
      const next = readAdsUserDataConsent();
      setConsent(next);
      if (next !== "granted") clearAdsClickData();
    };
    syncConsent();
    window.addEventListener("focus", syncConsent);
    window.addEventListener("pageshow", syncConsent);
    document.addEventListener("visibilitychange", syncConsent);
    return () => {
      window.removeEventListener("focus", syncConsent);
      window.removeEventListener("pageshow", syncConsent);
      document.removeEventListener("visibilitychange", syncConsent);
    };
  }, []);

  if (!enabled) return null;

  const zh = resolvedLocale === "zh";
  const choose = (next: "granted" | "denied") => {
    const saved = setAdsUserDataConsent(next);
    const actual = readAdsUserDataConsent();
    setConsent(actual);
    setMessage(saved
      ? ""
      : (zh
        ? "无法保存隐私偏好；广告衡量将保持关闭。"
        : "The privacy preference could not be saved; ad measurement remains off."));
    setExpanded(actual === "unknown");
  };

  return (
    <aside
      aria-label={zh ? "广告衡量隐私设置" : "Ad measurement privacy settings"}
      className={`ads-consent-panel ads-consent-panel--${surface}`}
      data-consent-state={consent}
    >
      {expanded ? (
        <div className="ads-consent-panel__content">
          <div className="ads-consent-panel__heading">
            <strong>{zh ? "广告衡量隐私设置" : "Ad measurement privacy"}</strong>
            <span>{zh ? "可选设置" : "Optional setting"}</span>
          </div>
          <p>
            {zh
              ? "只有在你明确允许后，我们才会使用 Google Ads 点击标识衡量广告是否带来购买。点击标识最多保留 90 天，仅用于转化衡量；不会启用个性化广告。拒绝不影响账户、购买或服务。"
              : "Only if you allow it, supported Google Ads click identifiers may be used to measure purchases from ads. Click identifiers are retained for up to 90 days for conversion measurement only. Ad personalization stays off. Declining does not affect your account, purchases, or service."}
          </p>
          <p className="ads-consent-panel__status" role="status">
            {zh
              ? consent === "granted" ? "当前状态：已允许" : consent === "denied" ? "当前状态：未允许" : "当前状态：尚未选择"
              : consent === "granted" ? "Current status: allowed" : consent === "denied" ? "Current status: not allowed" : "Current status: not selected"}
          </p>
          {message ? <p className="ads-consent-panel__message" role="alert">{message}</p> : null}
          <div className="ads-consent-panel__actions">
            <button className="ads-consent-panel__allow" type="button" onClick={() => choose("granted")}>
              {zh ? "允许广告转化衡量" : "Allow ad measurement"}
            </button>
            <button className="ads-consent-panel__reject" type="button" onClick={() => choose("denied")}>
              {zh ? "拒绝" : "Reject"}
            </button>
            <button className="ads-consent-panel__quiet" type="button" onClick={() => setExpanded(false)}>
              {zh ? "暂不选择" : "Not now"}
            </button>
          </div>
        </div>
      ) : (
        <div className="ads-consent-panel__collapsed">
          <span>
            {zh
              ? consent === "granted" ? "广告衡量：已允许" : "广告衡量：未允许"
              : consent === "granted" ? "Ad measurement: allowed" : "Ad measurement: not allowed"}
          </span>
          <button type="button" onClick={() => {
            setMessage("");
            setExpanded(true);
          }}>
            {zh ? "隐私设置" : "Privacy choices"}
          </button>
        </div>
      )}
    </aside>
  );
}
