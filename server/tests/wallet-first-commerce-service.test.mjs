import assert from "node:assert/strict";
import test from "node:test";

import {
  PORTAL_COMMERCE_MODE_LEGACY,
  PORTAL_COMMERCE_MODE_WALLET_FIRST,
  createWalletFirstCommerceService,
  resolveWalletFirstCommerceMode,
  snapshotWalletFirstCommerceService
} from "../services/platform/wallet-first-commerce-service.mjs";

function account(accountId, metadata = {}) {
  return {
    id: accountId,
    ownerRef: accountId,
    status: "active",
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    metadata
  };
}

function controlStoreFor(record) {
  return {
    getAccount(accountId) {
      return account(accountId, record.metadata);
    }
  };
}

function deferredSurface(calls, overrides = {}) {
  let quotedTransition = {
    flowKind: "initial_activation",
    scheduledFor: "2026-08-13T00:00:00.000Z"
  };
  return {
    listOffers(input) {
      calls.push(["listOffers", input]);
      return [];
    },
    getOffer(input) {
      calls.push(["getOffer", input]);
      return {};
    },
    previewDeferredCheckout(input) {
      calls.push(["previewDeferredCheckout", input]);
      quotedTransition = {
        flowKind: input.transitionContext.flowKind,
        scheduledFor: input.transitionContext.scheduledFor
      };
      return {
        transition: quotedTransition
      };
    },
    reserveDeferredTransition(input) {
      calls.push(["reserveDeferredTransition", input]);
      return {
        transitionRef: "transition_1",
        offer: {},
        amountUnits: 1,
        flowKind: quotedTransition.flowKind,
        scheduledFor: quotedTransition.scheduledFor,
        state: "reserved",
        safeCode: null,
        reservedAt: "2026-08-13T00:00:00.000Z",
        settledAt: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z"
      };
    },
    listDeferredTransitions(input) {
      calls.push(["listDeferredTransitions", input]);
      return [];
    },
    getDeferredTransition(input) {
      calls.push(["getDeferredTransition", input]);
      return {};
    },
    cancelDeferredTransition(input) {
      calls.push(["cancelDeferredTransition", input]);
      return {};
    },
    ...overrides
  };
}

test("server-side account marker has only legacy or wallet-first outcomes", () => {
  assert.equal(
    resolveWalletFirstCommerceMode({
      controlStore: controlStoreFor({ metadata: {} }),
      accountId: "acct_alpha"
    }),
    PORTAL_COMMERCE_MODE_LEGACY
  );
  assert.equal(
    resolveWalletFirstCommerceMode({
      controlStore: controlStoreFor({
        metadata: { commercialModel: "wallet_first_unique_v1" }
      }),
      accountId: "acct_alpha"
    }),
    PORTAL_COMMERCE_MODE_WALLET_FIRST
  );
  assert.throws(
    () => resolveWalletFirstCommerceMode({
      controlStore: controlStoreFor({ metadata: { commercialModel: "legacy" } }),
      accountId: "acct_alpha"
    }),
    (error) => error?.code === "wallet_first_commerce_mode_unavailable"
  );
  assert.throws(
    () => resolveWalletFirstCommerceMode({
      controlStore: controlStoreFor({ metadata: null }),
      accountId: "acct_alpha"
    }),
    (error) => error?.code === "wallet_first_commerce_mode_unavailable"
  );
});

test("dedicated service derives a sealed chain context and does not admit ordinary Commerce methods", () => {
  const calls = [];
  const surface = deferredSurface(calls);
  const noResourceResolver = {
    resolveCurrentResourceChain({ accountId }) {
      assert.equal(accountId, "acct_alpha");
      return { state: "none" };
    }
  };
  const service = createWalletFirstCommerceService({
    deferredSurface: surface,
    resourceChainResolver: noResourceResolver,
    nowFn: () => new Date("2026-08-13T00:00:00.000Z")
  });
  const operation = {
    actorScope: "portal:acct_alpha",
    idempotencyKey: "reserve_1",
    actorType: "portal_user",
    actorRef: "acct_alpha"
  };
  service.previewDeferredCheckout({
    accountId: "acct_alpha",
    offerRef: "offer_1"
  });
  service.reserveDeferredTransition({
    accountId: "acct_alpha",
    quoteRef: "quote_1",
    operation
  });
  assert.deepEqual(calls, [
    ["listDeferredTransitions", { accountId: "acct_alpha" }],
    ["previewDeferredCheckout", {
      accountId: "acct_alpha",
      offerRef: "offer_1",
      transitionContext: {
        flowKind: "initial_activation",
        scheduledFor: "2026-08-13T00:00:00.000Z",
        expectedEntitlementId: null,
        expectedRequestId: null,
        expectedIssuedLinkId: null,
        expectedValidUntil: null
      }
    }],
    ["listDeferredTransitions", { accountId: "acct_alpha" }],
    ["reserveDeferredTransition", {
      accountId: "acct_alpha",
      quoteRef: "quote_1",
      operation
    }]
  ]);
  assert.throws(
    () => service.reserveDeferredTransition({
      accountId: "acct_alpha",
      quoteRef: "quote_1",
      operation,
      flowKind: "initial_activation"
    }),
    (error) => error?.code === "wallet_first_commerce_service_invalid"
  );
  assert.equal(Object.hasOwn(service, "confirmOrder"), false);
  assert.equal(typeof snapshotWalletFirstCommerceService(service).reserveDeferredTransition, "function");
  assert.throws(
    () => snapshotWalletFirstCommerceService(surface),
    (error) => error?.code === "wallet_first_commerce_service_unavailable"
  );
});

test("a current resource can only produce a server-derived scheduled switch", () => {
  const calls = [];
  const service = createWalletFirstCommerceService({
    deferredSurface: deferredSurface(calls),
    resourceChainResolver: {
      resolveCurrentResourceChain() {
        return {
          state: "current",
          entitlementId: "entitlement_1",
          requestId: "request_1",
          issuedLinkId: "issuedlink_1",
          validUntil: "2027-08-13T00:00:00.000Z"
        };
      }
    },
    nowFn: () => new Date("2026-08-13T00:00:00.000Z")
  });
  service.previewDeferredCheckout({
    accountId: "acct_alpha",
    offerRef: "offer_1"
  });
  service.reserveDeferredTransition({
    accountId: "acct_alpha",
    quoteRef: "quote_1",
    operation: {
      actorScope: "portal:acct_alpha",
      idempotencyKey: "reserve_current_1",
      actorType: "portal_user",
      actorRef: "acct_alpha"
    }
  });
  assert.deepEqual(calls.find(([method]) => method === "previewDeferredCheckout")[1].transitionContext, {
    flowKind: "scheduled_switch",
    scheduledFor: "2027-08-13T00:00:00.000Z",
    expectedEntitlementId: "entitlement_1",
    expectedRequestId: "request_1",
    expectedIssuedLinkId: "issuedlink_1",
    expectedValidUntil: "2027-08-13T00:00:00.000Z"
  });
  assert.equal(
    Object.hasOwn(
      calls.find(([method]) => method === "reserveDeferredTransition")[1],
      "transitionContext"
    ),
    false
  );
});

test("an unresolved same-account deferred reconciliation blocks both preview and reserve", () => {
  const calls = [];
  const surface = deferredSurface(calls, {
    listDeferredTransitions(input) {
      calls.push(["listDeferredTransitions", input]);
      return [{ state: "reconciliation_required" }];
    }
  });
  const service = createWalletFirstCommerceService({
    deferredSurface: surface,
    resourceChainResolver: {
      resolveCurrentResourceChain() {
        throw new Error("must not resolve a new transition after reconciliation");
      }
    },
    nowFn: () => new Date("2026-08-13T00:00:00.000Z")
  });
  const operation = {
    actorScope: "portal:acct_alpha",
    idempotencyKey: "reserve_reconciliation_1",
    actorType: "portal_user",
    actorRef: "acct_alpha"
  };
  assert.throws(
    () => service.previewDeferredCheckout({
      accountId: "acct_alpha",
      offerRef: "offer_1"
    }),
    (error) => error?.code === "reconciliation_required"
  );
  assert.throws(
    () => service.reserveDeferredTransition({
      accountId: "acct_alpha",
      quoteRef: "quote_1",
      operation
    }),
    (error) => error?.code === "reconciliation_required"
  );
  assert.deepEqual(calls, [
    ["listDeferredTransitions", { accountId: "acct_alpha" }],
    ["listDeferredTransitions", { accountId: "acct_alpha" }]
  ]);
});

test("reserve consumes the sealed quote context without re-resolving a time-sensitive initial activation", () => {
  const calls = [];
  let resolverCalls = 0;
  let now = "2026-08-13T00:00:00.000Z";
  const service = createWalletFirstCommerceService({
    deferredSurface: deferredSurface(calls),
    resourceChainResolver: {
      resolveCurrentResourceChain() {
        resolverCalls += 1;
        return { state: "none" };
      }
    },
    nowFn: () => new Date(now)
  });
  service.previewDeferredCheckout({
    accountId: "acct_alpha",
    offerRef: "offer_1"
  });
  now = "2026-08-13T00:00:01.000Z";
  const transition = service.reserveDeferredTransition({
    accountId: "acct_alpha",
    quoteRef: "quote_1",
    operation: {
      actorScope: "portal:acct_alpha",
      idempotencyKey: "reserve_quote_context_1",
      actorType: "portal_user",
      actorRef: "acct_alpha"
    }
  });
  assert.equal(resolverCalls, 1);
  assert.equal(transition.scheduledFor, "2026-08-13T00:00:00.000Z");
  assert.deepEqual(calls.at(-1), ["reserveDeferredTransition", {
    accountId: "acct_alpha",
    quoteRef: "quote_1",
    operation: {
      actorScope: "portal:acct_alpha",
      idempotencyKey: "reserve_quote_context_1",
      actorType: "portal_user",
      actorRef: "acct_alpha"
    }
  }]);
});
