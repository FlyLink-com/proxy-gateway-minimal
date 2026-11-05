import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdsConsentPreferencePanel } from "../features/ads-consent-preference-panel";
import {
  clearAdsClickData,
  clearPortalAdsServerConsent,
  PORTAL_ADS_CLICK_STORAGE_KEY,
  readAdsUserDataConsent,
  readPortalAdsClickForPurchase,
  setAdsUserDataConsent
} from "../features/ads-attribution";
import type { PortalAdsConsentClient } from "../features/user-portal/user-portal-client";

const CONSENT_COOKIE = "gccwebos-ad-user-data-consent-v1";
const sessionRef = `portalctx_${"c".repeat(64)}`;

beforeEach(() => {
  vi.stubEnv("VITE_PUBLIC_ADS_CLICK_BINDING_ENABLED", "true");
  clearAdsClickData();
  clearPortalAdsServerConsent();
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0`;
});

afterEach(() => {
  cleanup();
  clearAdsClickData();
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0`;
  vi.unstubAllEnvs();
});

describe("Ads consent preference panel", () => {
  test("requires an explicit choice and supports later withdrawal", () => {
    render(<AdsConsentPreferencePanel locale="zh" surface="site" />);

    expect(screen.getByText(/账户级授权/u)).toBeInTheDocument();
    expect(screen.queryByText(/最多保留 90 天/u)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "允许广告转化衡量" }));
    expect(readAdsUserDataConsent()).toBe("granted");
    fireEvent.click(screen.getByRole("button", { name: "隐私设置" }));
    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));
    expect(readAdsUserDataConsent()).toBe("denied");
    expect(screen.getByRole("button", { name: "隐私设置" })).toBeInTheDocument();
  });


  test("Portal uses server account consent instead of a granted browser cookie", async () => {
    expect(setAdsUserDataConsent("granted")).toBe(true);
    const client: PortalAdsConsentClient = {
      getConsent: vi.fn(async () => ({
        decision: "unknown" as const,
        adUserData: null,
        adPersonalization: false as const,
        updatedAt: null
      })),
      setConsent: vi.fn(async () => ({
        decision: "granted" as const,
        adUserData: true,
        adPersonalization: false as const,
        updatedAt: Date.now()
      }))
    };

    render(
      <AdsConsentPreferencePanel
        locale="zh"
        surface="portal"
        sessionRef={sessionRef}
        adsConsentClient={client}
      />
    );

    expect(await screen.findByText("当前状态：尚未选择")).toBeInTheDocument();
    expect(screen.getByText(/账户级授权由服务器保存/u)).toBeInTheDocument();
    expect(client.getConsent).toHaveBeenCalledWith({ sessionRef });
    expect(readAdsUserDataConsent()).toBe("granted");
    expect(readPortalAdsClickForPurchase(sessionRef)).toBeNull();
  });

  test("Portal server grant does not overwrite an independent site denial", async () => {
    expect(setAdsUserDataConsent("denied")).toBe(true);
    const client: PortalAdsConsentClient = {
      getConsent: vi.fn(async () => ({
        decision: "granted" as const,
        adUserData: true,
        adPersonalization: false as const,
        updatedAt: 1_798_000_000_000
      })),
      setConsent: vi.fn(async () => ({
        decision: "denied" as const,
        adUserData: false,
        adPersonalization: false as const,
        updatedAt: Date.now()
      }))
    };

    render(
      <AdsConsentPreferencePanel
        locale="zh"
        surface="portal"
        sessionRef={sessionRef}
        adsConsentClient={client}
      />
    );

    expect(await screen.findByText("广告衡量：已允许")).toBeInTheDocument();
    expect(readAdsUserDataConsent()).toBe("denied");
  });

  test.each(["focus", "pageshow", "visibilitychange"] as const)(
    "Portal revocation in another tab suspends attribution on %s without remounting",
    async (eventName) => {
      expect(setAdsUserDataConsent("granted")).toBe(true);
      let serverDecision: "granted" | "denied" = "granted";
      const client: PortalAdsConsentClient = {
        getConsent: vi.fn(async () => ({
          decision: serverDecision,
          adUserData: serverDecision === "granted",
          adPersonalization: false as const,
          updatedAt: Date.now()
        })),
        setConsent: vi.fn(async () => ({
          decision: "denied" as const,
          adUserData: false,
          adPersonalization: false as const,
          updatedAt: Date.now()
        }))
      };
      render(
        <AdsConsentPreferencePanel
          locale="zh"
          surface="portal"
          sessionRef={sessionRef}
          adsConsentClient={client}
        />
      );
      expect(await screen.findByText("广告衡量：已允许")).toBeInTheDocument();
      window.sessionStorage.setItem(PORTAL_ADS_CLICK_STORAGE_KEY, JSON.stringify({
        type: "gclid",
        value: "synthetic_cross_tab_click",
        clickAt: Date.now()
      }));
      expect(readPortalAdsClickForPurchase(sessionRef)).toMatchObject({
        value: "synthetic_cross_tab_click"
      });

      // A different Portal tab updates the server decision. This mounted
      // tab must invalidate its stale grant as soon as it resumes.
      serverDecision = "denied";
      act(() => {
        if (eventName === "visibilitychange") {
          document.dispatchEvent(new Event(eventName));
        } else {
          window.dispatchEvent(new Event(eventName));
        }
      });
      expect(readPortalAdsClickForPurchase(sessionRef)).toBeNull();
      expect(await screen.findByText("广告衡量：未允许")).toBeInTheDocument();
      expect(client.getConsent).toHaveBeenCalledTimes(2);
      expect(window.sessionStorage.getItem(PORTAL_ADS_CLICK_STORAGE_KEY)).toBeNull();
      // Portal revalidation never writes the independent site preference.
      expect(readAdsUserDataConsent()).toBe("granted");
    }
  );

  test("Portal server denial does not overwrite an independent site grant", async () => {
    expect(setAdsUserDataConsent("granted")).toBe(true);
    const client: PortalAdsConsentClient = {
      getConsent: vi.fn(async () => ({
        decision: "denied" as const,
        adUserData: false,
        adPersonalization: false as const,
        updatedAt: 1_798_000_000_000
      })),
      setConsent: vi.fn(async () => ({
        decision: "granted" as const,
        adUserData: true,
        adPersonalization: false as const,
        updatedAt: Date.now()
      }))
    };

    render(
      <AdsConsentPreferencePanel
        locale="zh"
        surface="portal"
        sessionRef={sessionRef}
        adsConsentClient={client}
      />
    );

    expect(await screen.findByText("广告衡量：未允许")).toBeInTheDocument();
    expect(readAdsUserDataConsent()).toBe("granted");
  });

  test("Portal submits a choice and only reflects it after the server confirms", async () => {
    expect(setAdsUserDataConsent("denied")).toBe(true);
    const client: PortalAdsConsentClient = {
      getConsent: vi.fn(async () => ({
        decision: "unknown" as const,
        adUserData: null,
        adPersonalization: false as const,
        updatedAt: null
      })),
      setConsent: vi.fn(async () => ({
        decision: "granted" as const,
        adUserData: true,
        adPersonalization: false as const,
        updatedAt: 1_798_000_000_000
      }))
    };

    render(
      <AdsConsentPreferencePanel
        locale="zh"
        surface="portal"
        sessionRef={sessionRef}
        adsConsentClient={client}
      />
    );

    await screen.findByText("当前状态：尚未选择");
    fireEvent.click(screen.getByRole("button", { name: "允许广告转化衡量" }));
    expect(await screen.findByText("广告衡量：已允许")).toBeInTheDocument();
    expect(client.setConsent).toHaveBeenCalledWith({ sessionRef, adUserData: true });
    expect(readAdsUserDataConsent()).toBe("denied");
  });

  test("Portal fails closed when the server consent read is unavailable", async () => {
    const client: PortalAdsConsentClient = {
      getConsent: vi.fn(async () => { throw new Error("offline"); }),
      setConsent: vi.fn(async () => ({
        decision: "denied" as const,
        adUserData: false,
        adPersonalization: false as const,
        updatedAt: 1_798_000_000_000
      }))
    };

    render(
      <AdsConsentPreferencePanel
        locale="zh"
        surface="portal"
        sessionRef={sessionRef}
        adsConsentClient={client}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/无法读取账户授权/u);
    expect(readPortalAdsClickForPurchase(sessionRef)).toBeNull();
  });

  test("does not render while the public feature gate is disabled", () => {
    vi.stubEnv("VITE_PUBLIC_ADS_CLICK_BINDING_ENABLED", "false");
    const { container } = render(<AdsConsentPreferencePanel locale="en" />);
    expect(container.firstChild).toBeNull();
  });
});
