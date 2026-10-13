import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TRANSACTION_CLI_RELATIVE_PATH =
  "scripts/control-plane-welcome-coins-activation-transaction-cli.mjs";
const ACTIVATION_LIBRARY_RELATIVE_PATH =
  "scripts/control-plane-welcome-coins-activation-gate-lib.mjs";
const REQUIRED_SOURCE_CLOSURE = Object.freeze([
  "scripts/control-plane-welcome-coins-holder-observer-lib.mjs",
  "server/services/platform/portal-registration-welcome-bonus-migrations.mjs",
  "server/services/platform/coin-wallet-migrations.mjs"
]);
const FORBIDDEN_PRE_IMPORT_SPECIFIERS = Object.freeze([
  "dotenv",
  "better-sqlite3"
]);

function source(relativePath) {
  // Source markers must work with both LF and CRLF checkouts.
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replace(/\r\n/gu, "\n");
}

function sourceSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return text.slice(start, end);
}

function staticImportSpecifiers(text) {
  const specifiers = [];
  const pattern = /^\s*import\s+(?:(?:[^;"']|\r|\n)*?\s+from\s+)?["']([^"']+)["']\s*;?/gmu;
  for (const match of text.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

function dynamicImportSpecifiers(text) {
  return [...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu)]
    .map((match) => match[1]);
}

function relativeModulePath(fromPath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const absolute = resolve(dirname(fromPath), specifier);
  const repositoryRelative = relative(REPOSITORY_ROOT, absolute);
  assert.equal(
    repositoryRelative.startsWith("..") || resolve(REPOSITORY_ROOT, repositoryRelative) !== absolute,
    false,
    `static import escaped repository: ${specifier}`
  );
  return absolute;
}

function inspectPreImportGraph(entryRelativePath) {
  const entryPath = resolve(REPOSITORY_ROOT, entryRelativePath);
  const visited = new Set();
  const forbidden = [];
  const dynamic = [];

  function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    const text = readFileSync(path, "utf8");
    for (const specifier of dynamicImportSpecifiers(text)) {
      dynamic.push({ path, specifier });
    }
    for (const specifier of staticImportSpecifiers(text)) {
      if (
        FORBIDDEN_PRE_IMPORT_SPECIFIERS.includes(specifier)
        || specifier.endsWith("/control-plane-welcome-coins-activation-gate-lib.mjs")
        || specifier === "./control-plane-welcome-coins-activation-gate-lib.mjs"
      ) {
        forbidden.push({ path, specifier });
      }
      const importedPath = relativeModulePath(path, specifier);
      if (importedPath !== null) visit(importedPath);
    }
  }

  visit(entryPath);
  return Object.freeze({
    dynamic: Object.freeze(dynamic),
    forbidden: Object.freeze(forbidden),
    visited: Object.freeze([...visited])
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function syntheticTree(files) {
  const lines = ["d:.:755"];
  let totalBytes = 0;
  for (const [path, value] of Object.entries(files).sort(([left], [right]) => (
    left.localeCompare(right)
  ))) {
    const bytes = Buffer.from(value, "utf8");
    totalBytes += bytes.length;
    lines.push(`f:./${path}:644:${bytes.length}:${sha256(bytes)}`);
  }
  return Object.freeze({
    sha256: sha256(Buffer.from(`${lines.sort().join("\n")}\n`, "utf8")),
    entryCount: lines.length,
    totalBytes
  });
}

function syntheticCandidateClosure(tree) {
  return sha256(Buffer.from(JSON.stringify({
    schemaVersion: "1",
    type: "welcome_coins_activation_candidate_control_surface",
    expectedRelease: "release-1",
    files: [{
      path: TRANSACTION_CLI_RELATIVE_PATH,
      sha256: "a".repeat(64),
      sizeBytes: 1,
      mode: "0644",
      kind: "file"
    }],
    dependencyTree: tree
  }), "utf8"));
}

function requireSyntheticTreeBinding(expected, observed) {
  if (
    expected.sha256 !== observed.sha256
    || expected.entryCount !== observed.entryCount
    || expected.totalBytes !== observed.totalBytes
  ) {
    const error = new Error("execution_envelope_invalid");
    error.condition = "execution_envelope_invalid";
    throw error;
  }
  return true;
}

test("fixed candidate source closure includes every local module executed by custody", () => {
  const activationSource = source(ACTIVATION_LIBRARY_RELATIVE_PATH);
  const closure = sourceSection(
    activationSource,
    "const WELCOME_COINS_NATIVE_ARTIFACT_SPECS = Object.freeze([",
    "]);\nconst WELCOME_COINS_DEPENDENCY_TREE_MAX_ENTRIES"
  );

  for (const requiredPath of REQUIRED_SOURCE_CLOSURE) {
    assert.match(closure, new RegExp(JSON.stringify(requiredPath).replaceAll("/", "\\/")));
  }
});

test("execution envelope and candidate-root contract bind the materialized node_modules tree", () => {
  const activationSource = source(ACTIVATION_LIBRARY_RELATIVE_PATH);
  const artifactKeys = sourceSection(
    activationSource,
    "const artifactKeys = [",
    "];\n  const custodyKeys"
  );
  assert.deepEqual(
    [...artifactKeys.matchAll(/"([A-Za-z0-9]+)"/gu)].map((match) => match[1]),
    [
      "candidateRootSha256",
      "transactionCliSha256",
      "activationLibrarySha256",
      "snapshotLibrarySha256",
      "holderObserverSha256",
      "welcomeBonusMigrationsSha256",
      "coinWalletMigrationsSha256",
      "custodyCliSha256",
      "outerWrapperSha256",
      "nativeLauncherSha256",
      "postExecBootstrapSha256",
      "outerPostExecBootstrapSha256",
      "nativeBuildReceiptSha256",
      "nodeModulesTreeSha256",
      "nodeSha256"
    ]
  );

  const validation = sourceSection(
    activationSource,
    "function validateWelcomeCoinsProductionArtifacts(",
    "function revalidateWelcomeCoinsProductionArtifacts("
  );
  const revalidation = sourceSection(
    activationSource,
    "function revalidateWelcomeCoinsProductionArtifacts(",
    "async function runWelcomeCoinsNativeSchemaCustody("
  );
  assert.match(validation, /nodeModulesTreeSha256/u, "validation omitted the approved tree digest");
  assert.match(revalidation, /expected\.dependencyTree/u, "revalidation omitted the bound tree");
  for (const [label, section] of [["validation", validation], ["revalidation", revalidation]]) {
    assert.match(
      section,
      /(?:inspect|audit)[A-Za-z0-9_]*(?:Dependency|NodeModules|RuntimeClosure)[A-Za-z0-9_]*Tree/u,
      `${label} did not read the materialized tree`
    );
    assert.match(section, /execution_envelope_invalid/u, `${label} did not fail closed`);
  }
});

test("pre-import transaction graph cannot statically execute gate or package dependencies", () => {
  const graph = inspectPreImportGraph(TRANSACTION_CLI_RELATIVE_PATH);
  assert.deepEqual(
    graph.forbidden.map(({ path, specifier }) => ({
      path: relative(REPOSITORY_ROOT, path).replaceAll("\\", "/"),
      specifier
    })),
    []
  );
  assert.equal(
    graph.dynamic.some(({ specifier }) => (
      specifier.endsWith("/control-plane-welcome-coins-activation-gate-lib.mjs")
      || specifier === "./control-plane-welcome-coins-activation-gate-lib.mjs"
    )),
    true,
    "the reviewed gate must be loaded only after the pre-import closure check"
  );
});

test("synthetic package and native-addon drift changes candidate closure and is rejected", () => {
  const baselineFiles = Object.freeze({
    "dotenv/lib/main.js": "export const parse = () => ({})",
    "better-sqlite3/lib/index.js": "module.exports = require('./database')",
    "better-sqlite3/build/Release/better_sqlite3.node": "synthetic-native-addon",
    "bindings/bindings.js": "module.exports = function bindings() {}",
    "file-uri-to-path/index.js": "module.exports = function fileUriToPath() {}"
  });
  const baseline = syntheticTree(baselineFiles);
  const cases = [
    {
      label: "dotenv source drift",
      files: { ...baselineFiles, "dotenv/lib/main.js": "export const parse = () => ({ changed: true })" }
    },
    {
      label: "better-sqlite3 native addon drift",
      files: {
        ...baselineFiles,
        "better-sqlite3/build/Release/better_sqlite3.node": "changed-native-addon"
      }
    },
    {
      label: "alternate native addon candidate added",
      files: {
        ...baselineFiles,
        "better-sqlite3/compiled/abi/linux/x64/better_sqlite3.node": "alternate-addon"
      }
    }
  ];

  for (const { label, files } of cases) {
    const observed = syntheticTree(files);
    assert.notEqual(observed.sha256, baseline.sha256, label);
    assert.notEqual(syntheticCandidateClosure(observed), syntheticCandidateClosure(baseline), label);
    assert.throws(
      () => requireSyntheticTreeBinding(baseline, observed),
      (error) => error?.condition === "execution_envelope_invalid",
      label
    );
  }
});

test("dependency tree serialization rejects delimiter-bearing names and symlink targets", () => {
  const activationSource = source(ACTIVATION_LIBRARY_RELATIVE_PATH);
  const inspector = sourceSection(
    activationSource,
    "function inspectWelcomeCoinsProductionDependencyTree(",
    "function readWelcomeCoinsNativeProcess"
  );
  assert.match(
    inspector,
    /\/\[:\\uFFFD\\0\\r\\n\]\/u\.test\(child\)/u,
    "a child name containing the record delimiter must fail closed"
  );
  assert.match(
    inspector,
    /\/\[:\\uFFFD\\0\\r\\n\]\/u\.test\(target\)/u,
    "a raw symlink target containing the record delimiter must fail closed"
  );
  assert.match(inspector, /0o7022n/u, "sticky or set-id dependency entries must fail closed");

  const topologyA = `l:./${"a:b"}:${"x"}`;
  const topologyB = `l:./${"a"}:${"b:x"}`;
  assert.equal(topologyA, topologyB, "the legacy delimiter format otherwise collides");
  assert.equal(
    Buffer.from([0xff]).toString("utf8"),
    Buffer.from([0xfe]).toString("utf8"),
    "default UTF-8 decoding would otherwise collapse distinct raw names"
  );
});
