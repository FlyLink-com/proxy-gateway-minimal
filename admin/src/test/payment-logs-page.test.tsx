import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentLogsPage } from "../pages/payment-logs-page";
import { PAYMENT_LOG_FIXTURE, parsePaymentLogsEnvelope, toPaymentLogRows, type PaymentLogDto } from "../features/payment-logs/payment-logs-model";

const api = (listPaymentLogs: (...args: unknown[]) => Promise<PaymentLogDto[]>) => ({ listPaymentLogs } as never);
afterEach(cleanup);

describe("Payment Logs page", () => {
  it("renders loading and visible READ-ONLY boundary", () => {
    render(<PaymentLogsPage apiClient={api(() => new Promise(() => undefined))} />);
    expect(screen.getByRole("status").textContent).toContain("Payment logs are loading");
    expect(screen.getByText("READ-ONLY")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders empty and error states", async () => {
    const { unmount } = render(<PaymentLogsPage apiClient={api(async () => [])} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("No payment attempts found"));
    unmount();
    render(<PaymentLogsPage apiClient={api(async () => { throw new Error("offline"); })} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Payment logs could not be loaded"));
  });

  it("renders success, frozen status/charge certainty, and local safe-ref search", async () => {
    const items: PaymentLogDto[] = [{ ...PAYMENT_LOG_FIXTURE[0], attemptRef: "attempt_admin_01", orderRef: "order_admin_01", status: "confirmed_no_charge", chargeCertainty: "confirmed_no_charge" }];
    render(<PaymentLogsPage apiClient={api(async () => items)} />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.getAllByText("confirmed_no_charge").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Safe-ref search"), { target: { value: "admin_01" } });
    expect(screen.getByRole("table")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Safe-ref search"), { target: { value: "missing" } });
    expect(screen.getByRole("status").textContent).toContain("No payment attempts found");
  });

  it("applies status filter and exposes accessible names", async () => {
    const listPaymentLogs = vi.fn(async () => PAYMENT_LOG_FIXTURE);
    render(<PaymentLogsPage apiClient={api(listPaymentLogs)} />);
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "pending" } });
    await waitFor(() => expect(listPaymentLogs).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", signal: expect.any(AbortSignal) })));
  });
});

describe("Payment Logs safe DTO", () => {
  it("fails closed on extra keys and strips provider/internal fields", () => {
    const envelope = { items: [{ ...PAYMENT_LOG_FIXTURE[0], providerId: "provider_secret", idempotencyFingerprint: "a".repeat(64) }], nextCursor: null, safety: { readOnly: true, mutationAllowed: false } };
    const safe = parsePaymentLogsEnvelope(envelope);
    expect(safe[0]).not.toHaveProperty("providerId");
    expect(safe[0]).not.toHaveProperty("idempotencyFingerprint");
    expect(() => parsePaymentLogsEnvelope({ ...envelope, extra: true })).toThrow();
    expect(JSON.stringify(toPaymentLogRows(safe))).not.toMatch(/provider|fingerprint|secret/i);
  });
});
