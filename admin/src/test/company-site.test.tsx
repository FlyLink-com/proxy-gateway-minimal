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
  test("renders a static public site without exposing the customer portal route", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(screen.getByRole("heading", { name: "GlobalCircle Access" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "获取客户入口" })).not.toBeNull();
    expect(screen.getByText(/稳定订阅接入，面向个人和小团队的轻量服务/)).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Log in" })).toBeNull();
    expect(screen.queryByLabelText("邮箱")).toBeNull();
    expect(screen.queryByLabelText("密码")).toBeNull();
    expect(container.textContent).not.toMatch(
      /Public Site|Brand only|Operator issued|Controlled|Admin API|YAML|官网只承载|control plane|data plane|WireGuard|Server Edge|Local Edge|Channel Manager/
    );

    const exposedPortalLinks = Array.from(container.querySelectorAll("a"))
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.includes("portal") || href.includes("/use"));

    expect(exposedPortalLinks).toEqual([]);
  });

  test("collects public contact details through the company email", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    const emailLink = screen.getByRole("link", { name: contactEmail });
    expect(emailLink.getAttribute("href")).toBe(`mailto:${contactEmail}`);
    expect(screen.getByLabelText("称呼")).not.toBeNull();
    expect(screen.getByLabelText("联系方式")).not.toBeNull();
    expect(screen.getByLabelText("需求说明")).not.toBeNull();

    const contactForm = container.querySelector("form.company-site-contact-form");
    expect(contactForm?.getAttribute("action")).toBe(`mailto:${contactEmail}`);
    expect(contactForm?.getAttribute("method")).toBe("post");
    expect(screen.getByRole("button", { name: /发送邮件/ })).not.toBeNull();
  });

  test("presents broad customer scenarios and product outcomes", () => {
    window.location.hash = "#/site";

    const { container } = render(createElement(App));

    expect(screen.getByRole("heading", { name: "覆盖更多常见订阅接入场景" })).not.toBeNull();
    ["个人多端", "小团队协作", "移动办公", "长期维护"].forEach((scenario) => {
      expect(screen.getByText(scenario)).not.toBeNull();
    });
    ["一处开通，多端导入", "入口更新更清晰", "持续服务跟进"].forEach((outcome) => {
      expect(screen.getByText(outcome)).not.toBeNull();
    });

    expect(container.querySelector(".company-site-product-effect")).not.toBeNull();
    expect(container.querySelector(".site-effect-flow")).not.toBeNull();
    expect(container.textContent).not.toMatch(
      /control plane|data plane|WireGuard|Server Edge|Local Edge|Channel Manager/
    );
  });
});
