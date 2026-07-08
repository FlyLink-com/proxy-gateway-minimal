import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";

const portalLoginUrl = "https://portal.gccwebos.com/";
const portalRegisterUrl = "https://portal.gccwebos.com/portal/register/";

function setBrowserLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language
  });
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    value: [language]
  });
}

beforeEach(() => {
  setBrowserLanguage("en-US");
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.location.hash = "";
});

describe("company site route", () => {
  test("renders the Figma GCC WebOS VPN public site without exposing private surfaces", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("GCC WebOS - VPN Secure Access");
    expect(screen.getAllByText("GCC WebOS").length).toBeGreaterThan(1);
    expect(screen.getByRole("heading", { name: "Secure private access for every device" })).not.toBeNull();
    expect(screen.getByText("VPN & Secure Access")).not.toBeNull();
    expect(screen.getByText("GCC WebOS Dashboard")).not.toBeNull();
    expect(screen.getByText("Protocol: WireGuard")).not.toBeNull();
    expect(screen.getByText("Tokyo · JP")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Everything you need for secure access" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Up and running in minutes" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Simple, transparent plans" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Tell us what you need" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Common questions" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Register" }).getAttribute("href")).toBe(portalRegisterUrl);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(portalLoginUrl);
    expect(screen.getAllByRole("link", { name: /Register for 7-day trial/ }).length).toBeGreaterThan(0);
    screen.getAllByRole("link", { name: /Register for 7-day trial/ }).forEach((link) => {
      expect(link.getAttribute("href")).toBe(portalRegisterUrl);
    });

    expect(screen.queryByRole("heading", { name: "Log in" })).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByLabelText("Confirm password")).toBeNull();
    expect(container.textContent).not.toMatch(
      /Admin Console|Admin API|YAML|Server Edge|Local Edge|Channel Manager|订阅接入|专属入口|导入客户端|动态入口|curl -X POST|Webhook/
    );
    expect(container.innerHTML).not.toMatch(
      /login-after-entry|subscriptionUrl|token=|entryRef|artifactRef|access-grants|#\/portal|\/use|\/api\/admin/
    );
    expect(container.textContent).not.toMatch(/Telegram|TG|扫码注册|扫码进入|翻墙|绕过|突破封锁/);
    expect(container.innerHTML).not.toMatch(/t\.me|gcaltd0528|telegram/i);
  });

  test("submits a public access inquiry through the lead intake endpoint", async () => {
    window.location.hash = "#/site";
    const fetchMock = vi.fn<(endpoint: string, request: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(createElement(App));

    expect(screen.getByLabelText("Name or team")).not.toBeNull();
    expect(screen.getByLabelText("Email address")).not.toBeNull();
    expect(screen.getByLabelText("Plan")).not.toBeNull();
    expect(screen.getByLabelText("Devices")).not.toBeNull();
    expect(screen.getByLabelText("Primary region")).not.toBeNull();
    expect(screen.getByLabelText("Use case")).not.toBeNull();

    const contactForm = container.querySelector("form.company-site-contact-form");
    expect(contactForm?.getAttribute("action")).toBeNull();
    expect(contactForm?.getAttribute("method")).toBeNull();

    fireEvent.change(screen.getByLabelText("Name or team"), { target: { value: "GCC Pilot Team" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ops@example.com" } });
    fireEvent.change(screen.getByLabelText("Plan"), { target: { value: "Annual" } });
    fireEvent.change(screen.getByLabelText("Devices"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Primary region"), { target: { value: "Asia" } });
    fireEvent.change(screen.getByLabelText("Use case"), { target: { value: "Team needs secure multi-device access." } });
    fireEvent.click(screen.getByRole("button", { name: /Submit request/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [endpoint, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(endpoint).toBe("/api/public/leads");
    expect(request).toEqual(expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }));
    expect(body).toEqual(expect.objectContaining({
      organization: "GCC Pilot Team",
      email: "ops@example.com",
      direction: "GCC WebOS access inquiry",
      stage: "Annual",
      source: "gccwebos-public-site"
    }));
    expect(body.message).toContain("deviceCount=6");
    expect(body.message).toContain("region=Asia");
    expect((await screen.findByRole("status")).textContent).toContain("Request submitted");
  });

  test("shows a graceful error when public inquiry submission is unavailable", async () => {
    window.location.hash = "#/site";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    render(createElement(App));

    fireEvent.change(screen.getByLabelText("Name or team"), { target: { value: "GCC Pilot Team" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ops@example.com" } });
    fireEvent.change(screen.getByLabelText("Plan"), { target: { value: "Monthly Basic" } });
    fireEvent.change(screen.getByLabelText("Use case"), { target: { value: "Need secure access trial." } });
    fireEvent.click(screen.getByRole("button", { name: /Submit request/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("Submission failed");
  });

  test("presents Figma feature cards, setup steps, pricing plans, and FAQ copy", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    [
      "Encrypted Connections",
      "Multi-Region Nodes",
      "Flexible Subscriptions",
      "All Major Platforms",
      "Connection Dashboard",
      "Account & Team Access"
    ].forEach((capability) => {
      expect(screen.getByText(capability)).not.toBeNull();
    });

    ["Register", "Choose plan", "Verify", "Connect safely"].forEach((step) => {
      expect(screen.getAllByText(step).length).toBeGreaterThan(0);
    });

    ["Monthly Basic", "Monthly Plus", "¥20", "¥30", "Most popular"].forEach((planText) => {
      expect(screen.getAllByText(planText).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Annual")).not.toBeNull();
    expect(screen.queryByText("¥200")).toBeNull();
    expect(screen.queryByText("/year")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    expect(screen.getByRole("button", { name: "Annual" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("Annual").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("¥200")).not.toBeNull();
    expect(screen.getByText("/year")).not.toBeNull();
    expect(screen.queryByText("Monthly Basic")).toBeNull();
    expect(screen.queryByText("Monthly Plus")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.getByRole("button", { name: "Monthly" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Monthly Basic")).not.toBeNull();
    expect(screen.getByText("Monthly Plus")).not.toBeNull();
    expect(screen.queryByText("¥200")).toBeNull();

    expect(screen.getByText("Multiple payment methods supported")).not.toBeNull();

    [
      "Does GCC WebOS log my activity?",
      "How many devices can I connect?",
      "How do payments work?",
      "Which platforms are supported?"
    ].forEach((question) => {
      expect(screen.getByText(question)).not.toBeNull();
    });

    expect(container.querySelector(".company-site-dashboard")).not.toBeNull();
    expect(container.querySelector(".company-site-intake-rail")).not.toBeNull();
    expect(container.querySelector(".company-site-plan-card[data-tone=\"featured\"]")).not.toBeNull();
    expect(container.textContent).not.toMatch(/Admin API|订阅链接.*token|节点密钥/);
  });

  test("adapts the public site copy from the browser language", () => {
    setBrowserLanguage("zh-CN");
    window.location.hash = "#/site";

    render(createElement(App));

    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.title).toBe("GCC WebOS - VPN 安全访问");
    expect(screen.getByRole("heading", { name: "安全私密访问，覆盖每一台设备" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "注册" }).getAttribute("href")).toBe(portalRegisterUrl);
    expect(screen.getByRole("link", { name: "登录" }).getAttribute("href")).toBe(portalLoginUrl);
    expect(screen.getByText("帮助与解答")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "常见问题" })).not.toBeNull();
    expect(screen.getAllByRole("link", { name: /注册领取 7 天试用/ }).length).toBeGreaterThan(0);
    screen.getAllByRole("link", { name: /注册领取 7 天试用/ }).forEach((link) => {
      expect(link.getAttribute("href")).toBe(portalRegisterUrl);
    });
    expect(screen.getByText("支持多种支付方式")).not.toBeNull();
    expect(screen.getByLabelText("姓名或团队")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "年度" }));

    expect(screen.getByRole("button", { name: "年度" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("¥200")).not.toBeNull();
    expect(screen.getByText("/年")).not.toBeNull();
    expect(screen.queryByText("月度基础")).toBeNull();
    expect(screen.queryByText("月度会员")).toBeNull();
  });

  test("lets visitors manually switch language and keeps their choice", () => {
    setBrowserLanguage("en-US");
    window.location.hash = "#/site";

    render(createElement(App));

    expect(screen.getByRole("heading", { name: "Secure private access for every device" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "中" }));

    expect(window.localStorage.getItem("gccwebos-site-locale")).toBe("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(screen.getByRole("heading", { name: "安全私密访问，覆盖每一台设备" })).not.toBeNull();

    cleanup();
    window.location.hash = "#/site";
    render(createElement(App));

    expect(document.documentElement.lang).toBe("zh-CN");
    expect(screen.getByRole("heading", { name: "安全私密访问，覆盖每一台设备" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(window.localStorage.getItem("gccwebos-site-locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("heading", { name: "Secure private access for every device" })).not.toBeNull();
  });

  test("keeps the site hash route when scrolling through public site navigation", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));
    const siteShell = container.querySelector(".company-site-shell");
    const siteNav = screen.getByRole("navigation", { name: "GCC WebOS website navigation" });
    expect(siteShell?.getAttribute("data-active-section")).toBe("top");

    const linkTargets = [
      ["GCC WebOS home", "top"],
      ["Features", "features"],
      ["Pricing", "pricing"],
      ["Contact", "contact"],
      ["Support", "faq"],
      ["View plans", "pricing"]
    ] as const;

    linkTargets.forEach(([linkName, sectionId]) => {
      const section = container.querySelector(`#${sectionId}`) as HTMLElement & {
        scrollIntoView: (options?: ScrollIntoViewOptions) => void;
      };
      const scrollIntoView = vi.fn();
      section.scrollIntoView = scrollIntoView;
      window.location.hash = "#/site";

      const link = ["Features", "Pricing", "Contact", "Support"].includes(linkName)
        ? within(siteNav).getByRole("link", { name: linkName })
        : screen.getByRole("link", { name: linkName });
      fireEvent.click(link);

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
      expect(window.location.hash).toBe("#/site");
      expect(siteShell?.getAttribute("data-active-section")).toBe(sectionId);
    });
  });

  test("opens footer information sheets with localized public-only content", () => {
    setBrowserLanguage("zh-CN");
    window.location.hash = "#/site";

    const { container } = render(createElement(App));
    const footer = container.querySelector(".company-site-footer");
    if (!footer) {
      throw new Error("company site footer was not rendered");
    }

    const expectedFooterLinks = [
      ["功能", "#/site/info/features"],
      ["价格", "#/site/info/pricing"],
      ["下载", "#/site/info/download"],
      ["更新记录", "#/site/info/changelog"],
      ["服务条款", "#/site/info/terms"],
      ["隐私政策", "#/site/info/privacy"],
      ["可接受使用", "#/site/info/acceptable-use"],
      ["帮助中心", "#/site/info/help"],
      ["联系", "#/site/info/contact"],
      ["状态页", "#/site/info/status"]
    ] as const;

    expectedFooterLinks.forEach(([label, href]) => {
      expect(within(footer as HTMLElement).getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    });

    fireEvent.click(within(footer as HTMLElement).getByRole("link", { name: "隐私政策" }));

    expect(window.location.hash).toBe("#/site/info/privacy");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.title).toBe("隐私政策 - GCC WebOS");
    expect(screen.getByRole("heading", { name: "隐私政策" })).not.toBeNull();
    expect(screen.getByText("语言偏好")).not.toBeNull();
    expect(screen.getByText("当前代码未接广告像素")).not.toBeNull();
    expect(screen.getByRole("link", { name: "返回官网" })).not.toBeNull();
    expect(container.querySelector(".company-site-info-page")).not.toBeNull();
    expect(container.querySelectorAll(".company-site-info-card").length).toBe(3);
    expect(container.textContent).not.toMatch(/subscriptionUrl|token=|Admin API|节点密钥|翻墙|绕过|突破封锁/);

    fireEvent.click(screen.getByRole("link", { name: "返回官网" }));

    expect(window.location.hash).toBe("#/site");
    expect(screen.getByRole("heading", { name: "安全私密访问，覆盖每一台设备" })).not.toBeNull();
  });

  test("does not embed Telegram signup, raw subscription, or bypass-positioning content", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(screen.queryByRole("link", { name: /Telegram/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Telegram/i })).toBeNull();
    expect(container.textContent).not.toMatch(
      /Telegram|TG|扫码进入 Telegram 后|获取后续服务入口|用户注册优先走 Telegram|Public registration starts from Telegram|翻墙|绕过|突破封锁/
    );
    expect(container.innerHTML).not.toMatch(/t\.me|gcaltd0528|telegram|subscriptionUrl|token=/i);
  });
});
