export const PORTAL_RECHARGE_RETURN_STORAGE_KEY = "gccwebos-portal-recharge-return-v1";

export type PortalRechargeReturnIntent = {
  version: 1;
  orderRef: string;
  captureIdempotencyKey: string;
};

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function sessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function validIntent(value: unknown): value is PortalRechargeReturnIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 3
    && keys.every((key) => ["version", "orderRef", "captureIdempotencyKey"].includes(key))
    && record.version === 1
    && typeof record.orderRef === "string"
    && REFERENCE.test(record.orderRef)
    && typeof record.captureIdempotencyKey === "string"
    && REFERENCE.test(record.captureIdempotencyKey);
}

export function stagePortalRechargeReturn(intent: PortalRechargeReturnIntent) {
  if (!validIntent(intent)) return false;
  const storage = sessionStorage();
  if (!storage) return false;
  try {
    storage.setItem(PORTAL_RECHARGE_RETURN_STORAGE_KEY, JSON.stringify(intent));
    return true;
  } catch {
    return false;
  }
}

export function readPortalRechargeReturn(): PortalRechargeReturnIntent | null {
  const storage = sessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PORTAL_RECHARGE_RETURN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (validIntent(parsed)) return parsed;
    storage.removeItem(PORTAL_RECHARGE_RETURN_STORAGE_KEY);
  } catch {
    try { storage.removeItem(PORTAL_RECHARGE_RETURN_STORAGE_KEY); } catch { /* optional */ }
  }
  return null;
}

export function clearPortalRechargeReturn() {
  try { sessionStorage()?.removeItem(PORTAL_RECHARGE_RETURN_STORAGE_KEY); } catch { /* optional */ }
}
