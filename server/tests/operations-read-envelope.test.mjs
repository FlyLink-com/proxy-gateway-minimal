import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperationsReadEnvelope
} from "../services/platform/operations-read-envelope.mjs";

test("Operations Read Envelope creates the exact authorized v1 response", () => {
  const sourceData = {
    total: 12,
    active: 8,
    expiring: 2,
    disabledOrExpired: 2
  };

  const envelope = createOperationsReadEnvelope({
    schemaVersion: "operations-overview-read-envelope/v1",
    freshness: "fresh",
    sourceState: "implemented_source",
    data: sourceData,
    warnings: [],
    access: {
      allowed: true,
      capability: "operations.read",
      reasonCode: "allowed"
    }
  }, {
    nowFn: () => new Date("2026-07-31T00:00:00.000Z")
  });

  assert.deepEqual(envelope, {
    schemaVersion: "operations-overview-read-envelope/v1",
    generatedAt: "2026-07-31T00:00:00.000Z",
    freshness: "fresh",
    sourceState: "implemented_source",
    data: {
      total: 12,
      active: 8,
      expiring: 2,
      disabledOrExpired: 2
    },
    warnings: [],
    access: {
      allowed: true,
      capability: "operations.read",
      reasonCode: "allowed"
    }
  });
  assert.notEqual(envelope.data, sourceData);
});
