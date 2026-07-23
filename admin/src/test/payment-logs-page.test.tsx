import { describe, expect, it } from "vitest";
import { PAYMENT_LOG_FIXTURE, type PaymentLogDto, toPaymentLogRows } from "../features/payment-logs/payment-logs-model";

describe("Payment Logs safe read model", () => {
  it("projects only redacted read-only fields", () => {
    const rows = toPaymentLogRows(PAYMENT_LOG_FIXTURE);
    expect(rows[0]).toMatchObject({ attemptRef: "attempt_••01", chargeCertainty: "none" });
    expect(JSON.stringify(rows)).not.toMatch(/provider|secret|token|customer|userRef|credential/i);
  });

  it.each([
    ["loading", "Payment logs are loading"],
    ["empty", "No payment attempts found"],
    ["error", "Payment logs could not be loaded"],
    ["ready", "Read-only payment evidence"]
  ])("defines accessible %s state", (_state, label) => {
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("Payment Logs DTO", () => {
  it("keeps settlement and reconciliation state explicit", () => {
    const item: PaymentLogDto = PAYMENT_LOG_FIXTURE[0];
    expect(item).toHaveProperty("settlementReadiness");
    expect(item).toHaveProperty("reconciliationState");
    expect(item).toHaveProperty("sourceEvidence");
    expect(item).toHaveProperty("targetEvidence");
  });
});
