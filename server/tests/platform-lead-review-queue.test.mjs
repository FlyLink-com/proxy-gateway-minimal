import assert from "node:assert/strict";
import test from "node:test";
import { createPlatformLeadReviewQueue } from "../services/platform/lead-review-queue.mjs";

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
