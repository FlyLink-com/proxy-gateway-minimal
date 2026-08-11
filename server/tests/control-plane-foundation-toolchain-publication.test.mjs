import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLICATION_SCRIPT = resolve(ROOT, "scripts/control-plane-foundation-toolchain-publication.mjs");
const PUBLICATION_URL = new URL("../../scripts/control-plane-foundation-toolchain-publication.mjs", import.meta.url);
const INVENTORY_URL = new URL("../../scripts/control-plane-foundation-toolchain-inventory.mjs", import.meta.url);
const CANONICAL_URL = new URL("../services/deployment/canonical-json.mjs", import.meta.url);
const SCANNER_URL = new URL("../services/deployment/strict-json-scan.mjs", import.meta.url);
const EXPECTED_SOURCE_SHA256 = Object.freeze({
  publication: "b18c18f1f4eac25f11b6867280aab2d487886e27c29d7059db1b2103d5f64cc9",
  inventory: "533e79ac416aad41d19cc6a7f501a6c79542257d56597508ddb79a94a30b75dd",
  canonical: "a6183ec26b92debd486ee1ce43532f37f62acf77cef68a2917a5188635f0fb23",
  scanner: "c3ed625964b61ff43dc91ad688e04c4459220aa4094c2b6e3d76795decf9d010"
});

function sourceSha256(value) {
  return createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex");
}

for (const [name, url] of Object.entries({
  publication: PUBLICATION_URL,
  inventory: INVENTORY_URL,
  canonical: CANONICAL_URL,
  scanner: SCANNER_URL
})) {
  assert.equal(sourceSha256(readFileSync(url, "utf8")), EXPECTED_SOURCE_SHA256[name]);
}

const publicationModule = await import(PUBLICATION_URL.href);
const inventoryModule = await import(INVENTORY_URL.href);
const canonicalModule = await import(CANONICAL_URL.href);
const {
  buildFoundationToolchainLock,
  createFoundationToolchainLockAttestationDiagnosticRunner,
  createFoundationToolchainLockAttestationVerifier,
  extractCanonicalV2InventoryFromLog,
  FOUNDATION_TOOLCHAIN_CONFIRMATION,
  parseFoundationToolchainLock,
  serializeFoundationToolchainLock
} = publicationModule;
const {
  buildToolchainInventoryEvidence,
  FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE,
  FOUNDATION_TOOL_ROLES,
  serializeToolchainInventoryLine
} = inventoryModule;
const { sha256Hex } = canonicalModule;
const REPOSITORY = "gccwebos-com/proxy-gateway-minimal";
const WORKFLOW_PATH = ".github/workflows/control-plane-foundation-toolchain-publish.yml";
const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/master`;
const SUBJECT_NAME = `foundation-toolchain-lock-v2-${"c".repeat(64)}.json`;
const SUBJECT_SHA256 = "d".repeat(64);
const SOURCE_COMMIT = "e".repeat(40);

function inventoryEvidence() {
  return buildToolchainInventoryEvidence({
    sourceCommit: "a".repeat(40),
    workflowSha256: "b".repeat(64),
    containerImage: FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE,
    nodeVersion: "v22.23.1",
    nodeModuleAbi: "127",
    nodeApiVersion: "10",
    toolRoles: FOUNDATION_TOOL_ROLES.map((role, index) => ({
      role,
      sha256: (index + 1).toString(16).repeat(64)
    })),
    headersTreeSha256: "f".repeat(64)
  });
}

function provenanceStatementBytes({
  subjects = [{ name: SUBJECT_NAME, sha256: SUBJECT_SHA256 }],
  sourceCommit = SOURCE_COMMIT,
  repository = REPOSITORY,
  workflowPath = WORKFLOW_PATH,
  workflowRef = "refs/heads/master",
  builderWorkflowRef = `${repository}/${workflowPath}@${workflowRef}`,
  predicateType = "https://slsa.dev/provenance/v1",
  eventName = "workflow_dispatch",
  runnerEnvironment = "github-hosted"
} = {}) {
  return Buffer.from(JSON.stringify({
    _type: "https://in-toto.io/Statement/v1",
    subject: subjects.map(({ name, sha256 }) => ({
      name,
      digest: { sha256 }
    })),
    predicateType,
    predicate: {
      buildDefinition: {
        buildType: "https://actions.github.io/buildtypes/workflow/v1",
        externalParameters: {
          workflow: {
            ref: workflowRef,
            repository: `https://github.com/${repository}`,
            path: workflowPath
          }
        },
        internalParameters: {
          github: {
            event_name: eventName,
            repository_id: "123456789",
            repository_owner_id: "987654321",
            runner_environment: runnerEnvironment
          }
        },
        resolvedDependencies: [{
          uri: `git+https://github.com/${repository}@${workflowRef}`,
          digest: { gitCommit: sourceCommit }
        }]
      },
      runDetails: {
        builder: {
          id: `https://github.com/${builderWorkflowRef}`
        },
        metadata: {
          invocationId: `https://github.com/${repository}/actions/runs/31355310872/attempts/1`
        }
      }
    }
  }), "utf8");
}

function diagnosticInput(overrides = {}) {
  return {
    bundleBytes: Buffer.from("bounded-bundle", "utf8"),
    statementBytes: provenanceStatementBytes(),
    subjectName: SUBJECT_NAME,
    subjectSha256: SUBJECT_SHA256,
    dsseSignature: "observed",
    fulcioChain: "observed",
    rekorSignedEntry: "observed",
    rekorInclusion: "observed",
    rekorIntegratedTime: "observed",
    oidcIssuer: "https://token.actions.githubusercontent.com",
    oidcRepository: REPOSITORY,
    oidcWorkflowRef: WORKFLOW_REF,
    oidcSourceCommit: SOURCE_COMMIT,
    predicateType: "https://slsa.dev/provenance/v1",
    embeddedSct: "present_unverified",
    ...overrides
  };
}

const CLOCK = Object.freeze({
  now() {
    return new Date("2026-08-10T00:00:00.000Z");
  }
});

test("publication module exposes only lock codecs and non-authoritative diagnostic surfaces", () => {
  assert.deepEqual(Object.keys(publicationModule).sort(), [
    "FOUNDATION_TOOLCHAIN_CONFIRMATION",
    "buildFoundationToolchainLock",
    "createFoundationToolchainLockAttestationDiagnosticRunner",
    "createFoundationToolchainLockAttestationVerifier",
    "extractCanonicalV2InventoryFromLog",
    "parseFoundationToolchainLock",
    "serializeFoundationToolchainLock"
  ]);
});

test("extracts exactly one canonical v2 inventory receipt from GitHub log prefixes", () => {
  const bytes = serializeToolchainInventoryLine(inventoryEvidence()).subarray(0, -1);
  const log = `job\tstep\t2026-08-10T00:00:00Z ${bytes.toString("utf8")}\n`;
  const extracted = extractCanonicalV2InventoryFromLog(log);
  assert.deepEqual(extracted.bytes, bytes);
  assert.equal(extracted.sha256, sha256Hex(bytes));
  assert.throws(() => extractCanonicalV2InventoryFromLog(`${log}${log}`), /foundation_toolchain_inventory_count_invalid/);
  assert.throws(() => extractCanonicalV2InventoryFromLog("no receipt\n"), /foundation_toolchain_inventory_count_invalid/);
});

test("builds one content-addressed lock without a self digest", () => {
  const inventory = inventoryEvidence();
  const inventoryBytes = serializeToolchainInventoryLine(inventory).subarray(0, -1);
  const result = buildFoundationToolchainLock({
    inventoryRunId: "31355310872",
    inventoryReceiptSha256: sha256Hex(inventoryBytes),
    inventory,
    confirmation: FOUNDATION_TOOLCHAIN_CONFIRMATION
  });

  assert.deepEqual(Object.keys(result.value), [
    "schemaVersion",
    "assetType",
    "sourceCommit",
    "inventoryRunId",
    "inventoryReceiptSha256",
    "inventoryWorkflowPath",
    "inventoryWorkflowSha256",
    "closureKind",
    "containerImage",
    "containerManifestSha256",
    "platform",
    "nodeVersion",
    "nodeModuleAbi",
    "nodeApiVersion",
    "toolRoles",
    "toolRolesSha256",
    "headersTreeSha256",
    "candidateClosureSha256",
    "releaseTag",
    "assetName"
  ]);
  assert.equal(result.value.candidateClosureSha256, inventory.candidateClosureSha256);
  assert.equal(result.releaseTag, `control-plane-foundation-toolchain-v2-${inventory.candidateClosureSha256}`);
  assert.equal(result.assetName, `foundation-toolchain-lock-v2-${inventory.candidateClosureSha256}.json`);
  assert.deepEqual(serializeFoundationToolchainLock(result.value), result.bytes);
  assert.equal(JSON.stringify(result.value).includes(result.sha256), false);
});

test("publication lock rejects wrong confirmation, run ID, or non-v2 inventory", () => {
  const inventory = inventoryEvidence();
  const inventoryReceiptSha256 = sha256Hex(serializeToolchainInventoryLine(inventory).subarray(0, -1));
  const input = {
    inventoryRunId: "31355310872",
    inventoryReceiptSha256,
    inventory,
    confirmation: FOUNDATION_TOOLCHAIN_CONFIRMATION
  };
  assert.throws(
    () => buildFoundationToolchainLock({ ...input, confirmation: "publish it" }),
    /foundation_toolchain_publication_confirmation_invalid/
  );
  assert.throws(
    () => buildFoundationToolchainLock({ ...input, inventoryRunId: "not-a-run" }),
    /foundation_toolchain_inventory_run_id_invalid/
  );
  assert.throws(
    () => buildFoundationToolchainLock({
      ...input,
      inventory: { ...inventory, schemaVersion: "1" }
    }),
    /foundation_toolchain_inventory_v2_required/
  );
});

test("lock parser recomputes the exact image, tool-role, and closure bindings", () => {
  const inventory = inventoryEvidence();
  const inventoryReceiptSha256 = sha256Hex(serializeToolchainInventoryLine(inventory).subarray(0, -1));
  const result = buildFoundationToolchainLock({
    inventoryRunId: "31355310872",
    inventoryReceiptSha256,
    inventory,
    confirmation: FOUNDATION_TOOLCHAIN_CONFIRMATION
  });
  assert.deepEqual(parseFoundationToolchainLock(result.bytes), result.value);
  for (const fault of [
    { toolRolesSha256: "0".repeat(64) },
    { candidateClosureSha256: "0".repeat(64) },
    {
      containerImage:
        `registry.example.invalid/node@sha256:${result.value.containerManifestSha256}`
    },
    {
      toolRoles: result.value.toolRoles.map((entry, index) => ({
        ...entry,
        sha256: index === 1 ? result.value.toolRoles[0].sha256 : entry.sha256
      }))
    }
  ]) {
    assert.throws(
      () => serializeFoundationToolchainLock({ ...result.value, ...fault }),
      /foundation_toolchain_lock_(?:invalid|role_invalid|role_order_invalid|role_digest_mismatch|closure_digest_mismatch)/
    );
  }
});

test("lock builder rejects inventory arrays with shadowed own methods", () => {
  const baseline = inventoryEvidence();
  const roles = baseline.toolRoles.map((entry) => ({ ...entry }));
  Object.defineProperty(roles, "map", {
    value: () => Array.prototype.map.call(
      roles,
      (entry) => ({ ...entry, sha256: "a".repeat(64) })
    ),
    enumerable: false
  });
  const inventory = { ...baseline, toolRoles: roles };
  const inventoryReceiptSha256 = sha256Hex(
    serializeToolchainInventoryLine(baseline).subarray(0, -1)
  );
  assert.throws(
    () => buildFoundationToolchainLock({
      inventoryRunId: "31355310872",
      inventoryReceiptSha256,
      inventory,
      confirmation: FOUNDATION_TOOLCHAIN_CONFIRMATION
    }),
    /control_plane_foundation_toolchain_inventory_v2_toolRoles_array_invalid/
  );
});

test("diagnostics expose bounded observations but no authority or brand", () => {
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  const report = runner.diagnose(diagnosticInput());
  assert.deepEqual(Object.keys(report), [
    "diagnosticOnly",
    "authoritative",
    "diagnosticCode",
    "observedAt",
    "bundleSha256",
    "statementSha256",
    "subjectSha256",
    "observations"
  ]);
  assert.equal(report.diagnosticOnly, true);
  assert.equal(report.authoritative, false);
  assert.equal(report.diagnosticCode, "bounded_dsse_fulcio_rekor_oidc_diagnostics_only");
  assert.equal(report.observedAt, "2026-08-10T00:00:00.000Z");
  assert.equal(report.bundleSha256, sha256Hex(diagnosticInput().bundleBytes));
  assert.equal(report.statementSha256, sha256Hex(diagnosticInput().statementBytes));
  assert.equal(report.subjectSha256, SUBJECT_SHA256);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.observations), true);
  assert.equal(Object.isFrozen(report.observations.unparsedCallerSupplied), true);
  assert.equal(Object.isFrozen(report.observations.statement), true);
  assert.deepEqual(Object.keys(report.observations), [
    "bundleParsed",
    "dsseSignatureVerified",
    "fulcioChainVerified",
    "rekorSignedEntryVerified",
    "rekorInclusionVerified",
    "rekorIntegratedTimeVerified",
    "oidcIdentityVerified",
    "embeddedSctVerified",
    "unparsedCallerSupplied",
    "statement"
  ]);
  assert.deepEqual(Object.keys(report.observations.unparsedCallerSupplied), [
    "dsseSignatureStatus",
    "fulcioChainStatus",
    "rekorSignedEntryStatus",
    "rekorInclusionStatus",
    "rekorIntegratedTimeStatus",
    "oidcIssuer",
    "oidcRepository",
    "oidcWorkflowRef",
    "oidcSourceCommit",
    "predicateType",
    "embeddedSctStatus"
  ]);
  assert.deepEqual(Object.keys(report.observations.statement), [
    "sourceCommitMatchesCallerSupplied",
    "repositoryMatchesCallerSupplied",
    "workflowRefMatchesCallerSupplied",
    "predicateTypeMatchesCallerSupplied",
    "repositoryMatchesPolicy",
    "workflowRefMatchesPolicy",
    "predicateTypeMatchesPolicy",
    "exactOneSubjectObserved",
    "subjectNameMatchesCallerSupplied",
    "subjectSha256MatchesCallerSupplied"
  ]);
  for (const field of [
    "bundleParsed",
    "dsseSignatureVerified",
    "fulcioChainVerified",
    "rekorSignedEntryVerified",
    "rekorInclusionVerified",
    "rekorIntegratedTimeVerified",
    "oidcIdentityVerified",
    "embeddedSctVerified"
  ]) {
    assert.equal(report.observations[field], false);
  }
  assert.deepEqual(Object.getOwnPropertySymbols(report), []);
  assert.deepEqual(Object.getOwnPropertySymbols(report.observations), []);
  assert.deepEqual(Object.getOwnPropertySymbols(report.observations.unparsedCallerSupplied), []);
  assert.deepEqual(Object.getOwnPropertySymbols(report.observations.statement), []);
  assert.deepEqual(Object.keys(runner), ["diagnose"]);
  for (const forbidden of ["valid", "verified", "complete", "eligible", "publicationSafe", "brand"]) {
    assert.equal(Object.hasOwn(report, forbidden), false);
  }
});

test("diagnostics bind the fixed direct-workflow policy only as observations", () => {
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  const baseline = runner.diagnose(diagnosticInput());
  assert.equal(baseline.observations.oidcIdentityVerified, false);
  assert.equal(baseline.observations.unparsedCallerSupplied.oidcIssuer, "https://token.actions.githubusercontent.com");
  assert.equal(baseline.observations.unparsedCallerSupplied.oidcRepository, REPOSITORY);
  assert.equal(baseline.observations.unparsedCallerSupplied.oidcWorkflowRef, WORKFLOW_REF);
  assert.equal(baseline.observations.statement.sourceCommitMatchesCallerSupplied, true);
  assert.equal(baseline.observations.statement.repositoryMatchesCallerSupplied, true);
  assert.equal(baseline.observations.statement.workflowRefMatchesCallerSupplied, true);
  assert.equal(baseline.observations.statement.predicateTypeMatchesCallerSupplied, true);
  assert.equal(baseline.observations.statement.repositoryMatchesPolicy, true);
  assert.equal(baseline.observations.statement.workflowRefMatchesPolicy, true);
  assert.equal(baseline.observations.statement.predicateTypeMatchesPolicy, true);
  assert.equal(baseline.observations.statement.exactOneSubjectObserved, true);
  assert.equal(baseline.observations.statement.subjectNameMatchesCallerSupplied, true);
  assert.equal(baseline.observations.statement.subjectSha256MatchesCallerSupplied, true);

  const mismatch = runner.diagnose(diagnosticInput({
    oidcIssuer: "https://example.invalid",
    oidcRepository: "other/repository",
    oidcWorkflowRef: "other/repository/.github/workflows/other.yml@refs/heads/main",
    predicateType: "https://example.invalid/predicate"
  }));
  assert.equal(mismatch.authoritative, false);
  assert.equal(mismatch.observations.oidcIdentityVerified, false);
  assert.equal(mismatch.observations.unparsedCallerSupplied.oidcIssuer, "https://example.invalid");
  assert.equal(mismatch.observations.unparsedCallerSupplied.oidcRepository, "other/repository");
  assert.equal(mismatch.observations.statement.repositoryMatchesCallerSupplied, false);
  assert.equal(mismatch.observations.statement.workflowRefMatchesCallerSupplied, false);
  assert.equal(mismatch.observations.statement.predicateTypeMatchesCallerSupplied, false);
  assert.equal(mismatch.observations.statement.repositoryMatchesPolicy, true);
  assert.equal(mismatch.observations.statement.workflowRefMatchesPolicy, true);
  assert.equal(mismatch.observations.statement.predicateTypeMatchesPolicy, true);
});

test("caller-supplied bundle and crypto statuses can never become affirmative verification", () => {
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  const report = runner.diagnose(diagnosticInput({
    bundleBytes: Buffer.from([0x13, 0x37, 0x00, 0xff]),
    dsseSignature: "observed",
    fulcioChain: "observed",
    rekorSignedEntry: "observed",
    rekorInclusion: "observed",
    rekorIntegratedTime: "observed",
    embeddedSct: "present_unverified"
  }));
  assert.equal(report.observations.bundleParsed, false);
  assert.equal(report.observations.dsseSignatureVerified, false);
  assert.equal(report.observations.fulcioChainVerified, false);
  assert.equal(report.observations.rekorSignedEntryVerified, false);
  assert.equal(report.observations.rekorInclusionVerified, false);
  assert.equal(report.observations.rekorIntegratedTimeVerified, false);
  assert.equal(report.observations.oidcIdentityVerified, false);
  assert.equal(report.observations.embeddedSctVerified, false);
  assert.equal(report.observations.unparsedCallerSupplied.dsseSignatureStatus, "observed");
  assert.equal(report.observations.unparsedCallerSupplied.fulcioChainStatus, "observed");
  assert.equal(report.observations.unparsedCallerSupplied.rekorSignedEntryStatus, "observed");
  assert.equal(report.observations.unparsedCallerSupplied.embeddedSctStatus, "present_unverified");
});

test("diagnostics snapshot caller buffers before the clock callback can mutate them", () => {
  const input = diagnosticInput();
  const bundleSnapshot = Buffer.from(input.bundleBytes);
  const statementSnapshot = Buffer.from(input.statementBytes);
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({
    clock: Object.freeze({
      now() {
        input.bundleBytes.fill(0x00);
        input.statementBytes.fill(0x20);
        return new Date("2026-08-10T00:00:00.000Z");
      }
    })
  });

  const report = runner.diagnose(input);
  assert.equal(report.bundleSha256, sha256Hex(bundleSnapshot));
  assert.equal(report.statementSha256, sha256Hex(statementSnapshot));
  assert.notEqual(report.bundleSha256, sha256Hex(input.bundleBytes));
  assert.notEqual(report.statementSha256, sha256Hex(input.statementBytes));
  assert.equal(Object.values(report).some((value) => Buffer.isBuffer(value)), false);
  assert.equal(Object.values(report.observations).some((value) => Buffer.isBuffer(value)), false);
});

test("diagnostic inputs and options reject accessors, symbols, and non-enumerable fields without reading them", () => {
  let inputAccessorReads = 0;
  const accessorInput = diagnosticInput();
  Object.defineProperty(accessorInput, "statementBytes", {
    configurable: true,
    enumerable: true,
    get() {
      inputAccessorReads += 1;
      return inputAccessorReads % 2 === 1
        ? provenanceStatementBytes()
        : Buffer.from("alternating-statement", "utf8");
    }
  });
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  assert.throws(
    () => runner.diagnose(accessorInput),
    /foundation_toolchain_attestation_input_invalid/
  );
  assert.equal(inputAccessorReads, 0);

  let optionAccessorReads = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "clock", {
    enumerable: true,
    get() {
      optionAccessorReads += 1;
      return CLOCK;
    }
  });
  assert.throws(
    () => createFoundationToolchainLockAttestationDiagnosticRunner(accessorOptions),
    /foundation_toolchain_attestation_clock_invalid/
  );
  assert.equal(optionAccessorReads, 0);

  let clockAccessorReads = 0;
  const accessorClock = {};
  Object.defineProperty(accessorClock, "now", {
    enumerable: true,
    get() {
      clockAccessorReads += 1;
      return CLOCK.now;
    }
  });
  assert.throws(
    () => createFoundationToolchainLockAttestationDiagnosticRunner({ clock: accessorClock }),
    /foundation_toolchain_attestation_clock_invalid/
  );
  assert.equal(clockAccessorReads, 0);

  const symbolInput = diagnosticInput();
  symbolInput[Symbol("extra")] = true;
  assert.throws(
    () => runner.diagnose(symbolInput),
    /foundation_toolchain_attestation_input_invalid/
  );

  const nonEnumerableInput = diagnosticInput();
  Object.defineProperty(nonEnumerableInput, "extra", { value: true });
  assert.throws(
    () => runner.diagnose(nonEnumerableInput),
    /foundation_toolchain_attestation_input_invalid/
  );
});

test("diagnostic subject and provenance observations are derived from the canonical statement", () => {
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  const rows = [
    {
      statementBytes: provenanceStatementBytes({ subjects: [] }),
      expected: {
        subjectSha256: null,
        exactOneSubjectObserved: false,
        subjectNameMatchesExpected: false,
        subjectSha256MatchesExpected: false
      }
    },
    {
      statementBytes: provenanceStatementBytes({
        subjects: [
          { name: SUBJECT_NAME, sha256: SUBJECT_SHA256 },
          { name: "second.json", sha256: "f".repeat(64) }
        ]
      }),
      expected: {
        subjectSha256: null,
        exactOneSubjectObserved: false,
        subjectNameMatchesExpected: false,
        subjectSha256MatchesExpected: false
      }
    },
    {
      statementBytes: provenanceStatementBytes({
        subjects: [{ name: "wrong.json", sha256: SUBJECT_SHA256 }]
      }),
      expected: {
        subjectSha256: SUBJECT_SHA256,
        exactOneSubjectObserved: true,
        subjectNameMatchesExpected: false,
        subjectSha256MatchesExpected: true
      }
    },
    {
      statementBytes: provenanceStatementBytes({
        subjects: [{ name: SUBJECT_NAME, sha256: "f".repeat(64) }]
      }),
      expected: {
        subjectSha256: "f".repeat(64),
        exactOneSubjectObserved: true,
        subjectNameMatchesExpected: true,
        subjectSha256MatchesExpected: false
      }
    }
  ];
  for (const { statementBytes, expected } of rows) {
    const report = runner.diagnose(diagnosticInput({ statementBytes }));
    assert.equal(report.subjectSha256, expected.subjectSha256);
    assert.equal(report.observations.statement.exactOneSubjectObserved, expected.exactOneSubjectObserved);
    assert.equal(
      report.observations.statement.subjectNameMatchesCallerSupplied,
      expected.subjectNameMatchesExpected
    );
    assert.equal(
      report.observations.statement.subjectSha256MatchesCallerSupplied,
      expected.subjectSha256MatchesExpected
    );
  }

  const sourceMismatch = runner.diagnose(diagnosticInput({
    statementBytes: provenanceStatementBytes({ sourceCommit: "f".repeat(40) })
  }));
  assert.equal(sourceMismatch.observations.statement.sourceCommitMatchesCallerSupplied, false);

  const workflowMismatch = runner.diagnose(diagnosticInput({
    statementBytes: provenanceStatementBytes({ workflowPath: ".github/workflows/other.yml" })
  }));
  assert.equal(workflowMismatch.observations.statement.workflowRefMatchesCallerSupplied, false);
});

test("diagnostics reject opaque, noncanonical, or open-shape statement bytes", () => {
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  const canonical = provenanceStatementBytes();
  const openShape = JSON.parse(canonical.toString("utf8"));
  openShape.extra = true;
  for (const statementBytes of [
    Buffer.from("bounded-statement", "utf8"),
    Buffer.concat([canonical, Buffer.from("\n", "utf8")]),
    Buffer.from(JSON.stringify(openShape), "utf8")
  ]) {
    assert.throws(
      () => runner.diagnose(diagnosticInput({ statementBytes })),
      /foundation_toolchain_attestation_statement_invalid/
    );
  }
});

test("diagnostic statements require workflow_dispatch on a GitHub-hosted runner", () => {
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  for (const statementBytes of [
    provenanceStatementBytes({ eventName: "push" }),
    provenanceStatementBytes({ runnerEnvironment: "self-hosted" })
  ]) {
    assert.throws(
      () => runner.diagnose(diagnosticInput({ statementBytes })),
      /foundation_toolchain_attestation_statement_invalid/
    );
  }
});

test("diagnostic byte, string, digest, and observation bounds fail closed", () => {
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  for (const fault of [
    { bundleBytes: Buffer.alloc(0) },
    { bundleBytes: Buffer.alloc(4 * 1024 * 1024 + 1) },
    { statementBytes: Buffer.alloc(0) },
    { statementBytes: Buffer.alloc(64 * 1024 + 1) },
    { subjectName: "wrong.json" },
    { subjectSha256: "not-a-digest" },
    { dsseSignature: "verified" },
    { fulcioChain: "valid" },
    { oidcSourceCommit: "f".repeat(39) },
    { embeddedSct: "verified" },
    { oidcWorkflowRef: "x".repeat(513) }
  ]) {
    assert.throws(
      () => runner.diagnose(diagnosticInput(fault)),
      /foundation_toolchain_attestation_input_invalid/
    );
  }
});

test("missing, malformed, or unverified SCT evidence cannot become authority", () => {
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  const verifier = createFoundationToolchainLockAttestationVerifier({ clock: CLOCK });
  for (const embeddedSct of ["missing", "malformed", "present_unverified"]) {
    const input = diagnosticInput({ embeddedSct });
    const report = runner.diagnose(input);
    assert.equal(report.authoritative, false);
    assert.equal(report.observations.embeddedSctVerified, false);
    assert.equal(report.observations.unparsedCallerSupplied.embeddedSctStatus, embeddedSct);
    assert.throws(() => verifier.verify(input), /full_sigstore_owner_unavailable/);
  }
  assert.throws(
    () => verifier.verify({ ...runner.diagnose(diagnosticInput()), authoritative: true }),
    /foundation_toolchain_attestation_input_invalid/
  );
});

test("diagnostic callers cannot inject trust, verification time, or ignore-SCT controls", () => {
  const runner = createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK });
  for (const injected of [
    { trust: { roots: [] } },
    { verificationTime: "2026-08-10T00:00:00.000Z" },
    { insecureIgnoreSct: true },
    { roots: [] },
    { rekorKeys: [] }
  ]) {
    assert.throws(
      () => runner.diagnose({ ...diagnosticInput(), ...injected }),
      /foundation_toolchain_attestation_input_invalid/
    );
  }
  assert.throws(
    () => createFoundationToolchainLockAttestationDiagnosticRunner({ clock: CLOCK, trust: {} }),
    /foundation_toolchain_attestation_clock_invalid/
  );
});

test("direct main stops before environment, filesystem output, or GitHub API access", () => {
  const directory = mkdtempSync(join(tmpdir(), "foundation-publication-stop-"));
  const output = join(directory, "github-output.txt");
  writeFileSync(output, "sentinel\n", { encoding: "utf8", flag: "wx" });
  try {
    const result = spawnSync(process.execPath, [PUBLICATION_SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        RUNNER_TEMP: directory,
        GITHUB_OUTPUT: output,
        CONTROL_PLANE_FOUNDATION_INVENTORY_RUN_ID: "31355310872",
        CONTROL_PLANE_FOUNDATION_SOURCE_COMMIT: "a".repeat(40),
        CONTROL_PLANE_FOUNDATION_CLOSURE_SHA256: "b".repeat(64),
        CONTROL_PLANE_FOUNDATION_CONFIRMATION: FOUNDATION_TOOLCHAIN_CONFIRMATION
      }
    });
    assert.equal(result.status, 2);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "full_sigstore_owner_topology_unapproved\n");
    assert.equal(readFileSync(output, "utf8"), "sentinel\n");
    assert.deepEqual(readdirSync(directory).sort(), ["github-output.txt"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("publication source contains no environment, filesystem, child-process, or network path", () => {
  const source = readFileSync(PUBLICATION_SCRIPT, "utf8");
  assert.doesNotMatch(source, /node:(?:fs|child_process|http|https|net|tls|dgram)/);
  assert.doesNotMatch(source, /process\.env|GITHUB_OUTPUT|RUNNER_TEMP/);
  assert.doesNotMatch(source, /\b(?:fetch|spawn|exec|appendFile|writeFile|readFile)\w*\s*\(/);
});
