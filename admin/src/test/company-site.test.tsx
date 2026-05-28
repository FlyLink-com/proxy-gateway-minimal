import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";

const contactEmail = "hello@globalcirclecat.com";

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
    expect(screen.getByRole("link", { name: /获取 API 密钥/ })).not.toBeNull();
    expect(screen.getByRole("link", { name: /开发者工作台/ })).not.toBeNull();
    expect(screen.getByText(/AI Agent 研发与运营自动化实验室/)).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Log in" })).toBeNull();
    expect(screen.queryByLabelText("邮箱")).toBeNull();
    expect(screen.queryByLabelText("密码")).toBeNull();
    expect(container.textContent).not.toMatch(
      /Public Site|Brand only|Operator issued|Controlled|Admin API|YAML|官网只承载|control plane|data plane|WireGuard|Server Edge|Local Edge|Channel Manager|订阅接入|专属入口|导入客户端|开通流程|动态入口/
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
    fireEvent.change(screen.getByLabelText("合作方向"), { target: { value: "预约自动化诊断" } });
    fireEvent.change(screen.getByLabelText("预算或阶段"), { target: { value: "试点预算已确定" } });
    fireEvent.change(screen.getByLabelText("需求说明"), { target: { value: "需要把投放线索接入 AI 复盘流程。" } });
    fireEvent.click(screen.getByRole("button", { name: /提交自动化诊断/ }));

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
    fireEvent.change(screen.getByLabelText("合作方向"), { target: { value: "获取 API 密钥" } });
    fireEvent.change(screen.getByLabelText("需求说明"), { target: { value: "需要 API 试用。" } });
    fireEvent.click(screen.getByRole("button", { name: /提交自动化诊断/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("提交失败");
  });

  test("presents AI product scenarios and marketing-operation outcomes", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(screen.getByRole("heading", { name: "从研发探索到广告投放和运营增长" })).not.toBeNull();
    ["Agent Studio", "API Sandbox", "私有知识接入", "运营自动化"].forEach((capability) => {
      expect(screen.getByText(capability)).not.toBeNull();
    });
    ["主流媒体广告投放", "前沿产品研究"].forEach((direction) => {
      expect(screen.getAllByText(direction).length).toBeGreaterThan(0);
    });
    expect(screen.getByText("多域名投放落地页")).not.toBeNull();
    expect(screen.getByText(/域名池只承载公开获客/)).not.toBeNull();
    expect(screen.getByText("API Sandbox 示例")).not.toBeNull();
    expect(screen.getByText(/curl -X POST/)).not.toBeNull();
    expect(screen.getByText(/"next_action"/)).not.toBeNull();
    ["接收 Webhook", "大模型提炼", "发送企业微信"].forEach((node) => {
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

  test("routes public registration to Telegram QR onboarding instead of the portal", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(screen.getByRole("heading", { name: "Telegram 扫码注册" })).not.toBeNull();
    expect(screen.getByLabelText("Telegram 注册二维码占位")).not.toBeNull();
    expect(screen.getByText(/用户扫码后在机器人私聊完成绑定/)).not.toBeNull();

    const telegramLink = screen.getByRole("link", { name: /扫码进入 Telegram 注册/ });
    expect(telegramLink.getAttribute("href")).toBe("https://t.me/gcaltd0528_bot?start=public_landing");
    expect(telegramLink.getAttribute("target")).toBe("_blank");
    expect(telegramLink.getAttribute("rel")).toContain("noopener");

    expect(container.innerHTML).not.toMatch(/#\/portal|\/use|subscriptionUrl|token=|artifactRef/);
  });

  test("keeps the site hash route when scrolling to Telegram onboarding", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));
    const onboardingSection = container.querySelector("#telegram-onboarding") as HTMLElement & {
      scrollIntoView: (options?: ScrollIntoViewOptions) => void;
    };
    const scrollIntoView = vi.fn();
    onboardingSection.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getByRole("link", { name: /获取 API 密钥/ }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(window.location.hash).toBe("#/site");
  });
});
