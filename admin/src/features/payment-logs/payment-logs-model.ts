export type PaymentLogStatus = "entry_unavailable" | "confirmed_no_charge" | "provider_insufficient" | "risk_rejected" | "action_required" | "pending" | "unknown" | "possibly_charged" | "succeeded" | "reversed";
export type PaymentLogChargeCertainty = "not_charge_capable" | "pending" | "confirmed_no_charge" | "charged" | "unknown" | "possibly_charged" | "reversed";
export type PaymentLogReconciliationState = "not_charge_capable" | "confirmed_no_charge" | "pending" | "requires_review" | "charged_uncredited" | "reversed";
export type PaymentLogDto = {
  attemptRef: string;
  orderRef: string;
  status: PaymentLogStatus;
  chargeCertainty: PaymentLogChargeCertainty;
  sourceAttemptRef: string | null;
  targetAttemptRef: string | null;
  switchReason: string | null;
  reconciliationState: PaymentLogReconciliationState;
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
  chargeCertainty: "confirmed_no_charge",
  sourceAttemptRef: null,
  targetAttemptRef: null,
  switchReason: null,
  reconciliationState: "confirmed_no_charge",
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z"
}];

const PAYMENT_LOG_KEYS = ["attemptRef", "orderRef", "providerId", "status", "chargeCertainty", "sourceAttemptRef", "targetAttemptRef", "switchReason", "idempotencyFingerprint", "reconciliationState", "createdAt", "updatedAt"] as const;
const SAFE_PAYMENT_LOG_KEYS = ["attemptRef", "orderRef", "status", "chargeCertainty", "sourceAttemptRef", "targetAttemptRef", "switchReason", "reconciliationState", "createdAt", "updatedAt"] as const;
const PAYMENT_STATUSES = new Set<PaymentLogStatus>(["entry_unavailable", "confirmed_no_charge", "provider_insufficient", "risk_rejected", "action_required", "pending", "unknown", "possibly_charged", "succeeded", "reversed"]);
const CHARGE_CERTAINTIES = new Set<PaymentLogChargeCertainty>(["not_charge_capable", "pending", "confirmed_no_charge", "charged", "unknown", "possibly_charged", "reversed"]);
const RECONCILIATION_STATES = new Set<PaymentLogReconciliationState>(["not_charge_capable", "confirmed_no_charge", "pending", "requires_review", "charged_uncredited", "reversed"]);
const STATUS_CERTAINTY: Record<PaymentLogStatus, PaymentLogChargeCertainty> = { entry_unavailable: "not_charge_capable", confirmed_no_charge: "confirmed_no_charge", provider_insufficient: "confirmed_no_charge", risk_rejected: "confirmed_no_charge", action_required: "pending", pending: "pending", unknown: "unknown", possibly_charged: "possibly_charged", succeeded: "charged", reversed: "reversed" };
const STATUS_RECONCILIATION: Record<PaymentLogStatus, PaymentLogReconciliationState> = { entry_unavailable: "not_charge_capable", confirmed_no_charge: "confirmed_no_charge", provider_insufficient: "confirmed_no_charge", risk_rejected: "confirmed_no_charge", action_required: "pending", pending: "pending", unknown: "requires_review", possibly_charged: "requires_review", succeeded: "charged_uncredited", reversed: "reversed" };
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalIso(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && new Date(value).toISOString() === value;
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
    const status = item.status as PaymentLogStatus;
    if (!exactKeys(item, PAYMENT_LOG_KEYS) || typeof item.attemptRef !== "string" || !SAFE_REF.test(item.attemptRef) || typeof item.orderRef !== "string" || !SAFE_REF.test(item.orderRef) || typeof item.providerId !== "string" || !SAFE_REF.test(item.providerId) || typeof item.status !== "string" || !PAYMENT_STATUSES.has(status) || typeof item.chargeCertainty !== "string" || !CHARGE_CERTAINTIES.has(item.chargeCertainty as PaymentLogChargeCertainty) || STATUS_CERTAINTY[status] !== item.chargeCertainty || !(item.sourceAttemptRef === null || (typeof item.sourceAttemptRef === "string" && SAFE_REF.test(item.sourceAttemptRef))) || !(item.targetAttemptRef === null || (typeof item.targetAttemptRef === "string" && SAFE_REF.test(item.targetAttemptRef))) || !(item.switchReason === null || (typeof item.switchReason === "string" && /^[a-z][a-z0-9_]*$/.test(item.switchReason))) || typeof item.idempotencyFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(item.idempotencyFingerprint) || typeof item.reconciliationState !== "string" || !RECONCILIATION_STATES.has(item.reconciliationState as PaymentLogReconciliationState) || STATUS_RECONCILIATION[status] !== item.reconciliationState || !canonicalIso(item.createdAt) || !canonicalIso(item.updatedAt)) throw new Error("Invalid payment log item");
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
