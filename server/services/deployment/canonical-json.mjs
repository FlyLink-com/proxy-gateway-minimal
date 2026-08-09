import { createHash } from "node:crypto";
import { assertNoDuplicateObjectKeys } from "./strict-json-scan.mjs";

const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPlainRecord(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertContract(contract) {
  if (!isPlainRecord(contract)
      || typeof contract.schemaId !== "string"
      || contract.schemaId.length === 0
      || !Number.isSafeInteger(contract.maxBytes)
      || contract.maxBytes <= 0
      || !Array.isArray(contract.fieldOrder)
      || !isPlainRecord(contract.nested)
      || !isPlainRecord(contract.arrays)
      || typeof contract.validate !== "function") {
    throw new Error("canonical_json_contract_invalid");
  }

  const fields = new Set(contract.fieldOrder);
  if (fields.size !== contract.fieldOrder.length
      || contract.fieldOrder.some((field) => typeof field !== "string" || field.length === 0)) {
    throw new Error("canonical_json_contract_invalid");
  }
}

function assertExactFields(value, contract) {
  if (!isPlainRecord(value)) throw new Error(`${contract.schemaId}_object_invalid`);
  const keys = Object.keys(value);
  if (keys.length !== contract.fieldOrder.length
      || contract.fieldOrder.some((field) => !Object.hasOwn(value, field))
      || keys.some((field) => !contract.fieldOrder.includes(field))) {
    throw new Error(`${contract.schemaId}_fields_invalid`);
  }
}

function assertCanonicalScalar(value, schemaId, field) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0)) return;
  throw new Error(`${schemaId}_${field}_scalar_invalid`);
}

function assertDenseArray(value, contract, field) {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new Error(`${contract.schemaId}_${field}_array_sparse`);
    }
  }
}

function canonicalizePrimitiveArray(value, descriptor, contract, field) {
  if (!isPlainRecord(descriptor)
      || !Object.isFrozen(descriptor)
      || Object.keys(descriptor).length !== 1
      || !Object.hasOwn(descriptor, "elementType")
      || !["string", "boolean", "safeInteger", "null"].includes(descriptor.elementType)) {
    throw new Error(`${contract.schemaId}_${field}_array_contract_invalid`);
  }

  assertDenseArray(value, contract, field);
  return value.map((element) => {
    const valid = descriptor.elementType === "null"
      ? element === null
      : descriptor.elementType === "safeInteger"
        ? Number.isSafeInteger(element) && !Object.is(element, -0)
        : typeof element === descriptor.elementType;
    if (!valid) throw new Error(`${contract.schemaId}_${field}_array_element_invalid`);
    return element;
  });
}

function canonicalizeObject(value, contract) {
  assertContract(contract);
  assertExactFields(value, contract);

  const ordered = {};
  for (const field of contract.fieldOrder) {
    const fieldValue = value[field];
    if (Object.hasOwn(contract.arrays, field)) {
      if (!Array.isArray(fieldValue)) throw new Error(`${contract.schemaId}_${field}_array_invalid`);
      assertDenseArray(fieldValue, contract, field);
      const descriptor = contract.arrays[field];
      if (typeof descriptor === "string") {
        const elementContract = contract.nested[descriptor];
        if (!elementContract) throw new Error(`${contract.schemaId}_${field}_array_contract_invalid`);
        ordered[field] = fieldValue.map((element) => canonicalizeObject(element, elementContract));
      } else {
        ordered[field] = canonicalizePrimitiveArray(fieldValue, descriptor, contract, field);
      }
      continue;
    }
    if (Object.hasOwn(contract.nested, field)) {
      ordered[field] = canonicalizeObject(fieldValue, contract.nested[field]);
      continue;
    }
    if (Array.isArray(fieldValue) || isPlainRecord(fieldValue)) {
      throw new Error(`${contract.schemaId}_${field}_structured_contract_missing`);
    }
    assertCanonicalScalar(fieldValue, contract.schemaId, field);
    ordered[field] = fieldValue;
  }

  contract.validate(ordered);
  const bytes = Buffer.from(JSON.stringify(ordered), "utf8");
  if (bytes.length > contract.maxBytes) throw new Error(`${contract.schemaId}_too_large`);
  return ordered;
}

export function serializeCanonicalJsonBytes(value, contract) {
  const ordered = canonicalizeObject(value, contract);
  return Buffer.from(JSON.stringify(ordered), "utf8");
}

function assertUtf8(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("canonical_json_bom_forbidden");
  }
  try {
    return DECODER.decode(bytes);
  } catch {
    throw new Error("canonical_json_utf8_invalid");
  }
}

export function parseCanonicalJsonBytes(bytes, contract) {
  assertContract(contract);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > contract.maxBytes) {
    throw new Error(`${contract.schemaId}_bytes_invalid`);
  }

  const text = assertUtf8(bytes);
  assertNoDuplicateObjectKeys(text);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("canonical_json_syntax_invalid");
  }
  const canonical = serializeCanonicalJsonBytes(value, contract);
  if (!bytes.equals(canonical)) throw new Error("canonical_json_bytes_mismatch");
  return value;
}
