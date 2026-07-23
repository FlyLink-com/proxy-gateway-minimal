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
  test("leads with promotional GCC WebOS value without exposing private surfaces or invented claims", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("GCC WebOS - Connect with ease");
    expect(screen.getAllByText("GCC WebOS").length).toBeGreaterThan(1);
    expect(screen.getByRole("heading", { name: "Connect to the world. Start with ease." })).not.toBeNull();
    expect(screen.getByText("See what GCC WebOS can do, choose what fits, and begin your connected experience with confidence.")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Find what fits your next step" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Choose your way to begin" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "See every step as you move" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Support and answers, together" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Ready for what comes next?" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Start a conversation with GCC WebOS" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Questions? Start here." })).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "Get Started" }).length).toBeGreaterThan(0);
    screen.getAllByRole("link", { name: "Get Started" }).forEach((link) => {
      expect(link.getAttribute("href")).toBe(portalRegisterUrl);
    });
    expect(screen.getAllByRole("link", { name: "Sign In" }).length).toBeGreaterThan(0);
    screen.getAllByRole("link", { name: "Sign In" }).forEach((link) => {
      expect(link.getAttribute("href")).toBe(portalLoginUrl);
    });
    expect(screen.getByRole("link", { name: "Explore" }).getAttribute("href")).toBe("#features");

    expect(screen.queryByRole("heading", { name: "Log in" })).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByLabelText("Confirm password")).toBeNull();
    expect(container.textContent).not.toMatch(
      /Admin Console|Admin API|YAML|Server Edge|Local Edge|Channel Manager|订阅接入|专属入口|导入客户端|动态入口|curl -X POST|Webhook/
    );
    expect(container.innerHTML).not.toMatch(
      /login-after-entry|subscriptionUrl|token=|entryRef|artifactRef|access-grants|#\/portal|\/use|\/api\/admin/
    );
    expect(container.textContent).not.toMatch(
      /Telegram|\bTG\b|扫码注册|扫码进入|翻墙|绕过|突破封锁|Approximate RMB monthly plan|Account-area activation|WireGuard|AES-256|No-log|refund|latency|Tokyo · JP|¥\d+|\/month|\/year|7-day trial|real-time/i
    );
    expect(container.textContent).not.toMatch(
      /One clear place to understand|Understand the product before you continue|Four steps keep the public website informative|It is not an order or service-management screen/
    );
    expect(container.textContent).not.toMatch(
      /Portal|service management|signed-in service|account gateway|public website explains/i
    );
    expect(container.innerHTML).not.toMatch(/t\.me|gcaltd0528|telegram/i);
  });

  test("separates the mobile concept stage from the vertically scrolling product story", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));
    const viewport = container.querySelector("[data-mobile-viewport]");
    const conceptStage = container.querySelector("[data-mobile-concept-stage]");
    const detailScroller = container.querySelector("[data-mobile-detail-scroller]");
    const primaryConcepts = container.querySelector("[data-concept-loop='primary']");
    const repeatedConcepts = container.querySelector("[data-concept-loop='duplicate']");

    expect(viewport).not.toBeNull();
    expect(viewport?.children[0]).toBe(conceptStage);
    expect(viewport?.children[1]).toBe(detailScroller);
    expect(conceptStage?.querySelector(".company-site-mobile-start-card")).not.toBeNull();
    expect(primaryConcepts?.children.length).toBeGreaterThanOrEqual(3);
    expect(repeatedConcepts?.children.length).toBe(primaryConcepts?.children.length);
    expect(repeatedConcepts?.getAttribute("aria-hidden")).toBe("true");
    expect(detailScroller?.getAttribute("tabindex")).toBe("0");
    expect(detailScroller?.querySelector("#features")).not.toBeNull();
    expect(detailScroller?.querySelector("#pricing")).not.toBeNull();
    expect(detailScroller?.querySelector("#how-it-works")).not.toBeNull();
    expect(detailScroller?.querySelector("#support")).not.toBeNull();
    expect(detailScroller?.querySelector("#contact")).not.toBeNull();
    expect(detailScroller?.querySelector(".company-site-footer")).not.toBeNull();
  });

  test("opens a focused mobile start chooser without replacing the existing account destinations", () => {
    window.location.hash = "#/site";

    render(createElement(App));

    const opener = screen.getByRole("button", { name: "Choose how to start" });
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog", { name: "Choose how to start" })).toBeNull();

    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Choose how to start" });
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    expect(within(dialog).getByRole("link", { name: "Create account" }).getAttribute("href")).toBe(portalRegisterUrl);
    expect(within(dialog).getByRole("link", { name: "Sign in now" }).getAttribute("href")).toBe(portalLoginUrl);

    fireEvent.click(within(dialog).getByRole("button", { name: "Close start options" }));
    expect(screen.queryByRole("dialog", { name: "Choose how to start" })).toBeNull();
    expect(opener.getAttribute("aria-expanded")).toBe("false");
  });

  test("keeps the mobile contact form compact until a visitor asks to start a conversation", () => {
    window.location.hash = "#/site";

    render(createElement(App));

    const opener = screen.getByRole("button", { name: "Start a conversation" });
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog", { name: "Start a conversation" })).toBeNull();

    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Start a conversation" });
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    expect(within(dialog).getByLabelText("Name or team")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Contact GCC WebOS" })).not.toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close contact form" }));
    expect(screen.queryByRole("dialog", { name: "Start a conversation" })).toBeNull();
    expect(opener.getAttribute("aria-expanded")).toBe("false");
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
    expect(screen.getByLabelText("Interest")).not.toBeNull();
    expect(screen.getByLabelText("Devices")).not.toBeNull();
    expect(screen.getByLabelText("Primary region")).not.toBeNull();
    expect(screen.getByLabelText("Use case")).not.toBeNull();

    const contactForm = container.querySelector("form.company-site-contact-form");
    expect(contactForm?.getAttribute("action")).toBeNull();
    expect(contactForm?.getAttribute("method")).toBeNull();

    fireEvent.change(screen.getByLabelText("Name or team"), { target: { value: "GCC Pilot Team" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ops@example.com" } });
    fireEvent.change(screen.getByLabelText("Interest"), { target: { value: "Flexible Access" } });
    fireEvent.change(screen.getByLabelText("Devices"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Primary region"), { target: { value: "Asia" } });
    fireEvent.change(screen.getByLabelText("Use case"), { target: { value: "Team needs secure multi-device access." } });
    fireEvent.click(screen.getByRole("button", { name: /Contact GCC WebOS/ }));

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
      stage: "Flexible Access",
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
    fireEvent.change(screen.getByLabelText("Interest"), { target: { value: "Essential Access" } });
    fireEvent.change(screen.getByLabelText("Use case"), { target: { value: "Need help choosing a starting path." } });
    fireEvent.click(screen.getByRole("button", { name: /Contact GCC WebOS/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("Submission failed");
  });

  test("presents product guidance, start steps, support links, and FAQ copy without a fake checkout", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    ["Easy Start", "Flexible Path"].forEach((product) => {
      expect(screen.getAllByText(product).length).toBeGreaterThan(0);
    });

    ["Discover", "Choose", "Start", "Continue"].forEach((step) => {
      expect(screen.getAllByText(step).length).toBeGreaterThan(0);
    });

    const supportDirectory = container.querySelector(".company-site-support-directory");
    if (!supportDirectory) {
      throw new Error("support directory was not rendered");
    }
    ["Usage guide", "Support center", "Service status", "Rules & privacy"].forEach((resource) => {
      expect(within(supportDirectory as HTMLElement).getByText(resource)).not.toBeNull();
    });

    [
      "Where do I create an account or sign in?",
      "I already have an account. How do I continue?",
      "Which way to begin is right for me?",
      "Where can I review support and rules?"
    ].forEach((question) => {
      expect(screen.getByText(question)).not.toBeNull();
    });

    expect(container.querySelector(".company-site-brand-visual")).not.toBeNull();
    expect(container.querySelector(".company-site-product-rail")).not.toBeNull();
    expect(container.querySelector(".company-site-support-directory")).not.toBeNull();
    expect(container.querySelector(".company-site-product-list")?.getAttribute("data-mobile-layout")).toBe("vertical");
    expect(container.querySelector(".company-site-product-rail")?.getAttribute("data-mobile-layout")).toBe("vertical");
    expect(container.querySelector(".company-site-guide-steps")?.getAttribute("data-mobile-layout")).toBe("vertical");
    expect(container.querySelector(".company-site-support-directory")?.getAttribute("data-mobile-layout")).toBe("vertical");
    expect(container.textContent).not.toMatch(/Admin API|订阅链接.*token|节点密钥|¥\d+|checkout|trial|SLA|real-time/i);
  });

  test("keeps product detail chapters in one compact vertical reading flow", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));
    const detailScroller = container.querySelector("[data-mobile-detail-scroller]");
    const layouts = Array.from(detailScroller?.querySelectorAll("[data-mobile-layout]") ?? []);

    expect(layouts.length).toBe(4);
    layouts.forEach((layout) => {
      expect(layout.getAttribute("data-mobile-layout")).toBe("vertical");
      expect(layout.getAttribute("data-mobile-rail")).toBeNull();
    });
    expect(container.querySelector(".company-site-guide-progress")).toBeNull();
    expect(detailScroller?.textContent).not.toMatch(/swipe|滑动/i);
  });

  test("adapts the public site copy from the browser language", () => {
    setBrowserLanguage("zh-CN");
    window.location.hash = "#/site";

    render(createElement(App));

    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.title).toBe("GCC WebOS - 连接世界，轻松开始");
    expect(screen.getByRole("heading", { name: "连接世界，也连接每一次开始" })).not.toBeNull();
    expect(screen.getByText("一眼了解 GCC WebOS，找到适合自己的方式，轻松开启连接体验。")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "每一步，都看得清楚" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "准备好，连接你的下一程" })).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "开始使用" }).length).toBeGreaterThan(0);
    screen.getAllByRole("link", { name: "开始使用" }).forEach((link) => {
      expect(link.getAttribute("href")).toBe(portalRegisterUrl);
    });
    expect(screen.getAllByRole("link", { name: "登录" }).length).toBeGreaterThan(0);
    screen.getAllByRole("link", { name: "登录" }).forEach((link) => {
      expect(link.getAttribute("href")).toBe(portalLoginUrl);
    });
    expect(screen.getByText("支持中心")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "有问题？从这里开始" })).not.toBeNull();
    expect(screen.getAllByText("轻松起步").length).toBeGreaterThan(0);
    expect(screen.getAllByText("随需进阶").length).toBeGreaterThan(0);
    expect(screen.getByText("继续你的 GCC WebOS 体验。")).not.toBeNull();
    expect(screen.getByLabelText("姓名或团队")).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/Portal|服务管理|账户网关/);
    expect(document.body.textContent).not.toMatch(/人民币月度近似套餐|账户区域激活|当前代码未接广告像素|¥\d+|试用|实时状态|SLA/);
  });

  test("lets visitors manually switch language and keeps their choice", () => {
    setBrowserLanguage("en-US");
    window.location.hash = "#/site";

    render(createElement(App));

    expect(screen.getByRole("heading", { name: "Connect to the world. Start with ease." })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "中" }));

    expect(window.localStorage.getItem("gccwebos-site-locale")).toBe("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(screen.getByRole("heading", { name: "连接世界，也连接每一次开始" })).not.toBeNull();

    cleanup();
    window.location.hash = "#/site";
    render(createElement(App));

    expect(document.documentElement.lang).toBe("zh-CN");
    expect(screen.getByRole("heading", { name: "连接世界，也连接每一次开始" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(window.localStorage.getItem("gccwebos-site-locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("heading", { name: "Connect to the world. Start with ease." })).not.toBeNull();
  });

  test("keeps the site hash route when scrolling through public site navigation", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));
    const siteShell = container.querySelector(".company-site-shell");
    const siteNav = screen.getByRole("navigation", { name: "GCC WebOS website navigation" });
    expect(siteShell?.getAttribute("data-active-section")).toBe("top");

    const linkTargets = [
      ["GCC WebOS home", "top"],
      ["Product", "features"],
      ["Plans", "pricing"],
      ["Guide", "how-it-works"],
      ["Contact", "contact"],
      ["Support", "support"],
      ["Explore", "features"]
    ] as const;

    linkTargets.forEach(([linkName, sectionId]) => {
      const section = container.querySelector(`#${sectionId}`) as HTMLElement & {
        scrollIntoView: (options?: ScrollIntoViewOptions) => void;
      };
      const scrollIntoView = vi.fn();
      section.scrollIntoView = scrollIntoView;
      window.location.hash = "#/site";

      const link = ["Product", "Plans", "Guide", "Contact", "Support"].includes(linkName)
        ? within(siteNav).getByRole("link", { name: linkName })
        : screen.getByRole("link", { name: linkName });
      fireEvent.click(link);

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
      expect(window.location.hash).toBe("#/site");
      expect(siteShell?.getAttribute("data-active-section")).toBe(sectionId);
    });
  });

  test("toggles the compact mobile navigation and closes it after navigation", () => {
    setBrowserLanguage("zh-CN");
    window.location.hash = "#/site";

    const { container } = render(createElement(App));
    const header = container.querySelector(".company-site-header");
    const siteNav = screen.getByRole("navigation", { name: "GCC WebOS 官网导航" });
    const menuButton = screen.getByRole("button", { name: "打开导航" });

    expect(header?.getAttribute("data-mobile-menu-open")).toBe("false");
    expect(siteNav.getAttribute("data-mobile-menu-open")).toBe("false");
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(menuButton);

    expect(header?.getAttribute("data-mobile-menu-open")).toBe("true");
    expect(siteNav.getAttribute("data-mobile-menu-open")).toBe("true");
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");

    const pricingSection = container.querySelector("#pricing") as HTMLElement & {
      scrollIntoView: (options?: ScrollIntoViewOptions) => void;
    };
    const scrollIntoView = vi.fn();
    pricingSection.scrollIntoView = scrollIntoView;

    fireEvent.click(within(siteNav).getByRole("link", { name: "套餐" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(window.location.hash).toBe("#/site");
    expect(header?.getAttribute("data-mobile-menu-open")).toBe("false");
    expect(siteNav.getAttribute("data-mobile-menu-open")).toBe("false");
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
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
      ["产品", "#/site/info/features"],
      ["套餐", "#/site/info/pricing"],
      ["使用指南", "#/site/info/download"],
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
    expect(screen.getByText("语言偏好只保存在你的设备上")).not.toBeNull();
    expect(screen.getByText("官网不使用广告追踪塑造体验")).not.toBeNull();
    expect(screen.getByRole("link", { name: "返回官网" })).not.toBeNull();
    expect(container.querySelector(".company-site-info-page")).not.toBeNull();
    expect(container.querySelector(".company-site-info-layout article")).not.toBeNull();
    expect(container.textContent).not.toMatch(
      /subscriptionUrl|token=|Admin API|节点密钥|翻墙|绕过|突破封锁|未经确认|未经验证|生产状态|运行时健康/
    );

    fireEvent.click(screen.getByRole("link", { name: "返回官网" }));

    expect(window.location.hash).toBe("#/site");
    expect(screen.getByRole("heading", { name: "连接世界，也连接每一次开始" })).not.toBeNull();
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
