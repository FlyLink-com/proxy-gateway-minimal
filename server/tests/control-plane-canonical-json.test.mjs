import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../services/deployment/canonical-json.mjs";

const METADATA_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-metadata-v1",
  maxBytes: 128,
  fieldOrder: ["owner", "enabled"],
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    assert.match(value.owner, /^[a-z]{1,16}$/);
    assert.equal(typeof value.enabled, "boolean");
  }
});

const CHECK_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-check-v1",
  maxBytes: 256,
  fieldOrder: ["checkId", "metadata", "tags"],
  nested: Object.freeze({ metadata: METADATA_CONTRACT }),
  arrays: Object.freeze({
    tags: Object.freeze({ elementType: "string" })
  }),
  validate(value) {
    assert.match(value.checkId, /^[a-z0-9-]{1,16}$/);
    if (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")) {
      assert.equal(value.tags.every((tag) => /^[a-z]{1,12}$/.test(tag)), true);
    }
  }
});

const PROFILE_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-profile-v1",
  maxBytes: 128,
  fieldOrder: ["name", "generation"],
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    assert.match(value.name, /^[a-z]{1,16}$/);
    assert.ok(Number.isSafeInteger(value.generation) && value.generation >= 0);
  }
});

const CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-v1",
  maxBytes: 2048,
  fieldOrder: ["schemaVersion", "logicalId", "count", "profile", "checks", "labels"],
  nested: Object.freeze({
    profile: PROFILE_CONTRACT,
    "check-v1": CHECK_CONTRACT
  }),
  arrays: Object.freeze({
    checks: "check-v1",
    labels: Object.freeze({ elementType: "string" })
  }),
  validate(value) {
    assert.equal(value.schemaVersion, "1");
    assert.match(value.logicalId, /^[a-z0-9-]{1,16}$/);
    assert.ok(Number.isSafeInteger(value.count) && value.count >= 0);
    if (Array.isArray(value.labels) && value.labels.every((label) => typeof label === "string")) {
      assert.equal(value.labels.every((label) => /^[a-z]{1,12}$/.test(label)), true);
    }
  }
});

function validValue() {
  return {
    schemaVersion: "1",
    logicalId: "alpha",
    count: 1,
    profile: { name: "linux", generation: 7 },
    checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true }, tags: ["native"] }],
    labels: ["stable"]
  };
}

test("rejects duplicate decoded object keys before JSON.parse can erase them", () => {
  assert.throws(
    () => parseCanonicalJsonBytes(
      Buffer.from('{"schemaVersion":"1","logicalId":"a","logica\\u006cId":"b","count":1,"profile":{"name":"linux","generation":7},"checks":[],"labels":[]}'),
      CONTRACT
    ),
    /canonical_json_duplicate_key/
  );
});

test("serializes the frozen field order without a BOM or trailing newline", () => {
  const bytes = serializeCanonicalJsonBytes(
    {
      labels: ["stable"],
      checks: [{ tags: ["native"], metadata: { enabled: true, owner: "ops" }, checkId: "build" }],
      profile: { generation: 7, name: "linux" },
      count: 1,
      logicalId: "alpha",
      schemaVersion: "1"
    },
    CONTRACT
  );

  assert.equal(bytes.toString("utf8"), '{"schemaVersion":"1","logicalId":"alpha","count":1,"profile":{"name":"linux","generation":7},"checks":[{"checkId":"build","metadata":{"owner":"ops","enabled":true},"tags":["native"]}],"labels":["stable"]}');
  assert.equal(bytes.includes(0x0a), false);
  assert.match(sha256Hex(bytes), /^[0-9a-f]{64}$/);
});

test("deep object key permutations produce the same exact bytes", () => {
  const first = serializeCanonicalJsonBytes(validValue(), CONTRACT);
  const permuted = serializeCanonicalJsonBytes({
    labels: ["stable"],
    checks: [{ tags: ["native"], metadata: { enabled: true, owner: "ops" }, checkId: "build" }],
    profile: { generation: 7, name: "linux" },
    count: 1,
    logicalId: "alpha",
    schemaVersion: "1"
  }, CONTRACT);
  assert.deepEqual(first, permuted);

  const semanticallyDifferent = serializeCanonicalJsonBytes({
    ...validValue(),
    checks: [{ checkId: "build", metadata: { owner: "release", enabled: true }, tags: ["native"] }]
  }, CONTRACT);
  assert.notDeepEqual(first, semanticallyDifferent);
});

test("accepts only the exact canonical bytes", () => {
  const canonical = serializeCanonicalJsonBytes(validValue(), CONTRACT);
  assert.deepEqual(parseCanonicalJsonBytes(canonical, CONTRACT), validValue());
  assert.throws(
    () => parseCanonicalJsonBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonical]), CONTRACT),
    /canonical_json_bom_forbidden/
  );
  assert.throws(
    () => parseCanonicalJsonBytes(Buffer.from(`${canonical.toString("utf8")}\n`), CONTRACT), /canonical_json_bytes_mismatch/);
  assert.throws(
    () => parseCanonicalJsonBytes(Buffer.from('{"logicalId":"alpha","schemaVersion":"1","count":1,"profile":{"name":"linux","generation":7},"checks":[{"checkId":"build","metadata":{"owner":"ops","enabled":true},"tags":["native"]}],"labels":["stable"]}'), CONTRACT), /canonical_json_bytes_mismatch/);
  assert.throws(
    () => parseCanonicalJsonBytes(Buffer.from([0xc3, 0x28]), CONTRACT), /canonical_json_utf8_invalid/);
  assert.throws(
    () => parseCanonicalJsonBytes(Buffer.from('{"schemaVersion":"1"} trailing'), CONTRACT), /canonical_json_syntax_invalid/);
});

test("rejects deep missing and unknown fields plus undeclared structured values", () => {
  const valid = validValue();
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, profile: { name: "linux" } }, CONTRACT),
    /foundation-fixture-profile-v1_fields_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({
      ...valid,
      checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true, extra: false }, tags: ["native"] }]
    }, CONTRACT),
    /foundation-fixture-metadata-v1_fields_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, rootExtra: true }, CONTRACT),
    /foundation-fixture-v1_fields_invalid/
  );
  const undeclaredChecks = Object.freeze({
    ...CONTRACT,
    arrays: Object.freeze({ labels: Object.freeze({ elementType: "string" }) })
  });
  assert.throws(
    () => serializeCanonicalJsonBytes(valid, undeclaredChecks),
    /foundation-fixture-v1_checks_structured_contract_missing/
  );
});

test("rejects dense-array, nested-contract, scalar, and byte-limit violations", () => {
  const valid = validValue();
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, checks: [null] }, CONTRACT),
    /foundation-fixture-check-v1_object_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, labels: [1] }, CONTRACT),
    /foundation-fixture-v1_labels_array_element_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({
      ...valid,
      checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true }, tags: [1] }]
    }, CONTRACT),
    /foundation-fixture-check-v1_tags_array_element_invalid/
  );
  const sparseChecks = new Array(1);
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, checks: sparseChecks }, CONTRACT),
    /foundation-fixture-v1_checks_array_sparse/
  );
  const missingChildContract = Object.freeze({
    ...CONTRACT,
    nested: Object.freeze({ profile: PROFILE_CONTRACT })
  });
  assert.throws(
    () => serializeCanonicalJsonBytes(valid, missingChildContract),
    /foundation-fixture-v1_checks_array_contract_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, count: Number.MAX_SAFE_INTEGER + 1 }, CONTRACT),
    /foundation-fixture-v1_count_scalar_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, count: -0 }, CONTRACT),
    /foundation-fixture-v1_count_scalar_invalid/
  );
  const tooSmall = Object.freeze({ ...CONTRACT, maxBytes: 8 });
  assert.throws(() => serializeCanonicalJsonBytes(valid, tooSmall), /foundation-fixture-v1_too_large/);
});
