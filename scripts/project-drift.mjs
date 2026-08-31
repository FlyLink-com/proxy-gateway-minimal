#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildProjectDriftReport,
  projectDriftExitCode
} from "../server/services/governance/project-drift-report.mjs";
import {
  verifyProjectV2ContractCanonicalBytes
} from "../server/services/governance/project-v2-contract.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONTRACT_PATH = resolve(
  REPOSITORY_ROOT,
  "project-state/project-v2-contract.json"
);

class ProjectDriftCliError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProjectDriftCliError";
    this.code = code;
  }
}

function parseArgs(argv) {
  let inputPath = null;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      if (json) throw new ProjectDriftCliError("project_drift_cli_argument_invalid");
      json = true;
      continue;
    }
    if (arg === "--input") {
      const value = argv[index + 1];
      if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
        throw new ProjectDriftCliError("project_drift_cli_argument_invalid");
      }
      if (inputPath !== null) {
        throw new ProjectDriftCliError("project_drift_cli_argument_invalid");
      }
      inputPath = value;
      index += 1;
      continue;
    }
    throw new ProjectDriftCliError("project_drift_cli_argument_unsupported");
  }

  if (!json || inputPath === null) {
    throw new ProjectDriftCliError("project_drift_cli_argument_invalid");
  }
  return { inputPath };
}

function readJson(path, readCode, parseCode, readFile) {
  let text;
  try {
    text = readFile(path, "utf8");
  } catch {
    throw new ProjectDriftCliError(readCode);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProjectDriftCliError(parseCode);
  }
}

function readCanonicalContract(readFile) {
  let rawBytes;
  try {
    rawBytes = readFile(DEFAULT_CONTRACT_PATH);
  } catch {
    throw new ProjectDriftCliError("project_drift_cli_contract_read_failed");
  }
  if (!verifyProjectV2ContractCanonicalBytes(rawBytes)) {
    throw new ProjectDriftCliError("project_drift_cli_contract_not_canonical");
  }
  try {
    const text = typeof rawBytes === "string" ? rawBytes : rawBytes.toString("utf8");
    return { contract: JSON.parse(text), rawBytes };
  } catch {
    throw new ProjectDriftCliError("project_drift_cli_contract_json_invalid");
  }
}

function buildProjectDriftCliErrorReport(code) {
  return {
    type: "gccgw_project_drift_report",
    schemaVersion: "1",
    generatedAt: null,
    readOnly: true,
    mutation: false,
    productionAuthority: false,
    redacted: true,
    canonicalContract: false,
    canonicalContractSha256: null,
    target: {
      owner: null,
      projectNumber: null,
      repository: null
    },
    outcome: "indeterminate",
    coverage: {
      target: "not_evaluated",
      projectFieldManifest: "not_evaluated",
      managedItemFields: "not_evaluated",
      nativeLifecycle: "not_evaluated",
      exportFreshness: "not_evaluated",
      projectViews: "not_evaluated",
      nativeWorkflows: "not_evaluated",
      nativeRepositoryInventory: "not_evaluated",
      checks: "not_evaluated",
      source: "not_evaluated",
      production: "not_evaluated"
    },
    summary: {
      evaluatedItemCount: 0,
      provenCount: 0,
      reviewCount: 0,
      indeterminateCount: 1
    },
    findings: [],
    errors: [{ code }]
  };
}

export function runProjectDriftCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = (value) => process.stdout.write(value),
  stderr = (value) => process.stderr.write(value),
  readFile = readFileSync
} = {}) {
  const jsonRequested = Array.isArray(argv) && argv.includes("--json");
  try {
    const options = parseArgs(argv);
    const projectExport = readJson(
      resolve(cwd, options.inputPath),
      "project_drift_cli_input_read_failed",
      "project_drift_cli_input_json_invalid",
      readFile
    );
    const { contract, rawBytes } = readCanonicalContract(readFile);
    const report = buildProjectDriftReport({
      projectExport,
      contract,
      canonicalContractBytes: rawBytes
    });
    stdout(`${JSON.stringify(report, null, 2)}\n`);
    return projectDriftExitCode(report);
  } catch (error) {
    const code = error instanceof ProjectDriftCliError
      ? error.code
      : "project_drift_cli_unexpected_failure";
    if (jsonRequested) {
      stdout(`${JSON.stringify(buildProjectDriftCliErrorReport(code), null, 2)}\n`);
    } else {
      stderr(`${code}\n`);
    }
    return 2;
  }
}

const isDirectExecution = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  process.exitCode = runProjectDriftCli();
}
