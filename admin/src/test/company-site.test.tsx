import { afterEach, describe, expect, test } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../App";

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
    expect(container.textContent).not.toMatch(/Public Site|Brand only|Operator issued|Controlled|Admin API|YAML|官网只承载/);

    const exposedPortalLinks = Array.from(container.querySelectorAll("a"))
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.includes("portal") || href.includes("/use"));

    expect(exposedPortalLinks).toEqual([]);
  });
});
