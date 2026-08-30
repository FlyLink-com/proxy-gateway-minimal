import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  inspectImportSource,
  verifyFrontendSourceBoundaries
} from "../../scripts/check-frontend-source-boundaries.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "..", "..");

const ADMIN_CSS_IMPORTS = [
  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/admin-os-chrome.css",
  "./styles/public-site.css",
  "./styles/shared-components.css",
  "./styles/admin-os-workspace.css",
  "./styles/legacy-entrypoints.css",
  "./styles/user-portal-registration.css",
  "./styles/responsive.css"
];

const PORTAL_CSS_IMPORTS = [
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
];

const PUBLIC_BUILD_INPUTS = [
  "admin/public/favicon.svg",
  "admin/public/guide/clash-subscription-import.png",
  "admin/public/guide/clash-system-proxy.png",
  "admin/public/payment-alipay-icon.png",
  "admin/public/payment-wechat-pay-icon.svg"
];

function writeFixtureFile(rootDirectory, repositoryPath, contents = "") {
  const absolute = path.join(rootDirectory, repositoryPath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function writeJson(rootDirectory, repositoryPath, value) {
  writeFixtureFile(
    rootDirectory,
    repositoryPath,
    JSON.stringify(value, null, 2) + "\n"
  );
}

function appendFixtureFile(rootDirectory, repositoryPath, contents) {
  const absolute = path.join(rootDirectory, repositoryPath);
  writeFileSync(absolute, readFileSync(absolute, "utf8") + contents);
}

function replaceFixtureText(rootDirectory, repositoryPath, search, replace) {
  const absolute = path.join(rootDirectory, repositoryPath);
  const before = readFileSync(absolute, "utf8");
  assert.ok(before.includes(search), `${repositoryPath} must contain fixture text`);
  writeFileSync(absolute, before.replace(search, replace));
}

function cssImportFile(specifier) {
  return `@import "${specifier}";`;
}

function createPassingFixture(t) {
  const rootDirectory = mkdtempSync(
    path.join(os.tmpdir(), "frontend-source-boundaries-")
  );
  t.after(() => rmSync(rootDirectory, { recursive: true, force: true }));

  writeJson(rootDirectory, "package.json", {
    scripts: {
      "frontend:boundaries:check": "node scripts/check-frontend-source-boundaries.mjs",
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
    }
  });
  writeJson(rootDirectory, "admin/package.json", {
    name: "proxy-gateway-admin",
    private: true,
    type: "module",
    scripts: {
      build: "tsc --noEmit && vite build",
      "build:portal": "tsc --noEmit && vite build --config vite.portal.config.ts",
      "build:site": "tsc --noEmit && vite build --config vite.site.config.ts",
      "verify:admin-build": "node ../scripts/verify-admin-build.mjs dist",
      "verify:portal-build": "node ../scripts/verify-portal-build.mjs dist-portal",
      "verify:site-build": "node ../scripts/verify-public-site-build.mjs dist-site"
    }
  });
  writeFixtureFile(
    rootDirectory,
    "admin/tsconfig.json",
    readFileSync(path.join(REPOSITORY_ROOT, "admin/tsconfig.json"), "utf8")
  );

  for (const htmlFile of [
    "admin/index.html",
    "admin/portal/index.html",
    "admin/site/index.html"
  ]) {
    writeFixtureFile(
      rootDirectory,
      htmlFile,
      readFileSync(path.join(REPOSITORY_ROOT, htmlFile), "utf8")
    );
  }

  for (const configFile of [
    "admin/vite.config.ts",
    "admin/vite.portal.config.ts",
    "admin/vite.portal.local-api-validation.config.ts",
    "admin/vite.site.config.ts"
  ]) {
    writeFixtureFile(
      rootDirectory,
      configFile,
      readFileSync(path.join(REPOSITORY_ROOT, configFile), "utf8")
    );
  }

  for (const publicFile of PUBLIC_BUILD_INPUTS) {
    writeFixtureFile(rootDirectory, publicFile, "fixture\n");
  }

  writeFixtureFile(
    rootDirectory,
    "admin/src/main.tsx",
    `import App from "./App";
import "./styles.css";
void App;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/portal-main.tsx",
    `import client from "./features/user-portal/user-portal-client";
import page from "./features/user-portal/user-portal-page";
import registration from "./features/user-portal/user-registration-page";
import "./portal-static-preserve.css";
void [client, page, registration];
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/site-main.tsx",
    `import site from "./features/company-site/company-site-page";
import "./styles.css";
void site;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    `import preview from "./app/admin-fixture-preview";
import uiProjection from "./app/admin-ui-projection";
import panel from "./components/primitives/panel-frame";
import companySite from "./features/company-site/company-site-page";
import portalClient from "./features/user-portal/user-portal-client";
import portalPage from "./features/user-portal/user-portal-page";
import portalRoute from "./features/user-portal/user-portal-route";
import usagePage from "./pages/subscription-usage-monitor-page";
void [
  preview,
  uiProjection,
  panel,
  companySite,
  portalClient,
  portalPage,
  portalRoute,
  usagePage
];
export default function App() {}
`
  );

  writeFixtureFile(
    rootDirectory,
    "admin/src/app/admin-fixture-preview.ts",
    "export type Preview = string;\nexport default \"preview\";\n"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/admin-safe-read-projection.ts",
    `import preview from "./admin-fixture-preview";
export default preview;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/admin-ui-projection.ts",
    `import preview from "./admin-fixture-preview";
export default preview;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/components/primitives/panel-frame.tsx",
    `import type { Preview } from "../../app/admin-fixture-preview";
const panel: Preview = "panel";
export default panel;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/company-site/company-site-page.tsx",
    "export default function CompanySitePage() {}\n"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/user-portal-client.ts",
    `import localPortal from "./user-portal-local";
export default localPortal;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/user-portal-local.ts",
    `import preview from "./totp-preview";
export default preview;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/totp-preview.ts",
    "export default \"totp\";\n"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/user-portal-page.tsx",
    "export default function UserPortalPage() {}\n"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/user-portal-route.tsx",
    "export default function UserPortalRoute() {}\n"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/user-registration-page.tsx",
    "export default function UserRegistrationPage() {}\n"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/recharge/portal-recharge-client.ts",
    "export default {};\n"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/pages/subscription-usage-monitor-page.tsx",
    `import fixture from "../features/subscriptions/usage-runtime-fixture";
export default fixture;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/subscriptions/usage-runtime-fixture.ts",
    "export default {};\n"
  );

  writeFixtureFile(
    rootDirectory,
    "admin/src/styles.css",
    ADMIN_CSS_IMPORTS.map(cssImportFile).join("\n") + "\n"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/portal-static-preserve.css",
    PORTAL_CSS_IMPORTS.map(cssImportFile).join("\n") + "\n"
  );
  for (const cssImport of [...ADMIN_CSS_IMPORTS, ...PORTAL_CSS_IMPORTS]) {
    writeFixtureFile(
      rootDirectory,
      path.posix.join("admin/src", cssImport.slice(2)),
      ":root {}\n"
    );
  }

  return rootDirectory;
}

function issueCodes(result) {
  return new Set(result.issues.map((item) => item.code));
}

function assertIssue(result, code) {
  assert.equal(result.ok, false, "mutated fixture must fail closed");
  assert.ok(
    issueCodes(result).has(code),
    `expected ${code}; got ${JSON.stringify(result.issues, null, 2)}`
  );
}

test("parser finds static, type, re-export, side-effect and dynamic imports", () => {
  const inspected = inspectImportSource(`
import {
  alpha,
  type Bravo
} from "./multi-line";
import type { Charlie } from "./type-only";
export { delta } from "./re-export";
export type { Echo } from "./re-export-type";
import "./side-effect";
const lazy = import("./literal-dynamic");
const unknown = import(runtimeSpecifier);
void [lazy, unknown];
`);

  assert.deepEqual(inspected.specifiers, [
    "./literal-dynamic",
    "./multi-line",
    "./re-export",
    "./re-export-type",
    "./side-effect",
    "./type-only"
  ]);
  assert.equal(inspected.nonLiteralDynamicImports, 1);

  const css = inspectImportSource(
    `@import "./alpha.css" layer(theme);
@import url("./beta.css") screen;
@import url(./gamma.css);
`,
    { extension: ".css" }
  );
  assert.deepEqual(css.specifiers, [
    "./alpha.css",
    "./beta.css",
    "./gamma.css"
  ]);
  assert.equal(css.nonLiteralDynamicImports, 0);
  assert.equal(css.unsupportedCssImports, 0);
});

test("parser ignores comments and strings while following template expressions", () => {
  const inspected = inspectImportSource(`
// import("./commented-dynamic");
/*
import hidden from "./commented-static";
*/
const text = "import(runtimeSpecifier)";
const template = \`import fake from "./template-text";\`;
const evaluated = \`\${import("./template-expression")}\`;
void [text, template, evaluated];
`);

  assert.deepEqual(inspected.specifiers, ["./template-expression"]);
  assert.equal(inspected.nonLiteralDynamicImports, 0);
});

test("parser finds same-line module declarations", () => {
  const inspected = inspectImportSource(
    'const before = 1; import value from "./same-line-static"; '
    + 'export { other } from "./same-line-re-export"; '
    + 'import "./same-line-side-effect"; '
    + 'import{default as tight}from"./tight-static"; '
    + 'import/*gap*/commented from "./comment-before-binding"; '
    + 'import afterFrom from/*gap*/"./comment-after-from"; '
    + 'import"./tight-side-effect"; '
    + 'export{named}from"./tight-re-export"; '
    + 'const dynamic = import/*gap*/("./commented-dynamic"); '
    + 'void [before, value, tight, commented, afterFrom, dynamic];\n'
  );

  assert.deepEqual(inspected.specifiers, [
    "./comment-after-from",
    "./comment-before-binding",
    "./commented-dynamic",
    "./same-line-re-export",
    "./same-line-side-effect",
    "./same-line-static",
    "./tight-re-export",
    "./tight-side-effect",
    "./tight-static"
  ]);
});

test("parser rejects escaped module specifiers and CommonJS require", () => {
  const inspected = inspectImportSource(
    'import "\\x2e/features/user-portal/hidden"; '
    + 'const hidden = require("./features/user-portal/hidden"); void hidden;\n'
  );

  assert.equal(inspected.unsupportedModuleSpecifiers, 1);
  assert.equal(inspected.commonJsRequireCalls, 1);
});

test("parser handles whitespace-separated import forms", () => {
  const inspected = inspectImportSource(`
const lazy = import ("./literal-dynamic");
const required = require ("./required");
const glob = import . meta . glob<Record<string, unknown>>("./glob/*.ts");
void [lazy, required, glob];
`);

  assert.deepEqual(inspected.specifiers, ["./literal-dynamic"]);
  assert.equal(inspected.nonLiteralDynamicImports, 0);
  assert.equal(inspected.commonJsRequireCalls, 1);
  assert.equal(inspected.importMetaGlobCalls, 1);
});

test("parser resumes after a regular expression containing comment markers", () => {
  const inspected = inspectImportSource(`
const marker = /[/*]/;
const lazy = import("./after-regex");
if (marker) /[/*]/;
const afterControlHeader = import("./after-control-regex");
if (marker) {} /[//]/.test("/");
const afterBlockRegex = import("./after-block-regex");
void [marker, lazy, afterControlHeader, afterBlockRegex];
`);

  assert.deepEqual(inspected.specifiers, [
    "./after-block-regex",
    "./after-control-regex",
    "./after-regex"
  ]);
});

test("parser resumes after JSX closing tags and fragments", () => {
  const inspected = inspectImportSource(`
const element = <div></div>;
const fragment = <><span /></>;
const lazy = import("./after-jsx");
void [element, fragment, lazy];
`, { extension: ".tsx" });

  assert.deepEqual(inspected.specifiers, ["./after-jsx"]);
});

test("parser distinguishes comparison-following regex from JSX", () => {
  const inspected = inspectImportSource(`
const compared = value < /foo[//]bar/;
const lazy = import("./after-comparison-regex");
void [compared, lazy];
`);

  assert.deepEqual(inspected.specifiers, ["./after-comparison-regex"]);
});

test("parser follows imports inside division expressions", () => {
  const inspected = inspectImportSource(`
const divided = 1 / [import("./hidden-in-division")] / 2;
void divided;
`);

  assert.deepEqual(inspected.specifiers, ["./hidden-in-division"]);
});

test("parser follows JSX expressions without treating text as comments", () => {
  const inspected = inspectImportSource(`
const element = <div>https://example.test {import("./inside-jsx")}</div>;
const unicode = <É></É>;
const lazy = import("./after-unicode-jsx");
void [element, unicode, lazy];
`, { extension: ".tsx" });

  assert.deepEqual(inspected.specifiers, [
    "./after-unicode-jsx",
    "./inside-jsx"
  ]);
});

test("parser rejects namespaced workers and Vite URL build inputs", () => {
  const inspected = inspectImportSource(`
const worker = new globalThis.Worker(
  new URL("./runtime-worker.ts", import.meta.url),
  { type: "module" }
);
void worker;
`);

  assert.equal(inspected.viteWorkerEntries, 1);
  assert.equal(inspected.viteUrlEntries, 1);
});

test("parser unwraps TypeScript around Vite build inputs", () => {
  const inspected = inspectImportSource(`
const worker = new (Worker as typeof Worker)(
  new (URL as typeof URL)("./runtime-worker.ts", import.meta.url),
  { type: "module" }
);
const glob = (import.meta as ImportMeta).glob("./archive/*.ts");
void [worker, glob];
`);

  assert.equal(inspected.viteWorkerEntries, 1);
  assert.equal(inspected.viteUrlEntries, 1);
  assert.equal(inspected.importMetaGlobCalls, 1);
});

test("parser rejects concatenated dynamic imports", () => {
  const inspected = inspectImportSource(
    'const hidden = import("./safe" + "/archive/runtime"); void hidden;\n'
  );

  assert.deepEqual(inspected.specifiers, []);
  assert.equal(inspected.nonLiteralDynamicImports, 1);
});

test("parser follows TypeScript import type expressions", () => {
  const inspected = inspectImportSource(
    'type Hidden = import("./app/archive/runtime-source").Hidden;\n',
    { extension: ".ts" }
  );

  assert.deepEqual(inspected.specifiers, ["./app/archive/runtime-source"]);
});

test("parser follows local TypeScript module augmentations", () => {
  const inspected = inspectImportSource(`
export {};
declare module "./app/archive/runtime-source" {
  interface Hidden { value: string }
}
`, { extension: ".ts" });

  assert.deepEqual(inspected.specifiers, ["./app/archive/runtime-source"]);
});

test("parser rejects TypeScript triple-slash and AMD directives", () => {
  const inspected = inspectImportSource(`
/// <reference path="./app/archive/runtime-source.ts" />
/// <reference types="./app/archive/runtime-types" />
/// <amd-dependency path="./app/archive/runtime-amd" />
export {};
`, { extension: ".ts" });

  assert.equal(inspected.unsupportedTypescriptDirectives, 3);
});

test("parser unwraps generic constructors around Vite build inputs", () => {
  const inspected = inspectImportSource(`
interface Constructor { new<T>(...values: unknown[]): object }
declare const Worker: Constructor;
declare const URL: Constructor;
const worker = new (Worker<unknown>)(
  new (URL<unknown>)("./runtime-worker.ts", import.meta.url)
);
void worker;
`, { extension: ".ts" });

  assert.equal(inspected.viteWorkerEntries, 1);
  assert.equal(inspected.viteUrlEntries, 1);
});

test("parser rejects JSX transform pragmas that can inject build inputs", () => {
  const inspected = inspectImportSource(`
/** @jsxImportSource ../../app/archive/hidden-jsx */
/** @jsxRuntime automatic */
/** @jsx h */
/** @jsxFrag Fragment */
const element = <div />;
void element;
`, { extension: ".tsx" });

  assert.equal(inspected.unsupportedJsxPragmas, 4);
});

test("synthetic current contract passes with exact known debt", (t) => {
  const rootDirectory = createPassingFixture(t);
  const result = verifyFrontendSourceBoundaries({ rootDirectory });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.knownDebt, {
    adminToPortal: 3,
    adminToSite: 1,
    fixtureEdges: 5
  });
  assert.equal(result.productionAuthority, false);
  assert.equal(result.redacted, true);
});

test("synthetic unexpected Admin cross-surface edge fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport extraPortal from "./features/user-portal/extra-portal";\nvoid extraPortal;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/extra-portal.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "admin_portal_edge_unexpected");
  assert.ok(issueCodes(result).has("app_sensitive_import_unexpected"));
});

test("synthetic absolute /src cross-surface edge fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport extraPortal from "/src/features/user-portal/extra-portal";\nvoid extraPortal;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/extra-portal.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "admin_portal_edge_unexpected");
});

test("synthetic import.meta.glob fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nconst hiddenBuildInputs = import.meta.glob("./features/user-portal/*.tsx");\nvoid hiddenBuildInputs;\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "unsupported_import_meta_glob");
});

test("synthetic typed import.meta.glob fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    `
const hiddenBuildInputs = import.meta.glob<Record<string, unknown>>(
  "./app/archive/*.ts"
);
void hiddenBuildInputs;
`
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "unsupported_import_meta_glob");
});

test("synthetic Vite worker entry fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    `
const hiddenWorker = new Worker(
  new URL("./app/archive/runtime-worker.ts", import.meta.url),
  { type: "module" }
);
void hiddenWorker;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/runtime-worker.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "unsupported_vite_worker_entry");
});

test("synthetic source symlink cannot hide an archive file", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/runtime-source.ts",
    "export default {};\n"
  );
  symlinkSync(
    "archive/runtime-source.ts",
    path.join(rootDirectory, "admin/src/app/safe-runtime.ts")
  );
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport hidden from "./app/safe-runtime";\nvoid hidden;\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "source_symlink_unsupported");
});

test("synthetic .mts dependency is traversed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport bridge from "./bridge";\nvoid bridge;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/bridge.mts",
    'import hidden from "./app/archive/runtime-source";\nexport default hidden;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/runtime-source.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "forbidden_active_reachability");
});

test("synthetic ambiguous .ts and .mts resolution fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport bridge from "./bridge";\nvoid bridge;\n'
  );
  writeFixtureFile(rootDirectory, "admin/src/bridge.ts", "export default {};\n");
  writeFixtureFile(rootDirectory, "admin/src/bridge.mts", "export default {};\n");

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "ambiguous_local_import_resolution");
});

test("synthetic explicit .mjs resolves to reviewed .mts source", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport bridge from "./bridge.mjs";\nvoid bridge;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/bridge.mts",
    'import hidden from "./app/archive/runtime-source";\nexport default hidden;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/runtime-source.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "forbidden_active_reachability");
});

test("synthetic TypeScript import type expression is traversed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\ntype Hidden = import("./app/archive/runtime-source").Hidden;\nvoid (0 as unknown as Hidden);\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/runtime-source.ts",
    "export interface Hidden { value: string }\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "forbidden_active_reachability");
});

test("synthetic directory package entry cannot redirect resolution", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport safe from "./safe-dir";\nvoid safe;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/safe-dir/index.ts",
    "export default {};\n"
  );
  writeJson(rootDirectory, "admin/src/safe-dir/package.json", {
    main: "../app/archive/hidden.ts"
  });
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/hidden.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "unsupported_directory_package_resolution");
});

test("synthetic dot-prefixed safe directory stays inside source root", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport safe from "./..safe/runtime";\nvoid safe;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/..safe/runtime.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test("synthetic root-relative build input fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport hidden from "/archive/runtime.ts";\nvoid hidden;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/archive/runtime.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "source_boundary_escape");
});

test("synthetic package import alias fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const adminPackage = JSON.parse(readFileSync(
    path.join(rootDirectory, "admin/package.json"),
    "utf8"
  ));
  adminPackage.imports = { "#hidden": "./src/app/archive/runtime.mjs" };
  writeJson(rootDirectory, "admin/package.json", adminPackage);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport hidden from "#hidden";\nvoid hidden;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/runtime.mjs",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "package_source_alias_drift");
  assert.ok(issueCodes(result).has("unsupported_package_import_alias"));
});

test("synthetic local package dependency fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const adminPackage = JSON.parse(readFileSync(
    path.join(rootDirectory, "admin/package.json"),
    "utf8"
  ));
  adminPackage.dependencies ??= {};
  adminPackage.dependencies["hidden-runtime"] =
    "file:./src/app/archive/hidden-runtime";
  writeJson(rootDirectory, "admin/package.json", adminPackage);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport hidden from "hidden-runtime";\nvoid hidden;\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "package_source_dependency_drift");
});

test("synthetic package browser redirect fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const adminPackage = JSON.parse(readFileSync(
    path.join(rootDirectory, "admin/package.json"),
    "utf8"
  ));
  adminPackage.browser = {
    "./src/app/admin-ui-projection.ts": "./src/app/archive/browser-hidden.ts"
  };
  writeJson(rootDirectory, "admin/package.json", adminPackage);

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "package_source_alias_drift");
});

test("synthetic package workspace fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const rootPackage = JSON.parse(readFileSync(
    path.join(rootDirectory, "package.json"),
    "utf8"
  ));
  rootPackage.workspaces = ["admin/src/app/archive/hidden-workspace"];
  writeJson(rootDirectory, "package.json", rootPackage);

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "package_workspace_drift");
});

test("synthetic case-variant archive path fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport hidden from "./app/Archive/runtime";\nvoid hidden;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/Archive/runtime.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "forbidden_active_reachability");
});

test("synthetic Portal-only fixture edge fails exact-set checks", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/user-registration-page.tsx",
    '\nimport preview from "./registration-preview";\nvoid preview;\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/registration-preview.ts",
    "export default {};\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "fixture_edge_unexpected");
});

test("synthetic Portal to Admin reachability fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/features/user-portal/user-portal-page.tsx",
    '\nimport adminProjection from "../../app/admin-safe-read-projection";\nvoid adminProjection;\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "portal_cross_surface_reachability");
});

test("synthetic Site to Portal reachability fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/features/company-site/company-site-page.tsx",
    '\nimport portalRoute from "../user-portal/user-portal-route";\nvoid portalRoute;\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "site_foreign_surface_reachability");
});

for (const [label, repositoryPath] of [
  ["test", "admin/src/test/runtime-source.ts"],
  ["archive", "admin/src/app/archive/runtime-source.ts"],
  ["quarantine", "admin/src/app/quarantine/runtime-source.ts"]
]) {
  test(`synthetic active ${label} reachability fails closed`, (t) => {
    const rootDirectory = createPassingFixture(t);
    const specifier = "./" + path.posix.relative("admin/src", repositoryPath)
      .replace(/\.ts$/u, "");
    appendFixtureFile(
      rootDirectory,
      "admin/src/App.tsx",
      `\nimport forbidden from "${specifier}";\nvoid forbidden;\n`
    );
    writeFixtureFile(rootDirectory, repositoryPath, "export default {};\n");

    const result = verifyFrontendSourceBoundaries({ rootDirectory });
    assertIssue(result, "forbidden_active_reachability");
  });
}

test("synthetic unresolved and non-literal imports fail closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    `
import "./missing-local-source";
const runtimeSpecifier = "./features/company-site/company-site-page";
void import(runtimeSpecifier);
`
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "relative_import_unresolved");
  assert.ok(issueCodes(result).has("non_literal_dynamic_import"));
});

test("synthetic CSS additions and removals fail exact-set checks", (t) => {
  const rootDirectory = createPassingFixture(t);
  replaceFixtureText(
    rootDirectory,
    "admin/src/styles.css",
    cssImportFile(ADMIN_CSS_IMPORTS[0]) + "\n",
    ""
  );
  appendFixtureFile(
    rootDirectory,
    "admin/src/styles.css",
    '@import "./styles/new-build-input.css";\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/styles/new-build-input.css",
    ":root {}\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "css_import_missing");
  assert.ok(issueCodes(result).has("css_import_unexpected"));
});

test("synthetic CSS keywords are matched ASCII-case-insensitively", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/styles.css",
    '@IMPORT "./app/archive/hidden.css";\n.x { background: URL("./app/archive/hidden.svg"); }\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/hidden.css",
    ":root {}\n"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/hidden.svg",
    "<svg></svg>\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "css_import_unexpected");
  assert.ok(issueCodes(result).has("css_asset_reference_unreviewed"));
});

test("synthetic CSS Modules dependency syntax fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/App.tsx",
    '\nimport "./silent.module.css";\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/silent.module.css",
    ':local(.safe) { composes: hidden from "./app/archive/hidden.module.css"; }\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/src/app/archive/hidden.module.css",
    ":local(.hidden) {}\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "unsupported_css_module_source");
});

test("synthetic escaped CSS build syntax fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/src/styles.css",
    String.raw`@\69 mport "./app/archive/hidden.css";
.x { background: u\72 l("./app/archive/hidden.svg"); }
` + "\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "unsupported_css_escape");
});

test("synthetic npm lifecycle build scripts fail closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const rootPackage = JSON.parse(readFileSync(
    path.join(rootDirectory, "package.json"),
    "utf8"
  ));
  const adminPackage = JSON.parse(readFileSync(
    path.join(rootDirectory, "admin/package.json"),
    "utf8"
  ));
  rootPackage.scripts["preadmin:build"] = "node attacker.mjs";
  adminPackage.scripts.prebuild = "vite build --config vite.attacker.config.ts";
  writeJson(rootDirectory, "package.json", rootPackage);
  writeJson(rootDirectory, "admin/package.json", adminPackage);

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "frontend_build_script_unexpected");
});

test("synthetic repository npm configuration fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeFixtureFile(rootDirectory, ".npmrc", "script-shell=./attacker.sh\n");
  writeFixtureFile(rootDirectory, "admin/.npmrc", "ignore-scripts=false\n");

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "npm_config_drift");
});

test("synthetic automatic PostCSS configuration fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeFixtureFile(
    rootDirectory,
    "admin/postcss.config.mjs",
    'import "./src/app/archive/hidden-postcss.mjs";\nexport default {};\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "frontend_build_config_unexpected");
});

test("synthetic automatic Vite configuration shadow fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeFixtureFile(
    rootDirectory,
    "admin/vite.config.js",
    'export default { root: "./rogue" };\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "frontend_build_config_unexpected");
});

test("synthetic Vite environment input fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeFixtureFile(
    rootDirectory,
    "admin/.env.production",
    "VITE_ADMIN_FIXTURE_PREVIEW=true\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "frontend_env_input_unexpected");
});

test("synthetic script, HTML and Vite config drift fail closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const rootPackage = JSON.parse(readFileSync(
    path.join(rootDirectory, "package.json"),
    "utf8"
  ));
  rootPackage.scripts["admin:portal:build"] = "vite build";
  writeJson(rootDirectory, "package.json", rootPackage);
  replaceFixtureText(
    rootDirectory,
    "admin/portal/index.html",
    "../src/portal-main.tsx",
    "../src/main.tsx"
  );
  appendFixtureFile(
    rootDirectory,
    "admin/portal/index.html",
    '<script src="../src/main.tsx" type="module"></script>\n'
  );
  replaceFixtureText(
    rootDirectory,
    "admin/vite.portal.config.ts",
    'path.resolve(adminDir, "dist-portal")',
    'path.resolve(adminDir, "dist")'
  );
  replaceFixtureText(
    rootDirectory,
    "admin/vite.portal.config.ts",
    'path.resolve(adminDir, "public")',
    'path.resolve(adminDir, "unreviewed-public")'
  );
  appendFixtureFile(
    rootDirectory,
    "admin/vite.portal.config.ts",
    '\nconst unreviewedInput = { rollupOptions: { input: "../src/main.tsx" } };\nvoid unreviewedInput;\n'
  );
  appendFixtureFile(
    rootDirectory,
    "admin/vite.site.config.ts",
    '\nimport extraConfig from "./vite.extra.config";\nvoid extraConfig;\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "build_script_drift");
  assert.ok(issueCodes(result).has("html_entry_drift"));
  assert.ok(issueCodes(result).has("vite_boundary_drift"));
  assert.ok(issueCodes(result).has("vite_local_import_unexpected"));
});

test("synthetic commented HTML entry cannot satisfy the contract", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeFixtureFile(
    rootDirectory,
    "admin/portal/index.html",
    '<!-- <script type="module" src="../src/portal-main.tsx"></script> -->\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "html_entry_drift");
});

test("synthetic HTML stylesheet build input fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/portal/index.html",
    '<link rel="stylesheet" href="../src/styles.css">\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "html_build_input_unexpected");
});

for (const [label, portalHtml] of [
  [
    "data attribute decoy",
    '<script data-type="module" data-src="../src/portal-main.tsx" type="module" src="../src/features/user-portal/totp-preview.ts"></script>\n'
  ],
  [
    "RCDATA script decoy",
    '<textarea><script type="module" src="../src/portal-main.tsx"></script></textarea>\n'
  ],
  [
    "attribute comment-marker decoy",
    '<script type="module" src="../src/portal-main.tsx"></script>\n<meta content="<!--"><link rel="stylesheet" href="../src/styles.css"><meta content="-->">\n'
  ],
  [
    "encoded stylesheet relation",
    '<script type="module" src="../src/portal-main.tsx"></script>\n<link rel="style&#115;heet" href="../src/styles.css">\n'
  ]
]) {
  test(`synthetic HTML ${label} fails closed`, (t) => {
    const rootDirectory = createPassingFixture(t);
    writeFixtureFile(rootDirectory, "admin/portal/index.html", portalHtml);

    const result = verifyFrontendSourceBoundaries({ rootDirectory });
    assertIssue(result, "html_entry_drift");
  });
}

test("synthetic HTML data-rel cannot hide a stylesheet", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/portal/index.html",
    '<link data-rel="preload" rel="stylesheet" href="../src/styles.css">\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "html_entry_drift");
});

test("synthetic Vite config comment decoy fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  replaceFixtureText(
    rootDirectory,
    "admin/vite.portal.config.ts",
    'root: path.resolve(adminDir, "portal"),',
    `// root: path.resolve(adminDir, "portal")
  root: path.resolve(adminDir, "site"),`
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "vite_boundary_drift");
});

test("synthetic Vite config dead-object decoy fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeFixtureFile(
    rootDirectory,
    "admin/vite.portal.config.ts",
    `import path from "node:path";
import rechargeClient from "./src/features/user-portal/recharge/portal-recharge-client";
const adminDir = "admin";
void rechargeClient;
const staleContract = {
  root: path.resolve(adminDir, "portal"),
  publicDir: path.resolve(adminDir, "public"),
  build: {
    outDir: path.resolve(adminDir, "dist-portal"),
    emptyOutDir: true
  }
};
void staleContract;
export default {
  root: path.resolve(adminDir, "site"),
  publicDir: path.resolve(adminDir, "public"),
  build: {
    outDir: path.resolve(adminDir, "dist-site"),
    emptyOutDir: false
  }
};
`
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "vite_boundary_drift");
});

test("synthetic trusted Vite config symlink fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const original = readFileSync(
    path.join(rootDirectory, "admin/vite.site.config.ts"),
    "utf8"
  );
  writeFixtureFile(
    rootDirectory,
    "admin/rogue/vite.site.config.ts",
    original
  );
  rmSync(path.join(rootDirectory, "admin/vite.site.config.ts"));
  symlinkSync(
    "rogue/vite.site.config.ts",
    path.join(rootDirectory, "admin/vite.site.config.ts")
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "vite_boundary_unreadable");
});

test("synthetic TypeScript or production Vite aliases fail closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const tsconfig = JSON.parse(readFileSync(
    path.join(rootDirectory, "admin/tsconfig.json"),
    "utf8"
  ));
  tsconfig.compilerOptions.baseUrl = ".";
  tsconfig.compilerOptions.paths = { "@portal/*": ["src/features/user-portal/*"] };
  writeJson(rootDirectory, "admin/tsconfig.json", tsconfig);
  appendFixtureFile(
    rootDirectory,
    "admin/vite.config.ts",
    '\nconst unreviewedAlias = { resolve: { alias: { "@portal": "/src/features/user-portal" } } };\nvoid unreviewedAlias;\n'
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "typescript_source_alias_drift");
  assert.ok(issueCodes(result).has("vite_boundary_drift"));
});

test("synthetic TypeScript config inheritance fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const tsconfig = JSON.parse(readFileSync(
    path.join(rootDirectory, "admin/tsconfig.json"),
    "utf8"
  ));
  tsconfig.extends = "./tsconfig.hidden.json";
  writeJson(rootDirectory, "admin/tsconfig.json", tsconfig);
  writeJson(rootDirectory, "admin/tsconfig.hidden.json", {
    compilerOptions: {
      paths: { "#hidden": ["src/app/archive/hidden.ts"] }
    }
  });

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "typescript_source_alias_drift");
});

test("synthetic reachable TypeScript transform directives fail closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  const panelPath = "admin/src/components/primitives/panel-frame.tsx";
  const panelSource = readFileSync(
    path.join(rootDirectory, panelPath),
    "utf8"
  );
  writeFixtureFile(
    rootDirectory,
    panelPath,
    `/** @jsxImportSource ../../app/archive/hidden-jsx */
/// <reference path="../../app/archive/hidden-types.ts" />
${panelSource}`
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "unsupported_jsx_pragma");
  assert.ok(issueCodes(result).has("unsupported_typescript_directive"));
});

test("synthetic nested source package scope fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeJson(
    rootDirectory,
    "admin/src/components/primitives/package.json",
    {
      type: "commonjs",
      browser: {
        "./panel-frame.tsx": "../../app/archive/hidden-panel.tsx"
      }
    }
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "nested_source_config_unexpected");
});

for (const nestedConfig of ["tsconfig.json", "jsconfig.json"]) {
  test(`synthetic nested ${nestedConfig} fails closed`, (t) => {
    const rootDirectory = createPassingFixture(t);
    writeJson(
      rootDirectory,
      `admin/src/components/primitives/${nestedConfig}`,
      {
        compilerOptions: {
          jsxImportSource: "../../app/archive/hidden-jsx"
        }
      }
    );

    const result = verifyFrontendSourceBoundaries({ rootDirectory });
    assertIssue(result, "nested_source_config_unexpected");
  });
}

for (const surface of ["portal", "site"]) {
  test(`synthetic ${surface} package scope fails closed`, (t) => {
    const rootDirectory = createPassingFixture(t);
    writeJson(rootDirectory, `admin/${surface}/package.json`, {
      postcss: "./hidden-postcss.config.mjs"
    });

    const result = verifyFrontendSourceBoundaries({ rootDirectory });
    assertIssue(result, "frontend_package_scope_unexpected");
  });
}

test("synthetic computed or escaped Vite imports fail closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  appendFixtureFile(
    rootDirectory,
    "admin/vite.site.config.ts",
    String.raw`
import "./vite\x2eextra\x2econfig";
const computedConfig = "./vite.extra.config";
void import(computedConfig);
` + "\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "unsupported_module_specifier");
  assert.ok(issueCodes(result).has("non_literal_dynamic_import"));
});

for (const cssImport of [
  '@import url(./styles/ghost.css);\n',
  '@import "./styles/ghost.css" layer(theme);\n',
  '@import url("./styles/ghost.css") screen;\n'
]) {
  test(`synthetic CSS grammar cannot bypass exact set: ${cssImport.trim()}`, (t) => {
    const rootDirectory = createPassingFixture(t);
    appendFixtureFile(rootDirectory, "admin/src/styles.css", cssImport);
    writeFixtureFile(
      rootDirectory,
      "admin/src/styles/ghost.css",
      ":root {}\n"
    );

    const result = verifyFrontendSourceBoundaries({ rootDirectory });
    assertIssue(result, "css_import_unexpected");
  });
}

test("synthetic new public build input fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeFixtureFile(
    rootDirectory,
    "admin/public/unreviewed-runtime-config.json",
    "{}\n"
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "public_build_input_unexpected");
});

test("synthetic public build input symlink fails closed", (t) => {
  const rootDirectory = createPassingFixture(t);
  writeFixtureFile(rootDirectory, "outside-secret.txt", "secret\n");
  rmSync(path.join(rootDirectory, "admin/public/favicon.svg"));
  symlinkSync(
    "../../outside-secret.txt",
    path.join(rootDirectory, "admin/public/favicon.svg")
  );

  const result = verifyFrontendSourceBoundaries({ rootDirectory });
  assertIssue(result, "public_build_input_unreadable");
});

test("CLI executes when invoked through a symlink", (t) => {
  const rootDirectory = mkdtempSync(
    path.join(os.tmpdir(), "frontend-boundary-cli-")
  );
  t.after(() => rmSync(rootDirectory, { recursive: true, force: true }));
  const checkerLink = path.join(rootDirectory, "checker-link.mjs");
  symlinkSync(
    path.join(REPOSITORY_ROOT, "scripts/check-frontend-source-boundaries.mjs"),
    checkerLink
  );

  const invoked = spawnSync(process.execPath, [checkerLink], {
    encoding: "utf8"
  });
  assert.equal(invoked.status, 0, invoked.stderr);
  assert.match(invoked.stdout, /"frontend_source_boundary_check"/u);
});

test("actual repository satisfies the frontend source boundary contract", () => {
  const result = verifyFrontendSourceBoundaries({
    rootDirectory: REPOSITORY_ROOT
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});
