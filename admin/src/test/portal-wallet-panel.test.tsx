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
    ...overrides
  };
}

function renderPanel(model: PortalWalletReadModel, locale: "zh" | "en" = "en") {
  return render(createElement(PortalWalletPanel, { locale, model }));
}

describe("PortalWalletPanel", () => {
  test("maps each Wallet activity header to its ordered entry cell", () => {
    renderPanel(walletModel({
      ledger: { phase: "ready", value: [HELD_ENTRY] }
    }));

    expect(screen.getByRole("heading", { name: "Balance and recharge" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("120", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("30", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("5", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("155", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("9", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("4", { selector: "dd" })).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Coins Wallet activity" });
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
    const heldRow = screen.getByText("available_to_held").closest("tr");
    expect(heldRow).not.toBeNull();
    expect(within(heldRow as HTMLElement).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "available_to_held",
      "bonus_coins",
      "2026-07-27T11:00:00.000Z",
      "order_wallet_002",
      "0",
      "-5",
      "0",
      "+5"
    ]);
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
      message: "Wallet not created. Available balance is 0 Coins.",
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

    fireEvent.click(screen.getByRole("button", { name: "Load more activity" }));
    expect(loadMoreLedger).toHaveBeenCalledTimes(1);

    rerender(createElement(PortalWalletPanel, {
      locale: "en",
      model: { ...model, nextLedgerCursor: null }
    }));
    expect(screen.queryByRole("button", { name: "Load more activity" })).not.toBeInTheDocument();
  });

  test("keeps all six recharge denominations disabled", () => {
    renderPanel(walletModel(), "zh");

    const recharge = screen.getByRole("list", { name: "Coins 充值档位" });
    const buttons = within(recharge).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "10 Coins",
      "30 Coins",
      "50 Coins",
      "100 Coins",
      "200 Coins",
      "300 Coins"
    ]);
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
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

  test("guards the exact load-more cursor, in-flight request, and cross-page duplicates", async () => {
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
      phase: "error",
      retryable: true
    });
    expect(result.current.nextLedgerCursor).toBeNull();
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
