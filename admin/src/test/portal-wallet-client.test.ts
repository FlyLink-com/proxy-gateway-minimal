import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createHttpUserPortalClient,
  createLocalUserPortalClient
} from "../features/user-portal/user-portal-client";
import {
  PortalWalletClientError,
  type PortalWalletClient,
  type PortalWalletLedgerEntry
} from "../features/user-portal/wallet";

const ACTIVE_SUMMARY = {
  status: "active",
  version: 3,
  balances: {
    paidCoins: 20,
    bonusCoins: 4,
    rewardCoins: 1
  },
  spendableUnits: 25,
  heldUnits: 2,
  pendingUnits: 0
};

const NOT_CREATED_SUMMARY = {
  status: "not_created",
  version: 0,
  balances: {
    paidCoins: 0,
    bonusCoins: 0,
    rewardCoins: 0
  },
  spendableUnits: 0,
  heldUnits: 0,
  pendingUnits: 0
};

const VALID_LEDGER_ENTRIES: PortalWalletLedgerEntry[] = [
  {
    entryRef: "entry_credit_007",
    category: "credit",
    coinType: "paid_coins",
    amountUnits: 5,
    availableDeltaUnits: null,
    pendingDeltaUnits: null,
    heldDeltaUnits: null,
    totalDeltaUnits: 5,
    relatedOrderRef: null,
    occurredAt: "2026-07-27T12:07:00.000Z"
  },
  {
    entryRef: "entry_pending_available_006",
    category: "pending_to_available",
    coinType: "bonus_coins",
    amountUnits: 5,
    availableDeltaUnits: 5,
    pendingDeltaUnits: -5,
    heldDeltaUnits: 0,
    totalDeltaUnits: 0,
    relatedOrderRef: "order_wallet_006",
    occurredAt: "2026-07-27T12:06:00.000Z"
  },
  {
    entryRef: "entry_available_held_005",
    category: "available_to_held",
    coinType: "reward_coins",
    amountUnits: 5,
    availableDeltaUnits: -5,
    pendingDeltaUnits: 0,
    heldDeltaUnits: 5,
    totalDeltaUnits: 0,
    relatedOrderRef: "order_wallet_005",
    occurredAt: "2026-07-27T12:05:00.000Z"
  },
  {
    entryRef: "entry_held_available_004",
    category: "held_to_available",
    coinType: "paid_coins",
    amountUnits: 5,
    availableDeltaUnits: 5,
    pendingDeltaUnits: 0,
    heldDeltaUnits: -5,
    totalDeltaUnits: 0,
    relatedOrderRef: "order_wallet_004",
    occurredAt: "2026-07-27T12:04:00.000Z"
  },
  {
    entryRef: "entry_held_consumed_003",
    category: "held_to_consumed",
    coinType: "bonus_coins",
    amountUnits: 5,
    availableDeltaUnits: 0,
    pendingDeltaUnits: 0,
    heldDeltaUnits: -5,
    totalDeltaUnits: -5,
    relatedOrderRef: "order_wallet_003",
    occurredAt: "2026-07-27T12:03:00.000Z"
  },
  {
    entryRef: "entry_held_expired_002",
    category: "held_to_expired",
    coinType: "reward_coins",
    amountUnits: 5,
    availableDeltaUnits: 0,
    pendingDeltaUnits: 0,
    heldDeltaUnits: -5,
    totalDeltaUnits: -5,
    relatedOrderRef: null,
    occurredAt: "2026-07-27T12:02:00.000Z"
  },
  {
    entryRef: "entry_available_expired_001",
    category: "available_to_expired",
    coinType: "paid_coins",
    amountUnits: 5,
    availableDeltaUnits: -5,
    pendingDeltaUnits: 0,
    heldDeltaUnits: 0,
    totalDeltaUnits: -5,
    relatedOrderRef: null,
    occurredAt: "2026-07-27T12:01:00.000Z"
  }
];

const FORMULA_CASES: Array<{
  valid: PortalWalletLedgerEntry;
  invalid: Record<string, unknown>;
}> = [
  {
    valid: VALID_LEDGER_ENTRIES[0],
    invalid: {
      ...VALID_LEDGER_ENTRIES[0],
      availableDeltaUnits: 0
    }
  },
  {
    valid: VALID_LEDGER_ENTRIES[1],
    invalid: {
      ...VALID_LEDGER_ENTRIES[1],
      pendingDeltaUnits: 5
    }
  },
  {
    valid: VALID_LEDGER_ENTRIES[2],
    invalid: {
      ...VALID_LEDGER_ENTRIES[2],
      heldDeltaUnits: -5
    }
  },
  {
    valid: VALID_LEDGER_ENTRIES[3],
    invalid: {
      ...VALID_LEDGER_ENTRIES[3],
      availableDeltaUnits: -5
    }
  },
  {
    valid: VALID_LEDGER_ENTRIES[4],
    invalid: {
      ...VALID_LEDGER_ENTRIES[4],
      totalDeltaUnits: 0
    }
  },
  {
    valid: VALID_LEDGER_ENTRIES[5],
    invalid: {
      ...VALID_LEDGER_ENTRIES[5],
      heldDeltaUnits: 5
    }
  },
  {
    valid: VALID_LEDGER_ENTRIES[6],
    invalid: {
      ...VALID_LEDGER_ENTRIES[6],
      availableDeltaUnits: 5
    }
  }
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function wireResponse(body: unknown, status = 200) {
  const response = new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    {
      status,
      headers: { "Content-Type": "application/json" }
    }
  );
  vi.spyOn(response, "json").mockRejectedValue(
    new Error("Wallet client must decode Response.text()")
  );
  return response;
}

function walletOf(client: unknown): PortalWalletClient {
  return (client as { wallet: PortalWalletClient }).wallet;
}

function ledgerBody(
  entries: unknown[],
  nextCursor: {
    afterOccurredAt: string;
    afterEntryRef: string;
  } | null = null
) {
  return { entries, nextCursor };
}

async function expectSafeFailure(
  promise: Promise<unknown>,
  code = "wallet_request_failed",
  retryable = true
) {
  try {
    await promise;
    throw new Error("expected Wallet client failure");
  } catch (error) {
    expect(error).toMatchObject({
      name: "PortalWalletClientError",
      message: "Portal Wallet request failed.",
      code,
      retryable
    });
    expect(String(error)).not.toMatch(
      /synthetic internal|credential|session_wallet_001|raw auth detail/i
    );
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Portal Wallet HTTP client", () => {
  test("wires only the HTTP client to a relative session-only Wallet request", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => wireResponse({
      wallet: ACTIVE_SUMMARY
    }));
    const httpClient = createHttpUserPortalClient({
      baseUrl: "https://cross-origin.example",
      fetchFn
    });

    expect(Object.hasOwn(createLocalUserPortalClient(), "wallet")).toBe(false);
    expect(Object.hasOwn(httpClient, "wallet")).toBe(true);

    await expect(httpClient.wallet.getSummary({
      sessionRef: "session_wallet_001"
    })).resolves.toEqual(ACTIVE_SUMMARY);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/portal/coins/wallet",
      {
        method: "GET",
        headers: {
          "X-Portal-Session": "session_wallet_001"
        }
      }
    );
  });

  test("parses exact summary and ledger success and constructs only a paired cursor", async () => {
    const pageEntries = VALID_LEDGER_ENTRIES.slice(0, 2);
    const nextCursor = {
      afterOccurredAt: pageEntries[1].occurredAt,
      afterEntryRef: pageEntries[1].entryRef
    };
    const responses = [
      { wallet: ACTIVE_SUMMARY },
      ledgerBody(pageEntries, nextCursor)
    ];
    const fetchFn = vi.fn<typeof fetch>(async () => (
      wireResponse(responses.shift())
    ));
    const wallet = walletOf(createHttpUserPortalClient({
      baseUrl: "https://must-not-be-used.example.test",
      fetchFn
    }));

    await expect(wallet.getSummary({
      sessionRef: "session_wallet_001"
    })).resolves.toEqual(ACTIVE_SUMMARY);
    await expect(wallet.listLedger({
      sessionRef: "session_wallet_001",
      limit: 2,
      afterOccurredAt: "2026-07-27T12:08:00.000Z",
      afterEntryRef: "entry_cursor_008"
    })).resolves.toEqual({
      entries: pageEntries,
      nextCursor
    });

    expect(fetchFn.mock.calls).toEqual([
      [
        "/api/portal/coins/wallet",
        {
          method: "GET",
          headers: { "X-Portal-Session": "session_wallet_001" }
        }
      ],
      [
        "/api/portal/coins/wallet/ledger?limit=2&afterOccurredAt=2026-07-27T12%3A08%3A00.000Z&afterEntryRef=entry_cursor_008",
        {
          method: "GET",
          headers: { "X-Portal-Session": "session_wallet_001" }
        }
      ]
    ]);
  });

  test("accepts the Wallet route's normalized hyphenated ledger references", async () => {
    const entry = {
      ...VALID_LEDGER_ENTRIES[0],
      entryRef: "entry-20",
      relatedOrderRef: "order-1"
    };
    const cursor = {
      afterOccurredAt: entry.occurredAt,
      afterEntryRef: entry.entryRef
    };
    const fetchFn = vi.fn<typeof fetch>(async () => wireResponse(
      ledgerBody([entry], cursor)
    ));
    const wallet = walletOf(createHttpUserPortalClient({ fetchFn }));

    await expect(wallet.listLedger({
      sessionRef: "session_wallet_001",
      limit: 1,
      afterOccurredAt: "2026-07-27T12:08:00.000Z",
      afterEntryRef: "entry-21"
    })).resolves.toEqual(ledgerBody([entry], cursor));
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/portal/coins/wallet/ledger?limit=1&afterOccurredAt=2026-07-27T12%3A08%3A00.000Z&afterEntryRef=entry-21",
      {
        method: "GET",
        headers: { "X-Portal-Session": "session_wallet_001" }
      }
    );
  });

  test("accepts only a server-confirmed not_created zero and never synthesizes zero on failure", async () => {
    const notCreated = walletOf(createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => wireResponse({
        wallet: NOT_CREATED_SUMMARY
      }))
    }));
    await expect(notCreated.getSummary({
      sessionRef: "session_wallet_001"
    })).resolves.toEqual(NOT_CREATED_SUMMARY);

    const failures: Array<() => Promise<Response>> = [
      async () => {
        throw new Error("synthetic internal credential detail");
      },
      async () => wireResponse("{not-json"),
      async () => wireResponse({
        wallet: {
          ...NOT_CREATED_SUMMARY,
          version: 1
        }
      })
    ];
    for (const failure of failures) {
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(failure)
      }));
      await expectSafeFailure(wallet.getSummary({
        sessionRef: "session_wallet_001"
      }));
    }
  });

  test("accepts and independently validates all seven category formulas", async () => {
    for (const { valid, invalid } of FORMULA_CASES) {
      const validWallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(
          ledgerBody([valid])
        ))
      }));
      await expect(validWallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 1
      })).resolves.toEqual(ledgerBody([valid]));

      const invalidWallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(
          ledgerBody([invalid])
        ))
      }));
      await expectSafeFailure(invalidWallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 1
      }));
    }
  });

  test("enforces descending row keys and the exact final-row cursor relation", async () => {
    const laterTie = {
      ...VALID_LEDGER_ENTRIES[0],
      entryRef: "entry_tie_zulu",
      occurredAt: "2026-07-27T12:10:00.000Z"
    };
    const earlierTie = {
      ...VALID_LEDGER_ENTRIES[1],
      entryRef: "entry_tie_alpha",
      occurredAt: "2026-07-27T12:10:00.000Z"
    };
    const exactCursor = {
      afterOccurredAt: earlierTie.occurredAt,
      afterEntryRef: earlierTie.entryRef
    };
    const valid = walletOf(createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => wireResponse(
        ledgerBody([laterTie, earlierTie], exactCursor)
      ))
    }));
    await expect(valid.listLedger({
      sessionRef: "session_wallet_001",
      limit: 2
    })).resolves.toEqual(ledgerBody([laterTie, earlierTie], exactCursor));

    const invalidBodies = [
      ledgerBody([earlierTie, laterTie]),
      ledgerBody([laterTie, laterTie]),
      ledgerBody([], {
        afterOccurredAt: laterTie.occurredAt,
        afterEntryRef: laterTie.entryRef
      }),
      ledgerBody([laterTie, earlierTie], {
        afterOccurredAt: earlierTie.occurredAt,
        afterEntryRef: "entry_cursor_mismatch"
      })
    ];
    for (const body of invalidBodies) {
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(body))
      }));
      await expectSafeFailure(wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 2
      }));
    }
  });

  test("rejects caller input drift before fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const wallet = walletOf(createHttpUserPortalClient({ fetchFn }));
    const nullPrototypeInput = Object.assign(Object.create(null), {
      sessionRef: "session_wallet_001"
    });
    const customPrototypeInput = Object.assign(
      Object.create({ inherited: true }),
      { sessionRef: "session_wallet_001" }
    );
    const accessorInput = {};
    Object.defineProperty(accessorInput, "sessionRef", {
      enumerable: true,
      get() {
        throw new Error("caller accessor must not execute");
      }
    });
    const symbolInput = { sessionRef: "session_wallet_001" };
    Object.defineProperty(symbolInput, Symbol("unsafe"), {
      enumerable: true,
      value: true
    });
    const nonEnumerableInput = {};
    Object.defineProperty(nonEnumerableInput, "sessionRef", {
      enumerable: false,
      value: "session_wallet_001"
    });
    const invalidCalls = [
      wallet.getSummary(null as never),
      wallet.getSummary(nullPrototypeInput as never),
      wallet.getSummary(customPrototypeInput as never),
      wallet.getSummary(accessorInput as never),
      wallet.getSummary(symbolInput as never),
      wallet.getSummary(nonEnumerableInput as never),
      wallet.getSummary({ sessionRef: "Session_wallet_001" }),
      wallet.getSummary({
        sessionRef: "session_wallet_001",
        accountId: "account_override"
      } as never),
      wallet.listLedger({
        sessionRef: "session-wallet-001",
        limit: 10
      }),
      wallet.listLedger({
        sessionRef: `s${"a".repeat(96)}`,
        limit: 10
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 0
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 101
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 1.5
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 10,
        afterOccurredAt: "2026-07-27T12:08:00.000Z"
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 10,
        afterEntryRef: "entry_cursor_008"
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 10,
        afterOccurredAt: "2026-07-27T12:08:00Z",
        afterEntryRef: "entry_cursor_008"
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 10,
        afterOccurredAt: "+010000-01-01T00:00:00.000Z",
        afterEntryRef: "entry_cursor_008"
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 10,
        afterOccurredAt: "-000001-01-01T00:00:00.000Z",
        afterEntryRef: "entry_cursor_008"
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 10,
        afterOccurredAt: "2026-07-27T12:08:00.000Z",
        afterEntryRef: " entry-20"
      }),
      wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 10,
        accountId: "account_override"
      } as never)
    ];

    for (const promise of invalidCalls) {
      await expectSafeFailure(promise);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("rejects enum, numeric, reference, timestamp, arithmetic, and exact-schema drift", async () => {
    const summaryCases: unknown[] = [
      { wallet: { ...ACTIVE_SUMMARY, status: "pending" } },
      { wallet: { ...ACTIVE_SUMMARY, version: Number.MAX_SAFE_INTEGER + 1 } },
      { wallet: { ...ACTIVE_SUMMARY, heldUnits: -1 } },
      { wallet: { ...ACTIVE_SUMMARY, spendableUnits: 24 } }
    ];
    const baseEntry = VALID_LEDGER_ENTRIES[0];
    const expandedYear = "+010000-01-01T00:00:00.000Z";
    const negativeYear = "-000001-01-01T00:00:00.000Z";
    const ledgerCases: unknown[] = [
      ledgerBody([{ ...baseEntry, category: "unknown" }]),
      ledgerBody([{ ...baseEntry, coinType: "internal_coins" }]),
      ledgerBody([{ ...baseEntry, amountUnits: 0 }]),
      ledgerBody([{ ...baseEntry, totalDeltaUnits: Number.MAX_SAFE_INTEGER + 1 }]),
      ledgerBody([{ ...baseEntry, entryRef: " entry-20" }]),
      ledgerBody([{ ...baseEntry, relatedOrderRef: " order-1" }]),
      ledgerBody([{ ...baseEntry, occurredAt: "2026-07-27T12:07:00Z" }]),
      ledgerBody(
        [{ ...baseEntry, occurredAt: expandedYear }],
        {
          afterOccurredAt: expandedYear,
          afterEntryRef: baseEntry.entryRef
        }
      ),
      ledgerBody(
        [{ ...baseEntry, occurredAt: negativeYear }],
        {
          afterOccurredAt: negativeYear,
          afterEntryRef: baseEntry.entryRef
        }
      )
    ];

    for (const body of summaryCases) {
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(body))
      }));
      await expectSafeFailure(wallet.getSummary({
        sessionRef: "session_wallet_001"
      }));
    }
    for (const body of ledgerCases) {
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(body))
      }));
      await expectSafeFailure(wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 1
      }));
    }
  });

  test("rejects extra and missing keys at every response wrapper level", async () => {
    const summaryWithExtra = clone(ACTIVE_SUMMARY) as typeof ACTIVE_SUMMARY & {
      internal?: boolean;
    };
    summaryWithExtra.internal = true;
    const summaryWithoutPending = clone(ACTIVE_SUMMARY) as Record<string, unknown>;
    delete summaryWithoutPending.pendingUnits;
    const balancesWithExtra = {
      ...ACTIVE_SUMMARY,
      balances: {
        ...ACTIVE_SUMMARY.balances,
        internal: 1
      }
    };
    const balancesWithoutReward = {
      ...ACTIVE_SUMMARY,
      balances: {
        paidCoins: 20,
        bonusCoins: 4
      }
    };
    const summaryBodies = [
      { wallet: ACTIVE_SUMMARY, internal: true },
      {},
      { wallet: summaryWithExtra },
      { wallet: summaryWithoutPending },
      { wallet: balancesWithExtra },
      { wallet: balancesWithoutReward }
    ];

    const entryWithExtra = {
      ...VALID_LEDGER_ENTRIES[0],
      internal: true
    };
    const entryWithoutAmount = clone(VALID_LEDGER_ENTRIES[0]) as Record<string, unknown>;
    delete entryWithoutAmount.amountUnits;
    const cursor = {
      afterOccurredAt: VALID_LEDGER_ENTRIES[0].occurredAt,
      afterEntryRef: VALID_LEDGER_ENTRIES[0].entryRef
    };
    const ledgerBodies = [
      { ...ledgerBody([VALID_LEDGER_ENTRIES[0]]), internal: true },
      { entries: [VALID_LEDGER_ENTRIES[0]] },
      ledgerBody([entryWithExtra]),
      ledgerBody([entryWithoutAmount]),
      ledgerBody([VALID_LEDGER_ENTRIES[0]], {
        ...cursor,
        internal: true
      } as never),
      ledgerBody([VALID_LEDGER_ENTRIES[0]], {
        afterOccurredAt: cursor.afterOccurredAt
      } as never)
    ];

    for (const body of summaryBodies) {
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(body))
      }));
      await expectSafeFailure(wallet.getSummary({
        sessionRef: "session_wallet_001"
      }));
    }
    for (const body of ledgerBodies) {
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(body))
      }));
      await expectSafeFailure(wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 1
      }));
    }
  });

  test("rejects hostile object and dense-array violations without invoking accessors", async () => {
    const hostileBodies: Array<{
      body: unknown;
      request: (wallet: PortalWalletClient) => Promise<unknown>;
    }> = [];
    hostileBodies.push({
      body: Object.assign(Object.create(null), {
        wallet: clone(ACTIVE_SUMMARY)
      }),
      request: (wallet) => wallet.getSummary({
        sessionRef: "session_wallet_001"
      })
    });
    hostileBodies.push({
      body: Object.assign(Object.create({ inherited: true }), {
        wallet: clone(ACTIVE_SUMMARY)
      }),
      request: (wallet) => wallet.getSummary({
        sessionRef: "session_wallet_001"
      })
    });
    const accessor = {};
    Object.defineProperty(accessor, "wallet", {
      enumerable: true,
      get() {
        throw new Error("accessor must not execute");
      }
    });
    hostileBodies.push({
      body: accessor,
      request: (wallet) => wallet.getSummary({
        sessionRef: "session_wallet_001"
      })
    });
    const symbol = { wallet: clone(ACTIVE_SUMMARY) };
    Object.defineProperty(symbol, Symbol("unsafe"), {
      enumerable: true,
      value: true
    });
    hostileBodies.push({
      body: symbol,
      request: (wallet) => wallet.getSummary({
        sessionRef: "session_wallet_001"
      })
    });
    const nonEnumerable = {};
    Object.defineProperty(nonEnumerable, "wallet", {
      enumerable: false,
      value: clone(ACTIVE_SUMMARY)
    });
    hostileBodies.push({
      body: nonEnumerable,
      request: (wallet) => wallet.getSummary({
        sessionRef: "session_wallet_001"
      })
    });
    const sparse = new Array(1);
    hostileBodies.push({
      body: ledgerBody(sparse),
      request: (wallet) => wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 1
      })
    });
    const propertyBearing = [clone(VALID_LEDGER_ENTRIES[0])] as PortalWalletLedgerEntry[] & {
      internal?: boolean;
    };
    propertyBearing.internal = true;
    hostileBodies.push({
      body: ledgerBody(propertyBearing),
      request: (wallet) => wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 1
      })
    });
    const symbolArray = [clone(VALID_LEDGER_ENTRIES[0])];
    Object.defineProperty(symbolArray, Symbol("unsafe"), {
      enumerable: true,
      value: true
    });
    hostileBodies.push({
      body: ledgerBody(symbolArray),
      request: (wallet) => wallet.listLedger({
        sessionRef: "session_wallet_001",
        limit: 1
      })
    });

    for (const { body, request } of hostileBodies) {
      vi.spyOn(JSON, "parse").mockReturnValueOnce(body);
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse("{}"))
      }));
      await expectSafeFailure(request(wallet));
      vi.mocked(JSON.parse).mockRestore();
    }
  });

  test("preserves only exact structured Wallet error mappings", async () => {
    const cases = [
      {
        status: 400,
        code: "wallet_request_invalid",
        retryable: false
      },
      {
        status: 401,
        code: "wallet_session_invalid",
        retryable: false
      },
      {
        status: 503,
        code: "wallet_unavailable",
        retryable: true
      }
    ] as const;
    for (const { status, code, retryable } of cases) {
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse({
          error: { code, retryable }
        }, status))
      }));
      await expectSafeFailure(wallet.getSummary({
        sessionRef: "session_wallet_001"
      }), code, retryable);
    }
  });

  test("normalizes every structured-error mismatch and transport/parser failure", async () => {
    const textFailure = wireResponse({ wallet: ACTIVE_SUMMARY });
    vi.spyOn(textFailure, "text").mockRejectedValue(
      new Error("synthetic internal response-text failure")
    );
    const failures: Array<() => Promise<Response>> = [
      async () => wireResponse({
        error: {
          code: "wallet_unavailable",
          retryable: true
        }
      }, 401),
      async () => wireResponse({
        error: {
          code: "wallet_session_invalid",
          retryable: false
        }
      }, 503),
      async () => wireResponse({
        error: {
          code: "wallet_request_invalid",
          retryable: true
        }
      }, 400),
      async () => wireResponse({
        error: {
          code: "wallet_unknown",
          retryable: false
        }
      }, 400),
      async () => wireResponse({
        error: {
          code: "wallet_unavailable",
          retryable: true,
          detail: "raw auth detail"
        }
      }, 503),
      async () => wireResponse({
        error: {
          code: "wallet_unavailable"
        }
      }, 503),
      async () => wireResponse({
        error: "raw auth detail"
      }, 401),
      async () => wireResponse({ wallet: ACTIVE_SUMMARY }, 201),
      async () => wireResponse("{not-json"),
      async () => textFailure,
      async () => {
        throw new PortalWalletClientError(
          "wallet_session_invalid",
          false
        );
      }
    ];

    for (const failure of failures) {
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(failure)
      }));
      await expectSafeFailure(wallet.getSummary({
        sessionRef: "session_wallet_001"
      }));
    }
  });

  test("bridges only exact legacy console auth fallback and rejects every variation", async () => {
    const exact = walletOf(createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => wireResponse({
        error: "Unauthorized"
      }, 401))
    }));
    await expectSafeFailure(exact.getSummary({
      sessionRef: "session_wallet_001"
    }), "wallet_unavailable", true);

    const variations = [
      { status: 403, body: { error: "Unauthorized" } },
      { status: 401, body: { error: "unauthorized" } },
      { status: 401, body: { Error: "Unauthorized" } },
      {
        status: 401,
        body: { error: "Unauthorized", detail: "raw auth detail" }
      }
    ];
    for (const variation of variations) {
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(
          variation.body,
          variation.status
        ))
      }));
      await expectSafeFailure(wallet.getSummary({
        sessionRef: "session_wallet_001"
      }));
    }

    const hostileLegacyBodies: unknown[] = [
      Object.assign(Object.create(null), { error: "Unauthorized" }),
      Object.assign(Object.create({ inherited: true }), {
        error: "Unauthorized"
      })
    ];
    const nonEnumerable = {};
    Object.defineProperty(nonEnumerable, "error", {
      enumerable: false,
      value: "Unauthorized"
    });
    hostileLegacyBodies.push(nonEnumerable);
    const accessor = {};
    Object.defineProperty(accessor, "error", {
      enumerable: true,
      get() {
        return "Unauthorized";
      }
    });
    hostileLegacyBodies.push(accessor);
    for (const body of hostileLegacyBodies) {
      vi.spyOn(JSON, "parse").mockReturnValueOnce(body);
      const wallet = walletOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(
          "{\"error\":\"Unauthorized\"}",
          401
        ))
      }));
      await expectSafeFailure(wallet.getSummary({
        sessionRef: "session_wallet_001"
      }));
      vi.mocked(JSON.parse).mockRestore();
    }
  });
});
