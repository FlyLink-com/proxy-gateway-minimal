import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdsConsentPreferencePanel } from "../features/ads-consent-preference-panel";
import {
  clearAdsClickData,
  readAdsUserDataConsent
} from "../features/ads-attribution";

const CONSENT_COOKIE = "gccwebos-ad-user-data-consent-v1";

beforeEach(() => {
  vi.stubEnv("VITE_PUBLIC_ADS_CLICK_BINDING_ENABLED", "true");
  clearAdsClickData();
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

    expect(screen.getByText(/随购买请求提交/u)).toBeInTheDocument();
    expect(screen.queryByText(/最多保留 90 天/u)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "允许广告转化衡量" }));
    expect(readAdsUserDataConsent()).toBe("granted");
    fireEvent.click(screen.getByRole("button", { name: "隐私设置" }));
    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));
    expect(readAdsUserDataConsent()).toBe("denied");
    expect(screen.getByRole("button", { name: "隐私设置" })).toBeInTheDocument();
  });

  test("does not render while the public feature gate is disabled", () => {
    vi.stubEnv("VITE_PUBLIC_ADS_CLICK_BINDING_ENABLED", "false");
    const { container } = render(<AdsConsentPreferencePanel locale="en" />);
    expect(container.firstChild).toBeNull();
  });
});
