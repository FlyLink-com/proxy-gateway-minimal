import type { PortalAdsClickDescriptor } from "./user-portal/commerce/api-contract";

export type AdsUserDataConsent = "unknown" | "granted" | "denied";

type StoredAdsClick = {
  type: PortalAdsClickDescriptor["type"];
  value: string;
  clickAt: number;
};

const CONSENT_COOKIE = "gccwebos-ad-user-data-consent-v1";
export const PORTAL_ADS_CLICK_STORAGE_KEY = "gccwebos-portal-ads-click-v1";
const CLICK_TYPES = ["gclid", "gbraid", "wbraid"] as const;
const CLICK_VALUE_PATTERN = /^[A-Za-z0-9_.-]{1,512}$/u;
const MAX_CLICK_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const MIN_EPOCH_MS = 100_000_000_000;

let companySiteAdsClick: StoredAdsClick | null = null;
let deniedConsentOverride = false;

function adsClickFeatureEnabled() {
  const env = (import.meta as ImportMeta & {
    readonly env?: Record<string, string | undefined>;
  }).env ?? {};
  return env.VITE_PUBLIC_ADS_CLICK_BINDING_ENABLED === "true";
}

export function isAdsClickBindingEnabled() {
  return adsClickFeatureEnabled();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function isValidStoredClick(value: unknown, now = Date.now()): value is StoredAdsClick {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["type", "value", "clickAt"])) return false;
  if (!CLICK_TYPES.includes(value.type as typeof CLICK_TYPES[number])) return false;
  if (typeof value.value !== "string" || !CLICK_VALUE_PATTERN.test(value.value)) return false;
  if (!Number.isSafeInteger(value.clickAt)) return false;
  const clickAt = value.clickAt as number;
  return clickAt >= MIN_EPOCH_MS && clickAt <= now && clickAt >= now - MAX_CLICK_AGE_MS;
}

function cookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const prefix = `${name}=`;
    const entry = document.cookie.split(";").map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return entry ? entry.slice(prefix.length) : null;
  } catch {
    return null;
  }
}

export function readAdsUserDataConsent(): AdsUserDataConsent {
  if (deniedConsentOverride) return "denied";
  const value = cookieValue(CONSENT_COOKIE);
  if (value === "v1.granted") return "granted";
  if (value === "v1.denied") return "denied";
  return "unknown";
}

export function clearCompanySiteAdsClick() {
  companySiteAdsClick = null;
}

export function clearPortalAdsClick() {
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(PORTAL_ADS_CLICK_STORAGE_KEY);
    }
  } catch {
    // Attribution storage is optional and must never block Portal use.
  }
}

export function clearAdsClickData() {
  clearCompanySiteAdsClick();
  clearPortalAdsClick();
}

export function setAdsUserDataConsent(next: Exclude<AdsUserDataConsent, "unknown">): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;

  const host = window.location.hostname.toLowerCase();
  const domain = host === "gccwebos.com" || host.endsWith(".gccwebos.com")
    ? "; Domain=.gccwebos.com"
    : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const value = next === "granted" ? "v1.granted" : "v1.denied";
  if (next === "denied") clearAdsClickData();

  try {
    document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${domain}${secure}`;
  } catch {
    if (next === "denied") deniedConsentOverride = true;
    return false;
  }

  const saved = cookieValue(CONSENT_COOKIE) === value;
  if (next === "denied") deniedConsentOverride = !saved;
  else if (saved) deniedConsentOverride = false;
  return saved;
}

export function captureCompanySiteAdsClickFromLocation(now = Date.now()): StoredAdsClick | null {
  if (typeof window === "undefined") return null;

  let candidates: Array<{ type: StoredAdsClick["type"]; value: string }> = [];
  try {
    const url = new URL(window.location.href);
    candidates = CLICK_TYPES.flatMap((type) => url.searchParams.getAll(type).map((value) => ({ type, value })));
    if (candidates.length > 0) {
      for (const type of CLICK_TYPES) url.searchParams.delete(type);
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`
      );
    }
  } catch {
    clearCompanySiteAdsClick();
    return null;
  }

  if (!adsClickFeatureEnabled() || readAdsUserDataConsent() !== "granted") {
    clearCompanySiteAdsClick();
    return null;
  }

  if (candidates.length !== 1) {
    clearCompanySiteAdsClick();
    return null;
  }

  const [candidate] = candidates;
  if (!candidate || !CLICK_VALUE_PATTERN.test(candidate.value)) {
    clearCompanySiteAdsClick();
    return null;
  }

  const click = { ...candidate, clickAt: now };
  if (!isValidStoredClick(click, now)) {
    clearCompanySiteAdsClick();
    return null;
  }

  companySiteAdsClick = click;
  return { ...click };
}

function encodeHandoff(click: StoredAdsClick): string | null {
  try {
    const json = JSON.stringify({
      v: 1,
      type: click.type,
      value: click.value,
      clickAt: click.clickAt
    });
    return window.btoa(json).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
  } catch {
    return null;
  }
}

export function buildPortalAdsClickHandoffUrl(baseUrl: string): string {
  if (
    typeof window === "undefined"
    || !adsClickFeatureEnabled()
    || readAdsUserDataConsent() !== "granted"
    || !companySiteAdsClick
    || !isValidStoredClick(companySiteAdsClick)
  ) {
    return baseUrl;
  }

  const encoded = encodeHandoff(companySiteAdsClick);
  if (!encoded) return baseUrl;

  try {
    const target = new URL(baseUrl, window.location.href);
    const existing = target.hash.replace(/^#/u, "");
    const segments = existing.split("&").filter(Boolean).filter((segment) => {
      const rawKey = segment.split("=", 1)[0] ?? "";
      try {
        return decodeURIComponent(rawKey) !== "adsClick";
      } catch {
        return true;
      }
    });
    segments.push(`adsClick=${encoded}`);
    target.hash = segments.join("&");
    return target.toString();
  } catch {
    return baseUrl;
  }
}

function decodeHandoff(encoded: string): StoredAdsClick | null {
  if (!/^[A-Za-z0-9_-]{1,1024}$/u.test(encoded)) return null;
  try {
    const base64 = encoded.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const parsed: unknown = JSON.parse(window.atob(padded));
    if (
      !isPlainRecord(parsed)
      || !hasExactKeys(parsed, ["v", "type", "value", "clickAt"])
      || parsed.v !== 1
    ) {
      return null;
    }
    const click = {
      type: parsed.type,
      value: parsed.value,
      clickAt: parsed.clickAt
    };
    return isValidStoredClick(click) ? { ...click } : null;
  } catch {
    return null;
  }
}

export function consumePortalAdsClickHandoff(): StoredAdsClick | null {
  if (typeof window === "undefined") return null;

  const rawHash = window.location.hash.replace(/^#/u, "");
  const segments = rawHash ? rawHash.split("&") : [];
  const handoffSegments: string[] = [];
  const retainedSegments: string[] = [];

  for (const segment of segments) {
    const rawKey = segment.split("=", 1)[0] ?? "";
    let key = rawKey;
    try {
      key = decodeURIComponent(rawKey);
    } catch {
      // Preserve unrecognized fragments exactly as received.
    }
    if (key === "adsClick") handoffSegments.push(segment);
    else if (segment) retainedSegments.push(segment);
  }

  if (handoffSegments.length === 0) {
    if (!adsClickFeatureEnabled() || readAdsUserDataConsent() !== "granted") {
      clearPortalAdsClick();
    }
    return null;
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}${retainedSegments.length ? `#${retainedSegments.join("&")}` : ""}`
  );

  if (
    handoffSegments.length !== 1
    || !adsClickFeatureEnabled()
    || readAdsUserDataConsent() !== "granted"
  ) {
    clearPortalAdsClick();
    return null;
  }

  const rawValue = handoffSegments[0]?.slice((handoffSegments[0]?.indexOf("=") ?? -1) + 1) ?? "";
  let encoded = rawValue;
  try {
    encoded = decodeURIComponent(rawValue);
  } catch {
    clearPortalAdsClick();
    return null;
  }

  const click = decodeHandoff(encoded);
  if (!click) {
    clearPortalAdsClick();
    return null;
  }

  try {
    window.sessionStorage.setItem(PORTAL_ADS_CLICK_STORAGE_KEY, JSON.stringify(click));
    return click;
  } catch {
    clearPortalAdsClick();
    return null;
  }
}

export function readPortalAdsClickForPurchase(now = Date.now()): PortalAdsClickDescriptor | null {
  if (
    typeof window === "undefined"
    || !adsClickFeatureEnabled()
    || readAdsUserDataConsent() !== "granted"
  ) {
    clearPortalAdsClick();
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PORTAL_ADS_CLICK_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoredClick(parsed, now)) {
      clearPortalAdsClick();
      return null;
    }
    return {
      ...parsed,
      consent: {
        adUserData: true,
        adPersonalization: false
      }
    };
  } catch {
    clearPortalAdsClick();
    return null;
  }
}
