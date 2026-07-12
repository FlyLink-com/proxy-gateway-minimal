import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createRuntimeState } from "../state.mjs";
import { createPlatformLeadReviewQueue } from "../services/platform/lead-review-queue.mjs";
import { createOperationsFoundationSummary } from "../services/platform/operations-foundation-summary.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function sampleLead() {
  return {
    organization: "Example Research",
    email: "operator@example.test",
    direction: "Controlled beta",
    stage: "qualified",
    message: "Request a controlled beta review.",
    source: "campaign_alpha"
  };
}

test("durable lead queue survives a control-store restart", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-operations-foundation-"));
  const dbPath = join(root, "control.sqlite");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const firstStore = createSqliteSubscriptionControlStore({ dbPath });
  const firstQueue = createPlatformLeadReviewQueue({
    store: firstStore,
    nowFn: () => "2026-07-12T10:00:00.000Z",
    idFactory: () => "lead_durable_1"
  });
  firstQueue.enqueueLead(sampleLead());
  firstQueue.updateLeadStatus("lead_durable_1", { status: "reviewing" });
  firstStore.close();

  const reopenedStore = createSqliteSubscriptionControlStore({ dbPath });
  t.after(() => reopenedStore.close());
  const reopenedQueue = createPlatformLeadReviewQueue({ store: reopenedStore });

  assert.equal(reopenedQueue.getLead("lead_durable_1").status, "reviewing");
  assert.deepEqual(
    reopenedQueue.listLeads().map((lead) => lead.id),
    ["lead_durable_1"]
  );
});

test("operations events are append-only and idempotent without private payloads", () => {
  const store = createSqliteSubscriptionControlStore({ database: new Database(":memory:") });
  const event = {
    eventRef: "opsevt_registration_1",
    eventType: "registration_completed",
    idempotencyKey: "registration_completed:acct_1",
    accountRef: "acct_1",
    campaignRef: "campaign_alpha",
    occurredAt: "2026-07-12T10:01:00.000Z"
  };

  const first = store.recordOperationsEvent(event);
  const duplicate = store.recordOperationsEvent(event);

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(store.listOperationsEvents().length, 1);
  assert.throws(
    () => store.recordOperationsEvent({
      ...event,
      eventRef: "opsevt_unsafe_1",
      idempotencyKey: "registration_completed:acct_2",
      metadata: { email: "private@example.test" }
    }),
    /unsafe/i
  );
  store.close();
});

test("generic lead source labels do not become campaign references implicitly", () => {
  const database = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database });
  const queue = createPlatformLeadReviewQueue({
    store,
    nowFn: () => "2026-07-12T10:00:00.000Z",
    idFactory: () => "lead_source_label_1"
  });

  assert.doesNotThrow(() => queue.enqueueLead({
    ...sampleLead(),
    source: "paid social"
  }));
  assert.equal(store.listOperationsEvents()[0].campaignRef, null);
  database.close();
});

test("operations summary exposes actionable counts and missing-link evidence", () => {
  const database = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database });
  const queue = createPlatformLeadReviewQueue({
    store,
    nowFn: () => "2026-07-12T10:00:00.000Z",
    idFactory: () => "lead_summary_1"
  });
  queue.enqueueLead(sampleLead());
  store.recordOperationsEvent({
    eventRef: "opsevt_delivery_1",
    eventType: "delivery_completed",
    idempotencyKey: "delivery_completed:req_missing",
    requestRef: "req_missing",
    occurredAt: "2026-07-12T10:05:00.000Z"
  });

  const summary = createOperationsFoundationSummary({ leadQueue: queue, controlStore: store });

  assert.deepEqual(summary.leads, {
    total: 1,
    new: 1,
    reviewing: 0,
    converted: 0,
    rejected: 0
  });
  assert.equal(summary.events.deliveryCompleted, 1);
  assert.equal(summary.dataQuality.missingRequestRefs, 1);
  assert.deepEqual(summary.safety, {
    summaryOnly: true,
    rawCustomerDataReturned: false,
    rawCredentialReturned: false,
    rawSubscriptionUrlReturned: false
  });
  assert.equal(JSON.stringify(summary).includes("private@example.test"), false);
  store.close();
});

test("runtime state uses the durable control store for leads", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-operations-runtime-"));
  const controlDbPath = join(root, "control.sqlite");
  const subscriptionDbPath = join(root, "subscriptions.sqlite");
  const proxyConfigPath = join(root, "proxy-servers.json");
  writeFileSync(proxyConfigPath, JSON.stringify({
    servers: [],
    pingHosts: [],
    nginx: { host: "127.0.0.1", ports: [] }
  }));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  let state = createRuntimeState({
    rootDir: ROOT,
    env: { CONSOLE_TOKEN: "synthetic-console-token" },
    controlDbPath,
    subscriptionDbPath,
    proxyConfigPath,
    subscriptionCore: {},
    autoStartHttpProxy: false
  });
  state.platform.leadQueue.enqueueLead({
    ...sampleLead(),
    id: "lead_runtime_1"
  });
  state.close();

  state = createRuntimeState({
    rootDir: ROOT,
    env: { CONSOLE_TOKEN: "synthetic-console-token" },
    controlDbPath,
    subscriptionDbPath,
    proxyConfigPath,
    subscriptionCore: {},
    autoStartHttpProxy: false
  });
  assert.equal(state.platform.leadQueue.getLead("lead_runtime_1").id, "lead_runtime_1");
  state.close();
});

test("protected operations summary route returns safe read-only counts", async () => {
  const database = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database });
  const leadQueue = createPlatformLeadReviewQueue({
    store,
    nowFn: () => "2026-07-12T10:00:00.000Z",
    idFactory: () => "lead_route_1"
  });
  leadQueue.enqueueLead(sampleLead());
  const state = {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "synthetic-console-token",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform: { leadQueue, controlStore: store },
    services: {
      ssLocal: { start: async () => ({}), stop: async () => ({}), status: () => ({}) },
      httpProxy: { start: async () => ({}), stop: async () => ({}), status: () => ({}) }
    },
    isPortListening: async () => false
  };
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/operations-summary`);
    assert.equal(unauthenticated.status, 401);
    const response = await fetch(`${baseUrl}/api/admin/platform/operations-summary`, {
      headers: { Authorization: "Bearer synthetic-console-token" }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.leads.total, 1);
    assert.equal(body.summary.safety.summaryOnly, true);
  } finally {
    server.close();
    database.close();
  }
});

test("access lifecycle and first usage produce one linked operations event each", () => {
  const database = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database });
  const now = "2026-07-12T10:00:00.000Z";
  store.createAccount({
    id: "acct_ops_1",
    ownerRef: "owner_ops_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.createEntitlement({
    id: "ent_ops_1",
    accountId: "acct_ops_1",
    plan: "trial",
    status: "active",
    validFrom: now,
    validUntil: "2026-07-19T10:00:00.000Z",
    trafficLimitBytes: 1024,
    createdAt: now,
    updatedAt: now
  });
  store.createIssuanceRequest({
    id: "req_ops_1",
    accountId: "acct_ops_1",
    entitlementId: "ent_ops_1",
    approvalRef: "approval_ops_1",
    status: "issued",
    quantity: 1,
    nodeId: "node_ops_1",
    purpose: "controlled_beta",
    requestedByRef: "operator_ops_1",
    createdAt: now,
    updatedAt: now
  });
  store.upsertPortalAccessRequest({
    id: "req_ops_1",
    portalUserRef: "acct_ops_1",
    plan: "trial",
    clientTarget: "clash",
    durationDays: 7,
    quantity: 1,
    status: "delivered",
    nextAction: "observe_usage",
    priorTrialState: "none",
    submittedAt: now,
    updatedAt: "2026-07-12T10:05:00.000Z",
    entitlementRef: "ent_ops_1"
  });
  const usage = {
    id: "usage_ops_1",
    sourceRef: "collector_ops_1",
    channelRef: "channel_ops_1",
    edgeCredentialRef: "edgecred_ops_1",
    accountId: "acct_ops_1",
    entitlementId: "ent_ops_1",
    requestId: "req_ops_1",
    observedAt: "2026-07-12T10:10:00.000Z",
    intervalStartedAt: "2026-07-12T10:09:00.000Z",
    intervalEndedAt: "2026-07-12T10:10:00.000Z",
    uploadBytes: 1,
    downloadBytes: 2,
    totalBytes: 3,
    sampleDigest: "a".repeat(64),
    createdAt: "2026-07-12T10:10:00.000Z"
  };
  store.recordUsageSample(usage);
  store.recordUsageSample(usage);

  const events = store.listOperationsEvents();
  assert.equal(events.filter((event) => event.eventType === "access_requested").length, 1);
  assert.equal(events.filter((event) => event.eventType === "delivery_completed").length, 1);
  assert.equal(events.filter((event) => event.eventType === "first_usage_observed").length, 1);
  assert.equal(events.find((event) => event.eventType === "first_usage_observed").requestRef, "req_ops_1");
  database.close();
});

test("legacy control database gains only additive operations schema and preserves existing rows", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-operations-legacy-"));
  const dbPath = join(root, "control.sqlite");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const legacyDb = new Database(dbPath);
  createSqliteSubscriptionControlStore({ database: legacyDb });
  legacyDb.exec(`
    drop table platform_operations_events;
    drop table platform_leads;
  `);
  legacyDb.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, ?, ?, ?, ?)
  `).run(
    "acct_legacy_sentinel",
    "owner_legacy_sentinel",
    "active",
    "2026-07-01T00:00:00.000Z",
    "2026-07-01T00:00:00.000Z",
    "{}"
  );
  const legacyObjects = new Set(legacyDb.prepare(`
    select name from sqlite_master where type in ('table', 'index')
  `).all().map((row) => row.name));
  legacyDb.close();

  let store = createSqliteSubscriptionControlStore({ dbPath });
  assert.equal(store.getAccount("acct_legacy_sentinel").ownerRef, "owner_legacy_sentinel");
  store.close();
  store = createSqliteSubscriptionControlStore({ dbPath });
  assert.equal(store.getAccount("acct_legacy_sentinel").ownerRef, "owner_legacy_sentinel");
  store.close();

  const verifiedDb = new Database(dbPath, { readonly: true });
  const currentObjects = new Set(verifiedDb.prepare(`
    select name from sqlite_master where type in ('table', 'index')
  `).all().map((row) => row.name));
  verifiedDb.close();
  const additions = [...currentObjects].filter((name) => !legacyObjects.has(name)).sort();
  assert.deepEqual(additions, [
    "platform_leads",
    "platform_leads_status_created_idx",
    "platform_operations_events",
    "platform_operations_events_account_idx",
    "platform_operations_events_lead_idx",
    "platform_operations_events_type_time_idx",
    "sqlite_autoindex_platform_leads_1",
    "sqlite_autoindex_platform_operations_events_1",
    "sqlite_autoindex_platform_operations_events_2"
  ]);
});
