const PREFIX = "portal-subscription-reset-v1:";
const OPERATION_KEY = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type SubscriptionResetScope = { userRef: string; requestRef: string };
type RecoveryKey = { key: string; persisted: boolean };
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function scopeKey(scope: SubscriptionResetScope) {
  return `${PREFIX}${encodeURIComponent(JSON.stringify([scope.userRef, scope.requestRef]))}`;
}

// Only the random operation ID is retained, never a subscription URL or token.
// Memory is scoped to this UI instance, not a shared account/global cache.
export function createSubscriptionResetRecovery(
  storage: () => RecoveryStorage = () => window.sessionStorage
) {
  const memory = new Map<string, string>();
  return {
    read(scope: SubscriptionResetScope): RecoveryKey | null {
      const name = scopeKey(scope);
      try {
        const key = storage().getItem(name);
        if (key && OPERATION_KEY.test(key)) return { key, persisted: true };
      } catch { /* Optional storage; keep the current UI's in-memory retry. */ }
      const key = memory.get(name);
      return key ? { key, persisted: false } : null;
    },
    save(scope: SubscriptionResetScope, key: string): boolean {
      if (!OPERATION_KEY.test(key)) return false;
      const name = scopeKey(scope);
      memory.set(name, key);
      try {
        const target = storage();
        target.setItem(name, key);
        return target.getItem(name) === key;
      } catch {
        return false;
      }
    },
    clear(scope: SubscriptionResetScope, key: string) {
      const name = scopeKey(scope);
      if (memory.get(name) === key) memory.delete(name);
      try {
        const target = storage();
        // A delayed completion cannot erase a newer operation or other account.
        if (target.getItem(name) === key) target.removeItem(name);
      } catch { /* Retaining a completed key is safe for an idempotent retry. */ }
    }
  };
}
