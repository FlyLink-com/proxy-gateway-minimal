import { describe, expect, test } from "vitest";
import { createSubscriptionResetRecovery } from "../features/user-portal/subscription-reset-recovery";

const FIRST_KEY = "11111111-1111-4111-8111-111111111111";
const SECOND_KEY = "22222222-2222-4222-8222-222222222222";
const FIRST_SCOPE = { userRef: "synthetic_user_a", requestRef: "synthetic_order_a" };

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); }
  };
}

describe("subscription reset recovery", () => {
  test("stores only the operation key and reads it from a new UI instance", () => {
    const storage = memoryStorage();
    const first = createSubscriptionResetRecovery(() => storage);
    expect(first.read(FIRST_SCOPE)).toBeNull();
    expect(storage.entries.size).toBe(0);
    expect(first.save(FIRST_SCOPE, FIRST_KEY)).toBe(true);
    expect([...storage.entries.values()]).toEqual([FIRST_KEY]);
    expect(createSubscriptionResetRecovery(() => storage).read(FIRST_SCOPE)).toEqual({ key: FIRST_KEY, persisted: true });
  });

  test("separates accounts and orders and only clears the matching operation", () => {
    const storage = memoryStorage();
    const recovery = createSubscriptionResetRecovery(() => storage);
    const otherAccount = { ...FIRST_SCOPE, userRef: "synthetic_user_b" };
    const otherOrder = { ...FIRST_SCOPE, requestRef: "synthetic_order_b" };
    recovery.save(FIRST_SCOPE, FIRST_KEY);
    expect(recovery.read(otherAccount)).toBeNull();
    expect(recovery.read(otherOrder)).toBeNull();
    recovery.save(otherAccount, SECOND_KEY);
    recovery.clear(FIRST_SCOPE, FIRST_KEY);
    expect(recovery.read(FIRST_SCOPE)).toBeNull();
    expect(recovery.read(otherAccount)).toEqual({ key: SECOND_KEY, persisted: true });
  });

  test("a delayed acknowledgement does not erase a newer operation", () => {
    const storage = memoryStorage();
    const recovery = createSubscriptionResetRecovery(() => storage);
    recovery.save(FIRST_SCOPE, FIRST_KEY);
    recovery.save(FIRST_SCOPE, SECOND_KEY);
    recovery.clear(FIRST_SCOPE, FIRST_KEY);
    expect(recovery.read(FIRST_SCOPE)).toEqual({ key: SECOND_KEY, persisted: true });
  });

  test("storage errors retain an explicitly nonpersistent in-memory retry", () => {
    const unavailable = () => { throw new Error("storage disabled"); };
    const recovery = createSubscriptionResetRecovery(unavailable);
    expect(recovery.save(FIRST_SCOPE, FIRST_KEY)).toBe(false);
    expect(recovery.read(FIRST_SCOPE)).toEqual({ key: FIRST_KEY, persisted: false });
    expect(createSubscriptionResetRecovery(unavailable).read(FIRST_SCOPE)).toBeNull();
    recovery.clear(FIRST_SCOPE, FIRST_KEY);
    expect(recovery.read(FIRST_SCOPE)).toBeNull();
  });

  test("rejects arbitrary values rather than retaining links or credentials", () => {
    const storage = memoryStorage();
    const recovery = createSubscriptionResetRecovery(() => storage);
    expect(recovery.save(FIRST_SCOPE, "not-an-operation-id")).toBe(false);
    expect(storage.entries.size).toBe(0);
    recovery.save(FIRST_SCOPE, FIRST_KEY);
    const name = [...storage.entries.keys()][0];
    storage.entries.set(name, "untrusted-value");
    expect(createSubscriptionResetRecovery(() => storage).read(FIRST_SCOPE)).toBeNull();
  });
});
