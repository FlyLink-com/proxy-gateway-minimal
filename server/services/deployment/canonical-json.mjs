import { createHash } from "node:crypto";
import { assertNoDuplicateObjectKeys } from "./strict-json-scan.mjs";

const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
const ARRAY_INCLUDES = Function.call.bind(Array.prototype.includes);
const ARRAY_SOME = Function.call.bind(Array.prototype.some);

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPlainRecord(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyEnumerableDataProperties(value) {
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor)
      && descriptor.enumerable === true
      && Object.hasOwn(descriptor, "value")
      && typeof descriptor.get !== "function"
      && typeof descriptor.set !== "function";
  });
}

function isPlainDenseDataArray(value) {
  if (!Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
      || Reflect.ownKeys(value).length !== value.length + 1) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value")
        || typeof descriptor.get === "function"
        || typeof descriptor.set === "function") {
      return false;
    }
  }
  return Reflect.ownKeys(value).every((key) => key === "length" || /^\d+$/.test(String(key)));
}

function assertContract(contract) {
  if (!isPlainRecord(contract)
      || !Object.isFrozen(contract)
      || !Object.isFrozen(contract.fieldOrder)
      || !Object.isFrozen(contract.nested)
      || !Object.isFrozen(contract.arrays)
      || typeof contract.schemaId !== "string"
      || contract.schemaId.length === 0
      || !Number.isSafeInteger(contract.maxBytes)
      || contract.maxBytes <= 0
      || !Array.isArray(contract.fieldOrder)
      || Object.getPrototypeOf(contract.fieldOrder) !== Array.prototype
      || !isPlainDenseDataArray(contract.fieldOrder)
      || !isPlainRecord(contract.nested)
      || !isPlainRecord(contract.arrays)
      || !hasOnlyEnumerableDataProperties(contract.nested)
      || !hasOnlyEnumerableDataProperties(contract.arrays)
      || typeof contract.validate !== "function") {
    throw new Error("canonical_json_contract_invalid");
  }

  const expectedKeys = ["schemaId", "maxBytes", "fieldOrder", "nested", "arrays", "validate"];
  const keys = Reflect.ownKeys(contract);
  const descriptors = Object.getOwnPropertyDescriptors(contract);
  if (keys.length !== expectedKeys.length
      || ARRAY_SOME(expectedKeys, (field) => !Object.hasOwn(contract, field))
      || ARRAY_SOME(keys, (field) => typeof field !== "string" || !ARRAY_INCLUDES(expectedKeys, field))
      || ARRAY_SOME(expectedKeys, (field) => (
        !descriptors[field]
        || descriptors[field].enumerable !== true
        || !Object.hasOwn(descriptors[field], "value")
        || typeof descriptors[field].get === "function"
        || typeof descriptors[field].set === "function"
      ))) {
    throw new Error("canonical_json_contract_invalid");
  }

  const fields = new Set(contract.fieldOrder);
  if (fields.size !== contract.fieldOrder.length
      || ARRAY_SOME(contract.fieldOrder, (field) => (
        typeof field !== "string" || field.length === 0 || field === "__proto__"
      ))) {
    throw new Error("canonical_json_contract_invalid");
  }
}

function assertExactFields(value, contract) {
  if (!isPlainRecord(value)) throw new Error(`${contract.schemaId}_object_invalid`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== contract.fieldOrder.length
      || !hasOnlyEnumerableDataProperties(value)
      || ARRAY_SOME(contract.fieldOrder, (field) => !Object.hasOwn(value, field))
      || ARRAY_SOME(keys, (field) => typeof field !== "string" || !ARRAY_INCLUDES(contract.fieldOrder, field))) {
    throw new Error(`${contract.schemaId}_fields_invalid`);
  }
}

function assertCanonicalScalar(value, schemaId, field) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0)) return;
  throw new Error(`${schemaId}_${field}_scalar_invalid`);
}

function assertDenseArray(value, contract, field) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${contract.schemaId}_${field}_array_invalid`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new Error(`${contract.schemaId}_${field}_array_sparse`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || typeof descriptor.get === "function" || typeof descriptor.set === "function") {
      throw new Error(`${contract.schemaId}_${field}_array_invalid`);
    }
  }
  if (Reflect.ownKeys(value).length !== value.length + 1
      || !Reflect.ownKeys(value).every((key) => key === "length" || /^\d+$/.test(String(key)))) {
    throw new Error(`${contract.schemaId}_${field}_array_invalid`);
  }
}

function canonicalArrayMap(value, mapper) {
  const canonical = [];
  for (let index = 0; index < value.length; index += 1) {
    canonical[index] = mapper(value[index], index);
  }
  return canonical;
}

function canonicalizePrimitiveArray(value, descriptor, contract, field) {
  const elementTypeDescriptor = isPlainRecord(descriptor)
    ? Object.getOwnPropertyDescriptor(descriptor, "elementType")
    : undefined;
  if (!isPlainRecord(descriptor)
      || !Object.isFrozen(descriptor)
      || Reflect.ownKeys(descriptor).length !== 1
      || !Object.hasOwn(descriptor, "elementType")
      || !elementTypeDescriptor
      || elementTypeDescriptor.enumerable !== true
      || !Object.hasOwn(elementTypeDescriptor, "value")
      || typeof elementTypeDescriptor.get === "function"
      || typeof elementTypeDescriptor.set === "function"
      || !["string", "boolean", "safeInteger", "null"].includes(elementTypeDescriptor.value)) {
    throw new Error(`${contract.schemaId}_${field}_array_contract_invalid`);
  }
  const elementType = elementTypeDescriptor.value;

  assertDenseArray(value, contract, field);
  return canonicalArrayMap(value, (element) => {
    const valid = elementType === "null"
      ? element === null
      : elementType === "safeInteger"
        ? Number.isSafeInteger(element) && !Object.is(element, -0)
        : typeof element === elementType;
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
        ordered[field] = canonicalArrayMap(
          fieldValue,
          (element) => canonicalizeObject(element, elementContract)
        );
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

  deepFreezeCanonical(ordered);
  try {
    contract.validate(ordered);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("canonical_json_contract_mutation", { cause: error });
    }
    throw error;
  }
  const bytes = Buffer.from(JSON.stringify(ordered), "utf8");
  if (bytes.length > contract.maxBytes) throw new Error(`${contract.schemaId}_too_large`);
  return ordered;
}

function deepFreezeCanonical(value) {
  if (Array.isArray(value)) {
    for (const element of value) deepFreezeCanonical(element);
    return Object.freeze(value);
  }
  if (isPlainRecord(value)) {
    for (const field of Object.keys(value)) deepFreezeCanonical(value[field]);
    return Object.freeze(value);
  }
  return value;
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
  const canonicalValue = canonicalizeObject(value, contract);
  const canonical = Buffer.from(JSON.stringify(canonicalValue), "utf8");
  if (!Buffer.prototype.equals.call(bytes, canonical)) {
    throw new Error("canonical_json_bytes_mismatch");
  }
  return canonicalValue;
}
