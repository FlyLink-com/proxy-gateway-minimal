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
const PROVIDER_RUNTIME_FILE_RE = /^(?:xsd|chaojipay)-payment-runtime\.mjs$/u;
const ASSEMBLY_MODULE_PATH_RE =
  /^(?:[A-Za-z0-9][A-Za-z0-9._-]*)(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/u;
const ASSEMBLY_SCRIPT_PATH_RE = /\.(?:cjs|js|mjs|ts|tsx)$/u;
const ASSEMBLY_MODULE_EXTENSIONS = Object.freeze([
  ".mjs",
  ".js",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
]);
const STATIC_DYNAMIC_IMPORT_LITERAL_RE = /^(["'])([^"'\\\r\n]+)\1$/u;
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

function isAssemblyModulePath(value) {
  return (
    typeof value === "string"
    && ASSEMBLY_MODULE_PATH_RE.test(value)
    && !value.includes("..")
    && !value.includes("//")
  );
}

function assemblyBoundaryError(rule, modulePath, validated = false) {
  const safePath = validated && isAssemblyModulePath(modulePath)
    ? modulePath
    : SAFE_SENTINEL;
  return new Error(`payment_provider_source_boundary:${rule}:${safePath}`);
}

function assertAssemblyModulePath(modulePath) {
  if (!isAssemblyModulePath(modulePath)) {
    throw assemblyBoundaryError("invalid_module_path", SAFE_SENTINEL);
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
  if (
    FORBIDDEN_SIBLING_SEGMENT_RE.test(stem)
    || PROVIDER_RUNTIME_FILE_RE.test(fileName)
  ) {
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

function assemblyStaticSpecifiers(source, modulePath) {
  if (typeof source !== "string") {
    throw assemblyBoundaryError("graph_read_failed", modulePath, true);
  }
  STATIC_MODULE_DECLARATION_RE.lastIndex = 0;
  const result = [];
  let match;
  while ((match = STATIC_MODULE_DECLARATION_RE.exec(source)) !== null) {
    result.push(match[1]);
  }
  return result;
}

function isIdentifierStart(value) {
  return /[A-Za-z_$]/u.test(value);
}

function isIdentifierPart(value) {
  return /[A-Za-z0-9_$]/u.test(value);
}

function skipQuotedSource(source, index, quote) {
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return source.length;
}

function skipLineComment(source, index) {
  const newline = source.indexOf("\n", index + 2);
  return newline === -1 ? source.length : newline + 1;
}

function skipBlockComment(source, index) {
  const end = source.indexOf("*/", index + 2);
  return end === -1 ? source.length : end + 2;
}

function skipWhitespace(source, index) {
  let cursor = index;
  while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  return cursor;
}

function findClosingParenthesis(source, openIndex) {
  let depth = 0;
  for (let cursor = openIndex; cursor < source.length; cursor += 1) {
    const current = source[cursor];
    if (current === "'" || current === '"' || current === "`") {
      cursor = skipQuotedSource(source, cursor, current) - 1;
      continue;
    }
    if (current === "/" && source[cursor + 1] === "/") {
      cursor = skipLineComment(source, cursor) - 1;
      continue;
    }
    if (current === "/" && source[cursor + 1] === "*") {
      cursor = skipBlockComment(source, cursor) - 1;
      continue;
    }
    if (current === "(") depth += 1;
    if (current === ")") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function assemblyDynamicSpecifiers(source, modulePath) {
  const result = [];
  let cursor = 0;
  while (cursor < source.length) {
    const current = source[cursor];
    if (current === "'" || current === '"' || current === "`") {
      cursor = skipQuotedSource(source, cursor, current);
      continue;
    }
    if (current === "/" && source[cursor + 1] === "/") {
      cursor = skipLineComment(source, cursor);
      continue;
    }
    if (current === "/" && source[cursor + 1] === "*") {
      cursor = skipBlockComment(source, cursor);
      continue;
    }
    if (!isIdentifierStart(current)) {
      cursor += 1;
      continue;
    }
    const start = cursor;
    cursor += 1;
    while (isIdentifierPart(source[cursor] ?? "")) cursor += 1;
    const identifier = source.slice(start, cursor);
    const next = skipWhitespace(source, cursor);
    if (identifier === "import" && source[next] === "(") {
      const close = findClosingParenthesis(source, next);
      if (close === -1) {
        throw assemblyBoundaryError(
          "forbidden_dynamic_module_loading",
          modulePath,
          true,
        );
      }
      const literal = STATIC_DYNAMIC_IMPORT_LITERAL_RE.exec(
        source.slice(next + 1, close).trim(),
      );
      if (literal === null) {
        throw assemblyBoundaryError(
          "forbidden_dynamic_module_loading",
          modulePath,
          true,
        );
      }
      result.push(literal[2]);
      cursor = close + 1;
      continue;
    }
    if (
      (identifier === "eval"
        || identifier === "Function"
        || identifier === "require"
        || identifier === "createRequire")
      && source[next] === "("
    ) {
      throw assemblyBoundaryError(
        "forbidden_dynamic_module_loading",
        modulePath,
        true,
      );
    }
  }
  return result;
}

function isRelativeAssemblySpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function resolveAssemblyPath(basePath, specifier) {
  if (!isRelativeAssemblySpecifier(specifier)) return null;
  if (/[%?#\\]/u.test(specifier)) return null;
  const segments = basePath.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment)) return null;
    segments.push(segment);
  }
  const resolved = segments.join("/");
  return isAssemblyModulePath(resolved) ? resolved : null;
}

function assemblyPathCandidates(modulePath, specifier) {
  const resolved = resolveAssemblyPath(modulePath, specifier);
  if (resolved === null) return [];
  if (/\.[A-Za-z0-9]+$/u.test(resolved)) return [resolved];
  return [
    ...ASSEMBLY_MODULE_EXTENSIONS.map((extension) => `${resolved}${extension}`),
    ...ASSEMBLY_MODULE_EXTENSIONS.map((extension) => `${resolved}/index${extension}`),
  ];
}

async function readAssemblySpecifier({
  modulePath,
  specifier,
  readSource,
}) {
  const candidates = assemblyPathCandidates(modulePath, specifier);
  if (candidates.length === 0) return null;
  for (const candidate of candidates) {
    try {
      const source = await readSource(candidate);
      if (typeof source === "string") {
        return Object.freeze({ modulePath: candidate, source });
      }
    } catch {
      // Continue only while resolving an extensionless local specifier.
    }
  }
  throw assemblyBoundaryError("graph_read_failed", modulePath, true);
}

function hasProviderRuntimeBasename(specifier) {
  return /(?:^|\/)(?:xsd|chaojipay)-payment-runtime\.mjs$/u.test(specifier);
}

function assemblySpecifiers(source, modulePath) {
  const staticSpecifiers = assemblyStaticSpecifiers(source, modulePath);
  const dynamicSpecifiers = assemblyDynamicSpecifiers(source, modulePath);
  return Object.freeze([...new Set([...staticSpecifiers, ...dynamicSpecifiers])].sort());
}

export async function collectProductionAssemblyGraph(input) {
  const snapshot = snapshotExactObject(input, ["rootModulePaths", "readSource"]);
  if (snapshot === null) {
    throw assemblyBoundaryError("invalid_module_path", SAFE_SENTINEL);
  }
  const roots = snapshotDenseArray(snapshot.rootModulePaths);
  if (roots === null) {
    throw assemblyBoundaryError("invalid_module_path", SAFE_SENTINEL);
  }
  for (const root of roots) assertAssemblyModulePath(root);
  if (
    typeof snapshot.readSource !== "function"
    || utilTypes.isProxy(snapshot.readSource)
  ) {
    throw assemblyBoundaryError("graph_read_failed", SAFE_SENTINEL);
  }

  const pending = [...new Set(roots)].sort();
  const visited = new Set();
  const sourceCache = new Map();
  while (pending.length > 0) {
    const modulePath = pending.shift();
    if (visited.has(modulePath)) continue;
    visited.add(modulePath);

    let source = sourceCache.get(modulePath);
    if (source === undefined) {
      try {
        source = await snapshot.readSource(modulePath);
      } catch {
        throw assemblyBoundaryError("graph_read_failed", modulePath, true);
      }
    }
    if (typeof source !== "string") {
      throw assemblyBoundaryError("graph_read_failed", modulePath, true);
    }
    if (!ASSEMBLY_SCRIPT_PATH_RE.test(modulePath)) continue;

    for (const specifier of assemblySpecifiers(source, modulePath)) {
      if (hasProviderRuntimeBasename(specifier) && !isRelativeAssemblySpecifier(specifier)) {
        throw assemblyBoundaryError(
          "provider_runtime_module_reachable",
          modulePath,
          true,
        );
      }
      const resolved = await readAssemblySpecifier({
        modulePath,
        specifier,
        readSource: snapshot.readSource,
      });
      if (resolved === null) continue;
      sourceCache.set(resolved.modulePath, resolved.source);
      if (!visited.has(resolved.modulePath) && !pending.includes(resolved.modulePath)) {
        pending.push(resolved.modulePath);
      }
    }
    pending.sort();
  }
  return Object.freeze([...visited].sort());
}

export async function assertProductionAssemblyExcludesProviderRuntimes(input) {
  const graph = await collectProductionAssemblyGraph(input);
  const runtime = graph.find((modulePath) => (
    /\/services\/platform\/(?:xsd|chaojipay)-payment-runtime\.mjs$/u.test(modulePath)
  ));
  if (runtime !== undefined) {
    throw assemblyBoundaryError("provider_runtime_module_reachable", runtime, true);
  }
  return graph;
}
