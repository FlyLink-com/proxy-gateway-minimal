import assert from "node:assert/strict";
import test from "node:test";
import * as coinWalletDomain from "../services/platform/coin-wallet-domain.mjs";
import {
  COIN_ALLOCATION_PRIORITY,
  COIN_TYPES,
  allocateCoinLots,
  assertCoinUnits,
  canonicalWalletRequestDigest,
  normalizeAcceptedCoinTypes,
  normalizeCoinType,
  projectCoinWalletBalance
} from "../services/platform/coin-wallet-domain.mjs";

const { assertPositiveCoinUnits } = coinWalletDomain;
const NOW = "2026-07-23T12:00:00.000Z";
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function assertCoinWalletError(error, code, field) {
  return error?.code === code && (!field || error.field === field);
}

function lot({
  lotRef,
  coinType,
  availableUnits,
  pendingUnits = 0,
  heldUnits = 0,
  expiresAt = null,
  createdAt = "2026-07-01T00:00:00.000Z"
}) {
  return {
    lotRef,
    coinType,
    availableUnits,
    pendingUnits,
    heldUnits,
    expiresAt,
    createdAt
  };
}

test("Coin domain exposes the closed Coin type and allocation-priority contracts", () => {
  assert.deepEqual([...COIN_TYPES], ["paid_coins", "bonus_coins", "reward_coins"]);
  assert.deepEqual([...COIN_ALLOCATION_PRIORITY], ["bonus_coins", "paid_coins", "reward_coins"]);
  assert.equal(Object.isFrozen(COIN_TYPES), true);
  assert.equal(Object.isFrozen(COIN_ALLOCATION_PRIORITY), true);
});

test("assertCoinUnits accepts zero, positive values, and the maximum safe integer", () => {
  assert.equal(assertCoinUnits(0, "amountUnits"), 0);
  assert.equal(assertCoinUnits(42, "amountUnits"), 42);
  assert.equal(assertCoinUnits(MAX_SAFE, "amountUnits"), MAX_SAFE);
});

test("assertCoinUnits rejects negative, fractional, and unsafe values", () => {
  for (const value of [-1, 1.5, MAX_SAFE + 1]) {
    assert.throws(
      () => assertCoinUnits(value, "amountUnits"),
      (error) => assertCoinWalletError(error, "invalid_coin_units", "amountUnits")
    );
  }
});

test("assertPositiveCoinUnits accepts positive safe integers and preserves zero-capable assertCoinUnits", () => {
  assert.equal(assertPositiveCoinUnits(1, "amountUnits"), 1);
  assert.equal(assertPositiveCoinUnits(42, "amountUnits"), 42);
  assert.equal(assertPositiveCoinUnits(MAX_SAFE, "amountUnits"), MAX_SAFE);
  assert.equal(assertCoinUnits(0, "availableUnits"), 0);
});

test("assertPositiveCoinUnits rejects zero, negative, fractional, and unsafe values", () => {
  for (const value of [0, -1, 1.5, MAX_SAFE + 1]) {
    assert.throws(
      () => assertPositiveCoinUnits(value, "amountUnits"),
      (error) => assertCoinWalletError(error, "invalid_coin_units", "amountUnits")
    );
  }
});

test("Coin type normalization is closed and accepted types cannot contain duplicates", () => {
  assert.equal(normalizeCoinType("paid_coins"), "paid_coins");
  assert.deepEqual(normalizeAcceptedCoinTypes(["bonus_coins", "paid_coins"]), [
    "bonus_coins",
    "paid_coins"
  ]);
  assert.throws(
    () => normalizeCoinType("gift_coins"),
    (error) => assertCoinWalletError(error, "invalid_coin_type", "coinType")
  );
  assert.throws(
    () => normalizeAcceptedCoinTypes(["paid_coins", "paid_coins"]),
    (error) => assertCoinWalletError(error, "duplicate_coin_type", "acceptedCoinTypes")
  );
});

for (const [name, createValues] of [
  ["hole-only", () => Array(1)],
  ["leading-hole", () => Object.assign(Array(2), { 1: "reward_coins" })],
  ["trailing-hole", () => Object.assign(["paid_coins"], { length: 2 })]
]) {
  test(`accepted Coin sets reject ${name} sparse arrays as invalid Coin types`, () => {
    assert.throws(
      () => normalizeAcceptedCoinTypes(createValues()),
      (error) => assertCoinWalletError(error, "invalid_coin_type", "coinType")
    );
  });
}

test("accepted Coin sets normalize to frozen allocation priority without mutating input", () => {
  const firstInput = Object.freeze(["reward_coins", "bonus_coins"]);
  const secondInput = ["bonus_coins", "reward_coins"];
  const secondSnapshot = structuredClone(secondInput);
  const first = normalizeAcceptedCoinTypes(firstInput);
  const second = normalizeAcceptedCoinTypes(secondInput);

  assert.deepEqual(first, ["bonus_coins", "reward_coins"]);
  assert.deepEqual(second, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(second), true);
  assert.deepEqual(firstInput, ["reward_coins", "bonus_coins"]);
  assert.deepEqual(secondInput, secondSnapshot);
});

test("canonical wallet request digest has a stable domain-separated vector and is key-order independent", () => {
  const first = canonicalWalletRequestDigest("credit_coins", {
    walletRef: "wallet_1",
    coinType: "paid_coins",
    amountUnits: 12,
    sourceType: "recharge_settlement",
    sourceRef: "settlement_1"
  });
  const reordered = canonicalWalletRequestDigest("credit_coins", {
    sourceRef: "settlement_1",
    amountUnits: 12,
    coinType: "paid_coins",
    walletRef: "wallet_1",
    sourceType: "recharge_settlement"
  });

  assert.equal(first, "ceba286ce3ecad2da1c57468df704745790abc45f452e02100a76d6388c65cd2");
  assert.equal(reordered, first);
  assert.equal(
    canonicalWalletRequestDigest("confirm_reward", {
      walletRef: "wallet_1",
      coinType: "paid_coins",
      amountUnits: 12,
      sourceType: "recharge_settlement",
      sourceRef: "settlement_1"
    }) === first,
    false
  );
});

test("canonical wallet request digest treats accepted Coin types as a set", () => {
  const base = {
    walletRef: "wallet_1",
    purpose: "commerce_order",
    purposeRef: "order_1",
    amountUnits: 12,
    expiresAt: "2026-07-23T12:05:00.000Z"
  };
  const first = canonicalWalletRequestDigest("create_coin_hold", {
    ...base,
    acceptedCoinTypes: ["reward_coins", "bonus_coins"]
  });
  const reordered = canonicalWalletRequestDigest("create_coin_hold", {
    ...base,
    acceptedCoinTypes: ["bonus_coins", "reward_coins"]
  });
  const differentSet = canonicalWalletRequestDigest("create_coin_hold", {
    ...base,
    acceptedCoinTypes: ["bonus_coins", "paid_coins"]
  });

  assert.equal(reordered, first);
  assert.notEqual(differentSet, first);
});

test("canonical confirmation digest is stable, key-order independent, and binds lot and amount", () => {
  const first = canonicalWalletRequestDigest("confirm_coin_credit", {
    lotRef: "lot_1",
    amountUnits: 5
  });
  const reordered = canonicalWalletRequestDigest("confirm_coin_credit", {
    amountUnits: 5,
    lotRef: "lot_1"
  });

  assert.equal(first, "ee1959eb800a59071c818db1016d67da4258e6be206a19f2480e3bd2000de1c7");
  assert.equal(reordered, first);
  assert.notEqual(canonicalWalletRequestDigest("confirm_coin_credit", {
    lotRef: "lot_2",
    amountUnits: 5
  }), first);
  assert.notEqual(canonicalWalletRequestDigest("confirm_coin_credit", {
    lotRef: "lot_1",
    amountUnits: 6
  }), first);
});

test("canonical confirmation digest rejects extra and non-normalized fields", () => {
  assert.throws(
    () => canonicalWalletRequestDigest("confirm_coin_credit", {
      lotRef: "lot_1",
      amountUnits: 5,
      requestDigest: "caller-value"
    }),
    (error) => assertCoinWalletError(error, "unexpected_wallet_request_field", "requestDigest")
  );
  assert.throws(
    () => canonicalWalletRequestDigest("confirm_coin_credit", {
      lotRef: " lot_1",
      amountUnits: 5
    }),
    (error) => assertCoinWalletError(error, "non_normalized_wallet_request", "lotRef")
  );
});

test("canonical wallet request digest rejects extra or non-normalized business fields", () => {
  const input = {
    walletRef: "wallet_1",
    coinType: "paid_coins",
    amountUnits: 12,
    sourceType: "recharge_settlement",
    sourceRef: "settlement_1"
  };

  assert.throws(
    () => canonicalWalletRequestDigest("credit_coins", { ...input, requestDigest: "caller-value" }),
    (error) => assertCoinWalletError(error, "unexpected_wallet_request_field", "requestDigest")
  );
  assert.throws(
    () => canonicalWalletRequestDigest("credit_coins", { ...input, sourceRef: " settlement_1" }),
    (error) => assertCoinWalletError(error, "non_normalized_wallet_request", "sourceRef")
  );
});

test("canonical wallet request digest rejects non-enumerable unexpected own keys", () => {
  const input = {
    walletRef: "wallet_1",
    coinType: "paid_coins",
    amountUnits: 12,
    sourceType: "recharge_settlement",
    sourceRef: "settlement_1"
  };
  Object.defineProperty(input, "requestDigest", { value: "caller-value" });

  assert.throws(
    () => canonicalWalletRequestDigest("credit_coins", input),
    (error) => assertCoinWalletError(error, "unexpected_wallet_request_field", "requestDigest")
  );
});

test("canonical wallet request digest rejects Symbol own keys", () => {
  const input = {
    walletRef: "wallet_1",
    coinType: "paid_coins",
    amountUnits: 12,
    sourceType: "recharge_settlement",
    sourceRef: "settlement_1"
  };
  Object.defineProperty(input, Symbol("requestDigest"), { value: "caller-value" });

  assert.throws(
    () => canonicalWalletRequestDigest("credit_coins", input),
    (error) => error?.code === "unexpected_wallet_request_field"
  );
});

test("allocator uses earliest-expiry bonus lots before later bonuses, paid, and reward lots", () => {
  const allocations = allocateCoinLots({
    lots: [
      lot({ lotRef: "reward", coinType: "reward_coins", availableUnits: 5 }),
      lot({ lotRef: "paid", coinType: "paid_coins", availableUnits: 5 }),
      lot({ lotRef: "bonus-later", coinType: "bonus_coins", availableUnits: 4, expiresAt: "2026-08-02T00:00:00.000Z" }),
      lot({ lotRef: "bonus-sooner", coinType: "bonus_coins", availableUnits: 3, expiresAt: "2026-08-01T00:00:00.000Z" })
    ],
    amountUnits: 15,
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
    now: NOW
  });

  assert.deepEqual(allocations, [
    { lotRef: "bonus-sooner", coinType: "bonus_coins", allocationSequence: 1, allocatedUnits: 3 },
    { lotRef: "bonus-later", coinType: "bonus_coins", allocationSequence: 2, allocatedUnits: 4 },
    { lotRef: "paid", coinType: "paid_coins", allocationSequence: 3, allocatedUnits: 5 },
    { lotRef: "reward", coinType: "reward_coins", allocationSequence: 4, allocatedUnits: 3 }
  ]);
  assert.equal(Object.isFrozen(allocations), true);
  assert.equal(Object.isFrozen(allocations[0]), true);
});

test("allocator applies deterministic time and lot-reference ties within one Coin type", () => {
  const allocations = allocateCoinLots({
    lots: [
      lot({ lotRef: "bonus-z", coinType: "bonus_coins", availableUnits: 1, expiresAt: "2026-08-01T00:00:00.000Z", createdAt: "2026-07-02T00:00:00.000Z" }),
      lot({ lotRef: "bonus-b", coinType: "bonus_coins", availableUnits: 1, expiresAt: "2026-08-01T00:00:00.000Z", createdAt: "2026-07-01T00:00:00.000Z" }),
      lot({ lotRef: "bonus-a", coinType: "bonus_coins", availableUnits: 1, expiresAt: "2026-08-01T00:00:00.000Z", createdAt: "2026-07-01T00:00:00.000Z" })
    ],
    amountUnits: 3,
    acceptedCoinTypes: ["bonus_coins"],
    now: NOW
  });

  assert.deepEqual(allocations.map((entry) => entry.lotRef), ["bonus-a", "bonus-b", "bonus-z"]);
});

test("allocator selects finite-expiry bonus lots before non-expiring bonus lots", () => {
  const allocations = allocateCoinLots({
    lots: [
      lot({ lotRef: "bonus-never", coinType: "bonus_coins", availableUnits: 1 }),
      lot({
        lotRef: "bonus-expiring",
        coinType: "bonus_coins",
        availableUnits: 1,
        expiresAt: "2026-08-01T00:00:00.000Z"
      })
    ],
    amountUnits: 2,
    acceptedCoinTypes: ["bonus_coins"],
    now: NOW
  });

  assert.deepEqual(allocations.map((entry) => entry.lotRef), ["bonus-expiring", "bonus-never"]);
});

test("allocator uses fixed code-unit ordering for non-ASCII lot-reference ties", () => {
  const allocations = allocateCoinLots({
    lots: [
      lot({ lotRef: "ä", coinType: "paid_coins", availableUnits: 1 }),
      lot({ lotRef: "z", coinType: "paid_coins", availableUnits: 1 })
    ],
    amountUnits: 2,
    acceptedCoinTypes: ["paid_coins"],
    now: NOW
  });

  assert.deepEqual(allocations.map((entry) => entry.lotRef), ["z", "ä"]);
});

test("allocator filters rejected types and supports reward-only allocation", () => {
  const allocations = allocateCoinLots({
    lots: [
      lot({ lotRef: "bonus", coinType: "bonus_coins", availableUnits: 8 }),
      lot({ lotRef: "reward", coinType: "reward_coins", availableUnits: 8 })
    ],
    amountUnits: 5,
    acceptedCoinTypes: ["reward_coins"],
    now: NOW
  });

  assert.deepEqual(allocations, [
    { lotRef: "reward", coinType: "reward_coins", allocationSequence: 1, allocatedUnits: 5 }
  ]);
});

test("allocator excludes expired bonus lots and produces an empty closed result when funds are insufficient", () => {
  const lots = [
    lot({ lotRef: "expired", coinType: "bonus_coins", availableUnits: 4, expiresAt: NOW }),
    lot({ lotRef: "available", coinType: "paid_coins", availableUnits: 2 })
  ];
  const snapshot = structuredClone(lots);
  const allocations = allocateCoinLots({
    lots,
    amountUnits: 3,
    acceptedCoinTypes: ["bonus_coins", "paid_coins"],
    now: NOW
  });

  assert.deepEqual(allocations, []);
  assert.equal(Object.isFrozen(allocations), true);
  assert.deepEqual(lots, snapshot);
});

test("allocator rejects aggregate overflow before attempting a partial allocation", () => {
  assert.throws(
    () => allocateCoinLots({
      lots: [
        lot({ lotRef: "max", coinType: "paid_coins", availableUnits: MAX_SAFE }),
        lot({ lotRef: "one", coinType: "paid_coins", availableUnits: 1 })
      ],
      amountUnits: MAX_SAFE,
      acceptedCoinTypes: ["paid_coins"],
      now: NOW
    }),
    (error) => assertCoinWalletError(error, "coin_units_overflow", "availableUnits")
  );
});

test("wallet balance projection keeps available and held buckets separate without mutating inputs", () => {
  const wallet = { walletRef: "wallet_1", status: "active", version: 7 };
  const lots = [
    lot({ lotRef: "paid", coinType: "paid_coins", availableUnits: 10, heldUnits: 2 }),
    lot({ lotRef: "bonus", coinType: "bonus_coins", availableUnits: 4, pendingUnits: 1 }),
    lot({ lotRef: "reward", coinType: "reward_coins", availableUnits: 3 })
  ];
  const activeAllocations = [
    { lotRef: "paid", allocatedUnits: 2 }
  ];
  const before = structuredClone({ wallet, lots, activeAllocations });

  assert.deepEqual(projectCoinWalletBalance({ wallet, lots, activeAllocations }), {
    exists: true,
    walletRef: "wallet_1",
    status: "active",
    version: 7,
    totals: { paid_coins: 10, bonus_coins: 4, reward_coins: 3 },
    spendableUnits: 17,
    heldUnits: 2,
    pendingUnits: 1
  });
  assert.deepEqual({ wallet, lots, activeAllocations }, before);
});

test("wallet balance projection accepts held units greater than the remaining available bucket", () => {
  assert.deepEqual(projectCoinWalletBalance({
    wallet: { walletRef: "wallet_1", status: "active", version: 8 },
    lots: [
      lot({ lotRef: "paid", coinType: "paid_coins", availableUnits: 1, heldUnits: 2 })
    ],
    activeAllocations: [
      { lotRef: "paid", allocatedUnits: 2 }
    ]
  }), {
    exists: true,
    walletRef: "wallet_1",
    status: "active",
    version: 8,
    totals: { paid_coins: 1, bonus_coins: 0, reward_coins: 0 },
    spendableUnits: 1,
    heldUnits: 2,
    pendingUnits: 0
  });
});

test("wallet balance projection rejects incomplete, excessive, missing, and unknown active allocations", () => {
  const wallet = { walletRef: "wallet_1", status: "active", version: 9 };
  const heldLot = lot({
    lotRef: "paid",
    coinType: "paid_coins",
    availableUnits: 10,
    heldUnits: 2
  });
  for (const activeAllocations of [
    [{ lotRef: "paid", allocatedUnits: 1 }],
    [{ lotRef: "paid", allocatedUnits: 3 }],
    [],
    [{ lotRef: "unknown", allocatedUnits: 2 }]
  ]) {
    assert.throws(
      () => projectCoinWalletBalance({ wallet, lots: [heldLot], activeAllocations }),
      (error) => assertCoinWalletError(error, "invalid_active_allocation")
    );
  }
});

test("wallet balance projection returns a zero non-created wallet without inputs", () => {
  assert.deepEqual(projectCoinWalletBalance({ wallet: null, lots: [], activeAllocations: [] }), {
    exists: false,
    status: "not_created",
    version: 0,
    totals: { paid_coins: 0, bonus_coins: 0, reward_coins: 0 },
    spendableUnits: 0,
    heldUnits: 0,
    pendingUnits: 0
  });
});
