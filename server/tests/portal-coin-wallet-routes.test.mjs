import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";

import { createApp } from "../app.mjs";
import { createPortalCoinWalletRouter } from "../routes/portal-coin-wallet.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = new URL("../../", import.meta.url).pathname;
const CONSOLE_TOKEN = "console-secret";
const SESSION_REF = "session_alpha";
const ACCOUNT_ID = "acct-alpha";
const NOW = "2026-07-27T12:34:56.000Z";

const WALLET_ERROR = (code, retryable = false) => ({
  error: { code, retryable }
});

const FULL_WALLET = {
  exists: true,
  walletRef: "wallet-alpha",
  status: "active",
  version: 7,
  totals: {
    paid_coins: 120,
    bonus_coins: 30,
    reward_coins: 5
  },
  spendableUnits: 155,
  heldUnits: 20,
  pendingUnits: 3
};

const MISSING_WALLET = {
  exists: false,
  status: "not_created",
  version: 0,
  totals: {
    paid_coins: 0,
    bonus_coins: 0,
    reward_coins: 0
  },
  spendableUnits: 0,
  heldUnits: 0,
  pendingUnits: 0
};

const OPERATIONS = [
  "credit",
  "pending_to_available",
  "available_to_held",
  "held_to_available",
  "held_to_consumed",
  "held_to_expired",
  "available_to_expired"
];

const EXPECTED_DELTAS = [
  [null, null, null, 11],
  [11, -11, 0, 0],
  [-11, 0, 11, 0],
  [11, 0, -11, 0],
  [0, 0, -11, -11],
  [0, 0, -11, -11],
  [-11, 0, 0, -11]
];

function clone(value) {
  return structuredClone(value);
}

function ledgerEntry(operation, index) {
  return {
    entryRef: `entry-${String(20 - index).padStart(2, "0")}`,
    operationRef: `operation-${index}`,
    walletRef: "wallet-alpha",
    lotRef: `lot-${index}`,
    operation,
    coinType: ["paid_coins", "bonus_coins", "reward_coins"][index % 3],
    amountUnits: 11,
    holdRef: index === 0 ? null : `hold-${index}`,
    orderRef: index % 2 === 0 ? null : `order-${index}`,
    sourceType: "verified_source",
    sourceRef: `source_${index}`,
    actorType: "system",
    actorRef: "wallet_worker",
    previousWalletVersion: index,
    resultingWalletVersion: index + 1,
    resultingWalletStatus: "active",
    occurredAt: new Date(Date.parse(NOW) - index * 1_000).toISOString()
  };
}

function createStore(overrides = {}) {
  const calls = [];
  const mutationCalls = [];
  const entries = OPERATIONS.map(ledgerEntry);
  entries.push(ledgerEntry("credit", 7));
  const store = {
    getWalletProjection(input) {
      calls.push(["getWalletProjection", clone(input)]);
      return clone(FULL_WALLET);
    },
    listLedgerEntries(input) {
      calls.push(["listLedgerEntries", clone(input)]);
      return clone(entries);
    },
    creditCoins() {
      mutationCalls.push("creditCoins");
      throw new Error("GET must not mutate Wallet state");
    },
    createCoinHold() {
      mutationCalls.push("createCoinHold");
      throw new Error("GET must not mutate Wallet state");
    },
    captureCoinHold() {
      mutationCalls.push("captureCoinHold");
      throw new Error("GET must not mutate Wallet state");
    },
    releaseCoinHold() {
      mutationCalls.push("releaseCoinHold");
      throw new Error("GET must not mutate Wallet state");
    },
    ...overrides
  };
  return { store, calls, mutationCalls };
}

function createAuth(overrides = {}) {
  return {
    requireSession({ sessionRef }) {
      return { sessionRef, accountId: ACCOUNT_ID };
    },
    ...overrides
  };
}

function createState({
  store = createStore().store,
  auth = createAuth(),
  walletEnabled = true,
  portalEnabled = true
} = {}) {
  return {
    rootDir: ROOT_DIR,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: CONSOLE_TOKEN,
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {},
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60_000, max: 30 }
    },
    platform: {
      coinsWalletEnabled: walletEnabled,
      userPortalRoutesEnabled: portalEnabled,
      coinsWalletStore: store,
      userPortalAuth: auth
    },
    isPortListening: async () => false,
    runCommand: async () => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      timedOut: false
    })
  };
}

function portalHeaders(sessionRef = SESSION_REF) {
  return { "X-Portal-Session": sessionRef };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function rawRequest(baseUrl, {
  method = "GET",
  path,
  headers = []
}) {
  const target = new URL(baseUrl);
  const outgoingHeaders = {};
  for (let index = 0; index < headers.length; index += 2) {
    const name = headers[index];
    const value = headers[index + 1];
    const existingName = Object.keys(outgoingHeaders).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase()
    );
    if (!existingName) {
      outgoingHeaders[name] = value;
    } else {
      outgoingHeaders[existingName] = Array.isArray(outgoingHeaders[existingName])
        ? [...outgoingHeaders[existingName], value]
        : [outgoingHeaders[existingName], value];
    }
  }
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      method,
      path,
      agent: false,
      headers: outgoingHeaders
    }, (response) => {
      const chunks = [];
      response.on("error", reject);
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: response.statusCode,
          json: text ? JSON.parse(text) : null
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function expectWalletError(response, status, code, retryable = false) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), WALLET_ERROR(code, retryable));
}

test("named factory returns a selected-route dispatcher", () => {
  const { store } = createStore();
  assert.equal(
    typeof createPortalCoinWalletRouter({ store, auth: createAuth() }),
    "function"
  );
});

test("Wallet summary and all seven ledger categories expose only safe exact DTOs", async () => {
  const { store, calls, mutationCalls } = createStore();
  const { server, baseUrl } = await listen(createApp(createState({ store })));
  try {
    const summary = await fetch(`${baseUrl}/api/portal/coins/wallet`, {
      headers: portalHeaders()
    });
    assert.equal(summary.status, 200);
    assert.deepEqual(await summary.json(), {
      wallet: {
        status: "active",
        version: 7,
        balances: {
          paidCoins: 120,
          bonusCoins: 30,
          rewardCoins: 5
        },
        spendableUnits: 155,
        heldUnits: 20,
        pendingUnits: 3
      }
    });

    const ledger = await fetch(
      `${baseUrl}/api/portal/coins/wallet/ledger?limit=7`,
      { headers: portalHeaders() }
    );
    assert.equal(ledger.status, 200);
    const expectedEntries = OPERATIONS.map((category, index) => ({
      entryRef: `entry-${String(20 - index).padStart(2, "0")}`,
      category,
      coinType: ["paid_coins", "bonus_coins", "reward_coins"][index % 3],
      amountUnits: 11,
      availableDeltaUnits: EXPECTED_DELTAS[index][0],
      pendingDeltaUnits: EXPECTED_DELTAS[index][1],
      heldDeltaUnits: EXPECTED_DELTAS[index][2],
      totalDeltaUnits: EXPECTED_DELTAS[index][3],
      relatedOrderRef: index % 2 === 0 ? null : `order-${index}`,
      occurredAt: new Date(Date.parse(NOW) - index * 1_000).toISOString()
    }));
    assert.deepEqual(await ledger.json(), {
      entries: expectedEntries,
      nextCursor: {
        afterOccurredAt: expectedEntries[6].occurredAt,
        afterEntryRef: expectedEntries[6].entryRef
      }
    });
    assert.deepEqual(calls, [
      ["getWalletProjection", { accountId: ACCOUNT_ID }],
      ["getWalletProjection", { accountId: ACCOUNT_ID }],
      ["listLedgerEntries", { walletRef: "wallet-alpha", limit: 8 }]
    ]);
    assert.deepEqual(mutationCalls, []);
    assert.doesNotMatch(
      JSON.stringify(expectedEntries),
      /operationRef|walletRef|lotRef|holdRef|sourceType|sourceRef|actorType|actorRef|WalletVersion|WalletStatus/
    );
  } finally {
    await closeServer(server);
  }
});

test("ledger cursor is exact, paired, and forwarded only after session-owned Wallet resolution", async () => {
  const { store, calls } = createStore({
    listLedgerEntries(input) {
      calls.push(["listLedgerEntries", clone(input)]);
      return [];
    }
  });
  const { server, baseUrl } = await listen(createApp(createState({ store })));
  try {
    const response = await fetch(
      `${baseUrl}/api/portal/coins/wallet/ledger`
        + `?limit=100&afterOccurredAt=${encodeURIComponent(NOW)}`
        + "&afterEntryRef=entry-20",
      { headers: portalHeaders() }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { entries: [], nextCursor: null });
    assert.deepEqual(calls, [
      ["getWalletProjection", { accountId: ACCOUNT_ID }],
      ["listLedgerEntries", {
        walletRef: "wallet-alpha",
        afterOccurredAt: NOW,
        afterEntryRef: "entry-20",
        limit: 101
      }]
    ]);
  } finally {
    await closeServer(server);
  }
});

test("server-confirmed missing Wallet returns authoritative empty state without creating one", async () => {
  const { store, calls, mutationCalls } = createStore({
    getWalletProjection(input) {
      calls.push(["getWalletProjection", clone(input)]);
      return clone(MISSING_WALLET);
    }
  });
  const { server, baseUrl } = await listen(createApp(createState({ store })));
  try {
    const summary = await fetch(`${baseUrl}/api/portal/coins/wallet`, {
      headers: portalHeaders()
    });
    assert.equal(summary.status, 200);
    assert.deepEqual(await summary.json(), {
      wallet: {
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
      }
    });
    const ledger = await fetch(
      `${baseUrl}/api/portal/coins/wallet/ledger?limit=10`,
      { headers: portalHeaders() }
    );
    assert.equal(ledger.status, 200);
    assert.deepEqual(await ledger.json(), { entries: [], nextCursor: null });
    assert.deepEqual(calls, [
      ["getWalletProjection", { accountId: ACCOUNT_ID }],
      ["getWalletProjection", { accountId: ACCOUNT_ID }]
    ]);
    assert.deepEqual(mutationCalls, []);
  } finally {
    await closeServer(server);
  }
});

test("Wallet routes mount only behind both flags and exact callable dependencies", async (t) => {
  const cases = [
    ["Wallet disabled", (state) => {
      state.platform.coinsWalletEnabled = false;
    }],
    ["Portal disabled", (state) => {
      state.platform.userPortalRoutesEnabled = false;
    }],
    ["Store absent", (state) => {
      delete state.platform.coinsWalletStore;
    }],
    ["projection absent", (state) => {
      delete state.platform.coinsWalletStore.getWalletProjection;
    }],
    ["ledger absent", (state) => {
      delete state.platform.coinsWalletStore.listLedgerEntries;
    }],
    ["auth absent", (state) => {
      delete state.platform.userPortalAuth;
    }],
    ["requireSession absent", (state) => {
      delete state.platform.userPortalAuth.requireSession;
    }],
    ["projection non-callable", (state) => {
      state.platform.coinsWalletStore.getWalletProjection = true;
    }],
    ["ledger non-callable", (state) => {
      state.platform.coinsWalletStore.listLedgerEntries = true;
    }],
    ["requireSession non-callable", (state) => {
      state.platform.userPortalAuth.requireSession = true;
    }]
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const { store, calls } = createStore();
      const state = createState({ store });
      mutate(state);
      const { server, baseUrl } = await listen(createApp(state));
      try {
        const response = await fetch(`${baseUrl}/api/portal/coins/wallet`, {
          headers: portalHeaders()
        });
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { error: "Unauthorized" });
        assert.deepEqual(calls, []);
      } finally {
        await closeServer(server);
      }
    });
  }
});

test("session header is required once, validated raw, and accountId comes only from auth", async (t) => {
  let authCalls = 0;
  const { store, calls } = createStore();
  const auth = createAuth({
    requireSession({ sessionRef }) {
      authCalls += 1;
      return { sessionRef, accountId: "acct_session_owned" };
    }
  });
  const { server, baseUrl } = await listen(createApp(createState({ store, auth })));
  try {
    for (const [name, headers] of [
      ["missing", []],
      ["invalid", ["X-Portal-Session", "INVALID"]],
      ["duplicate", [
        "X-Portal-Session", SESSION_REF,
        "x-portal-session", "session_beta"
      ]]
    ]) {
      await t.test(name, async () => {
        const response = await rawRequest(baseUrl, {
          path: "/api/portal/coins/wallet",
          headers
        });
        assert.equal(response.status, 401);
        assert.deepEqual(
          response.json,
          WALLET_ERROR("wallet_session_invalid")
        );
      });
    }
    const response = await fetch(
      `${baseUrl}/api/portal/coins/wallet?accountId=acct_attacker`,
      { headers: portalHeaders() }
    );
    await expectWalletError(
      response,
      400,
      "wallet_request_invalid"
    );
    const valid = await fetch(`${baseUrl}/api/portal/coins/wallet`, {
      headers: portalHeaders()
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(calls, [
      ["getWalletProjection", { accountId: "acct_session_owned" }]
    ]);
    assert.equal(authCalls, 1);
  } finally {
    await closeServer(server);
  }
});

test("requireSession rejection maps to the only safe session error", async () => {
  const auth = createAuth({
    requireSession() {
      const error = new Error("private session detail");
      error.code = "private_code";
      throw error;
    }
  });
  const { server, baseUrl } = await listen(createApp(createState({ auth })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/coins/wallet`, {
      headers: portalHeaders()
    });
    await expectWalletError(
      response,
      401,
      "wallet_session_invalid"
    );
  } finally {
    await closeServer(server);
  }
});

test("ledger rejects absent, unknown, repeated, out-of-range, and unpaired query values", async (t) => {
  const invalidPaths = [
    "/api/portal/coins/wallet/ledger",
    "/api/portal/coins/wallet/ledger?limit=0",
    "/api/portal/coins/wallet/ledger?limit=101",
    "/api/portal/coins/wallet/ledger?limit=1.5",
    "/api/portal/coins/wallet/ledger?limit=01",
    "/api/portal/coins/wallet/ledger?limit=1&limit=2",
    "/api/portal/coins/wallet/ledger?limit=1&unknown=true",
    `/api/portal/coins/wallet/ledger?limit=1&afterOccurredAt=${encodeURIComponent(NOW)}`,
    "/api/portal/coins/wallet/ledger?limit=1&afterEntryRef=entry-20",
    "/api/portal/coins/wallet/ledger?limit=1&afterOccurredAt=bad&afterEntryRef=entry-20",
    `/api/portal/coins/wallet/ledger?limit=1&afterOccurredAt=${encodeURIComponent(NOW)}&afterEntryRef=${encodeURIComponent(" entry-20")}`,
    `/api/portal/coins/wallet/ledger?limit=1&afterOccurredAt=${encodeURIComponent(NOW)}&afterOccurredAt=${encodeURIComponent(NOW)}&afterEntryRef=entry-20`
  ];
  const { store, calls } = createStore();
  const { server, baseUrl } = await listen(createApp(createState({ store })));
  try {
    for (const path of invalidPaths) {
      await t.test(path, async () => {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: portalHeaders()
        });
        await expectWalletError(
          response,
          400,
          "wallet_request_invalid"
        );
      });
    }
    assert.deepEqual(calls, []);
  } finally {
    await closeServer(server);
  }
});

test("unknown or malformed Store projections fail as retryable Wallet unavailability", async (t) => {
  const summaryMutations = [
    (wallet) => {
      wallet.status = "unknown";
    },
    (wallet) => {
      wallet.version = Number.MAX_SAFE_INTEGER + 1;
    },
    (wallet) => {
      wallet.totals.paid_coins = -1;
    },
    (wallet) => {
      wallet.extra = "private";
    }
  ];
  for (const mutate of summaryMutations) {
    await t.test(`summary ${summaryMutations.indexOf(mutate)}`, async () => {
      const { store } = createStore({
        getWalletProjection() {
          const wallet = clone(FULL_WALLET);
          mutate(wallet);
          return wallet;
        }
      });
      const { server, baseUrl } = await listen(createApp(createState({ store })));
      try {
        const response = await fetch(`${baseUrl}/api/portal/coins/wallet`, {
          headers: portalHeaders()
        });
        await expectWalletError(response, 503, "wallet_unavailable", true);
      } finally {
        await closeServer(server);
      }
    });
  }

  const ledgerMutations = [
    (entry) => {
      entry.operation = "unknown";
    },
    (entry) => {
      entry.coinType = "gift_coins";
    },
    (entry) => {
      entry.amountUnits = Number.MAX_SAFE_INTEGER + 1;
    },
    (entry) => {
      entry.occurredAt = "not-a-time";
    },
    (entry) => {
      entry.resultingWalletStatus = "unknown";
    }
  ];
  for (const mutate of ledgerMutations) {
    await t.test(`ledger ${ledgerMutations.indexOf(mutate)}`, async () => {
      const { store } = createStore({
        listLedgerEntries() {
          const entry = ledgerEntry("credit", 0);
          mutate(entry);
          return [entry];
        }
      });
      const { server, baseUrl } = await listen(createApp(createState({ store })));
      try {
        const response = await fetch(
          `${baseUrl}/api/portal/coins/wallet/ledger?limit=1`,
          { headers: portalHeaders() }
        );
        await expectWalletError(response, 503, "wallet_unavailable", true);
      } finally {
        await closeServer(server);
      }
    });
  }
});

test("Store failures expose no raw code or message", async (t) => {
  for (const method of ["getWalletProjection", "listLedgerEntries"]) {
    await t.test(method, async () => {
      const { store } = createStore({
        [method]() {
          const error = new Error("raw SQLite platform_coin_wallets detail");
          error.code = "SQLITE_PRIVATE";
          throw error;
        }
      });
      const { server, baseUrl } = await listen(createApp(createState({ store })));
      try {
        const path = method === "getWalletProjection"
          ? "/api/portal/coins/wallet"
          : "/api/portal/coins/wallet/ledger?limit=1";
        const response = await fetch(`${baseUrl}${path}`, {
          headers: portalHeaders()
        });
        await expectWalletError(response, 503, "wallet_unavailable", true);
      } finally {
        await closeServer(server);
      }
    });
  }
});
