import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdsConsentPreferencePanel } from "../features/ads-consent-preference-panel";
import {
  clearAdsClickData,
  clearPortalAdsServerConsent,
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
        decision: "unknown",
        adUserData: null,
        adPersonalization: false,
        updatedAt: null
      })),
      setConsent: vi.fn(async () => ({
        decision: "granted",
        adUserData: true,
        adPersonalization: false,
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
    expect(readPortalAdsClickForPurchase(sessionRef)).toBeNull();
  });

  test("Portal submits a choice and only reflects it after the server confirms", async () => {
    const client: PortalAdsConsentClient = {
      getConsent: vi.fn(async () => ({
        decision: "unknown",
        adUserData: null,
        adPersonalization: false,
        updatedAt: null
      })),
      setConsent: vi.fn(async () => ({
        decision: "granted",
        adUserData: true,
        adPersonalization: false,
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
  });

  test("Portal fails closed when the server consent read is unavailable", async () => {
    const client: PortalAdsConsentClient = {
      getConsent: vi.fn(async () => { throw new Error("offline"); }),
      setConsent: vi.fn(async () => ({
        decision: "denied",
        adUserData: false,
        adPersonalization: false,
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
