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

    expect(screen.getByRole("region", { name: "Coins Wallet" })).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
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

  test("features current balance with four quota breakdowns and a separate pending reward status", () => {
    renderPanel(walletModel());

    const primaryBalances = document.querySelector(".portal-wallet-balance-grid");
    expect(primaryBalances).not.toBeNull();
    expect(within(primaryBalances as HTMLElement).getAllByRole("term")).toHaveLength(5);
    expect(within(primaryBalances as HTMLElement).getByText("Spendable balance"))
      .toBeInTheDocument();
    expect(within(primaryBalances as HTMLElement).getByText("Purchased available"))
      .toBeInTheDocument();
    expect(within(primaryBalances as HTMLElement).getByText("Bonus available"))
      .toBeInTheDocument();
    expect(within(primaryBalances as HTMLElement).getByText("Reward available"))
      .toBeInTheDocument();
    expect(within(primaryBalances as HTMLElement).getByText("Order reserved"))
      .toBeInTheDocument();

    const secondaryBalances = document.querySelector(".portal-wallet-status-grid");
    expect(secondaryBalances).not.toBeNull();
    expect(within(secondaryBalances as HTMLElement).getAllByRole("term")).toHaveLength(1);
    expect(within(secondaryBalances as HTMLElement).getByText("Pending rewards"))
      .toBeInTheDocument();
  });

  test("keeps the balance region named without a heading or manual refresh action", () => {
    const refreshWallet = vi.fn();
    renderPanel(walletModel({ refreshWallet }));

    expect(screen.getByRole("region", { name: "Balance" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Balance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh Wallet" })).not.toBeInTheDocument();
    expect(refreshWallet).not.toHaveBeenCalled();
  });

  test.each(["zh", "en"] as const)("keeps stale %s balances visible and provides the original retry action", (locale) => {
    const retrySummary = vi.fn();
    renderPanel({ ...walletModel(), retrySummary,
      summaryRefreshError: { phase: "error", retryable: true }
    }, locale);
    expect(screen.getByText("155", { selector: "dd" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(locale === "zh"
      ? "余额更新失败，当前为上次数据。"
      : "Balance update failed. Showing the last available data.");
    fireEvent.click(screen.getByRole("button", { name: locale === "zh" ? "重试余额" : "Retry balance" }));
    expect(retrySummary).toHaveBeenCalledOnce();
  });

  test("keeps stale activity visible and does not offer retry for a nonretryable failure", () => {
    const retryLedger = vi.fn();
    renderPanel({ ...walletModel(), retryLedger,
      ledgerRefreshError: { phase: "error", retryable: false }
    }, "zh");
    expect(screen.getByRole("alert")).toHaveTextContent("账单更新失败，当前为上次数据。");
    expect(screen.getByText("Coins 入账")).toBeVisible();
    expect(screen.queryByRole("button", { name: "重试流水" })).not.toBeInTheDocument();
    expect(retryLedger).not.toHaveBeenCalled();
  });

  test("shows stale empty activity with retry and limits the historical-view notice to all activity", () => {
    const retryLedger = vi.fn();
    renderPanel({ ...walletModel(), retryLedger,
      ledger: { phase: "empty", value: [] },
      ledgerRefreshError: { phase: "unavailable", retryable: true },
      ledgerAutoRefreshPaused: true
    }, "zh");
    expect(screen.getByText("账单更新失败，当前为上次数据。")).toBeVisible();
    expect(screen.getByText("暂无钱包流水。")).toBeVisible();
    expect(screen.queryByText("正在查看历史记录")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看全部" }));
    expect(screen.getByText("正在查看历史记录")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重试流水" }));
    expect(retryLedger).toHaveBeenCalledOnce();
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

  test.each([
    { locale: "en" as const, pending: "Pending balance reversed", available: "Available balance reversed", all: "View all activity" },
    { locale: "zh" as const, pending: "待确认余额撤回", available: "可用余额撤回", all: "查看全部" }
  ])("renders $locale reversal labels and bucket deltas without deducting twice", ({ locale, pending, available, all }) => {
    const entries: PortalWalletLedgerEntry[] = [
      {
        ...CONSUMED_ENTRY,
        entryRef: "entry_pending_reversed",
        category: "pending_to_reversed",
        coinType: "reward_coins",
        amountUnits: 7,
        availableDeltaUnits: 0,
        pendingDeltaUnits: -7,
        heldDeltaUnits: 0,
        totalDeltaUnits: -7
      },
      {
        ...EXPIRED_ENTRY,
        entryRef: "entry_available_reversed",
        category: "available_to_reversed",
        coinType: "reward_coins",
        amountUnits: 11,
        availableDeltaUnits: -11,
        pendingDeltaUnits: 0,
        heldDeltaUnits: 0,
        totalDeltaUnits: -11
      }
    ];
    renderPanel(walletModel({ ledger: { phase: "ready", value: entries } }), locale);
    const cells = (label: string) => within(screen.getByText(label).closest("tr") as HTMLElement)
      .getAllByRole("cell").map(cell => cell.textContent);
    expect(cells(pending).at(-1)).toBe("-7");
    expect(cells(available).at(-1)).toBe("-11");
    expect(screen.queryByText("-14")).not.toBeInTheDocument();
    expect(screen.queryByText("-22")).not.toBeInTheDocument();
    expect(screen.getByText("155", { selector: "dd" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: all }));
    expect(cells(pending).slice(-4)).toEqual(["-7", "0", "-7", "0"]);
    expect(cells(available).slice(-4)).toEqual(["-11", "-11", "0", "0"]);
    expect(document.body).not.toHaveTextContent(/pending_to_reversed|available_to_reversed/);
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

    fireEvent.click(screen.getByRole("button", { name: "Back to Wallet" }));
    const returnedRecentTable = screen.getByRole("table", {
      name: "Recent Coins Wallet activity"
    });
    expect(within(returnedRecentTable).getAllByRole("row")).toHaveLength(6);
    expect(screen.queryByText("order_wallet_006")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Coins Wallet activity" })).toBeNull();
    expect(loadMoreLedger).not.toHaveBeenCalled();
  });

  test.each(["settled", "in-flight"] as const)("returning from a %s history page refreshes the first page and resumes updates", async (pageState) => {
    const cursor = { afterOccurredAt: CREDIT_ENTRY.occurredAt, afterEntryRef: CREDIT_ENTRY.entryRef };
    const pageTwo = deferred<Awaited<ReturnType<PortalWalletClient["listLedger"]>>>();
    const freshEntry = { ...CREDIT_ENTRY, entryRef: "entry_fresh_overview", amountUnits: 44, totalDeltaUnits: 44 };
    const client: PortalWalletClient = {
      getSummary: vi.fn(async () => ACTIVE_SUMMARY),
      listLedger: vi.fn()
        .mockResolvedValueOnce({ entries: [CREDIT_ENTRY], nextCursor: cursor })
        .mockImplementationOnce(() => pageTwo.promise)
        .mockResolvedValueOnce({ entries: [freshEntry], nextCursor: null }),
    };
    const { modelRef } = renderWalletHarness(client);
    await waitFor(() => expect(modelRef.current?.nextLedgerCursor).toEqual(cursor));
    fireEvent.click(screen.getByRole("button", { name: "View all activity" }));
    expect(client.listLedger).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Load more activity" }));
    expect(client.listLedger).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(modelRef.current?.ledgerAutoRefreshPaused).toBe(true));
    if (pageState === "settled") {
      await act(async () => {
        pageTwo.resolve({ entries: [HELD_ENTRY], nextCursor: null });
        await pageTwo.promise;
      });
      expect(modelRef.current?.ledger).toEqual({ phase: "ready", value: [CREDIT_ENTRY, HELD_ENTRY] });
    } else {
      expect(modelRef.current?.loadingMoreLedger).toBe(true);
    }
    expect(screen.getByText("Viewing historical activity")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to Wallet" }));
    if (pageState === "in-flight") {
      expect(client.listLedger).toHaveBeenCalledTimes(2);
      await act(async () => {
        pageTwo.resolve({ entries: [HELD_ENTRY], nextCursor: null });
        await pageTwo.promise;
      });
    }
    await waitFor(() => expect(client.listLedger).toHaveBeenCalledTimes(3));
    expect(client.listLedger).toHaveBeenLastCalledWith({ sessionRef: "session_wallet_001", limit: 25 });
    await waitFor(() => expect(modelRef.current?.ledger).toEqual({ phase: "ready", value: [freshEntry] }));
    expect(modelRef.current?.ledgerAutoRefreshPaused).toBe(false);
    expect(modelRef.current?.loadingMoreLedger).toBe(false);
    expect(screen.getByRole("table", { name: "Recent Coins Wallet activity" })).toHaveTextContent("+44");
    expect(screen.queryByText("Viewing historical activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Reserved for order")).not.toBeInTheDocument();
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

  test.each([
    {
      locale: "en" as const,
      statusLabel: "Awaiting first credit",
      emptyMessage: "No Coins have been credited yet. Your Wallet will activate automatically after the first successful recharge."
    },
    {
      locale: "zh" as const,
      statusLabel: "待首次入账",
      emptyMessage: "尚无 Coins 入账。首次充值到账后，钱包将自动启用。"
    }
  ])("renders the $locale first-credit Wallet state", ({
    locale,
    statusLabel,
    emptyMessage
  }) => {
    renderPanel(walletModel({
      summary: { phase: "empty", value: NOT_CREATED_SUMMARY }
    }), locale);

    expect(screen.getByText(statusLabel, { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(emptyMessage)).toHaveAttribute("role", "status");
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

    expect(screen.getByRole("region", { name: "Balance" }))
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
      heading: "Coins Wallet",
      button: "Recharge Coins",
    },
    {
      locale: "zh" as const,
      heading: "Coins 钱包",
      button: "充值 Coins",
    },
  ])("keeps the $locale recharge section inline without creating an order on entry", ({
    locale,
    heading,
    button,
  }) => {
    const openDialog = vi.fn();
    const rechargeModel: PortalRechargeModel = {
      available: true,
      dialogOpen: false,
      offers: [],
      offersState: { status: "ready" },
      activeOrder: null,
      busy: false,
      error: null,
      openDialog,
      closeDialog: vi.fn(),
      retryOffers: vi.fn(),
      createOrder: vi.fn(async () => undefined),
      continueOrderPayment: vi.fn(() => "not_applicable" as const),
    };
    render(createElement(PortalWalletPanel, {
      locale,
      model: walletModel(),
      rechargeModel,
    }));

    const wallet = screen.getByRole("region", { name: heading });
    expect(within(wallet).queryByRole("banner")).not.toBeInTheDocument();
    expect(within(wallet).getByRole("heading", { name: button })).toBeInTheDocument();
    expect(wallet).not.toHaveTextContent(
      /PayPal|Sandbox|USD|adapter|支付宝|Alipay|微信支付|WeChat/i,
    );
    expect(openDialog).not.toHaveBeenCalled();
    expect(rechargeModel.createOrder).not.toHaveBeenCalled();
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
