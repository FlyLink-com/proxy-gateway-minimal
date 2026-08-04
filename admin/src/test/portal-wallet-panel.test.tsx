import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PortalWalletPanel } from "../features/user-portal/wallet/portal-wallet-panel";
import type {
  PortalWalletReadModel,
  ReadState
} from "../features/user-portal/wallet/use-portal-wallet-read-model";
import { usePortalWalletReadModel } from "../features/user-portal/wallet/use-portal-wallet-read-model";
import type {
  PortalWalletClient,
  PortalWalletLedgerEntry,
  PortalWalletSummary
} from "../features/user-portal/wallet";
import { PortalWalletClientError } from "../features/user-portal/wallet";
import type { PortalRechargeModel } from "../features/user-portal/recharge";

const ACTIVE_SUMMARY: PortalWalletSummary = {
  status: "active",
  version: 7,
  balances: {
    paidCoins: 120,
    bonusCoins: 30,
    rewardCoins: 5
  },
  spendableUnits: 155,
  heldUnits: 9,
  pendingUnits: 4
};

const NOT_CREATED_SUMMARY: PortalWalletSummary = {
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

const CREDIT_ENTRY: PortalWalletLedgerEntry = {
  entryRef: "entry_credit_001",
  category: "credit",
  coinType: "paid_coins",
  amountUnits: 40,
  availableDeltaUnits: null,
  pendingDeltaUnits: null,
  heldDeltaUnits: null,
  totalDeltaUnits: 40,
  relatedOrderRef: null,
  occurredAt: "2026-07-27T12:00:00.000Z"
};

const HELD_ENTRY: PortalWalletLedgerEntry = {
  entryRef: "entry_held_002",
  category: "available_to_held",
  coinType: "bonus_coins",
  amountUnits: 5,
  availableDeltaUnits: -5,
  pendingDeltaUnits: 0,
  heldDeltaUnits: 5,
  totalDeltaUnits: 0,
  relatedOrderRef: "order_wallet_002",
  occurredAt: "2026-07-27T11:00:00.000Z"
};

const CONSUMED_ENTRY: PortalWalletLedgerEntry = {
  entryRef: "entry_consumed_003",
  category: "held_to_consumed",
  coinType: "paid_coins",
  amountUnits: 7,
  availableDeltaUnits: 0,
  pendingDeltaUnits: 0,
  heldDeltaUnits: -7,
  totalDeltaUnits: -7,
  relatedOrderRef: "order_wallet_003",
  occurredAt: "2026-07-27T10:00:00.000Z"
};

const EXPIRED_ENTRY: PortalWalletLedgerEntry = {
  entryRef: "entry_expired_004",
  category: "available_to_expired",
  coinType: "bonus_coins",
  amountUnits: 3,
  availableDeltaUnits: -3,
  pendingDeltaUnits: 0,
  heldDeltaUnits: 0,
  totalDeltaUnits: -3,
  relatedOrderRef: null,
  occurredAt: "2026-07-27T09:00:00.000Z"
};

const RECENT_LEDGER_ENTRIES: PortalWalletLedgerEntry[] = [
  CREDIT_ENTRY,
  HELD_ENTRY,
  {
    ...CREDIT_ENTRY,
    entryRef: "entry_credit_003",
    occurredAt: "2026-07-27T10:00:00.000Z",
    relatedOrderRef: "order_wallet_003"
  },
  {
    ...CREDIT_ENTRY,
    entryRef: "entry_credit_004",
    occurredAt: "2026-07-27T09:00:00.000Z",
    relatedOrderRef: "order_wallet_004"
  },
  {
    ...CREDIT_ENTRY,
    entryRef: "entry_credit_005",
    occurredAt: "2026-07-27T08:00:00.000Z",
    relatedOrderRef: "order_wallet_005"
  },
  {
    ...CREDIT_ENTRY,
    entryRef: "entry_credit_006",
    occurredAt: "2026-07-27T07:00:00.000Z",
    relatedOrderRef: "order_wallet_006"
  }
];

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function walletModel(
  overrides: Partial<PortalWalletReadModel> = {}
): PortalWalletReadModel {
  return {
    summary: { phase: "ready", value: ACTIVE_SUMMARY },
    ledger: { phase: "ready", value: [CREDIT_ENTRY] },
    nextLedgerCursor: null,
    retrySummary: vi.fn(),
    retryLedger: vi.fn(),
    refreshWallet: vi.fn(),
    loadMoreLedger: vi.fn(),
    ...overrides,
    loadingMoreLedger: overrides.loadingMoreLedger ?? false,
    loadMoreLedgerError: overrides.loadMoreLedgerError ?? null
  };
}

function renderPanel(model: PortalWalletReadModel, locale: "zh" | "en" = "en") {
  return render(createElement(PortalWalletPanel, { locale, model }));
}

function WalletHarness({
  client,
  modelRef
}: {
  client: PortalWalletClient;
  modelRef: { current: PortalWalletReadModel | null };
}) {
  const model = usePortalWalletReadModel({
    client,
    sessionRef: "session_wallet_001",
    sessionGeneration: 1,
    loadLedger: true,
    onSessionInvalid: () => undefined
  });
  modelRef.current = model;
  return createElement(PortalWalletPanel, { locale: "en", model });
}

function renderWalletHarness(client: PortalWalletClient) {
  const modelRef: { current: PortalWalletReadModel | null } = {
    current: null
  };
  return {
    ...render(createElement(WalletHarness, { client, modelRef })),
    modelRef
  };
}

describe("PortalWalletPanel", () => {
  test("maps each Wallet activity header to its ordered entry cell", () => {
    renderPanel(walletModel({
      ledger: { phase: "ready", value: [HELD_ENTRY] }
    }));

    expect(screen.getByRole("heading", { name: "Wallet overview" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("120", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("30", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("5", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("155", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("9", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("4", { selector: "dd" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View all activity" }));

    expect(screen.getByRole("heading", { name: "All Wallet activity" })).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Coins Wallet activity" });
    const scrollRegion = screen.getByRole("region", {
      name: "Coins Wallet activity table"
    });
    expect(scrollRegion).toHaveAttribute("tabindex", "0");
    expect(within(scrollRegion).getByRole("table", {
      name: "Coins Wallet activity"
    })).toBe(table);
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Category",
      "Coin type",
      "Occurred at",
      "Related order",
      "Overall delta",
      "Available",
      "Pending",
      "Held"
    ]);
    const heldRow = screen.getByText("Reserved for order").closest("tr");
    expect(heldRow).not.toBeNull();
    const heldCells = within(heldRow as HTMLElement)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(heldCells).toEqual([
      "Reserved for order",
      "Bonus Coins",
      expect.not.stringContaining("2026-07-27T11:00:00.000Z"),
      "order_wallet_002",
      "0",
      "-5",
      "0",
      "+5"
    ]);
    expect(heldRow).not.toHaveTextContent(/available_to_held|bonus_coins/);
    const occurredAt = (heldRow as HTMLElement).querySelector("time");
    expect(occurredAt).toHaveAttribute(
      "dateTime",
      "2026-07-27T11:00:00.000Z"
    );
  });

  test("keeps order reserves and pending rewards outside the four primary balance cards", () => {
    renderPanel(walletModel());

    const primaryBalances = document.querySelector(".portal-wallet-balance-grid");
    expect(primaryBalances).not.toBeNull();
    expect(within(primaryBalances as HTMLElement).getAllByRole("term")).toHaveLength(4);
    expect(within(primaryBalances as HTMLElement).getByText("Spendable balance"))
      .toBeInTheDocument();
    expect(within(primaryBalances as HTMLElement).getByText("Purchased available"))
      .toBeInTheDocument();
    expect(within(primaryBalances as HTMLElement).getByText("Bonus available"))
      .toBeInTheDocument();
    expect(within(primaryBalances as HTMLElement).getByText("Reward available"))
      .toBeInTheDocument();

    const secondaryBalances = document.querySelector(".portal-wallet-status-grid");
    expect(secondaryBalances).not.toBeNull();
    expect(within(secondaryBalances as HTMLElement).getByText("Order reserved"))
      .toBeInTheDocument();
    expect(within(secondaryBalances as HTMLElement).getByText("Pending rewards"))
      .toBeInTheDocument();
  });

  test("shows signed Wallet changes in recent activity", () => {
    renderPanel(walletModel({
      ledger: {
        phase: "ready",
        value: [CREDIT_ENTRY, HELD_ENTRY, CONSUMED_ENTRY, EXPIRED_ENTRY]
      }
    }));

    const table = screen.getByRole("table", {
      name: "Recent Coins Wallet activity"
    });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent))
      .toEqual(["Category", "Coin type", "Occurred at", "Change"]);
    expect(within(screen.getByText("Coins credited").closest("tr") as HTMLElement)
      .getAllByRole("cell").at(-1)).toHaveTextContent("+40");
    expect(within(screen.getByText("Reserved for order").closest("tr") as HTMLElement)
      .getAllByRole("cell").at(-1)).toHaveTextContent("-5");
    expect(within(screen.getByText("Purchase completed").closest("tr") as HTMLElement)
      .getAllByRole("cell").at(-1)).toHaveTextContent("-7");
    expect(within(screen.getByText("Available balance expired").closest("tr") as HTMLElement)
      .getAllByRole("cell").at(-1)).toHaveTextContent("-3");
  });

  test("shows only five recent ledger entries until the user opens all activity", () => {
    const loadMoreLedger = vi.fn();
    renderPanel(walletModel({
      ledger: { phase: "ready", value: RECENT_LEDGER_ENTRIES },
      loadMoreLedger
    }));

    const recentTable = screen.getByRole("table", {
      name: "Recent Coins Wallet activity"
    });
    expect(within(recentTable).getAllByRole("row")).toHaveLength(6);
    expect(screen.queryByText("order_wallet_006")).not.toBeInTheDocument();
    expect(loadMoreLedger).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "View all activity" }));

    const allActivity = screen.getByRole("heading", { name: "All Wallet activity" });
    expect(allActivity).toBeInTheDocument();
    const completeTable = screen.getByRole("table", { name: "Coins Wallet activity" });
    expect(within(completeTable).getAllByRole("row")).toHaveLength(7);
    expect(screen.getByText("order_wallet_006")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Wallet overview" }));
    const returnedRecentTable = screen.getByRole("table", {
      name: "Recent Coins Wallet activity"
    });
    expect(within(returnedRecentTable).getAllByRole("row")).toHaveLength(6);
    expect(screen.queryByText("order_wallet_006")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Coins Wallet activity" })).toBeNull();
    expect(loadMoreLedger).not.toHaveBeenCalled();
  });

  test("explains Wallet rules without inventing expiry or payment-provider data", () => {
    renderPanel(walletModel());

    const guide = screen.getByRole("complementary", { name: "Wallet guide" });
    expect(within(guide).getByText("Coins types")).toBeInTheDocument();
    expect(within(guide).getByText("How Coins are used")).toBeInTheDocument();
    expect(within(guide).getByText("Order reserves and pending rewards"))
      .toBeInTheDocument();
    expect(guide).not.toHaveTextContent(/30 days|expires in|PayPal|Sandbox|Store orders/i);
  });

  test("does not add a ledger-scroll focus stop to the mobile layout", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 720
    });
    try {
      renderPanel(walletModel({
        ledger: { phase: "ready", value: [HELD_ENTRY] }
      }));

      fireEvent.click(screen.getByRole("button", { name: "View all activity" }));

      const wrapper = document.querySelector(".portal-wallet-ledger-wrap");
      expect(wrapper).not.toBeNull();
      expect(wrapper).not.toHaveAttribute("role");
      expect(wrapper).not.toHaveAttribute("aria-label");
      expect(wrapper).not.toHaveAttribute("tabindex");
      expect(screen.queryByRole("region", {
        name: "Coins Wallet activity table"
      })).toBeNull();
    } finally {
      cleanup();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalWidth
      });
    }
  });

  test.each<{
    state: ReadState<PortalWalletSummary>;
    message: string;
    retry: boolean;
  }>([
    {
      state: { phase: "loading" },
      message: "Loading Wallet balance…",
      retry: false
    },
    {
      state: { phase: "empty", value: NOT_CREATED_SUMMARY },
      message: "No Coins have been credited yet. Your Wallet will activate automatically after the first successful recharge.",
      retry: false
    },
    {
      state: { phase: "unavailable", retryable: false },
      message: "Wallet balance is unavailable.",
      retry: false
    },
    {
      state: { phase: "unavailable", retryable: true },
      message: "Wallet balance is unavailable.",
      retry: true
    },
    {
      state: { phase: "error", retryable: false },
      message: "Wallet balance could not be loaded.",
      retry: false
    },
    {
      state: { phase: "error", retryable: true },
      message: "Wallet balance could not be loaded.",
      retry: true
    }
  ])("renders summary phase $state.phase without synthesizing a balance", ({
    state,
    message,
    retry
  }) => {
    const retrySummary = vi.fn();
    renderPanel(walletModel({ summary: state, retrySummary }));

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText("155", { selector: "dd" })).not.toBeInTheDocument();
    const retryButton = screen.queryByRole("button", { name: "Retry balance" });
    if (retry) {
      expect(retryButton).toBeInTheDocument();
      fireEvent.click(retryButton as HTMLButtonElement);
      expect(retrySummary).toHaveBeenCalledTimes(1);
    } else {
      expect(retryButton).not.toBeInTheDocument();
    }
  });

  test.each<{
    state: ReadState<PortalWalletLedgerEntry[]>;
    message: string;
    retry: boolean;
  }>([
    {
      state: { phase: "loading" },
      message: "Loading Wallet activity…",
      retry: false
    },
    {
      state: { phase: "empty", value: [] },
      message: "No Wallet activity yet.",
      retry: false
    },
    {
      state: { phase: "unavailable", retryable: false },
      message: "Wallet activity is unavailable.",
      retry: false
    },
    {
      state: { phase: "unavailable", retryable: true },
      message: "Wallet activity is unavailable.",
      retry: true
    },
    {
      state: { phase: "error", retryable: false },
      message: "Wallet activity could not be loaded.",
      retry: false
    },
    {
      state: { phase: "error", retryable: true },
      message: "Wallet activity could not be loaded.",
      retry: true
    }
  ])("renders ledger phase $state.phase and only exposes valid retry", ({
    state,
    message,
    retry
  }) => {
    const retryLedger = vi.fn();
    renderPanel(walletModel({ ledger: state, retryLedger }));

    expect(screen.getByText(message)).toBeInTheDocument();
    const retryButton = screen.queryByRole("button", { name: "Retry activity" });
    if (retry) {
      expect(retryButton).toBeInTheDocument();
      fireEvent.click(retryButton as HTMLButtonElement);
      expect(retryLedger).toHaveBeenCalledTimes(1);
    } else {
      expect(retryButton).not.toBeInTheDocument();
    }
  });

  test("loads another ledger page only when the model exposes a cursor", () => {
    const loadMoreLedger = vi.fn();
    const model = walletModel({
      loadMoreLedger,
      nextLedgerCursor: {
        afterOccurredAt: CREDIT_ENTRY.occurredAt,
        afterEntryRef: CREDIT_ENTRY.entryRef
      }
    });
    const { rerender } = renderPanel(model);

    fireEvent.click(screen.getByRole("button", { name: "View all activity" }));

    fireEvent.click(screen.getByRole("button", { name: "Load more activity" }));
    expect(loadMoreLedger).toHaveBeenCalledTimes(1);

    rerender(createElement(PortalWalletPanel, {
      locale: "en",
      model: { ...model, nextLedgerCursor: null }
    }));
    expect(screen.queryByRole("button", { name: "Load more activity" })).not.toBeInTheDocument();
  });

  test("marks the page-two control busy and blocks a duplicate request", async () => {
    const cursor = {
      afterOccurredAt: CREDIT_ENTRY.occurredAt,
      afterEntryRef: CREDIT_ENTRY.entryRef
    };
    const pageTwo = deferred<{
      entries: PortalWalletLedgerEntry[];
      nextCursor: null;
    }>();
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => ACTIVE_SUMMARY),
      listLedger: vi.fn((input) => (
        "afterOccurredAt" in input
          ? pageTwo.promise
          : Promise.resolve({
              entries: [CREDIT_ENTRY],
              nextCursor: cursor
            })
      ))
    };
    renderWalletHarness(client);

    fireEvent.click(await screen.findByRole("button", {
      name: "View all activity"
    }));

    fireEvent.click(await screen.findByRole("button", {
      name: "Load more activity"
    }));

    const busyButton = await screen.findByRole("button", {
      name: "Loading more activity…"
    });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute("aria-busy", "true");
    fireEvent.click(busyButton);
    expect(client.listLedger).toHaveBeenCalledTimes(2);

    await act(async () => {
      pageTwo.resolve({ entries: [HELD_ENTRY], nextCursor: null });
      await pageTwo.promise;
    });
  });

  test("keeps page one and its cursor when page two fails retryably", async () => {
    const cursor = {
      afterOccurredAt: CREDIT_ENTRY.occurredAt,
      afterEntryRef: CREDIT_ENTRY.entryRef
    };
    const pageTwo = deferred<{
      entries: PortalWalletLedgerEntry[];
      nextCursor: null;
    }>();
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => ACTIVE_SUMMARY),
      listLedger: vi.fn((input) => (
        "afterOccurredAt" in input
          ? pageTwo.promise
          : Promise.resolve({
              entries: [CREDIT_ENTRY],
              nextCursor: cursor
            })
      ))
    };
    const { modelRef } = renderWalletHarness(client);

    fireEvent.click(await screen.findByRole("button", {
      name: "View all activity"
    }));

    fireEvent.click(await screen.findByRole("button", {
      name: "Load more activity"
    }));
    await act(async () => {
      pageTwo.reject(
        new PortalWalletClientError("wallet_request_failed", true)
      );
      await Promise.allSettled([pageTwo.promise]);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "More Wallet activity could not be loaded. Your current activity is still shown."
    );
    expect(screen.getByText("Coins credited")).toBeInTheDocument();
    expect(screen.queryByText("Wallet activity could not be loaded."))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "Retry loading more activity"
    })).toBeInTheDocument();
    expect(modelRef.current?.ledger).toEqual({
      phase: "ready",
      value: [CREDIT_ENTRY]
    });
    expect(modelRef.current?.nextLedgerCursor).toEqual(cursor);
  });

  test("retries the failed page and appends each new ledger row once", async () => {
    const cursor = {
      afterOccurredAt: CREDIT_ENTRY.occurredAt,
      afterEntryRef: CREDIT_ENTRY.entryRef
    };
    const failedPage = deferred<{
      entries: PortalWalletLedgerEntry[];
      nextCursor: null;
    }>();
    let pageRequest = 0;
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => ACTIVE_SUMMARY),
      listLedger: vi.fn((input) => {
        if (!("afterOccurredAt" in input)) {
          return Promise.resolve({
            entries: [CREDIT_ENTRY],
            nextCursor: cursor
          });
        }
        pageRequest += 1;
        return pageRequest === 1
          ? failedPage.promise
          : Promise.resolve({
              entries: [HELD_ENTRY],
              nextCursor: null
            });
      })
    };
    const { modelRef } = renderWalletHarness(client);

    fireEvent.click(await screen.findByRole("button", {
      name: "View all activity"
    }));

    fireEvent.click(await screen.findByRole("button", {
      name: "Load more activity"
    }));
    await act(async () => {
      failedPage.reject(
        new PortalWalletClientError("wallet_request_failed", true)
      );
      await Promise.allSettled([failedPage.promise]);
    });

    fireEvent.click(await screen.findByRole("button", {
      name: "Retry loading more activity"
    }));

    await waitFor(() => {
      expect(screen.getByText("Reserved for order")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Coins credited")).toHaveLength(1);
    expect(screen.getAllByText("Reserved for order")).toHaveLength(1);
    expect(screen.queryByText(
      "More Wallet activity could not be loaded. Your current activity is still shown."
    )).not.toBeInTheDocument();
    expect(modelRef.current?.ledger).toEqual({
      phase: "ready",
      value: [CREDIT_ENTRY, HELD_ENTRY]
    });
    expect(modelRef.current?.nextLedgerCursor).toBeNull();
  });

  test("keeps the Wallet overview focused on balances, recent activity, and rules while recharge is unavailable", () => {
    renderPanel(walletModel());

    expect(screen.getByRole("heading", { name: "Balance" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent Wallet activity" }))
      .toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Wallet guide" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recharge Coins" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("list", {
      name: "Coins recharge denominations"
    })).not.toBeInTheDocument();
  });

  test.each([
    {
      locale: "en" as const,
      heading: "Wallet overview",
      button: "Recharge Coins",
    },
    {
      locale: "zh" as const,
      heading: "钱包总览",
      button: "充值 Coins",
    },
  ])("keeps the $locale recharge action in the Wallet header and provider-neutral", ({
    locale,
    heading,
    button,
  }) => {
    const openDialog = vi.fn();
    const rechargeModel: PortalRechargeModel = {
      available: true,
      dialogOpen: false,
      offers: [],
      activeOrder: null,
      busy: false,
      error: null,
      openDialog,
      closeDialog: vi.fn(),
      createOrder: vi.fn(async () => undefined),
      continueOrderPayment: vi.fn(() => "not_applicable" as const),
    };
    render(createElement(PortalWalletPanel, {
      locale,
      model: walletModel(),
      rechargeModel,
    }));

    const wallet = screen.getByRole("region", { name: heading });
    const header = within(wallet).getByRole("banner");
    expect(within(header).getByRole("button", { name: button })).toBeInTheDocument();
    expect(wallet).not.toHaveTextContent(
      /PayPal|Sandbox|USD|adapter|支付宝|Alipay|微信支付|WeChat/i,
    );
    fireEvent.click(within(header).getByRole("button", { name: button }));
    expect(openDialog).toHaveBeenCalledTimes(1);
  });
});

describe("usePortalWalletReadModel", () => {
  test("keeps current reads live across the Portal StrictMode effect probe", async () => {
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => ACTIVE_SUMMARY),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const { result } = renderHook(() => usePortalWalletReadModel({
      client,
      sessionRef: "session_wallet_001",
      sessionGeneration: 1,
      loadLedger: false,
      onSessionInvalid: vi.fn()
    }), { reactStrictMode: true });

    await waitFor(() => {
      expect(result.current.summary).toEqual({
        phase: "ready",
        value: ACTIVE_SUMMARY
      });
    });
  });

  test("loads authenticated summary eagerly and ledger only while Wallet is open", async () => {
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => ACTIVE_SUMMARY),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const onSessionInvalid = vi.fn();
    const { result, rerender } = renderHook(
      (props: {
        loadLedger: boolean;
        onSessionInvalid: () => void;
      }) => usePortalWalletReadModel({
        client,
        sessionRef: "session_wallet_001",
        sessionGeneration: 1,
        ...props
      }),
      {
        initialProps: {
          loadLedger: false,
          onSessionInvalid
        }
      }
    );

    await waitFor(() => {
      expect(result.current.summary).toEqual({
        phase: "ready",
        value: ACTIVE_SUMMARY
      });
    });
    expect(client.getSummary).toHaveBeenCalledWith({
      sessionRef: "session_wallet_001"
    });
    expect(client.listLedger).not.toHaveBeenCalled();
    expect(result.current.ledger).toEqual({
      phase: "unavailable",
      retryable: false
    });

    rerender({
      loadLedger: false,
      onSessionInvalid: vi.fn()
    });
    expect(client.getSummary).toHaveBeenCalledTimes(1);

    rerender({
      loadLedger: true,
      onSessionInvalid: vi.fn()
    });
    await waitFor(() => {
      expect(result.current.ledger).toEqual({
        phase: "empty",
        value: []
      });
    });
    expect(client.getSummary).toHaveBeenCalledTimes(2);
    expect(client.listLedger).toHaveBeenCalledWith({
      sessionRef: "session_wallet_001",
      limit: 25
    });

    rerender({
      loadLedger: false,
      onSessionInvalid: vi.fn()
    });
    await waitFor(() => {
      expect(result.current.ledger).toEqual({
        phase: "unavailable",
        retryable: false
      });
    });
    rerender({
      loadLedger: true,
      onSessionInvalid: vi.fn()
    });
    await waitFor(() => {
      expect(client.listLedger).toHaveBeenCalledTimes(2);
    });
  });

  test("maps not-created, missing client, and exact client failures without inventing zero", async () => {
    const unavailableClient: PortalWalletClient = {
      getSummary: vi.fn(async () => {
        throw new PortalWalletClientError("wallet_unavailable", false);
      }),
      listLedger: vi.fn(async () => {
        throw new PortalWalletClientError("wallet_request_invalid", false);
      })
    };
    const initialProps: {
      client: PortalWalletClient | null;
      revision: number;
    } = {
      client: unavailableClient,
      revision: 1
    };
    const { result, rerender } = renderHook(
      (props: {
        client: PortalWalletClient | null;
        revision: number;
      }) => usePortalWalletReadModel({
        client: props.client,
        sessionRef: "session_wallet_001",
        sessionGeneration: props.revision,
        loadLedger: true,
        onSessionInvalid: vi.fn()
      }),
      {
        initialProps
      }
    );

    await waitFor(() => {
      expect(result.current.summary).toEqual({
        phase: "unavailable",
        retryable: true
      });
      expect(result.current.ledger).toEqual({
        phase: "error",
        retryable: false
      });
    });

    rerender({ client: null, revision: 2 });
    expect(result.current.summary).toEqual({
      phase: "unavailable",
      retryable: false
    });
    expect(result.current.ledger).toEqual({
      phase: "unavailable",
      retryable: false
    });

    const notCreatedClient: PortalWalletClient = {
      getSummary: vi.fn(async () => NOT_CREATED_SUMMARY),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    rerender({ client: notCreatedClient, revision: 3 });
    await waitFor(() => {
      expect(result.current.summary).toEqual({
        phase: "empty",
        value: NOT_CREATED_SUMMARY
      });
    });
  });

  test("retries only the requested channel", async () => {
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => {
        throw new Error("synthetic summary failure");
      }),
      listLedger: vi.fn(async () => {
        throw new PortalWalletClientError("wallet_request_failed", true);
      })
    };
    const { result } = renderHook(() => usePortalWalletReadModel({
      client,
      sessionRef: "session_wallet_001",
      sessionGeneration: 1,
      loadLedger: true,
      onSessionInvalid: vi.fn()
    }));

    await waitFor(() => {
      expect(result.current.summary).toEqual({
        phase: "error",
        retryable: true
      });
      expect(result.current.ledger).toEqual({
        phase: "error",
        retryable: true
      });
    });

    act(() => result.current.retrySummary());
    await waitFor(() => expect(client.getSummary).toHaveBeenCalledTimes(2));
    expect(client.listLedger).toHaveBeenCalledTimes(1);

    act(() => result.current.retryLedger());
    await waitFor(() => expect(client.listLedger).toHaveBeenCalledTimes(2));
    expect(client.getSummary).toHaveBeenCalledTimes(2);
  });

  test("refreshes summary and the visible ledger through one Wallet invalidation", async () => {
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => ACTIVE_SUMMARY),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const { result } = renderHook(() => usePortalWalletReadModel({
      client,
      sessionRef: "session_wallet_001",
      sessionGeneration: 1,
      loadLedger: true,
      onSessionInvalid: vi.fn()
    }));

    await waitFor(() => {
      expect(result.current.summary.phase).toBe("ready");
      expect(result.current.ledger.phase).toBe("empty");
    });
    expect(client.getSummary).toHaveBeenCalledTimes(1);
    expect(client.listLedger).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refreshWallet();
    });
    await waitFor(() => {
      expect(client.getSummary).toHaveBeenCalledTimes(2);
      expect(client.listLedger).toHaveBeenCalledTimes(2);
    });
  });

  test("ignores old generation results and stale session-invalid failures", async () => {
    const oldSummary = deferred<PortalWalletSummary>();
    const oldLedger = deferred<{
      entries: PortalWalletLedgerEntry[];
      nextCursor: null;
    }>();
    const nextSummary = deferred<PortalWalletSummary>();
    const nextLedger = deferred<{
      entries: PortalWalletLedgerEntry[];
      nextCursor: null;
    }>();
    const client: PortalWalletClient = {
      getSummary: vi.fn(({ sessionRef }) => (
        sessionRef === "session_wallet_old"
          ? oldSummary.promise
          : nextSummary.promise
      )),
      listLedger: vi.fn(({ sessionRef }) => (
        sessionRef === "session_wallet_old"
          ? oldLedger.promise
          : nextLedger.promise
      ))
    };
    const onSessionInvalid = vi.fn();
    const { result, rerender } = renderHook(
      (props: { generation: number; sessionRef: string }) => (
        usePortalWalletReadModel({
          client,
          sessionRef: props.sessionRef,
          sessionGeneration: props.generation,
          loadLedger: true,
          onSessionInvalid
        })
      ),
      {
        initialProps: {
          generation: 1,
          sessionRef: "session_wallet_old"
        }
      }
    );

    rerender({
      generation: 2,
      sessionRef: "session_wallet_new"
    });
    await act(async () => {
      oldSummary.reject(
        new PortalWalletClientError("wallet_session_invalid", false)
      );
      oldLedger.resolve({ entries: [CREDIT_ENTRY], nextCursor: null });
      await Promise.allSettled([oldSummary.promise, oldLedger.promise]);
    });
    expect(onSessionInvalid).not.toHaveBeenCalled();
    expect(result.current.summary).toEqual({ phase: "loading" });
    expect(result.current.ledger).toEqual({ phase: "loading" });

    await act(async () => {
      nextSummary.resolve(ACTIVE_SUMMARY);
      nextLedger.resolve({ entries: [HELD_ENTRY], nextCursor: null });
      await Promise.all([nextSummary.promise, nextLedger.promise]);
    });
    expect(result.current.summary).toEqual({
      phase: "ready",
      value: ACTIVE_SUMMARY
    });
    expect(result.current.ledger).toEqual({
      phase: "ready",
      value: [HELD_ENTRY]
    });
  });

  test("does not let a stale generation rejection invoke the committed session callback", async () => {
    const staleSummary = deferred<PortalWalletSummary>();
    const currentSummary = deferred<PortalWalletSummary>();
    let summaryRequest = 0;
    const client: PortalWalletClient = {
      getSummary: vi.fn(() => {
        summaryRequest += 1;
        return (
          summaryRequest === 1
          ? staleSummary.promise
          : currentSummary.promise
        );
      }),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const staleSessionInvalid = vi.fn();
    const currentSessionInvalid = vi.fn();
    const { result, rerender } = renderHook(
      (props: { generation: number; onSessionInvalid: () => void }) => (
        usePortalWalletReadModel({
          client,
          sessionRef: "session_wallet_same_ref",
          sessionGeneration: props.generation,
          loadLedger: false,
          onSessionInvalid: props.onSessionInvalid
        })
      ),
      {
        initialProps: { generation: 1, onSessionInvalid: staleSessionInvalid }
      }
    );

    rerender({ generation: 2, onSessionInvalid: currentSessionInvalid });
    await act(async () => {
      currentSummary.resolve(ACTIVE_SUMMARY);
      await currentSummary.promise;
    });
    expect(result.current.summary).toEqual({ phase: "ready", value: ACTIVE_SUMMARY });

    await act(async () => {
      staleSummary.reject(new PortalWalletClientError("wallet_session_invalid", false));
      await Promise.allSettled([staleSummary.promise]);
    });
    expect(result.current.summary).toEqual({ phase: "ready", value: ACTIVE_SUMMARY });
    expect(staleSessionInvalid).not.toHaveBeenCalled();
    expect(currentSessionInvalid).not.toHaveBeenCalled();
  });

  test("guards the exact load-more cursor and preserves current rows on cross-page duplicates", async () => {
    const cursor = {
      afterOccurredAt: CREDIT_ENTRY.occurredAt,
      afterEntryRef: CREDIT_ENTRY.entryRef
    };
    const pageTwo = deferred<{
      entries: PortalWalletLedgerEntry[];
      nextCursor: null;
    }>();
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => ACTIVE_SUMMARY),
      listLedger: vi.fn((input) => (
        "afterOccurredAt" in input
          ? pageTwo.promise
          : Promise.resolve({
              entries: [CREDIT_ENTRY],
              nextCursor: cursor
            })
      ))
    };
    const { result } = renderHook(() => usePortalWalletReadModel({
      client,
      sessionRef: "session_wallet_001",
      sessionGeneration: 1,
      loadLedger: true,
      onSessionInvalid: vi.fn()
    }));
    await waitFor(() => {
      expect(result.current.nextLedgerCursor).toEqual(cursor);
    });

    act(() => {
      result.current.loadMoreLedger();
      result.current.loadMoreLedger();
    });
    expect(client.listLedger).toHaveBeenCalledTimes(2);
    expect(client.listLedger).toHaveBeenLastCalledWith({
      sessionRef: "session_wallet_001",
      limit: 25,
      ...cursor
    });

    await act(async () => {
      pageTwo.resolve({
        entries: [CREDIT_ENTRY, HELD_ENTRY],
        nextCursor: null
      });
      await pageTwo.promise;
    });
    expect(result.current.ledger).toEqual({
      phase: "ready",
      value: [CREDIT_ENTRY]
    });
    expect(result.current.loadMoreLedgerError).toEqual({
      phase: "error",
      retryable: true
    });
    expect(result.current.nextLedgerCursor).toEqual(cursor);
  });

  test("appends a unique cursor-matched page and ignores it after Wallet closes", async () => {
    const cursor = {
      afterOccurredAt: CREDIT_ENTRY.occurredAt,
      afterEntryRef: CREDIT_ENTRY.entryRef
    };
    const successfulPage = deferred<{
      entries: PortalWalletLedgerEntry[];
      nextCursor: null;
    }>();
    const stalePage = deferred<{
      entries: PortalWalletLedgerEntry[];
      nextCursor: null;
    }>();
    let pageRequest = 0;
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => ACTIVE_SUMMARY),
      listLedger: vi.fn((input) => {
        if (!("afterOccurredAt" in input)) {
          return Promise.resolve({
            entries: [CREDIT_ENTRY],
            nextCursor: cursor
          });
        }
        pageRequest += 1;
        return pageRequest === 1
          ? successfulPage.promise
          : stalePage.promise;
      })
    };
    const { result, rerender } = renderHook(
      (loadLedger: boolean) => usePortalWalletReadModel({
        client,
        sessionRef: "session_wallet_001",
        sessionGeneration: 1,
        loadLedger,
        onSessionInvalid: vi.fn()
      }),
      { initialProps: true }
    );
    await waitFor(() => {
      expect(result.current.nextLedgerCursor).toEqual(cursor);
    });

    act(() => result.current.loadMoreLedger());
    await act(async () => {
      successfulPage.resolve({
        entries: [HELD_ENTRY],
        nextCursor: null
      });
      await successfulPage.promise;
    });
    expect(result.current.ledger).toEqual({
      phase: "ready",
      value: [CREDIT_ENTRY, HELD_ENTRY]
    });

    act(() => result.current.retryLedger());
    await waitFor(() => {
      expect(result.current.nextLedgerCursor).toEqual(cursor);
    });
    act(() => result.current.loadMoreLedger());
    rerender(false);
    await act(async () => {
      stalePage.resolve({
        entries: [HELD_ENTRY],
        nextCursor: null
      });
      await stalePage.promise;
    });
    expect(result.current.ledger).toEqual({
      phase: "unavailable",
      retryable: false
    });
  });
});
