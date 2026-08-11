import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const CANONICAL_URL = new URL("../services/deployment/canonical-json.mjs", import.meta.url);
const SCANNER_URL = new URL("../services/deployment/strict-json-scan.mjs", import.meta.url);
const canonicalSource = readFileSync(CANONICAL_URL, "utf8").replace(/\r\n/g, "\n");
const scannerSource = readFileSync(SCANNER_URL, "utf8").replace(/\r\n/g, "\n");
assert.equal(
  createHash("sha256").update(canonicalSource).digest("hex"),
  "a6183ec26b92debd486ee1ce43532f37f62acf77cef68a2917a5188635f0fb23"
);
assert.equal(
  createHash("sha256").update(scannerSource).digest("hex"),
  "c3ed625964b61ff43dc91ad688e04c4459220aa4094c2b6e3d76795decf9d010"
);
const canonicalJson = await import(CANONICAL_URL.href);
const strictJsonScan = await import(SCANNER_URL.href);
const {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} = canonicalJson;

test("canonical JSON module namespace is exactly the three bootstrap exports", () => {
  assert.deepEqual(Object.keys(canonicalJson).sort(), [
    "parseCanonicalJsonBytes",
    "serializeCanonicalJsonBytes",
    "sha256Hex"
  ]);
  assert.deepEqual(Object.keys(strictJsonScan), ["assertNoDuplicateObjectKeys"]);
  const source = readFileSync(
    new URL("../services/deployment/canonical-json.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /INLINE_RUNTIME|createCanonicalJsonInlineRuntimeFixture/);
  assert.equal(
    sha256Hex(Buffer.from("abc", "utf8")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

const METADATA_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-metadata-v1",
  maxBytes: 128,
  fieldOrder: Object.freeze(["owner", "enabled"]),
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
  fieldOrder: Object.freeze(["checkId", "metadata", "tags"]),
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
  fieldOrder: Object.freeze(["name", "generation"]),
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
  fieldOrder: Object.freeze(["schemaVersion", "logicalId", "count", "profile", "checks", "labels"]),
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
  const parsed = parseCanonicalJsonBytes(canonical, CONTRACT);
  assert.deepEqual(parsed, validValue());
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.profile), true);
  assert.equal(Object.isFrozen(parsed.checks), true);
  assert.equal(Object.isFrozen(parsed.checks[0]), true);
  assert.equal(Object.isFrozen(parsed.labels), true);
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

test("contracts are exact, recursively frozen data-only descriptors", () => {
  const unfrozen = {
    ...CONTRACT,
    fieldOrder: [...CONTRACT.fieldOrder]
  };
  assert.throws(
    () => serializeCanonicalJsonBytes(validValue(), unfrozen),
    /canonical_json_contract_invalid/
  );
  const withExtra = Object.freeze({ ...CONTRACT, authority: true });
  assert.throws(
    () => serializeCanonicalJsonBytes(validValue(), withExtra),
    /canonical_json_contract_invalid/
  );
  const accessor = {};
  Object.defineProperties(accessor, {
    schemaId: { enumerable: true, get: () => CONTRACT.schemaId },
    maxBytes: { enumerable: true, value: CONTRACT.maxBytes },
    fieldOrder: { enumerable: true, value: CONTRACT.fieldOrder },
    nested: { enumerable: true, value: CONTRACT.nested },
    arrays: { enumerable: true, value: CONTRACT.arrays },
    validate: { enumerable: true, value: CONTRACT.validate }
  });
  Object.freeze(accessor);
  assert.throws(
    () => serializeCanonicalJsonBytes(validValue(), accessor),
    /canonical_json_contract_invalid/
  );
  const prototypeFieldContract = Object.freeze({
    schemaId: "foundation-prototype-field-v1",
    maxBytes: 128,
    fieldOrder: Object.freeze(["__proto__"]),
    nested: Object.freeze({}),
    arrays: Object.freeze({}),
    validate() {}
  });
  const prototypeFieldValue = {};
  Object.defineProperty(prototypeFieldValue, "__proto__", {
    enumerable: true,
    value: "forbidden"
  });
  assert.throws(
    () => serializeCanonicalJsonBytes(prototypeFieldValue, prototypeFieldContract),
    /canonical_json_contract_invalid/
  );
  let elementTypeReads = 0;
  const statefulArrayDescriptor = {};
  Object.defineProperty(statefulArrayDescriptor, "elementType", {
    enumerable: true,
    get() {
      elementTypeReads += 1;
      return elementTypeReads === 1 ? "string" : "number";
    }
  });
  Object.freeze(statefulArrayDescriptor);
  const statefulArrayContract = Object.freeze({
    ...CONTRACT,
    arrays: Object.freeze({ ...CONTRACT.arrays, labels: statefulArrayDescriptor })
  });
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...validValue(), labels: [1.5] }, statefulArrayContract),
    /foundation-fixture-v1_labels_array_contract_invalid/
  );
  let fieldReads = 0;
  const statefulFieldOrder = ["count"];
  Object.defineProperty(statefulFieldOrder, "0", {
    enumerable: true,
    get() {
      fieldReads += 1;
      return fieldReads === 1 ? "count" : "__proto__";
    }
  });
  Object.freeze(statefulFieldOrder);
  const statefulFieldContract = Object.freeze({
    schemaId: "foundation-stateful-field-v1",
    maxBytes: 128,
    fieldOrder: statefulFieldOrder,
    nested: Object.freeze({}),
    arrays: Object.freeze({}),
    validate() {}
  });
  assert.throws(
    () => serializeCanonicalJsonBytes({ count: 1 }, statefulFieldContract),
    /canonical_json_contract_invalid/
  );
});

test("contract validators cannot mutate the structurally checked canonical value", () => {
  const scalarMutation = Object.freeze({
    schemaId: "foundation-mutating-scalar-v1",
    maxBytes: 128,
    fieldOrder: Object.freeze(["count"]),
    nested: Object.freeze({}),
    arrays: Object.freeze({}),
    validate(value) {
      value.count = 1.5;
    }
  });
  const fieldMutation = Object.freeze({
    ...scalarMutation,
    schemaId: "foundation-mutating-field-v1",
    validate(value) {
      value.extra = true;
    }
  });
  assert.throws(
    () => serializeCanonicalJsonBytes({ count: 1 }, scalarMutation),
    /canonical_json_contract_mutation/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ count: 1 }, fieldMutation),
    /canonical_json_contract_mutation/
  );
});

test("instance method shadowing cannot bypass byte or array validation", () => {
  const canonical = serializeCanonicalJsonBytes(validValue(), CONTRACT);
  const noncanonical = Buffer.from(
    canonical.toString("utf8").replace(
      '{"schemaVersion":"1","logicalId":"alpha"',
      '{"logicalId":"alpha","schemaVersion":"1"'
    ),
    "utf8"
  );
  Object.defineProperty(noncanonical, "equals", {
    value: () => true,
    enumerable: false
  });
  assert.throws(
    () => parseCanonicalJsonBytes(noncanonical, CONTRACT),
    /canonical_json_bytes_mismatch/
  );

  const labels = ["stable"];
  Object.defineProperty(labels, "map", {
    value: () => [1.5],
    enumerable: false
  });
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...validValue(), labels }, CONTRACT),
    /foundation-fixture-v1_labels_array_invalid/
  );

  const checks = [null];
  Object.defineProperty(checks, "map", {
    value: () => [validValue().checks[0]],
    enumerable: false
  });
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...validValue(), checks }, CONTRACT),
    /foundation-fixture-v1_checks_array_invalid/
  );

  class SpeciesArray extends Array {
    static get [Symbol.species]() {
      return class PoisonedResult extends Array {
        toJSON() { return [1.5]; }
      };
    }
  }
  const subclassLabels = new SpeciesArray("stable");
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...validValue(), labels: subclassLabels }, CONTRACT),
    /foundation-fixture-v1_labels_array_invalid/
  );
});
