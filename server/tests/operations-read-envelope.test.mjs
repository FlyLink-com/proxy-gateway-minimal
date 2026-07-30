import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperationsReadEnvelope
} from "../services/platform/operations-read-envelope.mjs";

import {
  projectOperationsOverviewReadModel
} from "../services/platform/operations-overview-read-model.mjs";

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

test("Operations Read Envelope normalizes a code-spoofed caller error", () => {
  assert.throws(
    () => createOperationsReadEnvelope(validEnvelopeInput, {
      nowFn: () => {
        throw Object.assign(new Error("secret caller detail"), {
          code: "operations_read_contract_error"
        });
      }
    }),
    (error) => {
      assert.equal(error.code, "operations_read_contract_error");
      assert.equal(error.message, "Operations read contract is invalid");
      return true;
    }
  );
});

test("Operations Read Envelope deep-copies safe nested data values", () => {
  const sourceData = {
    summary: {
      totals: [12, { active: 8 }]
    }
  };
  const envelope = createOperationsReadEnvelope({
    ...validEnvelopeInput,
    data: sourceData
  }, {
    nowFn: () => new Date("2026-07-31T00:00:00.000Z")
  });

  assert.notEqual(envelope.data, sourceData);
  assert.notEqual(envelope.data.summary, sourceData.summary);
  assert.notEqual(envelope.data.summary.totals, sourceData.summary.totals);
  assert.notEqual(envelope.data.summary.totals[1], sourceData.summary.totals[1]);
  envelope.data.summary.totals[1].active = 99;
  assert.equal(sourceData.summary.totals[1].active, 8);
});

for (const [label, input, options] of [
  ["a coercible schema object", {
    ...validEnvelopeInput,
    schemaVersion: { toString: () => "operations-overview-read-envelope/v1" }
  }, {}],
  ["a coercible freshness object", {
    ...validEnvelopeInput,
    freshness: { toString: () => "fresh" }
  }, {}],
  ["a coercible source-state object", {
    ...validEnvelopeInput,
    sourceState: { toString: () => "implemented_source" }
  }, {}],
  ["an explicitly empty nowFn", validEnvelopeInput, { nowFn: "" }]
]) {
  test(`Operations Read Envelope rejects ${label}`, () => {
    assert.throws(
      () => createOperationsReadEnvelope(input, options),
      (error) => error.code === "operations_read_contract_error"
    );
  });
}


test("Operations Read Envelope generates canonical time from trusted Date internals", () => {
  const now = new Date("2026-07-31T00:00:00.000Z");
  now.toISOString = () => "caller-controlled";

  const envelope = createOperationsReadEnvelope(validEnvelopeInput, {
    nowFn: () => now
  });

  assert.equal(envelope.generatedAt, "2026-07-31T00:00:00.000Z");
});

test("Operations Read Envelope rejects an invalid Date with overridden methods", () => {
  const now = new Date("invalid");
  now.getTime = () => 0;
  now.toISOString = () => "caller-controlled";

  assert.throws(
    () => createOperationsReadEnvelope(validEnvelopeInput, {
      nowFn: () => now
    }),
    (error) => error.code === "operations_read_contract_error"
  );
});

test("Operations Read Envelope snapshots warning and access getters once", () => {
  let warningReads = 0;
  const warning = {};
  Object.defineProperty(warning, "code", {
    enumerable: true,
    get() {
      warningReads += 1;
      return warningReads === 1 ? "source_stale" : "caller-controlled";
    }
  });

  let capabilityReads = 0;
  const access = {
    allowed: true,
    reasonCode: "allowed"
  };
  Object.defineProperty(access, "capability", {
    enumerable: true,
    get() {
      capabilityReads += 1;
      return capabilityReads === 1 ? "operations.read" : "caller-controlled";
    }
  });

  const envelope = createOperationsReadEnvelope({
    ...validEnvelopeInput,
    warnings: [warning],
    access
  }, {
    nowFn: () => new Date("2026-07-31T00:00:00.000Z")
  });

  assert.deepEqual(envelope.warnings, [{ code: "source_stale" }]);
  assert.deepEqual(envelope.access, {
    allowed: true,
    capability: "operations.read",
    reasonCode: "allowed"
  });
  assert.equal(warningReads, 1);
  assert.equal(capabilityReads, 1);
});


test("Operations Read Envelope clones nested arrays without caller map dispatch", () => {
  const owned = { active: 8 };
  const nested = [owned];
  nested.map = () => owned;

  const envelope = createOperationsReadEnvelope({
    ...validEnvelopeInput,
    data: { nested }
  }, {
    nowFn: () => new Date("2026-07-31T00:00:00.000Z")
  });

  assert.deepEqual(envelope.data, { nested: [{ active: 8 }] });
  assert.notEqual(envelope.data.nested, nested);
  assert.notEqual(envelope.data.nested[0], owned);
});

test("Operations Read Envelope validates warnings without caller map dispatch", () => {
  const warnings = [{ code: "source_stale" }];
  warnings.map = () => [{ code: "caller-controlled", message: "raw" }];

  const envelope = createOperationsReadEnvelope({
    ...validEnvelopeInput,
    warnings
  }, {
    nowFn: () => new Date("2026-07-31T00:00:00.000Z")
  });

  assert.deepEqual(envelope.warnings, [{ code: "source_stale" }]);
});

test("Operations Read Envelope rejects sparse warnings", () => {
  assert.throws(
    () => createOperationsReadEnvelope({
      ...validEnvelopeInput,
      warnings: new Array(1)
    }),
    (error) => error.code === "operations_read_contract_error"
  );
});

test("Operations Read Envelope requires warning's sole own key to be code", () => {
  const warning = { message: "not allowed" };
  Object.defineProperty(warning, "code", {
    value: "source_stale",
    enumerable: false
  });

  assert.throws(
    () => createOperationsReadEnvelope({
      ...validEnvelopeInput,
      warnings: [warning]
    }),
    (error) => error.code === "operations_read_contract_error"
  );
});


test("Operations Overview Projector returns only allowlisted counts", () => {
  const source = {
    ok: true,
    total: 12,
    active: 8,
    expiring: 2,
    disabledOrExpired: 2,
    nodes: [{ name: "node-secret" }],
    distribution: { "credential-secret": 1 },
    token: "must-not-cross"
  };

  const projected = projectOperationsOverviewReadModel(source);

  assert.deepEqual(projected, {
    total: 12,
    active: 8,
    expiring: 2,
    disabledOrExpired: 2
  });
  assert.notEqual(projected, source);
  assert.doesNotMatch(JSON.stringify(projected), /node-secret|credential-secret|must-not-cross/);
});


function assertOperationsReadContractError(run) {
  assert.throws(run, (error) => {
    assert.equal(error.code, "operations_read_contract_error");
    assert.equal(error.message, "Operations read contract is invalid");
    return true;
  });
}

for (const [label, field, value] of [
  ["missing", "total", undefined],
  ["negative", "active", -1],
  ["fractional", "expiring", 1.5],
  ["string", "disabledOrExpired", "2"],
  ["null", "total", null]
]) {
  test(`Operations Overview Projector rejects a ${label} ${field} count`, () => {
    const source = {
      total: 0,
      active: 0,
      expiring: 0,
      disabledOrExpired: 0,
      [field]: value
    };
    assertOperationsReadContractError(
      () => projectOperationsOverviewReadModel(source)
    );
  });
}

test("Operations Overview Projector snapshots count getters once", () => {
  const source = {};
  const reads = {};
  for (const [field, value] of [
    ["total", 12],
    ["active", 8],
    ["expiring", 2],
    ["disabledOrExpired", 2]
  ]) {
    reads[field] = 0;
    Object.defineProperty(source, field, {
      enumerable: true,
      get() {
        reads[field] += 1;
        return reads[field] === 1 ? value : "caller-controlled";
      }
    });
  }

  assert.deepEqual(projectOperationsOverviewReadModel(source), {
    total: 12,
    active: 8,
    expiring: 2,
    disabledOrExpired: 2
  });
  assert.deepEqual(reads, {
    total: 1,
    active: 1,
    expiring: 1,
    disabledOrExpired: 1
  });
});

test("Operations Overview Projector normalizes caller failures without detail", () => {
  const source = {
    active: 8,
    expiring: 2,
    disabledOrExpired: 2
  };
  Object.defineProperty(source, "total", {
    enumerable: true,
    get() {
      throw new Error("owner-secret-must-not-cross");
    }
  });

  assertOperationsReadContractError(
    () => projectOperationsOverviewReadModel(source)
  );
});

for (const [label, input] of [
  ["null", null],
  ["an array", []],
  ["a null-prototype object", Object.create(null)],
  ["a custom-prototype object", Object.create({})]
]) {
  test(`Operations Overview Projector rejects ${label}`, () => {
    assertOperationsReadContractError(
      () => projectOperationsOverviewReadModel(input)
    );
  });
}


test("Operations Overview Projector keeps validated snapshots as own properties under inherited setters", () => {
  const originalTotalDescriptor = Object.getOwnPropertyDescriptor(
    Object.prototype,
    "total"
  );
  const source = {
    active: 8,
    expiring: 2,
    disabledOrExpired: 2
  };
  Object.defineProperty(source, "total", {
    enumerable: true,
    get() {
      Object.defineProperty(Object.prototype, "total", {
        configurable: true,
        set() {}
      });
      return 12;
    }
  });

  try {
    const projected = projectOperationsOverviewReadModel(source);
    assert.deepEqual(projected, {
      total: 12,
      active: 8,
      expiring: 2,
      disabledOrExpired: 2
    });
    for (const field of [
      "total",
      "active",
      "expiring",
      "disabledOrExpired"
    ]) {
      assert.equal(Object.hasOwn(projected, field), true);
    }
  } finally {
    if (originalTotalDescriptor) {
      Object.defineProperty(
        Object.prototype,
        "total",
        originalTotalDescriptor
      );
    } else {
      delete Object.prototype.total;
    }
  }
});
