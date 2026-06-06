import assert from "node:assert/strict";
import test from "node:test";
import { createPortalSupportRequestService } from "../services/platform/portal-support-requests.mjs";

const NOW = "2026-06-03T00:00:00.000Z";

function validSupportInput(overrides = {}) {
  return {
    portalUserRef: "user_safe_ref",
    category: "client_import",
    clientTarget: "clash",
    message: "Clash import fails after subscription refresh",
    subscriptionRequestRef: "subreq_monthly",
    ...overrides
  };
}

test("portal support request service creates safe submitted summaries without echoing the message", () => {
  const requests = createPortalSupportRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "psup_1"
  });

  const request = requests.submitRequest(validSupportInput());

  assert.equal(request.id, "psup_1");
  assert.equal(request.type, "portal_support_request_summary");
  assert.equal(request.status, "submitted");
  assert.equal(request.category, "client_import");
  assert.equal(request.clientTarget, "clash");
  assert.equal(request.portalUserRef, "user_safe_ref");
  assert.equal(request.subscriptionRequestRef, "subreq_monthly");
  assert.equal(request.messageProvided, true);
  assert.equal(request.messageLength, "Clash import fails after subscription refresh".length);
  assert.equal(request.safety.noRawMessageReturned, true);
  assert.equal(JSON.stringify(request).includes("Clash import fails"), false);
});

test("portal support request service validates category and message", () => {
  const requests = createPortalSupportRequestService({ nowFn: () => NOW });

  assert.throws(
    () => requests.submitRequest(validSupportInput({ category: "telegram" })),
    (error) => error.code === "validation_error"
  );
  assert.throws(
    () => requests.submitRequest(validSupportInput({ message: "   " })),
    (error) => error.code === "validation_error"
  );
});
