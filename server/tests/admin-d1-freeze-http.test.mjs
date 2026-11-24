// D1 Stage 2 — freeze route HTTP tests.
//
// Synthetic-only: in-memory control database, fake schedulers, fake
// clock, injected (immediate) sleeps and stubbed CLI runners. No
// production data, no live BWH/E4, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import Database from "better-sqlite3";

import { createApp } from "../app.mjs";
import { installD1FreezeWiring } from "../start.mjs";
import { adminD1FreezeRoutes } from "../routes/admin-d1-freeze.mjs";
import { ensureWriterAuthority, readWriterAuthority } from "../services/platform/single-writer-authority.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const COOKIE = { Cookie: "gcc_admin_session=valid" };
const ROOT = "/api/admin/platform/d1-freeze";
const SNAPSHOT = "s2s-d1-freeze-20261124";

function makeClock() {
  let nowMs = Date.parse("2026-11-24T12:00:00.000Z");
  const now = () => new Date(nowMs);
  return { now, advance(ms) { nowMs += ms; } };
}

function makeCommerceCoordinator() {
  const state = { lifecycle: "running", timerArmed: true, inFlightSettled: false };
  return {
    start() {},
    async stop() {
      state.lifecycle = "stopped";
      state.timerArmed = false;
      state.inFlightSettled = true;
    },
    getStatus() {
      return Object.freeze({ lifecycle: state.lifecycle, timerArmed: state.timerArmed, inFlightSettled: state.inFlightSettled });
    }
  };
}

function makeWelcomeCoordinator() {
  const state = { lifecycle: "running", timerArmed: true, activePassSettled: false };
  return {
    start() {},
    async stop() {
      state.lifecycle = "stopped";
      state.timerArmed = false;
      state.activePassSettled = true;
    },
    getStatus() {
      return Object.freeze({ lifecycle: state.lifecycle, timerArmed: state.timerArmed, activePassSettled: state.activePassSettled });
    }
  };
}

function makeRotationCoordinator() {
  const state = { running: true, completedBatches: 3, failedBatches: 0, failedIntents: 0, timerArmed: true };
  return {
    start() {},
    stop() { state.running = false; state.timerArmed = false; },
    getStatus() {
      return Object.freeze({ running: state.running, completedBatches: state.completedBatches, failedBatches: state.failedBatches, failedIntents: state.failedIntents, timerArmed: state.timerArmed });
    }
  };
}

function makeDeferredCoordinator() {
  return { start() {}, async stop() {} };
}

function makePortalReferrals() {
  const state = { timerArmed: true, tickInFlight: false, lastTickEndedAt: null };
  return {
    async stopTick() {
      state.timerArmed = false;
      state.tickInFlight = false;
      return Object.freeze({ timerClearedAt: "2026-11-24T12:00:00.000Z", lastTickEndedAt: state.lastTickEndedAt, tickInFlight: false });
    },
    getTickStatus() {
      return Object.freeze({ timerArmed: state.timerArmed, tickInFlight: state.tickInFlight, lastTickEndedAt: state.lastTickEndedAt });
    }
  };
}

function makePurgeStub() {
  let applyCalls = 0;
  return async ({ apply = false } = {}) => {
    if (!apply) {
      return { command: "stub purge", apply: false, exitCode: 0, stdout: JSON.stringify({ schemaVersion: "1", command: "purge", mode: "dry-run", status: "planned", mutationState: "none", counts: { deletedLeadCount: 0, eligibleLeadCount: 0 }, reasonCodes: [] }), stderr: "", timedOut: false };
    }
    applyCalls += 1;
    if (applyCalls === 1) {
      return { command: "stub purge --apply", apply: true, exitCode: 0, stdout: JSON.stringify({ schemaVersion: "1", command: "purge", mode: "apply", status: "completed", mutationState: "completed", counts: { deletedLeadCount: 0, eligibleLeadCount: 0 }, reasonCodes: [] }), stderr: "", timedOut: false };
    }
    return { command: "stub purge --apply", apply: true, exitCode: 20, stdout: JSON.stringify({ schemaVersion: "1", command: "purge", mode: "apply", status: "blocked", mutationState: "none", counts: {}, reasonCodes: ["writer_authority_not_bwh"] }), stderr: "", timedOut: false };
  };
}

async function stubCheckReferralCliProcess() {
  return { command: "ps -eo pid,args", found: false, matches: [] };
}

function freezeState({ installWiring = true } = {}) {
  const clock = makeClock();
  const database = new Database(":memory:");
  const controlStore = createSqliteSubscriptionControlStore({ database });
  ensureWriterAuthority(database);
  const state = {
    rootDir: ROOT_DIR,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "console-secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: { service: { listTenants: () => [] } },
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60000, max: 30 }
    },
    platform: {
      adminAuthRoutesEnabled: true,
      adminAuthorizationEnabled: true,
      adminAuth: {
        sessionStatus: () => ({ authenticated: false }),
        authenticateCookie: ({ cookieHeader }) => (
          String(cookieHeader || "").includes("gcc_admin_session=valid")
            ? {
              sessionRef: "admin_session_1",
              operatorRef: "portal_user_20260604_001",
              authMethod: "totp",
              status: "active",
              issuedAt: "2026-07-30T00:00:00.000Z",
              expiresAt: "2026-07-30T01:00:00.000Z"
            }
            : null
        )
      },
      controlStore,
      coinsCommerceEnabled: true,
      coinCommerceCoordinator: makeCommerceCoordinator(),
      coinCommerceDataPackRotationCoordinator: makeRotationCoordinator(),
      registrationWelcomeCoinsWorkerEnabled: true,
      portalRegistrationWelcomeBonusCoordinator: makeWelcomeCoordinator(),
      walletFirstDeferredRuntimeEnabled: true,
      deferredTransitionCoordinator: makeDeferredCoordinator(),
      portalReferralsEnabled: true,
      portalBrowserOrigin: "https://127.0.0.1:3456",
      portalReferrals: makePortalReferrals(),
      trafficAccounting: createTrafficAccountingService({ controlStore, nowFn: clock.now }),
      coinCommerceStore: {
        pendingAdsRecoveryEnqueueCount: () => 0,
        discardAdsRecoveryEnqueues: () => 0
      },
      d1FreezeExecutorOptions: {
        now: clock.now,
        sleep: async (ms) => { clock.advance(ms); },
        runPurgeCli: makePurgeStub(),
        checkReferralCliProcess: stubCheckReferralCliProcess,
        dbPath: "s2s-test-control.sqlite"
      }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
  if (installWiring) {
    installD1FreezeWiring(state, { logger: { log() {}, warn() {} }, now: clock.now });
  }
  return { database, controlStore, state, clock };
}

async function withApp(setup, fn) {
  const { database, controlStore, state } = freezeState(setup);
  const { server, baseUrl } = await listen(createApp(state));
  try {
    return await fn({ database, controlStore, state, baseUrl });
  } finally {
    server.close();
    controlStore.close();
    database.close();
  }
}

test("freeze status: anonymous is denied, admin cookie reports the held wiring", async () => {
  await withApp({}, async ({ baseUrl }) => {
    assert.equal((await fetch(`${baseUrl}${ROOT}/status`)).status, 401);
    assert.equal((await fetch(`${baseUrl}${ROOT}/status`, {
      headers: { Authorization: "Bearer <redacted>" }
    })).status, 401);
    const res = await fetch(`${baseUrl}${ROOT}/status`, { headers: COOKIE });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(body.wiringInstalled, true);
    assert.equal(body.snapshotId, SNAPSHOT);
    assert.equal(body.authority.phase, "BWH_ACTIVE");
    assert.equal(body.authority.epoch, 1);
    assert.equal(body.schedulerWiring.coinCommerceCoordinator.present, true);
    assert.equal(body.schedulerWiring.coinCommerceCoordinator.hasStop, true);
    assert.equal(body.schedulerWiring.coinCommerceCoordinator.hasGetStatus, true);
    assert.equal(body.schedulerWiring.rotationCoordinator.present, true);
    assert.equal(body.schedulerWiring.welcomeBonusCoordinator.present, true);
    assert.equal(body.schedulerWiring.portalReferrals.present, true);
    assert.equal(body.schedulerWiring.portalReferrals.hasStopTick, true);
    assert.equal(body.schedulerWiring.portalReferrals.hasGetTickStatus, true);
    assert.equal(body.checkpointIdDefault, "chk-d1-freeze-20261124");
  });
});

test("freeze POST: anonymous and bearer-only are denied, admin cookie executes the freeze", async () => {
  await withApp({}, async ({ database, baseUrl }) => {
    assert.equal((await fetch(`${baseUrl}${ROOT}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
    assert.equal((await fetch(`${baseUrl}${ROOT}`, {
      method: "POST",
      headers: { Authorization: "Bearer <redacted>", "Content-Type": "application/json" },
      body: "{}"
    })).status, 401);
    const res = await fetch(`${baseUrl}${ROOT}`, {
      method: "POST",
      headers: { ...COOKIE, "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(body.transitionId, "T1");
    assert.equal(body.snapshotId, SNAPSHOT);
    assert.equal(body.authority.phase, "FROZEN");
    assert.deepEqual(body.coverageMatrix.counts, { open: 0, fenced: 25, waived: 1, outOfScope: 2 });
    assert.equal(body.postFreezeAnomaly, false);
    assert.equal(typeof body.freezeReceipt.receiptDigest, "string");
    assert.equal(readWriterAuthority(database).phase, "FROZEN");

    // Second freeze in the same process: the authority check fails
    // first (phase is already FROZEN), before any scheduler is
    // touched again.
    const second = await fetch(`${baseUrl}${ROOT}`, {
      method: "POST",
      headers: { ...COOKIE, "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error, "freeze_authority_mismatch");
  });
});

test("freeze POST: bad snapshotId is a 400 validation error", async () => {
  await withApp({}, async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}${ROOT}`, {
      method: "POST",
      headers: { ...COOKIE, "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId: "not-a-snapshot" })
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "validation_error");
  });
});

test("freeze POST without installed wiring is a 503", async () => {
  await withApp({ installWiring: false }, async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}${ROOT}`, {
      method: "POST",
      headers: { ...COOKIE, "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "d1_freeze_unavailable");
  });
});

test("freeze POST with a principal lacking the capability is a 403", async () => {
  const { state } = freezeState({});
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: [] };
    next();
  });
  app.use(adminD1FreezeRoutes(state));
  const { server, baseUrl } = await listen(app);
  try {
    const res = await fetch(`${baseUrl}${ROOT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "admin_capability_required");
  } finally {
    server.close();
    state.platform.controlStore.close();
  }
});
