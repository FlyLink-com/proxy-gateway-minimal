import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlatformLeadReviewQueue } from "../services/platform/lead-review-queue.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const NOW = "2026-05-26T10:00:00.000Z";
const LATER = "2026-05-26T10:05:00.000Z";

function sampleLead(overrides = {}) {
  return {
    organization: "Acme Research",
    email: "OPS@EXAMPLE.COM",
    direction: "API Sandbox",
    stage: "pilot budget approved",
    message: "Need AI workflow integration for advertising lead triage.",
    ...overrides
  };
}

test("platform lead review queue stores validated leads and lists operator-safe summaries", () => {
  const queue = createPlatformLeadReviewQueue({
    nowFn: () => NOW,
    idFactory: () => "lead_1"
  });

  const enqueued = queue.enqueueLead(sampleLead());
  const items = queue.listLeads();

  assert.equal(enqueued.id, "lead_1");
  assert.equal(enqueued.status, "new");
  assert.deepEqual(items, [{
    id: "lead_1",
    type: "platform_lead_summary",
    status: "new",
    organization: "Acme Research",
    email: "ops@example.com",
    direction: "API Sandbox",
    stage: "pilot budget approved",
    source: "company-site",
    hasMessage: true,
    createdAt: NOW,
    updatedAt: NOW
  }]);
  assert.equal(JSON.stringify(items).includes("Need AI workflow"), false);
});

test("platform lead review queue updates review status without exposing invalid submitted fields", () => {
  let currentNow = NOW;
  const queue = createPlatformLeadReviewQueue({
    nowFn: () => currentNow,
    idFactory: () => "lead_1"
  });

  queue.enqueueLead(sampleLead());
  currentNow = LATER;

  const updated = queue.updateLeadStatus("lead_1", { status: "reviewing" });
  assert.equal(updated.status, "reviewing");
  assert.equal(updated.updatedAt, LATER);
  assert.deepEqual(queue.listLeads({ status: "reviewing" }).map((lead) => lead.id), ["lead_1"]);
  assert.throws(
    () => queue.updateLeadStatus("lead_1", {
      status: "raw customer secret should not appear"
    }),
    (error) => error.code === "validation_error" && !error.message.includes("raw customer secret")
  );
});

test("platform lead review queue reports missing leads as not_found", () => {
  const queue = createPlatformLeadReviewQueue();
  assert.throws(
    () => queue.getLead("missing"),
    (error) => error.code === "not_found" && error.message === "lead not found"
  );
});

test("platform lead review queue restores unexpired Leads and status after SQLite restart", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-lead-queue-restart-"));
  const dbPath = join(tempDir, "control.sqlite");
  let firstStore;
  let secondStore;

  try {
    let currentNow = "2026-07-01T00:00:00.000Z";
    firstStore = createSqliteSubscriptionControlStore({ dbPath });
    const firstQueue = createPlatformLeadReviewQueue({
      store: firstStore,
      nowFn: () => currentNow,
      idFactory: () => "lead_restart_1"
    });
    const accepted = firstQueue.enqueueLead(sampleLead());
    currentNow = "2026-07-02T00:00:00.000Z";
    firstQueue.updateLeadStatus(accepted.id, { status: "reviewing" });
    firstStore.close();
    firstStore = null;

    secondStore = createSqliteSubscriptionControlStore({ dbPath });
    const secondQueue = createPlatformLeadReviewQueue({
      store: secondStore,
      nowFn: () => "2026-07-03T00:00:00.000Z"
    });

    assert.deepEqual(secondQueue.listLeads().map((lead) => ({
      id: lead.id,
      status: lead.status,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt
    })), [{
      id: "lead_restart_1",
      status: "reviewing",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z"
    }]);
    assert.equal(secondQueue.getLead("lead_restart_1").message, sampleLead().message);
  } finally {
    firstStore?.close();
    secondStore?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("platform lead review queue purges at 90 days and status updates refresh retention", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-lead-queue-retention-"));
  let store;

  try {
    let currentNow = "2026-07-01T00:00:00.000Z";
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    const queue = createPlatformLeadReviewQueue({
      store,
      nowFn: () => currentNow,
      idFactory: () => "lead_retention_1"
    });

    queue.enqueueLead(sampleLead());
    currentNow = "2026-07-11T00:00:00.000Z";
    queue.updateLeadStatus("lead_retention_1", { status: "reviewing" });

    currentNow = "2026-09-29T00:00:00.000Z";
    assert.equal(queue.getLead("lead_retention_1").status, "reviewing");
    assert.equal(queue.purgeExpiredLeads(), 0);

    currentNow = "2026-10-09T00:00:00.000Z";
    assert.throws(
      () => queue.getLead("lead_retention_1"),
      (error) => error.code === "not_found" && error.message === "lead not found"
    );
    assert.deepEqual(store.listLeads(), []);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
