import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

import {
  COIN_COMMERCE_PRODUCTION_OFFERS
} from "../services/platform/coin-commerce-production-catalog.mjs";
import { portalCoinCommerceRoutes } from "../routes/portal-coin-commerce.mjs";

const BASIC = COIN_COMMERCE_PRODUCTION_OFFERS[0];
const PLUS = COIN_COMMERCE_PRODUCTION_OFFERS[1];
const YEARLY = COIN_COMMERCE_PRODUCTION_OFFERS[2];
const NOW = "2026-08-01T00:00:00.000Z";
const UNTIL = "2026-08-16T00:00:00.000Z";
const ACCOUNT_ID = "acct_plan_switch";

function accountRecord(accountId) {
  return {
    id: accountId,
    ownerRef: "owner_plan_switch",
    status: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    metadata: {}
  };
}

function quoteBody(planSwitch) {
  return {
    quoteRef: "quote_plan_switch_1",
    offer: PLUS,
    amountUnits: planSwitch ? 5 : PLUS.baseCoinUnits,
    appliedDiscountBasisPoints: 0,
    purchaseAvailability: "available",
    shortfallUnits: 0,
    allocation: [{
      coinType: "paid_coins",
      amountUnits: planSwitch ? 5 : PLUS.baseCoinUnits
    }],
    balances: {
      before: {
        bonusCoins: 0,
        paidCoins: 100,
        rewardCoins: 0,
        heldCoins: 0
      },
      after: {
        bonusCoins: 0,
        paidCoins: planSwitch ? 95 : 70,
        rewardCoins: 0,
        heldCoins: planSwitch ? 5 : PLUS.baseCoinUnits
      }
    },
    expiresAt: "2026-08-01T00:05:00.000Z",
    ...(planSwitch
      ? {
        planSwitch: {
          kind: "upgrade_inplace",
          creditUnits: 5,
          chargeUnits: 5,
          effectiveAt: null,
          cancelsPendingDowngrade: false
        }
      }
      : {})
  };
}

function appFor({ planSwitchEnabled, store, facts }) {
  const controlStore = {
    getAccount(accountId) {
      return accountRecord(accountId);
    },
    readPlanSwitchAccountFacts() {
      return facts;
    }
  };
  const platform = {
    userPortalAuth: {
      requireSession({ sessionRef }) {
        return { sessionRef, accountId: ACCOUNT_ID };
      }
    },
    coinCommerceStore: store,
    coinsCommercePlanSwitchEnabled: planSwitchEnabled,
    walletFirstRegistrationEnabled: false,
    ...(planSwitchEnabled ? { controlStore } : {})
  };
  const app = express();
  app.use(portalCoinCommerceRoutes({ platform }, {
    nowFn: () => Date.parse(NOW)
  }));
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_routed" } });
  });
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function request(server, path, init = {}) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      "x-portal-session": "session_alpha",
      ...(init.headers ?? {})
    }
  });
  const body = await response.json();
  return { status: response.status, body };
}

test("plan switch portal routes stay unregistered when the flag is off", async () => {
  const server = await listen(appFor({
    planSwitchEnabled: false,
    store: {
      createCheckoutQuote() {
        return quoteBody(false);
      }
    }
  }));
  try {
    const state = await request(server, "/api/portal/commerce/plan-switch/state");
    assert.equal(state.status, 404);
    assert.equal(state.body.error.code, "not_routed");
    const preview = await request(server, "/api/portal/commerce/checkout-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerRef: PLUS.offerRef })
    });
    assert.equal(preview.status, 200);
    assert.equal(Object.hasOwn(preview.body.quote, "planSwitch"), false);
    assert.equal(preview.body.quote.amountUnits, PLUS.baseCoinUnits);
  } finally {
    server.close();
  }
});

test("plan switch state and preview expose the discounted switch charge", async () => {
  const server = await listen(appFor({
    planSwitchEnabled: true,
    facts: {
      commerceMode: "legacy",
      authorityRowCount: 0,
      entitlement: {
        id: "ent_plan_switch",
        plan: BASIC.offerVersionRef,
        validFrom: "2026-07-17T00:00:00.000Z",
        validUntil: UNTIL
      },
      scheduledSwitch: { ok: true, row: null }
    },
    store: {
      listPublishedOffers() {
        return [BASIC, PLUS, YEARLY];
      },
      createCheckoutQuote() {
        return quoteBody(true);
      }
    }
  }));
  try {
    const state = await request(server, "/api/portal/commerce/plan-switch/state");
    assert.equal(state.status, 200);
    assert.equal(state.body.current.offerRef, BASIC.offerRef);
    assert.equal(state.body.current.validUntil, UNTIL);
    assert.equal(state.body.pendingSwitch, null);
    const byRef = new Map(state.body.offers.map((offer) => [offer.offerRef, offer]));
    assert.equal(byRef.get(BASIC.offerRef).action, "current_renew");
    assert.equal(byRef.get(BASIC.offerRef).chargeUnits, 20);
    assert.equal(byRef.get(PLUS.offerRef).action, "upgrade");
    assert.equal(byRef.get(PLUS.offerRef).chargeUnits, 5);
    assert.equal(byRef.get(YEARLY.offerRef).action, "upgrade");
    assert.equal(byRef.get(YEARLY.offerRef).chargeUnits, 190);
    const preview = await request(server, "/api/portal/commerce/checkout-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerRef: PLUS.offerRef })
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.quote.amountUnits, 5);
    assert.deepEqual(preview.body.quote.planSwitch, {
      kind: "upgrade_inplace",
      creditUnits: 5,
      chargeUnits: 5,
      effectiveAt: null,
      cancelsPendingDowngrade: false
    });
  } finally {
    server.close();
  }
});

test("plan switch conflicts are HTTP 409", async () => {
  const error = new Error("plan switch window");
  error.code = "plan_switch_upgrade_window_closed";
  const server = await listen(appFor({
    planSwitchEnabled: true,
    facts: null,
    store: {
      createCheckoutQuote() {
        throw error;
      }
    }
  }));
  try {
    const preview = await request(server, "/api/portal/commerce/checkout-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerRef: PLUS.offerRef })
    });
    assert.equal(preview.status, 409);
    assert.equal(preview.body.error.code, "plan_switch_upgrade_window_closed");
    assert.equal(preview.body.error.retryable, false);
  } finally {
    server.close();
  }
});
