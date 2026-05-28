import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";

const contactEmail = "hello@globalcirclecat.com";

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
  setBrowserLanguage("zh-CN");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("company site route", () => {
  test("renders a geek AI company site without exposing the customer portal route", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(screen.getByRole("heading", { name: "GlobalCircle AI" })).not.toBeNull();
    expect(screen.getByRole("link", { name: /申请试用名额/ })).not.toBeNull();
    expect(screen.getByRole("link", { name: /Telegram 推广/ })).not.toBeNull();
    expect(screen.getByText(/让复杂技术转化为可执行的运营结果/)).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Log in" })).toBeNull();
    expect(screen.queryByLabelText("邮箱")).toBeNull();
    expect(screen.queryByLabelText("密码")).toBeNull();
    expect(container.textContent).not.toMatch(
      /Public Site|Brand only|Operator issued|Controlled|Admin API|YAML|官网只承载|control plane|data plane|WireGuard|Server Edge|Local Edge|Channel Manager|订阅接入|专属入口|导入客户端|开通流程|动态入口|curl -X POST|Webhook|lead intake|后台再通过|受控授权/
    );
    expect(container.innerHTML).not.toMatch(/mailto:|gccltd\.co@outlook\.com/);
    expect(container.innerHTML).not.toMatch(
      /login-after-entry|subscriptionUrl|token=|entryRef|artifactRef|access-grants|#\/portal|\/use/
    );

    const exposedPortalLinks = Array.from(container.querySelectorAll("a"))
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.includes("portal") || href.includes("/use"));

    expect(exposedPortalLinks).toEqual([]);
  });

  test("submits qualified business leads through the public lead intake endpoint", async () => {
    window.location.hash = "#/site";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(createElement(App));

    expect(screen.getByText(contactEmail)).not.toBeNull();
    expect(screen.getByLabelText("公司或机构")).not.toBeNull();
    expect(screen.getByLabelText("工作邮箱")).not.toBeNull();
    expect(screen.getByLabelText("合作方向")).not.toBeNull();
    expect(screen.getByLabelText("预算或阶段")).not.toBeNull();
    expect(screen.getByLabelText("需求说明")).not.toBeNull();

    const contactForm = container.querySelector("form.company-site-contact-form");
    expect(contactForm?.getAttribute("action")).toBeNull();
    expect(contactForm?.getAttribute("method")).toBeNull();

    fireEvent.change(screen.getByLabelText("公司或机构"), { target: { value: "Acme Research" } });
    fireEvent.change(screen.getByLabelText("工作邮箱"), { target: { value: "ops@example.com" } });
    fireEvent.change(screen.getByLabelText("合作方向"), { target: { value: "预约增长诊断" } });
    fireEvent.change(screen.getByLabelText("预算或阶段"), { target: { value: "试点预算已确定" } });
    fireEvent.change(screen.getByLabelText("需求说明"), { target: { value: "需要把投放线索接入 AI 复盘流程。" } });
    fireEvent.click(screen.getByRole("button", { name: /提交合作需求/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/leads",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("Acme Research")
      })
    );
    expect((await screen.findByRole("status")).textContent).toContain("已提交，我们会在 2 小时内联系你");
  });

  test("shows a graceful error when lead intake is unavailable", async () => {
    window.location.hash = "#/site";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    render(createElement(App));

    fireEvent.change(screen.getByLabelText("公司或机构"), { target: { value: "Acme Research" } });
    fireEvent.change(screen.getByLabelText("工作邮箱"), { target: { value: "ops@example.com" } });
    fireEvent.change(screen.getByLabelText("合作方向"), { target: { value: "申请试用名额" } });
    fireEvent.change(screen.getByLabelText("需求说明"), { target: { value: "需要 API 试用。" } });
    fireEvent.click(screen.getByRole("button", { name: /提交合作需求/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("提交失败");
  });

  test("presents AI product scenarios and marketing-operation outcomes", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(screen.getByRole("heading", { name: "从研发探索到广告投放和运营增长" })).not.toBeNull();
    ["智能体方案设计", "产品样品验证", "企业资料整理", "运营自动化"].forEach((capability) => {
      expect(screen.getByText(capability)).not.toBeNull();
    });
    ["主流媒体广告投放", "前沿产品研究"].forEach((direction) => {
      expect(screen.getAllByText(direction).length).toBeGreaterThan(0);
    });
    expect(screen.getByText("多域名投放落地页")).not.toBeNull();
    expect(screen.getByText(/用独立域名承载公开获客/)).not.toBeNull();
    expect(screen.getByText("增长实验样板")).not.toBeNull();
    expect(screen.getByText("线索进入后自动归类")).not.toBeNull();
    expect(screen.getByText(/识别投放来源、客户意图和优先级/)).not.toBeNull();
    ["提交需求", "智能分层", "专人跟进"].forEach((node) => {
      expect(screen.getByText(node)).not.toBeNull();
    });
    ["广告投放线索分流", "私域用户运营", "企业知识助手", "内容生产工作流"].forEach((scenario) => {
      expect(screen.getByText(scenario)).not.toBeNull();
    });
    ["获客链路更短", "运营动作可追踪", "AI 工作流可复用"].forEach((outcome) => {
      expect(screen.getByText(outcome)).not.toBeNull();
    });

    expect(container.querySelector(".company-site-product-effect")).not.toBeNull();
    expect(container.querySelector(".site-effect-flow")).not.toBeNull();
    expect(container.textContent).not.toMatch(
      /control plane|data plane|WireGuard|Server Edge|Local Edge|Channel Manager|订阅接入|专属入口|导入客户端/
    );
  });

  test("keeps Telegram as a promotion-only external link instead of registration onboarding", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    const telegramLink = screen.getByRole("link", { name: /Telegram 推广/ });
    expect(telegramLink.getAttribute("href")).toBe("https://t.me/gcaltd0528_bot");
    expect(telegramLink.getAttribute("target")).toBe("_blank");
    expect(telegramLink.getAttribute("rel")).toContain("noopener");

    expect(screen.queryByRole("heading", { name: "Telegram 扫码注册" })).toBeNull();
    expect(screen.queryByLabelText("Telegram 注册二维码占位")).toBeNull();
    expect(container.textContent).not.toMatch(/扫码进入 Telegram 后|获取后续服务入口|用户注册优先走 Telegram|Public registration starts from Telegram/);
    expect(container.innerHTML).not.toMatch(/#\/portal|\/use|subscriptionUrl|token=|artifactRef/);
  });

  test("keeps the site hash route when scrolling through public site navigation", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));
    const siteShell = container.querySelector(".company-site-shell");
    expect(siteShell?.getAttribute("data-active-section")).toBe("top");

    const linkTargets = [
      ["GlobalCircle AI 首页", "top"],
      ["能力", "capabilities"],
      ["场景", "scenarios"],
      ["合作", "delivery"],
      ["联系", "contact"],
      ["申请试用名额", "contact"],
      ["查看服务流程", "api-proof"]
    ] as const;

    linkTargets.forEach(([linkName, sectionId]) => {
      const section = container.querySelector(`#${sectionId}`) as HTMLElement & {
        scrollIntoView: (options?: ScrollIntoViewOptions) => void;
      };
      const scrollIntoView = vi.fn();
      section.scrollIntoView = scrollIntoView;
      window.location.hash = "#/site";

      fireEvent.click(screen.getByRole("link", { name: linkName }));

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
      expect(window.location.hash).toBe("#/site");
      expect(siteShell?.getAttribute("data-active-section")).toBe(sectionId);
    });
  });

  test("switches public site copy and document metadata for English browsers", () => {
    setBrowserLanguage("en-US");
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("GlobalCircle AI - Agent R&D and Growth Automation");
    expect(screen.getByText(/turn AI R&D, growth automation/)).not.toBeNull();
    expect(screen.getByRole("link", { name: /Request Trial Access/ })).not.toBeNull();
    expect(screen.getByRole("link", { name: /Telegram Promotion/ })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Register with Telegram QR" })).toBeNull();
    expect(screen.getByLabelText("Company or Organization")).not.toBeNull();
    expect(container.textContent).not.toMatch(/极客型团队|合作方向|扫码进入 Telegram 后|公司或机构/);
  });
});
