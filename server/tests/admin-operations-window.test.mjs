import assert from "node:assert/strict";
import test from "node:test";
import {
  parseUtcWindowPair,
  readUtcInstant
} from "../services/platform/admin-operations-window.mjs";

const TO = "2026-10-08T00:00:00.000Z";

function reject(input) {
  assert.throws(() => parseUtcWindowPair(input, (code) => {
    const error = new Error(code);
    error.code = code;
    throw error;
  }), { code: "invalid_query" });
}

test("calendar-invalid UTC instants are null and do not throw", () => {
  const invalid = [
    "2026-13-01T00:00:00.000Z",
    "2026-10-01T25:00:00.000Z",
    "2026-02-30T00:00:00.000Z",
    "2026-02-31T00:00:00.000Z",
    "2026-02-29T00:00:00.000Z",
    "1900-02-29T00:00:00.000Z",
    "2026-04-31T00:00:00.000Z",
    "2026-10-01T00:60:00.000Z",
    "2026-10-01T00:00:60.000Z",
    "2026-10-01T00:00:00Z",
    "2026-10-01",
    1,
    null
  ];
  for (const value of invalid) {
    assert.equal(readUtcInstant(value), null, String(value));
  }
  assert.equal(readUtcInstant("2026-10-01T00:00:00.000Z"), "2026-10-01T00:00:00.000Z");
  assert.equal(readUtcInstant("2024-02-29T23:59:59.999Z"), "2024-02-29T23:59:59.999Z");
  assert.equal(readUtcInstant("2000-02-29T00:00:00.000Z"), "2000-02-29T00:00:00.000Z");
});

test("impossible instants are invalid_query before a caller can open a database", () => {
  let failed = 0;
  const fail = (code) => {
    failed += 1;
    const error = new Error(code);
    error.code = code;
    throw error;
  };
  for (const from of [
    "2026-13-01T00:00:00.000Z",
    "2026-10-01T25:00:00.000Z",
    "2026-02-30T00:00:00.000Z"
  ]) {
    assert.throws(() => parseUtcWindowPair({ from, to: TO }, fail), { code: "invalid_query" });
  }
  assert.equal(failed, 3);
  assert.deepEqual(parseUtcWindowPair({
    from: "2024-02-29T00:00:00.000Z",
    to: "2024-03-01T00:00:00.000Z"
  }, fail), {
    from: "2024-02-29T00:00:00.000Z",
    to: "2024-03-01T00:00:00.000Z"
  });
  reject({ from: "2026-10-01T00:00:00.000Z" });
});
