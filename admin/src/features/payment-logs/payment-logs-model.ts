export type PaymentLogStatus = "entry_unavailable" | "confirmed_no_charge" | "provider_insufficient" | "risk_rejected" | "action_required" | "pending" | "unknown" | "possibly_charged" | "succeeded" | "reversed";
export type PaymentLogDto = {
  attemptRef: string;
  orderRef: string;
  providerId?: string;
  status: PaymentLogStatus;
  chargeCertainty: string;
  sourceAttemptRef: string | null;
  targetAttemptRef: string | null;
  switchReason: string | null;
  idempotencyFingerprint: string;
  reconciliationState: string;
  settlementReadiness?: string;
  sourceEvidence?: string[];
  targetEvidence?: string[];
  createdAt: string;
  updatedAt: string;
};

export type PaymentLogRow = Omit<PaymentLogDto, "providerId" | "idempotencyFingerprint" | "orderRef" | "attemptRef" | "sourceAttemptRef" | "targetAttemptRef"> & {
  attemptRef: string;
  orderRef: string;
  sourceAttemptRef: string;
  targetAttemptRef: string;
};

export const PAYMENT_LOG_FIXTURE: PaymentLogDto[] = [{
  attemptRef: "attempt_admin_01",
  orderRef: "order_admin_01",
  providerId: "provider_internal",
  status: "confirmed_no_charge",
  chargeCertainty: "none",
  sourceAttemptRef: null,
  targetAttemptRef: null,
  switchReason: null,
  idempotencyFingerprint: "a".repeat(64),
  reconciliationState: "not_required",
  settlementReadiness: "not_ready",
  sourceEvidence: ["recharge intent recorded"],
  targetEvidence: [],
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z"
}];

function maskRef(value: string | null | undefined) {
  if (!value) return "—";
  return value.length <= 8 ? "••••" : `${value.slice(0, 8)}••${value.slice(-2)}`;
}

export function toPaymentLogRows(items: readonly PaymentLogDto[]): PaymentLogRow[] {
  return items.map(({ providerId: _providerId, idempotencyFingerprint: _fingerprint, ...item }) => ({
    ...item,
    attemptRef: maskRef(item.attemptRef),
    orderRef: maskRef(item.orderRef),
    sourceAttemptRef: maskRef(item.sourceAttemptRef),
    targetAttemptRef: maskRef(item.targetAttemptRef),
    sourceEvidence: (item.sourceEvidence ?? []).map(() => "redacted evidence"),
    targetEvidence: (item.targetEvidence ?? []).map(() => "redacted evidence")
  }));
}
