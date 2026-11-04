import { useEffect, useRef, useState } from "react";
import {
  clearAdsClickData,
  clearPortalAdsServerConsent,
  isAdsClickBindingEnabled,
  readAdsUserDataConsent,
  setAdsUserDataConsent,
  setPortalAdsServerConsent,
  type AdsUserDataConsent
} from "./ads-attribution";
import type { PortalAdsConsentClient } from "./user-portal/user-portal-client";

type PanelLocale = "zh" | "en" | "auto";
type PanelSurface = "site" | "portal";

function detectLocale(): "zh" | "en" {
  const documentLanguage = typeof document === "undefined" ? "" : document.documentElement.lang;
  const browserLanguage = typeof navigator === "undefined" ? "" : navigator.language;
  return (documentLanguage || browserLanguage).toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function AdsConsentPreferencePanel({
  locale = "auto",
  surface = "site",
  sessionRef,
  adsConsentClient
}: {
  locale?: PanelLocale;
  surface?: PanelSurface;
  sessionRef?: string;
  adsConsentClient?: PortalAdsConsentClient;
}) {
  const enabled = isAdsClickBindingEnabled();
  const [consent, setConsent] = useState<AdsUserDataConsent>(
    () => surface === "portal" ? "unknown" : readAdsUserDataConsent()
  );
  const [expanded, setExpanded] = useState(
    () => surface === "portal" || readAdsUserDataConsent() === "unknown"
  );
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(surface === "portal");
  const [pending, setPending] = useState(false);
  const requestVersionRef = useRef(0);
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
    if (!enabled) return undefined;

    if (surface === "portal") {
      if (!sessionRef || !adsConsentClient) {
        clearPortalAdsServerConsent();
        clearAdsClickData();
        setConsent("unknown");
        setExpanded(true);
        setLoading(false);
        setMessage("账户授权接口不可用；广告点击标识已暂停。");
        return undefined;
      }

      const requestVersion = ++requestVersionRef.current;
      let cancelled = false;
      setPortalAdsServerConsent(sessionRef, "unknown");
      setConsent("unknown");
      setExpanded(true);
      setLoading(true);
      setMessage("");

      void adsConsentClient.getConsent({ sessionRef }).then((state) => {
        if (cancelled || requestVersionRef.current !== requestVersion) return;
        setPortalAdsServerConsent(sessionRef, state.decision);
        if (state.decision === "granted") {
          setAdsUserDataConsent("granted");
        } else if (state.decision === "denied") {
          setAdsUserDataConsent("denied");
        } else {
          clearAdsClickData();
        }
        setConsent(state.decision);
        setExpanded(state.decision === "unknown");
      }).catch(() => {
        if (cancelled || requestVersionRef.current !== requestVersion) return;
        setPortalAdsServerConsent(sessionRef, "unknown");
        clearAdsClickData();
        setConsent("unknown");
        setExpanded(true);
        setMessage("无法读取账户授权；当前会话已暂停广告点击标识使用，请检查网络后重试。");
      }).finally(() => {
        if (!cancelled && requestVersionRef.current === requestVersion) setLoading(false);
      });

      return () => {
        cancelled = true;
        requestVersionRef.current += 1;
        clearPortalAdsServerConsent(sessionRef);
      };
    }

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
  }, [enabled, surface, sessionRef, adsConsentClient]);

  if (!enabled) return null;

  const zh = resolvedLocale === "zh";
  const choose = (next: "granted" | "denied") => {
    if (surface === "portal") {
      if (!sessionRef || !adsConsentClient || pending) return;
      const requestVersion = ++requestVersionRef.current;
      setPending(true);
      setLoading(false);
      setPortalAdsServerConsent(sessionRef, "unknown");
      clearAdsClickData();
      setConsent("unknown");
      setExpanded(true);
      setMessage("");
      void adsConsentClient.setConsent({
        sessionRef,
        adUserData: next === "granted"
      }).then((state) => {
        if (requestVersionRef.current !== requestVersion) return;
        const expected = next === "granted" ? "granted" : "denied";
        if (state.decision !== expected) throw new Error("Consent decision was not confirmed.");
        setPortalAdsServerConsent(sessionRef, state.decision);
        setAdsUserDataConsent(next);
        setConsent(state.decision);
        setExpanded(false);
      }).catch(() => {
        if (requestVersionRef.current !== requestVersion) return;
        setPortalAdsServerConsent(sessionRef, "unknown");
        clearAdsClickData();
        setConsent("unknown");
        setExpanded(true);
        setMessage(zh
          ? "服务器未确认保存；当前会话已停止发送广告点击标识，请重试。"
          : "The server did not confirm this choice. Click-ID measurement is paused in this session; please retry.");
      }).finally(() => {
        if (requestVersionRef.current === requestVersion) setPending(false);
      });
      return;
    }

    const saved = setAdsUserDataConsent(next);
    const actual = readAdsUserDataConsent();
    setConsent(actual);
    setMessage(saved
      ? ""
      : (zh
        ? "无法保存隐私偏好；当前页面已停止广告衡量，请检查浏览器 Cookie 设置后重试。"
        : "The preference could not be saved. Measurement is stopped on this page; check browser cookie settings and try again."));
    setExpanded(!saved || actual === "unknown");
  };

  const statusText = loading
    ? (zh ? "正在读取账户授权…" : "Loading account consent…")
    : pending
      ? (zh ? "正在保存账户授权…" : "Saving account consent…")
      : consent === "granted"
        ? (zh ? "当前状态：已允许" : "Current status: allowed")
        : consent === "denied"
          ? (zh ? "当前状态：未允许" : "Current status: not allowed")
          : (zh ? "当前状态：尚未选择" : "Current status: not selected");

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
            {surface === "portal"
              ? (zh
                ? "账户级授权由服务器保存。只有服务器确认已允许后，支持的 Google Ads 点击标识才会随购买请求提交，用于衡量广告是否带来购买。不会启用个性化广告。拒绝不影响账户、购买或服务。"
                : "Account-level consent is stored by the server. Supported Google Ads click identifiers are sent with a purchase request only after the server confirms consent. Ad personalization stays off. Declining does not affect your account, purchases, or service.")
              : (zh
                ? "允许后，本浏览器会暂存支持的 Google Ads 点击标识，以便登录后继续衡量广告是否带来购买。进入账户中心后还需再次确认账户级授权；确认前不会把点击标识用于购买归因。不会启用个性化广告。"
                : "If allowed, this browser temporarily holds supported Google Ads click identifiers for measurement after sign-in. Account-level consent must still be confirmed in the user center before any purchase attribution. Ad personalization stays off.")}
          </p>
          <p className="ads-consent-panel__status" role="status">{statusText}</p>
          {message ? <p className="ads-consent-panel__message" role="alert">{message}</p> : null}
          <div className="ads-consent-panel__actions">
            <button
              className="ads-consent-panel__allow"
              type="button"
              disabled={pending || loading}
              onClick={() => choose("granted")}
            >
              {zh ? "允许广告转化衡量" : "Allow ad measurement"}
            </button>
            <button
              className="ads-consent-panel__reject"
              type="button"
              disabled={pending || loading}
              onClick={() => choose("denied")}
            >
              {zh ? "拒绝" : "Reject"}
            </button>
            <button
              className="ads-consent-panel__quiet"
              type="button"
              disabled={pending}
              onClick={() => setExpanded(false)}
            >
              {zh ? "暂不选择" : "Not now"}
            </button>
          </div>
        </div>
      ) : (
        <div className="ads-consent-panel__collapsed">
          <span>
            {zh
              ? consent === "granted" ? "广告衡量：已允许" : consent === "denied" ? "广告衡量：未允许" : "广告衡量：尚未选择"
              : consent === "granted" ? "Ad measurement: allowed" : consent === "denied" ? "Ad measurement: not allowed" : "Ad measurement: not selected"}
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
