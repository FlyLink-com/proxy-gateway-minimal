export type PaymentLogStatus = "entry_unavailable" | "confirmed_no_charge" | "provider_insufficient" | "risk_rejected" | "action_required" | "pending" | "unknown" | "possibly_charged" | "succeeded" | "reversed";
export type PaymentLogDto = {
  attemptRef: string;
  orderRef: string;
  status: PaymentLogStatus;
  chargeCertainty: string;
  sourceAttemptRef: string | null;
  targetAttemptRef: string | null;
  switchReason: string | null;
  reconciliationState: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentLogRow = Omit<PaymentLogDto, "orderRef" | "attemptRef" | "sourceAttemptRef" | "targetAttemptRef"> & {
  attemptRef: string;
  orderRef: string;
  sourceAttemptRef: string;
  targetAttemptRef: string;
};

export const PAYMENT_LOG_FIXTURE: PaymentLogDto[] = [{
  attemptRef: "attempt_admin_01",
  orderRef: "order_admin_01",
  status: "confirmed_no_charge",
  chargeCertainty: "none",
  sourceAttemptRef: null,
  targetAttemptRef: null,
  switchReason: null,
  reconciliationState: "not_required",
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z"
}];

const PAYMENT_LOG_KEYS = ["attemptRef", "orderRef", "providerId", "status", "chargeCertainty", "sourceAttemptRef", "targetAttemptRef", "switchReason", "idempotencyFingerprint", "reconciliationState", "createdAt", "updatedAt"] as const;
const SAFE_PAYMENT_LOG_KEYS = ["attemptRef", "orderRef", "status", "chargeCertainty", "sourceAttemptRef", "targetAttemptRef", "switchReason", "reconciliationState", "createdAt", "updatedAt"] as const;
const PAYMENT_STATUSES = new Set<PaymentLogStatus>(["entry_unavailable", "confirmed_no_charge", "provider_insufficient", "risk_rejected", "action_required", "pending", "unknown", "possibly_charged", "succeeded", "reversed"]);

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function parsePaymentLogsEnvelope(value: unknown): PaymentLogDto[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid payment logs response");
  const envelope = value as Record<string, unknown>;
  if (!exactKeys(envelope, ["items", "nextCursor", "safety"]) || !Array.isArray(envelope.items)) throw new Error("Invalid payment logs envelope");
  if (!(envelope.nextCursor === null || Number.isSafeInteger(envelope.nextCursor))) throw new Error("Invalid payment logs cursor");
  const safety = envelope.safety;
  if (!safety || typeof safety !== "object" || Array.isArray(safety) || !exactKeys(safety as Record<string, unknown>, ["readOnly", "mutationAllowed"]) || (safety as Record<string, unknown>).readOnly !== true || (safety as Record<string, unknown>).mutationAllowed !== false) throw new Error("Invalid payment logs safety envelope");
  return envelope.items.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Invalid payment log item");
    const item = candidate as Record<string, unknown>;
    if (!exactKeys(item, PAYMENT_LOG_KEYS) || typeof item.attemptRef !== "string" || typeof item.orderRef !== "string" || typeof item.status !== "string" || !PAYMENT_STATUSES.has(item.status as PaymentLogStatus) || typeof item.chargeCertainty !== "string" || !(item.sourceAttemptRef === null || typeof item.sourceAttemptRef === "string") || !(item.targetAttemptRef === null || typeof item.targetAttemptRef === "string") || !(item.switchReason === null || typeof item.switchReason === "string") || typeof item.idempotencyFingerprint !== "string" || typeof item.reconciliationState !== "string" || typeof item.createdAt !== "string" || typeof item.updatedAt !== "string") throw new Error("Invalid payment log item");
    return Object.fromEntries(SAFE_PAYMENT_LOG_KEYS.map((key) => [key, item[key]])) as PaymentLogDto;
  });
}

function maskRef(value: string | null | undefined) {
  if (!value) return "—";
  return value.length <= 8 ? "••••" : `${value.slice(0, 8)}••${value.slice(-2)}`;
}

export function toPaymentLogRows(items: readonly PaymentLogDto[]): PaymentLogRow[] {
  return items.map((item) => ({
    attemptRef: maskRef(item.attemptRef),
    orderRef: maskRef(item.orderRef),
    status: item.status,
    chargeCertainty: item.chargeCertainty,
    sourceAttemptRef: maskRef(item.sourceAttemptRef),
    targetAttemptRef: maskRef(item.targetAttemptRef),
    switchReason: item.switchReason,
    reconciliationState: item.reconciliationState,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }));
}
