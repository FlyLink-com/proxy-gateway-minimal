import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ConnectionHealthResult } from "../features/subscriptions/connection-health";
import { ConnectionPanel } from "../features/subscriptions/connection-panel";

function deferredConnectionHealth() {
  let resolve!: (value: ConnectionHealthResult) => void;
  const promise = new Promise<ConnectionHealthResult>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("connection panel", () => {
  test("check button renders a successful diagnostic without saving the session", async () => {
    const onSave = vi.fn();
    const checkConnection = vi.fn(async () => ({
      status: "connected" as const,
      title: "Admin API connected",
      message: "Backend health is reachable and the admin API accepted the console token.",
      healthStatus: 200,
      adminStatus: 200
    }));

    render(createElement(ConnectionPanel, {
      session: { baseUrl: "", consoleToken: "console-secret" },
      onSave,
      checkConnection
    }));

    fireEvent.click(screen.getByRole("button", { name: /check connection/i }));

    expect(await screen.findByText("Admin API connected")).not.toBeNull();
    expect(screen.getByText(/accepted the console token/i)).not.toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(checkConnection).toHaveBeenCalledWith({
      baseUrl: "",
      consoleToken: "console-secret"
    });
  });

  test("changing settings clears the previous diagnostic result", async () => {
    const checkConnection = vi.fn(async () => ({
      status: "connected" as const,
      title: "Admin API connected",
      message: "Backend health is reachable and the admin API accepted the console token.",
      healthStatus: 200,
      adminStatus: 200
    }));

    render(createElement(ConnectionPanel, {
      session: { baseUrl: "", consoleToken: "console-secret" },
      onSave: vi.fn(),
      checkConnection
    }));

    fireEvent.click(screen.getByRole("button", { name: /check connection/i }));
    expect(await screen.findByText("Admin API connected")).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/api base url/i), {
      target: { value: "http://127.0.0.1:3456" }
    });

    await waitFor(() => {
      expect(screen.queryByText("Admin API connected")).toBeNull();
    });
  });

  test("warns when the configured API base URL will not receive the console token", () => {
    render(createElement(ConnectionPanel, {
      session: { baseUrl: "https://evil.example", consoleToken: "console-secret" },
      onSave: vi.fn(),
      checkConnection: vi.fn()
    }));

    expect(screen.getByText("Console token will not be sent")).not.toBeNull();
    expect(screen.getByText(/cross-origin API targets/i)).not.toBeNull();
  });

  test("ignores a pending diagnostic result after settings change", async () => {
    const pending = deferredConnectionHealth();
    const checkConnection = vi.fn(() => pending.promise);

    render(createElement(ConnectionPanel, {
      session: { baseUrl: "", consoleToken: "console-secret" },
      onSave: vi.fn(),
      checkConnection
    }));

    fireEvent.click(screen.getByRole("button", { name: /check connection/i }));
    expect(await screen.findByRole("button", { name: /checking/i })).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/api base url/i), {
      target: { value: "http://127.0.0.1:3456" }
    });

    pending.resolve({
      status: "connected",
      title: "Admin API connected",
      message: "Backend health is reachable and the admin API accepted the console token.",
      healthStatus: 200,
      adminStatus: 200
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /check connection/i })).not.toBeNull();
    });
    expect(screen.queryByText("Admin API connected")).toBeNull();
  });
});
