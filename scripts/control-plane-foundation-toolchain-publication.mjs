import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE,
  FOUNDATION_TOOLCHAIN_PLATFORM,
  FOUNDATION_TOOL_ROLES,
  parseToolchainInventoryBytes,
  serializeToolchainInventoryLine
} from "./control-plane-foundation-toolchain-inventory.mjs";
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../server/services/deployment/canonical-json.mjs";

const INVENTORY_WORKFLOW_PATH = ".github/workflows/control-plane-foundation-toolchain-inventory.yml";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const RUN_ID_PATTERN = /^[1-9][0-9]{0,19}$/;
const DIAGNOSTIC_STATUS = Object.freeze(["observed", "missing", "malformed"]);
const SCT_STATUS = Object.freeze(["missing", "malformed", "present_unverified"]);
const DIAGNOSTIC_INPUT_KEYS = Object.freeze([
  "bundleBytes",
  "statementBytes",
  "subjectName",
  "subjectSha256",
  "dsseSignature",
  "fulcioChain",
  "rekorSignedEntry",
  "rekorInclusion",
  "rekorIntegratedTime",
  "oidcIssuer",
  "oidcRepository",
  "oidcWorkflowRef",
  "oidcSourceCommit",
  "predicateType",
  "embeddedSct"
]);
const FOUNDATION_ATTESTATION_POLICY = Object.freeze({
  issuer: "https://token.actions.githubusercontent.com",
  repository: "gccwebos-com/proxy-gateway-minimal",
  workflowRef:
    "gccwebos-com/proxy-gateway-minimal/.github/workflows/control-plane-foundation-toolchain-publish.yml@refs/heads/master",
  predicateType: "https://slsa.dev/provenance/v1"
});
const FOUNDATION_TOOLCHAIN_CONTAINER_MANIFEST_SHA256 =
  FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE.slice(
    FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE.indexOf("@sha256:") + 8
  );
const IN_TOTO_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
const GITHUB_WORKFLOW_BUILD_TYPE = "https://actions.github.io/buildtypes/workflow/v1";

export const FOUNDATION_TOOLCHAIN_CONFIRMATION = "publish Foundation toolchain lock";

function frozenContract(
  schemaId,
  fieldOrder,
  { maxBytes = 32 * 1024, nested = {}, arrays = {}, validate = () => {} } = {}
) {
  return Object.freeze({
    schemaId,
    maxBytes,
    fieldOrder: Object.freeze([...fieldOrder]),
    nested: Object.freeze({ ...nested }),
    arrays: Object.freeze({ ...arrays }),
    validate
  });
}

function assertSha256(value, code) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(code);
}

function isPlainRecord(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactKeys(value, expectedKeys, code) {
  if (!isPlainRecord(value)) {
    throw new Error(code);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length) throw new Error(code);

  const data = {};
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const key = expectedKeys[index];
    if (keys[index] !== key) throw new Error(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value")) {
      throw new Error(code);
    }
    data[key] = descriptor.value;
  }
  return data;
}

function assertDiagnosticOptions(options) {
  const { clock } = assertExactKeys(
    options,
    ["clock"],
    "foundation_toolchain_attestation_clock_invalid"
  );
  const { now } = assertExactKeys(
    clock,
    ["now"],
    "foundation_toolchain_attestation_clock_invalid"
  );
  if (typeof now !== "function" || now.length !== 0) {
    throw new Error("foundation_toolchain_attestation_clock_invalid");
  }
  return Object.freeze({ receiver: clock, now });
}

function assertBoundedBuffer(value, maxBytes) {
  return Buffer.isBuffer(value) && value.length > 0 && value.length <= maxBytes;
}

const IN_TOTO_SHA256_DIGEST_CONTRACT = frozenContract(
  "control_plane_foundation_in_toto_sha256_digest_v1",
  ["sha256"],
  {
    validate(value) {
      assertSha256(value.sha256, "foundation_toolchain_attestation_statement_invalid");
    }
  }
);

const IN_TOTO_SUBJECT_CONTRACT = frozenContract(
  "control_plane_foundation_in_toto_subject_v1",
  ["name", "digest"],
  {
    nested: { digest: IN_TOTO_SHA256_DIGEST_CONTRACT },
    validate(value) {
      if (typeof value.name !== "string"
          || value.name.length < 1
          || value.name.length > 512
          || /[\u0000-\u001f\u007f\\]|(?:^|\/)\.\.(?:\/|$)/u.test(value.name)) {
        throw new Error("foundation_toolchain_attestation_statement_invalid");
      }
    }
  }
);

const GIT_COMMIT_DIGEST_CONTRACT = frozenContract(
  "control_plane_foundation_git_commit_digest_v1",
  ["gitCommit"],
  {
    validate(value) {
      if (!SOURCE_COMMIT_PATTERN.test(value.gitCommit)) {
        throw new Error("foundation_toolchain_attestation_statement_invalid");
      }
    }
  }
);

const RESOLVED_DEPENDENCY_CONTRACT = frozenContract(
  "control_plane_foundation_resolved_dependency_v1",
  ["uri", "digest"],
  {
    nested: { digest: GIT_COMMIT_DIGEST_CONTRACT },
    validate(value) {
      if (typeof value.uri !== "string"
          || value.uri.length > 512
          || !/^git\+https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@refs\/heads\/[A-Za-z0-9._/-]+$/.test(value.uri)
          || value.uri.includes("..")
          || value.uri.includes("//", "git+https://".length)) {
        throw new Error("foundation_toolchain_attestation_statement_invalid");
      }
    }
  }
);

const WORKFLOW_EXTERNAL_PARAMETERS_CONTRACT = frozenContract(
  "control_plane_foundation_workflow_external_parameters_v1",
  ["ref", "repository", "path"],
  {
    validate(value) {
      if (typeof value.ref !== "string"
          || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(value.ref)
          || value.ref.includes("..")
          || typeof value.repository !== "string"
          || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)
          || typeof value.path !== "string"
          || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(value.path)) {
        throw new Error("foundation_toolchain_attestation_statement_invalid");
      }
    }
  }
);

const EXTERNAL_PARAMETERS_CONTRACT = frozenContract(
  "control_plane_foundation_external_parameters_v1",
  ["workflow"],
  { nested: { workflow: WORKFLOW_EXTERNAL_PARAMETERS_CONTRACT } }
);

const GITHUB_INTERNAL_PARAMETERS_CONTRACT = frozenContract(
  "control_plane_foundation_github_internal_parameters_v1",
  ["event_name", "repository_id", "repository_owner_id", "runner_environment"],
  {
    validate(value) {
      if (value.event_name !== "workflow_dispatch"
          || !RUN_ID_PATTERN.test(value.repository_id)
          || !RUN_ID_PATTERN.test(value.repository_owner_id)
          || value.runner_environment !== "github-hosted") {
        throw new Error("foundation_toolchain_attestation_statement_invalid");
      }
    }
  }
);

const INTERNAL_PARAMETERS_CONTRACT = frozenContract(
  "control_plane_foundation_internal_parameters_v1",
  ["github"],
  { nested: { github: GITHUB_INTERNAL_PARAMETERS_CONTRACT } }
);

const BUILD_DEFINITION_CONTRACT = frozenContract(
  "control_plane_foundation_build_definition_v1",
  ["buildType", "externalParameters", "internalParameters", "resolvedDependencies"],
  {
    nested: {
      externalParameters: EXTERNAL_PARAMETERS_CONTRACT,
      internalParameters: INTERNAL_PARAMETERS_CONTRACT,
      dependency: RESOLVED_DEPENDENCY_CONTRACT
    },
    arrays: { resolvedDependencies: "dependency" },
    validate(value) {
      if (value.buildType !== GITHUB_WORKFLOW_BUILD_TYPE
          || value.resolvedDependencies.length !== 1) {
        throw new Error("foundation_toolchain_attestation_statement_invalid");
      }
    }
  }
);

const BUILDER_CONTRACT = frozenContract(
  "control_plane_foundation_builder_v1",
  ["id"],
  {
    validate(value) {
      if (typeof value.id !== "string"
          || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml@refs\/heads\/[A-Za-z0-9._/-]+$/.test(value.id)
          || value.id.includes("..")) {
        throw new Error("foundation_toolchain_attestation_statement_invalid");
      }
    }
  }
);

const RUN_METADATA_CONTRACT = frozenContract(
  "control_plane_foundation_run_metadata_v1",
  ["invocationId"],
  {
    validate(value) {
      if (typeof value.invocationId !== "string"
          || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[1-9][0-9]{0,19}\/attempts\/[1-9][0-9]{0,9}$/.test(value.invocationId)) {
        throw new Error("foundation_toolchain_attestation_statement_invalid");
      }
    }
  }
);

const RUN_DETAILS_CONTRACT = frozenContract(
  "control_plane_foundation_run_details_v1",
  ["builder", "metadata"],
  {
    nested: {
      builder: BUILDER_CONTRACT,
      metadata: RUN_METADATA_CONTRACT
    }
  }
);

const SLSA_PROVENANCE_PREDICATE_CONTRACT = frozenContract(
  "control_plane_foundation_slsa_provenance_predicate_v1",
  ["buildDefinition", "runDetails"],
  {
    nested: {
      buildDefinition: BUILD_DEFINITION_CONTRACT,
      runDetails: RUN_DETAILS_CONTRACT
    }
  }
);

const IN_TOTO_STATEMENT_CONTRACT = frozenContract(
  "control_plane_foundation_in_toto_statement_v1",
  ["_type", "subject", "predicateType", "predicate"],
  {
    maxBytes: 64 * 1024,
    nested: {
      subject: IN_TOTO_SUBJECT_CONTRACT,
      predicate: SLSA_PROVENANCE_PREDICATE_CONTRACT
    },
    arrays: { subject: "subject" },
    validate(value) {
      if (value._type !== IN_TOTO_STATEMENT_TYPE
          || typeof value.predicateType !== "string"
          || value.predicateType.length < 1
          || value.predicateType.length > 256
          || value.subject.length > 8) {
        throw new Error("foundation_toolchain_attestation_statement_invalid");
      }
    }
  }
);

function parseDiagnosticStatement(statementBytes) {
  try {
    return parseCanonicalJsonBytes(statementBytes, IN_TOTO_STATEMENT_CONTRACT);
  } catch {
    throw new Error("foundation_toolchain_attestation_statement_invalid");
  }
}

function assertDiagnosticInput(input) {
  const data = assertExactKeys(
    input,
    DIAGNOSTIC_INPUT_KEYS,
    "foundation_toolchain_attestation_input_invalid"
  );
  if (!assertBoundedBuffer(data.bundleBytes, 4 * 1024 * 1024)
      || !assertBoundedBuffer(data.statementBytes, 64 * 1024)
      || typeof data.subjectName !== "string"
      || !/^foundation-toolchain-lock-v2-[a-f0-9]{64}\.json$/.test(data.subjectName)
      || !SHA256_PATTERN.test(data.subjectSha256)
      || !DIAGNOSTIC_STATUS.includes(data.dsseSignature)
      || !DIAGNOSTIC_STATUS.includes(data.fulcioChain)
      || !DIAGNOSTIC_STATUS.includes(data.rekorSignedEntry)
      || !DIAGNOSTIC_STATUS.includes(data.rekorInclusion)
      || !DIAGNOSTIC_STATUS.includes(data.rekorIntegratedTime)
      || typeof data.oidcIssuer !== "string" || data.oidcIssuer.length > 256
      || typeof data.oidcRepository !== "string" || data.oidcRepository.length > 256
      || typeof data.oidcWorkflowRef !== "string" || data.oidcWorkflowRef.length > 512
      || !SOURCE_COMMIT_PATTERN.test(data.oidcSourceCommit)
      || typeof data.predicateType !== "string" || data.predicateType.length > 256
      || !SCT_STATUS.includes(data.embeddedSct)) {
    throw new Error("foundation_toolchain_attestation_input_invalid");
  }
  return Object.freeze({
    ...data,
    bundleBytes: Buffer.from(data.bundleBytes),
    statementBytes: Buffer.from(data.statementBytes)
  });
}

function readDiagnosticTime(clock) {
  const value = Reflect.apply(clock.now, clock.receiver, []);
  let epochMilliseconds;
  try {
    epochMilliseconds = Date.prototype.getTime.call(value);
  } catch {
    throw new Error("foundation_toolchain_attestation_clock_invalid");
  }
  if (!Number.isFinite(epochMilliseconds)) {
    throw new Error("foundation_toolchain_attestation_clock_invalid");
  }
  return Date.prototype.toISOString.call(value);
}

export function createFoundationToolchainLockAttestationDiagnosticRunner(options) {
  const clock = assertDiagnosticOptions(options);
  return Object.freeze({
    diagnose(input) {
      const snapshot = assertDiagnosticInput(input);
      const statement = parseDiagnosticStatement(snapshot.statementBytes);
      const exactOneSubjectObserved = statement.subject.length === 1;
      const subject = exactOneSubjectObserved ? statement.subject[0] : null;
      const workflow = statement.predicate.buildDefinition.externalParameters.workflow;
      const dependency = statement.predicate.buildDefinition.resolvedDependencies[0];
      const builder = statement.predicate.runDetails.builder;
      const oidcRepositoryMatchesStatement =
        workflow.repository === `https://github.com/${snapshot.oidcRepository}`;
      const oidcWorkflowRefMatchesStatement = oidcRepositoryMatchesStatement
        && `${snapshot.oidcRepository}/${workflow.path}@${workflow.ref}`
          === snapshot.oidcWorkflowRef
        && builder.id === `https://github.com/${snapshot.oidcWorkflowRef}`;
      const oidcSourceCommitMatchesStatement = oidcRepositoryMatchesStatement
        && dependency.uri === `git+https://github.com/${snapshot.oidcRepository}@${workflow.ref}`
        && dependency.digest.gitCommit === snapshot.oidcSourceCommit;
      const unparsedCallerSupplied = Object.freeze({
        dsseSignatureStatus: snapshot.dsseSignature,
        fulcioChainStatus: snapshot.fulcioChain,
        rekorSignedEntryStatus: snapshot.rekorSignedEntry,
        rekorInclusionStatus: snapshot.rekorInclusion,
        rekorIntegratedTimeStatus: snapshot.rekorIntegratedTime,
        oidcIssuer: snapshot.oidcIssuer,
        oidcRepository: snapshot.oidcRepository,
        oidcWorkflowRef: snapshot.oidcWorkflowRef,
        oidcSourceCommit: snapshot.oidcSourceCommit,
        predicateType: snapshot.predicateType,
        embeddedSctStatus: snapshot.embeddedSct
      });
      const statementObservations = Object.freeze({
        sourceCommitMatchesCallerSupplied: oidcSourceCommitMatchesStatement,
        repositoryMatchesCallerSupplied: oidcRepositoryMatchesStatement,
        workflowRefMatchesCallerSupplied: oidcWorkflowRefMatchesStatement,
        predicateTypeMatchesCallerSupplied: snapshot.predicateType === statement.predicateType,
        repositoryMatchesPolicy:
          workflow.repository === `https://github.com/${FOUNDATION_ATTESTATION_POLICY.repository}`,
        workflowRefMatchesPolicy:
          `${FOUNDATION_ATTESTATION_POLICY.repository}/${workflow.path}@${workflow.ref}`
            === FOUNDATION_ATTESTATION_POLICY.workflowRef
          && builder.id === `https://github.com/${FOUNDATION_ATTESTATION_POLICY.workflowRef}`,
        predicateTypeMatchesPolicy:
          statement.predicateType === FOUNDATION_ATTESTATION_POLICY.predicateType,
        exactOneSubjectObserved,
        subjectNameMatchesCallerSupplied:
          subject !== null && subject.name === snapshot.subjectName,
        subjectSha256MatchesCallerSupplied:
          subject !== null && subject.digest.sha256 === snapshot.subjectSha256
      });
      const observations = Object.freeze({
        bundleParsed: false,
        dsseSignatureVerified: false,
        fulcioChainVerified: false,
        rekorSignedEntryVerified: false,
        rekorInclusionVerified: false,
        rekorIntegratedTimeVerified: false,
        oidcIdentityVerified: false,
        embeddedSctVerified: false,
        unparsedCallerSupplied,
        statement: statementObservations
      });
      const bundleSha256 = sha256Hex(snapshot.bundleBytes);
      const statementSha256 = sha256Hex(snapshot.statementBytes);
      const observedAt = readDiagnosticTime(clock);
      return Object.freeze({
        diagnosticOnly: true,
        authoritative: false,
        diagnosticCode: "bounded_dsse_fulcio_rekor_oidc_diagnostics_only",
        observedAt,
        bundleSha256,
        statementSha256,
        subjectSha256: subject === null ? null : subject.digest.sha256,
        observations
      });
    }
  });
}

export function createFoundationToolchainLockAttestationVerifier(options) {
  const diagnosticRunner = createFoundationToolchainLockAttestationDiagnosticRunner(options);
  return Object.freeze({
    verify(input) {
      diagnosticRunner.diagnose(input);
      throw new Error("full_sigstore_owner_unavailable");
    }
  });
}

const TOOL_ROLE_CONTRACT = frozenContract(
  "control_plane_foundation_toolchain_lock_role_v1",
  ["role", "sha256"],
  {
    validate(value) {
      if (!FOUNDATION_TOOL_ROLES.includes(value.role)) {
        throw new Error("foundation_toolchain_lock_role_invalid");
      }
      assertSha256(value.sha256, "foundation_toolchain_lock_role_invalid");
    }
  }
);

const LOCK_CONTRACT = frozenContract(
  "control_plane_foundation_toolchain_lock_v1",
  [
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
  ],
  {
    nested: { role: TOOL_ROLE_CONTRACT },
    arrays: { toolRoles: "role" },
    validate(value) {
      if (value.schemaVersion !== "1"
          || value.assetType !== "control_plane_foundation_toolchain_lock"
          || !SOURCE_COMMIT_PATTERN.test(value.sourceCommit)
          || !RUN_ID_PATTERN.test(value.inventoryRunId)
          || value.inventoryWorkflowPath !== INVENTORY_WORKFLOW_PATH
          || value.closureKind !== "oci_platform_manifest"
          || value.platform !== FOUNDATION_TOOLCHAIN_PLATFORM
          || value.containerImage !== FOUNDATION_TOOLCHAIN_CONTAINER_IMAGE
          || value.containerManifestSha256 !== FOUNDATION_TOOLCHAIN_CONTAINER_MANIFEST_SHA256
          || typeof value.nodeVersion !== "string" || !/^v\d+\.\d+\.\d+$/.test(value.nodeVersion)
          || typeof value.nodeModuleAbi !== "string" || !/^\d+$/.test(value.nodeModuleAbi)
          || typeof value.nodeApiVersion !== "string" || !/^\d+$/.test(value.nodeApiVersion)) {
        throw new Error("foundation_toolchain_lock_invalid");
      }
      for (const field of [
        "inventoryReceiptSha256",
        "inventoryWorkflowSha256",
        "containerManifestSha256",
        "toolRolesSha256",
        "headersTreeSha256",
        "candidateClosureSha256"
      ]) {
        assertSha256(value[field], "foundation_toolchain_lock_invalid");
      }
      if (value.toolRoles.length !== FOUNDATION_TOOL_ROLES.length
          || value.toolRoles.some(({ role }, index) => role !== FOUNDATION_TOOL_ROLES[index])
          || new Set(value.toolRoles.map(({ sha256 }) => sha256)).size !== value.toolRoles.length) {
        throw new Error("foundation_toolchain_lock_role_order_invalid");
      }
      const expectedRoleDigest = sha256Hex(Buffer.from(value.toolRoles.map(({ role, sha256 }) => (
        `${role}\0${sha256}\n`
      )).join(""), "utf8"));
      if (value.toolRolesSha256 !== expectedRoleDigest) {
        throw new Error("foundation_toolchain_lock_role_digest_mismatch");
      }
      const expectedClosureDigest = sha256Hex(Buffer.from([
        "control-plane-foundation-toolchain-closure-v2",
        value.containerManifestSha256,
        value.platform,
        value.nodeVersion,
        value.nodeModuleAbi,
        value.nodeApiVersion,
        value.headersTreeSha256,
        value.toolRolesSha256
      ].join("\0"), "utf8"));
      if (value.candidateClosureSha256 !== expectedClosureDigest) {
        throw new Error("foundation_toolchain_lock_closure_digest_mismatch");
      }
      const expectedTag = `control-plane-foundation-toolchain-v2-${value.candidateClosureSha256}`;
      const expectedAsset = `foundation-toolchain-lock-v2-${value.candidateClosureSha256}.json`;
      if (value.releaseTag !== expectedTag || value.assetName !== expectedAsset) {
        throw new Error("foundation_toolchain_lock_identity_invalid");
      }
    }
  }
);

function canonicalInventoryBytes(inventory) {
  if (!inventory || inventory.schemaVersion !== "2"
      || inventory.receiptType !== "control_plane_foundation_toolchain_inventory_v2") {
    throw new Error("foundation_toolchain_inventory_v2_required");
  }
  const bytes = serializeToolchainInventoryLine(inventory).subarray(0, -1);
  parseToolchainInventoryBytes(bytes);
  return bytes;
}

export function extractCanonicalV2InventoryFromLog(logText) {
  if (typeof logText !== "string" || logText.length > 4 * 1024 * 1024) {
    throw new Error("foundation_toolchain_inventory_log_invalid");
  }
  const matches = [];
  for (const line of logText.split(/\r?\n/)) {
    const marker = line.indexOf('{"schemaVersion":"2","receiptType":"control_plane_foundation_toolchain_inventory_v2"');
    if (marker === -1) continue;
    const candidate = Buffer.from(line.slice(marker), "utf8");
    const value = parseToolchainInventoryBytes(candidate);
    const canonical = canonicalInventoryBytes(value);
    if (!Buffer.prototype.equals.call(candidate, canonical)) {
      throw new Error("foundation_toolchain_inventory_log_noncanonical");
    }
    matches.push(Object.freeze({ value, bytes: canonical, sha256: sha256Hex(canonical) }));
  }
  if (matches.length !== 1) throw new Error("foundation_toolchain_inventory_count_invalid");
  return matches[0];
}

export function buildFoundationToolchainLock({
  inventoryRunId,
  inventoryReceiptSha256,
  inventory,
  confirmation
}) {
  if (confirmation !== FOUNDATION_TOOLCHAIN_CONFIRMATION) {
    throw new Error("foundation_toolchain_publication_confirmation_invalid");
  }
  if (typeof inventoryRunId !== "string" || !RUN_ID_PATTERN.test(inventoryRunId)) {
    throw new Error("foundation_toolchain_inventory_run_id_invalid");
  }
  assertSha256(inventoryReceiptSha256, "foundation_toolchain_inventory_receipt_digest_invalid");
  const inventoryBytes = canonicalInventoryBytes(inventory);
  const canonicalInventory = parseToolchainInventoryBytes(inventoryBytes);
  if (sha256Hex(inventoryBytes) !== inventoryReceiptSha256) {
    throw new Error("foundation_toolchain_inventory_receipt_digest_mismatch");
  }
  const releaseTag = `control-plane-foundation-toolchain-v2-${canonicalInventory.candidateClosureSha256}`;
  const assetName = `foundation-toolchain-lock-v2-${canonicalInventory.candidateClosureSha256}.json`;
  const value = Object.freeze({
    schemaVersion: "1",
    assetType: "control_plane_foundation_toolchain_lock",
    sourceCommit: canonicalInventory.sourceCommit,
    inventoryRunId,
    inventoryReceiptSha256,
    inventoryWorkflowPath: canonicalInventory.workflowPath,
    inventoryWorkflowSha256: canonicalInventory.workflowSha256,
    closureKind: canonicalInventory.closureKind,
    containerImage: canonicalInventory.containerImage,
    containerManifestSha256: canonicalInventory.containerManifestSha256,
    platform: canonicalInventory.platform,
    nodeVersion: canonicalInventory.nodeVersion,
    nodeModuleAbi: canonicalInventory.nodeModuleAbi,
    nodeApiVersion: canonicalInventory.nodeApiVersion,
    toolRoles: canonicalInventory.toolRoles,
    toolRolesSha256: canonicalInventory.toolRolesSha256,
    headersTreeSha256: canonicalInventory.headersTreeSha256,
    candidateClosureSha256: canonicalInventory.candidateClosureSha256,
    releaseTag,
    assetName
  });
  const bytes = serializeFoundationToolchainLock(value);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes), releaseTag, assetName });
}

export function serializeFoundationToolchainLock(value) {
  return serializeCanonicalJsonBytes(value, LOCK_CONTRACT);
}

export function parseFoundationToolchainLock(bytes) {
  return parseCanonicalJsonBytes(bytes, LOCK_CONTRACT);
}

function main() {
  process.stderr.write("full_sigstore_owner_topology_unapproved\n");
  process.exitCode = 2;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
