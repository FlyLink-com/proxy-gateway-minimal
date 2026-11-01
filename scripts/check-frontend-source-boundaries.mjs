#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  lstatSync,
  realpathSync,
  readdirSync,
  readFileSync,
  statSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_ROOT = "admin/src";
const PARSED_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx"
]);
const RESOLUTION_EXTENSIONS = [
  ".mjs",
  ".js",
  ".mts",
  ".ts",
  ".jsx",
  ".tsx",
  ".css",
  ".json",
  ".svg",
  ".cjs",
  ".cts",
  ".d.ts"
];
const EXPLICIT_TYPESCRIPT_ALTERNATIVES = {
  ".cjs": [".cts", ".d.cts"],
  ".js": [".ts", ".tsx", ".d.ts"],
  ".jsx": [".tsx", ".d.ts"],
  ".mjs": [".mts", ".d.mts"]
};
const NON_EXECUTABLE_LEAF_EXTENSIONS = new Set([
  ".avif",
  ".eot",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".png",
  ".svg",
  ".txt",
  ".webp",
  ".woff",
  ".woff2"
]);

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
  portalWeb: {
    file: "admin/portal-web/index.html",
    module: "../src/portal-main.tsx"
  },
  site: {
    file: "admin/site/index.html",
    module: "../src/site-main.tsx"
  }
};

const EXPECTED_ENTRY_HTML_SHA256 = {
  "admin/index.html":
    "35ac077fd177e228dbd9c6e327decaa8cfa1e1e4fb5227b91db6c09e3f1eec11",
  "admin/portal/index.html":
    "769faa6d44c0973166cc4ba248d04c127440d82878fd235635e6109acb7cece4",
  "admin/portal-web/index.html":
    "8935a76b7a68c138a5604525f86a86b0af92de934170995e36670b77b1462b71",
  "admin/site/index.html":
    "2a8864753bf646d09ebe9c72bfb04820a38eb43b4b35ada734689ad2bce11fe1"
};

const EXPECTED_TSCONFIG_SHA256 =
  "ccfb0d2c7b4c35a224762935ef838bec71bcd61b6a7c4bc3ef140f7a8b178701";

const EXPECTED_ENTRY_IMPORTS = {
  "admin/src/main.tsx": [
    "./App",
    "./styles.css"
  ],
  "admin/src/portal-main.tsx": [
    "./features/user-portal/user-portal-client",
    "./features/user-portal/user-portal-page",
    "./features/user-portal/user-registration-page",
    "./features/user-portal/portal-entry",
    "./features/ads-consent-preference-panel",
    "./features/ads-attribution",
    "./portal-static-preserve.css"
  ],
  "admin/src/site-main.tsx": [
    "./features/company-site/company-site-page",
    "./features/ads-attribution",
    "./styles.css"
  ]
};

const EXPECTED_CSS_IMPORTS = {
  "admin/src/styles.css": [
    "./styles/tokens.css",
    "./styles/base.css",
    "./styles/admin-os-chrome.css",
    "./styles/public-site.css",
    "./styles/ads-consent.css",
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
    "./styles/portal-static-preserve/user-portal-commerce.css",
    "./styles/ads-consent.css"
  ]
};

const EXPECTED_APP_SENSITIVE_IMPORTS = [
  "./app/admin-fixture-preview",
  "./pages/admin-auth-boundary",
  "./pages/admin-operations-shell",
  "./pages/admin-production-baseline-preview",
  "./features/company-site/company-site-page",
  "./features/user-portal/user-portal-preview-client",
  "./features/user-portal/user-portal-page",
  "./features/user-portal/user-portal-route"
];

const EXPECTED_ADMIN_TO_PORTAL_EDGES = new Set([
  "admin/src/App.tsx -> admin/src/features/user-portal/user-portal-preview-client.ts",
  "admin/src/App.tsx -> admin/src/features/user-portal/user-portal-page.tsx",
  "admin/src/App.tsx -> admin/src/features/user-portal/user-portal-route.tsx"
]);

const EXPECTED_ADMIN_TO_SITE_EDGES = new Set([
  "admin/src/App.tsx -> admin/src/features/company-site/company-site-page.tsx"
]);

const EXPECTED_FIXTURE_EDGES = new Set([
  "admin/src/App.tsx -> admin/src/app/admin-fixture-preview.ts",
  "admin/src/App.tsx -> admin/src/pages/admin-production-baseline-preview.tsx",
  "admin/src/app/admin-ui-projection.ts -> admin/src/app/admin-fixture-preview.ts",
  "admin/src/components/primitives/panel-frame.tsx -> admin/src/app/admin-fixture-preview.ts",
  "admin/src/App.tsx -> admin/src/features/user-portal/user-portal-preview-client.ts",
  "admin/src/features/user-portal/user-portal-local.ts -> admin/src/features/user-portal/totp-preview.ts",
  "admin/src/features/user-portal/user-portal-local.ts -> admin/src/features/user-portal/user-portal-preview-data.ts",
  "admin/src/features/user-portal/user-portal-preview-client.ts -> admin/src/features/user-portal/user-portal-preview-data.ts",
  "admin/src/features/user-portal/user-portal-route.tsx -> admin/src/features/user-portal/user-portal-preview-client.ts",
  "admin/src/pages/subscription-usage-monitor-page.tsx -> admin/src/features/subscriptions/usage-runtime-fixture.ts"
]);

const EXPECTED_FIXTURE_EDGES_BY_SURFACE = {
  admin: EXPECTED_FIXTURE_EDGES,
  portal: new Set(),
  site: new Set()
};

const PORTAL_SHARED_FILES = new Set([
  "admin/src/shared/public/public-locale.ts",
  "admin/src/shared/public/modal-frame.tsx",
  "admin/src/shared/public/clipboard.ts",
  "admin/src/shared/public/errors.ts",
  "admin/src/shared/public/utils.ts"
]);

const PUBLIC_ADS_CROSS_SURFACE_FILES = new Set([
  "admin/src/features/ads-attribution.ts",
  "admin/src/features/ads-attribution-contract.ts",
  "admin/src/features/ads-consent-preference-panel.tsx",
  "admin/src/styles/ads-consent.css"
]);

const EXPECTED_VITE_LOCAL_IMPORTS = {
  "admin/vite.config.ts": [],
  "admin/vite.portal.config.ts": [
    "./src/features/user-portal/recharge/portal-recharge-client"
  ],
  "admin/vite.portal-web.config.ts": [
    "./vite.portal.config"
  ],
  "admin/vite.portal.local-api-validation.config.ts": [
    "./vite.portal.config"
  ],
  "admin/vite.site.config.ts": []
};

const EXPECTED_VITE_CONFIG_SHA256 = {
  "admin/vite.config.ts":
    "0e01c02bc34d25324e9432a36118097c98e6e28c74d9a25baddfab9e3273b5f7",
  "admin/vite.portal.config.ts":
    "07e106c9ae9ab03871c82c6491cfc0bd6dc84e080e3c085295ef30904b61eadd",
  "admin/vite.portal-web.config.ts":
    "c5ea089e70a4bf1af9519e3ad2299d283edf4ba152ce58a10b272beebd517a3b",
  "admin/vite.portal.local-api-validation.config.ts":
    "0c09218b5c602590db98fdf8abf4029cae7e191d83f36fd9dff21253099085ca",
  "admin/vite.site.config.ts":
    "fc2e85a9108f9e0ed90535886fec690c89292a2791f2b1f9d31d68aea616bcd6"
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

let cachedTypescript;
let typescriptLoadAttempted = false;

function loadTypescriptParser() {
  if (!typescriptLoadAttempted) {
    typescriptLoadAttempted = true;
    for (const packageFile of ["package.json", "admin/package.json"]) {
      try {
        const requireFromPackage = createRequire(pathToFileURL(
          path.join(DEFAULT_ROOT, packageFile)
        ));
        cachedTypescript = requireFromPackage("typescript");
        break;
      } catch {
        cachedTypescript = null;
      }
    }
  }
  return cachedTypescript;
}

function typescriptScriptKind(ts, extension) {
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function unwrapTypescriptExpression(ts, node) {
  while (
    node
    && (
      ts.isParenthesizedExpression(node)
      || ts.isAsExpression(node)
      || ts.isTypeAssertionExpression(node)
      || ts.isNonNullExpression(node)
      || ts.isExpressionWithTypeArguments(node)
      || ts.isSatisfiesExpression?.(node)
      || ts.isPartiallyEmittedExpression?.(node)
    )
  ) {
    node = node.expression;
  }
  return node;
}

function isImportMetaExpression(ts, node) {
  const unwrapped = unwrapTypescriptExpression(ts, node);
  return Boolean(
    unwrapped
    && ts.isMetaProperty(unwrapped)
    && unwrapped.keywordToken === ts.SyntaxKind.ImportKeyword
    && unwrapped.name.text === "meta"
  );
}

function importMetaMemberName(ts, node) {
  const unwrapped = unwrapTypescriptExpression(ts, node);
  if (ts.isPropertyAccessExpression(unwrapped)) {
    return isImportMetaExpression(ts, unwrapped.expression)
      ? unwrapped.name.text
      : null;
  }
  if (ts.isElementAccessExpression(unwrapped)) {
    const argument = unwrapTypescriptExpression(ts, unwrapped.argumentExpression);
    return (
      isImportMetaExpression(ts, unwrapped.expression)
      && argument
      && ts.isStringLiteral(argument)
    ) ? argument.text : null;
  }
  return null;
}

function typescriptExpressionTailName(ts, node) {
  const unwrapped = unwrapTypescriptExpression(ts, node);
  if (ts.isIdentifier(unwrapped)) return unwrapped.text;
  if (ts.isPropertyAccessExpression(unwrapped)) return unwrapped.name.text;
  if (ts.isElementAccessExpression(unwrapped)) {
    const argument = unwrapTypescriptExpression(ts, unwrapped.argumentExpression);
    return argument && ts.isStringLiteral(argument) ? argument.text : null;
  }
  return null;
}

function typescriptNodeContainsImportMetaUrl(ts, node) {
  let found = false;
  function visit(current) {
    if (found) return;
    if (importMetaMemberName(ts, current) === "url") {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function inspectJavaScriptImportSource(source, { extension }) {
  const ts = loadTypescriptParser();
  const specifiers = [];
  let nonLiteralDynamicImports = 0;
  let unsupportedModuleSpecifiers = 0;
  let importMetaGlobCalls = 0;
  let commonJsRequireCalls = 0;
  let unsupportedPackageImportAliases = 0;
  let viteWorkerEntries = 0;
  let viteUrlEntries = 0;
  let ambiguousJavaScriptSyntax = 0;
  let typescriptParserUnavailable = 0;
  let unsupportedJsxPragmas = 0;
  let unsupportedTypescriptDirectives = 0;

  if (!ts) {
    typescriptParserUnavailable = 1;
    return {
      specifiers,
      nonLiteralDynamicImports,
      unsupportedModuleSpecifiers,
      commonJsRequireCalls,
      unsupportedCssImports: 0,
      cssAssetReferences: 0,
      unsupportedCssModuleImports: 0,
      unsupportedCssEscapedSyntax: 0,
      importMetaGlobCalls,
      unsupportedPackageImportAliases,
      viteWorkerEntries,
      viteUrlEntries,
      ambiguousJavaScriptSyntax,
      typescriptParserUnavailable,
      unsupportedJsxPragmas,
      unsupportedTypescriptDirectives
    };
  }

  const sourceFile = ts.createSourceFile(
    "source" + extension,
    source,
    ts.ScriptTarget.Latest,
    true,
    typescriptScriptKind(ts, extension)
  );
  ambiguousJavaScriptSyntax += sourceFile.parseDiagnostics?.length ?? 0;
  for (const pragma of ["jsx", "jsxfrag", "jsximportsource", "jsxruntime"]) {
    if (sourceFile.pragmas?.has(pragma)) unsupportedJsxPragmas += 1;
  }
  unsupportedTypescriptDirectives += (
    (sourceFile.referencedFiles?.length ?? 0)
    + (sourceFile.typeReferenceDirectives?.length ?? 0)
    + (sourceFile.libReferenceDirectives?.length ?? 0)
    + (sourceFile.amdDependencies?.length ?? 0)
    + (sourceFile.hasNoDefaultLib ? 1 : 0)
    + (sourceFile.amdModuleName !== undefined ? 1 : 0)
  );

  function recordModuleSpecifier(node) {
    if (!node || !ts.isStringLiteral(node)) {
      unsupportedModuleSpecifiers += 1;
      return;
    }
    const raw = node.getText(sourceFile);
    if (raw.slice(1, -1).includes("\\")) {
      unsupportedModuleSpecifiers += 1;
      return;
    }
    specifiers.push(node.text);
    if (node.text.startsWith("#")) {
      unsupportedPackageImportAliases += 1;
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) recordModuleSpecifier(node.moduleSpecifier);
      if (node.attributes || node.assertClause) {
        unsupportedModuleSpecifiers += 1;
      }
    } else if (ts.isImportTypeNode(node)) {
      if (
        ts.isLiteralTypeNode(node.argument)
        && ts.isStringLiteral(node.argument.literal)
      ) {
        recordModuleSpecifier(node.argument.literal);
      } else {
        unsupportedModuleSpecifiers += 1;
      }
      if (node.attributes) unsupportedModuleSpecifiers += 1;
    } else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      recordModuleSpecifier(node.name);
    } else if (ts.isImportEqualsDeclaration(node)) {
      commonJsRequireCalls += 1;
    }

    if (ts.isCallExpression(node)) {
      const callee = unwrapTypescriptExpression(ts, node.expression);
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
          recordModuleSpecifier(node.arguments[0]);
        } else {
          nonLiteralDynamicImports += 1;
        }
      } else if (typescriptExpressionTailName(ts, callee) === "require") {
        commonJsRequireCalls += 1;
      }
    }

    const metaMember = importMetaMemberName(ts, node);
    if (metaMember === "glob" || metaMember === "globEager") {
      importMetaGlobCalls += 1;
    }

    if (ts.isNewExpression(node)) {
      const constructorName = typescriptExpressionTailName(ts, node.expression);
      if (constructorName === "Worker" || constructorName === "SharedWorker") {
        viteWorkerEntries += 1;
      }
      if (
        constructorName === "URL"
        && typescriptNodeContainsImportMetaUrl(ts, node)
      ) {
        viteUrlEntries += 1;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return {
    specifiers: uniqueSorted(specifiers),
    nonLiteralDynamicImports,
    unsupportedModuleSpecifiers,
    commonJsRequireCalls,
    unsupportedCssImports: 0,
    cssAssetReferences: 0,
    unsupportedCssModuleImports: 0,
    unsupportedCssEscapedSyntax: 0,
    importMetaGlobCalls,
    unsupportedPackageImportAliases,
    viteWorkerEntries,
    viteUrlEntries,
    ambiguousJavaScriptSyntax,
    typescriptParserUnavailable,
    unsupportedJsxPragmas,
    unsupportedTypescriptDirectives
  };
}

function stripCssComments(source) {
  let output = "";
  let index = 0;
  let malformed = false;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === '"' || current === "'") {
      const quote = current;
      output += current;
      index += 1;
      while (index < source.length) {
        output += source[index];
        if (source[index] === "\\") {
          index += 1;
          if (index < source.length) output += source[index];
        } else if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
    } else if (current === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) {
        malformed = true;
        break;
      }
      output += " ";
      index = end + 2;
    } else {
      output += current;
      index += 1;
    }
  }
  return { source: output, malformed };
}

function stripCssStrings(source) {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const current = source[index];
    if (current !== '"' && current !== "'") {
      output += current;
      index += 1;
      continue;
    }
    const quote = current;
    output += " ";
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
      } else if (source[index] === quote) {
        index += 1;
        break;
      } else {
        index += 1;
      }
    }
  }
  return output;
}

function inspectCssImportSource(source) {
  const stripped = stripCssComments(source);
  const withoutComments = stripped.source;
  const importOccurrences = [...withoutComments.matchAll(/@import\b/giu)].length;
  const rules = [...withoutComments.matchAll(/@import\s+([^;]*);/giu)];
  const specifiers = [];
  let unsupportedCssImports = Math.max(0, importOccurrences - rules.length)
    + (stripped.malformed ? 1 : 0);
  const unsupportedCssModuleImports = [
    ...withoutComments.matchAll(/\bcomposes\s*:/giu),
    ...withoutComments.matchAll(/@value\b/giu)
  ].length;
  const unsupportedCssEscapedSyntax = [
    ...stripCssStrings(withoutComments).matchAll(/\\/gu)
  ].length;

  for (const rule of rules) {
    const value = rule[1].trim();
    if (value.includes("\\")) {
      unsupportedCssImports += 1;
      continue;
    }
    const quoted = /^(?:"([^"]+)"|'([^']+)')/u.exec(value);
    const url = /^url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/iu.exec(value);
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

  const withoutImportRules = withoutComments.replace(/@import\s+[^;]*;/giu, "");
  const cssAssetReferences = [...withoutImportRules.matchAll(/\burl\s*\(/giu)].length;

  return {
    specifiers: uniqueSorted(specifiers),
    nonLiteralDynamicImports: 0,
    unsupportedModuleSpecifiers: 0,
    commonJsRequireCalls: 0,
    unsupportedCssImports,
    cssAssetReferences,
    unsupportedCssModuleImports,
    unsupportedCssEscapedSyntax,
    importMetaGlobCalls: 0,
    unsupportedPackageImportAliases: 0,
    viteWorkerEntries: 0,
    viteUrlEntries: 0,
    ambiguousJavaScriptSyntax: 0,
    typescriptParserUnavailable: 0,
    unsupportedJsxPragmas: 0,
    unsupportedTypescriptDirectives: 0
  };
}

export function inspectImportSource(source, { extension = ".ts" } = {}) {
  if (extension === ".css") return inspectCssImportSource(source);
  return inspectJavaScriptImportSource(source, { extension });
}

function importInspectionIssues(inspected, file) {
  const issues = [];
  for (const [property, code] of [
    ["nonLiteralDynamicImports", "non_literal_dynamic_import"],
    ["unsupportedModuleSpecifiers", "unsupported_module_specifier"],
    ["commonJsRequireCalls", "unsupported_commonjs_require"],
    ["unsupportedCssImports", "unsupported_css_import"],
    ["cssAssetReferences", "css_asset_reference_unreviewed"],
    ["unsupportedCssModuleImports", "unsupported_css_module_import"],
    ["unsupportedCssEscapedSyntax", "unsupported_css_escape"],
    ["importMetaGlobCalls", "unsupported_import_meta_glob"],
    ["unsupportedPackageImportAliases", "unsupported_package_import_alias"],
    ["viteWorkerEntries", "unsupported_vite_worker_entry"],
    ["viteUrlEntries", "unsupported_vite_url_entry"],
    ["ambiguousJavaScriptSyntax", "unsupported_javascript_syntax"],
    ["typescriptParserUnavailable", "typescript_parser_unavailable"],
    ["unsupportedJsxPragmas", "unsupported_jsx_pragma"],
    ["unsupportedTypescriptDirectives", "unsupported_typescript_directive"]
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
  const absolute = path.join(rootDirectory, repositoryPath);
  if (repositoryPathHasSymlink(rootDirectory, absolute)) {
    throw new Error("trusted repository input cannot be a symlink");
  }
  return readFileSync(absolute, "utf8");
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
    || (
      relative !== ".."
      && !relative.startsWith(".." + path.sep)
      && !path.isAbsolute(relative)
    );
}

function repositoryPathHasSymlink(rootDirectory, candidate) {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(candidate);
  if (!isInsideDirectory(root, target)) return true;

  const relative = path.relative(root, target);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) return true;
    } catch {
      return true;
    }
  }
  return false;
}

function resolveLocalImport({
  rootDirectory,
  from,
  specifier
}) {
  const sourceRoot = path.resolve(rootDirectory, SOURCE_ROOT);
  const cleanSpecifier = specifier.split(/[?#]/u, 1)[0];
  if (cleanSpecifier.startsWith("/")) {
    return { error: "unsupported_root_relative_import" };
  }
  const unresolvedBase = path.resolve(
    path.dirname(path.join(rootDirectory, from)),
    cleanSpecifier
  );

  if (!isInsideDirectory(sourceRoot, unresolvedBase)) {
    return { error: "source_boundary_escape" };
  }

  const candidates = [unresolvedBase];
  const extension = path.extname(unresolvedBase);
  if (!extension) {
    if (existsSync(path.join(unresolvedBase, "package.json"))) {
      return { error: "unsupported_directory_package_resolution" };
    }
    for (const candidateExtension of RESOLUTION_EXTENSIONS) {
      candidates.push(unresolvedBase + candidateExtension);
      candidates.push(path.join(
        unresolvedBase,
        "index" + candidateExtension
      ));
    }
  } else if (Object.hasOwn(EXPLICIT_TYPESCRIPT_ALTERNATIVES, extension)) {
    const withoutExtension = unresolvedBase.slice(0, -extension.length);
    for (const alternative of EXPLICIT_TYPESCRIPT_ALTERNATIVES[extension]) {
      candidates.push(withoutExtension + alternative);
    }
  }

  const resolvedCandidates = uniqueSorted(candidates.filter(isFile));
  if (resolvedCandidates.length === 0) {
    return { error: "relative_import_unresolved" };
  }
  if (resolvedCandidates.length > 1) {
    return { error: "ambiguous_local_import_resolution" };
  }

  const [resolved] = resolvedCandidates;
  if (repositoryPathHasSymlink(rootDirectory, resolved)) {
    return { error: "source_symlink_unsupported" };
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
    if (repositoryPathHasSymlink(rootDirectory, absolute)) {
      issues.push(issue("source_symlink_unsupported", { file: current }));
      continue;
    }

    const extension = path.extname(current);
    if (!PARSED_EXTENSIONS.has(extension)) {
      if (!NON_EXECUTABLE_LEAF_EXTENSIONS.has(extension)) {
        issues.push(issue("unsupported_source_extension", {
          file: current,
          extension
        }));
      }
      continue;
    }
    if (current.toLowerCase().endsWith(".module.css")) {
      issues.push(issue("unsupported_css_module_source", { file: current }));
    }

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
  return /(?:^|[/_.-])(?:fixtures?|previews?)(?:[/_.-]|$)/iu.test(file);
}

function isPortalPreviewHelper(file) {
  const normalized = file.toLowerCase();
  return normalized.includes("/user-portal-local.")
    || normalized.includes("/user-portal-preview-")
    || normalized.includes("/totp-preview.")
    || normalized.includes("/preview-client.")
    || normalized.includes("/preview-data.");
}

function isSharedPublicFile(file) {
  return file.startsWith("admin/src/shared/public/");
}

function isForbiddenActivePath(file) {
  const normalized = file.toLowerCase();
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/u.test(normalized)
    || /\.(?:test|spec)\.[^/]+$/u.test(normalized)
    || normalized.includes("/archive/")
    || normalized.includes("/quarantine/");
}

function isAllowedPortalFile(file) {
  return isPortalOwned(file)
    || PORTAL_SHARED_FILES.has(file)
    || PUBLIC_ADS_CROSS_SURFACE_FILES.has(file);
}

function isAllowedSiteFile(file) {
  return isSiteOwned(file)
    || PUBLIC_ADS_CROSS_SURFACE_FILES.has(file)
    || file === "admin/src/styles.css"
    || (
      file.startsWith("admin/src/styles/")
      && !file.startsWith("admin/src/styles/portal-static-preserve/")
    );
}

function isLocalSpecifier(specifier) {
  return specifier.startsWith(".") || specifier.startsWith("/");
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
        || specifier === "./pages/admin-auth-boundary"
        || specifier === "./pages/admin-operations-shell"
        || specifier === "./pages/admin-production-baseline-preview"
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
  if (lstatSync(absolute).isSymbolicLink()) {
    throw new Error("repository input directory cannot be a symlink");
  }
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = normalizeRepositoryPath(path.join(repositoryPath, entry.name));
    const childAbsolute = path.join(rootDirectory, child);
    if (lstatSync(childAbsolute).isSymbolicLink()) {
      throw new Error("repository input cannot be a symlink");
    }
    if (entry.isDirectory()) {
      files.push(...listRepositoryFiles(rootDirectory, child));
    } else if (entry.isFile()) {
      files.push(child);
    } else {
      throw new Error("repository input must be a regular file");
    }
  }
  return files.sort(codePointOrder);
}

function stripHtmlComments(source) {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf("<!--", index);
    if (start === -1) {
      output += source.slice(index);
      return { source: output, malformed: false };
    }
    output += source.slice(index, start);
    const end = source.indexOf("-->", start + 4);
    if (end === -1) return { source: output, malformed: true };
    index = end + 3;
  }
  return { source: output, malformed: false };
}

function htmlAttribute(attributes, name) {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
    "iu"
  );
  const match = pattern.exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function htmlBuildInputs(rootDirectory, repositoryPath) {
  const stripped = stripHtmlComments(readUtf8(rootDirectory, repositoryPath));
  const scripts = [];
  const stylesheets = [];

  for (const match of stripped.source.matchAll(/<script\b([^>]*)>/giu)) {
    const attributes = match[1];
    const type = htmlAttribute(attributes, "type");
    const source = htmlAttribute(attributes, "src");
    scripts.push(type?.toLowerCase() === "module"
      ? source ?? "<inline-module>"
      : `<non-module:${source ?? "inline"}>`);
  }

  for (const match of stripped.source.matchAll(/<link\b([^>]*)>/giu)) {
    const attributes = match[1];
    const rel = htmlAttribute(attributes, "rel");
    if (!rel?.toLowerCase().split(/\s+/u).includes("stylesheet")) continue;
    stylesheets.push(htmlAttribute(attributes, "href") ?? "<missing-href>");
  }

  return {
    malformed: stripped.malformed,
    scripts: scripts.sort(codePointOrder),
    stylesheets: stylesheets.sort(codePointOrder)
  };
}

function normalizedSourceSha256(source) {
  return createHash("sha256")
    .update(source.replace(/\r\n?/gu, "\n"), "utf8")
    .digest("hex");
}

function localPackageReferences(packageJson) {
  const references = [];
  for (const bucket of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies"
  ]) {
    for (const [name, value] of Object.entries(packageJson[bucket] ?? {})) {
      if (
        typeof value === "string"
        && /^(?:(?:file|link|workspace):|\.{1,2}[/\\]|[/\\])/iu.test(value)
      ) {
        references.push(bucket + ":" + name);
      }
    }
  }
  return references;
}

function pathEntryExists(absolute) {
  try {
    lstatSync(absolute);
    return true;
  } catch {
    return false;
  }
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

  const adminResolverFields = [
    "browser",
    "exports",
    "imports",
    "jsdelivr",
    "main",
    "module",
    "react-native",
    "source",
    "unpkg"
  ].filter((field) => adminPackage[field] !== undefined);
  if (
    adminPackage.name !== "proxy-gateway-admin"
    || adminPackage.private !== true
    || adminPackage.type !== "module"
    || adminResolverFields.length > 0
  ) {
    issues.push(issue("package_source_alias_drift", {
      file: "admin/package.json",
      fields: adminResolverFields
    }));
  }

  for (const [file, packageJson] of [
    ["package.json", rootPackage],
    ["admin/package.json", adminPackage]
  ]) {
    const references = localPackageReferences(packageJson);
    if (references.length > 0) {
      issues.push(issue("package_source_dependency_drift", {
        file,
        references
      }));
    }
    if (packageJson.workspaces !== undefined) {
      issues.push(issue("package_workspace_drift", { file }));
    }
  }

  try {
    const nestedSourceConfigs = listRepositoryFiles(
      rootDirectory,
      SOURCE_ROOT
    ).filter((file) => (
      ["jsconfig.json", "package.json", "tsconfig.json"]
        .includes(path.posix.basename(file).toLowerCase())
    ));
    for (const file of nestedSourceConfigs) {
      issues.push(issue("nested_source_config_unexpected", { file }));
    }
  } catch {
    issues.push(issue("source_config_inventory_unreadable"));
  }

  for (const file of [
    "admin/portal/package.json",
    "admin/site/package.json"
  ]) {
    if (pathEntryExists(path.join(rootDirectory, file))) {
      issues.push(issue("frontend_package_scope_unexpected", { file }));
    }
  }

  for (const file of [".npmrc", "admin/.npmrc"]) {
    if (pathEntryExists(path.join(rootDirectory, file))) {
      issues.push(issue("npm_config_drift", { file }));
    }
  }

  for (const [file, packageJson] of [
    ["package.json", rootPackage],
    ["admin/package.json", adminPackage]
  ]) {
    if (packageJson.postcss !== undefined) {
      issues.push(issue("frontend_build_config_unexpected", {
        file,
        field: "postcss"
      }));
    }
  }

  const postcssConfigNames = [
    ".postcssrc",
    ".postcssrc.cjs",
    ".postcssrc.cts",
    ".postcssrc.js",
    ".postcssrc.json",
    ".postcssrc.mjs",
    ".postcssrc.mts",
    ".postcssrc.ts",
    ".postcssrc.yaml",
    ".postcssrc.yml",
    "postcss.config.cjs",
    "postcss.config.cts",
    "postcss.config.js",
    "postcss.config.json",
    "postcss.config.mjs",
    "postcss.config.mts",
    "postcss.config.ts",
    "postcss.config.yaml",
    "postcss.config.yml"
  ];
  for (const directory of ["", "admin", "admin/portal", "admin/site"]) {
    for (const name of postcssConfigNames) {
      const file = directory ? path.posix.join(directory, name) : name;
      if (pathEntryExists(path.join(rootDirectory, file))) {
        issues.push(issue("frontend_build_config_unexpected", { file }));
      }
    }
  }

  for (const name of [
    "vite.config.cjs",
    "vite.config.cts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.mts"
  ]) {
    const file = path.posix.join("admin", name);
    if (pathEntryExists(path.join(rootDirectory, file))) {
      issues.push(issue("frontend_build_config_unexpected", { file }));
    }
  }

  for (const directory of ["admin", "admin/portal", "admin/portal-web", "admin/site"]) {
    try {
      for (const name of readdirSync(path.join(rootDirectory, directory))) {
        if (name === ".env" || name.startsWith(".env.")) {
          issues.push(issue("frontend_env_input_unexpected", {
            file: path.posix.join(directory, name)
          }));
        }
      }
    } catch {
      issues.push(issue("frontend_env_inventory_unreadable", { directory }));
    }
  }

  try {
    const tsconfigSource = readUtf8(rootDirectory, "admin/tsconfig.json");
    const tsconfig = JSON.parse(tsconfigSource);
    if (
      normalizedSourceSha256(tsconfigSource) !== EXPECTED_TSCONFIG_SHA256
      ||
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
      "frontend:boundaries:check": "node scripts/check-frontend-source-boundaries.mjs",
      "admin:build": "npm run build --prefix admin",
      "admin:verify": "npm run verify:admin-build --prefix admin",
      "admin:portal:build": "npm run build:portal --prefix admin",
      "admin:portal:web:build": "npm run build:portal:web --prefix admin",
      "admin:portal:verify": "npm run verify:portal-build --prefix admin",
      "admin:portal:web:verify": "npm run verify:portal:web --prefix admin",
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
      "build:portal:web": "tsc --noEmit && vite build --config vite.portal-web.config.ts",
      "build:site": "tsc --noEmit && vite build --config vite.site.config.ts",
      "verify:admin-build": "node ../scripts/verify-admin-build.mjs dist",
      "verify:portal-build": "node ../scripts/verify-portal-build.mjs dist-portal",
      "verify:portal:web": "node ../scripts/verify-portal-build.mjs dist-portal-web",
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
    const lifecycleNames = new Set(
      Object.keys(expected).flatMap((name) => ["pre" + name, "post" + name])
    );
    const relevantNames = Object.keys(scripts ?? {}).filter((name) => (
      lifecycleNames.has(name)
      || (
        scope === "root"
          ? /^(?:admin:.*(?:build|verify)|cloudflare:site:(?:build|verify|dry-run|validate))$/u.test(name)
          : /^(?:build(?::.*)?|verify:.*)$/u.test(name)
      )
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
      const actualSha256 = normalizedSourceSha256(
        readUtf8(rootDirectory, contract.file)
      );
      if (actualSha256 !== EXPECTED_ENTRY_HTML_SHA256[contract.file]) {
        issues.push(issue("html_entry_drift", {
          surface,
          file: contract.file,
          reason: "source_snapshot"
        }));
      }
      const actual = htmlBuildInputs(rootDirectory, contract.file);
      if (
        actual.malformed
        || actual.scripts.length !== 1
        || actual.scripts[0] !== contract.module
      ) {
        issues.push(issue("html_entry_drift", {
          surface,
          file: contract.file,
          moduleScripts: actual.scripts.length
        }));
      }
      if (actual.stylesheets.length > 0) {
        issues.push(issue("html_build_input_unexpected", {
          surface,
          file: contract.file,
          stylesheets: actual.stylesheets
        }));
      }
    } catch {
      issues.push(issue("html_entry_unreadable", {
        surface,
        file: contract.file
      }));
    }
  }

  for (const [file, expectedSha256] of Object.entries(
    EXPECTED_VITE_CONFIG_SHA256
  )) {
    try {
      const actualSha256 = normalizedSourceSha256(
        readUtf8(rootDirectory, file)
      );
      if (actualSha256 !== expectedSha256) {
        issues.push(issue("vite_boundary_drift", {
          file,
          reason: "source_snapshot"
        }));
      }
    } catch {
      issues.push(issue("vite_boundary_unreadable", { file }));
    }
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
    if (isPortalPreviewHelper(file)) {
      issues.push(issue("portal_preview_reachability", { file }));
      continue;
    }
    if (!isAllowedPortalFile(file)) {
      issues.push(issue("portal_cross_surface_reachability", { file }));
    }
  }

  for (const graph of Object.values(graphs)) {
    for (const edge of graph.edges) {
      if (isSharedPublicFile(edge.from) && !isSharedPublicFile(edge.to)) {
        issues.push(issue("shared_public_foreign_reachability", {
          from: edge.from,
          to: edge.to
        }));
      }
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
  }

  for (const [surface, graph] of Object.entries(graphs)) {
    const surfaceFixtureEdges = new Set(
      graph.edges
        .filter((edge) => isFixtureOrPreview(edge.to))
        .map(edgeKey)
    );
    for (const key of surfaceFixtureEdges) fixtureEdges.add(key);
    issues.push(...compareExactSet({
      actual: surfaceFixtureEdges,
      expected: EXPECTED_FIXTURE_EDGES_BY_SURFACE[surface],
      missingCode: "known_fixture_edge_missing",
      unexpectedCode: "fixture_edge_unexpected",
      details: { surface }
    }));
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
      portalWeb: "admin/dist-portal-web",
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

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isCliEntrypoint()) {
  process.exitCode = runCli();
}
