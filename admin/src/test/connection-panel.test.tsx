import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConnectionPanel } from "../features/subscriptions/connection-panel";

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
});
