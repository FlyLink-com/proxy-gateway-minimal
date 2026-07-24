import { types as utilTypes } from "node:util";

const MODULE_PATH_RE =
  /^server\/services\/platform\/[a-z0-9]+(?:-[a-z0-9]+)*\.mjs$/u;
const RELATIVE_STATIC_SPECIFIER_RE =
  /^\.\/[a-z0-9]+(?:-[a-z0-9]+)*\.mjs$/u;
const STATIC_MODULE_DECLARATION_RE =
  /^(?:[ \t]*import[ \t]+(?:[^;]*?[ \t]+from[ \t]+)?|[ \t]*export[ \t]+(?:\*|\{[^;]*\})[ \t]+from[ \t]+)["']([^"'\r\n]+)["'][ \t]*;[ \t]*$/gmu;
const INVALID_DECLARATION_RESIDUE = Object.freeze([
  /\bimport\b/u,
  /\brequire\b/u,
  /\bcreateRequire\b/u,
  /\bexport\b(?:(?!;)[\s\S])*?\bfrom\b/u,
]);
const FORBIDDEN_SOURCE_SEAMS = Object.freeze([
  /\bprocess\b/iu,
  /\bfetch\b/iu,
  /\bXMLHttpRequest\b/iu,
  /\baxios\b/iu,
  /\bundici\b/iu,
  /\breadFile\b/iu,
  /\breadFileSync\b/iu,
  /\bcreateReadStream\b/iu,
  /\bdotenv\b/iu,
  /\bStore\b/iu,
  /\bSQLite\b/iu,
  /\bwallet\b/iu,
  /\bPortal\b/iu,
  /\bAdmin\b/iu,
  /\broute\b/iu,
  /\brouter\b/iu,
  /\blistener\b/iu,
  /\bserver\b/iu,
]);
const ALLOWED_NODE_SPECIFIERS = new Set([
  "node:crypto",
  "node:net",
  "node:util",
]);
const FORBIDDEN_SIBLING_SEGMENT_RE =
  /(?:^|-)(?:store|sqlite|wallet|portal|admin|route|router|listener|server|credential|environment|env|file)(?:-|$)/iu;
const SAFE_SENTINEL = "<invalid>";

function isModulePath(value) {
  return typeof value === "string" && MODULE_PATH_RE.test(value);
}

function boundaryError(rule, modulePath, validated = false) {
  const safePath = validated && isModulePath(modulePath)
    ? modulePath
    : SAFE_SENTINEL;
  return new Error(`payment_provider_source_boundary:${rule}:${safePath}`);
}

function assertModulePath(modulePath) {
  if (!isModulePath(modulePath)) {
    throw boundaryError("invalid_module_path", SAFE_SENTINEL);
  }
  return modulePath;
}

function snapshotExactObject(value, expectedKeys) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length
    || keys.some((key) => typeof key !== "string")
    || expectedKeys.some((key) => !Object.hasOwn(descriptors, key))
  ) {
    return null;
  }
  const snapshot = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      return null;
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function snapshotDenseArray(value) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
  ) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const lengthDescriptor = descriptors.length;
  if (
    keys.some((key) => typeof key !== "string")
    || !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, "value")
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || keys.length !== lengthDescriptor.value + 1
  ) {
    return null;
  }
  const result = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      return null;
    }
    result.push(descriptor.value);
  }
  return result;
}

function maskRanges(source, ranges) {
  const characters = source.split("");
  for (const [start, end] of ranges) {
    for (let index = start; index < end; index += 1) {
      if (characters[index] !== "\n" && characters[index] !== "\r") {
        characters[index] = " ";
      }
    }
  }
  return characters.join("");
}

function parseStaticModuleDeclarations(source, modulePath) {
  assertModulePath(modulePath);
  if (typeof source !== "string") {
    throw boundaryError("invalid_module_declaration", modulePath, true);
  }

  STATIC_MODULE_DECLARATION_RE.lastIndex = 0;
  const specifiers = [];
  const ranges = [];
  let match;
  while ((match = STATIC_MODULE_DECLARATION_RE.exec(source)) !== null) {
    specifiers.push(match[1]);
    ranges.push([match.index, STATIC_MODULE_DECLARATION_RE.lastIndex]);
  }
  const maskedSource = maskRanges(source, ranges);
  if (INVALID_DECLARATION_RESIDUE.some((pattern) => pattern.test(maskedSource))) {
    throw boundaryError("invalid_module_declaration", modulePath, true);
  }
  return {
    maskedSource,
    specifiers: Object.freeze(specifiers.sort()),
  };
}

function resolveSiblingModulePath(modulePath, specifier) {
  const fileName = specifier.slice(2);
  const stem = fileName.slice(0, -4);
  if (FORBIDDEN_SIBLING_SEGMENT_RE.test(stem)) {
    throw boundaryError("forbidden_module_specifier", modulePath, true);
  }
  const separatorIndex = modulePath.lastIndexOf("/");
  const resolvedPath = `${modulePath.slice(0, separatorIndex + 1)}${fileName}`;
  if (
    !isModulePath(resolvedPath)
    || !resolvedPath.startsWith("server/services/platform/")
  ) {
    throw boundaryError("graph_escape", modulePath, true);
  }
  return resolvedPath;
}

function assertAllowedSpecifier(modulePath, specifier) {
  if (ALLOWED_NODE_SPECIFIERS.has(specifier)) return null;
  if (!RELATIVE_STATIC_SPECIFIER_RE.test(specifier)) {
    throw boundaryError("forbidden_module_specifier", modulePath, true);
  }
  return resolveSiblingModulePath(modulePath, specifier);
}

export function extractStaticModuleSpecifiers(source, modulePath) {
  return parseStaticModuleDeclarations(source, modulePath).specifiers;
}

export function assertProviderModuleSourceBoundary(input) {
  const snapshot = snapshotExactObject(input, ["modulePath", "source"]);
  if (snapshot === null) {
    throw boundaryError("invalid_module_declaration", SAFE_SENTINEL);
  }
  const modulePath = assertModulePath(snapshot.modulePath);
  const parsed = parseStaticModuleDeclarations(snapshot.source, modulePath);
  for (const specifier of parsed.specifiers) {
    assertAllowedSpecifier(modulePath, specifier);
  }
  if (FORBIDDEN_SOURCE_SEAMS.some((pattern) => pattern.test(parsed.maskedSource))) {
    throw boundaryError("forbidden_source_seam", modulePath, true);
  }
  return parsed.specifiers;
}

export async function collectProviderModuleGraph(input) {
  const snapshot = snapshotExactObject(input, ["rootModulePaths", "readSource"]);
  if (snapshot === null) {
    throw boundaryError("invalid_module_path", SAFE_SENTINEL);
  }
  const roots = snapshotDenseArray(snapshot.rootModulePaths);
  if (roots === null) {
    throw boundaryError("invalid_module_path", SAFE_SENTINEL);
  }
  for (const root of roots) assertModulePath(root);
  if (
    typeof snapshot.readSource !== "function"
    || utilTypes.isProxy(snapshot.readSource)
  ) {
    throw boundaryError("graph_read_failed", SAFE_SENTINEL);
  }

  const pending = [...new Set(roots)].sort();
  const visited = new Set();
  while (pending.length > 0) {
    const modulePath = pending.shift();
    if (visited.has(modulePath)) continue;
    visited.add(modulePath);

    let source;
    try {
      source = await snapshot.readSource(modulePath);
    } catch {
      throw boundaryError("graph_read_failed", modulePath, true);
    }
    if (typeof source !== "string") {
      throw boundaryError("graph_read_failed", modulePath, true);
    }

    const specifiers = assertProviderModuleSourceBoundary({
      modulePath,
      source,
    });
    for (const specifier of specifiers) {
      if (!specifier.startsWith("./")) continue;
      const siblingPath = resolveSiblingModulePath(modulePath, specifier);
      if (!visited.has(siblingPath) && !pending.includes(siblingPath)) {
        pending.push(siblingPath);
      }
    }
    pending.sort();
  }
  return Object.freeze([...visited].sort());
}
