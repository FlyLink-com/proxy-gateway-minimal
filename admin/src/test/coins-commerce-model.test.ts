import { describe, expect, test } from "vitest";
import {
  CHARGE_CERTAINTIES,
  COIN_ORIGINS,
  GRANT_TYPES,
  NEXT_ACTION_TYPES,
  ORDER_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_RESULT_CARD_TYPES,
  PRODUCT_KINDS,
  RECOVERY_ACTION_TYPES,
  derivePaymentResultCardState
} from "../features/user-portal/commerce/commerce-model";

describe("Coins commerce model", () => {
  test("freezes the closed Commerce discriminants", () => {
    const contracts = [
      [COIN_ORIGINS, ["bonus", "paid", "referral"]],
      [PRODUCT_KINDS, ["membership", "traffic_pack"]],
      [GRANT_TYPES, ["access", "traffic"]],
      [ORDER_STATUSES, ["fulfillment_planned", "payment_requested"]],
      [
        PAYMENT_ATTEMPT_STATUSES,
        [
          "entry_unavailable",
          "action_required",
          "pending",
          "confirmed_no_charge",
          "provider_insufficient",
          "risk_rejected",
          "succeeded",
          "unknown",
          "possibly_charged",
          "reversed"
        ]
      ],
      [
        CHARGE_CERTAINTIES,
        [
          "not_charge_capable",
          "confirmed_no_charge",
          "pending",
          "unknown",
          "possibly_charged",
          "charged",
          "reversed"
        ]
      ],
      [NEXT_ACTION_TYPES, ["hosted_redirect", "provider_sdk", "qr", "bank_instructions", "none"]],
      [RECOVERY_ACTION_TYPES, ["go_to_recharge"]],
      [
        PAYMENT_RESULT_CARD_TYPES,
        [
          "success",
          "confirmed_no_charge",
          "pending",
          "provider_insufficient",
          "risk_rejected",
          "unknown",
          "possibly_charged",
          "reversed"
        ]
      ]
    ] as const;

    for (const [actual, expected] of contracts) {
      expect(actual).toEqual(expected);
      expect(Object.isFrozen(actual)).toBe(true);
    }
  });

  test("derives each of the eight normalized payment result cards", () => {
    const cases = [
      ["succeeded", "charged", "success"],
      ["confirmed_no_charge", "confirmed_no_charge", "confirmed_no_charge"],
      ["pending", "pending", "pending"],
      ["provider_insufficient", "confirmed_no_charge", "provider_insufficient"],
      ["risk_rejected", "confirmed_no_charge", "risk_rejected"],
      ["unknown", "unknown", "unknown"],
      ["possibly_charged", "possibly_charged", "possibly_charged"],
      ["reversed", "reversed", "reversed"]
    ] as const;

    expect(cases.map(([status, chargeCertainty]) => (
      derivePaymentResultCardState({ status, chargeCertainty }).type
    ))).toEqual(cases.map(([, , cardType]) => cardType));
  });

  test("rejects impossible status and charge-certainty pairs", () => {
    expect(() => derivePaymentResultCardState({
      status: "succeeded",
      chargeCertainty: "pending"
    })).toThrowError("invalid_payment_result_state");
  });
});
