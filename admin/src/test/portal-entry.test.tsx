import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { UserPortalPage } from "../features/user-portal/user-portal-page";
import { UserRegistrationPage } from "../features/user-portal/user-registration-page";
import { createLocalUserPortalClient } from "../features/user-portal/user-portal-preview-client";
import type { PortalSession } from "../features/user-portal/user-portal-client";
import {
  isPortalRegistrationPath,
  isPortalWebPath,
  portalAssetPath,
  portalDisplayPreferenceHref,
  portalRoutePath
} from "../features/user-portal/portal-entry";

beforeEach(() => { vi.stubGlobal("BroadcastChannel", undefined); });
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("portal entry boundaries", () => {
  test("keeps explicit desktop and legacy portal routes distinct", () => {
    expect(isPortalWebPath("/web/")).toBe(true);
    expect(isPortalWebPath("/web/register/")).toBe(true);
    expect(isPortalWebPath("/portal/")).toBe(false);
    expect(isPortalRegistrationPath("/portal/register")).toBe(true);
    expect(isPortalRegistrationPath("/web/register")).toBe(true);
    expect(portalRoutePath("login", { pathname: "/web/" })).toBe("/web/");
    expect(portalRoutePath("register", { pathname: "/web/" })).toBe("/web/register/");
    expect(portalRoutePath("register", { pathname: "/portal/" })).toBe("/portal/register/");
  });

  test("maps desktop display choices to the mobile entry without dropping state", () => {
    const location = {
      pathname: "/web/",
      search: "?tenant=demo&display=auto&view=orders",
      hash: "#/wallet"
    };
    expect(portalDisplayPreferenceHref("mobile", location)).toBe(
      "/?tenant=demo&view=orders&display=mobile#/wallet"
    );
    expect(portalDisplayPreferenceHref("auto", {
      ...location,
      pathname: "/web/register/"
    })).toBe("/portal/register?tenant=demo&view=orders&display=auto#/wallet");
  });

  test("prefixes public assets only for the desktop artifact", () => {
    expect(portalAssetPath("payment-alipay-icon.png", { pathname: "/web/" })).toBe(
      "/web/payment-alipay-icon.png"
    );
    expect(portalAssetPath("guide/clash-system-proxy.png", { pathname: "/portal/" })).toBe(
      "/guide/clash-system-proxy.png"
    );
  });

  test.each(["zh", "en"])("hides display switches across desktop login, registration and signed-in shell (%s)", async (locale) => {
    window.localStorage.setItem("gccwebos-site-locale", locale);
    const expectNoDisplaySwitch = () => {
      expect(document.querySelector(".portal-display-links")).toBeNull();
      expect(screen.queryByRole("navigation", { name: /显示模式|Display mode/ })).toBeNull();
    };
    window.history.replaceState(null, "", "/web/");
    render(<UserPortalPage portalClient={createLocalUserPortalClient()} />);
    await screen.findByRole("heading", { name: /账号登录|Sign in to GCC WebOS/ });
    expectNoDisplaySwitch();

    cleanup();
    window.history.replaceState(null, "", "/web/register/");
    render(<UserRegistrationPage portalClient={createLocalUserPortalClient()} />);
    await screen.findByRole("heading", { name: /创建你的账户|Create your account/ });
    expectNoDisplaySwitch();

    cleanup();
    const session: PortalSession = {
      status: "authenticated_preview", transport: "cookie",
      sessionRef: `portalctx_${"a".repeat(64)}`, userRef: "synthetic_display_test",
      displayName: "Display test", authMode: "password", registeredAt: "2026-09-20T00:00:00.000Z",
      safety: { noAdminApi: true, noPublicAuthActivated: true, noRawPasswordReturned: true }
    };
    window.history.replaceState(null, "", "/web/#portal=start");
    render(<UserPortalPage portalClient={{ ...createLocalUserPortalClient(), restoreSession: async () => session }} />);
    expectNoDisplaySwitch(); // Includes the initial restoring state.
    await screen.findByRole("navigation", { name: /用户中心导航|User center navigation/ });
    expectNoDisplaySwitch();
  });
});
