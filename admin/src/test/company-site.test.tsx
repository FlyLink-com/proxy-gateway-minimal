import { afterEach, describe, expect, test } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../App";

const contactEmail = "gccltd.co@outlook.com";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("company site route", () => {
  test("renders a geek AI company site without exposing the customer portal route", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(screen.getByRole("heading", { name: "GlobalCircle AI" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "申请沙盒访问" })).not.toBeNull();
    expect(screen.getByText(/AI Agent 研发与运营自动化实验室/)).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Log in" })).toBeNull();
    expect(screen.queryByLabelText("邮箱")).toBeNull();
    expect(screen.queryByLabelText("密码")).toBeNull();
    expect(container.textContent).not.toMatch(
      /Public Site|Brand only|Operator issued|Controlled|Admin API|YAML|官网只承载|control plane|data plane|WireGuard|Server Edge|Local Edge|Channel Manager|订阅接入|专属入口|导入客户端|开通流程/
    );

    const exposedPortalLinks = Array.from(container.querySelectorAll("a"))
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.includes("portal") || href.includes("/use"));

    expect(exposedPortalLinks).toEqual([]);
  });

  test("collects qualified business leads through the company email", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    const emailLink = screen.getByRole("link", { name: contactEmail });
    expect(emailLink.getAttribute("href")).toBe(`mailto:${contactEmail}`);
    expect(screen.getByLabelText("公司或机构")).not.toBeNull();
    expect(screen.getByLabelText("联系邮箱")).not.toBeNull();
    expect(screen.getByLabelText("投放或运营目标")).not.toBeNull();
    expect(screen.getByLabelText("技术需求")).not.toBeNull();

    const contactForm = container.querySelector("form.company-site-contact-form");
    expect(contactForm?.getAttribute("action")).toBe(`mailto:${contactEmail}`);
    expect(contactForm?.getAttribute("method")).toBe("post");
    expect(screen.getByRole("button", { name: /发送合作需求/ })).not.toBeNull();
  });

  test("presents AI product scenarios and marketing-operation outcomes", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(screen.getByRole("heading", { name: "从研发探索到广告投放和运营增长" })).not.toBeNull();
    ["Agent Studio", "API Sandbox", "私有知识接入", "运营自动化"].forEach((capability) => {
      expect(screen.getByText(capability)).not.toBeNull();
    });
    ["主流媒体广告投放", "前沿产品研究"].forEach((direction) => {
      expect(screen.getByText(direction)).not.toBeNull();
    });
    expect(screen.getByText("多域名投放落地页")).not.toBeNull();
    expect(screen.getByText(/域名池只承载公开获客/)).not.toBeNull();
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
});
