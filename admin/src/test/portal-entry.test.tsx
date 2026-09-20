import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { PortalDisplayLinks } from "../features/user-portal/portal-display-links";
import {
  isPortalRegistrationPath,
  isPortalWebPath,
  portalAssetPath,
  portalDisplayPreferenceHref,
  portalRoutePath
} from "../features/user-portal/portal-entry";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
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

  test("renders compact switches only inside the explicit desktop entry", () => {
    window.history.replaceState(null, "", "/web/?source=header#section");
    render(<PortalDisplayLinks locale="zh" />);
    expect(screen.getByRole("link", { name: "手机版" }).getAttribute("href")).toBe(
      "/?source=header&display=mobile#section"
    );
    expect(screen.getByRole("link", { name: "自动选择" }).getAttribute("href")).toBe(
      "/?source=header&display=auto#section"
    );

    cleanup();
    window.history.replaceState(null, "", "/portal/");
    render(<PortalDisplayLinks locale="zh" />);
    expect(screen.queryByRole("link", { name: "手机版" })).toBeNull();
  });
});
