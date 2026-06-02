import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InstallConfigPage } from "../features/install-config/install-config-page";

afterEach(() => {
  cleanup();
});

describe("local deployment console", () => {
  test("renders an env-first runtime configuration editor with gated controls", () => {
    render(createElement(InstallConfigPage));

    expect(screen.getByRole("heading", { name: "Local deployment console" })).not.toBeNull();
    expect(screen.getByText(".env 运行时配置编辑器")).not.toBeNull();
    expect(screen.getByLabelText("Runtime .env")).not.toBeNull();
    expect(screen.getAllByText(".env valid").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Runtime env facts")).not.toBeNull();
    expect(screen.getByText("gccgw dry-run commands")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Apply to server" })).toBeDisabled();
  });

  test("editing env text updates runtime facts and command previews", () => {
    render(createElement(InstallConfigPage));

    const envEditor = screen.getByLabelText("Runtime .env") as HTMLTextAreaElement;
    const nextEnv = envEditor.value
      .replace("PUBLIC_SUBSCRIPTION_BASE_URL=https://control.example.invalid", "PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.imported.example.com")
      .replace("ADMIN_ALLOWED_CIDRS=127.0.0.1/32,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16", "ADMIN_ALLOWED_CIDRS=203.0.113.10/32");

    fireEvent.change(envEditor, {
      target: { value: nextEnv }
    });

    expect(screen.getByText("https://sub.imported.example.com")).not.toBeNull();
    expect(screen.getByText("203.0.113.10/32")).not.toBeNull();
    expect(screen.getByLabelText("gccgw dry-run commands").textContent).toContain(
      "gccgw install configure --dry-run --domain https://sub.imported.example.com"
    );
    expect(screen.getByLabelText("gccgw dry-run commands").textContent).toContain("--management-source 203.0.113.10/32");
    expect(screen.getByLabelText("gccgw dry-run commands").textContent).not.toContain("--execute-production-mutation");
  });

  test("formatting env normalizes runtime text without changing safe placeholders", () => {
    render(createElement(InstallConfigPage));

    const envEditor = screen.getByLabelText("Runtime .env") as HTMLTextAreaElement;
    const compactEnv = envEditor.value
      .replace(/\n\s*\n/g, "\n")
      .replace("PUBLIC_SUBSCRIPTION_BASE_URL=https://control.example.invalid", "PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.format.example.com");

    fireEvent.change(envEditor, {
      target: { value: compactEnv }
    });
    fireEvent.click(screen.getByRole("button", { name: "Format .env" }));

    expect(envEditor.value).toContain("PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.format.example.com");
    expect(envEditor.value).toContain("CONSOLE_TOKEN=__SET_ON_HOST__");
    expect(envEditor.value).toContain("SS_PASSWORD=__SET_ON_HOST__");
  });

  test("missing required env keys blocks derived previews", () => {
    render(createElement(InstallConfigPage));

    fireEvent.change(screen.getByLabelText("Runtime .env"), {
      target: { value: "NODE_ENV=production\n" }
    });

    expect(screen.getByText("CONSOLE_PORT is required")).not.toBeNull();
    expect(screen.getByLabelText("gccgw dry-run commands").textContent).toContain("Fix .env validation errors");
    expect(screen.getByRole("button", { name: "Apply to server" })).toBeDisabled();
  });

  test("raw secrets in env fail closed before command preview", () => {
    render(createElement(InstallConfigPage));

    const envEditor = screen.getByLabelText("Runtime .env") as HTMLTextAreaElement;
    const unsafeEnv = envEditor.value
      .replace("CONSOLE_TOKEN=__SET_ON_HOST__", "CONSOLE_TOKEN=actual-token")
      .replace("SS_PASSWORD=__SET_ON_HOST__", "SS_PASSWORD=actual-password");

    fireEvent.change(envEditor, {
      target: { value: unsafeEnv }
    });

    expect(screen.getByText("CONSOLE_TOKEN must remain __SET_ON_HOST__ in the browser editor")).not.toBeNull();
    expect(screen.getByText("SS_PASSWORD must remain __SET_ON_HOST__ in the browser editor")).not.toBeNull();
    expect(screen.getByLabelText("gccgw dry-run commands").textContent).toContain("Fix .env validation errors");
  });
});
