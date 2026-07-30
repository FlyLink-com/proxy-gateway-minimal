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

const validEnvelopeInput = {
  schemaVersion: "operations-overview-read-envelope/v1",
  freshness: "fresh",
  sourceState: "implemented_source",
  data: { total: 0 },
  warnings: [],
  access: {
    allowed: true,
    capability: "operations.read",
    reasonCode: "allowed"
  }
};

for (const [label, override] of [
  ["blank schema", { schemaVersion: "" }],
  ["unsupported freshness", { freshness: "disconnected" }],
  ["unsupported source state", { sourceState: "deployed" }],
  ["array data", { data: [] }],
  ["free-form warning", { warnings: [{ code: "source_stale", message: "raw" }] }],
  ["denied access", { access: { allowed: false, capability: "operations.read", reasonCode: "capability_missing" } }]
]) {
  test(`Operations Read Envelope rejects ${label}`, () => {
    assert.throws(
      () => createOperationsReadEnvelope(
        { ...validEnvelopeInput, ...override },
        { nowFn: () => new Date("2026-07-31T00:00:00.000Z") }
      ),
      (error) => error.code === "operations_read_contract_error"
    );
  });
}

test("Operations Read Envelope rejects an invalid generation time", () => {
  assert.throws(
    () => createOperationsReadEnvelope(validEnvelopeInput, {
      nowFn: () => new Date("invalid")
    }),
    (error) => error.code === "operations_read_contract_error"
  );
});
