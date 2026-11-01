import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildPortalAdsClickHandoffUrl,
  captureCompanySiteAdsClickFromLocation,
  clearAdsClickData,
  consumePortalAdsClickHandoff,
  PORTAL_ADS_CLICK_STORAGE_KEY,
  readAdsUserDataConsent,
  readPortalAdsClickForPurchase,
  setAdsUserDataConsent
} from "../features/ads-attribution";

const CONSENT_COOKIE = "gccwebos-ad-user-data-consent-v1";
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function setLocation(url: string) {
  window.history.replaceState(window.history.state, "", url);
}

beforeEach(() => {
  vi.stubEnv("VITE_PUBLIC_ADS_CLICK_BINDING_ENABLED", "true");
  clearAdsClickData();
  window.sessionStorage.clear();
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0`;
  setLocation("/");
});

afterEach(() => {
  clearAdsClickData();
  window.sessionStorage.clear();
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0`;
  setLocation("/");
  vi.unstubAllEnvs();
});

describe("consent-aware Ads click attribution", () => {
  test("captures one consented click, strips the query, and hands it to Portal in a removable fragment", () => {
    expect(setAdsUserDataConsent("granted")).toBe(true);
    setLocation("/?gclid=click_123&campaign=summer#/site");

    expect(captureCompanySiteAdsClickFromLocation()).toMatchObject({
      type: "gclid",
      value: "click_123"
    });
    expect(window.location.search).toBe("?campaign=summer");

    const handoffUrl = buildPortalAdsClickHandoffUrl("/portal/register/#portal=orders&orders=all");
    const target = new URL(handoffUrl);
    expect(target.search).toBe("");
    expect(target.hash).toMatch(/^#portal=orders&orders=all&adsClick=/u);

    setLocation(`${target.pathname}${target.search}${target.hash}`);
    expect(consumePortalAdsClickHandoff()).toMatchObject({
      type: "gclid",
      value: "click_123"
    });
    expect(window.location.hash).toBe("#portal=orders&orders=all");
    expect(readPortalAdsClickForPurchase()).toMatchObject({
      type: "gclid",
      value: "click_123",
      consent: {
        adUserData: true,
        adPersonalization: false
      }
    });
  });

  test.each(["gclid", "gbraid", "wbraid"] as const)(
    "captures %s independently after consent and removes it from the ordinary URL",
    (type) => {
      expect(setAdsUserDataConsent("granted")).toBe(true);
      setLocation(`/?${type}=synthetic_${type}_123&campaign=summer#/site`);

      expect(captureCompanySiteAdsClickFromLocation()).toMatchObject({
        type,
        value: `synthetic_${type}_123`
      });
      expect(window.location.search).toBe("?campaign=summer");
      expect(window.location.href).not.toContain(`synthetic_${type}_123`);
    }
  );

  test("defaults to unknown consent and discards an incoming click until the user opts in", () => {
    expect(readAdsUserDataConsent()).toBe("unknown");
    setLocation("/?gclid=not-yet-consented#/site");

    expect(captureCompanySiteAdsClickFromLocation()).toBeNull();
    expect(window.location.search).toBe("");
    expect(buildPortalAdsClickHandoffUrl("/portal/")).toBe("/portal/");
  });

  test("drops the click and cleans the URL when consent is denied", () => {
    expect(setAdsUserDataConsent("denied")).toBe(true);
    setLocation("/?gclid=must_not_be_saved#/site");

    expect(captureCompanySiteAdsClickFromLocation()).toBeNull();
    expect(window.location.search).toBe("");
    expect(buildPortalAdsClickHandoffUrl("/portal/")).toBe("/portal/");
    expect(readAdsUserDataConsent()).toBe("denied");
  });

  test("rejects multiple click identifiers and malformed values without blocking the page", () => {
    setAdsUserDataConsent("granted");
    setLocation("/?gclid=first_click&wbraid=second_click#/site");

    expect(captureCompanySiteAdsClickFromLocation()).toBeNull();
    expect(window.location.search).toBe("");
    expect(buildPortalAdsClickHandoffUrl("/portal/")).toBe("/portal/");

    setLocation("/?gclid=bad%20value#/site");
    expect(captureCompanySiteAdsClickFromLocation()).toBeNull();
    expect(window.location.search).toBe("");
  });

  test("strips click identifiers while the feature gate is disabled", () => {
    vi.stubEnv("VITE_PUBLIC_ADS_CLICK_BINDING_ENABLED", "false");
    setAdsUserDataConsent("granted");
    setLocation("/?gbraid=disabled_click#/site");

    expect(captureCompanySiteAdsClickFromLocation()).toBeNull();
    expect(window.location.search).toBe("");
    expect(buildPortalAdsClickHandoffUrl("/portal/")).toBe("/portal/");
  });

  test("removes invalid handoffs while preserving existing Portal navigation", () => {
    setAdsUserDataConsent("granted");
    setLocation("/portal/#portal=orders&orders=all&adsClick=not-valid!");

    expect(consumePortalAdsClickHandoff()).toBeNull();
    expect(window.location.hash).toBe("#portal=orders&orders=all");
    expect(window.sessionStorage.getItem(PORTAL_ADS_CLICK_STORAGE_KEY)).toBeNull();
  });

  test("expires click IDs after 90 days and clears them immediately on withdrawal", () => {
    setAdsUserDataConsent("granted");
    window.sessionStorage.setItem(PORTAL_ADS_CLICK_STORAGE_KEY, JSON.stringify({
      type: "gclid",
      value: "expired_click",
      clickAt: Date.now() - MAX_AGE_MS - 1
    }));
    expect(readPortalAdsClickForPurchase()).toBeNull();
    expect(window.sessionStorage.getItem(PORTAL_ADS_CLICK_STORAGE_KEY)).toBeNull();

    window.sessionStorage.setItem(PORTAL_ADS_CLICK_STORAGE_KEY, JSON.stringify({
      type: "wbraid",
      value: "withdrawn_click",
      clickAt: Date.now()
    }));
    expect(setAdsUserDataConsent("denied")).toBe(true);
    expect(readPortalAdsClickForPurchase()).toBeNull();
    expect(window.sessionStorage.getItem(PORTAL_ADS_CLICK_STORAGE_KEY)).toBeNull();
  });
});
