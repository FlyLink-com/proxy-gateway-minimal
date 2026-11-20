# D1 Stage 1B — BWH `subscription-control.sqlite` Write Inventory (V1)

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_stage1b_bwh_write_inventory
  superseded_by: null
  last_verified_at: 2026-11-20
  production_authority: false
```

- **Branch:** `feat/d1-stage1b-bwh-source-authority`, base `11dd1cfb` (FlyLink-com/proxy-gateway-minimal)
- **Date of audit:** 2026-11-20 (read-only; grep/read only, no server run, no database touched, no git operation)
- **Spec basis:** `docs/D1_STAGE1B_AGENT_EPOCH_MUSE_HANDOFF_V1.md` (PR #895) and `docs/D1_STAGE1A_SINGLE_WRITER_EPOCH_CONTRACT_V1.md` (PR #894), read in full from `pgm-investigate-2026-11-18` (`git show pr895:…`).
- **Status:** V1 final inventory for the Stage 1B fencing task. §15 records per-site fencing coverage (FENCED vs FOLLOW-UP) as implemented on this branch. It is not a cutover authorization.

## 0. Scope: which file is "the BWH control database"

The single business-control SQLite file is resolved in `server/state.mjs:1912-1916` as
`options.controlDbPath || env.SUBSCRIPTION_CONTROL_DB_PATH || env.CONTROL_DB_PATH || <root>/.proxy-gateway/control.sqlite`.
Production BWH points that variable at `…/shared/state/subscription-control.sqlite`
(`docs/CURRENT_RELEASE_STATE.md:708`; CLI SOP uses `--control-db-path ".proxy-gateway/subscription-control.sqlite"`).
The code default filename (`control.sqlite`) and the production filename (`subscription-control.sqlite`)
are the same logical database; every entry below writes to that one file.

### 0.1 Connections that open this file (all verified in source)

| # | Opener | File:line | Notes |
|---|---|---|---|
| C-01 | Central store `createSqliteSubscriptionControlStore` | `server/services/platform/subscription-control-db.mjs:1281-1282` | The shared handle (`platformControlStore`, `server/state.mjs:1955`). Most service-layer writes go through its methods. `db.pragma("journal_mode = WAL")` at `:1285` (schema-init only). |
| C-02 | Coin commerce store (own connection; shared internally with its wallet + authority stores) | `server/services/platform/coin-commerce-store.mjs:468`, `:520-522` | `createSqliteCoinCommerceStore({ dbPath: controlDbPath })` (`server/state.mjs:2823-2824`). Its `walletStore` and `authorityStore` reuse the same `db` handle. |
| C-03 | Coin wallet store, standalone mode | `server/services/platform/coin-wallet-store.mjs:876` | `createSqliteCoinWalletStore({ dbPath: controlDbPath })` (`server/state.mjs:2085-2086`). |
| C-04 | Payment store (own connection) | `server/services/platform/payment-store.mjs:275` | `createSqlitePaymentStore({ dbPath: controlDbPath })` (`server/state.mjs:3159-3160`). |
| C-05 | Ads consent store (own connection) | `server/services/platform/ads-consent-store.mjs:325` | `createSqliteAdsConsentStore({ dbPath: controlDbPath })` (`server/state.mjs:2864-2865`). |
| C-06 | Portal referral service (own connection) | `server/services/platform/portal-referral-service.mjs:46` | `createPortalReferralService({ dbPath: controlDbPath, … })` (`server/state.mjs:3166-3167`). |
| C-07 | Deferred-transition store (own connection, via runtime) | `server/services/platform/deferred-resource-transition-store.mjs:794` | Via `createWalletFirstDeferredTransitionRuntime({ dbPath: controlDbPath, … })` (`server/state.mjs:2988`). |
| C-08 | Admin user-commerce service (opens + closes a connection per call) | `server/services/platform/admin-user-commerce.mjs:278` | `createAdminUserCommerceService({ dbPath: controlDbPath })` (`server/state.mjs:3287-3288`). |
| C-09 | Lead-retention operations (opens a connection per operation) | `server/services/platform/lead-retention-operations.mjs:416` | CLI-driven (`scripts/platform-lead-retention.mjs`); also opens the file read-only for backup (`:656`). |
| C-10 | Snapshot-gate quiesce (opens the live source file, checkpoints it) | `scripts/control-plane-db-snapshot-gate-lib.mjs:759` | `wal_checkpoint(TRUNCATE)` + `BEGIN EXCLUSIVE` + file copy; operator script, not server runtime. See W-116. |
| C-11 | Migration CLIs (each opens the file per run) | `server/services/platform/*-migrations.mjs` (see §9) | Invoked via `scripts/platform-*-schema.mjs`; never from server startup (no `apply*Migrations` call exists under `server/` outside migration files and tests). |
| C-12 | Link-reset store / identity-binding repository / account-resource-authority store | `server/services/platform/portal-subscription-link-reset-store.mjs:29`, `d1-identity-binding-repository.mjs:53`, `account-resource-authority.mjs:109` | Take an injected `database` handle — the central store's handle (via `subscription-control-db.mjs:10285`, `:10312`, and coin-commerce-store `:520` authority path). No separate file open. |

Multiple live connections write to the same file concurrently (C-01…C-08 are all held open by one server process).
`busy_timeout` / `foreign_keys` pragmas are set per connection; they are session settings, not durable writes.

### 0.2 Out of scope — verified NOT writers to this file

- `subscriptions.sqlite` (`server/services/subscriptions/repository.mjs`, `server/state.mjs:1912`) — separate runtime-subscription file.
- Third-party subscription + distribution stores use `env.THIRD_PARTY_SUBSCRIPTION_DB_PATH` (`server/state.mjs:3226-3252`); `subscription-distribution-store.mjs` takes `controlStore` but no `controlStore.*` write call was found in it.
- `workers/control-plane/**` uses D1 only; no `better-sqlite3` import exists under `workers/` or `agent/`.
- Read-only openers: `admin-usage-ledger-query.mjs:312` (`readonly`, `query_only = ON`), `admin-order-status-summary.mjs:191`, `admin-recharge-confirmation-gross.mjs:276`, `material-handoff-readonly-control-store.mjs:102`, `scripts/b2-backfill-inventory.mjs:18` (read-only inventory read).
- `scripts/platform-revoke-access.mjs` is dry-run/plan-only by construction (`noDatabaseMutation: true`, non-`--dry-run` rejected).
- `server/services/platform/subscription-expiry-notice.mjs`, `bwh-supply-service.mjs`, `admin-usage-ledger-worker.mjs`, `order-usage-quota-lifecycle-gate.mjs` contain no direct DML against this file (verified by grep).

### 0.3 How to read the tables

- **Write site** is the `file:line` of the DML statement itself (verified by reading the code).
- **Txn** = whether the listed method itself opens an explicit `db.transaction(...)`.
  `No` means the statement runs as a single-statement autocommit write unless a caller wraps it —
  several `No` rows are in fact executed inside a caller's `controlStore.runInTransaction(...)`
  (see §10, "Fencing status": that wrapper is phase-fenced by default since this round, §15).
- **Trigger** is the traced caller chain. `UNTRACED` means the chain could not be completed from source;
  details are in §11. `LATENT` means the writer is defined and exported but no production caller was found.

## 1. Domain: account / session / credential

| ID | Writer (method) | Write site | Table(s) | Entry trigger | Txn |
|---|---|---|---|---|---|
| W-001 | `upsertLead` | `server/services/platform/subscription-control-db.mjs:1923` | `platform_leads` | HTTP `POST /api/public/leads` (`server/routes/public-leads.mjs:31-34` → `leadQueue.enqueueLead`) and admin lead-status update (`server/routes/admin-platform.mjs:841,851` → `leadQueue.updateLeadStatus`); both via `lead-review-queue.mjs:93,134` | No |
| W-002 | `purgeExpiredLeads` | `server/services/platform/subscription-control-db.mjs:1964` | `platform_leads` (DELETE) | CLI `scripts/platform-lead-retention.mjs` `purge --apply` → `lead-retention-operations.mjs:465` (`runLeadPurge`, own connection C-09); also `lead-review-queue.mjs:76,141` (queue method; its live caller was not traced — see U-01) | No |
| W-003 | `createAccount` | `server/services/platform/subscription-control-db.mjs:1979` | `platform_accounts` | HTTP registration / authority registration / initial-account issuance; admin lead conversion (`server/routes/admin-platform.mjs:850` via `account-entitlement-shell`); CLI `scripts/platform-issue-portal-initial-account.mjs` and `scripts/platform-issue-subscription.mjs` (via `subscription-issuance.mjs`). Call sites wrap it in `runInTransaction` (`portal-authority-registration.mjs:99`, `portal-registration.mjs:432-433`, `portal-initial-account-issuance.mjs:110`) | No (caller txn) |
| W-004 | `createPortalEntry` | `server/services/platform/subscription-control-db.mjs:9359` | `platform_portal_entries` | `user-portal-auth.mjs:691-702` `issueDynamicEntry`; CLI `scripts/platform-issue-portal-entry.mjs:111` | No |
| W-005 | `markPortalEntryUsed` | `server/services/platform/subscription-control-db.mjs:9380` | `platform_portal_entries` | `user-portal-auth.mjs` entry redemption during portal login | No |
| W-006 | `createPortalTotpCredential` | `server/services/platform/subscription-control-db.mjs:9404` | `platform_portal_totp_credentials` | `user-portal-auth.mjs` / `admin-auth.mjs` TOTP setup (HTTP) | No |
| W-007 | `recordPortalTotpVerificationFailure` | `server/services/platform/subscription-control-db.mjs:9431` | `platform_portal_totp_credentials` | `user-portal-auth.mjs` / `admin-auth.mjs` login verification failures | No |
| W-008 | `markPortalTotpVerified` | `server/services/platform/subscription-control-db.mjs:9449` | `platform_portal_totp_credentials` | `user-portal-auth.mjs` / `admin-auth.mjs` login verification success | No |
| W-009 | `createPortalPasswordCredential` | `server/services/platform/subscription-control-db.mjs:9474` | `platform_portal_password_credentials` | `portal-password-credentials.mjs`; CLI initial-account issuance; `server/state.mjs` bootstrap path | No |
| W-010 | `recordPortalPasswordVerificationFailure` | `server/services/platform/subscription-control-db.mjs:9501` | `platform_portal_password_credentials` | `portal-password-credentials.mjs` login failure | No |
| W-011 | `markPortalPasswordVerified` | `server/services/platform/subscription-control-db.mjs:9521` | `platform_portal_password_credentials` | `portal-password-credentials.mjs` login success | No |
| W-012 | `createPortalPasskeyCredential` | `server/services/platform/subscription-control-db.mjs:9552` | `platform_portal_passkey_credentials` | LATENT — exported, no production caller found | No |
| W-013 | `markPortalPasskeyVerified` | `server/services/platform/subscription-control-db.mjs:9583` | `platform_portal_passkey_credentials` | LATENT — exported, no production caller found | No |
| W-014 | `createPortalSecondFactorChallenge` | `server/services/platform/subscription-control-db.mjs:9619` | `platform_portal_second_factor_challenges` | `user-portal-auth.mjs` second-factor challenge issuance (HTTP portal login) | No |
| W-015 | `markPortalSecondFactorChallengeUsed` | `server/services/platform/subscription-control-db.mjs:9636` | `platform_portal_second_factor_challenges` | `user-portal-auth.mjs` challenge consumption | No |
| W-016 | `recordPortalSecondFactorChallengeFailure` | `server/services/platform/subscription-control-db.mjs:9652` | `platform_portal_second_factor_challenges` | `user-portal-auth.mjs` challenge failure | No |
| W-017 | `createPortalSession` | `server/services/platform/subscription-control-db.mjs:9677` | `platform_portal_sessions` | `user-portal-auth.mjs` portal login (HTTP). Note: `workers/control-plane/src/index.mjs` and `portal-auth.mjs` call a same-named method on the Worker D1 store — different database, out of scope here | No |
| W-018 | `revokePortalSession` | `server/services/platform/subscription-control-db.mjs:9695` | `platform_portal_sessions` | `user-portal-auth.mjs` logout / session revocation; `portal-identity-deletion.mjs` | No |
| W-019 | `recordPortalReferralRegistration` | `server/services/platform/subscription-control-db.mjs:10285` → `server/services/platform/portal-referral-contract.mjs:108` | `platform_referral_bindings` (INSERT) | HTTP portal registration (`portal-registration.mjs`, inside `runInTransaction`) | No (caller txn) |
| W-020 | `IdentityBindingRepository.createActive` | `server/services/platform/d1-identity-binding-repository.mjs:106` | `platform_identity_bindings` (INSERT) | HTTP authority registration (`portal-authority-registration.mjs:91-92,99`, inside `runInTransaction`); comment in source: "No public route creates or rebinds identities" — this is the separately-authorized import/link path | No (caller txn) |
| W-021 | `IdentityBindingRepository.revoke` | `server/services/platform/d1-identity-binding-repository.mjs:149` | `platform_identity_bindings` (UPDATE) | LATENT — exported, no production caller found | No |
| W-022 | `IdentityBindingRepository.deleteForAccount` | `server/services/platform/d1-identity-binding-repository.mjs:169-176` | `platform_identity_bindings` (UPDATE + DELETE) | Physical identity deletion (`portal-identity-deletion.mjs:565-566`) | Yes |
| W-023 | `account-resource-authority.assignAuthority` | `server/services/platform/account-resource-authority.mjs:308` (`assignImmediate`, `.transaction`) | `platform_account_resource_authorities` (INSERT, `:222`) | LATENT — store is constructed by the commerce store when `authorityEnabled` (`coin-commerce-store.mjs:495-500`), but no production caller of `assignAuthority` was found | Yes |
| W-024 | `account-resource-authority.reassignAuthority` | `server/services/platform/account-resource-authority.mjs:354` (`reassignImmediate`, `.transaction`) | `platform_account_resource_authorities` (INSERT new version + UPDATE revoke, `:222-230`) | LATENT — same as W-023 | Yes |

## 2. Domain: wallet / ledger

All wallet tables live in the control file. The commerce store's `walletStore` shares the commerce connection (C-02);
the standalone wallet store (C-03) is a second connection to the same file.

| ID | Writer (method) | Write site | Table(s) | Entry trigger | Txn |
|---|---|---|---|---|---|
| W-025 | `creditCoins` | `server/services/platform/coin-wallet-store.mjs:1400` (`runCreditTransaction`) | `platform_coin_operation_receipts`, `platform_coin_wallets`, `platform_coin_credit_origins`, `platform_coin_lots`, `platform_coin_ledger_entries` (`:1416-1558`) | Payment-recharge settlement (`payment-recharge-coordinator.mjs:220`); welcome-bonus coordinator (`portal-registration-welcome-bonus-coordinator.mjs`); referral settle (`portal-referral-service.mjs`) | Yes |
| W-026 | `confirmCoinCredit` | `server/services/platform/coin-wallet-store.mjs:1589` (`runConfirmCreditTransaction`) | `platform_coin_operation_receipts`, `platform_coin_lots`, `platform_coin_wallets`, `platform_coin_ledger_entries` (`:1638-1721`) | Referral reward confirmation (`portal-referral-service.mjs`) | Yes |
| W-027 | `createCoinHold` (incl. `createCoinHoldInTransaction` participant) | `server/services/platform/coin-wallet-store.mjs:2038` | `platform_coin_holds`, `platform_coin_hold_allocations`, `platform_coin_wallets`, `platform_coin_ledger_entries` (`:1924-2010`) | Commerce `confirmOrder` (`coin-commerce-store.mjs`) — HTTP checkout confirm | Yes |
| W-028 | `captureCoinHold` (participant) | `server/services/platform/coin-wallet-store.mjs:2388` (`runHoldLifecycleTransaction`) | `platform_coin_holds`, `platform_coin_wallets`, `platform_coin_ledger_entries` | Commerce `captureClaimedOrder` — coin-commerce coordinator (background) | Yes |
| W-029 | `releaseCoinHold` (participant) | `server/services/platform/coin-wallet-store.mjs:2388` | `platform_coin_holds`, `platform_coin_wallets`, `platform_coin_ledger_entries` | Commerce `cancelOrder` (HTTP) / `recoverNonTerminalOrders` (coordinator) | Yes |
| W-030 | `expireCoinHold` | `server/services/platform/coin-wallet-store.mjs:2390` (`runExpireHoldTransaction`) | `platform_coin_holds` (+ wallet/ledger via lifecycle helpers) | No external caller found; only in-file references — trigger UNTRACED (U-02) | Yes |
| W-031 | `expireCoinLot` | `server/services/platform/coin-wallet-store.mjs:2538` (`runExpireLotTransaction`) | `platform_coin_lots` (+ wallet/ledger) | No external caller found; only in-file references — trigger UNTRACED (U-02) | Yes |
| W-032 | `expireDuePortalRegistrationWelcomeBonusCoinLots` | `server/services/platform/coin-wallet-store.mjs:2653` | `platform_coin_lots` (+ wallet/ledger) | Welcome-bonus coordinator (`portal-registration-welcome-bonus-coordinator.mjs:406`) — background, started at boot | Yes |
| W-033 | Deferred-reservation participant (`create/verify/capture/release/preflightRebase/rebaseReservationInTransaction`) | `server/services/platform/coin-wallet-store.mjs:4156-4954` | Deferred reservation + allocation tables (`${DEFERRED_RESERVATIONS_TABLE}` / `${DEFERRED_RESERVATION_ALLOCATIONS_TABLE}`, `:4356-4893`) | Wallet-first deferred checkout adapter + deferred-transition coordinator; participant runs inside the caller's transaction | Yes (caller txn) |
| W-034 | Wallet internal receipt/ledger helpers (`insertStartedReceipt`, `completeReceipt`, `updateWalletVersion`, `updateLot`, `insertLedger`, `insertStartedLifecycleReceipt`, `completeLifecycleReceipt`) | `server/services/platform/coin-wallet-store.mjs:1327-2150`, `:3966-4078` | `platform_coin_operation_receipts`, `platform_coin_wallets`, `platform_coin_lots`, `platform_coin_ledger_entries` | Internal only — called from W-025…W-033 transactions | Yes (enclosing) |
| W-035 | Referral `accrue` | `server/services/platform/portal-referral-service.mjs:266-345` (`.transaction`) | `platform_referral_origins`, `platform_referral_accruals` (INSERT) + wallet credit via W-025 | Payment-recharge `onCredited` callback (`server/state.mjs:3172` wiring) and the referral 30 s tick `reconcile()` (`portal-referral-service.mjs:653`) | Yes |
| W-036 | Referral `settle` / `settleAccount` | `server/services/platform/portal-referral-service.mjs:388-389` (`.transaction`) | `platform_referral_accruals` | Referral 30 s tick (`portal-referral-service.mjs:653-656`, started `server/state.mjs:3301`) — no HTTP involved | Yes |
| W-037 | Referral `releasePendingReward` | `server/services/platform/portal-referral-service.mjs:366-380` | `platform_referral_accruals` (UPDATE) | Called from the settle path (W-036) | No (caller txn) |
| W-038 | Referral `confirm` | `server/services/platform/portal-referral-service.mjs:462-498` (`.transaction`) | `platform_referral_accruals` (UPDATE `risk_approved=1`, `:498`) | Trigger UNTRACED (U-03) — no production caller identified (name collides with unrelated `confirm` symbols repo-wide) | Yes |
| W-039 | Referral `applyRefund` | `server/services/platform/portal-referral-service.mjs:503-563` (`.transaction`) | `platform_referral_accruals` (UPDATE, `:563`) | Trigger UNTRACED (U-03) — wired via `refundReader` option; no production caller identified | Yes |
| W-040 | Referral `publishPolicy` | `server/services/platform/portal-referral-service.mjs:101-122` (`.transaction`) | `platform_referral_policies` (INSERT) | CLI `scripts/platform-portal-referral-policy.mjs:53-54`; admin-user-commerce clawback flow (`admin-user-commerce.mjs:450`) | Yes |
| W-041 | `reverseReferralReward` | `server/services/platform/portal-referral-wallet.mjs:39-74` | `platform_coin_operation_receipts`, `platform_coin_lots`, `platform_coin_wallets`, `platform_coin_ledger_entries` | Admin clawback (`admin-user-commerce.mjs:516`) and referral `applyRefund` path (`portal-referral-service.mjs:546`) | No (runs inside the caller's `db.transaction`, `admin-user-commerce.mjs:490`) |
| W-042 | Admin `clawback` | `server/services/platform/admin-user-commerce.mjs:479-536` (`db.transaction`) | `platform_referral_events` (INSERT, `:536`) + W-041 wallet reversal | HTTP `POST /api/admin/user-commerce/reward-clawbacks` (`server/routes/admin-user-commerce.mjs:57-58`) | Yes |
| W-043 | Welcome-bonus grant lifecycle (`claimNext…`, `complete…`, `defer…`, `mark…ReconciliationRequired`, `expireDue…`) | `server/services/platform/subscription-control-db.mjs:2317-2401` (DML `:2285-2401`) | `platform_portal_registration_welcome_coin_grants` | Welcome-bonus coordinator (`portal-registration-welcome-bonus-coordinator.mjs:334,398,412,310,321,376`) — background, started at boot (`server/start.mjs:429`); grants enqueued at registration (`enqueuePortalRegistrationWelcomeCoinGrant`, `portal-registration.mjs`) | Mixed: `claimNext…` Yes (`:2328`); `expireDue…` No (`:2283`); `complete/defer/mark` wrap the bare `updateClaimed…` (`:2392-2401`) — No own txn |
| W-044 | `enqueuePortalRegistrationWelcomeCoinGrant` | `server/services/platform/subscription-control-db.mjs:2258` | `platform_portal_registration_welcome_coin_grants` (INSERT) | HTTP portal registration (`portal-registration.mjs`) | No |

## 3. Domain: order / payment-callback

| ID | Writer (method) | Write site | Table(s) | Entry trigger | Txn |
|---|---|---|---|---|---|
| W-045 | Payment `createOrder` | `server/services/platform/payment-store.mjs:331` (`db.transaction`) | `platform_payment_orders` (INSERT, `:350`) | Payment-recharge coordinator order creation (`payment-recharge-coordinator.mjs:272`) — HTTP recharge create (`server/routes/portal-coin-recharge.mjs`) | Yes |
| W-046 | Payment `recordOperationReceipt` | `server/services/platform/payment-store.mjs:439` | `platform_payment_receipts` (INSERT, `:465`) | Payment-recharge coordinator (`payment-recharge-coordinator.mjs:300,354`) | Yes |
| W-047 | Payment `acceptVerifiedPayment` | `server/services/platform/payment-store.mjs:595` | `platform_payment_receipts` (INSERT, `:633`) + `platform_payment_orders` (UPDATE, `:665`) | Payment provider callback — HTTP `POST /api/platform/payments/{paypal,xsd,chaojipay}/callback` (`server/routes/portal-coin-recharge.mjs:15-28,403`) via `payment-recharge-coordinator.mjs:364,427` | Yes |
| W-048 | Payment `markOrderCredited` | `server/services/platform/payment-store.mjs:690` | `platform_payment_orders` (UPDATE, `:729`) | Payment-recharge coordinator settle (`payment-recharge-coordinator.mjs:252`) after W-025 wallet credit | Yes |
| W-049 | Payment `markOrderReconciliationRequired` | `server/services/platform/payment-store.mjs:753` | `platform_payment_orders` (UPDATE, `:768`) | Payment-recharge coordinator error path (`payment-recharge-coordinator.mjs:180`) | Yes |
| W-050 | Commerce `bootstrapPublishedOffers` | `server/services/platform/coin-commerce-store.mjs:1009` (`bootstrapTransaction`) | `platform_coin_commerce_offer_versions` (INSERT) | Server startup only, and only when a catalog is configured (`server/state.mjs:2920-2922`) | Yes |
| W-051 | Commerce `publishOfferVersion` | `server/services/platform/coin-commerce-store.mjs:965` (`publishTransaction`) | `platform_coin_commerce_offer_versions` (INSERT, `:719`) | No production trigger found — only `scripts/start-local-coin-commerce-validation.mjs`; LATENT | Yes |
| W-052 | Commerce `retireOfferVersion` | `server/services/platform/coin-commerce-store.mjs:1130` (`retireTransaction`) | `platform_coin_commerce_offer_versions` (UPDATE, `:1141`) | No production trigger found — same as W-051; LATENT | Yes |
| W-053 | Commerce `createCheckoutQuote` | `server/services/platform/coin-commerce-store.mjs:1202` (`createQuoteTransaction`) | `platform_coin_commerce_quotes` (INSERT, `:1301`), `platform_commerce_authority_quote_bindings` (INSERT, `:1325`), plan-switch quote + scheduled rows (W-068) | HTTP `POST` checkout quote (`server/routes/portal-coin-commerce.mjs:1484`); wallet-first deferred checkout adapter | Yes |
| W-054 | Commerce `confirmOrder` | `server/services/platform/coin-commerce-store.mjs:2245` (`confirmTransaction`) | `platform_coin_commerce_orders` (INSERT, `:2379`), `platform_coin_commerce_quotes` (UPDATE, `:2398`), wallet hold (W-027), ads capture/materialize (W-145/W-146) | HTTP `POST` order confirm (`server/routes/portal-coin-commerce.mjs:1591`); wallet-first commerce service | Yes |
| W-055 | Commerce `cancelOrder` | `server/services/platform/coin-commerce-store.mjs:2487` (`cancelTransaction`) | `platform_coin_commerce_orders` (UPDATE, `:2541`) + wallet hold release (W-029) | HTTP `POST` order cancel (`server/routes/portal-coin-commerce.mjs:1618`) | Yes |
| W-056 | Commerce `claimDueCaptures` | `server/services/platform/coin-commerce-store.mjs:2877` (`claimCapturesTransaction`) | `platform_coin_commerce_orders` (UPDATE cancel-stale, `:2892-2900`) | Coin-commerce coordinator pass (`coin-commerce-coordinator.mjs:462`) — background, started at boot | Yes |
| W-057 | Commerce `captureClaimedOrder` | `server/services/platform/coin-commerce-store.mjs:3690` (`captureTransaction`) | `platform_coin_commerce_orders` (UPDATE captured, `:3377`) + wallet hold capture (W-028) | Coin-commerce coordinator pass (`coin-commerce-coordinator.mjs`) — background | Yes |
| W-058 | Commerce `recoverNonTerminalOrders` | `server/services/platform/coin-commerce-store.mjs:3810` (`recoverTransaction`) | `platform_coin_commerce_orders` (UPDATE, `:3897`) + plan-switch due application (W-069, via `planSwitchApplyDue`, `:3982-3984`) | Coin-commerce coordinator pass (`coin-commerce-coordinator.mjs`) — background | Yes |
| W-059 | Commerce `claimNextFulfillmentCommand` | `server/services/platform/coin-commerce-store.mjs:4021` (`claimCommandTransaction`) | `platform_coin_commerce_fulfillment_commands` (UPDATE, `:4067`) | Coin-commerce coordinator pass (`coin-commerce-coordinator.mjs:480`) — background | Yes |
| W-060 | Commerce `completeFulfillmentCommand` | `server/services/platform/coin-commerce-store.mjs:4158` (`completeCommandTransaction`) | `platform_coin_commerce_fulfillment_commands` (UPDATE, `:4188`), `platform_coin_commerce_fulfillment_receipts` (INSERT, `:4210`) | Coin-commerce coordinator pass (`coin-commerce-coordinator.mjs`) — background; the fulfillment handler it drives writes W-070/W-123 | Yes |
| W-061 | Commerce `failFulfillmentCommand` | `server/services/platform/coin-commerce-store.mjs:4306` (`failCommandTransaction`) | `platform_coin_commerce_fulfillment_commands` (UPDATE, `:4324`) | Coin-commerce coordinator pass (`coin-commerce-coordinator.mjs`) — background | Yes |
| W-062 | Commerce receipt/event helpers (`insertStartedCommerceReceipt`, `completeCommerceReceipt`, `appendOrderEvent`) | `server/services/platform/coin-commerce-store.mjs:1543-1593`, `:3368-3371` | `platform_coin_commerce_operation_receipts`, `platform_coin_commerce_order_events`, `platform_coin_commerce_fulfillment_receipts` | Internal only — called from W-053…W-061 transactions | Yes (enclosing) |
| W-063 | Initial-confirmation `prepare` / `execute` | `server/services/platform/coin-commerce-initial-confirmation.mjs:215-284` (`database.transaction`) | `platform_audit_events` (INSERT, `:279`), `platform_coin_commerce_initial_confirmations` (INSERT, `:284`); post-commit ads flush/discard (W-147) | Trigger UNTRACED (U-04) — participant is registered by the commerce store (`coin-commerce-store.mjs:4551`); no production caller of `prepare`/`execute` was identified | Yes |
| W-064 | Commerce `nextWakeAt` | `server/services/platform/coin-commerce-store.mjs:4395` (`nextWakeTransaction`) | Read-only wake-time computation over order/command rows (no DML found in its body) | Coordinator scheduling | n/a (read) |

## 4. Domain: subscription-entitlement

| ID | Writer (method) | Write site | Table(s) | Entry trigger | Txn |
|---|---|---|---|---|---|
| W-065 | `createEntitlement` | `server/services/platform/subscription-control-db.mjs:5238` | `platform_entitlements` (INSERT) | Admin HTTP (`server/routes/admin-platform.mjs:239`); lead conversion via `account-entitlement-shell.mjs`; subscription issuance (`subscription-issuance.mjs`); CLI `scripts/platform-issue-subscription.mjs`; controlled-open package (`controlled-open-flow.mjs:55`) | No (call sites use `runInTransaction`) |
| W-066 | `updateEntitlementTrafficLimit` | `server/services/platform/subscription-control-db.mjs:5646` | `platform_entitlements` (UPDATE) | `portal-access-requests.mjs` traffic-limit sync | No |
| W-067 | `applyCoinCommerceSubscriptionFulfillment` | `server/services/platform/subscription-control-db.mjs:5753` (`db.transaction`, `:5908`) | `platform_entitlements` (UPDATE, `:6178`), `platform_portal_access_requests` (UPDATE, `:6200`) | Fulfillment handler (`coin-commerce-production-subscription-fulfillment.mjs`) driven by the coordinator's `completeFulfillmentCommand` path (W-060); also `coin-commerce-plan-switch-capture.mjs` | Yes |
| W-068 | Plan-switch quote/schedule (`insertPlanSwitchQuote`, scheduled insert) | `server/services/platform/coin-commerce-plan-switch-runtime.mjs:381`, `:427` | Plan-switch quote + scheduled-switch tables (`${QUOTE_TABLE}`, `${SCHEDULED_TABLE}`) | Inside commerce `createCheckoutQuote` transaction (W-053) | Yes (enclosing) |
| W-069 | Plan-switch due application (`applyDueScheduledPlanSwitches`; `markScheduledPlanSwitchApplying` `:480`, `markScheduledPlanSwitchApplied` `:469`, `supersedeScheduledPlanSwitch` `:453`) | `server/services/platform/coin-commerce-plan-switch-runtime.mjs:446-480`; invoked via `coin-commerce-store.mjs:3982-3984` and `subscription-control-db.mjs:5730` (`deliverPlanSwitchDowngrade`, `.transaction().immediate()`) | Scheduled-switch table | Coordinator `recoverNonTerminalOrders` (W-058) and fulfillment `completeScheduledPlanSwitch` (`coin-commerce-production-subscription-fulfillment.mjs:1098`) | Yes |
| W-070 | `createIssuanceRequest` | `server/services/platform/subscription-control-db.mjs:6280` | `platform_issuance_requests` (INSERT) | `subscription-issuance.mjs` (HTTP issuance + CLI `scripts/platform-issue-subscription.mjs`), inside `runInTransaction` (`subscription-issuance.mjs:83-84`) | No (caller txn) |
| W-071 | `setIssuanceRequestStatus` | `server/services/platform/subscription-control-db.mjs:6298` | `platform_issuance_requests` (UPDATE) | `subscription-issuance.mjs` | No |
| W-072 | `linkIssuedSubscription` | `server/services/platform/subscription-control-db.mjs:6320` | `platform_issued_subscription_links` (INSERT) | `subscription-issuance.mjs`, inside `runInTransaction` | No (caller txn) |
| W-073 | `setIssuedLinkStatus` | `server/services/platform/subscription-control-db.mjs:6336` | `platform_issued_subscription_links` (UPDATE) | LATENT — exported, no production caller found | No |
| W-074 | `upsertPortalAccessRequest` | `server/services/platform/subscription-control-db.mjs:9211` (`db.transaction`, `:9242`) | `platform_portal_access_requests` (INSERT, `:9244`), `platform_portal_edge_credentials` (DELETE `:9287` + INSERT `:9289`) | `portal-access-requests.mjs` (HTTP user-portal access-request flow) | Yes |
| W-075 | `upsertQuotaCounter` | `server/services/platform/subscription-control-db.mjs:8207` | `platform_quota_counters` (INSERT … ON CONFLICT UPDATE) | `subscription-issuance.mjs` | No |
| W-076 | `bindDevice` | `server/services/platform/subscription-control-db.mjs:8235` | `platform_device_bindings` (INSERT) | LATENT — exported, no production caller found | No |
| W-077 | `recordRevocation` | `server/services/platform/subscription-control-db.mjs:8261` | `platform_revocation_events` (INSERT) | `subscription-issuance.mjs` revocation flows | No |
| W-078 | Wallet-first initial chain (`walletFirstResourceEffectInsertInitialChain`) | `server/services/platform/subscription-control-db.mjs:4185-4243` | `platform_entitlements`, `platform_issuance_requests`, `platform_issued_subscription_links`, `platform_portal_access_requests` (INSERTs) | Wallet-first resource-effect handler (`wallet-first-resource-effect-adapter.mjs` → `completeWalletFirstTransitionEffectForDeferredTransition`, `:4454` transaction; called at `:4517`) | Yes (enclosing) |
| W-079 | Wallet-first chain switch (`walletFirstResourceEffectSwitchCurrentChain`) | `server/services/platform/subscription-control-db.mjs:4279-4366` | Same four tables (UPDATEs) | Same as W-078 (called at `:4519`) | Yes (enclosing) |
| W-080 | Wallet-first runtime effect claim/receipt (`claimWalletFirstRuntimeEffectForDeferredTransition`, `recordWalletFirstRuntimeReceiptForDeferredTransition`, `markWalletFirstRuntimeEffectReconciliationRequired…`) | `server/services/platform/subscription-control-db.mjs:3948-4158` | Runtime-claims table (`${WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_TABLE}`) | Wallet-first resource-effect adapter/handler | Yes |
| W-081 | Wallet-first setup-delivery handoffs (`create…`, `claim…`, `acknowledge…`, `mark…ReconciliationRequired`) | `server/services/platform/subscription-control-db.mjs:4828-5191` | Setup-delivery handoffs table (`${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}`) | `wallet-first-current-resource-setup-delivery.mjs` (claim/acknowledge traced); `createWalletFirstSetupDeliveryHandoff` itself has no external caller — see U-05 | Mixed: create No; claim/acknowledge/mark Yes |
| W-082 | Deferred-transition store writes (`reserveTransition`, `reserveTransitionFromCheckoutQuote`, `verifyClaimedTransitionReservation`, `recordEffectApplied`, `settleTransition`, `cancelTransition`, `requireRequote`, `reconcileTransition`, `claimNextDueTransition`, `claimNextPendingRebase`, `claimNextRecoverableEffectAppliedTransition`, `applyClaimedRebase`, `completeRebase`, `reconcileRebase`, `rebaseReservedTransitions` + receipt/event helpers) | `server/services/platform/deferred-resource-transition-store.mjs:1222-3174` (DML `:1222-3109`; transactions `:2125-3174`) | Deferred-transition, rebase, receipt, event tables (`${TRANSITIONS_TABLE}`, `${REBASES_TABLE}`, `${RECEIPTS_TABLE}`, `${EVENTS_TABLE}`) | HTTP wallet-first checkout (`wallet-first-deferred-checkout-adapter.mjs`: reserve/cancel) and the deferred-transition coordinator (`deferred-resource-transition-coordinator.mjs:940,1173,1190`) — background, started at boot | Yes |

## 5. Domain: identity-deletion

Trigger caveat: `PortalIdentityDeletionService` (`server/services/platform/portal-identity-deletion.mjs:183`) is the only caller of W-083…W-093, but **no production construction of that service was found** (no import outside its own file and tests). Its live entry point (admin route / CLI / job) is UNTRACED — see U-06. The store methods below are therefore reachable in code but their production trigger is unproven.

| ID | Writer (method) | Write site | Table(s) | Entry trigger | Txn |
|---|---|---|---|---|---|
| W-083 | `createIdentityDeletionJob` | `server/services/platform/subscription-control-db.mjs:9855` | `platform_identity_deletion_jobs` (INSERT) | `portal-identity-deletion.mjs:253` (inside service `runInTransaction`, `:239`) | No (caller txn) |
| W-084 | `updateIdentityDeletionJob` | `server/services/platform/subscription-control-db.mjs:9908` | `platform_identity_deletion_jobs` (UPDATE) | `portal-identity-deletion.mjs` | No |
| W-085 | `createIdentityDeletionProof` | `server/services/platform/subscription-control-db.mjs:9937` | `platform_identity_deletion_proofs` (INSERT) | `portal-identity-deletion.mjs:667` | No |
| W-086 | `createIdentityDeletionTombstone` | `server/services/platform/subscription-control-db.mjs:9973` | `platform_identity_deletion_tombstones` (INSERT) | `portal-identity-deletion.mjs:605` | No |
| W-087 | `freezeAccountForDeletion` | `server/services/platform/subscription-control-db.mjs:10000` | `platform_accounts` (UPDATE status) | `portal-identity-deletion.mjs` | No |
| W-088 | `revokePortalPasswordCredentialsForAccount` | `server/services/platform/subscription-control-db.mjs:10011` | `platform_portal_password_credentials` (UPDATE) | `portal-identity-deletion.mjs` | No |
| W-089 | `revokePortalTotpCredentialsForAccount` | `server/services/platform/subscription-control-db.mjs:10024` | `platform_portal_totp_credentials` (UPDATE) | `portal-identity-deletion.mjs` | No |
| W-090 | `revokePortalPasskeyCredentialsForAccount` | `server/services/platform/subscription-control-db.mjs:10037` | `platform_portal_passkey_credentials` (UPDATE) | `portal-identity-deletion.mjs` | No |
| W-091 | `deletePortalCredentialsForAccount` | `server/services/platform/subscription-control-db.mjs:10057` | `platform_portal_{password,totp,passkey}_credentials` (DELETE via interpolated `${table}` — see §10b) | `portal-identity-deletion.mjs` | No |
| W-092 | `deletePortalSessionsForAccount` / `deletePortalSecondFactorChallengesForAccount` / `deletePortalEntriesForAccount` | `server/services/platform/subscription-control-db.mjs:10066`, `:10074`, `:10082` | `platform_portal_sessions`, `platform_portal_second_factor_challenges`, `platform_portal_entries` (DELETE) | `portal-identity-deletion.mjs` | No |
| W-093 | `deleteAccountRowForDeletion` / `redactAccountMetadataForDeletion` | `server/services/platform/subscription-control-db.mjs:10096`, `:10122` | `platform_accounts` (DELETE / UPDATE) | `portal-identity-deletion.mjs` | No |
| W-094 | `IdentityBindingRepository.deleteForAccount` | (cross-ref W-022) `server/services/platform/d1-identity-binding-repository.mjs:169-176` | `platform_identity_bindings` | `portal-identity-deletion.mjs:565-566` (physical deletion only; logical deletion never calls it) | Yes |

## 6. Domain: gateway-control (edge nodes / Agent / data packs)

| ID | Writer (method) | Write site | Table(s) | Entry trigger | Txn |
|---|---|---|---|---|---|
| W-095 | `upsertEdgeRegisteredNode` | `server/services/platform/subscription-control-db.mjs:8731` | `platform_edge_registered_nodes` (INSERT … ON CONFLICT UPDATE) | LATENT — exported, no production caller found (the insert-only counterpart W-096 is the live one) | No |
| W-096 | `insertEdgeRegisteredNodeIfAbsent` | `server/services/platform/subscription-control-db.mjs:8765` | `platform_edge_registered_nodes` (INSERT) | Node registration ingestion/execution (`server/services/edge/node-registration-ingestion.mjs`, `node-registration-execution.mjs`); reached via first-boot packet / JP01 profile adapter paths (`scripts/node-image-first-boot-packet.mjs`, `server/services/cli/router.mjs`) — exact live trigger UNTRACED (U-07) | No |
| W-097 | `recordEdgeApplyReceipt` | `server/services/platform/subscription-control-db.mjs:8925` | `platform_edge_apply_receipts` (INSERT … ON CONFLICT UPDATE) | HTTP Agent receipt endpoint (`server/routes/data-plane-agent.mjs:94` → `data-plane-agent-service.mjs:555` `recordReceipt`); also `order-credential-lifecycle.mjs:163-170` | No |
| W-098 | `syncEdgeDesiredStateNotificationFromReceipt` | `server/services/platform/subscription-control-db.mjs:8954-8967` | `platform_edge_desired_state_notifications` (UPDATE) | Internal — called by `recordEdgeApplyReceipt` (`:8950`) | No |
| W-099 | `recordEdgeDesiredStateNotification` | `server/services/platform/subscription-control-db.mjs:9016` | `platform_edge_desired_state_notifications` (INSERT … ON CONFLICT UPDATE) | Desired-state notifier (`data-plane-desired-state-notifier.mjs:100,119`), driven from data-pack fulfillment (`coin-commerce-data-pack-fulfillment.mjs:180`) and credential reset (`coin-commerce-data-pack-credential-reset.mjs:118`) | No |
| W-100 | `acquireEdgeAgentLease` | `server/services/platform/subscription-control-db.mjs:9102` | `platform_edge_agent_leases` (INSERT … ON CONFLICT UPDATE) | HTTP Agent desired-state endpoint (`server/routes/data-plane-agent.mjs:74` → `data-plane-agent-service.mjs:601-610` `getDesiredState`) | No |
| W-101 | `reserveCoinCommerceDataPackIssuance` / `completeCoinCommerceDataPackIssuance` | `server/services/platform/subscription-control-db.mjs:6769`, `:6847` (transactions) | Data-pack issuance rows (via `reserve/complete` bodies) | Data-pack runtime issuer (`coin-commerce-data-pack-runtime-issuer.mjs`) — fulfillment path | Yes |
| W-102 | Data-pack artifact rotation (`claim/begin/advance/releaseCoinCommerceDataPackArtifactRotation`) | `server/services/platform/subscription-control-db.mjs:6938-7131` (transactions) | `platform_data_pack_artifact_rotations` (INSERT/UPDATE), `platform_issued_subscription_links` (UPDATE `artifact_ref`, `:7115`) | Data-pack artifact rotation service (`coin-commerce-data-pack-artifact-rotation.mjs`) driven by the data-pack rotation coordinator — background | Yes |
| W-103 | Data-pack credential reset (`begin/claim/advance/releaseCoinCommerceDataPackCredentialReset`) | `server/services/platform/subscription-control-db.mjs:7399-7602` (transactions) | `platform_data_pack_credential_resets` (INSERT/UPDATE) | Data-pack credential-reset service (`coin-commerce-data-pack-credential-reset.mjs`) driven by the rotation coordinator — background | Yes |
| W-104 | `registerCoinCommerceDataPackEdgeCredential` | `server/services/platform/subscription-control-db.mjs:7616-7674` (transaction) | `platform_data_pack_edge_credentials` (INSERT) | Data-pack edge issuer (`coin-commerce-data-pack-edge-issuer.mjs`) | Yes |
| W-105 | `rotateCoinCommerceDataPackEdgeCredential` | `server/services/platform/subscription-control-db.mjs:7689-7747` (transaction) | `platform_data_pack_edge_credentials` (UPDATE) | Internal — called by `advanceCoinCommerceDataPackCredentialReset` (`:7560`) | Yes |
| W-106 | `createDataPackResource` | `server/services/platform/subscription-control-db.mjs:7763` (transaction at `:7787`) | `platform_data_pack_resources` (INSERT) | Internal — called by `applyCoinCommerceDataPackFulfillment` (`:7854`) | Yes (enclosing) |
| W-107 | `applyCoinCommerceDataPackFulfillment` | `server/services/platform/subscription-control-db.mjs:7830-7853` (transaction) | Data-pack resource + fulfillment rows | Data-pack fulfillment (`coin-commerce-data-pack-fulfillment.mjs`) — coordinator path | Yes |
| W-108 | `recordCoinCommerceDataPackMeteringResetReceipt` | `server/services/platform/subscription-control-db.mjs:7370-7388` (transaction) | `platform_audit_events` (INSERT) | Script-only: `scripts/lib/full-metering-collection.mjs` (proof/collection scripts), not production HTTP | Yes |
| W-109 | `deliverPlanSwitchDowngrade` | `server/services/platform/subscription-control-db.mjs:5712-5730` (`.transaction().immediate()`) | Scheduled-switch table via W-069 | Production subscription fulfillment (`coin-commerce-production-subscription-fulfillment.mjs`) | Yes |
| W-110 | `recordAuditEvent` | `server/services/platform/subscription-control-db.mjs:8686` | `platform_audit_events` (INSERT) | `admin-auth.mjs`, `portal-access-requests.mjs`, `portal-identity-deletion.mjs`, `subscription-issuance.mjs`, `user-portal-auth.mjs` (audit trail of the above flows) | No |

## 7. Domain: scheduler-job (background writers not reachable via HTTP)

These are the non-HTTP entry points. The store writes they drive are cross-referenced; this table records the job itself.

| ID | Job | File:line | Drives (write IDs) | Notes |
|---|---|---|---|---|
| W-111 | Coin-commerce coordinator (retry/capture/fulfill passes; `setTimeout`-armed, `scheduleFn` injectable) | `server/services/platform/coin-commerce-coordinator.mjs:324`, `start()` `:641`; constructed `server/state.mjs:2925`; started `server/start.mjs:429` | W-056, W-057, W-058, W-059, W-060, W-061 | Runs inside the server process from boot; no HTTP middleware in the path. |
| W-112 | Welcome-bonus coordinator | `server/services/platform/portal-registration-welcome-bonus-coordinator.mjs:195`, `start()` `:455`; constructed `server/state.mjs:2964-2965`; started `server/start.mjs:429` | W-025 (wallet credit), W-032, W-043 | Background; keeps running to finish/expire pending grants even after admission is off (`server/state.mjs` comment). |
| W-113 | Deferred-transition coordinator | `server/services/platform/deferred-resource-transition-coordinator.mjs:764`, `start()` `:1224`; from runtime `server/state.mjs:3002`; started `server/start.mjs:429` | W-082 (claims, effects, settle, requote, reconcile, rebase) | Background; `setTimeout`-armed passes. |
| W-114 | Data-pack rotation coordinator | `server/services/platform/coin-commerce-data-pack-rotation-coordinator.mjs:11`, `start()` `:67`; constructed `server/state.mjs:2958`; started `server/start.mjs:429` | W-102, W-103 | `setInterval`-style `schedule()` loop; a broken store fails startup before scheduling. |
| W-115 | Referral 30 s tick | `server/services/platform/portal-referral-service.mjs:653` (`setInterval(tick, 30000)`, `timer.unref()`); started `server/state.mjs:3301` (`portalReferrals?.start()`) | W-035 (`reconcile()`), W-036 (`settle()`) | No HTTP involved; cursor advances even when one account is blocked. |
| W-116 | Usage collection (NOT a timer) + snapshot-gate quiesce | Collection: `POST /api/admin/platform/subscription-usage-monitor/collect` (`server/routes/admin-platform.mjs:773-780`) → `runtime-usage-accounting.mjs:203` `collectAndRecord` → `traffic-accounting.mjs:125` `recordUsageObservation` → control-store `recordUsageSample` / `recordCumulativeUsageSample` (`subscription-control-db.mjs:8065-8109`, transactions; `upsertUsageCounterCursor` `:8075` internal). Quiesce: `scripts/control-plane-db-snapshot-gate-lib.mjs:752-769` | W-117, W-118 (below) | Usage writes are admin-HTTP-triggered on demand (no polling loop found); the snapshot-gate quiesce opens the live file directly and checkpoints it (operator script). |
| W-117 | `recordUsageSample` | `server/services/platform/subscription-control-db.mjs:8065-8067` (`db.transaction` around `insertUsageSampleRecord`, `:8029-8055`) | `platform_usage_rollups` (INSERT … ON CONFLICT UPDATE), `platform_usage_counter_cursors` | Via W-116; also direct script callers (`scripts/lib/full-metering-sample-writer.mjs`, `scripts/lib/local-plan-switch-ui-profile.mjs`) | Yes |
| W-118 | `recordCumulativeUsageSample` | `server/services/platform/subscription-control-db.mjs:8094-8109` (`db.transaction`) | `platform_usage_rollups`, `platform_usage_counter_cursors` | Via W-116 (`traffic-accounting.mjs:177-180`) | Yes |
| W-119 | Lead purge (CLI) | `scripts/platform-lead-retention.mjs` (`purge --apply`) → `lead-retention-operations.mjs:392-465` (own connection, C-09) | W-002 | Operator CLI; dry-run unless `--apply`. Backup/prune variants are read-only or file-level. |
| W-120 | Portal-referral policy (CLI) | `scripts/platform-portal-referral-policy.mjs:53-54` | W-040 | Operator CLI; opens its own connection to the control file. |

## 8. Domain: agent-persistence

| ID | Writer | Write site | Table(s) / target | Entry trigger | Txn |
|---|---|---|---|---|---|
| W-121 | Agent client state persistence (JSON, NOT SQLite) | `agent/g4/agent-client.mjs` (`createJsonStateStore`, `stateStore.save`) | Local file `applied-state.json` (pending receipts, pending claim, generation/digest) — **no `subscription-control.sqlite` write** | systemd-timer oneshot `agent/g4/run-once.mjs:171-177` (one `runOnce()` per invocation; no daemon loop) | n/a (file rename) |
| W-122 | Agent client lock files | `agent/g4/agent-client.mjs` (`createFileLock`, `createMemoryLock`) | Lock file `agent.lock` (+ `.reaper` dir) — not the control DB | Same oneshot cycle | n/a |
| W-123 | Agent transport → server-side receipt/lease writes | (server side) W-097, W-100 | `platform_edge_apply_receipts`, `platform_edge_agent_leases` | `transport.fetchDesiredState` / `transport.submitReceipt` in the client land on the BWH data-plane-agent HTTP routes (`server/routes/data-plane-agent.mjs:74,94`); the writes happen server-side, not in the agent process | No (see W-097/W-100) |
| W-124 | Agent epoch forwarding (transport header) | `agent/g4/agent-client.mjs:58` (`isValidWriterEpoch`), `:295-341` (`epochProvider`, `writerEpochForwarding`, `writerEpochHeader`, `buildHeaders`) | Header `x-writer-epoch` on `fetchDesiredState`/`submitReceipt` | Implemented but **default OFF** (`writerEpochForwarding = false`); `run-once.mjs` does not pass `epochProvider`/`writerEpochForwarding`, so live agent traffic currently sends no epoch header. Enabling without a coordinator receipt fails closed (`writer_epoch_required` / `writer_epoch_invalid`). | n/a |

`agent/g4/key-rotation.mjs` keeps revocation state in memory only (`Set`, `:49-160`) — no SQLite or file write was found.
`agent/g4/manifest.mjs` / `receipt.mjs` are pure builders (no I/O).

## 9. Domain: schema-migration

Migrations run via operator CLI scripts (`scripts/platform-*-schema.mjs`), never at server startup
(no `apply*Migrations` call exists under `server/` outside migration modules and tests).
Each `applyWithDatabase` executes its `MIGRATION_STATEMENTS` via `database.exec(...)` — raw DDL, not
parameterized DML — and records the migration in its ledger table. Rollback paths use `database.exec`
with interpolated `drop ${type} ${name}` (see §10b). All target the control file except the two noted.

| ID | Migration module | Apply site (`.exec`) | Tables / objects created | Invoked by |
|---|---|---|---|---|
| W-125 | `server/services/platform/coin-commerce-migrations.mjs` | `:1533` (+ rollback `:1657-1674`) | Commerce offer/quote/order/command/receipt/event tables + initial-confirmation tables | `scripts/platform-coin-commerce-schema.mjs` |
| W-126 | `server/services/platform/coin-wallet-migrations.mjs` | `:777` | Wallet/lot/hold/ledger/receipt tables | `scripts/platform-coin-wallet-schema.mjs` |
| W-127 | `server/services/platform/coin-wallet-reference-index-migrations.mjs` | `:635` | Wallet reference index | `scripts/platform-coin-wallet-reference-index-schema.mjs` |
| W-128 | `server/services/platform/payment-store-migrations.mjs` | `:889-897` | `platform_payment_orders`, `platform_payment_receipts` | `scripts/start-local-coin-commerce-validation.mjs` / payment schema CLI |
| W-129 | `server/services/platform/account-resource-authority-migrations.mjs` | `:738` (+ rollback `:933`) | `platform_account_resource_authorities` | `scripts/platform-account-resource-authority-schema.mjs` |
| W-130 | `server/services/platform/account-resource-authority-commerce-migrations.mjs` | `:487` | `platform_commerce_authority_quote_bindings` | Same schema CLI family |
| W-131 | `server/services/platform/coin-commerce-plan-switch-migrations.mjs` | `:365` (+ rollback `:434`) | Plan-switch quote/scheduled tables | `scripts/platform-coin-commerce-plan-switch-schema.mjs` |
| W-132 | `server/services/platform/coin-commerce-initial-confirmation-guard-plan-c-schema.mjs` | `:133-134` | Initial-confirmation guard tables | `scripts/platform-coin-commerce-initial-confirmation-guard-schema.mjs` |
| W-133 | `server/services/platform/deferred-resource-transition-migrations.mjs` | `:2153`, `:2182` | Deferred-transition / rebase / receipt / event tables | `scripts/platform-deferred-resource-transition-schema.mjs` |
| W-134 | `server/services/platform/portal-registration-welcome-bonus-migrations.mjs` | `:1055`, `:1073`, `:1090` | Welcome-bonus grant/lot tables | `scripts/platform-portal-registration-welcome-bonus-schema.mjs`; also `scripts/control-plane-db-snapshot-gate-lib.mjs:108` |
| W-135 | `server/services/platform/wallet-first-deferred-checkout-migrations.mjs` | `:366` | Deferred-checkout tables | `scripts/platform-wallet-first-deferred-checkout-schema.mjs` |
| W-136 | `server/services/platform/wallet-first-resource-effect-runtime-claims-migrations.mjs` | `:287` | Runtime-claims table | `scripts/platform-wallet-first-resource-effect-runtime-claims-schema.mjs` |
| W-137 | `server/services/platform/wallet-first-setup-delivery-handoffs-migrations.mjs` | `:325` | Setup-delivery handoffs table | `scripts/platform-wallet-first-setup-delivery-handoffs-schema.mjs` |
| W-138 | `server/services/platform/portal-referral-migrations.mjs` | `:147` (`database.exec(sql)` per DDL statement) | Referral policy/profile/touch/origin/accrual/binding tables | `scripts/platform-portal-referral-schema.mjs` |
| W-139 | Control-store schema init + column backfill | `server/services/platform/subscription-control-db.mjs:1286` (`db.exec`, all `platform_*` tables `:1287-1878`), `:733` (`alter table ${tableName} add column …`, called at `:1910` for `platform_portal_access_requests` when `initializeSchema`) | All §0 tables | Store construction (`createSqliteSubscriptionControlStore`) |
| W-140 | Link-reset schema ensure | `server/services/platform/portal-subscription-link-reset-store.mjs:30` (`database.exec`, `create table if not exists`) | `platform_portal_subscription_link_resets` | Store construction via `getPortalSubscriptionLinkResetStore` |
| W-141 | Ads-consent schema ensure | `server/services/platform/ads-consent-store.mjs:64` (`db.exec`) | Ads consent / click-claim tables | Store construction (C-05) |
| W-142 | `platform_writer_authority` table + singleton row (Stage 1B fence scaffolding) | `server/services/platform/single-writer-authority.mjs` (`ensureWriterAuthority`: `db.exec` DDL + INSERT `:insert into platform_writer_authority … values (1, 'BWH', 'BWH_ACTIVE', 1, …)`); called at `subscription-control-db.mjs:1931` when `initializeSchema` | `platform_writer_authority` | Store construction only. See §10 for the (un)wiring status. |
| W-143 | Writer phase transition (the ONLY phase mutator) | `server/services/platform/single-writer-authority.mjs` (`transitionWriterAuthority`, UPDATE `platform_writer_authority`, epoch +1, conditional on current phase+epoch) | `platform_writer_authority` | **No caller found anywhere in the repo** — coordinator-only by design; currently unreachable. See §10. |

Excluded from this domain (separate files, verified): `third-party-subscription-migrations.mjs:291`
and `subscription-distribution-migrations.mjs:116` (both target `THIRD_PARTY_SUBSCRIPTION_DB_PATH`).

## 10. Domain: other (ads / attribution / referral-ads / link-reset)

| ID | Writer | Write site | Table(s) | Entry trigger | Txn |
|---|---|---|---|---|---|
| W-144 | Link-reset `prepare` | `server/services/platform/portal-subscription-link-reset-store.mjs:162-185` (`db.transaction`) | `platform_portal_subscription_link_resets` (INSERT) | `portal-access-requests.mjs:2376-2382` subscription-link-reset flow (HTTP user-portal) | Yes |
| W-145 | Link-reset `complete` | `server/services/platform/portal-subscription-link-reset-store.mjs:192-214` (`db.transaction`) | `platform_portal_subscription_link_resets` (UPDATE `:214`) + `platform_portal_access_requests` (UPDATE `:209`) | Same flow as W-144 (reset completion) | Yes |
| W-146 | Ads `safeCaptureAdsClickForOrder` | `server/services/platform/ads-conversion-store.mjs:339-348` | `platform_ads_click_bindings` (DELETE `:340,344` + INSERT `:348`) | Commerce `confirmOrder` (W-054, `:2471`) — inside the confirm transaction | Yes (enclosing) |
| W-147 | Ads `safeMaterializeAdsClickForOrder` | `server/services/platform/ads-conversion-store.mjs:440-455` | `platform_ads_click_bindings` (DELETEs `:441-455` + INSERT) | Commerce `confirmOrder` (W-054, `:2479`) — inside the confirm transaction | Yes (enclosing) |
| W-148 | Ads `safeEnqueueAdsConversion` | `server/services/platform/ads-conversion-store.mjs:468-473` | `platform_ads_conversion_outbox` (INSERT … ON CONFLICT UPDATE) | Commerce `flushAdsRecoveryEnqueues` (`:608`) and `enqueueAdsForDeliveredCommand` (`:4250`) — post-commit/measurement path (see W-063 note) | Yes (enclosing where called; flush path is deliberately outside any transaction) |
| W-149 | Ads `recordAdsClickClaim` / `materializeAdsClickBinding` / `enqueueAdsConversion` (module functions) | `server/services/platform/ads-conversion-store.mjs:262-264` (transaction), `:340-473` | `platform_ads_click_claims`, `platform_ads_click_bindings`, `platform_ads_conversion_outbox` | Reached only via the `safe*` wrappers W-146…W-148; the `createSqliteAdsConversionStore` factory itself is never constructed in production (no caller found) | Yes |
| W-150 | Ads-consent `recordConsent` (+ `recordAdsConsentDecision` body) | `server/services/platform/ads-consent-store.mjs:182-278` (`db.transaction`) | `platform_ads_consent_decisions` (INSERT, `:184-187`), `platform_ads_conversion_outbox` (UPDATE, `:222,261`), `platform_ads_click_bindings` (DELETE, `:237,273`), `platform_ads_click_claims` (UPDATE, `:242,278`), `platform_ads_click_consent_claims` (DELETE, `:254`) | HTTP consent endpoint (`server/routes/user-portal.mjs:497-501`) | Yes |
| W-151 | Ads-consent `bindAdsClickConsentClaim` | `server/services/platform/ads-consent-store.mjs:127` | `platform_ads_click_consent_claims` (INSERT) | Via ads-conversion `safeCaptureAdsClickForOrder` path (W-146) | Yes (enclosing) |
| W-152 | Ads-click retention purge | `server/services/platform/ads-click-retention.mjs:200-246` (`db.transaction`) | `platform_ads_conversion_outbox` (UPDATE, `:213`), `platform_ads_click_consent_claims` (DELETE, `:229`), `platform_ads_click_bindings` (DELETE, `:240`), `platform_ads_click_claims` (DELETE, `:246`) | LATENT — `runAdsClickRetention` has no caller in the repo (definition only) | Yes |
| W-153 | Attribution binding (`bindRegistration`, `bindOrder`, `recordBackendPaymentSuccess`, `recordBackendEntitlementDelivered`) | `server/services/platform/portal-attribution-binding.mjs:277-361` | `platform_attribution_account_bindings`, `platform_attribution_order_bindings` (INSERT … ON CONFLICT UPDATE) | LATENT — service constructed only in `partner-attribution-pilot-fixtures.mjs` (fixtures/tests) | No (verified: plain prepared-statement runs; `ensureSchema` at `:122` is `.exec` DDL) |
| W-154 | Partner store (`upsertPartner`, `upsertCampaign`, `recordAttributionTouch`, `recalculateTouchMarkers`) | `server/services/platform/partner-attribution-store.mjs:347-497` | `platform_partners`, `platform_partner_campaigns`, `platform_attribution_touches` | LATENT — constructed only via W-153 / pilot fixtures | No |
| W-155 | Attribution event ledger (`recordEvent`) | `server/services/platform/partner-attribution-event-ledger.mjs:297-302` | `platform_attribution_events` (INSERT) | Called from `portal-attribution-binding.mjs` (W-153, latent) and `partner-settlement-candidate-engine.mjs` — engine itself is fixtures-only (see W-156) | No |
| W-156 | Settlement engine (`upsert` policy, `insert`/`update` candidates) | `server/services/platform/partner-settlement-candidate-engine.mjs:259` (`.exec` schema), `:423-430`, `:575`, `:651`, `:690` | `platform_settlement_policies`, `platform_settlement_candidates` | LATENT — engine constructed only in `partner-attribution-pilot-fixtures.mjs:116`; opens its own `Database(dbPath)` (`:390`) | Mixed (schema `.exec`; candidate writes are bare `.run` unless the caller wraps them — not verified) |

## 11. Bypass-risk assessment

### (a) Writes reachable WITHOUT any HTTP middleware

These bypass route auth/validation entirely. Any fence that only lives in HTTP middleware misses them:

- **All four boot-started coordinators** — W-111 (coin-commerce), W-112 (welcome-bonus), W-113 (deferred-transition), W-114 (data-pack rotation): started from `server/start.mjs:429`, driven by `setTimeout`/`setInterval` passes.
- **Referral 30 s tick** — W-115 (`setInterval(tick, 30000)`, `portal-referral-service.mjs:653`).
- **Operator CLIs** — W-119 (lead purge `--apply`), W-120 (referral policy), `scripts/platform-issue-portal-entry.mjs`, `scripts/platform-issue-portal-initial-account.mjs`, `scripts/platform-issue-subscription.mjs` (W-003/W-004/W-065/W-070/W-072 via service layer), `scripts/platform-*-schema.mjs` (W-125…W-138).
- **Server-startup writes** — W-050 (`bootstrapPublishedOffers`, only with a configured catalog), W-139/W-140/W-141/W-142 (schema ensure at store construction).
- **Direct-connection writers** — C-02…C-09 open the file independently of the central store, so a fence installed only in `subscription-control-db.mjs` methods would not cover the commerce, wallet, payment, ads-consent, referral, deferred-transition, admin-commerce, or lead-retention connections. The snapshot-gate quiesce (W-116/C-10) opens the live file directly and issues `wal_checkpoint(TRUNCATE)` + `BEGIN EXCLUSIVE`.
- **Agent-triggered server writes** — W-097/W-100 run on the Agent HTTP routes, but the *agent process itself* is driven by a systemd timer outside the server; its retries after lost acknowledgment re-submit receipts (W-123) with no epoch header today (W-124).
- **Script-only writers** — W-108 (metering-reset receipt via `scripts/lib/full-metering-collection.mjs`), W-117/W-118 via metering proof scripts.

### (b) Raw-SQL / `.exec(` bypass risk (interpolated or multi-statement SQL)

- `subscription-control-db.mjs:733` — `db.exec(`alter table ${tableName} add column ${column.definition}`)` (`ensureTableColumns`; `tableName`/`definition` come from a fixed internal column list, called at `:1910`).
- `subscription-control-db.mjs:10057` — `` `delete from ${table} where account_id = ?` `` (W-091; `table` iterates a fixed internal list of credential tables).
- `subscription-control-db.mjs:1286` — schema-init `db.exec` with the full multi-statement DDL block (W-139).
- `single-writer-authority.mjs` `ensureWriterAuthority` — `db.exec` DDL with interpolated constant table name (W-142).
- Every migration module (§9, W-125…W-138) — `database.exec(statement)` over `MIGRATION_STATEMENTS`, plus rollback `database.exec(`drop ${type} ${name}`)` (e.g. `account-resource-authority-migrations.mjs:933`, `coin-commerce-migrations.mjs:1657-1669`); `name`/`type` come from `sqlite_master` rows, not user input, but the statement is still built by interpolation.
- `portal-subscription-link-reset-store.mjs:30`, `ads-consent-store.mjs:64`, `ads-conversion-store.mjs:55`, `partner-attribution-store.mjs:274`, `partner-attribution-event-ledger.mjs:218`, `portal-attribution-binding.mjs:122`, `partner-settlement-candidate-engine.mjs:259` — schema-ensure `.exec` with interpolated constant table names.
- `scripts/control-plane-db-snapshot-gate-lib.mjs:759,768` — `wal_checkpoint(TRUNCATE)` + `source.exec("BEGIN EXCLUSIVE")` / `"ROLLBACK"` on the live source file.
- No `VACUUM` and no production `wal_checkpoint` other than the snapshot-gate script were found (only tests use `wal_checkpoint`).
- All business DML elsewhere is parameterized (`?` / `@named` binds); no business write concatenates user input into SQL. The interpolation risk is confined to DDL/housekeeping identifiers above.

### (c) Fencing status on this branch (wired this round; per-site coverage in §15)

- `server/services/platform/single-writer-authority.mjs` implements `ensureWriterAuthority`,
  `assertWritable`, `guardedTransaction` (`.transaction().immediate()`, fence-first) and
  `transitionWriterAuthority` (epoch +1, `RECOVERY -> BWH_ACTIVE` blocked).
- **Central store (C-01) — FENCED.** `runInTransaction(callback, options)` (`:10311`) now routes
  EVERY call through `guardedTransaction(db, options.writerEpoch, callback)`: one BEGIN IMMEDIATE
  transaction whose first statement is the fence call (which ensures the authority table with
  idempotent DDL, then enforces phase BWH_ACTIVE, plus epoch match when a
  coordinator receipt supplies `writerEpoch`). Callers without a receipt get the phase-only fence.
  The former opt-in (`{ guarded: true }` / `writerEpoch`) is subsumed; no caller passes either,
  and none needs to. Tests S1B-WIRE-1…WIRE-3
  cover the plain (no-options) path: commit while BWH_ACTIVE, reject while FROZEN / D1_ACTIVE /
  RECOVERY.
- **Coin-commerce store (C-02) — FENCED.** All 13 named write transactions call
  `assertCommerceWritable()` (phase-only `assertWritable(db)`) as the first statement of each
  (the call ensures the authority table with idempotent DDL, then enforces the phase; no
  business write precedes the phase check), inside
  their already-IMMEDIATE transactions: publish / bootstrap / retire / createQuote / confirm /
  cancel / claimCaptures / capture (via `captureOrderBody`, also reached nested from claimCaptures
  and recover) / recover / claimCommand / completeCommand / failCommand / nextWake. The commerce
  store's `normalizeError` (`:156`) lets a `WriterAuthorityError` through unwrapped, so a fence
  rejection surfaces as `writer_authority_not_bwh` instead of `commerce_infrastructure_error`.
  Tests S1B-WIRE-4…WIRE-7 cover publish / quote / retire behaviorally; S1B-WIRE-8 asserts the
  source-shape invariant (exactly 13 fence calls, one per named writer, first non-blank line
  of each transaction body, checked literally).
- `subscription-control-db.mjs` still calls `ensureWriterAuthority(db)` at schema init (`:1930`).
  `transitionWriterAuthority` still has **no caller**; the phase can only change if the coordinator
  calls it.
- `writer-freeze-receipt.mjs` (`buildFreezeReceipt`) is read-only: one `.immediate()` transaction
  that reads the authority row + high-water mark and returns a signed receipt; it writes nothing.
- Agent side: `x-writer-epoch` forwarding exists (`agent/g4/agent-client.mjs`) but defaults OFF,
  and `run-once.mjs` does not enable it — live agent traffic sends no epoch (W-124).
- Consequence: fencing is now enforced on the two financial-core connections (C-01, C-02). The
  remaining connections (C-03…C-09) and the §11(a) non-HTTP writers are NOT fenced yet — see §15
  FOLLOW-UP. They remain unfenced writers after any cutover until the follow-up round wires them.

## 12. UNTRACED items

| ID | What is missing | Evidence so far |
|---|---|---|
| U-01 | Live caller of `lead-review-queue.purgeExpiredLeads()` (`lead-review-queue.mjs:141`); the CLI purge path (W-119) is traced, the queue path is not | `purgeExpiredLeads` call sites: `lead-retention-operations.mjs`, `lead-review-queue.mjs` only |
| U-02 | Live trigger of wallet `expireCoinHold` / `expireCoinLot` (`coin-wallet-store.mjs:2390,2538`) | Only in-file references; no external caller found |
| U-03 | Live trigger of referral `confirm` / `applyRefund` (`portal-referral-service.mjs:462,503`) | No production caller identified; names collide repo-wide |
| U-04 | Live caller of initial-confirmation `prepare`/`execute` (`coin-commerce-initial-confirmation.mjs:313`) | Participant registered by the commerce store; no production invoker found |
| U-05 | Live caller of `createWalletFirstSetupDeliveryHandoff` (`subscription-control-db.mjs:4913`) | Exported (`:10364`); claim/acknowledge are traced to `wallet-first-current-resource-setup-delivery.mjs`, create is not |
| U-06 | Production entry point of `PortalIdentityDeletionService` (`portal-identity-deletion.mjs:183`) | No construction/import outside its own file and tests; W-083…W-094 + W-022 therefore have no proven production trigger |
| U-07 | Exact live trigger of `insertEdgeRegisteredNodeIfAbsent` | Callers are node-registration ingestion/execution, reached via first-boot-packet / JP01 adapter / CLI router paths; no HTTP route was confirmed |
| U-08 | Schema-creation path for the ads-conversion tables (`platform_ads_click_claims`, `platform_ads_click_bindings`, `platform_ads_conversion_outbox`) | The `safe*` writers (W-146…W-148) run against the shared commerce `db` handle, but `createSqliteAdsConversionStore` (whose `ensureAdsConversionSchema` creates the tables) is never constructed in production; which migration/ensure creates these tables live was not established |
| U-09 | `completeScheduledPlanSwitch`'s full upstream trigger | Traced to `coin-commerce-production-subscription-fulfillment.mjs:1098`; that fulfillment's own live trigger (which coordinator/route invokes it for a scheduled switch) was not fully traced |
| U-10 | Whether any caller passes `{ guarded: true }` / `writerEpoch` to `runInTransaction` from outside this repo (e.g. a deployment script or a future coordinator) | Repo-wide grep found none; external callers are out of scope of this audit |

## 13. Counts

- **Total inventory entries: 156** (W-001…W-156, including cross-reference entries W-064/W-094 and the read-only W-064 note).
- Per domain: account/session/credential **24** (W-001…W-024); wallet/ledger **20** (W-025…W-044);
  order/payment-callback **20** (W-045…W-064); subscription-entitlement **18** (W-065…W-082);
  identity-deletion **12** (W-083…W-094); gateway-control **16** (W-095…W-110);
  scheduler-job **10** (W-111…W-120); agent-persistence **4** (W-121…W-124);
  schema-migration **19** (W-125…W-143); other (ads/attribution/link-reset) **13** (W-144…W-156).
- **UNTRACED items remaining: 10** (U-01…U-10).
- **LATENT writers** (defined/exported, no production caller found): W-012, W-013, W-021, W-023, W-024,
  W-051, W-052, W-073, W-076, W-095, W-152, W-153, W-154, W-155, W-156 (15 entries).
- **Writes without their own explicit transaction** (single-statement autocommit at the method level):
  W-001, W-002, W-003, W-004…W-018 (except where noted), W-065, W-066, W-070…W-077, W-083…W-093,
  W-095…W-100, W-110, W-153…W-156 — most are executed inside a caller's `runInTransaction` in at least
  one traced path (notably registration, issuance, deletion, and authority-registration), but that
  wrapping is per-call-site and was not verified for every site.
- **Non-HTTP writers:** §11(a) lists 4 boot coordinators + referral tick + 6 CLI families + startup writes +
  9 independent connections + snapshot-gate quiesce + script-only writers.
- **Raw-SQL / `.exec(` sites:** §11(b) lists 12 groups; all are DDL/housekeeping with fixed or
  `sqlite_master`-derived identifiers — no business DML concatenates user input.

## 14. Method note

Every entry was produced by reading the cited file at the cited line (grep for `INSERT`/`UPDATE`/`DELETE`/
`REPLACE`, `.run(`, `.exec(`, `transaction(`, `.pragma(` across `server/`, `agent/`, `workers/`, `scripts/`,
`bin/`; per-function DML-to-method mapping; caller-chain grep per public method, excluding `server/tests/`).
No server was run, no test was executed, no database was opened, no git operation was performed.
Rows marked LATENT or UNTRACED are stated as such rather than filled in by inference.

## 15. Fencing coverage as implemented on this branch (FENCED vs FOLLOW-UP)

Wiring scope decided from this audit: this round fences the financial
core — the central store's service-layer write transactions (C-01) and
the coin-commerce store's named write transactions (C-02). Full
per-connection wiring across all 9 connections is follow-up work.

Deploy note: deploying this code creates `platform_writer_authority`
(CREATE TABLE IF NOT EXISTS + singleton row BWH_ACTIVE epoch 1) on
first guarded write / schema init. Write behavior is unchanged while
BWH_ACTIVE and rollback is safe (dropping the code leaves the table
inert), but record the table creation in the Deploy Note; do not treat
this as a zero-schema-change deploy.
"Line numbers are audit-time (pre-wiring) unless §15 states otherwise;
this round's edits shifted lines in `subscription-control-db.mjs` and
`coin-commerce-store.mjs` by a few lines, so cite function/symbol names
for the wired code, not the audit-time line numbers."

### 15.1 FENCED — enforced on this branch, covered by tests

| # | Path | What is fenced | Evidence |
|---|---|---|---|
| F-1 | C-01 `runInTransaction` default path (`subscription-control-db.mjs`, `runInTransaction` → `guardedTransaction`) | EVERY service-layer write transaction through the central store: all 15 call sites (`admin-auth.mjs:575`, `portal-access-requests.mjs:2331`, `portal-authority-registration.mjs:99`, `portal-identity-deletion.mjs:239,387,456`, `portal-initial-account-issuance.mjs:110`, `portal-registration.mjs:433`, `subscription-issuance.mjs:84`, `user-portal-auth.mjs:411,621,737,817,930,943`). One BEGIN IMMEDIATE transaction, fence call first (the call ensures the authority table with idempotent DDL, then enforces phase BWH_ACTIVE, plus epoch match when a coordinator receipt supplies `writerEpoch`). The former opt-in (`{ guarded: true }` / `writerEpoch`) is subsumed; no caller passes either and none needs to. | Tests S1B-WIRE-1…WIRE-3 (`server/tests/d1-stage1b-bwh-wiring.test.mjs`): plain (no-options) commit while BWH_ACTIVE; reject with `writer_authority_not_bwh` while FROZEN / D1_ACTIVE / RECOVERY, no row written; abort re-admits. |
| F-2 | C-02 coin-commerce 13 named write transactions (`coin-commerce-store.mjs`, `assertCommerceWritable()` as the first statement of each, already-IMMEDIATE) | publish / bootstrap / retire / createQuote / confirm / cancel / claimCaptures / capture (via `captureOrderBody`) / recover / claimCommand / completeCommand / failCommand / nextWake. Covers the order/payment-callback financial core (W-045…W-064 reached through these transactions) and the offer lifecycle (W-050/W-051/W-052 paths). | Tests S1B-WIRE-4…WIRE-7 (publish / quote / retire behaviorally: frozen → `writer_authority_not_bwh`, no row; abort → commit); S1B-WIRE-8 source-shape invariant (exactly 13 fence calls, one per named writer, first non-blank line of each transaction body, checked literally). |
| F-3 | Writers nested inside a fenced transaction | Ads `safe*` writers W-146…W-148 (inside `confirmTransaction`); commerce-internal wallet participant calls inside confirm/capture transactions; `captureOrderBody` nested calls from claimCaptures (`:2916`) and recover (`:3906`) — the fence is re-checked (savepoint-nested, idempotent). | By construction (same transaction) + S1B-WIRE-8. |
| F-4 | Fence-error observability (commerce) | `normalizeError` lets a `WriterAuthorityError` through unwrapped, so a fence rejection surfaces as `writer_authority_not_bwh` instead of `commerce_infrastructure_error`. Callers and the coordinator can tell a frozen / D1-active database apart from an infrastructure failure. | Tests S1B-WIRE-5…WIRE-7 assert the propagated `WriterAuthorityError` name + code. |

### 15.2 FOLLOW-UP — not fenced this round

| # | Path | Why it stays open | Entries affected |
|---|---|---|---|
| U-F1 | C-03 standalone wallet connection (`coin-wallet-store.mjs:876`) | Direct wallet transactions (`creditCoins`, holds, confirm) on this handle have no fence. Wallet writes reached via the commerce handle inside a fenced commerce transaction ARE fenced (F-3); only the standalone-handle path is open. | W-025…W-044 where reached via the standalone handle |
| U-F2 | C-04 payment store (own connection) | Own `db` handle; no fence installed. | Payment-callback parts of W-045…W-064 reached via this handle |
| U-F3 | C-05 ads-consent store (own connection) | Own `db` handle; `recordConsent` runs its own `db.transaction` unfenced. | W-150, W-151 |
| U-F4 | C-06 referral service (own connection) + 30 s tick | Own `db` handle; the tick (`portal-referral-service.mjs:653`) is a non-HTTP writer. | W-115, referral parts of W-025…W-044 / §7 |
| U-F5 | C-07 deferred-transition store (own connection, via runtime) | Own `db` handle; boot-started coordinator path. | W-113 and §7 deferred-transition entries |
| U-F6 | C-08 admin user-commerce service (per-call connection) | Opens + closes a connection per call; no fence installed. | Admin commerce writes (§6) |
| U-F7 | C-09 lead-retention operations (per-operation connection) | CLI-driven; no fence installed. | W-119 |
| U-F8 | Boot coordinators' direct store calls | The four boot coordinators (W-111…W-114) are fenced only where the method they call goes through `runInTransaction` or a fenced commerce transaction; direct single-statement calls bypass the fence. | W-111…W-114 |
| U-F9 | Server-startup writes other than bootstrap | `bootstrapPublishedOffers` IS fenced (bootstrapTransaction, F-2). Schema-ensure DDL (W-139…W-143) is DDL, not business writes — explicitly out of fence scope; it must run while BWH_ACTIVE by operator discipline. | W-139…W-143 (DDL, out of scope) |
| U-F10 | Snapshot-gate quiesce (W-116 / C-10) | Operator script with direct file access (`wal_checkpoint(TRUNCATE)` + `BEGIN EXCLUSIVE`); needs coordinator-level handling, not a store fence. | W-116 |
| U-F11 | Measurement flush `flushAdsRecoveryEnqueues` (W-148 / W-063) | Deliberately non-transactional measurement path; runs before the fenced business transaction inside `execute()`. Whether measurement flushes continue while frozen needs a coordinator freeze-drain decision first; a rejected business call can still emit a measurement row today (pre-existing behavior, not introduced by this round). | W-148, W-063 |
| U-F12 | CLI families (`scripts/platform-issue-*.mjs`, `platform-lead-retention.mjs`, referral policy CLI) | Fenced only where the called service method itself uses `runInTransaction` or a fenced commerce transaction; otherwise open. | W-003/W-004/W-065/W-070/W-072 (via service layer), W-119, W-120 |
| U-F13 | Per-call-site verification for central-store single-statement methods | Fencing holds only on paths PROVEN to run inside `runInTransaction`; the audit verified that wrapping for registration / issuance / deletion / authority-registration paths, not for every site. Unverified sites stay FOLLOW-UP until each call site is checked. | W-001…W-024, W-065…W-082, W-083…W-094, W-095…W-110 (unverified sites only) |
| U-F14 | Schema-migration writers (W-125…W-143) | DDL, not business writes; explicitly out of scope. Migrations run offline by operator and must not run against a frozen / D1-active database — operator discipline until the follow-up defines migration gating. | W-125…W-143 |
| U-F15 | LATENT writers (15 entries) | Defined/exported, no production caller; no fence needed until/unless activated — re-check at activation. | W-012, W-013, W-021, W-023, W-024, W-051, W-052, W-073, W-076, W-095, W-152…W-156 |
| U-F16 | Agent transport epoch forwarding (W-124) | Forwarding exists but defaults OFF and `run-once.mjs` does not enable it; production transport stays disabled until the approved staged handover. | W-121…W-124 |
| U-F17 | UNTRACED items U-01…U-10 (§12) | Still open; no coverage claim is made for them. | U-01…U-10 |
| U-F18 | Post-freeze credential-only reconciliation | Credential-only changes produce no delta entry (fingerprints exclude credential columns by design). The freeze receipt's high-water mark records row counts and max(updated_at) only where the column exists; `platform_portal_edge_credentials` has no `updated_at`, so it is covered by row count alone. A dedicated post-freeze reconciliation for credential tables does not exist yet — until then this is an open gap, not covered. | Credential tables (§5, `source-delta.mjs` limitation) |
