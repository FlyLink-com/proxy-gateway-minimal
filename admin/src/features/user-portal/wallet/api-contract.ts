export type PortalWalletStatus =
  | "not_created"
  | "active"
  | "frozen"
  | "closed";

export type PortalWalletSummary = {
  status: PortalWalletStatus;
  version: number;
  balances: {
    paidCoins: number;
    bonusCoins: number;
    rewardCoins: number;
  };
  spendableUnits: number;
  heldUnits: number;
  pendingUnits: number;
};

export type PortalWalletLedgerCategory =
  | "credit"
  | "pending_to_reversed"
  | "available_to_reversed"
  | "pending_to_available"
  | "available_to_held"
  | "held_to_available"
  | "held_to_consumed"
  | "held_to_expired"
  | "available_to_expired";

type PortalWalletLedgerCommon = {
  entryRef: string;
  coinType: "paid_coins" | "bonus_coins" | "reward_coins";
  amountUnits: number;
  relatedOrderRef: string | null;
  occurredAt: string;
};

type PortalWalletBucketTransitionCategory =
  Exclude<PortalWalletLedgerCategory, "credit">;

export type PortalWalletLedgerEntry =
  | (PortalWalletLedgerCommon & {
      category: "credit";
      availableDeltaUnits: null;
      pendingDeltaUnits: null;
      heldDeltaUnits: null;
      totalDeltaUnits: number;
    })
  | (PortalWalletLedgerCommon & {
      category: PortalWalletBucketTransitionCategory;
      availableDeltaUnits: number;
      pendingDeltaUnits: number;
      heldDeltaUnits: number;
      totalDeltaUnits: number;
    });

export type PortalWalletClient = {
  getSummary(input: { sessionRef: string }): Promise<PortalWalletSummary>;
  listLedger(input:
    | {
        sessionRef: string;
        limit: number;
        afterOccurredAt?: never;
        afterEntryRef?: never;
      }
    | {
        sessionRef: string;
        limit: number;
        afterOccurredAt: string;
        afterEntryRef: string;
      }
  ): Promise<{
    entries: PortalWalletLedgerEntry[];
    nextCursor: {
      afterOccurredAt: string;
      afterEntryRef: string;
    } | null;
  }>;
};

export type PortalWalletErrorCode =
  | "wallet_request_invalid"
  | "wallet_session_invalid"
  | "wallet_unavailable";

export type PortalWalletClientErrorCode =
  | PortalWalletErrorCode
  | "wallet_request_failed";
