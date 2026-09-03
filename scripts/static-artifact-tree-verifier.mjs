#!/usr/bin/env node
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ERROR_CODE = "static_artifact_tree_mismatch";

class StaticArtifactTreeMismatchError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = "StaticArtifactTreeMismatchError";
    this.code = ERROR_CODE;
  }
}

function mismatch() {
  return new StaticArtifactTreeMismatchError();
}

function assertCondition(condition) {
  if (!condition) throw mismatch();
}

function readTree(rootDirectory) {
  const rootStat = lstatSync(rootDirectory);
  assertCondition(rootStat.isDirectory() && !rootStat.isSymbolicLink());

  const entries = new Map();
  const visit = (directory, relativeDirectory) => {
    const names = readdirSync(directory, { encoding: "utf8" }).sort();
    for (const name of names) {
      const absolutePath = join(directory, name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const stat = lstatSync(absolutePath);
      assertCondition(!stat.isSymbolicLink());

      if (stat.isDirectory()) {
        entries.set(relativePath, { type: "directory" });
        visit(absolutePath, relativePath);
        continue;
      }

      assertCondition(stat.isFile());
      entries.set(relativePath, {
        type: "file",
        bytes: readFileSync(absolutePath),
        executable: process.platform === "win32" ? false : (stat.mode & 0o111) !== 0
      });
    }
  };

  visit(rootDirectory, "");
  return entries;
}

function compareTrees(expectedEntries, actualEntries) {
  assertCondition(expectedEntries.size === actualEntries.size);
  let fileCount = 0;

  for (const [relativePath, expected] of expectedEntries) {
    const actual = actualEntries.get(relativePath);
    assertCondition(actual && actual.type === expected.type);
    if (expected.type === "directory") continue;
    assertCondition(expected.executable === actual.executable);
    assertCondition(expected.bytes.equals(actual.bytes));
    fileCount += 1;
  }

  return fileCount;
}

export function verifyStaticArtifactTree({
  expectedDirectory,
  actualDirectory
} = {}) {
  try {
    assertCondition(typeof expectedDirectory === "string" && expectedDirectory.length > 0);
    assertCondition(typeof actualDirectory === "string" && actualDirectory.length > 0);
    const expectedEntries = readTree(expectedDirectory);
    const actualEntries = readTree(actualDirectory);
    const fileCount = compareTrees(expectedEntries, actualEntries);
    return {
      ok: true,
      type: "static_artifact_tree_identity",
      fileCount
    };
  } catch {
    throw mismatch();
  }
}

function parseArguments(argv) {
  assertCondition(Array.isArray(argv) && argv.length === 4);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    assertCondition(flag === "--expected" || flag === "--actual");
    assertCondition(parsed[flag] === undefined);
    assertCondition(typeof value === "string" && value.length > 0);
    parsed[flag] = value;
  }
  assertCondition(parsed["--expected"] && parsed["--actual"]);
  return parsed;
}

export function runStaticArtifactTreeVerifierCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const parsed = parseArguments(argv);
    const result = verifyStaticArtifactTree({
      expectedDirectory: parsed["--expected"],
      actualDirectory: parsed["--actual"]
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    stderr.write(`${JSON.stringify({ ok: false, error: ERROR_CODE })}\n`);
    return 1;
  }
}

let invokedDirectly = false;
try {
  invokedDirectly = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  invokedDirectly = false;
}

if (invokedDirectly) process.exitCode = runStaticArtifactTreeVerifierCli();
