import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

import {
  assertProviderModuleSourceBoundary,
  collectProviderModuleGraph,
  extractStaticModuleSpecifiers,
} from "./helpers/payment-provider-source-boundary.mjs";

const REPO_ROOT_URL = new URL("../../", import.meta.url);
const MODULE_PATH = "server/services/platform/payment-adapter-fixture.mjs";
const PHASE_ONE_ROOTS = Object.freeze([
  "server/services/platform/payment-money-codec.mjs",
  "server/services/platform/payment-provider-adapter-contract.mjs",
  "server/services/platform/payment-provider-adapter-registry.mjs",
  "server/services/platform/payment-provider-adapter-template.mjs",
  "server/services/platform/unverified-payment-adapter.mjs",
  "server/services/platform/paypal-payment-adapter.mjs",
  "server/services/platform/xsd-payment-adapter.mjs",
  "server/services/platform/chaojipay-payment-adapter.mjs",
  "server/services/platform/paypal-payment-protocol-codec.mjs",
  "server/services/platform/xsd-payment-protocol-codec.mjs",
  "server/services/platform/xsd-payment-protocol-boundary.mjs",
  "server/services/platform/xsd-documented-payment-candidate.mjs",
  "server/services/platform/chaojipay-documented-payment-candidate.mjs",
]);
const DOCUMENTED_CANDIDATE_ROOTS = Object.freeze([
  "server/services/platform/xsd-documented-payment-candidate.mjs",
  "server/services/platform/chaojipay-documented-payment-candidate.mjs",
]);
const ROOT_EXECUTABLE_SOURCE_PATTERN = /\.(?:bat|cjs|js|mjs|ps1)$/u;
const EXCLUDED_PRODUCTION_SURFACE_DIRECTORIES = new Set([
  "__tests__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "test",
  "tests",
]);
const ADMIN_PRODUCTION_BUILD_ROOTS = Object.freeze([
  "admin/index.html",
  "admin/package.json",
  "admin/portal/index.html",
  "admin/site/index.html",
  "admin/vite.config.ts",
  "admin/vite.portal.config.ts",
  "admin/vite.site.config.ts",
]);

async function readSource(modulePath) {
  // The helper has already validated the normalized repository-relative path.
  return readFile(new URL(modulePath, REPO_ROOT_URL), "utf8");
}

function assertBoundaryRejects(source, rule) {
  assert.throws(
    () => assertProviderModuleSourceBoundary({
      modulePath: MODULE_PATH,
      source,
    }),
    {
      message: `payment_provider_source_boundary:${rule}:${MODULE_PATH}`,
    },
  );
}

async function listFiles(relativeDirectory) {
  const entries = await readdir(
    new URL(`${relativeDirectory}/`, REPO_ROOT_URL),
    { withFileTypes: true },
  );
  const paths = [];
  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      paths.push(...await listFiles(relativePath));
    } else if (entry.isFile()) {
      paths.push(relativePath);
    }
  }
  return paths.sort();
}

async function listRootExecutableSourceFiles() {
  const entries = await readdir(REPO_ROOT_URL, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && ROOT_EXECUTABLE_SOURCE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function listProductionSurfaceFiles(relativeDirectory) {
  const entries = await readdir(
    new URL(`${relativeDirectory}/`, REPO_ROOT_URL),
    { withFileTypes: true },
  );
  const paths = [];
  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!EXCLUDED_PRODUCTION_SURFACE_DIRECTORIES.has(entry.name)) {
        paths.push(...await listProductionSurfaceFiles(relativePath));
      }
    } else if (entry.isFile()) {
      paths.push(relativePath);
    }
  }
  return paths.sort();
}

async function listPackagePublishablePaths() {
  const packageMetadata = JSON.parse(await readSource("package.json"));
  const paths = ["package.json"];
  for (const relativePath of packageMetadata.files) {
    const details = await stat(new URL(relativePath, REPO_ROOT_URL));
    if (details.isDirectory()) {
      paths.push(...await listProductionSurfaceFiles(relativePath));
    } else if (details.isFile()) {
      paths.push(relativePath);
    }
  }
  return paths.sort();
}

function isDocumentationOrTestPath(path) {
  return path.endsWith(".md")
    || /(?:^|\/)tests?(?:\/|$)/u.test(path)
    || /(?:^|\/)__tests__(?:\/|$)/u.test(path)
    || /\.(?:test|spec)\.[^/]+$/u.test(path);
}

async function listDocumentedCandidateBoundaryPaths() {
  const paths = [
    ...await listRootExecutableSourceFiles(),
    ...await listPackagePublishablePaths(),
    ...ADMIN_PRODUCTION_BUILD_ROOTS,
    ...await listProductionSurfaceFiles("admin/src"),
  ].filter((path) => !isDocumentationOrTestPath(path));
  return [...new Set(paths)].sort();
}

async function assertCorpusDoesNotMatch(paths, pattern, message, read = readSource) {
  for (const path of paths) {
    const source = await read(path);
    assert.equal(pattern.test(source), false, message);
  }
}

test("complete production source corpus detects a candidate reached through an intermediate module", async () => {
  const sources = new Map([
    ["index.mjs", 'import "./server/app.mjs";'],
    ["server/app.mjs", 'import "./services/platform/xsd-documented-payment-candidate.mjs";'],
  ]);
  await assert.rejects(
    () => assertCorpusDoesNotMatch(
      ["index.mjs", "server/app.mjs"],
      /(?:xsd|chaojipay)-documented-payment-candidate\.mjs/u,
      "documented_payment_candidate_runtime_import_detected",
      async (path) => sources.get(path),
    ),
    (error) => {
      assert.match(error.message, /documented_payment_candidate_runtime_import_detected/u);
      return true;
    },
  );
});

test("documented-candidate corpus includes every executable and publishable source root", async () => {
  const paths = await listDocumentedCandidateBoundaryPaths();
  const packageMetadata = JSON.parse(await readSource("package.json"));
  for (const publishedPath of packageMetadata.files) {
    if (isDocumentationOrTestPath(publishedPath)) continue;
    const details = await stat(new URL(publishedPath, REPO_ROOT_URL));
    const included = details.isDirectory()
      ? paths.some((path) => path.startsWith(`${publishedPath}/`))
      : paths.includes(publishedPath);
    assert.equal(
      included,
      true,
      `documented_candidate_boundary_missing_package_file:${publishedPath}`,
    );
  }
  for (const prefix of ["bin/", "scripts/", "agent/", "ops/"]) {
    assert.equal(
      paths.some((path) => path.startsWith(prefix)),
      true,
      `documented_candidate_boundary_missing_root:${prefix}`,
    );
  }
  for (const path of [
    "package.json",
    "start-server.ps1",
    "admin/package.json",
    "admin/vite.config.ts",
    "admin/vite.portal.config.ts",
    "admin/vite.site.config.ts",
    "admin/index.html",
    "admin/portal/index.html",
    "admin/site/index.html",
    "admin/src/main.tsx",
    "admin/src/portal-main.tsx",
    "admin/src/site-main.tsx",
  ]) {
    assert.equal(
      paths.includes(path),
      true,
      `documented_candidate_boundary_missing_surface:${path}`,
    );
  }
  assert.equal(paths.some((path) => path.endsWith("README.md")), false);
  assert.equal(paths.some((path) => /(?:^|\/)tests?(?:\/|$)/u.test(path)), false);
  assert.equal(paths.some((path) => /(?:^|\/)node_modules(?:\/|$)/u.test(path)), false);
  assert.equal(paths.some((path) => /^admin\/dist(?:-|\/|$)/u.test(path)), false);
  assert.equal(paths.includes("admin/vite.portal.local-api-validation.config.ts"), false);
});

test("documented-candidate corpus rejects an indirect import from every added root", async () => {
  for (const root of ["bin", "scripts", "agent", "ops"]) {
    const sources = new Map([
      [`${root}/entry.mjs`, 'import "./intermediate.mjs";'],
      [`${root}/intermediate.mjs`,
        'import "../server/services/platform/xsd-documented-payment-candidate.mjs";'],
    ]);
    await assert.rejects(
      () => assertCorpusDoesNotMatch(
        [...sources.keys()],
        /(?:xsd|chaojipay)-documented-payment-candidate\.mjs/u,
        `documented_payment_candidate_${root}_import_detected`,
        async (path) => sources.get(path),
      ),
      new RegExp(`documented_payment_candidate_${root}_import_detected`, "u"),
    );
  }
});

test("documented-candidate corpus rejects direct and indirect references from root publish surfaces and admin source", async () => {
  const candidatePath = "server/services/platform/xsd-documented-payment-candidate.mjs";
  const surfaces = [
    {
      name: "root_entry",
      directPath: "start-server.ps1",
      intermediatePath: "root-intermediate.mjs",
      entrySource: "node ./root-intermediate.mjs",
    },
    {
      name: "package_metadata",
      directPath: "package.json",
      intermediatePath: "package-intermediate.mjs",
      entrySource: '{"scripts":{"start":"node package-intermediate.mjs"}}',
    },
    {
      name: "admin_source",
      directPath: "admin/src/portal-main.tsx",
      intermediatePath: "admin/src/payment-intermediate.ts",
      entrySource: 'import "./payment-intermediate";',
    },
  ];

  for (const surface of surfaces) {
    for (const [referenceKind, sources] of [
      ["direct", new Map([[surface.directPath, candidatePath]])],
      ["indirect", new Map([
        [surface.directPath, surface.entrySource],
        [surface.intermediatePath, candidatePath],
      ])],
    ]) {
      const message = `documented_payment_candidate_${surface.name}_${referenceKind}_reference_detected`;
      await assert.rejects(
        () => assertCorpusDoesNotMatch(
          [...sources.keys()],
          /(?:xsd|chaojipay)-documented-payment-candidate\.mjs/u,
          message,
          async (path) => sources.get(path),
        ),
        new RegExp(message, "u"),
      );
    }
  }
});

test("discovered Admin production build corpus rejects direct and indirect candidate references", async () => {
  const candidatePath = "server/services/platform/xsd-documented-payment-candidate.mjs";
  const candidatePattern = /(?:xsd|chaojipay)-documented-payment-candidate\.mjs/u;
  const discoveredPaths = await listDocumentedCandidateBoundaryPaths();
  for (const [referenceKind, sources] of [
    ["direct", new Map([
      ["admin/vite.config.ts", candidatePath],
    ])],
    ["indirect", new Map([
      ["admin/vite.portal.config.ts", 'import "./src/portal-main.tsx";'],
      ["admin/src/portal-main.tsx", candidatePath],
    ])],
  ]) {
    const message = `documented_payment_candidate_discovered_admin_${referenceKind}_reference_detected`;
    await assert.rejects(
      () => assertCorpusDoesNotMatch(
        discoveredPaths,
        candidatePattern,
        message,
        async (path) => sources.get(path) ?? "",
      ),
      new RegExp(message, "u"),
    );
  }

  const buildRoots = [
    "admin/package.json",
    "admin/vite.config.ts",
    "admin/vite.portal.config.ts",
    "admin/vite.site.config.ts",
    "admin/index.html",
    "admin/portal/index.html",
    "admin/site/index.html",
  ];

  for (const [index, buildRoot] of buildRoots.entries()) {
    for (const [referenceKind, sources] of [
      ["direct", new Map([[buildRoot, candidatePath]])],
      ["indirect", new Map([
        [buildRoot, `./src/admin-build-intermediate-${index}.mjs`],
        [`admin/src/admin-build-intermediate-${index}.mjs`, candidatePath],
      ])],
    ]) {
      const message = `documented_payment_candidate_admin_build_root_${index}_${referenceKind}_reference_detected`;
      await assert.rejects(
        () => assertCorpusDoesNotMatch(
          [...sources.keys()],
          candidatePattern,
          message,
          async (path) => sources.get(path),
        ),
        new RegExp(message, "u"),
      );
    }
  }
});

test("source scanner extracts multiline imports side-effect imports and export-from declarations", () => {
  const source = `
import { types as utilTypes } from "node:util";
import {
  alpha,
  beta,
} from "./alpha-codec.mjs";
import "./side-effect.mjs";
export * from "./star-export.mjs";
export { named } from "./named-export.mjs";

export function useImports(value) {
  return utilTypes.isProxy(value) ? alpha : beta;
}
`;

  const specifiers = extractStaticModuleSpecifiers(source, MODULE_PATH);
  assert.deepEqual(specifiers, [
    "./alpha-codec.mjs",
    "./named-export.mjs",
    "./side-effect.mjs",
    "./star-export.mjs",
    "node:util",
  ]);
  assert.equal(Object.isFrozen(specifiers), true);
  assert.deepEqual(
    assertProviderModuleSourceBoundary({ modulePath: MODULE_PATH, source }),
    specifiers,
  );
  assert.deepEqual(
    assertProviderModuleSourceBoundary({
      modulePath: MODULE_PATH,
      source: 'const marker = "😀😀😀😀😀😀😀😀";\nimport "./unicode-safe.mjs";',
    }),
    ["./unicode-safe.mjs"],
  );
});

test("source scanner rejects dynamic imports require bare packages parent traversal and network built-ins", () => {
  const declarationFixtures = [
    'const moduleValue = import("./evil.mjs");',
    'const moduleValue = require("evil");',
    'const moduleValue = createRequire(import.meta.url);',
    '/*x*/ import "./evil.mjs";',
    '; import "./evil.mjs";',
    'import /*x*/ ("./evil.mjs");',
    'require /*x*/ ("evil");',
    '// import "./evil.mjs";',
    'const dormant = "import(\\"./evil.mjs\\")";',
  ];
  for (const source of declarationFixtures) {
    assertBoundaryRejects(source, "invalid_module_declaration");
  }

  const forbiddenSpecifierFixtures = [
    'import "axios";',
    'import "undici";',
    'import "node:http";',
    'import "node:https";',
    'import "node:fs";',
    'import "../evil.mjs";',
    String.raw`import ".\..\evil.mjs";`,
    'import "./nested/evil.mjs";',
    'import "./evil.mjs?mode=test";',
    'import "./evil.mjs#fragment";',
    'import "https://network.invalid/evil.mjs";',
    'import "./%2e%2e/evil.mjs";',
    'import "./evil";',
  ];
  for (const source of forbiddenSpecifierFixtures) {
    assertBoundaryRejects(source, "forbidden_module_specifier");
  }
});

test("source scanner rejects environment HTTP Store wallet UI router listener and server seams", () => {
  const sourceSeamFixtures = [
    "process.env.PROVIDER_TOKEN;",
    'fetch("https://network.invalid");',
    'fetch /*x*/ ("https://network.invalid");',
    "new XMLHttpRequest();",
    "axios.request({});",
    "undici.request();",
    "readFile(credentialPath);",
    "readFileSync(credentialPath);",
    "createReadStream(credentialPath);",
    "dotenv.config();",
    "const value = Store;",
    "const value = SQLite;",
    "const value = wallet;",
    "const value = Portal;",
    "const value = Admin;",
    "const value = route;",
    "const value = router;",
    "const value = listener;",
    "const value = server;",
    'const dormant = "process fetch Store wallet Portal Admin router listener server";',
    "/* readFile dotenv SQLite route */",
    "process /*x*/ . env;",
  ];
  for (const source of sourceSeamFixtures) {
    assertBoundaryRejects(source, "forbidden_source_seam");
  }

  const forbiddenImportFixtures = [
    'import { readFile } from "node:fs";',
    'import axios from "axios";',
    'import "./credential-loader.mjs";',
    'import "./store.mjs";',
    'import "./sqlite.mjs";',
    'import "./wallet.mjs";',
    'import "./portal.mjs";',
    'import "./admin.mjs";',
    'import "./route.mjs";',
    'import "./router.mjs";',
    'import "./listener.mjs";',
    'import "./server.mjs";',
  ];
  for (const source of forbiddenImportFixtures) {
    assertBoundaryRejects(source, "forbidden_module_specifier");
  }

  const approvedAbstractSeams = `
export function execute(credentialLoader, withCredential, credentialHandle, context) {
  return withCredential(credentialLoader, credentialHandle, context.request);
}
`;
  assert.deepEqual(
    assertProviderModuleSourceBoundary({
      modulePath: MODULE_PATH,
      source: approvedAbstractSeams,
    }),
    [],
  );
});

test("source scanner fails closed on an unparsed module declaration", () => {
  const fixtures = [
    'import value from "./evil.mjs"',
    'import/*comment*/"./evil.mjs";',
    'export * /*comment*/ from "./evil.mjs";',
    'export { value } /*comment*/ from "./evil.mjs";',
    'export { value } from\n"./evil.mjs";',
    'const text = "export { value } from \\"./evil.mjs\\";";',
    "/* export * from './evil.mjs'; */",
  ];
  for (const source of fixtures) {
    assertBoundaryRejects(source, "invalid_module_declaration");
  }

  const maskedDeclarationTokens = `
import { server as importedServer } from "./safe-sibling.mjs";
export { router as exportedRouter } from "./safe-export.mjs";
export const localValue = importedServer ?? exportedRouter;
`;
  assert.deepEqual(
    assertProviderModuleSourceBoundary({
      modulePath: MODULE_PATH,
      source: maskedDeclarationTokens,
    }),
    ["./safe-export.mjs", "./safe-sibling.mjs"],
  );
});

test("source scanner reports only normalized module paths and rule names", async () => {
  const invalidPaths = [
    "",
    "server/services/platform/Uppercase.mjs",
    "server/services/platform/nul\u0000byte.mjs",
    "server/services/platform//double.mjs",
    "server/services/platform/./dot.mjs",
    "server/services/platform/../parent.mjs",
    String.raw`server\services\platform\backslash.mjs`,
    "server/services/platform/nested/file.mjs",
    "server/services/platform/query.mjs?x=1",
    "server/services/platform/fragment.mjs#x",
    "file:///server/services/platform/scheme.mjs",
    "server/services/platform/%70ercent.mjs",
  ];
  for (const modulePath of invalidPaths) {
    assert.throws(
      () => extractStaticModuleSpecifiers("", modulePath),
      {
        message: "payment_provider_source_boundary:invalid_module_path:<invalid>",
      },
    );
  }

  const secret = "attacker-secret-source-value";
  assert.throws(
    () => assertProviderModuleSourceBoundary({
      modulePath: MODULE_PATH,
      source: `fetch("${secret}");`,
    }),
    (error) => {
      assert.equal(
        error.message,
        `payment_provider_source_boundary:forbidden_source_seam:${MODULE_PATH}`,
      );
      assert.equal(error.message.includes(secret), false);
      assert.equal(error.message.includes("fetch"), false);
      return true;
    },
  );
  assert.throws(
    () => extractStaticModuleSpecifiers(42, MODULE_PATH),
    {
      message: `payment_provider_source_boundary:invalid_module_declaration:${MODULE_PATH}`,
    },
  );

  const malformedInputs = [
    null,
    [],
    { modulePath: MODULE_PATH, source: "", extra: true },
    Object.assign(Object.create(null), { modulePath: MODULE_PATH, source: "" }),
    Object.defineProperty(
      { source: "" },
      "modulePath",
      { enumerable: true, get: () => { throw new Error(secret); } },
    ),
  ];
  for (const input of malformedInputs) {
    assert.throws(
      () => assertProviderModuleSourceBoundary(input),
      {
        message: "payment_provider_source_boundary:invalid_module_declaration:<invalid>",
      },
    );
  }

  let proxyTrapCalls = 0;
  const hostileProxy = new Proxy({}, {
    ownKeys() {
      proxyTrapCalls += 1;
      throw new Error(secret);
    },
  });
  assert.throws(
    () => assertProviderModuleSourceBoundary(hostileProxy),
    {
      message: "payment_provider_source_boundary:invalid_module_declaration:<invalid>",
    },
  );
  assert.equal(proxyTrapCalls, 0);

  let readCalls = 0;
  await assert.rejects(
    collectProviderModuleGraph({
      rootModulePaths: [MODULE_PATH],
      readSource: async () => {
        readCalls += 1;
        throw new Error(secret);
      },
    }),
    (error) => {
      assert.equal(
        error.message,
        `payment_provider_source_boundary:graph_read_failed:${MODULE_PATH}`,
      );
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
  assert.equal(readCalls, 1);
});

test("source scanner validates roots before reads deduplicates roots and redacts read failures", async () => {
  const alpha = "server/services/platform/alpha-adapter.mjs";
  const beta = "server/services/platform/beta-adapter.mjs";
  const gamma = "server/services/platform/gamma-adapter.mjs";
  const sources = new Map([
    [alpha, 'import "./gamma-adapter.mjs";\nimport "./beta-adapter.mjs";'],
    [beta, 'import "./gamma-adapter.mjs";'],
    [gamma, "export const value = 1;"],
  ]);
  const reads = [];
  const graph = await collectProviderModuleGraph({
    rootModulePaths: [gamma, alpha, alpha],
    readSource: async (modulePath) => {
      reads.push(modulePath);
      return sources.get(modulePath);
    },
  });
  assert.deepEqual(graph, [alpha, beta, gamma]);
  assert.equal(Object.isFrozen(graph), true);
  assert.deepEqual(reads.toSorted(), [alpha, beta, gamma]);

  for (const invalidRoot of [
    "",
    "server/services/platform/Uppercase.mjs",
    "server/services/platform/nul\u0000byte.mjs",
    "server/services/platform//double.mjs",
    "server/services/platform/./dot.mjs",
    "server/services/platform/../parent.mjs",
    String.raw`server\services\platform\backslash.mjs`,
    "server/services/platform/nested/file.mjs",
    "server/services/platform/query.mjs?x=1",
    "server/services/platform/fragment.mjs#x",
    "https://network.invalid/module.mjs",
    "server/services/platform/%70ercent.mjs",
  ]) {
    let invalidReadCalls = 0;
    await assert.rejects(
      collectProviderModuleGraph({
        rootModulePaths: [alpha, invalidRoot],
        readSource: async () => {
          invalidReadCalls += 1;
          return "";
        },
      }),
      {
        message: "payment_provider_source_boundary:invalid_module_path:<invalid>",
      },
    );
    assert.equal(invalidReadCalls, 0);
  }

  const sparseRoots = [];
  sparseRoots.length = 1;
  for (const rootModulePaths of [
    sparseRoots,
    Object.freeze(Object.assign(Object.create(null), { 0: alpha, length: 1 })),
  ]) {
    await assert.rejects(
      collectProviderModuleGraph({
        rootModulePaths,
        readSource: async () => "",
      }),
      {
        message: "payment_provider_source_boundary:invalid_module_path:<invalid>",
      },
    );
  }
  const revokedRoots = Proxy.revocable([], {});
  revokedRoots.revoke();
  await assert.rejects(
    collectProviderModuleGraph({
      rootModulePaths: revokedRoots.proxy,
      readSource: async () => "",
    }),
    {
      message: "payment_provider_source_boundary:invalid_module_path:<invalid>",
    },
  );

  await assert.rejects(
    collectProviderModuleGraph({
      rootModulePaths: [alpha],
      readSource: async () => 42,
    }),
    {
      message: `payment_provider_source_boundary:graph_read_failed:${alpha}`,
    },
  );

  const phaseOneGraph = await collectProviderModuleGraph({
    rootModulePaths: PHASE_ONE_ROOTS,
    readSource,
  });
  assert.deepEqual(phaseOneGraph, [...PHASE_ONE_ROOTS].sort());

  const documentedCandidateGraph = await collectProviderModuleGraph({
    rootModulePaths: DOCUMENTED_CANDIDATE_ROOTS,
    readSource,
  });
  assert.deepEqual(documentedCandidateGraph, [...DOCUMENTED_CANDIDATE_ROOTS].sort());
  for (const path of DOCUMENTED_CANDIDATE_ROOTS) {
    assert.deepEqual(
      extractStaticModuleSpecifiers(await readSource(path), path),
      ["node:crypto", "node:util"],
    );
  }

  const runtimeBoundaryPaths = await listDocumentedCandidateBoundaryPaths();
  assert.equal(runtimeBoundaryPaths.includes("index.mjs"), true);
  await assertCorpusDoesNotMatch(
    runtimeBoundaryPaths,
    /(?:xsd|chaojipay)-documented-payment-candidate\.mjs/u,
    "documented_payment_candidate_runtime_import_detected",
  );

  const residuePaths = [
    ...await listFiles("server/services/platform"),
    ...await listFiles("server/tests"),
    "docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md",
    "docs/COMMERCIAL_MODEL_V1.md",
  ].filter((path) => (
    path !== "server/tests/platform-payment-provider-source-boundary.test.mjs"
  ));
  await assertCorpusDoesNotMatch(
    residuePaths,
    /provisional_provider_a_v1|provisional_provider_b_v1|createProviderAPaymentAdapter|createProviderBPaymentAdapter|provider-a-payment-adapter\.mjs|provider-b-payment-adapter\.mjs/u,
    "payment_provider_residue_detected",
  );

  let legacyCheckoutExists = true;
  try {
    await readFile(
      new URL(
        "server/services/platform/portal-payment-checkout.mjs",
        REPO_ROOT_URL,
      ),
      "utf8",
    );
  } catch (error) {
    if (error?.code === "ENOENT") legacyCheckoutExists = false;
    else throw error;
  }
  assert.equal(legacyCheckoutExists, false, "legacy_checkout_module_present");

  const productionServerPaths = (
    await listFiles("server")
  ).filter((path) => !path.startsWith("server/tests/"));
  await assertCorpusDoesNotMatch(
    productionServerPaths,
    /\bcreateCheckoutOrder\b|\bcaptureCheckout\b|\bverifyWebhook\b|\/api\/portal\/payments/u,
    "legacy_payment_runtime_symbol_detected",
  );
});
