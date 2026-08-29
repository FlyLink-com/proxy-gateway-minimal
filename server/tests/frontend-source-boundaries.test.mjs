import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
    scripts: {
      build: "tsc --noEmit && vite build",
      "build:portal": "tsc --noEmit && vite build --config vite.portal.config.ts",
      "build:site": "tsc --noEmit && vite build --config vite.site.config.ts",
      "verify:admin-build": "node ../scripts/verify-admin-build.mjs dist",
      "verify:portal-build": "node ../scripts/verify-portal-build.mjs dist-portal",
      "verify:site-build": "node ../scripts/verify-public-site-build.mjs dist-site"
    }
  });
  writeJson(rootDirectory, "admin/tsconfig.json", {
    compilerOptions: {},
    include: ["src"]
  });

  writeFixtureFile(
    rootDirectory,
    "admin/index.html",
    '<script type="module" src="/src/main.tsx"></script>\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/portal/index.html",
    '<script type="module" src="../src/portal-main.tsx"></script>\n'
  );
  writeFixtureFile(
    rootDirectory,
    "admin/site/index.html",
    '<script type="module" src="../src/site-main.tsx"></script>\n'
  );

  writeFixtureFile(rootDirectory, "admin/vite.config.ts", "export default {};\n");
  writeFixtureFile(
    rootDirectory,
    "admin/vite.portal.config.ts",
    `import path from "node:path";
import rechargeClient from "./src/features/user-portal/recharge/portal-recharge-client";
const adminDir = "admin";
void rechargeClient;
export default {
  root: path.resolve(adminDir, "portal"),
  publicDir: path.resolve(adminDir, "public"),
  build: {
    outDir: path.resolve(adminDir, "dist-portal"),
    emptyOutDir: true
  }
};
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/vite.portal.local-api-validation.config.ts",
    `import portalConfig from "./vite.portal.config";
export default portalConfig;
`
  );
  writeFixtureFile(
    rootDirectory,
    "admin/vite.site.config.ts",
    `import path from "node:path";
const adminDir = "admin";
export default {
  root: path.resolve(adminDir, "site"),
  publicDir: path.resolve(adminDir, "public"),
  build: {
    outDir: path.resolve(adminDir, "dist-site"),
    emptyOutDir: true
  }
};
`
  );

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

test("actual repository satisfies the frontend source boundary contract", () => {
  const result = verifyFrontendSourceBoundaries({
    rootDirectory: REPOSITORY_ROOT
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});
