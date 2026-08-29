#!/usr/bin/env node
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_ROOT = "admin/src";
const PARSED_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx"
]);
const RESOLUTION_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".d.ts"
];

const ENTRYPOINTS = {
  admin: "admin/src/main.tsx",
  portal: "admin/src/portal-main.tsx",
  site: "admin/src/site-main.tsx"
};

const ENTRY_HTML = {
  admin: {
    file: "admin/index.html",
    module: "/src/main.tsx"
  },
  portal: {
    file: "admin/portal/index.html",
    module: "../src/portal-main.tsx"
  },
  site: {
    file: "admin/site/index.html",
    module: "../src/site-main.tsx"
  }
};

const EXPECTED_ENTRY_IMPORTS = {
  "admin/src/main.tsx": [
    "./App",
    "./styles.css"
  ],
  "admin/src/portal-main.tsx": [
    "./features/user-portal/user-portal-client",
    "./features/user-portal/user-portal-page",
    "./features/user-portal/user-registration-page",
    "./portal-static-preserve.css"
  ],
  "admin/src/site-main.tsx": [
    "./features/company-site/company-site-page",
    "./styles.css"
  ]
};

const EXPECTED_CSS_IMPORTS = {
  "admin/src/styles.css": [
    "./styles/tokens.css",
    "./styles/base.css",
    "./styles/admin-os-chrome.css",
    "./styles/public-site.css",
    "./styles/shared-components.css",
    "./styles/admin-os-workspace.css",
    "./styles/legacy-entrypoints.css",
    "./styles/user-portal-registration.css",
    "./styles/responsive.css"
  ],
  "admin/src/portal-static-preserve.css": [
    "./styles/portal-static-preserve/tokens.css",
    "./styles/portal-static-preserve/base.css",
    "./styles/portal-static-preserve/admin-os-chrome.css",
    "./styles/portal-static-preserve/public-site.css",
    "./styles/portal-static-preserve/shared-components.css",
    "./styles/portal-static-preserve/admin-os-workspace.css",
    "./styles/portal-static-preserve/legacy-entrypoints.css",
    "./styles/portal-static-preserve/responsive.css",
    "./styles/portal-static-preserve/admin-os-visual-polish.css",
    "./styles/portal-static-preserve/user-portal-desktop.css",
    "./styles/portal-static-preserve/user-portal-commerce.css"
  ]
};

const EXPECTED_APP_SENSITIVE_IMPORTS = [
  "./app/admin-fixture-preview",
  "./features/company-site/company-site-page",
  "./features/user-portal/user-portal-client",
  "./features/user-portal/user-portal-page",
  "./features/user-portal/user-portal-route"
];

const EXPECTED_ADMIN_TO_PORTAL_EDGES = new Set([
  "admin/src/App.tsx -> admin/src/features/user-portal/user-portal-client.ts",
  "admin/src/App.tsx -> admin/src/features/user-portal/user-portal-page.tsx",
  "admin/src/App.tsx -> admin/src/features/user-portal/user-portal-route.tsx"
]);

const EXPECTED_ADMIN_TO_SITE_EDGES = new Set([
  "admin/src/App.tsx -> admin/src/features/company-site/company-site-page.tsx"
]);

const EXPECTED_FIXTURE_EDGES = new Set([
  "admin/src/App.tsx -> admin/src/app/admin-fixture-preview.ts",
  "admin/src/app/admin-safe-read-projection.ts -> admin/src/app/admin-fixture-preview.ts",
  "admin/src/app/admin-ui-projection.ts -> admin/src/app/admin-fixture-preview.ts",
  "admin/src/components/primitives/panel-frame.tsx -> admin/src/app/admin-fixture-preview.ts",
  "admin/src/features/user-portal/user-portal-local.ts -> admin/src/features/user-portal/totp-preview.ts",
  "admin/src/pages/subscription-usage-monitor-page.tsx -> admin/src/features/subscriptions/usage-runtime-fixture.ts"
]);

const PORTAL_SHARED_FILES = new Set([
  "admin/src/app/public-locale.ts",
  "admin/src/components/modal-frame.tsx",
  "admin/src/lib/clipboard.ts",
  "admin/src/lib/errors.ts",
  "admin/src/lib/utils.ts"
]);

const EXPECTED_VITE_LOCAL_IMPORTS = {
  "admin/vite.config.ts": [],
  "admin/vite.portal.config.ts": [
    "./src/features/user-portal/recharge/portal-recharge-client"
  ],
  "admin/vite.portal.local-api-validation.config.ts": [
    "./vite.portal.config"
  ],
  "admin/vite.site.config.ts": []
};

const EXPECTED_PUBLIC_FILES = new Set([
  "admin/public/favicon.svg",
  "admin/public/guide/clash-subscription-import.png",
  "admin/public/guide/clash-system-proxy.png",
  "admin/public/payment-alipay-icon.png",
  "admin/public/payment-wechat-pay-icon.svg"
]);

function codePointOrder(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(codePointOrder);
}

function normalizeRepositoryPath(value) {
  return String(value).replaceAll(path.sep, "/").replace(/^\.\//u, "");
}

function issue(code, details = {}) {
  return { code, ...details };
}

function codePositionMask(source) {
  const mask = new Uint8Array(source.length);

  function skipQuoted(index, quote) {
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
      } else if (source[index] === quote) {
        return index + 1;
      } else {
        index += 1;
      }
    }
    return index;
  }

  function scanTemplate(index) {
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
      } else if (source[index] === "`") {
        return index + 1;
      } else if (source[index] === "$" && source[index + 1] === "{") {
        index = scanCode(index + 2, true);
      } else {
        index += 1;
      }
    }
    return index;
  }

  function scanCode(index, stopAtTemplateBrace = false) {
    let braceDepth = 0;
    while (index < source.length) {
      const current = source[index];
      const next = source[index + 1];
      if (current === "/" && next === "/") {
        index += 2;
        while (index < source.length && source[index] !== "\n") index += 1;
      } else if (current === "/" && next === "*") {
        index += 2;
        while (
          index < source.length
          && !(source[index] === "*" && source[index + 1] === "/")
        ) index += 1;
        index = Math.min(source.length, index + 2);
      } else if (current === '"' || current === "'") {
        index = skipQuoted(index, current);
      } else if (current === "`") {
        index = scanTemplate(index);
      } else if (current === "{") {
        mask[index] = 1;
        braceDepth += 1;
        index += 1;
      } else if (current === "}") {
        if (stopAtTemplateBrace && braceDepth === 0) return index + 1;
        mask[index] = 1;
        braceDepth = Math.max(0, braceDepth - 1);
        index += 1;
      } else {
        mask[index] = 1;
        index += 1;
      }
    }
    return index;
  }

  scanCode(0);
  return mask;
}

function isIdentifierStart(character) {
  return /[A-Za-z_$]/u.test(character ?? "");
}

function isIdentifierPart(character) {
  return /[A-Za-z0-9_$]/u.test(character ?? "");
}

function readIdentifier(source, mask, index) {
  if (mask[index] !== 1 || !isIdentifierStart(source[index])) return null;
  let end = index + 1;
  while (mask[end] === 1 && isIdentifierPart(source[end])) end += 1;
  return { value: source.slice(index, end), end };
}

function nextCodeIndex(mask, index) {
  while (index < mask.length && mask[index] !== 1) index += 1;
  return index;
}

function previousCodeIndex(mask, index) {
  index -= 1;
  while (index >= 0 && mask[index] !== 1) index -= 1;
  return index;
}

function skipModuleTrivia(source, index) {
  while (index < source.length) {
    if (/\s/u.test(source[index])) {
      index += 1;
    } else if (source[index] === "/" && source[index + 1] === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
    } else if (source[index] === "/" && source[index + 1] === "*") {
      index += 2;
      while (
        index < source.length
        && !(source[index] === "*" && source[index + 1] === "/")
      ) index += 1;
      index = Math.min(source.length, index + 2);
    } else {
      break;
    }
  }
  return index;
}

function readModuleString(source, index) {
  const quote = source[index];
  if (quote !== '"' && quote !== "'") return null;
  let value = "";
  let unsupported = false;
  index += 1;
  while (index < source.length) {
    const current = source[index];
    if (current === "\\") {
      unsupported = true;
      index += 2;
    } else if (current === quote) {
      return { value, unsupported, end: index + 1 };
    } else if (current === "\n" || current === "\r") {
      return { value, unsupported: true, end: index };
    } else {
      value += current;
      index += 1;
    }
  }
  return { value, unsupported: true, end: index };
}

function findFromSpecifier(source, mask, index) {
  while (index < source.length) {
    if (mask[index] === 1 && source[index] === ";") return null;
    const identifier = readIdentifier(source, mask, index);
    if (!identifier) {
      index += 1;
      continue;
    }
    if (identifier.value === "from") {
      const specifier = readModuleString(
        source,
        skipModuleTrivia(source, identifier.end)
      );
      if (specifier) return specifier;
    }
    index = identifier.end;
  }
  return null;
}

function inspectJavaScriptImportSource(source) {
  const mask = codePositionMask(source);
  const specifiers = [];
  let nonLiteralDynamicImports = 0;
  let unsupportedModuleSpecifiers = 0;
  let importMetaGlobCalls = 0;
  let commonJsRequireCalls = 0;

  function recordSpecifier(specifier) {
    if (!specifier) return;
    if (specifier.unsupported) unsupportedModuleSpecifiers += 1;
    else specifiers.push(specifier.value);
  }

  let index = 0;
  while (index < source.length) {
    const identifier = readIdentifier(source, mask, index);
    if (!identifier) {
      index += 1;
      continue;
    }

    const previous = previousCodeIndex(mask, index);
    const isProperty = source[previous] === ".";

    if (identifier.value === "require" && !isProperty) {
      const next = nextCodeIndex(mask, identifier.end);
      if (source[next] === "(") commonJsRequireCalls += 1;
      index = identifier.end;
      continue;
    }

    if (
      isProperty
      || (identifier.value !== "import" && identifier.value !== "export")
    ) {
      index = identifier.end;
      continue;
    }

    if (identifier.value === "export") {
      recordSpecifier(findFromSpecifier(source, mask, identifier.end));
      index = identifier.end;
      continue;
    }

    const next = nextCodeIndex(mask, identifier.end);
    if (source[next] === "(") {
      const argument = readModuleString(
        source,
        skipModuleTrivia(source, next + 1)
      );
      if (argument) recordSpecifier(argument);
      else nonLiteralDynamicImports += 1;
      index = next + 1;
      continue;
    }

    if (source[next] === ".") {
      const metaStart = nextCodeIndex(mask, next + 1);
      const meta = readIdentifier(source, mask, metaStart);
      const secondDot = meta
        ? nextCodeIndex(mask, meta.end)
        : source.length;
      const memberStart = source[secondDot] === "."
        ? nextCodeIndex(mask, secondDot + 1)
        : source.length;
      const member = readIdentifier(source, mask, memberStart);
      const call = member
        ? nextCodeIndex(mask, member.end)
        : source.length;
      if (
        meta?.value === "meta"
        && (member?.value === "glob" || member?.value === "globEager")
        && source[call] === "("
      ) importMetaGlobCalls += 1;
      index = identifier.end;
      continue;
    }

    const direct = readModuleString(
      source,
      skipModuleTrivia(source, identifier.end)
    );
    if (direct) recordSpecifier(direct);
    else recordSpecifier(findFromSpecifier(source, mask, identifier.end));
    index = identifier.end;
  }

  return {
    specifiers: uniqueSorted(specifiers),
    nonLiteralDynamicImports,
    unsupportedModuleSpecifiers,
    commonJsRequireCalls,
    unsupportedCssImports: 0,
    cssAssetReferences: 0,
    importMetaGlobCalls
  };
}

function inspectCssImportSource(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  const importOccurrences = [...withoutComments.matchAll(/@import\b/gu)].length;
  const rules = [...withoutComments.matchAll(/@import\s+([^;]*);/gu)];
  const specifiers = [];
  let unsupportedCssImports = Math.max(0, importOccurrences - rules.length);

  for (const rule of rules) {
    const value = rule[1].trim();
    const quoted = /^(?:"([^"]+)"|'([^']+)')/u.exec(value);
    const url = /^url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/u.exec(value);
    const specifier = quoted?.[1]
      ?? quoted?.[2]
      ?? url?.[1]
      ?? url?.[2]
      ?? url?.[3];
    if (specifier) {
      specifiers.push(specifier);
    } else {
      unsupportedCssImports += 1;
    }
  }

  const withoutImportRules = withoutComments.replace(/@import\s+[^;]*;/gu, "");
  const cssAssetReferences = [...withoutImportRules.matchAll(/\burl\s*\(/gu)].length;

  return {
    specifiers: uniqueSorted(specifiers),
    nonLiteralDynamicImports: 0,
    unsupportedModuleSpecifiers: 0,
    commonJsRequireCalls: 0,
    unsupportedCssImports,
    cssAssetReferences,
    importMetaGlobCalls: 0
  };
}

export function inspectImportSource(source, { extension = ".ts" } = {}) {
  if (extension === ".css") return inspectCssImportSource(source);
  return inspectJavaScriptImportSource(source);
}

function importInspectionIssues(inspected, file) {
  const issues = [];
  for (const [property, code] of [
    ["nonLiteralDynamicImports", "non_literal_dynamic_import"],
    ["unsupportedModuleSpecifiers", "unsupported_module_specifier"],
    ["commonJsRequireCalls", "unsupported_commonjs_require"],
    ["unsupportedCssImports", "unsupported_css_import"],
    ["cssAssetReferences", "css_asset_reference_unreviewed"],
    ["importMetaGlobCalls", "unsupported_import_meta_glob"]
  ]) {
    if (inspected[property] > 0) {
      issues.push(issue(code, {
        file,
        count: inspected[property]
      }));
    }
  }
  return issues;
}

function readUtf8(rootDirectory, repositoryPath) {
  return readFileSync(path.join(rootDirectory, repositoryPath), "utf8");
}

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isInsideDirectory(parentDirectory, candidate) {
  const relative = path.relative(parentDirectory, candidate);
  return relative === ""
    || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveLocalImport({
  rootDirectory,
  from,
  specifier
}) {
  const sourceRoot = path.resolve(rootDirectory, SOURCE_ROOT);
  const cleanSpecifier = specifier.split(/[?#]/u, 1)[0];
  const unresolvedBase = cleanSpecifier.startsWith("/src/")
    ? path.resolve(rootDirectory, "admin", cleanSpecifier.slice(1))
    : path.resolve(
      path.dirname(path.join(rootDirectory, from)),
      cleanSpecifier
    );

  if (!isInsideDirectory(sourceRoot, unresolvedBase)) {
    return { error: "source_boundary_escape" };
  }

  const candidates = [unresolvedBase];
  const extension = path.extname(unresolvedBase);
  if (!extension) {
    for (const candidateExtension of RESOLUTION_EXTENSIONS) {
      candidates.push(unresolvedBase + candidateExtension);
      candidates.push(path.join(
        unresolvedBase,
        "index" + candidateExtension
      ));
    }
  } else if (extension === ".js" || extension === ".jsx") {
    const withoutExtension = unresolvedBase.slice(0, -extension.length);
    candidates.push(withoutExtension + ".ts");
    candidates.push(withoutExtension + ".tsx");
  }

  const resolved = candidates.find(isFile);
  if (!resolved) {
    return { error: "relative_import_unresolved" };
  }

  return {
    path: normalizeRepositoryPath(path.relative(rootDirectory, resolved))
  };
}

export function buildLocalImportGraph({
  rootDirectory,
  entrypoint
}) {
  const queue = [entrypoint];
  const visited = new Set();
  const edges = [];
  const issues = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const absolute = path.join(rootDirectory, current);
    if (!existsSync(absolute) || !isFile(absolute)) {
      issues.push(issue("source_file_unreadable", { file: current }));
      continue;
    }

    const extension = path.extname(current);
    if (!PARSED_EXTENSIONS.has(extension)) continue;

    let source;
    try {
      source = readUtf8(rootDirectory, current);
    } catch {
      issues.push(issue("source_file_unreadable", { file: current }));
      continue;
    }

    const inspected = inspectImportSource(source, { extension });
    issues.push(...importInspectionIssues(inspected, current));

    for (const specifier of inspected.specifiers) {
      if (!isLocalSpecifier(specifier)) continue;
      const resolved = resolveLocalImport({
        rootDirectory,
        from: current,
        specifier
      });
      if (resolved.error) {
        issues.push(issue(resolved.error, {
          file: current,
          specifier
        }));
        continue;
      }
      const edge = {
        from: current,
        to: resolved.path
      };
      edges.push(edge);
      if (!visited.has(resolved.path)) queue.push(resolved.path);
    }
  }

  edges.sort((left, right) => codePointOrder(
    left.from + " -> " + left.to,
    right.from + " -> " + right.to
  ));

  return {
    entrypoint,
    files: [...visited].sort(codePointOrder),
    edges,
    issues
  };
}

function edgeKey(edge) {
  return edge.from + " -> " + edge.to;
}

function isPortalOwned(file) {
  return file === "admin/src/portal-main.tsx"
    || file === "admin/src/portal-static-preserve.css"
    || file.startsWith("admin/src/features/user-portal/")
    || file.startsWith("admin/src/styles/portal-static-preserve/");
}

function isSiteOwned(file) {
  return file === "admin/src/site-main.tsx"
    || file.startsWith("admin/src/features/company-site/");
}

function isFixtureOrPreview(file) {
  return /(?:^|[/_.-])(?:fixture|preview)(?:[/_.-]|$)/iu.test(file);
}

function isForbiddenActivePath(file) {
  return file.startsWith("admin/src/test/")
    || file.includes("/archive/")
    || file.includes("/quarantine/");
}

function isAllowedPortalFile(file) {
  return isPortalOwned(file) || PORTAL_SHARED_FILES.has(file);
}

function isAllowedSiteFile(file) {
  return isSiteOwned(file)
    || file === "admin/src/styles.css"
    || (
      file.startsWith("admin/src/styles/")
      && !file.startsWith("admin/src/styles/portal-static-preserve/")
    );
}

function isLocalSpecifier(specifier) {
  return specifier.startsWith(".") || specifier.startsWith("/src/");
}

function compareExactSet({
  actual,
  expected,
  missingCode,
  unexpectedCode,
  details = {}
}) {
  const issues = [];
  for (const value of expected) {
    if (!actual.has(value)) {
      issues.push(issue(missingCode, { ...details, value }));
    }
  }
  for (const value of actual) {
    if (!expected.has(value)) {
      issues.push(issue(unexpectedCode, { ...details, value }));
    }
  }
  return issues;
}

function inspectDirectImports(rootDirectory, repositoryPath) {
  const extension = path.extname(repositoryPath);
  return inspectImportSource(
    readUtf8(rootDirectory, repositoryPath),
    { extension }
  );
}

function checkDirectImportContracts(rootDirectory) {
  const issues = [];

  for (const [file, expected] of Object.entries(EXPECTED_ENTRY_IMPORTS)) {
    let actual;
    try {
      actual = inspectDirectImports(rootDirectory, file).specifiers
        .filter(isLocalSpecifier);
    } catch {
      issues.push(issue("boundary_contract_unreadable", { file }));
      continue;
    }
    issues.push(...compareExactSet({
      actual: new Set(actual),
      expected: new Set(expected),
      missingCode: "entry_import_missing",
      unexpectedCode: "entry_import_unexpected",
      details: { file }
    }));
  }

  for (const [file, expected] of Object.entries(EXPECTED_CSS_IMPORTS)) {
    let actual;
    try {
      actual = inspectDirectImports(rootDirectory, file).specifiers;
    } catch {
      issues.push(issue("boundary_contract_unreadable", { file }));
      continue;
    }
    issues.push(...compareExactSet({
      actual: new Set(actual),
      expected: new Set(expected),
      missingCode: "css_import_missing",
      unexpectedCode: "css_import_unexpected",
      details: { file }
    }));
  }

  const appFile = "admin/src/App.tsx";
  try {
    const sensitive = inspectDirectImports(rootDirectory, appFile).specifiers
      .filter((specifier) => (
        specifier.includes("/features/user-portal/")
        || specifier.includes("/features/company-site/")
        || /(?:fixture|preview)/iu.test(specifier)
      ));
    issues.push(...compareExactSet({
      actual: new Set(sensitive),
      expected: new Set(EXPECTED_APP_SENSITIVE_IMPORTS),
      missingCode: "app_sensitive_import_missing",
      unexpectedCode: "app_sensitive_import_unexpected",
      details: { file: appFile }
    }));
  } catch {
    issues.push(issue("boundary_contract_unreadable", { file: appFile }));
  }

  return issues;
}

function readJson(rootDirectory, repositoryPath) {
  return JSON.parse(readUtf8(rootDirectory, repositoryPath));
}

function listRepositoryFiles(rootDirectory, repositoryPath) {
  const absolute = path.join(rootDirectory, repositoryPath);
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = normalizeRepositoryPath(path.join(repositoryPath, entry.name));
    if (entry.isDirectory()) {
      files.push(...listRepositoryFiles(rootDirectory, child));
    } else {
      files.push(child);
    }
  }
  return files.sort(codePointOrder);
}

function moduleScriptSources(rootDirectory, repositoryPath) {
  const html = readUtf8(rootDirectory, repositoryPath);
  const sources = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/giu)) {
    const attributes = match[1];
    const type = /\btype\s*=\s*["']([^"']+)["']/iu.exec(attributes)?.[1];
    const source = /\bsrc\s*=\s*["']([^"']+)["']/iu.exec(attributes)?.[1];
    sources.push(type?.toLowerCase() === "module"
      ? source ?? "<inline-module>"
      : `<non-module:${source ?? "inline"}>`);
  }
  return sources.sort(codePointOrder);
}

function checkBuildContracts(rootDirectory) {
  const issues = [];
  let rootPackage;
  let adminPackage;

  try {
    rootPackage = readJson(rootDirectory, "package.json");
    adminPackage = readJson(rootDirectory, "admin/package.json");
  } catch {
    return [issue("build_contract_unreadable")];
  }

  try {
    const tsconfig = readJson(rootDirectory, "admin/tsconfig.json");
    if (
      tsconfig.compilerOptions?.baseUrl !== undefined
      || tsconfig.compilerOptions?.paths !== undefined
      || JSON.stringify(tsconfig.include) !== JSON.stringify(["src"])
    ) {
      issues.push(issue("typescript_source_alias_drift"));
    }
  } catch {
    issues.push(issue("typescript_boundary_unreadable"));
  }

  const expectedScripts = {
    root: {
      "admin:build": "npm run build --prefix admin",
      "admin:verify": "npm run verify:admin-build --prefix admin",
      "admin:portal:build": "npm run build:portal --prefix admin",
      "admin:portal:verify": "npm run verify:portal-build --prefix admin",
      "admin:site:build": "npm run build:site --prefix admin",
      "admin:site:verify": "npm run verify:site-build --prefix admin",
      "cloudflare:site:build": "npm run admin:site:build",
      "cloudflare:site:verify": "npm run admin:site:verify",
      "cloudflare:site:dry-run": "npx --yes wrangler@4.99.0 deploy --config wrangler.jsonc --dry-run",
      "cloudflare:site:validate": "npm run cloudflare:site:build && npm run cloudflare:site:verify && npm run cloudflare:site:dry-run"
    },
    admin: {
      build: "tsc --noEmit && vite build",
      "build:portal": "tsc --noEmit && vite build --config vite.portal.config.ts",
      "build:site": "tsc --noEmit && vite build --config vite.site.config.ts",
      "verify:admin-build": "node ../scripts/verify-admin-build.mjs dist",
      "verify:portal-build": "node ../scripts/verify-portal-build.mjs dist-portal",
      "verify:site-build": "node ../scripts/verify-public-site-build.mjs dist-site"
    }
  };

  for (const [scope, expected] of Object.entries(expectedScripts)) {
    const scripts = scope === "root" ? rootPackage.scripts : adminPackage.scripts;
    for (const [name, command] of Object.entries(expected)) {
      if (scripts?.[name] !== command) {
        issues.push(issue("build_script_drift", {
          scope,
          script: name
        }));
      }
    }
    const relevantNames = Object.keys(scripts ?? {}).filter((name) => (
      scope === "root"
        ? /^(?:admin:.*(?:build|verify)|cloudflare:site:(?:build|verify|dry-run|validate))$/u.test(name)
        : /^(?:build(?::.*)?|verify:.*)$/u.test(name)
    ));
    for (const name of relevantNames) {
      if (!Object.hasOwn(expected, name)) {
        issues.push(issue("frontend_build_script_unexpected", {
          scope,
          script: name
        }));
      }
    }
  }

  for (const [surface, contract] of Object.entries(ENTRY_HTML)) {
    try {
      const actual = moduleScriptSources(rootDirectory, contract.file);
      if (actual.length !== 1 || actual[0] !== contract.module) {
        issues.push(issue("html_entry_drift", {
          surface,
          file: contract.file,
          moduleScripts: actual.length
        }));
      }
    } catch {
      issues.push(issue("html_entry_unreadable", {
        surface,
        file: contract.file
      }));
    }
  }

  let adminConfig = "";
  let portalConfig = "";
  let siteConfig = "";
  try {
    adminConfig = readUtf8(rootDirectory, "admin/vite.config.ts");
    portalConfig = readUtf8(rootDirectory, "admin/vite.portal.config.ts");
    siteConfig = readUtf8(rootDirectory, "admin/vite.site.config.ts");
  } catch {
    issues.push(issue("vite_boundary_unreadable"));
  }

  const configContracts = [
    {
      surface: "portal",
      source: portalConfig,
      root: /root:\s*path\.resolve\(adminDir,\s*["']portal["']\)/u,
      output: /outDir:\s*path\.resolve\(adminDir,\s*["']dist-portal["']\)/u,
      publicDir: /publicDir:\s*path\.resolve\(adminDir,\s*["']public["']\)/u
    },
    {
      surface: "site",
      source: siteConfig,
      root: /root:\s*path\.resolve\(adminDir,\s*["']site["']\)/u,
      output: /outDir:\s*path\.resolve\(adminDir,\s*["']dist-site["']\)/u,
      publicDir: /publicDir:\s*path\.resolve\(adminDir,\s*["']public["']\)/u
    }
  ];
  for (const contract of configContracts) {
    if (
      !contract.root.test(contract.source)
      || !contract.output.test(contract.source)
      || !contract.publicDir.test(contract.source)
      || !/emptyOutDir:\s*true/u.test(contract.source)
      || /\b(?:alias|rollupOptions|lib)\s*:/u.test(contract.source)
    ) {
      issues.push(issue("vite_boundary_drift", {
        surface: contract.surface
      }));
    }
  }

  if (/\b(?:root|publicDir|outDir|alias|rollupOptions|lib)\s*:/u.test(adminConfig)) {
    issues.push(issue("vite_boundary_drift", { surface: "admin" }));
  }

  for (const [file, expected] of Object.entries(EXPECTED_VITE_LOCAL_IMPORTS)) {
    let actual;
    try {
      const inspected = inspectDirectImports(rootDirectory, file);
      issues.push(...importInspectionIssues(inspected, file));
      actual = inspected.specifiers.filter(isLocalSpecifier);
    } catch {
      issues.push(issue("vite_import_contract_unreadable", { file }));
      continue;
    }
    issues.push(...compareExactSet({
      actual: new Set(actual),
      expected: new Set(expected),
      missingCode: "vite_local_import_missing",
      unexpectedCode: "vite_local_import_unexpected",
      details: { file }
    }));
  }

  let publicFiles;
  try {
    publicFiles = new Set(listRepositoryFiles(rootDirectory, "admin/public"));
  } catch {
    issues.push(issue("public_build_input_unreadable"));
    publicFiles = new Set();
  }
  issues.push(...compareExactSet({
    actual: publicFiles,
    expected: EXPECTED_PUBLIC_FILES,
    missingCode: "known_public_build_input_missing",
    unexpectedCode: "public_build_input_unexpected"
  }));

  return issues;
}

function checkGraphPolicies(graphs) {
  const issues = [];
  for (const [surface, graph] of Object.entries(graphs)) {
    issues.push(...graph.issues.map((item) => ({ ...item, surface })));
    for (const file of graph.files) {
      if (isForbiddenActivePath(file)) {
        issues.push(issue("forbidden_active_reachability", {
          surface,
          file
        }));
      }
    }
  }

  for (const file of graphs.portal.files) {
    if (!isAllowedPortalFile(file)) {
      issues.push(issue("portal_cross_surface_reachability", { file }));
    }
  }

  for (const file of graphs.site.files) {
    if (!isAllowedSiteFile(file) || isFixtureOrPreview(file)) {
      issues.push(issue("site_foreign_surface_reachability", { file }));
    }
  }

  const adminToPortal = new Set();
  const adminToSite = new Set();
  const fixtureEdges = new Set();
  for (const edge of graphs.admin.edges) {
    const key = edgeKey(edge);
    if (isPortalOwned(edge.to) && !isPortalOwned(edge.from)) {
      adminToPortal.add(key);
    }
    if (isSiteOwned(edge.to) && !isSiteOwned(edge.from)) {
      adminToSite.add(key);
    }
    if (isFixtureOrPreview(edge.to)) {
      fixtureEdges.add(key);
    }
  }

  issues.push(...compareExactSet({
    actual: adminToPortal,
    expected: EXPECTED_ADMIN_TO_PORTAL_EDGES,
    missingCode: "known_admin_portal_edge_missing",
    unexpectedCode: "admin_portal_edge_unexpected"
  }));
  issues.push(...compareExactSet({
    actual: adminToSite,
    expected: EXPECTED_ADMIN_TO_SITE_EDGES,
    missingCode: "known_admin_site_edge_missing",
    unexpectedCode: "admin_site_edge_unexpected"
  }));
  issues.push(...compareExactSet({
    actual: fixtureEdges,
    expected: EXPECTED_FIXTURE_EDGES,
    missingCode: "known_fixture_edge_missing",
    unexpectedCode: "fixture_edge_unexpected"
  }));

  return {
    issues,
    knownDebt: {
      adminToPortal: adminToPortal.size,
      adminToSite: adminToSite.size,
      fixtureEdges: fixtureEdges.size
    }
  };
}

export function verifyFrontendSourceBoundaries({
  rootDirectory = DEFAULT_ROOT
} = {}) {
  const graphs = Object.fromEntries(
    Object.entries(ENTRYPOINTS).map(([surface, entrypoint]) => [
      surface,
      buildLocalImportGraph({ rootDirectory, entrypoint })
    ])
  );
  const graphPolicy = checkGraphPolicies(graphs);
  const issues = [
    ...checkDirectImportContracts(rootDirectory),
    ...checkBuildContracts(rootDirectory),
    ...graphPolicy.issues
  ].sort((left, right) => codePointOrder(
    JSON.stringify(left),
    JSON.stringify(right)
  ));

  return {
    type: "frontend_source_boundary_check",
    ok: issues.length === 0,
    redacted: true,
    productionAuthority: false,
    entrypoints: ENTRYPOINTS,
    graph: Object.fromEntries(
      Object.entries(graphs).map(([surface, graph]) => [
        surface,
        {
          files: graph.files.length,
          edges: graph.edges.length
        }
      ])
    ),
    knownDebt: graphPolicy.knownDebt,
    cssImports: {
      admin: EXPECTED_CSS_IMPORTS["admin/src/styles.css"].length,
      portal: EXPECTED_CSS_IMPORTS["admin/src/portal-static-preserve.css"].length
    },
    buildOutputs: {
      admin: "admin/dist",
      portal: "admin/dist-portal",
      site: "admin/dist-site"
    },
    publicBuildInputs: EXPECTED_PUBLIC_FILES.size,
    issues
  };
}

function runCli() {
  const result = verifyFrontendSourceBoundaries();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.ok ? 0 : 1;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runCli();
}
